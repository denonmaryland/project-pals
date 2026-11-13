"""T108: a pal's board (crew-boards/pal-page/design.md, DeNon's pick G · Board). The data side:
the sentence reader (a reply's first one or two plain sentences), a topic's line from the end of its
session file, its branch against its base, what it needs from the owner, which column it sits in
(what it waits for), and `pal computer <Pal> board --json`. Throwaway HOME, data and fake hc /
herdr-app, like test_computer.
Run: python3 -m unittest tests.test_board"""
import json
import os
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
        from unittest import mock
        d = Path(pals_tmp.mkdtemp(prefix="pals-board-"))
        p = mock.patch.object(crewboard, "session_roots", lambda: {"claude": d, "agy": d / "agy"})
        p.start()
        self.addCleanup(p.stop)
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


def tool_use(name, inp, tid, at):
    return json.dumps({"type": "assistant", "timestamp": at, "message": {"role": "assistant", "content": [
        {"type": "tool_use", "id": tid, "name": name, "input": inp}]}}, separators=(",", ":"))


def tool_result(tid, text, at, error=False):
    return json.dumps({"type": "user", "timestamp": at, "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": tid, "content": text, "is_error": error}]}}, separators=(",", ":"))


class Read(unittest.TestCase):
    """T183: Read, a topic's conversation as rows."""
    NOW = 1794000000000

    def rows(self, bubbles, results=None, working=False, **kw):
        from crewboard import read_rows
        return read_rows(bubbles, results, working, now_ms=self.NOW, **kw)

    def test_a_turn(self):
        m = 60000
        b = [{"kind": "you", "text": "fix the double charge", "at": self.NOW - 20 * m},
             {"kind": "tool", "verb": "read", "what": "retry.ts", "at": self.NOW - 19 * m, "id": "a"},
             {"kind": "tool", "verb": "read", "what": "charge.ts", "at": self.NOW - 19 * m, "id": "b"},
             {"kind": "bot", "text": "Found it: the retry fires too early.", "at": self.NOW - 18 * m},
             {"kind": "tool", "verb": "edit", "what": "retry.ts", "at": self.NOW - 17 * m, "id": "c"},
             {"kind": "tool", "verb": "command", "what": "npm test", "at": self.NOW - 16 * m, "id": "d"},
             {"kind": "bot", "text": "Fixed, and the tests pass.", "at": self.NOW - 15 * m}]
        rows, earlier = self.rows(b, {"a": (False, "84 lines"), "c": (False, ""), "d": (True, "1 failed")})
        self.assertEqual(earlier, 0)
        self.assertEqual([r["k"] for r in rows], ["sep", "you", "chip", "reply", "chip", "reply", "footer"])
        self.assertTrue(rows[0]["text"].startswith(("Today", "Yesterday")) or rows[0]["text"])
        self.assertEqual(rows[2]["text"], "Read 2 files")
        self.assertEqual(rows[2]["state"], "done", "a call without a result in a finished turn counts as done")
        self.assertEqual(rows[4]["text"], "Edited retry.ts · Ran 1 command")
        self.assertEqual(rows[4]["state"], "failed")
        self.assertEqual(rows[4]["calls"][1], {"verb": "command", "what": "npm test", "state": "failed", "out": "1 failed"})
        self.assertRegex(rows[-1]["text"], r"^\d\d:\d\d · worked 5 min · 4 tools$")

    def test_still_working(self):
        b = [{"kind": "you", "text": "run it", "at": self.NOW - 120000},
             {"kind": "tool", "verb": "command", "what": "npm test", "at": self.NOW - 60000, "id": "x"}]
        rows, _ = self.rows(b, {}, working=True)
        self.assertEqual(rows[-2]["state"], "running")
        self.assertRegex(rows[-1]["text"], r"working 2 min · 1 tool so far$")

    def test_notes_events_gaps_and_the_limit(self):
        h = 3600000
        b = [{"kind": "note", "from": "Atlas", "text": "rerun the contract tests", "at": self.NOW - 3 * h},
             {"kind": "bot", "text": "On it.", "at": self.NOW - 3 * h + 1000},
             {"kind": "event", "text": "Earlier conversation was summarized", "at": self.NOW - 3 * h + 2000},
             {"kind": "you", "text": "and now?", "at": self.NOW - h}]
        rows, _ = self.rows(b)
        self.assertEqual([r["k"] for r in rows], ["sep", "note", "reply", "footer", "event", "sep", "you"])
        self.assertEqual(rows[1]["from"], "Atlas")
        many = [{"kind": "bot", "text": f"line {i}.", "at": self.NOW - (300 - i) * 1000} for i in range(300)]
        rows, earlier = self.rows(many, limit=50)
        self.assertEqual((len(rows), earlier), (50, 251))   # 300 replies and a footer

    def test_chip_labels(self):
        from crewboard import chip_label
        self.assertEqual(chip_label([{"verb": "search", "what": "retry"}]), "Searched “retry”")
        self.assertEqual(chip_label([{"verb": "command", "what": "a"}, {"verb": "command", "what": "b"}, {"verb": "web", "what": "x"}]),
                         "Ran 2 commands · Looked up 1 page")
        self.assertEqual(chip_label([{"verb": "mystery", "what": ""}]), "Used 1 tool")

    def test_an_old_turns_unfinished_tool_is_not_running(self):
        b = [{"kind": "you", "text": "old turn", "at": 1000},
             {"kind": "tool", "verb": "command", "what": "old command", "id": "a", "at": 2000},
             {"kind": "bot", "text": "finished that.", "at": 3000},
             {"kind": "you", "text": "new turn", "at": 4000},
             {"kind": "bot", "text": "looking.", "at": 5000}]
        rows, _ = self.rows(b, {}, working=True)
        self.assertEqual(next(r for r in rows if r["k"] == "chip")["state"], "done")
        b.append({"kind": "tool", "verb": "command", "what": "new command", "id": "b", "at": 6000})
        rows, _ = self.rows(b, {}, working=True)
        self.assertEqual([r["state"] for r in rows if r["k"] == "chip"], ["done", "running"])

    def test_from_a_session_file_read_only(self):
        import crewboard
        from unittest import mock
        d = Path(pals_tmp.mkdtemp(prefix="pals-read-"))
        p = mock.patch.object(crewboard, "session_roots", lambda: {"claude": d, "agy": d / "agy"})
        p.start()
        self.addCleanup(p.stop)
        f = d / "s.jsonl"
        f.write_text("\n".join([
            user("The pals plugin sent a message:\n[from Orca, a pal, not DeNon] please check the docs\n\nThis is how Claude Code surfaces a prompt a plugin submits between turns — it starts this turn.", "2026-11-09T15:00:00.000Z"),
            tool_use("Bash", {"command": "npm test", "description": "Run the tests"}, "t1", "2026-11-09T15:01:00.000Z"),
            tool_result("t1", "12 passed", "2026-11-09T15:02:00.000Z"),
            bot("## Done\n\nThe docs are fine.", "2026-11-09T15:03:00.000Z")]) + "\n")
        before = f.read_bytes()
        v = crewboard.read_view("t1", "idle", {"t1": {"transcript": str(f), "harness": "claude"}})
        self.assertEqual(f.read_bytes(), before, "the session file is only read")
        self.assertEqual([r["k"] for r in v["rows"]], ["sep", "note", "chip", "reply", "footer"])
        self.assertEqual((v["rows"][1]["from"], v["rows"][1]["text"]), ("Orca", "please check the docs"))
        self.assertEqual(v["rows"][2]["calls"][0], {"verb": "command", "what": "Run the tests", "state": "done", "out": "12 passed"})
        self.assertEqual(v["rows"][3]["text"], "## Done\n\nThe docs are fine.", "replies stay Markdown")
        self.assertEqual((v["path"], v["size"], v["harness"]), (str(f), len(before), "claude"))
        none = crewboard.read_view("t9", "idle", {})
        self.assertEqual((none["rows"], none["path"]), ([], None))

    def test_plugin_messages_from_the_owner_are_yours(self):
        from crewchat import classify_user_text
        r = classify_user_text("The pals plugin sent a message:\n[from DeNon] 📥 Re h-1: Build it\n\nThis is how Claude Code surfaces a prompt a plugin submits between turns.", 0, 1)
        self.assertEqual((r[0]["kind"], r[0]["text"]), ("you", "📥 Re h-1: Build it"))


