"""What an agent is asking on screen, so the app's prompt card (crew-prompt) can answer it with a click.

Claude Code draws its questions as a block at the foot of the screen (Claude Code 2.1, read with
`hc read`):

  ──────────────────────────────            a full-width rule starts the block
   Bash command                             approval: a title, a description,
   Write "hi" into made.txt
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌            the command between dashed rules
   echo hi > made.txt
  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
   Do you want to proceed?
   ❯ 1. Yes                                 numbered options (❯ = the cursor; a long
     2. Yes, and always allow access to     one wraps onto indented lines)
        … from this project
     4. No
   Esc to cancel · Tab to amend             the foot

  ──────────────────────────────
   ☐ Button color                           question (AskUserQuestion): a header,
  Which color should the button be?         the question,
  ❯ 1. Red (warm)                           options, each with a description line
       Warm red button
    4. Type something.                      (type your own answer)
  ──────────────────────────────
    5. Chat about this
  Enter to select · ↑/↓ to navigate · Esc to cancel

A digit picks an option at once in both (checked live). The trust question ("Yes, I trust this
folder") has no numbers and is left to the terminal: it's the owner's to answer there.

read(address) → the prompt as a dict, or None. answer(...) presses a key only while the same prompt
(by its `request` id) is still on screen. Only the app may answer: never a pal, never anything
running inside a herdr-core terminal.
"""

import hashlib
import json
import re
import subprocess
import time

RULE = re.compile(r"^\s*─{20,}\s*$")
DASH = re.compile(r"^\s*╌{10,}\s*$")
FOOT = re.compile(r"(Esc to cancel|Enter to select|Enter to confirm)")
OPTION = re.compile(r"^(\s*)(❯\s*)?(\d{1,2})\.\s+(.*\S)\s*$")
HEADER = re.compile(r"[☐☒✔✓]\s*([^☐☒✔✓→]+)")


