"""Factories: several crews in one Project Pals (design: crew-boards/chief/design.md, Part 2).

A factory is a named set of pals with a foreman, a template (its org shape) and its own Home.
Today's crew is the DEFAULT factory, and it needs no file: with no data/crew-factories.json, or
one that names no other factory, there is one factory and nothing looks or behaves differently.

  data/crew-factories.json     written only by `pal factory …` (the owner's click), under a lock
  {"version": 1,
   "current": "f-6hex" | "default",        the factory the app shows
   "default_name": "…",                    the default factory's name (optional)
   "factories": [{"id": "f-6hex", "name", "template": "project-crew" | "platform-lanes",
                  "foreman": a pal's name | "", "foreman_topic": "ops", "color": "#RRGGBB",
                  "created": ms}],
   "pals": {"<pal name>": "f-6hex"}}       a pal not listed here is in the default factory

The head pal is the default factory's foreman and always stays in it. A Home item belongs to the
factory of the pal it's about (its "topic", else who added it); see factory_of_item.
"""
import re

from crewlib import DATA, CrewError, load_json, save_json, locked, new_id, now_ms, settings, norm

FILE = DATA / "crew-factories.json"
DEFAULT = "default"
NAME_MAX = 40
CAP = 12   # factories besides the default
# Each template's Home panels, in order. Platform lanes gets its own panels in phase 2; until
# then a lanes factory shows the Project crew Home.
TEMPLATES = {
    "project-crew": {"name": "Project crew", "pal_word": "pal",
                     "home": ["needs-you", "since", "progress", "releases", "parked"]},
    "platform-lanes": {"name": "Platform lanes", "pal_word": "lane",
                       "home": ["needs-you", "since", "progress", "releases", "parked"]},
}
COLORS = ("#E2935A", "#8F9CF7", "#D36FA8", "#C9B458", "#5FA8E2", "#9BC35A")
DEFAULT_COLOR = "#5FB8A6"


class FactoryError(CrewError):
    pass


def _clean(raw):
    """The file as a store we can trust: unknown shapes and dangling ids are dropped, never fixed on disk."""
    raw = raw if isinstance(raw, dict) else {}
    facs, seen = [], set()
    for f in raw.get("factories") or []:
        if not isinstance(f, dict):
            continue
        fid, name = str(f.get("id") or ""), " ".join(str(f.get("name") or "").split())
        if not re.fullmatch(r"f-[0-9a-z]{4,16}", fid) or fid in seen or not name:
            continue
        seen.add(fid)
        facs.append({"id": fid, "name": name[:NAME_MAX],
                     "template": f.get("template") if f.get("template") in TEMPLATES else "project-crew",
                     "foreman": str(f.get("foreman") or ""), "foreman_topic": str(f.get("foreman_topic") or "ops").lstrip("#"),
                     "color": f.get("color") if re.fullmatch(r"#[0-9A-Fa-f]{6}", str(f.get("color") or "")) else COLORS[len(facs) % len(COLORS)],
                     "created": f.get("created") or 0})
    pals = {str(k): v for k, v in (raw.get("pals") or {}).items() if v in seen} if isinstance(raw.get("pals"), dict) else {}
    cur = raw.get("current")
    return {"version": 1, "current": cur if cur in seen else DEFAULT,
            "default_name": " ".join(str(raw.get("default_name") or "").split())[:NAME_MAX],
            "factories": facs, "pals": pals}


def load():
    return _clean(load_json(FILE, {}))


def _default(store):
    s = settings()
    return {"id": DEFAULT, "name": store["default_name"] or f"{s['owner']}'s crew", "template": "project-crew",
            "foreman": s["head"], "foreman_topic": (s.get("head_topic") or "").strip().lstrip("#"),
            "color": DEFAULT_COLOR, "created": 0, "default": True}


def factories(store=None):
    """Every factory, the default first."""
    store = load() if store is None else store
    return [_default(store)] + store["factories"]


def several(store=None):
    return len((load() if store is None else store)["factories"]) > 0


def current(store=None):
    store = load() if store is None else store
    return store["current"]


def get(spec, store=None):
    """A factory by id, by name, or by the start of its name. "default" is always the default one."""
    store = load() if store is None else store
    want = norm(str(spec or ""))
    if not want:
        raise FactoryError("which factory? (pal factory ls)")
    facs = factories(store)
    for f in facs:
        if f["id"] == spec or norm(f["name"]) == want:
            return f
    hits = [f for f in facs if norm(f["name"]).startswith(want)]
    if len(hits) == 1:
        return hits[0]
    raise FactoryError(f"no factory called {spec}" if not hits else f"{spec} matches {len(hits)} factories; give more of the name")


def _key(store, pal):
    """The pals-map key for this pal's name, whatever its case."""
    want = norm(pal)
    return next((k for k in store["pals"] if norm(k) == want), None)


def factory_of(pal, store=None):
    """The id of the factory a pal (by name) is in. Unknown pals, and the head pal, are in the default one."""
    store = load() if store is None else store
    if not pal or not store["factories"] or norm(pal) == norm(settings()["head"]):
        return DEFAULT
    k = _key(store, pal)
    return store["pals"][k] if k else DEFAULT


def factory_of_where(where, store=None):
    """The same for a "Pal#topic" address."""
    return factory_of(str(where or "").split("#")[0].strip(), store)


def factory_of_item(item, store=None):
    """A Home item's factory: the one stamped on it when it was added, if that factory still exists;
    else the factory of the pal it's about, else of who added it."""
    store = load() if store is None else store
    if not store["factories"]:
        return DEFAULT
    ids = {f["id"] for f in store["factories"]} | {DEFAULT}
    if item.get("factory") in ids:
        return item["factory"]
    return factory_of_where(item.get("topic") or item.get("by"), store)


