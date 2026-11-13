"""Relayed taps (T147): a trusted helper taps what's waiting on the owner, relaying the owner's word.

The owner is away from the app, in chat with their helper. The helper shows them the exact thing
that waits (a question on Home, a held command, a proposal, a draft), the owner answers there, and
the helper taps it. DeNon's own picks, 2026-11-11: h-8287ee "Plan it as asked", h-5cadb2 "As asked,
with holds", h-8d5b13 "Build now, land after Codex" (the plan: crew-boards/trusted-helper/
relayed-taps-full.html).

    pal --as-helper taps [--json]                       what waits, each with its exact text and a ticket
    pal --as-helper tap <ticket> "<choice>" --relayed "the owner's words"
    pal --as-helper tap-cancel <hold>                   take a tap back while it's held
    pal taps [--json]                                   the holds (anyone)
    pal taps stop|now|undo <hold>                       the owner's (a click)
    pal taps run                                        carry out the holds that are due (crewd does)

What a tap is, and isn't. A key proves the helper; nothing here can prove the owner said it. So a
tap is always "<helper> reports that <owner> picked B", recorded and shown as that, never as the
owner's click. With the outward switch on, a tap IS the approval of a push, a release or a landing:
anything that can act as the helper can then get those done in the owner's name. What bounds that:

  - a ticket: one item as Project Pals showed it (a fingerprint), its listed choices, one use, ten
    minutes, and not sooner than twenty seconds (a person reads; a loop doesn't wait);
  - three switches per helper (home / local / outward), each off until the owner's click;
  - a hold before anything runs (a minute; five for outward ones) with Stop on Home and tap-cancel;
  - limits (5 outward a day, 30 others an hour, one outward hold at a time, one tap per item ever);
  - three refused taps in ten minutes switch tapping off for that helper until the owner's click;
  - what a helper can never tap: the trust and tap switches, settings, missions, updates, uninstall,
    and held commands that reach for keys, click tokens, the queue, the Desk's cards or these files
    (those decide what the helper itself, or a pal, may do).

How it runs. tap() writes a hold. When it's due, run_due() (crewd each tick; any `pal taps` call)
checks again (helper on, switch on, item unchanged) and runs the owner's own command for it with a
one-time TAP token in place of a click token (data/crew-taps/run/<nonce>.json, for exactly that
command line): crewlib.owner_gate takes it for the six commands below and nothing else, and each of
them says "tapped by <helper>, relayed from <owner>" wherever it would have said the owner.

  data/crew-taps/tickets/<k-…>.json   one per item per listing
  data/crew-taps/holds/<t-…>.json     a tap: holding → running → done | stopped | cancelled | dropped | failed
  data/crew-taps/holds.json           the recent holds in one file, for the app
  data/crew-taps/run/<nonce>.json     the tap token of a hold being carried out
"""
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

from crewlib import DATA, OWNER, CrewError, load_json, save_json, locked, now_ms, feed

DIR = DATA / "crew-taps"
TICKETS, HOLDS, RUN, SUMMARY = DIR / "tickets", DIR / "holds", DIR / "run", DIR / "holds.json"
USED = DIR / "used"   # permanent item tombstones, independent of display-history retention

CLASSES = ("home", "local", "outward")
CLASS_WORDS = {"home": "questions on Home", "local": "approvals that stay on this computer", "outward": "outward actions and landing"}
TICKET_TTL = 600          # seconds a ticket is good for
READ_SECONDS = 20         # a tap sooner than this after its ticket is refused
HOLD = {"home": 60, "local": 60}   # seconds before a tap runs; outward: the helper's setting, in minutes
OUTWARD_HOLD_MIN, OUTWARD_HOLD_MAX = 5, 15
OUTWARD_PER_DAY, OTHER_PER_HOUR = 5, 30
REFUSALS, REFUSAL_WINDOW = 3, 600
RUN_TTL = 120             # seconds a tap token is good for
KEEP_DAYS = 14
SHOWN_TEXT_MAX = 6000

