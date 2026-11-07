"""Sleeping and waking pals: real-process checks, OSC 7501 state=clear in sleep and crewd,
skipping busy/blocked channels, prefix/channel/--idle targeting, and conversation resume on wake.
"""
import importlib.machinery
import importlib.util
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parent.parent

if "crewlib" not in sys.modules:
    _T = Path(tempfile.mkdtemp(prefix="pals-sleep-boot-"))
    _SHIMS = _T / "shims"
    _SHIMS.mkdir()
    for _name in ("hc", "herdr-app", "systemctl"):
        (_SHIMS / _name).write_text("#!/bin/sh\nexit 1\n")
        (_SHIMS / _name).chmod(0o755)
    os.environ.update({
        "HOME": str(_T / "home"),
        "HERDR_APP_HOME": str(_T / "app"),
        "CREW_DATA": str(_T / "data"),
        "PATH": f"{_SHIMS}:{os.environ.get('PATH', '/usr/bin:/bin')}",
    })
    os.environ.pop("HC_TERMINAL_ID", None)
    sys.path.insert(0, str(REPO / "bin"))

import crewlib   # noqa: E402


def load_crewd():
    loader = importlib.machinery.SourceFileLoader("crewd_sleep_test", str(REPO / "bin" / "crewd"))
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewd_sleep_test", loader))
    loader.exec_module(mod)
    return mod


def make_fake_proc(root: Path, pid: int, comm="fish", children=()):
    pdir = root / str(pid)
    (pdir / "task" / str(pid)).mkdir(parents=True, exist_ok=True)
    (pdir / "fd").mkdir(parents=True, exist_ok=True)
    (pdir / "comm").write_text(f"{comm}\n")
    (pdir / "task" / str(pid) / "children").write_text(" ".join(str(c) for c in children))
    fd1 = pdir / "fd" / "1"
    if not fd1.exists():
        fd1.write_bytes(b"")
    return fd1


def make_sandbox():
    root = Path(tempfile.mkdtemp(prefix="pals-sleep-case-"))
    home = root / "home"
    app = root / "app"
    data = app / "data"
    proc = root / "proc"
    shims = root / "shims"
    state = root / "state.json"
    calls = root / "hc-calls.jsonl"
    for d in (home, app, data, proc, shims):
        d.mkdir(parents=True, exist_ok=True)

    hc_py = (
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        f"state = json.loads(open({str(state)!r}).read())\n"
        "args = sys.argv[1:]\n"
        "if args[:1] == ['ls']:\n"
        "    print(json.dumps({'terminals': state.get('terminals', [])}))\n"
        "elif args[:1] == ['get']:\n"
        "    addr = args[1]\n"
        "    info = state.get('info', {}).get(addr)\n"
        "    if not info:\n"
        "        sys.exit(1)\n"
        "    print(json.dumps(info))\n"
        "elif args[:1] == ['read']:\n"
        "    addr = args[1]\n"
        "    print('\\n'.join(state.get('screens', {}).get(addr, [])))\n"
        "elif args[:1] in (['keys'], ['send']):\n"
        f"    with open({str(calls)!r}, 'a') as f:\n"
        "        f.write(json.dumps({'args': args, 'hc_env': {k: v for k, v in os.environ.items() if k.startswith('HC_')}}) + '\\n')\n"
        "else:\n"
        "    sys.exit(1)\n"
    )
    (shims / "hc").write_text(hc_py)
    (shims / "hc").chmod(0o755)

    herdr_py = (
        "#!/usr/bin/env python3\n"
        "import json, sys\n"
        f"state = json.loads(open({str(state)!r}).read())\n"
        "if sys.argv[1:2] == ['ls']:\n"
        "    print(json.dumps({'spaces': state.get('spaces', [])}))\n"
        "else:\n"
        "    sys.exit(1)\n"
    )
    (shims / "herdr-app").write_text(herdr_py)
    (shims / "herdr-app").chmod(0o755)

    env = {
        **os.environ,
        "HOME": str(home),
        "HERDR_APP_HOME": str(app),
        "CREW_DATA": str(data),
        "CREW_PROC": str(proc),
        "PATH": f"{shims}:{os.environ.get('PATH', '/usr/bin:/bin')}",
    }
    env.pop("HC_TERMINAL_ID", None)
    return {"root": root, "home": home, "app": app, "data": data, "proc": proc, "state": state, "calls": calls, "env": env}


