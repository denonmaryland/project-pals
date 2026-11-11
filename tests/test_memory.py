"""Memory safety (T153): pals in their own systemd scope, the low-memory floor and warnings, idle sleep
by age, the hc-hold drop-in, and pal ram.

A fake /proc (CREW_PROC: meminfo, smaps_rollup, status, cgroup, children) and a throwaway CREW_DATA and
HOME; the one real systemd-run check is skipped where there is no user session.
Run: python3 -m unittest tests.test_memory"""
import atexit
import importlib.machinery
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

TMP = Path(tempfile.mkdtemp(prefix="pals-memory-"))
atexit.register(shutil.rmtree, TMP, True)   # /tmp is RAM on some machines (T143): leave nothing behind
os.environ["CREW_DATA"] = str(TMP / "data")
os.environ["HERDR_APP_HOME"] = str(TMP / "app")
os.environ.pop("HC_TERMINAL_ID", None)
(TMP / "data").mkdir(exist_ok=True)
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "bin"))

import crewlib  # noqa: E402
import crewmem  # noqa: E402

MEMINFO = """MemTotal:       15482880 kB
MemFree:          501760 kB
MemAvailable:    1048576 kB
SwapTotal:      30965760 kB
SwapFree:       18874368 kB
"""


def load_crew():
    loader = importlib.machinery.SourceFileLoader("crew_cli_mem", str(REPO / "bin" / "crew"))
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crew_cli_mem", loader))
    loader.exec_module(mod)
    return mod


class Base(unittest.TestCase):
    def setUp(self):
        self.proc = Path(tempfile.mkdtemp(prefix="proc-", dir=TMP))
        (self.proc / "meminfo").write_text(MEMINFO)
        crewmem.STATE.unlink(missing_ok=True)
        crewlib.SETTINGS.unlink(missing_ok=True)

    def settings(self, **kw):
        crewlib.SETTINGS.write_text(json.dumps(kw))

    def fake_pid(self, pid, pss_kb, children=(), swap_kb=0, cgroup="0::/user.slice/app.slice/hc-hold-1.service", comm="claude"):
        d = self.proc / str(pid)
        (d / "task" / str(pid)).mkdir(parents=True, exist_ok=True)
        (d / "smaps_rollup").write_text(f"Rss:  {pss_kb * 2} kB\nPss:  {pss_kb} kB\nSwapPss:  {swap_kb} kB\n")
        (d / "task" / str(pid) / "children").write_text(" ".join(map(str, children)))
        (d / "cgroup").write_text(cgroup + "\n")
        (d / "comm").write_text(comm + "\n")


class Floor(Base):
    def test_meminfo_in_mb(self):
        m = crewmem.meminfo(self.proc)
        self.assertEqual(m, {"total": 15120, "available": 1024, "swap_total": 30240, "swap_free": 18432})

    def test_no_meminfo_is_empty(self):
        (self.proc / "meminfo").unlink()
        self.assertEqual(crewmem.meminfo(self.proc), {})
        self.assertIsNone(crewmem.low_line(None, self.proc))

    def test_floor_is_the_larger_of_1_5_gb_and_a_tenth(self):
        self.assertEqual(crewmem.floor_mb(15120, {}), 1536)
        self.assertEqual(crewmem.floor_mb(65536, {}), 6553)
        self.assertEqual(crewmem.floor_mb(15120, {"memory_floor_mb": 3000}), 3000)
        self.assertEqual(crewmem.floor_mb(15120, {"memory_floor_mb": "nonsense"}), 1536)

    def test_low_line_points_at_sleep_idle(self):
        line = crewmem.low_line(None, self.proc)
        self.assertIn("1.0 GB available of 14.8 GB", line)
        self.assertIn("pal sleep --idle", line)
        (self.proc / "meminfo").write_text(MEMINFO.replace("1048576", "4194304"))
        self.assertIsNone(crewmem.low_line(None, self.proc))

    def test_write_state_keeps_the_probe_and_when_it_went_low(self):
        st = crewmem.write_state([crewmem.NO_EXPAND], self.proc, now=1000)
        self.assertTrue(st["low"] and st["scope"])
        self.assertEqual((st["floor"], st["low_since"], st["scope_checked"]), (1536, 1000000, 1000000))
        st = crewmem.write_state(None, self.proc, now=1060)
        self.assertEqual((st["scope"], st["scope_checked"], st["low_since"], st["scope_flags"]), (True, 1000000, 1000000, [crewmem.NO_EXPAND]))
        (self.proc / "meminfo").write_text(MEMINFO.replace("1048576", "4194304"))
        st = crewmem.write_state(None, self.proc, now=1120)
        self.assertFalse(st["low"])
        self.assertNotIn("low_since", st)
        self.assertFalse(crewmem.needs_probe(now=1120))
        self.assertTrue(crewmem.needs_probe(now=1000 + crewmem.PROBE_EVERY + 1))


