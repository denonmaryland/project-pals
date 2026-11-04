"""Chat view feeds. A channel running Claude Code keeps its conversation in a session file
(~/.claude/projects/<folder>/<session>.jsonl, tens of MB with request blobs). crewd turns each
linked one into a small feed the Crew chat view reads: data/crew-chats/<terminal>.jsonl, one
line per bubble ({kind: you | bot | tool | note | event, text, ...}), appended as the session grows.

Links (data/crew-sessions/<terminal>.json) come from the SessionStart hook, which is told the
session's file; channels already running when Crew was installed are matched by their
--resume id, or by finding their recent prompts on the terminal's screen.

The session file is Claude Code's own format, not a public one: anything unexpected is skipped,
and the chat view falls back to the terminal when a channel has no feed.
"""
import json
import os
import re
import subprocess
import time
from pathlib import Path

from crewlib import DATA, load_json, save_json, screen, is_agent

SESSIONS = DATA / "crew-sessions"
CHATS = DATA / "crew-chats"
CLAUDE = Path.home() / ".claude" / "projects"
CHUNK = 16 * 1024 * 1024   # read at most this much of a session file per tick


def link(terminal, transcript, session=None, source="hook", harness="claude"):
    old = load_json(SESSIONS / f"{terminal}.json", {})
    if old.get("transcript") == str(transcript):
        return False
    save_json(SESSIONS / f"{terminal}.json", {"terminal": terminal, "transcript": str(transcript), "session": session,
                                               "harness": harness, "source": source, "at": int(time.time() * 1000)})
    return True


def links():
    return {p.stem: load_json(p, {}) for p in SESSIONS.glob("*.json")} if SESSIONS.exists() else {}


# ── Claude Code session entries → bubbles ─────────────────────────────────────────────────────

REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
HC_TAG = re.compile(r"^\s*<hc[^>]*>\s*", re.S)
FROM_BOT = re.compile(r"^\[from ([^,\]]+), a bot, not DeNon\]\s*(?:asks:\s*)?")
FROM_ROOM = re.compile(r"^\[#([^\]]+)\] ([^:\n]+?)(?: \(a bot, not DeNon\))?(?: handed you this)?:\s*")
FROM_DENON = re.compile(r"^\[from DeNon\]\s*(?:asks:\s*)?")
CREW = re.compile(r"^\[crew\]\s*")
ROUTINE = re.compile(r"^\[routine: ([^\]]+)\]\s*")
TAIL_HINT = re.compile(r"\n\((?:Reply in the room|Answer [^)]*|DeNon [^)]*)[^)]*\)\s*$", re.S)


def ms(ts):
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)
    except (ValueError, AttributeError, TypeError):
        return int(time.time() * 1000)


def tool_what(name, inp):
    inp = inp or {}
    base = lambda p: os.path.basename(str(p or "")) or "a file"
    if name == "Bash":
        return ("command", (inp.get("description") or str(inp.get("command", "")).split("\n")[0])[:90])
    if name in ("Edit", "MultiEdit", "NotebookEdit"):
        return ("edit", base(inp.get("file_path") or inp.get("notebook_path")))
    if name == "Write":
        return ("write", base(inp.get("file_path")))
    if name == "Read":
        return ("read", base(inp.get("file_path")))
    if name in ("Grep", "Glob"):
        return ("search", str(inp.get("pattern", ""))[:60])
    if name in ("WebFetch", "WebSearch"):
        return ("web", str(inp.get("url") or inp.get("query") or "")[:80])
    if name in ("Agent", "Task"):
        return ("agent", str(inp.get("description", ""))[:80])
    if name.startswith("mcp__"):
        return ("tool", name.split("__")[-1].replace("_", " "))
    return ("tool", name)


def parse_user(e, at):
    c = (e.get("message") or {}).get("content")
    texts, images = [], 0
    if isinstance(c, str):
        texts.append(c)
    elif isinstance(c, list):
        for b in c:
            if b.get("type") == "text":
                texts.append(b.get("text", ""))
            elif b.get("type") == "image":
                images += 1
            # tool results are the tools' own output: shown through the tool line, not as a message
    text = REMINDER.sub("", "\n".join(texts)).strip()
    text = HC_TAG.sub("", text).strip()
    if not text and not images:
        return []
    if e.get("isCompactSummary"):
        return [{"kind": "event", "text": "Earlier conversation was summarized", "at": at}]
    if text.startswith("<command-name>"):
        m = re.search(r"<command-name>/?([^<]+)</command-name>", text)
        return [{"kind": "event", "text": f"/{m.group(1).strip()}" if m else "a command", "at": at}]
    if text.startswith(("<local-command", "<command-message>", "<bash-", "Caveat: ")):
        return []
    if text.startswith("[Request interrupted"):
        return [{"kind": "event", "text": "Stopped", "at": at}]
    text = TAIL_HINT.sub("", text).strip()
    for pat, label in ((FROM_BOT, None), (FROM_ROOM, "room"), (ROUTINE, "routine")):
        m = pat.match(text)
        if m:
            sender = f"{m.group(2).strip()} in #{m.group(1)}" if label == "room" else f"Routine: {m.group(1)}" if label == "routine" else m.group(1).strip()
            return [{"kind": "note", "from": sender, "text": text[m.end():].strip(), "at": at}]
    if CREW.match(text):
        return [{"kind": "note", "from": "Crew", "text": CREW.sub("", text).strip(), "at": at}]
    text = FROM_DENON.sub("", text)
    return [{"kind": "you", "text": text, "images": images, "at": at}]


