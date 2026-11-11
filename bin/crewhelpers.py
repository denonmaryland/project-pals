"""Trusted helpers (T116): the owner's own assistants, sending NORMAL work to the pals in the owner's name.

A helper is a program outside Project Pals (a chat assistant, a script) that the owner switched on
by name, with a click. It then says who it is when it sends:

    PAL_HELPER=Pals pal tell "Orca" "…"        (also pal ask, pal task add --for, pal desk send)

and the card arrives headed "[from <owner> via Pals, a trusted helper: normal work only]" instead of
"[from a shell on this computer, not verified as <owner>]". That header is ALL a key changes. It is
never a click: approvals, push / release / merge, settings, missions, AGENTS.md and everything on
Home still ask for the app's one-time click token (crewlib.owner_gate), and a key isn't one.

  ~/.config/project-pals/helpers/<slug>.key   the key: 0600, in a 0700 folder, outside data/ so a
                                              pal searching the data folder never prints one
  data/crew-helpers/helpers.json              {helpers: {name: {on, sha256, made, rotated, …}}}:
                                              the switch and the key's fingerprint, never the key
  data/crew-helpers/log.jsonl                 every send in the owner's name, every refused try,
                                              every switch (Home shows it: "In your name")

What this is and isn't. The key is a password in a file. Anything running as the owner that reads it
can speak as the owner for normal work. Pals run as the owner too: the approval gate holds a pal's
command that touches the keys or this folder (crewguard `helper-key`), and verify() refuses a key
presented from inside a Herdr terminal (inside_herdr). Those stop mistakes and one pal talking
another into it; they're not a wall against a program set on getting around them (as with the
owner's click tokens, crewlib). So the door is narrow instead: undoable work only, an hourly limit,
everything logged, one click to switch off or rotate.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import stat
from pathlib import Path

from crewlib import DATA, OWNER, CrewError, load_json, locked, now_ms, append_jsonl

DIR = DATA / "crew-helpers"
FILE = DIR / "helpers.json"
LOG = DIR / "log.jsonl"
KEYS = Path.home() / ".config" / "project-pals" / "helpers"

ENV, ENV_FILE = "PAL_HELPER", "PAL_HELPER_KEY_FILE"
PREFIX = "palkey_"
KEY_TEXT = re.compile(r"palkey_[A-Za-z0-9_-]{20,}")   # a key, wherever it turns up (cards and the log never carry one)
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9 _.-]{0,23}")
MAX = 8
PER_HOUR = 20          # sends in the owner's name per helper per hour; past it they go as "not verified"
LOG_KEEP = 2000
RESERVED = ("owner", "you", "pal", "pals plugin", "project pals", "crew", "crewd", "system", "a shell on this computer", "shell", "everyone")


class HelperError(CrewError):
    pass


# ─── the list ────────────────────────────────────────────────────────────────────────────────

def _load():
    h = load_json(FILE, None)
    hs = h.get("helpers") if isinstance(h, dict) else None
    return {"version": 1, "helpers": {k: v for k, v in (hs or {}).items() if isinstance(v, dict)}}


def _private(path, data):
    """Write `data` to `path`, 0600 from the first byte, replacing it whole. Never through a link."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent.is_symlink() or path.is_symlink():
        raise HelperError(f"{path} is a link: not writing through it")
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(4)}")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _save(h):
    DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(DIR, 0o700)
    except OSError:
        pass
    _private(FILE, json.dumps(h, indent=2))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def canonical(name, h=None):
    """The helper's name as the owner wrote it, for `name` in any case; None when there's no such helper."""
    want = slug(name)
    return next((k for k in (h or _load())["helpers"] if slug(k) == want), None) if want else None


def key_path(name):
    return KEYS / f"{slug(name)}.key"


def fingerprint(key):
    return hashlib.sha256((key or "").encode()).hexdigest()


def check_name(name, pals=()):
    name = " ".join((name or "").split())
    if not NAME.fullmatch(name) or not slug(name):
        raise HelperError("a helper's name: 1-24 letters, digits, spaces, - _ . (e.g. Pals)")
    low = name.lower()
    if low in RESERVED or low == OWNER.lower() or slug(name) == slug(OWNER):
        raise HelperError(f"a helper can't be called {name}: that name is taken ({OWNER}, or Project Pals' own)")
    if any(slug(p) == slug(name) for p in pals):
        raise HelperError(f"{name} is a pal's name: a helper needs a name of its own, so nobody mistakes one for the other")
    return name


def _new_key(name):
    """Make (or replace) the helper's key file. Returns the key's fingerprint; the key stays in the file."""
    KEYS.mkdir(parents=True, exist_ok=True)
    if KEYS.is_symlink() or KEYS.parent.is_symlink():
        raise HelperError(f"{KEYS} is a link: not putting a key behind it")
    os.chmod(KEYS, 0o700)
    key = PREFIX + secrets.token_urlsafe(32)
    _private(key_path(name), key + "\n")
    return fingerprint(key)


