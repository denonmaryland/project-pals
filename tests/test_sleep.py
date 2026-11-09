"""Sleeping and waking pals in place (PR #4, goodboimax; 0.4.1 safety, T41).

Real child processes stand in for agents (pidfd, TERM, KILL) behind a fake /proc (CREW_PROC: comm,
stat, environ, cmdline, cwd, task/*/children), with fake hc / herdr-app and a fake app answering
the CLI's requests (wake-brain, power-report). Covers: only that pal's agent on this machine, never
mid-turn / blocked / typing / a box it can't read / running its own work, TERM then KILL, a pid
reused meanwhile, crewd handing cards back to the Desk, OSC 7501 clearing, and wake's brain and
session rules (no wrong-session resume).
Run: python3 -m unittest tests.test_sleep"""
import importlib.machinery
import importlib.util
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
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
import crewsleep   # noqa: E402

RULE = "─" * 40
IDLE = ["done.", RULE, "❯ ", RULE, "  ? for shortcuts"]          # Claude Code, an empty box
DRAFT = ["done.", RULE, "❯ half a sentence", RULE, "  ? for shortcuts"]
WORKING = ["✻ Thinking… (12s · esc to interrupt)", RULE, "❯ ", RULE, "  ? for shortcuts"]
NO_BOX = ["Do you want to proceed?", "❯ 1. Yes", "  2. No"]
BG = ["done.", RULE, "❯ ", RULE, "  1 shell still running · ? for shortcuts"]
TRUST = ["Quick safety check: Is this a project you created or one you trust?", "❯ 1. Yes, I trust this folder", "  2. No, exit"]


def load_crewd():
    loader = importlib.machinery.SourceFileLoader("crewd_sleep_test", str(REPO / "bin" / "crewd"))
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewd_sleep_test", loader))
    loader.exec_module(mod)
    return mod


def make_fake_proc(root: Path, pid: int, comm="fish", children=(), address=None, ppid=1, start=1000, state="S",
                   cmdline=None, cwd=None):
    """A /proc/<pid> with what crewsleep reads. address: HC_TERMINAL_ID in its environ."""
    pdir = root / str(pid)
    (pdir / "task" / str(pid)).mkdir(parents=True, exist_ok=True)
    (pdir / "fd").mkdir(parents=True, exist_ok=True)
    (pdir / "comm").write_text(f"{comm}\n")
    (pdir / "task" / str(pid) / "children").write_text(" ".join(str(c) for c in children))
    (pdir / "stat").write_text(" ".join([f"{pid} ({comm})", state, str(ppid)] + ["0"] * 17 + [str(start)] + ["0"] * 10))
    (pdir / "environ").write_bytes(b"\0".join([b"PATH=/usr/bin"] + ([f"HC_TERMINAL_ID={address}".encode()] if address else [])) + b"\0")
    (pdir / "cmdline").write_bytes(("\0".join(cmdline or [comm]) + "\0").encode())
    if cwd:
        (pdir / "cwd").write_text(cwd)
    fd1 = pdir / "fd" / "1"
    if not fd1.exists():
        fd1.write_bytes(b"")
    return fd1


def set_children(root, pid, children):
    (root / str(pid) / "task" / str(pid) / "children").write_text(" ".join(str(c) for c in children))


def make_sandbox():
    root = Path(tempfile.mkdtemp(prefix="pals-sleep-case-"))
    home, app, proc, shims = root / "home", root / "app", root / "proc", root / "shims"
    data = app / "data"
    state, calls = root / "state.json", root / "hc-calls.jsonl"
    for d in (home, app, data, proc, shims):
        d.mkdir(parents=True, exist_ok=True)
    (shims / "hc").write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        f"state = json.loads(open({str(state)!r}).read())\n"
        "args = sys.argv[1:]\n"
        "if args[:1] == ['ls']:\n"
        "    print(json.dumps({'terminals': state.get('terminals', [])}))\n"
        "elif args[:1] == ['get']:\n"
        "    info = state.get('info', {}).get(args[1])\n"
        "    if not info:\n"
        "        sys.exit(1)\n"
        "    print(json.dumps(info))\n"
        "elif args[:1] == ['read']:\n"
        "    print('\\n'.join(state.get('screens', {}).get(args[1], [])))\n"
        "elif args[:1] in (['keys'], ['send']):\n"
        f"    with open({str(calls)!r}, 'a') as f:\n"
        "        f.write(json.dumps({'args': args, 'hc_env': {k: v for k, v in os.environ.items() if k.startswith('HC_')}}) + '\\n')\n"
        "else:\n"
        "    sys.exit(1)\n")
    (shims / "herdr-app").write_text(
        "#!/usr/bin/env python3\n"
        "import json, sys\n"
        f"state = json.loads(open({str(state)!r}).read())\n"
        "if sys.argv[1:2] == ['ls']:\n"
        "    print(json.dumps({'spaces': state.get('spaces', [])}))\n"
        "else:\n"
        "    sys.exit(1)\n")
    for n in ("hc", "herdr-app"):
        (shims / n).chmod(0o755)
    env = {**os.environ, "HOME": str(home), "HERDR_APP_HOME": str(app), "CREW_DATA": str(data), "CREW_PROC": str(proc),
           "PATH": f"{shims}:{os.environ.get('PATH', '/usr/bin:/bin')}"}
    env.pop("HC_TERMINAL_ID", None)
    return {"root": root, "home": home, "app": app, "data": data, "proc": proc, "state": state, "calls": calls, "env": env}


