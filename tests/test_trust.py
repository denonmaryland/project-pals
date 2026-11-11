"""crewd and Claude Code's folder-trust question (T96): one question is announced once. A screen that
doesn't read for a tick, a terminal that drops out for a moment, or a crewd restart never announce it
again; an answered one leaves the list at once; the Chief's notice points at its pop-up.

    python3 -m unittest tests.test_trust
"""
import json
import unittest

from tests.test_chief import sandbox, py

DRIVER = """
import importlib.machinery, importlib.util, time
loader = importlib.machinery.SourceFileLoader("crewd", sys.path[0] + "/crewd")
mod = importlib.util.module_from_spec(importlib.util.spec_from_loader("crewd", loader)); loader.exec_module(mod)
ASK = ["Quick safety check: Is this a project you created or one you trust?", "> 1. Yes, I trust this folder", "  2. No, exit"]
told, clock, screens = [], [1000.0], {}
mod.screen = lambda addr, lines=0: screens.get(addr, [])
mod.log = lambda m: None
mod.time.time = lambda: clock[0]
mod.Crewd.tell_head = lambda self, text, exclude=None: told.append(text)
def term(where, **k):
    return {"where": where, "state": "live", "status": "idle", "turn": 0, **k}
def check(d, terms, secs=10):
    clock[0] += secs
    d.trust_prompts(terms)
"""


def run(env, steps):
    return py(env, DRIVER + steps)


class OneQuestionOneNotice(unittest.TestCase):
    def setUp(self):
        self.root, self.env, self.data = sandbox()

    def health(self):
        return json.loads((self.data / "crew-health.json").read_text())

    def test_a_screen_that_does_not_read_for_a_tick(self):
        got = run(self.env, """
d = mod.Crewd(); T = {"tW": term("Worker / #general")}
screens["tW"] = ASK; check(d, T)
a = (len(told), sorted(d.trust))
screens["tW"] = []; check(d, T)            # hc read timed out
b = (len(told), sorted(d.trust))
screens["tW"] = ASK; check(d, T)
print(json.dumps([a, b, (len(told), sorted(d.trust))]))""")
        self.assertEqual(got, [[1, ["tW"]], [1, ["tW"]], [1, ["tW"]]])

    def test_a_restart_then_a_blip_is_what_reannounced_t6d(self):
        got = run(self.env, """
T = {"tW": term("Worker / #general")}
d = mod.Crewd(); screens["tW"] = ASK; check(d, T)
since = d.trust["tW"]["since"]
d = mod.Crewd()                             # crewd restarted: first_seen is empty again
check(d, T, 2000)
screens["tW"] = []; check(d, T)             # one unreadable tick, long after
screens["tW"] = ASK; check(d, T)
print(json.dumps([len(told), sorted(d.trust), d.trust["tW"]["since"] == since]))""")
        self.assertEqual(got, [1, ["tW"], True])
        feed = [json.loads(l) for l in (self.data / "crew-feed.jsonl").read_text().splitlines()]
        self.assertEqual(len([f for f in feed if f["kind"] == "trust"]), 1)

    def test_the_terminal_drops_out_for_one_tick(self):
        got = run(self.env, """
d = mod.Crewd(); T = {"tW": term("Worker / #general")}
screens["tW"] = ASK; check(d, T)
check(d, {})                                # gone from hc ls for a tick
a = sorted(d.trust)
check(d, T)
print(json.dumps([a, len(told), sorted(d.trust)]))""")
        self.assertEqual(got, [["tW"], 1, ["tW"]])

    def test_a_partial_screen_then_the_question_again_is_not_news(self):
        got = run(self.env, """
d = mod.Crewd(); T = {"tW": term("Worker / #general")}
screens["tW"] = ASK; check(d, T)
screens["tW"] = ["redrawing"]; check(d, T)  # it read, without the question: off the list
a = sorted(d.trust)
screens["tW"] = ASK; check(d, T)
print(json.dumps([a, len(told), sorted(d.trust)]))""")
        self.assertEqual(got, [[], 1, ["tW"]])

    def test_answered_leaves_at_once_and_is_forgotten(self):
        got = run(self.env, """
d = mod.Crewd(); T = {"tW": term("Worker / #general")}
screens["tW"] = ASK; check(d, T)
T["tW"]["turn"] = 2; screens["tW"] = ["working"]; check(d, T)
print(json.dumps([sorted(d.trust), sorted(d.trust_told), len(told)]))""")
        self.assertEqual(got, [[], [], 1])
        self.assertEqual(self.health().get("trust_told"), {})

    def test_gone_for_good_leaves_after_the_grace(self):
        got = run(self.env, """
d = mod.Crewd(); T = {"tW": term("Worker / #general")}
screens["tW"] = ASK; check(d, T)
check(d, {}); check(d, {}, mod.TRUST_GRACE + 1)
a = (sorted(d.trust), sorted(d.trust_told))
check(d, {}); check(d, {}, mod.TRUST_GRACE + 1)
print(json.dumps([a, sorted(d.trust_told)]))""")
        self.assertEqual(got, [[[], ["tW"]], []])

    def test_a_new_question_on_another_terminal_is_still_announced(self):
        got = run(self.env, """
d = mod.Crewd(); T = {"tW": term("Worker / #general")}
screens["tW"] = ASK; check(d, T)
T["tO"] = term("Boss / #ops"); screens["tO"] = ASK; check(d, T)
print(json.dumps([len(told), sorted(d.trust)]))""")
        self.assertEqual(got, [2, ["tO", "tW"]])

    def test_an_old_idle_terminal_is_not_read(self):
        got = run(self.env, """
reads = []
d = mod.Crewd(); T = {"tW": term("Worker / #general")}
mod.screen = lambda addr, lines=0: reads.append(addr) or ["idle"]
check(d, T); check(d, T, 601); n = len(reads); check(d, T)
print(json.dumps([n, len(reads), len(told)]))""")
        self.assertEqual(got, [1, 1, 0])

    def test_the_chiefs_notice_points_at_its_pop_up(self):
        got = run(self.env, """
d = mod.Crewd(); T = {"tC": term("Chief / #chief"), "tW": term("Worker / #general")}
screens["tC"] = ASK; screens["tW"] = ASK; check(d, T)
print(json.dumps(told))""")
        chief = next(t for t in got if t.startswith("[pal] Chief"))
        self.assertIn("pop-up (Ctrl+Shift+J)", chief)
        self.assertNotIn("Open that tab", chief)
        self.assertIn("Open that tab", next(t for t in got if "Worker" in t))


if __name__ == "__main__":
    unittest.main()
