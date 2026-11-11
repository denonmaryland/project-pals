"""Topic areas: a pal's topics filed under a handful of names (T105, DeNon 2026-11-10).

Topics get split for parallel work, so one pal ends up with dozens that belong to a few areas
("Releases", "Sidebar and look", …). An area is a name a pal's topics can be filed under: one level,
per pal, a topic in one area or none. It is NEVER part of an address: Pal#topic stays the address,
so messages, rooms, Desk cards, worktrees, sleep and wake don't know areas exist.

  data/crew-areas.json          written only by `pal topic area …`, under a lock
  {"version": 1,
   "pals": {"<pal name>": {"areas": [{"id": "a-6hex", "name": "…"}],      in the order shown
                           "topics": {"<topic name>": "a-6hex"}}}}        a topic not listed is unsorted

Topics are filed by name (as Pal#topic names them, without the "#"), matched the way pal names are
(case, "-" and "_" don't matter). A topic that is renamed keeps its area only if `renamed` is called
for it (the app does that when it sees a tab's name change).
"""
import re

from crewlib import DATA, CrewError, load_json, save_json, locked, new_id, norm

FILE = DATA / "crew-areas.json"
NAME_MAX = 32
CAP = 16   # areas per pal


class AreaError(CrewError):
    pass


def _words(s):
    return " ".join(str(s or "").split())


def _topic(s):
    return _words(s).lstrip("#").strip()


def _clean(raw):
    """The file as a store we can trust: unknown shapes and dangling ids are dropped, never fixed on disk."""
    raw = raw if isinstance(raw, dict) else {}
    pals = {}
    for pal, rec in (raw.get("pals") or {}).items() if isinstance(raw.get("pals"), dict) else []:
        if not isinstance(rec, dict) or not _words(pal):
            continue
        areas, seen, names = [], set(), set()
        for a in rec.get("areas") or []:
            if not isinstance(a, dict):
                continue
            aid, name = str(a.get("id") or ""), _words(a.get("name"))[:NAME_MAX]
            if not re.fullmatch(r"a-[0-9a-z]{4,16}", aid) or aid in seen or not name or norm(name) in names:
                continue
            seen.add(aid)
            names.add(norm(name))
            areas.append({"id": aid, "name": name})
        topics = {}
        if isinstance(rec.get("topics"), dict):
            for t, aid in rec["topics"].items():
                if aid in seen and _topic(t):
                    topics[_topic(t)] = aid
        if areas:
            pals[_words(pal)] = {"areas": areas[:CAP], "topics": topics}
    return {"version": 1, "pals": pals}


def load():
    return _clean(load_json(FILE, {}))


def _pal_key(store, pal):
    want = norm(pal)
    return next((k for k in store["pals"] if norm(k) == want), None)


def of_pal(pal, store=None):
    """A pal's areas and filings: {"areas": [...], "topics": {...}} (empty when it has none)."""
    store = load() if store is None else store
    k = _pal_key(store, pal)
    return store["pals"][k] if k else {"areas": [], "topics": {}}


def _find(rec, spec):
    """An area of this pal by id, by name, or by the start of its name. None when there is none."""
    want = norm(_words(spec))
    if not want:
        return None
    for a in rec["areas"]:
        if a["id"] == spec or norm(a["name"]) == want:
            return a
    hits = [a for a in rec["areas"] if norm(a["name"]).startswith(want)]
    if len(hits) > 1:
        raise AreaError(f"{spec} matches {len(hits)} areas ({', '.join(a['name'] for a in hits)}); give more of the name")
    return hits[0] if hits else None


def area_of(pal, topic, store=None):
    """The area ({"id", "name"}) a topic is filed under, or None (unsorted)."""
    rec = of_pal(pal, store)
    want = norm(_topic(topic))
    aid = next((v for k, v in rec["topics"].items() if norm(k) == want), None)
    return next((a for a in rec["areas"] if a["id"] == aid), None)


def grouped(pal, topics, store=None):
    """A pal's topics by area, for printing: [(area name | None, [topic, …])], areas in their order
    (empty ones left out), then the unsorted ones under None. `topics`: names, in the order to keep."""
    rec = of_pal(pal, store)
    by = {a["id"]: [] for a in rec["areas"]}
    loose = []
    filed = {norm(k): v for k, v in rec["topics"].items()}
    for t in topics:
        aid = filed.get(norm(_topic(t)))
        (by[aid] if aid in by else loose).append(t)
    out = [(a["name"], by[a["id"]]) for a in rec["areas"] if by[a["id"]]]
    return out + ([(None, loose)] if loose or not out else [])


