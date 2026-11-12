"""T108: a pal's board (crew-boards/pal-page/design.md, DeNon's pick G · Board). The data side:
the sentence reader (a reply's first one or two plain sentences), a topic's line from the end of its
session file, its branch against its base, what it needs from the owner, which column it sits in
(what it waits for), and `pal computer <Pal> board --json`. Throwaway HOME, data and fake hc /
herdr-app, like test_computer.
Run: python3 -m unittest tests.test_board"""
import json
import subprocess
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pals_tmp  # noqa: E402  (scratch folders removed at exit, T143)

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bin"))
from test_head_inbox import sandbox  # noqa: E402
from test_desk import pal  # noqa: E402

T0 = 1794000000000   # a fixed "now", ms


def user(text, at):
    # Compact, as Claude Code writes its session files (crewchat.parse_claude looks for "type":"user").
    return json.dumps({"type": "user", "timestamp": at, "message": {"role": "user", "content": text}}, separators=(",", ":"))


def bot(text, at, tool=None):
    content = [{"type": "text", "text": text}] + ([{"type": "tool_use", "name": tool, "input": {}}] if tool else [])
    return json.dumps({"type": "assistant", "timestamp": at, "message": {"role": "assistant", "content": content}}, separators=(",", ":"))


class Lead(unittest.TestCase):
    def lead(self, text, **kw):
        from crewboard import lead
        return lead(text, **kw)

    def test_one_or_two_whole_sentences(self):
        text = "Fixed the retry so a slow bank reply can't charge a card twice. The test for a late reply passes. I also renamed three helpers."
        self.assertEqual(self.lead(text), "Fixed the retry so a slow bank reply can't charge a card twice. The test for a late reply passes.")

    def test_skips_headings_lists_code_and_one_word_lines(self):
        text = "## Summary\n\nDone.\n\n```sh\nnpm test\n```\n\n- changed retry.ts\n- added a test\n\nThe setup guide is rewritten. Every command in it ran on a clean machine."
        self.assertEqual(self.lead(text), "The setup guide is rewritten. Every command in it ran on a clean machine.")

    def test_markdown_marks_come_off(self):
        self.assertEqual(self.lead("**Shipped** the `retry` fix, see [the diff](http://x/y). It's small."),
                         "Shipped the retry fix, see the diff. It's small.")

    def test_a_bold_line_as_heading_is_skipped(self):
        self.assertEqual(self.lead("**What changed**\n\nThe cart page loads in 0.8 s now."), "The cart page loads in 0.8 s now.")

    def test_never_cut_mid_sentence_unless_the_first_is_too_long(self):
        second = "Then " + "x" * 300
        self.assertEqual(self.lead(f"Short one. {second}."), "Short one.")           # the second doesn't fit: left out whole
        long = "word " * 80
        out = self.lead(long.strip() + ".", limit=60)
        self.assertTrue(out.endswith("…") and len(out) <= 61 and not out[:-1].endswith(" "))

    def test_a_decimal_or_a_file_name_does_not_end_a_sentence(self):
        self.assertEqual(self.lead("The page loads in 0.8 s with it and 1.4 s without. Your call."),
                         "The page loads in 0.8 s with it and 1.4 s without. Your call.")
        self.assertEqual(self.lead("Edited retry.ts and charge.ts for it."), "Edited retry.ts and charge.ts for it.")

    def test_only_a_list_or_one_word_still_gives_something(self):
        self.assertEqual(self.lead("- pushed the branch\n- opened the PR"), "pushed the branch")
        self.assertEqual(self.lead("Done."), "Done.")
        self.assertEqual(self.lead(""), "")
        self.assertEqual(self.lead(None), "")


