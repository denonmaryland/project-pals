"""T90: the Live channel and "Try it live" (bin/crewupdate.py, pal update follow | try | back, pal land).

DeNon, 2026-11-09: "when I make updates to Project Pals I need to see them live, right away." Live
follows main in the owner's own checkout: a landed commit is exported, checked, installed, and put
back by itself if it doesn't come up. "Try it live" runs a topic's branch the same way and Back
restores what was there. Switching the channel, Try, Back and Back to stable are the owner's click.

Everything here is a throwaway: a home, a Herdr app folder and a git checkout made from this source
tree, with fake herdr-app and systemctl in front on PATH (the real ones reach the live session
whatever HOME says). The fake herdr-app fails `check` for a mod holding the word BROKEN-MOD, and
reports an error in `status` while an installed mod holds RUNTIME-BAD.
Run: python3 -m unittest tests.test_live
"""
import json
import os
import shutil
import subprocess
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

ROOT = Path(__file__).resolve().parent.parent

HERDR = '''#!/bin/sh
case "$1" in
  check) if grep -rqs BROKEN-MOD "$2"; then echo "error: $2 doesn't load" >&2; exit 1; fi; echo "check passed"; exit 0 ;;
  ls) cat "$HERDR_APP_HOME/fake-spaces.json" 2>/dev/null || echo '{"spaces":[]}'; exit 0 ;;
  status) if grep -rqs RUNTIME-BAD "$HERDR_APP_HOME/mods"; then echo '{"errors":["mods/crew-about: boom at render"]}'; else echo '{"errors":[]}'; fi; exit 0 ;;
esac
exit 1
'''

# No systemd user session (exit 1, like a container) until the test writes "ok" or "dead" to
# fake-systemd: then every call is logged, a restart "works", and with "ok" crewd is active and beats.
SYSTEMCTL = '''#!/bin/sh
mode="$(cat "$HERDR_APP_HOME/fake-systemd" 2>/dev/null)"
[ -n "$mode" ] || exit 1
echo "$*" >> "$HERDR_APP_HOME/fake-systemctl.log"
case "$*" in
  *is-active*) [ "$mode" = ok ]; exit $? ;;
  *restart*) [ "$mode" = ok ] && printf '{"at": %s}' "$(date +%s.%N)" > "$HERDR_APP_HOME/data/crew-daemon.json"; exit 0 ;;
esac
exit 0
'''

# GitHub is never reached: every request fails as if offline.
OFFLINE = '''
import urllib.error, urllib.request
def _urlopen(req, timeout=None):
    raise urllib.error.URLError("Temporary failure in name resolution")
urllib.request.urlopen = _urlopen
'''


