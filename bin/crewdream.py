"""The Dream loop (docs/profiles/proposal.md, section 3c): the crew learns from its hiccups.

Nightly (crewd, 03:30) and on demand (`pal dream`):
1. Summarise, no model: every pal's notebook hiccup / needed / lesson lines since the last dream.
   Fewer than MIN_NEW new hiccups across the crew: the night is skipped.
2. Group, one cheap call (Haiku): the lines into patterns, matched to the patterns already in the
   ledger. Without the model (--no-model, or when it can't run), by word overlap.
3. Draft: patterns that qualify (2+ pals, or 3+ times, or 30+ minutes lost) go to the head pal as a
   short digest; it drafts at most MAX_PROPOSALS proposals with `pal dream propose`.
Proposals only: each is an Inbox card with its text or diff, and nothing is written until the owner
accepts it, through the writer for that kind (a skill, an AGENTS.md change, a task, a brain note).
An accepted fix is watched WATCH_DAYS days: a matching hiccup marks it "recurred" (and it comes back),
none marks it "resolved". Declined patterns rest DECLINE_REST_DAYS unless they double.

It never writes DJM OS's Learning Ledger; a lesson that matters beyond Project Pals becomes a
sanitized intake draft in data/crew-dream/intake/ for the owner to file."""
import json
import re
import subprocess
import time
from pathlib import Path

from crewlib import DATA, MEMORY, OWNER, CrewError, load_json, save_json, append_jsonl, now_ms, slug, locked

DIR = DATA / "crew-dream"
PATTERNS = DIR / "patterns.json"
LEDGER = DIR / "ledger.jsonl"
STATE = DIR / "state.json"
INTAKE = DIR / "intake"
MIN_NEW = 3
MAX_PROPOSALS = 3
WATCH_DAYS = 14
DECLINE_REST_DAYS = 30
QUALIFY = {"pals": 2, "count": 3, "minutes": 30}
KINDS = ("skill", "rule", "tool", "process", "context")
MODEL = "haiku"
STOP = set(("the a an to of in on for and or is was it its with that this from at by be not no as are were i my we our "
            "again also still one two got get had has have did does just then than when what which while into out up "
            "cost could would should can cant couldnt didnt wasnt dont some more less very").split())


def event(kind, **fields):
    DIR.mkdir(parents=True, exist_ok=True)
    append_jsonl(LEDGER, {"at": now_ms(), "event": kind, **fields})


def patterns():
    return load_json(PATTERNS, {})


def save_patterns(p):
    DIR.mkdir(parents=True, exist_ok=True)
    save_json(PATTERNS, p)


# ─── 1. summarise ───────────────────────────────────────────────────────────────────────────

def collect(since_day=None):
    """Every hiccup / needed / lesson line, newest notebooks first, from days on or after since_day."""
    import crewnotebook
    out = []
    if not MEMORY.exists():
        return out
    for d in sorted(MEMORY.iterdir()):
        nb = d / "notebook"
        if not nb.is_dir():
            continue
        title = None
        for p in sorted(nb.glob("????-??-??.md")):
            if since_day and p.stem < since_day:
                continue
            text = p.read_text()
            if title is None:
                m = re.match(r"^# (.+?), \d{4}-\d\d-\d\d", text)
                title = m.group(1) if m else d.name
            for e in crewnotebook.parse(text):
                for h in e["hiccups"]:
                    out.append({"pal": title, "day": p.stem, "time": e["time"], "channel": e["channel"], "kind": "hiccup", "text": h["text"], "cost": h["cost"]})
                for n in e["needed"]:
                    out.append({"pal": title, "day": p.stem, "time": e["time"], "channel": e["channel"], "kind": f"needed:{n['kind']}", "text": n["text"], "cost": 0})
                if e["lesson"]:
                    out.append({"pal": title, "day": p.stem, "time": e["time"], "channel": e["channel"], "kind": "lesson", "text": e["lesson"], "cost": 0})
    return out


def key(line):
    return f"{line['pal']}|{line['day']}|{line['time']}|{line['kind']}|{line['text'][:60]}"


# ─── 2. group ───────────────────────────────────────────────────────────────────────────────

def words(text):
    return {w for w in re.findall(r"[a-z][a-z0-9-]{2,}", text.lower()) if w not in STOP}


