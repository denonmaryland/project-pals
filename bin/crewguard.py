"""Approval boundaries. Every pal runs with permissions bypassed, so Project Pals adds its own gate for the
few things that leave the computer or can't be taken back: pushing, publishing, releasing,
merging, deploying, posting and messaging people. A Claude Code pal's command that matches
data/crew-policy.json is refused (PreToolUse hook) and becomes a request in the Inbox; once the owner
approves it there, the pal is told and that exact command goes through once.

This is a guard against mistakes and against one pal talking another into something, not a
security boundary: a pal with full permissions could still edit these files. Codex and other
harnesses without a pre-command hook aren't gated."""
import hashlib
import os
import re
import time

from crewlib import DATA, APPROVALS, OWNER, load_json, save_json, locked, now_ms, new_id, feed, enqueue, CrewError

POLICY = DATA / "crew-policy.json"
DEFAULTS_VERSION = 10
DEFAULT = {
    "guarded": [
        {"name": "push", "why": "pushes code to a remote", "pattern": r"git\s+(-C\s+\S+\s+)?push\b"},
        {"name": "publish", "why": "publishes a package",
         "pattern": r"\b(npm|pnpm|yarn|bun)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b|\bmakepkg\b.*\baur\b"},
        {"name": "release", "why": "makes a release", "pattern": r"\bgh\s+release\s+(create|upload|edit|delete)\b"},
        {"name": "merge", "why": "merges a pull request", "pattern": r"\bgh\s+pr\s+merge\b"},
        {"name": "post", "why": "posts on GitHub",
         "pattern": r"\bgh\s+(issue|pr)\s+(comment|create|close|review|edit)\b|\bgh\s+api\b.*(-X|--method)\s*(POST|PATCH|PUT|DELETE)"},
        {"name": "deploy", "why": "deploys",
         "pattern": r"\b(fly|flyctl)\s+deploy\b|\bvercel\b.*--prod\b|\bnetlify\s+deploy\b.*--prod\b|\bwrangler\s+(deploy|publish)\b|\bkubectl\s+(apply|delete)\b"},
        {"name": "message", "why": "messages people", "pattern": r"(sendmail|mutt|msmtp|mail\s+-s)\b"},
        {"name": "message-api", "why": "messages people", "anywhere": True,
         "pattern": r"api\.telegram\.org|hooks\.slack\.com|discord(app)?\.com/api/webhooks"},
        {"name": "land", "why": "merges a topic's branch into the project", "pattern": r"(crew|botz|buddy|pal)\s+land\b"},
        # A repo's own release script pushes and publishes inside itself, out of the gate's sight,
        # so the script itself needs the click: ./release 0.2.3, bash scripts/release.sh v1.0.0, make release.
        {"name": "release-script", "why": "runs a release script (push and publish)",
         "pattern": r"(?:(?:ba|z)?sh\s+)?(?:\S*/)?release(?:\.sh)?\s+v?\d+\.\d+\.\d+|make\s+(?:\S+\s+)*release(?:\s|$)"},
        # A project's agent instructions change only with the owner's click (the profile panel's
        # AGENTS.md tab; DeNon 2026-11-08, P6). A pal's Edit/Write on AGENTS.md or CLAUDE.md is held
        # (crew-hook turns it into "edit <path>"), and so is a shell write to one. The smooth way:
        # pal agents propose <file> --file new.md, which goes to the Inbox with its diff.
        {"name": "agents-file", "why": "edits the project's AGENTS.md or CLAUDE.md (propose it instead: pal agents propose)",
         "pattern": r"^edit\s+.*(AGENTS|CLAUDE)\.md(\s|$)"},
        # Shell writes to one: redirects (both heredoc orders, quoted paths with spaces), tee, sed/perl
        # -i, cp / mv / install / ln / rsync onto it, dd of= (review H3). A parse, not a regex.
        {"name": "agents-file-shell", "why": "writes the project's AGENTS.md or CLAUDE.md (propose it instead: pal agents propose)",
         "check": "agent-file-writes", "pattern": r"$^"},
        # The owner's one-time click tokens (data/crew-clicks): a pal writing one would be forging a
        # click (review H1).
        {"name": "owner-click", "why": "writes one of the owner's click tokens", "check": "click-writes", "pattern": r"$^"},
        # crewd's message queue (data/crew-queue): a file written there by hand reaches a pal with
        # whatever header it claims, "[from <owner>]" included. Pals send with pal tell / ask / task.
        {"name": "queue-write", "why": "writes into the pals' message queue (send with pal tell instead)", "check": "queue-writes", "pattern": r"$^"},
        # The Desk's cards (data/crew-desk): a card written or edited by hand could claim any sender or
        # status. Pals move cards with pal desk (its own writes aren't shell commands); the owner may
        # edit a card in an editor, and crewd notes it (Desk design §10.3, §12.2).
        {"name": "desk-write", "why": "writes into the Desk's cards (use pal desk instead)", "check": "desk-writes", "pattern": r"$^"},
    ],
    "trusted": [],
}


