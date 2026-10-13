#!/usr/bin/env python3
"""Guarded PostgreSQL blue/green copy verifier; never modifies source objects.

The host owns pg_dump/pg_restore and stopping writers. Supply DATABASE_URL and a
distinct TARGET_DATABASE. Run this file inside the candidate backend image.
Only ``create`` (CREATE DATABASE) and ``migrate`` (target only) perform writes.
"""

import argparse
import base64
import hashlib
from functools import cache
from importlib import import_module
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4


LEGACY = {
    "auth_group",
    "auth_group_permissions",
    "auth_permission",
    "django_admin_log",
    "django_content_type",
    "django_migrations",
    "django_session",
}
RENAMED = {
    "token_blacklist_outstandingtoken": "cb_refresh_tokens",
    "token_blacklist_blacklistedtoken": "cb_revoked_tokens",
}
REVISION = "0004_native_credentials"


class Refused(RuntimeError):
    """A fixed, non-sensitive operator error code."""


def validate_target(source, target):
    if (
        not isinstance(target, str)
        or not re.fullmatch(r"chewy_bbtalk_native_[a-z0-9_]+", target)
        or len(target.encode("utf8")) > 63
        or target == source
    ):
        raise Refused("invalid_or_source_target_database")
    return target


def normalized(value):
    if isinstance(value, datetime):
        value = (
            value.replace(tzinfo=timezone.utc)
            if value.tzinfo is None
            else value.astimezone(timezone.utc)
        )
        return {"$type": "datetime", "value": value.isoformat()}
    if isinstance(value, (date, time)):
        return {"$type": type(value).__name__, "value": value.isoformat()}
    if isinstance(value, Decimal):
        number = format(value, "f")
        if "." in number:
            number = number.rstrip("0").rstrip(".")
        return {"$type": "Decimal", "value": number}
    if isinstance(value, UUID):
        return {"$type": "UUID", "value": value.hex}
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {
            "$type": "bytes",
            "base64": base64.b64encode(bytes(value)).decode("ascii"),
        }
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalized(item) for item in value]
    return value


