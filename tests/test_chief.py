"""The Chief (crew-boards/chief/design.md, T63): it only pulls. Nothing reaches it (cards, messages,
tasks, routines, rooms, the queue, crewd's callbacks); from its own terminal `pal` only reads and
sends cards to the head pal's #ops; its own tool calls can't type into terminals, change git or write
outside its folder; only the owner hires it.

Runs in subprocesses with a throwaway HOME, data folder and fake hc / herdr-app / systemctl, like
test_desk: python3 -m unittest discover -s tests
"""
import hashlib
import itertools
import json
import os
import random
import shlex
import shutil
import subprocess
import sys
import time
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

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
    root = Path(pals_tmp.mkdtemp(prefix="pals-chief-"))
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
        self.assertIn("only to Boss's inbox (Boss#ops)", r.stderr)
        r = pal(self.env, "desk", "send", "Boss#general", "do the thing", term="tC")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Boss#ops (its inbox), not #general", r.stderr)
        for to in ("Boss", "Boss#ops", "route", "auto"):
            r = pal(self.env, "desk", "send", to, f"What: x via {to}  Why: y  Done when: z", "--task", term="tC")
            self.assertEqual(r.returncode, 0, r.stderr)
        got = py(self.env, "import crewdesk; print(json.dumps(sorted({c['to'] for _, c in crewdesk.cards(where=('open', 'done'))})))")
        self.assertEqual(got, ["Boss#ops"])

    def test_the_target_is_the_heads_inbox_topic_from_the_roster(self):
        # T60: the owner set the head pal's inbox topic (head_topic); the Chief's cards follow it.
        st = json.loads((self.data / "crew-settings.json").read_text())
        (self.data / "crew-settings.json").write_text(json.dumps({**st, "head_topic": "general"}))
        r = pal(self.env, "desk", "send", "Boss", "What: x", term="tC")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Boss#general", r.stdout)
        r = pal(self.env, "desk", "send", "Boss#ops", "What: y", term="tC")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Boss#general (its inbox)", r.stderr)

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

    # Codex's 0.4.2 review (P2, T121): branch, tag and config were "reads" with some writing flags
    # excluded, so the plain writes that carry no flag passed. Only explicit read forms pass now.
    GIT_WRITES = (
        "git branch review-notes", "git tag review-note", "git config user.name Example",          # the three reported
        "git branch review-notes main", "git branch -v review-notes", "git branch --sort=refname x", "git branch -f x main",
        "git branch -d old", "git branch -m old new", "git branch -c old new", "git branch -u origin/main",
        "git branch --set-upstream-to=origin/main", "git branch --unset-upstream", "git branch --edit-description",
        "git branch --track x origin/x", "git branch -- x", "git -C /p branch x", "cd /p && git branch x",
        "git tag v1 HEAD", "git tag -a v1 -m x", "git tag -d v1", "git tag -f v1", "git tag -s v1", "git tag --sort=refname v1",
        "git tag -m note v1", "git tag -F notes.txt v1", "git tag -- v1",
        "git config user.name", "git config --global user.email a@b.c", "git config set user.name X", "git config unset user.name",
        "git config --unset user.name", "git config --add remote.origin.fetch x", "git config --replace-all a.b c",
        "git config --rename-section a b", "git config --remove-section a", "git config --edit", "git config -e",
        "git config edit", "git config rename-section a b", "git config --global set user.name X", "git config",
        "git config user.name --get", "git config a.b --list", "git config --global a.b --get-all", "git config a.b user.name --get-regexp",
        "git remote add up https://example.com/x.git", "git remote set-url origin x", "git remote rm origin", "git remote -v update",
        "git remote prune origin", "git remote rename a b",
        "git worktree add ../x", "git worktree remove x", "git worktree prune", "git worktree",
        "git reflog expire --all", "git reflog delete HEAD@{1}", "git reflog drop --all", "git reflog write a b c d",
    )
    GIT_READ_FORMS = (
        "git branch", "git branch -a", "git branch -r", "git branch -v", "git branch -vv", "git branch -avv", "git branch --all --verbose",
        "git branch --list", "git branch --list 'crew/*'", "git branch -l 'crew/*' -v", "git branch --show-current",
        "git branch --contains HEAD", "git branch --contains=HEAD", "git branch -r --merged main", "git branch --no-merged",
        "git branch --points-at HEAD", "git branch --sort=-committerdate --format='%(refname:short)'", "git branch --no-color -a",
        "git branch --format '%(refname)' --list", "git -C /p --no-pager branch -a",
        "git tag", "git tag -l", "git tag --list 'v0.4.*'", "git tag -l -n3", "git tag -n", "git tag --contains HEAD",
        "git tag --sort=-creatordate", "git tag --merged main --format='%(refname:short)'", "git tag --points-at HEAD",
        "git config --get user.name", "git config --get-all remote.origin.fetch", "git config --get-regexp '^remote'", "git config --list",
        "git config -l --show-origin", "git config --global --get user.email", "git config --type=bool --get core.bare",
        "git config -f .gitmodules --list", "git config get user.name", "git config list --show-scope", "git config get --all --default x a.b",
        "git remote", "git remote -v", "git remote show origin", "git remote show -n origin", "git remote get-url --push origin",
        "git worktree list", "git worktree list --porcelain",
        "git reflog", "git reflog show HEAD", "git reflog -5", "git reflog list", "git reflog exists refs/heads/main",
        "git log --oneline -5", "git status", "git diff --stat", "git show HEAD", "git rev-parse HEAD",
    )

    # A reading subcommand that writes a file (Orca, after T121's sweep): --output is a diff option,
    # so every command that takes diff options has it, and git empties the file as it parses the flag.
    GIT_FILE_WRITES = (
        "git log --output=/p/log.txt", "git log -5 --output /p/log.txt", "git diff --output=patch.diff", "git diff --stat --output patch.diff HEAD~1",
        "git show --output=x HEAD", "git blame --output=x README.md", "git shortlog --output=x", "git rev-list --output=x HEAD",
        "git reflog show --output=x", "git reflog --output=x", "git -C /p log --output=x", "cd /p && git diff --output=x",
        "git blame -- main --output=a", "git shortlog -- --output=x.out -3",          # these two take it even after "--"
        f"git log --output={'{home}'}/log.txt",                                # even into its own folder: a redirect does that
        "git grep -O TODO", "git grep -Oless TODO", "git grep -nO TODO", "git grep -1O TODO", "git grep -2nO TODO", "git grep -10Oless TODO",
        "git grep -v1O TODO", "git grep -5 -O TODO", "git grep -hIO TODO", "git grep -xO TODO",          # T141: digits (context) before the O "git grep --open-files-in-pager TODO", "git grep --open-files-in-pager=less TODO",
        "git grep --open=less TODO", "git grep --op TODO", "git grep --open-files-in=less TODO", "git grep --open-files-in-page=less TODO",   # git takes these as the same option
        "git format-patch -o /p/out HEAD~1", "git format-patch HEAD~1", "git archive -o /p/x.tar HEAD", "git archive --output=x.zip HEAD",
        "git bundle create /p/x.bundle HEAD", "git notes add -m x", "git stash", "git apply x.diff",
    )
    GIT_STILL_READS = (
        "git log -p --output-indicator-new=+ -3", "git diff --stat HEAD~1", "git diff -Oorderfile", "git log --oneline -- output",
        "git show HEAD:README.md", "git blame README.md", "git shortlog -sn", "git rev-list --count HEAD",
        "git grep -n TODO", "git grep -e OK", "git grep -eOK", "git grep -c -i output", "git grep -n TODO -- -O", "git grep -3 TODO", "git grep -n2 TODO", "git grep -C2 TODO", "git grep -A1 -B1 TODO",
        "git grep -fOwners", "git grep -m1 TODO", "git grep -1eO", "git grep --only-matching TODO", "git grep -e a --or -e b", "git grep -o TODO",
    )

    def test_git_reads_dont_write_files(self):
        cmds = [c.replace("{home}", str(self.home)) for c in self.GIT_FILE_WRITES]
        why = self.refusals(cmds)
        for cmd in cmds:
            self.assertTrue(why[cmd], f"passed: {cmd}")
        self.assertIn("--output writes its output to a file", why["git log --output=/p/log.txt"])
        self.assertIn(f"{self.home.resolve()}/notes.md", why["git log --output=/p/log.txt"])       # how to keep it instead
        self.assertIn("-O opens the files it finds in a program", why["git grep -O TODO"])
        self.assertTrue(self.denied("tC", "Bash", {"command": "git diff --output=patch.diff"}, str(self.home)))
        ok = self.refusals(self.GIT_STILL_READS)
        for cmd in self.GIT_STILL_READS:
            self.assertIsNone(ok[cmd], f"refused: {cmd}")
        # Keeping what git printed, in its own folder, is still a plain redirect.
        self.assertFalse(self.denied("tC", "Bash", {"command": f"git log --oneline -5 > {self.home}/notes.md"}, str(self.home)))
        self.assertTrue(self.denied("tC", "Bash", {"command": "git log --oneline -5 > /p/notes.md"}, str(self.home)))

    def refusals(self, cmds):
        return py(self.env, f"import crewchief\nprint(json.dumps({{c: crewchief.hook_refusal('Bash', {{'command': c}}, {str(self.home)!r}) "
                            f"for c in {list(cmds)!r}}}))", term="tC")

    def test_git_only_in_read_forms(self):
        why = self.refusals(self.GIT_WRITES)
        for cmd in self.GIT_WRITES:
            self.assertTrue(why[cmd], f"passed: {cmd}")
        for cmd in ("git branch review-notes", "git tag review-note", "git config user.name Example"):
            sub = cmd.split()[1]
            self.assertIn(f"`{cmd}`", why[cmd])                      # denied with why: what it ran,
            self.assertIn(f"Read with: git {sub}", why[cmd])         # the forms that do read,
            self.assertIn("Boss#ops", why[cmd])                      # and where a change goes
        ok = self.refusals(self.GIT_READ_FORMS)
        for cmd in self.GIT_READ_FORMS:
            self.assertIsNone(ok[cmd], f"refused: {cmd}")

    def test_the_hook_denies_a_plain_git_write(self):
        for cmd in ("git branch review-notes", "git tag review-note", "git config user.name Example"):
            self.assertTrue(self.denied("tC", "Bash", {"command": cmd}, str(self.home)), cmd)
        for cmd in ("git branch --list", "git tag -l", "git config --get user.name"):
            self.assertFalse(self.denied("tC", "Bash", {"command": cmd}, str(self.home)), cmd)
        # Another pal's git is not the Chief's business.
        self.assertFalse(self.denied("tW", "Bash", {"command": "git branch review-notes"}))

    # T133: what goes before the subcommand, and git's environment, decide what git runs too.
    GIT_SETUP = (
        "git -c diff.external=/p/x diff", "git -c core.pager=less log", "git -c core.fsmonitor=/p/x status", "git -c alias.st=!x st",
        "git -c core.sshCommand=x remote show origin", "git -C /p -c pager.log=x log", "git -c user.name=X log", "git -c",
        "git --config-env=diff.external=PX diff", "git --exec-path=/p log", "git --paginate log", "git -p log", "git --namespace=x log",
        "GIT_EXTERNAL_DIFF=/p/x git diff", "env GIT_EXTERNAL_DIFF=/p/x git diff", "GIT_PAGER=less git log", "PAGER=/p/x git log",
        "GIT_SSH_COMMAND=x git remote show origin", "GIT_EXEC_PATH=/p git log", "GIT_TRACE=/p/trace git status", "GIT_EDITOR=x git log",
        "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0=/p/x git diff", "GIT_CONFIG_GLOBAL=/p/cfg git status",
        "export GIT_EXTERNAL_DIFF=/p/x; git diff", "export GIT_PAGER=less && git log", "declare -x GIT_EXTERNAL_DIFF=/p/x; git diff",
        "GIT_EXTERNAL_DIFF=/p/x; export GIT_EXTERNAL_DIFF; git diff", "GIT_EXTERNAL_DIFF=/p/x sh -c 'git diff'",
        "git diff --ext-diff", "git log -p --ext-diff -1", "git show --ext-diff",
        "git help -w log", "git help --web log", "git help -i log", "git help --info log", "git help --w log",
    )
    GIT_SETUP_OK = (
        "git --no-pager log -3", "git -P diff", "git -C /p status", "git --git-dir=/p/.git log", "git --git-dir /p/.git --work-tree /p status",
        "git -c color.ui=never diff", "git -C /p -c core.quotepath=false ls-files", "git -c advice.detachedHead=false status",
        "git -c log.date=iso log -1", "GIT_PAGER=cat git log", "GIT_PAGER= git diff", "PAGER=cat git show HEAD", "GIT_TERMINAL_PROMPT=0 git remote -v",
        "GIT_OPTIONAL_LOCKS=0 git status", "LC_ALL=C TZ=UTC git log -1", "export GIT_PAGER=cat; git log -1", "export LANG=C",
        "git help log", "git help -a", "git help -g", "git log --help", "git diff --no-ext-diff",
    )

    def test_git_runs_with_the_repos_own_settings(self):
        why = self.refusals(self.GIT_SETUP)
        for cmd in self.GIT_SETUP:
            self.assertTrue(why[cmd], f"passed: {cmd}")
        self.assertIn("`git -c diff.external …`", why["git -c diff.external=/p/x diff"])
        self.assertIn("GIT_EXTERNAL_DIFF in the environment", why["GIT_EXTERNAL_DIFF=/p/x git diff"])
        self.assertIn("GIT_PAGER=cat and --no-pager are fine", why["GIT_PAGER=less git log"])
        self.assertIn("--ext-diff runs an external diff program", why["git diff --ext-diff"])
        self.assertTrue(self.denied("tC", "Bash", {"command": "GIT_EXTERNAL_DIFF=/p/x git diff"}, str(self.home)))
        ok = self.refusals(self.GIT_SETUP_OK)
        for cmd in self.GIT_SETUP_OK:
            self.assertIsNone(ok[cmd], f"refused: {cmd}")

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


