"""The approval gate sees the command, not how it's spelled (T26): a gated tool behind npx, a path, an
env prefix, `command`, `nice`, git's global options… is still gated; text inside quotes (a grep
pattern) isn't a command; and running Project Pals' own CLI through python isn't a script that writes
an agent file.
Run: python3 -m unittest discover -s tests   (uses a throwaway CREW_DATA; touches nothing real)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

# A throwaway data folder: another test module's, when one already set it (crewlib reads it once,
# at import), else our own. Never the real one.
if "pals-test-" not in os.environ.get("CREW_DATA", ""):
    TMP = tempfile.mkdtemp(prefix="pals-test-")
    os.environ["CREW_DATA"] = TMP
    os.environ["HERDR_APP_HOME"] = TMP
os.environ.pop("HC_TERMINAL_ID", None)
BIN = Path(__file__).resolve().parent.parent / "bin"
sys.path.insert(0, str(BIN))

import crewguard  # noqa: E402


def rule(cmd):
    r = crewguard.matches(cmd)
    return r["name"] if r else None


class Heads(unittest.TestCase):
    HELD = {
        "push": [
            "git push", "env X=1 git push", "env -i PATH=/usr/bin git push origin main", "command git push",
            "command -p git push", "exec git push", "nice git push", "nice -n 10 git push", "ionice -c3 git push",
            "/usr/bin/git push", "./git push", '"/usr/bin/git" push', "sudo -u me git push",
            "git -C /repo push", "git -c user.name=x push", "git --no-pager push", "git --git-dir=/r/.git push",
            "git -C /repo -c a=b --no-pager push --tags", "timeout 30 git push", "time git push",
            "cd /repo && GIT_SSH_COMMAND='ssh -i k' git push", "stdbuf -oL git push", "eval 'git push'",
            'echo "$(git push)"', "xargs git push < remotes",
        ],
        "deploy": [
            "vercel --prod", "npx vercel --prod", "npx -y vercel deploy --prod", "npx --yes vercel --prod",
            "bunx vercel --prod", "pnpm dlx vercel --prod", "pnpm exec vercel --prod", "yarn dlx vercel --prod",
            "npm exec -- vercel --prod", "/path/to/node_modules/.bin/vercel deploy --prod",
            "./node_modules/.bin/vercel --prod", "env VERCEL_TOKEN=x npx vercel --prod",
            "npx wrangler deploy", "npx netlify deploy --prod", "uvx flyctl deploy", "/usr/local/bin/flyctl deploy",
        ],
        "publish": ["npx npm publish", "/usr/bin/npm publish", "env NODE_AUTH_TOKEN=x npm publish", "uv run twine upload dist/*"],
        "merge": ["/usr/bin/gh pr merge 3", "command gh pr merge 3", "env GH_TOKEN=x gh pr merge 3"],
        "release": ["/usr/bin/gh release create v1"],
        "land": ["/home/me/.local/bin/pal land", "command pal land"],
    }
    ALLOWED = [
        # a grep (or anything) whose quoted PATTERN has gated words (a-707718)
        "cd tools; grep -noiE 'topics?|pal land|pal topic' *.html | sort | head",
        "grep -n 'git push' notes.md", 'grep -E "gh pr merge|npm publish" docs/*.md', "rg 'vercel --prod' -n",
        "echo 'run git push when ready'", 'printf "%s\\n" "pal land"',
        "git log --grep='push'", "git status", "npx prettier --check .", "npx vercel --help",
        "/usr/bin/git pull", "env X=1 git fetch", "command -v git",
        # Project Pals' own CLI run through python (a-c3849a, a-098b2d): `pal` itself isn't gated,
        # and the owner-only writes inside it are gated there.
        f"python3 {BIN}/crew --help",
        "S=/tmp/x; git archive v0.3.0 | tar -x -C $S/v030; cd $S/v030; python3 bin/crew --help 2>&1 | head -80",
    ]

    def test_held(self):
        for want, cmds in self.HELD.items():
            for cmd in cmds:
                self.assertEqual(rule(cmd), want, cmd)

    def test_allowed(self):
        for cmd in self.ALLOWED:
            self.assertIsNone(rule(cmd), cmd)

    def test_quoted_text_isnt_a_command_but_bash_c_still_is(self):
        self.assertEqual(rule("bash -c 'git push'"), "push")
        self.assertEqual(rule('sh -c "npx vercel --prod"'), "deploy")
        self.assertIsNone(rule("grep 'bash -c git push' x"))

    def test_normal_form(self):
        n = crewguard.normal_head
        self.assertEqual(n("env A=1 B=2 command nice -n 5 /usr/bin/git -C /r --no-pager push -f"), "git push -f")
        self.assertEqual(n("npx -y vercel --prod"), "vercel --prod")
        self.assertEqual(n("./node_modules/.bin/vercel --prod"), "vercel --prod")
        self.assertEqual(n("git status"), "git status")


if __name__ == "__main__":
    unittest.main()
