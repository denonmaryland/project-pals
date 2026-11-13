"""A pal's board (crew-boards/pal-page/design.md, DeNon's pick G · Board; T108): what the board view
(mods/crew-palboard) shows when you click a pal, and what `pal computer <Pal> board` prints.

It is a VIEW built on crewcomputer.today_view, so the Computer's Today and the board can't disagree
about a topic's state. On top of that it adds, per topic:

  waits_for  "you" (it needs the owner), "itself" (a turn is running) or "nothing": the board's column
  needs      what it needs from the owner: a held approval, a Home ask, a needs-you card, a prompt
  since      when its state began (the feed's working / finished / blocked events)
  line       one or two sentences in the pal's own words, read from its session file, with where
             they came from (`from`: turn, reply, asked) and when. No second model writes them.
  branch     its worktree's branch against its base: commits ahead, lines + and − (two git calls,
             and only for topics with a pal running: a pal can have dozens of dormant branches)
  stuck      minutes, when crewd marked it stalled; blocked: its blocked task and the reason

and for the pal: `needs` (all of them, oldest first, so the longest wait is on top) and `up_next`
(its open tasks no topic has claimed). The builders take what they read as arguments, so tests
drive them with plain data."""
import json
import os
import re
import stat as statmod
import subprocess
import time
from pathlib import Path

from crewlib import norm

TAIL = 384 * 1024     # how much of a session file's end is read for a topic's line
LINE_MAX = 240        # a line is whole sentences up to about this many characters
UP_NEXT = 3           # unclaimed tasks shown on the board (the Tasks list has them all)

FENCE = re.compile(r"```.*?(?:```|\Z)", re.S)
HEADING = re.compile(r"^\s{0,3}#{1,6}\s")
LIST_ITEM = re.compile(r"^\s*(?:[-*+•]|\d+[.)])\s+")
RULE = re.compile(r"^\s*(?:[-*_=]\s*){3,}$")
SENTENCE_END = re.compile(r"(?<=[.!?])[\"'”’)\]]*\s+(?=[\"'“‘(\[]?[A-Z0-9])")


def _plain(s):
    """Inline Markdown off: links keep their text, emphasis and code marks go."""
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"(\*\*|__)(.+?)\1", r"\2", s)
    s = re.sub(r"(?<![\w*])[*_]([^*_\n]+)[*_](?![\w*])", r"\1", s)
    s = s.replace("`", "")
    return " ".join(s.split())


def lead(text, limit=LINE_MAX):
    """The first one or two plain sentences of a reply: headings, lists, tables, code blocks and
    one-word lines ("Done.") are skipped; a sentence is never cut in the middle unless the very
    first one is longer than `limit` (then it ends at a word, with an ellipsis)."""
    paras, cur, items = [], [], []
    for raw in FENCE.sub("\n", str(text or "")).splitlines():
        line = raw.strip()
        if not line:
            if cur:
                paras.append(" ".join(cur))
                cur = []
            continue
        if HEADING.match(raw) or RULE.match(line) or line.startswith(("|", ">", "<")):
            continue
        if LIST_ITEM.match(raw):
            items.append(LIST_ITEM.sub("", raw).strip())
            continue
        if re.fullmatch(r"(\*\*|__).{1,60}\1:?", line):      # a bold line standing in for a heading
            continue
        cur.append(line)
    if cur:
        paras.append(" ".join(cur))
    paras = [p for p in (_plain(p) for p in paras) if p]
    many = [p for p in paras if len(p.split()) > 1]         # "Done." alone says nothing
    pick = (many or paras or [p for p in (_plain(i) for i in items) if p] or [""])[0]
    if not pick:
        return ""
    parts = SENTENCE_END.split(pick)
    out = parts[0]
    if len(out) > limit:
        cut = out[:limit].rsplit(" ", 1)[0].rstrip(",;:")
        return cut + "…"
    for nxt in parts[1:2]:                                   # a second sentence when it fits whole
        if len(out) + 1 + len(nxt) <= limit:
            out += " " + nxt
    return out