class TheRoleIsNotTheChief(unittest.TestCase):
    """Grok T69: the hire dialog offers the role "Chief of staff" to any pal, with no click. Such a pal
    stays an ordinary pal: messaged, listed, unrestricted, and it doesn't block pal hire --chief."""

    def setUp(self):
        self.root, self.env, self.data = sandbox()
        shared = self.root / "app" / "shared.json"
        bots = [{k: v for k, v in b.items() if k != "chief"} for b in BOTS]   # "Chief" keeps only the role
        shared.write_text(json.dumps({"crew": {"bots": bots}}))

    def test_an_ordinary_pal(self):
        self.assertEqual(py(self.env, "import crewchief; print(json.dumps([crewchief.record(), crewchief.name(), crewchief.is_chief_pal('Chief'), crewchief.is_chief_terminal('tC')]))"),
                         [None, None, False, False])
        r = pal(self.env, "tell", "Chief", "hello", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(list((self.data / "crew-queue" / "tC").glob("*.json")))
        r = pal(self.env, "team", term="tW")
        self.assertIn("#chief", r.stdout)
        self.assertNotIn("is in its pop-up", r.stdout)
        self.assertIsNone(hook(self.env, "tC", "Bash", {"command": "hc send tW 'hi'"}))
        r = pal(self.env, "tell", "Worker", "hi from the staffer", term="tC")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_it_doesnt_block_the_real_chief(self):
        # pal hire --chief stops at "you already have a Chief" only when a record says chief: true.
        r = pal(self.env, "hire", "--chief", term=None)
        self.assertNotIn("already have a Chief", r.stderr + r.stdout)
        self.assertIn("click", r.stderr + r.stdout)   # it gets as far as asking for the owner's click


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


@unittest.skipUnless(shutil.which("git"), "needs a real git")
class TheGateAgainstRealGit(unittest.TestCase):
    """T133 (Codex's re-review of 0.4.3's repairs): the Chief's git rules were written from git's
    manual and git disagreed twice (`git config user.name --get` sets the name; `git grep --open=X`
    is --open-files-in-pager). So this runs the real git in a throwaway repo, with a stand-in
    program that leaves a marker when anything starts it:
    - every form listed as starting a program or writing a file really does, here, and is refused;
    - whatever the gate allows, from a sweep of spellings, starts nothing and changes nothing."""
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.home = self.data / "crew-chief"
        self.home.mkdir()
        self.repo, self.ghome, self.mark, self.prog = self.root / "repo", self.root / "ghome", self.root / "MARK", self.root / "prog"
        self.repo.mkdir()
        self.ghome.mkdir()
        self.prog.write_text(f"#!/bin/sh\necho ran >> {self.mark}\nexit 0\n")
        self.prog.chmod(0o755)
        self.genv = {"HOME": str(self.ghome), "PATH": f"{Path(shutil.which('git')).parent}:/usr/bin:/bin", "GIT_CONFIG_NOSYSTEM": "1", "LANG": "C",
                     "PX": str(self.prog)}
        who = ["-c", "user.name=t", "-c", "user.email=t@example.com"]
        for args in (["init", "-q", "-b", "main"], ["add", "a"], [*who, "commit", "-qm", "one"], ["branch", "old"], ["tag", "v1"],
                     ["remote", "add", "origin", str(self.repo)]):
            if args[0] == "add":
                (self.repo / "a").write_text("needle one\n")
            subprocess.run(["git", *args], cwd=self.repo, env=self.genv, check=True, capture_output=True)
        (self.repo / "a").write_text("needle two\n")              # something for diff to show
        self.before = self.state()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def state(self):
        h = hashlib.sha256()
        for p in sorted(self.repo.rglob("*")) + sorted(self.ghome.rglob("*")):
            rel = str(p)
            if "/.git/objects" in rel or "/.git/logs" in rel or p.name == "index":
                continue
            h.update(rel.encode())
            if p.is_file():
                h.update(p.read_bytes())
        return h.hexdigest()

    def real(self, cmd):
        """Run it for real. True when the stand-in program ran or the marker file was written."""
        self.mark.unlink(missing_ok=True)
        subprocess.run(["sh", "-c", cmd], cwd=self.repo, env=self.genv, stdin=subprocess.DEVNULL, capture_output=True, timeout=30)
        return self.mark.exists()

    def refusals(self, cmds):
        return py(self.env, f"import crewchief\nprint(json.dumps({{c: crewchief.hook_refusal('Bash', {{'command': c}}, {str(self.repo)!r}) "
                            f"for c in {list(cmds)!r}}}))", term="tC")

    def test_what_starts_a_program_or_writes_a_file_is_refused(self):
        P, M = shlex.quote(str(self.prog)), shlex.quote(str(self.mark))
        live = [
            f"git grep --open={P} needle", f"git grep --open-files-in={P} needle", f"git grep --open-files-in-page={P} needle",   # Codex's three
            f"git grep --open-files-in-pager={P} needle", f"git grep -O{P} needle", f"git grep -nO{P} needle", f"git grep --op={P} needle",
            f"git grep -1O{P} needle", f"git grep -2nO{P} needle", f"git grep -10O{P} needle", f"git grep -v1O{P} absent",        # Codex's four (T141)
            f"git grep -hIO{P} needle", f"git grep -c3wO{P} needle", f"git grep -5 -O{P} needle",
            f"GIT_EXTERNAL_DIFF={P} git diff", f"env GIT_EXTERNAL_DIFF={P} git diff", f"export GIT_EXTERNAL_DIFF={P}; git diff",
            f"GIT_EXTERNAL_DIFF={P} sh -c 'git diff'",
            f"git -c diff.external={P} diff", f"git -c diff.external={P} log -p -1 --ext-diff", f"git -c diff.external={P} show --ext-diff",
            f"git -c core.fsmonitor={P} status", f"git -c alias.st='!'{P} st", f"git -c man.viewer=x -c man.x.cmd={P} help log",
            f"GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=diff.external GIT_CONFIG_VALUE_0={P} git diff", "git --config-env=diff.external=PX diff",
            f"GIT_TRACE={M} git status", f"git log -1 --output={M}", f"git diff --output={M}", f"git blame -- a --output={M}",
        ]
        for cmd in live:
            self.assertTrue(self.real(cmd), f"this git doesn't start it (drop it from the list?): {cmd}")
        self.mark.unlink(missing_ok=True)
        why = self.refusals(live)
        for cmd in live:
            self.assertTrue(why[cmd], f"starts a program or writes a file, and passed: {cmd}")

    def test_no_cluster_of_grep_options_reaches_the_pager(self):
        """Short options in every order, digits among them, with -O<program> somewhere: whichever
        the gate lets through must not start it. (A list of what may precede the O missed digits.)"""
        P = shlex.quote(str(self.prog))
        letters = "0123456789abcehilnopqrvwzABCEFGHILPWfm"
        rnd = random.Random(141)
        clusters = [f"-{c}O{P}" for c in letters] + [f"-{c}{d}O{P}" for c in "159nvhcIw" for d in "0123nvABCem"]
        clusters += ["-" + "".join(rnd.choice(letters) for _ in range(rnd.choice((2, 3, 4)))) + f"O{P}" for _ in range(120)]
        clusters += [f"-{c} -O{P}" for c in ("1", "n", "5n", "C2", "e needle")] + [f"-O{P}", "-O", f"-e needle -O{P}"]
        cmds = list(dict.fromkeys(f"git grep {c} needle" for c in clusters))
        why = self.refusals(cmds)
        started = [c for c in cmds if self.real(c)]
        self.assertGreater(len(started), 60, "plenty of these really start the program")
        for cmd in started:
            self.assertTrue(why[cmd], f"started the program, and passed: {cmd}")
        self.assertEqual(self.state(), self.before)

    def test_what_passes_starts_nothing_and_changes_nothing(self):
        P, M = shlex.quote(str(self.prog)), shlex.quote(str(self.mark))
        env = ["", "", "", "GIT_PAGER=cat", f"GIT_PAGER={P}", f"PAGER={P}", f"GIT_EXTERNAL_DIFF={P}", f"GIT_TRACE={M}", "GIT_TERMINAL_PROMPT=0",
               f"GIT_SSH_COMMAND={P}", f"GIT_EDITOR={P}", f"GIT_ASKPASS={P}", f"GIT_EXEC_PATH={self.root}"]
        glob = ["", "", "", "--no-pager", "-P", "-C .", "--git-dir=.git", "-p", "--paginate", f"-c diff.external={P}", f"-c core.pager={P}",
                f"-c core.fsmonitor={P}", f"-c core.editor={P}", f"-c pager.log={P}", f"-c pager.grep={P}", "-c color.ui=always", "-c core.quotepath=false",
                f"--exec-path={self.root}", "--config-env=diff.external=PX", f"-c alias.log='!'{P}", f"-c core.sshCommand={P}", f"-c diff.x.textconv={P}"]
        tails = {
            "log": ["-1", "-p -1", "-p -1 --ext-diff", f"-1 --output={M}", "--oneline", "-1 --ext", "-1 --stat"],
            "diff": ["", "--stat", "--ext-diff", f"--output={M}", "--no-ext-diff", "HEAD", f"--output {M}"],
            "show": ["HEAD", "--ext-diff", f"--output={M} HEAD", "--stat HEAD"],
            "grep": ["needle", "-n needle", f"-O{P} needle", f"--open={P} needle", f"--open-files-in-pager={P} needle", f"--op={P} needle",
                     f"--open-files-in-={P} needle", "-O needle", f"-nO{P} needle", "--only-matching needle", "-e needle --or -e two", "-c needle"],
            "status": ["", "--short"], "blame": ["a", f"-- a --output={M}", f"--output={M} a"], "shortlog": ["-sn HEAD", f"-sn HEAD --output={M}"],
            "rev-list": ["--count HEAD", f"--output={M} HEAD"], "help": ["-a", f"-w log", "--web log", "-i log", "--w log"],
            "branch": ["", "-a", "-v", "--list", "x", "-v x", "--edit-description"], "tag": ["", "-l", "x", "-n"],
            "config": ["--list", "--get user.name", "user.name X", "user.name --get", "--edit", "-e"],
            "remote": ["", "-v", "show -n origin", f"add up {P}", "get-url origin"], "reflog": ["", "show", f"show --output={M}", "expire --all"],
            "worktree": ["list", "prune"], "ls-files": [""], "describe": ["--always"], "rev-parse": ["HEAD"], "for-each-ref": [""], "cat-file": ["-p HEAD"],
            "st": [""], "difftool": ["-y", f"-y -x {P}"], "format-patch": [f"-1 -o {self.root}/out"], "archive": [f"-o {M} HEAD"],
        }
        rnd = random.Random(133)
        cmds = []
        for sub, ts in tails.items():
            for t in ts:                                   # each form bare, then under a few settings
                cmds.append(f"git {sub} {t}".strip())
                for _ in range(6):
                    cmds.append(" ".join(x for x in (rnd.choice(env), "git", rnd.choice(glob), sub, t) if x))
        cmds = list(dict.fromkeys(cmds))
        why = self.refusals(cmds)
        allowed = [c for c in cmds if why[c] is None]
        self.assertGreater(len(allowed), 60, "the sweep should let plenty of plain reads through")
        self.assertGreater(len(cmds) - len(allowed), 200)
        for must in ("git log -1", "git diff", "git grep -n needle", "git status", "git branch -a", "git config --list", "GIT_PAGER=cat git --no-pager log -p -1"):
            self.assertIsNone(self.refusals([must])[must], must)
        for cmd in allowed:
            ran = self.real(cmd)
            self.assertFalse(ran, f"passed the gate and started a program or wrote the marker: {cmd}")
            self.assertEqual(self.state(), self.before, f"passed the gate and changed the repo or git's config: {cmd}")


if __name__ == "__main__":
    unittest.main()
