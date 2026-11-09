#!/usr/bin/env python3
"""Take Project Pals out again: everything an install added, nothing of the person's own.

  crewuninstall.py record                          install.sh runs this before it changes anything
  crewuninstall.py uninstall [--purge] [--dry-run] [--json]

What an install adds, and what uninstall does with it:
  Herdr's home   mods/crew-*, layouts/pals.json + pals.svg      removed (Herdr switched to "main" first
                                                                 when pals is the shown layout)
                 keys.json: the shortcuts install added          only those exact key → action pairs go
  ~/.claude      settings.json: the crew-hook entries and the   taken out; the status line gets its
                 crew-statusline wrapper                         original command back (or goes)
                 project-pals/ (the Desk's Claude Code mod)      removed
  ~/.claude/skills, ~/.codex/skills, ~/.gemini/config/skills:
                 links into data/crew-skills                     removed (only links pointing there)
  ~/.gemini/config/hooks.json: the "project-pals" key            removed
  ~/.local/bin   pal, pal-room, crewd, crew-hook*, crew-statusline, crew-mcp and the old-name links
                                                                 removed (only Project Pals' own)
  ~/.local/lib/herdr-crew                                        removed
  systemd        herdr-crew.service (crewd)                      stopped, disabled, removed

The person's own config stays byte-identical: `record` keeps a copy of keys.json, ~/.claude/settings.json
and ~/.gemini/config/hooks.json as they were before Project Pals first touched them
(data/crew-originals). When taking Project Pals' entries out leaves a file equal to that copy, the copy's
exact bytes go back; when the person changed it since, their changes stay (and the file before
uninstall is backed up to .crew-backups/uninstall-<time>/). Files and folders install created
(recorded by `record`) go when nothing else is left in them.

Pals' data stays unless --purge: data/crew-* (pals, rooms, memory, the Desk, tasks, routines, skills,
settings) and .crew-backups. --purge takes those too, except data/crew-worktrees when it holds git
worktrees (they can hold uncommitted work: remove them with git worktree remove). shared.json is
Herdr's own file; its "crew…" keys stay either way (harmless without the mods).

Standard library only: install.sh --uninstall runs it from a checkout, `pal uninstall` from
~/.local/lib/herdr-crew (which it removes while running; that's fine once Python has loaded it).
"""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

USER = Path.home()
APP = Path(os.environ.get("HERDR_APP_HOME", USER / ".config" / "herdr-app"))
DATA = APP / "data"
FOOTPRINT = DATA / "crew-footprint.json"
ORIGINALS = DATA / "crew-originals"

KEYS = APP / "keys.json"
CLAUDE = USER / ".claude" / "settings.json"
AGY = USER / ".gemini" / "config" / "hooks.json"
CONFIGS = {"keys.json": KEYS, "claude-settings.json": CLAUDE, "agy-hooks.json": AGY}

# The key → action pairs install.sh adds to keys.json's "global" (and ctrl-shift-m, which older
# versions added). Only these exact pairs are taken out; the person's own bindings stay.
INSTALL_KEYS = {"ctrl-shift-i": "crew-roster.profile", "ctrl-shift-space": "crew-header.search",
                "ctrl-shift-d": "crew-header.drop", "ctrl-shift-h": "crew-roster.home", "ctrl-shift-m": "crew-roster.mode"}