# ── Opening a session file safely (T194, Codex T193) ──────────────────────────────────────────
# A topic's link record (crew-sessions/<terminal>.json) names its session file. Before reading it:
# the record must be this terminal's; the file must sit under the harness's own folder, reached
# with no symlink anywhere below that folder and no "..", be a regular file this user owns, and it
# is opened non-blocking without following a symlink. Then exactly the last `tail` bytes (at most)
# are read from the size the open file reports, so a growing file can't push past the cap.

def session_roots():
    home = Path.home()
    return {"claude": home / ".claude" / "projects", "agy": home / ".gemini" / "antigravity-cli"}


def _under(root, path):
    """`path`'s parts below `root`, when it is under it with no "..", else None."""
    try:
        rel = Path(os.path.normpath(str(path))).relative_to(os.path.normpath(str(root)))
    except ValueError:
        return None
    parts = rel.parts
    return parts if parts and ".." not in Path(str(path)).parts else None


def safe_tail(path, harness, tail):
    """(bytes, size) of the end of an allowed session file, or None when it isn't one."""
    root = session_roots().get("agy" if harness == "agy" else "claude")
    parts = _under(root, path) if root else None
    if not parts:
        return None
    # No symlink in any folder below the root (the root itself may be one: dotfiles setups).
    cur = Path(root)
    for part in parts[:-1]:
        cur = cur / part
        try:
            if not statmod.S_ISDIR(os.lstat(cur).st_mode):
                return None
        except OSError:
            return None
    flags = os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
    try:
        fd = os.open(str(cur / parts[-1]), flags)
    except OSError:
        return None
    try:
        st = os.fstat(fd)
        if not statmod.S_ISREG(st.st_mode) or st.st_uid != os.getuid():
            return None
        size = st.st_size
        start = max(0, size - tail)
        os.lseek(fd, start, os.SEEK_SET)
        want, chunks = size - start, []
        while want > 0:
            b = os.read(fd, min(want, 1 << 20))
            if not b:
                break
            chunks.append(b)
            want -= len(b)
        data = b"".join(chunks)
    except OSError:
        return None
    finally:
        os.close(fd)
    if start:
        nl = data.find(b"\n")
        data = data[nl + 1:] if nl >= 0 else b""   # the first line is cut
    return data, size


def _link_ok(lk, terminal):
    """A link record that names this terminal (or none, from older installs) and a transcript."""
    return bool(lk) and bool(lk.get("transcript")) and lk.get("terminal") in (None, terminal)


def tail_bubbles(path, agy=False, tail=TAIL):
    """The bubbles (crewchat's: you, note, bot, tool, event) in the end of a session file."""
    import crewchat
    p = Path(path)
    if agy:
        p = crewchat.agy_transcript_path(p)
    got = safe_tail(p, "agy" if agy else "claude", tail)
    if not got:
        return []
    data = got[0]
    out, state = [], {}
    for raw in data.split(b"\n"):
        try:
            line = raw.decode("utf-8", "replace")
            out += crewchat.parse_agy(line, state) if agy else crewchat.parse_claude(line)
        except Exception:      # a session file is each harness's own format: skip what we can't read
            continue
    return out


def topic_line(bubbles, state):
    """{text, from, at, asked} for a topic, from its recent bubbles. Working: the newest thing it
    said this turn (`from: turn`), or before it has said anything "Started on: …" from what it was
    asked (`from: asked`). Otherwise the lead of its last reply (`from: reply`)."""
    ask_i = max((i for i, b in enumerate(bubbles) if b.get("kind") in ("you", "note") and (b.get("text") or "").strip()), default=None)
    ask = bubbles[ask_i] if ask_i is not None else None
    said = [b for b in bubbles if b.get("kind") == "bot" and lead(b.get("text"))]
    this_turn = [b for b in bubbles[(ask_i or 0):] if b.get("kind") == "bot" and lead(b.get("text"))] if ask else said
    asked = None
    if ask:
        asked = {"by": "you" if ask["kind"] == "you" else (ask.get("from") or "a pal"), "at": ask.get("at") or 0,
                 "text": lead(ask.get("text"), 160)}
    if state == "working":
        if this_turn:
            b = this_turn[-1]
            return {"text": lead(b["text"]), "from": "turn", "at": b.get("at") or 0, "asked": asked}
        if ask and asked["text"]:
            return {"text": "Started on: " + asked["text"], "from": "asked", "at": ask.get("at") or 0, "asked": asked}
        return None
    b = (this_turn or said or [None])[-1]
    if not b:
        return None
    return {"text": lead(b["text"]), "from": "reply", "at": b.get("at") or 0, "asked": asked}


