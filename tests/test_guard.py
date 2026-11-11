"""The approval gate's AGENTS.md / CLAUDE.md rules (Codex review H2, H3) and the owner gate (H1).
Run: python3 -m unittest discover -s tests   (uses a throwaway CREW_DATA; touches nothing real)."""
import json
import os
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

TMP = pals_tmp.mkdtemp(prefix="pals-test-")
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
        d = Path(pals_tmp.mkdtemp(prefix="pals-guard-"))
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
        self.dir = Path(pals_tmp.mkdtemp(prefix="pals-edit-"))
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


class HelperKeys(unittest.TestCase):
    """T116: a trusted helper's key lets one of the owner's own assistants send normal work in the
    owner's name. A pal doesn't read, copy or write the keys, doesn't write the list of who's
    trusted, and doesn't present itself as a helper. (The Claude Code mod refuses Read / Grep / Glob
    there; `pal` refuses a key from inside a Herdr terminal. This holds the shell and the edit tools.)"""
    K = "~/.config/project-pals/helpers"

    HELD = [
        # reading a key is already the leak
        f"cat {K}/pals.key",
        'cat "$HOME/.config/project-pals/helpers/pals.key"',
        f"ls -la {K}",
        f"grep -r palkey {K}/",
        f"cp {K}/pals.key /tmp/k",
        # the folder above the keys: a recursive search walks into them (T122)
        "rg -n . ~/.config/project-pals",
        "grep -r palkey \"$HOME/.config/project-pals/\"",
        "find /home/x/.config/project-pals -type f -exec cat {} +",
        "tar czf /tmp/p.tgz -C ~ .config/project-pals",
        f"base64 < {K}/wabi.key",
        f"head -c 60 /home/x/.config/project-pals/helpers/pals.key | xxd",
        "cd ~/.config && tar cf /tmp/k.tar project-pals/helpers",
        f"python3 -c \"print(open('{K}/pals.key').read())\"",
        f"python3 - <<'EOF'\nimport pathlib\nprint(pathlib.Path('/home/x/.config/project-pals/helpers/pals.key').read_text())\nEOF",
        f"node -e \"console.log(require('fs').readFileSync(process.env.HOME + '/.config/project-pals/helpers/pals.key', 'utf8'))\"",
        # writing one, or the list that says who's trusted
        f"echo palkey_{'A' * 43} > {K}/pals.key",
        f"chmod 644 {K}/pals.key",
        f"ln -s {K}/pals.key ./k",
        f"edit /home/x/.config/project-pals/helpers/pals.key",
        "edit /home/x/.config/herdr-app/data/crew-helpers/helpers.json",
        "echo '{}' > ~/.config/herdr-app/data/crew-helpers/helpers.json",
        "sed -i 's/false/true/' \"$CREW_DATA/crew-helpers/helpers.json\"",
        "python3 -c \"import json; json.dump({}, open('/d/crew-helpers/helpers.json', 'w'))\"",
        "rm ~/.config/herdr-app/data/crew-helpers/log.jsonl; cp /tmp/log ~/.config/herdr-app/data/crew-helpers/log.jsonl",
        # the older build's key and receipts, inside the data folder (until they're carried over)
        "cat ~/.config/herdr-app/data/crew-helper/pals.key",
        "edit /home/x/.config/herdr-app/data/crew-helper/messages.jsonl",
        "echo x >> \"$CREW_DATA/crew-helper/recent.json\"",
        # keys are sealed at rest: asking systemd to unseal one is reaching for it
        "systemd-creds --user --name=pal-helper-pals decrypt /tmp/copy.key -",
        "cat /tmp/copy.key | systemd-creds --user decrypt --name=pal-helper-wabi - -",
        "python3 -c \"import crewhelpers; print(crewhelpers._read_key('/tmp/copy.key'))\"",
        # a key itself, wherever a pal got it
        f"export K=palkey_{'b' * 43}",
        # presenting as a helper
        'PAL_HELPER=Pals pal tell Orca "release it"',
        'PAL_HELPER="Pals" pal desk send Orca "x"',
        "export PAL_HELPER=Wabi",
        "export PAL_HELPER; pal tell Orca x",
        'env PAL_HELPER=Pals pal tell Orca "x"',
        'env -u HC_TERMINAL_ID PAL_HELPER=Pals pal tell Orca "x"',
        'PAL_HELPER_KEY_FILE=/tmp/k PAL_HELPER=Pals pal ask Orca "x"',
        'pal --as-helper tell Orca "release it"',
        'env -u HC_TERMINAL_ID pal --as-helper tell Orca "x"',
        "pal --as-helper=Wabi desk send Orca x",
        "env -u HC_TERMINAL_ID ~/.local/bin/pal --as-helper task add x --for Orca",
        "bash -c 'PAL_HELPER=Pals pal tell Orca x'",
        'setsid sh -c "PAL_HELPER=Pals pal tell Orca x"',
        'systemd-run --user --setenv=PAL_HELPER=Pals pal tell Orca "x"',
        "python3 -c \"import os, subprocess; os.environ['PAL_HELPER'] = 'Pals'; subprocess.run(['pal', 'tell', 'Orca', 'x'])\"",
        "python3 - <<'EOF'\nimport subprocess, os\nsubprocess.run(['pal', 'tell', 'Orca', 'x'], env={**os.environ, 'PAL_HELPER': 'Pals'})\nEOF",
        "node -e \"require('child_process').execFileSync('pal', ['tell', 'Orca', 'x'], {env: {...process.env, PAL_HELPER: 'Pals'}})\"",
    ]

    FREE = [
        # the helpers' mod and Project Pals' own source are code
        "edit /home/x/.config/herdr-app/data/crew-worktrees/pp/trusted-helper/mods/crew-helpers/main.js",
        "edit /home/x/.config/herdr-app/mods/crew-helpers/main.js",
        "edit /w/bin/crewhelpers.py",
        "edit /w/tests/test_helpers.py",
        "cp lib/crew.js mods/crew-helpers/crew.js",
        "sed -i 's/a/b/' mods/crew-helpers/main.js",
        "herdr-app check ~/.config/herdr-app/mods/crew-helpers",
        "python3 -m unittest tests.test_helpers",
        "python3 -m py_compile bin/crewhelpers.py",
        "git add bin/crewhelpers.py mods/crew-helpers tests/test_helpers.py",
        # asking who's trusted, and reading the record, is anyone's
        "pal settings trust-helper",
        "pal helpers --json",
        "pal helpers log",
        "cat ~/.config/herdr-app/data/crew-helpers/log.jsonl",
        # talking about it isn't doing it
        "grep -rn 'PAL_HELPER=' bin tests",
        "grep -n -- '--as-helper' bin/crew",
        "pal --help",
        "systemd-creds --user --name=my-app-token decrypt token.cred -",
        "systemd-creds list",
        'grep -n "PAL_HELPER" RECIPE.md',
        "git log --oneline --grep='trusted helper'",
        'git commit -m "Trusted helpers: PAL_HELPER=<name> sends in the owner\'s name"',
        "ls ~/.config/project-pals-old/helpers",
        "rg -n helper ~/Projects/project-pals",
        "cd ~/Projects/project-pals && git status",
        "ls ~/.config/herdr-app/data/crew-worktrees/project-pals-herdr-mod",
        "ls helpers/",
    ]

    def test_held(self):
        for cmd in self.HELD:
            self.assertEqual(rule(cmd), "helper-key", cmd)

    def test_free(self):
        for cmd in self.FREE:
            self.assertIsNone(rule(cmd), cmd)

    def test_changing_who_is_trusted_from_a_pal_is_refused_by_the_command_itself(self):
        """`pal settings trust-helper Pals on` isn't a gated line: the command asks for the owner's click
        (tests/test_helpers.py). Held here would only add a second, weaker lock."""
        self.assertIsNone(rule("pal settings trust-helper Pals on"))

    def test_an_older_policy_gets_the_rule(self):
        old = {**crewguard.DEFAULT, "defaults_version": 13, "guarded": [r for r in crewguard.DEFAULT["guarded"] if r["name"] != "helper-key"]}
        crewguard.save_json(crewguard.POLICY, old)
        try:
            self.assertEqual(rule("PAL_HELPER=Pals pal tell Orca x"), "helper-key")
            self.assertEqual(crewguard.policy()["defaults_version"], crewguard.DEFAULTS_VERSION)
        finally:
            crewguard.POLICY.unlink(missing_ok=True)

    def test_the_live_builds_policy_at_14_gets_the_rule_too(self):
        """Build 7692987 went live on 2026-11-10 with DEFAULTS_VERSION 14 and its own helper-write rule.
        A version of ours that also said 14 would never have reached that install's policy file."""
        self.assertGreater(crewguard.DEFAULTS_VERSION, 14)
        mine = {"name": "my-own", "why": "mine", "pattern": r"^my-tool\b"}
        live = {**crewguard.DEFAULT, "defaults_version": 14,
                "guarded": [r for r in crewguard.DEFAULT["guarded"] if r["name"] != "helper-key"]
                + [{"name": "helper-write", "why": "writes the trusted helper key or message receipts", "check": "helper-writes", "pattern": r"$^"}, mine]}
        crewguard.save_json(crewguard.POLICY, live)
        try:
            self.assertEqual(rule("pal --as-helper tell Orca x"), "helper-key")
            p = crewguard.policy()
            got = [r["name"] for r in p["guarded"]]
            self.assertIn("helper-key", got)
            self.assertNotIn("helper-write", got, "that build's rule is replaced, not kept as one the owner added")
            self.assertIn("my-own", got, "a rule the owner added stays")
            self.assertEqual(rule("my-tool now"), "my-own")
        finally:
            crewguard.POLICY.unlink(missing_ok=True)

    def test_two_branches_with_the_same_number_cant_strand_a_rule_again(self):
        """By name as well as by number: a built-in rule a saved policy has never seen arrives; one the
        owner took out on purpose (it's in the names the file was last brought up to) stays out."""
        names = sorted(r["name"] for r in crewguard.DEFAULT["guarded"])
        same_number = {**crewguard.DEFAULT, "defaults_version": crewguard.DEFAULTS_VERSION, "defaults_names": [n for n in names if n != "helper-key"],
                       "guarded": [r for r in crewguard.DEFAULT["guarded"] if r["name"] != "helper-key"]}
        crewguard.save_json(crewguard.POLICY, same_number)
        try:
            self.assertEqual(rule("PAL_HELPER=Pals pal tell Orca x"), "helper-key")
            self.assertEqual(crewguard.policy()["defaults_names"], names)
            removed = {**crewguard.DEFAULT, "defaults_version": crewguard.DEFAULTS_VERSION, "defaults_names": names,
                       "guarded": [r for r in crewguard.DEFAULT["guarded"] if r["name"] != "post"]}
            crewguard.save_json(crewguard.POLICY, removed)
            self.assertIsNone(rule("gh issue comment 1 --body hi"), "the owner's own removal is respected")
            self.assertNotIn("post", [r["name"] for r in crewguard.policy()["guarded"]])
        finally:
            crewguard.POLICY.unlink(missing_ok=True)


