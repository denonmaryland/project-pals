"""Shared Project Pals skills: data/crew-skills/<name>/SKILL.md (agentskills format), linked into
~/.claude/skills and ~/.codex/skills so every Claude Code and Codex pal can use them. Learned
skills (saved by the background review) that nobody updates for 30 days are archived, never deleted."""
import re
import shutil
import time
from pathlib import Path

from crewlib import SKILLS, slug

LINKS = [Path.home() / ".claude" / "skills", Path.home() / ".codex" / "skills"]
STALE_DAYS = 30


def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        if k.strip():
            meta[k.strip()] = v.strip().strip('"')
    return meta, m.group(2)


def all_skills(archived=False):
    out = []
    root = SKILLS / ".archive" if archived else SKILLS
    for f in sorted(root.glob("*/SKILL.md")) if root.exists() else []:
        meta, body = frontmatter(f.read_text())
        out.append({"name": f.parent.name, "description": meta.get("description", ""), "path": str(f),
                    "learned": meta.get("learned-by") is not None, "by": meta.get("learned-by") or meta.get("saved-by"),
                    "updated": f.stat().st_mtime, "body": body})
    return out


def get(name):
    f = SKILLS / slug(name) / "SKILL.md"
    return f if f.exists() else None


def save(name, description, body, by=None, learned=False):
    name = slug(name)
    d = SKILLS / name
    d.mkdir(parents=True, exist_ok=True)
    f = d / "SKILL.md"
    if f.exists():
        hist = d / ".history"
        hist.mkdir(exist_ok=True)
        shutil.copy2(f, hist / f"SKILL-{time.strftime('%Y%m%d-%H%M%S')}.md")
        meta, _ = frontmatter(f.read_text())
        description = description or meta.get("description", "")
    desc = " ".join((description or f"How to {name.replace('-', ' ')}").split()).replace('"', "'")
    who = f'{"learned-by" if learned else "saved-by"}: "{by}"\n' if by else ""
    f.write_text(f'---\nname: {name}\ndescription: "{desc}"\n{who}---\n\n{body.strip()}\n')
    link(name)
    return f


def link(name):
    """Make the skill visible to each harness; never replace someone else's skill of that name."""
    linked = []
    for root in LINKS:
        if not root.parent.exists():
            continue
        root.mkdir(parents=True, exist_ok=True)
        dest, src = root / name, SKILLS / name
        if dest.is_symlink() and dest.resolve() == src.resolve():
            linked.append(str(dest))
        elif not dest.exists() and not dest.is_symlink():
            dest.symlink_to(src)
            linked.append(str(dest))
    return linked


def unlink(name):
    for root in LINKS:
        dest = root / name
        if dest.is_symlink() and dest.resolve() == (SKILLS / name).resolve():
            dest.unlink()


def archive(name):
    name = slug(name)
    src = SKILLS / name
    if not src.exists():
        return None
    unlink(name)
    dest = SKILLS / ".archive" / f"{name}-{time.strftime('%Y%m%d')}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    return dest


def curate(log=print):
    for s in all_skills():
        if s["learned"] and time.time() - s["updated"] > STALE_DAYS * 86400:
            archive(s["name"])
            log(f"archived stale learned skill {s['name']}")
    for s in all_skills():
        link(s["name"])