class Scopes(Base):
    def test_off_without_crewds_probe(self):
        self.assertEqual(crewmem.scope_prefix("Orca", "#ops"), [])

    def test_on_after_a_good_probe(self):
        crewmem.write_state([crewmem.NO_EXPAND], self.proc)
        p = crewmem.scope_prefix("Project Pals - Herdr Mod", "#memory")
        self.assertEqual(p[:6], ["systemd-run", "--user", "--scope", "--quiet", "--collect", "--expand-environment=no"])
        self.assertRegex(p[6], r"^--unit=pal-project-pals-herdr-mod-memory-[0-9a-z]+$")
        crewmem.write_state([], self.proc)   # an older systemd: no flag (and no expansion)
        self.assertEqual(crewmem.scope_prefix("Orca")[5][:7], "--unit=")
        crewmem.write_state(False, self.proc)
        self.assertEqual(crewmem.scope_prefix("Orca"), [], "a failed probe turns them off")
        crewmem.write_state([crewmem.NO_EXPAND], self.proc)
        self.assertEqual(p[-1], "--")
        self.assertEqual(crewmem.scope_prefix("Orca", local=False), [], "never on another machine")

    def test_turned_off_in_settings(self):
        crewmem.write_state([crewmem.NO_EXPAND], self.proc)
        self.settings(pal_scopes=False)
        self.assertEqual(crewmem.scope_prefix("Orca"), [])

    def test_probe_without_systemd_run_and_on_an_older_systemd(self):
        with mock.patch.object(shutil, "which", return_value=None):
            self.assertIsNone(crewmem.probe_scope())
        with mock.patch.dict(os.environ, {"CREW_NO_SCOPES": "1"}):
            self.assertIsNone(crewmem.probe_scope())
        R = subprocess.CompletedProcess
        old = [R([], 1, "", "systemd-run: unrecognized option '--expand-environment=no'"), R([], 0, "", "")]
        with mock.patch.object(shutil, "which", return_value="/usr/bin/systemd-run"), mock.patch.object(subprocess, "run", side_effect=old):
            self.assertEqual(crewmem.probe_scope(), [])
        nobus = [R([], 1, "", "Failed to connect to bus: No medium found")]
        with mock.patch.object(shutil, "which", return_value="/usr/bin/systemd-run"), mock.patch.object(subprocess, "run", side_effect=nobus):
            self.assertIsNone(crewmem.probe_scope())

    @unittest.skipUnless(shutil.which("systemd-run") and subprocess.run(
        ["systemd-run", "--user", "--scope", "--quiet", "--collect", "--", "true"], capture_output=True).returncode == 0,
        "no systemd user session")
    def test_a_real_scope_runs_the_agent_in_place(self):
        # What sleep and wake rely on: the agent is the shell's own child (same pid), with its
        # environment, in a pal-*.scope of its own.
        unit = crewmem.unit_name("test", "scope")
        flags = crewmem.probe_scope()
        self.assertIsNotNone(flags)
        p = subprocess.Popen(["systemd-run", "--user", "--scope", "--quiet", "--collect", *flags, f"--unit={unit}", "--",
                              "sh", "-c", 'echo "$$ $HC_TERMINAL_ID"; cat /proc/self/cgroup'],
                             stdout=subprocess.PIPE, text=True, env={**os.environ, "HC_TERMINAL_ID": "t999"})
        out, _ = p.communicate(timeout=30)
        first, cg = out.splitlines()[0], out.splitlines()[1]   # "$$" kept: --expand-environment=no
        self.assertEqual(first, f"{p.pid} t999")
        self.assertTrue(cg.endswith(f"/{unit}.scope"), cg)

    def test_wake_line_starts_scoped(self):
        crew = load_crew()
        crewmem.write_state([crewmem.NO_EXPAND], self.proc)
        space, tab = {"id": "s1", "name": "Docs"}, {"id": "tb1", "name": "api"}
        with mock.patch.object(crew, "request", return_value={"argv": ["claude", "--model", "opus"], "key": "claude", "name": "Claude Code"}), \
             mock.patch.object(crew, "hc_terminals", return_value={}), \
             mock.patch("crewsleep.shell_cwd", return_value="/x"), mock.patch("crewchat.links", return_value={}):
            line, _ = crew._wake_line([space], space, tab, "t5", {"pid": 1})
        self.assertRegex(line, r"^systemd-run --user --scope --quiet --collect --expand-environment=no --unit=pal-docs-api-[0-9a-z]+ -- claude --model opus$")
        crewmem.STATE.unlink()
        with mock.patch.object(crew, "request", return_value={"argv": ["claude"], "key": "claude"}), \
             mock.patch.object(crew, "hc_terminals", return_value={}), \
             mock.patch("crewsleep.shell_cwd", return_value="/x"), mock.patch("crewchat.links", return_value={}):
            line, _ = crew._wake_line([space], space, tab, "t5", {"pid": 1})
        self.assertTrue(line.startswith("claude"), line)