def policy():
    p = load_json(POLICY, None)
    if not p:
        p = {**DEFAULT, "defaults_version": DEFAULTS_VERSION}
        save_json(POLICY, p)
    elif p.get("defaults_version", 1) < DEFAULTS_VERSION:
        # Newer built-in rules replace the old built-in ones; rules people added stay.
        ours = {r["name"] for r in DEFAULT["guarded"]}
        p["guarded"] = DEFAULT["guarded"] + [r for r in p.get("guarded", []) if r.get("name") not in ours]
        p["defaults_version"] = DEFAULTS_VERSION
        save_json(POLICY, p)
    return p


# A heredoc: keep its header line (`cat <<'EOF' > AGENTS.md` writes AGENTS.md), drop its body.
HEREDOC = re.compile(r"(<<-?\s*['\"]?(\w+)['\"]?)([^\n]*)\n.*?\n\s*\2\s*(?=\n|$)", re.S)
heredoc_free = lambda cmd: HEREDOC.sub(lambda m: m.group(1) + m.group(3), cmd)
SPLIT = re.compile(r"\n|;|&&|\|\||\||\$\(|`|\(|\{|\bthen\b|\bdo\b|\belse\b")
INNER = re.compile(r"""\b(?:sh|bash|zsh|eval)\s+(?:-\w+\s+)*-c\s+(['"])(.*?)\1""", re.S)
LEAD = re.compile(r"^\s*(?:(?:sudo|env|command|exec|nohup|time|timeout\s+\S+)\s+|\w+=\S*\s+)*")


def commands(cmd):
    """The commands a shell line runs: each segment's start, including inside sh -c '...', but not
    heredoc bodies (text being written to a file isn't a command)."""
    text = heredoc_free(cmd)
    out = []
    for inner in INNER.findall(text):
        out += commands(inner[1])
    for seg in SPLIT.split(text):
        seg = LEAD.sub("", seg).strip()
        if seg:
            out.append(seg)
    return out


AGENT_FILE = re.compile(r"(^|/)(AGENTS|CLAUDE)\.md$")
REDIRECT = {">", ">>", ">|", "&>", "&>>", ">&"}
SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", "|&", ";;"}
COPIERS = {"cp", "mv", "install", "ln", "rsync"}


