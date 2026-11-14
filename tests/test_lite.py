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
             "crew-desk", "crew-room", "crew-room-new", "crew-composer", "crew-desk-settings"]
GONE_VIEWS = ["pal-view", "pc-view", "desk-view", "room-view", "profile", "crew-composer"]
GONE_MODULES = ["crewboard.py", "crewcomputer.py", "crewpages.py"]
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
        for f in ("crewboard", "crewcomputer", "crewpages", "def cmd_computer", "def cmd_page"):
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


class NothingSaysDesk(unittest.TestCase):
    """DeNon (via Orca, c-ceaf18, for 0.4.4): nothing in the app says Desk. The card system stays for
    the command line (pal tell / ask, tasks, check-ins); the quick-drop stays as Send to a pal."""

    def ui_strings(self):
        """String and template literals in shipped JS, minus comments, ids, paths and command args."""
        out = []
        for path, src in shipped_js().items():
            for i, line in enumerate(src.splitlines(), 1):
                code = re.sub(r"(^|\s)//.*$", "", line)
                for lit in re.findall(r'"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`', code):
                    text = re.sub(r"\$\{[^}]*\}", "", lit[0] or lit[1])   # a template's ${…} is code, not text
                    if re.search(r"\s", text) or re.match(r"^[A-Z][a-z]", text):
                        out.append((path.relative_to(ROOT), i, text))
        return out

    def test_no_shown_text_says_desk(self):
        said = [(str(f), i, t) for f, i, t in self.ui_strings() if re.search(r"\b[Dd]esk\b", t)]
        self.assertEqual(said, [], "text the app shows still says Desk")

    def test_the_header_has_no_drop_button(self):
        src = (ROOT / "mods" / "crew-header" / "main.js").read_text()
        self.assertNotIn("dropButton", src)
        self.assertNotIn('"drop-btn"', src)

    def test_the_quick_drop_is_send_to_a_pal(self):
        lib = (ROOT / "lib" / "crew.js").read_text()
        self.assertIn('label: "Send to a pal…"', lib)
        self.assertNotIn("Drop a card", lib)
        drop = (ROOT / "mods" / "crew-desk-drop" / "main.js").read_text()
        self.assertIn('"Send to a pal"', drop)
        shown = [t for f, _, t in self.ui_strings() if str(f).endswith("crew-desk-drop/main.js")]
        self.assertFalse([t for t in shown if re.search(r"\bDrop(ping|ped)?\b|Drop a card", t)], "the quick-drop shows no Drop")
        self.assertIn('"desk", "send"', drop, "it still sends as the owner's card")
        self.assertIn("ownerCli(args)", drop, "with the owner's click token")

    def test_about_has_no_desk_row(self):
        src = (ROOT / "mods" / "crew-about" / "main.js").read_text()
        self.assertNotIn("set-desk", src)
        self.assertNotIn("crew-desk-settings", src)


if __name__ == "__main__":
    unittest.main()