class IdleSleep(Base):
    def test_setting_is_off_by_default(self):
        self.assertIsNone(crewmem.idle_hours_setting({}))
        self.assertIsNone(crewmem.idle_hours_setting({"sleep_idle_hours": 0}))
        self.assertIsNone(crewmem.idle_hours_setting({"sleep_idle_hours": "x"}))
        self.assertEqual(crewmem.idle_hours_setting({"sleep_idle_hours": 6}), 6.0)

    def test_last_active_from_the_session_file_else_the_status_line(self):
        sd = TMP / "status"
        sd.mkdir(exist_ok=True)
        tr = TMP / "t7.jsonl"
        tr.write_text("{}")
        os.utime(tr, (1000, 1000))
        (sd / "t7.json").write_text("{}")
        os.utime(sd / "t7.json", (500, 500))
        self.assertEqual(crewmem.last_active("t7", {"t7": {"transcript": str(tr)}}, sd), 1000)
        self.assertEqual(crewmem.last_active("t7", {}, sd), 500)
        self.assertIsNone(crewmem.last_active("t8", {}, sd))

    def test_sleep_older_sweeps_only_topics_idle_that_long(self):
        crew = load_crew()
        old, new, unknown = {"id": "a", "name": "old", "lead": "t1"}, {"id": "b", "name": "new", "lead": "t2"}, {"id": "c", "name": "huh", "lead": "t3"}
        spaces = [{"id": "s1", "name": "Docs", "tabs": [old, new, unknown]}]
        at = {"t1": time.time() - 7 * 3600, "t2": time.time() - 3600, "t3": None}
        stopped = []
        with mock.patch.object(crew, "records", return_value={}), mock.patch.object(crew, "hc_terminals", return_value={}), \
             mock.patch.object(crew, "lead", side_effect=lambda t: {"terminal": t["lead"]}), \
             mock.patch.object(crew, "_stop_tab", side_effect=lambda s, t, *a, **k: stopped.append(t["name"]) or "slept"), \
             mock.patch("crewchat.links", return_value={}), mock.patch.object(crewmem, "last_active", side_effect=lambda a, l: at[a]):
            with redirect_stdout(io.StringIO()):
                crew.cmd_sleep(spaces, ["--idle", "--older", "6"])
        self.assertEqual(stopped, ["old"], "a topic with no known last activity stays awake")
        with self.assertRaises(SystemExit), redirect_stdout(io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
            crew.cmd_sleep(spaces, ["Docs", "--older", "6"])

    def test_crewd_sweeps_only_when_the_setting_is_on(self):
        crewd = self.crewd()
        d = crewd.Crewd()
        d.last_idle_sweep = 0
        with mock.patch.object(crewmem, "probe_scope", return_value=None), mock.patch.object(crewd.threading, "Thread") as th, \
             mock.patch.object(crewmem, "meminfo", return_value=crewmem.meminfo(self.proc)):
            d.memory()
            th.assert_not_called()
            self.settings(sleep_idle_hours=4)
            d.memory()
            th.assert_called_once()
            self.assertEqual(th.call_args.kwargs["args"], (4.0,))
            d.memory()
            th.assert_called_once()   # not again within half an hour
        st = json.loads(crewmem.STATE.read_text())
        self.assertEqual((st["scope"], st["low"]), (False, True))

    def crewd(self):
        loader = importlib.machinery.SourceFileLoader("crewd_mem", str(REPO / "bin" / "crewd"))
        mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewd_mem", loader))
        loader.exec_module(mod)
        return mod


class DropIn(Base):
    def test_added_once_and_a_persons_own_is_left_alone(self):
        d = TMP / "dropin-a"
        self.assertEqual(crewmem.dropin_state(d), "none")
        self.assertEqual(crewmem.install_dropin(d), "added")
        self.assertIn("ManagedOOMPreference=avoid", (d / crewmem.DROPIN.name).read_text())
        self.assertEqual(crewmem.install_dropin(d), "ours")
        mine = TMP / "dropin-b"
        mine.mkdir()
        (mine / "10-oomd-avoid.conf").write_text("[Service]\nManagedOOMPreference=avoid\n")
        self.assertEqual(crewmem.install_dropin(mine), "theirs")
        self.assertEqual(sorted(p.name for p in mine.iterdir()), ["10-oomd-avoid.conf"])

    def test_uninstall_knows_only_ours(self):
        import crewuninstall
        self.assertEqual(crewuninstall.OOMD_DROPIN.name, crewmem.DROPIN.name)
        self.assertIn(crewuninstall.OOMD_DROPIN, crewuninstall.candidates(["crew-home"]))
        self.assertIn("Project Pals", crewmem.DROPIN_TEXT)


class Ram(Base):
    def test_tree_and_scope(self):
        self.fake_pid(10, 400 * 1024, children=(11,), cgroup="0::/user.slice/app.slice/pal-docs-api-x.scope")
        self.fake_pid(11, 60 * 1024, swap_kb=40 * 1024)
        self.assertEqual(round(crewmem.tree_mb(10, self.proc)), 500, "swapped-out memory counts")
        self.assertTrue(crewmem.cgroup_of(10, self.proc).endswith("pal-docs-api-x.scope"))
        self.assertEqual(crewmem.pss_mb(99, self.proc), 0.0)


if __name__ == "__main__":
    unittest.main()
