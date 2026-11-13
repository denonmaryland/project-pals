"""T205: tap approvals retain the hook's execution context. No held command is executed."""
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import owner, py
from test_helpers import Base
from test_taps import Taps


def live_repo(case):
    repo = case.root / 'live-repo'
    repo.mkdir()
    env = {**case.env, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'}
    def git(*args):
        return subprocess.run(['git', '-C', str(repo), *args], env=env, check=True, capture_output=True)
    git('init', '-b', 'main')
    (repo / 'AGENTS.md').write_text('fixture only\n')
    git('add', 'AGENTS.md')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
    (repo / 'AGENTS.md').write_text('fixture history\n')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-am', 'history')
    settings = case.data / 'crew-settings.json'
    current = json.loads(settings.read_text()) if settings.exists() else {}
    current.update(channel='live', live_repo=str(repo), live_branch='main')
    settings.write_text(json.dumps(current))
    return repo


class ApprovalContext(Base):
    def setUp(self):
        super().setUp()
        self.repo = live_repo(self)
        self.command = 'printf x > AGENTS.md; git commit -am update'

    def request(self, command=None, cwd=None, extra=None):
        command = command or self.command
        cwd = str(self.repo) if cwd is None else cwd
        return py(self.env, f'import crewguard\ncrewguard.HOOK_CWD={cwd!r}\n'
                  f'print(json.dumps(crewguard.check("tH", "Helper", "build", {command!r}, {extra!r})))')

    def test_original_cwd_and_all_rules_survive_dispatch(self):
        for suffix in ('git commit -am update', 'git reset --hard HEAD~1'):
            with self.subTest(suffix=suffix):
                request = self.request('printf x > AGENTS.md; ' + suffix)
                self.assertEqual(request['rule'], 'agents-file-shell')
                context = request.get('guard_context', {})
                self.assertEqual(context.get('cwd'), str(self.repo))
                self.assertIn('live-branch', context.get('rules', []))
                result = py(self.env, f'import crewguard, crewtaps\n'
                            f'crewguard.HOOK_CWD={str(self.root)!r}\n'
                            f'print(json.dumps([crewtaps.approval_class({request!r}), crewguard.HOOK_CWD]))')
                self.assertEqual(result, [['outward', None], str(self.root)])

    def test_saved_outward_rule_cannot_be_downgraded_by_later_settings(self):
        request = self.request()
        path = self.data / 'crew-settings.json'
        settings = json.loads(path.read_text()); settings['channel'] = 'stable'
        path.write_text(json.dumps(settings))
        cls, why = py(self.env, f'import crewtaps; print(json.dumps(crewtaps.approval_class({request!r})))')
        self.assertEqual((cls, why), ('outward', None))

    def test_symlink_cwd_keeps_the_context_the_hook_classified(self):
        outside = self.root / 'outside' / 'subdir'
        outside.mkdir(parents=True)
        alias = self.repo / 'alias'
        alias.symlink_to(outside, target_is_directory=True)
        request = self.request('cd ..; ' + self.command, cwd=str(alias))
        self.assertEqual(request.get('guard_context', {}).get('cwd'), str(alias))
        cls, why = py(self.env, f'import crewtaps; print(json.dumps(crewtaps.approval_class({request!r})))')
        self.assertEqual((cls, why), ('outward', None))

    def test_extra_metadata_cannot_replace_trusted_context(self):
        fake = {'cwd': str(self.root), 'rules': ['agents-file-shell']}
        request = self.request(extra={'guard_context': fake})
        self.assertEqual(request.get('guard_context', {}).get('cwd'), str(self.repo))
        self.assertIn('live-branch', request.get('guard_context', {}).get('rules', []))

    def test_context_and_full_rule_set_are_in_the_tap_fingerprint(self):
        request = self.request()
        context = {'cwd': str(self.repo), 'rules': ['agents-file-shell', 'live-branch']}
        request['guard_context'] = context
        for changed in ({'cwd': str(self.root), 'rules': context['rules']},
                        {'cwd': context['cwd'], 'rules': ['agents-file-shell']}):
            with self.subTest(changed=changed):
                other = {**request, 'guard_context': changed}
                hashes = py(self.env, f'import crewtaps; print(json.dumps([crewtaps.item_hash("approval", {request!r}), crewtaps.item_hash("approval", {other!r})]))')
                self.assertNotEqual(*hashes)

    def test_approval_cannot_be_reused_for_the_same_text_in_another_cwd(self):
        result = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.repo)!r}
first=crewguard.check('tH','Helper','build',{self.command!r})
crewguard.decide(first['id'],True,via='fixture human click')
crewguard.HOOK_CWD={str(self.root)!r}
second=crewguard.check('tH','Helper','build',{self.command!r})
print(json.dumps([first,second]))''')
        self.assertIsNotNone(result[1])
        self.assertNotEqual(result[0]['id'], result[1]['id'])

    def test_changed_context_cannot_keep_the_old_reuse_key(self):
        result = py(self.env, f'''import crewguard
