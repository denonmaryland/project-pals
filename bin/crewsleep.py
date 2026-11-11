"""Sleeping and waking pals in place: the agent in a topic stops (its RAM is freed) and its shell,
tab and room seats stay; waking types the pal's command back in and resumes that topic's session.
PR #4 (goodboimax); the safety rules below are 0.4.1's (T41).

Sleeping signals a process, so it only ever touches one: the agent directly under THAT topic's
shell, on THIS machine, pinned with a pidfd so a reused pid can't be hit. It refuses (and says why)
when the pal is mid-turn, waiting on a prompt, has unsent text in its box (or a box it can't read),
or its agent still has work of its own running (a background shell, a dev server, a VM run).
TERM first; KILL only if the agent is still there after the wait.

Waking never resumes a session it can't vouch for: the link must come from the agent's own hook,
match what the topic had when it was put to sleep, be the brain being started, live in the folder
the shell is in, and not be open in another topic. Otherwise it starts fresh and says why.

Tests point CREW_PROC at a fake /proc (comm, stat, environ, task/*/children per pid)."""
import contextlib
import json
import os
import re
import select
import signal
import time
from pathlib import Path

from crewlib import (DATA, QUEUE, SHELLS, RULE, CrewError, load_json, save_json, proc_comm, child_pids, owns_terminal,
                     input_draft, trust_prompt, screen)

# The harnesses' process names. A CLI wrapped in node shows up as "node" and is never signalled.
AGENT_COMMS = {"claude", "agy", "codex", "gemini", "opencode", "grok", "hermes"}
PRIMER_HINT = "First run `pal primer` and `pal memory` to learn how the crew works and what you remember."
SLEPT = DATA / "crew-slept"          # <terminal>.json: put to sleep by pal sleep, and the session it had
HELPER_GRACE = 20.0                  # children started this soon after the agent are its helpers (MCP servers)
TERM_WAIT, KILL_WAIT = 5.0, 2.0
SETTLE = 1.5                         # own work is looked at twice this far apart: a hook or status line comes and goes
SESSION_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{7,127}")
# Claude Code's footer while a background shell it started is still going ("1 shell still running" and the like).
BG_WORK = re.compile(r"\b\d+\s+(?:background\s+)?(?:shells?|tasks?|bash(?:es)?)\s+(?:still\s+)?running\b", re.I)
WORKING = re.compile(r"esc to interrupt", re.I)


class Refused(CrewError):
    """Not put to sleep / not woken, with the reason a person reads."""


def _proc(proc_dir=None):
    return Path(proc_dir or os.environ.get("CREW_PROC") or "/proc")


def _stat(pid, proc_dir=None):
    """(ppid, state, start time in clock ticks) from /proc/<pid>/stat, or None when it's gone."""
    try:
        raw = (_proc(proc_dir) / str(pid) / "stat").read_text()
    except OSError:
        return None
    rest = raw[raw.rfind(")") + 2:].split()
    try:
        return int(rest[1]), rest[0], int(rest[19])
    except (IndexError, ValueError):
        return None


def _cmdline(pid, proc_dir=None):
    try:
        raw = (_proc(proc_dir) / str(pid) / "cmdline").read_bytes()
    except OSError:
        return ""
    return " ".join(x.decode(errors="replace") for x in raw.split(b"\0") if x)


def _cwd(pid, proc_dir=None):
    p = _proc(proc_dir) / str(pid) / "cwd"
    try:
        return os.readlink(p)
    except OSError:
        with contextlib.suppress(OSError):
            return p.read_text().strip()   # a test's fake /proc: a plain file
    return None


def names_terminal(pid, address, proc_dir=None):
    """pid's environment says it runs in that terminal (HC_TERMINAL_ID). Read for real, fake /proc too."""
    try:
        env = (_proc(proc_dir) / str(pid) / "environ").read_bytes().split(b"\0")
    except OSError:
        return False
    return f"HC_TERMINAL_ID={address}".encode() in env


def is_local(space, address):
    return bool(address) and not (space or {}).get("machine") and "/" not in address


def agent_children(shell, address, proc_dir=None):
    """The shell's direct children that are a known agent running in that terminal."""
    return [c for c in child_pids(shell, proc_dir)
            if proc_comm(c, proc_dir) in AGENT_COMMS and names_terminal(c, address, proc_dir)]


