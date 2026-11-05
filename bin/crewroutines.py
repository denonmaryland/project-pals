"""Routines: a prompt a pal runs on a schedule, in one of its channels (default #routines).

Schedules, in plain words or cron:
  weekdays 09:00 · daily 8:30 · mon,wed,fri 14:00 · weekends 10am · every 30m · every 2h 10:00-20:00 weekdays
  */15 9-17 * * 1-5   (cron: minute hour day month weekday, 0 = Sunday)
A run is skipped while the channel is still busy with the last one. A run that ends with
NOTHING_NEW is quiet: logged, marked seen, kept out of the Inbox.
"""
import json
import re
import subprocess
import time

from crewlib import (DATA, REQS, CrewError, OWNER, load_json, save_json, locked, append_jsonl, herdr_spaces, find, lead,
                     chan, screen, meaningful, send_now, is_agent, feed, now_ms, new_id)

STORE = DATA / "crew-routines.json"
RUNLOG = DATA / "crew-routines.log.jsonl"
TIMEOUT_MIN = 60
DAYNAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def load():
    return load_json(STORE, [])


def save(routines):
    save_json(STORE, routines)


def _time(s):
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", s.strip())
    if not m:
        raise CrewError(f"can't read the time '{s}' (use 09:00 or 9am)")
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    if not (0 <= h < 24 and 0 <= mi < 60):
        raise CrewError(f"'{s}' isn't a time")
    return h, mi


def _days(words):
    days = set()
    for w in words:
        for part in w.split(","):
            p = part.strip()[:3]
            if not p:
                continue
            if part.strip() in ("weekdays",):
                days |= {0, 1, 2, 3, 4}
            elif part.strip() in ("weekends",):
                days |= {5, 6}
            elif part.strip() in ("daily", "everyday", "day"):
                days |= set(range(7))
            elif p in DAYNAMES:
                days.add(DAYNAMES.index(p))
            else:
                raise CrewError(f"can't read '{part}' as days")
    return days or set(range(7))


def _cron_field(f, lo, hi):
    out = set()
    for part in f.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/")
            step = int(s)
        if part == "*":
            a, b = lo, hi
        elif "-" in part:
            a, b = map(int, part.split("-"))
        else:
            a = b = int(part)
        out |= set(range(a, b + 1, step))
    return out


def parse(schedule):
    s = " ".join(schedule.lower().split())
    if re.fullmatch(r"([\d*/,-]+ ){4}[\d*/,-]+", s):
        mi, h, dom, mon, dow = s.split()
        return {"type": "cron", "min": sorted(_cron_field(mi, 0, 59)), "hour": sorted(_cron_field(h, 0, 23)),
                "dom": sorted(_cron_field(dom, 1, 31)), "mon": sorted(_cron_field(mon, 1, 12)),
                "dow": sorted({(d - 1) % 7 for d in _cron_field(dow.replace("7", "0"), 0, 6)})}
    m = re.match(r"every (\d+)\s*(m|min|mins|minutes?|h|hours?|d|days?)\b(.*)$", s)
    if m:
        n, unit, rest = int(m.group(1)), m.group(2)[0], m.group(3).strip()
        secs = n * {"m": 60, "h": 3600, "d": 86400}[unit]
        if secs < 300:
            raise CrewError("the shortest interval is 5 minutes")
        window = None
        w = re.search(r"(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)", rest)
        if w:
            window = [_time(w.group(1)), _time(w.group(2))]
            rest = (rest[:w.start()] + rest[w.end():]).strip()
        return {"type": "every", "seconds": secs, "window": window, "days": sorted(_days(rest.split()))}
    words = s.split()
    times = [_time(w) for w in words if re.fullmatch(r"\d{1,2}(:\d{2})?(am|pm)?", w)]
    rest = [w for w in words if not re.fullmatch(r"\d{1,2}(:\d{2})?(am|pm)?", w) and w not in ("at", "every")]
    if not times:
        raise CrewError(f"can't read the schedule '{schedule}'. Try: weekdays 09:00, every 2h, or cron")
    return {"type": "at", "times": times, "days": sorted(_days(rest))}