from crewlib import save_json
crewguard.HOOK_CWD={str(self.repo)!r}
request=crewguard.check('tH','Helper','build',{self.command!r})
crewguard.decide(request['id'],True,via='fixture human click')
request=next(r for r in crewguard.all_requests() if r['id']==request['id'])
request['guard_context']['cwd']={str(self.root)!r}
save_json(crewguard.APPROVALS / (request['id']+'.json'),request)
print(json.dumps(crewguard.check('tH','Helper','build',{self.command!r})))''')
        self.assertIsNotNone(result)
        self.assertEqual(result['status'], 'pending')

    def test_legacy_and_unknown_context_require_owner_click(self):
        request = self.request('printf x > AGENTS.md')
        legacy = {k: v for k, v in request.items() if k != 'guard_context'}
        for record in (legacy, {**request, 'guard_context': {'cwd': None, 'rules': ['agents-file-shell']}}):
            _, why = py(self.env, f'import crewtaps; print(json.dumps(crewtaps.approval_class({record!r})))')
            self.assertTrue(why)
            self.assertIn('own click', why)
        (self.data / 'crew-approvals' / (request['id'] + '.json')).write_text(json.dumps(legacy))
        approved = owner(self.env, self.data, 'approve', request['id'])
        self.assertEqual(approved.returncode, 0, approved.stderr)

    def test_new_missing_or_relative_hook_cwd_does_not_become_process_cwd(self):
        for cwd in (None, 'relative/path'):
            with self.subTest(cwd=cwd):
                result = py(self.env, f'''import crewguard, crewtaps
crewguard.HOOK_CWD={cwd!r}
request=crewguard.check('tH','Helper','build','printf x > AGENTS.md')
print(json.dumps([request,crewtaps.approval_class(request)]))''')
                self.assertIsNone(result[0].get('guard_context', {}).get('cwd'))
                self.assertIn('own click', result[1][1])

    def test_new_contextual_rules_are_rechecked_at_decision(self):
        settings = self.data / 'crew-settings.json'
        document = json.loads(settings.read_text()); document['channel'] = 'stable'
        settings.write_text(json.dumps(document))
        request = self.request()
        document['channel'] = 'live'; settings.write_text(json.dumps(document))
        result = py(self.env, f'''import crewguard, crewtaps
request={request!r}
tap={{'kind':'approval','item':request['id'],'hash':crewtaps.item_hash('approval',request),'cls':'local'}}
try:
    crewguard.decide(request['id'],True,tap=tap)
except crewtaps.TapError:
    refused=True
else:
    refused=False
print(json.dumps(refused))''')
        self.assertTrue(result)


class LocalTapPipeline(Taps):
    def test_local_only_helper_gets_no_ticket_for_compound_live_edit(self):
        self.switch('local')
        repo = live_repo(self)
        command = 'printf x > AGENTS.md; git commit -am update'
        rid = py(self.env, f'import crewguard\ncrewguard.HOOK_CWD={str(repo)!r}\n'
                 f'r=crewguard.check("tH","Helper","build",{command!r})\nprint(json.dumps(r["id"]))')
        row = self.tickets()[rid]
        self.assertEqual(row['class'], 'outward')
        self.assertNotIn('ticket', row)
        self.assertIn('Working directory: ' + str(repo), row['text'])
        self.assertEqual(self.approval(rid)['status'], 'pending')
        self.assertEqual((repo / 'AGENTS.md').read_text(), 'fixture history\n')

    def test_running_token_refuses_changed_or_missing_execution_context(self):
        self.switch('local')
        for missing in (False, True):
            with self.subTest(missing=missing):
                rid = self.held('printf x > AGENTS.md' + ('; true' if missing else ''))
                result = py(self.env, f'''import crewtaps, crewguard
from crewlib import load_json, save_json, now_ms
path=crewguard.APPROVALS / ({rid!r} + '.json')
request=load_json(path, {{}})
hold=dict(id='t-abc123',kind='approval',item=request['id'],cls='local',helper='Pals',choice='Approve',relayed='fixture',status='running',hash=crewtaps.item_hash('approval',request))
if {missing!r}:
    request.pop('guard_context',None)
    hold['hash']=crewtaps.item_hash('approval',request)  # an old build's valid token, missing context
else:
    request['guard_context']['cwd']={str(self.data)!r}
save_json(path,request)
crewtaps.HOLDS.mkdir(parents=True,exist_ok=True)
crewtaps.RUN.mkdir(parents=True,exist_ok=True)
save_json(crewtaps.HOLDS / 't-abc123.json',hold)
nonce='ab'*16
args=['approve',request['id']]
save_json(crewtaps.RUN / (nonce+'.json'),dict(args=args,at=now_ms(),hold=hold['id'],helper='Pals'))
authority=crewtaps.take_run_token(args,nonce)
print(json.dumps([authority,(crewtaps.RUN / (nonce+'.json')).exists(),load_json(path,{{}})['status']]))''')
                self.assertEqual(result, [None, False, 'pending'])