def read_line(terminal, state, links):
    """A topic's line from its linked session file; None when it has none (Codex pals, shells)."""
    import crewchat
    lk = (links or {}).get(terminal)
    if not _link_ok(lk, terminal):
        return None
    raw = Path(lk["transcript"])
    return topic_line(tail_bubbles(raw, agy=crewchat.is_agy_link(lk, raw)), state)


def _git(path, *args):
    r = subprocess.run(["git", "-C", str(path), *args], capture_output=True, text=True, timeout=4)
    if r.returncode != 0:
        raise OSError(r.stderr.strip() or "git failed")
    return r.stdout


def branch_facts(wt, git=_git):
    """{name, base, ahead, added, removed} for a topic's worktree ({path, branch, base}); None when
    it has none or git can't answer in time. Lines count everything since the branch left its base,
    committed or not (git diff --merge-base: the work tree against where the branch forked)."""
    if not wt or not wt.get("path"):
        return None
    p, base = wt["path"], wt.get("base") or "main"
    try:
        ahead = int(git(p, "rev-list", "--count", f"{base}..HEAD").strip() or 0)
        added = removed = 0
        for l in git(p, "diff", "--numstat", "--merge-base", base).splitlines():
            a, r_, _f = (l.split("\t", 2) + ["", ""])[:3]
            added += int(a) if a.isdigit() else 0
            removed += int(r_) if r_.isdigit() else 0
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    return {"name": wt.get("branch") or "", "base": base, "ahead": ahead, "added": added, "removed": removed}


def _topic_of(spec):
    return str(spec).split("#", 1)[1] if spec and "#" in str(spec) else None


def _is_pal(spec, name):
    return bool(spec) and norm(str(spec).split("#")[0]) == norm(name)


def _clip(s, n):
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[:n - 1].rstrip() + "…"


def needs_of(name, topics, approvals=(), asks=(), cards=(), msgs=None, blocked_at=None):
    """What this pal needs from the owner, oldest first: held approvals, open Home asks, needs-you
    cards, and topics waiting at a prompt. `topic` is None for one that belongs to the pal as a whole."""
    out, known = [], {norm(t["topic"]): t["topic"] for t in topics}
    canon = lambda tp: known.get(norm(tp)) if tp else None
    for a in approvals:
        if a.get("status", "pending") != "pending" or not _is_pal(a.get("bot"), name):
            continue
        out.append({"kind": "approval", "id": a.get("id"), "topic": canon(a.get("channel")), "title": _clip(a.get("command"), 200),
                    "detail": _clip(a.get("why") or a.get("rule"), 200), "rule": a.get("rule") or "", "since": a.get("at") or 0})
    for x in asks:
        if x.get("kind") != "ask" or x.get("status") != "open":
            continue
        spec = x.get("topic") if _is_pal(x.get("topic"), name) else x.get("by")
        if not _is_pal(spec, name):
            continue
        out.append({"kind": "ask", "id": x.get("id"), "topic": canon(_topic_of(spec)), "title": _clip(x.get("title"), 200),
                    "detail": _clip(x.get("body"), 320), "options": list(x.get("options") or []), "does": list(x.get("does") or []),
                    "recommend": x.get("recommend") or "", "why": _clip(x.get("why"), 320), "since": x.get("at") or 0})
    for c in cards:
        if c.get("status") != "needs you":
            continue
        out.append({"kind": "card", "id": c.get("id"), "topic": canon(_topic_of(c.get("to"))), "title": _clip(c.get("title"), 200),
                    "detail": _clip((c.get("last") or {}).get("note") or (c.get("receipts") or [{}])[-1].get("note"), 240),
                    "from": c.get("from") or "", "since": c.get("at_ms") or 0})
    for t in topics:
        if t.get("state") == "blocked":
            out.append({"kind": "prompt", "id": t.get("terminal"), "topic": t["topic"],
                        "title": _clip((msgs or {}).get(t.get("terminal")) or "It's waiting at a question in its terminal.", 240),
                        "detail": "", "since": (blocked_at or {}).get(norm(t["topic"])) or 0})
    return sorted(out, key=lambda n: (n["since"] or 0, str(n["id"])))