class FakeApp:
    """Answers the CLI's requests like the Project Pals layout does: wake-brain from `brains`
    (space id → reply), power-report recorded in `reports`."""
    def __init__(self, sb, brains):
        self.dir, self.brains, self.reports, self.asked = sb["data"] / "crew-requests", brains, [], []
        self.stop = threading.Event()
        self.t = threading.Thread(target=self.serve, daemon=True)
        self.t.start()

    def serve(self):
        while not self.stop.is_set():
            for f in list(self.dir.glob("*.req.json")) if self.dir.exists() else []:
                try:
                    req = json.loads(f.read_text())
                except (OSError, ValueError):
                    continue
                f.unlink(missing_ok=True)
                if req["op"] == "wake-brain":
                    self.asked.append(req)
                    out = {"ok": True, **self.brains[req["space"]]} if req["space"] in self.brains else {"ok": False, "error": "that pal isn't open"}
                else:
                    self.reports.append(req)
                    out = {"ok": True}
                (self.dir / f.name.replace(".req.json", ".result.json")).write_text(json.dumps(out))
            time.sleep(0.05)

    def close(self):
        self.stop.set()
        self.t.join(timeout=2)


def run_crew(sb, *args, me=None, timeout=30):
    env = {**sb["env"], "HC_SESSION": "ppsbx-test", "HC_SCOPE": "t99"}
    if me:
        env["HC_TERMINAL_ID"] = me
    return subprocess.run([sys.executable, str(REPO / "bin" / "crew"), *args], capture_output=True, text=True, env=env, timeout=timeout)


def spawn(*argv):
    """A real child process to stand in for an agent (or its work)."""
    return subprocess.Popen(list(argv) or ["sleep", "60"])


def stubborn():
    """An 'agent' that ignores TERM (KILL only stops it). Returns once its handler is in place."""
    p = subprocess.Popen([sys.executable, "-c", "import signal,time,sys; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
                          "print('ready', flush=True); time.sleep(60)"], stdout=subprocess.PIPE, text=True)
    p.stdout.readline()
    return p


def pal(sb, space, tabs, machine=None):
    return {"id": space, "name": space.capitalize(), "machine": machine,
            "tabs": [{"id": f"tb-{a}", "name": f"#{n}", "active": i == 0, "terminals": [{"terminal": a, "app": "claude-code"}]}
                     for i, (n, a) in enumerate(tabs)]}


def agent_tab(sb, addr, shell, agent, status="idle", screen=IDLE, comm="claude", start=1000):
    """A topic whose shell `shell` (fake pid) runs `agent` (a real pid) in terminal `addr`."""
    make_fake_proc(sb["proc"], shell, comm="bash", children=[agent.pid], address=addr)
    make_fake_proc(sb["proc"], agent.pid, comm=comm, ppid=shell, address=addr, start=start)
    threading.Thread(target=lambda: (agent.wait(timeout=30), set_children(sb["proc"], shell, [])), daemon=True).start()
    return ({"address": addr, "state": "live", "agent": "claude-code", "status": status},
            {"state": "live", "pid": shell, "status": {"app": "claude-code", "state": status}}, screen)


def write_state(sb, spaces, tabs):
    """tabs: {addr: (terminal row, info, screen)}"""
    sb["state"].write_text(json.dumps({"spaces": spaces, "terminals": [t[0] for t in tabs.values()],
                                       "info": {a: t[1] for a, t in tabs.items()}, "screens": {a: t[2] for a, t in tabs.items()}}))


def reap(*procs):
    for p in procs:
        if p.poll() is None:
            p.kill()
        p.wait(timeout=5)
        if p.stdout:
            p.stdout.close()


# ── the safety checks, in-process ──────────────────────────────────────────────────────────────

