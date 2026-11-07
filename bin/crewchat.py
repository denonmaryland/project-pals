"""Chat view feeds. Channels running Claude Code or Antigravity CLI keep their conversations in
session files (~/.claude/projects/<folder>/<session>.jsonl or ~/.gemini/antigravity-cli/brain/<id>/
.system_generated/logs/transcript_full.jsonl). crewd turns each linked one into a small feed the
Project Pals chat view reads: data/crew-chats/<terminal>.jsonl, one line per bubble
({kind: you | bot | tool | note | event, text, ...}), appended as the session grows.

Links (data/crew-sessions/<terminal>.json) come from the SessionStart hook, which is told the
session's file; channels already running when Project Pals was installed are matched by their
--resume / --conversation id, or by finding their recent prompts on the terminal's screen.

Session files are each harness's own format: anything unexpected is skipped, and the chat view
falls back to the terminal when a channel has no feed.
"""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

from crewlib import DATA, load_json, save_json, screen, is_agent, OWNER

SESSIONS = DATA / "crew-sessions"
CHATS = DATA / "crew-chats"
AGY_MODELS_CACHE = DATA / "agy-models.json"
CLAUDE = Path.home() / ".claude" / "projects"
AGY_BRAIN = Path.home() / ".gemini" / "antigravity-cli" / "brain"
AGY_SETTINGS = Path.home() / ".gemini" / "antigravity-cli" / "settings.json"
CHUNK = 16 * 1024 * 1024   # read at most this much of a session file per tick


def link(terminal, transcript, session=None, source="hook", harness="claude"):
    old = load_json(SESSIONS / f"{terminal}.json", {})
    if old.get("transcript") == str(transcript) and old.get("harness") == harness:
        return False
    save_json(SESSIONS / f"{terminal}.json", {"terminal": terminal, "transcript": str(transcript), "session": session,
                                               "harness": harness, "source": source, "at": int(time.time() * 1000)})
    return True


def links():
    return {p.stem: load_json(p, {}) for p in SESSIONS.glob("*.json")} if SESSIONS.exists() else {}


# ── session entries → bubbles ─────────────────────────────────────────────────────────────────

REMINDER = re.compile(r"<system-reminder>.*?</system-reminder>", re.S)
HC_TAG = re.compile(r"^\s*<hc[^>]*>\s*", re.S)
FROM_BOT = re.compile(rf"^\[from ([^,\]]+), a (?:bot|buddy|pal), not {re.escape(OWNER)}\]\s*(?:asks:\s*)?")
FROM_ROOM = re.compile(rf"^\[#([^\]]+)\] ([^:\n]+?)(?: \(a (?:bot|buddy|pal), not {re.escape(OWNER)}\))?(?: handed you this)?:\s*")
FROM_OWNER = re.compile(rf"^\[from {re.escape(OWNER)}\]\s*(?:asks:\s*)?")
CREW = re.compile(r"^\[(?:crew|botz|buddy|pal)\]\s*")
ROUTINE = re.compile(r"^\[routine: ([^\]]+)\]\s*")
TAIL_HINT = re.compile(rf"\n\((?:Reply in the room|Answer [^)]*|{re.escape(OWNER)} [^)]*)[^)]*\)\s*$", re.S)

