"""Uninstall (T48): install into a throwaway HOME, uninstall, and the HOME is as it was, byte for byte.

Every run uses its own HOME with fake herdr-app, hc and systemctl first on PATH, so nothing reaches
the live Herdr, core or systemd session (AGENTS.md "Testing")."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FAKE_HERDR = """#!/bin/sh
case "$1" in
  --version) echo "herdr-app ${FAKE_APP_VERSION:-0.1.14}" ;;
  check) exit 0 ;;
  ls) echo '{"spaces":[],"recent":[]}' ;;
  status) [ -n "$FAKE_LAYOUT" ] && echo "{\\"layout\\": \\"$FAKE_LAYOUT\\"}" || exit 1 ;;
  do) echo "$*" >> "$HOME/herdr-do.log" ;;
  *) exit 1 ;;
esac
"""
FAKE_HC = """#!/bin/sh
case "$1" in
  --version) echo "hc ${FAKE_CORE_VERSION:-0.1.19}" ;;
  *) exit 1 ;;
esac
"""


def tree(root, skip=()):
    """Every file, folder and link under root: {relative path: what it is (bytes' hash, link target)}."""
    out = {}
    for dirpath, dirs, files in os.walk(root, followlinks=False):
        d = Path(dirpath)
        for name in dirs + files:
            p = d / name
            rel = str(p.relative_to(root))
            if rel.split(os.sep)[0] in skip or rel in skip:
                continue
            if p.is_symlink():
                out[rel] = "link:" + os.readlink(p)
            elif p.is_dir():
                out[rel] = "dir"
            else:
                out[rel] = "file:" + hashlib.sha256(p.read_bytes()).hexdigest()
    return out


class Sandbox:
    def __init__(self):
        self.base = Path(tempfile.mkdtemp(prefix="pals-uninstall-"))
        self.home = self.base / "home"
        self.app = self.home / ".config" / "herdr-app"
        self.app.mkdir(parents=True)
        self.shims = self.base / "shims"
        self.shims.mkdir()
        for name, text in (("herdr-app", FAKE_HERDR), ("hc", FAKE_HC), ("systemctl", "#!/bin/sh\nexit 1\n")):
            (self.shims / name).write_text(text)
            (self.shims / name).chmod(0o755)

    def env(self, **extra):
        return {"HOME": str(self.home), "PATH": f"{self.shims}:{self.home}/.local/bin:/usr/bin:/bin",
                "LANG": "C.UTF-8", **extra}

    def run(self, *args, check=True, **extra):
        r = subprocess.run(list(args), cwd=ROOT, env=self.env(**extra), capture_output=True, text=True, timeout=300)
        if check and r.returncode != 0:
            raise AssertionError(f"{args} failed ({r.returncode}):\n{r.stdout}\n{r.stderr}")
        return r

    def install(self, *flags, **extra):
        return self.run("bash", "install.sh", *flags, **extra)

    def uninstall(self, *flags, **extra):
        return self.run("bash", "install.sh", "--uninstall", *flags, **extra)

    def snapshot(self, skip=()):
        # The fake herdr-app's own log isn't part of the home being compared, nor Python's bytecode
        # caches (running pal writes them into the library folder, which uninstall removes whole).
        return {k: v for k, v in tree(self.home, skip=("herdr-do.log", *skip)).items() if "__pycache__" not in k}

    def close(self):
        shutil.rmtree(self.base, ignore_errors=True)


def user_config(sb):
    """A HOME that already has the person's own config, written the way people write it (compact,
    odd spacing, non-ASCII), so a byte-level comparison means something."""
    (sb.app / "keys.json").write_text('{"global": {"ctrl-shift-t": "tab.new"},   "terminal": {"ctrl-shift-c": "terminal.copy"}}\n')
    claude = sb.home / ".claude"
    claude.mkdir()
    (claude / "settings.json").write_text(
        '{\n    "model": "opus",\n    "hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "my-guard"}]}]},\n'
        '    "statusLine": {"type": "command", "command": "my-status --café", "padding": 0}\n}\n')
    (claude / "skills" / "my-skill").mkdir(parents=True)
    (claude / "skills" / "my-skill" / "SKILL.md").write_text("mine\n")
    (sb.home / ".codex").mkdir()
    gem = sb.home / ".gemini" / "config"
    gem.mkdir(parents=True)
    (gem / "hooks.json").write_text('{"mine": {"Stop": []}}')
    bindir = sb.home / ".local" / "bin"
    bindir.mkdir(parents=True)
    (bindir / "crew").write_text("#!/bin/sh\necho CrewAI\n")    # someone else's `crew`
    (bindir / "crew").chmod(0o755)


class Uninstall(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()

    def tearDown(self):
        self.sb.close()

    def test_fresh_home_purge_leaves_nothing(self):
        before = self.sb.snapshot()
        self.sb.install()
        self.assertTrue((self.sb.app / "mods" / "crew-roster").is_dir())
        self.assertTrue((self.sb.home / ".local" / "bin" / "pal").is_file())
        self.assertIn("crew-hook", (self.sb.home / ".claude" / "settings.json").read_text())
        self.sb.uninstall("--purge")
        self.assertEqual(self.sb.snapshot(), before)

    def test_own_config_comes_back_byte_identical(self):
        user_config(self.sb)
        before = self.sb.snapshot()
        self.sb.install()
        keys = json.loads((self.sb.app / "keys.json").read_text())
        self.assertEqual(keys["global"].get("ctrl-shift-h"), "crew-roster.home")   # the install did change it
        self.sb.uninstall("--purge")
        after = self.sb.snapshot()
        self.assertEqual(after, before, {k: (before.get(k), after.get(k)) for k in set(before) | set(after) if before.get(k) != after.get(k)})
        self.assertEqual((self.sb.home / ".local" / "bin" / "crew").read_text(), "#!/bin/sh\necho CrewAI\n")

    def test_a_second_install_doesnt_make_its_files_the_persons(self):
        user_config(self.sb)
        before = self.sb.snapshot()
        self.sb.install()
        self.sb.install()
        # The second install links the shared pal-desk skill into each harness (the first copies it in).
        for root in (".claude/skills", ".codex/skills"):
            self.assertEqual(os.readlink(self.sb.home / root / "pal-desk"), str(self.sb.app / "data" / "crew-skills" / "pal-desk"))
        self.sb.uninstall("--purge")
        self.assertEqual(self.sb.snapshot(), before)

    def test_without_purge_only_pal_data_stays(self):
        user_config(self.sb)
        before = self.sb.snapshot()
        self.sb.install()
        out = self.sb.uninstall().stdout
        self.assertIn("kept your pals' data", out)
        after = self.sb.snapshot()
        changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
        stray = [k for k in changed if not (k.startswith(".config/herdr-app/data/crew-") or k.startswith(".config/herdr-app/data")
                                            or k.startswith(".config/herdr-app/.crew-backups"))]
        self.assertEqual(stray, [])
        data = self.sb.app / "data"
        self.assertTrue((data / "crew-settings.json").is_file())          # pals' settings stay
        self.assertTrue((data / "crew-desk").is_dir())                    # and the Desk
        for gone in ("crew-install.json", "crew-footprint.json", "crew-originals"):
            self.assertFalse((data / gone).exists(), gone)

    def test_the_persons_later_edits_stay(self):
        user_config(self.sb)
        self.sb.install()
        sp = self.sb.home / ".claude" / "settings.json"
        st = json.loads(sp.read_text())
        st["theme"] = "dark"                                              # edited after the install
        sp.write_text(json.dumps(st, indent=2))
        self.sb.uninstall()
        st = json.loads(sp.read_text())
        self.assertEqual(st["theme"], "dark")
        self.assertNotIn("crew-hook", json.dumps(st))
        self.assertEqual(st["statusLine"], {"type": "command", "command": "my-status --café", "padding": 0})
        self.assertEqual(st["hooks"], {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "my-guard"}]}]})
        backups = list((self.sb.app / ".crew-backups").glob("uninstall-*/claude-settings.json"))
        self.assertEqual(len(backups), 1)

    def test_dry_run_changes_nothing(self):
        user_config(self.sb)
        self.sb.install()
        before = self.sb.snapshot()
        out = self.sb.uninstall("--dry-run").stdout
        self.assertIn("would: remove", out)
        self.assertIn("Nothing was changed", out)
        self.assertEqual(self.sb.snapshot(), before)

    def test_switches_herdr_off_the_pals_layout(self):
        self.sb.install()
        self.sb.uninstall(FAKE_LAYOUT="pals")
        self.assertIn('layout.switch {"name": "main"}', (self.sb.home / "herdr-do.log").read_text())

    def test_an_older_install_without_a_record_still_comes_out(self):
        """Installed before uninstall existed: no footprint, no originals. Project Pals' entries still
        come out of the config files; only a file it made stays (it can't know)."""
        user_config(self.sb)
        self.sb.install()
        shutil.rmtree(self.sb.app / "data" / "crew-originals")
        (self.sb.app / "data" / "crew-footprint.json").unlink()
        self.sb.uninstall("--purge")
        st = json.loads((self.sb.home / ".claude" / "settings.json").read_text())
        self.assertNotIn("crew", json.dumps(st))
        self.assertEqual(st["statusLine"]["command"], "my-status --café")
        keys = json.loads((self.sb.app / "keys.json").read_text())
        self.assertEqual(keys, {"global": {"ctrl-shift-t": "tab.new"}, "terminal": {"ctrl-shift-c": "terminal.copy"}})
        self.assertNotIn("project-pals", json.loads((self.sb.home / ".gemini" / "config" / "hooks.json").read_text()))
        self.assertFalse((self.sb.app / "mods" / "crew-roster").exists())
        self.assertFalse((self.sb.home / ".local" / "lib" / "herdr-crew").exists())
        self.assertFalse((self.sb.home / ".local" / "bin" / "pal").exists())

    def test_keeps_worktrees_on_purge(self):
        self.sb.install()
        wt = self.sb.app / "data" / "crew-worktrees" / "proj" / "topic"
        wt.mkdir(parents=True)
        (wt / "work.txt").write_text("uncommitted")
        out = self.sb.uninstall("--purge").stdout
        self.assertTrue((wt / "work.txt").is_file())
        self.assertIn("git worktree remove", out)

    def test_pal_uninstall_needs_the_owners_click(self):
        user_config(self.sb)
        self.sb.install()
        before = self.sb.snapshot()
        pal = str(self.sb.home / ".local" / "bin" / "pal")
        r = self.sb.run(pal, "uninstall", check=False)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("About → Uninstall", r.stdout + r.stderr)
        after = self.sb.snapshot(skip=(".config/herdr-app/data/crew-update.log",))
        self.assertEqual(after, {k: v for k, v in before.items() if k != ".config/herdr-app/data/crew-update.log"})
        # --dry-run is anyone's: it changes nothing.
        self.assertIn("Nothing was changed", self.sb.run(pal, "uninstall", "--dry-run").stdout)
        # With the app's one-time click token for exactly this command line, it goes.
        clicks = self.sb.app / "data" / "crew-clicks"
        clicks.mkdir(exist_ok=True)
        nonce = "ab" * 16
        (clicks / f"{nonce}.json").write_text(json.dumps({"args": ["uninstall", "--json"], "at": int(time.time() * 1000)}))
        out = json.loads(self.sb.run(pal, "uninstall", "--json", "--click", nonce).stdout)
        self.assertTrue(out["ok"])
        self.assertFalse((self.sb.home / ".local" / "bin" / "pal").exists())
        self.assertFalse((self.sb.app / "mods" / "crew-roster").exists())


if __name__ == "__main__":
    unittest.main()