def _edit(pal, fn):
    """Read, change and write one pal's record under the lock. `fn(rec)` returns what to report."""
    pal = _words(pal)
    if not pal:
        raise AreaError("which pal?")
    with locked("crew-areas"):
        store = load()
        k = _pal_key(store, pal) or pal
        rec = store["pals"].get(k) or {"areas": [], "topics": {}}
        out = fn(rec)
        if rec["areas"]:
            store["pals"][k] = rec
        else:
            store["pals"].pop(k, None)   # no areas left: no record (its filings went with them)
        save_json(FILE, store)
        return out


def _make(rec, name):
    name = _words(name)[:NAME_MAX]
    if not name:
        raise AreaError("an area needs a name")
    if name.lower() in ("none", "unsorted", "live", "shelf"):
        raise AreaError(f'"{name}" is taken: it names a view, not an area')
    if len(rec["areas"]) >= CAP:
        raise AreaError(f"a pal can have {CAP} areas; remove or rename one first")
    a = {"id": new_id("a-"), "name": name}
    rec["areas"].append(a)
    return a


def add(pal, name):
    """Make an area (or return the one with that exact name)."""
    def fn(rec):
        want = norm(_words(name))
        return next((a for a in rec["areas"] if norm(a["name"]) == want), None) or _make(rec, name)
    return _edit(pal, fn)


def file(pal, topic, area):
    """File a topic under an area (made if it doesn't exist), or with area "none": unsorted again.
    Returns the area, or None."""
    topic = _topic(topic)
    if not topic:
        raise AreaError("which topic?")

    def fn(rec):
        want = norm(topic)
        for k in [k for k in rec["topics"] if norm(k) == want]:
            del rec["topics"][k]
        if norm(_words(area)) in ("", "none", "unsorted"):
            return None
        a = _find(rec, area) or _make(rec, area)
        rec["topics"][topic] = a["id"]
        return a
    return _edit(pal, fn)


def remove(pal, area):
    """Delete an area. Its topics are unsorted again; nothing else happens to them. Returns how many."""
    def fn(rec):
        a = _find(rec, area)
        if not a:
            raise AreaError(f"no area called {area}")
        rec["areas"].remove(a)
        gone = [k for k, v in rec["topics"].items() if v == a["id"]]
        for k in gone:
            del rec["topics"][k]
        return {"area": a, "topics": len(gone)}
    return _edit(pal, fn)


def rename(pal, area, new):
    def fn(rec):
        a = _find(rec, area)
        if not a:
            raise AreaError(f"no area called {area}")
        name = _words(new)[:NAME_MAX]
        if not name:
            raise AreaError("an area needs a name")
        if any(x is not a and norm(x["name"]) == norm(name) for x in rec["areas"]):
            raise AreaError(f"there is already an area called {name}")
        a["name"] = name
        return a
    return _edit(pal, fn)


def renamed(pal, old, new):
    """A topic was renamed: its filing follows. True when there was one."""
    def fn(rec):
        want = norm(_topic(old))
        hit = next((k for k in rec["topics"] if norm(k) == want), None)
        if not hit or not _topic(new):
            return False
        rec["topics"][_topic(new)] = rec["topics"].pop(hit)
        return True
    return _edit(pal, fn)


def sort_all(pal, plan):
    """File many topics at once: `plan` is {area name: [topic, …]}. Areas are made as needed, in the
    plan's order; a topic named twice ends in the last one. Returns {area name: count}."""
    def fn(rec):
        done = {}
        for name, topics in plan.items():
            a = _find(rec, name) or _make(rec, name)
            for t in topics:
                t = _topic(t)
                if not t:
                    continue
                for k in [k for k in rec["topics"] if norm(k) == norm(t)]:
                    del rec["topics"][k]
                rec["topics"][t] = a["id"]
            done[a["name"]] = len([1 for v in rec["topics"].values() if v == a["id"]])
        return done
    return _edit(pal, fn)
