"""Uninstall (T48): install into a throwaway HOME, uninstall, and the HOME is as it was, byte for byte.

Every run uses its own HOME with fake herdr-app, hc and systemctl first on PATH, so nothing reaches
the live Herdr, core or systemd session (AGENTS.md "Testing")."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

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
        self.base = Path(pals_tmp.mkdtemp(prefix="pals-uninstall-"))
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

    def run(self, *args, check=True, input=None, **extra):
        # A new session: no controlling terminal, so uninstall's typed confirmation can never wait on
        # the terminal running the tests (the release preflight runs them in one).
        r = subprocess.run(list(args), cwd=ROOT, env=self.env(**extra), capture_output=True, text=True, timeout=300,
                           start_new_session=True, input=input)
        if check and r.returncode != 0:
            raise AssertionError(f"{args} failed ({r.returncode}):\n{r.stdout}\n{r.stderr}")
        return r

    def install(self, *flags, **extra):
        return self.run("bash", "install.sh", *flags, **extra)

    def click(self, args):
        """The app's one-time click token for exactly `args` (what About writes before pal uninstall)."""
        clicks = self.app / "data" / "crew-clicks"
        clicks.mkdir(parents=True, exist_ok=True)
        nonce = hashlib.sha256(f"{time.time()}{args}{os.urandom(8)}".encode()).hexdigest()[:32]
        (clicks / f"{nonce}.json").write_text(json.dumps({"args": list(args), "at": int(time.time() * 1000)}))
        return nonce

    def uninstall(self, *flags, check=True, **extra):
        """The owner's uninstall: the same code ./install.sh --uninstall runs, with a click token."""
        flags = list(flags)
        args = ["uninstall", *flags]
        extra_args = [] if "--dry-run" in flags else ["--click", self.click(args)]
        return self.run(sys.executable, "bin/crewuninstall.py", *args, *extra_args, check=check, **extra)

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

    def test_an_install_over_an_install_keeps_a_helpers_switch_and_key_and_says_where_it_stands(self):
        """T170: only the owner's click turns a helper on or off. A reinstall (how every local update
        lands) leaves the list and the key byte for byte, and its last lines say the helper works; after
        an uninstall the key is gone (on purpose), and the next install says that too, out loud."""
        self.sb.install()
        pal = str(self.sb.home / ".local" / "bin" / "pal")
        args = ["settings", "trust-helper", "Pals", "on"]
        self.sb.run(pal, *args, "--click", self.sb.click(args))
        data = self.sb.app / "data" / "crew-helpers"
        key = self.sb.home / ".config" / "project-pals" / "helpers" / "pals.key"
        before = ((data / "helpers.json").read_bytes(), key.read_bytes())
        out = self.sb.install().stdout
        self.assertIn("trusted helper: Pals: on, its key works", out)
        self.assertEqual(((data / "helpers.json").read_bytes(), key.read_bytes()), before)
        self.assertEqual(json.loads((data / "attention.json").read_text()) if (data / "attention.json").exists() else {}, {})
        # Uninstalled (the owner's click) and installed again: the switch still says on, the key is gone, and it's said.
        self.sb.uninstall()
        self.assertFalse(key.exists())
        out = self.sb.install().stdout
        self.assertIn("trusted helper: Pals is on, but its key file is missing", out)
        att = json.loads((data / "attention.json").read_text())
        self.assertEqual((att["Pals"]["reason"], att["Pals"]["fix"]), ("no-key", "rotate"))
        self.assertTrue(json.loads((data / "helpers.json").read_text())["helpers"]["Pals"]["on"], "no install switches a helper off")

    def test_an_install_takes_out_the_unreviewed_builds_helper_module(self):
        """Build 7692987 left crewhelper.py (its weak check) in the library folder; the installer only
        copies files in, so it has to name what it retires (as it does crewprompt.py)."""
        self.sb.install()
        lib = self.sb.home / ".local" / "lib" / "herdr-crew"
        (lib / "crewhelper.py").write_text("def authenticate():\n    return True\n")
        self.assertTrue((lib / "crewhelpers.py").is_file())
        self.sb.install()
        self.assertFalse((lib / "crewhelper.py").exists())
        self.assertTrue((lib / "crewhelpers.py").is_file(), "the reviewed module stays")

    def test_trusted_helpers_keys_go_and_only_those(self):
        """T116: a helper's key is a secret Project Pals made after the install; it doesn't outlive it.
        Anything else in that folder is the person's and stays; a link is never followed."""
        self.sb.install()
        keys = self.sb.home / ".config" / "project-pals" / "helpers"
        keys.mkdir(parents=True)
        (keys / "pals.key").write_text("palkey_" + "A" * 43 + "\n")
        (keys / "notes.key").write_text("my own notes\n")
        outside = self.sb.base / "outside.key"
        outside.write_text("palkey_" + "B" * 43 + "\n")
        (keys / "linked.key").symlink_to(outside)
        dry = self.sb.uninstall("--dry-run").stdout
        self.assertIn("pals.key (a trusted helper's key)", dry)
        self.assertTrue((keys / "pals.key").exists(), "a dry run removes nothing")
        self.sb.uninstall()
        self.assertFalse((keys / "pals.key").exists())
        self.assertEqual((keys / "notes.key").read_text(), "my own notes\n")
        self.assertTrue((keys / "linked.key").is_symlink())
        self.assertTrue(outside.exists(), "nothing was deleted through the link")
        # With only keys of ours in it, the folders go too.
        self.sb.install()
        (keys / "notes.key").unlink()
        (keys / "linked.key").unlink()
        (keys / "wabi.key").write_text("palkey_" + "C" * 43 + "\n")
        for d in (keys, keys.parent):   # as crewhelpers leaves them: an ignore file, so searches skip the keys
            (d / ".ignore").write_text("# Project Pals: trusted helpers' keys. Not for searching.\n*\n")
        self.sb.uninstall()
        self.assertFalse((self.sb.home / ".config" / "project-pals").exists())

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


