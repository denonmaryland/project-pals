"""A pal's mission and project brain (docs/profiles/proposal.md, sections 2 and 3).

The brain is a few small markdown files: mission.md (statement, goals, focus, done-when),
decisions.md, changelog.md (newest first), map.md (only when AGENTS.md has no file map) and
notes/<subject>.md. It lives in pal data, data/crew-memory/<pal>/brain/, unless the pal's record says
"brainIn": "project", which puts it in <project>/.pals/. It holds no rules (those belong in the
project's AGENTS.md) and doesn't copy the task board (Next actions are tasks).

Who writes what: the mission's statement, goals and done-when are the owner's (a pal proposes them
with `pal mission propose`); the pal keeps Focus, ticks goals, and logs changes and decisions."""
import hashlib
import re
import time
from pathlib import Path

from crewlib import MEMORY, OWNER, memory_dir, slug, CrewError

FILES = ["mission.md", "decisions.md", "changelog.md", "map.md"]
LOG_KEEP = 200            # changelog.md lines; older ones roll into changelog-YYYY.md
PRIMER_MAX = 1200         # the SessionStart mission block's size
SECTIONS = ("Goals", "Focus", "Done when")
TEMPLATE = """# Mission
{statement}

## Goals
{goals}

## Focus
{focus}

## Done when
{done}
"""


def sha(text):
    return hashlib.sha256((text or "").encode()).hexdigest() if text is not None else "none"


def brain_dir(bot_name, record=None):
    record = record or {}
    if record.get("brainIn") == "project" and record.get("folder"):
        return Path(record["folder"]).expanduser() / ".pals"
    return memory_dir(bot_name) / "brain"


def read(d, name):
    p = d / name
    return p.read_text() if p.exists() else None


def write(d, name, text):
    p = d / name
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(text)
    tmp.replace(p)
    return p


# ─── mission.md ──────────────────────────────────────────────────────────────────────────────

def parse_mission(text):
    """mission.md → {statement, goals: [{text, done}], focus, done_when: [{text, done}]}."""
    out = {"statement": "", "goals": [], "focus": "", "done_when": []}
    if not text:
        return out
    sec, statement = None, []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            sec = m.group(1).strip().lower()
            continue
        if line.startswith("# "):
            continue
        if sec is None:
            if line.strip():
                statement.append(line.strip())
            continue
        item = re.match(r"^\s*[-*]\s+\[( |x|X)\]\s+(.*)$", line)
        if sec == "goals" and item:
            out["goals"].append({"text": item.group(2).strip(), "done": item.group(1) != " "})
        elif sec == "done when" and item:
            out["done_when"].append({"text": item.group(2).strip(), "done": item.group(1) != " "})
        elif sec == "focus" and line.strip():
            out["focus"] = (out["focus"] + " " + line.strip()).strip()
    out["statement"] = " ".join(statement)
    return out


def render_mission(m):
    box = lambda items: "\n".join(f"- [{'x' if i['done'] else ' '}] {i['text']}" for i in items) or "- [ ] "
    return TEMPLATE.format(statement=m.get("statement") or "What this pal is for, in a sentence or two.",
                           goals=box(m.get("goals", [])), focus=m.get("focus") or "",
                           done=box(m.get("done_when", [])))


def set_focus(d, focus):
    m = parse_mission(read(d, "mission.md"))
    m["focus"] = " ".join(focus.split())
    write(d, "mission.md", render_mission(m))
    return m


def tick(d, text, done=None):
    """Tick (or untick) the first goal or done-when item containing `text`."""
    m = parse_mission(read(d, "mission.md"))
    want = text.lower().strip()
    for item in m["goals"] + m["done_when"]:
        if want and want in item["text"].lower():
            item["done"] = (not item["done"]) if done is None else done
            write(d, "mission.md", render_mission(m))
            return item
    raise CrewError(f"no goal or done-when item says '{text}'")


# ─── the logs ────────────────────────────────────────────────────────────────────────────────

def today():
    return time.strftime("%Y-%m-%d")


