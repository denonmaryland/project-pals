"""T205: approvals retain the hook's execution context. No held command is executed.
After Full control (main 9c2966a) taps no longer run anything: the ticket/hold/token cases went with
them (T205 card c-ddd208); human and Full approvals keep the saved context, one use, revocation and
the protected-rule checks."""
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import owner, py
from test_helpers import Base, helper


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

    def test_extra_metadata_cannot_replace_trusted_context(self):
        fake = {'cwd': str(self.root), 'rules': ['agents-file-shell']}
        request = self.request(extra={'guard_context': fake})
        self.assertEqual(request.get('guard_context', {}).get('cwd'), str(self.repo))
        self.assertIn('live-branch', request.get('guard_context', {}).get('rules', []))

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

    def test_original_rules_survive_saved_cwd_reclassification_and_settings_changes(self):
        request = self.request()
        self.assertEqual(request['guard_context']['cwd'], str(self.repo))
        self.assertIn('live-branch', request['guard_context']['rules'])
        settings = self.data / 'crew-settings.json'
        data = json.loads(settings.read_text()); data['channel'] = 'stable'
        settings.write_text(json.dumps(data))
        result = py(self.env, f'import crewguard; crewguard.HOOK_CWD={str(self.root)!r}; '
                    f'print(json.dumps([sorted(crewguard.approval_rules({request!r})), crewguard.HOOK_CWD]))')
        self.assertIn('live-branch', result[0])
        self.assertEqual(result[1], str(self.root))

    def test_symlink_cwd_spelling_survives_reclassification(self):
        outside = self.root / 'outside' / 'subdir'; outside.mkdir(parents=True)
        alias = self.repo / 'alias'; alias.symlink_to(outside, target_is_directory=True)
        request = self.request('cd ..; ' + self.command, cwd=str(alias))
        self.assertEqual(request['guard_context']['cwd'], str(alias))
        rules = py(self.env, f'import crewguard; print(json.dumps(sorted(crewguard.approval_rules({request!r}))))')
        self.assertIn('live-branch', rules)

    def test_context_and_all_rules_are_bound_to_delegated_snapshot(self):
        request = self.request()
        for context in ({'cwd':str(self.root),'rules':['agents-file-shell','live-branch']},
                        {'cwd':str(self.repo),'rules':['agents-file-shell']}):
            other = {**request,'guard_context':context}
            hashes = py(self.env, f'import crewguard; print(json.dumps([crewguard._delegated_snapshot({request!r}),crewguard._delegated_snapshot({other!r})]))')
            self.assertNotEqual(*hashes)

    def test_unknown_context_never_becomes_process_cwd(self):
        for cwd in (None, 'relative/path'):
            result = py(self.env, f'import crewguard; crewguard.HOOK_CWD={cwd!r}; '
                        'r=crewguard.check("tH","Helper","build","printf x > AGENTS.md"); '
                        'print(json.dumps([r,crewguard.approval_rules(r)]))')
            self.assertIsNone(result[0]['guard_context']['cwd'])
            self.assertIsNone(result[1])

    def test_legacy_contextless_approval_does_not_authorize_a_fresh_contextual_run(self):
        request = self.request()
        request.pop('guard_context')
        (self.data / 'crew-approvals' / (request['id']+'.json')).write_text(json.dumps(request))
        approved = owner(self.env,self.data,'approve',request['id'])
        self.assertEqual(approved.returncode,0,approved.stderr)
        self.assertIsNotNone(self.request())

class NestedCwdPipeline(Base):
    def setUp(self):
        super().setUp()
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

    def test_substitution_or_subshell_cd_cannot_hide_an_outer_live_commit(self):
        outside = shlex.quote(str(self.root))
        children = [f'echo $(cd {outside}; git status)',
                    f'(cd {outside}; git status)',
                    f'echo `cd {outside}; git status`',
                    f'echo "$(cd {outside}; git status)"']
        commands = [child + '; git commit -am update' for child in children]
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.repo)!r}
out=[]
for command in {commands!r}:
    request=crewguard.check('tH','Helper','build',command)
    out.append([bool(request),('nested-cwd' in request['guard_context']['rules']) if request else False])
