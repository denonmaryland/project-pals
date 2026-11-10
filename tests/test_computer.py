"""T81: a pal's Computer (crew-boards/pal-computer/design.md, B · Desktop). The data side: a task's
optional due date (pal task add --due, pal task due), the views `pal computer` prints (today, todo,
calendar from the feed's work blocks, journal, pages), and that the Chief may read them. Throwaway
HOME, data and fake hc / herdr-app, like test_head_inbox.
Run: python3 -m unittest tests.test_computer"""
import datetime
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))
from test_head_inbox import sandbox  # noqa: E402
from test_desk import pal, py  # noqa: E402

MON = datetime.date(2026, 11, 9)   # a Monday


class ParseDue(unittest.TestCase):
    def test_forms(self):
        from crewtasks import parse_due
        cases = {"fri": "2026-11-13", "Friday": "2026-11-13", "mon": "2026-11-16", "today": "2026-11-09",
                 "tomorrow": "2026-11-10", "+3d": "2026-11-12", "+2w": "2026-11-23", "2026-11-14": "2026-11-14",
                 "2026-11-14 17:00": "2026-11-14T17:00", "2026-11-14T09:30": "2026-11-14T09:30", "fri 7:05": "2026-11-13T07:05"}
        for text, want in cases.items():
            self.assertEqual(parse_due(text, MON), want, text)
        for clear in ("none", "", "clear"):
            self.assertIsNone(parse_due(clear, MON))

    def test_refuses(self):
        from crewlib import CrewError
        from crewtasks import parse_due
        for bad in ("someday", "2026-13-01", "fri 25:00", "+1y", "frid"):
            with self.assertRaises(CrewError, msg=bad):
                parse_due(bad, MON)

    def test_labels(self):
        from crewtasks import due_label
        self.assertEqual(due_label("2026-11-09", MON), "due today")
        self.assertEqual(due_label("2026-11-09T17:00", MON), "due today 17:00")
        self.assertEqual(due_label("2026-11-10", MON), "due tomorrow")
        self.assertEqual(due_label("2026-11-11", MON), "due Wed")
        self.assertEqual(due_label("2026-11-20", MON), "due Nov 20")
        self.assertEqual(due_label("2026-11-07", MON), "overdue 2d")
        self.assertEqual(due_label(None, MON), "")