class SleepChecks(unittest.TestCase):
    def setUp(self):
        self.proc = Path(tempfile.mkdtemp(prefix="pals-proc-"))
        self.env = mock.patch.dict(os.environ, {"CREW_PROC": str(self.proc)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.space = {"name": "Navi", "machine": None}
        self.info = {"state": "live", "pid": 500, "status": {"app": "claude-code", "state": "idle"}}

    def agent(self, comm="claude", address="t1", **kw):
        make_fake_proc(self.proc, 500, comm="bash", children=[600], address="t1")
        make_fake_proc(self.proc, 600, comm=comm, ppid=500, address=address, **kw)

    def refused(self, *, info=None, lines=IDLE, space=None, address="t1", me="t9"):
        with self.assertRaises(crewsleep.Refused) as e:
            crewsleep.check_sleep(space or self.space, address, me, info or self.info, lines)
        return str(e.exception)

    def test_an_idle_agent_with_an_empty_box_passes(self):
        self.agent()
        self.assertEqual(crewsleep.check_sleep(self.space, "t1", "t9", self.info, IDLE), (500, 600))

    def test_only_this_machine(self):
        self.agent()
        self.assertIn("another machine", self.refused(space={"name": "Far", "machine": "nas"}))
        self.assertIn("another machine", self.refused(address="nas/t1"))

    def test_never_itself(self):
        self.agent()
        self.assertIn("that's you", self.refused(me="t1"))

    def test_mid_turn_blocked_and_prompts_are_refused(self):
        self.agent()
        self.assertIn("mid-turn", self.refused(info={**self.info, "status": {"state": "working"}}))
        self.assertIn("blocked", self.refused(info={**self.info, "status": {"state": "blocked"}}))
        self.assertIn("mid-turn", self.refused(lines=WORKING))   # status lagging behind the screen
        self.assertIn("folder-trust", self.refused(lines=TRUST))

    def test_unsent_text_or_an_unreadable_box_is_refused(self):
        self.agent()
        self.assertIn("unsent text", self.refused(lines=DRAFT))
        self.assertIn("half a sentence", self.refused(lines=DRAFT))
        self.assertIn("can't see an empty input box", self.refused(lines=NO_BOX))

    def test_a_shell_whose_environ_names_another_terminal_is_not_its(self):
        make_fake_proc(self.proc, 500, comm="bash", children=[600], address="t7")   # a remote pal's pid names some local process
        make_fake_proc(self.proc, 600, comm="claude", ppid=500, address="t7")
        self.assertIn("can't find its shell", self.refused())

    def test_an_agent_from_another_terminal_or_not_an_agent_is_never_picked(self):
        self.agent(address="t2")   # a claude under that shell that runs in another terminal
        self.assertIn("isn't one agent", self.refused())
        self.agent(comm="node")    # a dev server (or a node-wrapped CLI)
        self.assertIn("isn't one agent (node)", self.refused())

    def test_its_agents_own_work_is_refused_and_named(self):
        self.agent(start=1000)
        make_fake_proc(self.proc, 600, comm="claude", children=[700, 710], ppid=500, address="t1", start=1000)
        make_fake_proc(self.proc, 700, comm="node", ppid=600, start=1500, cmdline=["node", "mcp-server.js"])     # an MCP server: started with it
        make_fake_proc(self.proc, 710, comm="bash", ppid=600, start=9000, cmdline=["bash", "-c", "npm run dev"])  # started 80s later
        with mock.patch.object(crewsleep, "SETTLE", 0.01):
            why = self.refused()
        self.assertIn("still has work running", why)
        self.assertIn("npm run dev", why)
        self.assertNotIn("mcp-server", why)

    def test_helpers_and_zombies_dont_count_as_work(self):
        make_fake_proc(self.proc, 500, comm="bash", children=[600], address="t1")
        make_fake_proc(self.proc, 600, comm="claude", children=[700, 720], ppid=500, address="t1", start=1000)
        make_fake_proc(self.proc, 700, comm="node", children=[701], ppid=600, start=1200)   # helper
        make_fake_proc(self.proc, 701, comm="python3", ppid=700, start=1300)               # what it started with it
        make_fake_proc(self.proc, 720, comm="bash", ppid=600, start=9000, state="Z")       # finished, not reaped yet
        self.assertEqual(crewsleep.check_sleep(self.space, "t1", "t9", self.info, IDLE), (500, 600))

    def test_a_helpers_later_child_is_work(self):
        # Grok T50: a tool shell under an MCP server, minutes after the session started, is work.
        make_fake_proc(self.proc, 500, comm="bash", children=[600], address="t1")
        make_fake_proc(self.proc, 600, comm="claude", children=[700], ppid=500, address="t1", start=1000)
        make_fake_proc(self.proc, 700, comm="node", children=[701], ppid=600, start=1200, cmdline=["node", "mcp-server.js"])
        make_fake_proc(self.proc, 701, comm="bash", ppid=700, start=40000, cmdline=["bash", "-c", "cargo build"])
        with mock.patch.object(crewsleep, "SETTLE", 0.01):
            why = self.refused()
        self.assertIn("cargo build", why)
        self.assertNotIn("mcp-server", why)

    def test_a_transient_child_seen_once_is_not_work(self):
        self.agent(start=1000)
        make_fake_proc(self.proc, 600, comm="claude", children=[730], ppid=500, address="t1", start=1000)
        make_fake_proc(self.proc, 730, comm="sh", ppid=600, start=9000, cmdline=["sh", "-c", "statusline"])
        real = crewsleep.own_work
        calls = []
        def once(agent, proc_dir=None):
            calls.append(1)
            return real(agent, proc_dir) if len(calls) == 1 else []   # gone on the second look
        with mock.patch.object(crewsleep, "own_work", side_effect=once), mock.patch.object(crewsleep, "SETTLE", 0.01):
            self.assertEqual(crewsleep.check_sleep(self.space, "t1", "t9", self.info, IDLE), (500, 600))
        self.assertEqual(len(calls), 2)

    def test_the_same_words_further_up_are_output_not_state(self):
        # Found live (sandbox, T41): an earlier spinner line, or a pal quoting it, isn't a turn.
        self.agent()
        old = ["✻ Working… (esc to interrupt)", RULE, "❯ ", RULE, "  ? for shortcuts", "notes: 1 shell still running earlier", "got: done"]
        self.assertEqual(crewsleep.check_sleep(self.space, "t1", "t9", self.info, old + IDLE[1:]), (500, 600))

    def test_claude_footer_background_shells_are_refused(self):
        self.agent()
        self.assertIn("1 shell still running", self.refused(lines=BG))

    def test_a_message_being_handed_over_is_refused(self):
        self.agent()
        q = crewlib.QUEUE / "t1"
        q.mkdir(parents=True, exist_ok=True)
        (q / "1-x.json.taken").write_text("{}")
        self.addCleanup(lambda: (q / "1-x.json.taken").unlink(missing_ok=True))
        self.assertIn("being handed to it", self.refused())

    def test_a_bare_shell_is_already_asleep(self):
        make_fake_proc(self.proc, 500, comm="bash", children=[], address="t1")
        self.assertEqual(crewsleep.check_sleep(self.space, "t1", "t9", self.info, NO_BOX), (500, None))

    def test_an_agent_not_in_a_shell_is_refused(self):
        make_fake_proc(self.proc, 500, comm="claude", children=[], address="t1")
        self.assertIn("doesn't run in a shell", self.refused())


class StopAgent(unittest.TestCase):
    def setUp(self):
        self.proc = Path(tempfile.mkdtemp(prefix="pals-stop-"))
        self.env = mock.patch.dict(os.environ, {"CREW_PROC": str(self.proc)})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_term_is_enough_for_an_agent_that_listens(self):
        p = spawn()
        self.addCleanup(reap, p)
        make_fake_proc(self.proc, p.pid, comm="claude", ppid=500, address="t1")
        self.assertEqual(crewsleep.stop_agent(p.pid, 500, "t1"), "term")
        self.assertEqual(p.wait(timeout=5), -signal.SIGTERM)

    def test_kill_only_after_term_and_the_wait(self):
        p = stubborn()
        self.addCleanup(reap, p)
        make_fake_proc(self.proc, p.pid, comm="claude", ppid=500, address="t1")
        t0 = time.time()
        self.assertEqual(crewsleep.stop_agent(p.pid, 500, "t1", term_wait=0.6, kill_wait=2), "kill")
        self.assertGreaterEqual(time.time() - t0, 0.55)   # it waited for TERM first
        self.assertEqual(p.wait(timeout=5), -signal.SIGKILL)

    def test_a_pid_that_isnt_that_agent_any_more_is_never_signalled(self):
        p = spawn()
        self.addCleanup(reap, p)
        # Reused meanwhile: same pid, now another program, another parent or another terminal.
        for comm, ppid, addr in (("vim", 500, "t1"), ("claude", 999, "t1"), ("claude", 500, "t2")):
            make_fake_proc(self.proc, p.pid, comm=comm, ppid=ppid, address=addr)
            with self.assertRaises(crewsleep.Refused):
                crewsleep.stop_agent(p.pid, 500, "t1", term_wait=0.2, kill_wait=0.2)
            self.assertIsNone(p.poll())

    def test_already_gone(self):
        p = spawn()
        p.kill(); p.wait()
        self.assertEqual(crewsleep.stop_agent(p.pid, 500, "t1"), "term")


# ── waking: the session it resumes ─────────────────────────────────────────────────────────────

class ResumeRules(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="pals-resume-"))
        self.cwd = "/work/navi"
        import crewchat
        self.tr = crewchat.project_dir(self.cwd) / "33333333-3333-3333-3333-333333333333.jsonl"
        self.tr.parent.mkdir(parents=True, exist_ok=True)
        self.tr.write_text("{}\n")
        self.addCleanup(lambda: self.tr.unlink(missing_ok=True))
        self.sid = self.tr.stem
        self.link = {"terminal": "t1", "transcript": str(self.tr), "session": self.sid, "harness": "claude", "source": "hook"}
        crewsleep.unmark("t1")
        self.addCleanup(crewsleep.unmark, "t1")

    def resume(self, link=None, key="claude", argv=("claude",), cwd=None, links=None, live=()):
        links = links if links is not None else {"t1": link if link is not None else self.link}
        return crewsleep.resume_args("t1", key, list(argv), cwd or self.cwd, links, set(live))

    def test_its_own_hook_linked_session_is_resumed(self):
        self.assertEqual(self.resume()[0], ["--resume", self.sid])
        crewsleep.mark_slept("t1", link=self.link)
        self.assertEqual(self.resume()[0], ["--resume", self.sid])

    def test_agy_resumes_by_conversation(self):
        link = {**self.link, "harness": "antigravity"}
        self.assertEqual(self.resume(link, key="antigravity", argv=("agy",))[0], [f"--conversation={self.sid}"])

    def test_every_doubt_starts_fresh_and_says_why(self):
        cases = [
            ({}, "claude", "no session on record"),
            ({**self.link, "source": "screen"}, "claude", "was a guess"),
            ({**self.link, "harness": "antigravity"}, "claude", "was antigravity, not claude"),
            ({**self.link, "transcript": str(self.tr) + ".gone"}, "claude", "session file is gone"),
            ({**self.link, "session": "x; rm -rf ~"}, "claude", "looks wrong"),
            (self.link, "codex", "aren't resumed"),
        ]
        for link, key, why in cases:
            extra, said = self.resume(link, key=key, argv=(key,))
            self.assertEqual(extra, [], why)
            self.assertIn(why, said)

    def test_a_session_changed_since_sleep_is_not_resumed(self):
        crewsleep.mark_slept("t1", link={**self.link, "session": "44444444-4444-4444-4444-444444444444"})
        extra, said = self.resume()
        self.assertEqual(extra, [])
        self.assertIn("changed since it was put to sleep", said)

    def test_claude_in_another_folder_or_open_elsewhere_starts_fresh(self):
        self.assertIn("another folder", self.resume(cwd="/elsewhere")[1])
        links = {"t1": self.link, "t2": {**self.link, "terminal": "t2"}}
        self.assertIn("another topic (t2)", self.resume(links=links, live={"t2"})[1])
        self.assertEqual(self.resume(links=links, live=set())[0], ["--resume", self.sid])   # t2 isn't running it

    def test_base_argv_drops_one_shot_flags_only_for_claude_and_agy(self):
        self.assertEqual(crewsleep.base_argv(["claude", "--model", "opus", "-p", "hi", "--resume", "x", "-c"], "claude"),
                         ["claude", "--model", "opus"])
        self.assertEqual(crewsleep.base_argv(["agy", "-i", "do it", "--conversation=abc", "--model", "m"], "antigravity"),
                         ["agy", "--model", "m"])
        codex = ["codex", "--no-daemon", "-c", "mcp_servers.pals.command=\"/x\"", "-p", "work"]
        self.assertEqual(crewsleep.base_argv(codex, "codex"), codex)


# ── crewd: messages for a pal that's asleep ─────────────────────────────────────────────────────

class CrewdAsleep(unittest.TestCase):
    def test_reaps_bare_agy_shell_and_hands_cards_back_to_the_desk(self):
        proc = Path(tempfile.mkdtemp(prefix="pals-crewd-proc-"))
        fd1 = make_fake_proc(proc, 5150, comm="fish", children=[], address="tBare")
        crewd = load_crewd()
        daemon = crewd.Crewd()
        import crewdesk
        crewdesk.ensure()
        card = crewdesk.create("tell", "Navi#general", "hello", frm="Orca", from_kind="pal")
        crewlib.mark_hooked("tBare")
        qdir = crewlib.QUEUE / "tBare"
        qdir.mkdir(parents=True, exist_ok=True)
        msgs = [{"id": "m0", "at": crewlib.now_ms(), "text": "room line", "not_before": 0},
                {"id": "m1", "at": crewlib.now_ms(), "text": "urgent card", "not_before": 0, "urgent": True, "card": card["id"]}]
        for i, m in enumerate(msgs):
            (qdir / f"100{i}-{m['id']}.json").write_text(json.dumps(m))
        terms = {"tBare": {"address": "tBare", "state": "live", "agent": "antigravity", "status": "idle", "where": "Navi / #general"}}
        with mock.patch.dict(os.environ, {"CREW_PROC": str(proc)}), \
             mock.patch.object(crewd, "term_info", return_value={"pid": 5150}), \
             mock.patch.object(crewd, "send_now", side_effect=AssertionError("must not type into a bare shell")):
            daemon.reap_osc(terms)
            daemon.deliver(terms)
        self.assertEqual(fd1.read_bytes(), b"\x1b]7501;state=clear\x07")
        self.assertEqual(terms["tBare"]["agent"], "fish")
        self.assertIsNone(terms["tBare"]["status"])
        self.assertFalse(crewlib.hooked("tBare"))
        left = [json.loads(f.read_text())["id"] for f in qdir.glob("*.json")]
        self.assertEqual(left, ["m0"])   # the plain message waits; the card went back to the Desk
        back = crewdesk.read(crewdesk.need(card["id"]))
        self.assertEqual((back["status"], back.get("held")), ("held", "asleep"))
        for f in qdir.glob("*"):
            f.unlink()

    def test_markers_of_gone_terminals_are_forgotten(self):
        crewsleep.mark_slept("tGone", link=None)
        crewsleep.mark_slept("tHere", link=None)
        crewsleep.tidy({"tHere"})
        self.assertIsNone(crewsleep.slept("tGone"))
        self.assertIsNotNone(crewsleep.slept("tHere"))
        crewsleep.unmark("tHere")


# ── the commands ───────────────────────────────────────────────────────────────────────────────

class SleepCli(unittest.TestCase):
    def test_sleep_terms_the_agent_marks_it_and_clears_osc(self):
        sb = make_sandbox()
        agent = spawn()
        self.addCleanup(reap, agent)
        tabs = {"t1": agent_tab(sb, "t1", 7001, agent)}
        sess = sb["data"] / "crew-sessions"
        sess.mkdir(parents=True)
        (sess / "t1.json").write_text(json.dumps({"terminal": "t1", "session": "s-1234567890", "source": "hook"}))
        write_state(sb, [pal(sb, "navi", [("general", "t1")])], tabs)
        r = run_crew(sb, "sleep", "Navi")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("put Navi #general to sleep", r.stdout)
        self.assertEqual(agent.wait(timeout=5), -signal.SIGTERM)
        self.assertEqual((sb["proc"] / "7001" / "fd" / "1").read_bytes(), b"\x1b]7501;state=clear\x07")
        mark = json.loads((sb["data"] / "crew-slept" / "t1.json").read_text())
        self.assertEqual((mark["pal"], mark["topic"], mark["link"]["session"]), ("Navi", "general", "s-1234567890"))

    def test_sleep_refuses_busy_typing_and_self_says_why_and_has_no_force(self):
        sb = make_sandbox()
        ps = [spawn() for _ in range(5)]
        self.addCleanup(reap, *ps)
        tabs = {"t1": agent_tab(sb, "t1", 8001, ps[0]),
                "t2": agent_tab(sb, "t2", 8002, ps[1], status="working"),
                "t3": agent_tab(sb, "t3", 8003, ps[2], status="blocked"),
                "t4": agent_tab(sb, "t4", 8004, ps[3], screen=DRAFT),
                "t5": agent_tab(sb, "t5", 8005, ps[4])}
        write_state(sb, [pal(sb, "alpha", [("general", "t1"), ("dev", "t2"), ("ask", "t3"), ("draft", "t4"), ("me", "t5")])], tabs)
        r = run_crew(sb, "sleep", "Alpha", me="t5")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("put Alpha #general to sleep", r.stdout)
        self.assertIn("not putting Alpha #dev to sleep: it's mid-turn (working)", r.stdout)
        self.assertIn("not putting Alpha #ask to sleep: it's waiting on a prompt (blocked)", r.stdout)
        self.assertIn("not putting Alpha #draft to sleep: there's unsent text in its box", r.stdout)
        self.assertIn("not putting Alpha #me to sleep: that's you", r.stdout)
        self.assertEqual(ps[0].wait(timeout=5), -signal.SIGTERM)
        for p in ps[1:]:
            self.assertIsNone(p.poll())
        r = run_crew(sb, "sleep", "#ask", "--force")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no --force", r.stderr + r.stdout)
        self.assertIsNone(ps[2].poll())

    def test_idle_sweep_skips_the_head_pal_and_exact_name_beats_prefix(self):
        sb = make_sandbox()
        ps = [spawn() for _ in range(3)]
        self.addCleanup(reap, *ps)
        tabs = {"t1": agent_tab(sb, "t1", 8101, ps[0]), "t2": agent_tab(sb, "t2", 8102, ps[1]), "t3": agent_tab(sb, "t3", 8103, ps[2])}
        (sb["app"] / "shared.json").write_text(json.dumps({"crew": {"bots": [{"id": "g", "space": "orca", "name": "Orca", "god": True}]}}))
        write_state(sb, [pal(sb, "orca", [("general", "t1")]), pal(sb, "alpha", [("general", "t2")]), pal(sb, "alpha-2", [("general", "t3")])], tabs)
        r = run_crew(sb, "sleep", "Alpha")
        self.assertIn("put Alpha #general to sleep", r.stdout)
        self.assertIsNone(ps[2].poll())   # Alpha-2 isn't Alpha
        r = run_crew(sb, "sleep", "--idle")
        self.assertIn("put Alpha-2 #general to sleep", r.stdout)
        self.assertIsNone(ps[0].poll())   # the head pal stays up
        self.assertNotIn("Orca", r.stdout)

    def test_naming_the_head_pal_needs_the_owners_click(self):
        sb = make_sandbox()
        p = spawn()
        self.addCleanup(reap, p)
        (sb["app"] / "shared.json").write_text(json.dumps({"crew": {"bots": [{"id": "g", "space": "orca", "name": "Orca", "god": True}]}}))
        write_state(sb, [pal(sb, "orca", [("general", "t1")])], {"t1": agent_tab(sb, "t1", 8301, p)})
        r = run_crew(sb, "sleep", "Orca", me="t42")
        self.assertIn("it's the head pal", r.stdout)
        self.assertIsNone(p.poll())
        # A forged or reused token is refused outright, never downgraded.
        r = run_crew(sb, "sleep", "Orca", "--click", "ab" * 16)
        self.assertNotEqual(r.returncode, 0)
        self.assertIsNone(p.poll())
        # The menu's click: a one-time token for exactly these arguments.
        clicks = sb["data"] / "crew-clicks"
        clicks.mkdir(parents=True, exist_ok=True)
        nonce = "cd" * 16
        (clicks / f"{nonce}.json").write_text(json.dumps({"args": ["sleep", "Orca"], "at": int(time.time() * 1000)}))
        r = run_crew(sb, "sleep", "Orca", "--click", nonce)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("put Orca #general to sleep", r.stdout)
        self.assertEqual(p.wait(timeout=5), -signal.SIGTERM)
        self.assertFalse((clicks / f"{nonce}.json").exists(), "single use")

    def test_sleep_leaves_non_agents_and_remote_pals_alone_and_bad_names_dont_stop_the_rest(self):
        sb = make_sandbox()
        server = spawn()
        self.addCleanup(reap, server)
        make_fake_proc(sb["proc"], 7101, comm="fish", children=[server.pid], address="t1")
        make_fake_proc(sb["proc"], server.pid, comm="node", ppid=7101, address="t1")
        make_fake_proc(sb["proc"], 7102, comm="fish", children=[server.pid], address="t2")
        tabs = {"t1": ({"address": "t1", "state": "live", "agent": "node", "status": None}, {"state": "live", "pid": 7101}, IDLE),
                "t2": ({"address": "t2", "state": "live", "agent": "claude-code", "status": "idle"},
                       {"state": "live", "pid": 7102, "status": {"state": "idle"}}, IDLE)}
        write_state(sb, [pal(sb, "web", [("general", "t1")]), pal(sb, "far", [("general", "t2")], machine="nas")], tabs)
        r = run_crew(sb, "sleep", "Web", "Far")
        self.assertIn("isn't one agent (node)", r.stdout)
        self.assertIn("another machine", r.stdout)
        r = run_crew(sb, "sleep", "--idle")
        self.assertIn("no idle pals", r.stdout)
        r = run_crew(sb, "sleep", "@", "Gone", "Web")
        self.assertIn("@: name a pal", r.stdout)
        self.assertIn("Gone:", r.stdout)
        self.assertIn("Web #general", r.stdout)
        self.assertIsNone(server.poll())

    def test_notify_sends_the_outcome_to_the_app(self):
        sb = make_sandbox()
        p = spawn()
        self.addCleanup(reap, p)
        write_state(sb, [pal(sb, "alpha", [("dev", "t2")])], {"t2": agent_tab(sb, "t2", 8201, p, status="working")})
        app = FakeApp(sb, {})
        self.addCleanup(app.close)
        r = run_crew(sb, "sleep", "--notify", "Alpha")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(app.reports), 1)
        rep = app.reports[0]
        self.assertEqual((rep["op"], rep["mode"], rep["refused"]), ("power-report", "sleep", True))
        self.assertIn("mid-turn", rep["lines"][0])
        self.assertIsNone(p.poll())


