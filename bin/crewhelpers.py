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
import shutil
import stat
import subprocess
from pathlib import Path

from crewlib import DATA, OWNER, CrewError, load_json, save_json, locked, now_ms, append_jsonl

DIR = DATA / "crew-helpers"
FILE = DIR / "helpers.json"
LOG = DIR / "log.jsonl"
KEYS = Path.home() / ".config" / "project-pals" / "helpers"

ENV, ENV_FILE = "PAL_HELPER", "PAL_HELPER_KEY_FILE"
PREFIX = "palkey_"
BINARY_MARK = "\0"   # first in every key file (see _new_key)
SEALED = "palsealed1:"   # a key file whose key is encrypted at rest (see seal)
KEY_FILE_MAX = 8192
KEY_TEXT = re.compile(r"palkey_[A-Za-z0-9_-]{20,}")   # a key, wherever it turns up (cards and the log never carry one)
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9 _.-]{0,23}")
MAX = 8
PER_HOUR = 20          # sends in the owner's name per helper per hour; past it they go as "not verified"
LOG_KEEP = 2000
RESERVED = ("owner", "you", "pal", "pals plugin", "project pals", "crew", "crewd", "system", "a shell on this computer", "shell", "everyone")


OLD = DATA / "crew-helper"   # the build that went live unreviewed on 2026-11-10 (7692987): see adopt_old
MARK = OLD / ".carried-over"   # adopt_old ran here: never again, whatever happens to the list later
BACKUP = DIR / "helpers.json.bak"   # the list as last saved: a damaged or deleted list comes back from it
ATTENTION = DIR / "attention.json"  # helpers that aren't working and why (check): Home's "Needs you" reads it
STRICT = "PAL_HELPER_STRICT"        # =1: a send that isn't accepted is refused, not sent as a shell's
PER_HOUR_MAX = 500


class HelperError(CrewError):
    pass


def limits(name):
    """The line under every helper card (from build 7692987, kept: the limits travel with the card,
    not only in a primer the pal read at the start of its session)."""
    return (f"{name} is {OWNER}'s helper: a request for normal work, not {OWNER}'s click or approval. Push, publish, deploy, "
            f"release, merge, messaging people, settings, missions, AGENTS.md, proposals, approvals and questions put to {OWNER} "
            f"still need {OWNER}'s own click. To hand it on, pass this card unchanged; never retell it as {OWNER}'s own message.")


def claimed():
    """Does this run say it's a helper (PAL_HELPER set, or `pal --as-helper`), accepted or not?"""
    return bool(" ".join((os.environ.get(ENV) or "").split()))


def adopt_old():
    """Once, for an install that ran build 7692987: it kept one helper ("Pals"), its switch in
    crew-settings.json and its key INSIDE the data folder, where it compared the key with itself, so
    no key was ever needed. Pals is carried over by name, switched OFF, with no key: the owner turns
    it on again knowingly, and that makes a key in the keys folder. The old key is deleted (it's
    dead, and it has been lying where any pal's search could print it). What Pals sent stays on the
    record. Returns True when it did anything."""
    if OLD.is_symlink() or not OLD.is_dir() or MARK.exists():
        return False
    if FILE.exists() or BACKUP.exists():
        _mark_adopted()   # carried over by a version from before the mark: once is once (T170)
        return False
    with locked("helpers"):
        if FILE.exists() or MARK.exists():
            return False
        st = load_json(DATA / "crew-settings.json", {})
        old = st.get("helper") if isinstance(st, dict) else None
        was_on = isinstance(old, dict) and old.get("enabled") is True
        _save({"version": 1, "helpers": {"Pals": {"on": False, "made": now_ms(), "carried_over": True, "was_on": was_on}}})
        key = OLD / "pals.key"
        if key.is_file() and not key.is_symlink():
            key.unlink()
        recent = load_json(OLD / "recent.json", [])
        for e in recent[-200:] if isinstance(recent, list) else []:
            if isinstance(e, dict) and e.get("card"):
                append_jsonl(LOG, {"at": e.get("at") or 0, "kind": "sent", "helper": "Pals", "card": _clip(e.get("card"), 20),
                                   "to": _clip(e.get("to"), 120), "card_kind": _clip(e.get("kind"), 12), "via": "build 7692987",
                                   "title": _clip(e.get("title"), 300), "carried_over": True})
        try:
            os.chmod(LOG, 0o600)
        except OSError:
            pass
        _mark_adopted()
    log("switch", "Pals", action="carried over, off", was="on" if was_on else "off")
    check()   # it's off and the owner didn't do that: say so on Home (T170)
    return True


