"""Approval boundaries. Every pal runs with permissions bypassed, so Project Pals adds its own gate for the
few things that leave the computer or can't be taken back: pushing, publishing, releasing,
merging, deploying, posting and messaging people. A Claude Code pal's command that matches
data/crew-policy.json is refused (PreToolUse hook) and becomes a request in the Inbox; once the owner
approves it there, the pal is told and that exact command goes through once.

This is a guard against mistakes and against one pal talking another into something, not a
security boundary: a pal with full permissions could still edit these files. Codex and other
harnesses without a pre-command hook aren't gated."""
import hashlib
import re
import time

from crewlib import DATA, APPROVALS, OWNER, load_json, save_json, locked, now_ms, new_id, feed, enqueue, CrewError

POLICY = DATA / "crew-policy.json"
DEFAULTS_VERSION = 5
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
        {"name": "land", "why": "merges a channel's branch into the project", "pattern": r"(crew|botz|buddy|pal)\s+land\b"},
        # A repo's own release script pushes and publishes inside itself, out of the gate's sight,
        # so the script itself needs the click: ./release 0.2.3, bash scripts/release.sh v1.0.0, make release.
        {"name": "release-script", "why": "runs a release script (push and publish)",
         "pattern": r"(?:(?:ba|z)?sh\s+)?(?:\S*/)?release(?:\.sh)?\s+v?\d+\.\d+\.\d+|make\s+(?:\S+\s+)*release(?:\s|$)"},
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


HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?[^\n]*\n.*?\n\s*\1\s*(?:\n|$)", re.S)
SPLIT = re.compile(r"\n|;|&&|\|\||\||\$\(|`|\(|\{|\bthen\b|\bdo\b|\belse\b")
INNER = re.compile(r"""\b(?:sh|bash|zsh|eval)\s+(?:-\w+\s+)*-c\s+(['"])(.*?)\1""", re.S)
LEAD = re.compile(r"^\s*(?:(?:sudo|env|command|exec|nohup|time|timeout\s+\S+)\s+|\w+=\S*\s+)*")


def commands(cmd):
    """The commands a shell line runs: each segment's start, including inside sh -c '...', but not
    heredoc bodies (text being written to a file isn't a command)."""
    text = HEREDOC.sub("\n", cmd)
    out = []
    for inner in INNER.findall(text):
        out += commands(inner[1])
    for seg in SPLIT.split(text):
        seg = LEAD.sub("", seg).strip()
        if seg:
            out.append(seg)
    return out


def matches(cmd):
    segs = commands(cmd)
    flat = HEREDOC.sub("\n", cmd)
    for rule in policy().get("guarded", []):
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


def check(terminal, bot, channel, cmd):
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
             "command": cmd, "rule": rule["name"], "why": rule.get("why", ""), "status": "pending"}
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
