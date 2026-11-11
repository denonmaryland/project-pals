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
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

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

    def test_recommend_does_links_and_images(self):
        png = self.root / "shot.png"
        png.write_bytes(bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                                      "1f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"))
        self.ok("ask", "Blur them?", "--option", "Blur them", "--does", "Re-renders the clip", "--option", "Leave as is",
                "--recommend", "blur them", "--why", "unreleased work shouldn't show", "--link", "https://x.test/a", "--image", str(png))
        x = home(self.data)["items"][0]
        self.assertEqual(x["does"], ["Re-renders the clip", ""])
        self.assertEqual((x["recommend"], x["why"]), ("Blur them", "unreleased work shouldn't show"), "the recommendation takes the option's own spelling")
        self.assertEqual(x["links"], ["https://x.test/a"])
        self.assertEqual(len(x["images"]), 1)
        self.assertTrue(x["images"][0].startswith("crew-attachments/"), "images are copied into data/crew-attachments")
        self.assertTrue((self.data / x["images"][0]).exists())
        bad = lambda *a: pal(self.env, "home", *a, term="tW")
        self.assertNotEqual(bad("ask", "x", "--option", "A", "--recommend", "B").returncode, 0, "the recommendation is one of the options")
        self.assertNotEqual(bad("ask", "x", "--does", "y").returncode, 0, "--does follows an --option")
        self.assertNotEqual(bad("ask", "x", "--option", "A", "--why", "y").returncode, 0, "--why goes with --recommend")
        self.assertNotEqual(bad("ask", "x", "--image", str(self.root / "nope.txt")).returncode, 0)
        self.assertNotEqual(bad("note", "x", "--link", "https://x").returncode, 0, "only an ask takes links")
        # Approvals, Desk cards and asks can be recommended afterwards.
        self.ok("recommend", "a-123456", "approve", "--why", "only adds a section")
        self.ok("recommend", "c-abcdef", "done")
        self.ok("recommend", x["id"], "Leave as is")
        h = home(self.data)
        self.assertEqual(h["recs"]["a-123456"]["option"], "approve")
        self.assertEqual(h["recs"]["a-123456"]["by"], "Worker#general")
        self.assertEqual(h["items"][0]["recommend"], "Leave as is")
        self.assertNotIn("why", h["items"][0], "a new pick without a why drops the old why")
        self.assertNotEqual(bad("recommend", "a-123456", "maybe").returncode, 0)
        self.assertNotEqual(bad("recommend", "x-123456", "approve").returncode, 0)
        self.assertNotEqual(bad("recommend", x["id"], "Nope").returncode, 0)

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

    def test_only_the_asker_the_head_pal_or_the_owner_takes_an_item_off(self):
        """T112: on 2026-11-10 a plain shell closed a pal's ask (h-ddbb91, 'closed by a shell on this
        computer'). An item goes only by whoever put it there, the head pal, or the owner's click."""
        self.ok("ask", "Land it?", "--option", "Land", "--option", "Hold")   # Worker#general asks
        iid = home(self.data)["items"][0]["id"]
        for sub in (["done", iid, "we did it"], ["drop", iid], ["park", iid]):
            for term, who in ((None, "a shell on this computer"), ("tH", "Helper#build"), ("tZ", "terminal tZ")):
                r = pal(self.env, "home", *sub, term=term)
                self.assertNotEqual(r.returncode, 0, f"{who} must not {sub[0]} Worker's ask")
                self.assertIn("put on Home by Worker#general", r.stderr)
                self.assertIn(who, r.stderr)
        x = home(self.data)["items"][0]
        self.assertEqual(x["status"], "open")
        self.assertNotIn("closed_by", x)
        # Parked by the owner's click: a shell or another pal can't bring it back either.
        self.assertEqual(owner(self.env, self.data, "home", "park", iid).returncode, 0)
        self.assertNotEqual(pal(self.env, "home", "unpark", iid).returncode, 0)
        self.assertNotEqual(pal(self.env, "home", "unpark", iid, term="tH").returncode, 0)
        self.assertEqual(home(self.data)["items"][0]["status"], "parked")
        self.assertEqual(owner(self.env, self.data, "home", "unpark", iid).returncode, 0)
        # The asker takes its own ask back: withdrawn, never an answer.
        out = self.ok("done", iid, "settled in chat")
        x = home(self.data)["items"][0]
        self.assertEqual((x["status"], x["closed_by"], x.get("withdrawn"), x.get("answer")), ("done", "Worker#general", True, None))
        self.assertIn("withdrawn by Worker#general", out)

    def test_the_head_pal_another_topic_of_the_asker_and_the_owner_can(self):
        (self.data / "crew-settings.json").write_text(json.dumps({"owner": OWNER, "head": "Helper"}))   # Helper is the head pal
        for closer, how in (("tH", "head"), ("tD", "head")):
            self.ok("ask", f"Q for {closer}?", "--option", "A", "--option", "B")
            iid = home(self.data)["items"][-1]["id"]
            self.assertEqual(pal(self.env, "home", "drop", iid, term=closer).returncode, 0, how)
            x = home(self.data)["items"][-1]
            self.assertEqual((x["status"], x.get("withdrawn")), ("dropped", True))
        # Another topic of the same pal (Helper#docs closes what Helper#build put there), when it isn't the head.
        (self.data / "crew-settings.json").write_text(json.dumps({"owner": OWNER, "head": "Boss"}))
        self.ok("deploy", "the site", term="tH")
        iid = home(self.data)["items"][-1]["id"]
        self.assertNotEqual(pal(self.env, "home", "done", iid, term="tW").returncode, 0)
        self.assertEqual(pal(self.env, "home", "done", iid, term="tD").returncode, 0)
        self.assertNotIn("withdrawn", home(self.data)["items"][-1], "only an ask is withdrawn")
        # The owner's click closes anyone's ask, and that isn't a withdrawal.
        self.ok("ask", "And this?", "--option", "A", "--option", "B")
        iid = home(self.data)["items"][-1]["id"]
        r = owner(self.env, self.data, "home", "drop", iid)
        self.assertEqual(r.returncode, 0, r.stderr)
        x = home(self.data)["items"][-1]
        self.assertEqual((x["status"], x["closed_by"]), ("dropped", OWNER))
        self.assertNotIn("withdrawn", x)
        # A shell still takes off what a shell put there (a script's own note or reminder).
        r = pal(self.env, "home", "park", "Look at this later")
        self.assertEqual(r.returncode, 0, r.stderr)
        iid = home(self.data)["items"][-1]["id"]
        self.assertEqual(pal(self.env, "home", "drop", iid).returncode, 0)
        self.assertNotEqual(pal(self.env, "home", "answer", iid, "A").returncode, 0)

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
        self.root = Path(pals_tmp.mkdtemp(prefix="pals-home-install-"))
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
        self.assertEqual(keys.get("ctrl-shift-g"), "crew-roster.factory", "the factory switcher (T66)")
        self.install()
        log = [json.loads(x) for x in (self.app / "data" / "crew-installs.jsonl").read_text().splitlines()]
        self.assertEqual(len(log), 2, "one line per install")
        self.assertEqual(log[-1]["build"]["hash"], head)

    def export(self):
        """The tree as the head pal installs it: a git archive of HEAD, no .git."""
        out = self.root / "export"
        out.mkdir()
        arc = subprocess.run(["git", "-C", str(REPO), "archive", "HEAD"], capture_output=True, check=True).stdout
        subprocess.run(["tar", "-x", "-C", str(out)], input=arc, check=True)
        # The working tree's install.sh, so this test checks the code under test, not HEAD's.
        shutil.copy(REPO / "install.sh", out / "install.sh")
        return out

    def install_from(self, src, **env):
        r = subprocess.run(["bash", str(src / "install.sh"), "--no-helpers"], capture_output=True, text=True, env={**self.env, **env}, timeout=300)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r, json.loads((self.app / "data" / "crew-install.json").read_text())

    def test_an_export_takes_its_build_from_crew_build_or_a_build_file(self):
        src = self.export()
        _, rec = self.install_from(src)
        self.assertNotIn("build", rec, "an export with nothing to say which build has none")
        _, rec = self.install_from(src, CREW_BUILD="16bafd5", CREW_BUILD_BRANCH="crew/next", CREW_BUILD_SUBJECT="Home pebble")
        self.assertEqual((rec["build"]["hash"], rec["build"]["branch"], rec["build"]["subject"], rec["build"]["export"]),
                         ("16bafd5", "crew/next", "Home pebble", True))
        (src / "BUILD").write_text(json.dumps({"hash": "73efbd5", "subject": "Merge Home", "tag": "v0.2.3", "ahead": 150}))
        _, rec = self.install_from(src)
        self.assertEqual((rec["build"]["hash"], rec["build"]["tag"], rec["build"]["ahead"]), ("73efbd5", "v0.2.3", 150))
        (src / "BUILD").write_text("abc1234\n")
        _, rec = self.install_from(src)
        self.assertEqual(rec["build"]["hash"], "abc1234")
        r, rec = self.install_from(src, CREW_BUILD="not a hash; rm -rf /")
        self.assertNotIn("build", rec)
        self.assertIn("ignored the build id", r.stderr)
        (src / "BUILD").write_text("[1, 2]")
        _, rec = self.install_from(src)
        self.assertNotIn("build", rec)
        log = [json.loads(x) for x in (self.app / "data" / "crew-installs.jsonl").read_text().splitlines()]
        self.assertEqual([(x["build"] or {}).get("hash") for x in log], [None, "16bafd5", "73efbd5", "abc1234", None, None])

    def test_a_taken_key_is_left_alone(self):
        (self.app / "keys.json").write_text(json.dumps({"global": {"ctrl-shift-h": "pane.go:left"}}))
        out = self.install()
        self.assertEqual(json.loads((self.app / "keys.json").read_text())["global"]["ctrl-shift-h"], "pane.go:left")
        self.assertIn("ctrl-shift-h is taken", out)
        self.assertEqual(json.loads((self.app / "keys.json").read_text())["global"].get("ctrl-shift-g"), "crew-roster.factory",
                         "a taken key doesn't stop the free ones")


if __name__ == "__main__":
    unittest.main()