def switch(name, on, pals=()):
    """The owner's switch (the caller has checked the click). On, the first time: the helper and its
    key are made. Off: the key stops being accepted at once (it's kept, so On again resumes it)."""
    with locked("helpers"):
        h = _load()
        known = canonical(name, h)
        if not known:
            if not on:
                raise HelperError(f"no helper called {name}")
            if len(h["helpers"]) >= MAX:
                raise HelperError(f"{MAX} helpers at most: remove one first")
            known = check_name(name, pals)
            h["helpers"][known] = {"on": False, "made": now_ms()}
        e = h["helpers"][known]
        made = False
        if on and (not e.get("sha256") or not key_path(known).is_file()):
            e["sha256"], e["made"], made = _new_key(known), now_ms(), True
            e.pop("rotated", None)
        e["on"], e["switched"] = bool(on), now_ms()
        _save(h)
    log("switch", known, action="on" if on else "off", **({"key": "made"} if made else {}))
    return known, e


def rotate(name):
    """A new key in the same file; every copy of the old one is dead from now."""
    with locked("helpers"):
        h = _load()
        known = canonical(name, h)
        if not known:
            raise HelperError(f"no helper called {name}")
        e = h["helpers"][known]
        e["sha256"], e["rotated"] = _new_key(known), now_ms()
        _save(h)
    log("switch", known, action="rotate")
    return known, e


def remove(name):
    with locked("helpers"):
        h = _load()
        known = canonical(name, h)
        if not known:
            raise HelperError(f"no helper called {name}")
        h["helpers"].pop(known)
        _save(h)
        p = key_path(known)
        if not KEYS.is_symlink() and not p.is_symlink():
            p.unlink(missing_ok=True)
    log("switch", known, action="remove")
    return known


# ─── is this caller one of the pals? ─────────────────────────────────────────────────────────

