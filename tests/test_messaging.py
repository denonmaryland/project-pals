"""Messaging: the queue, the delivery hooks, replies from session files, callbacks and the hook
installer. Runs in a throwaway HOME and data folder, with fake hc / herdr-app / systemctl first on
PATH, so it never touches a real Herdr session:  python3 -m unittest discover tests
"""
import importlib.machinery
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
T = Path(tempfile.mkdtemp(prefix="pals-test-"))
SHIMS = T / "shims"
SHIMS.mkdir()
for name in ("hc", "herdr-app", "systemctl"):
    (SHIMS / name).write_text("#!/bin/sh\nexit 1\n")
    (SHIMS / name).chmod(0o755)
ENV = {**os.environ, "HOME": str(T / "home"), "HERDR_APP_HOME": str(T / "app"), "CREW_DATA": str(T / "data"),
       "PATH": f"{SHIMS}:{os.environ.get('PATH', '/usr/bin:/bin')}"}
ENV.pop("HC_TERMINAL_ID", None)
os.environ.clear()
os.environ.update(ENV)
sys.path.insert(0, str(REPO / "bin"))
import crewlib   # noqa: E402  (after the sandbox is in place)
import crewchat  # noqa: E402


def load_crewd():
    loader = importlib.machinery.SourceFileLoader("crewd", str(REPO / "bin" / "crewd"))
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewd", loader))
    loader.exec_module(mod)
    return mod


def queue(term, text, **kw):
    d = crewlib.QUEUE / term
    d.mkdir(parents=True, exist_ok=True)
    m = {"id": crewlib.new_id(), "at": crewlib.now_ms(), "text": text, "not_before": 0, **kw}
    (d / f"{m['at']}-{m['id']}.json").write_text(json.dumps(m))
    time.sleep(0.002)   # distinct, ordered file names


def hook(what, event=None, term="tX", interactive=True):
    env = {**ENV, "CREW_HOOK_INTERACTIVE": "1" if interactive else "0"}
    if term:
        env["HC_TERMINAL_ID"] = term
    r = subprocess.run([sys.executable, str(REPO / "bin" / "crew-hook"), what], input=json.dumps(event or {}),
                       capture_output=True, text=True, env=env)
    assert not r.stderr, r.stderr
    return r.stdout


def iso(ms):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(ms / 1000)) + f".{ms % 1000:03d}Z"


def claude_session(path, entries):
    # Claude Code writes compact JSON, one entry per line.
    path.write_text("".join(json.dumps(e, separators=(",", ":")) + "\n" for e in entries))


def bot_text(at, *texts):
    return {"type": "assistant", "timestamp": iso(at), "message": {"content": [{"type": "text", "text": t} for t in texts]}}