def state_times(feed, name):
    """{topic: {working, finished, blocked}}: the newest feed time of each kind, per topic of this pal."""
    out = {}
    for e in feed:
        if e.get("kind") in ("working", "finished", "blocked") and norm(e.get("bot") or "") == norm(name):
            d = out.setdefault(norm(e.get("channel") or ""), {})
            d[e["kind"]] = max(d.get(e["kind"], 0), e.get("at", 0))
    return out


def board_view(today, *, tasks=(), cards=(), feed=(), approvals=(), asks=(), lines=None, branches=None,
               stalled=None, msgs=None, now_ms=0):
    """today_view's output, grown into the board (see the module's notes for the fields)."""
    import crewcomputer
    name = today["pal"]
    times = state_times(feed, name)
    needs = needs_of(name, today["topics"], approvals, asks, cards, msgs,
                     {k: v.get("blocked", 0) for k, v in times.items()})
    topics = []
    for t in today["topics"]:
        k = norm(t["topic"])
        tm = times.get(k, {})
        mine = [n for n in needs if n["topic"] == t["topic"]]
        waits = "you" if mine else ("itself" if t["state"] == "working" else "nothing")
        since = {"working": tm.get("working", 0) if tm.get("working", 0) >= tm.get("finished", 0) else 0,
                 "blocked": tm.get("blocked", 0)}.get(t["state"], tm.get("finished", 0))
        st = (stalled or {}).get(t.get("terminal"))
        bt = next((x for x in tasks if x.get("status") == "blocked"
                   and norm(str(x.get("claimed_by") or x.get("assignee") or "")) == norm(f"{name}#{t['topic']}")), None)
        topics.append({**t, "waits_for": waits, "needs": [n["id"] for n in mine], "since": since or 0,
                       "finished_at": tm.get("finished", 0), "line": (lines or {}).get(t["topic"]),
                       "branch": (branches or {}).get(t["topic"]),
                       "stuck": max(1, int((now_ms - st.get("since", now_ms)) / 60000)) if st and t["state"] == "working" else 0,
                       "blocked": {"id": bt["id"], "title": bt["title"],
                                   "why": _clip(((bt.get("notes") or [{}])[-1] or {}).get("text"), 200)} if bt else None})
    td = crewcomputer.todo(name, list(tasks), [], now_ms or None)
    unclaimed = [r for r in td["next"] if not r["topic"]]
    return {**today, "topics": topics, "needs": needs, "up_next": unclaimed[:UP_NEXT], "up_next_total": len(unclaimed),
            "tasks_open": len(td["doing"]) + len(td["next"]) + len(td["blocked"]), "at": now_ms}



# ── Read: a topic's conversation as rows (T183, DeNon's pick A on h-4c9e54) ──────────────────────
# The pal board's Read mode shows one topic's recent conversation: your messages, its replies as
# Markdown, each stretch of tool calls as one chip that opens to the calls (done, failed, running),
# notes from pals and rooms with who sent them, and a footer under each turn. Read-only: the
# session file is only read, from its end.

