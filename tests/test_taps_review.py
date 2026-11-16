"""Old execution tokens cannot survive migration, mutation, or replay."""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_taps import Taps
from test_desk import pal, py


class LegacyTokens(Taps):
    def test_well_formed_legacy_token_never_answers_home(self):
        self.old_flags(); h=self.legacy_hold(status='running'); args=['home','answer',h['item'],'Yes']
        d=self.dir/'run'; d.mkdir(parents=True)
        nonce='ab'*16
        token={'args':args,'at':int(time.time()*1000),'hold':h['id'],'helper':'Pals','relayed':'old yes'}
        path=d/(nonce+'.json'); path.write_text(json.dumps(token))
        for attempt in range(2):
            r=pal(self.env,*args,'--tap',nonce)
            self.assertNotEqual(r.returncode,0)
        self.assertFalse(path.exists())
        self.assertEqual(py(self.env,f'import crewhome; print(json.dumps(crewhome._find(crewhome.load(), {h["item"]!r})["status"]))'),'open')

    def test_migration_discards_every_old_token_without_consuming_new_grants(self):
        d=self.dir/'run'; d.mkdir(parents=True)
        for name in ('ab'*16,'cd'*16):
            (d/(name+'.json')).write_text(json.dumps({'args':['approve','a-123456'],'at':int(time.time()*1000)}))
        py(self.env,'import crewtaps; print(json.dumps(crewtaps.run_due()))')
        self.assertFalse(list(d.glob('*.json')))
        current=py(self.env,'import crewhelpers; print(json.dumps(crewhelpers.level(crewhelpers._load()["helpers"]["Pals"])))')
        self.assertEqual(current,'work')

    def test_bad_token_path_cannot_read_or_remove_unrelated_files(self):
        keep=self.data/'keep.json'; keep.write_text('preserve')
        result=py(self.env,'import crewtaps; print(json.dumps([crewtaps.take_run_token(["approve","a-123456"], x) for x in ("../../keep", "", "xyz")]))')
        self.assertEqual(result,[None,None,None])
        self.assertEqual(keep.read_text(),'preserve')