class Line(unittest.TestCase):
    def line(self, bubbles, state):
        from crewboard import topic_line
        return topic_line(bubbles, state)

    def test_working_shows_the_newest_words_of_this_turn(self):
        b = [{"kind": "bot", "text": "Old reply from the last turn.", "at": 1},
             {"kind": "you", "text": "fix the double charge and prove it", "at": 10},
             {"kind": "bot", "text": "Found it: the retry fires too early.", "at": 20},
             {"kind": "tool", "verb": "Edit", "what": "retry.ts", "at": 21},
             {"kind": "bot", "text": "The fix is in. Writing the test now.", "at": 30}]
        x = self.line(b, "working")
        self.assertEqual((x["text"], x["from"], x["at"]), ("The fix is in. Writing the test now.", "turn", 30))
        self.assertEqual(x["asked"], {"by": "you", "at": 10, "text": "fix the double charge and prove it"})

    def test_working_before_it_said_anything_shows_what_it_was_asked(self):
        b = [{"kind": "bot", "text": "Old reply from the last turn.", "at": 1},
             {"kind": "note", "from": "Atlas", "text": "Run the contract tests against the new endpoints.", "at": 10},
             {"kind": "tool", "verb": "Bash", "what": "npm test", "at": 11}]
        x = self.line(b, "working")
        self.assertEqual((x["text"], x["from"]), ("Started on: Run the contract tests against the new endpoints.", "asked"))
        self.assertEqual(x["asked"]["by"], "Atlas")

    def test_resting_shows_the_lead_of_its_last_reply(self):
        b = [{"kind": "you", "text": "rewrite the setup guide", "at": 10},
             {"kind": "bot", "text": "Reading the old guide first.", "at": 20},
             {"kind": "bot", "text": "## Done\n\nRewrote the setup guide. It's ready to push.\n\n- 5 commits", "at": 30}]
        for state in ("idle", "done", "blocked", "asleep"):
            x = self.line(b, state)
            self.assertEqual((x["text"], x["from"], x["at"]), ("Rewrote the setup guide. It's ready to push.", "reply", 30), state)

    def test_nothing_to_read(self):
        self.assertIsNone(self.line([], "working"))
        self.assertIsNone(self.line([{"kind": "tool", "verb": "Bash", "what": "ls", "at": 1}], "idle"))

    def test_read_from_the_end_of_a_session_file(self):
        import crewboard
        d = Path(pals_tmp.mkdtemp(prefix="pals-board-"))
        f = d / "s.jsonl"
        pad = [bot("An early reply that is far from the end of the file. " + "pad " * 200, "2026-11-09T10:00:00.000Z") for _ in range(40)]
        f.write_text("\n".join(pad + [user("the double charge, fix it and prove it", "2026-11-09T15:28:00.000Z"),
                                      bot("The fix is in. Writing the test for a late reply now.", "2026-11-09T15:38:00.000Z", tool="Write")]) + "\n")
        x = crewboard.read_line("t1", "working", {"t1": {"transcript": str(f), "harness": "claude"}})
        self.assertEqual(x["text"], "The fix is in. Writing the test for a late reply now.")
        self.assertEqual(x["asked"]["text"], "the double charge, fix it and prove it")
        small = crewboard.tail_bubbles(f, tail=2000)             # only the tail is read, and a cut first line is dropped
        self.assertLess(len(small), 10)
        self.assertEqual(small[-2]["text"], "The fix is in. Writing the test for a late reply now.")
        self.assertIsNone(crewboard.read_line("t2", "working", {"t1": {"transcript": str(f)}}))       # no link: no line
        self.assertIsNone(crewboard.read_line("t1", "idle", {"t1": {"transcript": str(d / "gone.jsonl")}}))