READ_TAIL = 1536 * 1024   # how much of a session file's end Read looks at
READ_ROWS = 160           # the newest rows shown; the count of earlier ones is said
GAP_MS = 10 * 60000       # a time line before a message after a gap this long
OUT_MAX = 300             # characters of a call's output kept for its opened chip

VERB = {"read": ("Read", "file", "files"), "edit": ("Edited", "file", "files"), "write": ("Wrote", "file", "files"),
        "command": ("Ran", "command", "commands"), "search": ("Searched", "time", "times"), "web": ("Looked up", "page", "pages"),
        "agent": ("Asked", "helper", "helpers"), "tool": ("Used", "tool", "tools")}


def _results(data):
    """Claude Code tool results in raw session lines: {tool_use_id: (is_error, first output)}."""
    out = {}
    for raw in data.split(b"\n"):
        if b'"tool_result"' not in raw:
            continue
        try:
            e = json.loads(raw.decode("utf-8", "replace"))
            msg = e.get("message") if isinstance(e, dict) else None
            content = msg.get("content") if isinstance(msg, dict) else None
            if not isinstance(content, list):
                continue
            for b in content:
                if not (isinstance(b, dict) and b.get("type") == "tool_result" and isinstance(b.get("tool_use_id"), str)):
                    continue
                c = b.get("content")
                text = c if isinstance(c, str) else " ".join(str(x.get("text", "")) for x in c if isinstance(x, dict)) if isinstance(c, list) else ""
                out[b["tool_use_id"]] = (bool(b.get("is_error")), " ".join(str(text).split())[:OUT_MAX])
        except (ValueError, TypeError, AttributeError):   # one odd record never breaks the read
            continue
    return out


def chip_label(calls):
    """ "Read 2 files · Edited retry.ts · Ran 3 commands": one part per kind, in first-seen order."""
    order, by = [], {}
    for c in calls:
        if c["verb"] not in by:
            order.append(c["verb"])
            by[c["verb"]] = []
        by[c["verb"]].append(c)
    parts = []
    for v in order:
        word, one, many = VERB.get(v, VERB["tool"])
        cs = by[v]
        if len(cs) == 1 and cs[0].get("what") and v in ("read", "edit", "write"):
            parts.append(f"{word} {cs[0]['what']}")
        elif len(cs) == 1 and cs[0].get("what") and v == "search":
            parts.append(f"Searched “{cs[0]['what']}”")
        else:
            parts.append(f"{word} {len(cs)} {one if len(cs) == 1 else many}")
    return " · ".join(parts)


def _hm(ms_):
    return time.strftime("%H:%M", time.localtime(ms_ / 1000)) if ms_ else ""


def _sep(ms_, now_ms):
    t, n = time.localtime(ms_ / 1000), time.localtime(now_ms / 1000)
    if (t.tm_year, t.tm_yday) == (n.tm_year, n.tm_yday):
        return f"Today {_hm(ms_)}"
    if n.tm_yday - t.tm_yday == 1 and t.tm_year == n.tm_year:
        return f"Yesterday {_hm(ms_)}"
    return time.strftime("%a %b %-d %H:%M", t)


def _took(ms_):
    m = max(0, int(ms_ / 60000))
    return f"{m} min" if m < 60 else f"{m // 60} h {m % 60} m" if m % 60 else f"{m // 60} h"