PTY_DRIVER = r"""
import json, os, pty, select, sys, time
argv, env, typed, out_file = json.loads(sys.argv[1])
pid, fd = pty.fork()
if pid == 0:
    os.chdir(env.pop("_CWD"))
    os.execve(argv[0], argv, env)
out, sent, deadline = b"", False, time.time() + 120
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.5)
    if r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        out += chunk
    if not sent and b"Type uninstall" in out:
        os.write(fd, typed.encode() + b"\n")
        sent = True
_, status = os.waitpid(pid, 0)
json.dump({"code": os.waitstatus_to_exitcode(status), "out": out.decode(errors="replace")}, open(out_file + ".tmp", "w"))
os.replace(out_file + ".tmp", out_file)
"""


def uninstall_in_a_pty(sb, typed, argv=None, **extra):
    """./install.sh --uninstall at a real terminal (a pty as its controlling terminal), typing `typed`.
    The driver runs detached (setsid -f: its parent is the user's service manager, not whatever runs
    the tests), so the process tree above the uninstall is a person's terminal's, with no agent in it
    even when a pal runs the suite. `argv` runs something else in the pty (an agent above it, say).
    Returns (exit status, what the terminal showed)."""
    out_file = str(sb.base / f"pty-{time.time_ns()}.json")
    env = {**sb.env(**extra), "_CWD": str(ROOT)}
    argv = argv or ["/bin/bash", "install.sh", "--uninstall"]
    subprocess.run(["setsid", "-f", sys.executable, "-c", PTY_DRIVER, json.dumps([argv, env, typed, out_file])],
                   env={"PATH": "/usr/bin:/bin"}, check=True)
    deadline = time.time() + 150
    while not os.path.exists(out_file) and time.time() < deadline:
        time.sleep(0.2)
    res = json.load(open(out_file))
    return res["code"], res["out"]