print(json.dumps(out))''')
        self.assertEqual(results, [[True, True]] * len(commands))

    def test_substitution_readonly_and_quoted_controls_stay_free(self):
        commands = ['echo $(git status)', '(git status); git log -1', 'echo `git status`',
                    'echo "$(git status)"', "printf '%s' '$(git commit -am update)'",
                    "printf '%s' '`git commit -am update`'", 'printf "%s" "(git commit -am update)"',
                    "cat <<'DOC' > notes.txt\n$(git commit -am update)\nDOC"]
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.repo)!r}
print(json.dumps([crewguard.matches(command) for command in {commands!r}]))''')
        self.assertEqual(results, [None] * len(commands))

    def test_skipped_conditional_or_loop_cd_cannot_hide_an_outer_live_commit(self):
        outside = shlex.quote(str(self.root))
        commands = [f'if false; then cd {outside}; fi; git commit -am update',
                    f'while false; do cd {outside}; done; git commit -am update',
                    f'cd {outside} | cat; git commit -am update',
                    f'true || cd {outside}; git commit -am update',
                    f'false && cd {outside}; git commit -am update']
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.repo)!r}
out=[]
for command in {commands!r}:
    request=crewguard.check('tH','Helper','build',command)
    out.append([bool(request),('nested-cwd' in request['guard_context']['rules']) if request else False])
print(json.dumps(out))''')
        self.assertEqual(results, [[True, True]] * len(commands))

    def test_conditional_readonly_and_quoted_controls_stay_free(self):
        commands = ['if true; then git status; else git log -1; fi',
                    'while false; do git status; done',
                    'git status | cat', 'true || git status', 'true && git status',
                    "printf '%s' 'if true; then git commit -am update; fi'",
                    "cat <<'DOC' > notes.txt\nwhile true; do git commit -am update; done\nDOC"]
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.repo)!r}
print(json.dumps([crewguard.matches(command) for command in {commands!r}]))''')
        self.assertEqual(results, [None] * len(commands))

    def test_nested_candidate_overflow_requires_owner_at_initial_gate(self):
        code = 'import os; ' + '; '.join(f'os.system("echo {i}")' for i in range(201))
        code += '; os.system("git commit -am update")'
        self.assert_nested_requires_owner(code)

    def test_interpreter_literal_overflow_requires_owner_at_initial_gate(self):
        code = 'import os; print(' + ','.join(repr(str(i)) for i in range(41))
        code += ',os.system("git commit -am update"))'
        self.assert_nested_requires_owner(code)

    def test_help_as_git_argument_does_not_hide_a_nested_mutation(self):
        for command in ('git commit --allow-empty -m "--help"',
                        'git commit -m update -- --help'):
            with self.subTest(command=command):
                self.assert_nested_requires_owner('import os; os.system(' + repr(command) + ')')

    def test_quoted_documentation_and_file_heredocs_are_not_execution(self):
        commands = ["printf '%s' \"sh -c 'git commit -am update'\"",
                    "cat <<'DOC' > notes.txt\nsh -c 'git commit -am update'\nDOC",
                    'python3 -c ' + shlex.quote('print("git commit -am update")')]
        results = py(self.env, f'''import crewguard
crewguard.HOOK_CWD={str(self.root)!r}
print(json.dumps([crewguard.matches(command) for command in {commands!r}]))''')
        self.assertEqual(results, [None, None, None])

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

    def assert_nested_requires_owner(self, code):
        nested = 'python3 -c ' + shlex.quote(code)
        for command in (nested, 'printf x > AGENTS.md; ' + nested):
            request = self.request(command)
            self.assertIsNotNone(request)
            self.assertIn('nested-cwd',request['guard_context']['rules'])
        self.assertEqual((self.repo / 'AGENTS.md').read_text(),'fixture history\n')

    def test_readonly_nested_git_stays_free_and_push_keeps_its_rule(self):
        for inner in ('git branch --list','git branch --show-current','git symbolic-ref HEAD',
                      'git worktree list','git fetch --help','git status --short','printf "git commit -am update"'):
            command = 'sh -c ' + shlex.quote(inner)
            self.assertIsNone(self.request(command),command)
        request = self.request("sh -c 'git push origin main'")
        self.assertIn('push',request['guard_context']['rules'])
        self.assertNotIn('nested-cwd',request['guard_context']['rules'])