def read_rows(bubbles, results=None, working=False, now_ms=None, limit=READ_ROWS):
    """crewchat bubbles → the rows Read shows: sep, you, note, event, reply, chip, footer.
    A chip's calls are done (a result came), failed (an error result), or running (no result, in
    the turn still going while the topic works); a call with no result in an older turn is done."""
    now_ms = now_ms or int(time.time() * 1000)
    results = results or {}
    rows, chip, turn = [], None, None
    last_at, turn_no = 0, 0

    def close_turn(ended_at, still=False):
        nonlocal turn
        if turn and (turn["tools"] or turn["replies"]):
            took = (ended_at or turn["start"]) - turn["start"]
            n = turn["tools"]
            text = f"{_hm(ended_at)} · {'working' if still else 'worked'} {_took(took)}" + (f" · {n} tool{'s' if n != 1 else ''}" + (" so far" if still else "") if n else "")
            rows.append({"k": "footer", "text": text})
        turn = None

    for b in bubbles:
        k, at = b.get("kind"), b.get("at") or 0
        if k in ("you", "note", "event") and (b.get("text") or b.get("images")):
            close_turn(last_at)
            chip = None
            if at and (not last_at or at - last_at >= GAP_MS):
                rows.append({"k": "sep", "text": _sep(at, now_ms)})
            if k == "you":
                rows.append({"k": "you", "text": b.get("text") or "", "at": at, "images": b.get("images") or 0})
            elif k == "note":
                rows.append({"k": "note", "from": b.get("from") or "", "text": b.get("text") or "", "at": at})
            else:
                rows.append({"k": "event", "text": b.get("text") or "", "at": at})
            if k != "event":
                turn_no += 1
                turn = {"start": at, "tools": 0, "replies": 0}
        elif k == "bot" and (b.get("text") or "").strip():
            chip = None
            rows.append({"k": "reply", "text": b["text"], "at": at})
            if turn is None:
                turn = {"start": at, "tools": 0, "replies": 0}
            turn["replies"] += 1
        elif k == "tool":
            if chip is None:
                chip = {"k": "chip", "calls": [], "at": at, "turn": turn_no}
                rows.append(chip)
            r = results.get(b.get("id")) if b.get("id") else None
            chip["calls"].append({"verb": b.get("verb") or "tool", "what": b.get("what") or "",
                                  "state": ("failed" if r[0] else "done") if r else "open", "out": r[1] if r else ""})
            if turn is None:
                turn = {"start": at, "tools": 0, "replies": 0}
            turn["tools"] += 1
        else:
            continue
        last_at = at or last_at
    close_turn(now_ms if working else last_at, still=working)
    # Calls without a result: running while the topic works and they belong to its current turn,
    # else done (an older turn's call whose result was never written isn't running now).
    chips = [r for r in rows if r["k"] == "chip"]
    for c in chips:
        current = c.pop("turn", None) == turn_no
        for call in c["calls"]:
            if call["state"] == "open":
                call["state"] = "running" if working and current else "done"
        c["text"] = chip_label(c["calls"])
        c["state"] = "failed" if any(x["state"] == "failed" for x in c["calls"]) else "running" if any(x["state"] == "running" for x in c["calls"]) else "done"
    earlier = max(0, len(rows) - limit)
    return rows[earlier:], earlier


def read_view(terminal, state, links, now_ms=None, tail=READ_TAIL):
    """A topic's conversation for Read: {rows, earlier, path, size, harness}. No linked session (a
    Codex pal, a shell): rows empty and `path` None, and the view says to read it in the terminal."""
    import crewchat
    none = {"rows": [], "earlier": 0, "path": None, "size": 0, "harness": None, "refused": None}
    lk = (links or {}).get(terminal)
    if not lk or not lk.get("transcript"):
        return none
    if not _link_ok(lk, terminal):
        return {**none, "refused": "not its own session file"}
    raw = Path(lk["transcript"])
    agy = crewchat.is_agy_link(lk, raw)
    p = crewchat.agy_transcript_path(raw) if agy else raw
    got = safe_tail(p, "agy" if agy else "claude", tail)
    if not got:
        return {**none, "refused": "not its own session file"}
    data, size = got
    bubbles, st = [], {}
    for line in data.split(b"\n"):
        try:
            s = line.decode("utf-8", "replace")
            bubbles += crewchat.parse_agy(s, st) if agy else crewchat.parse_claude(s)
        except Exception:      # each harness's own format: skip what we can't read
            continue
    rows, earlier = read_rows(bubbles, {} if agy else _results(data), state == "working", now_ms)
    return {"rows": rows, "earlier": earlier, "path": str(p), "size": size, "harness": "agy" if agy else "claude",
            "cut": size > tail, "refused": None}