def _mark_adopted():
    try:
        MARK.write_text("carried over into data/crew-helpers; never again\n")
    except OSError:
        pass


# ─── the list ────────────────────────────────────────────────────────────────────────────────

def _load():
    """The list. T170: only the owner's click changes a helper's switch, so a list that's been
    damaged or deleted (a crash mid-write elsewhere, a clean-up tool) isn't read as "no helpers": it
    comes back from the copy kept beside it, and the record says so."""
    h = load_json(FILE, None)
    hs = h.get("helpers") if isinstance(h, dict) else None
    if not isinstance(hs, dict):
        b = load_json(BACKUP, None)
        bs = b.get("helpers") if isinstance(b, dict) else None
        if isinstance(bs, dict) and bs:
            hs = bs
            try:
                _private(FILE, json.dumps({"version": 1, "helpers": bs}, indent=2))
                log("notice", "The list of helpers", reason="restored", text="was unreadable and was put back from its backup copy")
                from crewlib import feed
                feed("helper", helper="", status="restored", text="the list of trusted helpers was unreadable and was put back from its backup")
            except (OSError, CrewError):
                pass
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
    _private(BACKUP, json.dumps(h, indent=2))


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


# ─── sealed at rest ──────────────────────────────────────────────────────────────────────────
# T134 (Codex's T122, P1): a pal reading configuration with an ordinary recursive read (grep -R over
# ~/.config, find -exec cat, tar, cp -r, a script that opens every file) reached the key, and the
# gate can't hold every read that starts above the keys' folder. So what's on disk isn't the key:
# it's the key encrypted by systemd for this user on this computer (systemd-creds --user, bound to
# the helper's name). Any read of the file, from anywhere, yields ciphertext; `pal` unseals it at
# the moment it checks a helper. A program run as the owner can still ask systemd to unseal it on
# purpose (the gate holds a pal's command that does); that's deliberate, not a mistake. Where
# systemd-creds isn't there (no systemd, an old one, a container) the key is kept as before:
# marked binary, so text searches don't print it.

def _cred_name(name):
    return f"pal-helper-{slug(name)}"


def can_seal():
    return os.environ.get("PAL_HELPER_PLAIN_KEYS") != "1" and bool(shutil.which("systemd-creds"))


