"""The suite cannot reuse the live data path or write to it through the runner."""
import os
import pwd
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REAL_DATA = Path(pwd.getpwuid(os.getuid()).pw_dir) / ".config/herdr-app/data"


class TestSuiteIsolation(unittest.TestCase):
    def test_cached_live_data_is_rejected_before_guard_tests_write(self):
        code = '''
import sys, types
fake = types.ModuleType("crewlib")
fake.DATA = sys.argv[1]
sys.modules["crewlib"] = fake
sys.path.insert(0, sys.argv[2])
try:
    import test_guard
except RuntimeError as exc:
    assert "real Herdr data folder" in str(exc)
else:
    raise AssertionError("cached live data was accepted")
'''
        result = subprocess.run([sys.executable, "-c", code, str(REAL_DATA), str(ROOT / "tests")],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(REAL_DATA.is_dir(), "no installed Herdr data folder to mask")
    def test_runner_rejects_writes_to_live_data_path(self):
        code = 'from pathlib import Path; import sys; (Path(sys.argv[1]) / ".t283-write-probe").write_text("blocked")'
        result = subprocess.run([str(ROOT / "tests/run-isolated.sh"), sys.executable, "-c", code, str(REAL_DATA)],
                                capture_output=True, text=True, timeout=30)
        self.assertNotEqual(result.returncode, 0, "a write through the live path must fail")
        self.assertIn("Read-only file system", result.stderr)

    def test_detached_test_child_cannot_outlive_runner(self):
        with tempfile.TemporaryDirectory(prefix="pals-isolation-child-") as tmp:
            marker = Path(tmp) / "late"
            code = ('import subprocess, sys; subprocess.Popen([sys.executable, "-c", '
                    '"import pathlib,sys,time; time.sleep(1); pathlib.Path(sys.argv[1]).touch()", '
                    'sys.argv[1]], start_new_session=True)')
            result = subprocess.run([str(ROOT / "tests/run-isolated.sh"), sys.executable, "-c", code, str(marker)],
                                    capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            time.sleep(1.5)
            self.assertFalse(marker.exists(), "a detached test child survived the sandbox")


if __name__ == "__main__":
    unittest.main()
