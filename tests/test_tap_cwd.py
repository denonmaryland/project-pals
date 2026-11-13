"""T205: tap approvals retain the hook's execution context. No held command is executed."""
import json
import os
import shlex
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


class NestedCwdPipeline(Taps):
    """T210: flattening a literal runner must not lose an outer/interpreter cwd change."""

    def setUp(self):
        super().setUp()
        self.switch('local')
        self.repo = live_repo(self)

    def variants(self, write=True):
        edit = 'printf x > AGENTS.md; ' if write else ''
        cd = 'cd ' + shlex.quote(str(self.repo)) + '; '
        python_system = 'import os; os.system("git commit -am update")'
        python_chdir = f'import os; os.chdir({str(self.repo)!r}); os.system("git commit -am update")'
        python_cwd = f'import subprocess; subprocess.run(["git","commit","-am","update"],cwd={str(self.repo)!r})'
        return [
            ('shell', cd + edit + "sh -c 'git commit -am update'"),
            ('python', cd + edit + 'python3 -c ' + shlex.quote(python_system)),
            ('bash-login', cd + edit + "/usr/bin/bash -lc 'git commit -am update'"),
            ('python-chdir', edit + 'python3 -c ' + shlex.quote(python_chdir)),
            ('python-cwd', edit + 'python3 -c ' + shlex.quote(python_cwd)),
            ('relative-nested-cd', edit + "sh -c 'cd live-repo; git reset --hard HEAD~1'"),
        ]

    def request(self, command):
        return py(self.env, f'import crewguard\ncrewguard.HOOK_CWD={str(self.root)!r}\n'
                  f'print(json.dumps(crewguard.check("tH","Helper","build",{command!r})))')

    def test_fresh_tap_process_cannot_issue_a_local_ticket_for_nested_mutations(self):
        for kind, command in self.variants():
            with self.subTest(kind=kind):
                request = self.request(command)
                self.assertIsNotNone(request)
                row = self.tickets()[request['id']]
                self.assertNotIn('ticket', row)
                self.assertIn('own click', row['not_tappable'])
                self.assertEqual(self.approval(request['id'])['status'], 'pending')
        self.assertEqual((self.repo / 'AGENTS.md').read_text(), 'fixture history\n')

    def test_nested_mutation_without_an_outer_guarded_edit_still_needs_owner(self):
        for kind, command in self.variants(write=False):
            with self.subTest(kind=kind):
                request = self.request(command)
                self.assertIsNotNone(request)
                self.assertEqual(request['status'], 'pending')
                self.assertIn('nested-cwd', request['guard_context']['rules'])

    def test_owner_can_approve_the_new_hold_once(self):
        command = self.variants(write=False)[0][1]
        request = self.request(command)
        self.assertIsNotNone(request)
        approved = owner(self.env, self.data, 'approve', request['id'])
        self.assertEqual(approved.returncode, 0, approved.stderr)
        self.assertIsNone(self.request(command))
        self.assertIsNotNone(self.request(command))
        self.assertEqual((self.repo / 'AGENTS.md').read_text(), 'fixture history\n')

    def test_other_supported_literal_runners_are_held_at_the_initial_gate(self):
        cd = 'cd ' + shlex.quote(str(self.repo)) + '; '
        commands = [
            cd + "dash -c 'git commit -am update'",
            cd + "/bin/sh -c 'git commit -am update'",
            'command env -C ' + shlex.quote(str(self.repo)) + " /bin/sh -c 'git commit -am update'",
            cd + "sh <<'SCRIPT'\ngit commit -am update\nSCRIPT",
            cd + "sh <<< 'git commit -am update'",
            cd + "printf 'git commit -am update' | sh",
            cd + "printf '%s' 'git commit -am update' | sh",
            cd + "eval \"sh -c 'git commit -am update'\"",
            'node -e ' + shlex.quote('require("child_process").execSync("git commit -am update", {cwd:' + json.dumps(str(self.repo)) + '})'),
            cd + "sh -c 'git branch -f main HEAD~1'",
            cd + "busybox sh -c 'git commit -am update'",
            cd + "strace sh -c 'git commit -am update'",
        ]
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.root)!r}
print(json.dumps([crewguard.check('tH','Helper','build',command) for command in {commands!r}]))''')
        for command, request in zip(commands, results):
            with self.subTest(command=command):
                self.assertIsNotNone(request)
                self.assertIn('nested-cwd', request['guard_context']['rules'])

    def test_child_cd_cannot_hide_an_outer_live_commit(self):
        outside = shlex.quote(str(self.root))
        commands = [f"sh -c 'cd {outside}; git status'; git commit -am update",
                    f"sh -c 'cd {outside}'; git commit -am update"]
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.repo)!r}
print(json.dumps([crewguard.check('tH','Helper','build',command) for command in {commands!r}]))''')
        for command, request in zip(commands, results):
            with self.subTest(command=command):
                self.assertIsNotNone(request)
                self.assertIn('nested-cwd', request['guard_context']['rules'])

    def test_nested_candidate_overflow_requires_owner_at_gate_ticket_and_decision(self):
        code = 'import os; ' + '; '.join(f'os.system("echo {i}")' for i in range(201))
        code += '; os.system("git commit -am update")'
        self.assert_nested_requires_owner(code)

    def test_interpreter_literal_overflow_requires_owner_at_gate_ticket_and_decision(self):
        code = 'import os; print(' + ','.join(repr(str(i)) for i in range(41))
        code += ',os.system("git commit -am update"))'
        self.assert_nested_requires_owner(code)

    def test_help_as_git_argument_does_not_hide_a_nested_mutation(self):
        for command in ('git commit --allow-empty -m "--help"',
                        'git commit -m update -- --help'):
            with self.subTest(command=command):
                self.assert_nested_requires_owner('import os; os.system(' + repr(command) + ')')

    def assert_nested_requires_owner(self, code):
        nested = 'python3 -c ' + shlex.quote(code)
        command = 'printf x > AGENTS.md; ' + nested
        request = self.request(command)
        row = self.tickets()[request['id']]
        result = py(self.env, f'''import crewguard, crewtaps
from crewlib import save_json
crewguard.HOOK_CWD={str(self.root)!r}
initial=crewguard.check('tH','Helper','build',{nested!r})
request={request!r}
request['guard_context']['rules']=['agents-file-shell']
request['key']=crewguard.key(request['terminal'],request['command'],request['guard_context'])
save_json(crewguard.APPROVALS / (request['id']+'.json'),request)
hold=dict(id='t-abc123',helper='Pals',kind='approval',item=request['id'],cls='local',choice='Approve',
          relayed='fixture only',hash=crewtaps.item_hash('approval',request))
try:
    crewguard.decide(request['id'],True,tap=hold)
except crewtaps.TapError:
    refused=True
else:
    refused=False
print(json.dumps([initial,refused]))''')
        self.assertEqual([bool(result[0]), 'ticket' not in row, result[1]], [True, True, True])
        self.assertEqual((self.repo / 'AGENTS.md').read_text(), 'fixture history\n')

    def test_quoted_documentation_and_file_heredocs_are_not_execution(self):
        commands = ["printf '%s' \"sh -c 'git commit -am update'\"",
                    "cat <<'DOC' > notes.txt\nsh -c 'git commit -am update'\nDOC",
                    'python3 -c ' + shlex.quote('print("git commit -am update")')]
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.root)!r}
print(json.dumps([crewguard.matches(command) for command in {commands!r}]))''')
        self.assertEqual(results, [None, None, None])

    def test_legacy_local_hold_token_and_final_decision_are_all_refused(self):
        for kind, command in self.variants()[:2]:
            with self.subTest(kind=kind):
                request = self.request(command)
                result = py(self.env, f'''import crewguard, crewtaps
