"""The owner's go for ./release, wherever it runs (T110).

On 2026-11-10 ./release 0.4.2 ran from a plain shell and nothing asked the owner: the approval gate
is a hook in pals' terminals. Now the script asks itself (`pal owner-step release-script -- <line>`):
a request in the Inbox, the owner's click, then exactly that line once. --dry-run is free.

Throwaway CREW_DATA, homes and repos with fake hc / herdr-app / gh / pal, as the Desk tests:
python3 -m unittest discover -s tests
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, owner, py, OWNER  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
LINE = ["./release", "9.9.9", "what", "changed"]


def requests(data):
    d = data / "crew-approvals"
    return sorted((json.loads(f.read_text()) for f in d.glob("*.json")), key=lambda r: r["at"]) if d.exists() else []


class OwnerStep(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def step(self, *line, term=None, rule="release-script"):
        return pal(self.env, "owner-step", rule, "--", *(line or LINE), term=term)

    def test_a_plain_shell_is_held_until_the_owners_click_then_goes_once(self):
        r = self.step()
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertIn(f"held for {OWNER}", r.stderr)
        reqs = requests(self.data)
        self.assertEqual(len(reqs), 1)
        a = reqs[0]
        self.assertEqual((a["status"], a["rule"], a["terminal"], a["bot"], a["command"]),
                         ("pending", "release-script", "shell", "a shell on this computer", " ".join(LINE)))
        self.assertIn(a["id"], r.stderr)
        # Asking again doesn't pile up requests; it's the same one, still waiting.
        self.assertEqual(self.step().returncode, 3)
        self.assertEqual(len(requests(self.data)), 1)
        # A shell can't approve it, with or without a made-up token; a pal can't either.
        self.assertNotEqual(pal(self.env, "approve", a["id"]).returncode, 0)
        self.assertNotEqual(pal(self.env, "approve", a["id"], "--click", "ab" * 16).returncode, 0)
        self.assertNotEqual(pal(self.env, "approve", a["id"], term="tW").returncode, 0)
        self.assertEqual(self.step().returncode, 3)
        # The owner's click: exactly that line goes through, once.
        ok = owner(self.env, self.data, "approve", a["id"], "--inbox")
        self.assertEqual(ok.returncode, 0, ok.stderr)
        self.assertFalse((self.data / "crew-queue" / "shell").exists(), "nobody to type the news to")
        self.assertEqual(self.step().returncode, 0)
        self.assertEqual(requests(self.data)[0]["status"], "used")
        self.assertEqual(self.step().returncode, 3, "the second run asks again")
        self.assertEqual(len(requests(self.data)), 2)

    def test_another_line_isnt_the_approved_one(self):
        self.step()
        a = requests(self.data)[0]
        self.assertEqual(owner(self.env, self.data, "approve", a["id"], "--inbox").returncode, 0)
        self.assertEqual(self.step("./release", "9.9.10", "what", "changed").returncode, 3)
        self.assertEqual(self.step("./release", "9.9.9", "other", "notes").returncode, 3)
        self.assertEqual(self.step().returncode, 0, "the approved line still goes")

    def test_a_declined_or_stale_approval_doesnt_go(self):
        self.step()
        a = requests(self.data)[0]
        self.assertEqual(owner(self.env, self.data, "deny", a["id"], "--inbox").returncode, 0)
        self.assertEqual(self.step().returncode, 3)
        b = [x for x in requests(self.data) if x["status"] == "pending"][0]
        self.assertEqual(owner(self.env, self.data, "approve", b["id"], "--inbox").returncode, 0)
        f = self.data / "crew-approvals" / f"{b['id']}.json"
        rec = json.loads(f.read_text())
        rec["decided"] -= 31 * 60 * 1000   # approved 31 minutes ago and never used
        f.write_text(json.dumps(rec))
        self.assertEqual(self.step().returncode, 3, "an old yes can't be cashed in")
        self.assertEqual(json.loads(f.read_text())["status"], "expired")

    def test_a_pal_the_gate_already_asked_about_isnt_asked_twice(self):
        # No approval of its own: a pal's terminal is held like anyone.
        r = self.step(term="tW")
        self.assertEqual(r.returncode, 3)
        a = requests(self.data)[0]
        self.assertEqual((a["terminal"], a["bot"], a["channel"]), ("tW", "Worker", "general"))
        # The hook held the pal's command, the owner approved, and it just went through there.
        d = self.data / "crew-approvals"
        (d / "a-gate01.json").write_text(json.dumps({"id": "a-gate01", "key": "k", "at": int(time.time() * 1000), "terminal": "tH", "bot": "Helper",
                                                    "channel": "build", "command": "cd x && ./release 9.9.9 notes", "rule": "release-script",
                                                    "status": "used", "used": int(time.time() * 1000)}))
        self.assertEqual(self.step(term="tH").returncode, 0)
        self.assertEqual(self.step(term="tD").returncode, 3, "another terminal's approval isn't this one's")
        # … but not long after, and not for another rule.
        rec = json.loads((d / "a-gate01.json").read_text())
        rec["used"] -= 10 * 60 * 1000
        (d / "a-gate01.json").write_text(json.dumps(rec))
        self.assertEqual(self.step(term="tH").returncode, 3)

    def test_refusals(self):
        self.assertEqual(self.step(rule="no-such-rule").returncode, 1)
        self.assertEqual(pal(self.env, "owner-step", "release-script").returncode, 1)
        self.assertEqual(pal(self.env, "owner-step", "release-script", "--", " ").returncode, 1)
        self.assertEqual(requests(self.data), [])
        r = pal(self.env, "owner-step", "--probe")
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "owner-step 1"))


STUBS = {
    "pals.json": '{"repo": "someone/thing"}\n', "VERSION": "0.0.1\n", "install.sh": "#!/usr/bin/env bash\ntrue\n",
    "layouts/pals.json": "{}\n", "bin/crew": "print(1)\n", "bin/crew-room": "print(1)\n", "bin/crewd": "print(1)\n",
    "bin/crew-hook": "print(1)\n", "bin/crew-mcp": "print(1)\n", "bin/crewlib.py": "X = 1\n", "bin/crew-hook-fast": "#!/bin/sh\ntrue\n",
    "install-hooks.py": "X = 1\n", "mods/crew-x/mod.json": "{}\n", "mods/crew-x/main.js": "export default 1;\n", "lib/crew.js": "export const a = 1;\n",
    "tests/test_one.py": "import unittest\n\n\nclass T(unittest.TestCase):\n    def test_one(self):\n        self.assertTrue(True)\n",
}


class ReleaseScript(unittest.TestCase):
    """The real ./release in a small repo of its own: what it does before it has the owner's go."""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="pals-release-"))
        self.repo, self.shims, self.log = self.root / "repo", self.root / "shims", self.root / "pal.log"
        self.shims.mkdir()
        for name, text in STUBS.items():
            f = self.repo / name
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(text)
        shutil.copy(REPO / "release", self.repo / "release")
        (self.shims / "gh").write_text("#!/bin/sh\nexit 0\n")
        (self.shims / "gh").chmod(0o755)
        self.env = {"HOME": str(self.root / "home"), "PATH": f"{self.shims}:/usr/bin:/bin", "LANG": "C.UTF-8",
                    "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null", "PAL_LOG": str(self.log)}
        (self.root / "home").mkdir()
        for args in (["init", "-q", "-b", "main"], ["add", "-A"],
                     ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "start"]):
            subprocess.run(["git", *args], cwd=self.repo, env=self.env, check=True, capture_output=True)
        self.head = self.git("rev-parse", "HEAD")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, env=self.env, capture_output=True, text=True).stdout.strip()

    def fake_pal(self, step_exit, probe_exit=0):
        f = self.shims / "pal"
        f.write_text("#!/bin/sh\n"
                     f'if [ "$2" = --probe ]; then exit {probe_exit}; fi\n'
                     'printf \'%s\\n\' "$*" >> "$PAL_LOG"\n'
                     f"exit {step_exit}\n")
        f.chmod(0o755)

    def release(self, *args):
        # A session of its own: no terminal to type at, as from an app or a script.
        return subprocess.run(["bash", str(self.repo / "release"), *args], cwd=self.root, env=self.env, capture_output=True, text=True,
                              stdin=subprocess.DEVNULL, start_new_session=True, timeout=120)

    def untouched(self):
        self.assertEqual((self.repo / "VERSION").read_text(), "0.0.1\n")
        self.assertEqual(self.git("rev-parse", "HEAD"), self.head, "no release commit")
        self.assertEqual(self.git("tag", "-l"), "", "no tag")
        self.assertFalse((self.repo / "dist").exists(), "no tarball")

    def test_held_until_the_owner_approves_exactly_this_line(self):
        self.fake_pal(3)
        r = self.release("9.9.9", "what changed")
        self.assertEqual(r.returncode, 3, r.stderr)
        self.untouched()
        self.assertEqual(self.log.read_text().strip(), "owner-step release-script -- ./release 9.9.9 what changed")

    def test_with_the_owners_go_it_carries_on_to_the_checks(self):
        self.fake_pal(0)
        (self.repo / "layouts" / "pals.json").write_text("{ broken")
        subprocess.run(["git", "-c", "user.name=T", "-c", "user.email=t@example.invalid", "commit", "-qam", "break a check"],
                       cwd=self.repo, env=self.env, check=True, capture_output=True)
        self.head = self.git("rev-parse", "HEAD")
        r = self.release("9.9.9", "what changed")
        self.assertEqual(r.returncode, 2, r.stderr)
        self.assertIn("bad JSON in layouts/pals.json", r.stderr)   # past the owner's go, stopped by the preflight
        self.assertTrue(self.log.exists())
        self.untouched()

    def test_no_project_pals_and_nobody_at_a_keyboard_is_refused(self):
        r = self.release("9.9.9", "what changed")   # no pal on PATH, no terminal
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertIn("needs the owner's go", r.stderr)
        self.untouched()
        # An older pal that doesn't know owner-step is no go either.
        self.fake_pal(0, probe_exit=1)
        r = self.release("9.9.9", "what changed")
        self.assertEqual(r.returncode, 3, r.stderr)
        self.assertFalse(self.log.exists(), "the old pal wasn't asked to decide")
        self.untouched()

    def test_dry_run_checks_everything_asks_nobody_and_changes_nothing(self):
        self.fake_pal(3)
        for args in (["9.9.9", "--dry-run"], ["--dry-run", "9.9.9", "what changed"]):
            r = self.release(*args)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("dry run: every check passed for 9.9.9", r.stdout)
            self.assertFalse(self.log.exists(), "a dry run needs nobody's go")
            self.untouched()
        self.assertEqual(self.git("status", "--porcelain", "--untracked-files=no"), "")
        # A dry run still fails on a failing check.
        (self.repo / "tests" / "test_one.py").write_text(STUBS["tests/test_one.py"].replace("assertTrue(True)", "assertTrue(False)"))
        subprocess.run(["git", "-c", "user.name=T", "-c", "user.email=t@example.invalid", "commit", "-qam", "a failing test"],
                       cwd=self.repo, env=self.env, check=True, capture_output=True)
        r = self.release("9.9.9", "--dry-run")
        self.assertEqual(r.returncode, 2)
        self.assertIn("tests failed", r.stderr)

    def test_usage_still_comes_first(self):
        self.fake_pal(0)
        self.assertEqual(self.release("nine").returncode, 2)
        self.assertEqual(self.release("9.9.9").returncode, 2, "a real release says what changed")
        self.assertEqual(self.release("0.0.0", "older").returncode, 2)
        self.assertFalse(self.log.exists(), "nobody is asked about a release that can't go")


if __name__ == "__main__":
    unittest.main()
