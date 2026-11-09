"""Home, the head pal's page (RECIPE "Home"): `pal home` and data/crew-home/home.json, the owner's
answers (a click, told to the asker as a card from the owner), and what install.sh records for it
(the build in crew-install.json, data/crew-installs.jsonl, Ctrl+Shift+H only when it's free).

Runs in subprocesses with a throwaway HOME, data folder and fake hc / herdr-app / systemctl (the
Desk tests' sandbox): python3 -m unittest discover -s tests
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, owner, click, py, OWNER  # noqa: E402

REPO = Path(__file__).resolve().parent.parent


def home(data):
    return json.loads((data / "crew-home" / "home.json").read_text())


class HomeCli(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def ok(self, *args, term="tW"):
        r = pal(self.env, "home", *args, term=term)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def test_add_every_kind_and_list(self):
        self.ok("ask", "Blur the journal entries?", "--option", "Blur them", "--option", "Leave as is", "--body", "three at 0:41")
        self.ok("login", "! npx vercel login", "--topic", "Helper#build")
        self.ok("link", "~/.config/herdr-app/data/crew-boards/x/index.html", "--title", "The board")
        self.ok("note", "Trees checked on the live window")
        self.ok("deploy", "the site to Vercel", "--topic", "Helper#build")
        self.ok("queue", "Desk cards", "--release", "0.3.1", "--note", "held for your OK")
        self.ok("park", "Mac support")
        h = home(self.data)
        kinds = {x["kind"]: x for x in h["items"]}
        self.assertEqual(set(kinds), {"ask", "login", "link", "note", "deploy", "later"})
        self.assertEqual(kinds["ask"]["options"], ["Blur them", "Leave as is"])
        self.assertEqual(kinds["ask"]["status"], "open")
        self.assertEqual(kinds["login"]["command"], "! npx vercel login")
        self.assertEqual(kinds["login"]["topic"], "Helper#build", "the topic is named as Project Pals names it")
        self.assertEqual(kinds["link"]["status"], "done", "a link is news, not something waiting")
        self.assertEqual(kinds["later"]["status"], "parked")
        # Who added it is stamped from the terminal, never an argument.
        self.assertTrue(all(x["by"] == "Worker#general" for x in h["items"]))
        self.assertEqual(h["release"]["next"], "0.3.1")
        self.assertEqual(h["release"]["note"], "held for your OK")
        self.assertEqual([q["text"] for q in h["release"]["queued"]], ["Desk cards"])
        out = self.ok()
        self.assertIn("Blur the journal entries?", out)
        self.assertIn("next release: 0.3.1", out)
        self.assertNotIn("The board", out, "plain ls shows what's open or parked")
        j = json.loads(self.ok("--json"))
        self.assertIn("installs", j)

    def test_refusals(self):
        bad = lambda *a: pal(self.env, "home", *a, term="tW")
        self.assertNotEqual(bad("ask", "x", *sum((["--option", str(i)] for i in range(5)), [])).returncode, 0, "at most 4 options")
        self.assertNotEqual(bad("ask", "x", "--option", "A", "--option", "a").returncode, 0, "options differ")
        self.assertNotEqual(bad("note", "x", "--option", "A").returncode, 0, "only an ask has options")
        self.assertNotEqual(bad("login", "! x").returncode, 0, "a login says where to type it")
        self.assertNotEqual(bad("ask", "x", "--by", "DeNon").returncode, 0, "no --by: who is stamped")
        self.assertNotEqual(bad("ask", "   ").returncode, 0)
        r = bad("done", "h-000000")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no Home item", r.stderr)

    def test_done_park_unpark_drop_unqueue(self):
        self.ok("ask", "Pick a palette", "--option", "Ink", "--option", "Moss")
        iid = home(self.data)["items"][0]["id"]
        self.ok("park", iid)
        self.assertEqual(home(self.data)["items"][0]["status"], "parked")
        self.ok("unpark", iid[:5])   # a unique prefix works
        self.assertEqual(home(self.data)["items"][0]["status"], "open")
        self.ok("done", iid, "picked in chat")
        x = home(self.data)["items"][0]
        self.assertEqual((x["status"], x["result"]), ("done", "picked in chat"))
        self.assertNotEqual(pal(self.env, "home", "done", iid, term="tW").returncode, 0, "closed once")
        self.ok("park", "Hermes mods")
        later = [x for x in home(self.data)["items"] if x["kind"] == "later"][0]
        self.ok("drop", later["id"])
        self.assertEqual([x for x in home(self.data)["items"] if x["id"] == later["id"]][0]["status"], "dropped")
        self.ok("queue", "one thing")
        qid = home(self.data)["release"]["queued"][0]["id"]
        self.ok("unqueue", qid)
        self.assertEqual(home(self.data)["release"]["queued"], [])

    def test_only_the_owner_answers_and_the_asker_hears(self):
        self.ok("ask", "Blur them?", "--option", "Blur them", "--option", "Leave as is")
        iid = home(self.data)["items"][0]["id"]
        # A pal can't answer; nor can a shell; nor a click made for other arguments.
        self.assertNotEqual(pal(self.env, "home", "answer", iid, "Blur them", term="tH").returncode, 0)
        self.assertNotEqual(pal(self.env, "home", "answer", iid, "Blur them").returncode, 0)
        wrong = click(self.data, ["home", "answer", iid, "Leave as is"])
        self.assertNotEqual(pal(self.env, "home", "answer", iid, "Blur them", "--click", wrong).returncode, 0)
        self.assertEqual(home(self.data)["items"][0]["status"], "open")
        r = owner(self.env, self.data, "home", "answer", iid, "Blur them")
        self.assertEqual(r.returncode, 0, r.stderr)
        x = home(self.data)["items"][0]
        self.assertEqual((x["status"], x["answer"], x["closed_by"]), ("answered", "Blur them", OWNER))
        self.assertIn("told Worker#general", r.stdout)
        cards = py(self.env, "import crewdesk; print(json.dumps([crewdesk.summary(c, p) for p, c in crewdesk.cards(where=('open', 'done'))]))")
        sent = [c for c in cards if c["to"] == "Worker#general" and "Blur them" in c["title"]]
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["from_kind"], "owner", "the answer is the owner's, from their click")
        self.assertEqual(owner(self.env, self.data, "home", "answer", iid, "Leave as is").returncode, 1, "answered once")

    def test_seen_is_the_owners(self):
        self.assertNotEqual(pal(self.env, "home", "seen", term="tW").returncode, 0)
        r = owner(self.env, self.data, "home", "seen")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertGreater(home(self.data)["seen"], 0)

    def test_closed_items_go_after_14_days(self):
        self.ok("note", "old news")
        p = self.data / "crew-home" / "home.json"
        h = home(self.data)
        h["items"][0]["at"] = 1000
        p.write_text(json.dumps(h))
        self.ok("note", "new news")
        self.assertEqual([x["title"] for x in home(self.data)["items"]], ["new news"])

    def test_broken_file_reads_as_empty(self):
        (self.data / "crew-home").mkdir(parents=True, exist_ok=True)
        (self.data / "crew-home" / "home.json").write_text("{nope")
        self.assertIn("nothing on Home", self.ok())
        self.ok("note", "fresh")
        self.assertEqual(len(home(self.data)["items"]), 1)


@unittest.skipUnless((REPO / ".git").exists(), "needs a git checkout")
class InstallRecordsTheBuild(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="pals-home-install-"))
        self.home = self.root / "home"
        app = self.home / ".config" / "herdr-app"
        app.mkdir(parents=True)
        shims = self.root / "shims"
        shims.mkdir()
        (shims / "systemctl").write_text("#!/bin/sh\nexit 1\n")
        (shims / "herdr-app").write_text("#!/bin/sh\ncase \"$1\" in check) exit 0 ;; ls) echo '{\"spaces\":[],\"recent\":[]}'; exit 0 ;; esac\nexit 1\n")
        for f in shims.iterdir():
            f.chmod(0o755)
        self.app = app
        self.env = {"HOME": str(self.home), "PATH": f"{shims}:{self.home}/.local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"}

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def install(self):
        r = subprocess.run(["bash", str(REPO / "install.sh"), "--no-helpers"], capture_output=True, text=True, env=self.env, timeout=300)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r.stdout

    def test_build_log_and_key(self):
        (self.app / "keys.json").write_text(json.dumps({"global": {"ctrl-shift-x": "pane.close"}}))
        self.install()
        rec = json.loads((self.app / "data" / "crew-install.json").read_text())
        head = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
        self.assertEqual(rec["build"]["hash"], head)
        self.assertTrue(rec["build"]["subject"])
        self.assertIn("dirty", rec["build"])
        keys = json.loads((self.app / "keys.json").read_text())["global"]
        self.assertEqual(keys.get("ctrl-shift-h"), "crew-roster.home")
        self.install()
        log = [json.loads(x) for x in (self.app / "data" / "crew-installs.jsonl").read_text().splitlines()]
        self.assertEqual(len(log), 2, "one line per install")
        self.assertEqual(log[-1]["build"]["hash"], head)

    def test_a_taken_key_is_left_alone(self):
        (self.app / "keys.json").write_text(json.dumps({"global": {"ctrl-shift-h": "pane.go:left"}}))
        out = self.install()
        self.assertEqual(json.loads((self.app / "keys.json").read_text())["global"]["ctrl-shift-h"], "pane.go:left")
        self.assertIn("ctrl-shift-h is taken", out)


if __name__ == "__main__":
    unittest.main()