def canonical(value):
    return json.dumps(
        normalized(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf8")


def rows_digest(rows):
    # Sort fixed-size row digests instead of sensitive rows; preserves duplicates
    # and avoids dependence on database collation or unstable heap order.
    digests = [hashlib.sha256(canonical(row)).digest() for row in rows]
    return {
        "count": len(digests),
        "sha256": hashlib.sha256(b"".join(sorted(digests))).hexdigest(),
    }


def compare_manifests(source, target):
    if source != target:
        raise Refused("table_contents_or_table_set_differ")


def dependencies():
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import register_uuid

    register_uuid()
    return psycopg2, sql


def configured():
    psycopg2, _ = dependencies()
    url = os.environ.get("DATABASE_URL", "").replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    if not url.startswith(("postgresql://", "postgres://")):
        raise Refused("postgresql_database_url_required")
    params = psycopg2.extensions.parse_dsn(url)
    target = validate_target(params.get("dbname"), os.environ.get("TARGET_DATABASE"))
    return url, params, target


def connect(params, *, target=None, readonly=True, autocommit=False):
    psycopg2, _ = dependencies()
    values = dict(params)
    if target is not None:
        values["dbname"] = target
    values["application_name"] = "bbtalk-copy-worker"
    values.setdefault("connect_timeout", "15")
    connection = psycopg2.connect(**values)
    connection.set_session(
        readonly=readonly, autocommit=autocommit, isolation_level="REPEATABLE READ"
    )
    return connection


def scalar(connection, query, args=()):
    with connection.cursor() as cursor:
        cursor.execute(query, args)
        return cursor.fetchone()[0]


def quiescent(connection):
    count = scalar(
        connection,
        "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
    )
    if count:
        raise Refused("source_has_other_connections")
    return {"other_connections": 0}


def storage_summary(connection, names):
    result = {
        "storage_counts": {},
        "cloud_environment_configured": all(
            os.environ.get(key)
            for key in (
                "AWS_ACCESS_KEY_ID",
                "AWS_SECRET_ACCESS_KEY",
                "AWS_STORAGE_BUCKET_NAME",
            )
        ),
    }
    if "cb_user_storage_settings" in names:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT storage_type,count(*) FROM public.cb_user_storage_settings GROUP BY storage_type"
            )
            for kind, count in cursor:
                key = kind if kind in {"s3", "local"} else "other"
                result["storage_counts"][key] = (
                    result["storage_counts"].get(key, 0) + count
                )
    if "cb_attachments" in names:
        result["attachment_count"] = scalar(
            connection, "SELECT count(*) FROM public.cb_attachments"
        )
        result["attachment_bytes"] = int(
            scalar(
                connection, "SELECT coalesce(sum(size),0) FROM public.cb_attachments"
            )
        )
        if "cb_user_storage_settings" in names:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT CASE WHEN a.storage_config_id IS NULL OR a.storage_config_id='' THEN 'default' WHEN s.storage_type='s3' THEN 's3' WHEN s.storage_type='local' THEN 'local' ELSE 'other' END,count(*) FROM public.cb_attachments a LEFT JOIN public.cb_user_storage_settings s ON a.storage_config_id=s.id::text GROUP BY 1"
                )
                result["attachment_storage_counts"] = dict(cursor.fetchall())
    if "cb_users" in names:
        result["active_superuser_exists"] = scalar(
            connection,
            "SELECT EXISTS(SELECT 1 FROM public.cb_users WHERE is_active AND is_superuser)",
        )
        result["configured_admin_exists"] = scalar(
            connection,
            "SELECT EXISTS(SELECT 1 FROM public.cb_users WHERE username=%s AND is_active AND is_superuser)",
            (os.environ.get("ADMIN_USERNAME", "admin"),),
        )
    return result


def inventory(connection):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%%' AND c.relkind IN ('r','p','f','v','m') ORDER BY 1,2"
        )
        objects = cursor.fetchall()
        cursor.execute(
            "SELECT rolsuper,rolcreatedb FROM pg_roles WHERE rolname=current_user"
        )
        superuser, createdb = cursor.fetchone()
        cursor.execute("SELECT extname,extversion FROM pg_extension ORDER BY extname")
        extensions = [
            {"name": name, "version": version} for name, version in cursor.fetchall()
        ]
    if any(row[2] == "f" for row in objects):
        raise Refused("foreign_tables_require_separate_backup_plan")
    if any(row[3] for row in objects):
        raise Refused("row_level_security_requires_separate_backup_plan")
    if any(row[0] != "public" for row in objects):
        raise Refused("nonpublic_objects_require_separate_backup_plan")
    if any(row[2] in ("v", "m") for row in objects):
        raise Refused("views_require_explicit_migration_plan")
    return {
        "server_version_num": int(scalar(connection, "SHOW server_version_num")),
        "database_bytes": scalar(
            connection, "SELECT pg_database_size(current_database())"
        ),
        "database_owned_by_current_role": scalar(
            connection,
            "SELECT datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user) FROM pg_database WHERE datname=current_database()",
        ),
        "role": {"superuser": superuser, "createdb": createdb},
        "all_tables_owned_by_current_role": all(row[4] for row in objects),
        "public_schema_create": scalar(
            connection, "SELECT has_schema_privilege(current_user,'public','CREATE')"
        ),
        "other_connections": scalar(
            connection,
            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
        ),
        "schemas": sorted({row[0] for row in objects}),
        "extensions": extensions,
        "table_count": len(objects),
    }


def table_names(connection):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
        )
        return [row[0] for row in cursor.fetchall()]


