"""The Project Pals task board: data/crew-tasks.json. Tasks have an owner, dependencies, notes and a
result. Claiming and finishing tell the people involved: the owner hears when a task is assigned
or unblocked, and whoever created it hears when it's done or blocked. A task with a check command
can only be marked done when the check passes (run in the owner's project folder)."""
import subprocess
import time

from crewlib import (DATA, CrewError, OWNER, load_json, save_json, locked, enqueue, find, lead, chan, feed, now_ms,
                     from_bot, is_agent, hc_terminals, header, unforge, owner_proven)

STORE = DATA / "crew-tasks.json"
OPEN = ("open", "claimed", "blocked")


def load():
    return load_json(STORE, {"next": 1, "tasks": []})


def get(board, tid):
    tid = tid.upper() if tid.lower().startswith("t") else f"T{tid}"
    t = next((x for x in board["tasks"] if x["id"] == tid), None)
    if not t:
        raise CrewError(f"no task {tid}")
    return t


def same(spec_a, spec_b):
    """Is 'Docs Site#updates' the same owner as 'theme'?"""
    if not spec_a or not spec_b:
        return False
    a_bot, _, a_ch = spec_a.lower().partition("#")
    b_bot, _, b_ch = spec_b.lower().partition("#")
    bot_ok = a_bot.startswith(b_bot) or b_bot.startswith(a_bot)
    return bot_ok and (not a_ch or not b_ch or a_ch == b_ch)


def terminal_for(spec, spaces):
    space, tab = find(spec, spaces)
    if "#" not in spec:
        # A pal without a channel: its shown channel if an agent runs there, else any that has one.
        terms = hc_terminals()
        for t in [tab] + [x for x in space["tabs"] if x is not tab]:
            x = lead(t)
            if x and is_agent(terms.get(x["terminal"])):
                return space, t, x["terminal"]
    x = lead(tab)
    return space, tab, (x or {}).get("terminal")


def notify(spec, text, spaces, sender):
    if not spec:
        return False
    try:
        _, _, term = terminal_for(spec, spaces)
        if term:
            enqueue(term, text, sender=sender, kind="task")
            return True
    except CrewError:
        pass
    return False


def clean(text):
    """A task's words as a pal reads them: only the owner's own (a click) may look like a header."""
    return text if owner_proven() else unforge(text)


def line(t):
    who = t.get("claimed_by") or t.get("assignee") or "anyone"
    deps = f" after {', '.join(t['deps'])}" if t.get("deps") else ""
    c = t.get("card") or {}
    card = ""
    if c and t["status"] in OPEN and c.get("status") not in ("done", "cancelled", "expired"):
        card = f" · card {c['id']} {c.get('status')}" + (f" ({c['held']})" if c.get("held") else "")
    return f"{t['id']} [{t['status']}] {t['title']} · {who}{deps}{card}"


def add(title, spaces, me, me_name, body=None, assignee=None, deps=(), check=None, notify_assignee=True):
    if assignee:
        s, tab = find(assignee, spaces)
        assignee = f"{s['name']}#{chan(tab)}" if "#" in assignee else s["name"]
    with locked("tasks"):
        board = load()
        for d in deps:
            get(board, d)
        t = {"id": f"T{board['next']}", "title": title, "body": body or "", "assignee": assignee, "status": "open",
             "deps": [get(board, d)["id"] for d in deps], "by": me_name, "by_spec": me, "created": now_ms(),
             "updated": now_ms(), "notes": [], "result": None, "check": check}
        board["next"] += 1
        board["tasks"].append(t)
        save_json(STORE, board)
    feed("task", task=t["id"], status="open", title=title, by=me_name, to=assignee)
    blocked_by = [d for d in t["deps"] if get(load(), d)["status"] != "done"]
    if assignee and not blocked_by and notify_assignee:
        task_card(t, spaces, me, me_name)
    return t


def task_card(t, spaces, me, me_name):
    """A new task for someone is a card on their desk (kind task), with the task's id on it."""
    import crewdesk
    who = crewdesk.sender(spaces)
    try:
        card = crewdesk.create("task", t["assignee"], f"{t['id']} {t['title']}",
                               (t.get("body") or "") + f"\n\n(pal task claim {t['id']} to start; pal task done {t['id']} \"result\" when finished.)",
                               frm=who["from"], from_kind=who["from_kind"], proof=who["proof"], task=t["id"], via="pal task add")
        note_card(card)
        crewdesk.deliver(card, spaces)
    except CrewError:
        notify(t["assignee"], f"{header(me, me_name)} New task for you: {t['id']} {clean(t['title'])}"
               + (f"\n{clean(t['body'])}" if t.get("body") else "") + f"\n(pal task claim {t['id']} to start; pal task done {t['id']} \"result\" when finished.)",
               spaces, me_name)