class DueOnTheBoard(unittest.TestCase):
    def setUp(self):
        self.env, self.data = sandbox()

    def board(self):
        return {t["id"]: t for t in json.loads((self.data / "crew-tasks.json").read_text())["tasks"]}

    def test_add_with_due_and_clear(self):
        r = pal(self.env, "task", "add", "Saved addresses", "--for", "Worker", "--due", "2026-11-14")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("due", r.stdout)
        self.assertEqual(self.board()["T1"]["due"], "2026-11-14")
        r = pal(self.env, "task", "due", "T1", "none")             # the owner's shell: any task
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("due", self.board()["T1"])
        self.assertIn("due date cleared", self.board()["T1"]["notes"][-1]["text"])

    def test_no_due_means_no_field(self):
        pal(self.env, "task", "add", "Plain task")
        self.assertNotIn("due", self.board()["T1"])     # old boards and new tasks without --due look as before

    def test_a_pal_sets_only_its_own(self):
        pal(self.env, "task", "add", "Worker's", "--for", "Worker")
        pal(self.env, "task", "add", "Orca's", "--for", "Orca")
        r = pal(self.env, "task", "due", "T1", "fri", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("due", self.board()["T1"])
        r = pal(self.env, "task", "due", "T2", "fri", term="tW")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("isn't yours", r.stderr + r.stdout)
        self.assertNotIn("due", self.board()["T2"])

    def test_bad_date_is_refused(self):
        pal(self.env, "task", "add", "x")
        r = pal(self.env, "task", "due", "T1", "someday")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("can't read the due date", r.stderr + r.stdout)


class Views(unittest.TestCase):
    def test_todo_sorts_by_state_then_due(self):
        import crewcomputer
        now = int(datetime.datetime.combine(MON, datetime.time(15)).timestamp() * 1000)
        tasks = [
            {"id": "T1", "title": "a", "status": "open", "assignee": "Juniper", "due": "2026-11-20", "created": 1},
            {"id": "T2", "title": "b", "status": "open", "assignee": "Juniper#checkout", "due": "2026-11-11", "created": 2},
            {"id": "T3", "title": "c", "status": "claimed", "claimed_by": "Juniper#checkout", "assignee": "Atlas", "created": 3},
            {"id": "T4", "title": "d", "status": "blocked", "assignee": "Juniper", "created": 4},
            {"id": "T5", "title": "e", "status": "done", "assignee": "Juniper", "updated": now - 3600000, "created": 5},
            {"id": "T6", "title": "f", "status": "done", "assignee": "Juniper", "updated": now - 3 * 86400000, "created": 6},
            {"id": "T7", "title": "g", "status": "open", "assignee": "Atlas", "created": 7},
            {"id": "T8", "title": "h", "status": "claimed", "claimed_by": "Atlas", "assignee": "Juniper", "created": 8},
        ]
        cards = [{"id": "c-1", "kind": "tell", "status": "seen", "title": "check refunds"},
                 {"id": "c-2", "kind": "task", "status": "working", "title": "T3 c", "task": "T3"}]
        td = crewcomputer.todo("Juniper", tasks, cards, now, MON)
        self.assertEqual([r["id"] for r in td["doing"]], ["T3"])           # claimed by Juniper, though assigned to Atlas
        self.assertEqual([r["id"] for r in td["next"]], ["T2", "T1"])      # soonest due first
        self.assertEqual(td["next"][0]["topic"], "checkout")
        self.assertEqual(td["next"][0]["due_label"], "due Wed")
        self.assertEqual([r["id"] for r in td["blocked"]], ["T4"])
        self.assertEqual([r["id"] for r in td["done_today"]], ["T5"])
        self.assertEqual([c["id"] for c in td["cards"]], ["c-1"])          # a task's card is the task itself

    def test_today_topics_and_focus(self):
        import crewcomputer
        space = {"name": "Juniper", "tabs": [
            {"name": "#checkout", "terminals": [{"terminal": "t1", "app": "claude-code"}]},
            {"name": "#docs", "terminals": [{"terminal": "t2", "app": "claude-code"}]},
            {"name": "#refunds", "terminals": [{"terminal": "t3"}]},
            {"name": "#shell", "terminals": [{"terminal": "t4"}]}]}
        live = {"t1": {"status": "working"}, "t2": {"status": "done"}}
        tasks = [{"id": "T41", "title": "double charge", "status": "claimed", "claimed_by": "Juniper#checkout"}]
        mission = {"focus": "beta on Friday", "statement": "ship checkout", "goals": [{"text": "cards", "done": True}]}
        tv = crewcomputer.today_view("Juniper", space, live, tasks, [], mission, asleep={"t3"}, today=MON)
        states = {t["topic"]: t["state"] for t in tv["topics"]}
        self.assertEqual(states, {"checkout": "working", "docs": "done", "refunds": "asleep", "shell": "shell"})
        self.assertEqual(tv["topics"][0]["topic"], "checkout")              # working first
        self.assertEqual(tv["topics"][0]["task"]["id"], "T41")
        self.assertEqual(tv["focus"], "beta on Friday")
        self.assertEqual([r["id"] for r in tv["next"]], ["T41"])

    def test_work_blocks_from_the_feed(self):
        import crewcomputer
        h = lambda hh, mm=0: int(datetime.datetime.combine(MON, datetime.time(hh, mm)).timestamp() * 1000)
        feed = [{"kind": "working", "bot": "Juniper", "channel": "checkout", "at": h(9)},
                {"kind": "finished", "bot": "Juniper", "channel": "checkout", "at": h(10, 30)},
                {"kind": "finished", "bot": "Juniper", "channel": "docs", "at": h(11)},        # no start on record
                {"kind": "working", "bot": "Juniper", "channel": "checkout", "at": h(14)},     # still working
                {"kind": "working", "bot": "Atlas", "channel": "general", "at": h(9)},
                {"kind": "task", "status": "done", "task": "T40", "title": "diagram", "at": h(11, 5)},
                {"kind": "routine", "bot": "Juniper", "routine": "r-1", "status": "done", "at": h(9, 1)}]
        tasks = [{"id": "T40", "title": "diagram", "status": "done", "assignee": "Juniper#docs"},
                 {"id": "T45", "title": "addresses", "status": "open", "assignee": "Juniper", "due": "2026-11-11"},
                 {"id": "T46", "title": "later", "status": "open", "assignee": "Juniper", "due": "2026-12-01"}]
        routines = [{"id": "r-1", "bot": "Juniper", "name": "stand-up"}, {"id": "r-2", "bot": "Atlas", "name": "x"}]
        cal = crewcomputer.calendar("Juniper", feed, tasks, routines, MON, 7, now_ms=h(15),
                                    next_runs={"r-1": [h(9) + 86400000], "r-2": [h(10) + 86400000]})
        work = sorted((e for e in cal["events"] if e["kind"] == "work"), key=lambda e: e["start"])
        self.assertEqual([(w["topic"], w["start"], w["end"], w["guessed"]) for w in work],
                         [("checkout", h(9), h(10, 30), False), ("docs", h(11) - 600000, h(11), True),
                          ("checkout", h(14), h(15), False)])
        kinds = sorted(e["kind"] for e in cal["events"] if e["kind"] != "work")
        self.assertEqual(kinds, ["done", "due", "routine", "routine"])      # T40 done, T45 due, r-1 ran and runs again
        self.assertTrue(all(e.get("task") != "T46" for e in cal["events"]))   # due outside the week

    def test_page_names_stay_in_the_folder(self):
        import crewcomputer
        from crewlib import CrewError
        self.assertTrue(str(crewcomputer.page_path("Juniper", "Payment quirks")).endswith("/pages/Payment quirks.md"))
        for bad in ("../MEMORY", "a/b", ".hidden", "x" * 90):
            with self.assertRaises(CrewError, msg=bad):
                crewcomputer.page_path("Juniper", bad)


class TheCommand(unittest.TestCase):
    def setUp(self):
        self.env, self.data = sandbox()

    def test_json_views(self):
        pal(self.env, "task", "add", "Contract tests", "--for", "Worker", "--due", "tomorrow")
        for view in ("today", "todo", "calendar", "journal", "pages"):
            r = pal(self.env, "computer", "Worker", view, "--json")
            self.assertEqual(r.returncode, 0, f"{view}: {r.stderr}")
            out = json.loads(r.stdout)
            self.assertEqual(out["pal"], "Worker", view)
        todo = json.loads(pal(self.env, "computer", "Worker", "todo", "--json").stdout)
        self.assertEqual(todo["next"][0]["due_label"], "due tomorrow")

    def test_pages(self):
        src = self.data / "page.md"
        src.write_text("# Quirks\nWebhooks first.")
        r = pal(self.env, "page", "write", "Payment quirks", "-F", str(src), term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        page = self.data / "crew-memory" / "worker" / "pages" / "Payment quirks.md"
        self.assertEqual(page.read_text(), "# Quirks\nWebhooks first.\n")
        self.assertIn("Payment quirks", pal(self.env, "page", "ls", "Worker").stdout)
        self.assertIn("Webhooks first", pal(self.env, "page", "show", "Payment quirks", "--pal", "Worker").stdout)
        pages = json.loads(pal(self.env, "computer", "Worker", "pages", "--json").stdout)["pages"]
        self.assertEqual([p["name"] for p in pages], ["Payment quirks"])
        r = pal(self.env, "page", "write", "../MEMORY", "-F", str(src), term="tW")     # stays in pages/
        self.assertNotEqual(r.returncode, 0)
        r = pal(self.env, "page", "write", "x", "-F", str(src))                         # not a pal: refused
        self.assertNotEqual(r.returncode, 0)
        r = pal(self.env, "page", "rm", "Payment quirks", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(page.exists())

    def test_the_chief_may_read_it(self):
        import crewchief
        self.assertIsNone(crewchief.cli_refusal("computer", ["Worker", "today", "--json"]))

    def test_feed_hides_turn_starts(self):
        (self.data / "crew-feed.jsonl").write_text(
            json.dumps({"at": 10 ** 13, "kind": "working", "bot": "Worker", "channel": "general"}) + "\n"
            + json.dumps({"at": 10 ** 13 + 1, "kind": "finished", "bot": "Worker", "channel": "general"}) + "\n")
        r = pal(self.env, "feed", "--all")
        self.assertIn("finished a turn", r.stdout)
        self.assertNotIn("working", r.stdout)


if __name__ == "__main__":
    unittest.main()
