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
# A fake hc first on PATH (N1): deciding an approval types a note into the pal's terminal, and that
# must never reach a live Herdr session, nor fail where there's no hc. It logs what it was asked.
SHIMS = Path(TMP) / "shims"
SHIMS.mkdir()
(SHIMS / "hc").write_text(f'#!/bin/sh\necho "$@" >> "{TMP}/hc.log"\nexit 0\n')
(SHIMS / "hc").chmod(0o755)
os.environ["PATH"] = f"{SHIMS}:{os.environ.get('PATH', '/usr/bin:/bin')}"
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


class EditorWrites(unittest.TestCase):
    """The H3 leftover (docs/v1/readiness.md B1): editors that write in place, from a command line.
    Matched on the command as run (its words), never on text that only mentions one (T26)."""
    HELD = [
        "ed AGENTS.md <<< $'a\\nnew\\n.\\nw\\nq'",             # the review's own two examples
        "vim -c wq AGENTS.md",
        "ed -s AGENTS.md <<'EOF'\na\nx\n.\nw\nq\nEOF",         # a heredoc of ed commands
        "ed -s notes.txt <<'EOF'\nw AGENTS.md\nq\nEOF",        # ... that writes another file
        "ed -s notes.txt <<< 'w CLAUDE.md'",
        "printf 'w AGENTS.md\\nq\\n' | ed -s notes.txt",      # commands piped in
        "ex -sc wq CLAUDE.md",
        "nvim -es +wq docs/CLAUDE.md",
        "vim -c 'w AGENTS.md' -c q notes.txt",                 # the write is in -c's text
        "vim '+w AGENTS.md|q' notes.txt",
        "vim -es notes.txt <<'X'\nsav AGENTS.md\nX",
        "nano AGENTS.md",
        "emacs --batch notes.md --eval '(write-file \"AGENTS.md\")'",
        "nice -n 5 vim -c wq AGENTS.md",                       # behind wrappers and paths
        "sudo -u me vim -c wq AGENTS.md",
        "/usr/bin/vim -c wq AGENTS.md",
        "cd x && vim -c wq AGENTS.md",
        "bash -c 'ex -sc wq AGENTS.md'",
        "sed -n 'w AGENTS.md' notes.txt",                      # sed's own w command
        "sed 's/a/b/w CLAUDE.md' notes.txt",
    ]
    ALLOWED = [
        "grep -n 'vim -c wq AGENTS.md' notes.md",              # text that names an editor isn't one
        'echo "ed AGENTS.md" > notes.txt',
        "git commit -m 'vim -c wq AGENTS.md'",
        "cat <<'EOF' > notes.md\nvim -c wq AGENTS.md\nEOF",
        "printf 'w AGENTS.md' > notes.txt",
        "vim -c wq notes.txt",                                 # editing other files
        "ed -s notes.txt <<< 'w'",
        "ed -s notes.txt <<'EOF'\n,s/a/b/\nw\nq\nEOF",
        "nvim --headless '+Lazy! sync' +qa",
        "vim --version",
        "command -v vim",
        "man ed",
        "EDITOR=vim git commit",
        "cat AGENTS.md | less",
        "sed 's/wiki/w/' AGENTS.md > /tmp/out",
    ]

    def test_held(self):
        for c in self.HELD:
            with self.subTest(c=c):
                self.assertEqual(rule(c), "agents-file-shell")

    def test_allowed(self):
        for c in self.ALLOWED:
            with self.subTest(c=c):
                self.assertIsNone(rule(c))

    def test_sourced_script(self):
        script = Path(TMP) / "edit.vim"
        script.write_text("w AGENTS.md\nq\n")
        self.assertEqual(rule(f"vim -S {script} notes.txt"), "agents-file-shell")
        self.assertEqual(rule(f"ed -s notes.txt < {script}"), "agents-file-shell")
        script.write_text("w\nq\n")
        self.assertIsNone(rule(f"vim -S {script} notes.txt"))