# Which held commands a tap may answer, by the gate's rule. Local: stays on this computer and can be
# put back. Outward is explicitly enumerated; new/custom rules stay owner-only until classified.
LOCAL_RULES = {"agents-file", "agents-file-shell", "agents-file-interpreter"}
OUTWARD_RULES = {"push", "publish", "release", "merge", "post", "deploy", "message", "message-api", "land", "release-script", "live-branch", "base-branch"}
NEVER_RULES = {"helper-key", "notify-key", "owner-click", "queue-write", "desk-write", "tap-write", "uninstall", "uninstall-indirect"}
# The owner's commands a tap token may stand in for (crewlib.owner_gate checks the same list).
TAPPABLE = (("home", "answer"), ("approve",), ("deny",), ("proposal", "accept"), ("proposal", "decline"), ("desk", "send-draft"))


class TapError(CrewError):
    """A tap that isn't carried out. `counts`: it goes toward the three-in-ten-minutes switch-off."""

    def __init__(self, msg, counts=False):
        super().__init__(msg)
        self.counts = counts


def label(helper):
    return f"{helper} (tapped, relayed from {OWNER})"


def _new(prefix, n=6):
    return prefix + secrets.token_hex(n)


def _files(d):
    return sorted(d.glob("*.json")) if d.is_dir() else []


def _sha(*parts):
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _clip(text, n):
    text = str(text or "")
    return text if len(text) <= n else text[:n - 1] + "…"


# ─── the helper's switches ───────────────────────────────────────────────────────────────────

def switches(entry):
    """A helper's tap settings from its entry in the helpers' list, with the defaults."""
    t = entry.get("taps") if isinstance(entry.get("taps"), dict) else {}
    try:
        hold = max(0, min(OUTWARD_HOLD_MAX, int(t.get("hold", OUTWARD_HOLD_MIN))))
    except (TypeError, ValueError):
        hold = OUTWARD_HOLD_MIN
    return {"home": t.get("home") is True, "local": t.get("local") is True, "outward": t.get("outward") is True, "hold": hold,
            "auto_off": t.get("auto_off")}


def _entry(helper):
    import crewhelpers
    h = crewhelpers._load()
    known = crewhelpers.canonical(helper, h)
    return (known, h["helpers"][known]) if known else (None, None)


def _may(helper, cls):
    """Why `helper` may not tap things of this class right now, or None."""
    known, e = _entry(helper)
    if not e or not e.get("on"):
        return f"{helper} isn't a trusted helper that's switched on"
    if not switches(e)[cls]:
        return f"tapping {CLASS_WORDS[cls]} is switched off for {known} ({OWNER} turns it on in Project Pals: About, Trusted helpers)"
    return None


# ─── what waits, as Project Pals shows it ────────────────────────────────────────────────────

def item_hash(kind, x):
    """Hash the same record snapshot the action will use, without rereading its store."""
    if kind == "home":
        opts = [o for o in x.get("options") or [] if isinstance(o, str)]
        does = (list(x.get("does") or []) + [""] * len(opts))[:len(opts)]
        return _sha(kind, x["id"], x.get("title"), x.get("body"), opts, does, x.get("by"), x.get("links"))
    fields = {
        "approval": ("key", "command", "rule", "terminal", "bot", "channel", "edit_hash", "base_hash", "diff"),
        "proposal": ("kind", "pal", "file", "base", "text", "note", "meta"),
        "draft": ("from", "to", "urgency", "title", "body", "track"),
    }
    return _sha(kind, x["id"], *(x.get(f) for f in fields[kind]))


def proposal_never(p):
    clipped = clipped_reason("proposal", p)
    if clipped:
        return clipped
    # Check the payload subtype, not just the outer `proposal accept` command.
    if p.get("kind") == "agents" and re.fullmatch(r"(?:AGENTS\.md|CLAUDE(?:\.local)?\.md|\.claude/CLAUDE\.md)", p.get("file") or ""):
        return None
    if p.get("kind") == "dream" and (p.get("meta") or {}).get("kind") in ("skill", "tool", "process"):
        return None
    return f"this proposal changes a mission or brain, or has an unsupported kind: {OWNER}'s own click only"


def approval_class(a):
    import crewguard
    rules = {a.get("rule"), *(r["name"] for r in crewguard.all_matches(a.get("command") or ""))}
    forbidden = {str(r) for r in rules if rule_class(r) == "never"}
    if forbidden:
        return "local", f"owner-only or unclassified rule {', '.join(sorted(forbidden))}: {OWNER}'s own click only"
    return ("local" if all(rule_class(r) == "local" for r in rules) else "outward"), clipped_reason("approval", a)


