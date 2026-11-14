"""Approval boundaries. Every pal runs with permissions bypassed, so Project Pals adds its own gate for the
few things that leave the computer or can't be taken back: pushing, publishing, releasing,
merging, deploying, posting and messaging people. A Claude Code pal's command that matches
data/crew-policy.json is refused (PreToolUse hook) and becomes a request in the Inbox; once the owner
approves it there, the pal is told and that exact command goes through once.

This is a guard against mistakes and against one pal talking another into something, not a
security boundary: a pal with full permissions could still edit these files. Codex and other
harnesses without a pre-command hook aren't gated."""
import hashlib
import json
import os
import re
import subprocess
import time

from crewlib import DATA, APPROVALS, OWNER, load_json, save_json, locked, now_ms, new_id, feed, enqueue, CrewError

POLICY = DATA / "crew-policy.json"
# 15: helper-key (T116). 14 was taken by the build that went live unreviewed on 2026-11-10 (7692987,
# its helper-write rule), so an install already at 14 must still get this set: hence 15, and policy()
# also brings any saved policy up to date when a built-in rule is missing from it, whatever number it
# carries (two branches picking the same number can't strand a rule again).
# 13: the uninstall rule's '# --dry-run' fix and uninstall-indirect (Grok T56).
# 16: live-branch (T90) and base-branch (T136).
# 17: tap-write (T147). 16 was the live channel's (crew/live-updates).
# 18: nested-cwd (T205/T210): the flattened parser cannot vouch for nested execution cwd.
DEFAULTS_VERSION = 18
RETIRED_RULES = {"helper-write"}   # built-in once (7692987), replaced by helper-key: dropped, not kept as "a rule people added"
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
        # Uninstalling Project Pals is the owner's (T48). bin/crewuninstall.py checks that itself (a
        # click, or the owner typing at their own terminal); this holds a pal's ./install.sh --uninstall
        # before it gets that far. --dry-run only lists, so it's free, but only as an argument: in a
        # comment (`./install.sh --uninstall # --dry-run`) it's not one (Grok T56).
        {"name": "uninstall", "why": "uninstalls Project Pals",
         "pattern": r"(?![^#]*\s--dry-run(?:\s|$))(?:(?:ba)?sh\s+)?(?:\S*/)?install\.sh\b[^#]*\s--uninstall\b"},
        # The same through a terminal a pal makes (expect, script, unbuffer, a pty) or from code that
        # imports the uninstaller or reaches its click tokens (Grok T56 re-check). Catches the obvious
        # ways, not a pal set on getting around it (README says so).
        {"name": "uninstall-indirect", "why": "uninstalls Project Pals (through a pty or from code)",
         "check": "uninstall-indirect", "pattern": r"$^"},
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
        # And from an interpreter (python / node / perl / ruby / php …): code given with -c / -e or a
        # heredoc, or a script, that writes a quoted AGENTS.md / CLAUDE.md path; or a script handed one
        # as an argument (what it does there can't be seen). The shell parse above can't see inside
        # those (two such edits got past it on 2026-11-08).
        {"name": "agents-file-interpreter", "why": "writes the project's AGENTS.md or CLAUDE.md from a script (propose it instead: pal agents propose)",
         "check": "agent-file-interpreter", "pattern": r"$^"},
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
        # Trusted helpers (T116): the owner's own assistants send normal work in the owner's name with
        # a key. A pal doesn't read, copy or write those keys, doesn't write the list that says who's
        # trusted (data/crew-helpers), and doesn't present itself as a helper (PAL_HELPER=…). `pal`
        # refuses a key from inside a Herdr terminal as well; this holds the attempt and tells the owner.
        {"name": "helper-key", "why": "reaches for a trusted helper's key or name (those are the owner's assistants', not a pal's)",
         "check": "helper-keys", "pattern": r"$^"},
        # Relayed taps (T147, data/crew-taps): tickets, holds and the one-time tokens a hold runs with.
        # A file written there by hand would be a tap nobody made, or one let through early: like a
        # click token (owner-click). Pals read holds with `pal taps`.
        {"name": "tap-write", "why": "writes into the relayed taps (a ticket, a hold or a tap token nobody tapped)", "check": "tap-writes", "pattern": r"$^"},
        # The Live channel (T90): while the owner has it on, whatever lands on the branch it follows is
        # installed into their running Project Pals at once. So moving that branch by hand (git
        # update-ref refs/heads/main …, git branch -f main …) needs the click a landing needs. Off
        # (Stable, the default), this rule holds nothing. pal land is the way, held by "land".
        {"name": "live-branch", "why": "moves the branch the Live channel installs from (land it instead: pal land)",
         "check": "moves-live-branch", "pattern": r"$^"},
        # T136: landing by hand. `pal land` needs the owner's click, and `git update-ref refs/heads/main
        # <commit>` or `git branch -f main crew/x` does the same thing without it (pals landed that
        # way while the project folder was parked on another branch). Always on, every project: a
        # base branch (main, master, a topic's base) moved by name is held. `pal land` is the way.
        {"name": "base-branch", "why": "moves a project's base branch by hand (land it instead: pal land)",
         "check": "moves-base-branch", "pattern": r"$^"},
        # Nested literal runners lose ordering/cwd in the heuristic parse. Hold potentially
        # affected Git mutations for the owner, even when no other rule happens to match.
        {"name": "nested-cwd", "why": "uses a command execution context that needs owner review",
         "check": "nested-cwd", "pattern": r"$^"},
    ],
    "trusted": [],
}


def policy():
    p = load_json(POLICY, None)
    names = sorted(r["name"] for r in DEFAULT["guarded"])
    if not p:
        p = {**DEFAULT, "defaults_version": DEFAULTS_VERSION, "defaults_names": names}
        save_json(POLICY, p)
    elif p.get("defaults_version", 1) < DEFAULTS_VERSION \
            or (isinstance(p.get("defaults_names"), list) and set(names) - set(p["defaults_names"])):
        # Newer built-in rules replace the old built-in ones; rules people added stay. By number, and
        # also by name: `defaults_names` is the built-in set this file was last brought up to, so a
        # built-in rule it has never seen arrives even when another build used the same number first
        # (one the owner took out on purpose is in that list, and stays out).
        ours = set(names) | RETIRED_RULES
        p["guarded"] = DEFAULT["guarded"] + [r for r in p.get("guarded", []) if r.get("name") not in ours]
        p["defaults_version"] = DEFAULTS_VERSION
        p["defaults_names"] = names
        save_json(POLICY, p)
    return p


# A heredoc: keep its header line (`cat <<'EOF' > AGENTS.md` writes AGENTS.md), drop its body.
HEREDOC = re.compile(r"(<<-?\s*['\"]?(\w+)['\"]?)([^\n]*)\n.*?\n\s*\2\s*(?=\n|$)", re.S)
HEREDOC_BODY = re.compile(r"(<<-?\s*['\"]?(\w+)['\"]?)([^\n]*)\n(.*?)\n\s*\2\s*(?=\n|$)", re.S)   # HEREDOC, body kept
heredoc_free = lambda cmd: HEREDOC.sub(lambda m: m.group(1) + m.group(3), cmd)
SPLIT = re.compile(r"\n|;|&&|\|\||\||\$\(|`|\(|\{|\bthen\b|\bdo\b|\belse\b")
# These flattened delimiters do not guarantee that a cd executes in the outer shell.
CWD_UNCERTAIN_BOUNDARIES = {"$(", "`", "(", "|", "&&", "||", "then", "do", "else"}
INNER = re.compile(r"""\b(?:sh|bash|zsh|eval)\s+(?:-\w+\s+)*-c\s+(['"])(.*?)\1""", re.S)
# (A wrapper with options, `env -i …`, is left for normal_head, which knows them.)
LEAD = re.compile(r"""^\s*(?:(?:sudo|env|command|exec|nohup|time|timeout\s+\S+)\s+(?!-)|\w+=(?:'[^']*'|"[^"]*"|\S)*\s+)*""")


EVAL = re.compile(r"""\beval\s+(['"])(.*?)\1""", re.S)


def _sub_end(text, i):
    """Where a command substitution starting at text[i] ($( or a backtick) ends."""
    if text[i] == "`":
        j = text.find("`", i + 1)
        return len(text) if j < 0 else j + 1
    depth, j = 0, i + 1
    while j < len(text):
        depth += text[j] == "("
        depth -= text[j] == ")"
        j += 1
        if depth == 0:
            return j
    return len(text)


def mask_quotes(text):
    """The line with quoted text blanked (same length): a grep pattern "…|pal land|…" isn't a command
    (T26, a-707718). Inside double quotes, $( … ) and `…` still run, so they stay."""
    out, i, q = list(text), 0, None
    while i < len(text):
        c = text[i]
        if q == "'":
            if c == "'":
                q = None
            else:
                out[i] = "_"
        elif q == '"':
            if c == "\\" and i + 1 < len(text):
                out[i] = out[i + 1] = "_"
                i += 2
                continue
            if c == '"':
                q = None
            elif text.startswith("$(", i) or c == "`":
                i = _sub_end(text, i)
                continue
            else:
                out[i] = "_"
        elif c == "\\" and i + 1 < len(text):
            i += 2
            continue
        elif c in "'\"":
            q = c
        i += 1
    return "".join(out)


def commands(cmd, lead=False):
    """The commands a shell line runs: each segment's start, including inside sh -c '...' and
    eval '...', but not heredoc bodies (text being written to a file isn't a command), nor text in
    quotes (an argument, like a grep pattern). `lead`: keep what stands before each command (its
    VAR=value settings, env, sudo …) for a caller with rules about those; normal_words drops them."""
    text = heredoc_free(cmd)
    masked = mask_quotes(text)
    out = []
    for m in list(INNER.finditer(text)) + list(EVAL.finditer(text)):
        if masked[m.start()] != "_":        # a real sh -c / eval, not one quoted inside an argument
            out += commands(m.group(2), lead)
    last = 0
    for m in list(SPLIT.finditer(masked)) + [None]:
        seg = text[last:m.start()] if m else text[last:]
        last = m.end() if m else last
        seg = seg.strip() if lead else LEAD.sub("", seg).strip()
        if seg:
            out.append(seg)
    return out


# Wrappers that run the command after them (and the options that take a value), and package runners
# (npx vercel …): the gate looks at the command they run (T26).
WRAPPERS = {"sudo": {"-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U"}, "doas": {"-u", "-C"},
            "env": {"-u", "-C", "-S", "--unset", "--chdir"}, "command": set(), "exec": {"-a"}, "nohup": set(),
            "time": {"-f", "-o"}, "nice": {"-n", "--adjustment"}, "ionice": {"-c", "-n", "-p", "-P", "-u"},
            "stdbuf": {"-i", "-o", "-e"}, "timeout": {"-s", "-k", "--signal", "--kill-after"},
            "xargs": {"-I", "-i", "-n", "-L", "-l", "-P", "-d", "-a", "-E", "-e", "-s", "--max-args", "--delimiter"},
            "chronic": set(), "caffeinate": set(), "unbuffer": set(), "setsid": set(),
            "npx": {"-p", "--package", "-c", "--call"}, "bunx": {"-p", "--package"}, "uvx": {"--from", "--with", "-p", "--python"},
            "pnpx": set()}
RUNNER_SUBS = {"pnpm": {"dlx", "exec"}, "yarn": {"dlx", "exec"}, "npm": {"exec", "x"}, "uv": {"run", "tool"},
               "poetry": {"run"}, "bundle": {"exec"}, "pipx": {"run"}, "pdm": {"run"}, "hatch": {"run"}}
GIT_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"}


