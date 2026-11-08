"""Each pal's daily notebook (docs/profiles/proposal.md, section 3b): how the work went, in the pal's
own words. What it did, and above all the HICCUPS: what got in the way and what it cost, what it would
have needed (a tool, a skill, a rule, better context, access), and what it learned. The Dream loop
reads these to propose fixes.

data/crew-memory/<pal>/notebook/YYYY-MM-DD.md, one file a day, inside the memory folder (so a rename
carries it). An entry:

    ### 14:32 · #profiles · T16 · 40m
    - did: drew the dashboard frame
    - hiccup: Paper's MCP was down (cost: ~10m)
    - needed: tool: a way to reconnect an MCP server from inside a session
    - lesson: check the port before planning a Paper board

Never secrets, credentials, private user data or raw transcripts: `add` masks key-shaped strings and
refuses pasted logs and other people's home paths."""
import re
import time
from pathlib import Path

from crewlib import memory_dir, CrewError, OWNER

KINDS = ("tool", "skill", "rule", "context", "access")
MAX_LINES = 8          # an entry's body lines
MERGE_MIN = 10         # entries from the same channel within this long merge
KEEP_DAYS = 90         # older days roll into notebook/YYYY-MM.md (their lessons only)
LESSONS_MAX = 400      # the SessionStart lessons block
SECRET = re.compile(r"(sk-ant-[\w-]{10,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[\w-]{10,}"
                    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?i:(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['\"]?[^\s'\"]{8,}))")
LOGLINE = re.compile(r"^\s*(\$ |❯|> |>>> |\[\d\d:\d\d|\d{4}-\d\d-\d\dT|Traceback|File \"|\s*at \S+\(|⏺|⎿|error:|warning:|npm ERR)")
HEAD = re.compile(r"^### (\d\d:\d\d)(?: · (#[^·]+?))?(?: · (T\d+))?(?: · ([\dhm ]+))?\s*$")


def folder(bot):
    return memory_dir(bot) / "notebook"


def day_path(bot, day=None):
    return folder(bot) / f"{day or time.strftime('%Y-%m-%d')}.md"


# ─── the guards ──────────────────────────────────────────────────────────────────────────────

def clean(text, project=None):
    """One field: one line, secrets masked; refuse pasted transcripts and other people's files."""
    text = text or ""
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) > 3 or (len(lines) > 1 and any(LOGLINE.match(l) for l in lines)):
        raise CrewError("that looks like pasted output or a transcript; say what happened in a line instead")
    text = " ".join(" ".join(lines).split())
    home = str(Path.home())
    # Paths: the project, code under ~/Projects and config (~/.something) are fine; someone else's
    # home, or your own documents, downloads, pictures…, are private data.
    for m in re.finditer(r"(?:/home/[^/\s]+|/Users/[^/\s]+|~)(?:/[^\s'\"`),]*)?", text):
        path = m.group(0).replace("~", home, 1) if m.group(0).startswith("~") else m.group(0)
        ok = (path == home or (project and path.startswith(str(project))) or path.startswith(home + "/.")
              or path.startswith(home + "/Projects/") or path.startswith(home + "/Projects") and len(path) == len(home) + 9)
        if not ok:
            raise CrewError(f"{m.group(0)}: a path to someone's private files; name it without the private part")
    masked = SECRET.sub("‹masked›", text)
    if len(masked) > 400:
        masked = masked[:399] + "…"
    return masked


def cost_of(text):
    """'… (cost: ~1h 10m)' or '… ~25m' → minutes."""
    m = re.search(r"(?:cost:\s*)?~?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\)?\s*$", text or "")
    if not m or not (m.group(1) or m.group(2)):
        return 0
    return int(m.group(1) or 0) * 60 + int(m.group(2) or 0)


# ─── writing ─────────────────────────────────────────────────────────────────────────────────

def add(bot, did=None, hiccups=(), needed=(), lesson=None, channel=None, task=None, took=None, project=None):
    """Write an entry (or merge into this channel's last one, if it was under MERGE_MIN ago)."""
    body = []
    if did:
        body.append(f"- did: {clean(did, project)}")
    for h in hiccups:
        body.append(f"- hiccup: {clean(h, project)}")
    for n in needed:
        n = clean(n, project)
        kind = n.split(":", 1)[0].strip().lower() if ":" in n else ""
        if kind not in KINDS:
            raise CrewError(f"needed: start with one of {', '.join(k + ':' for k in KINDS)} (e.g. \"skill: how to …\")")
        body.append(f"- needed: {n}")
    if lesson:
        body.append(f"- lesson: {clean(lesson, project)}")
    if not body:
        raise CrewError('nothing to write: pal notebook "did: …" [--hiccup "…"] [--needed "skill: …"] [--lesson "…"]')
    if len(body) > MAX_LINES:
        raise CrewError(f"{len(body)} lines: keep an entry to {MAX_LINES} (split it, or trim)")
    path = day_path(bot)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = path.read_text() if path.exists() else f"# {bot}, {time.strftime('%Y-%m-%d')}\n"
    now = time.strftime("%H:%M")
    head = f"### {now}" + (f" · #{channel}" if channel else "") + (f" · {task}" if task else "") + (f" · {took}" if took else "")
    # Merge into this channel's last entry when it's fresh.
    entries = parse(text)
    last = entries[-1] if entries else None
    if last and last["channel"] == (f"#{channel}" if channel else None) and _minutes_since(last["time"]) < MERGE_MIN \
            and len(last["lines"]) + len(body) <= MAX_LINES and not (did and last["did"]):
        text = text.rstrip() + "\n" + "\n".join(body) + "\n"
        merged = True
    else:
        text = text.rstrip() + f"\n\n{head}\n" + "\n".join(body) + "\n"
        merged = False
    tmp = path.with_suffix(".md.tmp")
    tmp.write_text(text)
    tmp.replace(path)
    roll(bot)
    return {"path": str(path), "merged": merged, "lines": body}


def _minutes_since(hhmm):
    try:
        h, m = map(int, hhmm.split(":"))
    except ValueError:
        return 1e9
    now = time.localtime()
    return (now.tm_hour * 60 + now.tm_min) - (h * 60 + m)


def remove(bot, day, at, backup_dir):
    """The owner deletes one entry (by its HH:MM heading), keeping a copy of the day first."""
    path = day_path(bot, day)
    if not path.exists():
        raise CrewError(f"no notebook for {day}")
    text = path.read_text()
    backup_dir.mkdir(parents=True, exist_ok=True)
    (backup_dir / f"notebook-{day}.{time.strftime('%Y%m%d-%H%M%S')}.md").write_text(text)
    out, skip, found = [], False, False
    for line in text.splitlines():
        if line.startswith("### "):
            skip = line.startswith(f"### {at}")
            found = found or skip
        if not skip:
            out.append(line)
    if not found:
        raise CrewError(f"no entry at {at} on {day}")
    path.write_text("\n".join(out).rstrip() + "\n")


def roll(bot):
    """Days older than KEEP_DAYS: their lessons into notebook/YYYY-MM.md, the day file removed."""
    d = folder(bot)
    cutoff = time.strftime("%Y-%m-%d", time.localtime(time.time() - KEEP_DAYS * 86400))
    for p in sorted(d.glob("????-??-??.md")):
        if p.stem >= cutoff:
            break
        lessons = [e["lesson"] for e in parse(p.read_text()) if e["lesson"]]
        month = d / f"{p.stem[:7]}.md"
        prev = month.read_text() if month.exists() else f"# {bot}: lessons, {p.stem[:7]}\n\n"
        if lessons:
            month.write_text(prev + "".join(f"- {p.stem}: {l}\n" for l in lessons))
        p.unlink()


# ─── reading ─────────────────────────────────────────────────────────────────────────────────

def parse(text):
    entries, cur = [], None
    for line in (text or "").splitlines():
        m = HEAD.match(line)
        if m:
            cur = {"time": m.group(1), "channel": (m.group(2) or "").strip() or None, "task": m.group(3), "took": (m.group(4) or "").strip() or None,
                   "did": None, "hiccups": [], "needed": [], "lesson": None, "lines": []}
            entries.append(cur)
            continue
        if not cur or not line.startswith("- "):
            continue
        cur["lines"].append(line)
        key, _, val = line[2:].partition(":")
        val = val.strip()
        if key == "did":
            cur["did"] = val
        elif key == "hiccup":
            cur["hiccups"].append({"text": val, "cost": cost_of(val)})
        elif key == "needed":
            kind, _, what = val.partition(":")
            cur["needed"].append({"kind": kind.strip().lower(), "text": what.strip()})
        elif key == "lesson":
            cur["lesson"] = val
    return entries


def days(bot, n=7):
    d = folder(bot)
    out = []
    for p in sorted(d.glob("????-??-??.md"), reverse=True)[:n]:
        out.append({"day": p.stem, "entries": parse(p.read_text())})
    return out


def week(bot):
    ds = days(bot, 7)
    hic = [h for day in ds for e in day["entries"] for h in e["hiccups"]]
    return {"hiccups": len(hic), "minutes": sum(h["cost"] for h in hic),
            "lessons": sum(1 for day in ds for e in day["entries"] if e["lesson"])}


def lessons_block(bot):
    """SessionStart: the last 7 days' lessons, newest first, at most LESSONS_MAX characters."""
    ls = [e["lesson"] for day in days(bot, 7) for e in reversed(day["entries"]) if e["lesson"]]
    if not ls:
        return None
    out, n = "Lessons from your notebook (last 7 days):", 0
    for l in ls:
        line = f"\n- {l}"
        if len(out) + len(line) > LESSONS_MAX:
            break
        out += line
        n += 1
    return out if n else None


PRIMER_LINE = ("Notebook: when you finish a task, hit a hiccup, or are about to stop after real work, add one entry "
               "(pal notebook \"did: …\" --hiccup \"what got in the way (cost: ~15m)\" --needed \"skill: …\" --lesson \"…\"); "
               "skip it if nothing happened. No secrets, private data or pasted output.")