def clipped_reason(kind, record):
    field = {"approval": "diff", "proposal": "text", "draft": "body"}.get(kind)
    if field and len(str(record.get(field) or "")) > SHOWN_TEXT_MAX:
        return f"too long to show in full: {OWNER}'s own click only"
    return None


def validate_snapshot(kind, record, tap):
    """Called under the store's mutation lock with the record about to change.
    Proposal callers keep their decision lock while writing this validated payload."""
    if tap.get("kind") != kind or tap.get("item") != record.get("id") or tap.get("hash") != item_hash(kind, record):
        raise TapError(f"{record.get('id')} changed after it was tapped")
    if clipped_reason(kind, record):
        raise TapError(clipped_reason(kind, record))
    if kind == "proposal":
        why = proposal_never(record)
        if why:
            raise TapError(why)
    if kind == "approval":
        cls, why = approval_class(record)
        if why or cls != tap.get("cls"):
            raise TapError(why or "the approval's tap class changed")


def _home_items():
    import crewhome
    import crewhelpers
    helpers = {crewhelpers.slug(n) for n in crewhelpers._load()["helpers"]}
    out = []
    for x in crewhome.load()["items"]:
        if x.get("kind") != "ask" or x.get("status") != "open":
            continue
        opts = [o for o in x.get("options") or [] if isinstance(o, str)]
        does = list(x.get("does") or []) + [""] * len(opts)
        never = None
        if not opts:
            never = f"it has no listed choices: {OWNER} answers it in their own words"
        elif x.get("owner_only"):
            never = f"its asker or the head pal marked it for {OWNER}'s own click"
        elif "#" not in (x.get("by") or "") and crewhelpers.slug(x.get("by") or "") in helpers:
            never = "a helper put it on Home: a helper doesn't answer a helper's question"
        text = "\n".join(filter(None, [x.get("title"), x.get("body"), *(f"- {o}: {d}" if d else f"- {o}" for o, d in zip(opts, does)),
                                        *(f"link: {l}" for l in x.get("links") or [])]))
        out.append({"kind": "home", "id": x["id"], "cls": "home", "title": x.get("title") or "", "text": text, "by": x.get("by") or "",
                    "choices": [{"label": o, "does": d} for o, d in zip(opts, does)], "never": never,
                    "hash": item_hash("home", x)})
    return out


def rule_class(rule):
    return "local" if rule in LOCAL_RULES else "outward" if rule in OUTWARD_RULES else "never"


def _approval_items():
    import crewguard
    out = []
    for a in crewguard.all_requests():
        if a.get("status") != "pending":
            continue
        cls, never = approval_class(a)
        who = f"{a.get('bot') or 'a shell'}" + (f" #{a['channel']}" if a.get("channel") else "")
        text = f"{who} wants to run a command that {a.get('why') or a.get('rule')}:\n{a.get('command') or ''}" + (f"\n\n{_clip(a.get('diff'), SHOWN_TEXT_MAX)}" if a.get("diff") else "")
        out.append({"kind": "approval", "id": a["id"], "cls": cls, "title": f"{who}: {_clip(a.get('command'), 120)}",
                    "text": text, "by": who, "rule": a.get("rule"),
                    "choices": [{"label": "Approve", "does": "Lets exactly this command run, once"}, {"label": "Decline", "does": "The command is refused"}],
                    "never": never, "hash": item_hash("approval", a)})
    return out


def _proposal_items():
    import crewproposals
    out = []
    for p in crewproposals.all_("pending"):
        p = crewproposals.get(p["id"])   # with its text (a listing leaves it out): the fingerprint must cover what would be written
        what ="its mission" if p.get("kind") == "mission" else p.get("file") or (p.get("meta") or {}).get("pattern") or "a file"
        text = f"{p.get('by') or p.get('pal')} proposes a change to {what}" + (f": {p['note']}" if p.get("note") else "") + f"\n\n{_clip(p.get('text'), SHOWN_TEXT_MAX)}"
        out.append({"kind": "proposal", "id": p["id"], "cls": "local", "title": f"{p.get('by') or p.get('pal')}: change {what}", "text": text, "by": p.get("by") or "",
                    "choices": [{"label": "Accept", "does": "Writes the change"}, {"label": "Decline", "does": "The proposer is told"}], "never": proposal_never(p),
                    "text_sha": crewproposals.text_sha(p),
                    "hash": item_hash("proposal", p)})
    return out


