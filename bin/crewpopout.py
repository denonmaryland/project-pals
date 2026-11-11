"""Pop out (T70): one topic's live terminal in its own desktop window, which the window manager can
float, pin to every workspace and resize. `pal popout <Pal[#topic]>`.

Herdr's own "window" overlays (Home's chat, the Chief) are drawn inside the main Herdr window, so
Hyprland can't pin them. A pop-out is a second herdr-app on a tiny app home of its own, showing one
layout: the crew-popout-bar mod over that terminal. It shares herdr-core, so it is the same live
terminal, not a copy; closing the window never stops the pal.

- The app home is built fresh under $XDG_RUNTIME_DIR/pals-popout/<key> (short: Herdr's control socket
  path has to fit SUN_LEN) and removed when the window closes. Nothing of the owner's is written but
  data/crew-popout.json (size, position and pin per topic).
- A pop-out's key is its topic's exact address: a readable start and a digest of "Pal#topic"
  (key_of). An open window is brought up again only when it shows that topic AND that terminal
  (shows); a window that shows anything else is never passed off as the one asked for.
- A watcher (this file, `watch`) waits for the window, floats it at the remembered size and place,
  pins it if it was pinned, then saves size / position / pin every 2 s while they change, so a
  resize or a move by any means (edges, Omarchy's keys, Super+O) is remembered.
- Hyprland only (hyprctl, one window by its address, never the active one). Elsewhere the window
  still opens; float and pin are the window manager's own.

The pure parts (layout, home, dispatch lines, the geometry store) are tested in tests/test_popout.py.
"""
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

import crewlib

STORE = crewlib.DATA / "crew-popout.json"
DEFAULT = {"w": 560, "h": 520}
MIN_W, MIN_H = 320, 220
BAR_PX = 30
BAR_MOD = "crew-popout-bar"


KEY_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,47}")


class PopoutError(Exception):
    pass


def slug(text):
    """A file-safe, readable name for a topic ("Orca#ops" -> "orca-ops"). NOT an identity: it folds
    case and punctuation and cuts at 48, so "App#build-api" and "App#build_api" are the same slug.
    It was the pop-out's key through 0.4.2; now it is key_of's readable start and the name old
    geometry is found under (adopt)."""
    s = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return s[:48] or "popout"


def key_of(label):
    """A topic's pop-out key: the slug's start, then a digest of the exact address, so two topics
    never share one ("App#build-api" -> "app-build-api-e501317b1e", "App#build_api" -> "app-build-api-9a2922dab4").
    Stable (the geometry store is keyed by it), file-safe, and 48 characters at most (SUN_LEN)."""
    text = str(label or "")
    return f"{slug(text)[:37].strip('-')}-{hashlib.sha256(text.encode()).hexdigest()[:10]}"


def runtime_root():
    base = os.environ.get("XDG_RUNTIME_DIR") or f"/tmp/pals-popout-{os.getuid()}"
    return Path(base) / "pals-popout"


def layout_spec(terminal, props):
    """The pop-out's whole layout: the bar over the terminal. Blocks as in layouts/*.json."""
    return {
        "id": "root", "type": "column", "titlebar": "none", "resizable": False,
        "background": "#0B0B0C", "ui_font": "Inter", "colors": {"background": "#0B0B0C"},
        "terminal_padding": [8, 8], "divider": {"width": 0, "color": "#1E1E20"},
        "children": [
            {"id": "popout-bar", "type": "block", "size": {"px": BAR_PX}, "content": {"mod": BAR_MOD, "props": props}},
            {"id": "popout-term", "type": "block", "content": {"terminal": terminal}},
        ],
    }