class WakeCli(unittest.TestCase):
    def setUp(self):
        self.sb = sb = make_sandbox()
        self.cwd = "/work/navi"
        for i in range(1, 7):
            make_fake_proc(sb["proc"], 9000 + i, comm="fish", children=[], address=f"t{i}", cwd=self.cwd)
        self.agent = spawn()
        self.addCleanup(reap, self.agent)
        make_fake_proc(sb["proc"], 9006, comm="fish", children=[self.agent.pid], address="t6")
        make_fake_proc(sb["proc"], self.agent.pid, comm="claude", ppid=9006, address="t6")
        sess = sb["data"] / "crew-sessions"
        sess.mkdir(parents=True, exist_ok=True)
        c_tr = sb["home"] / ".claude/projects/-work-navi/33333333-3333-3333-3333-333333333333.jsonl"
        c_tr.parent.mkdir(parents=True, exist_ok=True)
        c_tr.write_text("{}\n")
        (sess / "t3.json").write_text(json.dumps({"terminal": "t3", "transcript": str(c_tr), "source": "hook",
                                                  "session": "33333333-3333-3333-3333-333333333333", "harness": "claude"}))
        for addr, cid in (("t4", "11111111-1111-1111-1111-111111111111"), ("t5", "22222222-2222-2222-2222-222222222222")):
            a_tr = sb["home"] / f".gemini/antigravity-cli/brain/{cid}/.system_generated/logs/transcript_full.jsonl"
            a_tr.parent.mkdir(parents=True, exist_ok=True)
            a_tr.write_text("{}\n")
            (sess / f"{addr}.json").write_text(json.dumps({"terminal": addr, "transcript": str(a_tr), "session": cid,
                                                           "harness": "antigravity", "source": "hook"}))
        rooms = sb["data"] / "crew-rooms"
        rooms.mkdir(parents=True, exist_ok=True)
        (rooms / "navi.json").write_text(json.dumps({"name": "navi", "members": [{"bot": "Multi", "channel": "navi", "terminal": "t5"}]}))
        shell = lambda a: ({"address": a, "state": "live", "agent": "fish", "status": None}, {"state": "live", "pid": 9000 + int(a[1:]), "cwd": self.cwd}, [])
        tabs = {f"t{i}": shell(f"t{i}") for i in range(1, 6)}
        tabs["t6"] = ({"address": "t6", "state": "live", "agent": "claude-code", "status": "idle"}, {"state": "live", "pid": 9006}, IDLE)
        spaces = [pal(sb, "plain", [("general", "t1")]), pal(sb, "codexy", [("general", "t2")]), pal(sb, "linked", [("general", "t3")]),
                  pal(sb, "multi", [("general", "t4"), ("navi", "t5")]), pal(sb, "awake", [("general", "t6")])]
        write_state(sb, spaces, tabs)
        claude = lambda *a: {"argv": ["claude", *a], "key": "claude", "name": "Claude Code", "why": "its command on record", "hint": ""}
        self.app = FakeApp(sb, {
            "plain": claude("--dangerously-skip-permissions", "--model", "opus", "-p", "old prompt"),
            "codexy": {"argv": ["codex", "--no-daemon", "-c", "mcp_servers.pals.command=\"/x\""], "key": "codex", "name": "Codex",
                       "why": "this topic's brain on record", "hint": "First run `pal primer`."},
            "linked": claude("--model", "sonnet", "--resume", "stale"),
            "multi": {"argv": ["agy", "--dangerously-skip-permissions"], "key": "antigravity", "name": "Antigravity CLI", "why": "its command on record", "hint": ""},
            "awake": claude(),
        })
        self.addCleanup(self.app.close)

    def sent(self):
        calls = [json.loads(l) for l in self.sb["calls"].read_text().splitlines()] if self.sb["calls"].exists() else []
        for c in calls:   # the caller's address stripped (no <hc from=…> wrap); what finds the core kept
            self.assertNotIn("HC_TERMINAL_ID", c["hc_env"])
            self.assertNotIn("HC_SCOPE", c["hc_env"])
            self.assertEqual(c["hc_env"].get("HC_SESSION"), "ppsbx-test")
        return {c["args"][2]: c["args"][3] for c in calls if c["args"][:2] == ["send", "--force"]}

    def test_wake_types_the_brain_resumes_only_its_own_session_and_prefers_seats(self):
        r = run_crew(self.sb, "wake", "Plain", "Codexy", "Linked", "Multi", "Awake", me="t99")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Awake: already awake", r.stdout)
        sent = self.sent()
        self.assertEqual(sent["t1"], "claude --dangerously-skip-permissions --model opus")            # no session: fresh, no stale -p
        self.assertEqual(sent["t2"], "codex --no-daemon -c 'mcp_servers.pals.command=\"/x\"' 'First run `pal primer`.'")
        self.assertEqual(sent["t3"], "claude --model sonnet --resume 33333333-3333-3333-3333-333333333333")
        self.assertNotIn("t4", sent)   # a whole pal: its room seat (t5), not every topic
        self.assertEqual(sent["t5"], "agy --dangerously-skip-permissions --conversation=22222222-2222-2222-2222-222222222222")
        self.assertIn("no session on record", r.stdout)
        self.assertEqual({q["space"] for q in self.app.asked}, {"plain", "codexy", "linked", "multi"})
        self.assertEqual({q["tab"] for q in self.app.asked if q["space"] == "multi"}, {"tb-t5"})

    def test_a_whole_pal_wakes_the_topics_pal_sleep_put_to_sleep(self):
        crewsleep_dir = self.sb["data"] / "crew-slept"
        crewsleep_dir.mkdir(parents=True)
        (crewsleep_dir / "t4.json").write_text(json.dumps({"terminal": "t4", "link": {"session": "11111111-1111-1111-1111-111111111111"}}))
        r = run_crew(self.sb, "wake", "Multi")
        self.assertEqual(r.returncode, 0, r.stderr)
        sent = self.sent()
        self.assertEqual(sent, {"t4": "agy --dangerously-skip-permissions --conversation=11111111-1111-1111-1111-111111111111"})
        self.assertFalse((crewsleep_dir / "t4.json").exists())   # woken: the marker goes

    def test_a_session_changed_since_sleep_starts_fresh(self):
        d = self.sb["data"] / "crew-slept"
        d.mkdir(parents=True)
        (d / "t3.json").write_text(json.dumps({"terminal": "t3", "link": {"session": "99999999-9999-9999-9999-999999999999"}}))
        r = run_crew(self.sb, "wake", "Linked#general")
        self.assertEqual(self.sent()["t3"], "claude --model sonnet")
        self.assertIn("changed since it was put to sleep", r.stdout)

    def test_nothing_is_typed_into_a_shell_running_something_else(self):
        vim = spawn()
        self.addCleanup(reap, vim)
        make_fake_proc(self.sb["proc"], 9001, comm="fish", children=[vim.pid], address="t1", cwd=self.cwd)
        make_fake_proc(self.sb["proc"], vim.pid, comm="vim", ppid=9001, address="t1")
        with mock.patch.dict(os.environ, {"CREW_PROC": str(self.sb["proc"])}):
            with self.assertRaises(crewsleep.Refused) as e:
                crewsleep.check_wake({"machine": None}, "t1", {"state": "live", "pid": 9001})
        self.assertIn("something else runs in its shell (vim)", str(e.exception))
        self.assertEqual(self.sent(), {})

    def test_wake_refuses_remote_and_a_shell_of_another_terminal(self):
        with mock.patch.dict(os.environ, {"CREW_PROC": str(self.sb["proc"])}):
            with self.assertRaises(crewsleep.Refused):
                crewsleep.check_wake({"machine": "nas"}, "t1", {"state": "live", "pid": 9001})
            with self.assertRaises(crewsleep.Refused) as e:
                crewsleep.check_wake({"machine": None}, "t2", {"state": "live", "pid": 9001})   # t1's shell
        self.assertIn("can't find its shell", str(e.exception))

    def test_notify_reports_wake(self):
        r = run_crew(self.sb, "wake", "--notify", "Linked")
        self.assertEqual(r.returncode, 0, r.stderr)
        rep = [x for x in self.app.reports if x["op"] == "power-report"]
        self.assertEqual(len(rep), 1)
        self.assertEqual((rep[0]["mode"], rep[0]["refused"]), ("wake", False))
        self.assertIn("woke Linked #general", rep[0]["lines"][0])


if __name__ == "__main__":
    unittest.main()