def group_offline(lines, known):
    """Word-overlap grouping: a line joins the open pattern (or new group) it shares most words with."""
    groups = []
    for p in known.values():
        if p.get("status") in ("open", "proposed", "watching", "recurred"):
            groups.append({"id": p["id"], "summary": p["summary"], "words": words(p["summary"] + " " + " ".join(p.get("keywords", []))), "lines": []})
    for i, l in enumerate(lines):
        w = words(l["text"])
        best, score = None, 0.0
        for g in groups:
            shared = len(w & g["words"])
            j = shared / max(1, min(len(w), len(g["words"]))) if shared >= 2 else 0.0
            if j > score:
                best, score = g, j
        if best and score >= 0.4:
            best["lines"].append(i)
            best["words"] |= w
        else:
            groups.append({"id": None, "summary": l["text"][:90], "words": w, "lines": [i]})
    return [{"id": g["id"], "summary": g["summary"], "lines": g["lines"], "kind": None} for g in groups if g["lines"]]


def group_model(lines, known):
    """One Haiku call: the lines → patterns, reusing known pattern ids."""
    open_ = [{"id": p["id"], "summary": p["summary"]} for p in known.values() if p.get("status") in ("open", "proposed", "watching", "recurred")]
    listing = "\n".join(f"{i}. [{l['pal']}] ({l['kind']}) {l['text']}" for i, l in enumerate(lines))
    prompt = ("These are lines from AI coding agents' work notebooks: hiccups (what got in the way), what they "
              "needed, and lessons. Group the lines that are about the SAME underlying problem into patterns. "
              "Reuse a known pattern's id when the problem is the same. Reply with JSON only: "
              '[{"id": "<known id or null>", "summary": "<the problem in one short line>", '
              '"kind": "skill|rule|tool|process|context", "lines": [<line numbers>]}]. '
              "Every line in at most one pattern; leave out lines that are one-offs with no pattern.\n\n"
              f"Known patterns:\n{json.dumps(open_)}\n\nLines:\n{listing}")
    r = subprocess.run(["claude", "-p", "--model", MODEL, "--output-format", "text"], input=prompt,
                       capture_output=True, text=True, timeout=240, cwd=str(DATA))
    m = re.search(r"\[[\s\S]*\]", r.stdout or "")
    if r.returncode != 0 or not m:
        raise CrewError("the grouping call didn't answer")
    out = json.loads(m.group(0))
    return [{"id": g.get("id"), "summary": str(g.get("summary", ""))[:140], "kind": g.get("kind") if g.get("kind") in KINDS else None,
             "lines": [int(x) for x in g.get("lines", []) if str(x).isdigit() and int(x) < len(lines)]} for g in out if g.get("lines")]


def next_id(known):
    n = max([int(k.split("-")[1]) for k in known if re.match(r"^P-\d+$", k)] + [0]) + 1
    return f"P-{n}"


# ─── the dream ──────────────────────────────────────────────────────────────────────────────