class InterpreterWrites(unittest.TestCase):
    """Writes to AGENTS.md / CLAUDE.md from an interpreter (2026-11-08: two such edits got past the shell
    parse). Held: -c / -e code, a heredoc fed to it, a script written and run in one line, a script
    handed an agent file, and a script file that writes one."""
    HELD = [
        # python -c
        """python3 -c "open('AGENTS.md','w').write('x')" """,
        """python -c 'from pathlib import Path; Path("docs/CLAUDE.md").write_text("x")'""",
        # a heredoc fed to the interpreter
        "python3 - <<'EOF'\np='AGENTS.md'; s=open(p).read()\nopen(p,'w').write(s+'x')\nEOF",
        "python3 <<EOF\nimport shutil\nshutil.copy('new.md', 'CLAUDE.md')\nEOF",
        "cd /repo && python3 - <<'PY'\nimport os\nos.replace('tmp.md', \"AGENTS.md\")\nPY",
        # node, perl, ruby, php
        """node -e "require('fs').writeFileSync('AGENTS.md', 'x')" """,
        """node <<'EOF'\nconst fs = require('fs'); fs.appendFileSync("CLAUDE.md", "x")\nEOF""",
        """perl -e 'open(my $f, ">", "AGENTS.md"); print $f "x"'""",
        """ruby -e 'File.write("AGENTS.md", "x")'""",
        """php -r 'file_put_contents("CLAUDE.md", "x");'""",
        # through a runner, and in sh -c
        """uv run python -c "open('AGENTS.md','w').write('x')" """,
        """bash -c "python3 -c \\"open('AGENTS.md','w').write('x')\\"" """,
        # a script written and run in one line
        "cat > /tmp/fix.py <<'EOF'\nopen('AGENTS.md','w').write('x')\nEOF\npython3 /tmp/fix.py",
        # a script handed an agent file (it can't be seen what it does there)
        "python3 tools/fix.py AGENTS.md",
        "node scripts/edit.mjs ./docs/CLAUDE.md",
        "ruby rewrite.rb 'My Project/AGENTS.md'",
    ]
    ALLOWED = [
        "python3 -c \"print(open('AGENTS.md').read())\"",                      # reading it
        "cat AGENTS.md | python3 -c 'import sys; print(len(sys.stdin.read()))'",
        "python3 - <<'EOF'\np='RECIPE.md'; s=open(p).read()\ns=s.replace('x', 'see AGENTS.md for the layout')\nopen(p,'w').write(s)\nEOF",  # prose
        "python3 -c \"print(open('AGENTS.md').read().replace('a', 'b'))\"",    # str.replace isn't a write
        "python3 - <<'EOF'\np='RECIPE.md'; s=open(p).read()\ns+='- read `AGENTS.md` first'\nopen(p,'w').write(s)\nEOF",  # Markdown code quotes
        "python3 -m unittest discover -s tests",
        "node tests/test_needs.mjs",
        "echo 'AGENTS.md' > notes.txt",                                       # no interpreter (the shell rule's job)
        "grep -n AGENTS.md README.md",
    ]

    def test_held(self):
        for cmd in self.HELD:
            self.assertEqual(rule(cmd), "agents-file-interpreter", cmd)

    def test_allowed(self):
        for cmd in self.ALLOWED:
            self.assertIsNone(rule(cmd), cmd)

    # Quoted text inside the code isn't code: N4 (a-2bb994, a probe whose test cases quote writes),
    # a-27dc50 (Markdown in triple quotes quoting `vim -c 'w AGENTS.md'`) and a-247eb6 (an edit script
    # whose replacement strings quote this file's own code). Each one, as it was run.
    QUOTED_TEXT = [
        "cd next/bin; env -i HOME=/tmp/h PATH=/usr/bin:/bin python3 - <<'PY'\nimport crewguard as g\n"
        "cases = [\"cat <<'EOF' > AGENTS.md\\nnew rules\\nEOF\", 'printf x > \"My Project/AGENTS.md\"', "
        "\"python3 -c \\\"open('AGENTS.md','w').write('x')\\\"\", \"cat AGENTS.md\", \"vim -c wq AGENTS.md\"]\n"
        "for c in cases:\n    m = g.matches(c)\n    print(repr(c)[:60].ljust(62), (m or {}).get(\"name\") if isinstance(m, dict) else m)\nPY",
        "python3 - <<'PY'\nfrom pathlib import Path\np = Path(\"RECIPE.md\"); s = p.read_text()\nreps = [\n"
        "(\"\"\"  version 7. Anything cleverer (a script, python) isn't caught.\"\"\",\n"
        "\"\"\"  version 7. Terminal editors too: every file their own commands name (`vim -c 'w AGENTS.md'`, `+cmd`,\n"
        "  sed's `w`). Interpreters have their own rule; anything cleverer isn't caught.\"\"\"),\n]\n"
        "for a, b in reps:\n    assert a in s, a[:40]; s = s.replace(a, b)\np.write_text(s)\nPY\ngit diff --stat",
        "python3 - <<'PY'\nfrom pathlib import Path\np = Path(\"bin/crewguard.py\"); s = p.read_text()\n"
        "s = s.replace('''HELD = [''', '''HELD = [\n    \"\"\"python3 -c \"open('AGENTS.md','w').write('x')\" \"\"\",\n"
        "    \"subprocess.run(['python3', '-c', \\\"open('CLAUDE.md','w')\\\"])\",''')\np.write_text(s)\nPY",
    ]
    STILL_HELD = [
        # a string that is code: the script runs it
        "python3 - <<'PY'\nimport subprocess\nsubprocess.run(['python3', '-c', \"open('AGENTS.md','w').write('x')\"])\nPY",
        # a triple-quoted text written to the agent file itself
        "python3 - <<'PY'\nfrom pathlib import Path\nPath('AGENTS.md').write_text('''# Rules\n- don't 'w AGENTS.md'\n''')\nPY",
        "python3 - <<'PY'\np = \"\"\"CLAUDE.md\"\"\"\nopen(p, 'w').write('x')\nPY",
        # a script written and run in one go: the shell line around the code, judged as before
        "cat > /tmp/fix.py <<'EOF'\nopen('AGENTS.md','w').write('x')\nEOF\npython3 /tmp/fix.py",
    ]

    def test_quoted_text_is_not_code(self):
        for cmd in self.QUOTED_TEXT:
            self.assertIsNone(rule(cmd), cmd)
        for cmd in self.STILL_HELD:
            self.assertEqual(rule(cmd), "agents-file-interpreter", cmd)

    def test_a_script_file_that_writes_one(self):
        d = Path(tempfile.mkdtemp(prefix="pals-guard-"))
        (d / "fix.py").write_text("from pathlib import Path\nPath('AGENTS.md').write_text('new rules')\n")
        (d / "lint.py").write_text("print(open('AGENTS.md').read().count('#'))\n")
        self.assertEqual(rule(f"python3 {d}/fix.py"), "agents-file-interpreter")
        self.assertIsNone(rule(f"python3 {d}/lint.py"))


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
        self.assertIn("send t1 [pal]", (Path(TMP) / "hc.log").read_text())   # the note went to the fake hc
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
        env = {**os.environ, "HOME": TMP, "CREW_DATA": TMP, "HERDR_APP_HOME": TMP, **(env_extra or {})}
        env.pop("HC_TERMINAL_ID", None)
        env.update(env_extra or {})
        bindir = Path(__file__).resolve().parent.parent / "bin"
        lib = Path(TMP) / ".local" / "lib"
        lib.mkdir(parents=True, exist_ok=True)
        if not (lib / "herdr-crew").exists():
            (lib / "herdr-crew").symlink_to(bindir)
        return subprocess.run([sys.executable, str(bindir / "crew"), *args], capture_output=True, text=True,
                              env=env, stdin=subprocess.DEVNULL)

    def test_a_terminal_typing_yes_is_not_the_owner(self):
        # The re-check's case: a pseudo-terminal with no terminal ID answering "yes" (review H1).
        import pty, subprocess
        bindir = Path(__file__).resolve().parent.parent / "bin"
        env = {**os.environ, "HOME": TMP, "CREW_DATA": TMP, "HERDR_APP_HOME": TMP}
        env.pop("HC_TERMINAL_ID", None)
        lib = Path(TMP) / ".local" / "lib"
        lib.mkdir(parents=True, exist_ok=True)
        if not (lib / "herdr-crew").exists():
            (lib / "herdr-crew").symlink_to(bindir)
        master, slave = pty.openpty()
        p = subprocess.Popen([sys.executable, str(bindir / "crew"), "approve", "a-123456"], stdin=slave, stdout=slave, stderr=slave, env=env)
        os.close(slave)
        os.write(master, b"yes\n")
        p.wait(timeout=20)
        out = b""
        try:
            while True:
                chunk = os.read(master, 4096)
                if not chunk:
                    break
                out += chunk
        except OSError:
            pass
        os.close(master)
        self.assertNotEqual(p.returncode, 0)
        self.assertIn(b"only", out)

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
        self.assertEqual(rule("cp t.json ~/.config/herdr-app/data/crew-clicks/"), "owner-click")
        self.assertEqual(rule("tee data/crew-clicks/x.json < t"), "owner-click")
        self.assertEqual(rule("edit /home/x/.config/herdr-app/data/crew-clicks/a.json"), "owner-click")

    def test_mentioning_clicks_isnt_held(self):
        # A false positive seen live (2026-11-08): a memory note naming the folder was held.
        self.assertIsNone(rule('pal remember "owner decisions need click tokens (data/crew-clicks)"'))
        self.assertIsNone(rule("grep -r crew-clicks bin/"))
        self.assertIsNone(rule("ls ~/.config/herdr-app/data/crew-clicks"))


if __name__ == "__main__":
    unittest.main()
