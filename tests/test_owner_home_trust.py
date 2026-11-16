"""T220: owner-only Home decisions and future trust-change provenance. Synthetic state only."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_helpers import Base, helper, log
from test_desk import owner, pal, py, queue, OWNER, click


class OwnerOnlyHome(Base):
    def setUp(self):
        super().setUp()
        self.env['PAL_HELPER_PLAIN_KEYS'] = '1'

    def level(self, value):
        r = owner(self.env, self.data, 'settings', 'trust-helper', 'Pals', 'level', value)
        self.assertEqual(r.returncode, 0, r.stderr)

    def ask(self, owner_only=True):
        args = ['home', 'ask', 'Reserved decision?', '--option', 'Yes', '--option', 'No']
        if owner_only:
            args.append('--owner-only')
        r = pal(self.env, *args, term='tW')
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.split()[0]

    def item(self, iid):
        return py(self.env, f'import crewhome; print(json.dumps(crewhome._find(crewhome.load(), {iid!r})))')

    def test_cli_helpers_at_every_level_cannot_answer_owner_only(self):
        self.level('work')
        for value in ('off', 'work', 'full'):
            with self.subTest(level=value):
                self.level(value)
                iid = self.ask()
                before = queue(self.data, 'tW')
                r = helper(self.env, 'home', 'answer', iid, 'Yes')
                self.assertNotEqual(r.returncode, 0, r.stdout + r.stderr)
                self.assertEqual(self.item(iid)['status'], 'open')
                self.assertEqual(queue(self.data, 'tW'), before)

    def test_direct_mutation_rejects_claimed_helpers_at_every_level(self):
        self.level('work')
        for value in ('off', 'work', 'full'):
            with self.subTest(level=value):
                self.level(value)
                iid = self.ask()
                out = py(self.env, f'''import os,crewhome,crewhelpers
crewhelpers.inside_herdr=lambda: None
os.environ['PAL_HELPER']='Pals'
try:
    crewhome.answer({iid!r}, 'Yes', by={OWNER!r}); result='accepted'
except crewhome.HomeError:
    result='refused'
print(json.dumps([result,crewhome._find(crewhome.load(),{iid!r})['status']]))''')
                self.assertEqual(out, ['refused', 'open'])

    def test_direct_full_authority_cannot_answer_a_parked_owner_only_ask(self):
        self.level('full')
        iid = self.ask()
        out = py(self.env, f'''import os,crewhome,crewhelpers
crewhelpers.inside_herdr=lambda: None
crewhome.park({iid!r},by='Worker#general')
os.environ['PAL_HELPER']='Pals'
authority=crewhelpers.full_authority()
try:
    crewhome.answer({iid!r}, 'Yes', by={OWNER!r}, delegated=authority); result='accepted'
except crewhome.HomeError:
    result='refused'
print(json.dumps([result,crewhome._find(crewhome.load(),{iid!r})['status']]))''')
        self.assertEqual(out, ['refused', 'parked'])

    def test_owner_label_without_a_click_is_not_owner_only_authority(self):
        iid = self.ask()
        out = py(self.env, f'''import crewhome
try:
    crewhome.answer({iid!r}, 'Yes', by={OWNER!r}); result='accepted'
except crewhome.HomeError:
    result='refused'
print(json.dumps([result,crewhome._find(crewhome.load(),{iid!r})['status']]))''')
        self.assertEqual(out, ['refused', 'open'])

    def test_owner_proof_does_not_override_claimed_or_carried_helper_authority(self):
        for carried in ('claimed', 'delegated', 'tapped'):
            with self.subTest(carried=carried):
                iid=self.ask()
                args=['home','answer',iid,'Yes']
                nonce=click(self.data,args)
                out=py(self.env, f"""import os,crewlib,crewhome
crewlib.prove_owner({args!r},{nonce!r})
kwargs={{}}
if {carried!r}=='claimed': os.environ['PAL_HELPER']='Pals'
else: kwargs[{carried!r}]={{'helper':'Pals'}}
try:
    crewhome.answer({iid!r},'Yes',by={OWNER!r},**kwargs); result='accepted'
except crewhome.HomeError:
    result='refused'
