"""The Chief: the owner's chief of staff, above the head pal (crew-boards/chief/design.md, DeNon's
pick 2026-11-09: direction A, the Split deck).

It's a pal whose space is hidden from the sidebar, shown in a pop-up window (Ctrl+Shift+J) beside a
dashboard. It only PULLS: nothing is ever typed into it but the owner's own words in the pop-up.
Its only write to the crew is a Desk card to the head pal's #ops topic. This module holds who the
Chief is, and the rules every other part enforces:

- targets: no card, message, callback, room or routine reaches the Chief (crewdesk.create,
  crewlib.enqueue, crewd's callbacks, pal-room, pal routine);
- the CLI: run from the Chief, `pal` does only the read commands and `pal desk send` to <head>#ops;
- the hook (Claude Code PreToolUse): the Chief's own tool calls can't write outside its folder,
  type into terminals or change git.

Like the approval gate, this is a guard against mistakes and against a pal talking the Chief into
something, not a security boundary."""
import os
import re
from pathlib import Path

from crewlib import DATA, HEAD, OWNER, CrewError, norm, records, settings, split_where, hc_terminals

ROLE = "Chief of staff"
NAME = "Chief"
HOME_DIR = DATA / "crew-chief"
TEMPLATE = Path.home() / ".local" / "lib" / "herdr-crew" / "chief-AGENTS.md"
OPS = "ops"   # the fallback when the owner hasn't set the head pal's inbox topic (T60, pal settings head-topic)


def inbox_label():
    """'Orca#ops': where the Chief's cards go, for messages (the head pal's inbox topic, else #ops)."""
    from crewlib import head_topic
    return f"{HEAD}#{head_topic() or OPS}"
SEEDS = {
    "priorities.md": "# Priorities\n\nThe 3-5 things that matter now, each with why and a check date. The pop-up's dashboard shows this file.\n",
    "decisions.md": f"# Decisions\n\n{OWNER}'s calls made in the Chief's pop-up, quoted and dated. Append only.\n",
    "watch.md": "# Watching\n\nWhat the Chief keeps an eye on, each with a check date. The dashboard shows this file.\n",
}


def is_chief(record):
    """Is this pal record the Chief? Only `chief: true` says so, which only the owner's clicked
    `pal hire --chief` sets. The role text never counts: the hire dialog offers "Chief of staff" to any
    pal (Grok T69)."""
    return (record or {}).get("chief") is True


def record(recs=None):
    """The Chief's record, or None (there's at most one)."""
    recs = records() if recs is None else recs
    return next((b for k, b in recs.items() if k.startswith("name:") and is_chief(b)), None)


def name(recs=None):
    r = record(recs)
    return r.get("name") if r else None


def is_chief_pal(spec, recs=None):
    """'Chief', 'Chief#chief', '@chief' → is that the Chief?"""
    n = name(recs)
    pal = str(spec or "").lstrip("@").partition("#")[0]
    return bool(n) and bool(pal.strip()) and norm(pal) == norm(n)


def is_chief_space(space, recs=None):
    recs = records() if recs is None else recs
    r = recs.get(space.get("id")) or recs.get("name:" + space.get("name", "")) or {}
    return is_chief(r)


def trust_notice(bot):
    """The trust question on the Chief's terminal: its space is hidden, so there's no tab to open."""
    return (f"{bot} is waiting on Claude Code's 'trust this folder?' question. Its terminal is in its "
            f"pop-up (Ctrl+Shift+J): answer it there yourself (only you can decide to trust a folder).")


def is_chief_terminal(terminal, terms=None, recs=None):
    """Does this terminal run in the Chief's space? (Its hc 'where' names the space.)"""
    if not terminal:
        return False
    recs = records() if recs is None else recs
    if not record(recs):
        return False
    terms = hc_terminals() if terms is None else terms
    pal, _ = split_where((terms.get(terminal) or {}).get("where"))
    return is_chief_pal(pal, recs)


def caller_is_chief(recs=None):
    """Is this command run from the Chief's terminal?"""
    me = os.environ.get("HC_TERMINAL_ID", "")
    if not me:
        return False
    recs = records() if recs is None else recs
    if not record(recs):
        return False
    from crewlib import term_info
    labels = (term_info(me).get("labels") or {})
    pal, _ = split_where(labels.get("where"))
    return is_chief_pal(pal, recs)


# ── what reaches the Chief: nothing ───────────────────────────────────────────────────────────

def refuse_target(spec, what="a card"):
    """Raise when `spec` names the Chief: it takes no cards, messages, rooms or routines."""
    if is_chief_pal(spec):
        raise CrewError(f"the {NAME} doesn't take {what}: it only reads, when {OWNER} opens it. "
                        f"Put it on Home (pal home …) or tell {inbox_label()}.")