class DeskSourceIsNotDeskCards(unittest.TestCase):
    """T68 (2026-11-09, a-24cc2d, a-867e72): editing the Desk's mods in a worktree
    (mods/crew-desk/main.js) was held as "writes into the Desk's cards". Only the data folder
    (data/crew-desk, or anywhere that resolves into it through a link) is the cards."""
    WT = "/home/x/.config/herdr-app/data/crew-worktrees/pp/t63"

    def test_the_desk_mods_are_code(self):
        for cmd in [
            f"edit {self.WT}/mods/crew-desk/main.js",
            f"edit {self.WT}/mods/crew-desk-drop/main.js",
            "edit /home/x/.config/herdr-app/mods/crew-desk/main.js",
            "sed -i 's/a/b/' mods/crew-desk/main.js",
            "echo x > mods/crew-desk/notes.txt",
            "cp /tmp/main.js mods/crew-desk/main.js",
            f"cp lib/crew.js {self.WT}/mods/crew-desk/crew.js",
            "python3 -c \"open('mods/crew-desk/main.js','w').write('x')\"",
        ]:
            self.assertIsNone(rule(cmd), cmd)

    def test_the_cards_are_still_held(self):
        for cmd in [
            f"edit {Q}/crew-desk/helper/open/a.md",
            "echo x > ~/.config/herdr-app/data/crew-desk/helper/open/a.md",
            "cp t.md data/crew-desk/helper/open/",
            "echo x > $D/crew-desk/helper/open/a.md",                         # a variable we can't expand
            f"python3 -c \"open('{Q}/crew-desk/helper/open/a.md','w').write('x')\"",
            "python3 -c \"open('data/crew-desk/.owner-ledger.jsonl','a').write('x')\"",
            f"edit {self.WT}/mods/crew-desk/../../data/crew-desk/x/open/a.md",   # normalised first
        ]:
            self.assertEqual(rule(cmd), "desk-write", cmd)

    def test_a_link_into_the_cards_is_held(self):
        # crewguard's DATA is this test's CREW_DATA: a mods/ folder that is really a link to the cards.
        real = Path(TMP) / "crew-desk"
        (real / "helper" / "open").mkdir(parents=True, exist_ok=True)
        wt = Path(pals_tmp.mkdtemp(prefix="pals-wt-"))
        (wt / "mods").mkdir()
        (wt / "mods" / "crew-desk").symlink_to(real)
        (wt / "mods" / "notes").symlink_to(real)
        self.assertEqual(rule(f"edit {wt}/mods/crew-desk/helper/open/a.md"), "desk-write")
        self.assertEqual(rule(f"echo x > {wt}/mods/notes/helper/open/a.md"), "desk-write")
        self.assertIsNone(rule(f"echo x > {wt}/mods/other.txt"))

    def test_the_hook_asks_the_same_question_for_edits(self):
        self.assertTrue(crewguard.into_place(f"{Q}/crew-desk/helper/open/a.md", {"crew-desk"}))
        self.assertFalse(crewguard.into_place(f"{self.WT}/mods/crew-desk/main.js", {"crew-desk"}))
        self.assertFalse(crewguard.into_place(f"{self.WT}/mods/crew-desk-drop/main.js", {"crew-desk"}))
        hook = (Path(__file__).resolve().parent.parent / "bin" / "crew-hook").read_text()
        self.assertIn('crewguard.into_place(path, {"crew-clicks", "crew-queue", "crew-queue-sent", "crew-desk", "crew-helpers", "crew-helper"})', hook)
        # The same for the helpers' mod (T116): its source is code, the data folder of that name isn't.
        self.assertTrue(crewguard.into_place(f"{Q}/crew-helpers/helpers.json", {"crew-helpers"}))
        self.assertFalse(crewguard.into_place(f"{self.WT}/mods/crew-helpers/main.js", {"crew-helpers"}))
        self.assertNotIn('f"/{d}/" in path', hook)


