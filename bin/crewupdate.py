"""Project Pals updates: check the project's GitHub releases, install a newer one, roll back.

  data/crew-install.json   what's installed: version, repo, whether the helpers are, when
  data/crew-update.json    the last check: latest version, its notes, when it was checked
  data/crew-update-run.json  the last install or roll back as it goes (running, done, failed), so
                           the app can follow it while the update reloads its own mods
  .crew-backups/update-*   a snapshot of everything an update replaces, for rolling back
  data/crew-live.json      the Live channel and "Try it live" (T90, at the end of this file): the last
                           landing that went live, a commit that's held, the branch being tried

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

from crewlib import HOME, DATA, SETTINGS, CrewError, load_json, save_json, locked

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


def fetch(url, timeout=20, fresh=False):
    req = urllib.request.Request(url, headers={**UA, **({"Cache-Control": "no-cache"} if fresh else {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read(MAX_DOWNLOAD + 1)
    if len(body) > MAX_DOWNLOAD:
        raise CrewError("the download is bigger than any Project Pals release should be; not using it")
    return body


def check():
    """Ask GitHub for the latest release, every time (no cache of ours, and asking GitHub's not to
    serve a stale copy); remember what it said. A check that fails keeps the last good answer and
    records when it tried and why it failed, so About can say so instead of showing an old
    "up to date" as if it were new (T64: 0.4.1 shipped and nothing offered it)."""
    ins = installed()
    repo = ins.get("repo")
    if not repo:
        raise CrewError("no repo to check (data/crew-install.json has none); reinstall from the project folder")

    def failed(why):
        save_json(STATE, {**load_json(STATE, {}), "tried": time.time(), "error": why})
        return CrewError(why)

    try:
        rel = json.loads(fetch(f"https://api.github.com/repos/{repo}/releases/latest", fresh=True))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            state = {"checked": time.time(), "repo": repo, "latest": None, "note": "no releases yet"}
            save_json(STATE, state)
            return {**state, "current": ins.get("version"), "available": False}
        raise failed(f"GitHub said {e.code} for {repo}" + (" (too many checks this hour; try again later)" if e.code in (403, 429) else ""))
    except (urllib.error.URLError, OSError) as e:
        raise failed(f"couldn't reach GitHub: {getattr(e, 'reason', e)}")
    except ValueError:
        raise failed("GitHub's answer wasn't readable")
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
# delivery (0.4.0, PR #2). A snapshot that doesn't list an event (one taken by an older updater) means
# Project Pals had no entry there then, as with MANAGED_KEYS, so Roll back takes its entry out.
MANAGED_EVENTS = ("SessionStart", "PreToolUse", "PostToolUse", "Stop")
# Antigravity CLI's hooks file: Project Pals's entries live under its own "project-pals" key.
AGY_HOOKS_KEY = "project-pals"


def _agy_hooks():
    return Path.home() / ".gemini" / "config" / "hooks.json"


def _claude_settings():
    return Path.home() / ".claude" / "settings.json"


def _our_hook(h):
    """Exactly a hook command install-hooks.py writes (not any command mentioning crew-hook: Grok T56)."""
    bindir = re.escape(str(Path.home() / ".local" / "bin"))
    return isinstance(h, dict) and bool(re.match(r"^%s/crew-hook(-fast)? [a-z][a-z-]*$" % bindir, str(h.get("command", "")).strip()))


def _our_statusline(sl):
    return isinstance(sl, dict) and str(sl.get("command", "")).strip() == str(Path.home() / ".local" / "bin" / "crew-statusline")


def config_state():
    keys = load_json(HOME / "keys.json", None)
    g = keys.get("global", {}) if isinstance(keys, dict) else {}
    st = load_json(_claude_settings(), None)
    hooks = (st or {}).get("hooks", {}) if isinstance(st, dict) else {}
    ours = {ev: [e.get("matcher") for e in hooks.get(ev, []) if any(_our_hook(h) for h in e.get("hooks", []))]
            for ev in MANAGED_EVENTS}
    sl = (st or {}).get("statusLine") if isinstance(st, dict) else None
    agy = load_json(_agy_hooks(), None)
    return {"keys_file": keys is not None, "keys": {k: g.get(k) for k in MANAGED_KEYS},
            "settings_file": st is not None, "hooks": ours,
            "agy_hooks": isinstance(agy, dict) and AGY_HOOKS_KEY in agy,
            "statusline_wrapped": _our_statusline(sl),
            "oomd_dropin": _dropin_text()}


# The hc-hold oomd drop-in the installer adds (T153, install.sh; crewmem.install_dropin). It lives in
# the user's systemd folder, outside what a snapshot's files cover, so a snapshot records its content
# (None: not there) and Roll back puts that back (T201, Codex T198 P2).
def _dropin_path():
    return Path.home() / ".config" / "systemd" / "user" / "hc-hold-.service.d" / "00-project-pals-oomd.conf"


def _dropin_text():
    try:
        return _dropin_path().read_text()
    except OSError:
        return None


def _dropin_ours():
    """The text this build's installer writes, or None when crewmem isn't there to say."""
    try:
        import crewmem
        return crewmem.DROPIN_TEXT
    except Exception:
        return None


def restore_dropin(snap, log=print):
    """Put the drop-in back as the snapshot had it: take ours away if it wasn't there, put the old
    text back if it was. Only a file still as an install left it is changed (Project Pals' text now,
    or missing); one edited since stays, and is reported. Snapshots from before T201 don't say, so
    nothing is done for them. Reloads systemd after a change."""
    if not isinstance(snap, dict) or "oomd_dropin" not in snap:
        return []
    was, now, p = snap.get("oomd_dropin"), _dropin_text(), _dropin_path()
    if now == was:
        return []
    ours = _dropin_ours()
    if now is not None and now != ours:
        return [f"left {p} as it is: it was changed since the install"]
    try:
        if was is None:
            p.unlink()
            try:
                p.parent.rmdir()   # only when empty: a drop-in of the owner's stays
            except OSError:
                pass
            line = f"removed {p} (the install being undone added it)"
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(was)
            line = f"put back {p} as it was before the install"
    except OSError as e:
        return [f"couldn't put back {p}: {e}"]
    subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True)
    return [line]


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
        had_hooks = "hooks" in st
        hooks = st.setdefault("hooks", {})
        # Every event Project Pals manages, not only the snapshot's: an older snapshot doesn't list
        # PostToolUse / Stop, and absent there means Project Pals had no entry then.
        snap_hooks = snap.get("hooks") or {}
        for ev in MANAGED_EVENTS:
            was = snap_hooks.get(ev) or []
            entries = hooks.get(ev, [])
            ours = [e for e in entries if any(_our_hook(h) for h in e.get("hooks", []))]
            if not was:
                # Not there before this install: take Project Pals' entries out again.
                if ours:
                    hooks[ev] = [e for e in entries if e not in ours]
                    if not hooks[ev]:
                        hooks.pop(ev)   # no empty "Stop": [] left behind (B3)
                    changed.append(f"settings.json {ev}: removed Project Pals' hook")
            else:
                for e, m in zip(ours, was):
                    if e.get("matcher") != m:
                        changed.append(f"settings.json {ev} matcher: {e.get('matcher')!r} -> {m!r}")
                        e["matcher"] = m
        if not hooks and (not had_hooks or json.dumps(st, sort_keys=True) != before):
            st.pop("hooks")   # nor an empty "hooks": {} that Roll back itself emptied or made
        sl = st.get("statusLine")
        if not snap.get("statusline_wrapped") and _our_statusline(sl):
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


# ─── Files under data/ that an install writes over, and people edit (Codex T94, P1) ──────────────
# An install renders the head pal's, the Chief's and the idea partner's briefs and replaces the
# shipped pal-desk skill (unless it was edited). A snapshot holds them so that undoing an install
# (Back after a trial, Roll back, a swap that didn't come up) can put them back. But between the
# install and its undoing, a pal or the owner may have edited one: that edit is theirs, and
# everything under data/ is the user's first. So a snapshot's copy of such a file goes back only
# when the file on disk still is exactly what the install being undone wrote. `wrote` holds the
# files that install changed (compared with the snapshot taken just before it) and their hashes,
# kept beside the snapshot as <snapshot>.wrote.json and, for a trial, in crew-live.json; trials
# stacked on one snapshot merge theirs (merge_wrote). Edited, deleted, left alone by the install,
# or no record of what it wrote: left as it is.
# The install record (crew-install.json) is Project Pals' own and always goes back.
def rendered_files():
    d = HOME / "data"
    return [d / "crew-god" / "AGENTS.md", d / "crew-chief" / "AGENTS.md", d / "crew-partner" / "AGENTS.md",
            d / "crew-skills" / "pal-desk" / "SKILL.md", d / "crew-skills" / ".shipped.json"]


def _file_hash(p):
    try:
        return hashlib.sha256(Path(p).read_bytes()).hexdigest() if Path(p).is_file() else None
    except OSError:
        return None


def data_hashes():
    """What those files hold now: {path under Herdr's home: sha256, or None when it isn't there}."""
    return {p.relative_to(HOME).as_posix(): _file_hash(p) for p in rendered_files()}


def changed_since(snap):
    """What the install that followed this snapshot WROTE under data/: the files that now differ
    from the snapshot's copy, with their hash now. A file the install left alone (a customised skill
    it kept) isn't in here, whatever it holds: it was never the install's (Codex T130)."""
    was = {}
    try:
        with tarfile.open(snap) as tar:
            for m in tar.getmembers():
                if m.isfile() and m.name.startswith(f"{APP}/data/"):
                    was[m.name[len(APP) + 1:]] = hashlib.sha256(tar.extractfile(m).read()).hexdigest()
    except (OSError, tarfile.TarError):
        return {}   # nothing known to be the install's: those files are left alone
    return {k: h for k, h in data_hashes().items() if h != was.get(k)}


def merge_wrote(earlier, later):
    """Trials stacked on one snapshot: what the installs since it wrote, between them. The later
    install's writes replace the earlier's; a file the later one left alone keeps the earlier
    record, so an edit made in between still counts as an edit."""
    return {**(earlier or {}), **(later or {})}


def wrote_file(snap):
    return Path(str(snap) + ".wrote.json")


def note_wrote(snap):
    """Beside a snapshot: what the install that followed it wrote (for a later Roll back)."""
    wrote = changed_since(snap)
    try:
        save_json(wrote_file(snap), wrote)
    except OSError:
        pass   # without it, a Roll back leaves those files alone
    return wrote


def drop_snapshot(snap):
    Path(snap).unlink(missing_ok=True)
    wrote_file(snap).unlink(missing_ok=True)


def _theirs(tar, dest, m, wrote, log):
    """Is this snapshot member a file under data/ that must be left as it is?"""
    if not m.isfile():
        return False
    target = dest / m.name
    try:
        rel = target.resolve().relative_to((HOME / "data").resolve())
    except (ValueError, OSError):
        return False
    if target.resolve() == INSTALL.resolve():
        return False
    key = (Path("data") / rel).as_posix()
    now = _file_hash(target)
    if wrote is not None and key in wrote and wrote[key] is not None and now == wrote[key]:
        return False   # still what the install wrote: nobody's edit is lost by putting the old one back
    if now == hashlib.sha256(tar.extractfile(m).read()).hexdigest():
        return True    # it is what the snapshot holds: nothing to put back, nothing to say
    log(f"left {key} as it is (it was changed since, or there's no record of what the install wrote)")
    return True


def _snapshot(label):
    """Everything an update replaces, in one tarball, so it can be put back. Files in Herdr's home
    are stored as @app/<path there>, the rest relative to $HOME."""
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stem = f"update-{label}-{time.strftime('%Y%m%d-%H%M%S')}"
    path, n = BACKUPS / f"{stem}.tar.gz", 1
    while path.exists():   # two in one second: never over the first (it may be a trial's way back)
        n += 1
        path = BACKUPS / f"{stem}-{n}.tar.gz"
    home = Path.home()
    app = [p for p in (HOME / "mods").glob("crew-*")] + [HOME / "layouts" / n for n in ("pals.json", "pals.svg", "buddies.json", "buddies.svg", "crew.json", "crew.svg")]
    app += [INSTALL, *rendered_files()]
    user = [home / ".local" / "bin" / n for n in ("pal", "pal-room", "buddy", "buddy-room", "botz", "botz-room", "crew", "crew-room", "crewd", "crew-hook", "crew-hook-fast", "crew-statusline", "crew-mcp")]
    user += [home / ".local" / "lib" / "herdr-crew", home / ".config" / "systemd" / "user" / "herdr-crew.service"]
    user += [home / ".claude" / "project-pals"]   # the Desk's Claude Code mod (pals load it with --plugin-dir)
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


def rollback(path=None, log=print, wrote=None):
    """Put a snapshot back. wrote: what the install(s) being undone wrote under data/ (changed_since,
    merge_wrote); without it, the record kept beside the snapshot. See _theirs."""
    path = Path(path) if path else (backups()[-1] if backups() else None)
    if not path or not path.exists():
        raise CrewError("no update backup to roll back to")
    if wrote is None:
        wrote = load_json(wrote_file(path), None)
        wrote = wrote if isinstance(wrote, dict) else None
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
        # The Claude Code mod too: a version without it takes it away (its pals stop loading it).
        if not any(m.name == ".claude/project-pals" or m.name.startswith(".claude/project-pals/") for m in members):
            shutil.rmtree(home / ".claude" / "project-pals", ignore_errors=True)
        # Library files the newer version added (crewdesk.py …) go too (B3). Not through a symlink:
        # a development install links the folder to a checkout.
        lib, lib_name = home / ".local" / "lib" / "herdr-crew", ".local/lib/herdr-crew"
        listed = {m.name for m in members}
        if lib_name in listed and lib.is_dir() and not lib.is_symlink():
            for f in sorted(lib.rglob("*"), reverse=True):
                if f"{lib_name}/{f.relative_to(lib).as_posix()}" in listed:
                    continue
                if f.is_dir() and not f.is_symlink():
                    try:
                        f.rmdir()   # only once empty
                    except OSError:
                        pass
                else:
                    f.unlink()
        ours = [m for m in members if m.name == APP or m.name.startswith(APP + "/")]
        rest = [m for m in members if m not in ours]
        for m in ours:
            m.name = m.name[len(APP) + 1:] if m.name != APP else "."
        crewd_before = crewd_fingerprint()
        for dest, group in ((HOME, ours), (home, rest)):
            group = _to_write(tar, dest, [m for m in group if not _theirs(tar, dest, m, wrote, log)])
            if not group:
                continue
            if hasattr(tarfile, "data_filter"):
                tar.extractall(dest, members=group, filter="data")
            else:
                tar.extractall(dest, members=group)
    # Putting a build back is an install: crew-install.json came back with the old build's "installed",
    # and the helpers' recovery trusts that time (crewhelpers._copy_current: a copy written before the
    # last install can't be vouched for). Left rewound, a backup with a helper On, made before an
    # older build saved the owner's Off to the list only, would look current again (T208, Codex T199 d).
    ins = installed()
    if isinstance(ins, dict) and ins:
        ins["installed"] = time.time()
        save_json(INSTALL, ins)
    if snap:
        for line in restore_config(snap, log=log) + restore_dropin(snap, log=log):
            log(line)
    # crewd holds its code in memory: restart it when what was put back differs from what it runs.
    if crewd_fingerprint() != crewd_before:
        subprocess.run(["systemctl", "--user", "try-restart", "herdr-crew.service"], capture_output=True)
    return path


def _to_write(tar, dest, group):
    """The snapshot's members that differ from what's on disk, in the order install.sh writes a mod:
    its main.js last, and rewritten whenever anything else in the mod is (Herdr reloads a mod on any
    save; one that ran between main.js and the shared JS kept the old shared JS, 2026-11-08). Files
    that are the same aren't touched, so mods that didn't change don't reload (T90: Back and the
    automatic roll back happen often)."""
    def same(m):
        p = dest / m.name
        try:
            if m.isdir():
                return p.is_dir() and not p.is_symlink()
            return (m.isfile() and p.is_file() and not p.is_symlink() and p.stat().st_size == m.size
                    and (p.stat().st_mode & 0o111) == (m.mode & 0o111) and p.read_bytes() == tar.extractfile(m).read())
        except OSError:
            return False

    def mod_of(m):
        parts = Path(m.name).parts
        return parts[1] if len(parts) > 2 and parts[0] == "mods" and parts[1].startswith("crew-") else None
    mains = {mod_of(m): m for m in group if mod_of(m) and Path(m.name).parts[2:] == ("main.js",)}
    changed = [m for m in group if not same(m)]
    touched = {mod_of(m) for m in changed} - {None}
    first = [m for m in changed if m not in mains.values()]
    return first + [mains[k] for k in sorted(touched) if k in mains]


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
            rollback(snap, log=log, wrote=changed_since(snap))
            raise CrewError(f"installing {new_version} stopped ({type(e).__name__}), so the previous version was put back")
        if r.returncode != 0:
            rollback(snap, log=log, wrote=changed_since(snap))
            tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-12:])
            raise CrewError(f"version {new_version} didn't install cleanly, so the previous one was put back:\n{tail}")
        note_wrote(snap)
        log(f"installed {new_version}")
        return {"ok": True, "updated": True, "version": new_version, "backup": str(snap)}
    finally:
        shutil.rmtree(work, ignore_errors=True)


# ─── The Live channel and "Try it live" (T90) ────────────────────────────────────────────────────
# Stable (the default) is everything above: GitHub's releases. Live follows a branch of a local
# checkout instead (main in the owner's own Project Pals repo): crewd sees the branch move and runs
# `pal update follow`, which exports that commit, checks it, snapshots what's installed, installs it
# and makes sure it came up, putting the snapshot back if it didn't. "Try it live" does the same for a
# topic's branch, remembers the snapshot, and Back restores it.
#
#   crew-settings.json   channel: "live" | "stable", live_repo, live_branch ("main"), live_tests
#                        ("after": the full suite runs after the swap, in the background; "before":
#                        before it, a few minutes; "off")
#   data/crew-live.json  last:   the last swap {id, action, state, hash, branch, subject, at, reloaded,
#                                crewd, error}
#                        hold:   a commit of the followed branch that isn't installed again {hash, why}
#                                (it didn't come up, or the owner rolled it back) until the branch moves
#                        trying: the branch being tried {branch, hash, spec, since, snapshot, base}
#                        tests:  the full suite for a build {hash, state: running|passed|failed, detail}
#                        pending: "land" when a tried branch landed and main is to be installed once
#                                (pending_repo: the checkout it landed in)
#
# Who may: switching the channel, Try, Back and Back to stable are the owner's click (bin/crew). Follow
# takes no arguments and only ever installs the followed branch's newest commit, which is what crewd
# would do a moment later anyway.
LIVE = DATA / "crew-live.json"
EXPORTS = CACHE / "live"
KEEP_SNAPSHOTS = 5        # live / try snapshots kept (a trial's base snapshot always stays)
TEST_TIMEOUT = 1800


def channel():
    s = load_json(SETTINGS, {})
    tests = s.get("live_tests")
    return {"channel": "live" if s.get("channel") == "live" else "stable", "repo": s.get("live_repo") or None,
            "branch": s.get("live_branch") or "main", "tests": tests if tests in ("before", "after", "off") else "after"}


def live_state():
    return load_json(LIVE, {})


def live_save(**kw):
    """Merge into data/crew-live.json; a None value removes the key."""
    with locked("live-state"):
        s = load_json(LIVE, {})
        for k, v in kw.items():
            if v is None:
                s.pop(k, None)
            else:
                s[k] = v
        save_json(LIVE, s)
        return s


def _git(repo, *args, check=True, timeout=60):
    try:
        r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e:
        if check:
            raise CrewError(f"git {args[0]} in {repo}: {e}")
        return ""
    if check and r.returncode != 0:
        raise CrewError(f"git {' '.join(args)} in {repo}: {(r.stderr or r.stdout).strip()[:300]}")
    return r.stdout.strip() if r.returncode == 0 else ""


def repo_root(path):
    """The checkout a path belongs to, as one stable folder: the main checkout for a worktree."""
    common = _git(path, "rev-parse", "--path-format=absolute", "--git-common-dir", check=False)
    if not common:
        return None
    c = Path(common)
    return str(c.parent if c.name == ".git" else c)


def is_project(repo, ref):
    """Does `ref` there hold Project Pals (its manifest and installer)?"""
    try:
        m = json.loads(_git(repo, "show", f"{ref}:pals.json", check=False) or "null")
    except ValueError:
        return False
    return bool(isinstance(m, dict) and m.get("layout") and (m.get("name") == (installed().get("name") or "Project Pals")
                or (m.get("repo") and m.get("repo") == installed().get("repo")))
                and _git(repo, "rev-parse", "-q", "--verify", f"{ref}:install.sh", check=False))


def find_repo(explicit=None, folders=(), branch="main"):
    """The checkout Live follows: the one given, else where this install came from, else a pal's
    project folder that is Project Pals."""
    tried = [explicit] if explicit else [(installed().get("build") or {}).get("repo"), *folders]
    for p in tried:
        if not p or not Path(os.path.expanduser(p)).exists():
            continue
        root = repo_root(os.path.expanduser(p))
        if root and is_project(root, branch):
            return root
    if explicit:
        raise CrewError(f"{explicit} isn't a Project Pals checkout with a {branch} branch")
    raise CrewError("couldn't find your Project Pals checkout; say where it is: pal settings channel live --repo <folder> (from About)")


def ref_hash(repo, ref):
    h = _git(repo, "rev-parse", "-q", "--verify", f"{ref}^{{commit}}", check=False)
    if not h:
        raise CrewError(f"{repo} has no {ref}")
    return h


def same_commit(full, short):
    return bool(full and short and (full.startswith(short) or short.startswith(full)))


def running_hash():
    b = installed().get("build") or {}
    return "" if b.get("dirty") else (b.get("hash") or "")


def export(repo, sha, branch):
    """That commit's files in a folder of their own (git archive: nothing uncommitted, no other
    topic's files), with a BUILD file so install.sh records which build it is."""
    EXPORTS.mkdir(parents=True, exist_ok=True)
    dest = Path(tempfile.mkdtemp(prefix=f"{sha[:10]}-", dir=EXPORTS))
    try:
        arc = subprocess.Popen(["git", "-C", str(repo), "archive", "--format=tar", sha], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        un = subprocess.run(["tar", "-x", "-C", str(dest)], stdin=arc.stdout, capture_output=True, timeout=120)
        arc.stdout.close()
        err = arc.stderr.read().decode(errors="replace")
        if arc.wait(timeout=120) != 0 or un.returncode != 0:
            raise CrewError(f"couldn't export {sha[:10]}: {(err or un.stderr.decode(errors='replace')).strip()[:300]}")
        if not (dest / "install.sh").exists() or not (dest / "VERSION").exists():
            raise CrewError(f"{sha[:10]} doesn't look like Project Pals (no VERSION and install.sh)")
        tag = _git(repo, "describe", "--tags", "--abbrev=0", sha, check=False) or None
        ahead = _git(repo, "rev-list", "--count", f"{tag}..{sha}", check=False) if tag else ""
        (dest / "BUILD").write_text(json.dumps({
            "hash": sha, "branch": branch, "subject": _git(repo, "log", "-1", "--format=%s", sha, check=False)[:160],
            "tag": tag, "ahead": int(ahead) if ahead.isdigit() else None, "repo": str(repo)}))
    except (OSError, subprocess.TimeoutExpired) as e:
        shutil.rmtree(dest, ignore_errors=True)
        raise CrewError(f"couldn't export {sha[:10]}: {e}")
    except BaseException:
        shutil.rmtree(dest, ignore_errors=True)
        raise
    return dest


def _tail(r, n=14):
    return "\n".join(((r.stdout or "") + (r.stderr or "")).strip().splitlines()[-n:])


def stage_mods(root, stage):
    """The mods as install.sh would place them (each with the shared JS beside it), in `stage`."""
    out = []
    for d in sorted((root / "mods").glob("crew-*")):
        dest = stage / "mods" / d.name
        shutil.copytree(d, dest)
        for lib in (root / "lib").glob("*.js"):
            shutil.copy2(lib, dest / lib.name)
        out.append(dest)
    return out


def quick_checks(root, log=print):
    """What ./release checks before anything goes out, without the slow Python suite: the scripts and
    JSON parse, the JS tests pass, and every mod loads (herdr-app check on a staged copy). Seconds."""
    root = Path(root)

    def run(args, what, timeout=180, **kw):
        try:
            r = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=timeout, **kw)
        except subprocess.TimeoutExpired:
            raise CrewError(f"{what} took too long")
        if r.returncode != 0:
            raise CrewError(f"{what}:\n{_tail(r)}")
    run(["bash", "-n", "install.sh"], "install.sh doesn't parse")
    if (root / "bin" / "crew-hook-fast").exists():
        run(["sh", "-n", "bin/crew-hook-fast"], "bin/crew-hook-fast doesn't parse")
    py = [f for f in ("bin/crew", "bin/crew-room", "bin/crewd", "bin/crew-hook", "bin/crew-mcp", "install-hooks.py") if (root / f).exists()]
    py += sorted(str(p.relative_to(root)) for p in (root / "bin").glob("*.py"))
    run(["python3", "-c", "import sys\nfor f in sys.argv[1:]:\n    compile(open(f, encoding='utf-8').read(), f, 'exec')", *py], "a Python file doesn't parse")
    for f in [*sorted((root / "layouts").glob("*.json")), *sorted((root / "mods").glob("*/mod.json")), root / "pals.json"]:
        try:
            json.loads(f.read_text())
        except (OSError, ValueError) as e:
            raise CrewError(f"bad JSON in {f.relative_to(root)}: {e}")
    stage = Path(tempfile.mkdtemp(prefix="stage-", dir=root.parent))
    try:
        mods = stage_mods(root, stage)
        if shutil.which("node"):
            js = [*sorted((root / "lib").glob("*.js")), *(m / "main.js" for m in mods)]
            for i, f in enumerate(js):
                shutil.copy2(f, stage / f"syntax-{i}.mjs")
            run(["sh", "-c", 'for f in "$@"; do node --check "$f" || exit 1; done', "sh", *(str(stage / f"syntax-{i}.mjs") for i in range(len(js)))],
                "a JS file doesn't parse")
            for t in sorted((root / "tests").glob("*.mjs")):
                run(["node", str(t)], f"the test {t.name} failed")
        if shutil.which("herdr-app"):
            from concurrent.futures import ThreadPoolExecutor

            def one(m):
                try:
                    r = subprocess.run(["herdr-app", "check", str(m)], capture_output=True, text=True, timeout=120)
                except subprocess.TimeoutExpired:
                    return f"{m.name}: the check took too long"
                return None if r.returncode == 0 else f"{m.name} doesn't load:\n{_tail(r, 8)}"
            with ThreadPoolExecutor(max_workers=6) as pool:
                bad = [b for b in pool.map(one, mods) if b]
            if bad:
                raise CrewError("\n".join(bad[:4]))
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    log("checks passed")


