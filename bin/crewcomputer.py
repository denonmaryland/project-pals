"""A pal's Computer (crew-boards/pal-computer/design.md, DeNon's pick B · Desktop): the data its
desktop and apps show, and `pal computer` prints. Everything here is a VIEW over files the crew
already keeps; the Computer stores nothing of its own. The only new data it relies on is a task's
optional `due` (crewtasks) and the memory folder's `pages/`.

  today     the Today widget: each topic now, next up, the desk count, the mission's focus
  todo      its tasks (doing, next, blocked, done today) and its open desk cards, state first
  calendar  a week: past work blocks (crew-feed "working" → "finished"/"blocked"), tasks done,
            routine runs; future routine runs and due dates
  journal   notebook days, newest first, with the week's hiccups and lessons
  pages     the pal's freeform pages (crew-memory/<pal>/pages/*.md)

The builders take what they read as arguments, so tests drive them with plain data."""
import datetime
import json
import re
import time
from pathlib import Path

from crewlib import DATA, FEED, memory_dir, norm

OPEN = ("open", "claimed", "blocked")
DAY_MS = 86400000


def _mine(spec, name):
    """Does a task field ("Pal", "Pal#topic") point at this pal?"""
    return bool(spec) and norm(str(spec).split("#")[0]) == norm(name)


def _topic(spec):
    return str(spec).split("#", 1)[1] if spec and "#" in str(spec) else None


def task_row(t, today=None):
    import crewtasks
    who = t.get("claimed_by") or t.get("assignee") or ""
    return {"id": t["id"], "title": t["title"], "status": t["status"], "topic": _topic(who),
            "due": t.get("due"), "due_label": crewtasks.due_label(t.get("due"), today) if t.get("due") else "",
            "by": t.get("by"), "deps": t.get("deps") or [], "updated": t.get("updated")}


def _due_key(t):
    return t.get("due") or "9999"


def todo(name, tasks, cards, now_ms=None, today=None):
    """{doing, next, blocked, done_today, cards}: the pal's tasks by state, and its open desk cards."""
    now_ms = now_ms or int(time.time() * 1000)
    today = today or datetime.date.today()
    start = int(datetime.datetime.combine(today, datetime.time()).timestamp() * 1000)
    mine = [t for t in tasks if _mine(t.get("claimed_by"), name) or (not t.get("claimed_by") and _mine(t.get("assignee"), name))]
    rows = lambda pick: [task_row(t, today) for t in sorted(pick, key=lambda t: (_due_key(t), t.get("created") or 0))]
    return {
        "pal": name,
        "doing": rows([t for t in mine if t["status"] == "claimed"]),
        "next": rows([t for t in mine if t["status"] == "open"]),
        "blocked": rows([t for t in mine if t["status"] == "blocked"]),
        "done_today": rows([t for t in mine if t["status"] == "done" and (t.get("updated") or 0) >= start]),
        "cards": [{"id": c.get("id"), "kind": c.get("kind"), "status": c.get("status"), "title": c.get("title"),
                   "from": c.get("from"), "to": c.get("to"), "task": c.get("task")}
                  for c in cards if c.get("kind") != "task"],   # a task's card is the task itself
    }


def topics_now(space, live, tasks, asleep=()):
    """Each topic of the pal: its status (working, blocked, done, idle, asleep, shell) and its task.
    `asleep`: the terminals pal sleep put to sleep (crewsleep's crew-slept/<terminal>.json)."""
    out = []
    for tab in space.get("tabs", []):
        name = tab["name"][1:] if tab["name"].startswith("#") else tab["name"]
        terms = [x for x in tab.get("terminals", []) if x]
        agent = next((x for x in terms if x.get("app")), None) or (terms[0] if terms else None)
        st = (live.get((agent or {}).get("terminal")) or {}).get("status")
        addr = (agent or {}).get("terminal")
        state = "asleep" if addr in asleep else (st or ("idle" if (agent or {}).get("app") else "shell"))
        task = next((t for t in tasks if t["status"] in OPEN and str(t.get("claimed_by") or t.get("assignee") or "").lower()
                     == f"{space['name']}#{name}".lower()), None)
        out.append({"topic": name, "state": state, "terminal": (agent or {}).get("terminal"),
                    "task": {"id": task["id"], "title": task["title"]} if task else None})
    order = {"working": 0, "blocked": 1, "done": 2, "idle": 3, "shell": 4, "asleep": 5}
    return sorted(out, key=lambda r: order.get(r["state"], 3))


def today_view(name, space, live, tasks, cards, mission, asleep=(), now_ms=None, today=None):
    td = todo(name, tasks, cards, now_ms, today)
    nxt = (td["doing"] + td["next"])[:3]
    return {"pal": name, "topics": topics_now(space, live, tasks, asleep), "next": nxt,
            "desk": {"open": len(td["cards"]), "needs_you": sum(1 for c in td["cards"] if c["status"] == "needs you")},
            "due_today": [r for r in td["doing"] + td["next"] + td["blocked"] if (r["due"] or "")[:10] == (today or datetime.date.today()).isoformat()],
            "focus": (mission or {}).get("focus") or "", "statement": (mission or {}).get("statement") or "",
            "goals": (mission or {}).get("goals") or []}


