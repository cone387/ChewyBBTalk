"""Attachment baselines use only synthetic files and require no database drivers."""

import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).parents[1] / filename
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


baseline = load("attachment_baseline", "postgres-copy-attachments.py")
smoke = load("attachment_smoke", "postgres-copy-smoke.py")
FIRST = "00000000-0000-0000-0000-000000000001"
SECOND = "00000000-0000-0000-0000-000000000002"


class AttachmentBaselineTests(unittest.TestCase):
    def test_baseline_is_exact_and_default_remains_strict(self):
        smoke.validate_missing_attachments(set(), None)
        smoke.validate_missing_attachments({FIRST}, [FIRST])
        for actual, expected in (
            ({FIRST}, None),
            ({FIRST, SECOND}, [FIRST]),
            (set(), [FIRST]),
        ):
            with (
                self.subTest(actual=actual, expected=expected),
                self.assertRaises(RuntimeError),
            ):
                smoke.validate_missing_attachments(actual, expected)
        for invalid in (FIRST, [FIRST, FIRST], ["not-an-attachment-id"]):
            with self.subTest(invalid=invalid), self.assertRaises(RuntimeError):
                smoke.validate_missing_attachments({FIRST}, invalid)

    def test_counts_separate_existing_and_preexisting_missing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "present.txt").write_bytes(b"synthetic")
            rows = [
                dict(
                    id=FIRST,
                    owner_id="1",
                    storage_path="present.txt",
                    storage_config_id=None,
                ),
                dict(
                    id=SECOND,
                    owner_id="1",
                    storage_path="missing.txt",
                    storage_config_id="",
                ),
            ]
            result = baseline.summarize(rows, {}, root, global_cloud=False)
            self.assertEqual(
                result,
                {
                    "missing_ids": [SECOND],
                    "local_records": 2,
                    "present_files": 1,
                    "cloud_records": 0,
                },
            )
            self.assertNotIn("present.txt", json.dumps(result))

    def test_explicit_local_overrides_global_cloud_and_s3_never_reads_network(self):
        with tempfile.TemporaryDirectory() as directory:
            rows = [
                dict(
                    id=FIRST,
                    owner_id="1",
                    storage_path="missing.txt",
                    storage_config_id="7",
                ),
                dict(
                    id=SECOND,
                    owner_id="1",
                    storage_path="remote.txt",
                    storage_config_id="8",
                ),
            ]
            configs = {
                "7": dict(user_id=1, storage_type="local", configured=False),
                "8": dict(user_id=1, storage_type="s3", configured=True),
            }
            result = baseline.summarize(
                rows, configs, Path(directory), global_cloud=True
            )
            self.assertEqual(result["missing_ids"], [FIRST])
            self.assertEqual(result["cloud_records"], 1)
            rows[0]["storage_config_id"] = None
            self.assertEqual(
                baseline.summarize(rows, configs, Path(directory), global_cloud=True)[
                    "cloud_records"
                ],
                2,
            )

    def test_unsafe_keys_cannot_be_classified_as_accepted_missing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            for key in (
                "../outside",
                "/absolute",
                "C:/absolute",
                "..\\outside",
                "",
                "\x00",
            ):
                with self.subTest(key=key), self.assertRaises(RuntimeError):
                    baseline.local_path(Path(directory), key)
            with patch.object(
                Path, "resolve", side_effect=[Path(directory), Path(directory).parent]
            ):
                with self.assertRaises(RuntimeError):
                    baseline.local_path(Path(directory), "symlink/outside")

    def test_invalid_storage_references_fail_instead_of_becoming_local_missing(self):
        row = dict(
            id=FIRST, owner_id="1", storage_path="missing", storage_config_id="7"
        )
        invalid = (
            {},
            {"7": dict(user_id=2, storage_type="local", configured=False)},
            {"7": dict(user_id=1, storage_type="s3", configured=False)},
            {"7": dict(user_id=1, storage_type="unexpected", configured=True)},
        )
        for configs in invalid:
            with self.subTest(configs=configs), self.assertRaises(RuntimeError):
                baseline.storage_kind(row, configs, False)

    def test_existing_downloads_still_require_sha_and_new_missing_cannot_be_skipped(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "attachment"
            with self.assertRaises(RuntimeError):
                smoke.verify_local_download(path, FIRST, set(), lambda: b"")
            self.assertFalse(
                smoke.verify_local_download(
                    path, FIRST, {FIRST}, lambda: self.fail("missing file downloaded")
                )
            )
            path.write_bytes(b"synthetic content")
            self.assertTrue(
                smoke.verify_local_download(
                    path,
                    FIRST,
                    set(),
                    lambda: hashlib.sha256(b"synthetic content").digest(),
                )
            )
            with self.assertRaises(RuntimeError):
                smoke.verify_local_download(
                    path,
                    FIRST,
                    set(),
                    lambda: hashlib.sha256(b"changed content").digest(),
                )


if __name__ == "__main__":
    unittest.main()
