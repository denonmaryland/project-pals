"""Pop out (T70, bin/crewpopout.py): a topic's terminal in its own desktop window. What's checked
here needs no window: the pop-out's app home and layout, the geometry store, the Hyprland dispatch
lines (one window by address, never the active one), the watcher's placing, and `pal popout`'s
owner gate. Fake hyprctl / herdr-app; throwaway data and runtime folders.

python3 -m unittest discover -s tests
"""
import json
import os
import shutil
import subprocess
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_desk import sandbox, pal, owner, py  # noqa: E402


def app_home(root):
    """A minimal installed app home: the bar mod, the roster's icons, a theme and settings."""
    app = root / "app"
    (app / "mods" / "crew-popout-bar").mkdir(parents=True)
    (app / "mods" / "crew-popout-bar" / "main.js").write_text("// bar\n")
    (app / "mods" / "crew-roster" / "icons").mkdir(parents=True)
    (app / "mods" / "crew-roster" / "icons" / "pin.svg").write_text("<svg/>")
    (app / "themes").mkdir()
    (app / "themes" / "omarchy.json").write_text("{}")
    (app / "settings.json").write_text(json.dumps({"theme": "omarchy", "zoom": 0.9, "sounds": True}))
    (app / "shared.json").write_text(json.dumps({"layout": "pals", "crew": {"secret": 1}}))
    (app / "keys.json").write_text("{}")
    (app / "update-notes.json").write_text(json.dumps({"last_run": "0.1.14"}))
    return app