# ── what the Chief may run ─────────────────────────────────────────────────────────────────────

# `pal <cmd> [sub]`: the read commands, its own memory and notebook, and pal desk send (checked below).
READ = {"overview", "team", "feed", "peek", "memory", "diff", "whoami", "computer", "help", "--help", "-h"}
SUBS = {
    "desk": {"", "ls", "open", "sent", "stats", "send"},
    "home": {""},
    "task": {"", "ls", "show", "ready"},
    "skill": {"", "ls", "show"},
    "routine": {"", "ls", "log"},
    "remember": None, "notebook": None, "mission": {"", "show"},
}


def cli_refusal(cmd, rest):
    """Why the Chief may not run `pal <cmd> <rest…>`, or None."""
    if cmd in READ:
        return None
    if cmd in SUBS:
        allowed = SUBS[cmd]
        sub = rest[0] if rest and not rest[0].startswith("-") else ""
        if cmd == "home" and rest and rest[0] in ("--json",):
            return None
        if allowed is None or sub in allowed:
            return None
        if cmd == "desk" and sub not in allowed:
            return (f"the {NAME} reads the Desk and sends cards to {inbox_label()}; it doesn't take, close or move cards. "
                    f"Hand it down: pal desk send \"{inbox_label()}\" \"…\" --task")
    return (f"the {NAME} doesn't run `pal {cmd}{(' ' + rest[0]) if rest else ''}`: it reads, advises {OWNER} and hands work to "
            f"{inbox_label()} (pal desk send \"{inbox_label()}\" \"what, why, done when\" --task). {HEAD} does the rest.")


def send_target(to, spaces):
    """The one place the Chief's cards may go: the head pal's inbox topic from the roster (T60's
    head_topic, set by the owner; today Orca#ops), else its #ops, else the topic it shows. Returns the
    'Pal#topic' to use, or raises."""
    from crewlib import find, chan, head_inbox
    head = next((s for s in spaces if (records().get(s["id"]) or {}).get("god")), None) \
        or next((s for s in spaces if norm(s["name"]) == norm(HEAD)), None)
    if not head:
        raise CrewError(f"{HEAD} isn't running, so there's nobody to hand this to; tell {OWNER}.")
    pal, _, topic = str(to or "").lstrip("@").partition("#")
    if pal.strip().lower() in ("route", "to route", "auto"):
        pal, topic = "", ""   # its one way down is the head pal's #ops anyway
    if pal.strip():
        try:
            space, _ = find(pal, spaces)
        except CrewError:
            space = None
        if not space or space["id"] != head["id"]:
            raise CrewError(f"the {NAME} hands work only to {head['name']}'s inbox ({inbox_label()}), who routes it; not to {pal}.")
    tabs = head["tabs"]
    inbox = head_inbox(head) or next((t for t in tabs if chan(t).lower() == OPS), None) \
        or next((t for t in tabs if t.get("active")), None) or (tabs[0] if tabs else None)
    if not inbox:
        raise CrewError(f"{head['name']} has no topic to hand this to; tell {OWNER}.")
    want = chan(inbox)
    if topic and topic.lower().lstrip("#") != want.lower():
        raise CrewError(f"the {NAME} hands work to {head['name']}#{want} (its inbox), not #{topic}.")
    return f"{head['name']}#{want}"


# ── the Chief's own tool calls (Claude Code PreToolUse) ───────────────────────────────────────

HC_WRITES = {"send", "keys", "interrupt", "kill", "run", "rm", "label", "keep", "put", "attach", "server", "update", "machine", "file", "exec"}
GIT_READS = {"log", "status", "show", "diff", "branch", "rev-parse", "rev-list", "describe", "shortlog", "ls-files",
             "blame", "remote", "config", "tag", "worktree", "for-each-ref", "cat-file", "grep", "reflog", "help", "--version"}
GIT_READ_ONLY_FORMS = {"branch": re.compile(r"\s-(?:[dDmMcC]|-delete|-move|-copy|-set-upstream|-unset-upstream)\b|\s--edit-description\b"),
                       "tag": re.compile(r"\s-(?:[adsfmF]|-delete|-annotate|-sign|-force|-message|-file)\b"),
                       "remote": re.compile(r"\s(?:add|remove|rm|rename|set-url|set-head|set-branches|prune|update)\b"),
                       "config": re.compile(r"\s(?:--add|--unset|--unset-all|--replace-all|--rename-section|--remove-section|--edit|-e)\b|^\S+\s+(?!--get|-l|--list)\S+\s+\S+"),
                       "worktree": re.compile(r"\s(?:add|remove|move|prune|lock|unlock|repair)\b"),
                       "reflog": re.compile(r"\s(?:delete|expire)\b")}