def normal_words(seg, dropped=None):
    """A command as the gate matches it: env assignments, wrappers (env, command, exec, nice, sudo,
    timeout, xargs …), package runners (npx, bunx, pnpm dlx, npm exec, uv run …) and the path to the
    binary dropped, and git's global options (-C dir, -c k=v, --no-pager …) before its subcommand.
    "env A=1 command /usr/bin/git -C r --no-pager push" → ["git", "push"].
    `dropped`, a dict, is given what was left out, for a caller that has rules about those too (the
    Chief's git): {"env": ["A=1"], "git": ["-C", "r", "--no-pager"]}."""
    import shlex
    try:
        toks = shlex.split(seg)
    except ValueError:
        toks = seg.split()
    while toks:
        head = os.path.basename(toks[0])
        if re.fullmatch(r"[A-Za-z_]\w*=.*", toks[0], re.S):
            if dropped is not None:
                dropped.setdefault("env", []).append(toks[0])
            toks = toks[1:]
            continue
        if head in RUNNER_SUBS and len(toks) > 1 and toks[1] in RUNNER_SUBS[head]:
            toks, takes = toks[2:], {"--from", "--with", "-p", "--package"}
        elif head in WRAPPERS:
            toks, takes = toks[1:], WRAPPERS[head]
        else:
            break
        while toks and toks[0].startswith("-") and toks[0] != "-":
            flag = toks.pop(0)
            if flag == "--":
                break
            if flag in takes and toks:
                toks.pop(0)
        if head == "timeout" and toks:
            toks = toks[1:]                 # its duration
    if not toks:
        return []
    toks[0] = os.path.basename(toks[0])
    if toks[0] == "git":
        i = 1
        while i < len(toks) and toks[i].startswith("-"):
            i += 2 if toks[i] in GIT_VALUE_OPTS else 1
        if dropped is not None:
            dropped.setdefault("git", []).extend(toks[1:i])
        toks = ["git"] + toks[i:]
    return toks


def normal_head(seg):
    return " ".join(normal_words(seg))


AGENT_FILE = re.compile(r"(^|/)(AGENTS|CLAUDE)\.md$")
REDIRECT = {">", ">>", ">|", "&>", "&>>", ">&"}
SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", "|&", ";;"}
COPIERS = {"cp", "mv", "install", "ln", "rsync"}
# Terminal editors (review H3 leftover): anything they open may be written, and so may any file their
# own commands name (vim -c 'w AGENTS.md', +cmd, emacs --eval, ed's commands from a heredoc).
EDITORS = {"ed", "red", "ex", "vi", "vim", "nvim", "sudoedit", "view", "rview", "rvim", "vimdiff", "nvi", "elvis", "gvim",
           "nano", "rnano", "pico", "micro", "emacs", "emacsclient", "mg", "jed", "joe", "jmacs", "jstar",
           "kak", "hx", "helix", "mcedit", "ne", "zile", "amp",
           # and the desktop ones a pal can start (Grok review H2: `code AGENTS.md`)
           "code", "codium", "code-insiders", "cursor", "zed", "subl", "gedit", "gnome-text-editor", "kate",
           "kwrite", "mousepad", "xed", "pluma", "leafpad", "geany"}
# Editors that also take their commands from stdin (a heredoc, a here-string, printf … | ed).
STDIN_EDITORS = {"ed", "red", "ex"}
# vim options whose value is a script it runs (-S session, -u vimrc, -s scriptin outside Ex mode).
EDITOR_SCRIPTS = {"-S", "-u", "-s"}
_PIECES = re.compile(r"[\s|;()\"'`]+")
SEP = re.compile(r";|&&|\|\||\|&?|(?<![<>&])&(?![&>])")


def _pieces(text):
    """Words of an editor command or script: `w AGENTS.md|q` → w, AGENTS.md, q."""
    return [p.lstrip("+!") for p in _PIECES.split(text or "") if p.strip("+!")]


def _ex_mode(name, args):
    """Is this editor reading its commands from stdin? ed / ex always; vim in Ex mode (-e, -es, -E)."""
    return name in STDIN_EDITORS or any(re.fullmatch(r"-[a-zA-Z]*[eE][a-zA-Z]*", a) for a in args)


def _script_words(path):
    try:
        with open(os.path.expanduser(path), errors="replace") as f:
            return _pieces(f.read(400000))
    except OSError:
        return []


def _editor_heredocs(cmd):
    """Heredoc bodies fed to an editor that reads commands from stdin (ed x <<EOF … w AGENTS.md …)."""
    out = []
    for m in HEREDOC.finditer(cmd):
        # The command the heredoc is fed to: the one around its << marker.
        before, after = cmd[cmd.rfind("\n", 0, m.start()) + 1:m.start()], m.group(3)
        start = max([s.end() for s in SEP.finditer(mask_quotes(before))], default=0)
        cut = next((s.start() for s in SEP.finditer(mask_quotes(after))), len(after))
        words = [w for w in normal_words(before[start:] + " " + after[:cut]) if not w.startswith(("<", ">"))]
        if words and words[0] in EDITORS and _ex_mode(words[0], words[1:]):
            body = m.group(0)[len(m.group(1)) + len(m.group(3)):]
            out += _pieces(body)
    return out


def _edited_files(name, args):
    """The files sed -i / perl -i edit: not their script (sed's first word without -e / -f, or what
    follows -e / -f), which only names what it replaces (a-15ccbe: `sed -i 's|/crew-clicks/|…|' x`)."""
    out, takes, script_given, k = [], {"-e", "-E", "-f", "--expression", "--file"} if name == "sed" else {"-e", "-E"}, False, 0
    while k < len(args):
        a = args[k]
        if a in takes or (name == "perl" and re.fullmatch(r"-\w*[eE]", a)):
            script_given, k = True, k + 2
            continue
        if a.startswith(("--expression=", "--file=")):
            script_given = True
        elif not a.startswith("-"):
            out.append(a)
        k += 1
    return out if script_given or not out else out[1:]


def write_targets(cmd):
    """The files a shell line writes to, as far as a plain parse can tell: redirect targets, tee's
    files, sed / perl -i files, sed's own w commands, cp / mv / install / ln / rsync destinations,
    dd of=, and every file a terminal editor opens or its commands name (ed, ex, vim -c / +cmd / -es,
    nano, emacs …). Inside sh -c '…' too. Heredoc bodies are dropped but their header lines are
    kept, except a body fed to ed / ex, which is that editor's commands."""
    import shlex
    text = heredoc_free(cmd)
    out = _editor_heredocs(cmd)
    for inner in INNER.findall(text):
        out += write_targets(inner[1])
    for line in text.splitlines():
        lex = shlex.shlex(line, posix=True, punctuation_chars=";&|()<>")
        lex.whitespace_split = True
        try:
            toks = list(lex)
        except ValueError:          # an unbalanced quote: fall back to plain words
            toks = line.split()
        cmds, cur, sep = [], [], None
        for tk in toks:
            if tk in SEPARATORS:
                if cur:
                    cmds.append((cur, sep))
                cur, sep = [], tk
            else:
                cur.append(tk)
        if cur:
            cmds.append((cur, sep))
        piped = []                          # what printf / echo just piped on (ed's commands, maybe)
        for words, sep in cmds:
            feeding, piped = (piped if sep in ("|", "|&") else []), []
            i, plain, stdin = 0, [], []
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
                if w in ("<", "<<<") or re.fullmatch(r"\d+<|<>", w):   # input: a file, or a here-string's text
                    if i + 1 < len(words):
                        stdin.append((w, words[i + 1]))
                    i += 2
                    continue
                plain.append(w)
                i += 1
            # The command as run: env assignments, wrappers (nice, sudo -u x, timeout 5 …) and the path dropped (T26).
            plain = normal_words(shlex.join(plain)) if plain else []
            if not plain:
                continue
            name, args = plain[0], plain[1:]
            files = [a for a in args if not a.startswith("-")]
            if name in ("printf", "echo"):
                piped = [p for a in args for p in _pieces(a.replace("\\n", " ").replace("\\t", " "))]
            if name in EDITORS:
                # Every file it opens, and every word of its own commands (-c 'w X', +cmd, --eval …).
                # (code -g AGENTS.md:12: a line and column after the file name)
                out += [re.sub(r"(?::\d+)+$", "", p) for a in args if not re.fullmatch(r"--?[\w-]+", a) for p in _pieces(a)]
                if _ex_mode(name, args):    # commands from stdin: a here-string, printf … |
                    out += feeding + [p for how, s in stdin if how == "<<<" for p in _pieces(s)]
                    out += [p for how, s in stdin if how != "<<<" for p in _script_words(s)]
                ex = _ex_mode(name, args)   # in Ex mode, -s means silent, not a script
                out += [p for k, a in enumerate(args[:-1]) if a in EDITOR_SCRIPTS and (a != "-s" or not ex)
                        for p in _script_words(args[k + 1])]
            elif name == "sed":             # sed's own w / W commands write a file: sed -n 'w AGENTS.md' x
                out += [m.group(1) for a in args for m in re.finditer(r"(?:^|[;\n{}/]|\s)[wW]\s+(\S+)", a)]
            if name == "tee":
                out += files
            elif name in ("sed", "perl") and any(a.startswith("-i") or a == "--in-place" or (name == "perl" and re.fullmatch(r"-\w*i\w*", a)) for a in args):
                out += _edited_files(name, args)
            elif name in COPIERS and files:
                out.append(files[-1])
            elif name == "dd":
                out += [a[3:] for a in args if a.startswith("of=")]
            elif name in ("truncate", "touch") and files:
                out += files
    return out


def writes_agent_file(cmd):
    return any(AGENT_FILE.search(os.path.normpath(t.strip("'\""))) for t in write_targets(cmd))


INTERP = re.compile(r"^(?:\S*/)?(?:python[\d.]*|pypy[\d.]*|node(?:js)?|deno|bun|tsx|ts-node|perl[\d.]*|ruby|php[\d.]*|lua[\d.]*|Rscript|osascript)$")
RUNNER = re.compile(r"^(?:(?:uv|poetry|pipenv|bundle)\s+(?:run|exec)|uvx|npx|bunx|pnpm\s+(?:exec|dlx))\s+")
# A quoted path that ends in AGENTS.md / CLAUDE.md ("AGENTS.md", '/x/CLAUDE.md', f"{d}/AGENTS.md"):
# a mention inside prose ("see AGENTS.md for…") isn't one.
AGENT_PATH = re.compile(r"""['"][^'"`\n]*\b(?:AGENTS|CLAUDE)\.md['"]""")   # not `…`: Markdown's code quotes
# Calls that write, move or copy a file, in the interpreters above.
WRITE_CALL = re.compile(r"""\bopen\s*\((?:[^()]|\([^()]*\))*?,\s*['"][^'"]*[wax+]"""   # open(os.path.join(…), "w") too
                        r"""|\bopen\s*\((?:[^()]|\([^()]*\))*?\bmode\s*=\s*['"][^'"]*[wax+]"""   # mode="w" too (Grok review H2)
                        r"""|\.open\s*\(\s*['"][^'"]*[wax+]|\.write_(?:text|bytes)\s*\(|\bshutil\.(?:copy\w*|move)\s*\(|\bos\.(?:rename|replace)\s*\("""
                        r"""|\.(?:rename|touch)\s*\(\s*(?:\w|['"])|\b(?:write|append)File(?:Sync)?\s*\(|\bcreateWriteStream\s*\(|\bcopyFile(?:Sync)?\s*\(|\brename(?:Sync)?\s*\("""
                        r"""|\bDeno\.write\w*\s*\(|\bBun\.write\s*\(|\bFile\.(?:write|open|rename)\b|\bIO\.write\b|\bFileUtils\.|\bopen\s*\(?\s*(?:my\s+)?\$?\w*\s*,\s*['"]?\+?>|\bfile_put_contents\s*\(|\bfopen\s*\([^)]*['"][wax]""")


