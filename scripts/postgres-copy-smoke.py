"""Read-only authenticated smoke checks inside a migrated application container.

Only short-lived access tokens are created in memory; no credentials or record
contents are printed, and no refresh tokens/login timestamps are persisted.
"""

import hashlib
import json
import sys
import time
from urllib.request import Request, urlopen
from uuid import UUID, uuid4


def validate_missing_attachments(actual, expected=None):
    if expected is None:
        expected = []
    if not isinstance(expected, list):
        raise RuntimeError("Missing attachment baseline must be an explicit list")
    try:
        canonical = [str(UUID(value)) for value in expected]
    except (ValueError, TypeError, AttributeError) as error:
        raise RuntimeError("Invalid missing attachment baseline") from error
    if len(set(canonical)) != len(canonical) or canonical != expected:
        raise RuntimeError("Missing attachment baseline is not canonical and unique")
    if set(actual) != set(expected):
        raise RuntimeError(
            "Candidate missing attachments differ from the original baseline"
        )


def verify_local_download(local, identifier, expected_missing, download):
    if not local.is_file():
        if local.exists() or identifier not in expected_missing:
            raise RuntimeError("Candidate lost an additional local attachment")
        return False
    content = download()
    with local.open("rb") as source:
        if content != hashlib.file_digest(source, "sha256").digest():
            raise RuntimeError("Downloaded attachment differs from its local file")
    return True


def check():
    from sqlalchemy import func, select, text
    import jwt

    from core.config import Settings
    from database.session import database
    from models import Attachment, BBTalk, User
    from storage.service import store_for

    settings = Settings()
    engine, sessions = database(settings)
    counts = {
        "users_checked": 0,
        "feeds_checked": 0,
        "attachment_metadata_checked": 0,
        "local_downloads_checked": 0,
        "cloud_attachments": 0,
        "missing_local_files": 0,
    }
    with sessions() as db:
        db.execute(text("SET TRANSACTION READ ONLY"))
        missing = set()
        # Include inactive/orphaned owners in the availability comparison; the
        # authenticated per-user checks below still validate every active user.
        for attachment in db.scalars(select(Attachment)):
            store = store_for(
                db, settings, attachment.storage_config_id, attachment.owner_id
            )
            if store.cloud:
                counts["cloud_attachments"] += 1
                continue
            local = store.local_path(attachment.storage_path)
            if not local.is_file():
                if local.exists():
                    raise RuntimeError("Attachment path is not a regular file")
                missing.add(str(attachment.id))
        counts["missing_local_files"] = len(missing)
        validate_missing_attachments(
            missing, globals().get("EXPECTED_MISSING_ATTACHMENTS")
        )
        for user in db.scalars(select(User).where(User.is_active.is_(True))):

            def read(path, raw=False):
                token = jwt.encode(
                    {
                        "iat": int(time.time()),
                        "exp": int(time.time()) + 120,
                        "user_id": user.id,
                        "credential_version": user.credential_version,
                        "token_type": "access",
                        "jti": uuid4().hex,
                    },
                    settings.secret_key,
                    algorithm="HS256",
                )
                request = Request(
                    "http://127.0.0.1:4010" + path,
                    headers={"Authorization": "Bearer " + token},
                )
                with urlopen(request, timeout=20) as response:
                    assert response.status == 200
                    if not raw:
                        return json.load(response)
                    digest = hashlib.sha256()
                    for chunk in iter(lambda: response.read(1024 * 1024), b""):
                        digest.update(chunk)
                    return digest.digest()

            read("/api/v1/bbtalk/user/me")
            counts["users_checked"] += 1
            feed = read("/api/v1/bbtalk?page_size=1")
            expected = db.scalar(
                select(func.count())
                .select_from(BBTalk)
                .where(BBTalk.user_id == user.id)
            )
            assert feed["total_count"] == expected, "feed count differs"
            counts["feeds_checked"] += 1
            read("/api/v1/bbtalk/tags")
            if feed["results"]:
                uid = feed["results"][0]["uid"]
                read("/api/v1/bbtalk/" + uid)
                read("/api/v1/bbtalk/" + uid + "/comments")
            for attachment in db.scalars(
                select(Attachment).where(Attachment.owner_id == str(user.id))
            ):
                path = "/api/v1/attachments/files/" + str(attachment.id)
                read(path)
                counts["attachment_metadata_checked"] += 1
                store = store_for(db, settings, attachment.storage_config_id, user.id)
                if store.cloud:
                    continue
                local = store.local_path(attachment.storage_path)
                if verify_local_download(
                    local,
                    str(attachment.id),
                    missing,
                    lambda: read(path + "/content", raw=True),
                ):
                    counts["local_downloads_checked"] += 1
    engine.dispose()
    print(json.dumps(counts, sort_keys=True))


if __name__ == "__main__":
    try:
        check()
    except Exception as error:
        print("AUTHENTICATED_SMOKE_FAILED: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
