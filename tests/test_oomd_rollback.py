"""T201 (Codex T198 P2): the hc-hold oomd drop-in the installer adds comes undone with the install.

Roll back puts the drop-in back as the snapshot had it (gone if it wasn't there, the old text if it
was), leaves a copy the owner changed since, and reloads systemd. A failed install takes away the
drop-in it added itself, since the updater that rolls it back may be an older build that doesn't
know the file. Throwaway HOMEs with fake systemctl, herdr-app and hc first on PATH."""
import json
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)
from test_uninstall import FAKE_HC, Sandbox  # noqa: E402

BIN = Path(__file__).resolve().parent.parent / "bin"
REL = Path(".config/systemd/user/hc-hold-.service.d/00-project-pals-oomd.conf")


class RollbackPutsTheDropinBack(unittest.TestCase):
    def setUp(self):
        self.sb = Sandbox()
        # A systemctl that records what it's asked and answers yes: the reload is part of the check.
        log = self.sb.base / "systemctl.log"
        (self.sb.shims / "systemctl").write_text(f'#!/bin/sh\necho "$*" >> "{log}"\nexit 0\n')
        self.log = log
        (self.sb.app / "data").mkdir(parents=True, exist_ok=True)

    def roll(self, before, after):
        """Snapshot with the drop-in as `before` (None: absent), set it to `after` (what the install
        did, or the owner since: "OURS" is this build's text), roll back; the file's text after, the
        log lines, and whether systemd was reloaded."""
        script = textwrap.dedent(f"""
            import json, sys
            sys.path.insert(0, {str(BIN)!r})
            import crewmem, crewupdate
            from pathlib import Path
            p = Path.home() / {str(REL)!r}
            def put(t):
                if t is None:
                    p.unlink(missing_ok=True)
                else:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(crewmem.DROPIN_TEXT if t == "OURS" else t)
            put({before!r})
            snap = crewupdate._snapshot("test")
            put({after!r})
            lines = []
            crewupdate.rollback(snap, log=lines.append)
            print(json.dumps({{"text": p.read_text() if p.exists() else None, "dir": p.parent.exists(),
                               "lines": lines, "ours": crewmem.DROPIN_TEXT}}))
        """)
        r = self.sb.run(sys.executable, "-c", script, HERDR_APP_HOME=str(self.sb.app))
        out = json.loads(r.stdout.strip().splitlines()[-1])
        reloaded = self.log.exists() and "--user daemon-reload" in self.log.read_text()
        return out, reloaded

    def test_one_the_install_added_goes_and_systemd_is_reloaded(self):
        out, reloaded = self.roll(None, "OURS")
        self.assertIsNone(out["text"])
        self.assertFalse(out["dir"], "the empty hc-hold-.service.d folder goes too")
        self.assertTrue(reloaded)
        self.assertTrue(any("removed" in l for l in out["lines"]), out["lines"])

    def test_the_old_text_comes_back(self):
        out, reloaded = self.roll("[Service]\nManagedOOMPreference=avoid\n# older wording\n", "OURS")
        self.assertEqual(out["text"], "[Service]\nManagedOOMPreference=avoid\n# older wording\n")
        self.assertTrue(reloaded)

    def test_a_copy_the_owner_changed_since_stays(self):
        mine = "[Service]\nManagedOOMPreference=omit\n# mine\n"
        out, reloaded = self.roll(None, mine)
        self.assertEqual(out["text"], mine)
        self.assertFalse(reloaded)
        self.assertTrue(any("changed since" in l for l in out["lines"]), out["lines"])

    def test_nothing_to_do_when_it_didnt_change(self):
        out, reloaded = self.roll("OURS", "OURS")
        self.assertEqual(out["text"], out["ours"])
        self.assertFalse(reloaded)

    def test_a_snapshot_from_before_t201_leaves_it_alone(self):
        script = textwrap.dedent(f"""
            import json, sys
            sys.path.insert(0, {str(BIN)!r})
            import crewupdate
            print(json.dumps(crewupdate.restore_dropin({{"keys_file": False}})))
        """)
        r = self.sb.run(sys.executable, "-c", script, HERDR_APP_HOME=str(self.sb.app))
        self.assertEqual(json.loads(r.stdout.strip().splitlines()[-1]), [])


class AFailedInstallTakesItsDropinAway(unittest.TestCase):
    def install(self, check_ok):
        sb = Sandbox()
        (sb.shims / "systemctl").write_text(f'#!/bin/sh\necho "$*" >> "{sb.base}/systemctl.log"\nexit 0\n')
        (sb.shims / "herdr-app").write_text("#!/bin/sh\ncase \"$1\" in\n  --version) echo herdr-app 0.1.14 ;;\n"
                                            f"  check) exit {0 if check_ok else 1} ;;\n"
                                            "  ls) echo '{\"spaces\":[],\"recent\":[]}' ;;\n  *) exit 1 ;;\nesac\n")
        (sb.shims / "hc").write_text(FAKE_HC)
        r = sb.run("bash", "install.sh", check=False)
        return r, sb.home / REL, (sb.base / "systemctl.log").read_text()

    def test_failed_install(self):
        r, p, log = self.install(check_ok=False)
        self.assertNotEqual(r.returncode, 0, r.stdout)
        self.assertFalse(p.exists(), r.stdout)
        self.assertIn("took the hc-hold oomd drop-in away again", r.stdout)
        self.assertGreaterEqual(log.count("--user daemon-reload"), 2, log)

    def test_good_install_keeps_it(self):
        r, p, _ = self.install(check_ok=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(p.exists())


if __name__ == "__main__":
    unittest.main()