def write_targets(cmd):
    """The files a shell line writes to, as far as a plain parse can tell: redirect targets, tee's
    files, sed / perl -i files, cp / mv / install / ln / rsync destinations, dd of=. Inside sh -c '…'
    too. Heredoc bodies are dropped but their header lines are kept."""
    import shlex
    text = heredoc_free(cmd)
    out = []
    for inner in INNER.findall(text):
        out += write_targets(inner[1])
    for line in text.splitlines():
        lex = shlex.shlex(line, posix=True, punctuation_chars=";&|()<>")
        lex.whitespace_split = True
        try:
            toks = list(lex)
        except ValueError:          # an unbalanced quote: fall back to plain words
            toks = line.split()
        cmds, cur = [], []
        for tk in toks:
            if tk in SEPARATORS:
                if cur:
                    cmds.append(cur)
                cur = []
            else:
                cur.append(tk)
        if cur:
            cmds.append(cur)
        for words in cmds:
            i = 0
            while i < len(words):           # redirections, anywhere in the command
                w = words[i]
                if w in REDIRECT or re.fullmatch(r"\d+>>?|\d*>\|", w):
                    if i + 1 < len(words) and words[i + 1] != "&":
                        out.append(words[i + 1])
                    i += 2
                    continue
                if w == "<<" or w == "<<-":  # a heredoc marker isn't a file
                    i += 2
                    continue
                i += 1
            plain = [w for w in words if w not in REDIRECT and not re.fullmatch(r"\d+>>?|\d*>\|", w)]
            while plain and (re.fullmatch(r"\w+=\S*", plain[0]) or plain[0] in ("sudo", "env", "command", "exec", "nohup", "time")):
                plain = plain[1:]
            if not plain:
                continue
            name, args = os.path.basename(plain[0]), plain[1:]
            files = [a for a in args if not a.startswith("-")]
            if name == "tee":
                out += files
            elif name in ("sed", "perl") and any(a.startswith("-i") or a == "--in-place" or (name == "perl" and re.fullmatch(r"-\w*i\w*", a)) for a in args):
                out += files
            elif name in COPIERS and files:
                out.append(files[-1])
            elif name == "dd":
                out += [a[3:] for a in args if a.startswith("of=")]
            elif name in ("truncate", "touch") and files:
                out += files
    return out


def writes_agent_file(cmd):
    return any(AGENT_FILE.search(os.path.normpath(t.strip("'\""))) for t in write_targets(cmd))


def writes_click(cmd):
    """A write INTO data/crew-clicks (redirect, tee, cp/mv onto it, …); mentioning it isn't one."""
    return any("crew-clicks" in os.path.normpath(t.strip("'\"")).split(os.sep) for t in write_targets(cmd)) \
        or bool(re.match(r"^edit\s+.*/crew-clicks/", cmd))


def writes_queue(cmd):
    """A write INTO data/crew-queue (as writes_click); `pal tell` writing its own file isn't a shell write."""
    return any("crew-queue" in os.path.normpath(t.strip("'\"")).split(os.sep) for t in write_targets(cmd)) \
        or bool(re.match(r"^edit\s+.*/crew-queue/", cmd))


def writes_desk(cmd):
    """A write INTO data/crew-desk (as writes_queue)."""
    return any("crew-desk" in os.path.normpath(t.strip("'\"")).split(os.sep) for t in write_targets(cmd)) \
        or bool(re.match(r"^edit\s+.*/crew-desk/", cmd))


CHECKS = {"agent-file-writes": writes_agent_file, "click-writes": writes_click, "queue-writes": writes_queue,
          "desk-writes": writes_desk}


def matches(cmd):
    segs = commands(cmd)
    flat = heredoc_free(cmd)
    for rule in policy().get("guarded", []):
        if rule.get("check"):
            if CHECKS.get(rule["check"], lambda _c: False)(cmd):
                return rule
            continue
        try:
            pat = re.compile(rule["pattern"])
        except re.error:
            continue
        # Most rules: a command that starts that way. "anywhere" rules (URLs): anywhere in the line.
        if rule.get("anywhere") and pat.search(flat):
            return rule
        if any(pat.match(seg) for seg in segs):
            return rule
    return None


def key(terminal, cmd):
    return hashlib.sha1(f"{terminal}\n{' '.join(cmd.split())}".encode()).hexdigest()[:16]


def all_requests():
    return sorted((load_json(f, {}) for f in APPROVALS.glob("*.json")), key=lambda r: r.get("at", 0)) if APPROVALS.exists() else []


EXPIRE_MIN = 30   # an approval not used within this long lapses; running the command again asks again