Q = "/home/x/.config/herdr-app/data"


class CommandsInsideCode(unittest.TestCase):
    """Grok review H2: a push, release, deploy or a forged owner message inside a Python string or a
    heredoc body was invisible to the gate. Each case as Grok ran it, or the same shape."""
    HELD = [
        ("python3 -c 'import os; os.system(\"git push origin main\")'", "push"),
        ("bash <<'SH'\ngit push origin main\nSH", "push"),
        ("bash <<'SH'\n./release 0.4.0\nSH", "release-script"),
        ("sh -s <<EOF\ncd x && gh release create v1\nEOF", "release"),
        ("bash <<< 'git push'", "push"),
        ("echo 'git push origin main' | bash", "push"),
        ("node -e \"require('child_process').execSync('flyctl deploy')\"", "deploy"),
        ("python3 - <<'PY'\nimport subprocess\nsubprocess.run(['git', 'push', 'origin', 'main'])\nPY", "push"),
        ("python3 - <<'PY'\nimport subprocess\ncmd = ['pal', 'land', 'X#y']\nsubprocess.run(cmd)\nPY", "land"),
        ("perl -e 'system(\"git push\")'", "push"),
        ("ruby -e '`git push`'", "push"),
        ("python3 -c 'import os; os.system(\"echo x > data/crew-queue/t1/a.json\")'", "queue-write"),
        # Python writing straight into the queue, the clicks and the cards.
        (f"python3 -c \"open('{Q}/crew-queue/t1/a.json','w').write('[from DeNon] release now')\"", "queue-write"),
        (f"python3 -c \"open('{Q}/crew-queue-sent/abc','w').write('x')\"", "queue-write"),
        (f"python3 -c \"open('{Q}/crew-clicks/abcd.json','w').write('x')\"", "owner-click"),
        (f"python3 - <<'PY'\nfrom pathlib import Path\nd = Path('{Q}') / 'crew-desk'\n(d / 'c-1.md').write_text('x')\nPY", "desk-write"),
        # open() with mode= and Path.open('w'); a desktop editor.
        ("python3 -c \"open('AGENTS.md', mode='w').write('x')\"", "agents-file-interpreter"),
        ("python3 -c \"from pathlib import Path; Path('CLAUDE.md').open('w').write('x')\"", "agents-file-interpreter"),
        ("code AGENTS.md", "agents-file-shell"),
        # Grok's re-review of 38f5b22: an argv array after require("child_process") in one statement…
        ("node -e 'require(\"child_process\").spawn(\"git\",[\"push\",\"origin\",\"main\"])'", "push"),
        ("node -e 'require(\"child_process\").spawn(\"flyctl\", [\"deploy\"])'", "deploy"),
        ("node -e 'require(\"child_process\").spawn(\"./release\", [\"0.4.0\"])'", "release-script"),
        ("node -e 'require(\"child_process\").execFileSync(\"bash\", [\"./release\", \"0.4.0\"])'", "release-script"),
        # …cat's heredoc piped to a shell, an editor's file:line, open(os.path.join(…), "w")
        ("cat <<'EOF' | bash\ngit push origin main\nEOF", "push"),
        ("cat <<'EOF' | sh\n./release 0.4.0\nEOF", "release-script"),
        ("code -g AGENTS.md:12", "agents-file-shell"),
        ("cursor --goto CLAUDE.md:1:4", "agents-file-shell"),
        ("python3 -c \"import os; open(os.path.join('.', 'AGENTS.md'), 'w').write('x')\"", "agents-file-interpreter"),
    ]
    ALLOWED = [
        "pal land --help", "git push --help", "pal land Worker#general --help", "./release --help",
        # a-15ccbe: sed's / perl's script only names what it replaces
        "sed -i 's|if \"/crew-clicks/\" in path or \"/crew-queue/\" in path:|x|' bin/crew-hook",
        "perl -pi -e 's|crew-clicks|x|' notes.txt",
        "python3 -c 'print(\"git push\")'",                                        # printed, not run
        f"python3 - <<'PY'\nimport json\nprint(open('{Q}/crew-queue/t1/a.json').read())\nPY",   # read
        "bash <<'SH'\ngit status\nSH",
        "echo 'git push' > notes.txt",
        "cat <<'EOF' > notes.md\ngit push origin main\nEOF",                      # written, not run
        "python3 -m unittest discover -s tests",
        "grep -rn crew-desk-settings mods/",
        "code .",
        "cat <<'EOF' | grep push\ngit push origin main\nEOF",                  # piped to grep, not a shell
        "node -e 'require(\"child_process\").spawn(\"git\", [\"status\"])'",
        "python3 -c \"import os; print(open(os.path.join('.', 'AGENTS.md')).read())\"",
    ]

    def test_held(self):
        for cmd, name in self.HELD:
            self.assertEqual(rule(cmd), name, cmd)

    def test_allowed(self):
        for cmd in self.ALLOWED:
            self.assertIsNone(rule(cmd), cmd)

    def test_still_held_with_help_elsewhere(self):
        self.assertEqual(rule("git push --help; git push"), "push")


