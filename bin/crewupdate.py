"""Terminal Botz updates: check the project's GitHub releases, install a newer one, roll back.

  data/crew-install.json   what's installed: version, repo, whether the helpers are, when
  data/crew-update.json    the last check: latest version, its notes, when it was checked
  .crew-backups/update-*   a snapshot of everything an update replaces, for rolling back

An update only ever comes from the configured repo's releases. A release may carry its own
tarball with a SHA256SUMS file (the release script adds both); then the download must match.
Only Terminal Botz's own files change: bots, rooms, memory, routines, tasks and looks live in
data/ and shared.json and are never touched.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

from crewlib import HOME, DATA, CrewError, load_json, save_json

INSTALL = DATA / "crew-install.json"
STATE = DATA / "crew-update.json"
BACKUPS = HOME / ".crew-backups"
CACHE = Path.home() / ".cache" / "terminal-botz"
UA = {"User-Agent": "terminal-botz-updater", "Accept": "application/vnd.github+json"}


def installed():
    return load_json(INSTALL, {})


def vtuple(v):
    nums = re.findall(r"\d+", str(v or "0"))
    return tuple(int(x) for x in (nums + ["0", "0", "0"])[:3])


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


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
    with tarfile.open(tar_path) as tar:
        for m in tar.getmembers():
            p = (dest / m.name).resolve()
            if not str(p).startswith(str(dest.resolve()) + os.sep) and p != dest.resolve():
                raise CrewError(f"refusing a file outside the release: {m.name}")
            if m.issym() or m.islnk():
                raise CrewError(f"refusing a link in the release: {m.name}")
        tar.extractall(dest)


def _snapshot(label):
    """Everything an update replaces, in one tarball, so it can be put back."""
    BACKUPS.mkdir(parents=True, exist_ok=True)
    path = BACKUPS / f"update-{label}-{time.strftime('%Y%m%d-%H%M%S')}.tar.gz"
    home = Path.home()
    items = [p for p in (HOME / "mods").glob("crew-*")] + [HOME / "layouts" / "crew.json", HOME / "layouts" / "crew.svg"]
    items += [home / ".local" / "bin" / n for n in ("botz", "botz-room", "crew", "crew-room", "crewd", "crew-hook", "crew-statusline")]
    items += [home / ".local" / "lib" / "herdr-crew", home / ".config" / "systemd" / "user" / "herdr-crew.service", HOME / "data" / "crew-god" / "AGENTS.md", INSTALL]
    with tarfile.open(path, "w:gz") as tar:
        for p in items:
            if p.exists() or p.is_symlink():
                # Stored relative to $HOME, without the generated mascots (they're redrawn on install).
                tar.add(p, arcname=str(p.relative_to(home)),
                        filter=lambda ti: None if "/mascots/" in ti.name and ti.name.endswith(".svg") else ti)
    return path


def backups():
    return sorted(BACKUPS.glob("update-*.tar.gz")) if BACKUPS.exists() else []


def rollback(path=None):
    path = Path(path) if path else (backups()[-1] if backups() else None)
    if not path or not path.exists():
        raise CrewError("no update backup to roll back to")
    home = Path.home()
    with tarfile.open(path) as tar:
        for m in tar.getmembers():
            if m.name.startswith("/") or ".." in Path(m.name).parts:
                raise CrewError(f"odd path in backup: {m.name}")
        tar.extractall(home)
    subprocess.run(["systemctl", "--user", "restart", "herdr-crew.service"], capture_output=True)
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
            want = next((line.split()[0] for line in fetch(sums).decode().splitlines() if line.strip().endswith(own)), None)
            got = hashlib.sha256(tar_path.read_bytes()).hexdigest()
            if not want or want != got:
                raise CrewError("the download doesn't match the release's SHA256SUMS; not installing it")
        else:
            log("downloading the release's source")
            tar_path.write_bytes(fetch(info["tarball"], timeout=120))
        src = work / "src"
        src.mkdir()
        _safe_extract(tar_path, src)
        roots = [p.parent for p in src.rglob("VERSION") if (p.parent / "install.sh").exists()]
        if not roots:
            raise CrewError("the release doesn't look like Terminal Botz (no VERSION and install.sh)")
        root = min(roots, key=lambda p: len(p.parts))
        new_version = (root / "VERSION").read_text().strip()
        snap = _snapshot(f"from-{installed().get('version', 'unknown')}")
        log(f"backed up the current version to {snap.name}")
        args = ["bash", str(root / "install.sh"), "--from-release"]
        if not installed().get("helpers", True):
            args.append("--no-helpers")
        r = subprocess.run(args, cwd=root, capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            rollback(snap)
            tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-12:])
            raise CrewError(f"version {new_version} didn't install cleanly, so the previous one was put back:\n{tail}")
        log(f"installed {new_version}")
        return {"ok": True, "updated": True, "version": new_version, "backup": str(snap)}
    finally:
        shutil.rmtree(work, ignore_errors=True)
