"""Migration from relayed taps: legacy flags/holds never grant new decision authority.

The old delayed-approval integration behavior was intentionally retired. History stays readable;
standing Full control is tested separately through real CLI execution.
"""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_helpers import Base, helper
from test_desk import pal, owner, py


class Taps(Base):
    def setUp(self):
        super().setUp()
        self.env['PAL_HELPER_PLAIN_KEYS'] = '1'
        self.on()
        self.dir = self.data / 'crew-taps'

    def old_flags(self):
        py(self.env, '''import crewhelpers
h = crewhelpers._load()
h['helpers']['Pals']['taps'] = {'home': True, 'local': True, 'outward': True, 'hold': 0}
crewhelpers._save(h)
print(json.dumps(True))''')

    def ask(self):
        r = pal(self.env, 'home', 'ask', 'Proceed?', '--option', 'Yes', '--option', 'No', term='tW')
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout.split()[0]

    def legacy_hold(self, status='holding', kind='home', item=None, future=False):
        iid = item or self.ask()
        hold = {'id': 't-' + format(len(list((self.dir / 'holds').glob('*.json'))), '06x'), 'helper': 'Pals',
                'kind': kind, 'item': iid, 'cls': 'home' if kind == 'home' else 'outward', 'choice': 'Yes',
                'relayed': 'old reported words', 'title': 'Old decision', 'hash': 'old-snapshot',
                'at': int(time.time()*1000), 'run_at': int(time.time()*1000)+(999999 if future else -1), 'status': status}
        d = self.dir / 'holds'; d.mkdir(parents=True, exist_ok=True)
        (d / (hold['id']+'.json')).write_text(json.dumps(hold))
        return hold


class RetiredAuthorization(Taps):
    def test_work_only_legacy_flags_do_not_create_tickets_or_approve(self):
        self.old_flags(); iid = self.ask()
        rows = helper(self.env, 'taps', '--json')
        self.assertEqual(rows.returncode, 0, rows.stderr)
        item = next(x for x in json.loads(rows.stdout)['items'] if x['id']==iid)
        self.assertNotIn('ticket', item)
        self.assertIn('retired', item['not_tappable'])
        self.assertFalse((self.dir / 'tickets').exists())
        refused = helper(self.env, 'home', 'answer', iid, 'Yes')
        self.assertNotEqual(refused.returncode, 0)
        info = json.loads(owner(self.env, self.data, 'helpers', '--json').stdout)
        self.assertEqual(info['helpers'][0]['level'], 'work')

    def test_old_switch_endpoint_cannot_enable_or_adjust_taps(self):
        for setting, value in (('home','on'),('local','on'),('outward','on'),('hold','0')):
            with self.subTest(setting=setting):
                r=owner(self.env,self.data,'settings','trust-helper','Pals','taps',setting,value)
                self.assertNotEqual(r.returncode,0)
                self.assertIn('replaced',r.stderr)

    def test_no_tap_or_now_path_survives_even_with_full_control(self):
        self.old_flags()
        self.assertEqual(owner(self.env,self.data,'settings','trust-helper','Pals','level','full').returncode,0)
        h=self.legacy_hold()
        r=helper(self.env,'tap','k-'+'a'*12,'Yes','--relayed','yes')
        self.assertNotEqual(r.returncode,0)
        self.assertIn('retired',r.stderr)
        now=owner(self.env,self.data,'taps','now',h['id'])
        self.assertNotEqual(now.returncode,0)
        self.assertIn('retired',now.stderr)

    def test_migration_cancels_future_and_due_holds_without_running_subprocess(self):
        self.old_flags()
        a=self.legacy_hold(); b=self.legacy_hold(future=True)
        result=py(self.env,'''import crewtaps
crewtaps.subprocess.run=lambda *a, **k: (_ for _ in ()).throw(AssertionError('must not execute'))
print(json.dumps(crewtaps.run_due()))''')
        self.assertEqual({h['id'] for h in result},{a['id'],b['id']})
        self.assertTrue(all(h['status']=='cancelled' for h in result))
        self.assertEqual(py(self.env,'import crewtaps; print(json.dumps(crewtaps.run_due()))'),[])
        items=py(self.env,'import crewhome; print(json.dumps(crewhome.load()["items"]))')
        self.assertTrue(all(x['status']=='open' for x in items))

    def test_running_old_work_is_uncertain_and_history_is_preserved(self):
        running=self.legacy_hold(status='running'); completed=self.legacy_hold(status='done')
        donepath=self.dir/'holds'/(completed['id']+'.json'); old=donepath.read_bytes()
        out=py(self.env,'import crewtaps; print(json.dumps(crewtaps.run_due()))')
        self.assertEqual(out[0]['id'],running['id'])
        self.assertEqual(out[0]['status'],'failed')
        self.assertIn('uncertain',out[0].get('result',''))
        self.assertEqual(donepath.read_bytes(),old)