# Antigravity CLI wraps user messages in XML tags inside transcript_full.jsonl / transcript.jsonl.
AGY_REQ = re.compile(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", re.S)
AGY_META = re.compile(r"<(?:ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|CONTEXT_SUMMARY)>.*?</(?:ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|CONTEXT_SUMMARY)>", re.S)
AGY_MODEL_CHANGE = re.compile(r"changed setting `Model Selection`(?:\s+from\s+([^\n]+?))?\s+to\s+([^\n]+?)(?:\.(?:\s|$)|$)")
AGY_EDIT_DONE = re.compile(r"Made \d+ replacements? in .+ \(\+(\d+)/-(\d+) lines\)\.")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")

AGY_KNOWN_MODELS = {
    "gemini-4-argon-high": ("Gemini 4 Argon", "high", 1_000_000),
    "gemini-4-argon-medium": ("Gemini 4 Argon", "medium", 1_000_000),
    "gemini-4-argon-low": ("Gemini 4 Argon", "low", 1_000_000),
    "gemini-3.8-flash-high": ("Gemini 3.8 Flash", "high", 1_000_000),
    "gemini-3.8-flash-medium": ("Gemini 3.8 Flash", "medium", 1_000_000),
    "gemini-3.8-flash-low": ("Gemini 3.8 Flash", "low", 1_000_000),
    "claude-opus-5-5-high": ("Claude Opus 5.5", "high", 200_000),
    "claude-opus-5-5-medium": ("Claude Opus 5.5", "medium", 200_000),
    "claude-opus-5-5-low": ("Claude Opus 5.5", "low", 200_000),
    "claude-sonnet-5-5-high": ("Claude Sonnet 5.5", "high", 200_000),
    "claude-sonnet-5-5-medium": ("Claude Sonnet 5.5", "medium", 200_000),
    "claude-sonnet-5-5-low": ("Claude Sonnet 5.5", "low", 200_000),
    "gpt-oss-120b-medium": ("GPT-OSS 120B", "medium", 128_000),
}


def _unq(val):
    """transcript.jsonl quotes string tool args ('"..."'), while transcript_full.jsonl keeps raw values."""
    if val is None:
        return ""
    if isinstance(val, str):
        s = val.strip()
        if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
            try:
                return str(json.loads(s))
            except ValueError:
                return s[1:-1]
        return val
    return str(val)


def ms(ts):
    try:
        from datetime import datetime
        return int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)
    except (ValueError, AttributeError, TypeError):
        return int(time.time() * 1000)


def tool_what(name, inp):
    inp = inp or {}
    base = lambda p: os.path.basename(str(p or "")) or "a file"
    # Claude Code tools
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
    # Antigravity CLI tools
    if name == "run_command":
        return ("command", (_unq(inp.get("toolSummary")) or _unq(inp.get("CommandLine")).split("\n")[0])[:90])
    if name in ("edit_file", "multi_edit_file", "replace_file_content", "multi_replace_file_content"):
        return ("edit", base(_unq(inp.get("Path") or inp.get("TargetFile"))))
    if name in ("write_file", "write_to_file"):
        return ("write", base(_unq(inp.get("Path") or inp.get("TargetFile"))))
    if name in ("read_file", "view_file", "view_file_outline", "view_code_item"):
        return ("read", base(_unq(inp.get("Path") or inp.get("AbsolutePath") or inp.get("File"))))
    if name in ("grep_search", "find_by_name", "list_dir"):
        return ("search", _unq(inp.get("Query") or inp.get("Pattern") or inp.get("SearchPath") or inp.get("DirectoryPath"))[:60])
    if name in ("search_web", "read_url_content"):
        return ("web", _unq(inp.get("query") or inp.get("Url") or inp.get("url"))[:80])
    if name in ("invoke_subagent", "send_message"):
        return ("agent", _unq(inp.get("Role") or inp.get("TypeName") or inp.get("Recipient"))[:80])
    if name.startswith("mcp__"):
        return ("tool", name.split("__")[-1].replace("_", " "))
    if name.startswith("mcp_"):
        return ("tool", name[4:].replace("_", " "))
    return ("tool", name.replace("_", " "))


def classify_user_text(text, images, at, compacted=False):
    text = HC_TAG.sub("", text).strip()
    if not text and not images:
        return [{"kind": "event", "text": "Earlier conversation was summarized", "at": at}] if compacted else []
    if compacted:
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
        return [{"kind": "note", "from": "Project Pals", "text": CREW.sub("", text).strip(), "at": at}]
    text = FROM_OWNER.sub("", text)
    return [{"kind": "you", "text": text, "images": images, "at": at}]


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
    return classify_user_text(text, images, at, compacted=bool(e.get("isCompactSummary")))


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


# ── Antigravity CLI transcripts & status metadata ─────────────────────────────────────────────

def agy_transcript_path(path):
    """Prefer transcript_full.jsonl beside transcript.jsonl so content and tool args aren't truncated."""
    p = Path(path)
    if p.name == "transcript.jsonl":
        full = p.parent / "transcript_full.jsonl"
        if full.exists():
            return full
    return p