def _descendants(pid, proc_dir=None):
    out, todo = [], list(child_pids(pid, proc_dir))
    while todo and len(out) < 500:
        c = todo.pop()
        out.append(c)
        todo.extend(child_pids(c, proc_dir))
    return out


def own_work(agent, proc_dir=None):
    """What the agent itself still runs: each live descendant, at any depth, started more than
    HELPER_GRACE seconds after the agent. What started with the session (its MCP servers, and what
    they started then) isn't work; anything started later is, a helper's own later children too
    (Grok T50: a whole helper subtree used to be skipped). [(pid, 'comm: cmdline')]."""
    me = _stat(agent, proc_dir)
    if not me:
        return []
    hz = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") else 100
    out = []
    for c in _descendants(agent, proc_dir):
        st = _stat(c, proc_dir)
        if not st or st[1] in ("Z", "X") or (st[2] - me[2]) / hz < HELPER_GRACE:
            continue
        out.append((c, f"{proc_comm(c, proc_dir) or '?'}: {_cmdline(c, proc_dir)[:80]}".rstrip(": ")))
    return out


# Codex's input box (found live, T119: an idle Codex could be neither slept nor handed over, its box
# was unreadable). No rules round it: the last line starting "›", its wrapped lines, a blank line,
# then only its footer (model · folder, "? for shortcuts"). A sent message is echoed with "›" too,
# further up, with output below it. hc read is plain text, so the greyed hints an empty box shows
# are told from a draft by their words: the ones Codex ships. An unknown hint reads as a draft,
# which refuses: the safe side.
CODEX_PROMPT = re.compile(r"^›(?: (.*))?$")
CODEX_EMPTY = re.compile(r"^(?:Ask Codex to do anything|Explain this codebase|Summarize recent commits|Implement \{feature\}"
                         r"|Find and fix a bug in @filename|Write tests for @filename|Improve documentation in @filename"
                         r"|Run /review on my current changes|Use /skills to list available skills)$")


def codex_box(lines):
    """(index of the box's first line, its unsent text or '' when empty), or None when the screen
    doesn't end in Codex's input box (a dialog, a question, another program)."""
    idx = next((i for i in range(len(lines) - 1, -1, -1) if CODEX_PROMPT.match(lines[i])), None)
    if idx is None:
        return None
    text, j = [CODEX_PROMPT.match(lines[idx]).group(1) or ""], idx + 1
    while j < len(lines) and lines[j].strip():
        if not lines[j].startswith("  "):
            return None
        text.append(lines[j].strip())
        j += 1
    foot = [l for l in lines[j:] if l.strip()]
    if len(foot) > 3 or any(not l.startswith(" ") for l in foot):
        return None   # output below the last "›": that was a sent message, not the box
    draft = " ".join(t for t in text if t).strip()
    return idx, ("" if CODEX_EMPTY.match(draft) else draft)


def check_screen(lines, comm=None):
    """Why the screen says not to stop it now, or None. A box we can't read counts as a no.
    Claude Code's spinner ("esc to interrupt") sits just above its input box and its footer ("1 shell
    still running") just below, so only those lines are read: the same words further up are output.
    comm: the agent's process name; "codex" has its own box (codex_box)."""
    if trust_prompt(lines):
        return "it's waiting on a question (Claude Code's folder-trust prompt)"
    if comm == "codex" and input_draft(lines) is None:
        box = codex_box(lines)
        if box is None:
            return "can't see an empty input box there (a dialog may be open), so can't tell whether someone's typing"
        if WORKING.search("\n".join(lines[max(0, box[0] - 4):box[0]])):
            return "it's mid-turn (its screen says esc to interrupt)"
        if box[1]:
            return f"there's unsent text in its box (\"{box[1][:40]}{'…' if len(box[1]) > 40 else ''}\")"
        return None
    rules = [i for i, l in enumerate(lines) if RULE.match(l)]
    boxed = len(rules) >= 2 and rules[-1] - rules[-2] >= 2
    above = "\n".join(lines[max(0, rules[-2] - 3):rules[-2]]) if boxed else ""
    below = "\n".join(lines[rules[-1] + 1:]) if boxed else ""
    if WORKING.search(above):
        return "it's mid-turn (its screen says esc to interrupt)"
    if BG_WORK.search(below):
        return f"its agent still has work running ({BG_WORK.search(below).group(0)})"
    draft = input_draft(lines)
    if draft:
        return f"there's unsent text in its box (\"{draft[:40]}{'…' if len(draft) > 40 else ''}\")"
    if draft is None:
        return "can't see an empty input box there (a dialog may be open), so can't tell whether someone's typing"
    return None