def due(rule, now, last, created):
    lt = time.localtime(now)
    wd = lt.tm_wday
    if rule["type"] == "cron":
        ok = (lt.tm_min in rule["min"] and lt.tm_hour in rule["hour"] and lt.tm_mday in rule["dom"]
              and lt.tm_mon in rule["mon"] and wd in rule["dow"])
        return ok and (not last or time.strftime("%Y%m%d%H%M", time.localtime(last)) != time.strftime("%Y%m%d%H%M", lt))
    if wd not in rule["days"]:
        return False
    if rule["type"] == "every":
        if rule.get("window"):
            (h1, m1), (h2, m2) = rule["window"]
            if not (h1 * 60 + m1 <= lt.tm_hour * 60 + lt.tm_min <= h2 * 60 + m2):
                return False
        return now - (last or created) >= rule["seconds"]
    for h, m in rule["times"]:
        at = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, h, m, 0, 0, 0, -1))
        # Due once it's past the time today; a run missed by more than 30 minutes is let go.
        if at <= now < at + 1800 and (not last or last < at):
            return True
    return False


def next_run(r, now=None):
    """When a routine will next fire (epoch seconds), looking up to 8 days ahead; None if paused."""
    if r.get("paused"):
        return None
    now = now or time.time()
    last = (r.get("last") or {}).get("at")
    t = (int(now) // 60 + 1) * 60
    for _ in range(8 * 24 * 60):
        if due(r["rule"], t, last, r["created"]):
            return t
        t += 60
    return None


def edit(rid, name=None, schedule=None, prompt=None, channel=None):
    with locked("routines"):
        rs = load()
        r = next((x for x in rs if x["id"] == rid), None)
        if not r:
            raise CrewError(f"no routine {rid}")
        if schedule:
            r["rule"], r["schedule"] = parse(schedule), schedule
        if name:
            r["name"] = name
        if prompt:
            r["prompt"] = prompt
        if channel:
            r["channel"] = channel.lstrip("#")
        r["next"] = next_run(r)
        save(rs)
    return r


def describe(rule):
    if rule["type"] == "cron":
        return "cron"
    days = rule["days"]
    d = "every day" if len(days) == 7 else "weekdays" if days == [0, 1, 2, 3, 4] else "weekends" if days == [5, 6] \
        else ",".join(DAYNAMES[x] for x in days)
    if rule["type"] == "every":
        s = rule["seconds"]
        e = f"every {s // 86400}d" if s % 86400 == 0 else f"every {s // 3600}h" if s % 3600 == 0 else f"every {s // 60}m"
        w = f" {rule['window'][0][0]:02}:{rule['window'][0][1]:02}-{rule['window'][1][0]:02}:{rule['window'][1][1]:02}" if rule.get("window") else ""
        return f"{e}{w}" + ("" if len(days) == 7 else f" {d}")
    return f"{d} " + ", ".join(f"{h:02}:{m:02}" for h, m in rule["times"])


def add(bot, schedule, prompt, name=None, channel="routines", by=None):
    rule = parse(schedule)
    r = {"id": new_id("r-"), "name": name or prompt[:40], "bot": bot, "channel": channel.lstrip("#"),
         "schedule": schedule, "rule": rule, "prompt": prompt, "paused": False, "created": time.time(),
         "by": by, "last": None, "run": None}
    r["next"] = next_run(r)
    with locked("routines"):
        rs = load()
        rs.append(r)
        save(rs)
    return r


def _log(r, status, **extra):
    entry = {"at": now_ms(), "routine": r["id"], "name": r["name"], "bot": r["bot"], "status": status, **extra}
    append_jsonl(RUNLOG, entry)
    r["last"] = {"at": time.time(), "status": status, **extra}


def start(r, terms, log, forced=False):
    """Run a routine now in its pal's channel, unless that channel is busy."""
    try:
        spaces = herdr_spaces()
        space, _ = find(r["bot"], spaces)
    except CrewError as e:
        _log(r, "failed", reason=str(e))
        return
    tab = next((t for t in space["tabs"] if chan(t).lower() == r["channel"].lower()), None)
    x = lead(tab) if tab else None
    if not tab or not x or not is_agent(terms.get(x["terminal"])):
        # No channel with a running agent yet: ask Project Pals to open one, and run when it's there.
        if not r.get("opening") or time.time() - r["opening"] > 300:
            r["opening"] = time.time()
            REQS.mkdir(parents=True, exist_ok=True)
            rid = f"{int(time.time())}-{new_id()}"
            (REQS / f"{rid}.req.json").write_text(json.dumps({
                "op": "channel", "bot": space["name"], "name": r["channel"], "category": "Routines", "byName": "Routines",
                "brief": f"This channel runs {space['name']}'s scheduled routines. Each arrives as [routine: name]."}))
            log(f"routine {r['name']}: opening #{r['channel']} in {space['name']}")
        r["pending"] = True
        return
    r.pop("opening", None)
    r.pop("pending", None)
    t = terms[x["terminal"]]
    if t.get("status") in ("working", "blocked"):
        _log(r, "skipped", reason="still busy" if t.get("status") == "working" else f"waiting on {OWNER}")
        log(f"routine {r['name']}: skipped, #{r['channel']} is busy")
        return
    text = (f"[routine: {r['name']}] {r['prompt']}\n\n(A scheduled routine {OWNER} set up. If nothing here needs {OWNER}'s "
            f"attention, reply with just NOTHING_NEW.)")
    try:
        send_now(x["terminal"], text)
    except CrewError as e:
        _log(r, "failed", reason=str(e))
        return
    r["run"] = {"at": time.time(), "terminal": x["terminal"], "turn": t.get("turn") or 0, "forced": forced}
    log(f"routine {r['name']}: started in {space['name']} #{r['channel']}")


def tick(terms, log):
    """Once a minute: start what's due (and what was waiting for its channel)."""
    with locked("routines"):
        rs = load()
        changed = False
        for r in rs:
            if r.get("paused") or r.get("run"):
                continue
            if r.get("pending") or r.get("force") or due(r["rule"], time.time(), (r.get("last") or {}).get("at"), r["created"]):
                forced = bool(r.pop("force", False))
                start(r, terms, log, forced)
                changed = True
        for r in rs:
            nxt = next_run(r)
            if r.get("next") != nxt:
                r["next"] = nxt
                changed = True
        if changed:
            save(rs)


def watch(terms, log):
    """Every tick: finish runs whose turn ended."""
    rs = load()
    if not any(r.get("run") or r.get("force") for r in rs):
        return
    with locked("routines"):
        rs = load()
        changed = False
        for r in rs:
            run = r.get("run")
            if r.get("force") and not run:
                start(r, terms, log, True)
                r.pop("force", None)
                changed = True
                continue
            if not run:
                continue
            t = terms.get(run["terminal"])
            if not t:
                _log(r, "failed", reason="its channel closed")
                r["run"] = None
                changed = True
                continue
            status, turn = t.get("status"), t.get("turn") or 0
            if status == "blocked":
                _log(r, f"needs {OWNER}", reason="it asked a question")
                feed("routine", routine=r["name"], bot=r["bot"], status=f"needs {OWNER}")
                r["run"] = None
                changed = True
            elif turn > run["turn"] and status != "working":
                tail = meaningful(screen(run["terminal"]))[-8:]
                quiet = any("NOTHING_NEW" in l for l in tail[-4:])
                summary = next((l.strip(" ●⏺") for l in reversed(tail) if "NOTHING_NEW" not in l and not l.startswith("❯")), "")
                if quiet:
                    # Nothing for the owner: mark the turn seen so the Inbox stays clean.
                    subprocess.run(["hc", "label", run["terminal"], f"herdr.seen={turn}"], capture_output=True, timeout=10)
                _log(r, "quiet" if quiet else "done", summary=summary[:200])
                feed("routine", routine=r["name"], bot=r["bot"], status="quiet" if quiet else "done")
                log(f"routine {r['name']}: {'quiet' if quiet else 'done'}")
                r["run"] = None
                changed = True
            elif time.time() - run["at"] > TIMEOUT_MIN * 60:
                _log(r, "failed", reason=f"still going after {TIMEOUT_MIN} min")
                r["run"] = None
                changed = True
        if changed:
            save(rs)