def _draft_items():
    import crewdesk
    out = []
    for path, card in crewdesk.cards(where=("open",)):
        if card.get("unreadable") or card.get("status") != "draft" or path.parent.parent.name != crewdesk.DRAFTS:
            continue
        text = f"A draft by {card.get('from')}, to {card.get('to') or 'route'}:\n{card.get('title') or ''}\n{_clip(card.get('body'), SHOWN_TEXT_MAX)}"
        out.append({"kind": "draft", "id": card["id"], "cls": "local", "title": f"Draft by {card.get('from')}: {_clip(card.get('title'), 100)}", "text": text,
                    "by": card.get("from") or "", "choices": [{"label": "Send", "does": "It goes out as its drafter's card, sent on this tap"}], "never": clipped_reason("draft", card),
                    "hash": item_hash("draft", card)})
    return out


def items():
    out = []
    for f in (_home_items, _approval_items, _proposal_items, _draft_items):
        try:
            out += f()
        except (CrewError, OSError):
            pass   # one store unreadable doesn't hide the others
    return out


def _item(kind, iid):
    return next((x for x in items() if x["kind"] == kind and x["id"] == iid), None)


# ─── holds ───────────────────────────────────────────────────────────────────────────────────

def holds():
    out = [h for h in (load_json(f, None) for f in _files(HOLDS)) if isinstance(h, dict) and h.get("id")]
    return sorted(out, key=lambda h: h.get("at") or 0)


def _save_hold(h):
    _mark_used(h["kind"], h["item"])
    HOLDS.mkdir(parents=True, exist_ok=True)
    save_json(HOLDS / f"{h['id']}.json", h)
    keep = now_ms() - KEEP_DAYS * 86400 * 1000
    allh = holds()
    for old in allh:
        # Backfill older builds' records before pruning; fail closed if a marker can't be saved.
        _mark_used(old["kind"], old["item"])
        if old.get("status") not in ("holding", "running") and (old.get("ended") or old.get("at") or 0) < keep:
            (HOLDS / f"{old['id']}.json").unlink(missing_ok=True)
    save_json(SUMMARY, [h for h in allh if (h.get("ended") or h.get("at") or 0) >= keep][-200:])


def _used_path(kind, iid):
    return USED / (_sha(kind, iid) + ".json")


def _mark_used(kind, iid):
    USED.mkdir(parents=True, exist_ok=True)
    path = _used_path(kind, iid)
    if not path.exists():
        save_json(path, {"kind": kind, "item": iid})


def _was_used(kind, iid):
    return _used_path(kind, iid).exists() or any(h["kind"] == kind and h["item"] == iid for h in holds())


def _hold(hid):
    if not re.fullmatch(r"t-[0-9a-f]{6,16}", hid or ""):
        raise TapError("that isn't a hold (t-…)")
    h = load_json(HOLDS / f"{hid}.json", None)
    if not isinstance(h, dict):
        raise TapError(f"no hold {hid}")
    return h


def _end(h, status, result=""):
    h["status"], h["ended"], h["result"] = status, now_ms(), _clip(result, 400)
    _save_hold(h)
    _log("tap-" + status, h["helper"], hold=h["id"], item=h["item"], item_kind=h["kind"], choice=h["choice"], title=h.get("title") or "", why=h["result"])
    feed("tap", helper=h["helper"], hold=h["id"], status=status, item=h["item"], choice=h["choice"], text=h.get("title") or "")
    return h


def _log(kind, helper, **fields):
    import crewhelpers
    try:
        return crewhelpers.log(kind, helper, **fields)
    except (OSError, CrewError):
        return None


# ─── the helper's side: tickets and taps ─────────────────────────────────────────────────────