class Hooks(unittest.TestCase):
    def test_stop_takes_due_messages_and_marks_delegations(self):
        crewlib.save_json(crewlib.DATA / "crew-delegations.json", [{"id": "D1", "to": "tS", "at": crewlib.now_ms()}])
        queue("tS", "hola")
        queue("tS", "chao", delegation="D1")
        queue("tS", "despues", not_before=crewlib.now_ms() + 60000)
        out = json.loads(hook("stop", term="tS"))
        self.assertEqual(out["decision"], "block")
        self.assertIn("hola", out["reason"])
        self.assertIn("chao", out["reason"])
        self.assertNotIn("despues", out["reason"])
        self.assertEqual([f.suffix for f in (crewlib.QUEUE / "tS").iterdir()], [".json"])   # only the future one
        self.assertTrue(crewlib.load_json(crewlib.DATA / "crew-delegations.json", [])[0].get("delivered_at"))
        self.assertTrue(crewlib.hooked("tS"))

    def test_quiet_when_nothing_to_do(self):
        # agy reads "{}" as a decision, so "nothing to say" must be empty stdout.
        self.assertEqual(hook("stop", term="tQ"), "")
        self.assertEqual(hook("post-tool-use", term="tQ"), "")
        self.assertEqual(hook("agy-pre-invocation", term="tQ"), "")
        self.assertEqual(hook("agy-stop", {"terminationReason": "NO_TOOL_CALL"}, term="tQ"), "")
        queue("tQ", "x")
        self.assertEqual(hook("stop", {"stop_hook_active": True}, term="tQ"), "")
        self.assertEqual(hook("agy-stop", {"terminationReason": "USER_CANCELED"}, term="tQ"), "")
        self.assertEqual(hook("stop", term=None), "")   # outside Herdr

    def test_each_harness_gets_its_own_shape(self):
        queue("tH", "a")
        self.assertEqual(json.loads(hook("post-tool-use", term="tH"))["hookSpecificOutput"]["additionalContext"], "a")
        queue("tH", "b")
        out = json.loads(hook("agy-pre-invocation", term="tH"))
        self.assertEqual(out["injectSteps"][0]["systemMessage"]["systemMessage"], "b")
        queue("tH", "c")
        self.assertEqual(json.loads(hook("agy-stop", {"terminationReason": "NO_TOOL_CALL"}, term="tH"))["decision"], "continue")

    def test_a_headless_child_leaves_the_pals_messages_alone(self):
        # `claude -p` run by a pal inherits HC_TERMINAL_ID; it must not take the pal's queue.
        queue("tP", "para el pal")
        self.assertEqual(hook("stop", term="tP", interactive=False), "")
        self.assertEqual(hook("agy-pre-invocation", term="tP", interactive=False), "")
        self.assertEqual(len(list((crewlib.QUEUE / "tP").glob("*.json"))), 1)
        self.assertFalse(crewlib.hooked("tP"))

    def test_hooks_link_the_session_file(self):
        f = T / "linked.jsonl"
        claude_session(f, [])
        hook("post-tool-use", {"transcript_path": str(f), "session_id": "s1"}, term="tLk")
        self.assertEqual(crewchat.links()["tLk"]["transcript"], str(f))


class Queue(unittest.TestCase):
    def test_a_claim_is_exclusive_and_can_be_undone(self):
        queue("tC", "x")
        first, second = crewlib.claim_queue("tC"), crewlib.claim_queue("tC")
        self.assertEqual((len(first), second), (1, []))
        crewlib.unclaim(first)
        self.assertEqual(len(crewlib.claim_queue("tC")), 1)

    def test_tidy_puts_back_stale_claims_and_forgets_gone_terminals(self):
        queue("tT", "x")
        (taken, _), = crewlib.claim_queue("tT")
        crewlib.tidy_queue({"tT"})
        self.assertTrue(taken.exists())   # fresh claim: someone is delivering it
        old = time.time() - 600
        os.utime(taken, (old, old))
        crewlib.mark_hooked("tGone")
        crewlib.tidy_queue({"tT"})
        self.assertFalse(taken.exists())
        self.assertEqual(len(list((crewlib.QUEUE / "tT").glob("*.json"))), 1)
        self.assertFalse(crewlib.hooked("tGone"))


