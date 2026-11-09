"""The agents-file-interpreter rule holds a script only when a write call's TARGET is an agent file
(T25): hello-lock's lab.py names AGENTS.md in a skip list while it writes a tarball, and was held.
Run: python3 -m unittest discover -s tests   (uses a throwaway CREW_DATA; touches nothing real)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

# A throwaway data folder: another test module's, when one already set it (crewlib reads it once,
# at import), else our own. Never the real one.
if "pals-test-" not in os.environ.get("CREW_DATA", ""):
    TMP = tempfile.mkdtemp(prefix="pals-test-")
    os.environ["CREW_DATA"] = TMP
    os.environ["HERDR_APP_HOME"] = TMP
os.environ.pop("HC_TERMINAL_ID", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))

import crewguard  # noqa: E402


def rule(cmd):
    r = crewguard.matches(cmd)
    return r["name"] if r else None


# lab.py (hello-lock tests/vm/lab.py:283-292), cut down: a tarball written, agent files skipped.
LAB = '''import tarfile
from pathlib import Path
ROOT = Path(__file__).parent
def bundle(destination, selected):
    with tarfile.open(destination, "w:gz") as archive:
        for name in selected:
            path = ROOT / name
            members = [path] + sorted(path.rglob("*")) if path.is_dir() else [path]
            for item in members:
                if "__pycache__" in item.parts or any(part.startswith(".") for part in item.relative_to(ROOT).parts) or item.name in ("AGENTS.md", "CLAUDE.md"):
                    continue
                archive.add(item, arcname=str(item.relative_to(ROOT)), recursive=False)
    (ROOT / "progress.json").write_text("{}")
'''

HELD = {
    "named": 'from pathlib import Path\nROOT = Path(".")\np = ROOT / "AGENTS.md"\np.write_text("new rules")\n',
    "renamed twice": 'import os\na = os.path.join("x", "CLAUDE.md")\nb = a\nopen(b, "w").write("x")\n',
    "looped": 'from pathlib import Path\nFILES = ["AGENTS.md", "CLAUDE.md"]\nfor f in FILES:\n    (Path(".") / f).write_text("x")\n',
    "loop inline": 'from pathlib import Path\nfor f in ("AGENTS.md",): (Path(".") / f).write_text("x")\n',
    "split call": 'from pathlib import Path\nPath(\n    "AGENTS.md"\n).write_text("x")\n',
    "via a helper": 'from pathlib import Path\ndef save(n, s):\n    Path(n).write_text(s)\nsave("AGENTS.md", "x")\n',
    "with open": 'with open("AGENTS.md", "w") as f:\n    f.write("x")\n',
    "node": "const fs = require('fs'), path = require('path');\nconst t = path.join(__dirname, 'CLAUDE.md');\nfs.writeFileSync(t, 'x');\n",
    "replace onto": 'import os\nos.replace("tmp.md", "AGENTS.md")\n',
}
ALLOWED = {
    "lab.py": LAB,
    "skip set": 'from pathlib import Path\nSKIP = {"AGENTS.md", "CLAUDE.md"}\nfor f in Path("src").iterdir():\n    if f.name in SKIP:\n        continue\n    (Path("out") / f.name).write_text(f.read_text())\n',
    "compared": 'from pathlib import Path\nfor f in Path(".").iterdir():\n    if f.name == "AGENTS.md": continue\n    Path("copy", f.name).write_bytes(f.read_bytes())\n',
    "endswith": 'import shutil, os\nfor n in os.listdir("."):\n    if not n.endswith("CLAUDE.md"):\n        shutil.copy(n, "out/")\n',
    "printed": 'print("skipping AGENTS.md")\nopen("log.txt", "w").write("done")\n',
    "read then written elsewhere": 'from pathlib import Path\ntext = Path("AGENTS.md").read_text()\nPath("out.md").write_text(text.upper())\n',
    "read with open": 'rules = open("AGENTS.md").read()\nopen("summary.txt", "w").write(str(len(rules)))\n',
    "commented": '# never touch "AGENTS.md" here\nopen("out.txt", "w").write("x")\n',
}


class Targets(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="pals-guard-"))

    def run_as(self, name, code, ext=".py"):
        f = self.dir / (name.replace(" ", "-") + ext)
        f.write_text(code)
        return rule(f"{'node' if ext == '.js' else 'python3'} {f} check")

    def test_scripts_that_write_one(self):
        for name, code in HELD.items():
            self.assertEqual(self.run_as(name, code, ".js" if name == "node" else ".py"), "agents-file-interpreter", name)

    def test_scripts_that_only_name_one(self):
        for name, code in ALLOWED.items():
            self.assertIsNone(self.run_as(name, code), name)

    def test_inline_code_too(self):
        for name, code in HELD.items():
            if name != "node":
                self.assertEqual(rule(f"python3 - <<'EOF'\n{code}EOF"), "agents-file-interpreter", name)
        for name, code in ALLOWED.items():
            self.assertIsNone(rule(f"python3 - <<'EOF'\n{code}EOF"), name)

    def test_statements(self):
        st = crewguard._statements('a = f(\n  1,\n  2)\nb = "x;y"; c = 3  # note; here\n')
        self.assertEqual(st, ["a = f(\n  1,\n  2)", 'b = "x;y"', "c = 3"])


if __name__ == "__main__":
    unittest.main()
