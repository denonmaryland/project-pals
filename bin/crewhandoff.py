"""Handoff: a topic keeps its seat and the brain in it changes (T119, direction A · Relay;
docs/handoff/design.md). The seat is the topic's tab and terminal, its name Pal#topic, its folder and
branch, its desk cards, claimed tasks and room seats: all keyed by the terminal or by Pal#topic, and a
swap in place changes neither. What crosses to the new brain is a brief: a short markdown file, never
a transcript.

This module is the parts with no process in them: the brief (facts from the board, the desk, git and
the rooms; the story from the old brain's last reply), the privacy filter, the seat's history, the
handoff records, and voiding the terminal's approvals. Stopping and starting stay crewsleep's and
bin/crew's (cmd_handoff). The desk hold during a swap is crewlib.changing_hands, read by claim_queue.

Slice 1: Claude Code and Codex, this machine, the command line."""
import json
import re
import subprocess
import time
from pathlib import Path

from crewlib import (DATA, ROOMS, HANDOFFS, CrewError, OWNER, load_json, save_json, locked, now_ms, new_id, feed, unforge,
                     chan, meaningful, without_input_box, screen)

SEATS = DATA / "crew-seats"          # <terminal>.json: who held the seat, when, and how each one left
HOLD_SECONDS = 90                    # a swap's desk hold ends by itself after this long, whatever happened
TAKE_WITHIN = 300                    # `pal handoff take` only starts a handoff made this recently
BRIEF_CAP = 6000                     # the brief, in characters
STORY_CAP, ASKED_CAP, ASKED_N = 1200, 300, 3

# Brains a seat can be handed to in this slice, each tried with a first message. hc's names for them too.
NAMES = {"claude": "Claude Code", "codex": "Codex", "antigravity": "Antigravity CLI", "grok": "Grok", "gemini": "Gemini CLI",
         "opencode": "opencode", "hermes": "Hermes"}
ALIASES = {"claude-code": "claude", "cc": "claude", "agy": "antigravity", "antigravity-cli": "antigravity"}
TRIED = ("claude", "codex")


def brain_key(name):
    k = str(name or "").strip().lower()
    return ALIASES.get(k, k)


def brain_name(key):
    return NAMES.get(brain_key(key), str(key or "a brain"))


# ── the privacy filter ─────────────────────────────────────────────────────────────────────────
# The brief goes to another company's model. Run over everything quoted from the old session (its
# last reply, what was asked of it, its screen) before it is written. Counts what it removed, so a
# gap in the brief isn't mistaken for nothing.