def tickets(helper):
    """What waits, for `helper` (its key was accepted by the caller): every item with the exact text
    Project Pals wrote for it. One it may tap carries a ticket; the others say why not."""
    TICKETS.mkdir(parents=True, exist_ok=True)
    now = now_ms()
    for f in _files(TICKETS):   # tidy: tickets past their time
        t = load_json(f, None)
        if not isinstance(t, dict) or now - (t.get("made") or 0) > 2 * TICKET_TTL * 1000:
            f.unlink(missing_ok=True)
    out = []
    for x in items():
        why = x["never"] or _may(helper, x["cls"])
        if not why and _was_used(x["kind"], x["id"]):
            why = f"it was tapped once already: it's {OWNER}'s now"
        row = {"kind": x["kind"], "id": x["id"], "class": x["cls"], "title": x["title"], "text": x["text"], "by": x["by"], "choices": x["choices"],
               "hold_seconds": hold_seconds(helper, x["cls"])}
        if why:
            row["not_tappable"] = why
        else:
            t = {"id": _new("k-"), "helper": helper, "kind": x["kind"], "item": x["id"], "cls": x["cls"], "hash": x["hash"],
                 "choices": [c["label"] for c in x["choices"]], "made": now, "used": None}
            save_json(TICKETS / f"{t['id']}.json", t)
            row["ticket"] = t["id"]
            row["ticket_good_for_seconds"] = TICKET_TTL
            row["tap_not_before_seconds"] = READ_SECONDS
        out.append(row)
    return out


def hold_seconds(helper, cls):
    if cls != "outward":
        return HOLD[cls]
    _, e = _entry(helper)
    return switches(e or {})["hold"] * 60


def tap(helper, ticket, choice, relayed):
    """A tap by `helper` (its key was accepted by the caller). Returns the hold. Refusals raise TapError
    and are on the record; three that count, in ten minutes, switch tapping off for this helper."""
    try:
        with locked("taps"):
            return _tap(helper, ticket, choice, relayed)
    except TapError as e:
        _log("tap-refused", helper, ticket=_clip(ticket, 40), choice=_clip(choice, 60), why=str(e), counts=bool(e.counts))
        if e.counts:
            _maybe_switch_off(helper)
        raise


def _tap(helper, ticket, choice, relayed):
    relayed = " ".join(str(relayed or "").split())
    if not relayed:
        raise TapError(f'say what {OWNER} said: --relayed "their words"')
    if len(relayed) > 300:
        raise TapError("the relayed words are at most 300 characters")
    if not re.fullmatch(r"k-[0-9a-f]{12}", ticket or ""):
        raise TapError("that isn't a ticket (k-…): ask for one with pal --as-helper taps", counts=True)
    path = TICKETS / f"{ticket}.json"
    t = load_json(path, None)
    if not isinstance(t, dict):
        raise TapError("no such ticket: ask again with pal --as-helper taps", counts=True)
    if t.get("helper") != helper:
        raise TapError("that ticket was made for another helper", counts=True)
    if t.get("used"):
        raise TapError("that ticket was used already: a ticket is good for one tap", counts=True)
    age = (now_ms() - (t.get("made") or 0)) / 1000
    if age > TICKET_TTL:
        raise TapError(f"that ticket is older than {TICKET_TTL // 60} minutes: ask again with pal --as-helper taps", counts=True)
    if age < READ_SECONDS:
        raise TapError(f"too soon: a tap comes at least {READ_SECONDS} seconds after its ticket, time enough for {OWNER} to read it", counts=True)
    x = _item(t["kind"], t["item"])
    if not x:
        raise TapError(f"{t['item']} isn't waiting any more")
    if x["hash"] != t.get("hash"):
        raise TapError(f"{t['item']} changed since that ticket was made: show {OWNER} what it says now (pal --as-helper taps)", counts=True)
    if x["never"]:
        raise TapError(f"{t['item']} can't be tapped: {x['never']}", counts=True)
    why = _may(helper, x["cls"])
    if why:
        raise TapError(why)
    pick = next((c["label"] for c in x["choices"] if c["label"].lower() == str(choice or "").strip().lower()), None)
    if not pick:
        raise TapError(f"{choice!r} isn't one of its choices ({', '.join(c['label'] for c in x['choices'])})", counts=True)
    now, mine = now_ms(), [h for h in holds() if h.get("helper") == helper]
    if _was_used(x["kind"], x["id"]):
        raise TapError(f"{x['id']} was tapped once already: it's {OWNER}'s now")
    if x["cls"] == "outward":
        if any(h["cls"] == "outward" and h["status"] in ("holding", "running") for h in mine):
            raise TapError("another outward tap of yours is still held: one at a time")
        if sum(1 for h in mine if h["cls"] == "outward" and now - h["at"] < 86400 * 1000) >= OUTWARD_PER_DAY:
            raise TapError(f"{OUTWARD_PER_DAY} outward taps a day is the limit: {OWNER} approves this one in Project Pals")
    elif sum(1 for h in mine if h["cls"] != "outward" and now - h["at"] < 3600 * 1000) >= OTHER_PER_HOUR:
        raise TapError(f"{OTHER_PER_HOUR} taps an hour is the limit")
    t["used"] = now
    save_json(path, t)
    h = {"id": _new("t-", 3), "helper": helper, "kind": x["kind"], "item": x["id"], "cls": x["cls"], "choice": pick, "relayed": relayed,
         "title": x["title"], "by": x["by"], "hash": x["hash"], "ticket": ticket, "at": now, "run_at": now + hold_seconds(helper, x["cls"]) * 1000,
         "status": "holding", **({"rule": x["rule"]} if x.get("rule") else {}), **({"text_sha": x["text_sha"]} if x.get("text_sha") else {})}
    _save_hold(h)
    _log("tap", helper, hold=h["id"], item=h["item"], item_kind=h["kind"], item_class=h["cls"], choice=pick, relayed=relayed, title=h["title"], run_at=h["run_at"])
    feed("tap", helper=helper, hold=h["id"], status="holding", item=h["item"], choice=pick, text=h["title"], outward=h["cls"] == "outward")
    return h


