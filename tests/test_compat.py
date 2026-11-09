"""The supported Herdr range (T48): pals.json states it, install.sh checks it and warns outside it."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bin"))
sys.path.insert(0, str(ROOT / "tests"))
import crewcompat  # noqa: E402
from test_uninstall import Sandbox  # noqa: E402

MANIFEST = json.loads((ROOT / "pals.json").read_text())


def status(app, core):
    return [p["status"] for p in crewcompat.check(MANIFEST, {"app": app, "core": core})["programs"]]


class Range(unittest.TestCase):
    def test_pals_json_states_a_range(self):
        r = MANIFEST["herdr"]
        for kind in ("app", "core"):
            lo, tested, below = (crewcompat.vtuple(r[kind][k]) for k in ("min", "tested", "below"))
            self.assertTrue(lo <= tested < below, kind)

    def test_what_was_tested_is_supported(self):
        # Tested live (2026-11-09): app 0.1.8 + core 0.1.11, app 0.1.12 + core 0.1.15, app 0.1.14 + core 0.1.19.
        for app, core in (("0.1.8", "0.1.11"), ("0.1.12", "0.1.15"), ("0.1.14", "0.1.19")):
            self.assertEqual(status(app, core), ["ok", "ok"], (app, core))
            self.assertTrue(crewcompat.check(MANIFEST, {"app": app, "core": core})["ok"])

    def test_too_old(self):
        # app 0.1.5 has no `herdr-app commands` and two mods fail `herdr-app check`.
        self.assertEqual(status("0.1.5", "0.1.19"), ["old", "ok"])
        self.assertEqual(status("0.1.14", "0.1.10"), ["ok", "old"])

    def test_next_generation_is_unsupported(self):
        res = crewcompat.check(MANIFEST, {"app": "0.2.0", "core": "1.0.3"})
        self.assertEqual([p["status"] for p in res["programs"]], ["unsupported", "unsupported"])
        self.assertFalse(res["ok"])
        self.assertIn("Check for updates", res["warn"][0])

    def test_newer_patch_is_a_note_not_a_warning(self):
        res = crewcompat.check(MANIFEST, {"app": "0.1.20", "core": "0.1.30"})
        self.assertTrue(res["ok"])
        self.assertEqual(len(res["notes"]), 2)

    def test_missing_or_odd_versions(self):
        self.assertEqual(status(None, "0.1.19"), ["missing", "ok"])
        self.assertEqual(status("dev", "0.1.19"), ["unknown", "ok"])
        self.assertEqual(crewcompat.vtuple("herdr-app 0.1.14"), (0, 1, 14))
        self.assertEqual(crewcompat.vtuple("hc 0.2"), (0, 2, 0))


class Install(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()

    def tearDown(self):
        self.sb.close()

    def test_supported_installs_quietly(self):
        r = self.sb.install()
        self.assertNotIn("WARNING", r.stdout + r.stderr)
        rec = json.loads((self.sb.app / "data" / "crew-install.json").read_text())
        self.assertEqual(rec["herdr"]["app"], "0.1.14")
        self.assertEqual(rec["herdr"]["core"], "0.1.19")
        self.assertTrue(rec["herdr"]["supported"])
        self.assertEqual(rec["herdr"]["range"], MANIFEST["herdr"])

    def test_outside_the_range_warns_clearly_and_still_installs(self):
        r = self.sb.install(FAKE_APP_VERSION="0.2.1", FAKE_CORE_VERSION="0.1.9")
        self.assertIn("WARNING: this Herdr isn't one Project Pals supports.", r.stderr)
        self.assertIn("Herdr 0.2.1 is newer than Project Pals supports", r.stderr)
        self.assertIn("herdr-core (hc) 0.1.9 is older than Project Pals supports", r.stderr)
        self.assertIn("Supported: Herdr 0.1.8+ and herdr-core 0.1.11+", r.stderr)
        self.assertTrue((self.sb.app / "mods" / "crew-roster" / "main.js").is_file())
        rec = json.loads((self.sb.app / "data" / "crew-install.json").read_text())
        self.assertFalse(rec["herdr"]["supported"])
        self.assertEqual(len(rec["herdr"]["warn"]), 2)
        # pal version says the same, from the range the install recorded.
        out = self.sb.run(str(self.sb.home / ".local" / "bin" / "pal"), "version",
                          FAKE_APP_VERSION="0.2.1", FAKE_CORE_VERSION="0.1.9").stdout
        self.assertIn("supports Herdr 0.1.8+", out)
        self.assertIn("Herdr 0.2.1 is newer than Project Pals supports", out)

    def test_newer_tested_patch_only_notes(self):
        r = self.sb.install(FAKE_APP_VERSION="0.1.15")
        self.assertNotIn("WARNING", r.stderr)
        self.assertIn("note: Herdr 0.1.15 is newer than Project Pals was tested on (0.1.14)", r.stdout)


if __name__ == "__main__":
    unittest.main()