def build_home(dest, app_home, terminal, props):
    """Write the pop-out's app home at dest: its one layout, the bar mod (copied from the install),
    the owner's theme and zoom, and a shared.json that skips the welcome. Returns dest."""
    dest, app_home = Path(dest), Path(app_home)
    mod = app_home / "mods" / BAR_MOD
    if not mod.is_dir():
        raise FileNotFoundError(f"{BAR_MOD} isn't installed in {app_home}")
    if dest.exists():
        shutil.rmtree(dest)
    (dest / "layouts").mkdir(parents=True)
    (dest / "mods").mkdir()
    shutil.copytree(mod, dest / "mods" / BAR_MOD)
    icons = app_home / "mods" / "crew-roster" / "icons"       # the bar's icons live with the roster
    if icons.is_dir():
        shutil.copytree(icons, dest / "mods" / "crew-roster" / "icons")
    (dest / "layouts" / "popout.json").write_text(json.dumps(layout_spec(terminal, props), indent=2))
    (dest / "shared.json").write_text(json.dumps({"layout": "popout", "frame.welcomed": "finished"}))
    settings = crewlib.load_json(app_home / "settings.json", {})
    keep = {k: settings[k] for k in ("theme", "zoom", "font_ligatures", "minimum_contrast") if k in settings}
    keep["sounds"] = {"enabled": False}      # the main window already makes the sounds (a struct: a bare false is refused)
    (dest / "settings.json").write_text(json.dumps(keep))
    notes = app_home / "update-notes.json"   # else a fresh home greets with Herdr's "Updated to …" toast
    if notes.is_file():
        shutil.copy(notes, dest / "update-notes.json")
    if (app_home / "themes").is_dir():
        shutil.copytree(app_home / "themes", dest / "themes")
    return dest


# ── the geometry store ──────────────────────────────────────────────────────────────────────────

def load_store():
    d = crewlib.load_json(STORE, {})
    return d if isinstance(d, dict) else {}


def clean_geo(g):
    """A stored or reported geometry made safe: whole numbers, never smaller than the minimum."""
    g = g if isinstance(g, dict) else {}
    out = {}
    try:
        out["w"] = max(MIN_W, int(g.get("w", DEFAULT["w"])))
        out["h"] = max(MIN_H, int(g.get("h", DEFAULT["h"])))
    except (TypeError, ValueError):
        out.update(DEFAULT)
    try:
        if g.get("x") is not None and g.get("y") is not None:
            out["x"], out["y"] = int(g["x"]), int(g["y"])
    except (TypeError, ValueError):
        pass
    out["pinned"] = bool(g.get("pinned"))
    return out


def remembered(key):
    return clean_geo(load_store().get(key))


def adopt(key, label):
    """A topic popped out before 0.4.3 has its size, place and pin under its slug: start from those,
    once. The old entry stays (two topics could share it, and it isn't ours to delete)."""
    store, old = load_store(), slug(label)
    if key in store or old == key or not isinstance(store.get(old), dict):
        return False
    store[key] = clean_geo(store[old])
    crewlib.save_json(STORE, store)
    return True


def remember(key, geo):
    """Save one topic's geometry. True when it changed."""
    store = load_store()
    new = clean_geo(geo)
    if store.get(key) == new:
        return False
    store[key] = new
    crewlib.save_json(STORE, store)
    return True


def geo_of(client):
    """A `hyprctl clients -j` entry as our geometry."""
    at, size = client.get("at") or [None, None], client.get("size") or [DEFAULT["w"], DEFAULT["h"]]
    return clean_geo({"x": at[0], "y": at[1], "w": size[0], "h": size[1], "pinned": client.get("pinned")})


# ── Hyprland (one window, by address) ───────────────────────────────────────────────────────────

def hypr_env():
    """The environment hyprctl needs. A pal's shell can lack HYPRLAND_INSTANCE_SIGNATURE: take the
    only running instance then. None when this isn't Hyprland."""
    env = dict(os.environ)
    if env.get("HYPRLAND_INSTANCE_SIGNATURE"):
        return env if shutil.which("hyprctl") else None
    base = Path(env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}") / "hypr"
    try:
        found = [p.name for p in base.iterdir() if p.is_dir()]
    except OSError:
        found = []
    if len(found) != 1 or not shutil.which("hyprctl"):
        return None
    env["HYPRLAND_INSTANCE_SIGNATURE"] = found[0]
    return env