print(json.dumps([result,crewhome._find(crewhome.load(),{iid!r})['status']]))""")
                self.assertEqual(out,['refused','open'])

    def test_real_owner_click_can_answer_owner_only(self):
        iid = self.ask()
        r = owner(self.env, self.data, 'home', 'answer', iid, 'Yes')
        self.assertEqual(r.returncode, 0, r.stderr)
        item = self.item(iid)
        self.assertEqual((item['status'], item['answer'], item['closed_by']), ('answered', 'Yes', OWNER))
        self.assertNotIn('delegated', item)

    def test_full_can_still_answer_an_ordinary_question(self):
        self.level('full')
        iid = self.ask(owner_only=False)
        r = helper(self.env, 'home', 'answer', iid, 'Yes')
        self.assertEqual(r.returncode, 0, r.stderr)
        item = self.item(iid)
        self.assertEqual(item['status'], 'answered')
        self.assertEqual(item['delegated']['helper'], 'Pals')
        self.assertEqual(item['closed_by'], 'Pals acted under Full control')

    def test_mutation_rechecks_a_new_owner_only_mark(self):
        self.level('full')
        iid = self.ask(owner_only=False)
        pre = ("import crewhome\noriginal_answer=crewhome.answer\n"
               "def changed(iid,*args,**kwargs):\n"
               " crewhome.owner_only(iid,by='Worker#general')\n"
               " return original_answer(iid,*args,**kwargs)\ncrewhome.answer=changed")
        r = helper(self.env, 'home', 'answer', iid, 'Yes', pre=pre)
        self.assertNotEqual(r.returncode, 0, r.stdout + r.stderr)
        item = self.item(iid)
        self.assertTrue(item['owner_only'])
        self.assertEqual(item['status'], 'open')


class TrustProvenance(Base):
    def setUp(self):
        super().setUp()
        self.env['PAL_HELPER_PLAIN_KEYS'] = '1'

    def test_future_owner_click_level_changes_record_actor_source_and_grant(self):
        for value in ('work', 'full', 'off'):
            with self.subTest(level=value):
                r = owner(self.env, self.data, 'settings', 'trust-helper', 'Pals', 'level', value)
                self.assertEqual(r.returncode, 0, r.stderr)
                event = [e for e in log(self.data) if e['kind'] == 'switch'][-1]
                entry = py(self.env, "import crewhelpers as h; print(json.dumps(h._load()['helpers']['Pals']))")
                self.assertEqual((event.get('actor'), event.get('source')), (OWNER, 'app-click'))
                self.assertEqual((event['level'], event['grant']), (value, entry['grant']))

    def test_legacy_switch_and_rotation_clicks_record_provenance(self):
        for operation in ('on', 'rotate', 'off'):
            with self.subTest(operation=operation):
                r = owner(self.env, self.data, 'helpers', 'Pals', operation)
                self.assertEqual(r.returncode, 0, r.stderr)
                event = [e for e in log(self.data) if e['kind'] == 'switch'][-1]
                entry = py(self.env, "import crewhelpers as h; print(json.dumps(h._load()['helpers']['Pals']))")
                self.assertEqual((event.get('actor'), event.get('source')), (OWNER, 'app-click'))
                self.assertEqual((event.get('level'), event.get('grant')), (entry['level'], entry['grant']))

    def test_ungated_local_api_does_not_claim_an_owner_click(self):
        event = py(self.env, "import crewhelpers as h; h.set_level('Pals','work'); "
                   "print(json.dumps([e for e in h.entries() if e['kind']=='switch'][-1]))")
        self.assertEqual((event.get('actor'), event.get('source')), ('unknown', 'local-api'))

    def test_exact_operation_receipt_is_single_use_and_never_logs_nonce(self):
        args = ['helpers', 'Pals', 'level', 'work']
        nonce = click(self.data, args)
        events = py(self.env, f"""import crewhelpers as h, crewlib
args={args!r}
crewlib.owner_gate(args, click={nonce!r}, allow_delegate=False)
h.set_level('Pals','full',_click_args=args)
h.set_level('Pals','work',_click_args=args)
h.set_level('Pals','work',_click_args=args)
print(json.dumps([e for e in h.entries() if e['kind']=='switch']))""")
        self.assertEqual([(e['actor'], e['source']) for e in events],
                         [('unknown','local-api'), (OWNER,'app-click'), ('unknown','local-api')])
        self.assertNotIn(nonce, json.dumps(events))

    def test_wrong_argv_cannot_take_receipt(self):
        args = ['helpers', 'Pals', 'level', 'work']
        nonce = click(self.data, args)
        got = py(self.env, f"""import crewlib
crewlib.owner_gate({args!r}, click={nonce!r}, allow_delegate=False)
wrong=crewlib.take_owner_click_provenance(['helpers','Other','level','work'])
right=crewlib.take_owner_click_provenance({args!r})
print(json.dumps([wrong,right,crewlib.take_owner_click_provenance({args!r})]))""")
        self.assertEqual(got, [None, {'actor':OWNER,'source':'app-click'}, None])

    def test_failed_gate_clears_previous_audit_receipt(self):
        args = ['helpers', 'Pals', 'level', 'work']
        nonce = click(self.data, args)
        got = py(self.env, f"""import crewlib,contextlib,io
crewlib.owner_gate({args!r}, click={nonce!r}, allow_delegate=False)
try:
    with contextlib.redirect_stderr(io.StringIO()):
        crewlib.owner_gate({args!r}, click='invalid', allow_delegate=False)
except SystemExit:
    pass
print(json.dumps(crewlib.take_owner_click_provenance({args!r})))""")
        self.assertIsNone(got)

    def test_aliases_and_display_flag_keep_exact_click_provenance(self):
        for prefix in [('helpers',), ('settings','trust-helper'), ('settings','trusted-helpers'), ('settings','helpers')]:
            with self.subTest(prefix=prefix):
                r=owner(self.env,self.data,*prefix,'Pals','level','work','--json')
                self.assertEqual(r.returncode,0,r.stderr)
                event=[e for e in log(self.data) if e['kind']=='switch'][-1]
                self.assertEqual((event['actor'],event['source']),(OWNER,'app-click'))

    def test_historical_cli_log_does_not_invent_actor(self):
        py(self.env, "import crewhelpers as h; h.log('switch','Pals',action='on'); print('{}')")
        before=log(self.data)
        r=pal(self.env,'helpers','log')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('actor not recorded: on',r.stdout)
        self.assertNotIn(OWNER+': on',r.stdout)
        self.assertEqual(log(self.data),before)

    def test_local_off_notice_and_feed_do_not_claim_an_owner_click(self):
        got = py(self.env, """import crewhelpers as h,crewlib
h.set_level('Pals','work')
h.key_path('Pals').unlink()
h.check()
h.set_level('Pals','off')
notice=[e for e in h.entries() if e.get('reason')=='off'][-1]
feed=[json.loads(line) for line in crewlib.FEED.read_text().splitlines()]
print(json.dumps([notice,[e for e in feed if e.get('status')=='off'][-1]]))""")
        self.assertEqual(got[0]['text'], 'is off; its notice is closed')
        self.assertEqual(got[1]['text'], 'Pals is off')
        self.assertNotIn('click',json.dumps(got))