def queue_busy(address):
    """A message to it is being handed over right now (claimed, not finished)."""
    d = QUEUE / address
    return d.is_dir() and any(d.glob("*.taken"))


def check_sleep(space, address, me, info, lines, proc_dir=None):
    """The checks before a topic's agent is stopped. Returns (shell pid, agent pid); raises Refused
    with the reason, or returns (shell, None) when nothing runs there (already asleep)."""
    if not address:
        raise Refused("it has no terminal")
    if not is_local(space, address):
        raise Refused("it runs on another machine (only this machine's pals are put to sleep)")
    if address == me:
        raise Refused("that's you")
    if not info or info.get("state") != "live" or not info.get("pid"):
        raise Refused("its terminal isn't running")
    shell = info["pid"]
    if proc_comm(shell, proc_dir) not in SHELLS:
        raise Refused(f"its agent doesn't run in a shell ({proc_comm(shell, proc_dir) or 'gone'}), so stopping it would close the tab")
    if not owns_terminal(shell, address, proc_dir) or not names_terminal(shell, address, proc_dir):
        raise Refused("can't find its shell on this machine")
    kids = child_pids(shell, proc_dir)
    if not kids:
        return shell, None
    agents = agent_children(shell, address, proc_dir)
    if len(agents) != 1:
        what = ", ".join(sorted({proc_comm(c, proc_dir) or "?" for c in kids}))
        raise Refused(f"what runs there isn't one agent ({what})")
    st = (info.get("status") or {}).get("state")
    if st == "working":
        raise Refused("it's mid-turn (working)")
    if st == "blocked":
        raise Refused("it's waiting on a prompt (blocked)")
    why = check_screen(lines, proc_comm(agents[0], proc_dir))
    if why:
        raise Refused(why)
    if queue_busy(address):
        raise Refused("a message is being handed to it right now")
    work = own_work(agents[0], proc_dir)
    if work:
        time.sleep(SETTLE)
        again = {pid for pid, _ in own_work(agents[0], proc_dir)}
        work = [w for w in work if w[0] in again]
    if work:
        raise Refused("its agent still has work running: " + "; ".join(w for _, w in work[:3]) + (f" (+{len(work) - 3} more)" if len(work) > 3 else ""))
    return shell, agents[0]


def _alive(pid, proc_dir=None):
    st = _stat(pid, proc_dir)
    return bool(st) and st[1] not in ("Z", "X")


def stop_agent(agent, shell, address, proc_dir=None, term_wait=TERM_WAIT, kill_wait=KILL_WAIT):
    """TERM the agent, wait, KILL only if it's still there. The pid is pinned with a pidfd and checked
    again after pinning (still that agent, under that shell, in that terminal), so a pid reused
    meanwhile is never signalled. Returns 'term' or 'kill'; raises Refused when it can't."""
    try:
        fd = os.pidfd_open(agent)
    except ProcessLookupError:
        return "term"   # already gone
    except (AttributeError, OSError) as e:
        raise Refused(f"can't pin its agent's process ({e})")
    try:
        st = _stat(agent, proc_dir)
        if not st or st[0] != shell or proc_comm(agent, proc_dir) not in AGENT_COMMS or not names_terminal(agent, address, proc_dir):
            raise Refused("its agent changed while checking; nothing was stopped")
        for sig, wait, how in ((signal.SIGTERM, term_wait, "term"), (signal.SIGKILL, kill_wait, "kill")):
            try:
                signal.pidfd_send_signal(fd, sig)
            except ProcessLookupError:
                return how
            deadline = time.time() + wait
            p = select.poll()
            p.register(fd, select.POLLIN)
            while time.time() < deadline:
                if p.poll(100) or not _alive(agent, proc_dir):
                    return how
        raise Refused("its agent is still running after TERM and KILL")
    finally:
        os.close(fd)


# ── slept markers ──────────────────────────────────────────────────────────────────────────────

def mark_slept(address, **fields):
    SLEPT.mkdir(parents=True, exist_ok=True)
    save_json(SLEPT / f"{address}.json", {"terminal": address, "at": int(time.time() * 1000), **fields})


def slept(address):
    return load_json(SLEPT / f"{address}.json", None) if SLEPT.exists() else None


def unmark(address):
    (SLEPT / f"{address}.json").unlink(missing_ok=True)