class Branch(unittest.TestCase):
    def test_ahead_changed_and_lines(self):
        import crewboard
        d = Path(pals_tmp.mkdtemp(prefix="pals-board-git-"))
        g = lambda *a: subprocess.run(["git", "-C", str(d), "-c", "user.name=t", "-c", "user.email=t@t", *a], check=True, capture_output=True)
        g("init", "-q", "-b", "main")
        (d / "a.txt").write_text("one\ntwo\nthree\n")
        g("add", "."); g("commit", "-q", "-m", "base")
        g("checkout", "-q", "-b", "crew/x")
        (d / "a.txt").write_text("one\n2\nthree\nfour\n")
        g("commit", "-q", "-am", "edit")
        (d / "b.txt").write_text("new\n")
        g("add", "b.txt"); g("commit", "-q", "-m", "add b")
        (d / "a.txt").write_text("one\n2\nthree\nfour\nfive\n")       # not committed yet
        f = crewboard.branch_facts({"path": str(d), "branch": "crew/x", "base": "main"})
        self.assertEqual(f, {"name": "crew/x", "base": "main", "ahead": 2, "added": 4, "removed": 1})
        calls = []
        crewboard.branch_facts({"path": str(d), "branch": "crew/x", "base": "main"}, git=lambda p, *a: calls.append(a) or "0")
        self.assertEqual(len(calls), 2, "two git calls a topic: the board is re-read while it's up")

    def test_no_worktree_or_a_broken_one_is_none(self):
        import crewboard
        self.assertIsNone(crewboard.branch_facts(None))
        self.assertIsNone(crewboard.branch_facts({"path": "/nonexistent/place", "branch": "x", "base": "main"}))


def today(topics):
    return {"pal": "Juniper", "topics": topics, "next": [], "desk": {"open": 0, "needs_you": 0}, "due_today": [],
            "focus": "checkout ships Friday", "statement": "", "goals": []}