class Pure(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.app = app_home(self.root)
        self.env["XDG_RUNTIME_DIR"] = str(self.root / "run")
        (self.root / "run").mkdir()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def run_py(self, code):
        return py(self.env, "import crewpopout\n" + code)

    def test_slug(self):
        self.assertEqual(self.run_py("print(json.dumps([crewpopout.slug('Orca#ops'), crewpopout.slug('../../etc'), crewpopout.slug('')]))"),
                         ["orca-ops", "etc", "popout"])

    def test_layout_is_the_bar_over_the_terminal(self):
        spec = self.run_py("print(json.dumps(crewpopout.layout_spec('t7', {'pal': 'Orca', 'topic': 'ops'})))")
        bar, term = spec["children"]
        self.assertEqual(spec["type"], "column")
        self.assertEqual(bar["content"], {"mod": "crew-popout-bar", "props": {"pal": "Orca", "topic": "ops"}})
        self.assertEqual(bar["size"], {"px": 30})
        self.assertEqual(term["content"], {"terminal": "t7"})
        self.assertNotIn("size", term)          # the terminal takes the rest, so it reflows on resize

    def test_home_holds_only_what_the_window_needs(self):
        dest = self.root / "run" / "pals-popout" / "orca-ops"
        self.run_py(f"crewpopout.build_home({str(dest)!r}, {str(self.app)!r}, 't7', {{'pal': 'Orca'}})")
        self.assertTrue((dest / "mods" / "crew-popout-bar" / "main.js").exists())
        self.assertTrue((dest / "mods" / "crew-roster" / "icons" / "pin.svg").exists())
        self.assertTrue((dest / "themes" / "omarchy.json").exists())
        self.assertEqual(json.loads((dest / "shared.json").read_text()), {"layout": "popout", "frame.welcomed": "finished"})
        self.assertEqual(json.loads((dest / "settings.json").read_text()), {"theme": "omarchy", "zoom": 0.9, "sounds": {"enabled": False}})
        self.assertEqual(json.loads((dest / "update-notes.json").read_text()), {"last_run": "0.1.14"})
        self.assertFalse((dest / "keys.json").exists())     # none of the owner's keys or crew state
        self.assertEqual(json.loads((dest / "layouts" / "popout.json").read_text())["children"][1]["content"], {"terminal": "t7"})
        # A second build replaces the first, and the owner's own app home is untouched.
        self.run_py(f"crewpopout.build_home({str(dest)!r}, {str(self.app)!r}, 't9', {{}})")
        self.assertEqual(json.loads((dest / "layouts" / "popout.json").read_text())["children"][1]["content"], {"terminal": "t9"})
        self.assertEqual(json.loads((self.app / "shared.json").read_text())["layout"], "pals")

    def test_home_needs_the_installed_bar(self):
        shutil.rmtree(self.app / "mods" / "crew-popout-bar")
        with self.assertRaises(AssertionError) as e:
            self.run_py(f"crewpopout.build_home({str(self.root / 'run' / 'x')!r}, {str(self.app)!r}, 't7', {{}})")
        self.assertIn("isn't installed", str(e.exception))

    def test_geometry_is_remembered_and_kept_sane(self):
        out = self.run_py("""
a = crewpopout.remembered('orca-ops')
c1 = crewpopout.remember('orca-ops', {'w': 700.6, 'h': 100, 'x': -40, 'y': 12, 'pinned': 1})
c2 = crewpopout.remember('orca-ops', {'w': 700, 'h': 100, 'x': -40, 'y': 12, 'pinned': True})
crewpopout.remember('other', {'w': 'wide'})
print(json.dumps([a, c1, c2, crewpopout.remembered('orca-ops'), crewpopout.remembered('other')]))""")
        self.assertEqual(out[0], {"w": 560, "h": 520, "pinned": False})
        self.assertEqual(out[1:3], [True, False])
        self.assertEqual(out[3], {"w": 700, "h": 220, "x": -40, "y": 12, "pinned": True})   # below the minimum height
        self.assertEqual(out[4], {"w": 560, "h": 520, "pinned": False})
        self.assertEqual(sorted(json.loads((self.data / "crew-popout.json").read_text())), ["orca-ops", "other"])

    def test_geo_of_a_hyprland_client(self):
        out = self.run_py("print(json.dumps(crewpopout.geo_of({'at': [10, 20], 'size': [640, 480], 'pinned': True})))")
        self.assertEqual(out, {"w": 640, "h": 480, "x": 10, "y": 20, "pinned": True})

    def test_dispatch_lines_name_one_window(self):
        out = self.run_py("""
g = {'w': 640, 'h': 480, 'x': 10, 'y': 20}
print(json.dumps({a: crewpopout.dispatch_lines(a, '0x55aa', g) for a in ('float', 'pin', 'resize', 'move', 'top', 'focus')}
                 | {'center': crewpopout.dispatch_lines('move', '0x55aa', {'w': 1, 'h': 1})}))""")
        for name, (lua, classic) in out.items():
            self.assertIn("address:0x55aa", lua, name)
            self.assertIn("address:0x55aa", " ".join(classic), name)
        self.assertIn("x = 640, y = 480", out["resize"][0])
        self.assertIn("x = 10, y = 20", out["move"][0])
        self.assertIn("center", out["center"][0])
        self.assertEqual(out["pin"][1], ["pin", "address:0x55aa"])

    def test_dispatch_refuses_anything_but_an_address(self):
        for bad in ("", "activewindow", '0x1" }) os.execute("x', None):
            with self.assertRaises(AssertionError):
                self.run_py(f"crewpopout.dispatch_lines('pin', {bad!r})")


HYPRCTL = r'''#!/bin/sh
# A fake hyprctl: `clients -j` prints $FAKE/clients.json; a dispatch is logged, and pin / float flip the file.
if [ "$1" = clients ]; then cat "$FAKE/clients.json"; exit 0; fi
if [ "$1" = dispatch ]; then
  shift; echo "$*" >> "$FAKE/dispatch.log"
  case "$*" in
    *window.pin*) python3 - "$FAKE/clients.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1])); c[0]["pinned"] = not c[0]["pinned"]; json.dump(c, open(sys.argv[1], "w"))
PY
    ;;
    *window.float*) python3 - "$FAKE/clients.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1])); c[0]["floating"] = not c[0]["floating"]; json.dump(c, open(sys.argv[1], "w"))
PY
    ;;
  esac
  echo ok; exit 0
fi
exit 1
'''


class Live(unittest.TestCase):
    """`pal popout` end to end with a fake herdr-app (a sleep) and a fake hyprctl."""
    def setUp(self):
        self.root, self.env, self.data = sandbox()
        self.app = app_home(self.root)
        self.fake = self.root / "fake"
        self.fake.mkdir()
        (self.root / "run").mkdir()
        shims = self.root / "shims"
        # herdr-app: `ls` as the sandbox's (the spaces), bare = the window (it just stays up).
        real = (shims / "herdr-app").read_text()
        (shims / "herdr-app").write_text(real.replace("exit 1\n", 'if [ $# -eq 0 ]; then echo "$HERDR_APP_HOME" > "$FAKE/launched"; exec sleep 30; fi\nexit 1\n'))
        (shims / "hyprctl").write_text(HYPRCTL)
        (shims / "hyprctl").chmod(0o755)
        self.env.update({"XDG_RUNTIME_DIR": str(self.root / "run"), "FAKE": str(self.fake), "HYPRLAND_INSTANCE_SIGNATURE": "test"})
        (self.fake / "clients.json").write_text("[]")
        self.pids = []

    def tearDown(self):
        for st in (self.root / "run" / "pals-popout").glob("*.json"):
            try:
                os.kill(json.loads(st.read_text())["pid"], 15)
            except (OSError, ValueError, KeyError):
                pass
        time.sleep(0.4)
        shutil.rmtree(self.root, ignore_errors=True)

    def state(self, key="helper-build"):
        return json.loads((self.root / "run" / "pals-popout" / f"{key}.json").read_text())

    def wait(self, fn, secs=6):
        end = time.time() + secs
        while time.time() < end:
            try:
                v = fn()
                if v:
                    return v
            except (OSError, ValueError):
                pass
            time.sleep(0.1)
        self.fail("timed out")

    def test_only_the_owners_click_opens_pins_or_closes(self):
        for args in (["popout", "Helper#build"], ["popout", "pin", "helper-build"], ["popout", "close", "helper-build"]):
            for term in ("tW", None):
                r = pal(self.env, *args, term=term)
                self.assertNotEqual(r.returncode, 0, args)
                self.assertIn("click", r.stderr + r.stdout)
        self.assertFalse((self.fake / "launched").exists())
        self.assertEqual(pal(self.env, "popout", "ls", term="tW").stdout.strip(), "no pop-outs open")

    def test_open_places_remembers_pins_and_closes(self):
        (self.data / "crew-popout.json").write_text(json.dumps({"helper-build": {"w": 640, "h": 400, "x": 30, "y": 40, "pinned": True}}))
        r = owner(self.env, self.data, "popout", "Helper#build")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip(), "opened helper-build")
        st = self.state()
        home = Path(st["home"])
        self.assertEqual(self.wait(lambda: (self.fake / "launched").read_text().strip()), str(home))
        layout = json.loads((home / "layouts" / "popout.json").read_text())
        self.assertEqual(layout["children"][1]["content"], {"terminal": "tH"})
        self.assertEqual(layout["children"][0]["content"]["props"],
                         {"pal": "Helper", "topic": "build", "space": "s2", "tab": "tb2", "home": str(self.app), "key": "helper-build", "terminal": "tH"})
        self.assertEqual(pal(self.env, "popout", "ls").stdout.strip(), "helper-build")

        # The window maps (tiled, unpinned): the watcher floats it at the remembered size and place and pins it.
        (self.fake / "clients.json").write_text(json.dumps([{"address": "0xabc", "pid": st["pid"], "floating": False, "pinned": False,
                                                            "at": [0, 0], "size": [1200, 900]}]))
        log = self.wait(lambda: (lambda t: t if "alter_zorder" in t else None)((self.fake / "dispatch.log").read_text()))
        self.assertIn('window.float({ window = "address:0xabc"', log)
        self.assertIn("x = 640, y = 400", log)
        self.assertIn("x = 30, y = 40", log)
        self.assertEqual(log.count("window.pin"), 1)

        # The owner drags and resizes it: remembered within a couple of seconds.
        c = json.loads((self.fake / "clients.json").read_text())
        self.assertTrue(c[0]["floating"] and c[0]["pinned"])
        c[0].update({"at": [300, 200], "size": [820, 610]})
        (self.fake / "clients.json").write_text(json.dumps(c))
        self.wait(lambda: json.loads((self.data / "crew-popout.json").read_text())["helper-build"]
                  == {"w": 820, "h": 610, "x": 300, "y": 200, "pinned": True})

        # Opening it again brings the open one up instead of a second window.
        r = owner(self.env, self.data, "popout", "Helper#build")
        self.assertEqual(r.stdout.strip(), "focused helper-build")
        self.assertIn('hl.dsp.focus({ window = "address:0xabc" })', (self.fake / "dispatch.log").read_text())

        # The bar's Pin: unpin, remembered.
        r = owner(self.env, self.data, "popout", "pin", "helper-build")
        self.assertEqual(r.stdout.strip(), "unpinned", r.stderr)
        self.assertFalse(json.loads((self.data / "crew-popout.json").read_text())["helper-build"]["pinned"])

        # Close: the window's process ends, the runtime home goes, the memory stays. hc was never told to end anything.
        r = owner(self.env, self.data, "popout", "close", "helper-build")
        self.assertEqual(r.stdout.strip(), "closed")
        self.wait(lambda: not home.exists(), secs=8)
        self.assertFalse((self.root / "run" / "pals-popout" / "helper-build.json").exists())
        self.assertEqual(json.loads((self.data / "crew-popout.json").read_text())["helper-build"]["w"], 820)
        self.assertFalse((self.data / "typed.log").exists())

    def test_without_hyprland_the_window_still_opens(self):
        env = {k: v for k, v in self.env.items() if k != "HYPRLAND_INSTANCE_SIGNATURE"}
        (self.root / "shims" / "hyprctl").unlink()
        r = owner(env, self.data, "popout", "Helper#build")
        self.assertEqual(r.stdout.strip(), "opened helper-build", r.stderr)
        self.wait(lambda: (self.fake / "launched").exists())
        r = owner(env, self.data, "popout", "pin", "helper-build")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("window manager", r.stderr)

    def test_an_unknown_pal_is_refused_by_name(self):
        r = owner(self.env, self.data, "popout", "Nobody#x")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("no pal called", r.stderr)
        self.assertFalse((self.fake / "launched").exists())

if __name__ == "__main__":
    unittest.main()