def is_agy_link(lk, path):
    return (lk.get("harness") == "antigravity"
            or "antigravity" in str(path)
            or Path(path).name in ("transcript.jsonl", "transcript_full.jsonl"))


def _sub_for_agy_model(mid):
    low = mid.lower()
    for pat, sub in (
        ("argon-high", "strongest, deep thinking"),
        ("argon-medium", "balanced reasoning"),
        ("argon-low", "fast reasoning"),
        ("flash-high", "fast, high effort"),
        ("flash-medium", "fast, balanced"),
        ("flash-low", "fastest, light tasks"),
        ("gpt-oss", "open weights"),
    ):
        if pat in low:
            return sub
    m = re.search(r"-(high|medium|low)$", low)
    return f"{m.group(1)} effort" if m else ""


def _entry_to_tuple(mid, label):
    m = re.match(r"^(.+?)\s*\((High|Medium|Low)\)$", label, re.I)
    disp = m.group(1).strip() if m else label.strip()
    eff_m = re.search(r"-(high|medium|low)$", mid.lower())
    eff = m.group(2).lower() if m else (eff_m.group(1) if eff_m else None)
    low = mid.lower()
    win = 200_000 if "claude" in low else 128_000 if "gpt-oss" in low else 1_000_000
    return (disp, eff, win)


def agy_models_map():
    out = dict(AGY_KNOWN_MODELS)
    cached = load_json(AGY_MODELS_CACHE, None)
    for item in (cached if isinstance(cached, list) else []):
        k = str(item.get("key") or "").strip().lower()
        nm = str(item.get("name") or "").strip()
        if k and nm:
            out[k] = _entry_to_tuple(k, nm)
    return out


def refresh_agy_models(max_age=86400):
    """Cache `agy models` into data/agy-models.json so UI pickers and metadata stay current."""
    if AGY_MODELS_CACHE.exists() and time.time() - AGY_MODELS_CACHE.stat().st_mtime < max_age:
        return
    exe = "/usr/bin/agy" if Path("/usr/bin/agy").is_file() else shutil.which("agy")
    if not exe:
        return
    try:
        r = subprocess.run([exe, "models"], capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=15)
    except (OSError, subprocess.TimeoutExpired):
        return
    if r.returncode != 0:
        return
    items, seen = [], set()
    for raw_line in r.stdout.splitlines():
        clean = ANSI_RE.sub("", raw_line).rsplit("\r", 1)[-1].strip()
        m = re.match(r"^([a-z0-9][a-z0-9._-]*)(?:\t|\s{2,})(.+?)\s*$", clean)   # agy separates with a tab
        if not m:
            continue
        mid, label = m.group(1).strip(), m.group(2).strip()
        if mid not in seen:
            seen.add(mid)
            items.append({"key": mid, "name": label, "sub": _sub_for_agy_model(mid)})
    if items:
        save_json(AGY_MODELS_CACHE, items)


def agy_model_meta(raw):
    """Turn an agy model id or display label into (id, display_name, effort, context_window_size)."""
    known = agy_models_map()
    s = str(raw or "").strip()
    if not s or s.lower() == "auto":
        cfg = load_json(AGY_SETTINGS, {})
        picked = str(cfg.get("model") or cfg.get("selectedModel") or "").strip()
        if picked and picked.lower() != "auto":
            s = picked
        else:
            return ("auto", "Auto", None, 1_000_000)
    low = s.lower()
    if low in known:
        disp, eff, win = known[low]
        return (low, disp, eff, win)
    # Settings-change banner form: "Gemini 4 Argon (Medium)"
    m = re.match(r"^(.+?)\s*\((High|Medium|Low)\)$", s, re.I)
    if m:
        disp, eff = m.group(1).strip(), m.group(2).lower()
        for mid, (kdisp, keff, kwin) in known.items():
            if kdisp.lower() == disp.lower() and keff == eff:
                return (mid, kdisp, keff, kwin)
        win = 200_000 if "claude" in disp.lower() else 128_000 if "gpt-oss" in disp.lower() else 1_000_000
        return (re.sub(r"[^a-z0-9]+", "-", f"{disp}-{eff}".lower()).strip("-"), disp, eff, win)
    # Unknown slug form: e.g. "gemini-4-pro-high"
    m2 = re.match(r"^(.+)-(high|medium|low)$", low)
    eff = m2.group(2) if m2 else None
    stem = m2.group(1) if m2 else low
    disp = s if any(c.isupper() for c in s) else " ".join(w.upper() if w in ("gpt", "oss") else w.capitalize() for w in stem.split("-"))
    win = 200_000 if "claude" in low else 128_000 if "gpt-oss" in low else 1_000_000
    return (low, disp, eff, win)


