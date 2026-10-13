import importlib.util
import io
import json
import os
import subprocess
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from uuid import UUID, uuid4


SPEC = importlib.util.spec_from_file_location(
    "postgres_copy_worker", Path(__file__).parents[1] / "postgres-copy-worker.py"
)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class CopyWorkerTests(unittest.TestCase):
    def test_native_manifest_transforms_credentials_and_revocation_column_only(self):
        source = {'id': 1, 'identity_type': 'password', 'credential': 'pbkdf2_sha256$2$salt$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}
        converted = worker.native_row('cb_identities', source)
        self.assertEqual(json.loads(converted['credential']), {
            'v': 1, 'kdf': 'pbkdf2', 'hash': 'sha256', 'iterations': 2,
            'salt': 'c2FsdA==', 'digest': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        })
        self.assertEqual(source['credential'], 'pbkdf2_sha256$2$salt$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
        # A source already upgraded to the current revision is still verifiable.
        self.assertEqual(worker.native_row('cb_identities', converted), converted)
        disabled = {**source, 'credential': '!disabled'}
        self.assertEqual(worker.native_row('cb_identities', disabled), disabled)
        oauth = {**source, 'identity_type': 'oauth'}
        self.assertEqual(worker.native_row('cb_identities', oauth), oauth)
        self.assertEqual(worker.native_row('token_blacklist_blacklistedtoken', {'id': 3, 'blacklisted_at': 'old-time'}), {'id': 3, 'revoked_at': 'old-time'})
        self.assertEqual(worker.native_row('cb_revoked_tokens', {'id': 3, 'blacklisted_at': 'old-time'}), {'id': 3, 'revoked_at': 'old-time'})

    def test_target_must_be_separate_and_use_reserved_prefix(self):
        for target in (
            "chewy_bbtalk",
            "postgres",
            "chewy_bbtalk_native_x;DROP DATABASE x",
            "",
            "chewy_bbtalk_native_" + "x" * 60,
        ):
            with self.subTest(target=target), self.assertRaises(worker.Refused):
                worker.validate_target("chewy_bbtalk", target)
        with self.assertRaises(worker.Refused):
            worker.validate_target("chewy_bbtalk_native_old", "chewy_bbtalk_native_old")
        self.assertEqual(
            worker.validate_target("chewy_bbtalk", "chewy_bbtalk_native_20261012"),
            "chewy_bbtalk_native_20261012",
        )

    def test_digest_is_order_independent_but_preserves_duplicate_rows(self):
        rows = [(1, {"b": 2, "a": 1}), (2, None)]
        self.assertEqual(
            worker.rows_digest(rows), worker.rows_digest(list(reversed(rows)))
        )
        self.assertNotEqual(
            worker.rows_digest(rows), worker.rows_digest(rows + [rows[0]])
        )

    def test_typed_normalization_preserves_precision_and_binary(self):
        row = [
            Decimal("16777217.2500"),
            datetime(2026, 10, 12, 1, 2, 3, 123456, timezone.utc),
            UUID("12345678-1234-5678-1234-567812345678"),
            b"\x00\xff",
        ]
        encoded = worker.canonical(row)
        self.assertIn(b"123456", encoded)
        self.assertIn(b"16777217.25", encoded)
        self.assertNotEqual(encoded, worker.canonical([*row[:-1], b"\x00\xfe"]))

    def test_manifest_mismatch_is_rejected(self):
        with self.assertRaises(worker.Refused):
            worker.compare_manifests(
                {"table": {"count": 2, "sha256": "a"}},
                {"table": {"count": 2, "sha256": "b"}},
            )

    def test_decimal_digest_does_not_round_at_default_context_precision(self):
        first = Decimal("123456789012345678901234567890.001")
        second = Decimal("123456789012345678901234567890.002")
        self.assertNotEqual(worker.canonical(first), worker.canonical(second))
        self.assertEqual(
            worker.canonical(Decimal("1.00")), worker.canonical(Decimal("1"))
        )

    def test_quiescence_refuses_other_connections_without_terminating_them(self):
        with patch.object(worker, "scalar", return_value=1) as query:
            with self.assertRaisesRegex(worker.Refused, "source_has_other_connections"):
                worker.quiescent(object())
            self.assertNotIn("terminate", str(query.call_args))
        with patch.object(worker, "scalar", return_value=0):
            self.assertEqual(worker.quiescent(object()), {"other_connections": 0})

    def test_errors_never_print_exception_secrets(self):
        output = io.StringIO()
        with (
            patch.object(
                worker,
                "run",
                side_effect=RuntimeError(
                    "postgresql://user:password@host/private-record"
                ),
            ),
            redirect_stdout(output),
        ):
            self.assertEqual(worker.main(["preflight"]), 1)
        result = json.loads(output.getvalue())
        self.assertFalse(result["ok"])
        self.assertNotIn("password", output.getvalue())
        self.assertNotIn("private-record", output.getvalue())


@unittest.skipUnless(
    os.environ.get("TEST_POSTGRES_COPY_URL")
    and os.environ.get("POSTGRES_COPY_TEST_CONTAINER"),
    "requires dedicated PostgreSQL test container",
)
class CopyWorkerPostgresTests(unittest.TestCase):
    def test_complete_copy_as_nonsuperuser_preserves_source_and_archive(self):
        """Only random owned databases are created/dropped; supplied DB is untouched."""
        psycopg2, sql = worker.dependencies()
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url
        from sqlalchemy.orm import Session

        worker.native_imports()
        from database.migrations import schema_v1 as old

        admin_url = make_url(os.environ["TEST_POSTGRES_COPY_URL"])
        role = "worker_role_" + uuid4().hex[:12]
        source_name = "worker_source_" + uuid4().hex[:12]
        target_name = "chewy_bbtalk_native_" + uuid4().hex[:12]
        admin = psycopg2.connect(
            admin_url.set(drivername="postgresql").render_as_string(hide_password=False)
        )
        admin.autocommit = True
        engine = None
        try:
            with admin.cursor() as cursor:
                cursor.execute(
                    sql.SQL("CREATE ROLE {} LOGIN CREATEDB PASSWORD %s").format(
                        sql.Identifier(role)
                    ),
                    ("synthetic-test-password",),
                )
                cursor.execute(
                    sql.SQL("CREATE DATABASE {} OWNER {} TEMPLATE template0").format(
                        sql.Identifier(source_name), sql.Identifier(role)
                    )
                )
            source_url = admin_url.set(
                drivername="postgresql+psycopg2",
                username=role,
                password="synthetic-test-password",
                database=source_name,
            )
            engine = create_engine(source_url, hide_parameters=True)
            old.Base.metadata.create_all(engine)
            with Session(engine) as session:
                session.add(
                    old.User(
                        id=99,
                        username="historical",
                        display_name="历史🍎",
                        is_superuser=True,
                        bio="正文" * 40000,
                    )
                )
                session.flush()
                session.add(old.Identity(user_id=99, identity_type="password", identifier="historical",
                    credential="pbkdf2_sha256$2$salt$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="))
                session.add(
                    old.Tag(id=77, user_id=99, name="precise", sort_order=16777217.25)
                )
                session.add(
                    old.BBTalk(
                        id=66,
                        user_id=99,
                        content="历史正文",
                        attachments=[{"kind": "synthetic"}],
                        context={"nested": [1, True, None]},
                    )
                )
                session.add(
                    old.OutstandingToken(
                        id=81,
                        user_id=99,
                        jti="historical-jti",
                        token="synthetic",
                        expires_at=old.now(),
                    )
                )
                session.flush()
                session.add(old.BlacklistedToken(id=88, token_id=81))
                session.commit()
            with engine.begin() as connection:
                connection.exec_driver_sql("DROP TABLE cb_sessions")
                for name in sorted(worker.LEGACY):
                    connection.exec_driver_sql(
                        f"CREATE TABLE {name} (id integer PRIMARY KEY, payload text, created_at timestamptz, binary_value bytea, precise numeric)"
                    )
                    connection.execute(
                        text(
                            f"INSERT INTO {name} VALUES (1,:payload,:created,:binary,:precise)"
                        ),
                        {
                            "payload": "归档🍎",
                            "created": datetime(
                                2026, 10, 12, 1, 2, 3, 123456, timezone.utc
                            ),
                            "binary": b"\x00\xff",
                            "precise": Decimal("123456789012345678901234567890.001"),
                        },
                    )
            engine.dispose()
            configuration = {
                "DATABASE_URL": source_url.set(
                    drivername="postgresql"
                ).render_as_string(hide_password=False),
                "TARGET_DATABASE": target_name,
            }
            with patch.dict(os.environ, configuration):
                preflight = worker.run("preflight")
                self.assertFalse(preflight["role"]["superuser"])
                self.assertTrue(preflight["role"]["createdb"])
                json.dumps(preflight)
                self.assertEqual(worker.run("quiescent"), {"other_connections": 0})
                worker.run("create")
                with self.assertRaisesRegex(
                    worker.Refused, "target_database_already_exists"
                ):
                    worker.run("create")
                container = os.environ["POSTGRES_COPY_TEST_CONTAINER"]
                command = ["docker", "exec", "-i", container]
                dump = subprocess.run(
                    [*command, "pg_dump", "-U", role, "-d", source_name, "-Fc"],
                    check=True,
                    capture_output=True,
                ).stdout
                subprocess.run(
                    [
                        *command,
                        "pg_restore",
                        "-U",
                        role,
                        "-d",
                        target_name,
                        "--exit-on-error",
                        "--no-owner",
                    ],
                    input=dump,
                    check=True,
                    capture_output=True,
                )
                restored = worker.run("verify-restore")
                worker.run("migrate")
                verified = worker.run("verify")
                self.assertEqual(verified["revision"], worker.REVISION)
                self.assertEqual(
                    sum(item["count"] for item in verified["archives"].values()), 7
                )
                self.assertGreater(verified["sequences_checked"], 0)
                _, params, _ = worker.configured()
                source = worker.connect(params)
                try:
                    self.assertEqual(worker.manifest(source), restored["tables"])
                    with self.assertRaisesRegex(
                        worker.Refused, "source_has_other_connections"
                    ):
                        worker.run("quiescent")
                finally:
                    source.close()
        finally:
            if engine is not None:
                engine.dispose()
            with admin.cursor() as cursor:
                for name in (target_name, source_name):
                    cursor.execute(
                        sql.SQL("DROP DATABASE IF EXISTS {}").format(
                            sql.Identifier(name)
                        )
                    )
                cursor.execute(
                    sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(role))
                )
            admin.close()


if __name__ == "__main__":
    unittest.main()
