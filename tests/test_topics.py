"""Channels became topics in 0.4.0 (DeNon): `pal topic` and `--topic` are the new names, and
`pal channel` / `--channel` keep working so older scripts and pals don't break.
Run: python3 -m unittest discover -s tests   (uses a throwaway CREW_DATA; touches nothing real)."""
import importlib.machinery
import importlib.util
import io
import os
import sys
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

TMP = pals_tmp.mkdtemp(prefix="pals-test-")
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


class TopicNames(unittest.TestCase):
    def setUp(self):
        self.crew = load_crew()
        self.sent = []
        self.crew.request = lambda op, spaces, **f: (self.sent.append((op, f)), {"bot": "Docs", "channel": "#" + f["name"], "name": "Docs", "harness": "shell"})[1]
        self.crew.herdr_spaces = lambda *a, **k: []
        self.crew.watch_for_trust = lambda *a, **k: None
        self.watched = []
        self.real_watch_start = self.crew.watch_start
        self.crew.watch_start = lambda *a, **k: self.watched.append(a) or True

    def run_cli(self, *argv):
        out = io.StringIO()
        with redirect_stdout(out):
            self.crew.main(list(argv))
        return out.getvalue()

    def test_topic_and_channel_both_add_a_tab(self):
        for cmd in ("topic", "channel"):
            self.sent.clear()
            out = self.run_cli(cmd, "Docs", "pricing", "--brief", "the pricing page")
            self.assertEqual(self.sent, [("channel", {"bot": "Docs", "name": "pricing", "brief": "the pricing page"})], cmd)
            self.assertIn("Docs now has #pricing", out)
            self.assertEqual(self.watched[-1][:2], ("Docs", "#pricing"), "it checks the agent started")

    def test_says_when_the_brain_was_a_guess(self):
        # T24: a pal asleep with no brain on record gets the asking pal's brain, and says so.
        self.crew.request = lambda op, spaces, **f: {"bot": "Hello Lock - App", "channel": "#lock-loss-2", "harness": "Claude Code", "guessed": True, "why": "yours"}
        out = self.run_cli("topic", "Hello Lock", "lock-loss-2", "--brief", "why the lock drops")
        self.assertIn("Hello Lock - App now has #lock-loss-2, running Claude Code", out)
        self.assertIn("own brain isn't on record, so this uses yours; pick another with --harness", out)

    def test_watch_start_says_when_no_agent_came_up(self):
        c = self.crew
        clock = iter(range(0, 1000, 5))
        c.time = types.SimpleNamespace(sleep=lambda s: None, time=lambda: next(clock))   # this module's time only
        c.herdr_spaces = lambda *a, **k: [{"name": "Hello Lock - App", "tabs": [{"name": "#lock-loss-2", "terminals": [{"terminal": "t9"}]}]}]
        c.screen = lambda *a, **k: "$ "
        c.hc_terminals = lambda: {"t9": {"state": "live", "agent": "bash"}}   # a bare shell
        out = io.StringIO()
        with redirect_stdout(out):
            ok = self.real_watch_start("Hello Lock - App", "#lock-loss-2", "Claude Code", wait=20)
        self.assertFalse(ok)
        self.assertIn("no agent is running in it after 20s (Claude Code didn't start)", out.getvalue())
        c.hc_terminals = lambda: {"t9": {"state": "live", "agent": "claude"}}
        clock = iter(range(0, 1000, 5))
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertTrue(self.real_watch_start("Hello Lock - App", "#lock-loss-2", "Claude Code", wait=20))
        self.assertEqual(out.getvalue(), "")

    def test_topic_flag_is_channel(self):
        pos, o = self.crew.opts(["Ana", "--topic", "research"], ("channel", "folder"))
        self.assertEqual((pos, o), (["Ana"], {"channel": "research"}))
        pos, o = self.crew.opts(["Ana", "--channel", "research"], ("channel", "folder"))
        self.assertEqual(o, {"channel": "research"})
        with self.assertRaises(SystemExit):   # only where --channel is an option
            self.crew.opts(["x", "--topic", "y"], ("brief",))

    def test_help_and_primer_say_topic(self):
        out = self.run_cli("--help")
        self.assertIn("pal topic <Pal> <name>", out)
        self.assertIn("pal channel is the same command", out)
        self.assertNotIn("a new channel", out)
        self.assertIn('note <subject> "…"', out)   # a brain note's subject, not a tab (Orca, 2026-11-08)
        self.assertNotIn("note <topic>", out)
        primer = self.run_cli("primer")
        self.assertIn('pal tell "Pal#topic"', primer)
        self.assertNotIn("channel", primer.lower())


if __name__ == "__main__":
    unittest.main()
