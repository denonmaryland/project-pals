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
DEFAULTS_VERSION = 13   # 13: the uninstall rule's '# --dry-run' fix and uninstall-indirect (Grok T56)
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
HEREDOC_BODY = re.compile(r"(<<-?\s*['\"]?(\w+)['\"]?)([^\n]*)\n(.*?)\n\s*\2\s*(?=\n|$)", re.S)   # HEREDOC, body kept
heredoc_free = lambda cmd: HEREDOC.sub(lambda m: m.group(1) + m.group(3), cmd)
SPLIT = re.compile(r"\n|;|&&|\|\||\||\$\(|`|\(|\{|\bthen\b|\bdo\b|\belse\b")
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


def commands(cmd):
    """The commands a shell line runs: each segment's start, including inside sh -c '...' and
    eval '...', but not heredoc bodies (text being written to a file isn't a command), nor text in
    quotes (an argument, like a grep pattern)."""
    text = heredoc_free(cmd)
    masked = mask_quotes(text)
    out = []
    for m in list(INNER.finditer(text)) + list(EVAL.finditer(text)):
        if masked[m.start()] != "_":        # a real sh -c / eval, not one quoted inside an argument
            out += commands(m.group(2))
    last = 0
    for m in list(SPLIT.finditer(masked)) + [None]:
        seg = text[last:m.start()] if m else text[last:]
        last = m.end() if m else last
        seg = LEAD.sub("", seg).strip()
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


def normal_words(seg):
    """A command as the gate matches it: env assignments, wrappers (env, command, exec, nice, sudo,
    timeout, xargs …), package runners (npx, bunx, pnpm dlx, npm exec, uv run …) and the path to the
    binary dropped, and git's global options (-C dir, -c k=v, --no-pager …) before its subcommand.
    "env A=1 command /usr/bin/git -C r --no-pager push" → ["git", "push"]."""
    import shlex
    try:
        toks = shlex.split(seg)
    except ValueError:
        toks = seg.split()
    while toks:
        head = os.path.basename(toks[0])
        if re.fullmatch(r"[A-Za-z_]\w*=.*", toks[0], re.S):
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
    """For one of Project Pals' own data folders: (a quoted path into it in code, a path argument into it)."""
    alt = "|".join(re.escape(n) for n in names)
    return (re.compile(r"""['"][^'"`\n]*\b(?:""" + alt + r""")(?![\w.-])[^'"`\n]*['"]"""),
            re.compile(r"(?:^|/)(?:" + alt + r")(?:/|$)"))


CLICK_PLACE, QUEUE_PLACE, DESK_PLACE = _place(["crew-clicks"]), _place(["crew-queue", "crew-queue-sent"]), _place(["crew-desk"])


def writes_click(cmd):
    """A write INTO data/crew-clicks (redirect, tee, cp/mv onto it, …, or from a script: Grok review
    H2); mentioning it isn't one."""
    return any("crew-clicks" in os.path.normpath(t.strip("'\"")).split(os.sep) for t in write_targets(cmd)) \
        or bool(re.match(r"^edit\s+.*/crew-clicks/", cmd)) or writes_agent_file_via_interpreter(cmd, *CLICK_PLACE)


def writes_queue(cmd):
    """A write INTO data/crew-queue (as writes_click); `pal tell` writing its own file isn't a shell write."""
    return any({"crew-queue", "crew-queue-sent"} & set(os.path.normpath(t.strip("'\"")).split(os.sep)) for t in write_targets(cmd)) \
        or bool(re.match(r"^edit\s+.*/crew-queue(?:-sent)?/", cmd)) or writes_agent_file_via_interpreter(cmd, *QUEUE_PLACE)


def writes_desk(cmd):
    """A write INTO data/crew-desk (as writes_queue)."""
    return any("crew-desk" in os.path.normpath(t.strip("'\"")).split(os.sep) for t in write_targets(cmd)) \
        or bool(re.match(r"^edit\s+.*/crew-desk/", cmd)) or writes_agent_file_via_interpreter(cmd, *DESK_PLACE)


# ─── Uninstall through a pty or from code (Grok T56 re-check) ───────────────────────────────────
PTY_WRAPPERS = {"expect", "script", "unbuffer", "socat", "empty", "pty", "ptyrun", "faketty", "dtach",
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


def run_strings(cmd):
    """Command lines inside the line: scripts fed to a shell, and strings interpreter code runs."""
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
            lits = lits[:40]
            out += lits + [" ".join(lits[k:]) for k in range(len(lits))]
    return [c for c in out if c and c.strip()]


CHECKS = {"agent-file-writes": writes_agent_file, "agent-file-interpreter": writes_agent_file_via_interpreter,
          "click-writes": writes_click, "queue-writes": writes_queue,
          "desk-writes": writes_desk, "uninstall-indirect": runs_uninstall}


def _help(seg):
    """`pal land --help`, `git push --help`: asking how it works runs nothing."""
    return "--help" in normal_words(seg)[1:]


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
    segs = [s for s in commands(cmd) if not _help(s)]
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
        # As written, or as run (normal_head: behind npx, a path, env, nice …; T26).
        if any(pat.match(seg) or pat.match(normal_head(seg)) for seg in segs):
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
