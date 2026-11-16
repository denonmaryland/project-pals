"""Proposal correctness regressions retained from the retired tap implementation."""
import json
import subprocess
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_helpers import Base
from test_desk import BIN, OWNER, pal, py, click, owner


class ProposalRegressions(Base):
    def proposal(self, kind="agents", text="Write useful docs", meta=None):
        return py(self.env, f"import crewproposals; print(json.dumps(crewproposals.propose({kind!r}, 'Worker', 'Worker#general', {text!r}, file='AGENTS.md', meta={meta!r})['id']))")

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

    def test_no_write_refusals_leave_proposals_pending_for_review(self):
        project = self.root / "retry-project"
        project.mkdir()
        app = Path(self.env["HERDR_APP_HOME"])
        app.mkdir(exist_ok=True)
        (app / "shared.json").write_text(json.dumps({"crew": {"bots": [{"name": "Worker", "space": "s1", "folder": str(project)}]}}))
        (project / "AGENTS.md").write_text("Changed instructions\n")
        for kind, who in (("agents", "Worker"), ("mission", "Worker"), ("agents", "MissingPal")):
            with self.subTest(kind=kind, pal=who):
                pid = py(self.env, f"import crewproposals; print(json.dumps(crewproposals.propose({kind!r}, {who!r}, 'Worker#general', 'Reviewed replacement\\n', file='AGENTS.md', base_sha='old-hash')['id']))")
                r = owner(self.env, self.data, "proposal", "accept", pid)
                self.assertNotEqual(r.returncode, 0)
                self.assertEqual(py(self.env, f"import crewproposals; print(json.dumps(crewproposals.get({pid!r})['status']))"), "pending", r.stderr)
                self.assertEqual((project / "AGENTS.md").read_text(), "Changed instructions\n")
                if kind == "agents" and who == "Worker":
                    staged = self.root / "retry-review.md"
                    staged.write_text("Reviewed replacement\n")
                    args = ["agents", "apply", "Worker", "AGENTS.md", "--from", str(staged), "--proposal", pid, "--expect"]
                    r = owner(self.env, self.data, *args, "old-hash")
                    self.assertNotEqual(r.returncode, 0)
                    self.assertEqual(py(self.env, f"import crewproposals; print(json.dumps(crewproposals.get({pid!r})['status']))"), "pending")
                    sha = py(self.env, "import crewagents; print(json.dumps(crewagents.sha('Changed instructions\\n')))")
                    r = owner(self.env, self.data, *args, sha)
                    self.assertEqual(r.returncode, 0, r.stderr)
                    self.assertEqual((project / "AGENTS.md").read_text(), staged.read_text())
                    (project / "AGENTS.md").write_text("Changed instructions\n")