CLAUDE_EVENTS = ("SessionStart", "PreToolUse", "PostToolUse", "Stop")
AGY_KEY = "project-pals"
BINS = ("pal", "pal-room", "crewd", "crew-hook", "crew-hook-fast", "crew-statusline", "crew-mcp")
ALIASES = {"buddy": "pal", "buddy-room": "pal-room", "botz": "pal", "botz-room": "pal-room", "crew": "pal", "crew-room": "pal-room"}
MARKERS = ("Project Pals", "Project Buddies", "Terminal Botz", "Herdr Crew", "crew-hook")
SKILL_LINKS = (USER / ".claude" / "skills", USER / ".codex" / "skills", USER / ".gemini" / "config" / "skills")
UNIT = USER / ".config" / "systemd" / "user" / "herdr-crew.service"
# Mods Project Pals shipped once and set aside since (install.sh's list), besides every crew-* mod
# holding the shared crew.js.
RETIRED_MODS = ("crew-rail", "crew-chat", "crew-prompt", "crew-palrail", "crew-tabs", "crew-side", "crew-tell")
# Install's bookkeeping in data/: not pals' data, so it goes even without --purge.
BOOKKEEPING = ("crew-install.json", "crew-footprint.json", "crew-originals", "crew-clicks", "crew-update.json",
               "crew-update-run.json", "crew-statusline-original")
# What `record` notes the existence of (created by install when missing), deepest last.
WATCHED = [USER / ".claude", CLAUDE, USER / ".claude" / "skills", USER / ".codex" / "skills",
           USER / ".gemini", USER / ".gemini" / "config", AGY, USER / ".gemini" / "config" / "skills",
           USER / ".local", USER / ".local" / "bin", USER / ".local" / "lib",
           USER / ".config" / "systemd", USER / ".config" / "systemd" / "user",
           USER / ".config" / "systemd" / "user" / "default.target.wants",
           USER / ".cache", USER / ".cache" / "project-pals",
           APP / "layouts", APP / "mods", DATA, APP / ".crew-backups"]