def update(tid, spaces, me, me_name, status=None, note=None, result=None, claim=False, assignee=None, from_card=False):
    """Change a task. Its open Desk card follows (claimed → working, blocked, done with the result,
    cancelled), unless the change came from that card (from_card: pal desk take / done / block)."""
    with locked("tasks"):
        board = load()
        t = get(board, tid)
        if claim:
            if t["status"] == "done":
                raise CrewError(f"{t['id']} is already done")
            open_deps = [d for d in t["deps"] if get(board, d)["status"] != "done"]
            if open_deps:
                raise CrewError(f"{t['id']} waits on {', '.join(open_deps)}")
            if t.get("claimed_by") and not same(t["claimed_by"], me or me_name) and t["status"] == "claimed":
                raise CrewError(f"{t['id']} is already claimed by {t['claimed_by']}")
            t["claimed_by"] = me or me_name
            t["status"] = "claimed"
        if assignee is not None:
            s, tab = find(assignee, spaces)
            t["assignee"] = f"{s['name']}#{chan(tab)}" if "#" in assignee else s["name"]
        if note:
            t["notes"].append({"at": now_ms(), "by": me_name, "text": note})
        if status == "done" and t.get("check"):
            folder = None
            owner = t.get("claimed_by") or t.get("assignee")
            if owner and owner != f"{OWNER}":
                try:
                    folder = find(owner, spaces)[0].get("folder")
                except CrewError:
                    pass
            r = subprocess.run(["sh", "-c", t["check"]], cwd=folder or None, capture_output=True, text=True, timeout=900)
            if r.returncode != 0:
                t["notes"].append({"at": now_ms(), "by": "check", "text": f"check failed: {t['check']}"})
                save_json(STORE, board)
                raise CrewError(f"{t['id']} can't be done yet: its check `{t['check']}` failed:\n"
                                + "\n".join((r.stdout + r.stderr).strip().splitlines()[-25:]))
        if status:
            t["status"] = status
        if result is not None:
            t["result"] = result
        t["updated"] = now_ms()
        save_json(STORE, board)
        dependents = [x for x in board["tasks"] if t["id"] in x.get("deps", []) and x["status"] == "open"]
        unblocked = [x for x in dependents if all(get(board, d)["status"] == "done" for d in x["deps"])]
    if status:
        feed("task", task=t["id"], status=status, title=t["title"], by=me_name)
    who = header(me, me_name)
    creator = t.get("by_spec")
    if status == "done":
        if creator and not same(creator, me or ""):
            notify(creator, f"{who} {t['id']} is done: {unforge(t['title'])}" + (f"\nResult: {clean(result)}" if result else ""), spaces, me_name)
        for x in unblocked:
            notify(x.get("assignee"), f"[pal] {x['id']} is unblocked ({t['id']} is done): {unforge(x['title'])}\n"
                   f"(pal task claim {x['id']} to start.)", spaces, "crew")
    elif status == "blocked" and creator and not same(creator, me or ""):
        notify(creator, f"{who} {t['id']} is blocked: {unforge(t['title'])}" + (f"\nWhy: {clean(note)}" if note else ""), spaces, me_name)
    if assignee is not None and t["status"] == "open":
        notify(t["assignee"], f"{who} {t['id']} is yours now: {unforge(t['title'])}" + (f"\n{unforge(t['body'])}" if t["body"] else ""), spaces, me_name)
    if not from_card:
        mirror_to_card(t, me or me_name, status, result, note, claim)
    return t


# ── the board and the Desk (stage 6): a task's card follows the task, and the board shows the card ──

def card_of(tid):
    """The open Desk card for this task (kind task, `task: T-n`), or None."""
    try:
        import crewdesk
    except ImportError:
        return None
    hits = [c for _, c in crewdesk.cards() if not c.get("unreadable") and c.get("task") == tid]
    return hits[-1] if hits else None


def mirror_to_card(t, by, status=None, result=None, note=None, claim=False):
    """The task changed on the board: its card says so too (a receipt the sender sees)."""
    card = card_of(t["id"])
    if not card:
        return
    import crewdesk
    try:
        if status == "done":
            crewdesk.mark(card["id"], "done", by, "pal task done", (result or "")[:200], result=result)
        elif status == "cancelled":
            crewdesk.mark(card["id"], "cancelled", by, "pal task cancel")
        elif status == "blocked":
            crewdesk.mark(card["id"], "blocked", by, "pal task block", (note or "")[:300])
        elif claim:
            crewdesk.mark(card["id"], "working", by, "pal task claim")
    except CrewError:
        pass


def note_card(card):
    """A receipt on a task's card: the board keeps its latest state (the Tasks dialog shows it)."""
    tid = card.get("task")
    if not tid:
        return
    last = (card.get("receipts") or [{}])[-1]
    want = {"id": card["id"], "status": card.get("status"), "held": card.get("held"), "at": last.get("at"), "via": last.get("via")}
    with locked("tasks"):
        board = load()
        t = next((x for x in board["tasks"] if x["id"] == tid), None)
        if not t or t.get("card") == want:
            return
        t["card"] = want
        save_json(STORE, board)