class OnlyTheOwner(unittest.TestCase):
    """Grok T56 H1: every way into uninstall is held by the module itself, not only pal's CLI."""
    def setUp(self):
        self.sb = Sandbox()
        user_config(self.sb)
        self.sb.install()
        self.before = self.sb.snapshot()

    def tearDown(self):
        self.sb.close()

    def unchanged(self):
        # (crew-clicks: the tokens the test wrote; a refused one is used up, the folder stays)
        skip = lambda d: {k: v for k, v in d.items() if "crew-clicks" not in k}
        self.assertEqual(skip(self.sb.snapshot()), skip(self.before))

    def test_install_sh_without_a_click_or_a_terminal(self):
        for flags in ([], ["--purge"]):
            r = self.sb.run("bash", "install.sh", "--uninstall", *flags, check=False)
            self.assertEqual(r.returncode, 3, r.stdout + r.stderr)
            self.assertIn("About → Uninstall", r.stderr)
        r = self.sb.run("bash", "-c", "./install.sh --uninstall # --dry-run", check=False)
        self.assertEqual(r.returncode, 3)
        self.unchanged()

    def test_an_import_without_a_click(self):
        code = ("import sys; sys.path.insert(0, 'bin'); import crewuninstall as u\n"
                "try:\n    u.uninstall(purge=True)\nexcept u.NotAllowed:\n    print('refused')\n")
        self.assertEqual(self.sb.run(sys.executable, "-c", code).stdout.strip(), "refused")
        r = self.sb.run(sys.executable, "-c", "import sys; sys.path.insert(0, 'bin'); import crewuninstall as u; u.main(['uninstall', '--purge'])",
                        check=False)
        self.assertEqual(r.stdout + r.stderr, "not uninstalled: " + r.stderr.split("not uninstalled: ", 1)[-1])
        self.unchanged()

    def test_a_click_for_something_else_or_used_twice(self):
        tok = self.sb.click(["uninstall"])                      # minted for a plain uninstall…
        r = self.sb.run(sys.executable, "bin/crewuninstall.py", "uninstall", "--purge", "--click", tok, check=False)
        self.assertEqual(r.returncode, 3)                         # …is no good for --purge
        r = self.sb.run(sys.executable, "bin/crewuninstall.py", "uninstall", "--click", tok, check=False)
        self.assertEqual(r.returncode, 3)                         # and it's used up
        self.assertIn("expired or was for something else", r.stderr)
        self.unchanged()

    def test_dry_run_needs_nothing(self):
        r = self.sb.run("bash", "install.sh", "--uninstall", "--dry-run")
        self.assertIn("would: remove", r.stdout)
        self.unchanged()

    def test_the_owner_typing_at_their_terminal(self):
        code, out = uninstall_in_a_pty(self.sb, "no")
        self.assertEqual(code, 3, out)
        self.unchanged()
        code, out = uninstall_in_a_pty(self.sb, "uninstall")
        self.assertEqual(code, 0, out)
        self.assertFalse((self.sb.app / "mods" / "crew-roster").exists())

    def test_not_under_a_pal_in_a_pty_it_made(self):
        """Grok's re-check: expect / script / a pty give the uninstall a terminal, with HC_TERMINAL_ID
        dropped. An agent above it in the process tree still refuses it."""
        agent = self.sb.base / "fake-agent" / "claude"                    # a process named claude
        agent.parent.mkdir()
        agent.symlink_to(sys.executable)
        run = "import subprocess, sys; sys.exit(subprocess.call(['bash', 'install.sh', '--uninstall']))"
        code, out = uninstall_in_a_pty(self.sb, "uninstall", argv=[str(agent), "-c", run])
        self.assertEqual(code, 3, out)
        self.assertNotIn("Type uninstall", out)
        self.assertIn("runs under claude", out)
        # The terminal's id is still in an ancestor's environment after `env -u HC_TERMINAL_ID`.
        (self.sb.shims / "hc").write_text('#!/bin/sh\n[ "$1" = get ] && { echo \'{"status": {"app": "codex", "state": "working"}}\'; exit 0; }\n'
                                         + FAKE_HC.split("\n", 1)[1])
        code, out = uninstall_in_a_pty(self.sb, "uninstall", HC_TERMINAL_ID="t9",
                                       argv=["/bin/bash", "-c", "env -u HC_TERMINAL_ID bash install.sh --uninstall; exit $?"])
        self.assertEqual(code, 3, out)
        self.assertIn("terminal t9", out)
        self.unchanged()
        if shutil.which("expect"):                                        # Grok's own repro
            code, out = uninstall_in_a_pty(self.sb, "", argv=[shutil.which("expect"), "-c",
                "spawn bash install.sh --uninstall; expect \"Type uninstall\" { send \"uninstall\\r\" }; expect eof; catch wait r; exit [lindex $r 3]"],
                HC_TERMINAL_ID="t9")
            self.assertTrue((self.sb.app / "mods" / "crew-roster").exists(), out)

    def test_purge_says_what_it_deletes(self):
        code, out = uninstall_in_a_pty(self.sb, "no", argv=["/bin/bash", "install.sh", "--uninstall", "--purge"])
        self.assertEqual(code, 3, out)
        self.assertIn("--purge also deletes your pals' data", out)
        self.assertIn("crew-desk", out)
        self.assertIn(".crew-backups", out)
        self.unchanged()

    def test_not_at_an_agents_terminal(self):
        # herdr-core reports an agent status for the terminal this runs in: typing doesn't count.
        (self.sb.shims / "hc").write_text('#!/bin/sh\n[ "$1" = get ] && { echo \'{"status": {"app": "claude-code", "state": "working"}}\'; exit 0; }\n'
                                         + FAKE_HC.split("\n", 1)[1])
        code, out = uninstall_in_a_pty(self.sb, "uninstall", HC_TERMINAL_ID="t9")
        self.assertEqual(code, 3, out)
        self.assertNotIn("Type uninstall", out)
        self.unchanged()