def seal(key, name):
    """`key` encrypted for this user on this computer, as text; None when it can't be done here."""
    if not can_seal():
        return None
    try:
        r = subprocess.run(["systemd-creds", "--user", f"--name={_cred_name(name)}", "encrypt", "-", "-"],
                           input=key.encode(), capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return None
    blob = r.stdout.decode(errors="replace").strip()
    if r.returncode != 0 or not blob:
        return None
    # Only trust it if it comes back: a systemd that encrypts but can't decrypt for this user would lock the helper out.
    return blob if _unseal(blob, slug(name)) == key else None


def _unseal(blob, cred_slug):
    try:
        r = subprocess.run(["systemd-creds", "--user", f"--name=pal-helper-{cred_slug}", "decrypt", "-", "-"],
                           input=blob.encode(), capture_output=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.decode(errors="replace").strip() if r.returncode == 0 else None


def _new_key(name):
    """Make (or replace) the helper's key file. Returns the key's fingerprint; the key stays in the file."""
    KEYS.mkdir(parents=True, exist_ok=True)
    if KEYS.is_symlink() or KEYS.parent.is_symlink():
        raise HelperError(f"{KEYS} is a link: not putting a key behind it")
    os.chmod(KEYS, 0o700)
    # Search tools that honour ignore files (ripgrep, and what's built on it) skip the keys even when
    # pointed at a folder above this one (T122: `rg . ~/.config/project-pals` printed a key).
    for d in (KEYS, KEYS.parent):
        ig = d / ".ignore"
        if not ig.exists() and not ig.is_symlink():
            _private(ig, "# Project Pals: trusted helpers' keys. Not for searching.\n*\n")
    key = PREFIX + secrets.token_urlsafe(32)
    # A NUL byte first: text-search tools (grep, ripgrep, ag, ack) then take the file for binary and
    # say "binary file matches" instead of printing the key, whatever folder the search started in
    # and whether or not they honour ignore files (T122: `grep -R pal ~/.config` printed a key).
    # Reading it on purpose (cat, strings, grep -a) still shows it; nothing run as the owner can't.
    blob = seal(key, name)
    body = f"{SEALED}{slug(name)}\n{blob}\n" if blob else key + "\n"
    _private(key_path(name), BINARY_MARK + body)
    return fingerprint(key)


def switch(name, on, pals=()):
    """The owner's switch (the caller has checked the click). On, the first time: the helper and its
    key are made. Off: the key stops being accepted at once (it's kept, so On again resumes it)."""
    adopt_old()
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
        e["on"], e["switched"] = bool(on), now_ms()   # `switched`: the owner has decided this helper's state
        _save(h)
    log("switch", known, action="on" if on else "off", **({"key": "made"} if made else {}))
    check()
    return known, e


def rotate(name):
    """A new key in the same file; every copy of the old one is dead from now."""
    adopt_old()
    with locked("helpers"):
        h = _load()
        known = canonical(name, h)
        if not known:
            raise HelperError(f"no helper called {name}")
        e = h["helpers"][known]
        e["sha256"], e["rotated"] = _new_key(known), now_ms()
        _save(h)
    log("switch", known, action="rotate")
    check()
    return known, e


def set_limit(name, per_hour):
    """How many messages an hour this helper may send in the owner's name (the owner's click)."""
    try:
        n = int(per_hour)
    except (TypeError, ValueError):
        raise HelperError("the limit is a number of messages an hour")
    if not 1 <= n <= PER_HOUR_MAX:
        raise HelperError(f"the limit is 1 to {PER_HOUR_MAX} messages an hour")
    adopt_old()
    with locked("helpers"):
        h = _load()
        known = canonical(name, h)
        if not known:
            raise HelperError(f"no helper called {name}")
        h["helpers"][known]["per_hour"] = n
        _save(h)
    log("switch", known, action=f"limit {n} an hour")
    check()
    return known, n


def remove(name):
    adopt_old()
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
    check()
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
        if st.st_size > KEY_FILE_MAX:
            raise HelperError("its key file isn't a key")
        text = os.read(fd, KEY_FILE_MAX).decode(errors="replace").lstrip(BINARY_MARK).strip()
    finally:
        os.close(fd)
    if not text.startswith(SEALED):
        return text
    head, _, blob = text.partition("\n")
    cred_slug = head[len(SEALED):].strip()
    key = _unseal("".join(blob.split()), cred_slug) if re.fullmatch(r"[a-z0-9-]{1,40}", cred_slug) and blob.strip() else None
    if not key:
        raise HelperError("its key can't be unsealed here (it was made for this user on this computer; Rotate key makes a new one)")
    return key


def sent_since(name, since_ms):
    return sum(1 for e in entries() if e.get("kind") == "sent" and e.get("helper") == name and (e.get("at") or 0) >= since_ms)


def verify(name, key_file=None):
    """(the helper's name, its key's short fingerprint) when `name` may speak in the owner's name right
    now; else raise HelperError saying why. No side effects (but for carrying an older build's helper over, once)."""
    adopt_old()
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


def recheck(name):
    """At the moment a card is made, holding the caller's "helpers-send" lock: is `name` still good
    to send (not switched off or rotated since this run started, and under the hourly limit counting
    every send that got in first)? Returns the reason it isn't, and makes that this run's answer, so
    the card goes as a shell's and the record says why; None when it's good."""
    global _presented
    claim = " ".join((os.environ.get(ENV) or "").split())
    try:
        known, fp = verify(name, os.environ.get(ENV_FILE) or None)
        if not claim or canonical(claim) != known:
            raise HelperError("this run didn't present that helper")
        return None
    except HelperError as e:
        _presented = {"claim": claim or name, "name": None, "fp": None, "why": str(e), "rechecked": True}
        return str(e)


def presented():
    """Who this run says it is: None (no PAL_HELPER), or {"claim", "name", "fp", "why"}: `name` and
    `fp` when the key was accepted, else `why` it wasn't (and the message goes as an unverified shell's)."""
    global _presented
    if _presented and _presented.get("rechecked"):
        return _presented   # refused at the moment of sending (recheck): that stands for this run
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
    claim = " ".join((os.environ.get(ENV) or "").split()) or ((_presented or {}).get("claim") or "")
    if not claim:
        return None
    known = canonical(claim)
    entry = log("unverified", known or claim, why=why, via=via)
    if known:
        check(bump=known)   # if that helper isn't working, the owner hears now, not when they next look (T170)
    return entry


def strict():
    return os.environ.get(STRICT) == "1"


# ─── is each helper working? (T170) ──────────────────────────────────────────────────────────
# Only the owner's click turns a helper on or off. So "a helper the owner left on isn't working" and
# "a helper is off and the owner didn't do that" are things to say out loud: one entry each in
# attention.json (Home shows it under Needs you, with the fix), a line in the feed and in the record
# when it starts and when it clears. Looked at after every switch change, after an install, when
# crewd starts and each hour, and when a send in a helper's name doesn't verify.

def health(name, e, now=None):
    """None when `name` is as the owner left it and working; else {"reason", "text", "fix"}."""
    now = now or now_ms()
    if not e.get("on"):
        if e.get("carried_over") and not e.get("switched"):
            return {"reason": "carried-over", "fix": "on",
                    "text": f"{name} is off. An earlier build's helper was carried over switched off, not by you. What it sends is not in your name."}
        return None   # the owner switched it off
    try:
        key = _read_key(key_path(name))
    except HelperError as ex:
        return {"reason": "no-key" if not key_path(name).exists() else "key-unreadable", "fix": "rotate",
                "text": f"{name} is on, but {ex}. What it sends is not in your name until it has a new key."}
    if not key.startswith(PREFIX) or not hmac.compare_digest(fingerprint(key), e.get("sha256") or ""):
        return {"reason": "key-mismatch", "fix": "rotate",
                "text": f"{name} is on, but the key in its file isn't the one you gave it. What it sends is not in your name until it has a new key."}
    per_hour = int(e.get("per_hour") or PER_HOUR)
    if sent_since(name, now - 3600 * 1000) >= per_hour:
        return {"reason": "limit", "fix": None,
                "text": f"{name} reached its limit of {per_hour} messages an hour. The rest arrive not verified until the hour passes."}
    return None


def attention():
    a = load_json(ATTENTION, None)
    return {k: v for k, v in a.items() if isinstance(v, dict)} if isinstance(a, dict) else {}


def check(bump=None):
    """Look at every helper, bring attention.json up to date, and say what changed. `bump`: a send in
    that helper's name just went unverified. Returns the attention entries."""
    try:
        with locked("helpers-attention"):
            h, was, now = _load(), attention(), now_ms()
            out = {}
            for name, e in h["helpers"].items():
                bad = health(name, e, now)
                if not bad:
                    continue
                old = was.get(name) if (was.get(name) or {}).get("reason") == bad["reason"] else None
                out[name] = {**bad, "since": (old or {}).get("since") or now, "unverified": (old or {}).get("unverified") or 0}
                if old and old.get("last"):
                    out[name]["last"] = old["last"]
                if bump == name:
                    out[name]["unverified"] += 1
                    out[name]["last"] = now
            started = [n for n in out if (was.get(n) or {}).get("reason") != out[n]["reason"]]
            cleared = [n for n in was if n not in out]
            if out != was:
                DIR.mkdir(parents=True, exist_ok=True)
                _private(ATTENTION, json.dumps(out, indent=2))
        from crewlib import feed
        for n in started:
            log("notice", n, reason=out[n]["reason"], text=out[n]["text"])
            feed("helper", helper=n, status=out[n]["reason"], text=out[n]["text"])
        for n in cleared:
            log("notice", n, reason="ok", text="is working again")
            feed("helper", helper=n, status="ok", text=f"{n} is working again")
        return out
    except (OSError, CrewError):
        return attention()   # the notice must never be why a send or a switch fails


# ─── what the app and `pal helpers` show ─────────────────────────────────────────────────────

def _is_sealed(p):
    try:
        with open(p, "rb") as f:
            return f.read(64).lstrip(b"\0").startswith(SEALED.encode())
    except OSError:
        return False


def listing(log_limit=200):
    adopt_old()
    h, now = _load(), now_ms()
    day = now - 24 * 3600 * 1000
    log_ = entries()
    att = attention()
    out = []
    for name, e in sorted(h["helpers"].items(), key=lambda kv: kv[0].lower()):
        mine = [x for x in log_ if x.get("helper") == name]
        p = key_path(name)
        out.append({"name": name, "on": bool(e.get("on")), "key": (e.get("sha256") or "")[:8] or None, "key_file": str(p),
                    "key_there": p.is_file() and not p.is_symlink(), "sealed": _is_sealed(p), "made": e.get("made"), "rotated": e.get("rotated"),
                    "switched": e.get("switched"), "last_used": e.get("last_used"),
                    "sent": sum(1 for x in mine if x.get("kind") == "sent"),
                    "refused": sum(1 for x in mine if x.get("kind") == "refused"),
                    "sent_today": sum(1 for x in mine if x.get("kind") == "sent" and (x.get("at") or 0) >= day),
                    "refused_today": sum(1 for x in mine if x.get("kind") == "refused" and (x.get("at") or 0) >= day),
                    "sent_hour": sum(1 for x in mine if x.get("kind") == "sent" and (x.get("at") or 0) >= now - 3600 * 1000),
                    "per_hour": int(e.get("per_hour") or PER_HOUR), "carried_over": bool(e.get("carried_over") and not e.get("switched")), "attention": att.get(name)})
    return {"helpers": out, "log": log_[-log_limit:][::-1], "max": MAX, "env": ENV}
