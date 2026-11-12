"""T177: an approved `pal land` merged into crew/pet-facelift, the branch the shared project checkout
happened to have out, instead of main.

The cause was upstream of land: a worktree topic recorded as its base whatever branch the project
folder had checked out when the topic was made (10 of DeNon's topics said crew/pet-facelift), and
land merged onto the recorded base, there, in that checkout. Now:
  - a new worktree topic is cut from the project's main branch (origin's HEAD, else main, else
    master) unless a base is named (--base), and records whether it was named;
  - pal land lands on the project's main branch, or on a base that was named when the topic was
    made; never on a branch that's only there because the folder had it out;
  - it refuses when the topic was cut from another topic's unlanded branch (its commits would land
    too), and says how to land it on purpose (--onto);
  - it touches no checkout that isn't on the branch it lands on.
Everything here runs in throwaway repositories with fake herdr-app / hc / systemctl.
Run: python3 -m unittest tests.test_land_base
"""
import json
import os
import subprocess
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402

BIN = Path(__file__).resolve().parent.parent / "bin"


class LandBase(unittest.TestCase):
    def setUp(self):
        self.t = Path(pals_tmp.mkdtemp(prefix="pals-landbase-"))
        self.home, self.app = self.t / "home", self.t / "app"
        self.data = self.app / "data"
        self.data.mkdir(parents=True)
        self.home.mkdir()
        shims = self.t / "shims"
        shims.mkdir()
        for name, body in (("hc", "#!/bin/sh\ncase \"$1\" in ls) echo '{\"terminals\": []}' ;; *) exit 1 ;; esac\n"),
                           ("systemctl", "#!/bin/sh\nexit 1\n"),
                           ("systemd-run", "#!/bin/sh\nexit 1\n"),
                           ("herdr-app", '#!/bin/sh\n[ "$1" = ls ] && cat "$HERDR_APP_HOME/fake-spaces.json" && exit 0\nexit 1\n')):
            (shims / name).write_text(body)
            (shims / name).chmod(0o755)
        self.env = {"HOME": str(self.home), "HERDR_APP_HOME": str(self.app), "PATH": f"{shims}:/usr/bin:/bin", "LANG": "C.UTF-8",
                    "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null", "GIT_AUTHOR_NAME": "Sam",
                    "GIT_AUTHOR_EMAIL": "s@example.invalid", "GIT_COMMITTER_NAME": "Sam", "GIT_COMMITTER_EMAIL": "s@example.invalid"}
        (self.data / "crew-settings.json").write_text(json.dumps({"owner": "Sam", "head": "Boss"}))
        # The shared project checkout: main, a topic branch (unlanded work), and the folder parked on it.
        self.repo = self.t / "proj"
        self.repo.mkdir()
        self.git("init", "-q", "-b", "main")
        self.write("a", "one\n")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "A")
        self.git("checkout", "-q", "-b", "crew/parked")
        self.write("p", "unlanded work of another topic\n")
        self.git("add", "-A")
        self.git("commit", "-q", "-m", "P: someone else's topic")
        self.main0 = self.git("rev-parse", "main")
        self.parked0 = self.git("rev-parse", "crew/parked")
        self.spaces = {"spaces": [{"id": "s1", "name": "Builder", "folder": str(self.repo), "tabs": []}], "recent": []}
        self.save_spaces()

    def tearDown(self):
        pass   # pals_tmp removes the folder at exit

    def git(self, *a, at=None):
        r = subprocess.run(["git", "-C", str(at or self.repo), *a], env=self.env, capture_output=True, text=True)
        assert r.returncode == 0, f"git {a}: {r.stderr}"
        return r.stdout.strip()

    def write(self, name, text, at=None):
        (Path(at or self.repo) / name).write_text(text)

    def save_spaces(self):
        (self.app / "fake-spaces.json").write_text(json.dumps(self.spaces))

    def pal(self, *args, click=False):
        args = list(args)
        if click:
            d = self.data / "crew-clicks"
            d.mkdir(parents=True, exist_ok=True)
            nonce = os.urandom(16).hex()
            (d / f"{nonce}.json").write_text(json.dumps({"args": args, "at": int(time.time() * 1000)}))
            args += ["--click", nonce]
        return subprocess.run([sys.executable, str(BIN / "crew"), *args], capture_output=True, text=True, env=self.env, timeout=60)

    def topic(self, name, base=None):
        """A worktree topic as `pal topic … --worktree` makes it (bin/crew make_worktree), recorded in shared.json."""
        code = (f"import sys, json; sys.path.insert(0, {str(BIN)!r})\n"
                "import importlib.machinery, importlib.util\n"
                f"loader = importlib.machinery.SourceFileLoader('crew', {str(BIN / 'crew')!r})\n"
                "spec = importlib.util.spec_from_loader('crew', loader); crew = importlib.util.module_from_spec(spec); loader.exec_module(crew)\n"
                f"print(json.dumps(crew.make_worktree({{'name': 'Builder', 'folder': {str(self.repo)!r}}}, {name!r}, {base!r})))")
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=self.env, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        wt = json.loads(r.stdout.strip().splitlines()[-1])
        shared = self.app / "shared.json"
        doc = json.loads(shared.read_text()) if shared.exists() else {"crew": {"bots": [{"name": "Builder", "space": "s1", "worktrees": {}}]}}
        doc["crew"]["bots"][0]["worktrees"][f"#{name}"] = wt
        shared.write_text(json.dumps(doc))
        self.spaces["spaces"][0]["tabs"].append({"id": f"t-{name}", "name": f"#{name}", "terminals": []})
        self.save_spaces()
        return wt

    def commit_in(self, wt, name):
        self.write(name, f"{name}\n", at=wt["path"])
        self.git("add", "-A", at=wt["path"])
        self.git("commit", "-q", "-m", name, at=wt["path"])
        return self.git("rev-parse", "HEAD", at=wt["path"])

    def test_a_new_topic_is_cut_from_main_while_the_folder_is_parked(self):
        wt = self.topic("x")
        self.assertEqual(wt["base"], "main", "not the branch the folder happens to have out")
        self.assertEqual(self.git("merge-base", wt["branch"], "main"), self.main0)
        self.assertFalse(wt.get("base_named"))
        self.assertNotIn("p", os.listdir(wt["path"]), "the parked topic's work isn't in it")
        named = self.topic("y", "crew/parked")
        self.assertEqual((named["base"], named.get("base_named")), ("crew/parked", True))

    def test_land_goes_to_main_and_touches_no_parked_checkout(self):
        wt = self.topic("x")
        tip = self.commit_in(wt, "x")
        r = self.pal("land", "Builder#x", click=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("landed crew/x on main", r.stdout)
        self.assertEqual(self.git("log", "-1", "--format=%P", "main").split(), [self.main0, tip])
        self.assertEqual(self.git("rev-parse", "crew/parked"), self.parked0, "the parked branch didn't move")
        self.assertEqual(self.git("branch", "--show-current"), "crew/parked")
        self.assertEqual(self.git("status", "--porcelain"), "", "nor its files")

    def test_an_old_record_that_names_the_parked_branch(self):
        """The real case: a topic recorded (before this fix) with the folder's branch as its base."""
        wt = self.topic("x")
        tip = self.commit_in(wt, "x")
        doc = json.loads((self.app / "shared.json").read_text())
        doc["crew"]["bots"][0]["worktrees"]["#x"]["base"] = "crew/parked"   # what make_worktree used to write
        doc["crew"]["bots"][0]["worktrees"]["#x"].pop("base_named", None)
        (self.app / "shared.json").write_text(json.dumps(doc))
        r = self.pal("land", "Builder#x", click=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("landed crew/x on main", r.stdout)
        self.assertEqual(self.git("rev-parse", "crew/parked"), self.parked0, "never onto the folder's branch")
        self.assertEqual(self.git("log", "-1", "--format=%P", "main").split(), [self.main0, tip])
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_cut_from_another_topics_unlanded_branch_is_refused(self):
        wt = self.topic("y", "crew/parked")   # named: it really was meant to build on crew/parked
        self.commit_in(wt, "y")
        doc = json.loads((self.app / "shared.json").read_text())
        doc["crew"]["bots"][0]["worktrees"]["#y"].pop("base_named")   # but recorded the old way: not named
        (self.app / "shared.json").write_text(json.dumps(doc))
        r = self.pal("land", "Builder#y", click=True)
        self.assertNotEqual(r.returncode, 0)
        out = r.stdout + r.stderr
        self.assertIn("crew/parked", out)
        self.assertIn("--onto", out, "it says how to land it on purpose")
        self.assertEqual(self.git("rev-parse", "main"), self.main0, "nothing landed")
        self.assertEqual(self.git("rev-parse", "crew/parked"), self.parked0)
        # On purpose: --onto main brings crew/parked's commit along, and says so.
        r = self.pal("land", "Builder#y", "--onto", "main", click=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("p", self.git("ls-tree", "--name-only", "main").split())
        self.assertEqual(self.git("rev-parse", "crew/parked"), self.parked0)

    def test_a_named_base_is_landed_on(self):
        wt = self.topic("y", "crew/parked")
        tip = self.commit_in(wt, "y")
        r = self.pal("land", "Builder#y", click=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("landed crew/y on crew/parked", r.stdout)
        self.assertEqual(self.git("rev-parse", "main"), self.main0, "main didn't move")
        # crew/parked is checked out in the project folder: the merge happened there, cleanly.
        self.assertEqual(self.git("log", "-1", "--format=%P", "crew/parked").split(), [self.parked0, tip])
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_onto_is_the_owners_and_must_exist(self):
        wt = self.topic("x")
        self.commit_in(wt, "x")
        r = self.pal("land", "Builder#x", "--onto", "nope", click=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no branch nope", r.stdout + r.stderr)
        self.assertNotEqual(self.pal("land", "Builder#x", "--onto", "main").returncode, 0, "no click, no land")
        self.assertEqual(self.git("rev-parse", "main"), self.main0)

    def test_review_shows_what_would_land(self):
        wt = self.topic("x")
        self.commit_in(wt, "x")
        doc = json.loads((self.app / "shared.json").read_text())
        doc["crew"]["bots"][0]["worktrees"]["#x"]["base"] = "crew/parked"
        (self.app / "shared.json").write_text(json.dumps(doc))
        r = self.pal("diff", "Builder#x", "--json")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        d = json.loads(r.stdout)
        self.assertEqual(d["base"], "main", "Review's 'Land on …' names where it will land")
        self.assertEqual([f["path"] for f in d["files"]], ["x"])

    def test_an_origin_head_names_the_main_branch(self):
        self.git("branch", "-m", "main", "trunk")
        bare = self.t / "origin.git"
        self.git("clone", "-q", "--bare", str(self.repo), str(bare), at=self.t)
        self.git("remote", "add", "origin", str(bare))
        self.git("fetch", "-q", "origin")
        self.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk")
        wt = self.topic("z")
        self.assertEqual(wt["base"], "trunk")


if __name__ == "__main__":
    unittest.main()