def work_blocks(feed, name, start_ms, end_ms, now_ms=None):
    """Past work as blocks: a topic's "working" event to its next "finished"/"blocked" (or now, if
    it's still working). A "finished" with no start on record becomes a 10-minute block ending
    there, so older feeds still show something."""
    now_ms = now_ms or int(time.time() * 1000)
    open_at, out = {}, []
    for e in sorted((e for e in feed if norm(e.get("bot") or "") == norm(name)), key=lambda e: e.get("at", 0)):
        k = e.get("channel") or ""
        if e.get("kind") == "working":
            open_at.setdefault(k, e["at"])
        elif e.get("kind") in ("finished", "blocked"):
            s = open_at.pop(k, None)
            out.append({"topic": k, "start": s or e["at"] - 600000, "end": e["at"], "how": e["kind"], "guessed": s is None})
    out += [{"topic": k, "start": s, "end": now_ms, "how": "working", "guessed": False} for k, s in open_at.items()]
    return [b for b in out if b["end"] > start_ms and b["start"] < end_ms]


def calendar(name, feed, tasks, routines, start, days=7, now_ms=None, next_runs=None):
    """A range of days from `start` (a date): past blocks, tasks done, routine runs; due dates and
    future routine runs. `next_runs` maps a routine id to its future run times (epoch ms)."""
    now_ms = now_ms or int(time.time() * 1000)
    s_ms = int(datetime.datetime.combine(start, datetime.time()).timestamp() * 1000)
    e_ms = s_ms + days * DAY_MS
    events = [{"kind": "work", **b} for b in work_blocks(feed, name, s_ms, e_ms, now_ms)]
    for e in feed:
        at = e.get("at", 0)
        if not s_ms <= at < e_ms:
            continue
        if e.get("kind") == "task" and e.get("status") == "done":
            t = next((t for t in tasks if t["id"] == e.get("task")), None)
            if t and (_mine(t.get("claimed_by"), name) or _mine(t.get("assignee"), name)):
                events.append({"kind": "done", "at": at, "task": e.get("task"), "title": e.get("title")})
        elif e.get("kind") == "routine" and norm(e.get("bot") or "") == norm(name):
            events.append({"kind": "routine", "at": at, "routine": e.get("routine"), "status": e.get("status"), "past": True})
    for r in routines:
        if norm(r.get("bot") or "") != norm(name):
            continue
        for at in (next_runs or {}).get(r["id"], []):
            if max(now_ms, s_ms) <= at < e_ms:
                events.append({"kind": "routine", "at": at, "routine": r["id"], "name": r.get("name"), "past": False})
    for t in tasks:
        if t.get("due") and t["status"] in OPEN and (_mine(t.get("claimed_by"), name) or _mine(t.get("assignee"), name)):
            d = datetime.date.fromisoformat(t["due"][:10])
            if start <= d < start + datetime.timedelta(days=days):
                events.append({"kind": "due", "day": d.isoformat(), "time": t["due"][11:16] or None, "task": t["id"], "title": t["title"]})
    return {"pal": name, "start": start.isoformat(), "days": days, "events": events}


def routine_runs(r, start_ms, end_ms, limit=40):
    """Future run times of one routine inside [start, end) (epoch ms), from crewroutines.next_run."""
    import crewroutines
    out, t = [], max(start_ms, int(time.time() * 1000)) / 1000
    while len(out) < limit:
        nxt = crewroutines.next_run({**r, "last": {"at": t}}, t)
        if not nxt or nxt * 1000 >= end_ms:
            break
        out.append(int(nxt * 1000))
        t = nxt + 60
    return out


PAGE_NAME = re.compile(r"^[^/\\\x00]{1,80}\.md$")


def pages_dir(name):
    return memory_dir(name) / "pages"


def pages(name):
    d = pages_dir(name)
    if not d.exists():
        return []
    return [{"name": p.stem, "file": str(p), "updated": int(p.stat().st_mtime * 1000)}
            for p in sorted(d.glob("*.md"), key=lambda p: -p.stat().st_mtime)]


def page_path(name, title):
    """Where a page called `title` lives; refuses names that would leave the pages folder."""
    from crewlib import CrewError
    base = " ".join(str(title).split())
    fname = base + ".md"
    if not base or base.startswith(".") or base.endswith(".") or not PAGE_NAME.match(fname):
        raise CrewError(f"a page name is plain text up to 80 characters, without / or a leading dot: '{title}'")
    return pages_dir(name) / fname


def read_feed(days=8):
    """The feed's events from the last `days` days (it's append-only, newest last)."""
    if not FEED.exists():
        return []
    since = int(time.time() * 1000) - days * DAY_MS
    out = []
    for line in FEED.read_text().splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("at", 0) >= since:
            out.append(e)
    return out
