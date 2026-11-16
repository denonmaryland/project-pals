"""Pals Lite (T217): a pal's proposal is reviewed in a dialog now (mods/crew-proposal), since the
profile panel is gone. `pal proposal show` gives it what changes: the current text and a diff.
Throwaway HOME, data and fake hc / herdr-app, like test_head_inbox.
Run: python3 -m unittest tests.test_proposal_review"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))
import pals_tmp  # noqa: E402,F401  (scratch folders removed at exit, T143)
from test_head_inbox import sandbox  # noqa: E402
from test_desk import pal  # noqa: E402


class ShowWithDiff(unittest.TestCase):
    def setUp(self):
        self.env, self.data = sandbox()

    def propose(self, text):
        f = Path(self.env["HOME"]) / "mission.md"
        f.write_text(text)
        r = pal(self.env, "mission", "propose", "-F", str(f), term="tW")
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        ls = json.loads(pal(self.env, "proposals", "ls", "--json").stdout)
        return ls[-1]["id"]

    def test_a_mission_proposal_shows_what_changes(self):
        pid = self.propose("# Mission\n\nShip checkout.\n\n## Goals\n- one\n")
        r = pal(self.env, "proposal", "show", pid)
        self.assertEqual(r.returncode, 0, r.stderr)
        p = json.loads(r.stdout)
        self.assertEqual(p["kind"], "mission")
        self.assertIn("text_sha", p)
        self.assertIn("current", p)
        self.assertIn("+Ship checkout.", p["diff"])
        self.assertTrue(p["diff"].startswith("--- mission.md now"), p["diff"][:40])

    def test_accepting_still_needs_the_owners_click(self):
        pid = self.propose("# Mission\n\nShip it.\n")
        sha = json.loads(pal(self.env, "proposal", "show", pid).stdout)["text_sha"]
        r = pal(self.env, "proposal", "accept", pid, "--text-sha", sha, term="tW")
        self.assertNotEqual(r.returncode, 0, "a pal can't accept a proposal")


if __name__ == "__main__":
    unittest.main()