def _line_count(s):
    t = _unq(s)
    return t.count("\n") + (1 if t and not t.endswith("\n") else 0) if t else 0


def parse_agy(line, state=None):
    has_msg = '"USER_INPUT"' in line or '"PLANNER_RESPONSE"' in line
    if not has_msg and not (state is not None and '"GENERIC"' in line):
        return []
    try:
        e = json.loads(line)
    except ValueError:
        return []
    kind = e.get("type")
    if kind == "GENERIC":
        if state is not None:
            tname, wlines = state["pending_tools"].pop(0) if state.get("pending_tools") else ("", 0)
            if e.get("status") == "DONE":
                c = str(e.get("content") or "")
                m = AGY_EDIT_DONE.search(c)
                if m:
                    state["lines_added"] = state.get("lines_added", 0) + int(m.group(1))
                    state["lines_removed"] = state.get("lines_removed", 0) + int(m.group(2))
                elif tname == "write_file" and any(w in c for w in ("Created file.", "Overwrote file.", "Appended to file.")):
                    state["lines_added"] = state.get("lines_added", 0) + int(wlines)
        return []
    if kind not in ("USER_INPUT", "PLANNER_RESPONSE"):
        return []
    at = ms(e.get("created_at"))
    if state is not None:
        if not state.get("started_ms") or at < state["started_ms"]:
            state["started_ms"] = at
        if at > state.get("last_ms", 0):
            state["last_ms"] = at

    if kind == "USER_INPUT":
        raw = str(e.get("content") or "")
        if state is not None:
            state.pop("pending_tools", None)
            mc = AGY_MODEL_CHANGE.search(raw)
            if mc:
                prev_sel = (mc.group(1) or "").strip()
                state["model"] = mc.group(2).strip()
                # Step 0 hydrates the global default as "from None to <Model>"; only an actual
                # mid-session switch ("from <OldModel> to <NewModel>") should pin the pal's argv.
                if prev_sel and prev_sel.lower() != "none":
                    state["model_switched"] = True
        media = e.get("media") or []
        images = sum(1 for m in media if isinstance(m, dict) and str(m.get("mime_type", "")).startswith("image/")) or len(media)
        reqs = AGY_REQ.findall(raw)
        compacted = "<CONTEXT_SUMMARY>" in raw and not reqs
        text = "\n\n".join(r.strip() for r in reqs if r.strip()) if reqs else AGY_META.sub("", raw).strip()
        return classify_user_text(text, images, at, compacted=compacted)

    # PLANNER_RESPONSE
    if state is not None:
        state["pending_tools"] = []
        inp = int(e.get("input_tokens") or 0)
        cache = int(e.get("cache_read_tokens") or 0)
        out_tok = int(e.get("output_tokens") or 0)
        if inp or cache or out_tok:
            state["input_tokens"] = inp
            state["cache_read_tokens"] = cache
            state["output_tokens"] = out_tok
        if (e.get("thinking") or "").strip():
            state["thinking"] = True
    out = []
    reply = (e.get("content") or "").strip()
    if reply:
        out.append({"kind": "bot", "text": reply, "at": at})
    for tc in e.get("tool_calls") or []:
        tname = tc.get("name", "")
        targs = tc.get("args") or {}
        if state is not None:
            state["pending_tools"].append([tname, _line_count(targs.get("Content")) if tname == "write_file" else 0])
        verb, what = tool_what(tname, targs)
        out.append({"kind": "tool", "verb": verb, "what": what, "at": at})
    return out