def dispatch_lines(action, address, geo=None):
    """What to run for one action on one window: (the Lua dispatch, the classic dispatch's args).
    Hyprland here takes the Lua form; the classic one is the fallback (as Omarchy's own
    omarchy-hyprland-window-pop does). `address` is Hyprland's, e.g. 0x55d0…"""
    if not re.fullmatch(r"0x[0-9a-fA-F]+", str(address or "")):
        raise ValueError(f"not a window address: {address!r}")
    w = f"address:{address}"
    g = clean_geo(geo)
    if action == "float":
        return f'hl.dsp.window.float({{ window = "{w}", action = "toggle" }})', ["togglefloating", w]
    if action == "pin":
        return f'hl.dsp.window.pin({{ window = "{w}" }})', ["pin", w]
    if action == "resize":
        return (f'hl.dsp.window.resize({{ window = "{w}", x = {g["w"]}, y = {g["h"]} }})',
                ["resizewindowpixel", f'exact {g["w"]} {g["h"]},{w}'])
    if action == "move":
        if "x" not in g:
            return f'hl.dsp.window.center({{ window = "{w}" }})', ["centerwindow", w]
        return (f'hl.dsp.window.move({{ window = "{w}", x = {g["x"]}, y = {g["y"]} }})',
                ["movewindowpixel", f'exact {g["x"]} {g["y"]},{w}'])
    if action == "top":
        return f'hl.dsp.window.alter_zorder({{ window = "{w}", mode = "top" }})', ["alterzorder", f"top,{w}"]
    if action == "focus":
        return f'hl.dsp.focus({{ window = "{w}" }})', ["focuswindow", w]
    raise ValueError(f"unknown action: {action}")


def hyprctl(args, env):
    try:
        return subprocess.run(["hyprctl", *args], env=env, capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None


def dispatch(action, address, env, geo=None):
    lua, classic = dispatch_lines(action, address, geo)
    r = hyprctl(["dispatch", lua], env)
    if r is None or r.returncode != 0 or "error" in (r.stdout or "").lower():
        r = hyprctl(["dispatch", *classic], env)
    return bool(r and r.returncode == 0)


def client_of(pid, env):
    """The pop-out's window: the client whose pid is ours. None until it maps."""
    r = hyprctl(["clients", "-j"], env)
    try:
        clients = json.loads(r.stdout) if r and r.returncode == 0 else []
    except ValueError:
        clients = []
    return next((c for c in clients if isinstance(c, dict) and c.get("pid") == pid and c.get("mapped", True)), None)


def place(client, geo, env):
    """Float the new window at the remembered size and place, pin it if it was pinned."""
    addr = client.get("address")
    if not client.get("floating"):
        dispatch("float", addr, env)
    dispatch("resize", addr, env, geo)
    dispatch("move", addr, env, geo)
    if geo.get("pinned") and not client.get("pinned"):
        dispatch("pin", addr, env)
    dispatch("top", addr, env)


# ── open, watch, pin, close ─────────────────────────────────────────────────────────────────────

def state_path(key):
    return runtime_root() / f"{key}.json"


def alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (OSError, TypeError, ValueError):
        return False


def running(key):
    """The open pop-out for this key ({pid, home, …}), or None."""
    st = crewlib.load_json(state_path(key), None)
    return st if isinstance(st, dict) and alive(st.get("pid")) else None


def shows(st, terminal, label):
    """Is this open pop-out the one asked for: the same topic AND the same terminal? The key alone
    is never proof (through 0.4.2 two topics could share one, and a topic's terminal can change)."""
    return isinstance(st, dict) and st.get("terminal") == terminal and st.get("label") == label


def _ended(pid):
    """Has this process ended? One that ended but whose parent hasn't collected it yet (a zombie)
    still answers a signal, and has no window."""
    if not alive(pid):
        return True
    try:
        return Path(f"/proc/{int(pid)}/stat").read_text().rpartition(")")[2].split()[0] == "Z"
    except (OSError, IndexError, ValueError):
        return False


def _gone(pid, secs=4.0):
    end = time.time() + secs
    while not _ended(pid) and time.time() < end:
        time.sleep(0.05)
    return _ended(pid)


def open_popout(terminal, label, props=None):
    """Open (or bring up) the pop-out for a terminal. label: "Pal#topic", its identity.
    Returns (key, "opened" | "focused")."""
    label = label or terminal
    key = key_of(label)
    env = hypr_env()
    # Already out (under any key: one opened by 0.4.2 has its slug)? Bring that window up, but only
    # when it shows this topic and this terminal.
    for k in open_keys():
        st = running(k)
        if shows(st, terminal, label):
            c = client_of(st["pid"], env) if env else None
            if c:
                dispatch("focus", c["address"], env)
            return k, "focused"
    herdr = shutil.which("herdr-app")
    if not herdr:
        raise FileNotFoundError("herdr-app isn't on PATH")
    st = running(key)
    if st and st.get("label") == label:
        # This topic's window, on a terminal the topic no longer has: it can't be the answer. It
        # goes (its geometry kept) and a window on the topic's terminal takes its place.
        close_popout(key)
        if not _gone(st["pid"]):
            raise PopoutError(f"{label}'s pop-out shows an older terminal ({st.get('terminal')}) and didn't close; close it and try again")
    elif st:
        # Somebody else's window under our key (a digest clash, or a damaged file): never reuse it,
        # and never build over the home it runs on.
        raise PopoutError(f"the pop-out {key} is open for {st.get('label') or 'something else'}, not {label}; close it first (pal popout close {key})")
    adopt(key, label)
    # Ours from here: this process holds the key while the window is built, so a watcher that is
    # just ending (the window replaced above) leaves the new home alone.
    crewlib.save_json(state_path(key), {"pid": os.getpid(), "home": "", "terminal": terminal, "label": label, "at": time.time(), "opening": True})
    try:
        home = build_home(runtime_root() / key, crewlib.HOME, terminal, {**(props or {}), "key": key, "terminal": terminal})
        run_env = {**os.environ, "HERDR_APP_HOME": str(home), "HERDR_TELEMETRY": "0"}
        with open(home / "popout.log", "ab") as log:
            p = subprocess.Popen([herdr], env=run_env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    except BaseException:
        try:
            state_path(key).unlink()
        except OSError:
            pass
        raise
    crewlib.save_json(state_path(key), {"pid": p.pid, "home": str(home), "terminal": terminal, "label": label, "at": time.time()})
    subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "watch", key, str(p.pid)],
                     env=os.environ, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True)
    return key, "opened"