def _statements(code):
    """Code split into statements: at newlines and ';' outside brackets and quotes, so a call over
    several lines stays one. Rough (no full parser): when unsure it keeps text together, which can
    only make a hold more likely, never less."""
    out, cur, depth, quote, i = [], [], 0, None, 0
    while i < len(code):
        c = code[i]
        if quote:
            cur.append(c)
            if c == "\\" and i + 1 < len(code):
                cur.append(code[i + 1]); i += 2; continue
            if c == quote or (c == "\n" and quote in "'\""):
                quote = None
        elif code.startswith(('"""', "'''"), i):   # Python's triple quotes run across lines (a-27dc50)
            j = code.find(code[i:i + 3], i + 3)
            j = len(code) if j < 0 else j + 3
            cur.append(code[i:j]); i = j; continue
        elif c in "'\"`":
            quote = c; cur.append(c)
        elif c == "#" and (not cur or cur[-1] in " \t\n") and depth == 0:
            while i < len(code) and code[i] != "\n":   # a comment to the end of the line
                i += 1
            continue
        elif c in "([{":
            depth += 1; cur.append(c)
        elif c in ")]}":
            depth = max(0, depth - 1); cur.append(c)
        elif c in "\n;" and depth == 0:
            out.append("".join(cur)); cur = []
        else:
            cur.append(c)
        i += 1
    out.append("".join(cur))
    return [x.strip() for x in out if x.strip()]


def _string_spans(text):
    """Where the string literals in one statement are, as (start, end): quotes, backticks, Python's
    triple quotes."""
    spans, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2; continue
        if text.startswith(('"""', "'''"), i):
            j = text.find(text[i:i + 3], i + 3)
            j = n if j < 0 else j + 3
        elif c in "'\"`":
            j = i + 1
            while j < n and text[j] != c and not (c != "`" and text[j] == "\n"):
                j += 2 if text[j] == "\\" else 1
            j = min(j + 1, n)
        else:
            i += 1; continue
        spans.append((i + (2 if j - i >= 6 and text[i] == text[i + 1] == text[i + 2] else 0), j)); i = j   # from its last opening quote
    return spans


def _in_string(spans, pos):
    """Is pos inside a string literal, past its opening quote? A command quoted inside a string (a test
    case "python3 -c \"open('AGENTS.md','w')…\"", a-2bb994) or Markdown quoting `vim -c 'w AGENTS.md'`
    (a-27dc50) is text, not a path or a call."""
    return any(s < pos < e for s, e in spans)


def _write_call(text, spans=()):
    return any(not _in_string(spans, m.start()) for m in WRITE_CALL.finditer(text))


# Code that runs commands: there a string can itself be code (subprocess.run(["python3", "-c", "…"])),
# so text inside strings still counts.
RUNS_COMMANDS = re.compile(r"""\bsubprocess\b|\bos\.(?:system|popen|exec\w*|spawn\w*)\b|\bchild_process\b|\bexec(?:Sync|File\w*)?\s*\("""
                           r"""|\bspawn(?:Sync)?\s*\(|\bDeno\.(?:run|Command)\b|\bBun\.spawn|\bsystem\s*\(|\bIO\.popen|\bOpen3\b|\bqx\b"""
                           r"""|\b(?:shell_exec|passthru|proc_open|popen)\s*\(|\beval\s*\(""")


# Around a mention of an agent file (or a name holding one), what makes it harmless: compared, tested
# for membership, read, or printed. (lab.py: `if item.name in ("AGENTS.md", "CLAUDE.md"): continue`
# while it writes a tarball; T25.)
_INERT_BEFORE = re.compile(r"""(?:\b(?:not\s+)?in\s*[(\[{][^()\[\]{}]*|\bin\s+|(?:==|!=|===|!==|<>)\s*"""
                           r"""|\.(?:endswith|startswith|includes|has|count|index|find|match|search|fullmatch|test|get)\s*\([^()]*"""
                           r"""|\bfnmatch\w*\s*\([^()]*|\b(?:readFileSync|readFile|read_text|read_bytes|exists|existsSync|isfile|is_file)\s*\([^()]*"""
                           r"""|\b(?:print|puts|echo|say|warn|die|log|info|debug|warning|error|console\.\w+|logging\.\w+|raise\s+\w+|throw\s+new\s+\w+)\s*\([^()]*)$""")
_INERT_AFTER = re.compile(r"""^\s*(?:==|!=|===|!==|\b(?:not\s+)?in\b|\)\s*\.(?:read\w*|exists|is_file|stat)\s*\(|\.(?:read\w*|exists|is_file|stat)\s*\()""")
_ASSIGN = re.compile(r"""^(?:(?:const|let|var|my|our|local)\s+)?([$@%]?\w+)\s*(?::[^=]+)?(?:\+|\|)?=(?!=)""")
_FOR = re.compile(r"""^(?:for|foreach)\s*\(?\s*(?:const|let|var|my)?\s*([$]?\w+)\s*(?:\bin\b|\bof\b|\()""")


def _active(stmt, start, end):
    """Is the mention at stmt[start:end] used (not just compared, read or printed)?"""
    before, after = stmt[:start], stmt[end:]
    if re.search(r"\bopen\s*\(\s*$", before) and re.match(r"\s*\)", after):
        return False   # open("AGENTS.md") with no mode: a read
    return not (_INERT_BEFORE.search(before) or _INERT_AFTER.match(after))


def code_writes_agent_file(code, quoted_text=False, path_re=None):
    """Does this code write an AGENTS.md / CLAUDE.md? Only when a write call's target is one: the
    quoted path itself in that statement, or a name that holds it (assigned from it, or looping
    over it). A use the parse can't follow (handed to a function, say) still holds when the code
    writes anything at all, as the rule did before T25.
    quoted_text: this is the code itself (a script file, a heredoc fed to the interpreter), not a
    shell line around it, so what's quoted inside a string literal is text. Not when the code runs
    commands: a string can be code there. path_re: what counts as the guarded path (AGENT_PATH; the
    queue's, the clicks' and the desk's for their rules)."""
    path_re = path_re or AGENT_PATH
    stmts = _statements(code)
    spans = {st: (_string_spans(st) if quoted_text else ()) for st in stmts}
    aware = quoted_text and not any(not _in_string(spans[st], m.start()) for st in stmts for m in RUNS_COMMANDS.finditer(st))
    if not aware:
        spans = {st: () for st in stmts}
    tainted, unknown = set(), False
    for _ in range(3):   # names that carry the path, to a fixed point (a = "AGENTS.md"; b = a)
        grew = False
        for st in stmts:
            hits = [m.span() for m in path_re.finditer(st)]
            hits += [m.span() for n in tainted for m in re.finditer(r"(?<![\w$@%])" + re.escape(n) + r"\b", st)]
            hits = [h for h in hits if not _in_string(spans[st], h[0])]
            # In `for f in FILES`, what follows `in` is what f takes, not a membership test.
            loop = _FOR.match(st)
            live = [h for h in hits if _active(st, *h) or (loop and h[0] >= loop.end())]
            if not live:
                continue
            if _write_call(st, spans[st]):
                return True
            m = _ASSIGN.match(st) or _FOR.match(st)
            if m:
                lhs_end = m.end()
                if any(a >= lhs_end for a, _b in live) and m.group(1) not in tainted:
                    tainted.add(m.group(1)); grew = True
                continue
            unknown = True
        if not grew:
            break
    return unknown and (any(_write_call(st, spans[st]) for st in stmts) if aware else bool(WRITE_CALL.search(code)))


# Project Pals' own commands, as they sit in bin/ next to this file (pal is crew, pal-room crew-room).
OWN_CLI = {"crew", "crew-room", "crewd", "crew-hook", "crew-statusline",
           "crewuninstall.py"}   # checks the owner itself; uninstall-indirect holds a real run


def writes_agent_file_via_interpreter(cmd, path_re=None, file_re=None):
    """An interpreter in the line, and an AGENTS.md / CLAUDE.md path it writes (or a script handed one).
    path_re / file_re: another guarded place (the queue, the clicks, the desk), as a quoted path in
    code and as a script's argument."""
    AGENT_PATH = path_re or globals()["AGENT_PATH"]
    agent_arg = file_re or re.compile(r"(^|/)(?:AGENTS|CLAUDE)\.md$")
    code_writes = lambda code, **kw: code_writes_agent_file(code, path_re=AGENT_PATH, **kw)
    segs = []
    for seg in commands(cmd):
        words = normal_words(RUNNER.sub("", seg))   # behind env, nice, uv run … too (T26)
        if words and INTERP.match(words[0]):
            segs.append(words)
    if not segs:
        return False
    # A heredoc fed to the interpreter is its code, so it's judged as code (a-2bb994, a-27dc50).
    bodies = []

    def fed(m):
        line = commands(cmd[cmd.rfind("\n", 0, m.start()) + 1:m.start()])
        words = normal_words(RUNNER.sub("", line[-1])) if line else []
        if not (words and INTERP.match(words[0])):
            return m.group(0)
        bodies.append(m.group(4))
        return m.group(1) + m.group(3)
    rest = HEREDOC_BODY.sub(fed, cmd)
    for body in bodies:
        if AGENT_PATH.search(body) and WRITE_CALL.search(body) and code_writes(body, quoted_text=True):
            return True
    # The rest of the line: -c / -e code, or a script written and run in one go (shell quoting around it).
    if AGENT_PATH.search(rest) and WRITE_CALL.search(rest) and code_writes(rest):
        return True
    for words in segs:
        args = words[1:]
        if any(a in ("-c", "-e", "-E", "-p", "-r", "--eval", "-") or a.startswith("<<") for a in args):
            continue   # inline code: judged above
        if any(agent_arg.search(os.path.normpath(a.strip("'\""))) for a in args):
            return True   # a script handed a guarded path
        script = next((a for a in args if not a.startswith("-")), None)
        if not script:
            continue
        real = os.path.realpath(os.path.expanduser(script))
        if os.path.basename(real) in OWN_CLI and os.path.exists(os.path.join(os.path.dirname(real), "crewguard.py")):
            continue   # Project Pals' own CLI (python3 bin/crew …, a-c3849a): its owner-only writes are gated inside it
        try:
            with open(os.path.expanduser(script), errors="replace") as f:
                text = f.read(400000)
        except OSError:
            continue
        if AGENT_PATH.search(text) and WRITE_CALL.search(text) and code_writes(text, quoted_text=True):
            return True   # the script itself writes one
    return False


def _place(names):
    """For one of Project Pals' own data folders: (a quoted path into it in code, a path argument into it).
    A folder of that name right under mods/ is a mod's source code (mods/crew-desk), not the data (T68)."""
    alt = "|".join(re.escape(n) for n in names)
    return (re.compile(r"""['"][^'"`\n]*(?<!\bmods/)\b(?:""" + alt + r""")(?![\w.-])[^'"`\n]*['"]"""),
            re.compile(r"(?:^|(?<!\bmods)/)(?:" + alt + r")(?:/|$)"))


SOURCE_DIRS = {"mods"}   # where a folder named like the data is code: the repo's mods/, Herdr's mods/


