"""Helper authentication needs recovered primary state, never a stale backup fallback.

Legacy On/Off state, synthetic credentials and throwaway HOME/data only.
"""
import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, py


class HelperRecoveryAuth(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.env["PAL_HELPER_PLAIN_KEYS"] = "1"

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def run_code(self, code):
        return py(self.env, "import crewhelpers as h\nfrom unittest.mock import patch\n"
                  "h.inside_herdr=lambda: None\n" + code)

    def test_never_configured_helper_keeps_the_missing_helper_error(self):
        out = self.run_code("""
with patch.object(h, '_read_key', side_effect=AssertionError('must not read a key')):
    try:
        h.verify('Pals'); result='accepted'
    except h.HelperError as e:
        result=str(e)
print(json.dumps(result))
""")
        self.assertEqual(out, "there's no helper called Pals")

    def test_stale_backup_cannot_authenticate_when_recovery_write_fails(self):
        for damage in ("h.FILE.unlink()", "h.FILE.write_text('{broken')"):
            with self.subTest(damage=damage):
                out = self.run_code("""
h.switch('Pals', True)
stale=json.loads(h.BACKUP.read_text()); stale['at']=1000
h.BACKUP.write_text(json.dumps(stale))
# An older build saved the owner's Off only to the primary list.
off=h._load(); off['helpers']['Pals']['on']=False
h.FILE.write_text(json.dumps(off))
(h.DATA/'crew-install.json').write_text(json.dumps({'installed':2}))
""" + damage + """
reads=[]
read_key=h._read_key
def tracked_read(path):
    reads.append(True)
    return read_key(path)
with patch.object(h, '_private', side_effect=OSError('fixture recovery failure')), patch.object(h, '_read_key', tracked_read):
    try:
        h.verify('Pals')
        result='accepted'
    except h.HelperError:
        result='refused'
print(json.dumps({'result':result, 'key_reads':len(reads), 'primary':h._helpers_in(h.FILE),
                  'display_fallback_on':h._load()['helpers']['Pals']['on']}))
""")
                self.assertEqual(out, {"result": "refused", "key_reads": 0,
                                       "primary": None, "display_fallback_on": True})

    def test_successful_current_recovery_can_authenticate(self):
        out = self.run_code("""
h.switch('Pals', True)
h.FILE.write_text('{broken')
name, _=h.verify('Pals')
print(json.dumps({'name':name, 'on':h._helpers_in(h.FILE)['Pals']['on']}))
""")
        self.assertEqual(out, {"name": "Pals", "on": True})

    def test_successful_stale_recovery_stays_off(self):
        out = self.run_code("""
h.switch('Pals', True)
stale=json.loads(h.BACKUP.read_text()); stale['at']=1000
h.BACKUP.write_text(json.dumps(stale))
(h.DATA/'crew-install.json').write_text(json.dumps({'installed':2}))
h.FILE.unlink()
try:
    h.verify('Pals'); result='accepted'
except h.HelperError:
    result='refused'
print(json.dumps({'result':result, 'on':h._helpers_in(h.FILE)['Pals']['on']}))
""")
        self.assertEqual(out, {"result": "refused", "on": False})


if __name__ == '__main__':
    unittest.main()
