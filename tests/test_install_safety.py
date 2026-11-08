"""Attachments (Codex review M4, M5) and Roll back's config restore (M6), in throwaway homes."""
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

BIN = Path(__file__).resolve().parent.parent / "bin"
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64


def attach(*args):
    r = subprocess.run([sys.executable, str(BIN / "crewattach.py"), *args], capture_output=True, text=True)
    return r.returncode, json.loads(r.stdout or "{}")


class Attachments(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp(prefix="pals-attach-"))
        self.store = self.d / "store"

    def test_symlink_to_a_big_file_is_refused(self):
        big = self.d / "big.png"
        with open(big, "wb") as f:      # sparse: 11 MiB long, almost nothing on disk
            f.write(PNG)
            f.truncate(11 * 1024 * 1024)
        link = self.d / "linked.png"
        link.symlink_to(big)
        code, out = attach("copy", str(link), str(self.store))
        self.assertEqual(code, 6, out)
        self.assertFalse(self.store.exists() and any(self.store.iterdir()))

    def test_size_limit_is_on_the_bytes(self):
        big = self.d / "big.png"
        with open(big, "wb") as f:      # sparse: 11 MiB long, almost nothing on disk
            f.write(PNG)
            f.truncate(11 * 1024 * 1024)
        self.assertEqual(attach("copy", str(big), str(self.store))[0], 4)

    def test_not_an_image(self):
        f = self.d / "notes.png"
        f.write_text("just text")
        self.assertEqual(attach("copy", str(f), str(self.store))[0], 5)

    def test_unique_names_never_overwrite(self):
        f = self.d / "shot.png"
        f.write_bytes(PNG)
        paths = {attach("copy", str(f), str(self.store))[1]["path"] for _ in range(25)}
        self.assertEqual(len(paths), 25)
        self.assertEqual(len(list(self.store.iterdir())), 25)


class RollbackConfig(unittest.TestCase):
    def test_restores_only_what_the_install_changed(self):
        home = Path(tempfile.mkdtemp(prefix="pals-home-"))
        app = home / ".config" / "herdr-app"
        (app / "data").mkdir(parents=True)
        (home / ".claude").mkdir()
        (app / "keys.json").write_text(json.dumps({"global": {"ctrl-shift-m": "crew-roster.mode", "ctrl-shift-t": "tab.new"}}))
        hook = str(home / ".local" / "bin" / "crew-hook")
        (home / ".claude" / "settings.json").write_text(json.dumps({"hooks": {"PreToolUse": [
            {"matcher": "Bash", "hooks": [{"type": "command", "command": f"{hook} pre-tool-use"}]},
            {"matcher": "Other", "hooks": [{"type": "command", "command": "someone-elses-hook"}]}]}}))
        script = textwrap.dedent(f"""
            import json, sys
            sys.path.insert(0, {str(BIN)!r})
            import crewupdate
            from pathlib import Path
            app, home = Path({str(app)!r}), Path({str(home)!r})
            snap = crewupdate._snapshot("test")
            # What an install does: the profile key in, the old Pro key out, the matcher widened.
            k = json.loads((app / "keys.json").read_text())
            k["global"].pop("ctrl-shift-m"); k["global"]["ctrl-shift-i"] = "crew-roster.profile"
            k["global"]["ctrl-shift-y"] = "the person's own, added later"
            (app / "keys.json").write_text(json.dumps(k))
            st = json.loads((home / ".claude" / "settings.json").read_text())
            st["hooks"]["PreToolUse"][0]["matcher"] = "Bash|Edit|Write|MultiEdit|NotebookEdit"
            (home / ".claude" / "settings.json").write_text(json.dumps(st))
            crewupdate.rollback(snap)
            print(json.dumps({{"keys": json.loads((app / "keys.json").read_text()),
                              "settings": json.loads((home / ".claude" / "settings.json").read_text())}}))
        """)
        env = {**os.environ, "HOME": str(home), "HERDR_APP_HOME": str(app)}
        env.pop("CREW_DATA", None)
        r = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout.strip().splitlines()[-1])
        g = out["keys"]["global"]
        self.assertNotIn("ctrl-shift-i", g)                       # the install's key: gone
        self.assertEqual(g["ctrl-shift-m"], "crew-roster.mode")   # the removed one: back
        self.assertEqual(g["ctrl-shift-y"], "the person's own, added later")   # later edits: kept
        pre = out["settings"]["hooks"]["PreToolUse"]
        self.assertEqual(pre[0]["matcher"], "Bash")
        self.assertEqual(pre[1]["matcher"], "Other")


if __name__ == "__main__":
    unittest.main()
