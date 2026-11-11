"""The tests leave /tmp as they found it (T143; /tmp is RAM on tmpfs machines).

Fast checks here: no Python test makes a folder that outlives it (tempfile.mkdtemp instead of
pals_tmp.mkdtemp), every node test removes its folder in a finally, and pals_tmp removes its folders
at exit, only in the process that made them. The whole suite in an empty TMPDIR is tests/check_tmp.sh,
which the release preflight runs.
Run: python3 -m unittest tests.test_tmp_clean"""
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent


class TestsCleanUp(unittest.TestCase):
    def test_python_tests_use_pals_tmp(self):
        bad = []
        for f in sorted(HERE.glob("test_*.py")):
            if f.name == Path(__file__).name:
                continue
            for n, line in enumerate(f.read_text().splitlines(), 1):
                code = line.split("#", 1)[0]
                if re.search(r"(?<!pals_tmp\.)\bmkdtemp\(|\bmkstemp\(|NamedTemporaryFile\([^)]*delete\s*=\s*False", code):
                    bad.append(f"{f.name}:{n}: {line.strip()}")
        self.assertEqual(bad, [], "use pals_tmp.mkdtemp (removed at exit) or a with-block:\n" + "\n".join(bad))

    def test_node_tests_remove_their_folders(self):
        bad = [f.name for f in sorted(HERE.glob("*.mjs"))
               if "mkdtempSync" in (t := f.read_text()) and not ("finally" in t and "rmSync" in t)]
        self.assertEqual(bad, [], "rmSync the mkdtempSync folder in a finally")

    def test_release_runs_the_clean_check(self):
        self.assertIn("tests/check_tmp.sh", (REPO / "release").read_text())
        self.assertTrue((HERE / "check_tmp.sh").stat().st_mode & 0o111)

    def test_pals_tmp_cleans_at_exit_and_not_in_a_forked_child(self):
        with tempfile.TemporaryDirectory(prefix="pt-") as base:
            script = textwrap.dedent(f"""
                import os, sys
                sys.path.insert(0, {str(HERE)!r})
                import pals_tmp
                d = pals_tmp.mkdtemp(prefix="pals-x-", dir={base!r})
                open(os.path.join(d, "f"), "w").write("x")
                pid = os.fork()
                if pid == 0:
                    pals_tmp.mkdtemp(prefix="pals-child-", dir={base!r})
                    sys.exit(0)      # runs the child's atexit: its own folder only
                os.waitpid(pid, 0)
                print(d, os.path.isdir(d))
            """)
            out = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, timeout=30)
            self.assertEqual(out.returncode, 0, out.stderr)
            d, alive = out.stdout.split()
            self.assertEqual(alive, "True", "a forked child's exit must not remove its parent's folders")
            self.assertFalse(Path(d).exists(), "removed when the process that made it exits")
            self.assertEqual(list(Path(base).iterdir()), [], "the child's folder went too")


if __name__ == "__main__":
    unittest.main()
