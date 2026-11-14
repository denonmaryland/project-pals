"""T207: a detached pal remains a pal when only its systemd cgroup identifies it.

Exercise real helper verification with synthetic credentials and a fake /proc tree. No native
detach, real helper key, or live agent is involved.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_helpers import Base, helper
from test_desk import py


class HelperScope(Base):
    def setUp(self):
        super().setUp()
        self.env["PAL_HELPER_PLAIN_KEYS"] = "1"
        self.on()
        self.proc = self.root / "proc"
        self.caller = self.proc / "500"
        self.caller.mkdir(parents=True)
        self.caller.joinpath("stat").write_text("500 (orphan) S 1 500 500 0")
        self.caller.joinpath("environ").write_bytes(b"PATH=/bin\0")

    def check(self, cgroup, env=None):
        self.caller.joinpath("cgroup").write_text(cgroup)
        pre = ("real_inside = crewhelpers.inside_herdr\n"
               f"crewhelpers.inside_herdr = lambda: real_inside(proc={str(self.proc)!r}, pid=500, env={env or {}!r})")
        return helper(self.env, "helpers", "check", outside=False, pre=pre)

    def assert_refused(self, result):
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("helper keys aren't for pals", result.stdout + result.stderr)

    def test_detached_generated_pal_scopes_cannot_verify_as_a_helper(self):
        units = py(self.env, "import crewmem\nprint(json.dumps([crewmem.unit_name(p, t, now=1760000000) "
                   "for p, t in [('Worker', 'build'), ('Docs', None), ('✨ Project Pals - Herdr Mod', '#Memory'), ('a' * 23 + '-b', None)]]))")
        units.append("pal-worker-build-synthetic")  # T199's adjudicated orphan fixture
        for unit in units:
            with self.subTest(unit=unit):
                self.assert_refused(self.check(f"0::/user.slice/user-1000.slice/user@1000.service/app.slice/{unit}.scope\n"))

    def test_nested_and_legacy_cgroups_still_identify_a_pal(self):
        for group in ("0::/user.slice/app.slice/hc-hold-synthetic.service\n",
                      "0::/user.slice/app.slice/pal-worker-build-x.scope/child\n",
                      "5:memory:/user.slice/app.slice/pal-worker-x.scope\n0::/outside.scope\n"):
            with self.subTest(group=group):
                self.assert_refused(self.check(group))

    def test_outside_helpers_and_similarly_named_units_are_not_refused(self):
        for group in ("", "helper-chat.scope", "not-pal-worker-build-x.scope",
                      "pal-worker-build-x.scope-backup", "pal-worker-build-x.service",
                      "pal-worker.scope", "pal-worker-.scope", "pal--x.scope"):
            with self.subTest(group=group):
                result = self.check(f"0::/user.slice/app.slice/{group}\n")
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_environment_and_parent_checks_still_refuse_a_pal(self):
        self.assert_refused(self.check("0::/outside.scope\n", {"HC_TERMINAL_ID": "tW"}))
        parent = self.proc / "450"
        parent.mkdir()
        parent.joinpath("stat").write_text("450 (parent) S 1 450 450 0")
        parent.joinpath("environ").write_bytes(b"PATH=/bin\0HC_TERMINAL_ID=tW\0")
        self.caller.joinpath("stat").write_text("500 (child) S 450 500 500 0")
        self.assert_refused(self.check("0::/outside.scope\n"))


if __name__ == "__main__":
    unittest.main()
