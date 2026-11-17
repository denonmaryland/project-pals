"""Optional approval gate behavior in throwaway homes."""
import json
import shutil
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, py, owner
from test_helpers import Base, helper

class OptionalGate(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        settings = self.data / "crew-settings.json"
        data = json.loads(settings.read_text()); data.pop("approval_gate", None); settings.write_text(json.dumps(data))
    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)
    def check(self, cmd):
        return py(self.env, f'import crewguard; print(json.dumps(crewguard.check("tW", "Worker", "general", {cmd!r})))')
    def test_default_off_logs_attempt_not_command(self):
        self.assertIsNone(self.check('git push origin sensitive-ref'))
        feed = (self.data / 'crew-feed.jsonl').read_text()
        self.assertIn('gate-passed', feed)
        self.assertIn('attempt', feed)
        self.assertNotIn('sensitive-ref', feed)
        self.assertFalse((self.data / 'crew-approvals').exists())
    def test_on_and_off_require_owner_click(self):
        self.assertNotEqual(pal(self.env, 'settings', 'approval-gate', 'on', term='tW').returncode, 0)
        r = owner(self.env, self.data, 'settings', 'approval-gate', 'on')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNotNone(self.check('git push origin main'))
        r = owner(self.env, self.data, 'settings', 'approval-gate', 'off')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNone(self.check('git push origin main'))
    def test_self_gate_off(self):
        r = pal(self.env, 'owner-step', 'release-script', '--', './release', '9.9.9', 'notes', term='tW')
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_claude_hook_logs_each_combined_action_in_both_modes(self):
        for state in ('off', 'on'):
            self.assertEqual(owner(self.env, self.data, 'settings', 'approval-gate', state).returncode, 0)
            result = py(self.env, '''import contextlib, io, importlib.machinery, importlib.util
from pathlib import Path
loader = importlib.machinery.SourceFileLoader('hook', str(Path(crewguard.__file__).parent / 'crew-hook'))
hook = importlib.util.module_from_spec(importlib.util.spec_from_loader('hook', loader)); loader.exec_module(hook)
hook.crew_bot = lambda: ('tW', 'Worker', 'general')
hook.chief_refusal = lambda *args: None
with contextlib.redirect_stdout(io.StringIO()):
    hook.pre_tool_use({'tool_name': 'Bash', 'tool_input': {'command': 'git push origin private-ref && git push origin private-ref && gh release create v1 private-secret'}})
print(json.dumps(True))'''.replace('from pathlib import Path', 'from pathlib import Path\nimport crewguard'))
            self.assertTrue(result)
        events = [json.loads(line) for line in (self.data / 'crew-feed.jsonl').read_text().splitlines()]
        acts = [e for e in events if e.get('kind') == 'action-attempt']
        self.assertEqual([e['action'] for e in acts], ['push', 'push', 'release', 'push', 'push', 'release'])
        self.assertTrue(all(e['bot'] == 'Worker' and e['phase'] == 'attempt' for e in acts))
        self.assertNotIn('private-secret', json.dumps(acts))

    def test_feed_displays_actor_and_action_without_command(self):
        self.check('git push origin private-ref')
        r = pal(self.env, 'feed', '--all', term='tW')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('Worker #general attempted a guarded action (push)', r.stdout)
        self.assertNotIn('private-ref', r.stdout)

    def test_nested_shell_attempts_are_not_double_counted(self):
        result = py(self.env, '''import crewguard
crewguard.log_action_attempts('tW', 'Worker', 'general', 'bash -c "git push first && git push second"')
print(json.dumps(True))''')
        self.assertTrue(result)
        events = [json.loads(line) for line in (self.data / 'crew-feed.jsonl').read_text().splitlines()]
        self.assertEqual([e['action'] for e in events if e.get('kind') == 'action-attempt'], ['push', 'push'])

    def test_action_logs_do_not_depend_on_guard_policy(self):
        result = py(self.env, '''import crewguard, importlib.machinery, importlib.util
from pathlib import Path
crewguard.policy = lambda: {'guarded': [], 'trusted': []}
loader = importlib.machinery.SourceFileLoader('hook', str(Path(crewguard.__file__).parent / 'crew-hook'))
hook = importlib.util.module_from_spec(importlib.util.spec_from_loader('hook', loader)); loader.exec_module(hook)
hook.crew_bot = lambda: ('tW', 'Worker', 'general')
hook.chief_refusal = lambda *args: None
hook.pre_tool_use({'tool_name': 'Bash', 'tool_input': {'command': 'git push first && gh release create v1 && pal land Worker#general && git -C /tmp -c color.ui=false push origin main && env FOO=bar /usr/bin/git --no-pager push origin main'}})
print(json.dumps(True))''')
        self.assertTrue(result)
        events = [json.loads(line) for line in (self.data / 'crew-feed.jsonl').read_text().splitlines()]
        self.assertEqual([e['action'] for e in events if e.get('kind') == 'action-attempt'], ['push', 'release', 'land', 'push', 'push'])

class HelperCannotChange(Base):
    def test_full_control_helper_cannot_toggle(self):
        self.env['PAL_HELPER_PLAIN_KEYS'] = '1'
        r = owner(self.env, self.data, 'settings', 'trust-helper', 'Pals', 'level', 'full')
        self.assertEqual(r.returncode, 0, r.stderr)
        before = json.loads((self.data / 'crew-settings.json').read_text())['approval_gate']
        r = helper(self.env, 'settings', 'approval-gate', 'off')
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(json.loads((self.data / 'crew-settings.json').read_text())['approval_gate'], before)

if __name__ == '__main__':
    unittest.main()
