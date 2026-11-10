#!/usr/bin/env python3
"""Take Project Pals out again: everything an install added, nothing of the person's own.

  crewuninstall.py record                          install.sh runs this before it changes anything
  crewuninstall.py record-installed SRC            and this after: what it placed (the manifest)
  crewuninstall.py uninstall [--purge] [--dry-run] [--json] [--click TOKEN]

Uninstalling is the owner's (Grok review T56, H1), and this module checks it itself, whoever calls it
(pal uninstall, ./install.sh --uninstall, an import): a non-dry run needs the app's one-time click token
for exactly its arguments (About → Uninstall), or the word "uninstall" typed on a real controlling
terminal that isn't an agent's (herdr-core reports no agent status for it). A pal's shell has no
controlling terminal, so a pal's one-liner is refused. --dry-run changes nothing and needs neither.

Nothing is followed through a symlink (T56, H2): before it deletes or writes a path, every folder
between Herdr's home (or $HOME) and it must be a real folder and resolve where it says; otherwise the
path is left and reported. A link as the last part is unlinked, never followed; a config file that is
a link is left alone. Only what the install manifest lists is removed (an install from before the
manifest: each candidate is checked for Project Pals' own content instead).

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
import re
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
CLICKS = DATA / "crew-clicks"
CLICK_TTL = 120   # seconds, as crewlib.CLICK_TTL

KEYS = APP / "keys.json"
CLAUDE = USER / ".claude" / "settings.json"
AGY = USER / ".gemini" / "config" / "hooks.json"
CONFIGS = {"keys.json": KEYS, "claude-settings.json": CLAUDE, "agy-hooks.json": AGY}

# The key → action pairs install.sh adds to keys.json's "global" (and ctrl-shift-m, which older
# versions added). Only these exact pairs are taken out; the person's own bindings stay.
INSTALL_KEYS = {"ctrl-shift-i": "crew-roster.profile", "ctrl-shift-space": "crew-header.search",
                "ctrl-shift-d": "crew-header.drop", "ctrl-shift-h": "crew-roster.home", "ctrl-shift-j": "crew-roster.chief",
                "ctrl-shift-g": "crew-roster.factory", "ctrl-shift-y": "crew-roster.computer",
                "ctrl-shift-m": "crew-roster.mode"}
CLAUDE_EVENTS = ("SessionStart", "PreToolUse", "PostToolUse", "Stop")
AGY_KEY = "project-pals"
BINS = ("pal", "pal-room", "crewd", "crew-hook", "crew-hook-fast", "crew-statusline", "crew-mcp")
ALIASES = {"buddy": "pal", "buddy-room": "pal-room", "botz": "pal", "botz-room": "pal-room", "crew": "pal", "crew-room": "pal-room"}
MARKERS = ("Project Pals", "Project Buddies", "Terminal Botz", "Herdr Crew", "crew-hook")
# Project Pals' shared crew.js, copied into every mod it installs (and the retired ones it installed).
MOD_MARKER = re.compile(r"^// (Project Pals|Project Buddies|Terminal Botz|Herdr Crew)\b", re.M)
BINDIR = USER / ".local" / "bin"
# Exactly the hook commands install-hooks.py writes (and older installs wrote): one of the two hook
# programs at their installed path, then one event word. A person's own hook that merely mentions
# crew-hook stays (T56, low).
OUR_HOOK = re.compile(r"^%s/crew-hook(-fast)? [a-z][a-z-]*$" % re.escape(str(BINDIR)))
STATUSLINE = str(BINDIR / "crew-statusline")
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


# ─── never through a symlink (T56, H2) ──────────────────────────────────────────────────────────

def app_home_unsafe():
    """Herdr's home itself (Grok T56 re-check): neither it nor a folder between your home and it (say
    ~/.config) may be a link, or everything under it would be followed there. Outside your home (a
    custom HERDR_APP_HOME), it must resolve to itself."""
    app = Path(os.path.abspath(APP))
    if app.is_symlink():
        return f"Herdr's home {app} is a link (to {os.readlink(app)})"
    if USER in app.parents:
        cur = USER
        for part in app.relative_to(USER).parts[:-1]:
            cur = cur / part
            if cur.is_symlink():
                return f"{cur}, above Herdr's home, is a link (to {os.readlink(cur)})"
    elif exists(app) and os.path.realpath(app) != str(app):
        return f"Herdr's home {app} resolves somewhere else ({os.path.realpath(app)})"
    return None


def unsafe(p):
    """None when `p` may be deleted or written: it lies under Herdr's home or $HOME, and every folder
    between that root and `p` is a real folder that resolves where its path says. Else why not.
    (`p` itself may be a link: it's then unlinked, never followed.)"""
    p = Path(os.path.abspath(p))
    roots = sorted((r for r in (APP, USER) if p == r or r in p.parents), key=lambda r: len(r.parts), reverse=True)
    if not roots or p in (APP, USER):
        return f"{p} isn't inside Herdr's home or your home folder"
    root = roots[0]
    if root == APP:
        why = app_home_unsafe()
        if why:
            return why
    cur = root
    for part in p.relative_to(root).parts[:-1]:
        cur = cur / part
        if cur.is_symlink():
            return f"{cur} is a link (to {os.readlink(cur)})"
        if exists(cur) and not cur.is_dir():
            return f"{cur} isn't a folder"
    if exists(p.parent) and os.path.realpath(p.parent) != os.path.join(os.path.realpath(root), *p.relative_to(root).parts[:-1]):
        return f"{p.parent} resolves somewhere else ({os.path.realpath(p.parent)})"
    return None


def write_nofollow(path, data, mode=None):
    """Replace `path` with `data` (bytes) without writing through a link: a fresh temp file opened
    O_EXCL | O_NOFOLLOW beside it, then renamed over it (a rename replaces, never follows)."""
    tmp = path.with_name(f".{path.name}.crew-{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        if mode is not None:
            os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ─── only the owner (T56, H1) ───────────────────────────────────────────────────────────────────

class NotAllowed(Exception):
    pass


def click_ok(click, args):
    """The app's one-time click token (crewlib.owner_gate's format) for exactly `args`. Used up either way."""
    if not click or not re.fullmatch(r"[0-9a-f]{16,64}", str(click)):
        return False
    path = CLICKS / f"{click}.json"
    tok = None if path.is_symlink() else load(path, None)   # (a token behind a linked data/ is still the app's)
    try:
        path.unlink()
    except OSError:
        pass
    return (isinstance(tok, dict) and tok.get("args") == list(args)
            and time.time() * 1000 - (tok.get("at") or 0) < CLICK_TTL * 1000)


# Programs that are coding agents (crewsleep.AGENT_COMMS and a few more harnesses).
AGENT_COMMS = {"claude", "agy", "codex", "gemini", "opencode", "grok", "hermes", "cursor-agent", "aider",
               "goose", "amp", "copilot", "crush", "qwen", "droid", "kiro", "kimi", "cline", "auggie"}


def terminal_has_agent(tid):
    """Does herdr-core report an agent status for this terminal? When it can't say, assume it does."""
    try:
        r = subprocess.run(["hc", "get", tid, "--json"], capture_output=True, text=True, timeout=10)
        return bool(json.loads(r.stdout).get("status"))
    except (OSError, ValueError, AttributeError, subprocess.TimeoutExpired):
        return True


def _proc(pid, name):
    try:
        with open(f"/proc/{pid}/{name}", "rb") as f:
            return f.read()
    except OSError:
        return b""


def agent_above():
    """Why this runs under an agent, or None. Grok's T56 re-check: a pal can give the uninstall a
    terminal of its own (expect, script, a pty) and drop HC_TERMINAL_ID first. So look up the whole
    process tree: an agent program above us, or an ancestor in a herdr-core terminal that has an agent
    (its HC_TERMINAL_ID is in that ancestor's own environment, whatever we were handed)."""
    tid = os.environ.get("HC_TERMINAL_ID")
    if tid and terminal_has_agent(tid):
        return f"terminal {tid} runs an agent"
    seen, checked, pid = set(), {tid} if tid else set(), os.getppid()
    while pid > 1 and pid not in seen:
        seen.add(pid)
        comm = _proc(pid, "comm").decode(errors="replace").strip()
        if comm in AGENT_COMMS:
            return f"it runs under {comm} (pid {pid})"
        for kv in _proc(pid, "environ").split(b"\0"):
            if kv.startswith(b"HC_TERMINAL_ID="):
                t = kv.split(b"=", 1)[1].decode(errors="replace")
                if t and t not in checked:
                    checked.add(t)
                    if terminal_has_agent(t):
                        return f"it runs under terminal {t}, which runs an agent"
        stat = _proc(pid, "stat").decode(errors="replace")
        try:
            pid = int(stat[stat.rindex(")") + 2:].split()[1])
        except (ValueError, IndexError):
            break
    return None


def purge_list():
    """What --purge deletes on top of an uninstall, in words (the typed prompt says it all first)."""
    data = sorted(d.name for d in DATA.glob("crew-*")) if DATA.is_dir() and not unsafe(DATA / "x") else []
    data = [n for n in data if n not in BOOKKEEPING and n != "crew-worktrees"]
    return (f"your pals' data in {DATA}: {', '.join(data) or 'nothing there'}; agy-models.json; "
            f"{APP / '.crew-backups'} (install and update backups); {USER / '.cache' / 'project-pals'}. "
            f"A crew-worktrees folder with worktrees in it stays.")


def typed_ok(purge):
    """The owner at a real terminal types "uninstall". A pal's shell has no controlling terminal, and
    a terminal a pal makes (expect, script, a pty) has the pal above it (agent_above), so both are
    refused. The owner's own terminal has neither."""
    try:
        fd = os.open("/dev/tty", os.O_RDWR | os.O_NOCTTY)   # (a text "r+" open fails: a tty can't seek)
    except OSError:
        return False
    try:
        if agent_above():
            return False
        what = f"This takes Project Pals out of {APP}."
        if purge:
            what += f"\n--purge also deletes {purge_list()}"
        os.write(fd, (what + "\nType uninstall to go ahead: ").encode())
        line = b""
        while not line.endswith(b"\n") and len(line) < 200:
            chunk = os.read(fd, 1)
            if not chunk:
                break
            line += chunk
        return line.decode(errors="replace").strip() == "uninstall"
    finally:
        os.close(fd)


def authorize(purge, click=None, args=None):
    """Raise NotAllowed unless the owner asked: their click for exactly `args`, or (no click) typed
    confirmation at a real terminal. A wrong or used click is refused, never downgraded."""
    args = list(args) if args is not None else ["uninstall"] + (["--purge"] if purge else [])
    if click:
        if click_ok(click, args):
            return "click"
        raise NotAllowed("that click expired or was for something else; click Uninstall again in About")
    if typed_ok(purge):
        return "typed"
    why = agent_above() if os.path.exists("/dev/tty") else None
    raise NotAllowed("uninstalling Project Pals is the owner's: About → Uninstall in Project Pals, or run "
                     "./install.sh --uninstall yourself in a terminal (not an agent's) and type uninstall"
                     + (f" (not here: {why})" if why else "") + ". --dry-run lists what would go and needs neither")


# ─── the manifest: what an install placed ───────────────────────────────────────────────────────

def candidates(src_mods=()):
    """Every path an install places (mods: those named in `src_mods`, else every mods/crew-*)."""
    mods = APP / "mods"
    names = list(src_mods) or ([d.name for d in sorted(mods.glob("crew-*"))] if mods.is_dir() else [])
    out = [mods / n for n in names] + [APP / "layouts" / "pals.json", APP / "layouts" / "pals.svg"]
    out += [BINDIR / n for n in (*BINS, *ALIASES)]
    out += [USER / ".local" / "lib" / "herdr-crew", UNIT, UNIT.parent / "default.target.wants" / "herdr-crew.service",
            USER / ".claude" / "project-pals"]
    return out


def record_installed(src):
    """After an install: add what it placed to the manifest (crew-footprint.json "installed")."""
    src_mods = [d.name for d in sorted((Path(src) / "mods").glob("crew-*")) if d.is_dir()]
    fp = load(FOOTPRINT, {}) or {}
    have = set(fp.get("installed") or [])
    for p in candidates(src_mods):
        if not exists(p):
            continue
        if p.parent == BINDIR and p.name in ALIASES and not (p.is_symlink() and os.readlink(p) == ALIASES[p.name]):
            continue   # someone else's `crew` (install leaves it alone)
        have.add(str(p))
    fp["installed"] = sorted(have)
    DATA.mkdir(parents=True, exist_ok=True)
    write_nofollow(FOOTPRINT, json.dumps(fp, indent=2).encode())
    return fp


# ─── record (install.sh, before anything changes) ───────────────────────────────────────────────

def has_ours(name, data):
    """Does this config already hold something Project Pals put there (an older install)?"""
    if not isinstance(data, dict):
        return False
    if name == "keys.json":
        g = data.get("global")
        return isinstance(g, dict) and any(g.get(k) == a for k, a in INSTALL_KEYS.items())
    if name == "claude-settings.json":
        hooks = data.get("hooks") if isinstance(data.get("hooks"), dict) else {}
        ours = any(our_hook(h) for es in hooks.values() if isinstance(es, list)
                   for e in es if isinstance(e, dict) for h in (e.get("hooks") or []))
        sl = data.get("statusLine")
        return ours or (isinstance(sl, dict) and str(sl.get("command", "")).strip() == STATUSLINE)
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


def our_hook(h):
    return isinstance(h, dict) and bool(OUR_HOOK.match(str(h.get("command", "")).strip()))


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
                keep = [h for h in hs if not our_hook(h)]
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
    if isinstance(sl, dict) and str(sl.get("command", "")).strip() == STATUSLINE:
        if isinstance(orig.get("statusLine"), dict) and str(orig["statusLine"].get("command", "")).strip() != STATUSLINE:
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
        # The manifest (install's "installed" list); None for an install from before it.
        self.installed = set(fp["installed"]) if isinstance(fp.get("installed"), list) else None

    def say(self, msg):
        self.log(("would: " if self.dry else "") + msg)

    def created(self, p):
        """Did an install create this path? (True only when `record` saw it missing.)"""
        return self.existed.get(str(p)) is False

    def listed(self, p):
        """Is `p` in the install manifest? (An install from before the manifest: None, can't tell.)"""
        return None if self.installed is None else str(p) in self.installed

    def refuse(self, p, why):
        self.notes.append(f"left {p} alone: {why}. If it's Project Pals', remove it by hand")
        self.kept.append(str(p))

    def backup(self, path):
        if self.dry or not path.is_file():
            return
        dest = APP / ".crew-backups" / f"uninstall-{self.stamp}"
        why = unsafe(dest / "x")
        if why:
            raise OSError(f"can't back up {path}: {why}")
        dest.mkdir(parents=True, exist_ok=True)
        write_nofollow(dest / (path.name if path != CLAUDE else "claude-settings.json"), path.read_bytes())
        self.kept.append(str(dest))

    def remove(self, p, what=None):
        if not exists(p):
            return
        why = unsafe(p)
        if why:
            self.refuse(p, why)
            return
        self.say(f"remove {what or p}")
        self.removed.append(str(p))
        if self.dry:
            return
        if p.is_dir() and not p.is_symlink():
            shutil.rmtree(p)   # the fd-based walk: links inside are unlinked, not followed
        else:
            p.unlink()

    def remove_installed(self, p, what=None, ours=lambda _p: True):
        """Remove something an install placed: only when the manifest lists it (and it still looks
        like Project Pals'), or, with no manifest, when its content says it's Project Pals'."""
        if not exists(p):
            return
        listed = self.listed(p)
        if listed is False:
            return
        if not ours(p):
            self.notes.append(f"left {p} alone: it isn't Project Pals'")
            return
        self.remove(p, what)

    def write(self, path, data, what, backup=True):
        """Write a config file in place: never through a link (after a backup when it keeps edits)."""
        why = unsafe(path) or (f"{path} is a link (to {os.readlink(path)})" if path.is_symlink() else None)
        if why:
            self.refuse(path, f"{why}; take Project Pals' entries out of it yourself")
            return
        self.say(what)
        self.restored.append(str(path))
        if not self.dry:
            mode = path.stat().st_mode & 0o7777
            if backup:
                self.backup(path)
            write_nofollow(path, data, mode)

    def config(self, name, path, cleaner, fmt):
        """Take Project Pals' entries out of one of the person's config files."""
        if path.is_symlink():
            # Read through it (reading changes nothing); never write. Say so only when it has ours.
            if path.is_file() and has_ours(name, load(path, None)):
                self.refuse(path, f"it's a link (to {os.readlink(path)}); take Project Pals' entries out of it yourself")
            return
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
                self.write(path, orig_raw, f"put {path} back exactly as it was before Project Pals", backup=False)
            return
        if not cleaned and self.created(path):
            self.remove(path, f"{path} (Project Pals made it; nothing else is in it)")
            return
        if cleaned == cur:
            return
        self.write(path, fmt(cleaned).encode(), f"take Project Pals' entries out of {path}")


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


def ours_mod(d):
    """A mod folder Project Pals installed: it holds Project Pals' shared crew.js (retired ones too)."""
    js = d / "crew.js"
    try:
        return d.is_dir() and not d.is_symlink() and js.is_file() and not js.is_symlink() and bool(MOD_MARKER.search(js.read_text(errors="replace")[:2000]))
    except OSError:
        return False


def uninstall(purge=False, dry=False, log=print, click=None, args=None):
    """Take Project Pals out. Not a dry run: only for the owner (authorize), whoever calls this."""
    if not dry:
        authorize(purge, click, args)
    run = Run(dry, log)
    if run.installed is None:
        run.notes.append("this install is older than its list of installed files: each one was checked for Project Pals' own content instead")

    # 1. crewd: stop it first, so it doesn't write anything while the rest goes.
    unit_ours = lambda p: p.is_file() and not p.is_symlink() and "crewd" in p.read_text(errors="replace")
    if exists(UNIT) and run.listed(UNIT) is not False and unit_ours(UNIT) and not unsafe(UNIT):
        run.say("stop and disable crewd (herdr-crew.service)")
        if not dry:
            subprocess.run(["systemctl", "--user", "disable", "--now", "herdr-crew.service"], capture_output=True, timeout=60)
        wants = UNIT.parent / "default.target.wants" / "herdr-crew.service"
        if wants.is_symlink():
            run.remove(wants, f"{wants} (crewd's start-at-login link)")
        run.remove_installed(UNIT, f"{UNIT} (crewd's service)", unit_ours)
        if not dry:
            subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True, timeout=60)
    elif exists(UNIT):
        run.remove_installed(UNIT, f"{UNIT} (crewd's service)", unit_ours)

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
    cmod = USER / ".claude" / "project-pals"
    run.remove_installed(cmod, "~/.claude/project-pals (the Desk's Claude Code mod)",
                         lambda p: p.is_dir() and not p.is_symlink() and (p / "pals").is_dir())
    for name, target in ALIASES.items():
        p = BINDIR / name
        run.remove_installed(p, f"{p} (an old name for {target})",
                             lambda q, t=target: q.is_symlink() and os.readlink(q) in (t, str(BINDIR / t)))
    for name in BINS:
        p = BINDIR / name
        run.remove_installed(p, None, lambda q: q.is_file() and not q.is_symlink() and ours_file(q))
    lib = USER / ".local" / "lib" / "herdr-crew"
    run.remove_installed(lib, f"{lib} (Project Pals' library{', a link to a checkout' if lib.is_symlink() else ''})",
                         lambda q: q.is_symlink() or (q.is_dir() and (q / "crewlib.py").is_file()))

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
    layout = APP / "layouts" / "pals.json"
    run.remove_installed(layout, None, lambda q: q.is_file() and not q.is_symlink() and "crew-roster" in q.read_text(errors="replace"))
    if not exists(layout):
        run.remove_installed(APP / "layouts" / "pals.svg", None, lambda q: q.is_file() and not q.is_symlink())
    mods_unsafe = unsafe(APP / "mods" / "crew-x") if exists(APP / "mods") else None
    if mods_unsafe and any((APP / "mods").glob("crew-*")):
        run.refuse(APP / "mods", f"{mods_unsafe}, so its crew-* mods weren't touched")
    for d in sorted((APP / "mods").glob("crew-*")) if (APP / "mods").is_dir() and not mods_unsafe else []:
        # Every mod, retired names (RETIRED_MODS, which later installs set aside) included: with a manifest it must be listed AND hold Project Pals'
        # crew.js; with none (an older install), the crew.js alone decides (Grok T56 re-check).
        if run.listed(d) is None:
            if ours_mod(d):
                run.remove(d)
            elif d.is_dir():
                run.notes.append(f"left {d} alone: it isn't Project Pals'")
        else:
            run.remove_installed(d, None, ours_mod)

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
        if backups.is_symlink():
            run.refuse(backups, f"it's a link (to {os.readlink(backups)})")
        elif backups.is_dir():
            for p in sorted(backups.iterdir()):
                if p.name != this_run:
                    run.remove(p)
            if (backups / this_run).exists():
                run.notes.append(f"kept {backups / this_run}: your config files as they were before this uninstall")
            elif not dry and not unsafe(backups):
                backups.rmdir()
    for n in BOOKKEEPING:
        run.remove(DATA / n)

    # 7. Folders an install made, when nothing else is left in them (deepest first).
    for p in sorted(WATCHED, key=lambda x: len(x.parts), reverse=True):
        if run.created(p) and p.is_dir() and not p.is_symlink() and not unsafe(p):
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
    if cmd == "record-installed" and len(argv) == 2:
        record_installed(argv[1])
        return 0
    if cmd != "uninstall":
        print(__doc__.strip())
        return 2
    rest, click, i = [], None, 1
    while i < len(argv):
        if argv[i] == "--click" and i + 1 < len(argv):
            click, i = argv[i + 1], i + 2
            continue
        if argv[i] not in ("--purge", "--dry-run", "--json"):
            print(f"unknown option: {argv[i]}", file=sys.stderr)
            return 2
        rest.append(argv[i])
        i += 1
    as_json = "--json" in rest
    try:
        out = uninstall(purge="--purge" in rest, dry="--dry-run" in rest, log=(lambda *_: None) if as_json else print,
                        click=click, args=["uninstall", *rest])
    except NotAllowed as e:
        if as_json:
            print(json.dumps({"ok": False, "error": str(e)}))
        else:
            print(f"not uninstalled: {e}", file=sys.stderr)
        return 3
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