def dream(force=False, model=True, dry=False, log=print):
    """Run the loop once. Returns {skipped | patterns, qualifying, digest}."""
    with locked("dream"):
        state = load_json(STATE, {})
        seen = set(state.get("seen", []))
        since = state.get("since_day") or time.strftime("%Y-%m-%d", time.localtime(time.time() - 7 * 86400))
        lines = [l for l in collect(since) if key(l) not in seen]
        new_hiccups = [l for l in lines if l["kind"] == "hiccup"]
        known = patterns()
        # Housekeeping every night, quiet or not (review M7): an expired proposal reopens its pattern,
        # and a watched fix with no hiccup for WATCH_DAYS is resolved.
        import crewproposals
        crewproposals.all_()   # marks week-old pending ones expired
        for p in known.values():
            if p.get("status") == "proposed" and p.get("proposal"):
                pr = load_json(crewproposals.DIR / f"{p['proposal']}.json", {})
                if pr.get("status") in ("expired", None):
                    p["status"] = "open"
        resolved_now, recurred_now = [], []
        if len(new_hiccups) < MIN_NEW and not force:
            # Too few new hiccups to group with the model, but they're still evidence: a watched fix
            # whose hiccup came back has RECURRED, whatever its age (review M7 re-check). Matched by word
            # overlap only (no model on a quiet night); those lines are used up.
            watched = {p["id"]: p for p in known.values() if p["status"] == "watching"}
            used = set()
            if watched and new_hiccups:
                for g in group_offline(new_hiccups, watched):
                    if g["id"] in watched:
                        p = watched[g["id"]]
                        ls = [new_hiccups[i] for i in g["lines"]]
                        p["status"], p["recurred"] = "recurred", time.strftime("%Y-%m-%d")
                        p["count"] += len(ls)
                        p["pals"] = sorted(set(p["pals"]) | {l["pal"] for l in ls})
                        p["minutes"] += sum(l["cost"] for l in ls)
                        p["sources"] = (p.get("sources", []) + [{"pal": l["pal"], "day": l["day"], "time": l["time"], "text": l["text"][:200]} for l in ls])[-20:]
                        p["last_seen"] = time.strftime("%Y-%m-%d")
                        recurred_now.append(p["id"])
                        used |= {key(l) for l in ls}
            for p in known.values():
                if p["status"] == "watching" and p.get("accepted_at") and now_ms() - p["accepted_at"] > WATCH_DAYS * 86400000:
                    p["status"], p["resolved"] = "resolved", time.strftime("%Y-%m-%d")
                    resolved_now.append(p["id"])
            if not dry:
                save_patterns(known)
                for pid in recurred_now:
                    event("recurred", pattern=pid, lines=1)
                for pid in resolved_now:
                    event("resolved", pattern=pid)
                if used:
                    state["seen"] = sorted(seen | used)[-5000:]
                state["last"] = now_ms()
                save_json(STATE, state)
                event("skipped", new=len(new_hiccups))
            return {"skipped": True, "new": len(new_hiccups), "resolved": resolved_now, "recurred": recurred_now}
        try:
            groups = group_model(lines, known) if model and lines else group_offline(lines, known)
            how = "model" if model else "offline"
        except (CrewError, OSError, subprocess.TimeoutExpired, ValueError) as e:
            log(f"dream: grouping with the model failed ({e}); grouping by word overlap")
            groups, how = group_offline(lines, known), "offline"
        now_day = time.strftime("%Y-%m-%d")
        touched = []
        for g in groups:
            ls = [lines[i] for i in g["lines"]]
            if not ls:
                continue
            pid = g["id"] if g["id"] in known else None
            p = known.get(pid) or {"id": next_id(known), "summary": g["summary"], "status": "open", "count": 0, "pals": [],
                                   "minutes": 0, "kind": g.get("kind"), "sources": [], "first": now_day, "keywords": []}
            known[p["id"]] = p
            p["count"] += len(ls)
            p["pals"] = sorted(set(p["pals"]) | {l["pal"] for l in ls})
            p["minutes"] += sum(l["cost"] for l in ls)
            p["sources"] = (p["sources"] + [{"pal": l["pal"], "day": l["day"], "time": l["time"], "text": l["text"][:200]} for l in ls])[-20:]
            p["keywords"] = sorted(set(p.get("keywords", [])) | set().union(*(words(l["text"]) for l in ls)))[:40]
            p["kind"] = p.get("kind") or g.get("kind")
            p["last_seen"] = now_day
            # A watched fix whose hiccup came back.
            if p["status"] == "watching" and any(l["kind"] == "hiccup" for l in ls):
                p["status"] = "recurred"
                p["recurred"] = now_day
                if not dry:
                    event("recurred", pattern=p["id"], lines=len(ls))
            touched.append(p["id"])
        # Watched fixes that stayed quiet long enough: resolved.
        for p in known.values():
            if p["status"] == "watching" and p.get("accepted_at") and now_ms() - p["accepted_at"] > WATCH_DAYS * 86400000 and p["id"] not in touched:
                p["status"] = "resolved"
                p["resolved"] = now_day
                if not dry:
                    event("resolved", pattern=p["id"])
        qualifying = []
        for p in known.values():
            if p["status"] not in ("open", "recurred", "declined"):
                continue
            if p["status"] == "declined":
                rest_over = now_ms() - p.get("declined_at", 0) > DECLINE_REST_DAYS * 86400000
                doubled = p["count"] >= 2 * p.get("count_at_decline", p["count"])
                if not (rest_over or doubled):
                    continue
            if len(p["pals"]) >= QUALIFY["pals"] or p["count"] >= QUALIFY["count"] or p["minutes"] >= QUALIFY["minutes"]:
                qualifying.append(p)
        qualifying.sort(key=lambda p: (-p["minutes"], -p["count"]))
        qualifying = qualifying[:MAX_PROPOSALS]
        out = {"patterns": len(known), "touched": touched, "qualifying": [summary_of(p) for p in qualifying], "grouped_by": how, "lines": len(lines)}
        if dry:
            out["all"] = [summary_of(p) for p in known.values()]
            return out
        save_patterns(known)
        state["seen"] = sorted(seen | {key(l) for l in lines})[-5000:]
        state["since_day"] = time.strftime("%Y-%m-%d", time.localtime(time.time() - 2 * 86400))
        state["last"] = now_ms()
        save_json(STATE, state)
        event("dreamed", lines=len(lines), patterns=touched, qualifying=[p["id"] for p in qualifying], grouped_by=how)
        out["digest"] = digest(qualifying) if qualifying else None
        return out


