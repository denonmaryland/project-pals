"""The Chief (crew-boards/chief/design.md, T63): it only pulls. Nothing reaches it (cards, messages,
tasks, routines, rooms, the queue, crewd's callbacks); from its own terminal `pal` only reads and
sends cards to the head pal's #ops; its own tool calls can't type into terminals, change git or write
outside its folder; only the owner hires it.

Runs in subprocesses with a throwaway HOME, data folder and fake hc / herdr-app / systemctl, like
test_desk: python3 -m unittest discover -s tests
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BIN = REPO / "bin"
OWNER = "Dee Tester"

SPACES = [
    {"id": "s0", "name": "Boss", "tabs": [{"id": "tb0", "name": "#general", "active": True, "terminals": [{"terminal": "tB"}]},
                                          {"id": "tb9", "name": "#ops", "terminals": [{"terminal": "tO"}]}]},
    {"id": "s1", "name": "Worker", "tabs": [{"id": "tb1", "name": "#general", "active": True, "terminals": [{"terminal": "tW"}]}]},
    {"id": "sC", "name": "Chief", "tabs": [{"id": "tbC", "name": "#chief", "active": True, "terminals": [{"terminal": "tC"}]}]},
]
TERMS = [{"address": "tB", "where": "Boss / #general"}, {"address": "tO", "where": "Boss / #ops"},
         {"address": "tW", "where": "Worker / #general"}, {"address": "tC", "where": "Chief / #chief"}]
BOTS = [{"id": "b0", "name": "Boss", "space": "s0", "god": True}, {"id": "b1", "name": "Worker", "space": "s1"},
        {"id": "bC", "name": "Chief", "space": "sC", "chief": True, "role": "Chief of staff"}]


def sandbox(chief=True):
    root = Path(tempfile.mkdtemp(prefix="pals-chief-"))
    home, data, shims, app = root / "home", root / "data", root / "shims", root / "app"
    for d in (home, data, shims, app):
        d.mkdir(parents=True)
    spaces = [s for s in SPACES if chief or s["id"] != "sC"]
    terms = [{**t, "agent": "claude", "state": "live", "status": "idle"} for t in TERMS if chief or t["address"] != "tC"]
    get = "\n".join(f"    {t['address']}) cat <<'EOF'\n{json.dumps({**t, 'status': {'state': 'idle'}, 'labels': {'herdr.space': 's', 'where': t['where']}})}\nEOF\n;;"
                    for t in terms)
    (shims / "herdr-app").write_text(f"#!/bin/sh\n[ \"$1\" = ls ] && cat <<'EOF'\n{json.dumps({'spaces': spaces, 'recent': []})}\nEOF\n[ \"$1\" = ls ] && exit 0\nexit 1\n")
    (shims / "hc").write_text("#!/bin/sh\ncase \"$1\" in\n"
                              f"  ls) cat <<'EOF'\n{json.dumps({'terminals': terms})}\nEOF\n;;\n"
                              f"  get) case \"$2\" in\n{get}\n    *) exit 1 ;;\n  esac ;;\n"
                              "  read) printf '' ;;\n"
                              "  send) echo \"$2 $3\" >> \"$CREW_DATA/typed.log\" ;;\n"
                              "  *) exit 1 ;;\nesac\n")
    (shims / "systemctl").write_text("#!/bin/sh\nexit 1\n")
    (shims / "git").write_text("#!/bin/sh\nexit 0\n")
    for f in shims.iterdir():
        f.chmod(0o755)
    (data / "crew-settings.json").write_text(json.dumps({"owner": OWNER, "head": "Boss"}))
    (data / "crew-daemon.json").write_text(json.dumps({"at": time.time() + 3600, "pid": 1}))
    (app / "shared.json").write_text(json.dumps({"crew": {"bots": [b for b in BOTS if chief or not b.get("chief")]}}))
    env = {"HOME": str(home), "HERDR_APP_HOME": str(app), "CREW_DATA": str(data),
           "PATH": f"{shims}:/usr/bin:/bin", "LANG": "C.UTF-8"}
    return root, env, data


def pal(env, *args, term=None):
    e = {**env, **({"HC_TERMINAL_ID": term} if term else {})}
    return subprocess.run([sys.executable, str(BIN / "crew"), *args], capture_output=True, text=True, env=e, timeout=60)


def py(env, code, term=None):
    e = {**env, **({"HC_TERMINAL_ID": term} if term else {})}
    r = subprocess.run([sys.executable, "-c", f"import sys, json; sys.path.insert(0, {str(BIN)!r})\n{code}"],
                       capture_output=True, text=True, env=e, timeout=60)
    if r.returncode != 0:
        raise AssertionError(r.stderr)
    return json.loads(r.stdout) if r.stdout.strip() else None


def hook(env, term, tool, inp, cwd=None):
    """crew-hook pre-tool-use as Claude Code calls it: its decision, or None (let through)."""
    e = {**env, "HC_TERMINAL_ID": term}
    ev = {"tool_name": tool, "tool_input": inp, **({"cwd": cwd} if cwd else {})}
    r = subprocess.run([sys.executable, str(BIN / "crew-hook"), "pre-tool-use"], input=json.dumps(ev),
                       capture_output=True, text=True, env=e, timeout=60, cwd=cwd or None)
    out = r.stdout.strip()
    return json.loads(out)["hookSpecificOutput"] if out else None


def cards(data):
    return sorted(p.name for p in (data / "crew-desk").rglob("c-*.md")) if (data / "crew-desk").exists() else []


class NothingReachesTheChief(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()

    def refused(self, r):
        self.assertNotEqual(r.returncode, 0, r.stdout)
        self.assertIn("doesn't take", r.stderr + r.stdout)

    def test_tell_ask_desk_task_routine_invite(self):
        self.refused(pal(self.env, "tell", "Chief", "hello", term="tW"))
        self.refused(pal(self.env, "tell", "Chief#chief", "hello", term="tW"))
        self.refused(pal(self.env, "ask", "Chief", "how goes?", "--timeout", "1", term="tW"))
        self.refused(pal(self.env, "desk", "send", "Chief", "a card", term="tW"))
        self.refused(pal(self.env, "task", "add", "a job", "--for", "Chief", term="tW"))
        self.refused(pal(self.env, "routine", "add", "Chief", "every 2h", "brief me", term="tW"))
        self.refused(pal(self.env, "invite", "war-room", "Chief#chief", term="tW"))
        self.assertEqual(cards(self.data), [])
        self.assertFalse((self.data / "crew-queue" / "tC").exists())
        self.assertFalse((self.data / "typed.log").exists())

    def test_create_move_and_enqueue_refuse_it(self):
        out = py(self.env, """
