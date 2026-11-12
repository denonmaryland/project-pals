"""Attachments (Codex review M4, M5) and Roll back's config restore (M6), in throwaway homes."""
import json
import os
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

BIN = Path(__file__).resolve().parent.parent / "bin"
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64


def sandbox_env(home, app):
    """HOME and Herdr's home in a throwaway folder, and a fake systemctl first on PATH: Roll back
    restarts crewd, and that must never reach the live user session (N1)."""
    shims = home / "shims"
    shims.mkdir(exist_ok=True)
    (shims / "systemctl").write_text("#!/bin/sh\nexit 1\n")
    (shims / "systemctl").chmod(0o755)
    env = {**os.environ, "HOME": str(home), "HERDR_APP_HOME": str(app), "PATH": f"{shims}:{os.environ.get('PATH', '/usr/bin:/bin')}"}
    env.pop("CREW_DATA", None)
    return env


def attach(*args):
    r = subprocess.run([sys.executable, str(BIN / "crewattach.py"), *args], capture_output=True, text=True)
    return r.returncode, json.loads(r.stdout or "{}")


class Attachments(unittest.TestCase):
    def setUp(self):
        self.d = Path(pals_tmp.mkdtemp(prefix="pals-attach-"))
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
        home = Path(pals_tmp.mkdtemp(prefix="pals-home-"))
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
            k["global"]["ctrl-shift-space"] = "crew-header.search"
            k["global"]["ctrl-shift-y"] = "the person's own, added later"
            (app / "keys.json").write_text(json.dumps(k))
            st = json.loads((home / ".claude" / "settings.json").read_text())
            st["hooks"]["PreToolUse"][0]["matcher"] = "Bash|Edit|Write|MultiEdit|NotebookEdit"
            (home / ".claude" / "settings.json").write_text(json.dumps(st))
            crewupdate.rollback(snap)
            print(json.dumps({{"keys": json.loads((app / "keys.json").read_text()),
                              "settings": json.loads((home / ".claude" / "settings.json").read_text())}}))
        """)
        r = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=sandbox_env(home, app))
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout.strip().splitlines()[-1])
        g = out["keys"]["global"]
        self.assertNotIn("ctrl-shift-i", g)                       # the install's key: gone
        self.assertNotIn("ctrl-shift-space", g)                   # the command bar's: gone too
        self.assertEqual(g["ctrl-shift-m"], "crew-roster.mode")   # the removed one: back
        self.assertEqual(g["ctrl-shift-y"], "the person's own, added later")   # later edits: kept
        pre = out["settings"]["hooks"]["PreToolUse"]
        self.assertEqual(pre[0]["matcher"], "Bash")
        self.assertEqual(pre[1]["matcher"], "Other")

    def test_rollback_leaves_no_newer_library_files_or_empty_hook_lists(self):
        # B3: rolling crew/next back to 0.3.0 kept crewdesk.py & co in ~/.local/lib/herdr-crew and left
        # "PostToolUse": [] / "Stop": [] in settings.json.
        home = Path(pals_tmp.mkdtemp(prefix="pals-home-"))
        app = home / ".config" / "herdr-app"
        (app / "data").mkdir(parents=True)
        (home / ".claude").mkdir()
        lib = home / ".local" / "lib" / "herdr-crew"
        (lib / "__pycache__").mkdir(parents=True)
        (lib / "crewlib.py").write_text("old = 1\n")
        hook = str(home / ".local" / "bin" / "crew-hook")
        ours = lambda ev: {"hooks": [{"type": "command", "command": f"{hook} {ev}"}]}
        (home / ".claude" / "settings.json").write_text(json.dumps({"hooks": {
            "PreToolUse": [{"matcher": "Bash", **ours("pre-tool-use")}],
            "SessionStart": [{"hooks": [{"type": "command", "command": "someone-elses-hook"}]}]}}))
        script = textwrap.dedent(f"""
            import json, sys
            sys.path.insert(0, {str(BIN)!r})
            import crewupdate
            from pathlib import Path
            home, lib = Path({str(home)!r}), Path({str(lib)!r})
            snap = crewupdate._snapshot("from-0.3.0")
            # What the newer install does: new library files, and hooks on two new events.
            (lib / "crewlib.py").write_text("new = 1\\n")
            (lib / "crewdesk.py").write_text("desk = 1\\n")
            (lib / "__pycache__" / "crewdesk.cpython-313.pyc").write_bytes(b"x")
            (lib / "skills").mkdir(); (lib / "skills" / "x.md").write_text("x")
            st = json.loads((home / ".claude" / "settings.json").read_text())
            st["hooks"]["PostToolUse"] = [{json.dumps({"matcher": "*", **ours("post-tool-use")})}]
            st["hooks"]["Stop"] = [{json.dumps(ours("stop"))}]
            (home / ".claude" / "settings.json").write_text(json.dumps(st))
            crewupdate.rollback(snap, log=lambda *_: None)
        """)
        r = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=sandbox_env(home, app))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(sorted(p.relative_to(lib).as_posix() for p in lib.rglob("*")), ["__pycache__", "crewlib.py"])
        self.assertEqual((lib / "crewlib.py").read_text(), "old = 1\n")
        hooks = json.loads((home / ".claude" / "settings.json").read_text())["hooks"]
        self.assertEqual(set(hooks), {"PreToolUse", "SessionStart"})   # no empty PostToolUse / Stop
        self.assertEqual(hooks["SessionStart"][0]["hooks"][0]["command"], "someone-elses-hook")

    def test_rollback_never_prunes_through_a_linked_library(self):
        # A development install links ~/.local/lib/herdr-crew to a checkout: its files aren't ours to remove.
        home = Path(pals_tmp.mkdtemp(prefix="pals-home-"))
        app = home / ".config" / "herdr-app"
        (app / "data").mkdir(parents=True)
        checkout = home / "checkout"
        checkout.mkdir()
        (checkout / "crewlib.py").write_text("x\n")
        (home / ".local" / "lib").mkdir(parents=True)
        (home / ".local" / "lib" / "herdr-crew").symlink_to("../../checkout")   # relative: extraction refuses absolute links
        script = textwrap.dedent(f"""
            import sys
            sys.path.insert(0, {str(BIN)!r})
            import crewupdate
            from pathlib import Path
            snap = crewupdate._snapshot("dev")
            (Path({str(checkout)!r}) / "crewdesk.py").write_text("y\\n")
            crewupdate.rollback(snap, log=lambda *_: None)
        """)
        r = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=sandbox_env(home, app))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((checkout / "crewdesk.py").exists())


    def test_rollback_drops_a_key_an_older_snapshot_never_listed(self):
        # 0.3.0's updater snapshotted only ctrl-shift-i and ctrl-shift-m; rolling 0.4.0 back to it
        # takes out the command bar's key when it's still ours, and leaves a person's own binding.
        for current, kept in (("crew-header.search", False), ("my.own.thing", True)):
            home = Path(pals_tmp.mkdtemp(prefix="pals-home-"))
            app = home / ".config" / "herdr-app"
            (app / "data").mkdir(parents=True)
            (app / "keys.json").write_text(json.dumps({"global": {"ctrl-shift-i": "crew-roster.profile", "ctrl-shift-space": current}}))
            script = textwrap.dedent(f"""
                import json, sys
                sys.path.insert(0, {str(BIN)!r})
                import crewupdate
                snap = {{"keys_file": True, "keys": {{"ctrl-shift-i": "crew-roster.profile", "ctrl-shift-m": None}}, "hooks": {{}}}}
                crewupdate.restore_config(snap, log=lambda *_: None)
            """)
            r = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=sandbox_env(home, app))
            self.assertEqual(r.returncode, 0, r.stderr)
            g = json.loads((app / "keys.json").read_text())["global"]
            self.assertEqual(g.get("ctrl-shift-i"), "crew-roster.profile")
            self.assertEqual("ctrl-shift-space" in g, kept, current)


if __name__ == "__main__":
    unittest.main()
