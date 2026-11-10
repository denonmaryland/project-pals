"""The welcome tour's helpers (T76; RECIPE "The welcome tour"): `pal welcome` and the project
folders the head pal suggests for a first pal.

Looking is all this does. It lists folder names and the dates they last changed; it never opens a
file inside a project, hires nobody and writes nothing.
"""
import os
import re
from pathlib import Path

# Where people keep projects. One level deep, git folders only.
PLACES = ("Projects", "projects", "code", "Code", "src", "dev", "repos", "work", "git")
MOST = 5


def pal_name(folder):
    """"weather-app" → "Weather App" (the same rule as mods/crew-home/welcome-text.js palName)."""
    base = Path(str(folder).rstrip("/")).name.lstrip(".")
    words = [w for w in re.split(r"[-_.\s]+", base) if w]
    return " ".join(w[0].upper() + w[1:] for w in words) or "My Project"


def _changed(repo):
    """When a git folder last changed: its HEAD or index, whichever is newer (stat only)."""
    best = 0.0
    for name in ("index", "HEAD", "FETCH_HEAD"):
        try:
            best = max(best, (repo / ".git" / name).stat().st_mtime)
        except OSError:
            pass
    if not best:
        try:
            best = (repo / ".git").stat().st_mtime
        except OSError:
            pass
    return best


def folders(home=None, taken=(), most=MOST):
    """Git folders one level into the usual places, newest first, without the ones that already
    have a pal (`taken`: folders pals live in). Each: {path, show, name, at (ms)}."""
    home = Path(home or Path.home())
    have = set()
    for t in taken:
        try:
            have.add(os.path.realpath(os.path.expanduser(str(t))))
        except (OSError, ValueError):
            pass
    seen, out = set(), []
    for place in PLACES:
        root = home / place
        try:
            kids = sorted(root.iterdir())
        except OSError:
            continue
        for kid in kids:
            try:
                if kid.name.startswith(".") or not kid.is_dir() or not (kid / ".git").exists():
                    continue
                real = os.path.realpath(kid)
            except OSError:
                continue
            if real in seen or real in have:
                continue
            seen.add(real)
            path = str(kid)
            show = "~/" + str(kid.relative_to(home)) if kid.is_relative_to(home) else path
            out.append({"path": path, "show": show, "name": pal_name(kid), "at": int(_changed(kid) * 1000)})
    out.sort(key=lambda f: -f["at"])
    return out[:most]


def status(st):
    """One line for `pal welcome`: where the tour stands (settings "welcome")."""
    w = st.get("welcome") if isinstance(st.get("welcome"), dict) else {}
    state = w.get("state")
    if state == "done":
        return "The welcome tour is done. See it again from the gear menu: Welcome tour."
    if state == "skipped":
        return "The welcome tour was skipped. See it from the gear menu: Welcome tour."
    if state in ("new", "open"):
        return f"The welcome tour is waiting on Home (screen {int(w.get('beat') or 0) + 1} of 7): Ctrl+Shift+H."
    return "The welcome tour hasn't run here. Start it from the gear menu: Welcome tour."
