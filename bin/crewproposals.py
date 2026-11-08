"""Proposals waiting for the owner in the Inbox: a change a pal (or the Dream loop) wants made to a
file it may not write itself. Each one is data/crew-proposals/<id>.json plus its proposed text in
<id>.md. Nothing is written until the owner accepts it in the Inbox, and then it goes through the
file's own writer (crewagents.apply, with its backup and hash check, or the brain's)."""
import json
import time

from crewlib import DATA, CrewError, load_json, save_json, new_id, now_ms, feed

DIR = DATA / "crew-proposals"
EXPIRE_DAYS = 7


def propose(kind, pal, by, text, file=None, base_sha=None, note=None, meta=None):
    DIR.mkdir(parents=True, exist_ok=True)
    p = {"id": new_id("p-"), "kind": kind, "pal": pal, "by": by, "file": file, "base": base_sha, "note": note,
         "at": now_ms(), "status": "pending", **({"meta": meta} if meta else {})}
    (DIR / f"{p['id']}.md").write_text(text)
    save_json(DIR / f"{p['id']}.json", p)
    feed("proposal", id=p["id"], what=kind, bot=pal, by=by, file=file, status="pending")
    return p


def all_(status=None):
    if not DIR.exists():
        return []
    out = []
    for f in sorted(DIR.glob("*.json")):
        p = load_json(f, None)
        if not p:
            continue
        if p["status"] == "pending" and now_ms() - p.get("at", 0) > EXPIRE_DAYS * 86400 * 1000:
            p["status"], p["decided"] = "expired", now_ms()
            save_json(f, p)
        if status is None or p["status"] == status:
            out.append(p)
    return sorted(out, key=lambda p: p.get("at", 0))


def get(pid):
    p = load_json(DIR / f"{pid}.json", None)
    if not p:
        raise CrewError(f"no proposal {pid}")
    p["text"] = (DIR / f"{pid}.md").read_text() if (DIR / f"{pid}.md").exists() else ""
    return p


def text_sha(p):
    import hashlib
    return hashlib.sha256((p.get("text") or "").encode()).hexdigest()


def check_reviewed(p, given):
    """Accepting needs the digest of the text the owner was shown (review H5): another text, or none
    given for a dream proposal, is refused."""
    if given is None:
        if p.get("kind") == "dream":
            raise CrewError("open the whole proposal in the Inbox first (its text wasn't shown)")
        return
    if given != text_sha(p):
        raise CrewError("the proposal's text isn't the one you were shown; look at it again")


def decide(pid, status, note=None, via=None):
    p = load_json(DIR / f"{pid}.json", None)
    if not p:
        raise CrewError(f"no proposal {pid}")
    if p["status"] != "pending":
        raise CrewError(f"{pid} is already {p['status']}")
    p.update(status=status, decided=now_ms(), reason=note, via=via)
    save_json(DIR / f"{pid}.json", p)
    feed("proposal", id=pid, what=p["kind"], bot=p["pal"], status=status)
    return p
