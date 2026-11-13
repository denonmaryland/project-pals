"""A project's agent files (AGENTS.md, CLAUDE.md, ...): what Claude Code loads, a lint, the fixes it
offers, and the one writer for a project's files (docs/profiles/proposal.md, section 4).

Nothing here writes a project's file on its own. `apply` is the only writer: the profile panel runs it
on the owner's click (Write), after a diff, and a pal typing `pal agents apply` is held for the
owner by the approval gate. Every write keeps a backup in data/crew-backups/agents-files/<pal>/,
checks the file hasn't changed since the diff (a hash), and logs a line in the pal's brain."""
import json
import os
import re
import subprocess
import time
from pathlib import Path

from crewlib import DATA, CrewError, slug

# What the tool shows and writes, relative to the project folder. .pals/ is a brain kept in the
# project (brainIn: project); _Brain/PROJECT_BRAIN.md is an init-project-brain brain, adopted in place.
SHOWN = ["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]
WRITABLE = re.compile(r"^(AGENTS\.md|CLAUDE\.md|\.claude/CLAUDE\.md|CLAUDE\.local\.md|_Brain/PROJECT_BRAIN\.md|\.pals/[\w./-]+\.md)$")
BACKUPS = DATA / "crew-backups" / "agents-files"
KEEP = 20
LONG, VERY_LONG = 250, 400
SECRET = re.compile(r"(sk-ant-[\w-]{10,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[\w-]{10,}"
                    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?i:(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"]?[A-Za-z0-9/+_-]{16,}))")


def sha(text):
    import hashlib
    return hashlib.sha256(text.encode()).hexdigest() if text is not None else "none"


def read(path):
    try:
        return Path(path).read_text()
    except (OSError, UnicodeDecodeError):
        return None


def files(folder):
    """Each agent file in the folder: path, lines, sha, text."""
    out = []
    for rel in SHOWN:
        text = read(Path(folder) / rel)
        out.append({"file": rel, "exists": text is not None, "lines": len(text.splitlines()) if text else 0,
                    "sha": sha(text), "text": text, "checked_in": rel != "CLAUDE.local.md"})
    return out


def imports(text):
    return [l.strip()[1:].split()[0] for l in (text or "").splitlines() if re.match(r"^\s*@\S", l)]


def loads(folder):
    """What Claude Code loads in this folder, in lines: the global CLAUDE.md, the project's, and
    what it imports. Without a CLAUDE.md, Claude Code reads AGENTS.md itself (seen 2026-11-08)."""
    folder = Path(folder)
    parts = []
    g = read(Path.home() / ".claude" / "CLAUDE.md")
    if g is not None:
        parts.append({"file": "~/.claude/CLAUDE.md", "lines": len(g.splitlines())})
    claude = read(folder / "CLAUDE.md")
    if claude is not None:
        parts.append({"file": "CLAUDE.md", "lines": len(claude.splitlines())})
        for imp in imports(claude):
            t = read((folder / imp).resolve()) if not imp.startswith("~") else read(Path(imp).expanduser())
            parts.append({"file": f"@{imp}", "lines": len(t.splitlines()) if t else 0, "missing": t is None})
    else:
        a = read(folder / "AGENTS.md")
        if a is not None:
            parts.append({"file": "AGENTS.md", "lines": len(a.splitlines())})
    return {"parts": parts, "total": sum(p["lines"] for p in parts)}


# ─── the lint ────────────────────────────────────────────────────────────────────────────────

SKIP_TOKEN = re.compile(r"[\s<>*{}…=]|X\.Y\.Z|\bx\.y\.z\b|^(origin|upstream|refs)/|^https?:|^-|^\$|^\.\.\.$")
PATHISH = re.compile(r"^(~|\.{1,2})?/?[\w.@+-]+(/[\w.@+-]*)*/?$")


def stale_paths(folder, text):
    """Backticked paths that don't exist. Skipped: git refs, VAR=value, placeholders (X.Y.Z, <x>,
    *, …, an ALL-CAPS first part like PATH/…), URLs, flags, slash commands (`/name`), bare names that
    aren't at the project's root (a bare `main.js` usually means "in each mod"), and relative paths
    whose first folder isn't in the project (they point into a skill or another tree). Paths under
    ~ or / describe this machine, not the repo: reported as info."""
    folder = Path(folder)
    checked, stale, seen = 0, [], set()
    for n, line in enumerate(text.splitlines(), 1):
        for tok in re.findall(r"`([^`\n]+)`", line):
            tok = tok.strip()
            if SKIP_TOKEN.search(tok) or not PATHISH.match(tok) or (n, tok) in seen:
                continue
            seen.add((n, tok))
            first = tok.lstrip("~/.").split("/")[0]
            if re.fullmatch(r"/[\w-]+", tok) or (first.isupper() and len(first) > 1):
                continue
            bare = "/" not in tok.rstrip("/")
            if bare and not re.search(r"\.\w{1,6}$", tok):
                continue    # a word, not a file
            machine = tok.startswith("~") or tok.startswith("/")
            p = Path(tok).expanduser() if tok.startswith("~") else (Path(tok) if tok.startswith("/") else folder / tok)
            if bare and not p.exists():
                continue
            if not machine and not bare and not (folder / tok.lstrip("./").split("/")[0]).exists():
                continue
            checked += 1
            if not p.exists():
                stale.append({"line": n, "path": tok, "machine": machine})
    return checked, stale


def stale_cmds(folder, text):
    folder = Path(folder)
    out = []
    pkg = read(folder / "package.json")
    scripts = {}
    if pkg:
        try:
            scripts = json.loads(pkg).get("scripts") or {}
        except ValueError:
            pass
    make = read(folder / "Makefile") or ""
    targets = set(re.findall(r"^([\w.-]+):", make, re.M))
    for n, line in enumerate(text.splitlines(), 1):
        for m in re.finditer(r"\b(?:npm|pnpm|yarn|bun)\s+run\s+([\w:.-]+)", line):
            if pkg and m.group(1) not in scripts:
                out.append({"line": n, "cmd": m.group(0), "why": f"package.json has no script '{m.group(1)}'"})
        for m in re.finditer(r"`make\s+([\w.-]+)", line):
            if make and m.group(1) not in targets:
                out.append({"line": n, "cmd": m.group(0).strip("`"), "why": f"the Makefile has no target '{m.group(1)}'"})
    return out


RULE = re.compile(r"\b(always|never|must not|must|don't|do not|should not|shouldn't)\b\s+(.{8,80})", re.I)
NEG = {"never", "must not", "don't", "do not", "should not", "shouldn't"}


def conflicts(named):
    """The same rule stated both ways across the loaded files ("always X" / "never X")."""
    seen = {}
    out = []
    for name, text in named:
        for n, line in enumerate((text or "").splitlines(), 1):
            for m in RULE.finditer(line):
                rest = re.sub(r"[^\w ]", "", m.group(2).lower()).strip()
                rest = " ".join(rest.split()[:6])
                if len(rest) < 8:
                    continue
                neg = m.group(1).lower() in NEG
                other = seen.get((rest, not neg))
                if other:
                    out.append({"a": other, "b": {"file": name, "line": n, "text": line.strip()[:160]}, "rule": rest})
                seen.setdefault((rest, neg), {"file": name, "line": n, "text": line.strip()[:160]})
    return out


def lint(folder):
    folder = Path(folder)
    fs = {f["file"]: f for f in files(folder)}
    agents, claude = fs["AGENTS.md"]["text"], fs["CLAUDE.md"]["text"]
    out = []
    add = lambda level, id, file, msg, **kw: out.append({"level": level, "id": id, "file": file, "msg": msg, **kw})
    for f in fs.values():
        if not f["exists"]:
            continue
        if f["lines"] > VERY_LONG:
            add("warn", "long", f["file"], f"{f['lines']} lines: long enough that rules get lost; move detail into files it points to", strong=True)
        elif f["lines"] > LONG:
            add("warn", "long", f["file"], f"{f['lines']} lines (warns over {LONG})")
        checked, stale = stale_paths(folder, f["text"])
        for s in stale:
            if s["machine"]:
                add("info", "machine-path", f["file"], f"line {s['line']}: `{s['path']}` isn't on this machine now", line=s["line"])
            else:
                add("warn", "stale-path", f["file"], f"line {s['line']}: `{s['path']}` doesn't exist", line=s["line"])
        f["paths_checked"] = checked
        for c in stale_cmds(folder, f["text"]):
            add("warn", "stale-cmd", f["file"], f"line {c['line']}: `{c['cmd']}`: {c['why']}", line=c["line"])
        for imp in imports(f["text"]):
            target = Path(imp).expanduser() if imp.startswith("~") else folder / imp
            if not target.exists():
                add("error", "bad-import", f["file"], f"imports @{imp}, which doesn't exist")
        for n, line in enumerate(f["text"].splitlines(), 1):
            if SECRET.search(line):
                add("error", "secret", f["file"], f"line {n} looks like a key or token: take it out and rotate it", line=n)
    if agents is not None and claude is None:
        add("info", "no-pointer", "CLAUDE.md", "AGENTS.md exists, CLAUDE.md doesn't. Tools that read only CLAUDE.md miss these rules.",
            fix={"id": "create-pointer", "label": "Create pointer", "file": "CLAUDE.md", "text": "@AGENTS.md\n"})
    if agents is not None and claude is not None:
        lines_a = {l.strip() for l in agents.splitlines() if l.strip()}
        lines_c = [l for l in claude.splitlines() if l.strip()]
        shared = sum(1 for l in lines_c if l.strip() in lines_a)
        has_import = "AGENTS.md" in imports(claude)
        own = [l for l in claude.splitlines() if l.strip() not in lines_a and not re.match(r"^\s*@AGENTS\.md\s*$", l)]
        own_text = "\n".join(own).strip()
        if lines_c and shared / len(lines_c) >= 0.8 and not has_import:
            add("warn", "duplicate", "CLAUDE.md", f"CLAUDE.md repeats AGENTS.md ({shared} of {len(lines_c)} lines): both load, twice the context",
                fix={"id": "make-pointer", "label": "Make CLAUDE.md the pointer", "file": "CLAUDE.md",
                     "text": "@AGENTS.md\n" + (f"\n{own_text}\n" if own_text else "")})
        elif not has_import and re.search(r"AGENTS\.md", claude):
            add("warn", "prose-pointer", "CLAUDE.md", "CLAUDE.md mentions AGENTS.md in words but doesn't import it (@AGENTS.md)",
                fix={"id": "use-import", "label": "Use an import", "file": "CLAUDE.md", "text": "@AGENTS.md\n\n" + claude})
    for c in conflicts([(k, v["text"]) for k, v in fs.items() if v["exists"]]):
        add("warn", "conflict", c["b"]["file"], f"\"{c['a']['text']}\" ({c['a']['file']}:{c['a']['line']}) vs \"{c['b']['text']}\" (line {c['b']['line']})")
    checked = sum(f.get("paths_checked", 0) for f in fs.values())
    return {"folder": str(folder), "files": [{k: v for k, v in f.items() if k != "text"} for f in fs.values()],
            "loads": loads(folder), "lint": out, "paths_checked": checked}


def deep(folder, brain_dir=None):
    """One cheap model pass for conflicting or outdated rules across the loaded files (and the
    brain). It sends those files to Claude, so it runs only when asked."""
    folder = Path(folder)
    parts = []
    for name, p in [("~/.claude/CLAUDE.md", Path.home() / ".claude" / "CLAUDE.md"), ("AGENTS.md", folder / "AGENTS.md"),
                    ("CLAUDE.md", folder / "CLAUDE.md"), ("decisions.md", Path(brain_dir) / "decisions.md" if brain_dir else None)]:
        t = read(p) if p else None
        if t:
            parts.append(f"=== {name} ===\n{t[:20000]}")
    if not parts:
        return []
    prompt = ("These are the instruction files an AI coding agent loads for one project. List rules that conflict "
              "with each other, or that look outdated against the others. Reply with JSON only: a list of "
              "{\"files\": [..], \"quote_a\": \"..\", \"quote_b\": \"..\", \"why\": \"..\"}, at most 8, [] if none.\n\n" + "\n\n".join(parts))
    try:
        r = subprocess.run(["claude", "-p", "--model", "haiku", prompt], capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise CrewError(f"couldn't run the deep check: {e}")
    m = re.search(r"\[[\s\S]*\]", r.stdout)
    try:
        return json.loads(m.group(0)) if m else []
    except ValueError:
        return []


# ─── the writer ──────────────────────────────────────────────────────────────────────────────

def backup_dir(pal):
    return BACKUPS / slug(pal)


def backups(pal, rel=None):
    d = backup_dir(pal)
    if not d.exists():
        return []
    key = rel.replace("/", "__") if rel else None
    out = []
    for p in sorted(d.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        m = re.match(r"^(.+)\.(\d{8}-\d{6}(?:-\d+)?)(\.absent)?\.md$", p.name)
        if not m or (key and m.group(1) != key):
            continue
        out.append({"file": m.group(1).replace("__", "/"), "at": m.group(2), "absent": bool(m.group(3)), "path": str(p)})
    return out


def validate_apply(folder, rel, expect):
    """Check the target and reviewed base without writing or creating a backup."""
    rel = rel.strip()
    rel = rel[2:] if rel.startswith("./") else rel
    if not WRITABLE.match(rel) or ".." in rel.split("/"):
        raise CrewError(f"{rel} isn't a file this tool writes (AGENTS.md, CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md, _Brain/PROJECT_BRAIN.md, .pals/*.md)")
    target = Path(folder).expanduser() / rel
    cur = read(target)
    if sha(cur) != expect:
        raise CrewError(f"{rel} changed since the diff was made; review it again")
    return rel, target, cur


def apply(pal, folder, rel, new_text, expect, note=None):
    """Write a project file: refuse if it changed since the diff (`expect` is the sha the diff was
    made against, "none" for a new file), back the old one up, write, and return what happened."""
    rel, target, cur = validate_apply(folder, rel, expect)
    d = backup_dir(pal)
    d.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    key = rel.replace("/", "__")
    n, at = 1, stamp
    while (d / f"{key}.{at}.md").exists() or (d / f"{key}.{at}.absent.md").exists():
        n += 1
        at = f"{stamp}-{n}"
    b = d / (f"{key}.{at}.absent.md" if cur is None else f"{key}.{at}.md")
    b.write_text(cur if cur is not None else "")
    for old in backups(pal, rel)[KEEP:]:
        Path(old["path"]).unlink(missing_ok=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_name(target.name + ".crew-tmp")
    tmp.write_text(new_text)
    os.replace(tmp, target)
    return {"file": rel, "path": str(target), "backup": str(b), "created": cur is None, "sha": sha(new_text), "note": note}
