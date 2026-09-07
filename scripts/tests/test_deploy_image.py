"""Run the real Bash deployment script with a fake container CLI; no daemon needed."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
BASH = os.environ.get("BASH_BIN") or shutil.which("bash")
IMAGE = "ghcr.io/cone387/chewy-bbtalk@sha256:" + "a" * 64
MOCK_DOCKER = r'''#!/usr/bin/env bash
set -eu
if { true >&9; } 2>/dev/null; then printf 'lock-inherited\n' >> "$MOCK_LOG"; fi
if [[ "$1" == exec ]]; then
  printf 'exec %s\n' "$2" >> "$MOCK_LOG"
else
  printf '%s\n' "$*" >> "$MOCK_LOG"
fi
case "$1" in
  pull)
    if [[ "$MOCK_MODE" == pull_hang ]]; then /usr/bin/sleep 30; fi
    count=0
    [[ ! -f "$MOCK_COUNT" ]] || count=$(cat "$MOCK_COUNT")
    count=$((count+1)); echo "$count" > "$MOCK_COUNT"
    [[ "$MOCK_MODE" != pull_fail ]] || exit 1
    [[ "$MOCK_MODE" != retry || "$count" -gt 1 ]] || exit 1
    ;;
  container)
    name="$3"
    [[ "$name" != chewy-bbtalk-previous || "$MOCK_MODE" == previous ]] && [[ "$name" == chewy-bbtalk-previous ]] && exit 0
    [[ "$MOCK_MODE" != fresh ]] || exit 1
    [[ "$MOCK_MODE" != legacy || "$name" == chewybbtalk ]] || exit 1
    [[ "$name" == chewy-bbtalk || ( "$name" == chewybbtalk && ( "$MOCK_MODE" == legacy || "$MOCK_MODE" == both ) ) ]] || exit 1
    ;;
  image) [[ "$MOCK_MODE" != image_fail ]] || exit 1 ;;
  run) [[ "$MOCK_MODE" != run_fail ]] || exit 1 ;;
  exec) [[ "$MOCK_MODE" != health_fail ]] || exit 1 ;;
esac
'''


class DeployImageTests(unittest.TestCase):
    def run_deploy(self, mode="success", image=IMAGE, bad_env=False):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            work = root / "deployment directory"
            work.mkdir()
            if bad_env:
                (work / ".env").mkdir()
            else:
                (work / ".env").write_text("SECRET_KEY=test-only\n")
            binary = root / "bin"
            binary.mkdir()
            fixtures = {
                "docker": MOCK_DOCKER,
                "flock": '#!/usr/bin/env bash\n[[ "$MOCK_MODE" != locked ]]\n',
                "sleep": "#!/usr/bin/env bash\nexit 0\n",
            }
            for name, content in fixtures.items():
                path = binary / name
                path.write_text(content, newline="\n")
                path.chmod(0o755)
            log = root / "calls"
            env = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ["PATH"],
                       MOCK_LOG=log.as_posix(), MOCK_COUNT=(root / "count").as_posix(),
                       MOCK_MODE=mode, DEPLOY_PULL_ATTEMPTS="3", DEPLOY_HEALTH_ATTEMPTS="2",
                       DEPLOY_RETRY_DELAY="0", DEPLOY_HEALTH_INTERVAL="0", DEPLOY_PULL_TIMEOUT="1")
            # A copied LF script also makes the test independent of Windows autocrlf.
            script = root / "deploy-image.sh"
            script.write_text((ROOT / "scripts/deploy-image.sh").read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
            result = subprocess.run([BASH, str(script), image], cwd=work, env=env,
                                    capture_output=True, text=True, encoding="utf-8", timeout=15)
            calls = log.read_text().splitlines() if log.exists() else []
            return result, calls

    def test_success_pulls_before_stop_and_checks_before_removal(self):
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(calls.index("pull " + IMAGE), calls.index("stop chewy-bbtalk"))
        self.assertLess(calls.index("exec chewy-bbtalk"), calls.index("rm chewy-bbtalk-previous"))
        run = next(call for call in calls if call.startswith("run "))
        self.assertIn("--env-file .env", run)
        self.assertIn("/deployment directory/data:/app/data", run.replace("\\", "/"))
        self.assertTrue(run.endswith(IMAGE))
        self.assertFalse(any(call.startswith("build") for call in calls))
        self.assertNotIn("test-only", result.stdout + result.stderr)

    def test_first_install(self):
        result, calls = self.run_deploy("fresh")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(call.startswith(("stop ", "rename ", "rm ")) for call in calls))

    def test_container_cli_never_inherits_deployment_lock(self):
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("lock-inherited", calls)

    def test_legacy_container_is_preserved(self):
        result, calls = self.run_deploy("legacy")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("rename chewybbtalk chewy-bbtalk-previous", calls)

    def test_pull_failure_never_changes_old_container(self):
        result, calls = self.run_deploy("pull_fail")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls.count("pull " + IMAGE), 3)
        self.assertFalse(any(call.startswith(("stop ", "rename ", "rm ", "run ")) for call in calls))

    def test_transient_pull_failure_retries(self):
        result, calls = self.run_deploy("retry")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls.count("pull " + IMAGE), 2)

    def test_hung_pull_is_terminated_without_switching_containers(self):
        result, calls = self.run_deploy("pull_hang")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls.count("pull " + IMAGE), 3)
        self.assertFalse(any(call.startswith(("stop ", "rename ", "rm ", "run ")) for call in calls))

    def test_start_and_health_failure_preserve_previous(self):
        for mode in ("run_fail", "health_fail"):
            with self.subTest(mode=mode):
                result, calls = self.run_deploy(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("rename chewy-bbtalk chewy-bbtalk-previous", calls)
                self.assertNotIn("rm chewy-bbtalk-previous", calls)
                self.assertFalse(any(call.startswith("start ") for call in calls))

    def test_preflight_conflicts_and_lock_fail_before_switch(self):
        for mode in ("previous", "both", "locked", "image_fail"):
            with self.subTest(mode=mode):
                result, calls = self.run_deploy(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(call.startswith(("stop ", "rename ", "rm ", "run ")) for call in calls))

    def test_invalid_image_and_config_fail_before_pull(self):
        for options in ({"image": "--bad"}, {"bad_env": True}):
            with self.subTest(options=options):
                result, calls = self.run_deploy(**options)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(call.startswith("pull ") for call in calls))


if __name__ == "__main__":
    unittest.main()