class FullGuardContext(Base):
    """Standing Full grants retain context and protected-operation boundaries; no tap authority."""
    def setUp(self):
        super().setUp()
        self.env['PAL_HELPER_PLAIN_KEYS'] = '1'
        r = owner(self.env,self.data,'settings','trust-helper','Pals','level','full')
        self.assertEqual(r.returncode,0,r.stderr)

    def request(self, command):
        return py(self.env, f'import crewguard; crewguard.HOOK_CWD={str(self.root)!r}; '
                  f'print(json.dumps(crewguard.check("tH","Helper","build",{command!r})))')

    def record(self, rid):
        return json.loads((self.data/'crew-approvals'/(rid+'.json')).read_text())

    def test_full_can_approve_ordinary_uncertain_git_once(self):
        command = "sh -c 'git commit -am update'"
        request = self.request(command)
        self.assertIn('nested-cwd',request['guard_context']['rules'])
        r = helper(self.env,'approve',request['id'])
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(self.record(request['id'])['delegated']['helper'],'Pals')
        self.assertIsNone(self.request(command))
        self.assertIsNotNone(self.request(command))

    def test_full_cannot_approve_unknown_context_or_nested_protected_edits(self):
        command = 'git push origin main; python3 -c ' + shlex.quote('import os; os.system("echo x > data/crew-helpers/helpers.json")')
        request = self.request(command)
        self.assertIn('helper-key',request['guard_context']['rules'])
        r = helper(self.env,'approve',request['id'])
        self.assertNotEqual(r.returncode,0)
        self.assertIn('trust or audit',r.stderr)
        request = self.request('git push origin other')
        request.pop('guard_context')
        (self.data/'crew-approvals'/(request['id']+'.json')).write_text(json.dumps(request))
        r = helper(self.env,'approve',request['id'])
        self.assertNotEqual(r.returncode,0)
        self.assertIn('execution context',r.stderr)

    def test_full_cannot_decide_a_heredoc_that_expands_unseen_code(self):
        """#codex-sol T212 round 7: an unquoted heredoc's body runs $( … ) when the line runs, but the
        rules read the line with bodies dropped, so a push plus a click-evidence write in a heredoc
        body showed only the push. Such a line, or a << with no readable body, is the owner's alone."""
        target = 'data/' + 'crew-clicks' + '/fake.json'
        bodies = ['$(echo fake > ' + target + ')', '`echo fake > ' + target + '`', '${x:=$(echo fake > ' + target + ')}']
        unvouched = ['git push origin main; cat <<DOC > notes.txt\n' + b + '\nDOC' for b in bodies]
        unvouched.append('git push origin main; cat <<DOC > notes.txt\nno end marker')
        for command in unvouched:
            with self.subTest(command=command):
                request = self.request(command)
                self.assertIsNotNone(request)
                r = helper(self.env,'approve',request['id'])
                self.assertNotEqual(r.returncode,0)
                self.assertIn('trust or audit',r.stderr)
                self.assertEqual(self.record(request['id'])['status'],'pending')
        # The consumption side reads the same boundary: a stamped record of such a line isn't current.
        self.assertEqual(py(self.env, f'import crewguard; print(json.dumps([crewguard.delegation_allowed(c,"push") for c in {unvouched!r}]))'),
                         [False] * len(unvouched))
        # Controls: a quoted heredoc's body is text, and a plain heredoc without expansions stays ordinary.
        for command in ["git push origin main; cat <<'DOC' > notes.txt\n" + bodies[0] + "\nDOC",
                        'git push origin main; cat <<DOC > notes.txt\nplain text, $HOME is fine\nDOC']:
            with self.subTest(control=command):
                request = self.request(command)
                r = helper(self.env,'approve',request['id'])
                self.assertEqual(r.returncode,0,r.stderr)

    def test_saved_protected_rules_cannot_disappear_before_full_decision(self):
        request = self.request('git push origin main')
        request['guard_context']['rules'].append('helper-key')
        (self.data/'crew-approvals'/(request['id']+'.json')).write_text(json.dumps(request))
        r = helper(self.env,'approve',request['id'])
        self.assertNotEqual(r.returncode,0)
        self.assertEqual(self.record(request['id'])['status'],'pending')

    def test_context_mutation_invalidates_full_snapshot(self):
        command = 'git push origin main'
        request = self.request(command)
        r = helper(self.env,'approve',request['id']); self.assertEqual(r.returncode,0,r.stderr)
        approved = self.record(request['id'])
        approved['guard_context']['rules'].append('invented-rule')
        (self.data/'crew-approvals'/(request['id']+'.json')).write_text(json.dumps(approved))
        self.assertIsNotNone(self.request(command))
        self.assertEqual(self.record(request['id'])['status'],'expired')

    def test_claim_bookkeeping_preserves_full_stamp_but_claims_once(self):
        command = './release 9.9.9 notes'
        request = self.request(command)
        r = helper(self.env,'approve',request['id']); self.assertEqual(r.returncode,0,r.stderr)
        self.assertIsNone(self.request(command))
        result = py(self.env, f'''import crewguard
words=crewguard.handover_words({command!r})
first=crewguard.recently_used('tH','release-script',words=words,cwd={str(self.root)!r})
record=next(r for r in crewguard.all_requests() if r['id']=={request['id']!r})
current=crewguard._delegation_current(record)
second=crewguard.recently_used('tH','release-script',words=words,cwd={str(self.root)!r})
print(json.dumps([bool(first),bool(record.get('claimed')),current,second]))''')
        self.assertEqual(result,[True,True,True,None])

    def test_handoff_invalidates_unclaimed_full_approval(self):
        command = './release 9.9.9 notes'
        request = self.request(command)
        r = helper(self.env,'approve',request['id']); self.assertEqual(r.returncode,0,r.stderr)
        self.assertIsNone(self.request(command))
        result = py(self.env, f'''import crewguard,crewhandoff
crewhandoff.void_approvals('tH')
record=next(r for r in crewguard.all_requests() if r['id']=={request['id']!r})
print(json.dumps([record.get('claimed_by'),crewguard._delegation_current(record),
    crewguard.recently_used('tH','release-script',words=crewguard.handover_words({command!r}),cwd={str(self.root)!r})]))''')
        self.assertEqual(result,['handoff',True,None])

    def test_revocation_invalidates_unclaimed_full_handover(self):
        command = './release 9.9.9 notes'
        request = self.request(command)
        r = helper(self.env,'approve',request['id']); self.assertEqual(r.returncode,0,r.stderr)
        self.assertIsNone(self.request(command))
        r = owner(self.env,self.data,'settings','trust-helper','Pals','level','off')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIsNone(py(self.env, f'import crewguard; print(json.dumps(crewguard.recently_used("tH","release-script",'
                             f'words=crewguard.handover_words({command!r}),cwd={str(self.root)!r})))'))

    def test_handover_from_different_cwd_cannot_spend_human_or_full_approval(self):
        elsewhere = self.root / 'elsewhere'; elsewhere.mkdir()
        for actor in ('owner','full'):
            command = './release 9.9.9 ' + actor
            request = self.request(command)
            answer = owner(self.env,self.data,'approve',request['id']) if actor == 'owner' else helper(self.env,'approve',request['id'])
            self.assertEqual(answer.returncode,0,answer.stderr)
            self.assertIsNone(self.request(command))  # the hook lets the original cwd run
            result = py(self.env, f'''import os,crewguard
os.chdir({str(elsewhere)!r})
other=crewguard.owner_step('tH','Helper','build',{command!r},'release-script')
record=next(r for r in crewguard.all_requests() if r['id']=={request['id']!r})
os.chdir({str(self.root)!r})
same=crewguard.owner_step('tH','Helper','build',{command!r},'release-script')
again=crewguard.owner_step('tH','Helper','build',{command!r},'release-script')
print(json.dumps([bool(other),bool(record.get('claimed')),same,bool(again)]))''')
            self.assertEqual(result,[True,False,None,True],actor)

    def test_handover_without_saved_context_requires_a_fresh_approval(self):
        command = './release 9.9.9 unknown-context'
        request = self.request(command)
        answer = owner(self.env,self.data,'approve',request['id'])
        self.assertEqual(answer.returncode,0,answer.stderr)
        self.assertIsNone(self.request(command))
        record = self.record(request['id']); record.pop('guard_context')
        (self.data/'crew-approvals'/(request['id']+'.json')).write_text(json.dumps(record))
        result = py(self.env, f'''import os,crewguard
os.chdir({str(self.root)!r})
print(json.dumps(crewguard.owner_step('tH','Helper','build',{command!r},'release-script')))''')
        self.assertIsNotNone(result)
