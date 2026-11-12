"""Memory safety (T153): one hungry pal must not take down the crew, and Project Pals says so before
memory runs out.

- Scopes: Herdr keeps every terminal in one systemd unit (hc-hold-<id>.service). When memory runs
  short, systemd-oomd kills the hungriest unit under app.slice, and that unit was the whole crew
  (2026-11-10, twice). Each pal's agent is started in its own transient scope instead
  (systemd-run --user --scope, which execs in place: the agent keeps its pid, its shell parent and
  its environment, so sleep, wake and session linking see it as before). oomd then takes one pal.
  Used only on this machine and only when crewd's probe found that systemd-run works here.
- Low memory: crewd writes data/crew-memory.json each minute (available memory, the floor, whether
  scopes work). pal hire/wake/topic, the app's hire and topic paths and Home say so under the floor.
- Idle sleep: crew-settings.json "sleep_idle_hours" (off by default) puts topics idle that long to
  sleep (pal sleep --idle --older N), through pal sleep's own checks.

Tests point CREW_PROC at a fake /proc (meminfo, <pid>/smaps_rollup, <pid>/comm, <pid>/cgroup)."""
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

from crewlib import DATA, load_json, save_json, settings

STATE = DATA / "crew-memory.json"
FRESH = 5 * 60              # a state older than this isn't trusted for "low" (crewd may be gone)
PROBE_EVERY = 6 * 3600      # how often crewd re-checks that scopes work
FLOOR_MIN_MB = 1536         # never warn at less than this floor...
FLOOR_SHARE = 0.10          # ...or 10% of RAM, whichever is larger
DROPIN_DIR = Path.home() / ".config" / "systemd" / "user" / "hc-hold-.service.d"
DROPIN = DROPIN_DIR / "00-project-pals-oomd.conf"


def _proc(proc_dir=None):
    return Path(proc_dir or os.environ.get("CREW_PROC") or "/proc")