def table_rows(connection, table):
    _, sql = dependencies()
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",
            (table,),
        )
        columns = [row[0] for row in cursor.fetchall()]
    if not columns:
        raise Refused("table_columns_missing_or_inaccessible")
    with connection.cursor(name="copy_" + uuid4().hex) as cursor:
        cursor.itersize = 500
        cursor.execute(
            sql.SQL("SELECT {} FROM {}").format(
                sql.SQL(",").join(map(sql.Identifier, columns)),
                sql.Identifier("public", table),
            )
        )
        for row in cursor:
            yield dict(zip(columns, row))


def manifest(connection):
    return {
        name: rows_digest(table_rows(connection, name))
        for name in table_names(connection)
    }


def decode_archive(value):
    if isinstance(value, dict):
        kind = value.get("$type")
        if kind == "bytes":
            return base64.b64decode(value["base64"])
        converters = {
            "datetime": datetime.fromisoformat,
            "date": date.fromisoformat,
            "time": time.fromisoformat,
            "Decimal": Decimal,
            "UUID": UUID,
        }
        if kind in converters:
            return converters[kind](value["value"])
        return {key: decode_archive(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decode_archive(item) for item in value]
    return value


def compare_restored(source, target):
    original, restored = manifest(source), manifest(target)
    compare_manifests(original, restored)
    return {"tables": original, "table_count": len(original)}


def native_imports():
    for candidate in (
        Path("/app/backend"),
        Path(__file__).resolve().parents[1] / "backend",
    ):
        if candidate.is_dir():
            sys.path.insert(0, str(candidate))
            break
    from models import Base
    from database.upgrade import upgrade
    from sqlalchemy import create_engine, inspect
    from sqlalchemy.engine import make_url

    return Base, upgrade, create_engine, inspect, make_url


def target_engine(url, target, *, readonly=False):
    _, _, create_engine, _, make_url = native_imports()
    parsed = make_url(url.replace("postgres://", "postgresql://", 1)).set(
        drivername="postgresql+psycopg2", database=target
    )
    engine = create_engine(parsed, hide_parameters=True)
    if readonly:
        engine = engine.execution_options(postgresql_readonly=True)
    return engine


def verify_schema(url, target):
    Base, _, _, inspect, _ = native_imports()
    from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint, text

    engine = target_engine(url, target, readonly=True)
    checked = 0
    try:
        with engine.connect() as connection:
            if connection.scalar(text("SELECT current_database()")) != target:
                raise Refused("target_connection_identity_mismatch")
            inspector = inspect(connection)
            for table in Base.metadata.sorted_tables:
                if inspector.get_pk_constraint(table.name)[
                    "constrained_columns"
                ] != list(table.primary_key.columns.keys()):
                    raise Refused("target_primary_key_mismatch")
                actual_unique = {
                    tuple(sorted(item["column_names"]))
                    for item in inspector.get_unique_constraints(table.name)
                }
                expected_unique = {
                    tuple(sorted(item.columns.keys()))
                    for item in table.constraints
                    if isinstance(item, UniqueConstraint)
                }
                if actual_unique != expected_unique:
                    raise Refused("target_unique_constraints_mismatch")
                actual_fk = {
                    (
                        tuple(item["constrained_columns"]),
                        item["referred_table"],
                        tuple(item["referred_columns"]),
                        item["options"].get("ondelete"),
                    )
                    for item in inspector.get_foreign_keys(table.name)
                }
                expected_fk = {
                    (
                        tuple(element.parent.name for element in item.elements),
                        item.referred_table.name,
                        tuple(element.column.name for element in item.elements),
                        item.ondelete,
                    )
                    for item in table.constraints
                    if isinstance(item, ForeignKeyConstraint)
                }
                if actual_fk != expected_fk:
                    raise Refused("target_foreign_keys_mismatch")
                actual_checks = {
                    item["name"] for item in inspector.get_check_constraints(table.name)
                }
                expected_checks = {
                    item.name
                    for item in table.constraints
                    if isinstance(item, CheckConstraint)
                    and "postgresql" in item.info.get("dialects", ("postgresql",))
                }
                if actual_checks != expected_checks:
                    raise Refused("target_check_constraints_mismatch")
                actual_indexes = {
                    (item["name"], tuple(item["column_names"]))
                    for item in inspector.get_indexes(table.name)
                    if not item.get("duplicates_constraint")
                }
                expected_indexes = {
                    (item.name, tuple(item.columns.keys())) for item in table.indexes
                }
                if actual_indexes != expected_indexes:
                    raise Refused("target_indexes_mismatch")
                if table.name in {"cb_tags", "cb_bbtalks", "cb_comments"}:
                    uid = next(
                        item
                        for item in inspector.get_columns(table.name)
                        if item["name"] == "uid"
                    )
                    if getattr(uid["type"], "length", None) != 64:
                        raise Refused("target_uid_length_mismatch")
                checked += 1
            if connection.scalar(
                text(
                    "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated"
                )
            ):
                raise Refused("target_unvalidated_constraints")
    finally:
        engine.dispose()
    return checked


@cache
def credential_converter():
    native_imports()
    return import_module("database.migrations.versions.0004_native_credentials").convert_password


def native_row(table, row):
    """Expected, lossless v4 representation; source rows are never mutated."""
    converted = dict(row)
    if table == "cb_identities" and row.get("identity_type") == "password":
        converted["credential"] = credential_converter()(row["credential"], allow_native=True)
    if RENAMED.get(table, table) == "cb_revoked_tokens" and "blacklisted_at" in converted:
        converted["revoked_at"] = converted.pop("blacklisted_at")
    return converted


def verify_native(source, target, url, target_name):
    _, sql = dependencies()
    original = manifest(source)
    expected = {
        RENAMED.get(name, name): rows_digest(native_row(name, row) for row in table_rows(source, name))
        for name in original
        if name not in LEGACY | {"alembic_version", "cb_migration_archive"}
    }
    expected.setdefault("cb_sessions", rows_digest([]))
    actual_names = set(table_names(target))
    if actual_names != set(expected) | {"alembic_version", "cb_migration_archive"}:
        raise Refused("target_table_set_mismatch")
    actual = {name: rows_digest(table_rows(target, name)) for name in expected}
    compare_manifests(expected, actual)
    archives = defaultdict(list)
    sequences = defaultdict(list)
    for row in table_rows(target, "cb_migration_archive"):
        archives[row["source"]].append(decode_archive(json.loads(row["payload"])))
        sequences[row["source"]].append(row["sequence"])
    if set(archives) - LEGACY:
        raise Refused("unexpected_archive_sources")
    archive_manifest = {}
    previous_archives = defaultdict(list)
    if "cb_migration_archive" in original:
        for row in table_rows(source, "cb_migration_archive"):
            previous_archives[row["source"]].append(decode_archive(json.loads(row["payload"])))
    for name in LEGACY:
        expected_archive = rows_digest([*previous_archives[name],
            *(table_rows(source, name) if name in original else [])])
        actual_archive = rows_digest(archives[name])
        compare_manifests(expected_archive, actual_archive)
        if sorted(sequences[name]) != list(range(1, actual_archive["count"] + 1)):
            raise Refused("archive_sequence_mismatch")
        archive_manifest[name] = actual_archive
    if scalar(target, "SELECT version_num FROM public.alembic_version") != REVISION:
        raise Refused("target_revision_mismatch")
    checked_sequences = 0
    for name in expected:
        with target.cursor() as cursor:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=%s",
                (name,),
            )
            columns = {row[0] for row in cursor.fetchall()}
        if "id" not in columns:
            continue
        sequence = scalar(
            target, "SELECT pg_get_serial_sequence(%s,%s)", ("public." + name, "id")
        )
        if not sequence:
            continue
        with target.cursor() as cursor:
            cursor.execute(
                "SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=%s::regclass",
                (sequence,),
            )
            schema, relation = cursor.fetchone()
            cursor.execute(
                sql.SQL("SELECT last_value,is_called FROM {}").format(
                    sql.Identifier(schema, relation)
                )
            )
            last, called = cursor.fetchone()
            cursor.execute(
                sql.SQL("SELECT max(id) FROM {}").format(sql.Identifier("public", name))
            )
            maximum = cursor.fetchone()[0]
        if maximum is not None and last + int(called) <= maximum:
            raise Refused("target_sequence_behind_rows")
        checked_sequences += 1
    return {
        "tables": actual,
        "archives": archive_manifest,
        "schema_tables_checked": verify_schema(url, target_name),
        "sequences_checked": checked_sequences,
        "revision": REVISION,
    }


