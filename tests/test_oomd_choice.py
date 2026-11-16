"""T202: a remembered oomd drop-in opt-out survives installs, updates and rollback.

Real installers use throwaway homes and fake systemctl/herdr-app/hc from Sandbox.
Updater downloads are local fixtures; no network or live user services are used.
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_uninstall import Sandbox

BIN = Path(__file__).resolve().parent.parent / 'bin'
REL = Path('.config/systemd/user/hc-hold-.service.d/00-project-pals-oomd.conf')


class OomdChoice(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()
        (self.sb.shims / 'systemctl').write_text('#!/bin/sh\nexit 0\n')
        self.data = self.sb.app / 'data'
        self.data.mkdir()
        self.record = self.data / 'crew-install.json'
        self.dropin = self.sb.home / REL

    def tearDown(self):
        self.sb.close()

    def install(self, *flags):
        return self.sb.install('--no-claude-hooks', '--no-agy-hooks', *flags)

    def state(self):
        return json.loads(self.record.read_text())

    def python(self, code):
        r = self.sb.run(sys.executable, '-c',
                        f'import sys, json\nsys.path.insert(0, {str(BIN)!r})\n' + code,
                        HERDR_APP_HOME=str(self.sb.app))
        return json.loads(r.stdout.strip().splitlines()[-1])

    def test_opt_out_is_saved_and_reused_by_reinstall_and_all_install_sources(self):
        self.install('--no-oomd-dropin')
        self.assertIs(self.state().get('oomd_dropin'), False)
        for flags in ((), ('--from-release',), ('--from-live', '--keep-crewd'), ('--from-try', '--keep-crewd')):
            with self.subTest(flags=flags):
                self.install(*flags)
                self.assertIs(self.state()['oomd_dropin'], False)
                self.assertFalse(self.dropin.exists())

    def test_default_on_can_be_disabled_and_explicitly_reenabled(self):
        self.install()
        self.assertIs(self.state().get('oomd_dropin'), True)
        self.assertTrue(self.dropin.exists())
        self.install('--no-oomd-dropin')
        self.assertIs(self.state()['oomd_dropin'], False)
        self.assertFalse(self.dropin.exists())
        self.install('--oomd-dropin')
        self.assertIs(self.state()['oomd_dropin'], True)
        self.assertTrue(self.dropin.exists())

    def test_no_helpers_still_records_the_choice_for_a_later_helper_install(self):
        self.install('--no-helpers', '--no-oomd-dropin')
        self.assertIs(self.state().get('oomd_dropin'), False)
        self.install()
        self.assertFalse(self.dropin.exists())
        self.install('--no-helpers', '--oomd-dropin')
        self.assertIs(self.state()['oomd_dropin'], True)
        self.assertFalse(self.dropin.exists())
        self.install()
        self.assertTrue(self.dropin.exists())

    def test_legacy_record_without_a_choice_keeps_the_default(self):
        self.record.write_text(json.dumps({'version': '0.4.3', 'helpers': True}))
        self.install()
        self.assertIs(self.state().get('oomd_dropin'), True)
        self.assertTrue(self.dropin.exists())

    def test_owner_edited_dropin_is_preserved_while_disabling_or_reenabling(self):
        mine = '[Service]\nManagedOOMPreference=omit\n# owner edited\n'
        self.dropin.parent.mkdir(parents=True)
        self.dropin.write_text(mine)
        for flags in (('--no-oomd-dropin',), (), ('--oomd-dropin',)):
            self.install(*flags)
            self.assertEqual(self.dropin.read_text(), mine)

    def test_stable_live_and_trial_updaters_pass_the_opt_out_even_without_helpers(self):
        # A tiny checked release whose installer only records argv. This tests real updater dispatch.
        for helpers in (True, False):
            self.record.write_text(json.dumps({'version': '0.0.1', 'helpers': helpers, 'oomd_dropin': False}))
            out = self.python('''import hashlib, io, tarfile
from pathlib import Path
import crewupdate
root = Path.home() / 'build'
root.mkdir(exist_ok=True)
(root / 'VERSION').write_text('0.0.2')
(root / 'install.sh').write_text('#!/bin/sh\\nprintf "%s\\\\n" "$@" > "$HERDR_APP_HOME/args"\\n')
archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode='w:gz') as tar:
    tar.add(root, arcname='build')
body = archive.getvalue()
sums = (hashlib.sha256(body).hexdigest() + '  pals.tar.gz\\n').encode()
crewupdate.check = lambda: {'latest': '0.0.2', 'available': True,
    'assets': [{'name': 'pals.tar.gz', 'url': 'fixture:tar'}, {'name': 'SHA256SUMS', 'url': 'fixture:sums'}]}
crewupdate.fetch = lambda url, **kw: body if url == 'fixture:tar' else sums
crewupdate.verify = lambda *a, **kw: None
results = []
crewupdate.apply(log=lambda *a: None)
results.append((crewupdate.HOME / 'args').read_text().splitlines())
for source in ('live', 'try'):
    crewupdate.install_tree(root, source, log=lambda *a: None)
    results.append((crewupdate.HOME / 'args').read_text().splitlines())
print(json.dumps(results))
''')
            for args in out:
                self.assertIn('--no-oomd-dropin', args)
                self.assertEqual('--no-helpers' in args, not helpers)

    def test_rollback_keeps_the_latest_opt_out_even_when_the_snapshot_had_ours(self):
        for old in (None, True):
            with self.subTest(old=old):
                out = self.python(f'''from pathlib import Path
import crewmem, crewupdate
record = {{'version': '0.0.1'}}
if {old!r} is not None:
    record['oomd_dropin'] = {old!r}
crewupdate.save_json(crewupdate.INSTALL, record)
p = Path.home() / {str(REL)!r}
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(crewmem.DROPIN_TEXT)
snap = crewupdate._snapshot('test-choice')
crewupdate.save_json(crewupdate.INSTALL, {{'version': '0.0.2', 'oomd_dropin': False}})
p.unlink()
crewupdate.rollback(snap, log=lambda *a: None)
print(json.dumps([crewupdate.installed().get('oomd_dropin'), p.exists(), crewupdate.installed()['version']]))
''')
                self.assertEqual(out, [False, False, '0.0.1'])

    def test_rollback_keeps_the_latest_reenable_choice_and_owner_edits(self):
        out = self.python(f'''from pathlib import Path
import crewmem, crewupdate
p = Path.home() / {str(REL)!r}
crewupdate.save_json(crewupdate.INSTALL, {{'version': '0.0.1', 'oomd_dropin': False}})
snap = crewupdate._snapshot('test-choice')
crewupdate.save_json(crewupdate.INSTALL, {{'version': '0.0.2', 'oomd_dropin': True}})
crewupdate.rollback(snap, log=lambda *a: None)
enabled = crewupdate.installed().get('oomd_dropin')
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(crewmem.DROPIN_TEXT)
snap = crewupdate._snapshot('test-choice-owner')
crewupdate.save_json(crewupdate.INSTALL, {{'version': '0.0.3', 'oomd_dropin': False}})
p.write_text('owner edited')
crewupdate.rollback(snap, log=lambda *a: None)
print(json.dumps([enabled, crewupdate.installed().get('oomd_dropin'), p.read_text()]))
''')
        self.assertEqual(out, [True, False, 'owner edited'])

    def test_rollback_honors_a_saved_opt_out_if_an_older_installer_dropped_the_field(self):
        out = self.python(f'''from pathlib import Path
import crewmem, crewupdate
p = Path.home() / {str(REL)!r}
p.parent.mkdir(parents=True)
p.write_text(crewmem.DROPIN_TEXT)
# --no-helpers can save an opt-out without touching an existing systemd file.
crewupdate.save_json(crewupdate.INSTALL, {{'version': '0.0.1', 'oomd_dropin': False}})
snap = crewupdate._snapshot('test-choice-legacy-installer')
crewupdate.save_json(crewupdate.INSTALL, {{'version': '0.0.2'}})
crewupdate.rollback(snap, log=lambda *a: None)
print(json.dumps([crewupdate.installed().get('oomd_dropin'), p.exists()]))
''')
        self.assertEqual(out, [False, False])