if __name__ == "__main__":
    unittest.main()


class UninstallRule(unittest.TestCase):
    """T48: uninstalling Project Pals is the owner's. `pal uninstall` checks the click itself; a pal
    running a checkout's install.sh --uninstall is held here. Listing what would go isn't."""
    HELD = ["./install.sh --uninstall", "bash install.sh --uninstall --purge",
            "cd ~/Projects/project-pals && ./install.sh --uninstall",
            "sh /home/x/project-pals/install.sh --purge --uninstall",
            "env HOME=/tmp/x ./install.sh --uninstall",
            # Grok T56: --dry-run in a comment isn't an argument; the shell runs the uninstall.
            "./install.sh --uninstall # --dry-run", "./install.sh --uninstall --purge #--dry-run"]
    ALLOWED = ["./install.sh", "./install.sh --no-helpers", "./install.sh --uninstall --dry-run",
               "./install.sh --dry-run --uninstall", "grep -n uninstall install.sh", "./install.sh --uninstall --help"]

    def test_held(self):
        for cmd in self.HELD:
            self.assertEqual(rule(cmd), "uninstall", cmd)

    def test_allowed(self):
        for cmd in self.ALLOWED:
            self.assertIsNone(rule(cmd), cmd)

    # Grok's T56 re-check, as run: a pty program around it, and code that loads the uninstaller or
    # mints a click through it.
    INDIRECT = [
        "expect -c 'spawn ./install.sh --uninstall; expect \"Type uninstall\"; send \"uninstall\\r\"; expect eof'",
        "script -qc './install.sh --uninstall' /dev/null <<< uninstall",
        "script -qc 'python3 -c \"import crewuninstall as u; u.uninstall()\"' /dev/null",
        "unbuffer ./install.sh --uninstall --purge",
        "python3 -c 'import crewuninstall; crewuninstall.uninstall()'",
        "env -u HC_TERMINAL_ID python3 -c 'import crewuninstall as u; u.uninstall()'",
        "cd bin && python3 -c 'import sys; sys.path.insert(0, \".\"); from crewuninstall import uninstall; uninstall(purge=True)'",
        "python3 -c \"import json,time,crewuninstall as u; (u.CLICKS / ('ab'*16 + '.json')).write_text(json.dumps({'args': ['uninstall'], 'at': time.time()*1000})); u.uninstall(click='ab'*16)\"",
        "python3 - <<'PY'\nimport sys\nsys.path.insert(0, 'bin')\nimport crewuninstall\ncrewuninstall.main(['uninstall'])\nPY",
        "python3 -c 'import pty; pty.spawn([\"./install.sh\", \"--uninstall\"])'",
        "python3 bin/crewuninstall.py uninstall --purge",
        "node -e 'require(\"node-pty\").spawn(\"./install.sh\", [\"--uninstall\"])'",
    ]
    INDIRECT_ALLOWED = [
        "python3 bin/crewuninstall.py uninstall --dry-run", "python3 -m py_compile bin/crewuninstall.py",
        "python3 -m unittest tests.test_uninstall", "grep -n crewuninstall bin/crew", "git add bin/crewuninstall.py",
        "script -qc 'ls -la' /dev/null", "python3 -c 'import pty; print(pty.STDIN_FILENO)'",
    ]

    def test_indirect_held(self):
        for cmd in self.INDIRECT:
            self.assertIn(rule(cmd), ("uninstall", "uninstall-indirect", "owner-click"), cmd)
            self.assertTrue(crewguard.runs_uninstall(cmd) or rule(cmd) == "uninstall", cmd)

    def test_indirect_allowed(self):
        for cmd in self.INDIRECT_ALLOWED:
            self.assertIsNone(rule(cmd), cmd)

    def test_an_older_policy_gets_the_new_rules(self):
        """Grok T56: a policy saved at the version that shipped the old pattern is upgraded."""
        old = {**crewguard.DEFAULT, "defaults_version": 12,
               "guarded": [dict(r, pattern=r"(?!.*--dry-run)(?:(?:ba)?sh\s+)?(?:\S*/)?install\.sh\b.*\s--uninstall\b")
                           if r["name"] == "uninstall" else r for r in crewguard.DEFAULT["guarded"] if r["name"] != "uninstall-indirect"]}
        crewguard.save_json(crewguard.POLICY, old)
        try:
            self.assertEqual(rule("./install.sh --uninstall # --dry-run"), "uninstall")
            self.assertEqual(crewguard.policy()["defaults_version"], crewguard.DEFAULTS_VERSION)
        finally:
            crewguard.POLICY.unlink(missing_ok=True)


