"""Standing delegation through real CLI entry points, with fake app/services and temporary homes."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_helpers import Base, helper, log
from test_desk import owner, pal, py, card, cid_of


class FullControlCLI(Base):
    def setUp(self):
        super().setUp()
        self.env['PAL_HELPER_PLAIN_KEYS'] = '1'
        r = owner(self.env, self.data, 'settings', 'trust-helper', 'Pals', 'level', 'full')
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_full_answers_home_without_tickets_or_human_impersonation(self):
        r = pal(self.env, 'home', 'ask', 'Choose?', '--option', 'A', '--option', 'B', '--owner-only', term='tW')
        self.assertEqual(r.returncode, 0, r.stderr)
        home = self.data / 'crew-home' / 'home.json'
        ident = json.loads(home.read_text())['items'][-1]['id']
        r = helper(self.env, '--as-helper', 'home', 'answer', ident, 'B', name='')
        self.assertEqual(r.returncode, 0, r.stderr)
        item = json.loads(home.read_text())['items'][-1]
        self.assertEqual(item['answer'], 'B')
        self.assertEqual(item['delegated']['helper'], 'Pals')
        self.assertIn('Full control', item['closed_by'])
        c = card(self.env, cid_of(r.stdout))
        self.assertNotEqual(c['from_kind'], 'owner')
        self.assertIn('Full control', c['body'])
        self.assertFalse((self.data / 'crew-taps' / 'holds').exists())

    def test_owner_operations_and_audit(self):
        for args in [('settings', 'bypass', 'off'), ('factory', 'new', 'Studio')]:
            r = helper(self.env, '--as-helper', *args, name='')
            self.assertEqual(r.returncode, 0, r.stderr)
        actions = [e for e in log(self.data) if e.get('kind') == 'action']
        self.assertEqual([e['status'] for e in actions], ['started', 'done', 'started', 'done'])
        self.assertTrue(all(e['label'] == 'Pals acted under Full control' for e in actions))

    def test_full_cannot_change_any_helpers_trust(self):
        for args in [('helpers', 'Pals', 'level', 'full'), ('helpers', 'New Bot', 'level', 'full'),
                     ('settings', 'trust-helper', 'Pals', 'off'), ('helpers', 'Pals', 'rotate'),
                     ('helpers', 'Pals', 'remove'), ('helpers', 'Pals', 'taps', 'outward', 'on')]:
            r = helper(self.env, *args)
            self.assertNotEqual(r.returncode, 0, args)
        state = json.loads((self.data / 'crew-helpers' / 'helpers.json').read_text())['helpers']
        self.assertEqual(list(state), ['Pals'])
        self.assertEqual(state['Pals']['level'], 'full')

    def test_full_sends_to_owner_as_helper_and_does_not_deadlock(self):
        r = helper(self.env, 'desk', 'send', 'owner', 'Completed the work')
        self.assertEqual(r.returncode, 0, r.stderr)
        c = card(self.env, cid_of(r.stdout))
        self.assertEqual(c['from_kind'], 'helper')
        self.assertEqual(c['from'], 'Pals')
        self.assertEqual(c['delegated']['helper'], 'Pals')

    def test_work_only_and_revoked_cannot_do_owner_operations(self):
        for level in ('work', 'off'):
            r = owner(self.env, self.data, 'helpers', 'Pals', 'level', level)
            self.assertEqual(r.returncode, 0, r.stderr)
            r = helper(self.env, 'settings', 'bypass', 'on')
            self.assertNotEqual(r.returncode, 0)

    def test_full_writes_target_pal_page(self):
        text = self.root / 'page.md'; text.write_text('A helpful note\n')
        r = helper(self.env, 'page', 'write', 'A note', '--pal', 'Worker', '--file', str(text))
        self.assertEqual(r.returncode, 0, r.stderr)
        r = helper(self.env, 'page', 'rm', 'A note', '--pal', 'Worker')
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_room_uses_one_action_receipt_and_helper_attribution(self):
        rooms = self.data / 'crew-rooms'; rooms.mkdir()
        (rooms / 'club.json').write_text(json.dumps({'name':'club','members':[{'bot':'Helper','terminal':'tH','channel':'build'}]}))
        (rooms / 'club.jsonl').write_text(''.join(json.dumps({'from':'Worker','kind':'say','text':'earlier'})+'\n' for _ in range(20)))
        r = helper(self.env, 'room', 'say', 'club', '@Helper hello')
        self.assertEqual(r.returncode, 0, r.stderr)
        rows = [json.loads(x) for x in (rooms / 'club.jsonl').read_text().splitlines()]
        self.assertEqual(rows[-1]['from'], 'Pals acted under Full control')
        self.assertEqual(rows[-1]['to'], ['Helper'])
        actions = [e for e in log(self.data) if e.get('kind') == 'action']
        self.assertEqual([e['status'] for e in actions], ['started', 'done'])
        self.assertEqual(actions[0]['id'], actions[1]['id'])

    def test_failed_operation_receipt_contains_no_message_body(self):
        secret_body = 'private phrase not for audit'
        r = helper(self.env, 'home', 'answer', 'h-000000', secret_body)
        self.assertNotEqual(r.returncode, 0)
        events = [e for e in log(self.data) if e.get('kind') == 'action']
        self.assertEqual(events[-1]['status'], 'failed')
        self.assertNotIn(secret_body, json.dumps(events))

    def test_queued_request_is_bound_single_use_and_revocable(self):
        code = '''import crewhelpers, crewlib
crewhelpers.inside_herdr = lambda: None
crewlib.begin_delegation(['settings', 'head', 'Worker'])
payload = crewlib.stamp_delegated_request({'op':'record','by':None,'byName':'Pals','fields':{'brainIn':'pal'}})
crewlib.REQS.mkdir(parents=True, exist_ok=True)
crewlib.save_json(crewlib.REQS / 'test-request.work.json', payload)
print(json.dumps(payload))'''
        env = {**self.env, 'PAL_HELPER':'Pals'}
        payload = py(env, code)
        self.assertTrue(payload['delegation_token'])
        self.assertTrue(py(self.env, "import crewlib; print(json.dumps(crewlib.consume_delegated_request('test-request')))"))
        r = pal(self.env, 'delegation', 'consume-request', 'test-request')
        self.assertNotEqual(r.returncode, 0)
        py(env, code)
        owner(self.env, self.data, 'helpers', 'Pals', 'level', 'off')
        r = pal(self.env, 'delegation', 'consume-request', 'test-request')
        self.assertNotEqual(r.returncode, 0)

    def test_queue_revocation_cannot_be_removed_from_authenticated_text(self):
        env = {**self.env, 'PAL_HELPER':'Pals'}
        msg = py(env, '''import crewhelpers, crewlib
crewhelpers.inside_herdr=lambda:None
crewlib.begin_delegation(['room','say'])
print(json.dumps(crewlib.enqueue('tH','Act on this',sender='Pals')))
''')
        owner(self.env, self.data, 'helpers', 'Pals', 'level', 'off')
        out = py(self.env, f'import crewlib; print(json.dumps(crewlib.item_text({msg!r})))')
        self.assertIn('Cancelled', out)
        msg.pop('delegated')
        out = py(self.env, f'import crewlib; print(json.dumps(crewlib.item_text({msg!r})))')
        self.assertIn('unverified', out)

    def test_store_lock_is_reentrant_but_not_shared_between_threads(self):
        result = py(self.env, '''import crewlib, threading, time
entered = threading.Event()
def other():
    with crewlib.locked('helpers-send'): entered.set()
with crewlib.locked('helpers-send'):
    with crewlib.locked('helpers-send'): pass
    t=threading.Thread(target=other); t.start()
    blocked=not entered.wait(.1)
t.join(2)
print(json.dumps([blocked, entered.is_set()]))
''')
        self.assertEqual(result, [True, True])

    def test_revocation_while_waiting_for_update_lock_stops_the_update(self):
        result = py({**self.env, 'PAL_HELPER':'Pals'}, '''import crewhelpers, crewlib, runpy, threading, fcntl, os, time
crewhelpers.inside_herdr=lambda:None
crewlib.begin_delegation(['update','apply'])
api=runpy.run_path(str(__import__('pathlib').Path(crewlib.__file__).with_name('crew')))
f=open(crewlib.DATA / '.live-update.lock','w'); fcntl.flock(f, fcntl.LOCK_EX)
entered=[]
def waiting():
    try:
        with api['update_lock'](): entered.append('installed')
    except crewlib.CrewError: entered.append('revoked')
t=threading.Thread(target=waiting); t.start(); time.sleep(.1)
name=os.environ.pop('PAL_HELPER')
try: crewhelpers.switch('Pals',False)
finally: os.environ['PAL_HELPER']=name
fcntl.flock(f, fcntl.LOCK_UN); f.close(); t.join(5)
print(json.dumps(entered))
''')
        self.assertEqual(result, ['revoked'])

    def test_revocation_during_land_check_leaves_main_unchanged(self):
        import shlex
        from test_land_base import LandBase
        fixture = LandBase()
        fixture.setUp()
        try:
            fixture.env['PAL_HELPER_PLAIN_KEYS'] = '1'
            wt = fixture.topic('x'); fixture.commit_in(wt, 'x')
            r = owner(fixture.env, fixture.data, 'helpers', 'Pals', 'level', 'full')
            self.assertEqual(r.returncode, 0, r.stderr)
            from test_desk import BIN
            code = f"import os,sys; sys.path.insert(0,{str(BIN)!r}); os.environ.pop('PAL_HELPER',None); import crewhelpers; crewhelpers.switch('Pals',False)"
            r = helper(fixture.env, 'land', 'Builder#x', '--check', 'python3 -c ' + shlex.quote(code))
            self.assertNotEqual(r.returncode, 0)
            self.assertEqual(fixture.git('rev-parse', 'main'), fixture.main0)
        finally:
            fixture.tearDown()


if __name__ == '__main__':
    unittest.main()
