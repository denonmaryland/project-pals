"""Full-control trust storage: only explicit owner selection grants broad authority.

All data, keys and helper calls are synthetic in throwaway HOME/CREW_DATA folders. The real
owner's helper credentials and trust list are never read.
"""
import json
import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, py


class FullControlHelpers(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.env["PAL_HELPER_PLAIN_KEYS"] = "1"

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def run_code(self, code, helper=False):
        env = {**self.env, **({"PAL_HELPER": "Pals"} if helper else {})}
        return py(env, "import os, crewhelpers as h\nh.inside_herdr = lambda *a, **k: None\n" + code)

    def grant(self, value="full"):
        return self.run_code(f"n,e=h.set_level('Pals', {value!r}); print(json.dumps({{'name': n, 'level': h.level(e), 'grant': e['grant']}}))")

    def test_legacy_helpers_and_tap_flags_never_become_full(self):
        out = self.run_code("print(json.dumps([h.level(e) for e in [{}, {'on': False}, {'on': True}, "
                            "{'on': True, 'taps': {'home': True, 'local': True, 'outward': True}}, "
                            "{'on': True, 'level': 'full'}, {'on': True, 'level': 'unknown'}]]))")
        self.assertEqual(out, ["off", "off", "work", "work", "work", "off"])

    def test_explicit_selection_exposes_level_not_credentials(self):
        grant = self.grant()
        self.assertEqual(grant["level"], "full")
        shown = self.run_code("print(json.dumps(h.listing()))")
        self.assertEqual(shown["helpers"][0]["level"], "full")
        self.assertEqual(shown["helpers"][0]["grant"], grant["grant"])
        self.assertNotIn("palkey_", json.dumps(shown))
        self.assertEqual(len(grant["grant"]), 32)

    def test_full_authority_is_an_authenticated_helper_not_the_owner(self):
        grant = self.grant()
        auth = self.run_code("print(json.dumps(h.full_authority()))", helper=True)
        self.assertEqual(auth, {"helper": "Pals", "grant": grant["grant"], "label": "Pals acted under Full control"})
        self.assertIsNone(self.run_code("print(json.dumps(h.full_authority()))"))

    def test_card_guidance_uses_captured_authority_not_current_level(self):
        self.grant()
        text = self.run_code("print(json.dumps([h.limits('Pals'),h.limits('Pals', full=True)]))")
        self.assertIn("normal work", text[0])
        self.assertNotIn("acted under Full control", text[0])
        self.assertIn("act autonomously", text[1])
        self.assertIn("not Dee Tester's own click", text[1])
        self.assertIn("cannot promote themselves", text[1])

    def test_work_only_has_no_owner_authority(self):
        self.grant("work")
        self.assertIsNone(self.run_code("print(json.dumps(h.full_authority()))", helper=True))

    def test_invalid_claim_is_not_downgraded_into_another_authority(self):
        self.grant()
        result = self.run_code("os.environ[h.ENV_FILE] = str(h.KEYS / 'missing.key')\n"
                               "try: h.full_authority(); out='accepted'\n"
                               "except h.HelperError: out='refused'\nprint(json.dumps(out))", helper=True)
        self.assertEqual(result, "refused")

    def test_off_on_does_not_resurrect_full_or_old_grants(self):
        before = self.grant()
        after = self.run_code("h.switch('Pals', False); _,e=h.switch('Pals', True); "
                              "print(json.dumps({'level': h.level(e), 'grant': e['grant']}))")
        self.assertEqual(after["level"], "work")
        self.assertNotEqual(after["grant"], before["grant"])
        self.assertIsNone(self.run_code("print(json.dumps(h.full_authority()))", helper=True))

    def test_rotate_preserves_selected_level_but_invalidates_old_grant(self):
        before = self.grant()
        after = self.run_code("_,e=h.rotate('Pals'); print(json.dumps({'level': h.level(e), 'grant': e['grant']}))")
        self.assertEqual(after["level"], "full")
        self.assertNotEqual(after["grant"], before["grant"])
        result = self.run_code(f"try: h.validate_grant({{'helper':'Pals','grant':{before['grant']!r}}}); out='accepted'\n"
                               "except h.HelperError: out='refused'\nprint(json.dumps(out))")
        self.assertEqual(result, "refused")

    def test_selection_changes_epoch_even_when_level_is_same(self):
        before = self.grant()
        after = self.grant()
        self.assertNotEqual(before["grant"], after["grant"])

    def test_legacy_key_rotation_cannot_reuse_full_grant(self):
        self.grant()
        out = self.run_code("d=h._load(); e=d['helpers']['Pals']; e['sha256']='0'*64; h._save(d); "
                            "print(json.dumps(h.level(e)))")
        self.assertEqual(out, "work")

    def test_old_build_switch_cannot_resurrect_full_grant(self):
        self.grant()
        out = self.run_code("d=h._load(); e=d['helpers']['Pals']; e['switched']+=1; h._save(d); "
                            "print(json.dumps(h.level(e)))")
        self.assertEqual(out, "work")

    def test_helper_cannot_manage_its_own_or_another_grant(self):
        before = self.grant()
        results = self.run_code("out=[]\nfor f in [lambda:h.set_level('Pals','full'), lambda:h.set_level('Other','full'), "
                                "lambda:h.switch('Other', True), lambda:h.rotate('Pals'), lambda:h.remove('Pals'), "
                                "lambda:h.set_limit('Pals',100), lambda:h.set_taps('Pals','outward','on')]:\n"
                                " try: f(); out.append('accepted')\n"
                                " except h.HelperError: out.append('refused')\n"
                                "print(json.dumps(out))", helper=True)
        self.assertEqual(results, ["refused"] * 7)
        self.assertEqual(self.run_code("print(json.dumps(h._load()['helpers']['Pals']['grant']))"), before["grant"])

    def test_full_control_has_no_old_message_quota(self):
        self.grant()
        self.run_code("h.sent_since=lambda *a: 1000000\nprint(json.dumps(h.full_authority()))", helper=True)
        self.grant("work")
        out = self.run_code("h.sent_since=lambda *a: 1000000\n"
                            "try: h.full_authority(); out='accepted'\n"
                            "except h.HelperError: out='refused'\nprint(json.dumps(out))", helper=True)
        self.assertEqual(out, "refused")

    def test_retired_tap_switches_cannot_restore_old_authorization(self):
        self.grant("work")
        out = self.run_code("try: h.set_taps('Pals','outward','on'); out='accepted'\n"
                            "except h.HelperError as e: out=str(e)\nprint(json.dumps(out))")
        self.assertIn("replaced by", out)
        self.assertIn("Work only", out)

    def test_old_tap_auto_off_notice_is_not_an_enable_prompt(self):
        self.grant("work")
        out = self.run_code("d=h._load(); d['helpers']['Pals']['taps']={'auto_off':{'why':'old'}}; h._save(d); "
                            "print(json.dumps(h.check()))")
        self.assertEqual(out, {})

    def test_recovery_cannot_restore_full_control(self):
        before = self.grant()
        out = self.run_code("h.FILE.unlink(); h.restore_list(); e=h._load()['helpers']['Pals']; "
                            "print(json.dumps({'level':h.level(e),'grant':e['grant'],'attention':h.check()}))")
        self.assertEqual(out["level"], "work")
        self.assertNotEqual(out["grant"], before["grant"])
        self.assertEqual(out["attention"]["Pals"]["reason"], "restored-work")

    def test_unwritable_restore_fallback_cannot_grant_full(self):
        self.grant()
        out = self.run_code("h.FILE.unlink(); print(json.dumps(h.level(h._load()['helpers']['Pals'])))")
        self.assertEqual(out, "work")

    def test_stale_backup_recovers_off_with_new_epoch(self):
        before = self.grant()
        out = self.run_code("d=json.loads(h.BACKUP.read_text()); d['at']=1; h.BACKUP.write_text(json.dumps(d)); "
                            "(h.DATA/'crew-install.json').write_text(json.dumps({'installed':2})); h.FILE.unlink(); "
                            "h.restore_list(); e=h._load()['helpers']['Pals']; "
                            "print(json.dumps({'level':h.level(e),'grant':e['grant']}))")
        self.assertEqual(out["level"], "off")
        self.assertNotEqual(out["grant"], before["grant"])

    def test_recheck_rejects_revocation_even_if_presented_was_cached(self):
        self.grant()
        out = self.run_code("a=h.full_authority(); h.presented(); os.environ.pop(h.ENV); h.set_level('Pals','off'); "
                            "os.environ[h.ENV]='Pals'\n"
                            "try: h.recheck_full(a); out='accepted'\n"
                            "except h.HelperError: out='refused'\nprint(json.dumps(out))", helper=True)
        self.assertEqual(out, "refused")

    def test_grants_are_independent_and_cannot_be_crossed(self):
        first = self.grant()
        self.run_code("h.set_level('Other','full')")
        out = self.run_code(f"try: h.validate_grant({{'helper':'Other','grant':{first['grant']!r}}}); out='accepted'\n"
                            "except h.HelperError: out='refused'\nprint(json.dumps(out))")
        self.assertEqual(out, "refused")

    def test_downgrade_and_upgrade_do_not_revive_old_grants(self):
        before = self.grant()
        self.grant("work")
        after = self.grant()
        self.assertNotEqual(before["grant"], after["grant"])
        out = self.run_code(f"try: h.validate_grant({{'helper':'Pals','grant':{before['grant']!r}}}); out='accepted'\n"
                            "except h.HelperError: out='refused'\nprint(json.dumps(out))")
        self.assertEqual(out, "refused")

    def test_uninstall_revokes_every_grant_and_keeps_audit(self):
        self.grant()
        self.run_code("h.set_level('Other','full')")
        out = self.run_code("a=h.full_authority(); actor=h.invalidate_all_for_uninstall(a); "
                            "print(json.dumps({'actor':actor, 'levels':[h.level(e) for e in h._load()['helpers'].values()], "
                            "'notice':h.entries()[-1]}))", helper=True)
        self.assertEqual(out["actor"]["helper"], "Pals")
        self.assertEqual(out["levels"], ["off", "off"])
        self.assertEqual(out["notice"]["reason"], "uninstall")

    def test_invalid_uninstall_grant_changes_nothing(self):
        before = self.grant()
        out = self.run_code("a={'helper':'Pals','grant':'0'*32}\n"
                            "try: h.invalidate_all_for_uninstall(a); out='accepted'\n"
                            "except h.HelperError: out='refused'\n"
                            "print(json.dumps({'result':out,'level':h.level(h._load()['helpers']['Pals'])}))", helper=True)
        self.assertEqual(out, {"result": "refused", "level": "full"})


if __name__ == '__main__':
    unittest.main()
