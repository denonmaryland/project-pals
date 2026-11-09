"""The head pal's Home (Orca home): what the head pal keeps current for the owner, so coming back after
working in parallel isn't a terminal scroll (RECIPE.md, "Home").

  data/crew-home/home.json     written only by `pal home …`, under a lock, atomically
  data/crew-installs.jsonl     one line per install (install.sh): when, version, the build's hash

home.json:
  {"version": 1,
   "seen": ms,                      the owner's "Mark all seen" (Since you last looked starts here)
   "items": [{"id": "h-6hex",
              "kind": "ask" | "login" | "link" | "note" | "deploy" | "later",
              "status": "open" | "answered" | "done" | "parked" | "dropped",
              "title", "body", "options": [...] (ask), "does": [...] (what each option does),
              "recommend": an option, "why": the asker's reason, "links": [...], "images": [...]
              (paths under data/crew-attachments), "command" (login), "url" (link),
              "topic": "Pal#topic" (its button opens it), "by": stamped by pal home, "at": ms,
              "answer", "answered_at", "result", "closed_at", "parked_at"}],
   "release": {"next": "0.4.1", "note": "held for your OK", "queued": [{"id": "r-6hex", "text", "at", "by"}]},
   "recs": {"a-… | c-… | h-…": {"option", "why", "by", "at"}}}   a recommendation for an approval, a
                                    Desk card or an ask, from whoever asked (Home's review shows it)

Anyone may add (a pal, the owner, a shell); `by` is who we say it was, never an argument. Only the
owner answers an ask or marks Home seen (a click in Project Pals: crewlib.owner_gate).
"""
import re
import time

from crewlib import DATA, CrewError, load_json, save_json, locked, new_id, now_ms

DIR = DATA / "crew-home"
FILE = DIR / "home.json"
INSTALLS = DATA / "crew-installs.jsonl"

KINDS = ("ask", "login", "link", "note", "deploy", "later")
OPEN = ("open",)
CLOSED = ("answered", "done", "dropped")
TITLE_MAX = 160
BODY_MAX = 2048
OPTION_MAX = 40
OPTIONS_MAX = 4
LINKS_MAX = 4
IMAGES_MAX = 4
WHY_MAX = 240
# What a recommendation can name for things that aren't asks (an approval, a Desk card).
REC_OPTIONS = {"a-": ("approve", "decline"), "c-": ("done", "open")}
OPEN_CAP = 200
QUEUE_CAP = 60
KEEP_DAYS = 14   # answered / done / dropped items are kept this long, then go


class HomeError(CrewError):
    pass


def empty():
    return {"version": 1, "seen": 0, "items": [], "release": {"next": None, "note": None, "queued": []}, "recs": {}}


def load():
    h = load_json(FILE, None)
    if not isinstance(h, dict):
        return empty()
    out = empty()
    out["seen"] = int(h.get("seen") or 0)
    out["items"] = [x for x in h.get("items") or [] if isinstance(x, dict) and x.get("id")]
    rel = h.get("release") if isinstance(h.get("release"), dict) else {}
    out["release"] = {"next": rel.get("next"), "note": rel.get("note"),
                      "queued": [q for q in rel.get("queued") or [] if isinstance(q, dict) and q.get("id")]}
    recs = h.get("recs") if isinstance(h.get("recs"), dict) else {}
    out["recs"] = {k: v for k, v in recs.items() if isinstance(v, dict) and v.get("option")}
    return out


def _tidy(h, now=None):
    now = now or now_ms()
    keep = now - KEEP_DAYS * 86400 * 1000
    h["items"] = [x for x in h["items"] if x.get("status") not in CLOSED or (x.get("closed_at") or x.get("at") or 0) >= keep]
    h["recs"] = {k: v for k, v in (h.get("recs") or {}).items() if (v.get("at") or 0) >= keep}
    return h


def _save(h):
    save_json(FILE, _tidy(h))


def _one_line(s, n, what):
    s = " ".join(str(s or "").split())
    if not s:
        raise HomeError(f"{what} is empty")
    return s if len(s) <= n else s[: n - 1] + "…"


def _body(s):
    s = str(s or "").strip()
    if len(s.encode()) > BODY_MAX:
        raise HomeError(f"the body is over {BODY_MAX // 1024} KB; put the rest in a file and link it")
    return s