def load(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def exists(p):
    return p.exists() or p.is_symlink()


# ─── record (install.sh, before anything changes) ───────────────────────────────────────────────

def has_ours(name, data):
    """Does this config already hold something Project Pals put there (an older install)?"""
    if not isinstance(data, dict):
        return False
    if name == "keys.json":
        g = data.get("global")
        return isinstance(g, dict) and any(g.get(k) == a for k, a in INSTALL_KEYS.items())
    if name == "claude-settings.json":
        return "crew-hook" in json.dumps(data.get("hooks", {})) or "crew-statusline" in json.dumps(data.get("statusLine", {}))
    return AGY_KEY in data


def record():
    """Note which paths exist before this install (only the first time each is seen: a later install
    must not call Project Pals' own folders the person's), and keep the person's config files as
    they are, once, while they hold nothing of Project Pals'."""
    fp = load(FOOTPRINT, {}) or {}
    existed = fp.setdefault("existed", {})
    for p in WATCHED:
        existed.setdefault(str(p), exists(p))
    originals = fp.setdefault("originals", {})
    for name, path in CONFIGS.items():
        if name in originals or not path.is_file():
            continue
        try:
            raw = path.read_bytes()
            data = json.loads(raw)
        except (OSError, ValueError):
            continue
        if has_ours(name, data):
            continue   # already changed by an older install: there's no pristine copy to keep
        ORIGINALS.mkdir(parents=True, exist_ok=True)
        (ORIGINALS / name).write_bytes(raw)
        originals[name] = {"path": str(path), "at": int(time.time())}
    fp["version"] = 1
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = FOOTPRINT.with_suffix(".tmp")
    tmp.write_text(json.dumps(fp, indent=2))
    tmp.replace(FOOTPRINT)
    return fp


# ─── taking entries out of config files ─────────────────────────────────────────────────────────

def clean_keys(keys, original):
    """keys.json without install's bindings. Returns (cleaned, notes)."""
    out = json.loads(json.dumps(keys))
    notes = []
    g = out.get("global")
    if isinstance(g, dict):
        for k, a in INSTALL_KEYS.items():
            if g.get(k) == a:
                del g[k]
        if not g and not (isinstance(original, dict) and "global" in original):
            out.pop("global")
    for section, m in out.items():
        if isinstance(m, dict):
            for k, a in m.items():
                if isinstance(a, str) and a.startswith("crew-"):
                    notes.append(f"left your own binding {section} {k} → {a} in keys.json (it does nothing without Project Pals)")
    return out, notes


def clean_claude(st, original, statusline_original):
    """~/.claude/settings.json without Project Pals' hooks and status-line wrapper."""
    out = json.loads(json.dumps(st))
    orig = original if isinstance(original, dict) else {}
    hooks = out.get("hooks")
    if isinstance(hooks, dict):
        emptied = False
        for ev in list(hooks):
            entries = hooks[ev]
            if not isinstance(entries, list):
                continue
            new = []
            for e in entries:
                hs = e.get("hooks", []) if isinstance(e, dict) else []
                keep = [h for h in hs if "crew-hook" not in str((h or {}).get("command", ""))]
                if len(keep) == len(hs):
                    new.append(e)
                elif keep:
                    new.append({**e, "hooks": keep})
            if new != entries:
                hooks[ev] = new
                if not new and ev not in (orig.get("hooks") or {}):
                    del hooks[ev]
                    emptied = True
            elif not new and ev in CLAUDE_EVENTS and ev not in (orig.get("hooks") or {}) and original is not None:
                del hooks[ev]   # an empty list an older Roll back left behind (B3)
                emptied = True
        if not hooks and "hooks" not in orig and (emptied or original is not None):
            out.pop("hooks")
    sl = out.get("statusLine")
    if isinstance(sl, dict) and "crew-statusline" in str(sl.get("command", "")):
        if isinstance(orig.get("statusLine"), dict) and "crew-statusline" not in str(orig["statusLine"].get("command", "")):
            out["statusLine"] = {**sl, "command": orig["statusLine"].get("command")}
        elif statusline_original:
            out["statusLine"] = {**sl, "command": statusline_original}
        else:
            out.pop("statusLine")
    return out


def clean_agy(data, _original):
    out = json.loads(json.dumps(data))
    out.pop(AGY_KEY, None)
    return out


class Run:
    def __init__(self, dry, log):
        self.dry, self.log = dry, log
        self.stamp = time.strftime("%Y%m%d-%H%M%S")
        self.removed, self.restored, self.kept, self.notes = [], [], [], []
        fp = load(FOOTPRINT, {}) or {}
        self.existed = fp.get("existed") or {}
        self.originals = fp.get("originals") or {}

    def say(self, msg):
        self.log(("would: " if self.dry else "") + msg)

    def created(self, p):
        """Did an install create this path? (True only when `record` saw it missing.)"""
        return self.existed.get(str(p)) is False

    def backup(self, path):
        if self.dry or not path.exists():
            return
        dest = APP / ".crew-backups" / f"uninstall-{self.stamp}"
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest / (path.name if path != CLAUDE else "claude-settings.json"))
        self.kept.append(str(dest))

    def remove(self, p, what=None):
        if not exists(p):
            return
        self.say(f"remove {what or p}")
        self.removed.append(str(p))
        if self.dry:
            return
        if p.is_dir() and not p.is_symlink():
            shutil.rmtree(p)
        else:
            p.unlink()

    def config(self, name, path, cleaner, fmt):
        """Take Project Pals' entries out of one of the person's config files."""
        if not path.is_file():
            return
        try:
            raw = path.read_bytes()
            cur = json.loads(raw)
        except (OSError, ValueError):
            self.notes.append(f"left {path} alone: it isn't valid JSON")
            return
        if not isinstance(cur, dict):
            return
        orig_raw = None
        if name in self.originals and (ORIGINALS / name).is_file():
            orig_raw = (ORIGINALS / name).read_bytes()
        try:
            original = json.loads(orig_raw) if orig_raw is not None else None
        except ValueError:
            original, orig_raw = None, None
        if name == "claude-settings.json":
            slo = DATA / "crew-statusline-original"
            cleaned = cleaner(cur, original, slo.read_text().strip() if slo.is_file() else None)
        else:
            cleaned = cleaner(cur, original)
        if name == "keys.json":
            cleaned, notes = cleaned
            self.notes += notes
        if orig_raw is not None and cleaned == original:
            if raw != orig_raw:
                self.say(f"put {path} back exactly as it was before Project Pals")
                self.restored.append(str(path))
                if not self.dry:
                    path.write_bytes(orig_raw)
            return
        if not cleaned and self.created(path):
            self.remove(path, f"{path} (Project Pals made it; nothing else is in it)")
            return
        if cleaned == cur:
            return
        self.say(f"take Project Pals' entries out of {path}")
        self.restored.append(str(path))
        if not self.dry:
            self.backup(path)
            tmp = path.with_suffix(path.suffix + ".crew-tmp")
            tmp.write_text(fmt(cleaned))
            tmp.replace(path)