def _maybe_switch_off(helper):
    import crewhelpers
    since = now_ms() - REFUSAL_WINDOW * 1000
    n = sum(1 for e in crewhelpers.entries() if e.get("kind") == "tap-refused" and e.get("helper") == helper and e.get("counts") and (e.get("at") or 0) >= since)
    if n >= REFUSALS:
        crewhelpers.taps_auto_off(helper, f"{n} taps refused in {REFUSAL_WINDOW // 60} minutes")
        for h in holds():   # … and what it had in hand is dropped
            if h.get("helper") == helper and h.get("status") == "holding":
                _end(h, "dropped", "tapping was switched off for this helper")


def cancel(helper, hid):
    """The helper takes its own tap back while it's held ("cancel", said in chat)."""
    with locked("taps"):
        h = _hold(hid)
        if h.get("helper") != helper:
            raise TapError("that tap isn't yours")
        if h.get("status") != "holding":
            raise TapError(f"{hid} is {h.get('status')} already")
        return _end(h, "cancelled", f"taken back by {helper}")


# ─── the owner's side (the callers have checked the click) ───────────────────────────────────

def stop(hid):
    with locked("taps"):
        h = _hold(hid)
        if h.get("status") != "holding":
            raise TapError(f"{hid} is {h.get('status')} already")
        return _end(h, "stopped", f"stopped by {OWNER}")


def now_(hid):
    """Let it go now: the hold ends at once (the caller then runs what's due)."""
    with locked("taps"):
        h = _hold(hid)
        if h.get("status") != "holding":
            raise TapError(f"{hid} is {h.get('status')} already")
        h["run_at"], h["hurried"] = now_ms(), True
        _save_hold(h)
        return h


def undo(hid):
    """Undo a tapped answer on Home: the question is open again and its asker is told to stop. Only a
    Home question can be undone here; an approval that ran has run."""
    import crewhome
    with locked("taps"):
        h = _hold(hid)
        if h.get("kind") != "home" or h.get("status") != "done":
            raise TapError("only a question on Home that was answered by a tap can be undone here" if h.get("kind") == "home"
                           else "that has run: an approval or a sent card can't be undone from here")
        x = crewhome.untap(h["item"])
        h["status"], h["undone"] = "undone", now_ms()
        _save_hold(h)
    _log("tap-undone", h["helper"], hold=h["id"], item=h["item"], item_kind=h["kind"], choice=h["choice"], title=h.get("title") or "")
    feed("tap", helper=h["helper"], hold=h["id"], status="undone", item=h["item"], choice=h["choice"], text=h.get("title") or "")
    return h, x


# ─── carrying a tap out ──────────────────────────────────────────────────────────────────────

def _pal():
    here = Path(__file__).resolve().parent / "crew"
    if here.exists():
        return [sys.executable, str(here)]
    found = shutil.which("pal") or str(Path.home() / ".local" / "bin" / "pal")
    return [found]