def pals_of(fid, names, store=None):
    """Which of `names` (the pals that exist) are in this factory."""
    store = load() if store is None else store
    return [n for n in names if factory_of(n, store) == fid]


def view(store=None):
    """What the app and --json show: the factories with the current one marked, and who is where."""
    store = load() if store is None else store
    return {"current": store["current"], "several": several(store), "factories": factories(store), "pals": store["pals"],
            "templates": {k: v["name"] for k, v in TEMPLATES.items()}}


def _name(name, store, but=None):
    name = " ".join(str(name or "").split())
    if not name:
        raise FactoryError("a factory needs a name")
    if len(name) > NAME_MAX:
        raise FactoryError(f"keep the name to {NAME_MAX} characters")
    if name.lower() == DEFAULT or any(norm(f["name"]) == norm(name) and f["id"] != but for f in factories(store)):
        raise FactoryError(f"there's already a factory called {name}")
    return name


def _save(store):
    save_json(FILE, {k: v for k, v in store.items() if v or k in ("version", "factories")})


def new(name, template="project-crew", foreman=None, foreman_topic=None):
    if template not in TEMPLATES:
        raise FactoryError(f"template is one of {', '.join(TEMPLATES)}")
    with locked("factories"):
        store = load()
        if len(store["factories"]) >= CAP:
            raise FactoryError(f"that's {CAP} factories already; remove one first")
        used = {f["color"] for f in store["factories"]}
        f = {"id": new_id("f-"), "name": _name(name, store), "template": template, "foreman": "",
             "foreman_topic": str(foreman_topic or "ops").lstrip("#"),
             "color": next((c for c in COLORS if c not in used), COLORS[len(store["factories"]) % len(COLORS)]),
             "created": now_ms()}
        store["factories"].append(f)
        if foreman:
            _place(store, foreman, f["id"])
            f["foreman"] = foreman
        _save(store)
    return f


def _place(store, pal, fid):
    if norm(pal) == norm(settings()["head"]):
        raise FactoryError(f"{pal} is the head pal: it runs the default factory and stays in it")
    k = _key(store, pal)
    if k:
        del store["pals"][k]
    # A foreman who leaves its factory stops being its foreman.
    for f in store["factories"]:
        if f["id"] != fid and norm(f["foreman"]) == norm(pal):
            f["foreman"] = ""
    if fid != DEFAULT:
        store["pals"][pal] = fid


def move(pal, spec):
    """Put a pal in a factory ("default" takes it back to today's crew)."""
    pal = str(pal or "").strip()
    if not pal:
        raise FactoryError("which pal?")
    with locked("factories"):
        store = load()
        f = get(spec, store)
        _place(store, pal, f["id"])
        _save(store)
    return f


def switch(spec):
    with locked("factories"):
        store = load()
        f = get(spec, store)
        store["current"] = f["id"]
        _save(store)
    return f


def rename(spec, name):
    with locked("factories"):
        store = load()
        f = get(spec, store)
        if f["id"] == DEFAULT:
            store["default_name"] = _name(name, store, but=DEFAULT)
        else:
            next(x for x in store["factories"] if x["id"] == f["id"])["name"] = _name(name, store, but=f["id"])
        _save(store)
        return get(f["id"], store)


def set_foreman(spec, pal, topic=None):
    """A factory's foreman: one of its own pals ("" clears it). The default factory's is the head pal."""
    with locked("factories"):
        store = load()
        f = get(spec, store)
        if f["id"] == DEFAULT:
            raise FactoryError("the default factory's foreman is the head pal (About → Settings names it)")
        rec = next(x for x in store["factories"] if x["id"] == f["id"])
        pal = str(pal or "").strip()
        if pal and factory_of(pal, store) != f["id"]:
            raise FactoryError(f"{pal} isn't in {f['name']}: move it there first (pal factory move)")
        rec["foreman"] = pal
        if topic:
            rec["foreman_topic"] = str(topic).lstrip("#")
        _save(store)
        return rec


def remove(spec):
    """Remove a factory. Its pals go back to the default factory; nothing of theirs is touched."""
    with locked("factories"):
        store = load()
        f = get(spec, store)
        if f["id"] == DEFAULT:
            raise FactoryError("the default factory stays: it's the crew you have")
        back = [k for k, v in store["pals"].items() if v == f["id"]]
        for k in back:
            del store["pals"][k]
        store["factories"] = [x for x in store["factories"] if x["id"] != f["id"]]
        if store["current"] == f["id"]:
            store["current"] = DEFAULT
        _save(store)
    return f, back


def renamed(old, new):
    """A pal got a new name: it stays in its factory, and stays its foreman."""
    if not FILE.exists():
        return
    with locked("factories"):
        store = load()
        k = _key(store, old)
        hit = False
        if k:
            store["pals"][new] = store["pals"].pop(k)
            hit = True
        for f in store["factories"]:
            if norm(f["foreman"]) == norm(old):
                f["foreman"] = new
                hit = True
        if hit:
            _save(store)


def line(f, store, names=()):
    n = len(pals_of(f["id"], names, store)) if names else None
    bits = [TEMPLATES[f["template"]]["name"], f"foreman {f['foreman']}" if f["foreman"] else "no foreman yet"]
    if n is not None:
        bits.append(f"{n} pal{'' if n == 1 else 's'}")
    mark = "→" if store["current"] == f["id"] else " "
    return f"{mark} {f['name']}  ({' · '.join(bits)})" + ("  [default]" if f.get("default") else "")
