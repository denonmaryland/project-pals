"""Channels became topics in 0.3.1 (DeNon): `pal topic` and `--topic` are the new names, and
`pal channel` / `--channel` keep working so older scripts and pals don't break.
Run: python3 -m unittest discover -s tests   (uses a throwaway CREW_DATA; touches nothing real)."""
import importlib.machinery
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
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


class TopicNames(unittest.TestCase):
    def setUp(self):
        self.crew = load_crew()
        self.sent = []
        self.crew.request = lambda op, spaces, **f: (self.sent.append((op, f)), {"bot": "Docs", "channel": "#" + f["name"], "name": "Docs", "harness": "shell"})[1]
        self.crew.herdr_spaces = lambda *a, **k: []
        self.crew.watch_for_trust = lambda *a, **k: None

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
        primer = self.run_cli("primer")
        self.assertIn('pal tell "Pal#topic"', primer)
        self.assertNotIn("channel", primer.lower())


if __name__ == "__main__":
    unittest.main()
