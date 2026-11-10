"""Topic areas (T105, stage 1): `pal topic area …` and data/crew-areas.json. A pal's topics are
filed under a few names for listing only; Pal#topic stays the address and nothing else changes.

Runs in subprocesses with a throwaway HOME, data folder and fake hc / herdr-app / systemctl (the
Desk tests' sandbox, whose pals are Worker (#general) and Helper (#build, #docs)):
python3 -m unittest discover -s tests
"""
import json
import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, py  # noqa: E402


class Areas(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.file = self.data / "crew-areas.json"

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def ok(self, *args, term="tH"):
        r = pal(self.env, "topic", "area", *args, term=term)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        return r.stdout

    def bad(self, *args, term="tH"):
        r = pal(self.env, "topic", "area", *args, term=term)
        self.assertNotEqual(r.returncode, 0, r.stdout)
        return r.stderr + r.stdout

    def ls(self, palname="Helper"):
        return json.loads(self.ok("ls", palname, "--json"))[palname]

    def test_nothing_until_a_topic_is_filed(self):
        self.assertFalse(self.file.exists())
        self.assertIn("no areas yet", self.ok("ls", "Helper"))
        self.assertEqual(self.ls(), {"areas": [], "groups": [{"area": None, "topics": ["build", "docs"]}]})
        self.assertFalse(self.file.exists(), "listing writes nothing")

    def test_filing_makes_the_area_and_lists_by_it(self):
        self.assertIn("Helper #build is under Releases", self.ok("set", "Helper#build", "Releases"))
        got = self.ls()
        self.assertEqual([a["name"] for a in got["areas"]], ["Releases"])
        self.assertRegex(got["areas"][0]["id"], r"^a-[0-9a-f]{6}$")
        self.assertEqual(got["groups"], [{"area": "Releases", "topics": ["build"]}, {"area": None, "topics": ["docs"]}])
        out = self.ok("ls", "Helper")
        self.assertIn("Releases (1): #build", out)
        self.assertIn("Unsorted (1): #docs", out)
        # A second topic into the same area by the start of its name; no second area is made.
        self.ok("set", "helper#docs", "rel")
        self.assertEqual(self.ls()["groups"], [{"area": "Releases", "topics": ["build", "docs"]}])
        self.assertEqual(len(self.ls()["areas"]), 1)

    def test_a_topic_is_in_one_area_and_none_unfiles_it(self):
        self.ok("set", "Helper#build", "Releases")
        self.ok("set", "Helper#build", "Sidebar and look")
        self.assertEqual(self.ls()["groups"], [{"area": "Sidebar and look", "topics": ["build"]}, {"area": None, "topics": ["docs"]}])
        self.assertIn("unsorted", self.ok("set", "Helper#build", "none"))
        self.assertEqual(self.ls()["groups"], [{"area": None, "topics": ["build", "docs"]}])
        self.assertEqual([a["name"] for a in self.ls()["areas"]], ["Releases", "Sidebar and look"], "the areas stay")

    def test_unknown_topic_is_refused(self):
        self.assertIn("has no topic #nope", self.bad("set", "Helper#nope", "Releases"))
        self.assertFalse(self.file.exists())

    def test_areas_are_per_pal(self):
        self.ok("set", "Helper#build", "Releases")
        self.ok("set", "Worker#general", "Backbone")
        self.assertEqual([a["name"] for a in self.ls("Helper")["areas"]], ["Releases"])
        self.assertEqual([a["name"] for a in self.ls("Worker")["areas"]], ["Backbone"])

    def test_remove_unfiles_and_touches_nothing_else(self):
        self.ok("set", "Helper#build", "Releases")
        self.ok("set", "Helper#docs", "Pages")
        out = self.ok("rm", "Helper", "Releases")
        self.assertIn("1 topic unsorted again", out)
        self.assertEqual(self.ls()["groups"], [{"area": "Pages", "topics": ["docs"]}, {"area": None, "topics": ["build"]}])
        self.ok("rm", "Helper", "Pages")
        self.assertEqual(json.loads(self.file.read_text())["pals"], {}, "no areas left: no record")
        self.assertIn("no area called", self.bad("rm", "Helper", "Pages"))

    def test_rename_an_area_and_follow_a_renamed_topic(self):
        self.ok("set", "Helper#build", "Releases")
        self.ok("add", "Helper", "Pages")
        self.assertIn("Shipping", self.ok("rename", "Helper", "Releases", "Shipping"))
        self.assertIn("already an area", self.bad("rename", "Helper", "Pages", "shipping"))
        self.assertEqual(self.ls()["groups"][0], {"area": "Shipping", "topics": ["build"]})
        # The topic's name changes in the app: the app says so, and the filing follows.
        self.assertIn("moved", self.ok("renamed", "Helper", "build", "docs"))
        self.assertEqual(self.ls()["groups"][0], {"area": "Shipping", "topics": ["docs"]})
        self.assertIn("nothing to move", self.ok("renamed", "Helper", "gone", "x"))

    def test_names_that_are_views_and_the_cap(self):
        for taken in ("Live", "Shelf", "unsorted"):
            self.assertIn("names a view", self.bad("add", "Helper", taken))
        for i in range(16):
            self.ok("add", "Helper", f"Area {i}")
        self.assertIn("16 areas", self.bad("add", "Helper", "One too many"))
        self.assertEqual(len(self.ls()["areas"]), 16)
        self.assertIn("matches", self.bad("set", "Helper#build", "Area"), "an ambiguous start is refused")

    def test_a_broken_file_is_read_as_what_can_be_trusted(self):
        self.file.write_text(json.dumps({"pals": {"Helper": {"areas": [{"id": "a-abc123", "name": "Good"}, {"id": "bad", "name": "No id"},
                                                                         {"id": "a-abc124", "name": "good"}, "junk"],
                                                              "topics": {"build": "a-abc123", "docs": "a-gone00", "": "a-abc123"}},
                                                  "Nobody": {"areas": [], "topics": {"x": "a-abc123"}}, "Odd": "text"}}))
        got = self.ls()
        self.assertEqual(got["areas"], [{"id": "a-abc123", "name": "Good"}])
        self.assertEqual(got["groups"], [{"area": "Good", "topics": ["build"]}, {"area": None, "topics": ["docs"]}])
        self.file.write_text("not json")
        self.assertEqual(self.ls()["areas"], [])

    def test_pal_team_lists_topics_under_their_areas(self):
        r = pal(self.env, "team", term="tH")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("\n  #build:", r.stdout, "no areas: topics as before")
        self.assertNotIn("Unsorted", r.stdout)
        self.ok("set", "Helper#docs", "Pages")
        out = pal(self.env, "team", term="tH").stdout
        self.assertIn("  Pages (1)\n    #docs:", out)
        self.assertIn("  Unsorted (1)\n    #build:", out)
        self.assertIn("\n  #general:", out, "a pal with no areas is listed as before")

    def test_addresses_do_not_know_areas(self):
        self.ok("set", "Helper#build", "Releases")
        got = py(self.env, "import crewlib\nsp = crewlib.herdr_spaces() if hasattr(crewlib, 'herdr_spaces') else None\n"
                           "import subprocess, os\nprint(json.dumps(True))")
        self.assertTrue(got)
        # The address still resolves by pal and topic alone, and an area name is not a topic.
        r = pal(self.env, "peek", "Helper#build", "-n", "1", term="tW")
        self.assertNotIn("no topic", (r.stderr + r.stdout).lower())
        r = pal(self.env, "peek", "Helper#Releases", "-n", "1", term="tW")
        self.assertNotEqual(r.returncode, 0, "an area is not an address")

    def test_sort_all_files_many_at_once(self):
        got = py(self.env, "import crewareas\nprint(json.dumps(crewareas.sort_all('Helper', {'Releases': ['build', '#docs'], 'Pages': ['docs']})))")
        self.assertEqual(got, {"Releases": 2, "Pages": 1})
        self.assertEqual(self.ls()["groups"], [{"area": "Releases", "topics": ["build"]}, {"area": "Pages", "topics": ["docs"]}])


if __name__ == "__main__":
    unittest.main()