class Board(unittest.TestCase):
    def view(self, **kw):
        import crewboard
        topics = [{"topic": "checkout", "state": "working", "terminal": "t1", "task": {"id": "T41", "title": "Stop the double charge"}},
                  {"topic": "api-tests", "state": "working", "terminal": "t2", "task": None},
                  {"topic": "perf", "state": "blocked", "terminal": "t3", "task": None},
                  {"topic": "docs", "state": "done", "terminal": "t4", "task": None},
                  {"topic": "notes", "state": "idle", "terminal": "t5", "task": None},
                  {"topic": "refunds", "state": "asleep", "terminal": "t6", "task": None}]
        base = dict(
            tasks=[{"id": "T41", "title": "Stop the double charge", "status": "claimed", "claimed_by": "Juniper#checkout", "created": 1},
                   {"id": "T42", "title": "Refund emails", "status": "blocked", "claimed_by": "Juniper#refunds", "created": 2,
                    "notes": [{"text": "needs the mail provider's test key"}]},
                   {"id": "T45", "title": "Saved addresses", "status": "open", "assignee": "Juniper", "due": "2026-11-11", "created": 3},
                   {"id": "T46", "title": "Receipt copy", "status": "open", "assignee": "Juniper", "created": 4},
                   {"id": "T47", "title": "For a topic", "status": "open", "assignee": "Juniper#docs", "created": 5},
                   {"id": "T48", "title": "Atlas's", "status": "open", "assignee": "Atlas", "created": 6}],
            feed=[{"kind": "working", "bot": "Juniper", "channel": "checkout", "at": T0 - 3600000},
                  {"kind": "finished", "bot": "Juniper", "channel": "checkout", "at": T0 - 3000000},
                  {"kind": "working", "bot": "Juniper", "channel": "checkout", "at": T0 - 720000},
                  {"kind": "working", "bot": "Juniper", "channel": "docs", "at": T0 - 9000000},
                  {"kind": "finished", "bot": "Juniper", "channel": "docs", "at": T0 - 5880000},
                  {"kind": "blocked", "bot": "Juniper", "channel": "perf", "at": T0 - 540000},
                  {"kind": "finished", "bot": "Atlas", "channel": "docs", "at": T0 - 1}],
            approvals=[{"id": "a-1", "status": "pending", "bot": "Juniper", "channel": "docs", "command": "git push origin crew/docs",
                        "rule": "git-push", "why": "pushes need the owner", "at": T0 - 5820000},
                       {"id": "a-2", "status": "approved", "bot": "Juniper", "channel": "docs", "command": "old", "at": 5},
                       {"id": "a-3", "status": "pending", "bot": "Atlas", "channel": "general", "command": "git push", "at": 6}],
            asks=[{"id": "h-1", "kind": "ask", "status": "open", "by": "Juniper#perf", "title": "Keep the image CDN?", "body": "0.8 s with, 1.4 s without",
                   "options": ["Keep it", "Serve them ourselves"], "does": ["a", "b"], "recommend": "Keep it", "why": "smaller change", "at": T0 - 500000},
                  {"id": "h-2", "kind": "ask", "status": "answered", "by": "Juniper#perf", "title": "old", "at": 1},
                  {"id": "h-3", "kind": "ask", "status": "open", "by": "Atlas#general", "title": "not Juniper's", "at": 2},
                  {"id": "h-4", "kind": "ask", "status": "open", "by": "Juniper", "title": "A pal-wide question", "at": T0 - 100}],
            cards=[{"id": "c-1", "status": "needs you", "to": "Juniper#notes", "title": "Pick a name", "from": "Juniper#notes", "at_ms": T0 - 200},
                   {"id": "c-2", "status": "working", "to": "Juniper#notes", "title": "not waiting", "at_ms": 3}],
            lines={"checkout": {"text": "The fix is in.", "from": "turn", "at": T0 - 100, "asked": None}},
            branches={"checkout": {"name": "crew/checkout", "base": "main", "ahead": 3, "added": 22, "removed": 7}},
            stalled={"t2": {"since": T0 - 25 * 60000, "bot": "Juniper", "channel": "api-tests"}},
            msgs={"t3": "Keep the image CDN, or serve the images ourselves?"}, now_ms=T0)
        base.update(kw)
        return crewboard.board_view(today(topics), **base)

    def test_the_column_is_what_a_topic_waits_for(self):
        v = self.view()
        waits = {t["topic"]: t["waits_for"] for t in v["topics"]}
        self.assertEqual(waits, {"checkout": "itself", "api-tests": "itself", "perf": "you", "docs": "you", "notes": "you", "refunds": "nothing"})
        # Waiting for the owner wins over every other state: #docs finished, and its push is held.
        docs = next(t for t in v["topics"] if t["topic"] == "docs")
        self.assertEqual((docs["state"], docs["waits_for"], docs["needs"]), ("done", "you", ["a-1"]))
        v2 = self.view(approvals=[], asks=[], cards=[])
        waits2 = {t["topic"]: t["waits_for"] for t in v2["topics"]}
        self.assertEqual(waits2, {"checkout": "itself", "api-tests": "itself", "perf": "you", "docs": "nothing", "notes": "nothing", "refunds": "nothing"})

    def test_needs_are_this_pals_only_and_the_longest_wait_is_first(self):
        v = self.view()
        self.assertEqual([(n["kind"], n["id"], n["topic"]) for n in v["needs"]],
                         [("approval", "a-1", "docs"), ("prompt", "t3", "perf"), ("ask", "h-1", "perf"), ("card", "c-1", "notes"), ("ask", "h-4", None)])
        ask = next(n for n in v["needs"] if n["id"] == "h-1")
        self.assertEqual((ask["options"], ask["recommend"], ask["why"]), (["Keep it", "Serve them ourselves"], "Keep it", "smaller change"))
        prompt = next(n for n in v["needs"] if n["kind"] == "prompt")
        self.assertEqual((prompt["title"], prompt["since"]), ("Keep the image CDN, or serve the images ourselves?", T0 - 540000))
        self.assertEqual(next(n for n in v["needs"] if n["id"] == "a-1")["title"], "git push origin crew/docs")

    def test_since_line_branch_stuck_and_blocked(self):
        v = self.view()
        t = {x["topic"]: x for x in v["topics"]}
        self.assertEqual(t["checkout"]["since"], T0 - 720000)             # this turn's start, not the earlier one
        self.assertEqual(t["docs"]["since"], T0 - 5880000)                # when it finished
        self.assertEqual(t["docs"]["finished_at"], T0 - 5880000)
        self.assertEqual(t["perf"]["since"], T0 - 540000)
        self.assertEqual(t["notes"]["since"], 0)                          # nothing in the feed: unknown, not invented
        self.assertEqual(t["checkout"]["line"]["text"], "The fix is in.")
        self.assertIsNone(t["docs"]["line"])
        self.assertEqual(t["checkout"]["branch"]["added"], 22)
        self.assertEqual(t["api-tests"]["stuck"], 25)
        self.assertEqual(t["checkout"]["stuck"], 0)
        self.assertEqual(t["refunds"]["blocked"], {"id": "T42", "title": "Refund emails", "why": "needs the mail provider's test key"})
        self.assertIsNone(t["checkout"]["blocked"])

    def test_up_next_is_the_tasks_no_topic_has_claimed(self):
        v = self.view()
        self.assertEqual([r["id"] for r in v["up_next"]], ["T45", "T46"])     # soonest due first; T47 has a topic, T48 is Atlas's
        self.assertEqual(v["up_next_total"], 2)
        many = [{"id": f"T{60 + i}", "title": "x", "status": "open", "assignee": "Juniper", "created": i} for i in range(5)]
        v = self.view(tasks=many)
        self.assertEqual((len(v["up_next"]), v["up_next_total"]), (3, 5))
        self.assertEqual(v["focus"], "checkout ships Friday")                # Today's fields are still there