def tidy(live):
    """Forget markers of terminals that are gone."""
    for f in SLEPT.glob("*.json") if SLEPT.exists() else ():
        if f.stem not in live:
            f.unlink(missing_ok=True)


# ── waking ─────────────────────────────────────────────────────────────────────────────────────

ONE_SHOT = ("-i", "-p", "--prompt", "--print", "--resume", "-r", "--conversation")


def base_argv(argv, key=None):
    """The pal's command without one-shot prompt/resume flags (keeps --model, bypass and the like).
    Only Claude Code's and Antigravity CLI's: another harness's -c or -p means something else
    (Codex: -c key=value, -p profile), so its command is kept as recorded."""
    argv = [str(a) for a in argv or []]
    if kind(key, argv) is None:
        return argv
    base, i = [], 0
    while i < len(argv):
        a = argv[i]
        if a in ONE_SHOT:
            i += 2
            continue
        if a not in ("-c", "--continue") and not a.startswith(("--resume=", "--conversation=", "--prompt=", "--print=")):
            base.append(a)
        i += 1
    return base


def kind(key, argv):
    """'claude', 'agy' or None (a harness whose sessions aren't resumed)."""
    prog = Path(str((argv or [""])[0])).name.lower()
    k = (key or "").lower()
    if prog == "claude" or k in ("claude", "claude-code"):
        return "claude"
    if prog == "agy" or k in ("agy", "antigravity", "antigravity-cli"):
        return "agy"
    return None


def resume_args(address, key, argv, cwd, links, live):
    """([args to add], why). Resumes only a session it can vouch for; anything else is a fresh start
    with the reason. links: crewchat.links(); live: the terminals with an agent running now."""
    k = kind(key, argv)
    lk = links.get(address) or {}
    sid = str(lk.get("session") or "")
    if not lk or not sid:
        return [], "no session on record for this topic, so it starts fresh"
    if k is None:
        return [], f"{key or 'this brain'}'s sessions aren't resumed, so it starts fresh"
    if lk.get("source") not in ("hook", "resume"):
        return [], "its session link was a guess, so it starts fresh"
    mark = slept(address)
    if mark is not None and (mark.get("link") or {}).get("session") != sid:
        return [], "its session changed since it was put to sleep, so it starts fresh"
    if not SESSION_ID.fullmatch(sid):
        return [], "its session id looks wrong, so it starts fresh"
    have = {"claude": ("claude", "claude-code"), "agy": ("antigravity", "agy")}[k]
    if (lk.get("harness") or "claude") not in have:
        return [], f"its last session was {lk.get('harness')}, not {key}, so it starts fresh"
    tr = Path(lk.get("transcript") or "")
    if not lk.get("transcript") or not tr.exists():
        return [], "its session file is gone, so it starts fresh"
    if k == "claude":
        import crewchat
        if not cwd or crewchat.project_dir(cwd) != tr.parent:
            return [], "its shell is in another folder than its session, so it starts fresh"
    for other, ol in links.items():
        if other != address and other in live and (str(ol.get("session") or "") == sid or ol.get("transcript") == lk.get("transcript")):
            return [], f"another topic ({other}) has that session open, so it starts fresh"
    return (["--resume", sid] if k == "claude" else [f"--conversation={sid}"]), f"resuming its session {sid[:8]}"


def check_wake(space, address, info, proc_dir=None):
    """The checks before typing into a topic's shell. Returns the shell pid; raises Refused."""
    if not address:
        raise Refused("it has no terminal")
    if not is_local(space, address):
        raise Refused("it runs on another machine")
    if not info or info.get("state") != "live" or not info.get("pid"):
        raise Refused("its terminal isn't running")
    shell = info["pid"]
    comm = proc_comm(shell, proc_dir)
    if comm not in SHELLS:
        raise Refused(f"it isn't a shell there ({comm or 'gone'})")
    if not owns_terminal(shell, address, proc_dir) or not names_terminal(shell, address, proc_dir):
        raise Refused("can't find its shell on this machine")
    kids = child_pids(shell, proc_dir)
    if agent_children(shell, address, proc_dir):
        raise Refused("it's already awake")
    if kids:
        what = ", ".join(sorted({proc_comm(c, proc_dir) or "?" for c in kids}))
        raise Refused(f"something else runs in its shell ({what}), so nothing is typed there")
    return shell


def shell_cwd(shell, info, proc_dir=None):
    return _cwd(shell, proc_dir) or info.get("cwd")