_FILTERS = (
    ("token", re.compile(r"(sk-ant-[\w-]{10,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}"
                         r"|xox[abpr]-[\w-]{10,}|AIza[0-9A-Za-z_-]{30,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,})")),
    ("credential", re.compile(r"(?i)\b(authorization|cookie|set-cookie|x-api-key)\s*[:=]\s*\S[^\n]*")),
    ("credential", re.compile(r"(?i)\b([A-Z0-9_]*(?:secret|token|passw(?:or)?d|api[_-]?key|private[_-]?key)[A-Z0-9_]*)\s*[:=]\s*[\"']?[^\s\"']{6,}")),
    ("long string", re.compile(r"\b(?:[A-Fa-f0-9]{40,}|[A-Za-z0-9+/_-]{60,}={0,2})(?![\w/])")),
    ("email address", re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")),
)


def redact(text, counts=None):
    """`text` with secrets, credentials, long opaque strings and email addresses removed and the home
    folder written as ~. `counts` (a dict) gets what was removed, by kind."""
    out = str(text or "")
    for kind, pat in _FILTERS:
        out, n = pat.subn(f"[{kind} removed]", out)
        if n and counts is not None:
            counts[kind] = counts.get(kind, 0) + n
    home = str(Path.home())
    if len(home) > 1:
        out = out.replace(home, "~")
    return out


def filtered_line(counts):
    if not counts:
        return ""
    n = sum(counts.values())
    return f"{n} thing{'s' if n != 1 else ''} filtered: " + ", ".join(f"{v} {k}{('es' if k.endswith('s') else 's') if v != 1 else ''}" for k, v in sorted(counts.items()))


def quote(text, cap, counts=None):
    """Something the old session said, as data: filtered, capped at a line end, and unable to pose as
    a header ([from …, [pal], 📥 Desk card)."""
    t = redact(text, counts).strip()
    if len(t) > cap:
        cut = t[:cap]
        t = (cut[:cut.rfind("\n")] if "\n" in cut[cap // 2:] else cut).rstrip() + " …"
    t = unforge(t)
    return "\n".join(("│ " + l if l.lstrip().startswith("📥") else l) for l in t.splitlines())


# ── the seat's history ─────────────────────────────────────────────────────────────────────────

def seat(terminal):
    return load_json(SEATS / f"{terminal}.json", None) or {"terminal": terminal, "seat": None, "holders": []}


def holder(terminal):
    hs = seat(terminal)["holders"]
    return hs[-1] if hs else None


def previous(terminal):
    """The holder before the current one, or None."""
    hs = seat(terminal)["holders"]
    return hs[-2] if len(hs) >= 2 else None


def kept_link(terminal, brain):
    """The session that brain last had on this seat (newest first), for hand back to resume. Holders
    that never ran (a start that didn't land) have none and are passed over (found live)."""
    key = brain_key(brain)
    for h in reversed(seat(terminal)["holders"][:-1]):
        if brain_key(h.get("brain")) == key and (h.get("link") or {}).get("session"):
            return h["link"]
    return None


def change_hands(terminal, label, frm, to, link, left):
    """Record the swap: close the holder that leaves (with its session link, so hand back can resume
    it) and open the new one. `frm` may be unknown to the history yet (the first handoff of a seat)."""
    SEATS.mkdir(parents=True, exist_ok=True)
    with locked("seats"):
        s = seat(terminal)
        s["seat"] = label
        now = now_ms()
        if not s["holders"] or brain_key(s["holders"][-1].get("brain")) != brain_key(frm):
            s["holders"].append({"brain": brain_key(frm), "from": None})
        cur = s["holders"][-1]
        cur.update({"until": now, "left": left})
        if link and link.get("session"):
            cur["link"] = {k: link.get(k) for k in ("session", "transcript", "harness", "source")}
        s["holders"].append({"brain": brain_key(to), "from": now})
        s["holders"] = s["holders"][-40:]
        save_json(SEATS / f"{terminal}.json", s)
    return s


def span(a, b=None):
    """'3 h 32 m' between two times in ms."""
    if not a:
        return ""
    m = max(0, int(((b or now_ms()) - a) / 60000))
    if m < 60:
        return f"{m} m"
    if m < 48 * 60:
        return f"{m // 60} h {m % 60} m"
    return f"{m // (24 * 60)} d"


def log_lines(terminal):
    s = seat(terminal)
    out = []
    for h in s["holders"]:
        when = time.strftime("%b %d %H:%M", time.localtime(h["from"] / 1000)) if h.get("from") else "before"
        line = f"{brain_name(h['brain'])}  from {when}"
        if h.get("until"):
            left = h.get("left") or {}
            line += (f", {span(h['from'], h['until'])}" if h.get("from") else "") + f" · handed over {time.strftime('%b %d %H:%M', time.localtime(h['until'] / 1000))}"
            line += f" by {left.get('by') or '?'}" + (f" ({left['why']})" if left.get("why") else "") + (f" · brief {left['brief']}" if left.get("brief") else "")
            if (h.get("link") or {}).get("session"):
                line += " · session kept"
        else:
            line += " · holds it now"
        out.append(line)
    return out


# ── handoff records and the desk hold ──────────────────────────────────────────────────────────

def _dir(terminal):
    return HANDOFFS / terminal


def hold(terminal, hid, seconds=HOLD_SECONDS):
    """Hold this terminal's queue while its seat changes hands (crewlib.changing_hands reads it)."""
    _dir(terminal).mkdir(parents=True, exist_ok=True)
    save_json(_dir(terminal) / "now.json", {"id": hid, "since": now_ms(), "until": now_ms() + int(seconds * 1000)})


def release(terminal):
    (_dir(terminal) / "now.json").unlink(missing_ok=True)


def save(rec, brief_md=None):
    d = _dir(rec["terminal"])
    d.mkdir(parents=True, exist_ok=True)
    if brief_md is not None:
        (d / f"{rec['id']}.md").write_text(brief_md)
    save_json(d / f"{rec['id']}.json", rec)
    return rec


def load(terminal, hid=None):
    """A handoff's record: that id, else the terminal's newest. None when there is none."""
    d = _dir(terminal)
    if hid:
        return load_json(d / f"{hid}.json", None) if re.fullmatch(r"h-[0-9a-f]{4,16}", hid) else None
    recs = [load_json(f, None) for f in d.glob("h-*.json")] if d.is_dir() else []
    recs = [r for r in recs if r]
    return max(recs, key=lambda r: r.get("at", 0)) if recs else None


def find(hid):
    """A handoff by id, whatever its terminal."""
    if not re.fullmatch(r"h-[0-9a-f]{4,16}", hid or "") or not HANDOFFS.exists():
        return None
    for f in HANDOFFS.glob(f"*/{hid}.json"):
        return load_json(f, None)
    return None


def brief_text(rec):
    try:
        return (_dir(rec["terminal"]) / f"{rec['id']}.md").read_text()
    except OSError:
        return ""


# ── approvals ──────────────────────────────────────────────────────────────────────────────────

def void_approvals(terminal, note="seat changed hands"):
    """An approval is keyed by the terminal and the command, and an approved one stays usable for 30
    minutes: without this the new brain could run what the owner approved for the old one. Every
    approval of this terminal that is approved-and-unused or still pending lapses. A handoff is never
    an approval and never carries one. Returns the commands voided."""
    import crewguard
    out = []
    with locked("approvals"):
        for r in crewguard.all_requests():
            if r.get("terminal") != terminal or r.get("status") not in ("approved", "pending"):
                continue
            r.update({"was": r["status"], "status": "expired", "expired": now_ms(), "note": note})
            save_json(crewguard.APPROVALS / f"{r['id']}.json", r)
            feed("approval", id=r["id"], bot=r.get("bot"), channel=r.get("channel"), status="expired")
            out.append(r.get("command") or "")
    return out


# ── the facts: from Project Pals' own records, no model ────────────────────────────────────────

def _git(cwd, *args):
    try:
        r = subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def git_facts(cwd, since_ms=None):
    """Branch, how far it is ahead of main, and what's uncommitted: from git, since a session's tool
    log misses edits made through shell commands. `since_ms`: also the commits made after then."""
    if not cwd or _git(cwd, "rev-parse", "--is-inside-work-tree") != "true":
        return {}
    out = {"branch": _git(cwd, "branch", "--show-current") or "(detached)"}
    for base in ("main", "master"):
        n = _git(cwd, "rev-list", "--count", f"{base}..HEAD")
        if n is not None and out["branch"] != base:
            out["ahead"], out["base"] = int(n), base
            out["stat"] = (_git(cwd, "diff", "--shortstat", f"{base}...HEAD") or "").strip()
            break
    dirty = [l[3:] for l in (_git(cwd, "status", "--porcelain") or "").splitlines() if len(l) > 3]
    out["uncommitted"] = dirty
    if since_ms:
        log = _git(cwd, "log", f"--since=@{int(since_ms / 1000)}", "--pretty=%h %s", "-n", "12")
        out["commits_since"] = [l for l in (log or "").splitlines() if l]
    return out


def seat_facts(space, tab, terminal):
    """What sits on the seat: claimed tasks, open desk cards, rooms. Every read is best effort."""
    import crewtasks, crewdesk
    pal, topic = space["name"], chan(tab)
    spec = f"{pal}#{topic}"
    out = {"tasks": [], "cards": [], "rooms": []}
    try:
        for t in crewtasks.load()["tasks"]:
            owner = t.get("claimed_by") or t.get("assignee") or ""
            if t.get("status") in ("claimed", "blocked", "open") and "#" in owner and owner.lower() == spec.lower():
                out["tasks"].append({"id": t["id"], "title": t.get("title") or "", "status": t["status"], "body": t.get("body") or "",
                                     "notes": [n.get("text") or "" for n in (t.get("notes") or [])[-3:]]})
    except Exception:
        pass
    try:
        for _, c in crewdesk.mine(pal, topic, include_tray=False):
            out["cards"].append({"id": c.get("id"), "status": c.get("status"), "title": c.get("title") or "", "from": c.get("from") or "",
                                 "kind": c.get("kind") or ""})
    except Exception:
        pass
    for f in sorted(ROOMS.glob("*.json")) if ROOMS.exists() else ():
        room = load_json(f, None) or {}
        if any(m.get("terminal") == terminal for m in room.get("members") or []):
            out["rooms"].append(room.get("name") or f.stem)
    return out


# ── the story: what the old brain last said ────────────────────────────────────────────────────

def story_from_session(link):
    """(last reply, [what was last asked of it]) from the session file crewd linked to the terminal
    (Claude Code and agy; text only, no tool output). (None, []) when there is none to read."""
    import crewchat
    if not link or not link.get("transcript"):
        return None, []
    if brain_key(link.get("harness")) == "codex":
        return story_from_codex(link["transcript"])
    raw = Path(link["transcript"])
    agy = crewchat.is_agy_link(link, raw)
    path = crewchat.agy_transcript_path(raw) if agy else raw
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - 3 * 1024 * 1024))
            lines = f.read().split(b"\n")
    except OSError:
        return None, []
    if size > 3 * 1024 * 1024:
        lines = lines[1:]
    state = {}
    reply, asked = None, []
    for raw_line in reversed(lines):
        try:
            entries = crewchat.parse_agy(raw_line.decode("utf-8", "replace"), state) if agy else crewchat.parse_claude(raw_line.decode("utf-8", "replace"))
        except Exception:
            continue
        for x in reversed(entries):
            if x.get("kind") == "bot" and reply is None and len(x.get("text") or "") >= 40:
                reply = x["text"]
            elif x.get("kind") in ("you", "note") and len(x.get("text") or "") >= 12 and len(asked) < ASKED_N:
                asked.append(x["text"])
        if reply is not None and len(asked) >= ASKED_N:
            break
    return reply, list(reversed(asked))


# ── Codex's own session files ──────────────────────────────────────────────────────────────────
# Codex has no hook that links a terminal to its session, but it writes one rollout file per
# session (~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl; read on codex-cli 0.167): a
# session_meta line with its folder, each message, a task_complete line per turn with the turn's
# last message, and token_count lines with its limits. So a seat held by Codex gets a brief from
# what Codex said, not from its screen, and its limit is known without reading the screen.

def _codex_root():
    return Path.home() / ".codex" / "sessions"


def codex_session(cwd, since_ms=None, root=None, recent_h=12):
    """The session of the Codex running in folder `cwd`, as a link ({session, transcript, harness,
    source}): the one rollout file written since that agent started (`since_ms`; unknown: in the
    last `recent_h` hours) whose session began in that folder. None unless there is exactly one:
    two Codex topics in one folder can't be told apart, and a wrong session in a brief is worse
    than the screen."""
    root = Path(root) if root else _codex_root()
    if not cwd or not root.is_dir():
        return None
    floor = (since_ms / 1000 - 2) if since_ms else time.time() - recent_h * 3600
    want = str(Path(cwd).resolve())
    hits = []
    try:
        files = sorted((f for f in root.glob("*/*/*/rollout-*.jsonl") if f.stat().st_mtime >= floor), key=lambda f: f.stat().st_mtime, reverse=True)
    except OSError:
        return None
    for f in files[:200]:
        try:
            with open(f, errors="replace") as fh:
                meta = json.loads(fh.readline())
        except (OSError, ValueError):
            continue
        p = meta.get("payload") or {}
        if meta.get("type") == "session_meta" and p.get("cwd") and str(Path(p["cwd"]).resolve()) == want:
            hits.append({"session": p.get("id") or p.get("session_id"), "transcript": str(f), "harness": "codex", "source": "cwd"})
    return hits[0] if len(hits) == 1 and hits[0]["session"] else None


def _codex_lines(path, tail=3 * 1024 * 1024):
    """A rollout file's entries, newest first (its last 3 MB)."""
    try:
        size = Path(path).stat().st_size
        with open(path, "rb") as f:
            f.seek(max(0, size - tail))
            lines = f.read().split(b"\n")
    except OSError:
        return
    if size > tail:
        lines = lines[1:]
    for raw in reversed(lines):
        if not raw.strip():
            continue
        try:
            e = json.loads(raw.decode("utf-8", "replace"))
        except ValueError:
            continue
        if isinstance(e.get("payload"), dict):
            yield e["type"], e["payload"]


# What Codex itself puts in the user's place: the project's instruction files and its environment note.
_CODEX_NOT_ASKED = ("<", "# AGENTS.md instructions")


def story_from_codex(path):
    """(the last turn's last message, [what was last asked of it]) from a Codex rollout file. Text
    only: no reasoning, no tool calls or their output."""
    reply, fallback, asked = None, None, []
    for kind, p in _codex_lines(path):
        if p.get("type") == "task_complete" and reply is None and len(p.get("last_agent_message") or "") >= 20:
            reply = p["last_agent_message"]
        elif p.get("type") == "message" and p.get("role") == "assistant" and fallback is None:
            text = "\n".join(x.get("text") or "" for x in p.get("content") or [] if x.get("type") == "output_text").strip()
            if len(text) >= 40 and p.get("phase") in (None, "final_answer"):
                fallback = text
        elif p.get("type") == "message" and p.get("role") == "user" and len(asked) < ASKED_N:
            for x in p.get("content") or []:
                text = (x.get("text") or "").strip()
                if x.get("type") == "input_text" and len(text) >= 12 and not text.startswith(_CODEX_NOT_ASKED) and len(asked) < ASKED_N:
                    asked.append(text)
        if (reply or fallback) and len(asked) >= ASKED_N:
            break
    return reply or fallback, list(reversed(asked))


def codex_limit(path):
    """Codex's own word on its limit, from its newest token_count line: {used (percent of the
    window), window_minutes, resets_at (ms), reached} or None. For the offer when a brain runs out."""
    for kind, p in _codex_lines(path, tail=512 * 1024):
        rl = p.get("rate_limits") if p.get("type") == "token_count" else None
        if rl and isinstance(rl.get("primary"), dict):
            pr = rl["primary"]
            used = float(pr.get("used_percent") or 0)
            return {"used": used, "window_minutes": pr.get("window_minutes"), "resets_at": int(pr["resets_at"]) * 1000 if pr.get("resets_at") else None,
                    "reached": bool(rl.get("rate_limit_reached_type")) or used >= 100}
    return None


def story_from_screen(terminal):
    """The last readable lines of the terminal, for a brain whose sessions aren't parsed (Codex and
    the rest today). It includes whatever was on screen, so it gets the same filter."""
    import crewsleep
    raw = screen(terminal, 120)
    box = crewsleep.codex_box(raw)
    lines = meaningful(raw[:box[0]] if box else without_input_box(raw))
    return "\n".join(lines[-28:]) or None


def first_sentences(text, cap=260):
    t = re.sub(r"\s+", " ", re.sub(r"[*_`#>]+", "", text or "")).strip()
    if len(t) <= cap:
        return t
    cut = t[:cap]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[:end + 1] if end > cap // 3 else cut.rstrip() + "…"


# ── the brief ──────────────────────────────────────────────────────────────────────────────────

def build_brief(*, hid, space, tab, terminal, frm, to, by, via, why, cwd, link, topic_brief="", voided=(), back=None, at=None):
    """(markdown, meta). `back`: the previous handoff's record when this one returns the seat to the
    brain that held it (a return brief: what happened while it was away). The story is the old
    brain's last reply from its session file, else its screen; the facts are Project Pals' own."""
    at = at or now_ms()
    counts = {}
    pal, topic = space["name"], chan(tab)
    facts = seat_facts(space, tab, terminal)
    git = git_facts(cwd, since_ms=(back or {}).get("at"))
    reply, asked = story_from_session(link)
    source, said = f"{brain_name(frm)}'s last reply", bool(reply)
    if not reply:
        reply, source = story_from_screen(terminal), f"{brain_name(frm)}'s screen (its session isn't readable yet)"
    if not reply:
        source = "none: nothing readable from the old session"
    task = next((t for t in facts["tasks"] if t["status"] == "claimed"), None) or (facts["tasks"][0] if facts["tasks"] else None)
    # The one-line "Picking up" quotes the old brain only when it is its own reply: screen lines
    # carry prompts and chrome (found live), so they stay in "Where it stands", marked as the screen.
    lead = first_sentences(redact(reply, {})) if said else ""
    picking = (f"{task['id']} {task['title']}" + (f": {lead}" if lead else "")) if task else (lead or (topic_brief.strip()[:200] if topic_brief else f"the work in #{topic}"))
    picking = unforge(redact(picking, counts))

    when = time.strftime("%Y-%m-%d %H:%M", time.localtime(at / 1000))
    L = [f"# Handoff · {pal} #{topic}",
         f"{brain_name(frm)} → {brain_name(to)}" + (" (back)" if back else "") + f" · {when} · asked by {by}" + (f" ({via})" if via else "") + (f" · why: {why}" if why else ""),
         f"Brief {hid} · story from {source} · facts by Project Pals", ""]
    L += ["## Picking up", picking, ""]
    if back:
        L += [f"## While you were away ({brain_name(frm)} held the seat for {span(back.get('at'), at) or 'a moment'})"]
        L += [f"- {c}" for c in (git.get("commits_since") or [])] or ["- no commits"]
        L += [""]
    goal = [f"- {task['id']} {task['title']}"] if task else []
    if task and task.get("body"):
        goal.append("  " + first_sentences(redact(task["body"], counts), 400))
    if topic_brief.strip():
        goal.append("- The topic's brief: " + first_sentences(redact(topic_brief, counts), 300))
    if goal:
        L += ["## Goal", *[unforge(g) for g in goal], ""]
    if reply:
        L += [f"## Where it stands ({source}, quoted)", quote(reply, STORY_CAP, counts), ""]
    nxt = []
    for t in facts["tasks"]:
        nxt += [f"- {t['id']} note: " + first_sentences(redact(n, counts), 200) for n in t["notes"][-2:] if n]
    nxt += [f"- card {c['id']} ({c['status']}) from {c['from'] or '?'}: " + first_sentences(redact(c["title"], counts), 160)
            for c in facts["cards"] if c["status"] in ("queued", "seen", "working", "held")]
    if asked:
        nxt += ["- last asked of it: " + quote(a, ASKED_CAP, counts).replace("\n", " ") for a in asked]
    if nxt:
        L += ["## Next, and what was asked", *[unforge(n) for n in nxt], ""]
    seat_l = []
    if git:
        g = f"- Branch {git['branch']}"
        if git.get("ahead") is not None:
            g += f", {git['ahead']} commit{'s' if git['ahead'] != 1 else ''} ahead of {git['base']}" + (f" ({git['stat']})" if git.get("stat") else "")
        dirty = git.get("uncommitted") or []
        g += f", {len(dirty)} file{'s' if len(dirty) != 1 else ''} uncommitted" + (": " + ", ".join(dirty[:6]) + (" …" if len(dirty) > 6 else "") if dirty else "")
        seat_l.append(redact(g, counts))
    else:
        seat_l.append("- Folder: " + redact(str(cwd or "unknown"), counts) + " (not a git project)")
    seat_l.append("- Tasks: " + (", ".join(f"{t['id']} {t['status']}" for t in facts["tasks"]) or "none claimed"))
    seat_l.append("- Desk: " + (", ".join(f"{c['id']} {c['status']}" for c in facts["cards"]) or "no open cards") + ". Cards that arrive during the swap follow this brief")
    seat_l.append("- Rooms: " + (", ".join("#" + r for r in facts["rooms"]) or "none"))
    if voided:
        seat_l.append(f"- Approvals: {len(voided)} voided by this handoff (" + "; ".join(redact(v, counts)[:80] for v in voided[:3])
                      + f"). A handoff never carries an approval: if you need one, run the command and {OWNER} is asked again")
    L += ["## On the seat (from Project Pals)", *seat_l, ""]
    L += ["## Read more, when you need it",
          "- pal diff            what this branch changed" if git.get("ahead") is not None else "- git status / git diff   what changed in the folder",
          *([f"- pal task show {task['id']}   the task and its notes"] if task else []),
          "- pal desk            your cards",
          "- pal notebook        this pal's notebook",
          "- pal handoff log     who held this seat, and when", ""]
    carry = bool(task and task["status"] == "claimed") or any(c["status"] in ("queued", "seen", "working") for c in facts["cards"])
    if back:
        L += [f"You hold this seat again: same name, same cards, same tasks. Start with one or two sentences on where things stand now, then "
              + ("carry on." if carry else f"wait for {OWNER}.")]
    else:
        L += ["You hold this seat now: same name, same cards, same tasks. Start with one or two sentences that say what you are picking up "
              "and what you will do next, then " + ("carry on." if carry else f"wait for {OWNER}: nothing was queued.")]
    note = filtered_line(counts)
    if note:
        L += ["", note]
    md = "\n".join(L)
    if len(md) > BRIEF_CAP:
        md = md[:BRIEF_CAP].rsplit("\n", 1)[0] + "\n… (cut at 6 KB)"
    meta = {"picking": picking, "story": source, "filtered": counts, "carry": carry, "lines": md.count("\n") + 1,
            "tasks": [t["id"] for t in facts["tasks"]], "cards": [c["id"] for c in facts["cards"]], "rooms": facts["rooms"],
            "branch": git.get("branch"), "uncommitted": len(git.get("uncommitted") or [])}
    return md, meta


def first_message(rec, hint=""):
    """What the new brain is started with: one short frame, the same for every brain. The brief
    itself is read with `pal handoff brief` (a session's start-up context is cut to a preview by
    Claude Code when it is long, so the brief doesn't ride in it)."""
    seat_name = rec["seat"].replace("#", " #")
    if rec.get("resumed"):
        head = (f"[pal] You're back on {seat_name}. {brain_name(rec['from'])} held this seat while you were away and has handed it back. "
                f"What changed is in the brief: run `pal handoff brief`. Then say in one or two sentences where things stand, and "
                + ("carry on." if rec.get("carry") else f"wait for {OWNER}."))
    else:
        head = (f"[pal] You hold {seat_name} now: {brain_name(rec['from'])} handed you this seat" + (f" ({rec['why']})" if rec.get("why") else "")
                + ". Same name, same folder and branch, same cards and tasks.\n"
                f"Picking up: {rec.get('picking') or 'see the brief'}\n"
                "Read the brief first: run `pal handoff brief`. Then say in one or two sentences what you are picking up and what you "
                "will do next, and " + ("carry on." if rec.get("carry") else f"wait for {OWNER}."))
    return head + (f"\n{hint}" if hint else "")


def card(rec):
    """The handoff card `pal handoff take` prints in the tab before it becomes the new brain. Each
    line is a step that has really happened by then."""
    dim, bold, ok, off = "\x1b[2m", "\x1b[1m", "\x1b[32m", "\x1b[0m"
    when = time.strftime("%H:%M:%S", time.localtime(rec.get("at", now_ms()) / 1000))
    seat_name = rec["seat"].replace("#", f" {dim}#{off}")
    rows = [("brief", f"{rec['id']} · {rec.get('lines', '?')} lines · " + (", ".join(rec.get("tasks") or []) or "no task claimed")),
            ("seat", " · ".join(x for x in [rec.get("branch"), f"{len(rec.get('tasks') or [])} task(s), {len(rec.get('cards') or [])} card(s) kept",
                                           ("rooms " + ", ".join("#" + r for r in rec["rooms"])) if rec.get("rooms") else None] if x)),
            ("desk", "held during the swap · what arrived follows the brief")]
    if rec.get("resumed"):
        rows.append(("session", f"resuming {str(rec.get('session') or '')[:8]} · its own memory"))
    elif rec.get("kept_session"):
        rows.append(("session", f"{brain_name(rec['from'])}'s is kept · hand back resumes it"))
    if rec.get("voided"):
        rows.append(("approvals", f"{rec['voided']} voided · ask again if you need one"))
    out = ["", f"  {bold}HANDOFF{off}   {seat_name}",
           f"  {brain_name(rec['from'])} {dim}──→{off} {bold}{brain_name(rec['to'])}{off}" + (f" {dim}(back){off}" if rec.get("back") else "") + f"   {dim}{when}{off}", ""]
    out += [f"  {ok}✓{off} {k:<10}{dim}{v}{off}" for k, v in rows]
    out += ["", f"  {dim}starting {brain_name(rec['to'])}…{off}", ""]
    return "\n".join(out)