def into_place(path, names):
    """Is `path` inside one of Project Pals' data folders `names` (crew-desk, crew-clicks, …)?
    T68 (2026-11-09): the Desk's mods (mods/crew-desk/main.js) were held as card writes. A folder of
    that name right under mods/ is a mod's source, not the data, unless the path resolves (links
    included) into the real data folder. Any other place with that folder name still counts: data
    may live elsewhere (CREW_DATA, a variable we can't expand)."""
    p = os.path.normpath(path.strip("'\""))
    comps = p.split(os.sep)
    for i, c in enumerate(comps):
        if c in names:
            parent = comps[i - 1] if i else ("" if os.path.isabs(p) else os.path.basename(os.getcwd()))
            if parent not in SOURCE_DIRS:
                return True
    try:
        real = os.path.realpath(os.path.expanduser(p))
        for n in names:
            d = os.path.realpath(DATA / n)
            if real == d or real.startswith(d + os.sep):
                return True
    except (OSError, ValueError):
        pass
    return False


def _edited(cmd):
    """The path of an Edit-tool write (the hook passes it as `edit <path>`), else None."""
    m = re.match(r"^edit\s+(.+)$", cmd)
    return m.group(1).strip() if m else None


CLICK_PLACE, QUEUE_PLACE, DESK_PLACE = _place(["crew-clicks"]), _place(["crew-queue", "crew-queue-sent"]), _place(["crew-desk"])


def writes_click(cmd):
    """A write INTO data/crew-clicks (redirect, tee, cp/mv onto it, …, or from a script: Grok review
    H2); mentioning it isn't one."""
    return _writes_into(cmd, {"crew-clicks"}, CLICK_PLACE)


def writes_queue(cmd):
    """A write INTO data/crew-queue (as writes_click); `pal tell` writing its own file isn't a shell write."""
    return _writes_into(cmd, {"crew-queue", "crew-queue-sent"}, QUEUE_PLACE)


def writes_desk(cmd):
    """A write INTO data/crew-desk (as writes_queue); the Desk's mods (mods/crew-desk/…) aren't its cards (T68)."""
    return _writes_into(cmd, {"crew-desk"}, DESK_PLACE)


TAPS_PLACE = _place(["crew-taps"])


def writes_taps(cmd):
    """A write INTO data/crew-taps (as writes_click): a ticket, a hold or a tap token made by hand
    would be a tap nobody tapped (T147). `pal taps` reading them isn't a write."""
    return _writes_into(cmd, {"crew-taps"}, TAPS_PLACE)


def _writes_into(cmd, names, place):
    edited = _edited(cmd)
    if edited is not None:
        return into_place(edited, names)
    return any(into_place(t, names) for t in write_targets(cmd)) or writes_agent_file_via_interpreter(cmd, *place)


# ─── Trusted helpers' keys (T116) ───────────────────────────────────────────────────────────────
HELPER_DATA = {"crew-helpers", "crew-helper"}   # (crew-helper: where build 7692987 kept its key and receipts, until carried over)
HELPERS_PLACE = _place(sorted(HELPER_DATA))
# ~/.config/project-pals/helpers, however it's written; and the older build's key inside the data folder.
# The folder above the keys counts too: a search pointed at ~/.config/project-pals reads them (T122).
HELPER_KEYS_DIR = re.compile(r"(?:^|[^\w-])project-pals/helpers(?![\w-])|(?:^|[^\w.-])\.config/project-pals(?![\w-])"
                             r"|(?:^|[^\w-])crew-helper/pals\.key\b")
HELPER_KEY_TEXT = re.compile(r"palkey_[A-Za-z0-9_-]{20,}")                    # a key itself, wherever one turns up
# Keys are sealed at rest (crewhelpers.seal): asking systemd to unseal one is reaching for it, on purpose.
HELPER_UNSEAL = re.compile(r"\bsystemd-creds\b[^\n]*\bpal-helper-|\bpal-helper-[^\n]*\bsystemd-creds\b|\bcrewhelpers\._(?:unseal|read_key)\b")
# Presenting as a helper: PAL_HELPER=Pals pal tell …, export PAL_HELPER, env PAL_HELPER=… (as a
# command, not inside a quoted pattern), or code that puts it in a child's environment.
HELPER_ENV = re.compile(r"\bPAL_HELPER(?:_KEY_FILE)?=|\bexport\s+(?:-\w+\s+)*PAL_HELPER|(?:^|\s)--as-helper(?:=|\s|$)")
HELPER_ENV_CODE = re.compile(r"""\benviron\b|\bputenv\b|\bsetenv\b|\bprocess\.env\b|\bENV\s*\[|\benv\s*=|\benv\s*:""")


def in_helper_keys(path):
    """Is `path` in the folder where trusted helpers' keys live (by name, or once links are resolved)?"""
    p = os.path.normpath((path or "").strip("'\""))
    if HELPER_KEYS_DIR.search(p):
        return True
    try:
        real = os.path.realpath(os.path.expanduser(p))
        keys = os.path.realpath(os.path.expanduser("~/.config/project-pals"))
        return real == keys or real.startswith(keys + os.sep)
    except (OSError, ValueError):
        return False


def touches_helpers(cmd):
    """A pal's command that reaches for a helper's key (reading counts: a key that's been read has
    leaked), writes the list of who's trusted, or presents itself as a helper. The helpers' mod
    (mods/crew-helpers/…) and Project Pals' own source are code, not the keys. Catches the plain
    ways; it's a guard against mistakes and persuasion (README), and `pal` checks again itself."""
    edited = _edited(cmd)
    if edited is not None:
        return in_helper_keys(edited) or into_place(edited, HELPER_DATA)
    if HELPER_KEYS_DIR.search(cmd) or HELPER_KEY_TEXT.search(cmd) or HELPER_UNSEAL.search(cmd):
        return True
    # As a command: on the line itself, or in one a shell is handed (bash -c '…', eval "…"). Not
    # commands(): it drops leading VAR=value words, which is the very thing looked for here.
    if any(HELPER_ENV.search(mask_quotes(t)) for t in _shell_texts(cmd)):
        return True
    if "PAL_HELPER" in cmd and HELPER_ENV_CODE.search(cmd) and (INTERP_ANY.search(cmd) or HEREDOC.search(cmd)):
        return True
    return _writes_into(cmd, HELPER_DATA, HELPERS_PLACE)


def _shell_texts(cmd, depth=0):
    """The line (heredoc bodies dropped) and every line it hands a shell with -c or eval, a few levels deep."""
    text = heredoc_free(cmd)
    out = [text]
    if depth < 3:
        for m in list(INNER.finditer(text)) + list(EVAL.finditer(text)):
            out += _shell_texts(m.group(2), depth + 1)
    return out


INTERP_ANY = re.compile(r"(?:^|[\s;&|(/])(?:python[\d.]*|pypy[\d.]*|node(?:js)?|deno|bun|tsx|ts-node|perl[\d.]*|ruby|php[\d.]*|lua[\d.]*)\b")


# ─── Uninstall through a pty or from code (Grok T56 re-check) ───────────────────────────────────
PTY_WRAPPERS ={"expect", "script", "unbuffer", "socat", "empty", "pty", "ptyrun", "faketty", "dtach",
                "abduco", "tmux", "screen", "zpty", "pexpect"}
NAMES_UNINSTALL = re.compile(r"install\.sh\b[^\n#]*--uninstall\b|\bcrewuninstall\b")
# Code that loads the uninstaller or reaches the click tokens it trusts.
UNINSTALL_CODE = re.compile(r"""\b(?:import|from)\s+crewuninstall\b|(?:__import__|import_module|require)\s*\(\s*['"][^'"]*crewuninstall"""
                            r"""|\bcrewuninstall\.(?!py\b)\w+|\bCLICKS\b|\bclick_ok\b""")   # (not the file name)
PTY_CODE = re.compile(r"""\bpty\b|\bopenpty\b|\bforkpty\b|\bpexpect\b|node-pty""")
NOT_RUN = ("py_compile", "compileall", "pydoc", "pyflakes", "pylint", "flake8", "black", "ruff", "mypy")


def runs_uninstall(cmd):
    """The uninstall wrapped in a pty program, or code that imports the uninstaller, reaches its click
    tokens, or runs the uninstall under a pty. --dry-run by itself (no wrapper, no code) stays free."""
    segs = [normal_words(RUNNER.sub("", s)) for s in commands(cmd)]
    heads = {os.path.basename(w[0]) for w in segs if w}
    if heads & PTY_WRAPPERS and NAMES_UNINSTALL.search(cmd):
        return True
    for words in segs:
        if not words or not INTERP.match(words[0]):
            continue
        args = words[1:]
        if "-m" in args and any(a in NOT_RUN for a in args):
            continue   # compiles or lints it; nothing runs
        if UNINSTALL_CODE.search(cmd) or (PTY_CODE.search(cmd) and NAMES_UNINSTALL.search(cmd)):
            return True   # -c / -e code, a heredoc, or the rest of the line
        script = next((a for a in args if not a.startswith("-")), None)
        if not script:
            continue
        if os.path.basename(script) == "crewuninstall.py":
            rest = args[args.index(script) + 1:]
            if rest[:1] == ["uninstall"] and "--dry-run" not in rest:
                return True
            continue
        try:
            with open(os.path.expanduser(script), errors="replace") as f:
                text = f.read(400000)
        except OSError:
            continue
        if UNINSTALL_CODE.search(text) and os.path.basename(script) not in ("crew", "crewuninstall.py"):
            return True   # a script file that loads it
    return False


# ─── Commands run from inside other code (Grok review H2) ───────────────────────────────────────
# A heredoc fed to bash is a script it runs, like sh -c '…'; a string handed to os.system /
# subprocess / child_process / system / backticks is a command line. matches() judges those with the
# same rules. Best effort: it catches a mistake (or one pal talking another into it), not a pal set on
# getting around it (a command built from pieces, base64, a script file written first …).
SHELL_RUNNERS = {"sh", "bash", "zsh", "dash", "ksh", "mksh", "yash"}
INLINE_CODE = ("-c", "-e", "-E", "-r", "--eval", "-p", "--print")


def _stdin_text(cmd):
    """(words of a command, text fed to its stdin): heredoc bodies, here-strings, echo / printf | it."""
    out = []
    for m in HEREDOC_BODY.finditer(cmd):
        line = commands(cmd[cmd.rfind("\n", 0, m.start()) + 1:m.start()])
        words = normal_words(RUNNER.sub("", line[-1])) if line else []
        piped = re.match(r"\s*\|&?\s*(.+)", mask_quotes(m.group(3)))
        if piped and (not words or words[0] == "cat"):   # cat <<'EOF' | bash: the body goes to bash
            words = normal_words(RUNNER.sub("", m.group(3)[piped.start(1):]))
        out.append((words, m.group(4)))
    for line in heredoc_free(cmd).splitlines():
        masked, last, parts = mask_quotes(line), 0, []
        for s in SEP.finditer(masked):
            parts.append((line[last:s.start()], s.group(0)))
            last = s.end()
        parts.append((line[last:], None))
        fed = None
        for text, sep in parts:
            words = normal_words(RUNNER.sub("", text.strip()))
            if "<<<" in words[:-1]:
                out.append((words, words[words.index("<<<") + 1]))
            if fed is not None and words:
                out.append((words, fed))
            fed = None
            if sep in ("|", "|&") and words and words[0] in ("echo", "printf"):
                fed = " ".join(w for w in words[1:] if not re.fullmatch(r"-[neE]+", w)).replace("\\n", "\n")
    return out


def _literal(st, span):
    """A string literal's text (quotes and simple escapes undone)."""
    t = st[span[0]:span[1]]
    q, body = t[0], t[1:]
    body = body[:-3] if body.endswith(q * 3) else body[:-1] if body.endswith(q) else body
    return re.sub(r"\\(.)", lambda m: "\n" if m.group(1) == "n" else m.group(1), body)