class NoLinksFollowed(unittest.TestCase):
    """Grok T56 H2: nothing is deleted or written through a symlink."""
    def setUp(self):
        self.sb = Sandbox()
        self.elsewhere = self.sb.base / "elsewhere"
        self.elsewhere.mkdir()

    def tearDown(self):
        self.sb.close()

    def test_a_linked_parent_isnt_followed(self):
        """Grok's repro: ~/.local/lib is a link to a folder that holds herdr-crew/secret.txt."""
        self.sb.install()
        lib = self.sb.home / ".local" / "lib"
        shutil.rmtree(lib)
        (self.elsewhere / "herdr-crew").mkdir()
        (self.elsewhere / "herdr-crew" / "secret.txt").write_text("not Project Pals'")
        (self.elsewhere / "herdr-crew" / "crewlib.py").write_text("# looks like ours\n")
        lib.symlink_to(self.elsewhere)
        out = json.loads(self.sb.uninstall("--purge", "--json").stdout)
        self.assertEqual((self.elsewhere / "herdr-crew" / "secret.txt").read_text(), "not Project Pals'")
        self.assertNotIn(str(lib / "herdr-crew"), out["removed"])
        self.assertTrue(any(str(lib) in n and "is a link" in n for n in out["notes"]), out["notes"])
        self.assertFalse((self.sb.app / "mods" / "crew-roster").exists())   # the rest still went

    def test_linked_mods_claude_and_data_folders(self):
        self.sb.install()
        for linked in (self.sb.app / "mods", self.sb.home / ".claude", self.sb.app / "data"):
            moved = self.elsewhere / linked.name
            shutil.move(str(linked), moved)
            linked.symlink_to(moved)
        before = tree(self.elsewhere)
        out = json.loads(self.sb.uninstall("--purge", "--json").stdout)
        # (data/crew-clicks: the click token the test itself wrote, used up)
        self.assertEqual({k: v for k, v in tree(self.elsewhere).items() if "crew-clicks" not in k}, before)
        self.assertTrue((self.elsewhere / "mods" / "crew-roster" / "main.js").is_file())
        for n in ("mods", ".claude", "data"):
            self.assertTrue(any(f"/{n} is a link" in x for x in out["notes"]), (n, out["notes"]))

    def test_a_linked_app_home_or_config_isnt_followed(self):
        """Grok's re-check: HERDR_APP_HOME a link, or ~/.config a link above it."""
        self.sb.install()
        real = self.elsewhere / "herdr-app"
        shutil.move(str(self.sb.app), real)
        link = self.sb.base / "app-link"
        link.symlink_to(real)
        tok_dir = real / "data" / "crew-clicks"   # (the token is read through the link; deletes aren't)
        tok_dir.mkdir(exist_ok=True)
        nonce = "cd" * 16
        (tok_dir / f"{nonce}.json").write_text(json.dumps({"args": ["uninstall", "--json"], "at": int(time.time() * 1000)}))
        out = json.loads(self.sb.run(sys.executable, "bin/crewuninstall.py", "uninstall", "--json", "--click", nonce,
                                     HERDR_APP_HOME=str(link)).stdout)
        self.assertTrue((real / "mods" / "crew-roster" / "crew.js").is_file())
        self.assertTrue((real / "layouts" / "pals.json").is_file())
        self.assertTrue(any("Herdr's home" in n and "is a link" in n for n in out["notes"]), out["notes"])
        # ~/.config itself a link, Herdr's home the usual one inside it.
        shutil.move(str(real), self.sb.home / ".config" / "herdr-app")
        cfg = self.elsewhere / "config"
        shutil.move(str(self.sb.home / ".config"), cfg)
        (self.sb.home / ".config").symlink_to(cfg)
        out = json.loads(self.sb.uninstall("--json").stdout)
        self.assertTrue((cfg / "herdr-app" / "mods" / "crew-roster" / "crew.js").is_file())
        self.assertTrue(any("above Herdr's home, is a link" in n for n in out["notes"]), out["notes"])

    def test_a_linked_settings_file_is_left_alone(self):
        user_config(self.sb)
        real = self.elsewhere / "settings.json"
        shutil.move(str(self.sb.home / ".claude" / "settings.json"), real)
        (self.sb.home / ".claude" / "settings.json").symlink_to(real)
        original = real.read_bytes()
        out = self.sb.install().stdout
        self.assertIn("settings.json: it's a link", out)              # install leaves it be…
        self.assertTrue((self.sb.home / ".claude" / "settings.json").is_symlink())
        self.assertEqual(real.read_bytes(), original)
        # …and when it holds Project Pals' hooks anyway (an older install wrote them), uninstall
        # doesn't write through it either: it says so.
        st = json.loads(original)
        st["hooks"]["Stop"] = [{"hooks": [{"type": "command", "command": f"{self.sb.home}/.local/bin/crew-hook-fast stop"}]}]
        real.write_text(json.dumps(st))
        with_ours = real.read_bytes()
        out = json.loads(self.sb.uninstall("--json").stdout)
        self.assertTrue((self.sb.home / ".claude" / "settings.json").is_symlink())
        self.assertEqual(real.read_bytes(), with_ours)
        self.assertTrue(any("settings.json" in n and "it's a link" in n for n in out["notes"]), out["notes"])

    def test_only_what_the_manifest_lists(self):
        self.sb.install()
        fp = json.loads((self.sb.app / "data" / "crew-footprint.json").read_text())
        self.assertIn(str(self.sb.app / "mods" / "crew-roster"), fp["installed"])
        self.assertIn(str(self.sb.home / ".local" / "lib" / "herdr-crew"), fp["installed"])
        # A mod folder that looks like Project Pals' but this install never placed it.
        shutil.copytree(self.sb.app / "mods" / "crew-roster", self.sb.app / "mods" / "crew-extra")
        self.sb.uninstall()
        self.assertTrue((self.sb.app / "mods" / "crew-extra" / "crew.js").is_file())
        self.assertFalse((self.sb.app / "mods" / "crew-roster").exists())


