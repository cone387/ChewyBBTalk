"""Describe source attachment availability without changing the DB or storage.

Run inside the candidate image with the original /app/data mounted read-only and
the original DATABASE_URL. Cloud objects are counted, never contacted. The JSON
contains only attachment identifiers and aggregate counts, never paths or keys.
"""

import json
import os
from pathlib import Path, PurePosixPath
import sys
from uuid import UUID


def attachment_id(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as error:
        raise RuntimeError("Invalid attachment identifier") from error


def local_path(root, key):
    if not isinstance(key, str):
        raise RuntimeError("Unsafe attachment storage path")
    key = key.replace("\\", "/")
    relative = PurePosixPath(key)
    if (
        not key
        or not relative.parts
        or relative.is_absolute()
        or ".." in relative.parts
        or ":" in key
        or "\x00" in key
    ):
        raise RuntimeError("Unsafe attachment storage path")
    root = root.resolve()
    path = root / relative
    if not path.resolve().is_relative_to(root):
        raise RuntimeError("Attachment path leaves storage root")
    return path


def storage_kind(row, configs, global_cloud):
    config_id = row["storage_config_id"]
    if not config_id:
        return "cloud" if global_cloud else "local"
    try:
        config = configs.get(str(int(config_id)))
        owned = config is not None and int(row["owner_id"]) == config["user_id"]
    except (TypeError, ValueError):
        owned = False
    if not owned:
        raise RuntimeError("Attachment storage configuration is missing or not owned")
    if config["storage_type"] == "local":
        return "local"
    if config["storage_type"] == "s3" and config["configured"]:
        return "cloud"
    raise RuntimeError("Attachment cloud configuration is incomplete or unsupported")


def summarize(rows, configs, storage_root, *, global_cloud):
    result = {
        "missing_ids": [],
        "local_records": 0,
        "present_files": 0,
        "cloud_records": 0,
    }
    seen = set()
    for row in rows:
        identifier = attachment_id(row["id"])
        if identifier in seen:
            raise RuntimeError("Duplicate attachment identifier")
        seen.add(identifier)
        if storage_kind(row, configs, global_cloud) == "cloud":
            result["cloud_records"] += 1
            continue
        result["local_records"] += 1
        path = local_path(storage_root, row["storage_path"])
        if path.is_file():
            result["present_files"] += 1
        elif path.exists():
            raise RuntimeError("Attachment path is not a regular file")
        else:
            result["missing_ids"].append(identifier)
    result["missing_ids"].sort()
    return result


def check():
    # Avoid Settings(), which can create a secret-key file. No application or
    # cloud client is initialized when reading the original database.
    import psycopg2
    from psycopg2.extras import RealDictCursor, register_uuid

    url = os.environ.get("DATABASE_URL", "").replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    if not url.startswith(("postgres://", "postgresql://")):
        raise RuntimeError("PostgreSQL source URL is required")
    mounted = Path("/app/data").resolve(strict=True)
    media = Path(os.environ.get("MEDIA_ROOT") or "/app/data/media")
    if (
        not media.is_absolute()
        or not media.is_dir()
        or not media.resolve().is_relative_to(mounted)
    ):
        raise RuntimeError(
            "Source media root is missing or outside the read-only data mount"
        )
    root = media / "attachments"
    if not root.resolve().is_relative_to(mounted):
        raise RuntimeError("Source attachments leave the read-only data mount")
    register_uuid()
    connection = psycopg2.connect(
        url, application_name="bbtalk-attachment-baseline", connect_timeout=15
    )
    try:
        connection.set_session(readonly=True, isolation_level="REPEATABLE READ")
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id,user_id,storage_type,(coalesce(s3_access_key_id,'')<>'' AND coalesce(s3_secret_access_key,'')<>'' AND coalesce(s3_bucket_name,'')<>'') AS configured FROM public.cb_user_storage_settings"
            )
            configs = {str(row["id"]): row for row in cursor}
            cursor.execute(
                "SELECT id,owner_id,storage_path,storage_config_id FROM public.cb_attachments"
            )
            cloud = all(
                os.environ.get(key)
                for key in (
                    "AWS_ACCESS_KEY_ID",
                    "AWS_SECRET_ACCESS_KEY",
                    "AWS_STORAGE_BUCKET_NAME",
                )
            )
            return summarize(cursor, configs, root, global_cloud=cloud)
    finally:
        connection.close()


def main():
    try:
        print(json.dumps(check(), sort_keys=True))
        return 0
    except Exception as error:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "attachment_baseline_failed",
                    "error_type": type(error).__name__,
                }
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