def _find(h, iid):
    iid = (iid or "").strip()
    for x in h["items"]:
        if x["id"] == iid:
            return x
    # A unique prefix works too ("h-3f1").
    hits = [x for x in h["items"] if iid and x["id"].startswith(iid)]
    if len(hits) == 1:
        return hits[0]
    raise HomeError(f"no Home item {iid}" if not hits else f"{iid} matches {len(hits)} items; give more of the id")


def add(kind, title, *, by, body="", options=(), command=None, url=None, topic=None, status="open",
        does=(), recommend=None, why=None, links=(), images=()):
    if kind not in KINDS:
        raise HomeError(f"kind is one of {', '.join(KINDS)}")
    item = {"id": new_id("h-"), "kind": kind, "status": status, "title": _one_line(title, TITLE_MAX, "the title"),
            "by": by, "at": now_ms()}
    if body:
        item["body"] = _body(body)
    opts = [_one_line(o, OPTION_MAX, "an option") for o in options or ()]
    if opts:
        if kind != "ask":
            raise HomeError("only an ask has options")
        if len(opts) > OPTIONS_MAX:
            raise HomeError(f"at most {OPTIONS_MAX} options (each is a button)")
        if len(set(o.lower() for o in opts)) != len(opts):
            raise HomeError("two options are the same")
        item["options"] = opts
        what = [" ".join(str(x or "").split())[:120] for x in does or ()]
        if len(what) > len(opts):
            raise HomeError("each --does goes after the --option it explains")
        if any(what):
            item["does"] = what + [""] * (len(opts) - len(what))
    elif does:
        raise HomeError("--does explains an --option")
    if recommend is not None:
        if kind != "ask" or not opts:
            raise HomeError("--recommend names one of the ask's --option values")
        hit = [o for o in opts if o.lower() == str(recommend).strip().lower()]
        if not hit:
            raise HomeError(f"--recommend {recommend!r} isn't one of the options ({', '.join(opts)})")
        item["recommend"] = hit[0]
        if why:
            item["why"] = _one_line(why, WHY_MAX, "the why")
    elif why:
        raise HomeError("--why goes with --recommend")
    ls = [str(u).strip() for u in links or () if str(u).strip()]
    if len(ls) > LINKS_MAX:
        raise HomeError(f"at most {LINKS_MAX} links")
    if any(" " in u for u in ls):
        raise HomeError("a link is a URL or a path, without spaces")
    if ls:
        item["links"] = ls
    if images:
        if len(images) > IMAGES_MAX:
            raise HomeError(f"at most {IMAGES_MAX} images")
        item["images"] = list(images)
    if kind == "login":
        if not command:
            raise HomeError("a login needs the command to run (pal home login \"! npx vercel login\" --topic Pal#topic)")
        item["command"] = _one_line(command, 200, "the command")
    if kind == "link":
        u = (url or "").strip()
        if not u or " " in u:
            raise HomeError("a link needs a URL or a path")
        item["url"] = u
    if topic:
        item["topic"] = topic
    if status == "parked":
        item["parked_at"] = item["at"]
    with locked("home"):
        h = load()
        if status == "open" and sum(1 for x in h["items"] if x.get("status") == "open") >= OPEN_CAP:
            raise HomeError(f"Home has {OPEN_CAP} open items; close some first (pal home done ID)")
        h["items"].append(item)
        _save(h)
    return item


def close(iid, status, *, by, result=None):
    if status not in ("done", "dropped"):
        raise HomeError("close as done or dropped")
    with locked("home"):
        h = load()
        x = _find(h, iid)
        if x.get("status") in CLOSED:
            raise HomeError(f"{x['id']} is {x['status']} already")
        x["status"], x["closed_at"], x["closed_by"] = status, now_ms(), by
        if result:
            x["result"] = _one_line(result, 300, "the result")
        _save(h)
    return x


def park(iid, *, by):
    with locked("home"):
        h = load()
        x = _find(h, iid)
        if x.get("status") != "open":
            raise HomeError(f"{x['id']} is {x['status']}; only an open item can be parked")
        x["status"], x["parked_at"], x["parked_by"] = "parked", now_ms(), by
        _save(h)
    return x


def unpark(iid, *, by):
    with locked("home"):
        h = load()
        x = _find(h, iid)
        if x.get("status") != "parked":
            raise HomeError(f"{x['id']} isn't parked")
        x["status"] = "open"
        x.pop("parked_at", None)
        x["unparked_by"] = by
        _save(h)
    return x