def run_crew(sb, *args, me=None):
    env = dict(sb["env"])
    if me:
        env["HC_TERMINAL_ID"] = me
    return subprocess.run(
        [sys.executable, str(REPO / "bin" / "crew"), *args],
        capture_output=True, text=True, env=env, timeout=15,
    )


class OscClearAndProc(unittest.TestCase):
    def test_clear_osc_status_and_bare_shell_detection(self):
        proc = Path(tempfile.mkdtemp(prefix="pals-proc-"))
        fd1 = make_fake_proc(proc, 4242, comm="fish", children=[])
        self.assertTrue(crewlib.shell_is_bare(4242, proc))
        self.assertEqual(crewlib.agent_running("t1", {"state": "live", "pid": 4242}, proc)[:2], (False, 4242))
        self.assertTrue(crewlib.clear_osc_status(4242, proc))
        self.assertEqual(fd1.read_bytes(), b"\x1b]7501;state=clear\x07")

        # Shell with a live child: agent is running, not bare.
        make_fake_proc(proc, 4242, comm="fish", children=[9999])
        self.assertFalse(crewlib.shell_is_bare(4242, proc))
        self.assertEqual(crewlib.agent_running("t1", {"state": "live", "pid": 4242}, proc)[:2], (True, 4242))

        # Direct agent binary (no shell wrapper): never treated as a bare shell.
        make_fake_proc(proc, 5050, comm="agy", children=[])
        self.assertFalse(crewlib.shell_is_bare(5050, proc))
        self.assertEqual(crewlib.agent_running("t2", {"state": "live", "pid": 5050}, proc)[:2], (True, 5050))

    def test_crewd_reaps_bare_agy_shell_and_holds_messages(self):
        proc = Path(tempfile.mkdtemp(prefix="pals-crewd-proc-"))
        fd1 = make_fake_proc(proc, 5150, comm="fish", children=[])
        crewd = load_crewd()
        daemon = crewd.Crewd()

        crewlib.mark_hooked("tBare")
        qdir = crewlib.QUEUE / "tBare"
        qdir.mkdir(parents=True, exist_ok=True)
        for idx, urgent in enumerate((False, True)):
            msg = {"id": f"m{idx}", "at": crewlib.now_ms(), "text": f"msg-{idx}", "not_before": 0, "urgent": urgent}
            (qdir / f"100{idx}-m{idx}.json").write_text(json.dumps(msg))

        terms = {"tBare": {"address": "tBare", "state": "live", "agent": "antigravity", "status": "idle", "where": "Navi / #general"}}
        with mock.patch.dict(os.environ, {"CREW_PROC": str(proc)}), \
             mock.patch.object(crewd, "term_info", return_value={"pid": 5150}), \
             mock.patch.object(crewd, "send_now", side_effect=AssertionError("must not type into bare shell")):
            daemon.reap_osc(terms)
            daemon.deliver(terms)

        self.assertEqual(fd1.read_bytes(), b"\x1b]7501;state=clear\x07")
        self.assertEqual(terms["tBare"]["agent"], "fish")
        self.assertIsNone(terms["tBare"]["status"])
        self.assertFalse(crewlib.hooked("tBare"))
        self.assertEqual(len(list(qdir.glob("*.json"))), 2)
        for f in qdir.glob("*"):
            f.unlink()
        qdir.rmdir()