# ── keeping feeds current ─────────────────────────────────────────────────────────────────────

STATUS = DATA / "crew-status"


def save_agy_status(terminal, model_name=None, session_id=None, transcript_path=None, workspace=None, state=None):
    """Write data/crew-status/<terminal>.json in the shape crew-chat and crew-side read."""
    STATUS.mkdir(parents=True, exist_ok=True)
    dest = STATUS / f"{terminal}.json"
    prev = load_json(dest, {})
    st = state or {}
    explicit_start = bool(model_name and str(model_name).strip().lower() != "auto")
    pinned = bool(st.get("model_switched") or explicit_start or (prev.get("model_pinned") if model_name is None else False))
    raw_model = st.get("model") or model_name or (prev.get("model_raw") if prev.get("model_raw") else (prev.get("model") or {}).get("id")) or "auto"
    mid, disp, eff, win = agy_model_meta(raw_model)
    inp = int(st.get("input_tokens") or 0)
    cache = int(st.get("cache_read_tokens") or 0)
    out_tok = int(st.get("output_tokens") or 0)
    used = inp + cache
    cw = prev.get("context_window")
    if used or out_tok:
        pct = min(100, round(used * 100 / win)) if win else 0
        cw = {
            "context_window_size": win,
            "used_percentage": pct,
            "current_usage": {
                "input_tokens": inp,
                "cache_read_input_tokens": cache,
                "cache_creation_input_tokens": 0,
                "output_tokens": out_tok,
            },
        }
    started = st.get("started_ms")
    last = st.get("last_ms")
    cost = prev.get("cost")
    if started and last and last >= started:
        cost = {
            "total_duration_ms": max(0, last - started),
            "total_lines_added": int(st.get("lines_added") or 0),
            "total_lines_removed": int(st.get("lines_removed") or 0),
        }
    doc = {
        **prev,
        "harness": "antigravity",
        "source": "agy",
        "session_id": session_id or prev.get("session_id"),
        "transcript_path": str(transcript_path or prev.get("transcript_path") or ""),
        "model_raw": str(model_name).strip() if model_name is not None else (st.get("model") or prev.get("model_raw") or "auto"),
        "model_pinned": pinned,
        "model": {"id": mid, "display_name": disp},
        "effort": {"level": eff} if eff else None,
        "thinking": {"enabled": bool(st.get("thinking") or (prev.get("thinking") or {}).get("enabled") or eff in ("high", "medium"))},
    }
    if workspace:
        doc["workspace"] = {"current_dir": workspace}
    if cw:
        doc["context_window"] = cw
    if cost:
        doc["cost"] = cost
    save_json(dest, doc)


def link_from_status():
    """The status line (crew-statusline) or agy status names each channel's session file."""
    for f in STATUS.glob("*.json") if STATUS.exists() else []:
        st = load_json(f, {})
        if st.get("transcript_path"):
            link(f.stem, st["transcript_path"], st.get("session_id"),
                 st.get("source") or "statusline", harness=st.get("harness") or "claude")


def sync(terms, log=print):
    """Append what's new in each linked session to its channel's feed."""
    CHATS.mkdir(parents=True, exist_ok=True)
    link_from_status()
    for terminal, lk in links().items():
        if terminal not in terms:
            continue
        raw_path = Path(lk.get("transcript", ""))
        agy = is_agy_link(lk, raw_path)
        path = agy_transcript_path(raw_path) if agy else raw_path
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
            state = {"transcript": str(path), "offset": 0}
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
        parser = (lambda s: parse_agy(s, state)) if agy else parse_claude
        for raw in chunk[:end].split(b"\n"):
            entries += parser(raw.decode("utf-8", "replace"))
        state["offset"] += end + 1
        if entries:
            with open(feed, "a") as f:
                for x in entries:
                    f.write(json.dumps(x) + "\n")
        save_json(state_path, state)
        if agy:
            save_agy_status(terminal, session_id=lk.get("session"), transcript_path=path, state=state)


def project_dir(cwd):
    return CLAUDE / re.sub(r"[^a-zA-Z0-9]", "-", cwd or "")


