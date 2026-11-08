"""The approval gate's AGENTS.md / CLAUDE.md rules (Codex review H2, H3) and the owner gate (H1).
Run: python3 -m unittest discover -s tests   (uses a throwaway CREW_DATA; touches nothing real)."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

TMP = tempfile.mkdtemp(prefix="pals-test-")
os.environ["CREW_DATA"] = TMP
os.environ["HERDR_APP_HOME"] = TMP
os.environ.pop("HC_TERMINAL_ID", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))

import crewguard  # noqa: E402


def rule(cmd):
    r = crewguard.matches(cmd)
    return r["name"] if r else None


class ShellWrites(unittest.TestCase):
    HELD = [
        "cat <<'EOF' > AGENTS.md\nnew rules\nEOF",          # review H3: heredoc, redirect after it
        "cat > AGENTS.md <<'EOF'\nnew rules\nEOF",          # and before it
        "cat <<EOF >> CLAUDE.md\nmore\nEOF",
        'printf x > "My Project/AGENTS.md"',                # quoted path with a space
        "printf x >'My Project/CLAUDE.md'",
        'tee "My Project/AGENTS.md"',
        "echo hi | tee -a AGENTS.md",
        "echo x > ./AGENTS.md",
        "echo x 2> AGENTS.md",
        "sed -i 's/a/b/' AGENTS.md",
        "sed -i.bak -e 's/a/b/' docs/../CLAUDE.md",
        "perl -pi -e 's/a/b/' AGENTS.md",
        "cp /tmp/new.md AGENTS.md",
        "mv draft.md 'Some Dir/CLAUDE.md'",
        "install -m 644 x.md AGENTS.md",
        "dd if=/tmp/x of=AGENTS.md",
        "bash -c 'echo x > AGENTS.md'",
        "cd proj && cat <<'X' > AGENTS.md\nbody\nX",
        "FOO=1 tee AGENTS.md < /tmp/x",
    ]
    ALLOWED = [
        "cat AGENTS.md",
        "grep foo AGENTS.md > /tmp/out",
        "git add AGENTS.md CLAUDE.md",
        "cp AGENTS.md /tmp/backup.md",
        "diff AGENTS.md CLAUDE.md",
        "echo AGENTS.md > notes.txt",
        "cat <<'EOF' > notes.md\nwrite AGENTS.md later\nEOF",
        "sed -n 1,20p AGENTS.md",
        "echo x > CLAUDE.md.bak",
        "less MY-AGENTS.md",
    ]

    def test_held(self):
        for c in self.HELD:
            with self.subTest(c=c):
                self.assertEqual(rule(c), "agents-file-shell")

    def test_allowed(self):
        for c in self.ALLOWED:
            with self.subTest(c=c):
                self.assertIsNone(rule(c))

    def test_heredoc_body_isnt_a_command(self):
        self.assertIsNone(rule("cat <<'EOF' > notes.md\ngit push origin main\nEOF"))
        self.assertEqual(rule("cat <<'EOF' > notes.md\nhi\nEOF\ngit push"), "push")


class EditApprovals(unittest.TestCase):
    """Review H2: an approval is for one exact edit of one file version."""

    def setUp(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))
        import importlib.util
        spec = importlib.util.spec_from_file_location("crewhook", Path(__file__).resolve().parent.parent / "bin" / "crew-hook")
        from importlib.machinery import SourceFileLoader
        loader = SourceFileLoader("crewhook", str(Path(__file__).resolve().parent.parent / "bin" / "crew-hook")); self.hook = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewhook", loader)); loader.exec_module(self.hook)
        self.dir = Path(tempfile.mkdtemp(prefix="pals-edit-"))
        self.path = self.dir / "AGENTS.md"
        self.path.write_text("# Rules\n- one\n")

    def approve(self, cmd, extra):
        r = crewguard.check("t1", "Pal", "ch", cmd, extra)
        self.assertIsNotNone(r)
        crewguard.decide(r["id"], True, via="test")
        return r

    def test_changed_payload_is_a_new_request(self):
        cmd, extra = self.hook.edit_request("Write", {"file_path": str(self.path), "content": "# Rules\n- safe\n"}, str(self.path))
        self.assertEqual(rule(cmd), "agents-file")
        self.assertIn("+- safe", extra["diff"])
        self.approve(cmd, extra)
        other, _ = self.hook.edit_request("Write", {"file_path": str(self.path), "content": "# Rules\n- something else\n"}, str(self.path))
        self.assertNotEqual(cmd, other)
        self.assertIsNotNone(crewguard.check("t1", "Pal", "ch", other, {}))   # held: not covered by the approval
        self.assertIsNone(crewguard.check("t1", "Pal", "ch", cmd, {}))         # the approved one goes through once
        self.assertIsNotNone(crewguard.check("t1", "Pal", "ch", cmd, {}))      # and only once

    def test_changed_base_is_a_new_request(self):
        inp = {"file_path": str(self.path), "old_string": "- one", "new_string": "- two"}
        cmd, extra = self.hook.edit_request("Edit", inp, str(self.path))
        self.assertIn("-- one", extra["diff"])
        self.assertIn("+- two", extra["diff"])
        self.path.write_text("# Rules\n- one\n- added meanwhile\n")
        cmd2, _ = self.hook.edit_request("Edit", inp, str(self.path))
        self.assertNotEqual(cmd, cmd2)


class OwnerGate(unittest.TestCase):
    """Review H1: no click token and no terminal: refused, even with no terminal ID at all."""

    def run_crew(self, *args, env_extra=None):
        import subprocess
        env = {**os.environ, "HOME": TMP, **(env_extra or {})}
        bindir = Path(__file__).resolve().parent.parent / "bin"
        lib = Path(TMP) / ".local" / "lib"
        lib.mkdir(parents=True, exist_ok=True)
        if not (lib / "herdr-crew").exists():
            (lib / "herdr-crew").symlink_to(bindir)
        return subprocess.run([sys.executable, str(bindir / "crew"), *args], capture_output=True, text=True,
                              env=env, stdin=subprocess.DEVNULL)

    def test_no_identity_is_not_the_owner(self):
        for env in ({}, {"HC_TERMINAL_ID": "t-unknown-123"}):
            with self.subTest(env=env):
                r = self.run_crew("approve", "a-123456", env_extra=env)
                self.assertNotEqual(r.returncode, 0)
                self.assertIn("only", (r.stderr + r.stdout))

    def test_click_token(self):
        import crewlib
        crewlib.CLICKS.mkdir(parents=True, exist_ok=True)
        good = "a" * 32
        (crewlib.CLICKS / f"{good}.json").write_text(json.dumps({"args": ["deny", "a-nothere", "--inbox"], "at": crewlib.now_ms()}))
        r = self.run_crew("deny", "a-nothere", "--inbox", "--click", good)
        self.assertNotIn("only ", r.stderr + r.stdout)        # passed the gate (then: no such request)
        self.assertFalse((crewlib.CLICKS / f"{good}.json").exists())   # used up
        wrong = "b" * 32
        (crewlib.CLICKS / f"{wrong}.json").write_text(json.dumps({"args": ["deny", "a-other", "--inbox"], "at": crewlib.now_ms()}))
        r = self.run_crew("approve", "a-nothere", "--inbox", "--click", wrong)
        self.assertIn("expired or was for something else", r.stderr + r.stdout)
        old = "c" * 32
        (crewlib.CLICKS / f"{old}.json").write_text(json.dumps({"args": ["approve", "a-x"], "at": crewlib.now_ms() - 10 * 60 * 1000}))
        r = self.run_crew("approve", "a-x", "--click", old)
        self.assertIn("expired or was for something else", r.stderr + r.stdout)

    def test_forging_a_click_is_held(self):
        self.assertEqual(rule("echo '{}' > ~/.config/herdr-app/data/crew-clicks/abc.json"), "owner-click")


if __name__ == "__main__":
    unittest.main()