class SleepCli(unittest.TestCase):
    def test_sleep_terminates_real_child_and_writes_osc_clear(self):
        sb = make_sandbox()
        child = subprocess.Popen(["sleep", "60"])
        fd1 = make_fake_proc(sb["proc"], 7001, comm="fish", children=[child.pid])
        children_file = sb["proc"] / "7001" / "task" / "7001" / "children"

        def reap_when_dead():
            child.wait(timeout=10)
            children_file.write_text("")

        reaper = threading.Thread(target=reap_when_dead, daemon=True)
        reaper.start()

        sb["state"].write_text(json.dumps({
            "spaces": [{"id": "s1", "name": "Navi", "tabs": [{"id": "tb1", "name": "#general", "active": True,
                       "terminals": [{"terminal": "t1", "app": "antigravity", "status": "idle"}]}]}],
            "terminals": [{"address": "t1", "state": "live", "agent": "antigravity", "status": "idle", "where": "Navi / #general"}],
            "info": {"t1": {"state": "live", "pid": 7001, "status": {"app": "antigravity", "state": "idle"}}},
        }))

        r = run_crew(sb, "sleep", "Navi")
        reaper.join(timeout=5)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("slept Navi #general", r.stdout)
        self.assertEqual(child.returncode, -signal.SIGTERM)
        self.assertEqual(fd1.read_bytes(), b"\x1b]7501;state=clear\x07")

    def test_sleep_skips_busy_blocked_and_self_and_respects_exact_vs_prefix(self):
        sb = make_sandbox()
        pids = {}
        for i, addr in enumerate(("t1", "t2", "t3", "t4", "t5"), start=1):
            cp = subprocess.Popen(["sleep", "60"])
            pids[addr] = cp
            make_fake_proc(sb["proc"], 8000 + i, comm="fish", children=[cp.pid])
            cfile = sb["proc"] / str(8000 + i) / "task" / str(8000 + i) / "children"
            threading.Thread(target=lambda p=cp, f=cfile: (p.wait(timeout=15), f.write_text("")), daemon=True).start()

        try:
            sb["state"].write_text(json.dumps({
                "spaces": [
                    {"id": "sA", "name": "Alpha", "tabs": [
                        {"id": "tb1", "name": "#general", "active": True, "terminals": [{"terminal": "t1", "app": "claude-code", "status": "idle"}]},
                        {"id": "tb2", "name": "#dev", "terminals": [{"terminal": "t2", "app": "claude-code", "status": "working"}]},
                        {"id": "tb3", "name": "#ask", "terminals": [{"terminal": "t3", "app": "claude-code", "status": "blocked"}]},
                    ]},
                    {"id": "sA2", "name": "Alpha-2", "tabs": [
                        {"id": "tb4", "name": "#general", "active": True, "terminals": [{"terminal": "t4", "app": "antigravity", "status": "idle"}]},
                    ]},
                    {"id": "sB", "name": "Beta", "tabs": [
                        {"id": "tb5", "name": "#general", "active": True, "terminals": [{"terminal": "t5", "app": "antigravity", "status": "idle"}]},
                    ]},
                ],
                "terminals": [
                    {"address": "t1", "state": "live", "agent": "claude-code", "status": "idle"},
                    {"address": "t2", "state": "live", "agent": "claude-code", "status": "working"},
                    {"address": "t3", "state": "live", "agent": "claude-code", "status": "blocked"},
                    {"address": "t4", "state": "live", "agent": "antigravity", "status": "idle"},
                    {"address": "t5", "state": "live", "agent": "antigravity", "status": "idle"},
                ],
                "info": {
                    "t1": {"state": "live", "pid": 8001, "status": {"app": "claude-code", "state": "idle"}},
                    "t2": {"state": "live", "pid": 8002, "status": {"app": "claude-code", "state": "working"}},
                    "t3": {"state": "live", "pid": 8003, "status": {"app": "claude-code", "state": "blocked"}},
                    "t4": {"state": "live", "pid": 8004, "status": {"app": "antigravity", "state": "idle"}},
                    "t5": {"state": "live", "pid": 8005, "status": {"app": "antigravity", "state": "idle"}},
                },
            }))

            # Exact name "Alpha" must not touch "Alpha-2", and must skip working/blocked.
            r1 = run_crew(sb, "sleep", "Alpha")
            self.assertEqual(r1.returncode, 0, r1.stderr)
            self.assertIn("slept Alpha #general", r1.stdout)
            self.assertIn("skipping Alpha #dev (working)", r1.stdout)
            self.assertIn("skipping Alpha #ask (blocked)", r1.stdout)
            self.assertIsNone(pids["t2"].poll())
            self.assertIsNone(pids["t3"].poll())
            self.assertIsNone(pids["t4"].poll())

            # --idle from t5 skips self (t5) and busy/blocked (t2, t3), sleeping Alpha-2 (t4).
            r2 = run_crew(sb, "sleep", "--idle", me="t5")
            self.assertEqual(r2.returncode, 0, r2.stderr)
            self.assertIn("slept Alpha-2 #general", r2.stdout)
            self.assertIsNone(pids["t5"].poll())

            # Bare #channel + --force stops blocked Alpha #ask.
            r3 = run_crew(sb, "sleep", "#ask", "--force")
            self.assertEqual(r3.returncode, 0, r3.stderr)
            self.assertIn("slept Alpha #ask", r3.stdout)
            self.assertEqual(pids["t3"].wait(timeout=5), -signal.SIGTERM)
        finally:
            for cp in pids.values():
                if cp.poll() is None:
                    cp.kill()
                    cp.wait(timeout=5)


