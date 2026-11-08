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
import os
import re
import secrets
import tempfile
import time
from pathlib import Path

from crewlib import memory_dir, CrewError, OWNER, locked, slug

KINDS = ("tool", "skill", "rule", "context", "access")
MAX_LINES = 8          # an entry's body lines
MERGE_MIN = 10         # entries from the same channel within this long merge
KEEP_DAYS = 90         # older days roll into notebook/YYYY-MM.md (their lessons only)
LESSONS_MAX = 400      # the SessionStart lessons block
SECRET = re.compile(r"(sk-ant-[\w-]{10,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[\w-]{10,}"
                    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?i:(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['\"]?[^\s'\"]{8,}))")
LOGLINE = re.compile(r"^\s*(\$ |❯|> |>>> |\[\d\d:\d\d|\d{4}-\d\d-\d\dT|Traceback|File \"|\s*at \S+\(|⏺|⎿|error:|warning:|npm ERR)")
HEAD = re.compile(r"^### (\d\d:\d\d)(?: · (#[^·]+?))?(?: · (T\d+))?(?: · ([\dhm ]+))?(?: · (e[0-9a-f]{6,}))?\s*$")
# A private key (PEM, OpenSSH, PGP), whole or flattened onto one line: refused outright (review H6).
PRIVATE_KEY = re.compile(r"-----\s*BEGIN[A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----|PRIVATE KEY-----|\bb3BlbnNzaC1rZXktdjE\w*", re.I)
# Paths in your home a note may name (review M1): the pal's project, code under ~/Projects, and these
# config trees. Anything else in a home folder (documents, downloads, other people's) is private.
SAFE_CONFIG = (".config/herdr-app", ".claude/skills", ".claude/settings.json", ".claude/CLAUDE.md", ".codex/skills",
               ".local/bin", ".local/lib/herdr-crew", ".config/hypr", ".config/omarchy", ".config/systemd/user")


def folder(bot):
    return memory_dir(bot) / "notebook"


def day_path(bot, day=None):
    return folder(bot) / f"{day or time.strftime('%Y-%m-%d')}.md"


# ─── the guards ──────────────────────────────────────────────────────────────────────────────

def has_private_key(text):
    return bool(PRIVATE_KEY.search(text or ""))


def inside(path, root):
    """Is `path` (resolved: ~, .., symlinks) inside `root` (resolved), by whole path components?"""
    try:
        p, r = os.path.realpath(os.path.expanduser(path)), os.path.realpath(os.path.expanduser(str(root)))
        return os.path.commonpath([p, r]) == r
    except ValueError:
        return False


def allowed_path(path, project=None):
    home = str(Path.home())
    if project and inside(path, project):
        return True
    if inside(path, os.path.join(home, "Projects")):
        return True
    if any(inside(path, os.path.join(home, c)) for c in SAFE_CONFIG):
        return True
    return os.path.realpath(os.path.expanduser(path)) == os.path.realpath(home)


def clean(text, project=None):
    """One field: one line, secrets masked; refuse private keys, pasted transcripts and private files."""
    text = text or ""
    if has_private_key(text):
        raise CrewError("that looks like a private key: never put keys in the notebook (and rotate it if it was real)")
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) > 3 or (len(lines) > 1 and any(LOGLINE.match(l) for l in lines)):
        raise CrewError("that looks like pasted output or a transcript; say what happened in a line instead")
    text = " ".join(" ".join(lines).split())
    # Paths into a home folder: only the project, ~/Projects and a few config trees, resolved (.., ~,
    # symlinks) and compared by whole path components (review M1).
    for m in re.finditer(r"(?:/home/[^/\s]+|/Users/[^/\s]+|~)(?:/[^\s'\"`),]*)?", text):
        if not allowed_path(m.group(0).rstrip(".:;"), project):
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
    with locked(f"notebook-{slug(bot)}"):     # every channel of a pal writes the same day (review M2)
        return _add_locked(bot, path, body, did, channel, task, took)


def _write(path, text):
    """Replace a file through a temporary file of its own (two writers never share one)."""
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.replace(tmp, path)


def _add_locked(bot, path, body, did, channel, task, took):
    text = path.read_text() if path.exists() else f"# {bot}, {time.strftime('%Y-%m-%d')}\n"
    now = time.strftime("%H:%M")
    eid = "e" + secrets.token_hex(3)   # a unique id per entry, so one can be removed exactly (review M3)
    head = f"### {now}" + (f" · #{channel}" if channel else "") + (f" · {task}" if task else "") + (f" · {took}" if took else "") + f" · {eid}"
    # Merge into this channel's last entry when it's fresh.
    entries = parse(text)
    last = entries[-1] if entries else None
    if last and last["channel"] == (f"#{channel}" if channel else None) and _minutes_since(last["time"]) < MERGE_MIN \
            and len(last["lines"]) + len(body) <= MAX_LINES and not (did and last["did"]):
        text = text.rstrip() + "\n" + "\n".join(body) + "\n"
        merged, eid = True, last["id"]
    else:
        text = text.rstrip() + f"\n\n{head}\n" + "\n".join(body) + "\n"
        merged = False
    _write(path, text)
    roll(bot)
    return {"path": str(path), "merged": merged, "lines": body, "id": eid}


def _minutes_since(hhmm):
    try:
        h, m = map(int, hhmm.split(":"))
    except ValueError:
        return 1e9
    now = time.localtime()
    return (now.tm_hour * 60 + now.tm_min) - (h * 60 + m)


def remove(bot, day, entry, backup_dir):
    """The owner deletes exactly one entry, keeping a copy of the day first. `entry` is the entry's id
    (e1a2b3c); an older entry without one is named "HH:MM #channel" and must match only one heading
    (review M3)."""
    path = day_path(bot, day)
    if not path.exists():
        raise CrewError(f"no notebook for {day}")
    with locked(f"notebook-{slug(bot)}"):
        text = path.read_text()
        heads = [(i, HEAD.match(l)) for i, l in enumerate(text.splitlines()) if HEAD.match(l)]
        if re.fullmatch(r"e[0-9a-f]{6,}", entry):
            hits = [i for i, m in heads if m.group(5) == entry]
        else:
            at, _, ch = entry.partition(" ")
            hits = [i for i, m in heads if m.group(1) == at and (m.group(2) or "").strip() == ch.strip() and not m.group(5)]
        if not hits:
            raise CrewError(f"no entry {entry} on {day}")
        if len(hits) > 1:
            raise CrewError(f"{len(hits)} entries match {entry} on {day}; nothing removed")
        backup_dir.mkdir(parents=True, exist_ok=True)
        (backup_dir / f"notebook-{day}.{time.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(2)}.md").write_text(text)
        out, skip = [], False
        for i, line in enumerate(text.splitlines()):
            if line.startswith("### "):
                skip = i == hits[0]
            if not skip:
                out.append(line)
        _write(path, "\n".join(out).rstrip() + "\n")


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
            _write(month, prev + "".join(f"- {p.stem}: {l}\n" for l in lessons))
        p.unlink()


# ─── reading ─────────────────────────────────────────────────────────────────────────────────

def parse(text):
    entries, cur = [], None
    for line in (text or "").splitlines():
        m = HEAD.match(line)
        if m:
            cur = {"time": m.group(1), "channel": (m.group(2) or "").strip() or None, "task": m.group(3), "took": (m.group(4) or "").strip() or None,
                   "id": m.group(5),
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