class Replies(unittest.TestCase):
    def test_agy_whole_second_stamps(self):
        # agy writes created_at without milliseconds, stamped as the reply starts: often the same
        # second the message went in.
        sent = (crewlib.now_ms() // 1000) * 1000 + 420
        a = T / "brain" / "s" / "transcript_full.jsonl"
        a.parent.mkdir(parents=True)
        a.write_text(json.dumps({"type": "PLANNER_RESPONSE", "created_at": iso(sent - 420)[:-5] + "Z", "content": "al tiro"}) + "\n")
        crewchat.link("tRs", a, harness="antigravity")
        self.assertEqual(crewchat.replies_since("tRs", sent), "al tiro")

    def test_claude_and_agy(self):
        base = crewlib.now_ms()
        c = T / "c.jsonl"
        claude_session(c, [bot_text(base - 5000, "viejo"), bot_text(base + 1000, "nuevo"), bot_text(base + 2000, "fin")])
        crewchat.link("tRc", c)
        self.assertEqual(crewchat.replies_since("tRc", base), "nuevo\n\nfin")
        a = T / "brain" / "x" / "transcript_full.jsonl"
        a.parent.mkdir(parents=True)
        a.write_text("".join(json.dumps(e) + "\n" for e in [
            {"type": "PLANNER_RESPONSE", "created_at": iso(base - 5000), "content": "viejo"},
            {"type": "PLANNER_RESPONSE", "created_at": iso(base + 1000), "content": "respuesta agy", "tool_calls": []}]))
        crewchat.link("tRa", a, harness="antigravity")
        self.assertEqual(crewchat.replies_since("tRa", base), "respuesta agy")
        self.assertIsNone(crewchat.replies_since("nobody", base))


class Callbacks(unittest.TestCase):
    def test_one_note_per_sender_per_turn(self):
        base = crewlib.now_ms()
        c = T / "cb.jsonl"
        claude_session(c, [bot_text(base + 1000, "hecho")])
        crewchat.link("tW", c)
        crewlib.save_json(crewlib.DATA / "crew-delegations.json", [
            {"id": "A", "to": "tW", "from": "tBoss", "text": "uno", "at": base - 9000, "delivered_at": base - 8000},
            {"id": "B", "to": "tW", "from": "tBoss", "text": "dos", "at": base - 7000, "delivered_at": base - 6000},
            {"id": "C", "to": "tW", "from": "tOther", "text": "tres", "at": base - 7000, "delivered_at": base - 6000}])
        crewlib.save_json(crewlib.DATA / "crew-daemon.json", {"at": time.time()})   # queue, don't type
        crewd = load_crewd()
        crewd.Crewd().callbacks("tW", {"where": "Worker#general"}, "finished")
        boss = list((crewlib.QUEUE / "tBoss").glob("*.json"))
        other = list((crewlib.QUEUE / "tOther").glob("*.json"))
        self.assertEqual((len(boss), len(other)), (1, 1))
        note = json.loads(boss[0].read_text())["text"]
        self.assertIn('"uno"; "dos"', note)
        self.assertIn("hecho", note)

    def test_a_hook_delivery_answers_however_soon_the_turn_ends(self):
        base = crewlib.now_ms()
        c = T / "quick.jsonl"
        claude_session(c, [bot_text(base + 100, "listo")])
        crewchat.link("tQk", c)
        crewlib.save_json(crewlib.DATA / "crew-daemon.json", {"at": time.time()})
        crewlib.save_json(crewlib.DATA / "crew-delegations.json", [
            {"id": "Q", "to": "tQk", "from": "tAsker", "text": "rapido", "at": base, "delivered_at": base, "by_hook": True}])
        load_crewd().Crewd().callbacks("tQk", {"where": "Quick#general"}, "finished")
        self.assertEqual(len(list((crewlib.QUEUE / "tAsker").glob("*.json"))), 1)


class Installer(unittest.TestCase):
    def test_new_events_once(self):
        for _ in range(2):
            subprocess.run([sys.executable, str(REPO / "install-hooks.py"), str(T / "bk")], env=ENV, check=True, capture_output=True)
        claude = json.loads((T / "home/.claude/settings.json").read_text())["hooks"]
        for event in ("SessionStart", "PreToolUse", "PostToolUse", "Stop"):
            self.assertEqual(len(claude[event]), 1, event)
        agy = json.loads((T / "home/.gemini/config/hooks.json").read_text())["project-pals"]
        self.assertEqual(set(agy), {"SessionStart", "PreToolUse", "PreInvocation", "Stop"})
        self.assertEqual(len(agy["Stop"]), 1)


if __name__ == "__main__":
    unittest.main()