def run(task):
    url, params, target_name = configured()
    source = connect(params)
    target = None
    try:
        source_name = scalar(source, "SELECT current_database()")
        validate_target(source_name, target_name)
        if task == "quiescent":
            return quiescent(source)
        if task == "preflight":
            result = inventory(source)
            names = set(table_names(source))
            result.update(storage_summary(source, names))
            return result
        if task == "create":
            inventory(source)
            with source.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_encoding_to_char(d.encoding),d.datcollate,d.datctype,to_jsonb(d)->>'datlocprovider',coalesce(to_jsonb(d)->>'daticulocale',to_jsonb(d)->>'datlocale'),current_user FROM pg_database d WHERE datname=current_database()"
                )
                encoding, collate, ctype, provider, icu_locale, owner = (
                    cursor.fetchone()
                )
            source.close()
            _, sql = dependencies()
            administrative = connect(params, readonly=False, autocommit=True)
            try:
                if scalar(
                    administrative,
                    "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=%s)",
                    (target_name,),
                ):
                    raise Refused("target_database_already_exists")
                statement = sql.SQL(
                    "CREATE DATABASE {} WITH TEMPLATE template0 OWNER {} ENCODING {} LC_COLLATE {} LC_CTYPE {}"
                ).format(
                    sql.Identifier(target_name),
                    sql.Identifier(owner),
                    sql.Literal(encoding),
                    sql.Literal(collate),
                    sql.Literal(ctype),
                )
                if provider == "i":
                    statement += sql.SQL(" LOCALE_PROVIDER icu ICU_LOCALE {}").format(
                        sql.Literal(icu_locale)
                    )
                elif provider in (None, "c"):
                    if provider:
                        statement += sql.SQL(" LOCALE_PROVIDER libc")
                else:
                    raise Refused("unsupported_database_locale_provider")
                with administrative.cursor() as cursor:
                    cursor.execute(statement)
            finally:
                administrative.close()
            return {"created_database_count": 1}
        target = connect(params, target=target_name)
        if scalar(target, "SELECT current_database()") != target_name:
            raise Refused("target_connection_identity_mismatch")
        if task == "verify-restore":
            return compare_restored(source, target)
        if task == "verify":
            return verify_native(source, target, url, target_name)
        if task == "migrate":
            compare_restored(source, target)
            target.close()
            _, upgrade, _, _, _ = native_imports()
            engine = target_engine(url, target_name)
            try:
                from sqlalchemy import text

                with engine.connect() as connection:
                    if (
                        connection.scalar(text("SELECT current_database()"))
                        != target_name
                    ):
                        raise Refused("target_connection_identity_mismatch")
                upgrade(engine)
            finally:
                engine.dispose()
            return {"migrated_database_count": 1, "revision": REVISION}
        raise Refused("unsupported_task")
    finally:
        if target is not None:
            target.close()
        source.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "task",
        choices=(
            "preflight",
            "quiescent",
            "create",
            "verify-restore",
            "migrate",
            "verify",
        ),
    )
    args = parser.parse_args(argv)
    try:
        result = run(args.task)
        print(
            json.dumps(
                {"ok": True, "task": args.task, **result},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, Refused) else "operation_failed"
        print(
            json.dumps(
                {
                    "ok": False,
                    "task": args.task,
                    "error": code,
                    "error_type": type(error).__name__,
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