def run_strings(cmd, overflow=None):
    """Command lines inside the line; optionally report truncated runnable statements."""
    out = [t for w, t in _stdin_text(cmd) if w and w[0] in SHELL_RUNNERS]
    code = [(w[0], t) for w, t in _stdin_text(cmd) if w and INTERP.match(w[0])]
    for seg in commands(cmd):
        words = normal_words(RUNNER.sub("", seg))
        if words and INTERP.match(words[0]):
            code += [(words[0], words[k + 1]) for k in range(1, len(words) - 1) if words[k] in INLINE_CODE]
    for name, text in code:
        stmts = _statements(text)
        spans = {st: _string_spans(st) for st in stmts}
        runs = lambda st: any(not _in_string(spans[st], m.start()) for m in RUNS_COMMANDS.finditer(st))
        held = {}   # names given a command in an earlier statement: cmd = ["git", "push"]
        for st in stmts:
            lits = [_literal(st, sp) for sp in spans[st]]
            m = _ASSIGN.match(st)
            if m and lits and not runs(st):
                held[m.group(1)] = lits
        backticks = re.match(r"(?:perl|ruby|php)", os.path.basename(name))
        for st in stmts:
            if backticks:   # `git push` runs it in Perl, Ruby and PHP
                out += [_literal(st, sp) for sp in spans[st] if st[sp[0]] == "`"]
            if not runs(st):
                continue
            lits = [_literal(st, sp) for sp in spans[st]]
            for n, v in held.items():
                if re.search(r"(?<![\w$@%])" + re.escape(n) + r"\b", st):
                    lits += v
            # Each literal, and each run of them to the end: spawn("git", ["push"]) after
            # require("child_process") in one statement is "git push" only from its 2nd literal on.
            if len(lits) > 40 and overflow is not None:
                overflow.append("interpreter-literals")
            lits = lits[:40]
            out += lits + [" ".join(lits[k:]) for k in range(len(lits))]
    return [c for c in out if c and c.strip()]


# ─── The branch the Live channel follows (T90; Codex T94) ──────────────────────────────────────
HOOK_CWD = None   # the folder the command runs in, when the hook knows it (bin/crew-hook sets it)
# git subcommands that move the branch that's checked out where they run.
MOVES_HEAD = {"commit", "merge", "reset", "pull", "rebase", "cherry-pick", "revert", "am"}
# Each command's options as git 2.56.0 has them: its listing (`git <command> -h`), corrected by what it
# does (an option it refuses without a value takes one, whatever the listing says: `git pull --jobs`).
# tests/githelp.py builds this from the installed git; tests/test_guard.py checks these against it and
# fails with the line to add when a newer git has a new option.
# V: long options whose value may be the next word; O: a value only after "="; P: plain; sv / so / sp:
# the same for short letters; alias: the long name a letter stands for.
GIT_OPTS = {
    "fetch": {
        "V": "deepen depth filter jobs negotiation-include negotiation-restrict negotiation-tip refmap "
             "server-option shallow-exclude shallow-since upload-pack",
        "O": "recurse-submodules",
        "P": "all append atomic auto-gc auto-maintenance dry-run force ipv4 ipv6 keep multiple negotiate-only "
             "no-all no-append no-atomic no-auto-gc no-auto-maintenance no-deepen no-depth no-dry-run no-filter "
             "no-force no-jobs no-keep no-multiple no-negotiate-only no-negotiation-include "
             "no-negotiation-restrict no-negotiation-tip no-porcelain no-prefetch no-progress no-prune "
             "no-prune-tags no-quiet no-recurse-submodules no-server-option no-set-upstream no-shallow-exclude "
             "no-shallow-since no-show-forced-updates no-stdin no-tags no-update-head-ok no-update-shallow "
             "no-upload-pack no-verbose no-write-commit-graph no-write-fetch-head porcelain prefetch progress "
             "prune prune-tags quiet refetch set-upstream show-forced-updates stdin tags unshallow update-head-ok "
             "update-shallow verbose write-commit-graph write-fetch-head",
        "sv": "jo", "so": "", "sp": "46Pafkmnpqtuv",
        "alias": "4=ipv4 6=ipv6 P=prune-tags a=append f=force j=jobs k=keep m=multiple o=server-option p=prune q=quiet "
             "t=tags u=update-head-ok v=verbose"},
    "pull": {
        "V": "cleanup deepen depth jobs negotiation-include negotiation-restrict negotiation-tip refmap "
             "server-option shallow-exclude shallow-since strategy strategy-option upload-pack",
        "O": "gpg-sign log rebase recurse-submodules signoff",
        "P": "all allow-unrelated-histories append autostash commit compact-summary dry-run edit ff ff-only force "
             "ipv4 ipv6 keep no-all no-allow-unrelated-histories no-append no-autostash no-cleanup no-commit "
             "no-compact-summary no-deepen no-depth no-dry-run no-edit no-ff no-force no-gpg-sign no-ipv4 no-ipv6 "
             "no-jobs no-keep no-log no-negotiation-include no-negotiation-restrict no-negotiation-tip no-progress "
             "no-prune no-quiet no-rebase no-recurse-submodules no-server-option no-set-upstream "
             "no-shallow-exclude no-shallow-since no-show-forced-updates no-signoff no-squash no-stat no-strategy "
             "no-strategy-option no-tags no-update-shallow no-upload-pack no-verbose no-verify "
             "no-verify-signatures progress prune quiet set-upstream show-forced-updates squash stat tags "
             "unshallow update-shallow verbose verify verify-signatures",
        "sv": "Xjos", "so": "Sr", "sp": "46afknpqtv",
        "alias": "4=ipv4 6=ipv6 S=gpg-sign X=strategy-option a=append f=force j=jobs k=keep o=server-option p=prune "
             "q=quiet r=rebase s=strategy t=tags v=verbose"},
    "push": {
        "V": "exec push-option receive-pack recurse-submodules repo",
        "O": "force-with-lease signed",
        "P": "all atomic branches delete dry-run follow-tags force force-if-includes ipv4 ipv6 mirror no-all "
             "no-atomic no-branches no-delete no-dry-run no-exec no-follow-tags no-force no-force-if-includes "
             "no-force-with-lease no-mirror no-porcelain no-progress no-prune no-push-option no-quiet "
             "no-receive-pack no-recurse-submodules no-repo no-set-upstream no-signed no-tags no-thin no-verbose "
             "no-verify porcelain progress prune quiet set-upstream tags thin verbose verify",
        "sv": "o", "so": "", "sp": "46dfnquv",
        "alias": "4=ipv4 6=ipv6 d=delete f=force n=dry-run o=push-option q=quiet u=set-upstream v=verbose"},
    "rebase": {
        "V": "empty exec onto strategy strategy-option trailer whitespace",
        "O": "gpg-sign rebase-merges",
        "P": "abort apply autosquash autostash committer-date-is-author-date continue edit-todo ff force-rebase "
             "fork-point ignore-whitespace interactive keep-base merge no-autosquash no-autostash "
             "no-committer-date-is-author-date no-exec no-ff no-force-rebase no-fork-point no-gpg-sign "
             "no-ignore-whitespace no-keep-base no-onto no-quiet no-reapply-cherry-picks no-rebase-merges "
             "no-rerere-autoupdate no-reschedule-failed-exec no-reset-author-date no-root no-signoff no-stat "
             "no-strategy no-strategy-option no-trailer no-update-refs no-verbose no-verify no-whitespace quiet "
             "quit reapply-cherry-picks rerere-autoupdate reschedule-failed-exec reset-author-date root "
             "show-current-patch signoff skip stat update-refs verbose verify",
        "sv": "CXsx", "so": "Sr", "sp": "fimnqv",
        "alias": "S=gpg-sign X=strategy-option f=force-rebase i=interactive m=merge n=no-stat q=quiet r=rebase-merges "
             "s=strategy v=verbose x=exec"},
    "switch": {
        "V": "conflict create force-create orphan",
        "O": "recurse-submodules track",
        "P": "detach discard-changes force guess ignore-other-worktrees merge no-conflict no-create no-detach "
             "no-discard-changes no-force no-force-create no-guess no-ignore-other-worktrees no-merge no-orphan "
             "no-overwrite-ignore no-progress no-quiet no-recurse-submodules no-track overwrite-ignore progress "
             "quiet",
        "sv": "Cc", "so": "t", "sp": "dfmq",
        "alias": "C=force-create c=create d=detach f=force m=merge q=quiet t=track"},
    "checkout": {
        "V": "conflict inter-hunk-context orphan pathspec-from-file unified",
        "O": "recurse-submodules track",
        "P": "auto-advance detach force guess ignore-other-worktrees ignore-skip-worktree-bits merge "
             "no-auto-advance no-conflict no-detach no-force no-guess no-ignore-other-worktrees "
             "no-ignore-skip-worktree-bits no-merge no-orphan no-overlay no-overwrite-ignore no-patch "
             "no-pathspec-file-nul no-pathspec-from-file no-progress no-quiet no-recurse-submodules no-track ours "
             "overlay overwrite-ignore patch pathspec-file-nul progress quiet theirs",
        "sv": "BUb", "so": "t", "sp": "23dflmpq",
        "alias": "2=ours 3=theirs U=unified d=detach f=force m=merge p=patch q=quiet t=track"},
    "worktree add": {
        "V": "reason",
        "O": "",
        "P": "checkout detach force guess-remote lock no-checkout no-detach no-force no-guess-remote no-lock "
             "no-orphan no-quiet no-reason no-relative-paths no-track orphan quiet relative-paths track",
        "sv": "Bb", "so": "", "sp": "dfq",
        "alias": "d=detach f=force q=quiet"},
    "branch": {
        "V": "contains delete-merged forked format merged no-contains no-merged points-at set-upstream-to sort",
        "O": "abbrev color column track",
        "P": "all copy create-reflog delete dry-run edit-description force ignore-case list move no-abbrev "
             "no-color no-column no-copy no-create-reflog no-delete no-dry-run no-edit-description no-force "
             "no-format no-ignore-case no-list no-move no-omit-empty no-points-at no-quiet no-recurse-submodules "
             "no-set-upstream-to no-show-current no-sort no-track no-unset-upstream no-verbose omit-empty quiet "
             "recurse-submodules remotes show-current unset-upstream verbose",
        "sv": "u", "so": "t", "sp": "CDMacdfilmqrv",
        "alias": "a=all c=copy d=delete f=force i=ignore-case l=list m=move q=quiet r=remotes t=track "
             "u=set-upstream-to v=verbose"},
}
# Options that take the next word when there is one, and stand alone as the last word (git branch
# --contains): git doesn't "require a value" for these, but the word after them is still theirs.
GIT_LASTARG = {"contains", "no-contains", "merged", "no-merged", "points-at"}
# Short letters with no long name in git's listing, as the long option they mean.
GIT_LETTERS = {"branch": {"D": "delete", "M": "move", "C": "copy"}}
# With one of these, `git branch` lists, describes or sets an upstream: no branch is made, moved or
# removed (and git refuses to mix two kinds in one command). What kind of command a `git branch` is
# comes only from its mode options; -v, --track, --no-track, --sort, --format, --color … change nothing
# about that (Codex T130: they had been taken for "only lists").
BRANCH_QUIET_MODES = {"list", "show-current", "edit-description", "set-upstream-to", "unset-upstream",
                      "contains", "no-contains", "merged", "no-merged", "points-at", "forked"}
_git_opts = {}


def git_opts(sub):
    """GIT_OPTS[sub] as sets (and alias as a dict), or None for a command without a table."""
    if sub not in _git_opts:
        t = GIT_OPTS.get(sub)
        _git_opts[sub] = t and {"V": set(t["V"].split()), "O": set(t["O"].split()), "P": set(t["P"].split()),
                                "sv": set(t["sv"]), "so": set(t["so"]), "sp": set(t["sp"]),
                                "alias": {**dict(x.split("=", 1) for x in t["alias"].split()), **GIT_LETTERS.get(sub, {})}}
    return _git_opts[sub]


