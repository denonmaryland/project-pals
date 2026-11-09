"""`pal peek` on a pal that's waiting (T49, checked live 2026-11-09 against Claude Code 2.1.321): the
screens below are copied from a real session, with the long folder path shortened.
Run: python3 -m unittest discover -s tests   (uses a throwaway CREW_DATA; touches nothing real)."""
import importlib.machinery
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

TMP = tempfile.mkdtemp(prefix="pals-test-")
os.environ["CREW_DATA"] = TMP
os.environ["HERDR_APP_HOME"] = TMP
os.environ.pop("HC_TERMINAL_ID", None)
REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "bin"))


def load_crew():
    loader = importlib.machinery.SourceFileLoader("crew_cli", str(REPO / "bin" / "crew"))
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crew_cli", loader))
    loader.exec_module(mod)
    return mod


PERMISSION = """\
 Bash command
 Tip: auto mode handles these prompts for you — choose "switch to auto mode" below
 Write current date to stamp.txt
 date > stamp.txt
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to /tmp/claude-1000/a-very-long-scratch-folder/peek from
      this project
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No
 Esc to cancel · Tab to amend
[hc] only its screen: it is blocked; history is not scrolled in this state""".splitlines()

TRUST = """\
 Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what's in this
 folder first.

 Claude Code'll be able to read, edit, and execute files here.

 Security guide

 ❯ No, exit
   Yes, I trust this folder

 Enter to confirm · Esc to cancel""".splitlines()

BLOCKED = {"app": "claude-code", "kind": "permission", "msg": "approve Bash: date > stamp.txt", "state": "blocked"}


class WaitingQuestion(unittest.TestCase):
    def setUp(self):
        self.crew = load_crew()

    def test_permission_prompt(self):
        q = self.crew.waiting_question(BLOCKED, PERMISSION)
        self.assertIn("── blocked on a permission prompt ──", q)
        self.assertIn("asks: approve Bash: date > stamp.txt", q)
        opts = next(l for l in q.splitlines() if l.startswith("options: "))[len("options: "):].split(" | ")
        self.assertEqual(len(opts), 4)
        self.assertEqual(opts[0], "1. Yes")
        self.assertEqual(opts[1], "2. Yes, and always allow access to /tmp/claude-1000/a-very-long-scratch-folder/peek from this project",
                         "a wrapped option keeps its second line")
        self.assertEqual(opts[3], "4. No")
        self.assertIn("needs", q)

    def test_trust_prompt_even_without_a_status(self):
        # Claude Code reports no status while the trust question is up (hc get: status null).
        q = self.crew.waiting_question({}, TRUST)
        self.assertIn("'trust this folder?'", q)

    def test_not_waiting(self):
        self.assertIsNone(self.crew.waiting_question({"state": "idle"}, ["❯ ", "  1. a numbered line in a reply"]))


if __name__ == "__main__":
    unittest.main()