class WakeCli(unittest.TestCase):
    def test_wake_resumes_conversations_prefers_room_seats_and_strips_hc_env(self):
        sb = make_sandbox()
        for i in range(1, 7):
            make_fake_proc(sb["proc"], 9000 + i, comm="fish", children=[])
        # t6 already has an agent child running.
        make_fake_proc(sb["proc"], 9006, comm="fish", children=[99999])

        # Linked transcripts for t3 (Claude) and t4/t5 (multi-tab Agy).
        sess_dir = sb["data"] / "crew-sessions"
        sess_dir.mkdir(parents=True, exist_ok=True)
        c_tr = sb["home"] / ".claude/projects/-tmp/33333333-3333-3333-3333-333333333333.jsonl"
        c_tr.parent.mkdir(parents=True, exist_ok=True)
        c_tr.write_text('{"type":"user","message":{"content":"hola"}}\n')
        (sess_dir / "t3.json").write_text(json.dumps({
            "terminal": "t3", "transcript": str(c_tr),
            "session": "33333333-3333-3333-3333-333333333333", "harness": "claude",
        }))

        for addr, cid in (("t4", "11111111-1111-1111-1111-111111111111"), ("t5", "22222222-2222-2222-2222-222222222222")):
            a_tr = sb["home"] / f".gemini/antigravity-cli/brain/{cid}/.system_generated/logs/transcript_full.jsonl"
            a_tr.parent.mkdir(parents=True, exist_ok=True)
            a_tr.write_text('{"type":"USER_INPUT","content":"<USER_REQUEST>hola</USER_REQUEST>"}\n')
            (sess_dir / f"{addr}.json").write_text(json.dumps({
                "terminal": addr, "transcript": str(a_tr), "session": cid, "harness": "antigravity",
            }))

        rooms_dir = sb["data"] / "crew-rooms"
        rooms_dir.mkdir(parents=True, exist_ok=True)
        (rooms_dir / "navi.json").write_text(json.dumps({
            "name": "navi", "members": [{"bot": "MultiAgy", "channel": "navi", "terminal": "t5"}],
        }))

        (sb["app"] / "shared.json").write_text(json.dumps({
            "crew": {
                "bots": [
                    {"id": "b1", "space": "s1", "name": "ClaudePlain", "harness": "claude",
                     "argv": ["claude", "--dangerously-skip-permissions", "--model", "opus"]},
                    {"id": "b2", "space": "s2", "name": "AgyPlain", "harness": "antigravity",
                     "argv": ["agy", "--dangerously-skip-permissions", "--model", "gemini-4-argon-high"]},
                    {"id": "b3", "space": "s3", "name": "ClaudeLinked", "harness": "claude",
                     "argv": ["claude", "--model", "sonnet"]},
                    {"id": "b4", "space": "s4", "name": "MultiAgy", "harness": "antigravity",
                     "argv": ["agy", "--dangerously-skip-permissions"]},
                    {"id": "b5", "space": "s5", "name": "AwakePal", "harness": "claude",
                     "argv": ["claude"]},
                ]
            }
        }))

        sb["state"].write_text(json.dumps({
            "spaces": [
                {"id": "s1", "name": "ClaudePlain", "tabs": [{"id": "tb1", "name": "#general", "active": True, "terminals": [{"terminal": "t1"}]}]},
                {"id": "s2", "name": "AgyPlain", "tabs": [{"id": "tb2", "name": "#general", "active": True, "terminals": [{"terminal": "t2"}]}]},
                {"id": "s3", "name": "ClaudeLinked", "tabs": [{"id": "tb3", "name": "#general", "active": True, "terminals": [{"terminal": "t3"}]}]},
                {"id": "s4", "name": "MultiAgy", "tabs": [
                    {"id": "tb4", "name": "#general", "active": True, "terminals": [{"terminal": "t4"}]},
                    {"id": "tb5", "name": "#navi", "active": False, "terminals": [{"terminal": "t5"}]},
                ]},
                {"id": "s5", "name": "AwakePal", "tabs": [{"id": "tb6", "name": "#general", "active": True, "terminals": [{"terminal": "t6", "app": "claude-code"}]}]},
            ],
            "terminals": [
                {"address": f"t{i}", "state": "live", "agent": "fish", "status": None} for i in range(1, 6)
            ] + [{"address": "t6", "state": "live", "agent": "claude-code", "status": "idle"}],
            "info": {f"t{i}": {"state": "live", "pid": 9000 + i} for i in range(1, 7)},
        }))

        r = run_crew(sb, "wake", "ClaudePlain", "AgyPlain", "ClaudeLinked", "MultiAgy", "AwakePal", me="t99")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("AwakePal: already awake", r.stdout)

        calls = [json.loads(l) for l in sb["calls"].read_text().splitlines()]
        # Every hc call must have HC_* stripped so hc send never wraps commands in <hc from=...>.
        for c in calls:
            self.assertEqual(c["hc_env"], {})

        sent = {c["args"][2]: c["args"][3] for c in calls if c["args"][:2] == ["send", "--force"]}
        self.assertEqual(sent["t1"], "claude --dangerously-skip-permissions --model opus --continue")
        self.assertEqual(sent["t2"], "agy --dangerously-skip-permissions --model gemini-4-argon-high -c")
        self.assertEqual(sent["t3"], "claude --model sonnet --resume 33333333-3333-3333-3333-333333333333")
        # Whole-pal wake on MultiAgy wakes its room seat (t5) with its own conversation UUID, not t4.
        self.assertNotIn("t4", sent)
        self.assertEqual(sent["t5"], "agy --dangerously-skip-permissions --conversation=22222222-2222-2222-2222-222222222222")

        # Explicit channel wake on MultiAgy#general wakes t4 with t4's own conversation UUID.
        r2 = run_crew(sb, "wake", "MultiAgy#general")
        self.assertEqual(r2.returncode, 0, r2.stderr)
        calls2 = [json.loads(l) for l in sb["calls"].read_text().splitlines()]
        sent2 = {c["args"][2]: c["args"][3] for c in calls2 if c["args"][:2] == ["send", "--force"]}
        self.assertEqual(sent2["t4"], "agy --dangerously-skip-permissions --conversation=11111111-1111-1111-1111-111111111111")


if __name__ == "__main__":
    unittest.main()