class TheCommand(unittest.TestCase):
    def setUp(self):
        self.env, self.data = sandbox()

    def test_board_json(self):
        session = self.data / "worker.jsonl"
        session.write_text("\n".join([user("rewrite the setup guide", "2026-11-09T13:00:00.000Z"),
                                      bot("Rewrote the setup guide. It's ready to push.", "2026-11-09T14:02:00.000Z")]) + "\n")
        (self.data / "crew-sessions").mkdir()
        (self.data / "crew-sessions" / "tW.json").write_text(json.dumps({"terminal": "tW", "transcript": str(session), "harness": "claude"}))
        (self.data / "crew-approvals").mkdir()
        (self.data / "crew-approvals" / "a-9.json").write_text(json.dumps(
            {"id": "a-9", "at": 5, "terminal": "tW", "bot": "Worker", "channel": "general", "command": "git push origin crew/docs",
             "rule": "git-push", "why": "pushes need the owner", "status": "pending"}))
        r = pal(self.env, "home", "ask", "Keep the CDN?", "--option", "Keep it", "--option", "Drop it", "--recommend", "Keep it",
                "--why", "smaller change", term="tW")
        self.assertEqual(r.returncode, 0, r.stderr)
        pal(self.env, "task", "add", "Saved addresses", "--for", "Worker")
        r = pal(self.env, "computer", "Worker", "board", "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        v = json.loads(r.stdout)
        self.assertEqual(v["pal"], "Worker")
        t = v["topics"][0]
        self.assertEqual((t["topic"], t["waits_for"]), ("general", "you"))
        self.assertEqual(t["line"]["text"], "Rewrote the setup guide. It's ready to push.")
        self.assertEqual(t["line"]["from"], "reply")
        self.assertEqual(sorted(n["kind"] for n in v["needs"]), ["approval", "ask"])
        self.assertEqual([r_["title"] for r_ in v["up_next"]], ["Saved addresses"])
        today_ = json.loads(pal(self.env, "computer", "Worker", "today", "--json").stdout)
        self.assertNotIn("needs", today_)                                   # Today stays the small, cheap read
        self.assertEqual([x["topic"] for x in today_["topics"]], [x["topic"] for x in v["topics"]])
        text = pal(self.env, "computer", "Worker", "board").stdout
        self.assertIn("needs you  approval", text)
        self.assertIn("waits for you", text)


if __name__ == "__main__":
    unittest.main()
