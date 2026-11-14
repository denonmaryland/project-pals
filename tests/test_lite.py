"""Pals Lite (T217, DeNon's h-724046): the full pages are deleted, not hidden. Nothing that ships may
still point at one: the layout, a mod that opens another, the menus, the keys the installer adds,
or the Python modules. The installer sets the old mods aside and takes their keys out.
Run: python3 -m unittest tests.test_lite"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GONE_MODS = ["crew-palboard", "crew-computer", "crew-computer-app", "crew-profile", "crew-routines",
             "crew-desk", "crew-room", "crew-room-new", "crew-composer"]
GONE_VIEWS = ["pal-view", "pc-view", "desk-view", "room-view", "profile", "crew-composer"]
GONE_MODULES = ["crewboard.py", "crewcomputer.py"]
GONE_ACTIONS = ["crew-roster.profile", "crew-roster.computer", "crew-roster.board"]


def shipped_js():
    return {p: p.read_text() for p in [*ROOT.glob("mods/*/*.js"), ROOT / "lib" / "crew.js"]}


class NothingPointsAtAGonePage(unittest.TestCase):
    def test_the_folders_and_modules_are_gone(self):
        for m in GONE_MODS:
            self.assertFalse((ROOT / "mods" / m).exists(), f"mods/{m} still ships")
        for f in GONE_MODULES:
            self.assertFalse((ROOT / "bin" / f).exists(), f"bin/{f} still ships")

    def test_the_layout_names_none(self):
        lay = json.loads((ROOT / "layouts" / "pals.json").read_text())
        ids, mods = [], []

        def walk(n):
            if isinstance(n, dict):
                if n.get("id"):
                    ids.append(n["id"])
                c = n.get("content")
                if isinstance(c, dict) and c.get("mod"):
                    mods.append(c["mod"])
                for ch in n.get("children") or []:
                    walk(ch)
        walk(lay)
        for v in GONE_VIEWS:
            self.assertNotIn(v, ids, f"the layout still has {v}")
        shipped = {p.name for p in (ROOT / "mods").iterdir()}
        for m in mods:
            self.assertIn(m, shipped, f"the layout shows {m}, which doesn't ship")

    def test_every_mod_opened_ships(self):
        shipped = {p.name for p in (ROOT / "mods").iterdir()}
        for path, src in shipped_js().items():
            for m in re.findall(r'mod: "(crew-[a-z-]+)"', src):
                self.assertIn(m, shipped, f"{path.relative_to(ROOT)} opens {m}, which doesn't ship")

    def test_no_shipped_code_names_a_gone_page(self):
        names = ["showBoard", "toggleBoard", "showComputer", "toggleComputer", "openPanel", "togglePanel",
                 "showDesk", "deskMode", "showRoom", "shownRoom", "roomMode", "openProposalPanel"]
        for path, src in shipped_js().items():
            for n in names:
                self.assertIsNone(re.search(rf"\b{n}\b", src), f"{path.relative_to(ROOT)} still uses {n}")
        crew = (ROOT / "bin" / "crew").read_text()
        for f in ("crewboard", "crewcomputer", "def cmd_computer"):   # pal page stays (Full control uses it)
            self.assertNotIn(f, crew)

    def test_the_installer(self):
        sh = (ROOT / "install.sh").read_text()
        add = re.search(r'^for pair in (.*); do$', sh, re.M).group(1)
        for a in GONE_ACTIONS:
            self.assertNotIn(a, add, f"the installer still adds a key for {a}")
        gone = re.search(r"^for gone in (.*); do$", sh, re.M).group(1).split()
        for m in GONE_MODS:
            self.assertIn(m, gone, f"the installer doesn't set {m} aside")
        for f in GONE_MODULES:
            self.assertIn(f, sh, f"the installer doesn't remove {f}")
        # Stale keys come out only where keys.json still points them at our actions.
        self.assertIn('"ctrl-shift-i": "crew-roster.profile"', sh)
        self.assertIn("if g.get(k) == a", sh)


if __name__ == "__main__":
    unittest.main()