def summary_of(p):
    return {k: p.get(k) for k in ("id", "summary", "status", "count", "pals", "minutes", "kind", "last_seen", "proposal", "first")} | {
        "quotes": [s["text"] for s in p.get("sources", [])[-2:]]}


def digest(qualifying):
    """The message the head pal gets: the patterns, and how to propose a fix for each."""
    lines = [f"[dream] {len(qualifying)} pattern(s) in the crew's notebooks qualify for a fix. Draft at most one proposal "
             f"each (or skip one that needs nothing). Proposals only: {OWNER} approves each in the Inbox; nothing is written before that."]
    for p in qualifying:
        quotes = " | ".join(f"\"{s['text'][:120]}\" ({s['pal']}, {s['day']})" for s in p.get("sources", [])[-2:])
        lines.append(f"- {p['id']} ({p.get('kind') or 'kind?'}): {p['summary']} · {p['count']}x, {len(p['pals'])} pal(s) "
                     f"({', '.join(p['pals'])}), ~{p['minutes']}m lost. {quotes}")
    lines.append("Propose with: pal dream propose --pattern P-n --kind skill|rule|tool|process|context "
                 "[--name skill-name | --pal \"Pal\" (whose AGENTS.md, task or brain)] -F text.md --note \"why\". "
                 "A rule is a few lines added to that pal's AGENTS.md; a tool or process becomes a task; context a brain note. "
                 "pal dream ls shows every pattern.")
    return "\n".join(lines)


# ─── proposals and outcomes ─────────────────────────────────────────────────────────────────

def mark(pattern_id, **fields):
    with locked("dream"):
        known = patterns()
        p = known.get(pattern_id)
        if not p:
            raise CrewError(f"no pattern {pattern_id} (pal dream ls)")
        p.update(fields)
        save_patterns(known)
        return p


def proposed(pattern_id, proposal_id):
    mark(pattern_id, status="proposed", proposal=proposal_id, proposed_at=now_ms())
    event("proposed", pattern=pattern_id, proposal=proposal_id)


def decided(pattern_id, accepted, proposal_id=None, reason=None):
    p = patterns().get(pattern_id)
    if not p:
        return
    if accepted:
        mark(pattern_id, status="watching", accepted_at=now_ms())
    else:
        mark(pattern_id, status="declined", declined_at=now_ms(), count_at_decline=p["count"], decline_reason=reason)
    event("accepted" if accepted else "declined", pattern=pattern_id, proposal=proposal_id, reason=reason)


def stats():
    month_ago = now_ms() - 30 * 86400000
    ev = []
    if LEDGER.exists():
        for line in LEDGER.read_text().splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if e.get("at", 0) >= month_ago:
                ev.append(e)
    count = lambda k: sum(1 for e in ev if e.get("event") == k)
    known = patterns()
    week_ago_day = time.strftime("%Y-%m-%d", time.localtime(time.time() - 7 * 86400))
    lost_week = sum(l["cost"] for l in collect(week_ago_day) if l["kind"] == "hiccup")
    return {"proposed": count("proposed"), "accepted": count("accepted"), "declined": count("declined"),
            "resolved": count("resolved"), "recurred": count("recurred"), "minutes_week": lost_week,
            "last": load_json(STATE, {}).get("last"), "patterns": [summary_of(p) for p in sorted(known.values(), key=lambda p: p.get("last_seen", ""), reverse=True)],
            "intake": sorted(p.name for p in INTAKE.glob("*.md")) if INTAKE.exists() else []}


def intake(pattern_id, text):
    """A sanitized draft for DJM OS's intake, for the owner to file (never filed from here)."""
    import crewnotebook
    p = patterns().get(pattern_id)
    if not p:
        raise CrewError(f"no pattern {pattern_id}")
    if crewnotebook.has_private_key(text):
        raise CrewError("that draft holds a private key: never; take it out (and rotate it if it was real)")
    body = "\n".join(crewnotebook.SECRET.sub("‹masked›", l) for l in text.splitlines())
    INTAKE.mkdir(parents=True, exist_ok=True)
    path = INTAKE / f"{time.strftime('%Y-%m-%d')}-{slug(p['summary'])[:50]}.md"
    path.write_text(body.rstrip() + "\n")
    event("intake", pattern=pattern_id, file=path.name)
    return path
