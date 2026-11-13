"""T190 follow-ups, using disposable fixtures and real CLI action paths."""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_taps import Taps
from test_desk import BIN, OWNER, pal, py, click, make_partner, cid_of, owner


class Followups(Taps):
    def proposal(self, kind="agents", text="Write useful docs", meta=None):
        return py(self.env, f"import crewproposals; print(json.dumps(crewproposals.propose({kind!r}, 'Worker', 'Worker#general', {text!r}, file='AGENTS.md', meta={meta!r})['id']))")

    def test_unknown_rules_are_never_and_all_defaults_have_one_explicit_class(self):
        result = py(self.env, '''
import crewtaps, crewguard
groups = [crewtaps.LOCAL_RULES, getattr(crewtaps, 'OUTWARD_RULES', set()), crewtaps.NEVER_RULES]
print(json.dumps({'unknown': [crewtaps.rule_class(r) for r in ('notify-key', 'future-rule', None)],
                  'membership': {r['name']: sum(r['name'] in g for g in groups) for r in crewguard.DEFAULT['guarded']}}))
''')
        self.assertEqual(result["unknown"], ["never"] * 3)
        self.assertTrue(all(n == 1 for n in result["membership"].values()), result["membership"])

    def test_unknown_approval_has_no_ticket_even_with_outward_on(self):
        self.switch("outward")
        rid = self.held()
        py(self.env, f"import crewguard; from crewlib import load_json, save_json; p = crewguard.APPROVALS / ({rid!r} + '.json'); a = load_json(p, {{}}); a['rule'] = 'notify-key'; save_json(p, a)")
        row = self.tickets()[rid]
        self.assertFalse("ticket" in row, "an unknown protected rule must not be delegated")
        from test_taps_review import ReviewBoundaries
        args = ReviewBoundaries.legacy_token(self, "approval", rid, "outward", "Approve")
        self.assertNotEqual(pal(self.env, *args).returncode, 0)
        self.assertEqual(self.approval(rid)["status"], "pending")

    def test_clipped_proposals_drafts_and_diffs_have_no_tickets(self):
        self.switch("local")
        self.switch("outward")
        short = self.proposal(text="x" * 6000)
        long = self.proposal(text="x" * 6001)
        make_partner(self.root)
        r = pal(self.env, "desk", "draft", "--to", "Worker#general", "Docs\n" + "x" * 6001, term="tH")
        self.assertEqual(r.returncode, 0, r.stderr)
        draft = cid_of(r.stdout)
        approval = self.held()
        py(self.env, f"import crewguard; from crewlib import load_json, save_json; p = crewguard.APPROVALS / ({approval!r} + '.json'); a = load_json(p, {{}}); a['diff'] = 'x' * 6001; save_json(p, a)")
        rows = self.tickets()
        self.assertTrue("ticket" in rows[short], "exactly the displayed limit still works")
        for iid in (long, draft, approval):
            with self.subTest(item=iid):
                self.assertFalse("ticket" in rows[iid], "truncated text must not authorize the full payload")
                self.assertIn("too long", rows[iid]["not_tappable"])

    def test_legacy_clipped_proposal_is_refused_before_application(self):
        from test_taps_review import ReviewBoundaries
        self.switch("local")
        pid = self.proposal("dream", "x" * 6001, {"kind": "tool", "pal": "Worker"})
        args = ReviewBoundaries.legacy_token(self, "proposal", pid, "local", "Accept")
        r = pal(self.env, *args)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("too long", r.stderr)
        self.assertEqual(py(self.env, f"import crewproposals; print(json.dumps(crewproposals.get({pid!r})['status']))"), "pending")
        self.assertEqual(py(self.env, "import crewtasks; print(json.dumps(crewtasks.load()['tasks']))"), [])

    def test_tapped_dream_tasks_record_the_tap_actor(self):
        self.switch("local")
        for kind in ("tool", "process"):
            with self.subTest(kind=kind):
                pid = self.proposal("dream", "Make docs easier", {"kind": kind, "pal": "Worker"})
                hid = self.tapped(pid, "Accept")
                self.due(hid)
                self.run_due()
                self.assertEqual(self.hold(hid)["status"], "done")
                tasks = py(self.env, "import crewtasks; print(json.dumps(crewtasks.load()['tasks']))")
                self.assertEqual(tasks[-1]["by"], f"Pals (tapped, relayed from {OWNER})")

    def test_owner_decline_cannot_race_an_applying_proposal(self):
        pid = self.proposal("dream", "One task only", {"kind": "tool", "pal": "Worker"})
        sha = py(self.env, f"import crewproposals; print(json.dumps(crewproposals.text_sha(crewproposals.get({pid!r}))))")
        args = ["proposal", "accept", pid, "--text-sha", sha]
        args += ["--click", click(self.data, args)]
        started, release = self.root / "applying", self.root / "release"
        code = f'''
import sys, runpy, time
from pathlib import Path
sys.path.insert(0, {str(BIN)!r})
import crewtasks
original_add = crewtasks.add
def paused_add(*args, **kwargs):
    Path({str(started)!r}).touch()
    deadline = time.monotonic() + 15
    while not Path({str(release)!r}).exists():
        if time.monotonic() > deadline: raise RuntimeError('test barrier timed out')
        time.sleep(.02)
    return original_add(*args, **kwargs)
crewtasks.add = paused_add
sys.argv = ['pal', *{args!r}]
runpy.run_path({str(BIN / 'crew')!r}, run_name='__main__')
'''
        accept = subprocess.Popen([sys.executable, "-c", code], env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        decline = None
        try:
            deadline = time.monotonic() + 15
            while not started.exists() and accept.poll() is None and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(started.exists(), "accept reached the actual task writer")
            during = py(self.env, f"import crewproposals; print(json.dumps(crewproposals.get({pid!r})['status']))")
            deny_args = ["proposal", "decline", pid]
            decline = subprocess.Popen([sys.executable, str(BIN / "crew"), *deny_args, "--click", click(self.data, deny_args)],
                                       env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                decline.wait(timeout=.5)
            except subprocess.TimeoutExpired:
                pass
        finally:
            release.touch()
            accepted_out = accept.communicate(timeout=20)
            declined_out = decline.communicate(timeout=20) if decline else ("", "")
        self.assertEqual(accept.returncode, 0, accepted_out)
        self.assertEqual(during, "applying", "reserve the decision before any side effect")
        self.assertNotEqual(decline.returncode, 0, declined_out)
        self.assertEqual(py(self.env, f"import crewproposals; print(json.dumps(crewproposals.get({pid!r})['status']))"), "accepted")
        tasks = py(self.env, "import crewtasks; print(json.dumps(crewtasks.load()['tasks']))")
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["by"], OWNER)

    def test_failed_application_is_not_retried_as_pending(self):
        pid = self.proposal()
        result = py(self.env, f'''
import crewproposals
calls = []
def partial_write(p):
    calls.append(p['id'])
    raise RuntimeError('simulated partial application')
try:
    crewproposals.decide({pid!r}, 'accepted', apply=partial_write)
except RuntimeError:
    pass
try:
    crewproposals.decide({pid!r}, 'accepted', apply=partial_write)
except crewproposals.CrewError:
    pass
print(json.dumps([crewproposals.get({pid!r})['status'], len(calls)]))
''')
        self.assertEqual(result, ["failed", 1])

    def test_profile_application_obeys_the_same_proposal_decision(self):
        project = self.root / "project"
        project.mkdir()
        app = Path(self.env["HERDR_APP_HOME"])
        app.mkdir(exist_ok=True)
        (app / "shared.json").write_text(json.dumps({"crew": {"bots": [{"name": "Worker", "space": "s1", "folder": str(project)}]}}))
        staged = self.root / "review.md"
        staged.write_text("Reviewed instructions\n")
        denied = self.proposal(text=staged.read_text())
        self.assertEqual(owner(self.env, self.data, "proposal", "decline", denied).returncode, 0)
        args = ["agents", "apply", "Worker", "AGENTS.md", "--from", str(staged), "--expect", "none", "--proposal"]
        r = owner(self.env, self.data, *args, denied)
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((project / "AGENTS.md").exists(), "a declined proposal must not write through the profile panel")
        pending = self.proposal(text=staged.read_text())
        r = owner(self.env, self.data, *args, pending)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual((project / "AGENTS.md").read_text(), staged.read_text())
        self.assertEqual(py(self.env, f"import crewproposals; print(json.dumps(crewproposals.get({pending!r})['status']))"), "accepted")