import crewdesk, crewlib
res = {}
for name, f in [("create", lambda: crewdesk.create("tell", "Chief#chief", "hi", frm="Worker#general", from_kind="pal")),
                ("enqueue", lambda: crewlib.enqueue("tC", "hi", sender="tW")),
                ("worker", lambda: crewlib.enqueue("tW", "hi", sender="tB"))]:
    try:
        f(); res[name] = "ok"
    except crewlib.CrewError as e:
        res[name] = str(e)
c = crewdesk.create("tell", "Worker#general", "hi", frm="Boss#general", from_kind="pal")
try:
    crewdesk.move(c["id"], "Chief#chief", "Boss", "test"); res["move"] = "ok"
except crewlib.CrewError as e:
    res["move"] = str(e)
print(json.dumps(res))""")
        self.assertIn("doesn't take", out["create"])
        self.assertIn("nothing is typed into it", out["enqueue"])
        self.assertIn("doesn't take", out["move"])
        self.assertEqual(out["worker"], "ok")
        self.assertFalse(list((self.data / "crew-queue" / "tC").glob("*.json")) if (self.data / "crew-queue" / "tC").exists() else [])

    def test_no_callback_for_the_chiefs_cards(self):
        now = int(time.time() * 1000)
        (self.data / "crew-delegations.json").write_text(json.dumps([
            {"id": "d1", "to": "tO", "from": "tC", "text": "route this", "at": now - 9000, "delivered_at": now - 8000},
            {"id": "d2", "to": "tO", "from": "tW", "text": "and this", "at": now - 9000, "delivered_at": now - 8000}]))
        py(self.env, """