class ReadSafety(unittest.TestCase):
    """T194 (Codex T193): Read opens only the topic's own regular, owned session file under the
    harness's own folder, never through a symlink, never blocking, never more than its byte cap,
    and one odd record never breaks the read."""

    def setUp(self):
        import crewboard
        from unittest import mock
        self.root = Path(pals_tmp.mkdtemp(prefix="pals-read-safe-"))
        self.claude = self.root / "claude-projects"
        (self.claude / "p").mkdir(parents=True)
        p = mock.patch.object(crewboard, "session_roots", lambda: {"claude": self.claude, "agy": self.root / "agy"})
        p.start()
        self.addCleanup(p.stop)

    def view(self, path, terminal="t1", lk=None, tail=None):
        import crewboard
        rec = lk or {"terminal": terminal, "transcript": str(path), "harness": "claude"}
        kw = {"tail": tail} if tail else {}
        return crewboard.read_view(terminal, "idle", {terminal: rec}, **kw)

    def session(self, name="s.jsonl", text="a reply."):
        f = self.claude / "p" / name
        f.write_text(bot(text, "2026-11-13T10:00:00.000Z") + "\n")
        return f

    def test_its_own_file_reads(self):
        v = self.view(self.session())
        self.assertEqual([r["k"] for r in v["rows"]][-2:], ["reply", "footer"])

    def test_a_symlinked_file_is_refused(self):
        other = self.session("other.jsonl", "SYNTHETIC OTHER TOPIC")
        link = self.claude / "p" / "topic-a.jsonl"
        link.symlink_to(other)
        v = self.view(link)
        self.assertEqual((v["rows"], v["path"]), ([], None))
        self.assertEqual(v["refused"], "not its own session file")

    def test_a_symlinked_folder_is_refused(self):
        real = self.root / "elsewhere"
        real.mkdir()
        (real / "s.jsonl").write_text(bot("hidden", "2026-11-13T10:00:00.000Z") + "\n")
        (self.claude / "q").symlink_to(real)
        self.assertEqual(self.view(self.claude / "q" / "s.jsonl")["rows"], [])

    def test_outside_the_harness_folder_is_refused(self):
        f = self.root / "loose.jsonl"
        f.write_text(bot("loose", "2026-11-13T10:00:00.000Z") + "\n")
        self.assertEqual(self.view(f)["rows"], [])
        self.assertEqual(self.view(self.claude / "p" / ".." / ".." / "loose.jsonl")["rows"], [], "no climbing out with ..")

    def test_another_terminals_link_or_another_owner_is_refused(self):
        import crewboard
        from unittest import mock
        f = self.session()
        self.assertEqual(self.view(f, lk={"terminal": "t2", "transcript": str(f), "harness": "claude"})["rows"], [])
        me = os.getuid()
        with mock.patch.object(crewboard.os, "getuid", lambda: me + 1):
            self.assertEqual(self.view(f)["rows"], [])

    def test_a_fifo_never_blocks(self):
        fifo = self.claude / "p" / "pipe.jsonl"
        os.mkfifo(fifo)
        code = ("import sys; sys.path.insert(0, 'bin'); import crewboard; from pathlib import Path;"
                f"crewboard.session_roots = lambda: {{'claude': Path({str(self.claude)!r}), 'agy': Path('/nonexistent')}};"
                "v = crewboard.read_view('t1', 'idle', {'t1': {'terminal': 't1', 'transcript': sys.argv[1]}}); print(v['refused'])")
        r = subprocess.run([sys.executable, "-c", code, str(fifo)], capture_output=True, text=True, timeout=5,
                           cwd=str(Path(__file__).resolve().parent.parent))
        self.assertEqual(r.stdout.strip(), "not its own session file", r.stderr)

    def test_the_byte_cap_holds_while_the_file_grows(self):
        import crewboard
        from unittest import mock
        f = self.session(text="initial")
        seen, real_fstat = [], os.fstat
        def fstat_then_append(fd):
            st = real_fstat(fd)
            with open(f, "a") as g:
                g.write(bot("x" * 4096, "2026-11-13T10:01:00.000Z") + "\n")
            return st
        with mock.patch.object(crewboard.os, "fstat", fstat_then_append), \
                mock.patch.object(crewboard, "_results", lambda data: seen.append(len(data)) or {}):
            self.view(f, tail=128)
        self.assertTrue(seen and max(seen) <= 128, seen)

    def test_one_odd_record_keeps_the_rest(self):
        f = self.session(text="valid reply")
        with open(f, "a") as g:
            g.write('["tool_result"]\n{"type":"user","message":{"content":[{"type":"tool_result"}]}}\n'
                    '{"type":"user","message":"tool_result"}\n{"type":"user","message":{"content":"tool_result"}}\n')
        v = self.view(f)
        self.assertIn("valid reply", [r.get("text") for r in v["rows"]])


class TheCommand(unittest.TestCase):
    def setUp(self):
        self.env, self.data = sandbox()

    def test_board_json(self):
        session = Path(self.env["HOME"]) / ".claude" / "projects" / "-p-worker" / "worker.jsonl"
        session.parent.mkdir(parents=True)
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
        r = pal(self.env, "computer", "Worker", "read", "--topic", "#general", "--json")
        self.assertEqual(r.returncode, 0, r.stderr)
        rd = json.loads(r.stdout)
        self.assertEqual((rd["topic"], [x["k"] for x in rd["rows"]][-3:]), ("general", ["you", "reply", "footer"]))
        self.assertNotEqual(pal(self.env, "computer", "Worker", "read", "--topic", "nope").returncode, 0)
        self.assertNotEqual(pal(self.env, "computer", "Worker", "read").returncode, 0)
        text = pal(self.env, "computer", "Worker", "board").stdout
        self.assertIn("needs you  approval", text)
        self.assertIn("waits for you", text)


if __name__ == "__main__":
    unittest.main()