def git_parse(sub, args):
    """A git command's arguments, read as git's own parser reads them → (opts, pos, odd).
    opts: what git ends up with once every option has been applied IN ORDER (Codex T164): {option's
    long name (a short letter's long name, else the letter): [every value it was given, True for a
    switch]}. `--no-X` turns X off again (a later `--X` turns it back on); a value option given twice
    keeps both values (git keeps every --refmap, --exec …; where git keeps only the last, holding on
    either is the safe side). An option whose own name starts with no- and takes a value
    (--no-contains <commit>) is that option, not a negation.
    pos: what's left, in order (the repository and refspecs, the upstream and branch, the names);
    odd: something wasn't understood (an option that isn't in the table, an ambiguous abbreviation,
    a value that's missing). Callers treat odd as "can't tell" and hold what they'd otherwise let go.
    Handled: --opt value and --opt=value, values only after = for the optional kind, unique
    abbreviations (--dep 1), short letters alone, clustered (-vf) and with a value next or stuck
    (-j 1, -j1), and -- (Codex T159: `git fetch --jobs 1 . x:main` read 1 as the repository)."""
    t = git_opts(sub)
    opts, pos, odd, i = {}, [], t is None, 0
    if t is None:
        return opts, [a for a in args if not a.startswith("-")], True
    every = t["V"] | t["O"] | t["P"]

    def set_(key, val):
        opts.setdefault(key, []).append(val)

    def unset(name):
        # --no-X, its abbreviation included: X (and its letters, which are X too) is off again.
        base = name[3:]
        if name not in t["V"] and base in every:
            opts.pop(base, None)
            return True
        return False
    while i < len(args):
        a = args[i]
        i += 1
        if a == "--":
            pos += args[i:]
            break
        if a.startswith("--"):
            name, eq, val = a[2:].partition("=")
            full = name if name in every else None
            if not full:
                hits = [o for o in every if o.startswith(name)] if name else []
                full = hits[0] if len(hits) == 1 else None
            if not full:
                odd = True
                continue
            if full.startswith("no-") and not eq and unset(full):
                continue
            if full in t["V"]:
                if eq:
                    set_(full, val)
                elif i < len(args) and (full not in GIT_LASTARG or not args[i].startswith("-")):
                    set_(full, args[i])
                    i += 1
                else:
                    set_(full, True)
                    odd = odd or full not in GIT_LASTARG
            else:
                set_(full, val if eq else True)
        elif a.startswith("-") and len(a) > 1:
            for k, ch in enumerate(a[1:]):
                key = t["alias"].get(ch, ch)
                rest = a[k + 2:]
                if ch in t["sv"]:
                    if rest:
                        set_(key, rest)
                    elif i < len(args):
                        set_(key, args[i])
                        i += 1
                    else:
                        set_(key, True)
                        odd = True
                    break
                if ch in t["so"]:
                    set_(key, rest or True)
                    break
                if ch in t["sp"]:
                    set_(key, True)
                    continue
                odd = True
                break
        else:
            pos.append(a)
    return opts, pos, odd


def _branch_parse(args):
    return git_parse("branch", args)