def watch(key, pid, every=2.0):
    """Runs beside one pop-out until it closes: place it once it maps, then keep its geometry."""
    env = hypr_env()
    placed = False
    while alive(pid):
        try:
            os.waitpid(pid, os.WNOHANG)      # ours when `open` and `watch` share a parent; harmless otherwise
        except OSError:
            pass
        if env:
            c = client_of(pid, env)
            if c and not placed:
                place(c, remembered(key), env)
                placed = True
            elif c and c.get("floating") and not c.get("fullscreen"):
                remember(key, geo_of(c))      # tiled or fullscreen: that size isn't the pop-out's own
        time.sleep(every if placed else 0.25)
    cleanup(key)


def cleanup(key):
    st = crewlib.load_json(state_path(key), None)
    if isinstance(st, dict) and alive(st.get("pid")):
        return
    try:
        state_path(key).unlink()
    except OSError:
        pass
    home = runtime_root() / key
    if home.is_dir() and home.parent == runtime_root():
        shutil.rmtree(home, ignore_errors=True)


def toggle_pin(key):
    """The bar's Pin: pin or unpin this one window. Returns the new state, or None (no Hyprland / no window)."""
    st, env = running(key), hypr_env()
    c = client_of(st["pid"], env) if st and env else None
    if not c:
        return None
    if not c.get("floating"):
        dispatch("float", c["address"], env)
    if not dispatch("pin", c["address"], env):
        return None
    c2 = client_of(st["pid"], env) or {}
    remember(key, geo_of(c2) if c2 else {**remembered(key), "pinned": not c.get("pinned")})
    return bool(c2.get("pinned", not c.get("pinned")))


def close_popout(key):
    """Close the window (never the pal): the pid we started, nothing by name."""
    st = running(key)
    if not st:
        cleanup(key)
        return False
    env = hypr_env()
    c = client_of(st["pid"], env) if env else None
    if c:
        remember(key, geo_of(c))
    try:
        os.kill(int(st["pid"]), signal.SIGTERM)
    except OSError:
        pass
    return True


def open_keys():
    try:
        files = sorted(runtime_root().glob("*.json"))
    except OSError:
        files = []
    return [f.stem for f in files if running(f.stem)]


def open_key(name):
    """The open pop-out meant by `pal popout pin|close NAME`: its key (what the bar passes and
    `pal popout ls` prints), or its topic ("Pal#topic"). None when no open pop-out is that."""
    keys = open_keys()
    if name in keys:
        return name
    return next((k for k in keys if (running(k) or {}).get("label") == name), None)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "watch":
        watch(sys.argv[2], int(sys.argv[3]))
