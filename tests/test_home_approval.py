"""Home's single-click command approvals: exact, scoped and spent once."""
import json
import os
import shutil
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, owner, py


class HomeApproval(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.command = 'git push origin main'

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def ask(self):
        r = pal(self.env, 'home', 'ask', 'Push?', '--option', 'Push', '--approves', self.command,
                '--option', 'Wait', term='tW')
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads((self.data / 'crew-home/home.json').read_text())['items'][-1]

    def approve(self, x):
        return owner(self.env, self.data, 'home', 'answer', x['id'], 'Push',
                     '--approval-snapshot', json.dumps({k: x.get(k) for k in ('authorization', 'options', 'title', 'body', 'does', 'by', 'recommend', 'why', 'links', 'images')}, separators=(',', ':')))

    def gate(self, command, terminal='tW', bot='Worker', channel='general'):
        return py(self.env, f'''import crewguard
crewguard.HOOK_CWD = {os.getcwd()!r}
r = crewguard.check({terminal!r}, {bot!r}, {channel!r}, {command!r})
print(json.dumps(r))''')

    def test_exact_owner_click_once_and_wrong_terminal(self):
        x = self.ask()
        self.assertEqual(x['authorization']['commands'][0]['command'], self.command)
        self.assertNotEqual(owner(self.env, self.data, 'home', 'answer', x['id'], 'Push').returncode, 0)
        r = self.approve(x)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNotNone(self.gate(self.command, 'tH', 'Helper', 'build'))
        self.assertIsNotNone(self.gate('git push  origin main'))
        self.assertIsNone(self.gate(self.command))
        self.assertIsNotNone(self.gate(self.command))

    def test_expiry_and_other_option(self):
        x = self.ask()
        self.assertEqual(self.approve(x).returncode, 0)
        f = next((self.data / 'crew-approvals').glob('*.json'))
        r = json.loads(f.read_text()); r['decided'] -= 31 * 60 * 1000; f.write_text(json.dumps(r))
        self.assertIsNotNone(self.gate(self.command))
        self.assertEqual(json.loads(f.read_text())['status'], 'expired')
        x = self.ask()
        self.assertEqual(owner(self.env, self.data, 'home', 'answer', x['id'], 'Wait').returncode, 0)
        self.assertEqual(len([r for r in (self.data / 'crew-approvals').glob('*.json') if json.loads(r.read_text())['status'] == 'approved']), 0)

    def test_snapshot_changed_and_shell_command_rejected(self):
        x = self.ask()
        f = self.data / 'crew-home/home.json'; h = json.loads(f.read_text())
        h['items'][0]['authorization']['terminal'] = 'tH'; f.write_text(json.dumps(h))
        self.assertNotEqual(self.approve(x).returncode, 0)
        r = pal(self.env, 'home', 'ask', 'x', '--option', 'Go', '--approves', 'git push && echo hi', term='tW')
        self.assertNotEqual(r.returncode, 0)

    def test_changed_option_mapping_cannot_approve(self):
        x = self.ask()
        f = self.data / 'crew-home/home.json'; h = json.loads(f.read_text())
        h['items'][0]['options'] = ['Wait', 'Push']
        f.write_text(json.dumps(h))
        self.assertNotEqual(self.approve(x).returncode, 0)
        self.assertFalse((self.data / 'crew-approvals').exists())

    def test_helper_cannot_activate_an_approval(self):
        x = self.ask()
        result = py(self.env, f'''import crewhome, crewlib
crewlib.owner_proven = lambda: False
try:
    crewhome.answer({x['id']!r}, 'Push', by='helper', delegated={{'helper': 'test'}}, approval_snapshot={json.dumps({k: x.get(k) for k in ('authorization', 'options', 'title', 'body', 'does', 'by', 'recommend', 'why', 'links', 'images')})!r})
    print(json.dumps('allowed'))
except crewhome.HomeError:
    print(json.dumps('refused'))''')
        self.assertEqual(result, 'refused')
        self.assertFalse((self.data / 'crew-approvals').exists())

    def test_land_handover_and_direct_program_check(self):
        result = py(self.env, f'''import os, crewguard
import crewlib
crewlib._owner_proven = True
cwd = {os.getcwd()!r}
tip = 'a' * 40
crewguard.land_tip = lambda cmd: tip
cmd = 'pal land Worker#general'
auth = crewguard.home_authorization('tW', 'Worker', 'general', cwd, [cmd])
crewguard.approve_from_home(auth, auth['commands'][0], 'h-123456')
crewguard.HOOK_CWD = cwd
hook = crewguard.check('tW', 'Worker', 'general', cmd)
handed = crewguard.recently_used('tW', 'land', words=['land', 'Worker#general'], cwd=cwd, tip=tip)
ag = crewguard.recently_used('tW', 'land', words=['land', 'Worker#general'], cwd=cwd, tip=tip)
crewguard.approve_from_home(auth, auth['commands'][0], 'h-654321')
direct = crewguard.check('tW', 'Worker', 'general', cmd + '  # at ' + tip[:12], claim=True, cwd=cwd)
again = crewguard.check('tW', 'Worker', 'general', cmd + '  # at ' + tip[:12], claim=True, cwd=cwd)
print(json.dumps([hook, bool(handed), ag, direct, bool(again)]))''')
        self.assertEqual(result, [None, True, None, None, True])

    def test_real_cli_land_needs_no_second_approval(self):
        import subprocess
        repo = self.root / 'repo'; repo.mkdir()
        wt = self.root / 'topic'
        env = {**self.env, 'GIT_AUTHOR_NAME': 'Test', 'GIT_AUTHOR_EMAIL': 'test@example.invalid',
               'GIT_COMMITTER_NAME': 'Test', 'GIT_COMMITTER_EMAIL': 'test@example.invalid'}
        def git(*args):
            result = subprocess.run(['git', '-C', str(repo), *args], env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            return result.stdout.strip()
        git('init', '-q', '-b', 'main')
        (repo / 'base').write_text('base')
        git('add', 'base'); git('commit', '-qm', 'base')
        start = git('rev-parse', 'HEAD')
        git('worktree', 'add', '-qb', 'crew/test', str(wt), 'main')
        (wt / 'change').write_text('change')
        git('-C', str(wt), 'add', 'change'); git('-C', str(wt), 'commit', '-qm', 'change')
        tip = git('-C', str(wt), 'rev-parse', 'HEAD')
        app = Path(self.env['HERDR_APP_HOME']); app.mkdir(parents=True, exist_ok=True)
        (app / 'shared.json').write_text(json.dumps({'crew': {'bots': [{'name': 'Helper', 'space': 's2',
            'worktrees': {'#build': {'path': str(wt), 'repo': str(repo), 'branch': 'crew/test',
                                      'base': 'main', 'start': start}}}]}}))
        self.env.update({k: env[k] for k in ('GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL')})
        self.command = 'pal land Helper#build'
        for bad in ('crew land Helper#build', 'pal  land Helper#build', "pal land 'Helper#build'", "pal land Helper#build --check ''"):
            self.assertNotEqual(pal(self.env, 'home', 'ask', 'x', '--option', 'Go', '--approves', bad, term='tW').returncode, 0, bad)
        x = self.ask()
        self.assertEqual(x['authorization']['commands'][0]['land_tip'], tip)
        r = self.approve(x); self.assertEqual(r.returncode, 0, r.stderr)
        r = pal(self.env, 'land', 'Helper#build', term='tW')
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('landed crew/test on main', r.stdout)
        self.assertEqual(git('merge-base', '--is-ancestor', tip, 'main'), '')
        self.assertEqual([json.loads(f.read_text())['status'] for f in (self.data / 'crew-approvals').glob('*.json')], ['used'])
