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
import time
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

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
        # As the hook records it since T205: the folder it ran in and its rules. The pal command here
        # runs where this test runs, so the approved line runs ./release there too (via cd).
        here = os.getcwd()
        def gate(rid, command, used_ago=0):
            (d / f"{rid}.json").write_text(json.dumps({"id": rid, "key": rid, "at": int(time.time() * 1000), "terminal": "tH", "bot": "Helper",
                                                       "channel": "build", "command": command, "rule": "release-script",
                                                       "status": "used", "used": int(time.time() * 1000) - used_ago,
                                                       "guard_context": {"cwd": os.path.dirname(here), "rules": ["release-script"]}}))
        gate("a-gate01", f'cd {os.path.basename(here)} && ./release 9.9.9 "what changed"')
        self.assertEqual(self.step(term="tD").returncode, 3, "another terminal's approval isn't this one's")
        self.assertEqual(self.step(term="tH").returncode, 0)
        # Once (T206: it was good for any release from that terminal for two minutes).
        self.assertEqual(self.step(term="tH").returncode, 3, "the gate's approval is used up by the run it let through")
        # Only for the line the owner approved there, not another version or other notes.
        gate("a-gate02", f"cd {os.path.basename(here)} && ./release 9.9.9 notes")
        self.assertEqual(self.step(term="tH").returncode, 3)
        self.assertEqual(self.step("./release", "9.9.10", "what", "changed", term="tH").returncode, 3)
        # … and not long after.
        gate("a-gate03", f'cd {os.path.basename(here)} && ./release 9.9.9 "what changed"', used_ago=10 * 60 * 1000)
        self.assertEqual(self.step(term="tH").returncode, 3)

    def test_the_owners_approval_is_one_run_of_one_line(self):
        """T206 (#codex-sol, repro-t199-owner-step): after one approved run, a pal's terminal released
        other versions with other notes for two minutes, on the strength of that one approval."""
        self.assertEqual(self.step(term="tW").returncode, 3)
        a = requests(self.data)[0]
        self.assertEqual(owner(self.env, self.data, "approve", a["id"], "--inbox").returncode, 0)
        self.assertEqual(self.step(term="tW").returncode, 0)
        for version in ("9.9.10", "9.9.11"):
            self.assertEqual(self.step("./release", version, "different", "notes", term="tW").returncode, 3, version)
        self.assertEqual(self.step(term="tW").returncode, 3, "nor the same line again")
        self.assertEqual([r["status"] for r in requests(self.data)], ["used", "pending", "pending", "pending"])

    def test_t215_a_hand_over_is_claimed_only_where_it_was_approved(self):
        """T215 / T212: the hook approved `./release 9.9.9 notes` run in repo A; the same words asked
        from repo B claimed it (cwd wasn't part of the hand-over). And the program has to be where
        the approved line ran it, cd included."""
        a, b = self.root / "repo-a", self.root / "repo-b"
        (a / "sub").mkdir(parents=True)
        b.mkdir()
        bin_ = str(REPO / "bin")
        def run(code):
            r = subprocess.run([sys.executable, "-c", "import sys, json, os\nsys.path.insert(0, %r)\nimport crewguard\n" % bin_ + code],
                               env=self.env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            return json.loads(r.stdout.strip().splitlines()[-1])
        def approve(line, hook_cwd):
            return run(f"""crewguard.HOOK_CWD = {hook_cwd!r}
r = crewguard.check('tW', 'Worker', 'general', {line!r})
crewguard.decide(r['id'], True, via='test')
print(json.dumps(crewguard.check('tW', 'Worker', 'general', {line!r}) is None))""")
        def step(where):
            return run(f"""os.chdir({where!r})
print(json.dumps(crewguard.owner_step('tW', 'Worker', 'general', './release 9.9.9 notes', 'release-script') is None))""")
        self.assertTrue(approve("./release 9.9.9 notes", str(a)))
        self.assertFalse(step(str(b)), "another folder's release isn't the approved one")
        self.assertTrue(step(str(a)), "the folder it was approved in claims it, once")
        self.assertFalse(step(str(a)))
        # cd before it: the program runs in the folder the line moved to.
        self.assertTrue(approve("cd sub && ./release 9.9.9 notes", str(a)))
        self.assertFalse(step(str(a)), "the line ran it in sub, not here")
        self.assertTrue(step(str(a / "sub")))
        # Where the hook didn't know the folder, nothing can be claimed.
        self.assertTrue(approve("./release 9.9.9 notes", None))
        self.assertFalse(step(str(a)))

    def test_t212r2_only_plain_cd_before_the_command_moves_the_folder(self):
        """#codex-sol T212 round 2: the hand-over worked out the wrong folder for a cd inside an
        unmatched case, an env-wrapped cd and a quoted tilde, and owner_step claimed once from there.
        Now a folder is accepted only when every segment before the command is a plain `cd <literal
        path>` (no quotes, ~, variables, env, case or other wrapper), joined by ; or &&. Anything else:
        no hand-over, and the approval stays unspent where it was approved."""
        a, b = self.root / "repo-a", self.root / "repo-b"
        (a / "~").mkdir(parents=True)
        b.mkdir()
        bin_ = str(REPO / "bin")
        def run(code):
            r = subprocess.run([sys.executable, "-c", "import sys, json, os\nsys.path.insert(0, %r)\nimport crewguard\n" % bin_ + code],
                               env=self.env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            return json.loads(r.stdout.strip().splitlines()[-1])
        def approve(line):
            return run(f"""crewguard.HOOK_CWD = {str(a)!r}
r = crewguard.check('tW', 'Worker', 'general', {line!r})
crewguard.decide(r['id'], True, via='test')
print(json.dumps([r['id'], crewguard.check('tW', 'Worker', 'general', {line!r}) is None]))""")
        def step(where, rid):
            return run(f"""os.chdir({str(where)!r})
held = crewguard.owner_step('tW', 'Worker', 'general', './release 9.9.9 notes', 'release-script')
rec = next(r for r in crewguard.all_requests() if r['id'] == {rid!r})
print(json.dumps([held is None, bool(rec.get('claimed'))]))""")
        home = Path(self.env["HOME"])
        for line, wrong in ((f"case a in b) :; cd {b};; esac; ./release 9.9.9 notes", b),
                            (f"env cd {b}; ./release 9.9.9 notes", b),
                            ("cd '~'; ./release 9.9.9 notes", home),
                            ("cd ~; ./release 9.9.9 notes", home),
                            (f"cd $HOME; ./release 9.9.9 notes", home),
                            (f"(cd {b}); ./release 9.9.9 notes", b),
                            (f"echo hi; cd {b} && ./release 9.9.9 notes", b),
                            (f'cd "{b}" && ./release 9.9.9 notes', b)):
            rid, ok = approve(line)
            self.assertTrue(ok, line)
            self.assertEqual(step(wrong, rid), [False, False], f"no hand-over from the wrong folder: {line}")
            self.assertEqual(step(a, rid), [False, False], f"nor from A: the line's folder can't be vouched for: {line}")
        # Plain cd with a literal path, joined by ; or &&, is followed.
        for line, right in ((f"cd {b} && ./release 9.9.9 notes", b), (f"cd {a}; cd ../repo-b; ./release 9.9.9 notes", b)):
            rid, ok = approve(line)
            self.assertEqual(step(a, rid), [False, False], line)
            self.assertEqual(step(right, rid), [True, True], line)

    # #trusted-helper's T215 regressions (t215-handover-regressions.txt), the owner half: the Full
    # (delegated helper) half belongs to its full-delegation branch and is kept there for its rebase.
    def hook_request(self, command):
        """The hook's check of `command` run in self.root (None: it lets it through)."""
        return py(self.env, f"""import os, crewguard
crewguard.HOOK_CWD = {str(self.root)!r}
print(json.dumps(crewguard.check('tH', 'Helper', 'build', {command!r})))""")

    def test_t215_handover_from_different_cwd_cannot_spend_the_owners_approval(self):
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir()
        command = "./release 9.9.9 owner"
        request = self.hook_request(command)
        answer = owner(self.env, self.data, "approve", request["id"], "--inbox")
        self.assertEqual(answer.returncode, 0, answer.stderr)
        self.assertIsNone(self.hook_request(command))   # the hook lets the original cwd run
        result = py(self.env, f"""import os, crewguard
os.chdir({str(elsewhere)!r})
other = crewguard.owner_step('tH', 'Helper', 'build', {command!r}, 'release-script')
record = next(r for r in crewguard.all_requests() if r['id'] == {request['id']!r})
os.chdir({str(self.root)!r})
same = crewguard.owner_step('tH', 'Helper', 'build', {command!r}, 'release-script')
again = crewguard.owner_step('tH', 'Helper', 'build', {command!r}, 'release-script')
print(json.dumps([bool(other), bool(record.get('claimed')), same, bool(again)]))""")
        self.assertEqual(result, [True, False, None, True])

    def test_t215_handover_without_saved_context_requires_a_fresh_approval(self):
        command = "./release 9.9.9 unknown-context"
        request = self.hook_request(command)
        answer = owner(self.env, self.data, "approve", request["id"], "--inbox")
        self.assertEqual(answer.returncode, 0, answer.stderr)
        self.assertIsNone(self.hook_request(command))
        f = self.data / "crew-approvals" / (request["id"] + ".json")
        record = json.loads(f.read_text())
        record.pop("guard_context")
        f.write_text(json.dumps(record))
        result = py(self.env, f"""import os, crewguard
os.chdir({str(self.root)!r})
print(json.dumps(crewguard.owner_step('tH', 'Helper', 'build', {command!r}, 'release-script')))""")
        self.assertIsNotNone(result)

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
        self.root = Path(pals_tmp.mkdtemp(prefix="pals-release-"))
        self.repo, self.shims, self.log = self.root / "repo", self.root / "shims", self.root / "pal.log"
        self.shims.mkdir()
        for name, text in STUBS.items():
            f = self.repo / name
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(text)
        shutil.copy(REPO / "release", self.repo / "release")
        shutil.copy(REPO / "tests" / "check_tmp.sh", self.repo / "tests" / "check_tmp.sh")   # its test step (T143)
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