def expire_stale():
    """Approved but never used for EXPIRE_MIN: mark it expired, so an old yes can't be cashed in later.
    Call it holding the approvals lock."""
    for r in all_requests():
        if r.get("status") == "approved" and now_ms() - r.get("decided", r.get("at", 0)) > EXPIRE_MIN * 60 * 1000:
            r["status"], r["expired"] = "expired", now_ms()
            save_json(APPROVALS / f"{r['id']}.json", r)
            feed("approval", id=r["id"], bot=r.get("bot"), channel=r.get("channel"), status="expired")


def check(terminal, bot, channel, cmd, extra=None):
    """None: go ahead. Else the reason it's held."""
    if bot in policy().get("trusted", []):
        return None
    rule = matches(cmd)
    if not rule:
        return None
    k = key(terminal, cmd)
    with locked("approvals"):
        expire_stale()
        for r in all_requests():
            if r.get("key") != k:
                continue
            if r["status"] == "approved":
                r["status"], r["used"] = "used", now_ms()
                save_json(APPROVALS / f"{r['id']}.json", r)
                return None
            if r["status"] == "pending":
                return r
        r = {"id": new_id("a-"), "key": k, "at": now_ms(), "terminal": terminal, "bot": bot, "channel": channel,
             "command": cmd, "rule": rule["name"], "why": rule.get("why", ""), "status": "pending", **(extra or {})}
        save_json(APPROVALS / f"{r['id']}.json", r)
    feed("approval", id=r["id"], bot=bot, channel=channel, command=cmd[:200], status="pending")
    return r


def recently_used(terminal, rule, seconds=120):
    """Did the owner's approval of a `rule` command from this terminal just go through?"""
    return any(r.get("terminal") == terminal and r.get("rule") == rule and r.get("status") == "used"
               and now_ms() - r.get("used", 0) < seconds * 1000 for r in all_requests())


def decide(rid, approve, note=None, via=None):
    """The owner's answer. `via` says where it came from (the Inbox, a terminal), kept on the record
    with every attempt, so a click that seems not to have counted can be traced afterwards."""
    with locked("approvals"):
        f = APPROVALS / f"{rid}.json"
        r = load_json(f, None)
        if not r:
            raise CrewError(f"no approval request {rid}")
        want = "approve" if approve else "deny"
        r.setdefault("attempts", []).append({"at": now_ms(), "wanted": want, "via": via, "was": r["status"]})
        if r["status"] != "pending":
            save_json(f, r)
            feed("approval-refused", id=rid, bot=r["bot"], channel=r["channel"], wanted=want, status=r["status"])
            raise CrewError(f"{rid} was already {r['status']}" + (f" ({_ago(r['decided'])})" if r.get("decided") else "")
                            + "; nothing changed")
        r["status"] = "approved" if approve else "denied"
        r["decided"] = now_ms()
        r["decided_via"] = via
        if note:
            r["note"] = note
        save_json(f, r)
    feed("approval", id=rid, bot=r["bot"], channel=r["channel"], status=r["status"])
    if approve:
        msg = f"[pal] {OWNER} approved: {r['command']}\nRun that exact command again now; it'll go through once."
    else:
        msg = f"[pal] {OWNER} said no to: {r['command']}" + (f"\nTheir note: {note}" if note else "") + f"\nDon't retry it; carry on without it or ask {OWNER}."
    try:
        enqueue(r["terminal"], msg, sender=f"{OWNER}", kind="approval")
    except CrewError:
        pass
    return r


def _ago(ms):
    m = int((now_ms() - ms) / 60000)
    return "just now" if m < 1 else f"{m} min ago" if m < 90 else f"{m // 60}h ago"


def tidy():
    """Expire unused approvals; forget decided requests after a week."""
    with locked("approvals"):
        expire_stale()
    for r in all_requests():
        if r.get("status") != "pending" and now_ms() - r.get("decided", r.get("at", 0)) > 7 * 86400 * 1000:
            (APPROVALS / f"{r['id']}.json").unlink(missing_ok=True)
