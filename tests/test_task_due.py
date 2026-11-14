"""A task's optional due date (pal task add --due, pal task due), and that the feed hides turn
starts. These came from the Computer's tests (T81); the Computer itself went with Pals Lite (T217).
Throwaway HOME, data and fake hc / herdr-app, like test_head_inbox.
Run: python3 -m unittest tests.test_task_due"""
import datetime
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))
from test_head_inbox import sandbox  # noqa: E402
from test_desk import pal  # noqa: E402

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


class TheFeed(unittest.TestCase):
    def setUp(self):
        self.env, self.data = sandbox()

    def test_feed_hides_turn_starts(self):
        (self.data / "crew-feed.jsonl").write_text(
            json.dumps({"at": 10 ** 13, "kind": "working", "bot": "Worker", "channel": "general"}) + "\n"
            + json.dumps({"at": 10 ** 13 + 1, "kind": "finished", "bot": "Worker", "channel": "general"}) + "\n")
        r = pal(self.env, "feed", "--all")
        self.assertIn("finished a turn", r.stdout)
        self.assertNotIn("working", r.stdout)


if __name__ == "__main__":
    unittest.main()
