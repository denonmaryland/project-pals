"""The welcome tour (T76; RECIPE "The welcome tour"): the folders it suggests (names and dates, never
contents), `pal welcome`, the head pal's home folder, and install.sh's first-install mark.

Runs in subprocesses with a throwaway HOME and fake hc / herdr-app / systemctl (the Desk tests'
sandbox): python3 -m unittest discover -s tests
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
from test_desk import sandbox, pal  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "bin"))
import crewwelcome  # noqa: E402


def repo(path, at=None):
    (path / ".git").mkdir(parents=True)
    (path / ".git" / "HEAD").write_text("ref: refs/heads/main\n")
    if at:
        os.utime(path / ".git" / "HEAD", (at, at))
    return path


class Folders(unittest.TestCase):
    def setUp(self):
        self.home = Path(tempfile.mkdtemp(prefix="pals-welcome-"))

    def tearDown(self):
        shutil.rmtree(self.home, ignore_errors=True)

    def test_git_folders_newest_first(self):
        repo(self.home / "Projects" / "old-thing", at=1_000_000)
        repo(self.home / "Projects" / "weather-app", at=3_000_000)
        repo(self.home / "code" / "docs_site", at=2_000_000)
        (self.home / "Projects" / "just-notes").mkdir()             # not a git folder
        repo(self.home / "Projects" / ".hidden")                    # hidden
        repo(self.home / "Elsewhere" / "nope")                      # not a usual place
        repo(self.home / "Projects" / "deep" / "nested")            # two levels down
        got = crewwelcome.folders(home=self.home)
        self.assertEqual([f["name"] for f in got], ["Weather App", "Docs Site", "Old Thing"])
        self.assertEqual(got[0]["show"], "~/Projects/weather-app")
        self.assertEqual(got[0]["at"], 3_000_000_000)

    def test_folders_with_a_pal_are_left_out(self):
        a = repo(self.home / "Projects" / "weather-app")
        repo(self.home / "Projects" / "docs-site")
        (self.home / "link").symlink_to(a)
        got = crewwelcome.folders(home=self.home, taken=[str(self.home / "link"), "/nowhere"])
        self.assertEqual([f["name"] for f in got], ["Docs Site"])

    def test_top_five_and_nothing_found(self):
        self.assertEqual(crewwelcome.folders(home=self.home), [])
        for i in range(8):
            repo(self.home / "src" / f"p{i}", at=1_000_000 + i)
        got = crewwelcome.folders(home=self.home)
        self.assertEqual(len(got), 5)
        self.assertEqual(got[0]["name"], "P7")

    def test_it_reads_no_file_contents(self):
        # A project whose files can't be read is still listed: only names and dates are looked at.
        p = repo(self.home / "Projects" / "locked")
        secret = p / "secret.txt"
        secret.write_text("x")
        secret.chmod(0)
        (p / ".git" / "HEAD").chmod(0)
        try:
            self.assertEqual([f["name"] for f in crewwelcome.folders(home=self.home)], ["Locked"])
        finally:
            secret.chmod(0o600)
            (p / ".git" / "HEAD").chmod(0o600)

    def test_names(self):
        self.assertEqual(crewwelcome.pal_name("/x/weather-app"), "Weather App")
        self.assertEqual(crewwelcome.pal_name("/x/my_cool.site/"), "My Cool Site")
        self.assertEqual(crewwelcome.pal_name("/"), "My Project")


class Cli(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def mark(self, w):
        s = json.loads((self.data / "crew-settings.json").read_text())
        (self.data / "crew-settings.json").write_text(json.dumps({**s, "welcome": w}))

    def test_status(self):
        self.assertIn("hasn't run here", pal(self.env, "welcome").stdout)
        self.mark({"state": "new", "beat": 2})
        self.assertIn("screen 3 of 7", pal(self.env, "welcome").stdout)
        self.mark({"state": "done"})
        self.assertIn("is done", pal(self.env, "welcome").stdout)
        self.mark({"state": "skipped"})
        self.assertIn("was skipped", pal(self.env, "welcome").stdout)

    def test_folders_json(self):
        repo(Path(self.env["HOME"]) / "Projects" / "weather-app")
        r = pal(self.env, "welcome", "folders", "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual([f["name"] for f in json.loads(r.stdout)], ["Weather App"])
        self.assertIn("~/Projects/weather-app", pal(self.env, "welcome", "folders").stdout)

    def test_welcome_changes_nothing(self):
        before = (self.data / "crew-settings.json").read_text()
        pal(self.env, "welcome")
        pal(self.env, "welcome", "folders")
        self.assertEqual((self.data / "crew-settings.json").read_text(), before)


class FirstInstall(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="pals-welcome-install-"))
        self.home = self.root / "home"
        self.app = self.home / ".config" / "herdr-app"
        self.app.mkdir(parents=True)
        shims = self.root / "shims"
        shims.mkdir()
        (shims / "systemctl").write_text("#!/bin/sh\nexit 1\n")
        (shims / "herdr-app").write_text("#!/bin/sh\necho \"$@\" >> \"$HOME/herdr-app.log\"\ncase \"$1\" in check|do) exit 0 ;; ls) echo '{\"spaces\":[],\"recent\":[]}'; exit 0 ;; esac\nexit 1\n")
        for f in shims.iterdir():
            f.chmod(0o755)
        self.env = {"HOME": str(self.home), "PATH": f"{shims}:{self.home}/.local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"}

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def install(self):
        r = subprocess.run(["bash", str(REPO / "install.sh"), "--no-helpers"], capture_output=True, text=True, env=self.env, timeout=300)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return r.stdout

    def settings(self):
        return json.loads((self.app / "data" / "crew-settings.json").read_text())

    def test_a_first_install_starts_the_tour_and_a_second_leaves_it(self):
        out = self.install()
        self.assertEqual(self.settings()["welcome"], {"state": "new", "beat": 0})
        self.assertIn("Orchestrator is waiting on Home to show you around", out)
        self.assertIn("layout.switch", (self.home / "herdr-app.log").read_text())
        # The tour's files are in the Home mod.
        for f in ("welcome.js", "welcome-text.js"):
            self.assertTrue((self.app / "mods" / "crew-home" / f).exists(), f)
        # The owner finishes it; a second install doesn't bring it back or switch the layout again.
        s = self.settings()
        s["welcome"] = {"state": "done"}
        (self.app / "data" / "crew-settings.json").write_text(json.dumps(s))
        (self.home / "herdr-app.log").unlink()
        out = self.install()
        self.assertEqual(self.settings()["welcome"], {"state": "done"})
        self.assertNotIn("show you around", out)
        log = (self.home / "herdr-app.log").read_text() if (self.home / "herdr-app.log").exists() else ""
        self.assertNotIn("layout.switch", log)

    def test_an_older_install_with_pals_gets_no_tour(self):
        # Pals on record but no settings file (an install from before settings): not a first install.
        (self.app / "shared.json").write_text(json.dumps({"crew": {"bots": [{"id": "b1", "name": "Website"}]}}))
        out = self.install()
        self.assertNotIn("welcome", self.settings())
        self.assertNotIn("show you around", out)


if __name__ == "__main__":
    unittest.main()