def answer(iid, text, *, by):
    """The owner's answer to an ask (the caller has checked the click)."""
    text = _one_line(text, 500, "the answer")
    with locked("home"):
        h = load()
        x = _find(h, iid)
        if x.get("kind") != "ask":
            raise HomeError(f"{x['id']} is a {x.get('kind')}, not a question")
        if x.get("status") not in ("open", "parked"):
            raise HomeError(f"{x['id']} is {x['status']} already")
        x["status"], x["answer"], x["answered_at"], x["closed_at"], x["closed_by"] = "answered", text, now_ms(), now_ms(), by
        _save(h)
    return x


def recommend(target, option, *, by, why=None):
    """The asker's pick for an approval (approve / decline), a Desk card (done / open) or an ask (one
    of its options): Home's review marks it Recommended and Enter takes it."""
    target = (target or "").strip()
    option = " ".join(str(option or "").split())
    if not option:
        raise HomeError("recommend which option?")
    rec = {"option": option, "by": by, "at": now_ms()}
    if why:
        rec["why"] = _one_line(why, WHY_MAX, "the why")
    with locked("home"):
        h = load()
        if target.startswith("h-"):
            x = _find(h, target)
            if x.get("kind") != "ask" or not x.get("options"):
                raise HomeError(f"{x['id']} has no options to recommend")
            hit = [o for o in x["options"] if o.lower() == option.lower()]
            if not hit:
                raise HomeError(f"{option!r} isn't one of {x['id']}'s options ({', '.join(x['options'])})")
            x["recommend"] = hit[0]
            x["why"] = rec.get("why")
            if not x["why"]:
                x.pop("why")
        else:
            kinds = REC_OPTIONS.get(target[:2])
            if not kinds or not re.fullmatch(r"[ac]-[0-9a-f]{6}", target):
                raise HomeError("recommend for an approval (a-…), a Desk card (c-…) or an ask (h-…)")
            if option.lower() not in kinds:
                raise HomeError(f"for {target} recommend one of: {', '.join(kinds)}")
            rec["option"] = option.lower()
            h["recs"][target] = rec
        _save(h)
    return rec


def mark_seen(at=None):
    with locked("home"):
        h = load()
        h["seen"] = int(at or now_ms())
        _save(h)
    return h["seen"]


def queue(text, *, by, release=None, note=None):
    with locked("home"):
        h = load()
        rel = h["release"]
        if release:
            rel["next"] = _one_line(release, 20, "the release")
        if note is not None:
            rel["note"] = _one_line(note, 120, "the note") if note.strip() else None
        q = None
        if text:
            if len(rel["queued"]) >= QUEUE_CAP:
                raise HomeError(f"{QUEUE_CAP} things are queued already; unqueue some (pal home unqueue ID)")
            q = {"id": new_id("r-"), "text": _one_line(text, TITLE_MAX, "what's queued"), "at": now_ms(), "by": by}
            rel["queued"].append(q)
        _save(h)
    return q, rel


def unqueue(qid):
    with locked("home"):
        h = load()
        q = h["release"]["queued"]
        hits = [x for x in q if x["id"] == qid or (qid and x["id"].startswith(qid))]
        if len(hits) != 1:
            raise HomeError(f"no queued item {qid}" if not hits else f"{qid} matches {len(hits)}; give more of the id")
        h["release"]["queued"] = [x for x in q if x is not hits[0]]
        _save(h)
    return hits[0]


def installs(n=20):
    """The last n installs, newest first."""
    out = []
    try:
        lines = INSTALLS.read_text().splitlines()[-n:]
    except OSError:
        return out
    import json
    for line in reversed(lines):
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def ago(ms):
    s = max(0, time.time() - (ms or 0) / 1000)
    if s < 60:
        return "now"
    if s < 3600:
        return f"{int(s // 60)}m"
    if s < 86400:
        return f"{int(s // 3600)}h {int(s % 3600 // 60)}m"
    return f"{int(s // 86400)}d"


def line(x):
    what = {"ask": "ask", "login": "login", "link": "link", "note": "note", "deploy": "deploy", "later": "later"}[x.get("kind", "note")]
    bits = [x["id"], x.get("status", "open"), what, x.get("title", "")]
    if x.get("options"):
        bits.append("[" + " | ".join(o + (" ✓" if o == x.get("recommend") else "") for o in x["options"]) + "]")
    if x.get("command"):
        bits.append(x["command"])
    if x.get("url"):
        bits.append(x["url"])
    if x.get("topic"):
        bits.append(f"in {x['topic']}")
    if x.get("answer"):
        bits.append(f"→ {x['answer']}")
    bits.append(f"· {x.get('by', '?')} · {ago(x.get('at'))}")
    return "  ".join(b for b in bits if b)