from crewlib import save_json, load_json, now_ms
request={request!r}
request['guard_context']['rules']=['agents-file-shell']  # a 94325be local approval
request['key']=crewguard.key(request['terminal'],request['command'],request['guard_context'])
path=crewguard.APPROVALS / (request['id']+'.json')
hold=dict(id='t-abc123',helper='Pals',kind='approval',item=request['id'],cls='local',choice='Approve',
          relayed='fixture only',title='fixture',by='Helper#build',at=now_ms(),run_at=0,
          status='holding',hash=crewtaps.item_hash('approval',request))
save_json(path,request)
crewtaps._save_hold(hold)
due=crewtaps.run_due()
due_status=due[-1]['status']
save_json(path,request)
hold['status']='running'
crewtaps._save_hold(hold)
crewtaps.RUN.mkdir(parents=True,exist_ok=True)
nonce='cd'*16
args=['approve',request['id']]
save_json(crewtaps.RUN / (nonce+'.json'),dict(args=args,at=now_ms(),hold=hold['id'],helper='Pals'))
token=crewtaps.take_run_token(args,nonce)
try:
    crewguard.decide(request['id'],True,tap=hold)
except crewtaps.TapError:
    refused=True
else:
    refused=False
print(json.dumps([due_status,token,(crewtaps.RUN / (nonce+'.json')).exists(),refused,load_json(path,{{}})['status']]))''')
                self.assertEqual(result, ['dropped', None, False, True, 'pending'])
        self.assertEqual((self.repo / 'AGENTS.md').read_text(), 'fixture history\n')

    def test_read_only_nested_git_and_explicit_nested_push_keep_their_class(self):
        self.switch('outward')
        for inner in ('git branch --list', 'git branch --show-current', 'git symbolic-ref HEAD',
                      'git worktree list', 'git fetch --help', 'git status --short',
                      'printf "git commit -am update"'):
            with self.subTest(inner=inner):
                command = 'printf x > AGENTS.md; sh -c ' + shlex.quote(inner)
                request = self.request(command)
                row = self.tickets()[request['id']]
                self.assertEqual(row['class'], 'local')
                self.assertIn('ticket', row)
        request = self.request("sh -c 'git push origin main'")
        row = self.tickets()[request['id']]
        self.assertEqual(row['class'], 'outward')
        self.assertIn('ticket', row)

    def test_existing_policy_receives_the_new_guard(self):
        result = py(self.env, '''import crewguard
from crewlib import save_json
out=[]
for with_names in (False,True):
    old={**crewguard.DEFAULT,'defaults_version':17,'guarded':[r for r in crewguard.DEFAULT['guarded'] if r['name']!='nested-cwd']}
    if with_names: old['defaults_names']=[r['name'] for r in old['guarded']]
    save_json(crewguard.POLICY,old)
    out.append('nested-cwd' in {r['name'] for r in crewguard.policy()['guarded']})
print(json.dumps(out))''')
        self.assertEqual(result, [True, True])