class Live(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = Path(pals_tmp.mkdtemp(prefix="pals-live-"))
        cls.home = cls.t / "home"
        cls.app = cls.home / ".config" / "herdr-app"
        cls.data = cls.app / "data"
        cls.app.mkdir(parents=True)
        shims = cls.t / "shims"
        shims.mkdir()
        (shims / "systemctl").write_text(SYSTEMCTL)
        (shims / "systemd-run").write_text("#!/bin/sh\nexit 1\n")   # never the real one: it would reach the live session
        site = cls.t / "site"
        site.mkdir()
        (site / "sitecustomize.py").write_text(OFFLINE)
        (shims / "herdr-app").write_text(HERDR)
        (shims / "hc").write_text("#!/bin/sh\nexit 1\n")
        for f in shims.iterdir():
            f.chmod(0o755)
        cls.env = {"HOME": str(cls.home), "HERDR_APP_HOME": str(cls.app), "CREW_LIVE_SETTLE": "0", "CREW_LIVE_CREWD_WAIT": "2",
                   "PYTHONPATH": str(site),
                   "PATH": f"{shims}:{cls.home}/.local/bin:/usr/bin:/bin",
                   "GIT_AUTHOR_NAME": "Sam", "GIT_AUTHOR_EMAIL": "sam@example.invalid",
                   "GIT_COMMITTER_NAME": "Sam", "GIT_COMMITTER_EMAIL": "sam@example.invalid",
                   "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null"}
        # The owner's checkout: this source tree as one commit on main.
        cls.proj = cls.t / "proj"
        shutil.copytree(ROOT, cls.proj, ignore=shutil.ignore_patterns(".git", "dist", "__pycache__", "node_modules"))
        cls.git("init", "-q", "-b", "main")
        cls.git("add", "-A")
        cls.git("commit", "-q", "-m", "Project Pals")
        r = subprocess.run(["bash", str(cls.proj / "install.sh")], cwd=cls.proj, env=cls.env, capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        cls.pal_bin = str(cls.home / ".local" / "bin" / "pal")
        # No suite after each swap here (it would run this very file): one test below covers it.
        s = json.loads((cls.data / "crew-settings.json").read_text())
        (cls.data / "crew-settings.json").write_text(json.dumps({**s, "live_tests": "off"}))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.t, ignore_errors=True)

    @classmethod
    def git(cls, *args, at=None):
        r = subprocess.run(["git", "-C", str(at or cls.proj), *args], env=cls.env, capture_output=True, text=True)
        assert r.returncode == 0, f"git {args}: {r.stderr}"
        return r.stdout.strip()

    def pal(self, *args, click=False):
        args = list(args)
        if click:
            d = self.data / "crew-clicks"
            d.mkdir(parents=True, exist_ok=True)
            nonce = os.urandom(16).hex()
            (d / f"{nonce}.json").write_text(json.dumps({"args": args, "at": int(time.time() * 1000)}))
            args += ["--click", nonce]
        return subprocess.run([self.pal_bin, *args], env=self.env, capture_output=True, text=True, timeout=300)

    def ok(self, *args, click=False):
        r = self.pal(*args, click=click)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return json.loads(r.stdout) if "--json" in args else r.stdout

    def commit(self, rel, add, msg, at=None):
        f = (at or self.proj) / rel
        f.write_text(f.read_text() + add)
        self.git("commit", "-qam", msg, at=at)
        return self.git("rev-parse", "HEAD", at=at)

    def running(self):
        return (json.loads((self.data / "crew-install.json").read_text()).get("build") or {})

    def live(self):
        return json.loads((self.data / "crew-live.json").read_text()) if (self.data / "crew-live.json").exists() else {}

    def test_the_whole_story(self):
        main0 = self.git("rev-parse", "main")
        self.assertTrue(main0.startswith(self.running()["hash"]))
        self.assertEqual(self.running()["repo"], str(self.proj), "the install records the checkout it came from")

        # ── The channel is the owner's click; nothing follows while it's Stable ──
        r = self.pal("settings", "channel", "live")
        self.assertNotEqual(r.returncode, 0, "no click, no channel")
        self.assertIn("with a click in Project Pals", r.stdout + r.stderr)
        sha1 = self.commit("mods/crew-about/main.js", "\n// one\n", "About: one")
        out = self.ok("update", "follow", "--json")
        self.assertFalse(out["updated"])
        self.assertIn("Live channel is off", out["message"])
        self.assertTrue(main0.startswith(self.running()["hash"]))

        out = self.ok("settings", "channel", "live", click=True)
        self.assertIn(f"follows main in {self.proj}", out, "found from where the install came from")

        # ── A landed commit goes live, and only the mod it changed is rewritten ──
        status_js = self.app / "mods" / "crew-status" / "main.js"
        before = status_js.stat().st_mtime_ns
        out = self.ok("update", "follow", "--json")
        self.assertTrue(out["updated"], out)
        self.assertEqual(out["reloaded"], ["crew-about"])
        self.assertFalse(out["crewd"])
        self.assertTrue(sha1.startswith(self.running()["hash"]))
        self.assertEqual(self.running()["branch"], "main")
        self.assertIn("// one", (self.app / "mods" / "crew-about" / "main.js").read_text())
        self.assertEqual(status_js.stat().st_mtime_ns, before, "an unchanged mod's files aren't touched, so Herdr doesn't reload it")
        self.assertFalse(self.ok("update", "follow", "--json")["updated"], "nothing to do when main is what's running")
        last = self.live()["last"]
        self.assertEqual((last["state"], last["action"], last["subject"]), ("done", "live", "About: one"))
        self.assertIn("channel: Live (follows main", self.ok("version"))
        self.assertIn(f"main {sha1[:7]}", self.ok("version"))

        # ── A mod that doesn't load never reaches the install, and isn't tried again ──
        bad = self.commit("mods/crew-about/main.js", "\n// BROKEN-MOD\n", "About: broken")
        r = self.pal("update", "follow", "--json")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("crew-about doesn't load", json.loads(r.stdout)["error"])
        self.assertTrue(sha1.startswith(self.running()["hash"]), "what was running stays")
        self.assertNotIn("BROKEN-MOD", (self.app / "mods" / "crew-about" / "main.js").read_text())
        self.assertTrue(bad.startswith(self.live()["hold"]["hash"]))
        out = self.ok("update", "follow", "--json")
        self.assertFalse(out["updated"])
        self.assertIn("is held", out["message"])

        # ── A build that installs but doesn't come up is put back by itself ──
        self.git("reset", "-q", "--hard", sha1)
        runtime = self.commit("mods/crew-about/main.js", "\n// RUNTIME-BAD\n", "About: fails in the app")
        r = self.pal("update", "follow", "--json")
        self.assertNotEqual(r.returncode, 0)
        err = json.loads(r.stdout)["error"]
        self.assertIn("boom at render", err)
        self.assertIn("put back", err)
        self.assertTrue(sha1.startswith(self.running()["hash"]), "the last good build is back")
        self.assertNotIn("RUNTIME-BAD", (self.app / "mods" / "crew-about" / "main.js").read_text())
        self.assertTrue(runtime.startswith(self.live()["hold"]["hash"]))
        self.assertEqual(self.live()["last"]["state"], "failed")

        # … and the same when the pal command itself doesn't run.
        self.git("reset", "-q", "--hard", sha1)
        crew = (self.proj / "bin" / "crew").read_text()
        (self.proj / "bin" / "crew").write_text(crew.replace("import contextlib\n", "import contextlib\nimport no_such_module_for_the_test\n", 1))
        self.git("commit", "-qam", "pal: doesn't start")
        r = subprocess.run([self.pal_bin, "update", "follow", "--json"], env=self.env, capture_output=True, text=True, timeout=300)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pal command doesn't run", json.loads(r.stdout)["error"])
        self.assertEqual(self.pal("version").returncode, 0, "the pal command that works is back")
        self.assertTrue(sha1.startswith(self.running()["hash"]))

        # ── The branch moves on: the fix goes live and the hold is gone ──
        self.git("reset", "-q", "--hard", sha1)
        # A change to the shared JS alone: every mod gets it, and its main.js is written again after
        # it (a reload between the two kept the old shared JS, 2026-11-08). The Chief has a home here,
        # so its brief is rendered by installs from now on.
        (self.data / "crew-chief").mkdir()
        mods = sorted(d.name for d in (self.app / "mods").glob("crew-*"))
        before = {m: (self.app / "mods" / m / "main.js").stat().st_mtime_ns for m in mods}
        sha2 = self.commit("lib/machines.js", "\n// two\n", "machines: two")
        out = self.ok("update", "follow", "--json")
        self.assertTrue(out["updated"])
        self.assertTrue(sha2.startswith(self.running()["hash"]))
        self.assertNotIn("hold", self.live())
        self.assertEqual(out["reloaded"], mods)
        for m in mods:
            self.assertIn("// two", (self.app / "mods" / m / "machines.js").read_text())
            self.assertGreater((self.app / "mods" / m / "main.js").stat().st_mtime_ns, before[m], f"{m}/main.js goes in again, last")
        brief = self.data / "crew-chief" / "AGENTS.md"
        self.assertTrue(brief.exists())

        # ── Try it live: a topic's branch, in its own worktree; the project folder is parked elsewhere ──
        wt = self.t / "wt-x"
        self.git("worktree", "add", "-q", "-b", "crew/x", str(wt), "main")
        self.git("checkout", "-q", "-b", "parked")   # like the real one: the project folder isn't on main
        with open(wt / "chief" / "AGENTS.md", "a") as f:
            f.write("\nTRIAL-BRIEF\n")
        with open(wt / "skills" / "pal-desk" / "SKILL.md", "a") as f:
            f.write("\nTRIAL-SKILL\n")
        tip = self.commit("mods/crew-review/main.js", "\n// tried\n", "Review: tried", at=wt)
        (self.app / "fake-spaces.json").write_text(json.dumps({"spaces": [
            {"id": "s1", "name": "Builder", "folder": str(self.proj), "tabs": [{"id": "t1", "name": "#x", "active": True, "terminals": []}]}]}))
        shared = self.app / "shared.json"
        doc = json.loads(shared.read_text()) if shared.exists() else {}
        doc.setdefault("crew", {})["bots"] = [{"name": "Builder", "space": "s1", "folder": str(self.proj), "worktrees": {
            "#x": {"path": str(wt), "branch": "crew/x", "base": "main", "repo": str(self.proj)}}}]
        shared.write_text(json.dumps(doc))

        r = self.pal("update", "try", "Builder#x", "--json")
        self.assertNotEqual(r.returncode, 0, "a trial is the owner's click")
        self.assertNotIn("// tried", (self.app / "mods" / "crew-review" / "main.js").read_text())
        out = self.ok("update", "try", "Builder#x", "--json", click=True)
        self.assertEqual((out["branch"], out["reloaded"]), ("crew/x", ["crew-review"]))
        self.assertIn("// tried", (self.app / "mods" / "crew-review" / "main.js").read_text())
        self.assertEqual(self.running()["branch"], "crew/x")
        trying = self.live()["trying"]
        self.assertEqual((trying["branch"], trying["spec"]), ("crew/x", "Builder#x"))
        self.assertTrue(sha2.startswith(trying["base"]["hash"]))
        self.assertIn("trying crew/x", self.ok("version"))
        self.assertEqual(trying["into"], "main")
        self.assertIn("TRIAL-BRIEF", brief.read_text())
        skill = self.data / "crew-skills" / "pal-desk" / "SKILL.md"
        self.assertIn("TRIAL-SKILL", skill.read_text())

        # A branch cut before trials existed would install its way out of them (no strip, no Back): refused.
        self.git("checkout", "-q", "--orphan", "old")
        shutil.rmtree(self.proj / "mods" / "crew-live")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "an older Project Pals")
        self.git("checkout", "-q", "parked")
        wt0 = self.t / "wt-old"
        self.git("worktree", "add", "-q", "-b", "crew/old", str(wt0), "old")
        doc["crew"]["bots"][0]["worktrees"]["#old"] = {"path": str(wt0), "branch": "crew/old", "base": "main", "repo": str(self.proj)}
        shared.write_text(json.dumps(doc))
        both = {"spaces": [{"id": "s1", "name": "Builder", "folder": str(self.proj), "tabs": [
            {"id": "t1", "name": "#x", "active": True, "terminals": []}, {"id": "t0", "name": "#old", "terminals": []}]}]}
        (self.app / "fake-spaces.json").write_text(json.dumps(both))
        r = self.pal("update", "try", "Builder#old", "--json", click=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("cut before the Live channel and Try it live existed", json.loads(r.stdout)["error"])
        self.assertEqual(self.live()["trying"]["branch"], "crew/x", "the trial that was running still is")
        self.assertEqual(self.running()["branch"], "crew/x")
        self.assertEqual((self.live()["last"]["action"], self.live()["last"]["state"]), ("try", "failed"))

        # ── A second branch tried on top of the first; Roll back then means the build from before both ──
        wtz = self.t / "wt-z"
        self.git("worktree", "add", "-q", "-b", "crew/z", str(wtz), "main")
        self.commit("mods/crew-status/main.js", "\n// zed\n", "Status: zed", at=wtz)
        doc["crew"]["bots"][0]["worktrees"]["#z"] = {"path": str(wtz), "branch": "crew/z", "base": "main", "repo": str(self.proj)}
        shared.write_text(json.dumps(doc))
        both["spaces"][0]["tabs"].append({"id": "t3", "name": "#z", "terminals": []})
        (self.app / "fake-spaces.json").write_text(json.dumps(both))
        first = self.live()["trying"]["snapshot"]
        self.ok("update", "try", "Builder#z", "--json", click=True)
        t2 = self.live()["trying"]
        self.assertEqual((t2["branch"], t2["snapshot"]), ("crew/z", first), "the snapshot from before the first trial is the one kept")
        self.assertIn("// zed", (self.app / "mods" / "crew-status" / "main.js").read_text())
        self.assertNotIn("// tried", (self.app / "mods" / "crew-review" / "main.js").read_text(), "crew/z doesn't have crew/x's change")
        # Back to stable while GitHub can't be reached: nothing is given up.
        r = self.pal("update", "stable", "--json", click=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("couldn't reach GitHub", json.loads(r.stdout)["error"])
        self.assertEqual(self.live()["trying"]["branch"], "crew/z", "the trial is still a trial")
        self.assertIn("channel: Live", self.ok("version"))
        # And a release isn't installed over a trial or the Live channel.
        r = self.pal("update", "apply", "--json", click=True)
        self.assertIn("Back to stable installs the newest release", json.loads(r.stdout)["error"])
        out = self.ok("update", "rollback", "--json", click=True)
        self.assertEqual(out["restored"], first)
        self.assertNotIn("held", out, "nothing of main's is held: it never ran")
        self.assertTrue(sha2.startswith(self.running()["hash"]), "what ran before both trials")
        self.assertNotIn("// zed", (self.app / "mods" / "crew-status" / "main.js").read_text())
        self.assertNotIn("// tried", (self.app / "mods" / "crew-review" / "main.js").read_text())
        self.assertNotIn("TRIAL-BRIEF", brief.read_text(), "the Chief's brief is back as it was too")
        self.assertNotIn("TRIAL-SKILL", skill.read_text(), "and the shipped skill, which nobody edited")
        self.assertNotIn("trying", self.live())
        self.ok("update", "try", "Builder#x", "--json", click=True)   # and on with the first branch
        # A pal edits the skill while the trial runs (Codex T94, P1): that edit is theirs. Back puts
        # back only what the trial's install wrote and nobody changed since.
        self.assertIn("TRIAL-SKILL", skill.read_text())
        skill.write_text(skill.read_text() + "\nMY-EDIT: what I learned during the trial\n")
        # … and a second branch is tried on top (Codex T130): its install keeps the edited skill, which
        # must not make the edit count as something a trial wrote.
        self.ok("update", "try", "Builder#z", "--json", click=True)
        self.assertIn("MY-EDIT", skill.read_text())

        # main moves during the trial: it waits.
        self.git("checkout", "-q", "main")
        sha3 = self.commit("mods/crew-about/main.js", "\n// three\n", "About: three")
        self.git("checkout", "-q", "parked")
        out = self.ok("update", "follow", "--json")
        self.assertFalse(out["updated"])
        self.assertIn("waits until Land or Back", out["message"])

        # ── Back: what was there returns, then Live catches up with main ──
        self.assertNotEqual(self.pal("update", "back", "--json").returncode, 0, "Back is the owner's click too")
        out = self.ok("update", "back", "--json", click=True)
        self.assertTrue(out.get("followed"), out)
        self.assertIn("MY-EDIT", skill.read_text(), "Back left the skill that was edited during the trial alone")
        self.assertNotIn("TRIAL-BRIEF", brief.read_text(), "while a file nobody touched went back")
        self.assertNotIn("// tried", (self.app / "mods" / "crew-review" / "main.js").read_text())
        self.assertTrue(sha3.startswith(self.running()["hash"]))
        self.assertNotIn("trying", self.live())

        # ── Try again, then Land: no checkout is touched, the trial ends on main ──
        self.ok("update", "try", "Builder#x", "--json", click=True)
        parked_head = self.git("rev-parse", "HEAD")
        # Another project lands a branch with the same name on its own main (Codex T94, P2): that's
        # not this trial's branch. The trial goes on, and nothing of Project Pals is installed for it.
        other = self.t / "other"
        other.mkdir()
        self.git("init", "-q", "-b", "main", at=other)
        (other / "README").write_text("another project\n")
        self.git("add", "-A", at=other)
        self.git("commit", "-q", "-m", "one", at=other)
        self.git("checkout", "-q", "-b", "parked", at=other)
        self.git("worktree", "add", "-q", "-b", "crew/x", str(self.t / "other-x"), "main", at=other)
        self.commit("README", "more\n", "two", at=self.t / "other-x")
        doc["crew"]["bots"].append({"name": "Other", "space": "s2", "folder": str(other), "worktrees": {
            "#x": {"path": str(self.t / "other-x"), "branch": "crew/x", "base": "main", "repo": str(other)}}})
        shared.write_text(json.dumps(doc))
        both["spaces"].append({"id": "s2", "name": "Other", "folder": str(other), "tabs": [{"id": "o1", "name": "#x", "active": True, "terminals": []}]})
        (self.app / "fake-spaces.json").write_text(json.dumps(both))
        was = self.live()["trying"]
        self.assertIn(f"landed crew/x on main in {other}", self.ok("land", "Other#x", click=True))
        self.assertEqual(self.live().get("trying"), was, "the Project Pals trial is still the trial")
        self.assertNotIn("pending", self.live(), "and nothing was queued to install")
        self.assertEqual(self.running()["branch"], "crew/x")
        # The strip's Land names the commit that was tried: a branch that moved since doesn't land on it.
        tried = self.live()["trying"]["hash"]
        tip = self.commit("mods/crew-review/main.js", "\n// later\n", "Review: after the trial started", at=wt)
        r = self.pal("land", "Builder#x", "--at", tried, click=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("has moved since", r.stdout + r.stderr)
        self.assertEqual(self.git("rev-parse", "main"), sha3, "nothing landed")
        self.assertEqual(self.live()["trying"]["branch"], "crew/x")
        self.ok("update", "try", "Builder#x", "--json", click=True)   # look at the new commit, then land that
        out = self.ok("land", "Builder#x", "--at", self.live()["trying"]["hash"], click=True)
        self.assertIn("landed crew/x on main", out)
        merge = self.git("rev-parse", "main")
        self.assertEqual(self.git("log", "-1", "--format=%P", "main").split(), [sha3, tip], "a merge commit of main and the branch")
        self.assertEqual(self.git("rev-parse", "HEAD"), parked_head, "the project folder's own branch didn't move")
        self.assertEqual(self.git("status", "--porcelain", "--untracked-files=no"), "", "nor its files")
        self.assertNotIn("trying", self.live())
        deadline = time.time() + 900   # (a loaded machine: each install runs every JS test) pal land started the install of main on its own
        while time.time() < deadline and not merge.startswith(self.running().get("hash") or "-"):
            time.sleep(0.5)
        self.assertTrue(merge.startswith(self.running()["hash"]), "what runs is what landed")
        self.assertIn("// tried", (self.app / "mods" / "crew-review" / "main.js").read_text())
        self.assertIn("// three", (self.app / "mods" / "crew-about" / "main.js").read_text())
        deadline = time.time() + 300
        while time.time() < deadline and self.live().get("pending"):
            time.sleep(0.3)
        self.assertNotIn("pending", self.live())
        # Landing it again: nothing to do, and no empty merge commit.
        self.assertIn("is on main already", self.ok("land", "Builder#x", click=True))
        self.assertEqual(self.git("rev-parse", "main"), merge)

        # ── A branch that conflicts doesn't land, and nothing moves ──
        wt2 = self.t / "wt-y"
        self.git("worktree", "add", "-q", "-b", "crew/y", str(wt2), sha1)
        (wt2 / "VERSION").write_text("9.9.9\n")
        self.git("commit", "-qam", "y: a version", at=wt2)
        self.git("checkout", "-q", "main")
        (self.proj / "VERSION").write_text("8.8.8\n")
        self.git("commit", "-qam", "main: another version")
        self.git("checkout", "-q", "parked")
        held = self.git("rev-parse", "main")
        doc["crew"]["bots"][0]["worktrees"]["#y"] = {"path": str(wt2), "branch": "crew/y", "base": "main", "repo": str(self.proj)}
        shared.write_text(json.dumps(doc))
        (self.app / "fake-spaces.json").write_text(json.dumps({"spaces": [
            {"id": "s1", "name": "Builder", "folder": str(self.proj), "tabs": [{"id": "t1", "name": "#x", "terminals": []}, {"id": "t2", "name": "#y", "terminals": []}]}]}))
        r = self.pal("land", "Builder#y", click=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("conflicts with main", r.stdout + r.stderr)
        self.assertEqual(self.git("rev-parse", "main"), held)

        # ── Roll back on Live holds the commit it undid; Stable stops following ──
        out = self.ok("update", "follow", "--json")   # main: another version
        self.assertTrue(out["updated"])
        out = self.ok("update", "rollback", "--json", click=True)
        self.assertTrue(held.startswith(out["held"]))
        self.assertTrue(merge.startswith(self.running()["hash"]))
        self.assertIn("is held", self.ok("update", "follow", "--json")["message"])
        self.assertIn("Stable", self.ok("settings", "channel", "stable", click=True))
        self.assertIn("Live channel is off", self.ok("update", "follow", "--json")["message"])

        # ── crewd restarts only when its code changed, once, by the updater; a crewd that doesn't
        #    come back on the new code takes the swap back ──
        self.ok("settings", "channel", "live", click=True)
        (self.app / "fake-systemd").write_text("ok")
        self.assertTrue(self.ok("update", "follow", "--json")["updated"])   # main as it is; the unit file arrives with it
        good = self.running()["hash"]
        log = self.app / "fake-systemctl.log"
        restarts = lambda: [l for l in log.read_text().splitlines() if l.split()[1:2] == ["restart"]]
        self.git("checkout", "-q", "main")
        self.commit("mods/crew-about/main.js", "\n// four\n", "About: four")
        self.git("checkout", "-q", "parked")
        log.write_text("")
        out = self.ok("update", "follow", "--json")
        self.assertFalse(out["crewd"], "a mod changed, crewd's code didn't")
        self.assertEqual(restarts(), [], "so nothing restarted it (install.sh --keep-crewd)")
        self.git("checkout", "-q", "main")
        self.commit("bin/crewd", "\n# five\n", "crewd: five")
        self.git("checkout", "-q", "parked")
        log.write_text("")
        out = self.ok("update", "follow", "--json")
        self.assertTrue(out["crewd"])
        self.assertEqual(len(restarts()), 1, log.read_text())
        self.assertTrue(self.live()["last"]["crewd"])
        good = self.running()["hash"]
        self.git("checkout", "-q", "main")
        dead = self.commit("bin/crewd", "\n# six\n", "crewd: six")
        self.git("checkout", "-q", "parked")
        (self.app / "fake-systemd").write_text("dead")
        r = self.pal("update", "follow", "--json")
        self.assertNotEqual(r.returncode, 0)
        err = json.loads(r.stdout)["error"]
        self.assertIn("crewd didn't come back", err)
        self.assertIn("put back", err)
        self.assertEqual(self.running()["hash"], good)
        self.assertNotIn("# six", (self.home / ".local" / "bin" / "crewd").read_text())
        self.assertTrue(dead.startswith(self.live()["hold"]["hash"]))
        self.assertEqual(self.live()["last"]["state"], "failed")
        newest = sorted((self.app / ".crew-backups").glob("update-*.tar.gz"), key=lambda p: p.stat().st_mtime)[-1]
        self.assertNotIn(dead[:7], newest.name)
        (self.app / "fake-systemd").unlink()

    def test_a_pal_cannot_follow(self):
        # crewd runs follow; from a pal's terminal it's refused (hc says the terminal is a pal's).
        hc = self.t / "pal-shims"
        hc.mkdir(exist_ok=True)
        (hc / "hc").write_text('#!/bin/sh\necho \'{"labels":{"herdr.space":"s1"},"address":"t9"}\'\n')
        (hc / "hc").chmod(0o755)
        env = {**self.env, "HC_TERMINAL_ID": "t9", "PATH": f"{hc}:{self.env['PATH']}"}
        r = subprocess.run([self.pal_bin, "update", "follow", "--json"], env=env, capture_output=True, text=True, timeout=60)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("nothing for a pal to run", r.stdout + r.stderr)

    def test_the_suite_after_a_swap_is_recorded(self):
        # run-tests runs an exported build's tests and records the result for the app (the strip,
        # About). Only the run the updater announced: nobody else writes a result for a build.
        exports = self.home / ".cache" / "project-pals" / "live"
        live = self.data / "crew-live.json"
        for name, body, want in (("a", "def test_ok(self): pass", "passed"), ("b", "def test_no(self): self.fail('x')", "failed")):
            sha = name * 40
            root = exports / f"{sha[:10]}-xyz"
            (root / "tests").mkdir(parents=True)
            (root / "tests" / "test_one.py").write_text(f"import unittest\nclass T(unittest.TestCase):\n    {body}\n")
            r = self.pal("update", "run-tests", str(root), sha)
            self.assertNotEqual(r.returncode, 0, "not announced: refused")
            self.assertTrue(root.exists())
            live.write_text(json.dumps({**self.live(), "tests": {"hash": sha[:12], "state": "running"}}))
            out = self.ok("update", "run-tests", str(root), sha)
            self.assertEqual(json.loads(out)["ok"], want == "passed")
            tests = self.live()["tests"]
            self.assertEqual((tests["state"], tests["hash"]), (want, sha[:12]))
            self.assertFalse(root.exists(), "the exported build is cleaned up")
            self.assertNotEqual(self.pal("update", "run-tests", str(root), sha).returncode, 0, "and not a second time")
        self.assertIn("1 test failed", self.live()["tests"]["detail"])
        r = self.pal("update", "run-tests", str(self.proj), "c" * 40)
        self.assertNotEqual(r.returncode, 0, "only a build the updater exported")


DRIVER = r'''
import json, sys
sys.path.insert(0, sys.argv[1])
import crewupdate
from crewlib import DATA
skill = DATA / "crew-skills" / "pal-desk" / "SKILL.md"
brief = DATA / "crew-chief" / "AGENTS.md"
record = DATA / "crew-install.json"
for f in (skill, brief, record):
    f.parent.mkdir(parents=True, exist_ok=True)
out = {}
quiet = lambda *_: None

# 1. Codex's reproduction: snapshot, the skill is edited, the snapshot is put back with no record of
#    what an install wrote. The edit stays.
skill.write_text("SHIPPED-1"); brief.write_text("BRIEF-1"); record.write_text('{"version": "1"}')
snap = crewupdate._snapshot("from-1-try")
skill.write_text("EDITED AFTER THE SNAPSHOT")
crewupdate.rollback(snap, log=quiet)
out["no_record"] = skill.read_text()

# 2. A trial's install writes a new shipped skill and brief; the skill is then edited, the brief not.
skill.write_text("SHIPPED-1"); brief.write_text("BRIEF-1"); record.write_text('{"version": "1"}')
snap = crewupdate._snapshot("from-1-try")
skill.write_text("SHIPPED-2 (the trial's)"); brief.write_text("BRIEF-2 (the trial's)"); record.write_text('{"version": "2"}')
wrote = crewupdate.note_wrote(snap)
skill.write_text("SHIPPED-2 (the trial's) + MY EDIT")
crewupdate.rollback(snap, log=quiet, wrote=wrote)
out["edited_in_trial"] = skill.read_text()
out["untouched_brief"] = brief.read_text()
out["install_record"] = json.loads(record.read_text())["version"]

# 3. The skill was the pal's own before the trial (an install keeps such a skill), then edited again.
skill.write_text("CUSTOM-0")
snap = crewupdate._snapshot("from-1-try")
wrote = crewupdate.note_wrote(snap)      # the install kept the custom skill: it wrote nothing there
out["kept_is_not_written"] = "data/crew-skills/pal-desk/SKILL.md" in wrote
skill.write_text("CUSTOM-1")
crewupdate.rollback(snap, log=quiet, wrote=wrote)
out["custom_before"] = skill.read_text()

# 4. Nobody edited anything: what the trial wrote goes back to what was there.
skill.write_text("SHIPPED-1")
snap = crewupdate._snapshot("from-1-try")
skill.write_text("SHIPPED-2 (the trial's)")
crewupdate.rollback(snap, log=quiet, wrote=crewupdate.note_wrote(snap))
out["unedited"] = skill.read_text()

# 5. A skill deleted during the trial stays deleted.
snap = crewupdate._snapshot("from-1-try")
wrote = crewupdate.note_wrote(snap)
skill.unlink()
crewupdate.rollback(snap, log=quiet, wrote=wrote)
out["deleted"] = skill.exists()

# 6. Codex T130: a second branch tried on top of the first. Trial A's install writes its skill; a pal
#    edits it; trial B's install keeps the edited skill (it doesn't write there). Back puts back the
#    snapshot from before A, with what the two installs wrote between them: the edit is neither's.
skill.write_text("SHIPPED-1"); brief.write_text("BRIEF-1")
first = crewupdate._snapshot("from-1-try")
skill.write_text("A's skill"); brief.write_text("A's brief")
wrote_a = crewupdate.note_wrote(first)
skill.write_text("A's skill + MY EDIT")
second = crewupdate._snapshot("from-1-try")
out["snapshots_differ"] = str(first) != str(second)
brief.write_text("B's brief")                       # B renders its brief; the skill it leaves alone
wrote_b = crewupdate.note_wrote(second)
crewupdate.rollback(first, log=quiet, wrote=crewupdate.merge_wrote(wrote_a, wrote_b))
out["stacked_edit"] = skill.read_text()
out["stacked_brief"] = brief.read_text()

# 7. The same, with nobody editing: what A wrote and B left is still A's, and goes back.
skill.write_text("SHIPPED-1"); brief.write_text("BRIEF-1")
first = crewupdate._snapshot("from-1-try")
skill.write_text("A's skill"); brief.write_text("A's brief")
wrote_a = crewupdate.note_wrote(first)
second = crewupdate._snapshot("from-1-try")
brief.write_text("B's brief")
crewupdate.rollback(first, log=quiet, wrote=crewupdate.merge_wrote(wrote_a, crewupdate.note_wrote(second)))
out["stacked_unedited"] = [skill.read_text(), brief.read_text()]
print(json.dumps(out))
'''


class Restore(unittest.TestCase):
    """Codex T94, P1: putting a snapshot back (Back, Roll back, a failed swap) restores a file under
    data/ only when it still is what the install being undone wrote. A skill or brief somebody edited
    meanwhile is theirs: it stays. The install record (crew-install.json) always goes back."""

    def test_only_what_the_install_wrote_goes_back(self):
        t = Path(pals_tmp.mkdtemp(prefix="pals-restore-"))
        try:
            home = t / "home"
            (home / ".config" / "herdr-app").mkdir(parents=True)
            shims = t / "shims"
            shims.mkdir()
            (shims / "systemctl").write_text("#!/bin/sh\nexit 1\n")
            (shims / "systemctl").chmod(0o755)
            env = {"HOME": str(home), "HERDR_APP_HOME": str(home / ".config" / "herdr-app"), "PATH": f"{shims}:/usr/bin:/bin"}
            r = subprocess.run([sys.executable, "-c", DRIVER, str(ROOT / "bin")], env=env, capture_output=True, text=True, timeout=120)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            out = json.loads(r.stdout.strip().splitlines()[-1])
            self.assertEqual(out["no_record"], "EDITED AFTER THE SNAPSHOT", "with no record of what an install wrote, a skill is never overwritten")
            self.assertEqual(out["edited_in_trial"], "SHIPPED-2 (the trial's) + MY EDIT")
            self.assertEqual(out["untouched_brief"], "BRIEF-1", "a rendered file nobody touched goes back")
            self.assertEqual(out["install_record"], "1", "the install record always goes back")
            self.assertEqual(out["custom_before"], "CUSTOM-1")
            self.assertEqual(out["unedited"], "SHIPPED-1")
            self.assertFalse(out["deleted"])
            self.assertFalse(out["kept_is_not_written"], "a file an install left alone isn't recorded as written by it")
            self.assertTrue(out["snapshots_differ"], "two snapshots in the same second don't share a file")
            self.assertEqual(out["stacked_edit"], "A's skill + MY EDIT", "an edit made between two stacked trials survives Back")
            self.assertEqual(out["stacked_brief"], "BRIEF-1", "while what the second trial rendered goes back")
            self.assertEqual(out["stacked_unedited"], ["SHIPPED-1", "BRIEF-1"])
        finally:
            shutil.rmtree(t, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