class LiveBranch(unittest.TestCase):
    """T90: while the owner's Live channel is on, what lands on the followed branch is installed into
    their running Project Pals at once, so moving that branch by hand needs the click a landing needs.
    With the channel off (Stable, the default) nothing here is held."""
    SETTINGS = Path(TMP) / "crew-settings.json"
    MOVES = [
        "git update-ref refs/heads/main abc1234",
        "git -C ~/Projects/project-pals update-ref -m 'land x' refs/heads/main abc1234 def5678",
        "cd /repo && git update-ref refs/heads/main $(git rev-parse HEAD)",
        "git branch -f main crew/x",
        "git branch --force main HEAD",
        "git -C /repo branch -M main",
        "env GIT_DIR=/r/.git git update-ref refs/heads/main abc1234",
        "bash -c 'git update-ref refs/heads/main abc1234'",
        # The other plain ways (the independent review's list).
        "git fetch . crew/x:main", "git fetch . crew/x:refs/heads/main", "git pull . crew/x:main",   # (git push . x:main is "push" already)
        "git switch -C main crew/x", "git checkout -B main crew/x", "git switch --force-create main",
        "git worktree add -B main ../m crew/x",
        "echo 'update refs/heads/main abc1234' | git update-ref --stdin",
    ]
    FREE = [
        "git update-ref refs/heads/crew/x abc1234", "git branch -f crew/x main", "git branch main-backup main",
        "git branch --list main", "git log main..HEAD", "git rev-parse refs/heads/main", "git merge-base main HEAD",
        "git update-ref --help", "grep -n 'update-ref refs/heads/main' bin/crew", "git commit -m 'update-ref refs/heads/main'",
        "git worktree add -b crew/y ../y main", "git fetch origin main", "git fetch . main:crew/x", "git switch main",
        "git checkout main", "git switch -c crew/z main", "git checkout -b crew/z main", "git pull . main:crew/x",
    ]

    def tearDown(self):
        self.SETTINGS.unlink(missing_ok=True)
        crewguard.HOOK_CWD = None

    def test_held_while_the_channel_is_live(self):
        self.SETTINGS.write_text(json.dumps({"channel": "live", "live_branch": "main"}))
        for cmd in self.MOVES:
            self.assertEqual(rule(cmd), "live-branch", cmd)
        for cmd in self.FREE:
            self.assertIsNone(rule(cmd), cmd)

    def test_the_followed_branch_is_the_one_held(self):
        self.SETTINGS.write_text(json.dumps({"channel": "live", "live_branch": "release"}))
        self.assertEqual(rule("git update-ref refs/heads/release abc1234"), "live-branch")
        self.assertIsNone(rule("git update-ref refs/heads/main abc1234"))

    def test_nothing_is_held_on_stable(self):
        for settings in (None, {"channel": "stable"}, {"owner": "Sam"}):
            if settings is None:
                self.SETTINGS.unlink(missing_ok=True)
            else:
                self.SETTINGS.write_text(json.dumps(settings))
            for cmd in self.MOVES:
                self.assertIsNone(rule(cmd), cmd)

    def test_a_commit_in_a_checkout_of_the_followed_branch(self):
        """commit / merge / reset … move whatever branch is checked out where they run: held when
        that's the followed branch of the followed checkout, free on a topic's branch or elsewhere."""
        import subprocess
        t = Path(tempfile.mkdtemp(prefix="pals-livebranch-"))
        env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null", "GIT_AUTHOR_NAME": "Sam",
               "GIT_AUTHOR_EMAIL": "s@example.invalid", "GIT_COMMITTER_NAME": "Sam", "GIT_COMMITTER_EMAIL": "s@example.invalid"}
        git = lambda *a, at=None: subprocess.run(["git", "-C", str(at or t / "repo"), *a], env=env, check=True, capture_output=True)
        (t / "repo" / "sub").mkdir(parents=True)
        git("init", "-q", "-b", "main")
        git("commit", "-q", "--allow-empty", "-m", "one")
        git("worktree", "add", "-q", "-b", "crew/x", str(t / "wt"), "main")
        (t / "other").mkdir()
        git("init", "-q", "-b", "main", at=t / "other")
        self.SETTINGS.write_text(json.dumps({"channel": "live", "live_branch": "main", "live_repo": str(t / "repo")}))
        moves = ("git commit -am x", "git merge crew/x", "git reset --hard HEAD~1", "git cherry-pick abc1234", "git pull . crew/x", "git rebase crew/x")
        crewguard.HOOK_CWD = str(t / "repo" / "sub")
        for cmd in moves:
            self.assertEqual(rule(cmd), "live-branch", cmd)
        for cmd in ("git status", "git log -3", "git diff", "git add -A", "git stash list"):
            self.assertIsNone(rule(cmd), cmd)
        crewguard.HOOK_CWD = str(t / "wt")           # a topic's worktree: its own branch
        for cmd in moves:
            self.assertIsNone(rule(cmd), cmd)
        self.assertEqual(rule(f"git -C {t / 'repo'} commit -am x"), "live-branch", "git -C names the folder")
        self.assertEqual(rule(f"cd {t / 'repo'} && git merge crew/x"), "live-branch", "and so does a cd before it")
        self.assertEqual(rule("cd ../repo && git commit -m x"), "live-branch", "a relative cd, from the hook's folder")
        crewguard.HOOK_CWD = str(t / "other")        # another project that happens to be on main
        for cmd in moves:
            self.assertIsNone(rule(cmd), cmd)
        crewguard.HOOK_CWD = None                    # no folder known: nothing to go on
        self.assertIsNone(rule("git commit -am x"))