def meminfo(proc_dir=None):
    """{'total', 'available', 'swap_total', 'swap_free'} in MB, or {} when /proc/meminfo can't be read."""
    try:
        text = (_proc(proc_dir) / "meminfo").read_text()
    except OSError:
        return {}
    kb = {}
    for line in text.splitlines():
        m = re.match(r"(\w+):\s+(\d+)", line)
        if m:
            kb[m.group(1)] = int(m.group(2))
    if "MemTotal" not in kb:
        return {}
    avail = kb.get("MemAvailable", kb.get("MemFree", 0) + kb.get("Cached", 0))
    return {"total": kb["MemTotal"] // 1024, "available": avail // 1024,
            "swap_total": kb.get("SwapTotal", 0) // 1024, "swap_free": kb.get("SwapFree", 0) // 1024}


def floor_mb(total_mb, s=None):
    """The available-memory floor below which Project Pals warns: crew-settings.json "memory_floor_mb",
    else the larger of 1.5 GB and 10% of RAM."""
    s = settings() if s is None else s
    try:
        v = int(s.get("memory_floor_mb") or 0)
    except (TypeError, ValueError):
        v = 0
    if v > 0:
        return v
    return max(FLOOR_MIN_MB, int((total_mb or 0) * FLOOR_SHARE))


def gb(mb):
    return f"{mb / 1024:.1f} GB"


# systemd 254+ expands $VARS in the command it runs unless told not to (an agent argument with a $ in it
# would change); older ones don't expand and don't know the flag. The probe finds which this one is.
NO_EXPAND = "--expand-environment=no"


def probe_scope(timeout=10):
    """None when systemd-run can't start a user scope here, else the extra flags it needs ([NO_EXPAND],
    or [] for a systemd that predates it)."""
    if os.environ.get("CREW_NO_SCOPES") or not shutil.which("systemd-run"):
        return None
    for flags in ([NO_EXPAND], []):
        try:
            r = subprocess.run(["systemd-run", "--user", "--scope", "--quiet", "--collect", *flags, "--", "true"],
                               capture_output=True, text=True, timeout=timeout)
        except (OSError, subprocess.SubprocessError):
            return None
        if r.returncode == 0:
            return flags
        if not flags or "expand-environment" not in (r.stderr or ""):
            return None
    return None


def write_state(scope=None, proc_dir=None, now=None):
    """crewd, each minute: what Home, the app and pal read. scope: a fresh probe (probe_scope's flags, or
    False when it failed), or None to keep the last one. Returns the state."""
    now = time.time() if now is None else now
    old = load_json(STATE, {})
    m = meminfo(proc_dir)
    st = {"at": int(now * 1000)}
    if m:
        fl = floor_mb(m["total"])
        st.update(m, floor=fl, low=m["available"] < fl)
    if scope is None:
        st["scope"], st["scope_checked"] = bool(old.get("scope")), old.get("scope_checked", 0)
        st["scope_flags"] = list(old.get("scope_flags") or [])
    else:
        ok = scope is not False and scope is not None
        st["scope"], st["scope_checked"] = ok, int(now * 1000)
        st["scope_flags"] = list(scope) if ok and isinstance(scope, (list, tuple)) else []
    st["dropin"] = dropin_state()   # About shows it: "ours", "theirs" (the person's own) or "none"
    if old.get("low_since") and st.get("low"):
        st["low_since"] = old["low_since"]
    elif st.get("low"):
        st["low_since"] = st["at"]
    save_json(STATE, st)
    return st


def needs_probe(now=None):
    st = load_json(STATE, {})
    now = time.time() if now is None else now
    return not st.get("scope_checked") or now - st["scope_checked"] / 1000 > PROBE_EVERY


def scopes_on():
    """Pals start in their own scope: crewd's probe passed and crew-settings.json "pal_scopes" isn't false."""
    if settings().get("pal_scopes") is False:
        return False
    return bool(load_json(STATE, {}).get("scope"))


def unit_name(pal, topic=None, now=None):
    """pal-<pal>-<topic>-<base36 ms>.scope: unique, and says whose it is in oomd's log."""
    def part(s):
        return re.sub(r"[^a-z0-9]+", "-", str(s or "").lower()).strip("-")[:24] or "x"
    stamp = int((time.time() if now is None else now) * 1000)
    digits, out = "0123456789abcdefghijklmnopqrstuvwxyz", ""
    while stamp:
        stamp, r = divmod(stamp, 36)
        out = digits[r] + out
    bits = ["pal", part(pal)] + ([part(topic)] if topic else []) + [out or "0"]
    return "-".join(bits)


def scope_prefix(pal, topic=None, local=True):
    """The words to put in front of a pal's agent command (or [] when scopes are off or it isn't local)."""
    if not local or not scopes_on():
        return []
    flags = [f for f in (load_json(STATE, {}).get("scope_flags") or []) if f == NO_EXPAND]
    return ["systemd-run", "--user", "--scope", "--quiet", "--collect", *flags, f"--unit={unit_name(pal, topic)}", "--"]


def low_line(st=None, proc_dir=None):
    """A one-line warning when available memory is under the floor, else None. Reads /proc itself, so it
    works without crewd."""
    m = meminfo(proc_dir) if st is None else st
    if not m or "available" not in m:
        return None
    fl = m.get("floor") or floor_mb(m["total"])
    if m["available"] >= fl:
        return None
    return (f"memory is low: {gb(m['available'])} available of {gb(m['total'])} (warns under {gb(fl)}). "
            f"Each awake pal holds memory; 'pal sleep --idle' puts the idle ones to sleep.")


def last_active(address, links=None, status_dir=None):
    """When a topic last did something (epoch seconds), or None when nothing says: its session file's
    last write (crewchat's link), else its status-line file's."""
    times = []
    lk = (links or {}).get(address) or {}
    for p in (lk.get("transcript"), str((status_dir or DATA / "crew-status") / f"{str(address).split('/')[-1]}.json")):
        if not p:
            continue
        try:
            times.append(Path(p).stat().st_mtime)
        except OSError:
            pass
    return max(times) if times else None


def idle_hours_setting(s=None):
    """crew-settings.json "sleep_idle_hours" as a positive number, else None (off: the default)."""
    s = settings() if s is None else s
    try:
        v = float(s.get("sleep_idle_hours") or 0)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


# ── what each pal holds (pal ram; README's table) ──

def pss_mb(pid, proc_dir=None):
    """What one process holds in MB: its proportional set size (shared pages split between their users)
    plus its share of swap (a pal swapped out still holds that memory), else RSS."""
    p = _proc(proc_dir) / str(pid)
    try:
        text = (p / "smaps_rollup").read_text()
        m = re.search(r"^Pss:\s+(\d+)", text, re.M)
        if m:
            sw = re.search(r"^SwapPss:\s+(\d+)", text, re.M)
            return (int(m.group(1)) + (int(sw.group(1)) if sw else 0)) / 1024
    except OSError:
        pass
    try:
        m = re.search(r"^VmRSS:\s+(\d+)", (p / "status").read_text(), re.M)
        return int(m.group(1)) / 1024 if m else 0.0
    except OSError:
        return 0.0


def descendants(pid, proc_dir=None):
    """pid and everything under it (children files; needs CONFIG_PROC_CHILDREN)."""
    out, todo = [], [int(pid)]
    while todo:
        p = todo.pop()
        out.append(p)
        try:
            for f in (_proc(proc_dir) / str(p) / "task").iterdir():
                todo += [int(x) for x in (f / "children").read_text().split()]
        except OSError:
            pass
    return out


def tree_mb(pid, proc_dir=None):
    return sum(pss_mb(p, proc_dir) for p in descendants(pid, proc_dir))


def cgroup_of(pid, proc_dir=None):
    try:
        for line in (_proc(proc_dir) / str(pid) / "cgroup").read_text().splitlines():
            if line.startswith("0::"):
                return line[3:]
    except OSError:
        pass
    return ""


# ── the hc-hold drop-in (installer) ──

DROPIN_TEXT = """# Project Pals: start each pal in its own scope, so systemd-oomd takes one pal, not every terminal.
# This makes Herdr's terminal holder (hc-hold-<id>.service, every terminal that isn't a pal's agent)
# the last unit oomd picks under memory pressure. The 90% swap backstop ignores it.
# Named 00- so it sorts first: a drop-in of your own in this folder (any later name) overrides it.
# Undo: delete this file and run `systemctl --user daemon-reload` (pal uninstall does it).
[Service]
ManagedOOMPreference=avoid
"""


def dropin_state(d=None):
    """'ours', 'theirs' (another drop-in there already sets ManagedOOMPreference) or 'none'."""
    d = Path(d or DROPIN_DIR)
    mine = d / DROPIN.name
    if mine.exists():
        return "ours"
    try:
        for f in sorted(d.glob("*.conf")):
            if re.search(r"^\s*ManagedOOMPreference\s*=", f.read_text(), re.M):
                return "theirs"
    except OSError:
        pass
    return "none"


def install_dropin(d=None):
    """Write ours unless one is there already. Returns what it found or did: 'ours', 'theirs', 'added'."""
    d = Path(d or DROPIN_DIR)
    st = dropin_state(d)
    if st != "none":
        return st
    d.mkdir(parents=True, exist_ok=True)
    (d / DROPIN.name).write_text(DROPIN_TEXT)
    return "added"