def _args(h):
    if h["kind"] == "home":
        return ["home", "answer", h["item"], h["choice"]]
    if h["kind"] == "approval":
        return ["approve" if h["choice"] == "Approve" else "deny", h["item"]]
    if h["kind"] == "proposal":
        return ["proposal", "accept", h["item"], "--text-sha", h.get("text_sha") or ""] if h["choice"] == "Accept" else ["proposal", "decline", h["item"]]
    if h["kind"] == "draft":
        return ["desk", "send-draft", h["item"]]
    raise TapError(f"nothing to run for a {h['kind']}")


def run_due():
    """Carry out every hold whose time has come. Safe to call from anywhere, as often as you like:
    each hold is taken under the lock, and runs once. Returns the holds it ended."""
    if not HOLDS.is_dir() or not any(HOLDS.iterdir()):
        return []
    out = []
    while True:
        with locked("taps"):
            due = next((h for h in holds() if h.get("status") == "holding" and (h.get("run_at") or 0) <= now_ms()), None)
            if not due:
                return out
            why = _still_good(due)
            if why:
                out.append(_end(due, "dropped", why))
                continue
            args = _args(due)
            nonce = secrets.token_hex(16)
            RUN.mkdir(parents=True, exist_ok=True)
            save_json(RUN / f"{nonce}.json", {"args": args, "at": now_ms(), "hold": due["id"], "helper": due["helper"], "relayed": due["relayed"]})
            due["status"], due["started"] = "running", now_ms()
            _save_hold(due)
        # Outside the lock: the command it runs may itself ask what's held (pal taps).
        env = {k: v for k, v in os.environ.items() if k not in ("PAL_HELPER", "PAL_HELPER_KEY_FILE", "PAL_HELPER_STRICT", "HC_TERMINAL_ID")}
        try:
            r = subprocess.run([*_pal(), *args, "--tap", nonce], capture_output=True, text=True, timeout=180, env=env)
            ok, said = r.returncode == 0, (r.stdout.strip().splitlines() or [""])[-1] if r.returncode == 0 else (r.stderr.strip().splitlines() or ["failed"])[-1]
        except (OSError, subprocess.TimeoutExpired) as e:
            ok, said = False, str(e)
        (RUN / f"{nonce}.json").unlink(missing_ok=True)
        with locked("taps"):
            out.append(_end(_hold(due["id"]), "done" if ok else "failed", said))


def _still_good(h):
    """At the moment it would run: is the helper still on, its switch still on, the item still what was
    tapped? Why not, or None."""
    why = _may(h["helper"], h["cls"])
    if why:
        return why
    x = _item(h["kind"], h["item"])
    if not x:
        return f"{h['item']} wasn't waiting any more"
    if x["hash"] != h.get("hash"):
        return f"{h['item']} changed after it was tapped"
    if x["cls"] != h.get("cls"):
        return "the item's tap class changed"
    if x["never"]:
        return x["never"]
    return None


def take_run_token(argv, nonce):
    """For crewlib.owner_gate: the tap being carried out with this token, or None. Used up either way.
    Good for exactly the command line it was written for, for a short while, for a hold that is
    running, and only for the commands a tap may stand in for."""
    if not re.fullmatch(r"[0-9a-f]{32}", nonce or ""):
        return None
    path = RUN / f"{nonce}.json"
    tok = load_json(path, None)
    path.unlink(missing_ok=True)
    if not isinstance(tok, dict) or tok.get("args") != list(argv) or now_ms() - (tok.get("at") or 0) > RUN_TTL * 1000:
        return None
    if not any(tuple(argv[:len(p)]) == p for p in TAPPABLE):
        return None
    h = load_json(HOLDS / f"{tok.get('hold')}.json", None)
    if not isinstance(h, dict) or h.get("status") != "running" or h.get("helper") != tok.get("helper"):
        return None
    # The token is only as good as the tap behind it: that helper is on with this class of tap
    # switched on (so with taps off, the default, a tap token opens nothing at all), and the command
    # is the one this hold's item and choice come to, not merely the one the token file names.
    try:
        if h.get("cls") not in CLASSES or _may(h["helper"], h["cls"]) or list(argv) != _args(h):
            return None
    except (TapError, KeyError):
        return None
    return {"helper": h["helper"], "relayed": h.get("relayed") or "", "hold": h["id"], "label": label(h["helper"]),
            "kind": h["kind"], "item": h["item"], "hash": h.get("hash"), "cls": h["cls"]}