def log(d, text, channel=None, by=None):
    """One line at the top of changelog.md (newest first)."""
    text = " ".join(text.split())
    line = f"- {today()}{f' #{channel}' if channel else ''}{f' ({by})' if by else ''}: {text}"
    cur = (read(d, "changelog.md") or "# Change log\n\nNewest first.\n").splitlines()
    first = next((i for i, l in enumerate(cur) if l.startswith("- ")), len(cur))
    head = "\n".join(cur[:first]).strip()
    lines = [line] + [l for l in cur[first:] if l.startswith("- ")]
    if len(lines) > LOG_KEEP:
        old = lines[LOG_KEEP:]
        year = d / f"changelog-{time.strftime('%Y')}.md"
        prev = year.read_text() if year.exists() else f"# Change log, {time.strftime('%Y')}\n\n"
        year.write_text(prev + "\n".join(old) + "\n")
        lines = lines[:LOG_KEEP]
    header = head if head.startswith("# ") else "# Change log\n\nNewest first."
    write(d, "changelog.md", header + "\n\n" + "\n".join(lines) + "\n")
    return line


def decide(d, what, why=None, by=None):
    """A dated decision at the end of decisions.md: what, why, who."""
    cur = read(d, "decisions.md") or "# Decisions\n\nWhat was decided, why, and who decided.\n\n"
    line = f"- {today()} · {by or OWNER}: {' '.join(what.split())}" + (f" Why: {' '.join(why.split())}" if why else "")
    write(d, "decisions.md", cur.rstrip() + "\n" + line + "\n")
    return line


def note(d, topic, text):
    name = f"notes/{slug(topic)}.md"
    cur = read(d, name) or f"# {topic}\n\n"
    write(d, name, cur.rstrip() + f"\n\n{text.strip()}\n")
    return name


def entries(text):
    return [l[2:] for l in (text or "").splitlines() if l.startswith("- ")]


# ─── listing, and the primer ─────────────────────────────────────────────────────────────────

def summary(bot_name, record=None, agents_has_map=False):
    d = brain_dir(bot_name, record)
    notes = sorted((d / "notes").glob("*.md")) if (d / "notes").exists() else []
    files = {n: read(d, n) for n in FILES}
    return {
        "dir": str(d), "where": "project" if (record or {}).get("brainIn") == "project" else "pal",
        "mission": parse_mission(files["mission.md"]), "mission_text": files["mission.md"], "mission_sha": sha(files["mission.md"]),
        "decisions": entries(files["decisions.md"]), "changelog": entries(files["changelog.md"]),
        "map": files["map.md"], "agents_map": agents_has_map,
        "notes": [{"name": f"notes/{n.name}", "title": n.stem.replace("-", " ")} for n in notes],
        "files": {n: {"exists": files[n] is not None, "sha": sha(files[n])} for n in FILES},
    }


def primer_block(bot_name, record=None):
    """The SessionStart mission block: the statement, Focus, Done when, the brain's folder and the
    last 3 changes. At most PRIMER_MAX characters; never the whole brain."""
    d = brain_dir(bot_name, record)
    text = read(d, "mission.md")
    if not text:
        return (f"No mission yet. Ask {OWNER}, or propose one: pal mission propose -F draft.md "
                f"(statement, ## Goals, ## Focus, ## Done when).")
    m = parse_mission(text)
    lines = [f"Your mission: {m['statement']}"]
    if m["focus"]:
        lines.append(f"Focus: {m['focus']}")
    if m["done_when"]:
        n = sum(1 for i in m["done_when"] if i["done"])
        lines.append(f"Done when ({n} of {len(m['done_when'])}): " + " · ".join(i["text"] for i in m["done_when"] if not i["done"]))
    lines.append(f"Your brain: {d} (pal brain show [file]; keep it current with pal brain log \"…\", "
                 f"pal brain decide \"…\" --why \"…\", pal mission focus \"…\"). Rules go in AGENTS.md, not here.")
    recent = entries(read(d, "changelog.md"))[:3]
    if recent:
        lines.append("Latest changes: " + " · ".join(recent))
    out = "\n".join(lines)
    return out if len(out) <= PRIMER_MAX else out[:PRIMER_MAX - 1] + "…"


def move(bot_name, record, to):
    """Point the brain at pal data or the project, copying files the new place doesn't have yet.
    Nothing is deleted. Returns (from_dir, to_dir, copied)."""
    src = brain_dir(bot_name, record)
    rec = {**(record or {}), "brainIn": "project" if to == "project" else "pal"}
    dst = brain_dir(bot_name, rec)
    copied = []
    if src != dst and src.exists():
        for p in sorted(src.rglob("*.md")):
            rel = p.relative_to(src)
            if not (dst / rel).exists():
                (dst / rel).parent.mkdir(parents=True, exist_ok=True)
                (dst / rel).write_text(p.read_text())
                copied.append(str(rel))
    return src, dst, copied
