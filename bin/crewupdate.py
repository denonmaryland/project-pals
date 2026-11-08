"""Project Pals updates: check the project's GitHub releases, install a newer one, roll back.

  data/crew-install.json   what's installed: version, repo, whether the helpers are, when
  data/crew-update.json    the last check: latest version, its notes, when it was checked
  data/crew-update-run.json  the last install or roll back as it goes (running, done, failed), so
                           the app can follow it while the update reloads its own mods
  .crew-backups/update-*   a snapshot of everything an update replaces, for rolling back

An update only ever comes from the configured repo's releases. A release may carry its own
tarball with a SHA256SUMS file (the release script adds both); then the download must match.
Only Project Pals's own files change: pals, rooms, memory, routines, tasks and looks live in
data/ and shared.json and are never touched.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import io
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

from crewlib import HOME, DATA, CrewError, load_json, save_json

INSTALL = DATA / "crew-install.json"
STATE = DATA / "crew-update.json"
RUN = DATA / "crew-update-run.json"
CHECK_EVERY = 6 * 3600   # seconds between automatic checks (crewd, the status bar)
BACKUPS = HOME / ".crew-backups"
CACHE = Path.home() / ".cache" / "project-pals"
UA = {"User-Agent": "project-pals-updater", "Accept": "application/vnd.github+json"}


def run_state(fresh=False, **kw):
    """Record how an install or roll back is going (merged into the current run's record; fresh starts one)."""
    save_json(RUN, {**({} if fresh else load_json(RUN, {})), **kw, "at": time.time()})


def installed():
    return load_json(INSTALL, {})


def vtuple(v):
    nums = re.findall(r"\d+", str(v or "0"))
    return tuple(int(x) for x in (nums + ["0", "0", "0"])[:3])


MAX_DOWNLOAD = 64 * 1024 * 1024


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read(MAX_DOWNLOAD + 1)
    if len(body) > MAX_DOWNLOAD:
        raise CrewError("the download is bigger than any Project Pals release should be; not using it")
    return body


def check():
    """Ask GitHub for the latest release; remember what it said."""
    ins = installed()
    repo = ins.get("repo")
    if not repo:
        raise CrewError("no repo to check (data/crew-install.json has none); reinstall from the project folder")
    try:
        rel = json.loads(fetch(f"https://api.github.com/repos/{repo}/releases/latest"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            state = {"checked": time.time(), "repo": repo, "latest": None, "note": "no releases yet"}
            save_json(STATE, state)
            return {**state, "current": ins.get("version"), "available": False}
        raise CrewError(f"GitHub said {e.code} for {repo}")
    except (urllib.error.URLError, OSError) as e:
        raise CrewError(f"couldn't reach GitHub: {getattr(e, 'reason', e)}")
    latest = (rel.get("tag_name") or "").lstrip("v")
    state = {
        "checked": time.time(), "repo": repo, "latest": latest, "tag": rel.get("tag_name"),
        "name": rel.get("name") or rel.get("tag_name"), "notes": (rel.get("body") or "").strip()[:4000],
        "published": rel.get("published_at"), "url": rel.get("html_url"),
        "assets": [{"name": a["name"], "url": a["browser_download_url"]} for a in rel.get("assets", [])],
        "tarball": rel.get("tarball_url"),
    }
    save_json(STATE, state)
    return {**state, "current": ins.get("version"), "available": vtuple(latest) > vtuple(ins.get("version"))}


def _safe_extract(tar_path, dest):
    """Only plain files and folders, all inside dest."""
    with tarfile.open(tar_path) as tar:
        for m in tar.getmembers():
            p = (dest / m.name).resolve()
            if not str(p).startswith(str(dest.resolve()) + os.sep) and p != dest.resolve():
                raise CrewError(f"refusing a file outside the release: {m.name}")
            if not (m.isfile() or m.isdir()):
                raise CrewError(f"refusing something that isn't a plain file in the release: {m.name}")
        if hasattr(tarfile, "data_filter"):
            tar.extractall(dest, filter="data")
        else:
            tar.extractall(dest)


# ─── Project Pals' own settings in files the person also edits (Codex review M6) ─────────────────
# An install adds or changes a few entries in keys.json (ctrl-shift-i, ctrl-shift-space, the old ctrl-shift-m) and in
# ~/.claude/settings.json (Project Pals' hook entries and its status-line wrapper). A snapshot
# records them as they were (absence included); Roll back puts back only those, and only where the
# current value is still Project Pals' own, so the person's later edits stay.
MANAGED_KEYS = ("ctrl-shift-i", "ctrl-shift-space", "ctrl-shift-m")
# The actions those keys are bound to by Project Pals (anything else there is the person's own).
OUR_ACTIONS = ("crew-roster.", "crew-header.")
CONFIG_MEMBER = ".crew-config-snapshot.json"
# The Claude Code hook events Project Pals adds entries to. PostToolUse and Stop came with the hook
# delivery (0.4, PR #2). A snapshot that doesn't list an event (one taken by an older updater) means
# Project Pals had no entry there then, as with MANAGED_KEYS, so Roll back takes its entry out.
MANAGED_EVENTS = ("SessionStart", "PreToolUse", "PostToolUse", "Stop")
# Antigravity CLI's hooks file: Project Pals's entries live under its own "project-pals" key.
AGY_HOOKS_KEY = "project-pals"


def _agy_hooks():
    return Path.home() / ".gemini" / "config" / "hooks.json"


def _claude_settings():
    return Path.home() / ".claude" / "settings.json"


def config_state():
    keys = load_json(HOME / "keys.json", None)
    g = keys.get("global", {}) if isinstance(keys, dict) else {}
    st = load_json(_claude_settings(), None)
    hooks = (st or {}).get("hooks", {}) if isinstance(st, dict) else {}
    ours = {ev: [e.get("matcher") for e in hooks.get(ev, []) if any("crew-hook" in h.get("command", "") for h in e.get("hooks", []))]
            for ev in MANAGED_EVENTS}
    sl = (st or {}).get("statusLine") if isinstance(st, dict) else None
    agy = load_json(_agy_hooks(), None)
    return {"keys_file": keys is not None, "keys": {k: g.get(k) for k in MANAGED_KEYS},
            "settings_file": st is not None, "hooks": ours,
            "agy_hooks": isinstance(agy, dict) and AGY_HOOKS_KEY in agy,
            "statusline_wrapped": bool(sl and "crew-statusline" in str(sl.get("command", "")))}


def restore_config(snap, log=print):
    """Put back Project Pals' entries as they were in `snap` (config_state() at snapshot time)."""
    stamp = time.strftime("%Y%m%d-%H%M%S")
    changed = []
    kp = HOME / "keys.json"
    keys = load_json(kp, None)
    if isinstance(keys, dict) and snap.get("keys_file"):
        g = keys.setdefault("global", {})
        before = json.dumps(keys, sort_keys=True)
        # Every key Project Pals manages, not only the snapshot's: a snapshot taken by an older updater
        # doesn't list a key added since (ctrl-shift-space), and absent there means it wasn't set.
        for k in MANAGED_KEYS:
            was = (snap.get("keys") or {}).get(k)
            now = g.get(k)
            if now == was:
                continue
            # Only an entry Project Pals set: one of its actions, or one it removed (absent now).
            if now is None or str(now).startswith(OUR_ACTIONS):
                if was is None:
                    g.pop(k, None)
                else:
                    g[k] = was
                changed.append(f"keys.json {k}: {now!r} -> {was!r}")
            else:
                log(f"left keys.json {k} as it is ({now!r}): it was changed since")
        if json.dumps(keys, sort_keys=True) != before:
            BACKUPS.mkdir(parents=True, exist_ok=True)
            shutil.copy2(kp, BACKUPS / f"rollback-{stamp}-keys.json")
            save_json(kp, keys)
    sp = _claude_settings()
    st = load_json(sp, None)
    if isinstance(st, dict):
        before = json.dumps(st, sort_keys=True)
        hooks = st.setdefault("hooks", {})
        # Every event Project Pals manages, not only the snapshot's: an older snapshot doesn't list
        # PostToolUse / Stop, and absent there means Project Pals had no entry then.
        snap_hooks = snap.get("hooks") or {}
        for ev in MANAGED_EVENTS:
            was = snap_hooks.get(ev) or []
            entries = hooks.get(ev, [])
            ours = [e for e in entries if any("crew-hook" in h.get("command", "") for h in e.get("hooks", []))]
            if not was:
                # Not there before this install: take Project Pals' entries out again.
                if ours:
                    hooks[ev] = [e for e in entries if e not in ours]
                    changed.append(f"settings.json {ev}: removed Project Pals' hook")
            else:
                for e, m in zip(ours, was):
                    if e.get("matcher") != m:
                        changed.append(f"settings.json {ev} matcher: {e.get('matcher')!r} -> {m!r}")
                        e["matcher"] = m
        sl = st.get("statusLine")
        if not snap.get("statusline_wrapped") and sl and "crew-statusline" in str(sl.get("command", "")):
            orig = (DATA / "crew-statusline-original")
            if orig.exists():
                st["statusLine"] = {**sl, "command": orig.read_text().strip()}
            else:
                st.pop("statusLine", None)
            changed.append("settings.json statusLine: back to the original")
        if json.dumps(st, sort_keys=True) != before:
            BACKUPS.mkdir(parents=True, exist_ok=True)
            shutil.copy2(sp, BACKUPS / f"rollback-{stamp}-claude-settings.json")
            tmp = sp.with_suffix(".crew.tmp")
            tmp.write_text(json.dumps(st, indent=2, ensure_ascii=False) + "\n")
            tmp.replace(sp)
    # Antigravity CLI: take Project Pals's hooks out when the version rolled back to didn't have them.
    ap = _agy_hooks()
    agy = load_json(ap, None)
    if not snap.get("agy_hooks") and isinstance(agy, dict) and AGY_HOOKS_KEY in agy:
        BACKUPS.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ap, BACKUPS / f"rollback-{stamp}-agy-hooks.json")
        agy.pop(AGY_HOOKS_KEY)
        tmp = ap.with_suffix(".crew.tmp")
        tmp.write_text(json.dumps(agy, indent=2, ensure_ascii=False) + "\n")
        tmp.replace(ap)
        changed.append("hooks.json: removed Project Pals' Antigravity CLI hooks")
    return changed


APP = "@app"   # snapshot names under Herdr's home start with this (it needn't be inside $HOME)


def _snapshot(label):
    """Everything an update replaces, in one tarball, so it can be put back. Files in Herdr's home
    are stored as @app/<path there>, the rest relative to $HOME."""
    BACKUPS.mkdir(parents=True, exist_ok=True)
    path = BACKUPS / f"update-{label}-{time.strftime('%Y%m%d-%H%M%S')}.tar.gz"
    home = Path.home()
    app = [p for p in (HOME / "mods").glob("crew-*")] + [HOME / "layouts" / n for n in ("pals.json", "pals.svg", "buddies.json", "buddies.svg", "crew.json", "crew.svg")]
    app += [HOME / "data" / "crew-god" / "AGENTS.md", INSTALL]
    user = [home / ".local" / "bin" / n for n in ("pal", "pal-room", "buddy", "buddy-room", "botz", "botz-room", "crew", "crew-room", "crewd", "crew-hook", "crew-hook-fast", "crew-statusline")]
    user += [home / ".local" / "lib" / "herdr-crew", home / ".config" / "systemd" / "user" / "herdr-crew.service"]
    # Without the generated mascots (they're redrawn on install).
    skip = lambda ti: None if "/mascots/" in ti.name and ti.name.endswith(".svg") else ti
    with tarfile.open(path, "w:gz") as tar:
        for p in app:
            if p.exists() or p.is_symlink():
                tar.add(p, arcname=f"{APP}/{p.relative_to(HOME)}", filter=skip)
        for p in user:
            if p.exists() or p.is_symlink():
                tar.add(p, arcname=str(p.relative_to(home)), filter=skip)
        # Project Pals' entries in keys.json and ~/.claude/settings.json, as they are now (review M6).
        data = json.dumps(config_state()).encode()
        info = tarfile.TarInfo(CONFIG_MEMBER)
        info.size, info.mtime = len(data), int(time.time())
        tar.addfile(info, io.BytesIO(data))
    return path


def backups():
    """Update snapshots, oldest first (by time: names hold versions, which don't sort as text)."""
    return sorted(BACKUPS.glob("update-*.tar.gz"), key=lambda p: p.stat().st_mtime) if BACKUPS.exists() else []


def rollback(path=None, log=print):
    path = Path(path) if path else (backups()[-1] if backups() else None)
    if not path or not path.exists():
        raise CrewError("no update backup to roll back to")
    home = Path.home()
    with tarfile.open(path) as tar:
        members = tar.getmembers()
        for m in members:
            if m.name.startswith("/") or ".." in Path(m.name).parts:
                raise CrewError(f"odd path in backup: {m.name}")
        snap = None
        cfg = next((m for m in members if m.name == CONFIG_MEMBER), None)
        if cfg:
            try:
                snap = json.loads(tar.extractfile(cfg).read())
            except ValueError:
                snap = None
            members = [m for m in members if m.name != CONFIG_MEMBER]
        # Mods the newer version added (not in the snapshot) go, so nothing is left half old, half new.
        # Older snapshots stored Herdr's home relative to $HOME (it was always inside it then).
        mods_names = [f"{APP}/mods"]
        try:
            mods_names.append(str((HOME / "mods").relative_to(home)))
        except ValueError:
            pass
        kept = set()
        for m in members:
            for base in mods_names:
                if m.name.startswith(base + "/"):
                    kept.add(Path(m.name).parts[len(Path(base).parts)])
        for d in (HOME / "mods").glob("crew-*"):
            if d.name not in kept:
                shutil.rmtree(d, ignore_errors=True)
        ours = [m for m in members if m.name == APP or m.name.startswith(APP + "/")]
        rest = [m for m in members if m not in ours]
        for m in ours:
            m.name = m.name[len(APP) + 1:] if m.name != APP else "."
        for dest, group in ((HOME, ours), (home, rest)):
            if not group:
                continue
            if hasattr(tarfile, "data_filter"):
                tar.extractall(dest, members=group, filter="data")
            else:
                tar.extractall(dest, members=group)
    if snap:
        for line in restore_config(snap, log=log):
            log(line)
    subprocess.run(["systemctl", "--user", "try-restart", "herdr-crew.service"], capture_output=True)
    return path


def apply(log=print, version=None):
    """Download the latest release (or `version`), install it, roll back if it doesn't check out."""
    info = check()
    if not info.get("latest"):
        raise CrewError("there are no releases yet")
    if version and version.lstrip("v") != info["latest"]:
        raise CrewError(f"only the latest release ({info['latest']}) can be installed from here")
    if not info["available"] and not version:
        return {"ok": True, "updated": False, "version": info.get("current"), "message": "already up to date"}
    CACHE.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="update-", dir=CACHE))
    try:
        assets = {a["name"]: a["url"] for a in info.get("assets", [])}
        own = next((n for n in assets if n.endswith(".tar.gz")), None)
        tar_path = work / "release.tar.gz"
        if own:
            log(f"downloading {own}")
            tar_path.write_bytes(fetch(assets[own], timeout=120))
            sums = assets.get("SHA256SUMS")
            if not sums:
                raise CrewError("the release has a tarball but no SHA256SUMS to check it against")
            want = None
            for line in fetch(sums).decode().splitlines():
                parts = line.split()
                if len(parts) == 2 and parts[1].lstrip("*") == own:
                    want = parts[0].lower()
            got = hashlib.sha256(tar_path.read_bytes()).hexdigest()
            if not want or want != got:
                raise CrewError("the download doesn't match the release's SHA256SUMS; not installing it")
        else:
            raise CrewError("this release has no checked download (a .tar.gz with SHA256SUMS); releases are made with ./release")
        src = work / "src"
        src.mkdir()
        _safe_extract(tar_path, src)
        roots = [p.parent for p in src.rglob("VERSION") if (p.parent / "install.sh").exists()]
        if not roots:
            raise CrewError("the release doesn't look like Project Pals (no VERSION and install.sh)")
        root = min(roots, key=lambda p: len(p.parts))
        new_version = (root / "VERSION").read_text().strip()
        if new_version != info["latest"]:
            raise CrewError(f"the release says {info['latest']} but contains {new_version}; not installing it")
        snap = _snapshot(f"from-{installed().get('version', 'unknown')}")
        log(f"backed up the current version to {snap.name}")
        args = ["bash", str(root / "install.sh"), "--from-release"]
        ins_now = installed()
        if not ins_now.get("helpers", True):
            args.append("--no-helpers")
        else:
            if not ins_now.get("claude_hooks", True):
                args.append("--no-claude-hooks")
            if not ins_now.get("agy_hooks", True):
                args.append("--no-agy-hooks")
        try:
            r = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=600)
        except BaseException as e:
            rollback(snap, log=log)
            raise CrewError(f"installing {new_version} stopped ({type(e).__name__}), so the previous version was put back")
        if r.returncode != 0:
            rollback(snap, log=log)
            tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-12:])
            raise CrewError(f"version {new_version} didn't install cleanly, so the previous one was put back:\n{tail}")
        log(f"installed {new_version}")
        return {"ok": True, "updated": True, "version": new_version, "backup": str(snap)}
    finally:
        shutil.rmtree(work, ignore_errors=True)