def full_tests(root):
    """The whole regression suite in that folder → (ok, a line about it). Minutes."""
    try:
        r = subprocess.run(["python3", "-m", "unittest", "discover", "-s", "tests", "-q"], cwd=root, capture_output=True, text=True, timeout=TEST_TIMEOUT)
    except subprocess.TimeoutExpired:
        return False, "the Python tests took over half an hour"
    if r.returncode != 0:
        failed = re.findall(r"^(?:FAIL|ERROR): (\S+ \(\S+\))", r.stderr, re.M)
        return False, (f"{len(failed)} test{'s' if len(failed) != 1 else ''} failed: " + ", ".join(failed[:4])) if failed else _tail(r, 3)
    m = re.search(r"Ran (\d+) tests?", r.stderr)
    if shutil.which("node"):
        for t in sorted((Path(root) / "tests").glob("*.mjs")):
            if subprocess.run(["node", str(t)], cwd=root, capture_output=True, timeout=600).returncode != 0:
                return False, f"{t.name} failed"
    return True, f"{m.group(1)} tests passed" if m else "tests passed"


def run_tests(root, sha):
    """The background run after a swap: the result goes to crew-live.json for the app to show."""
    root = Path(root)
    if not root.is_dir() or root.resolve().parent != EXPORTS.resolve():
        raise CrewError("that isn't a build exported by the updater")
    # Only the run the updater announced when it started this (a swap marks its build's tests
    # "running" first): nobody else gets to write a result for the build that's running, or to
    # have an exported build removed. (One left over goes within the hour: _tidy_exports.)
    was = live_state().get("tests") or {}
    if was.get("state") != "running" or was.get("hash") != sha[:12] or not root.name.startswith(sha[:10]):
        raise CrewError("no test run is waiting for that build")
    try:
        ok, detail = full_tests(root)
        if same_commit(sha, (live_state().get("tests") or {}).get("hash")):   # not overtaken by a newer build's run
            live_save(tests={"hash": sha[:12], "state": "passed" if ok else "failed", "detail": detail[:400], "at": time.time()})
        return {"ok": ok, "detail": detail}
    finally:
        shutil.rmtree(root, ignore_errors=True)