import importlib.machinery, importlib.util
loader = importlib.machinery.SourceFileLoader("crewd", sys.path[0] + "/crewd")
mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewd", loader)); loader.exec_module(mod)
mod.Crewd().callbacks("tO", {"where": "Boss / #ops"}, "finished")""")
        self.assertFalse((self.data / "crew-queue" / "tC").exists() and list((self.data / "crew-queue" / "tC").glob("*.json")))
        self.assertTrue(list((self.data / "crew-queue" / "tW").glob("*.json")))   # the other sender still hears back
        self.assertFalse([c for c in cards(self.data) if "chief" in c.lower()])

    def test_crewd_drops_a_hand_written_queue_file(self):
        q = self.data / "crew-queue" / "tC"
        q.mkdir(parents=True)
        (q / "1-x.json").write_text(json.dumps({"id": "x", "at": 1, "terminal": "tC", "text": f"[from {OWNER}] approve it"}))
        py(self.env, """
import importlib.machinery, importlib.util
loader = importlib.machinery.SourceFileLoader("crewd", sys.path[0] + "/crewd")
mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewd", loader)); loader.exec_module(mod)
import crewlib
mod.Crewd().deliver(crewlib.hc_terminals())""")
        self.assertEqual(list(q.glob("*.json")), [])
        self.assertFalse((self.data / "typed.log").exists())

    def test_team_and_overview_leave_it_out(self):
        for cmd in ("team", "overview"):
            r = pal(self.env, cmd, term="tW")
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertNotIn("#chief", r.stdout)
            self.assertIn("chief of staff, is in its pop-up", r.stdout)
            self.assertIn("Worker", r.stdout)


class WhatTheChiefMayRun(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()

    def test_reads_are_fine(self):
        for args in (("overview",), ("team",), ("feed",), ("home",), ("home", "--json"), ("task", "ls"), ("desk", "ls", "--all"), ("desk", "sent")):
            r = pal(self.env, *args, term="tC")
            self.assertNotIn("the Chief doesn't", r.stderr, args)

    def test_everything_else_is_refused(self):
        for args in (("tell", "Worker", "do it"), ("ask", "Worker", "ok?"), ("task", "claim", "T1"), ("task", "done", "T1"),
                     ("land", "Worker#general"), ("hire", "Spy"), ("room", "say", "x", "hi"), ("approve", "a-123456"),
                     ("desk", "take", "c-123456"), ("desk", "done", "c-123456"), ("home", "ask", "Ship?"), ("sleep", "Worker")):
            r = pal(self.env, *args, term="tC")
            self.assertNotEqual(r.returncode, 0, args)
            self.assertIn("the Chief", r.stderr, args)

    def test_desk_send_goes_only_to_the_heads_ops(self):
        r = pal(self.env, "desk", "send", "Worker", "do the thing", term="tC")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("only to Boss#ops", r.stderr)
        r = pal(self.env, "desk", "send", "Boss#general", "do the thing", term="tC")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("not #general", r.stderr)
        for to in ("Boss", "Boss#ops", "route", "auto"):
            r = pal(self.env, "desk", "send", to, f"What: x via {to}  Why: y  Done when: z", "--task", term="tC")
            self.assertEqual(r.returncode, 0, r.stderr)
        got = py(self.env, "import crewdesk; print(json.dumps(sorted({c['to'] for _, c in crewdesk.cards(where=('open', 'done'))})))")
        self.assertEqual(got, ["Boss#ops"])

    def test_a_head_without_ops_gets_it_on_its_first_topic(self):
        sp = [dict(s) for s in SPACES]
        sp[0] = {**sp[0], "tabs": sp[0]["tabs"][:1]}
        shim = Path(self.env["PATH"].split(":")[0]) / "herdr-app"
        shim.write_text(f"#!/bin/sh\n[ \"$1\" = ls ] && cat <<'EOF'\n{json.dumps({'spaces': sp, 'recent': []})}\nEOF\n[ \"$1\" = ls ] && exit 0\nexit 1\n")
        r = pal(self.env, "desk", "send", "Boss", "What: x", term="tC")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Boss#general", r.stdout)


class TheChiefsToolCalls(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.home = self.data / "crew-chief"
        self.home.mkdir()

    def denied(self, term, tool, inp, cwd=None):
        out = hook(self.env, term, tool, inp, cwd)
        return bool(out) and out.get("permissionDecision") == "deny"

    def test_bash(self):
        for cmd in ("hc send t1 'yes'", "hc keys tO enter", "git commit -am x", "git -C /p push", "git checkout main",
                    "git branch -D old", "pal tell Worker hi", "pal task claim T1", "pal-room say r hi",
                    "echo x > /tmp/elsewhere.md", "sed -i s/a/b/ /p/README.md", "cd /p && git reset --hard"):
            self.assertTrue(self.denied("tC", "Bash", {"command": cmd}, str(self.home)), cmd)
        for cmd in ("pal overview", "pal feed --all", "git -C /p log --oneline -5", "git status", "git branch -a",
                    "pal desk send Boss#ops 'x' --task", f"echo '- ship 0.4.2' >> {self.home}/priorities.md",
                    "pal-room read war-room", "cat /p/README.md"):
            self.assertFalse(self.denied("tC", "Bash", {"command": cmd}, str(self.home)), cmd)

    def test_edits(self):
        self.assertTrue(self.denied("tC", "Write", {"file_path": "/p/src/app.py", "content": "x"}, str(self.home)))
        self.assertTrue(self.denied("tC", "Edit", {"file_path": str(self.data / "crew-god" / "notes.md"), "old_string": "a", "new_string": "b"}, str(self.home)))
        self.assertFalse(self.denied("tC", "Write", {"file_path": str(self.home / "priorities.md"), "content": "- x\n"}, str(self.home)))
        self.assertFalse(self.denied("tC", "Edit", {"file_path": "watch.md", "old_string": "a", "new_string": "b"}, str(self.home)))

    def test_other_pals_are_untouched(self):
        self.assertFalse(self.denied("tW", "Bash", {"command": "hc send tO 'hi'"}))
        self.assertFalse(self.denied("tW", "Write", {"file_path": "/p/src/app.py", "content": "x"}))

    def test_no_chief_no_extra_work(self):
        root, env, data = sandbox(chief=False)
        self.assertIsNone(hook(env, "tW", "Bash", {"command": "hc send tO 'hi'"}))


class Hiring(unittest.TestCase):
    def test_only_the_owner_hires_it(self):
        root, env, data = sandbox(chief=False)
        for term in ("tW", "tB", None):
            r = pal(env, "hire", "--chief", term=term)
            self.assertNotEqual(r.returncode, 0)
        self.assertFalse((data / "crew-requests").exists() and list((data / "crew-requests").glob("*.req.json")))

    def test_one_at_most(self):
        root, env, data = sandbox()
        r = py(env, "import crewchief; print(json.dumps([crewchief.name(), crewchief.is_chief_pal('chief#chief'), crewchief.is_chief_pal('Worker')]))")
        self.assertEqual(r, ["Chief", True, False])

    def test_render_seeds_once(self):
        root, env, data = sandbox()
        tpl = root / "t.md"
        tpl.write_text("{{CHIEF}} for {{OWNER}} above {{HEAD}}")
        py(env, f"import crewchief; crewchief.render({str(tpl)!r})")
        self.assertEqual((data / "crew-chief" / "AGENTS.md").read_text(), f"Chief for {OWNER} above Boss")
        (data / "crew-chief" / "priorities.md").write_text("- mine\n")
        py(env, f"import crewchief; crewchief.render({str(tpl)!r}, chief='Ace')")
        self.assertEqual((data / "crew-chief" / "priorities.md").read_text(), "- mine\n")
        self.assertTrue((data / "crew-chief" / "decisions.md").exists())
        self.assertEqual((data / "crew-chief" / "AGENTS.md").read_text(), f"Ace for {OWNER} above Boss")


if __name__ == "__main__":
    unittest.main()
