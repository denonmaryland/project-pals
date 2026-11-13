"""T208 (Codex T199 (d), confirmed in T203): a roll back must not rewind the install time the
helpers' recovery trusts.

crewhelpers._copy_current() vouches for the helpers' backup copy only when it was written after the
last install (crew-install.json "installed"). Roll back puts an older crew-install.json back. If that
rewinds "installed", a backup with a helper On, made before an older build saved the owner's Off to
the primary list only, looks current again, and once the primary list is lost, restore_list() brings
the helper back On. Putting a build back is an install: rollback stamps the time it did it.

Each case runs in a child process with a throwaway HOME, data folder and a systemctl that fails."""
import json
import os
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

BIN = Path(__file__).resolve().parent.parent / "bin"


def run(script):
    base = Path(pals_tmp.mkdtemp(prefix="pals-provenance-"))
    home = base / "home"
    data = home / ".config" / "herdr-app" / "data"
    data.mkdir(parents=True)
    shims = base / "shims"
    shims.mkdir()
    (shims / "systemctl").write_text("#!/bin/sh\nexit 1\n")
    (shims / "systemctl").chmod(0o755)
    env = {**os.environ, "HOME": str(home), "HERDR_APP_HOME": str(home / ".config" / "herdr-app"),
           "CREW_DATA": str(data), "HC_TERMINAL_ID": "", "PATH": f"{shims}:{os.environ.get('PATH', '/usr/bin:/bin')}"}
    r = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=env, timeout=120)
    if r.returncode != 0:
        raise AssertionError(r.stdout + r.stderr)
    return json.loads(r.stdout.strip().splitlines()[-1])


PRELUDE = f"""
import json, sys, time
sys.path.insert(0, {str(BIN)!r})
import crewupdate, crewhelpers
def on(): return json.loads(crewhelpers.FILE.read_text())["helpers"]["Pals"]["on"]
"""


class RollbackStampsTheInstallTime(unittest.TestCase):
    def test_a_stale_on_backup_cant_come_back_after_a_roll_back(self):
        out = run(PRELUDE + textwrap.dedent("""
            # This version installed an hour ago; the owner switched Pals On (list and copy written).
            crewupdate.INSTALL.write_text(json.dumps({"version": "0.4.3", "installed": time.time() - 3600}))
            crewhelpers._save({"version": 1, "helpers": {"Pals": {"on": True, "sha256": "synthetic"}}})
            snap = crewupdate._snapshot("before-older-build")
            # An older build is installed and saves the owner's Off to the primary list only
            # (89b31fa-style writer: it knows nothing of the copy).
            crewupdate.INSTALL.write_text(json.dumps({"version": "0.4.2", "installed": time.time() + 1}))
            crewhelpers.FILE.write_text(json.dumps({"version": 1, "helpers": {"Pals": {"on": False, "sha256": "synthetic"}}}))
            # Then the primary list is lost, and this version is put back.
            crewhelpers.FILE.unlink()
            before = crewhelpers._copy_current()
            crewupdate.rollback(snap, log=lambda *a: None)
            after = crewhelpers._copy_current()
            crewhelpers.restore_list()
            print(json.dumps({"before": before, "after": after, "on": on(),
                              "version": crewupdate.installed().get("version")}))
        """))
        self.assertFalse(out["before"])
        self.assertFalse(out["after"], "the roll back mustn't make the old copy look current")
        self.assertFalse(out["on"], "the helper comes back Off, never On")
        self.assertEqual(out["version"], "0.4.3", "the record still names the version put back")

    def test_the_install_time_is_when_the_build_was_put_back(self):
        out = run(PRELUDE + textwrap.dedent("""
            crewupdate.INSTALL.write_text(json.dumps({"version": "0.4.3", "installed": 1000.0}))
            snap = crewupdate._snapshot("t")
            crewupdate.INSTALL.write_text(json.dumps({"version": "0.4.4", "installed": 2000.0}))
            t0 = time.time()
            crewupdate.rollback(snap, log=lambda *a: None)
            print(json.dumps({"installed": crewupdate.installed().get("installed"), "t0": t0}))
        """))
        self.assertGreaterEqual(out["installed"], out["t0"])

    def test_a_current_copy_still_restores_on_after_a_normal_crash(self):
        # The case recovery exists for: no build swap, the list damaged, the copy current. On stays On.
        out = run(PRELUDE + textwrap.dedent("""
            crewupdate.INSTALL.write_text(json.dumps({"version": "0.4.3", "installed": time.time() - 3600}))
            crewhelpers._save({"version": 1, "helpers": {"Pals": {"on": True, "sha256": "synthetic"}}})
            crewhelpers.FILE.write_text("{ damaged")
            crewhelpers.restore_list()
            print(json.dumps({"on": on()}))
        """))
        self.assertTrue(out["on"])


if __name__ == "__main__":
    unittest.main()