def parse_claude(line):
    if '"type":"user"' not in line and '"type":"assistant"' not in line:
        return []
    try:
        e = json.loads(line)
    except ValueError:
        return []
    if e.get("isSidechain") or e.get("isMeta"):
        return []
    at = ms(e.get("timestamp"))
    if e.get("type") == "user":
        return parse_user(e, at)
    if e.get("type") != "assistant":
        return []
    out = []
    for b in (e.get("message") or {}).get("content") or []:
        if b.get("type") == "text" and b.get("text", "").strip():
            out.append({"kind": "bot", "text": b["text"].strip(), "at": at})
        elif b.get("type") == "tool_use":
            verb, what = tool_what(b.get("name", ""), b.get("input"))
            out.append({"kind": "tool", "verb": verb, "what": what, "at": at})
    return out


# ── keeping feeds current ─────────────────────────────────────────────────────────────────────

STATUS = DATA / "crew-status"


def link_from_status():
    """The status line (crew-statusline) names each channel's session file: the surest link."""
    for f in STATUS.glob("*.json") if STATUS.exists() else []:
        st = load_json(f, {})
        if st.get("transcript_path"):
            link(f.stem, st["transcript_path"], st.get("session_id"), "statusline")


def sync(terms, log=print):
    """Append what's new in each linked session to its channel's feed."""
    CHATS.mkdir(parents=True, exist_ok=True)
    link_from_status()
    for terminal, lk in links().items():
        if terminal not in terms:
            continue
        path = Path(lk.get("transcript", ""))
        if not path.exists():
            continue
        state_path = CHATS / f"{terminal}.state.json"
        state = load_json(state_path, {})
        feed = CHATS / f"{terminal}.jsonl"
        if state.get("transcript") != str(path):
            state = {"transcript": str(path), "offset": 0}
            feed.write_text("")
        size = path.stat().st_size
        if size < state["offset"]:          # rewritten: start over
            state["offset"] = 0
            feed.write_text("")
        if size == state["offset"]:
            continue
        with open(path, "rb") as f:
            f.seek(state["offset"])
            chunk = f.read(CHUNK)
        end = chunk.rfind(b"\n")
        if end < 0:
            continue
        entries = []
        for raw in chunk[:end].split(b"\n"):
            entries += parse_claude(raw.decode("utf-8", "replace"))
        state["offset"] += end + 1
        if entries:
            with open(feed, "a") as f:
                for x in entries:
                    f.write(json.dumps(x) + "\n")
        save_json(state_path, state)


def project_dir(cwd):
    return CLAUDE / re.sub(r"[^a-zA-Z0-9]", "-", cwd or "")


def recent_prompts(path, n=3):
    """The last few things typed to a session (scanning its last 3 MB)."""
    size = path.stat().st_size
    with open(path, "rb") as f:
        f.seek(max(0, size - 3 * 1024 * 1024))
        lines = f.read().split(b"\n")[1:]
    out = []
    for raw in reversed(lines):
        for x in parse_claude(raw.decode("utf-8", "replace")):
            if x["kind"] in ("you", "note") and len(x["text"]) >= 12:
                out.append(x["text"])
        if len(out) >= n:
            break
    return out


def squash(s):
    return re.sub(r"\s+", "", s)


def guess(terms, log=print):
    """Link Claude Code channels that started before the hook was installed."""
    known = links()
    for addr, t in terms.items():
        if addr in known or not is_agent(t) or t.get("agent") != "claude-code":
            continue
        info = {}
        try:
            info = json.loads(subprocess.run(["hc", "get", addr, "--json"], capture_output=True, text=True, timeout=10).stdout)
        except (ValueError, OSError, subprocess.TimeoutExpired):
            continue
        fg = info.get("foreground") or {}
        cwd = fg.get("cwd") or info.get("cwd")
        d = project_dir(cwd)
        if not d.exists():
            continue
        # Started with --resume <id>: that's its session.
        argv = fg.get("argv") or []
        if "--resume" in argv and argv.index("--resume") + 1 < len(argv):
            p = d / f"{argv[argv.index('--resume') + 1]}.jsonl"
            if p.exists():
                link(addr, p, p.stem, "resume")
                log(f"linked {addr} to its session (resume)")
                continue
        # Else: the session whose recent prompts are on this terminal's screen, if exactly one.
        shown = squash("\n".join(screen(addr, 600)))
        if len(shown) < 40:
            continue
        cands = [p for p in d.glob("*.jsonl") if time.time() - p.stat().st_mtime < 3 * 86400]
        hits = []
        for p in cands:
            try:
                prompts = recent_prompts(p)
            except OSError:
                continue
            if any(len(squash(x)) >= 12 and squash(x)[:48] in shown for x in prompts):
                hits.append(p)
        taken = {lk.get("transcript") for lk in known.values()}
        hits = [p for p in hits if str(p) not in taken]
        if len(hits) == 1:
            link(addr, hits[0], hits[0].stem, "screen")
            known[addr] = {"transcript": str(hits[0])}
            log(f"linked {addr} to {hits[0].name} (matched its screen)")
