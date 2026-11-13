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
import time
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


# ── across installed builds (Codex T209) ──────────────────────────────────────────────────────
# The library is copied into a throwaway HOME the way install.sh puts it there, from this checkout
# and from git history, and every step runs in a fresh process from that installed copy: an older
# build's updater can't be taught anything, and a module the roll back takes away is really gone.

ROOT = BIN.parent
OLD_HELPER = "89b31fa"   # the unreleased list-only helper writer the T199/T209 findings name
OLD_RELEASE = "v0.4.2"   # the last release, from before the memory work (no crewmem.py)


def _lib_from(ref):
    """{file name: bytes} of the bin/crew*.py files at a git ref, or None without that history."""
    try:
        names = subprocess.run(["git", "-C", str(ROOT), "ls-tree", "-r", "--name-only", ref, "bin"],
                               capture_output=True, text=True, check=True, timeout=30).stdout.split()
        return {Path(n).name: subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{n}"], capture_output=True,
                                             check=True, timeout=30).stdout
                for n in names if Path(n).name.startswith("crew") and n.endswith(".py")}
    except (OSError, subprocess.SubprocessError):
        return None


def _lib_here():
    return {p.name: p.read_bytes() for p in BIN.glob("crew*.py")}


class AcrossInstalledBuilds(unittest.TestCase):
    def setUp(self):
        self.base = Path(pals_tmp.mkdtemp(prefix="pals-provenance-builds-"))
        self.home = self.base / "home"
        self.data = self.home / ".config" / "herdr-app" / "data"
        self.data.mkdir(parents=True)
        self.lib = self.home / ".local" / "lib" / "herdr-crew"
        self.lib.mkdir(parents=True)
        shims = self.base / "shims"
        shims.mkdir()
        for name in ("systemctl", "systemd-run", "hc", "herdr-app"):
            (shims / name).write_text("#!/bin/sh\nexit 1\n")
            (shims / name).chmod(0o755)
        self.env = {**os.environ, "HOME": str(self.home), "CREW_DATA": str(self.data),
                    "HERDR_APP_HOME": str(self.data.parent), "HC_TERMINAL_ID": "",
                    "PATH": f"{shims}:/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"}

    def put(self, files):
        for f in self.lib.glob("crew*.py"):
            f.unlink()
        for name, body in files.items():
            (self.lib / name).write_bytes(body)

    def installed(self, version):
        """What install.sh records: crew-install.json, and a line in the install log."""
        now = time.time()
        (self.data / "crew-install.json").write_text(json.dumps({"version": version, "installed": now}))
        with open(self.data / "crew-installs.jsonl", "a") as f:
            f.write(json.dumps({"at": int(now * 1000), "version": version}) + "\n")
        time.sleep(0.01)

    def child(self, code):
        r = subprocess.run([sys.executable, "-c", f"import sys, json\nsys.path.insert(0, {str(self.lib)!r})\n{code}"],
                           env=self.env, capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return json.loads(r.stdout.strip().splitlines()[-1])

    def test_an_older_updater_putting_this_build_back_cant_revive_a_helper_on(self):
        old = _lib_from(OLD_HELPER)
        if old is None:
            self.skipTest(f"needs git history with {OLD_HELPER}")
        # This build: Pals On (list and copy written), then a snapshot of it.
        self.put(_lib_here())
        self.installed("0.4.3")
        snap = self.child("import crewupdate, crewhelpers\n"
                          "crewhelpers._save({'version': 1, 'helpers': {'Pals': {'on': True, 'sha256': 'synthetic'}}})\n"
                          "print(json.dumps(str(crewupdate._snapshot('before-older-build'))))")
        # The older build is installed; the owner switches Pals Off with it (list only); the list is
        # lost; that older build's own updater puts this build back.
        self.put(old)
        self.installed("historical-89b31fa")
        self.child("import crewhelpers, crewupdate\n"
                   "crewhelpers.switch('Pals', False)\n"
                   "crewhelpers.FILE.unlink()\n"
                   f"crewupdate.rollback({snap!r}, log=lambda *a: None)\n"
                   "print(json.dumps({}))")
        # A fresh process of this build's restored code recovers the list.
        out = self.child("import crewhelpers\n"
                         "current = crewhelpers._copy_current()\n"
                         "crewhelpers.restore_list()\n"
                         "print(json.dumps({'current': current, 'on': crewhelpers._load()['helpers']['Pals']['on']}))")
        self.assertFalse(out["current"], "the older build's install is on record in the install log")
        self.assertFalse(out["on"], "Pals comes back Off")

    def test_putting_a_pre_memory_build_back_takes_away_our_dropin(self):
        # The snapshot taken by the older updater itself (an update it ran): it says nothing of the
        # drop-in, but its library has no crewmem.py.
        self._pre_memory_round_trip(snapshot_by="installed")

    def test_the_same_when_a_local_install_took_the_snapshot(self):
        # install.sh takes a local install's snapshot with the new source's crewupdate (T209's case).
        self._pre_memory_round_trip(snapshot_by="source")

    def _pre_memory_round_trip(self, snapshot_by):
        old = _lib_from(OLD_RELEASE)
        if old is None:
            self.skipTest(f"needs git history with {OLD_RELEASE}")
        self.put(old)
        self.installed("0.4.2")
        take = "import crewupdate\nprint(json.dumps(str(crewupdate._snapshot('old-library'))))"
        if snapshot_by == "source":
            take = f"sys.path.insert(0, {str(BIN)!r})\n" + take
        snap = self.child(take)
        here = _lib_here()
        self.put(here)
        self.installed("0.4.3")
        text = self.child("import crewmem\nprint(json.dumps(crewmem.DROPIN_TEXT))")
        drop = self.home / ".config/systemd/user/hc-hold-.service.d/00-project-pals-oomd.conf"
        drop.parent.mkdir(parents=True)
        drop.write_text(text)
        out = self.child("import crewupdate\nfrom pathlib import Path\nlines = []\n"
                         f"crewupdate.rollback({snap!r}, log=lines.append)\n"
                         f"print(json.dumps({{'left': Path({str(drop)!r}).exists(), 'lines': lines,"
                         f" 'crewmem': Path({str(self.lib / 'crewmem.py')!r}).exists()}}))")
        self.assertFalse(out["crewmem"], "the pre-memory library has no crewmem.py")
        self.assertFalse(out["left"], out["lines"])


if __name__ == "__main__":
    unittest.main()