def _read(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return b""


def _ppid(proc, pid):
    stat_ = _read(f"{proc}/{pid}/stat").decode(errors="replace")
    try:
        return int(stat_[stat_.rindex(")") + 2:].split()[1])
    except (ValueError, IndexError):
        return 0


def inside_herdr(proc="/proc", pid=None, env=None):
    """Why this process counts as running in a Herdr terminal (a pal's, or one a pal started), else
    None. Its own HC_TERMINAL_ID; a parent's, however far up (a pal that drops the variable first, as
    with `env -u`); or herdr-core's process group, which a child keeps even after it detaches from
    its parents. A helper runs outside Herdr, so none of these is true for it."""
    env = os.environ if env is None else env
    if env.get("HC_TERMINAL_ID"):
        return f"terminal {env['HC_TERMINAL_ID']}"
    pid = pid or os.getpid()
    if b"hc-hold-" in _read(f"{proc}/{pid}/cgroup"):
        return "it runs inside a Herdr terminal"
    seen, p = set(), _ppid(proc, pid)
    while p > 1 and p not in seen:
        seen.add(p)
        for kv in _read(f"{proc}/{p}/environ").split(b"\0"):
            if kv.startswith(b"HC_TERMINAL_ID=") and len(kv) > 15:
                return f"it was started from terminal {kv[15:].decode(errors='replace')}"
        p = _ppid(proc, p)
    return None


# ─── the key, when a helper presents it ──────────────────────────────────────────────────────

def _read_key(path):
    """The key in `path`, or raise why not: a plain file of the owner's own, readable by nobody else, not a link."""
    path = Path(os.path.expanduser(str(path)))
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError:
        raise HelperError("its key file is missing, or is a link" if path.is_symlink() or not path.exists() else "its key file can't be read")
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            raise HelperError("its key file isn't a plain file")
        if st.st_uid != os.getuid():
            raise HelperError("its key file belongs to someone else")
        if st.st_mode & 0o077:
            raise HelperError("its key file can be read by others (chmod 600 it, then rotate the key)")
        if st.st_size > 512:
            raise HelperError("its key file isn't a key")
        return os.read(fd, 512).decode(errors="replace").strip()
    finally:
        os.close(fd)


def sent_since(name, since_ms):
    return sum(1 for e in entries() if e.get("kind") == "sent" and e.get("helper") == name and (e.get("at") or 0) >= since_ms)


def verify(name, key_file=None):
    """(the helper's name, its key's short fingerprint) when `name` may speak in the owner's name right
    now; else raise HelperError saying why. No side effects."""
    h = _load()
    known = canonical(name, h)
    if not known:
        raise HelperError(f"there's no helper called {name}")
    e = h["helpers"][known]
    if not e.get("on"):
        raise HelperError(f"{known}'s trusted link is off")
    why = inside_herdr()
    if why:
        raise HelperError(f"helper keys aren't for pals ({why}): a helper runs outside Herdr")
    key = _read_key(key_file or key_path(known))
    want = e.get("sha256") or ""
    if not key.startswith(PREFIX) or not want or not hmac.compare_digest(fingerprint(key), want):
        raise HelperError(f"that isn't {known}'s key now (it was rotated, or the file is another's)")
    per_hour = int(e.get("per_hour") or PER_HOUR)
    if sent_since(known, now_ms() - 3600 * 1000) >= per_hour:
        raise HelperError(f"{known} has sent {per_hour} messages in {OWNER}'s name this hour, which is the limit")
    return known, want[:8]


_presented = None   # this run's answer, worked out once


def presented():
    """Who this run says it is: None (no PAL_HELPER), or {"claim", "name", "fp", "why"}: `name` and
    `fp` when the key was accepted, else `why` it wasn't (and the message goes as an unverified shell's)."""
    global _presented
    claim = " ".join((os.environ.get(ENV) or "").split())
    if not claim:
        return None
    if _presented is None or _presented.get("claim") != claim:
        try:
            name, fp = verify(claim, os.environ.get(ENV_FILE) or None)
            _presented = {"claim": claim, "name": name, "fp": fp, "why": None}
        except HelperError as e:
            _presented = {"claim": claim, "name": None, "fp": None, "why": str(e)}
    return _presented


def has_key(text):
    return bool(KEY_TEXT.search(text or ""))


# ─── the log ─────────────────────────────────────────────────────────────────────────────────

def _clip(text, n):
    text = KEY_TEXT.sub("palkey_…", " ".join(str(text or "").split()))
    return text if len(text) <= n else text[:n - 1] + "…"


def log(kind, helper, **fields):
    """One line of the record: "sent" (in the owner's name), "unverified" (it presented a name whose
    key wasn't accepted, so it went as a shell's), "refused" (it tried something that's the owner's
    click) or "switch" (the owner's on / off / rotate / remove). Never a key."""
    DIR.mkdir(parents=True, exist_ok=True)
    if not LOG.exists():
        os.close(os.open(LOG, os.O_WRONLY | os.O_CREAT, 0o600))
    entry = {"at": now_ms(), "kind": kind, "helper": _clip(helper, 40), **{k: _clip(v, 300) if isinstance(v, str) else v for k, v in fields.items()}}
    append_jsonl(LOG, entry)
    try:
        if LOG.stat().st_size > 2_000_000:
            with locked("helpers-log"):
                lines = LOG.read_text().splitlines()[-LOG_KEEP:]
                _private(LOG, "\n".join(lines) + "\n")
    except OSError:
        pass
    return entry


def entries(limit=None):
    try:
        lines = LOG.read_text().splitlines()
    except OSError:
        return []
    out = []
    for line in lines[-limit:] if limit else lines:
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if isinstance(e, dict):
            out.append(e)
    return out


def note_sent(card, via):
    """A card went out in the owner's name (crewdesk.create calls this for a helper's card)."""
    with locked("helpers"):
        h = _load()
        e = h["helpers"].get(card.get("from"))
        if e is not None:
            e["last_used"] = now_ms()
            _save(h)
    return log("sent", card.get("from"), card=card.get("id"), to=card.get("to"), card_kind=card.get("kind"), via=via,
               title=card.get("title") or "", key=(card.get("proof") or "").replace("key ", ""))


def note_refused(argv, what):
    """Someone presenting a helper's name tried something that's the owner's (owner_gate, Home's rule)."""
    claim = " ".join((os.environ.get(ENV) or "").split())
    if not claim:
        return None
    p = presented() or {}
    return log("refused", p.get("name") or canonical(claim) or claim, verified=bool(p.get("name")),
               command="pal " + " ".join(str(a) for a in argv[:8]), what=what)


def note_unverified(why, via):
    claim = " ".join((os.environ.get(ENV) or "").split())
    return log("unverified", canonical(claim) or claim, why=why, via=via) if claim else None


# ─── what the app and `pal helpers` show ─────────────────────────────────────────────────────

def listing(log_limit=200):
    h, now = _load(), now_ms()
    day = now - 24 * 3600 * 1000
    log_ = entries()
    out = []
    for name, e in sorted(h["helpers"].items(), key=lambda kv: kv[0].lower()):
        mine = [x for x in log_ if x.get("helper") == name]
        p = key_path(name)
        out.append({"name": name, "on": bool(e.get("on")), "key": (e.get("sha256") or "")[:8] or None, "key_file": str(p),
                    "key_there": p.is_file() and not p.is_symlink(), "made": e.get("made"), "rotated": e.get("rotated"),
                    "switched": e.get("switched"), "last_used": e.get("last_used"),
                    "sent": sum(1 for x in mine if x.get("kind") == "sent"),
                    "refused": sum(1 for x in mine if x.get("kind") == "refused"),
                    "sent_today": sum(1 for x in mine if x.get("kind") == "sent" and (x.get("at") or 0) >= day),
                    "refused_today": sum(1 for x in mine if x.get("kind") == "refused" and (x.get("at") or 0) >= day),
                    "sent_hour": sum(1 for x in mine if x.get("kind") == "sent" and (x.get("at") or 0) >= now - 3600 * 1000),
                    "per_hour": int(e.get("per_hour") or PER_HOUR)})
    return {"helpers": out, "log": log_[-log_limit:][::-1], "max": MAX, "env": ENV}