def _hash_files(files, base):
    h = hashlib.sha256()
    for f in sorted(files):
        try:
            h.update(str(f.relative_to(base)).encode() + b"\0" + f.read_bytes() + b"\0")
        except OSError:
            pass
    return h.hexdigest()


def mods_fingerprint():
    """Each installed mod's content (not the files Herdr writes itself): which ones a swap reloads."""
    out = {}
    for d in (HOME / "mods").glob("crew-*"):
        files = [f for f in d.rglob("*") if f.is_file() and f.name != "jsconfig.json" and not f.name.endswith(".d.ts")
                 and "mascots" not in f.relative_to(d).parts]
        out[d.name] = _hash_files(files, d)
    return out


def crewd_fingerprint():
    """What a running crewd holds in memory: itself, the modules it imports and its unit."""
    home = Path.home()
    lib = home / ".local" / "lib" / "herdr-crew"
    files = [home / ".local" / "bin" / "crewd", home / ".config" / "systemd" / "user" / "herdr-crew.service", *lib.glob("crew*.py")]
    return _hash_files([f for f in files if f.is_file()], home)


def _systemd():
    """Is there a systemd user session to ask (the probe install.sh uses)?"""
    try:
        return bool(shutil.which("systemctl")) and subprocess.run(["systemctl", "--user", "show-environment"], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def crewd_active():
    try:
        return _systemd() and subprocess.run(["systemctl", "--user", "is-active", "--quiet", "herdr-crew.service"], capture_output=True, timeout=10).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _app_errors():
    """Errors the running Herdr reports about Project Pals' files (herdr-app status) → set of texts;
    None when it can't be asked (no window, no herdr-app)."""
    if not shutil.which("herdr-app"):
        return None
    try:
        r = subprocess.run(["herdr-app", "status"], capture_output=True, text=True, timeout=15)
        errs = json.loads(r.stdout).get("errors") if r.returncode == 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    if not isinstance(errs, list):
        return None
    texts = {e if isinstance(e, str) else json.dumps(e, sort_keys=True) for e in errs}
    return {t for t in texts if "crew-" in t or "pals" in t}


def verify(errors_before, log=print):
    """Did the new build come up? The pal command runs, and the open Herdr reports no new error from
    a Project Pals mod or its layout (it reloads them as the files land)."""
    pal = Path.home() / ".local" / "bin" / "pal"
    try:
        r = subprocess.run([str(pal), "version"], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise CrewError(f"the pal command doesn't run: {e}")
    if r.returncode != 0:
        raise CrewError(f"the pal command doesn't run:\n{_tail(r, 6)}")
    if errors_before is not None:
        time.sleep(float(os.environ.get("CREW_LIVE_SETTLE", "3")))   # Herdr reloads within a second
        now = _app_errors()
        new = sorted((now or set()) - errors_before)
        if new:
            raise CrewError("Herdr reports an error after the swap:\n" + "\n".join(n[:300] for n in new[:3]))
    log("the new build is up")


def restart_crewd(log=print):
    """Restart crewd on its new code and make sure it runs (active, and its heartbeat is fresh)."""
    started = time.time()
    try:
        r = subprocess.run(["systemctl", "--user", "restart", "herdr-crew.service"], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise CrewError(f"crewd didn't restart: {e}")
    if r.returncode != 0:
        raise CrewError(f"crewd didn't restart: {_tail(r, 4)}")
    deadline = time.time() + float(os.environ.get("CREW_LIVE_CREWD_WAIT", "20"))
    while time.time() < deadline:
        beat = load_json(DATA / "crew-daemon.json", {})
        if crewd_active() and beat.get("at", 0) >= started - 1:
            log("crewd restarted on the new code")
            return
        time.sleep(0.5)
    raise CrewError("crewd didn't come back after its restart (journalctl --user -u herdr-crew)")


def _prune_snapshots():
    keep = {(live_state().get("trying") or {}).get("snapshot")}
    for kind in ("-live-", "-try-"):
        ours = [p for p in backups() if kind in p.name and str(p) not in keep]
        for p in ours[:-KEEP_SNAPSHOTS]:
            drop_snapshot(p)


def install_tree(root, source, log=print):
    """Snapshot what's installed, install the build in `root` (install.sh), check it came up; put the
    snapshot back if anything fails. → {backup, reloaded: [mods], added, crewd_changed, version}"""
    root = Path(root)
    ins = installed()
    try:
        snap = _snapshot(f"from-{ins.get('version', 'unknown')}-{source}")
    except (OSError, tarfile.TarError) as e:
        for half in backups()[-1:]:
            if f"-{source}-" in half.name and time.time() - half.stat().st_mtime < 120:
                drop_snapshot(half)   # a half-written one mustn't be what Roll back restores
        raise CrewError(f"couldn't keep a copy of the running build ({e}), so nothing was installed")
    log(f"kept the running build ({snap.name})")

    def put_back():
        # The snapshot now equals what's installed again: kept, it would be the newest one, and the
        # next Roll back would restore it, change nothing and say it worked.
        # What differs from the snapshot now is what this install wrote, seconds ago.
        rollback(snap, log=log, wrote=changed_since(snap))
        drop_snapshot(snap)
    mods0, crewd0, errors0 = mods_fingerprint(), crewd_fingerprint(), _app_errors()
    args = ["bash", str(root / "install.sh"), f"--from-{source}", "--keep-crewd"]
    if not ins.get("helpers", True):
        args.append("--no-helpers")
    else:
        if not ins.get("claude_hooks", True):
            args.append("--no-claude-hooks")
        if not ins.get("agy_hooks", True):
            args.append("--no-agy-hooks")
    try:
        r = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=600)
    except BaseException as e:
        put_back()
        raise CrewError(f"the install stopped ({type(e).__name__}), so the build before it was put back")
    if r.returncode != 0:
        put_back()
        raise CrewError(f"it didn't install cleanly, so the build before it was put back:\n{_tail(r, 12)}")
    try:
        verify(errors0, log=log)
    except CrewError as e:
        put_back()
        raise CrewError(f"{e}\nSo the build before it was put back.")
    except Exception as e:
        put_back()
        raise CrewError(f"couldn't check the new build ({type(e).__name__}: {e}), so the build before it was put back")
    mods1 = mods_fingerprint()
    wrote = note_wrote(snap)
    return {"backup": str(snap), "wrote": wrote, "reloaded": sorted(m for m in mods1 if mods0.get(m) != mods1[m]),
            "crewd_changed": crewd0 != crewd_fingerprint() and ins.get("helpers", True),
            "version": (root / "VERSION").read_text().strip()}


def detach(args, name="project-pals"):
    """Start a command that outlives this process (crewd restarts under a swap it starts): a
    transient systemd unit of its own where there is a user session, else its own session."""
    if _systemd() and shutil.which("systemd-run"):
        unit = f"{name}-{int(time.time() * 1000)}"
        env = [f"--setenv={k}={os.environ[k]}" for k in ("PATH", "HOME", "HERDR_APP_HOME", "CREW_DATA", "HC_SESSION", "XDG_RUNTIME_DIR") if os.environ.get(k)]
        try:
            r = subprocess.run(["systemd-run", "--user", "--collect", "--quiet", f"--unit={unit}", *env, *args], capture_output=True, text=True, timeout=20)
            if r.returncode == 0:
                return unit
        except (OSError, subprocess.TimeoutExpired):
            pass
    try:
        subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        pass
    return None


def _knows_live(root):
    """Does that build have the Live channel and trials itself? One cut before them would install
    its way out: no strip, no Back, no following (and its install.sh doesn't know --keep-crewd)."""
    try:
        return (root / "mods" / "crew-live" / "main.js").is_file() and "--keep-crewd" in (root / "install.sh").read_text()
    except OSError:
        return False


def _tidy_exports():
    """Exported builds left behind (a test run that was killed): gone after an hour."""
    for d in EXPORTS.glob("*") if EXPORTS.exists() else ():
        try:
            if d.is_dir() and time.time() - d.stat().st_mtime > 3600:
                shutil.rmtree(d, ignore_errors=True)
        except OSError:
            pass


def _swap(repo, sha, branch, source, log, extra=None, undo=None):
    """Export `sha`, check it, install it, verify, restart crewd if its code changed, start the tests.
    extra(result) → more to save in crew-live.json with the swap; undo: what to save there instead
    when the swap is taken back after that (crewd didn't come up)."""
    _tidy_exports()
    c = channel()
    subject = _git(repo, "log", "-1", "--format=%s", sha, check=False)[:160]
    rec = {"id": f"{int(time.time())}-{sha[:7]}", "action": source, "hash": sha[:12], "branch": branch, "subject": subject}
    root, keep_root, backup, wrote, installed_ok = None, False, None, None, False
    try:
        root = export(repo, sha, branch)
        if not _knows_live(root):
            raise CrewError(f"{branch} was cut before the Live channel and Try it live existed, so installing it would take them away. "
                            + ("Bring it up to date first (merge or rebase on the branch that has them), then try it again." if source == "try"
                               else "Not installing it."))
        log(f"checking {branch} {sha[:7]}")
        quick_checks(root, log)
        if c["tests"] == "before":
            log("running the full tests (a few minutes)")
            ok, detail = full_tests(root)
            live_save(tests={"hash": sha[:12], "state": "passed" if ok else "failed", "detail": detail[:400], "at": time.time()})
            if not ok:
                raise CrewError(f"the tests don't pass, so nothing was installed: {detail}")
        log(f"installing {branch} {sha[:7]}")
        res = install_tree(root, source, log)
        backup, wrote = res["backup"], res["wrote"]
        rec.update(reloaded=res["reloaded"], crewd=False, backup=res["backup"], version=res["version"])
        live_save(last={**rec, "state": "done", "at": time.time()}, **(extra(res) if extra else {}))
        if res["crewd_changed"] and _systemd():
            restart_crewd(log)
            rec["crewd"] = True
            live_save(last={**rec, "state": "done", "at": time.time()})
        installed_ok = True
        if c["tests"] == "after" and (root / "tests").is_dir():
            live_save(tests={"hash": sha[:12], "state": "running", "at": time.time()})
            detach([str(Path.home() / ".local" / "bin" / "pal"), "update", "run-tests", str(root), sha], "project-pals-tests")
            keep_root = True
        _prune_snapshots()
        return {"ok": True, "updated": True, "version": res["version"], "hash": sha[:12], "branch": branch,
                "reloaded": res["reloaded"], "crewd": rec["crewd"], "backup": res["backup"]}
    except Exception as e:
        # Installed, but not finished (crewd didn't come back on its new code, or something
        # unexpected): take the swap back, and the snapshot with it (it equals what's installed again).
        if backup and not installed_ok:
            try:
                rollback(backup, log=log, wrote=wrote)
                drop_snapshot(backup)
                if _systemd() and not crewd_active():   # it may have died on the new code: start the old again
                    subprocess.run(["systemctl", "--user", "restart", "herdr-crew.service"], capture_output=True, timeout=120)
                e = CrewError(f"{e}\nSo the build before it was put back.")
            except Exception as e2:
                e = CrewError(f"{e}\nAnd putting the build before it back failed too ({e2}): About → Roll back.")
            if undo is not None:
                live_save(**undo)
        elif not isinstance(e, CrewError):
            e = CrewError(f"{type(e).__name__}: {e}")
        live_save(last={**{k: v for k, v in rec.items() if k != "backup"}, "state": "failed", "error": str(e)[:800], "at": time.time()})
        raise e
    finally:
        if root and not keep_root:
            shutil.rmtree(root, ignore_errors=True)


def note_failure(action, error, since):
    """A swap that failed before it got as far as _swap's own record (a topic that's gone, no
    checkout to follow): the app shows crew-live.json's `last`, so it goes there too."""
    last = live_state().get("last") or {}
    if not (last.get("state") == "failed" and last.get("at", 0) >= since):
        live_save(last={"id": f"{int(time.time())}-{action}", "action": {"follow": "live"}.get(action, action), "state": "failed",
                        "error": str(error)[:800], "at": time.time()})


def follow_due():
    """For crewd, each few seconds and cheap: is there a commit to install? → its hash, or None."""
    st = live_state()
    c = channel()
    repo = c["repo"] or st.get("pending_repo") or (installed().get("build") or {}).get("repo")
    if st.get("trying") or (c["channel"] != "live" and st.get("pending") != "land") or not repo:
        return None
    head = _git(repo, "rev-parse", "-q", "--verify", f"{c['branch']}^{{commit}}", check=False, timeout=10)
    if not head or same_commit(head, running_hash()) or same_commit(head, (st.get("hold") or {}).get("hash")):
        return None
    return head


def follow(log=print):
    """Install the followed branch's newest commit, when the Live channel is on (or a tried branch
    just landed) and it isn't what's running already."""
    st = live_state()
    c = channel()
    landed = st.get("pending") == "land"
    if st.get("trying"):
        return {"ok": True, "updated": False, "message": f"trying {st['trying'].get('branch')}: {c['branch']} waits until Land or Back"}
    if c["channel"] != "live" and not landed:
        return {"ok": True, "updated": False, "message": "the Live channel is off (About → Update channel)"}
    repo = c["repo"] or (st.get("pending_repo") if landed else None) or find_repo(branch=c["branch"])
    head = ref_hash(repo, c["branch"])
    if same_commit(head, running_hash()):
        live_save(pending=None, pending_repo=None)
        return {"ok": True, "updated": False, "message": f"{c['branch']} {head[:7]} is what's running"}
    hold = st.get("hold") or {}
    if same_commit(head, hold.get("hash")) and not landed:
        return {"ok": True, "updated": False, "message": f"{c['branch']} {head[:7]} is held: {hold.get('why', '')}".strip()}
    try:
        out = _swap(repo, head, c["branch"], "live", log)
    except CrewError as e:
        # Not tried again until the branch moves: a build that doesn't come up shouldn't loop.
        live_save(hold={"hash": head[:12], "why": str(e).splitlines()[0][:300], "at": time.time()}, pending=None, pending_repo=None)
        raise
    live_save(hold=None, pending=None, pending_repo=None)
    return out


def try_branch(repo, branch, spec=None, log=print, into=None):
    """Run a topic's branch in the live install. The snapshot of what was there is kept for Back
    (trying another branch on top keeps the first one's)."""
    st = live_state()
    was = st.get("trying")
    sha = ref_hash(repo, branch)
    if not is_project(repo, sha):
        raise CrewError(f"{branch} doesn't hold Project Pals")
    base = (was or {}).get("base") or installed().get("build") or {"version": installed().get("version")}

    def started(res):
        return {"trying": {"branch": branch, "hash": sha[:12], "spec": spec, "since": time.time(), "repo": str(repo), "into": into,
                           "snapshot": (was or {}).get("snapshot") or res["backup"], "base": base,
                           # What the trial installs wrote under data/ (this one, and any it was tried
                           # on top of): Back puts back only what's still that.
                           "wrote": merge_wrote((was or {}).get("wrote"), res["wrote"])}}
    return _swap(repo, sha, branch, "try", log, extra=started, undo={"trying": was})


def back(log=print):
    """End a trial: put back what was installed before it (then the Live channel catches up)."""
    t = live_state().get("trying")
    if not t:
        raise CrewError("no branch is being tried")
    snap = Path(t.get("snapshot") or "")
    if not snap.is_file():
        raise CrewError(f"the build from before the trial is gone ({snap.name}); About → Roll back, or install again")
    rollback(snap, log=log, wrote=t.get("wrote"))
    live_save(trying=None, tests=None, last={"id": f"{int(time.time())}-back", "action": "back", "state": "done", "branch": t.get("branch"),
                                             "hash": (t.get("base") or {}).get("hash"), "at": time.time()})
    log(f"put back what was running before {t.get('branch')}")
    out = {"ok": True, "updated": True, "restored": str(snap), "version": installed().get("version")}
    if channel()["channel"] == "live":
        try:
            f = follow(log)
            out["followed"] = bool(f.get("updated"))
        except CrewError as e:
            out["follow_error"] = str(e)
    return out


def same_repo(a, b):
    """Two folders of the same checkout (its main folder, or any worktree of it)?"""
    if not a or not b:
        return False
    ra, rb = repo_root(a) or a, repo_root(b) or b
    try:
        return os.path.realpath(ra) == os.path.realpath(rb)
    except OSError:
        return False


def landed(branch, base=None, repo=None):
    """A branch landed (pal land). If it's the branch being tried, IN THE CHECKOUT it's being tried
    from, and it landed on the branch that's followed, the trial is over and that branch is
    installed once, whatever the channel, so what runs is what landed. A branch of the same name in
    another project (Codex T94, P2: every project has a crew/x and a main), or landed on another
    base: nothing to do with this trial, which goes on (Back ends it)."""
    t = live_state().get("trying")
    c = channel()
    if not t or t.get("branch") != branch or not same_repo(repo, t.get("repo")) or (base and base != c["branch"]):
        return False
    if c["channel"] == "live" and c["repo"] and not same_repo(c["repo"], t.get("repo")):
        return False   # Live follows another checkout: this landing isn't what it installs
    live_save(trying=None, pending="land", pending_repo=t.get("repo"))
    return True


def set_channel(name, repo=None, folders=()):
    """Stable or Live (the owner's click, bin/crew). Live needs the checkout to follow."""
    s = load_json(SETTINGS, {})
    if name == "live":
        branch = s.get("live_branch") or "main"
        if repo:
            found = find_repo(repo, (), branch)
        else:
            # The checkout it followed before, if that still holds Project Pals; else look for it.
            was = s.get("live_repo")
            found = find_repo(None, [was, *folders] if was else folders, branch)
        s.update(channel="live", live_repo=found, live_branch=branch)
    elif name == "stable":
        s["channel"] = "stable"
    else:
        raise CrewError("the channel is stable or live")
    save_json(SETTINGS, s)
    if name == "live":
        live_save(hold=None)
    return channel()


def stable(log=print):
    """Back to stable: stop following, end any trial, and put the newest release back."""
    info = check()   # first: offline, the trial or the channel stay as they are
    if not info.get("latest"):
        raise CrewError("there are no releases to go back to")
    out = apply(log=log, version=info["latest"])
    set_channel("stable")
    live_save(trying=None, pending=None, pending_repo=None, hold=None, tests=None)
    live_save(last={"id": f"{int(time.time())}-stable", "action": "stable", "state": "done", "version": out.get("version"), "at": time.time()})
    return out


def describe():
    """What's running and how it's kept up to date, for `pal version` and About."""
    ins, c, st = installed(), channel(), live_state()
    b = ins.get("build") or {}
    return {"version": ins.get("version"), "source": ins.get("source"), "hash": b.get("hash"), "branch": b.get("branch"),
            "subject": b.get("subject"), "tag": b.get("tag"), "ahead": b.get("ahead"), "dirty": bool(b.get("dirty")),
            "channel": c["channel"], "repo": c["repo"], "follows": c["branch"], "trying": st.get("trying"),
            "hold": st.get("hold"), "last": st.get("last"), "tests": st.get("tests")}
