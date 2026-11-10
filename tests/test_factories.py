"""Factories (T66, phase 1): `pal factory` and data/crew-factories.json, the default factory that
needs no file, who may change them (the owner's click), and Home per factory.

Runs in subprocesses with a throwaway HOME, data folder and fake hc / herdr-app / systemctl (the
Desk tests' sandbox): python3 -m unittest discover -s tests
"""
import json
import shutil
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, owner, py, OWNER  # noqa: E402


class Factories(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.file = self.data / "crew-factories.json"
        app = self.root / "app"
        app.mkdir()
        (app / "shared.json").write_text(json.dumps({"crew": {"bots": [
            {"name": "Boss", "space": "s0", "god": True}, {"name": "Worker", "space": "s1"}, {"name": "Helper", "space": "s2"}]}}))

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def own(self, *args):
        r = owner(self.env, self.data, "factory", *args)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def ls(self):
        r = pal(self.env, "factory", "ls", "--json", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def home_ids(self, *args, term="tW"):
        r = pal(self.env, "home", "--json", *args, term=term)
        self.assertEqual(r.returncode, 0, r.stderr)
        return [x["title"] for x in json.loads(r.stdout)["items"]]

    # ── the default factory ──
    def test_no_file_is_one_factory_and_nothing_is_written(self):
        v = self.ls()
        self.assertFalse(v["several"])
        self.assertEqual(v["current"], "default")
        self.assertEqual([(f["id"], f["name"], f["foreman"], f["template"]) for f in v["factories"]],
                         [("default", f"{OWNER}'s crew", "Boss", "project-crew")])
        self.assertEqual(v["factories"][0]["members"], ["Boss", "Helper", "Worker"])
        self.assertIn("One factory", pal(self.env, "factory", term="tW").stdout)
        # An open pal Project Pals has no notes on yet still counts (seen live in the sandbox).
        (self.root / "app" / "shared.json").write_text(json.dumps({"crew": {"bots": [{"name": "Boss", "god": True}]}}))
        self.assertEqual(self.ls()["factories"][0]["members"], ["Boss", "Helper", "Worker"])
        self.assertFalse(self.file.exists(), "reading never creates the file")

    def test_one_factory_home_is_as_before(self):
        self.assertEqual(pal(self.env, "home", "ask", "Ship it?", term="tW").returncode, 0)
        item = json.loads((self.data / "crew-home" / "home.json").read_text())["items"][0]
        self.assertNotIn("factory", item, "no factory field until there are several")
        out = json.loads(pal(self.env, "home", "--json", term="tW").stdout)
        self.assertNotIn("factory", out["items"][0])
        self.assertFalse(self.file.exists())

    def test_a_broken_file_is_one_factory(self):
        self.file.write_text("{not json")
        self.assertFalse(self.ls()["several"])
        self.file.write_text(json.dumps({"current": "f-gone", "factories": [{"id": "bad id", "name": "x"}, "junk"], "pals": {"Worker": "f-gone"}}))
        v = self.ls()
        self.assertFalse(v["several"])
        self.assertEqual(v["current"], "default")
        self.assertEqual(v["pals"], {})

    # ── who may change them ──
    def test_only_the_owners_click_changes_factories(self):
        for args in (["new", "Example app"], ["switch", "default"], ["move", "Worker", "default"], ["rename", "default", "Mine"],
                     ["rm", "default"], ["foreman", "default", "Worker"]):
            for term in ("tW", None):
                r = pal(self.env, "factory", *args, term=term)
                self.assertNotEqual(r.returncode, 0, args)
                self.assertIn("click in Project Pals", r.stderr)
        self.assertFalse(self.file.exists())
        # A click for one command line doesn't carry to another.
        from test_desk import click
        tok = click(self.data, ["factory", "new", "Example app"])
        self.assertNotEqual(pal(self.env, "factory", "new", "Other", "--click", tok).returncode, 0)
        self.assertFalse(self.file.exists())

    # ── making, moving, switching ──
    def test_new_move_switch_show(self):
        self.assertIn("made the factory Example app", self.own("new", "Example app", "--template", "platform-lanes"))
        v = self.ls()
        self.assertTrue(v["several"])
        self.assertEqual(v["current"], "default", "making a factory doesn't switch to it")
        f = v["factories"][1]
        self.assertEqual((f["name"], f["template"], f["foreman"], f["members"]), ("Example app", "platform-lanes", "", []))
        self.assertRegex(f["id"], r"^f-[0-9a-z]+$")
        self.own("move", "Helper", "example")          # the start of a name is enough
        self.own("foreman", "Example app", "Helper", "--topic", "#build")
        self.own("switch", "Example app")
        v = self.ls()
        self.assertEqual(v["current"], f["id"])
        self.assertEqual(v["factories"][1]["members"], ["Helper"])
        self.assertEqual(v["factories"][0]["members"], ["Boss", "Worker"])
        self.assertEqual((v["factories"][1]["foreman"], v["factories"][1]["foreman_topic"]), ("Helper", "build"))
        show = pal(self.env, "factory", "show", term="tW").stdout
        self.assertIn("foreman: Helper #build", show)
        self.assertIn("pals: Helper", show)

    def test_refusals(self):
        self.own("new", "Example app")
        for args, why in ((["new", "example APP"], "already a factory"), (["new", "default"], "already a factory"),
                          (["new", "X", "--template", "nope"], "template is one of"), (["move", "Boss", "Example app"], "head pal"),
                          (["switch", "Nowhere"], "no factory called"), (["rm", "default"], "default factory stays"),
                          (["foreman", "Example app", "Worker"], "isn't in Example app"), (["new", "x" * 41], "40 characters")):
            r = owner(self.env, self.data, "factory", *args)
            self.assertNotEqual(r.returncode, 0, args)
            self.assertIn(why, r.stderr)

    def test_remove_sends_pals_home_and_rename(self):
        self.own("new", "Example app", "--foreman", "Helper")
        self.own("switch", "Example app")
        self.own("rename", "Example app", "Big app")
        self.own("rename", "default", "Mods")
        v = self.ls()
        self.assertEqual([f["name"] for f in v["factories"]], ["Mods", "Big app"])
        self.assertEqual(v["factories"][1]["foreman"], "Helper")
        self.assertIn("back in your crew: Helper", self.own("rm", "Big app"))
        v = self.ls()
        self.assertFalse(v["several"])
        self.assertEqual(v["current"], "default")
        self.assertEqual(v["factories"][0]["members"], ["Boss", "Helper", "Worker"])

    def test_a_renamed_pal_keeps_its_factory_and_job(self):
        self.own("new", "Example app", "--foreman", "Helper")
        py(self.env, "import crewlib; crewlib.renamed('Helper', 'Mac')")
        st = json.loads(self.file.read_text())
        self.assertEqual(list(st["pals"]), ["Mac"])
        self.assertEqual(st["factories"][0]["foreman"], "Mac")
        # Moving a foreman out takes the job off it.
        self.own("move", "Mac", "default")
        self.assertEqual(json.loads(self.file.read_text())["factories"][0]["foreman"], "")

    def test_the_chief_is_in_no_factory(self):
        (self.root / "app" / "shared.json").write_text(json.dumps({"crew": {"bots": [
            {"name": "Boss", "god": True}, {"name": "Worker"}, {"name": "Helper"}, {"name": "Chief", "chief": True}]}}))
        self.own("new", "Example app")
        v = self.ls()
        self.assertEqual(v["factories"][0]["members"], ["Boss", "Helper", "Worker"], "not listed on any floor")
        for args in (["move", "Chief", "Example app"], ["foreman", "Example app", "chief"], ["new", "Third", "--foreman", "Chief"]):
            r = owner(self.env, self.data, "factory", *args)
            self.assertNotEqual(r.returncode, 0, args)
            self.assertIn("above every factory", r.stderr)
        self.assertEqual(self.ls()["pals"], {})
        self.assertEqual(len(self.ls()["factories"]), 2)

    # ── Home per factory ──
    def test_home_follows_the_factory(self):
        self.assertEqual(pal(self.env, "home", "ask", "Old question", term="tH").returncode, 0)   # before any factory: no stamp
        self.own("new", "Example app")
        self.own("move", "Helper", "Example app")
        self.assertEqual(pal(self.env, "home", "ask", "Merge the Mac PR?", term="tH").returncode, 0)
        self.assertEqual(pal(self.env, "home", "ask", "Ship the mod?", term="tW").returncode, 0)
        self.assertEqual(pal(self.env, "home", "note", "About the helper", term="tW").returncode, 0)
        self.assertEqual(pal(self.env, "home", "link", "http://x.test/a", "--topic", "Helper#build", term="tW").returncode, 0)
        items = {x["title"]: x for x in json.loads((self.data / "crew-home" / "home.json").read_text())["items"]}
        fid = self.ls()["factories"][1]["id"]
        self.assertNotIn("factory", items["Old question"])
        self.assertEqual(items["Merge the Mac PR?"]["factory"], fid)
        self.assertEqual(items["Ship the mod?"]["factory"], "default")
        self.assertEqual(items["http://x.test/a"]["factory"], fid, "an item is about its topic's pal, not who added it")
        # A pal sees its own factory's Home; an old item follows the pal it came from.
        self.assertEqual(self.home_ids(term="tH"), ["Old question", "Merge the Mac PR?", "http://x.test/a"])
        self.assertEqual(self.home_ids(term="tW"), ["Ship the mod?", "About the helper"])
        self.assertEqual(len(self.home_ids("--factory", "all", term="tW")), 5)
        self.assertEqual(self.home_ids("--factory", "Example app", term="tW"), self.home_ids(term="tH"))
        # Outside a pal (the app, a shell): the factory the app shows.
        self.assertEqual(self.home_ids(term=None), ["Ship the mod?", "About the helper"])
        self.own("switch", "Example app")
        self.assertEqual(self.home_ids(term=None), ["Old question", "Merge the Mac PR?", "http://x.test/a"])
        # A stamped item stays put when its pal moves; removing the factory brings everything back.
        self.own("move", "Helper", "default")
        self.assertEqual(self.home_ids("--factory", "Example app", term="tW"), ["Merge the Mac PR?", "http://x.test/a"])
        self.own("rm", "Example app")
        self.assertEqual(len(self.home_ids(term="tW")), 5)


if __name__ == "__main__":
    unittest.main()