def _checked_out(folder):
    """(branch, the checkout's main folder) for a folder inside a git checkout, else (None, None)."""
    try:
        r = subprocess.run(["git", "-C", folder, "rev-parse", "--abbrev-ref", "HEAD", "--path-format=absolute", "--git-common-dir"],
                           capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None, None
    out = r.stdout.split("\n") if r.returncode == 0 else []
    if len(out) < 2:
        return None, None
    common = out[1].strip()
    return out[0].strip(), (os.path.dirname(common) if os.path.basename(common) == ".git" else common)


def _git_words(seg):
    """A git command's words with the folder it runs in kept apart: (subcommand, its arguments,
    the -C folder or None). normal_words drops git's global options, -C among them."""
    import shlex
    w = normal_words(seg)
    if len(w) < 2 or w[0] != "git":
        return None, [], None
    try:
        raw = shlex.split(seg)
    except ValueError:
        raw = seg.split()
    folder = None
    try:
        g = next(i for i, x in enumerate(raw) if os.path.basename(x) == "git")
        i = g + 1
        while i < len(raw) and raw[i] != w[1]:
            if raw[i] == "-C" and i + 1 < len(raw):
                d = os.path.expanduser(raw[i + 1])
                folder = d if os.path.isabs(d) or folder is None else os.path.join(folder, d)
                i += 1
            i += 1
    except StopIteration:
        pass
    return w[1], w[2:], folder


def _branch_moves(args, branch):
    """Does `git branch <args>` move, make or remove `branch`?
      --delete: any name given; --move: any name (as the new name it moves, as the old one it's gone,
        and then a plain create puts it somewhere new); --copy: the destination, the LAST name
        (`-C feature main` moves main; Codex T94; a copy FROM it leaves it where it is);
      otherwise a create or -f: the FIRST name (the second is where it starts).
    An option this doesn't know (a newer git's, or --no-<something>) with the branch named: held."""
    opts, names, odd = _branch_parse(args)
    if odd:
        return branch in args or branch in names
    if "delete-merged" in opts:
        return True    # deletes whatever matches a pattern: which branches can't be read from here
    if "delete" in opts or "move" in opts:
        return branch in names
    if "copy" in opts:
        return names[-1:] == [branch]
    if set(opts) & BRANCH_QUIET_MODES:
        return False
    return names[:1] == [branch]


CREATES = {"switch": ("create", "force-create", "orphan"), "checkout": ("b", "B", "orphan"), "worktree add": ("b", "B")}


def _creates(sub, args, branch):
    """switch -c/-C, checkout -b/-B, worktree add -b/-B, --orphan: does it make (or make over) the
    branch? Read with the command's own options (so --conflict merge -C main, -Cmain, --force-c main
    and --create=main are all seen); when something isn't understood, by the look of the words."""
    table = "worktree add" if sub == "worktree" and args[:1] == ["add"] else sub
    opts, _pos, odd = git_parse(table, args[1:] if table == "worktree add" else args)
    if any(branch in opts.get(k, []) for k in CREATES.get(table, ())):
        return True
    if not odd:
        return False
    for i, a in enumerate(args):
        nxt = args[i + 1:i + 2] == [branch]
        if a.startswith("--"):
            name, eq, val = a[2:].partition("=")
            if name != "force" and len(name) >= 2 and any(o.startswith(name) for o in ("create", "force-create", "orphan")):
                if (eq and val == branch) or (not eq and nxt):
                    return True
        elif re.fullmatch(r"-[a-zA-Z]*[cCbB]", a):
            if nxt:
                return True
        elif re.fullmatch(r"-[a-zA-Z]*?[cCbB](.+)", a) and re.fullmatch(r"-[a-zA-Z]*?[cCbB](.+)", a).group(1) == branch:
            return True
    return False


def _refspec_writes(arg, branch):
    """A fetch / pull / push refspec whose destination is the branch (wildcards included)."""
    import fnmatch
    if ":" not in arg:
        return False
    dst = arg.split(":", 1)[1]
    return bool(dst) and any(fnmatch.fnmatchcase(x, dst) for x in (branch, f"refs/heads/{branch}"))


def _local_source(src):
    """Is a fetch / pull's repository this checkout or a folder (git fetch . x:main, git fetch ../r …)?"""
    src = src or ""
    return src == "." or src.startswith(("/", "./", "../", "~", "file:")) or os.path.isdir(os.path.expanduser(src))


def _has_branch(folder, branch):
    """Does that branch exist in the checkout the folder belongs to? None: can't tell."""
    try:
        r = subprocess.run(["git", "-C", folder, "rev-parse", "-q", "--verify", f"refs/heads/{branch}"], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if r.returncode == 0:
        return True
    inside = subprocess.run(["git", "-C", folder, "rev-parse", "--git-dir"], capture_output=True, text=True).returncode == 0
    return False if inside else None


def moved_branch(cmd, branches, live=None, strict=True):
    """The first of `branches` that the command line moves, makes over or removes, else None.
      by name, from anywhere: git branch (see _branch_moves), update-ref on it (or --stdin: what that
        moves can't be read), symbolic-ref on it, switch -c/-C, checkout -b/-B, worktree add -b/-B,
        a fetch / pull / push refspec that writes it (x:<b>), rebase <upstream> <b>, and a file
        written to its ref (…/refs/heads/<b>, packed-refs);
      and, for live = (branch, repo) only, by running where that branch is checked out in that repo:
        commit, merge, reset, pull, rebase, cherry-pick, revert, am, update-ref HEAD. Where it runs:
        the hook's folder, a `cd` before it, git -C; a `git switch <b>` / `git checkout <b>` /
        `git worktree add <dir> <b>` earlier on the same line counts as being on it there.
    strict=False (the always-on rule, T136) leaves two everyday things free: a fetch or pull of the
    branch from a real remote (git fetch origin main:main), and naming a branch that doesn't exist
    yet where the command runs (git branch -M main in a new repository). The second is only given
    when where it runs is known and nothing points git elsewhere (GIT_DIR, --git-dir).
    tests/test_guard.py LiveBranchRefs / BaseBranch run each spelling in a real repository and check
    the ref. As with the rest of the gate, this catches the plain ways, not a pal set on getting
    around it."""
    branches = [b for b in branches if b]
    if not branches or ("git" not in cmd and "refs/heads" not in cmd and "packed-refs" not in cmd):
        return None
    for t in write_targets(cmd):
        for b in branches:
            if re.search(rf"(^|/)refs/heads/{re.escape(b)}$", t):
                return b
        if re.search(r"(^|/)packed-refs$", t):
            return branches[0]
    # Anywhere on the line (a segment comes without its leading VAR=…): git pointed at another repository.
    elsewhere = bool(re.search(r"\bGIT_(DIR|WORK_TREE|COMMON_DIR)\b|--git-dir\b|--work-tree\b", cmd))
    cwd = HOOK_CWD
    here = {}      # folder → the repo's main folder, where an earlier command on this line checks the live branch out
    removed = set()   # branches an earlier command on this line removed or renamed away
    join = lambda base, d: os.path.normpath(d if os.path.isabs(d) else os.path.join(base, d)) if (base or os.path.isabs(d)) else None
    for seg in commands(cmd):
        if _help(seg):
            continue
        w = normal_words(seg)
        if len(w) == 2 and w[0] == "cd" and not w[1].startswith("-"):
            cwd = join(cwd, os.path.expanduser(w[1]))
            continue
        sub, args, folder = _git_words(seg)
        if not sub:
            continue
        at = join(cwd, folder) if folder else (os.path.normpath(cwd) if cwd else None)
        names = [a for a in args if not a.startswith("-")]

        def hit(b, remote_ok=False):
            # The always-on rule lets a branch that isn't there yet be made (a new repository's main).
            if strict:
                return True
            if remote_ok:
                return False
            return not (at and not elsewhere and b not in removed and _has_branch(at, b) is False)
        for b in branches:
            if sub == "branch" and _branch_moves(args, b):
                if hit(b):
                    return b
                continue
            if sub == "update-ref" and (f"refs/heads/{b}" in args or "--stdin" in args) and hit(b):
                return b
            # symbolic-ref <ref> <target> or -d <ref> writes it (-m <reason> may come first); <ref> alone reads.
            if sub == "symbolic-ref" and f"refs/heads/{b}" in args and (
                    len(names) >= 2 or any(a in ("-d", "--delete") or "--delete".startswith(a) and len(a) > 3 for a in args)) and hit(b):
                return b
            if sub in ("switch", "checkout", "worktree") and _creates(sub, args, b) and hit(b):
                return b
            if sub in ("fetch", "pull", "push"):
                # [<repository> [<refspec>...]], after the options and their values. A refspec that
                # writes the branch, a --refmap that maps onto it, or refspecs from stdin (unread).
                opts, pos, odd = git_parse(sub, args)
                # (every --refmap counts: git applies them all, Codex T164)
                specs = names if odd else pos + [v for v in opts.get("refmap", []) if isinstance(v, str)]
                writes = any(_refspec_writes(a.lstrip("+"), b) for a in specs) or (sub != "push" and "stdin" in opts and bool(pos))
                # The always-on rule lets the branch come from a real remote: only when the repository
                # word is known for what it is (nothing odd before it) and isn't this checkout or a folder.
                remote = sub != "push" and not odd and bool(pos) and not _local_source(pos[0])
                if writes and hit(b, remote_ok=remote):
                    return b
            if sub == "rebase":
                # git rebase [--onto <x>] <upstream> <branch>, or --root [<branch>]: checks <branch>
                # out and moves it. Not understood: the branch named at all is enough.
                opts, pos, odd = git_parse("rebase", args)
                target = names if odd else pos[:1] if "root" in opts else pos[1:2]
                if b in target and hit(b):
                    return b
        if sub == "branch":   # (for the lines above: a branch deleted or renamed away earlier on this line)
            o, n, _odd = _branch_parse(args)
            if "delete" in o or "move" in o:
                removed.update(n)
        if not live:
            continue
        branch, repo = live
        # Where the live branch is (or is about to be) checked out: git switch <b>, git checkout <b>,
        # git worktree add <dir> <b> (the words left once the options and their values are read).
        if at and sub in ("switch", "checkout"):
            _o, pos, odd = git_parse(sub, args)
            if (names if odd else pos[:1]).count(branch):
                here[at] = _checked_out(at)[1]
        if at and sub == "worktree" and args[:1] == ["add"]:
            _o, pos, odd = git_parse("worktree add", args[1:])
            if odd:
                pos = names[1:]
            if len(pos) >= 2 and pos[-1] == branch:
                here[join(at, os.path.expanduser(pos[0]))] = _checked_out(at)[1]
        # (git update-ref HEAD … moves whatever is checked out where it runs.)
        if (sub in MOVES_HEAD or (sub == "update-ref" and "HEAD" in args)) and repo and at:
            if at in here:
                on, root = branch, here[at]
            else:
                on, root = _checked_out(at)
            if on == branch and root and os.path.realpath(root) == repo:
                return branch
    return None


def moves_live_branch(cmd):
    """While the Live channel is on (crew-settings.json "channel": "live"): a command that moves the
    branch it follows, by name or by running where it's checked out in the followed repo (see
    moved_branch). Installing follows that branch, so this needs the click a landing needs."""
    s = load_json(DATA / "crew-settings.json", {})
    if s.get("channel") != "live":
        return False
    branch = s.get("live_branch") or "main"
    repo = os.path.realpath(s["live_repo"]) if s.get("live_repo") else None
    return bool(moved_branch(cmd, [branch], live=(branch, repo)))


def base_branches():
    """The branches topics land on: main and master, the one the Live channel follows, and every
    base a worktree topic was cut from (shared.json crew.bots[].worktrees[].base)."""
    out = ["main", "master"]
    s = load_json(DATA / "crew-settings.json", {})
    out.append(s.get("live_branch"))
    try:
        from crewlib import HOME as APP_HOME
        for b in (load_json(APP_HOME / "shared.json", {}).get("crew") or {}).get("bots") or []:
            for wt in (b.get("worktrees") or {}).values():
                out.append((wt or {}).get("base"))
    except Exception:
        pass
    seen = []
    for b in out:
        if isinstance(b, str) and b and b not in seen:
            seen.append(b)
    return seen


def moves_base_branch(cmd):
    """Always on, in every project (T136): moving a base branch by its name is landing by hand
    (`git update-ref refs/heads/main <commit>`, `git branch -f main crew/x`, `git fetch . crew/x:main`),
    so it's held like `pal land`. Committing or merging in a checkout that is ON such a branch is
    not this rule's business: pals without a worktree work there all day (only the Live channel's
    repo holds that, moves_live_branch)."""
    if "git" not in cmd and "refs/heads" not in cmd:
        return False
    return bool(moved_branch(cmd, base_branches(), strict=False))


def _help(seg):
    """`pal land --help`, `git push --help`: asking how it works runs nothing."""
    return "--help" in normal_words(seg)[1:]


def _nested_commands(cmd, overflow):
    """Literal execution boundaries, including every shell payload commands() flattens.
    This is deliberately not an execution-order or shell interpreter.
    """
    text = heredoc_free(cmd)
    masked = mask_quotes(text)
    out = [m.group(2) for m in list(INNER.finditer(text)) + list(EVAL.finditer(text))
           if masked[m.start()] != "_"]
    out += run_strings(cmd, overflow=overflow)
    shell_stdin = any(w and w[0] in SHELL_RUNNERS for w, _ in _stdin_text(cmd))
    for seg in commands(cmd):
        words = normal_words(RUNNER.sub("", seg))
        if not words:
            continue
        if words[0] in SHELL_RUNNERS:
            # normal_words handles paths and supported wrappers; include combined bash -lc.
            out += [words[i + 1] for i in range(1, len(words) - 1)
                    if re.fullmatch(r"-[a-zA-Z]*c[a-zA-Z]*", words[i])]
        elif words[0] == "eval":
            out.append(" ".join(words[1:]))
        elif shell_stdin and words[0] in ("echo", "printf"):
            # The stdin helper joins printf's format and arguments. Inspect literal arguments
            # too: printf '%s' 'git commit ...' | sh must not hide behind the format word.
            out += words[1:]
    return list(dict.fromkeys(s for s in out if s and s.strip() and s != cmd))


def _cwd_git_mutation(seg):
    """Git forms whose branch effect can depend on cwd; known read forms stay free."""
    sub, args, _folder = _git_words(seg)
    # Only an unambiguous help flag is free here. A later --help may instead be a
    # message (-m --help), another option's value, or a path after --.
    if args and args[0] in ("--help", "-h"):
        return False
    if sub in MOVES_HEAD or sub == "fetch":
        opts, _pos, odd = git_parse(sub, args)
        return odd or "dry-run" not in opts
    if sub == "branch":
        opts, names, odd = _branch_parse(args)
        if odd or set(opts) & {"delete-merged", "delete", "move", "copy"}:
            return True
        return not (set(opts) & BRANCH_QUIET_MODES) and bool(names)
    if sub == "symbolic-ref":
        pos = [a for a in args if a not in ("-q", "--quiet", "--short", "--recurse", "--no-recurse")]
        return len(pos) != 1 or pos[0].startswith("-")
    if sub == "worktree":
        return bool(args) and args[0] != "list"
    return sub in ("update-ref", "switch", "checkout")


def nested_cwd(cmd, _depth=0, _seen=None):
    """Require the owner when nested execution can invalidate Git's parsed cwd.
    A child cd can pollute an OUTER mutation too, so inspect both sides of the boundary.
    Explicit nested pushes remain outward; read-only commands within the scan budget stay free.
    Exhausting a bound requires owner review, never permission for an unchecked tail.
    """
    seen = set() if _seen is None else _seen
    if cmd in seen:
        return False
    seen.add(cmd)
    overflow = []
    nested = _nested_commands(cmd, overflow)
    if overflow or len(nested) > 200:
        return True
    # commands() also flattens child shells and conditional execution. A child or
    # skipped cd must not change our view of an outer mutation; share its quote mask.
    shell_boundary = any(m.group(0) in CWD_UNCERTAIN_BOUNDARIES
                         for m in SPLIT.finditer(mask_quotes(heredoc_free(cmd))))
    if not nested and not shell_boundary:
        return False
    if any(_cwd_git_mutation(seg) for seg in commands(cmd)) or _depth >= 3:
        return True
    return any(any(_cwd_git_mutation(seg) for seg in commands(inner))
               or nested_cwd(inner, _depth + 1, seen) for inner in nested[:200])


CHECKS = {"agent-file-writes": writes_agent_file, "agent-file-interpreter": writes_agent_file_via_interpreter,
          "click-writes": writes_click, "queue-writes": writes_queue,
          "desk-writes": writes_desk, "uninstall-indirect": runs_uninstall, "helper-keys": touches_helpers, "tap-writes": writes_taps,
          "moves-live-branch": moves_live_branch, "moves-base-branch": moves_base_branch,
          "nested-cwd": nested_cwd}


def matches(cmd, _depth=0):
    rule = _matches(cmd)
    if rule or _depth >= 3:
        return rule
    # Command lines inside it: a heredoc fed to bash, os.system("git push") … (Grok review H2)
    for inner in run_strings(cmd)[:200]:
        rule = matches(inner, _depth + 1)
        if rule:
            return rule
    return None


def _matches(cmd):
    return next(_matching_rules(cmd), None)


def all_matches(cmd, _depth=0):
    """Every applicable rule, including nested commands even when the outer command matched.
    The normal gate keeps its first-match behavior; delegated approval needs the full set."""
    found = {r["name"]: r for r in _matching_rules(cmd)}
    if _depth < 3:
        for inner in run_strings(cmd)[:200]:
            found.update((r["name"], r) for r in all_matches(inner, _depth + 1))
    return list(found.values())


def all_matches_at(cmd, cwd):
    """Re-evaluate an approval in its execution directory, never the reviewer's directory."""
    global HOOK_CWD
    previous = HOOK_CWD
    HOOK_CWD = cwd
    try:
        return all_matches(cmd)
    finally:
        HOOK_CWD = previous


def command_context(cmd, cwd, rule=None):
    """Capture every matched rule with the caller's known execution cwd.
    A hook without cwd remains unknown: the hook process's own cwd is not execution evidence.
    Programs asking for themselves may explicitly supply their process cwd.
    """
    # Keep the hook's spelling: resolving symlinks can change what a following relative cd means.
    cwd = cwd if isinstance(cwd, str) and os.path.isabs(cwd) else None
    rules = {r["name"] for r in all_matches_at(cmd, cwd)}
    if rule:
        rules.add(rule)
    return {"cwd": cwd, "rules": sorted(rules)}


def approval_rules(request):
    """Saved rules plus current rules in the saved cwd; None means context cannot be vouched for.
    Changing repository or Live settings can add restrictions, never erase an earlier one.
    """
    context = request.get("guard_context")
    if not isinstance(context, dict):
        return None
    cwd, rules = context.get("cwd"), context.get("rules")
    if not isinstance(cwd, str) or not os.path.isabs(cwd) or not os.path.isdir(cwd) \
            or not isinstance(rules, list) or not rules or not all(isinstance(r, str) and r for r in rules):
        return None
    return set(rules) | {r["name"] for r in all_matches_at(request.get("command") or "", cwd)}


def _matching_rules(cmd):
    segs = [s for s in commands(cmd) if not _help(s)]
    flat = heredoc_free(cmd)
    for rule in policy().get("guarded", []):
        if rule.get("check"):
            if CHECKS.get(rule["check"], lambda _c: False)(cmd):
                yield rule
            continue
        try:
            pat = re.compile(rule["pattern"])
        except re.error:
            continue
        # Most rules: a command that starts that way. "anywhere" rules (URLs): anywhere in the line.
        if rule.get("anywhere") and pat.search(flat):
            yield rule
            continue
        # As written, or as run (normal_head: behind npx, a path, env, nice …; T26).
        if any(pat.match(seg) or pat.match(normal_head(seg)) for seg in segs):
            yield rule


def key(terminal, cmd, context=None):
    text = f"{terminal}\n{' '.join(cmd.split())}"
    if context is not None:
        text += "\n" + json.dumps(context, sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(text.encode()).hexdigest()[:16]


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


def check(terminal, bot, channel, cmd, extra=None, claim=False):
    """None: go ahead. Else the reason it's held. claim: the caller is the program itself (pal land's
    own check), so the approval it uses is spent for good; the hook's use leaves it for the program it
    let through to claim once (recently_used)."""
    if bot in policy().get("trusted", []):
        return None
    rule = matches(cmd)
    if not rule:
        return None
    context = command_context(cmd, HOOK_CWD)
    # A land is approved for the commit its topic is at now (T212): the hook's request names it too,
    # so a commit made after the owner's yes asks again, and the program's hand-over carries it.
    tip = land_tip(cmd)
    k = key(terminal, cmd + (f"\n@{tip}" if tip else ""), context)
    with locked("approvals"):
        expire_stale()
        for r in all_requests():
            if r.get("key") != k or r.get("guard_context") != context:
                continue
            if r["status"] == "approved":
                r["status"], r["used"] = "used", now_ms()
                if claim:
                    r["claimed"] = r["used"]
                save_json(APPROVALS / f"{r['id']}.json", r)
                return None
            if r["status"] == "pending":
                return r
        r = {"id": new_id("a-"), "key": k, "at": now_ms(), "terminal": terminal, "bot": bot, "channel": channel,
             "command": cmd, "rule": rule["name"], "why": rule.get("why", ""), "status": "pending", **(extra or {}),
             "guard_context": context, **({"land_tip": tip} if tip else {})}
        save_json(APPROVALS / f"{r['id']}.json", r)
    feed("approval", id=r["id"], bot=bot, channel=channel, command=cmd[:200], status="pending")
    return r


SHELL = "shell"   # the "terminal" of a request that comes from no Herdr terminal (a plain shell)


def owner_step(terminal, bot, channel, cmd, rule, why=None):
    """A program asking for the owner's go itself, wherever it runs (T110: on 2026-11-10 ./release ran
    from a plain shell and nothing asked the owner, because the hook only sees pals' terminals).
    None: go ahead, once. Either the owner approved exactly this command (used up now), or the gate
    just let this terminal's `rule` command through (a pal whose run was approved isn't asked twice).
    Else the request that waits in the Inbox."""
    terminal = terminal or SHELL
    named = next((r for r in policy().get("guarded", []) if r.get("name") == rule), None)
    if not named:
        raise CrewError(f"no guarded rule called {rule}")
    # A pal whose run the hook held and the owner approved isn't asked twice: only when what the hook
    # let through was this very line, and only once (T206: any release from that terminal went through
    # for two minutes on one approval, other versions and notes included).
    if terminal != SHELL and (bot in policy().get("trusted", []) or (handover_words(cmd) is not None
                                                                         and recently_used(terminal, rule, words=handover_words(cmd), cwd=os.getcwd()))):
        return None
    context = command_context(cmd, os.getcwd(), rule)
    k = key(terminal, f"{rule}\n{cmd}", context)
    with locked("approvals"):
        expire_stale()
        for r in all_requests():
            if r.get("key") != k or r.get("guard_context") != context:
                continue
            if r["status"] == "approved":
                r["status"], r["used"] = "used", now_ms()
                r["claimed"] = r["used"]   # spent here: nothing else may count it again
                save_json(APPROVALS / f"{r['id']}.json", r)
                return None
            if r["status"] == "pending":
                return r
        r = {"id": new_id("a-"), "key": k, "at": now_ms(), "terminal": terminal, "bot": bot, "channel": channel,
             "command": cmd, "rule": rule, "why": why or named.get("why", ""), "status": "pending", "asked_by": "the program itself",
             "guard_context": context}
        save_json(APPROVALS / f"{r['id']}.json", r)
    feed("approval", id=r["id"], bot=bot, channel=channel, command=cmd[:200], status="pending")
    return r


HANDOVER_S = 120   # how long after the hook let a command through its program may claim that approval
# The hand-over's language (T212 round 4): one plain command and nothing else. No cd, no ; && | or
# subshell, no wrapper (env, command, exec, nice, sudo …), no leading VAR=value; words are literal
# atoms or quoted strings without expansion characters. The program claiming it must run in exactly
# the folder the hook recorded. Four rounds of working out where a line runs (case, env -C, CDPATH,
# cd options …) each found another gap, so no folder is worked out at all: anything else means no
# hand-over, and the owner is asked again. Recognised by one linear scan, the line capped, before
# the approvals lock is taken (round 3).
HANDOVER_MAX = 2048
_HO_ATOM_CHARS = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_./:@%+=,#-")
_HO_QUOTED_BANNED = frozenset("$`\\!\n")
HANDOVER_NOT_FIRST = {"cd", "pushd", "popd", "env", "command", "builtin", "exec", "nice", "ionice", "nohup", "time",
                      "timeout", "sudo", "doas", "su", "chrt", "taskset", "stdbuf", "setsid", "unbuffer", "script",
                      "xargs", "eval", "source", ".", "sh", "bash", "zsh", "dash", "ksh", "fish", "chroot", "flock",
                      "systemd-run", "runuser", "nsenter", "unshare", "firejail", "proot", "watch", "then", "do", "!"}


def handover_words(cmd):
    """The words of a line that is one plain command in the hand-over language, else None."""
    if not isinstance(cmd, str) or not cmd.strip() or len(cmd) > HANDOVER_MAX:
        return None
    words, word, in_word, i, n = [], [], False, 0, len(cmd)
    while i < n:
        c = cmd[i]
        if c in (" ", "\t"):
            if in_word:
                words.append("".join(word))
            word, in_word = [], False
            i += 1
        elif c in ("'", '"'):
            j = cmd.find(c, i + 1)
            if j < 0 or any(ch in _HO_QUOTED_BANNED for ch in cmd[i + 1:j]):
                return None
            word.append(cmd[i + 1:j])
            in_word = True
            i = j + 1
        elif c in _HO_ATOM_CHARS:
            word.append(c)
            in_word = True
            i += 1
        else:
            return None   # ; & | ( ) < > $ ` ~ \ ! newline …: not one plain command
    if in_word:
        words.append("".join(word))
    if not words or os.path.basename(words[0]) in HANDOVER_NOT_FIRST or "=" in words[0] or words[0].startswith("-"):
        return None
    return words


def recently_used(terminal, rule, seconds=HANDOVER_S, words=None, cwd=None, tip=None):
    """The hand-over from the gate to the program it let through (T206): the hook held a pal's command,
    the owner approved it, the hook let it run (status used); the program then asks again itself (pal
    land's own check, ./release's owner-step) and may count that approval ONCE, and only for exactly
    what was approved (T212, T215):
      - the approved line is one plain command (handover_words), and it is the one asked about:
        `words` (a pal subcommand after pal / crew / botz / buddy, or the whole line's words);
      - the context: the record carries T205's guard_context, re-checked in its cwd now it adds no
        rule, and the program's own cwd is exactly that cwd;
      - with `tip`, the commit the hook recorded (land_tip).
    The program's own approvals, claimed ones and ones a handoff voided never count. Everything is
    checked before the approvals lock is taken; under it, a candidate is re-read and claimed only if
    unchanged. Returns the claimed record (its land_tip is what may land), else None."""
    if words is None:
        raise CrewError("recently_used needs the exact command it may stand for")
    want = " ".join(" ".join(words).split())

    def hit(approved):
        if approved is None:
            return False
        return " ".join(" ".join(approved).split()) == want or (
            len(approved) >= 2 and os.path.basename(approved[0]) in ("pal", "crew", "botz", "buddy") and approved[1:] == list(words))

    def eligible(r):
        return (r.get("terminal") == terminal and r.get("rule") == rule and r.get("status") == "used"
                and not r.get("claimed") and r.get("asked_by") != "the program itself"
                and now_ms() - r.get("used", 0) < seconds * 1000)
    good = []
    for r in all_requests():
        if not eligible(r) or not hit(handover_words(r.get("command") or "")):
            continue
        ctx = r.get("guard_context")
        allowed = approval_rules(r)
        if not isinstance(ctx, dict) or allowed is None or not allowed <= set(ctx.get("rules") or []):
            continue
        # Exactly the folder the hook recorded: no symlink resolving, no working out.
        if not isinstance(ctx.get("cwd"), str) or not os.path.isabs(ctx["cwd"]) or cwd is None or cwd != ctx["cwd"]:
            continue
        if tip is not None and not (r.get("land_tip") and (tip.startswith(r["land_tip"]) or r["land_tip"].startswith(tip))):
            continue
        good.append(r)
    if not good:
        return None
    with locked("approvals"):
        for r in good:
            now = load_json(APPROVALS / f"{r['id']}.json", None)
            if not now or not eligible(now) or {k: now.get(k) for k in ("command", "guard_context", "land_tip", "key")} \
                    != {k: r.get(k) for k in ("command", "guard_context", "land_tip", "key")}:
                continue
            now["claimed"] = now_ms()
            save_json(APPROVALS / f"{r['id']}.json", now)
            return now
    return None


def land_tip(cmd):
    """The commit a `pal land <Pal#topic>` in this line would land: its topic's branch head, from
    Project Pals' own records (shared.json). None when it isn't a land or the topic can't be found."""
    for seg in commands(cmd):
        w = normal_words(seg)
        if len(w) < 3 or os.path.basename(w[0]) not in ("pal", "crew", "botz", "buddy") or w[1] != "land":
            continue
        pal, _, topic = w[2].lstrip("@").partition("#")
        if not topic:
            return None
        try:
            from crewlib import records, norm
            recs = [b for k, b in records().items() if k.startswith("name:")]
        except Exception:
            return None
        bot = next((b for b in recs if norm(b.get("name", "")) == norm(pal)), None) \
            or next((b for b in recs if norm(b.get("name", "")).startswith(norm(pal))), None)
        wts = (bot or {}).get("worktrees") or {}
        wt = wts.get("#" + topic) or wts.get(topic)
        if not wt or not wt.get("path"):
            return None
        try:
            r = subprocess.run(["git", "-C", wt["path"], "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            return None
        return r.stdout.strip() if r.returncode == 0 else None
    return None


def decide(rid, approve, note=None, via=None, tap=None):
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
        if tap:
            import crewtaps
            crewtaps.validate_snapshot("approval", r, tap)
        r["status"] = "approved" if approve else "denied"
        r["decided"] = now_ms()
        r["decided_via"] = via
        if note:
            r["note"] = note
        save_json(f, r)
    feed("approval", id=rid, bot=r["bot"], channel=r["channel"], status=r["status"])
    if tap:
        # A relayed tap (T147): the pal hears who tapped, never "<owner> approved".
        who = f"{tap['helper']} tapped, relaying {OWNER} (not {OWNER}'s own click)"
        msg = (f"[pal] {who}: approved: {r['command']}\nRun that exact command again now; it'll go through once." if approve else
               f"[pal] {who}: said no to: {r['command']}\nDon't retry it; carry on without it or ask {OWNER}.")
    elif approve:
        msg = f"[pal] {OWNER} approved: {r['command']}\nRun that exact command again now; it'll go through once."
    else:
        msg = f"[pal] {OWNER} said no to: {r['command']}" + (f"\nTheir note: {note}" if note else "") + f"\nDon't retry it; carry on without it or ask {OWNER}."
    if r.get("terminal") == SHELL:
        return r   # nobody to tell: whoever ran it from a plain shell runs it again (owner_step)
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