class LiveBranchRefs(unittest.TestCase):
    """Codex T94, P1: `git branch -M feature main` moved the followed main past the gate (only the
    first name of a `git branch` was looked at). Reading a command line isn't proof, so this runs
    each one in a disposable repository and looks at the ref: with the Live channel on, a command
    that really moves or removes the followed branch must be held, whatever its spelling. The repo
    is the usual one: the project folder parked on another branch, a topic's worktree on crew/x;
    layout "m" adds a worktree that has main checked out."""
    SETTINGS = Path(TMP) / "crew-settings.json"
    # (layout, where it runs, the command). {repo} {wt} {m} are folders, {feature} a commit.
    MOVERS = [
        # git branch: rename and copy move the DESTINATION (the last name), forced or not
        ("", "wt", "git branch -M feature main"),
        ("", "wt", "git branch -C feature main"),
        ("", "wt", "git branch --move --force feature main"),
        ("", "wt", "git branch --copy --force feature main"),
        ("", "wt", "git branch -f main feature"),
        ("", "wt", "git branch --force main crew/x"),
        ("", "wt", "git -C {repo} branch -M feature main"),
        # taking it away, and then making it again somewhere else (no force needed by then)
        ("", "wt", "git branch -D main"),
        ("", "wt", "git branch -d main"),
        ("", "wt", "git branch --delete --force main"),
        ("", "wt", "git branch -m main old"),
        ("", "wt", "git branch -D main && git branch main feature"),
        ("", "wt", "git branch -m main old && git branch -m feature main"),
        ("", "wt", "git branch -m main old; git branch -c feature main"),
        # the ref itself
        ("", "wt", "git update-ref refs/heads/main {feature}"),
        ("", "wt", "git update-ref -d refs/heads/main"),
        ("", "wt", "echo 'update refs/heads/main {feature}' | git update-ref --stdin"),
        ("", "wt", "git symbolic-ref refs/heads/main refs/heads/feature"),
        ("", "wt", "echo {feature} > {repo}/.git/refs/heads/main"),
        ("", "wt", "cp {repo}/.git/refs/heads/feature {repo}/.git/refs/heads/main"),
        # fetch, pull and push into the local branch
        ("", "wt", "git fetch . feature:main"),
        ("", "wt", "git fetch . +refs/heads/feature:refs/heads/main"),
        ("", "wt", "git fetch {repo} feature:main"),
        ("", "wt", "git pull . feature:main"),
        ("", "wt", "git push . feature:main"),
        ("", "wt", "git push {repo} +crew/x:refs/heads/main"),
        # checking it out here on the way, creating or resetting it
        ("", "wt", "git switch -C main feature"),
        ("", "wt", "git checkout -B main feature"),
        ("", "wt", "git switch --force-create main feature"),
        ("", "wt", "git worktree add -B main ../m2 feature"),
        ("", "wt", "git rebase feature main"),
        ("", "wt", "git checkout main && git reset --hard feature"),
        ("", "wt", "git switch main && git merge feature"),
        ("", "wt", "git switch main; git commit --allow-empty -m x"),
        ("", "wt", "git checkout main && git pull . feature"),
        ("", "wt", "git checkout main && git cherry-pick crew/x"),
        ("", "wt", "git worktree add ../m2 main && git -C ../m2 reset --hard feature"),
        ("", "wt", "git worktree add ../m2 main && cd ../m2 && git merge feature"),
        # in a checkout that has it checked out
        ("m", "m", "git commit --allow-empty -m x"),
        ("m", "m", "git commit --amend --allow-empty -m y"),
        ("m", "m", "git merge feature"),
        ("m", "m", "git reset --hard feature"),
        ("m", "m", "git pull . feature"),
        ("m", "m", "git cherry-pick crew/x"),
        ("m", "m", "git revert --no-edit HEAD"),
        ("m", "m", "git rebase feature"),
        ("m", "wt", "git -C ../m reset --hard feature"),
        ("m", "wt", "cd ../m && git merge feature"),
        ("m", "wt", "cd {m}; git commit --allow-empty -m x"),
        ("m", "m", "git checkout --detach && git branch -f main feature"),
    ]
    # Everyday commands that name main without moving it: free, and they really don't move it.
    FREE = [
        ("", "wt", "git branch -m feature other"), ("", "wt", "git branch -f feature main"), ("", "wt", "git branch -C main copy"),
        ("", "wt", "git branch copy main"), ("", "wt", "git branch --list main"), ("", "wt", "git branch --contains main"),
        ("", "wt", "git branch -D feature"), ("", "wt", "git log --oneline main"), ("", "wt", "git merge main"),
        ("", "wt", "git rebase main"), ("", "wt", "git rebase main crew/x"), ("", "wt", "git reset --hard main"),
        ("", "wt", "git fetch . main:copy"), ("", "wt", "git switch -c copy main"), ("", "wt", "git checkout -b copy main"),
        ("", "wt", "git worktree add -b copy ../m2 main"), ("", "wt", "git commit --allow-empty -m x"),
        ("", "wt", "git update-ref refs/heads/copy {feature}"), ("", "wt", "git symbolic-ref HEAD"),
        ("", "wt", "git switch main"), ("", "wt", "git checkout main"), ("", "wt", "git worktree add ../m2 main"),
        ("m", "wt", "git commit --allow-empty -m x"), ("m", "wt", "git reset --hard main"), ("m", "m", "git status"),
        ("m", "m", "git log -1"), ("m", "m", "git diff"), ("m", "m", "git stash list"), ("m", "m", "git branch copy"),
    ]

    def setUp(self):
        import subprocess
        self.sp = subprocess
        self.t = Path(tempfile.mkdtemp(prefix="pals-liverefs-"))
        self.env = {**os.environ, "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null", "GIT_AUTHOR_NAME": "Sam",
                    "GIT_AUTHOR_EMAIL": "s@example.invalid", "GIT_COMMITTER_NAME": "Sam", "GIT_COMMITTER_EMAIL": "s@example.invalid",
                    "GIT_EDITOR": "true", "GIT_TERMINAL_PROMPT": "0"}
        self.n = 0

    def tearDown(self):
        import shutil
        shutil.rmtree(self.t, ignore_errors=True)
        self.SETTINGS.unlink(missing_ok=True)
        crewguard.HOOK_CWD = None

    def repo(self, layout):
        """A fresh one: main (A) checked out nowhere, feature (A-B), crew/x (A-C) in a worktree."""
        self.n += 1
        d = self.t / str(self.n)
        r = d / "repo"
        r.mkdir(parents=True)
        g = lambda *a, at=r: self.sp.run(["git", "-C", str(at), *a], env=self.env, check=True, capture_output=True, text=True).stdout.strip()
        g("init", "-q", "-b", "main")
        (r / "f").write_text("a\n"); g("add", "f"); g("commit", "-q", "-m", "A")
        g("checkout", "-q", "-b", "feature"); (r / "g").write_text("b\n"); g("add", "g"); g("commit", "-q", "-m", "B")
        g("checkout", "-q", "-b", "parked", "main")
        g("worktree", "add", "-q", "-b", "crew/x", str(d / "wt"), "main")
        (d / "wt" / "h").write_text("c\n"); g("add", "h", at=d / "wt"); g("commit", "-q", "-m", "C", at=d / "wt")
        if layout == "m":
            g("worktree", "add", "-q", str(d / "m"), "main")
        return {"repo": str(r), "wt": str(d / "wt"), "m": str(d / "m"), "feature": g("rev-parse", "feature")}

    def main_ref(self, repo):
        # The ref as it is, a symbolic one included: where does refs/heads/main point, if anywhere?
        r = self.sp.run(["git", "-C", repo, "rev-parse", "-q", "--verify", "refs/heads/main^{commit}"], env=self.env, capture_output=True, text=True)
        s = self.sp.run(["git", "-C", repo, "symbolic-ref", "-q", "refs/heads/main"], env=self.env, capture_output=True, text=True)
        return (r.stdout.strip() or None, s.stdout.strip() or None)

    def case(self, layout, where, template):
        p = self.repo(layout)
        cmd = template.format(**p)
        self.SETTINGS.write_text(json.dumps({"channel": "live", "live_branch": "main", "live_repo": p["repo"]}))
        crewguard.HOOK_CWD = p[where]
        held = rule(cmd)
        before = self.main_ref(p["repo"])
        self.sp.run(["bash", "-c", cmd], cwd=p[where], env=self.env, capture_output=True, text=True)
        return cmd, held, before != self.main_ref(p["repo"])

    def test_every_command_that_moves_the_followed_branch_is_held(self):
        slipped, duds = [], []
        for layout, where, template in self.MOVERS:
            cmd, held, moved = self.case(layout, where, template)
            if not moved:
                duds.append(cmd)       # the table must stay honest: each of these has to really move it
            elif not held:
                slipped.append(cmd)
        self.assertEqual(duds, [], "these didn't move main here, so they prove nothing")
        self.assertEqual(slipped, [], "moved the followed branch without being held")

    def test_commands_that_only_name_it_stay_free(self):
        for layout, where, template in self.FREE:
            cmd, held, moved = self.case(layout, where, template)
            self.assertFalse(moved, cmd)
            self.assertIsNone(held, cmd)