def _hc(*args, timeout=15):
    try:
        r = subprocess.run(["hc", *args], capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, "", str(e)


def status(address):
    code, out, _ = _hc("get", address, "--json", timeout=10)
    try:
        return (json.loads(out).get("status") or {}) if code == 0 else {}
    except ValueError:
        return {}


def parse(lines, kind=None, msg=None):
    """The prompt at the foot of a screen (a list of lines), or None."""
    # Older Claude Code draws the block in a box: take the box's sides off.
    lines = [re.sub(r"^(\s*)[│┃]\s?|\s?[│┃]\s*$", r"\1", l.rstrip()) if re.match(r"^\s*[│┃]", l) and re.search(r"[│┃]\s*$", l.rstrip()) else l.rstrip()
             for l in lines]
    foot = next((i for i in range(len(lines) - 1, max(-1, len(lines) - 12), -1) if FOOT.search(lines[i])), None)
    if foot is None:
        return None
    opts_at = [i for i in range(foot) if OPTION.match(lines[i])]
    if not opts_at:
        return None
    first = opts_at[0]
    # The option list runs from the first numbered line to the foot; earlier numbered lines that
    # belong to the conversation (a list in the agent's reply) are cut off by the block's rule.
    start = next((i for i in range(first - 1, -1, -1) if RULE.match(lines[i])), None)
    if start is None:
        return None
    opts_at = [i for i in opts_at if i > start]
    first = opts_at[0]

    # Options, with their continuation lines (indented under the label).
    options = []
    for i in range(first, foot):
        line = lines[i]
        if not line.strip() or RULE.match(line):
            continue
        m = OPTION.match(line)
        if m:
            options.append({"n": int(m.group(3)), "label": m.group(4).strip(), "detail": "", "cursor": bool(m.group(2)),
                            "indent": len(m.group(1)) + (len(m.group(2)) if m.group(2) else 0)})
        elif options:
            options[-1].setdefault("more", []).append(line.strip())

    head = [l for l in lines[start + 1:first] if l.strip() and not DASH.match(l)]
    is_question = kind == "question" or any(HEADER.search(l) for l in head[:1]) or "Enter to select" in lines[foot]
    is_approval = kind == "permission" or any(l.strip().startswith("Do you want to") for l in head)
    out = {"foot": lines[foot].strip()}

    if is_approval and not (kind == "question"):
        for o in options:   # a long label wraps
            if o.get("more"):
                o["label"] = " ".join([o["label"], *o.pop("more")])
        q = next((l.strip() for l in head if l.strip().startswith("Do you want to")), "Do you want to proceed?")
        body = [l for l in lines[start + 1:first] if l.strip() and not l.strip().startswith("Do you want to")]
        # The command: between the two dashed rules, when there are two.
        dashes = [i for i in range(start + 1, first) if DASH.match(lines[i])]
        command = ""
        if len(dashes) >= 2:
            command = "\n".join(l.strip() for l in lines[dashes[0] + 1:dashes[1]] if l.strip())
        words = [l.strip() for l in body if not DASH.match(l) and l.strip() not in command.split("\n")
                 and not l.strip().startswith("Tip:") and not l.strip().startswith("│")]
        words = [w for w in words if not w.startswith("About the ")]
        title = words[0] if words else "Permission"
        if title in ("Tool use", "Tool Use") and len(words) > 1:   # an MCP tool: its name is the title
            words = words[1:]
            title = words[0]
        out.update(kind="approval", title=title, detail=words[1:4], command=command, question=q)
    elif is_question:
        for o in options:
            o["detail"] = " ".join(o.pop("more", []))
            o["type"] = bool(re.match(r"(?i)type something", o["label"]))
            o["chat"] = bool(re.match(r"(?i)chat about this", o["label"]))
        header = ""
        for l in head:
            m = HEADER.findall(l)
            if m:
                tabs = [x.strip() for x in m if x.strip()]
                header = tabs[0] if len(tabs) == 1 else " · ".join(tabs)
                out["steps"] = len(tabs)
                break
        text = [l.strip() for l in head if not HEADER.search(l)]
        out.update(kind="question", title=header or "Question", question=" ".join(text[-3:]) if text else (msg or ""),
                   multi=any(re.match(r"^\[[ x✔]\]", o["label"]) for o in options))
    else:
        return None
    for o in options:
        o.pop("more", None)
        o.pop("indent", None)
    out["options"] = options
    sig = json.dumps([out["kind"], out.get("title"), out.get("command"), out.get("question"),
                      [o["label"] for o in options]], ensure_ascii=False)
    out["request"] = hashlib.sha1(sig.encode()).hexdigest()[:12]
    return out


def read(address):
    st = status(address)
    if st.get("state") != "blocked":
        return None
    code, out, _ = _hc("read", address)
    if code != 0:
        return None
    p = parse(out.splitlines(), st.get("kind"), st.get("msg"))
    if p:
        p["msg"] = st.get("msg") or ""
        p["terminal"] = address
    return p


def answer(address, request, pick, text=None):
    """Press option `pick` on the prompt `request`, only while that same prompt is on screen. With
    `text`, `pick` must be the question's "Type something." option: the text is typed and sent.
    Returns {"result": "sent" | "changed" | "failed", "message"?}."""
    p = read(address)
    if not p or p["request"] != request:
        return {"result": "changed", "message": "The question on screen changed. Here is what it shows now."}
    opt = next((o for o in p["options"] if o["n"] == pick), None)
    if not opt:
        return {"result": "failed", "message": f"There's no option {pick}."}
    if text is not None and not opt.get("type"):
        return {"result": "failed", "message": "That option doesn't take a typed answer."}
    if opt.get("chat"):
        return {"result": "failed", "message": "Chat about it in the terminal."}
    code, _, err = _hc("keys", address, str(pick), timeout=10)
    if code != 0:
        return {"result": "failed", "message": (err or "hc keys failed").strip()[:200]}
    if text is not None:
        time.sleep(0.4)
        code, _, err = _hc("send", "--force", address, text, timeout=20)
        if code != 0:
            return {"result": "failed", "message": (err or "hc send failed").strip()[:200]}
    return {"result": "sent"}