def recent_prompts(path, n=3, harness="claude"):
    """The last few things typed to a session (scanning its last 3 MB)."""
    size = path.stat().st_size
    with open(path, "rb") as f:
        f.seek(max(0, size - 3 * 1024 * 1024))
        chunk = f.read()
        lines = chunk.split(b"\n")[1:] if size > 3 * 1024 * 1024 else chunk.split(b"\n")
    out = []
    parse = parse_agy if harness == "antigravity" else parse_claude
    for raw in reversed(lines):
        for x in parse(raw.decode("utf-8", "replace")):
            if x["kind"] in ("you", "note") and len(x["text"]) >= 12:
                out.append(x["text"])
        if len(out) >= n:
            break
    return out


def squash(s):
    return re.sub(r"\s+", "", s)


def _agy_log_for_conv(cid):
    logs = AGY_BRAIN / cid / ".system_generated" / "logs"
    for name in ("transcript_full.jsonl", "transcript.jsonl"):
        p = logs / name
        if p.exists():
            return p
    return None


def _guess_agy(addr, fg, known, log):
    if not AGY_BRAIN.exists():
        return
    argv = fg.get("argv") or []
    # Started with --conversation <id> or --conversation=<id>.
    conv = None
    for i, a in enumerate(argv):
        if a in ("--conversation", "-c") and i + 1 < len(argv) and len(argv[i + 1]) >= 32:
            conv = argv[i + 1]
            break
        if str(a).startswith("--conversation="):
            conv = str(a).split("=", 1)[1]
            break
    if conv:
        p = _agy_log_for_conv(conv)
        if p:
            link(addr, p, conv, "resume", harness="antigravity")
            known[addr] = {"transcript": str(p), "session": conv, "harness": "antigravity"}
            log(f"linked {addr} to its agy session (conversation flag)")
            return
    raw_screen = "\n".join(screen(addr, 600))
    m = re.search(r"--conversation=([0-9a-f]{8}-[0-9a-f-]{27})", raw_screen)
    if m:
        p = _agy_log_for_conv(m.group(1))
        if p:
            link(addr, p, m.group(1), "screen-id", harness="antigravity")
            known[addr] = {"transcript": str(p), "session": m.group(1), "harness": "antigravity"}
            log(f"linked {addr} to its agy session (screen id)")
            return
    shown = squash(raw_screen)
    if len(shown) < 40:
        return
    taken_sessions = {lk.get("session") for lk in known.values() if lk.get("session")}
    taken_dirs = {str(Path(lk["transcript"]).parent) for lk in known.values() if lk.get("transcript")}
    hits = []
    now = time.time()
    for d in AGY_BRAIN.iterdir():
        if not d.is_dir() or d.name in taken_sessions:
            continue
        p = _agy_log_for_conv(d.name)
        if not p or str(p.parent) in taken_dirs:
            continue
        try:
            if now - p.stat().st_mtime >= 3 * 86400:
                continue
            prompts = recent_prompts(p, harness="antigravity")
        except OSError:
            continue
        if any(len(squash(x)) >= 12 and squash(x)[:48] in shown for x in prompts):
            hits.append((d.name, p))
    if len(hits) == 1:
        cid, p = hits[0]
        link(addr, p, cid, "screen", harness="antigravity")
        known[addr] = {"transcript": str(p), "session": cid, "harness": "antigravity"}
        log(f"linked {addr} to agy session {cid[:8]} (matched its screen)")


def guess(terms, log=print):
    """Link Claude Code and Antigravity CLI channels that started before the hook was installed."""
    known = links()
    for addr, t in terms.items():
        if addr in known or not is_agent(t) or t.get("agent") not in ("claude-code", "antigravity"):
            continue
        info = {}
        try:
            info = json.loads(subprocess.run(["hc", "get", addr, "--json"], capture_output=True, text=True, timeout=10).stdout)
        except (ValueError, OSError, subprocess.TimeoutExpired):
            continue
        fg = info.get("foreground") or {}
        if t.get("agent") == "antigravity":
            _guess_agy(addr, fg, known, log)
            continue
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