# ─── uninstall ──────────────────────────────────────────────────────────────────────────────────

def ours_file(p):
    try:
        text = p.read_text(errors="replace")
    except OSError:
        return False
    return any(m in text for m in MARKERS)


def herdr_status():
    """`herdr-app status` ({layout, overlays, …}), or {} when no Herdr answers."""
    try:
        r = subprocess.run(["herdr-app", "status"], capture_output=True, text=True, timeout=15)
        out = json.loads(r.stdout) if r.returncode == 0 else {}
        return out if isinstance(out, dict) else {}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {}


def herdr_do(*args):
    try:
        subprocess.run(["herdr-app", "do", *args], capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        pass


def uninstall(purge=False, dry=False, log=print):
    run = Run(dry, log)

    # 1. crewd: stop it first, so it doesn't write anything while the rest goes.
    if UNIT.is_file() and "crewd" in UNIT.read_text(errors="replace"):
        run.say("stop and disable crewd (herdr-crew.service)")
        if not dry:
            subprocess.run(["systemctl", "--user", "disable", "--now", "herdr-crew.service"], capture_output=True, timeout=60)
        wants = UNIT.parent / "default.target.wants" / "herdr-crew.service"
        if wants.is_symlink():
            run.remove(wants, f"{wants} (crewd's start-at-login link)")
        run.remove(UNIT, f"{UNIT} (crewd's service)")
        if not dry:
            subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True, timeout=60)

    # 2. The person's config files: only Project Pals' entries come out.
    run.config("claude-settings.json", CLAUDE, clean_claude, lambda d: json.dumps(d, indent=2, ensure_ascii=False) + "\n")
    run.config("agy-hooks.json", AGY, clean_agy, lambda d: json.dumps(d, indent=2, ensure_ascii=False) + "\n")
    run.config("keys.json", KEYS, clean_keys, lambda d: json.dumps(d, indent=2))

    # 3. Shared skills linked into each harness (only links into data/crew-skills).
    homes = {str(DATA / "crew-skills"), str((DATA / "crew-skills").resolve())}
    for root in SKILL_LINKS:
        if not root.is_dir():
            continue
        for link in sorted(root.iterdir()):
            if link.is_symlink():
                target = os.path.normpath(os.path.join(str(root), os.readlink(link)))
                if any(target.startswith(h + os.sep) for h in homes):
                    run.remove(link, f"{link} (a shared pal skill)")

    # 4. The Desk's Claude Code mod, the commands, the library.
    run.remove(USER / ".claude" / "project-pals", "~/.claude/project-pals (the Desk's Claude Code mod)")
    bindir = USER / ".local" / "bin"
    for name, target in ALIASES.items():
        p = bindir / name
        if p.is_symlink() and os.readlink(p) in (target, str(bindir / target)):
            run.remove(p, f"{p} (an old name for {target})")
    for name in BINS:
        p = bindir / name
        if p.is_file() and not p.is_symlink() and ours_file(p):
            run.remove(p)
        elif exists(p):
            run.notes.append(f"left {p} alone: it isn't Project Pals'")
    lib = USER / ".local" / "lib" / "herdr-crew"
    run.remove(lib, f"{lib} (Project Pals' library{', a link to a checkout' if lib.is_symlink() else ''})")

    # 5. Herdr: off the pals layout first (so nothing shows missing mods), then the layout and mods.
    #    Project Pals' own dialogs too (About, which runs this): a layout switch leaves them open, and
    #    one whose mod is gone shows an error. overlay.close closes the top one; status lists them
    #    by mod name, so close from the top until none of ours is left (seen live on 0.1.14).
    status = herdr_status()
    if status.get("layout") == "pals":
        run.say('switch Herdr to its "main" layout')
        if not dry:
            herdr_do("layout.switch", json.dumps({"name": "main"}))
    for _ in range(10):
        if not any(str(o).startswith("crew-") for o in status.get("overlays") or []):
            break
        run.say("close Project Pals' open dialogs")
        if dry:
            break
        herdr_do("overlay.close")
        status = herdr_status()
    for n in ("pals.json", "pals.svg"):
        p = APP / "layouts" / n
        if p.is_file() and (n.endswith(".svg") or "crew-roster" in p.read_text(errors="replace")):
            run.remove(p)
    for d in sorted((APP / "mods").glob("crew-*")) if (APP / "mods").is_dir() else []:
        if d.is_dir() and ((d / "crew.js").exists() or d.name in RETIRED_MODS):
            run.remove(d)

    # 6. Pals' data stays unless --purge; install's own bookkeeping goes either way (at the end:
    #    the originals were needed above).
    if purge:
        for d in sorted(DATA.glob("crew-*")) if DATA.is_dir() else []:
            if d.name == "crew-worktrees" and d.is_dir() and any(d.iterdir()):
                run.kept.append(str(d))
                run.notes.append(f"kept {d}: it holds git worktrees (remove them with git worktree remove)")
                continue
            if d.name not in BOOKKEEPING:
                run.remove(d)
        run.remove(DATA / "agy-models.json")
        run.remove(USER / ".cache" / "project-pals")
        # Install and update backups go; this run's copies of the person's own config files (made
        # only when they had changed since the install) stay, so a mistake here can be undone.
        backups, this_run = APP / ".crew-backups", f"uninstall-{run.stamp}"
        if backups.is_dir():
            for p in sorted(backups.iterdir()):
                if p.name != this_run:
                    run.remove(p)
            if (backups / this_run).exists():
                run.notes.append(f"kept {backups / this_run}: your config files as they were before this uninstall")
            elif not dry:
                backups.rmdir()
    for n in BOOKKEEPING:
        run.remove(DATA / n)

    # 7. Folders an install made, when nothing else is left in them (deepest first).
    for p in sorted(WATCHED, key=lambda x: len(x.parts), reverse=True):
        if run.created(p) and p.is_dir() and not p.is_symlink():
            try:
                if not any(p.iterdir()):
                    run.say(f"remove the empty folder {p} (Project Pals made it)")
                    run.removed.append(str(p))
                    if not dry:
                        p.rmdir()
            except OSError:
                pass

    if not purge:
        run.notes.append(f"kept your pals' data in {DATA} (crew-*) and backups in {APP / '.crew-backups'}; "
                         "pal uninstall --purge removes those too")
    run.notes.append("agents already running in pal spaces keep the old hooks until they restart")
    return {"ok": True, "dry_run": dry, "purge": purge, "removed": run.removed, "restored": run.restored,
            "kept": sorted(set(run.kept)), "notes": run.notes}


def main(argv):
    cmd = argv[0] if argv else ""
    if cmd == "record":
        record()
        return 0
    if cmd != "uninstall":
        print(__doc__.strip())
        return 2
    as_json = "--json" in argv
    out = uninstall(purge="--purge" in argv, dry="--dry-run" in argv, log=(lambda *_: None) if as_json else print)
    if as_json:
        print(json.dumps(out))
    else:
        for n in out["notes"]:
            print(f"note: {n}")
        print(("Nothing was changed (--dry-run). " if out["dry_run"] else "") +
              f"Project Pals {'would be' if out['dry_run'] else 'is'} uninstalled from {APP}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