OTHER_PALS = {"crew-room", "pal-room", "buddy-room", "botz-room", "crew-hook", "crewd", "herdr-app"}
PAL_NAMES = {"pal", "crew", "buddy", "botz"}


def _home():
    return str(HOME_DIR.resolve())


def _inside_home(path, cwd):
    p = Path(path if os.path.isabs(path) else os.path.join(cwd or os.getcwd(), path))
    try:
        p = p.resolve()
    except OSError:
        return False
    home = Path(_home())
    return p == home or home in p.parents


def hook_refusal(tool, inp, cwd=None):
    """Why the Chief may not make this tool call, or None. Edits: only inside its own folder.
    Bash: no typing into terminals, no git changes, no pal command it couldn't run, no file writes
    outside its folder."""
    if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
        path = inp.get("file_path") or inp.get("notebook_path") or ""
        if path and not _inside_home(path, cwd):
            return (f"the {NAME} writes only in its own folder ({_home()}): priorities.md, decisions.md, watch.md and "
                    f"notes. Hand changes to {inbox_label()} with pal desk send.")
        return None
    if tool != "Bash":
        return None
    import crewguard
    cmd = inp.get("command") or ""
    for seg in crewguard.commands(cmd):
        words = crewguard.normal_words(seg)
        if not words:
            continue
        head = os.path.basename(words[0])
        rest = words[1:]
        if head == "hc" and rest and rest[0] in HC_WRITES:
            return f"the {NAME} doesn't type into or run terminals (hc {rest[0]}); it reads them with pal peek."
        if head == "git":
            j = 0   # past git's own options (-C dir, -c k=v, --no-pager…)
            while j < len(rest) and rest[j].startswith("-"):
                j += 2 if rest[j] in crewguard.GIT_VALUE_OPTS else 1
            sub = rest[j] if j < len(rest) else ""
            tail = " " + " ".join(rest[j + 1:])
            if sub not in GIT_READS or (sub in GIT_READ_ONLY_FORMS and GIT_READ_ONLY_FORMS[sub].search(tail)):
                return f"the {NAME} reads git (log, status, diff, show, branch…) but doesn't change it (git {sub}). Hand it to {inbox_label()}."
        if head in PAL_NAMES:
            sub = rest[0] if rest else ""
            why = cli_refusal(sub, rest[1:])
            if why:
                return why
        if head in OTHER_PALS:
            if head.endswith("-room") and rest and rest[0] in ("read", "ls", "list", "--help", "-h"):
                continue
            return f"the {NAME} doesn't run {head} (rooms, crewd, the app): it reads and hands work to {inbox_label()}."
    for target in crewguard.write_targets(cmd):
        if target and not target.startswith("/dev/") and not _inside_home(target, cwd):
            return (f"the {NAME} writes only in its own folder ({_home()}); not {target}. "
                    f"Hand changes to {inbox_label()} with pal desk send.")
    return None


# ── its home and brief ─────────────────────────────────────────────────────────────────────────

def render(template=None, chief=None):
    """The Chief's standing brief, rendered into data/crew-chief (its home folder), with its notes
    files seeded once (never overwritten). Returns the folder, or None without the template."""
    src = Path(template) if template else TEMPLATE
    if not src.exists():
        return None
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    st = settings()
    chief = chief or name() or NAME
    # The brief's "{{HEAD}}#ops" (and {{INBOX}}) is the head pal's inbox topic, whatever the owner set.
    text = src.read_text().replace("{{HEAD}}#ops", "{{INBOX}}").replace("{{INBOX}}", inbox_label())
    text = text.replace("{{OWNER}}", st["owner"]).replace("{{HEAD}}", st["head"]).replace("{{CHIEF}}", chief)
    (HOME_DIR / "AGENTS.md").write_text(text)
    (HOME_DIR / "CLAUDE.md").write_text("@AGENTS.md\n")
    for f, seed in SEEDS.items():
        if not (HOME_DIR / f).exists():
            (HOME_DIR / f).write_text(seed)
    return HOME_DIR


def primer(chief, ch):
    """What the Chief starts each session with (instead of the pals' primer about cards arriving)."""
    return (f"You are {chief}, {OWNER}'s chief of staff in Project Pals, above {HEAD} (the head pal). You live in a "
            f"pop-up {OWNER} opens with Ctrl+Shift+J; nothing is ever sent to you but {OWNER}'s own words. "
            f"Your brief is AGENTS.md in this folder: read it. Pull what you need (pal overview, pal feed --all, "
            f"pal home --json, pal desk ls --all, pal task ls --all, pal peek, git log/status) and hand work down with "
            f"pal desk send \"{inbox_label()}\" \"…\" --task. You're in #{ch}.")