class Lows(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()

    def tearDown(self):
        self.sb.close()

    def test_only_our_exact_hook_commands_go(self):
        user_config(self.sb)
        sp = self.sb.home / ".claude" / "settings.json"
        st = json.loads(sp.read_text())
        mine = [{"type": "command", "command": "my-crew-hook-wrapper --check"},
                {"type": "command", "command": f"{self.sb.home}/.local/bin/crew-hook pre-tool-use; notify-send done"}]
        st["hooks"]["Stop"] = [{"hooks": mine}]
        sp.write_text(json.dumps(st))
        self.sb.install()
        self.sb.uninstall()
        after = json.loads(sp.read_text())
        self.assertEqual(after["hooks"]["Stop"], [{"hooks": mine}])
        self.assertNotIn("crew-hook-fast", json.dumps(after))

    def test_a_retired_name_without_our_crew_js_stays(self):
        self.sb.install()
        for name in ("crew-chat", "crew-mine"):
            d = self.sb.app / "mods" / name
            d.mkdir()
            (d / "main.js").write_text("// my own mod\n")
        (self.sb.app / "mods" / "crew-tell").mkdir()                      # retired, our crew.js, not in the manifest
        shutil.copy(self.sb.app / "mods" / "crew-roster" / "crew.js", self.sb.app / "mods" / "crew-tell" / "crew.js")
        self.sb.uninstall()
        self.assertTrue((self.sb.app / "mods" / "crew-chat" / "main.js").is_file())
        self.assertTrue((self.sb.app / "mods" / "crew-mine" / "main.js").is_file())
        # Grok's re-check: marker AND manifest. This install never placed crew-tell, so it stays.
        self.assertTrue((self.sb.app / "mods" / "crew-tell" / "crew.js").is_file())

    def test_without_a_manifest_the_marker_decides(self):
        self.sb.install()
        fp = self.sb.app / "data" / "crew-footprint.json"
        d = json.loads(fp.read_text())
        d.pop("installed")                                                 # an install from before the manifest
        fp.write_text(json.dumps(d))
        (self.sb.app / "mods" / "crew-tell").mkdir()
        shutil.copy(self.sb.app / "mods" / "crew-roster" / "crew.js", self.sb.app / "mods" / "crew-tell" / "crew.js")
        (self.sb.app / "mods" / "crew-chat").mkdir()
        (self.sb.app / "mods" / "crew-chat" / "main.js").write_text("// my own mod\n")
        self.sb.uninstall()
        self.assertFalse((self.sb.app / "mods" / "crew-tell").exists())
        self.assertTrue((self.sb.app / "mods" / "crew-chat" / "main.js").is_file())

    def test_a_broken_range_check_is_said_out_loud(self):
        src = self.sb.base / "src"
        shutil.copytree(ROOT, src, ignore=shutil.ignore_patterns(".git", "__pycache__", "dist"))
        m = json.loads((src / "pals.json").read_text())
        m["herdr"]["app"]["min"] = 5                                       # crashes the check
        (src / "pals.json").write_text(json.dumps(m))
        r = subprocess.run(["bash", "install.sh"], cwd=src, env=self.sb.env(), capture_output=True, text=True,
                           timeout=300, start_new_session=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Traceback", r.stderr)
        self.assertIn("WARNING: couldn't check which Herdr this is", r.stderr)
