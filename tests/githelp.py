"""git's own word on its options, for the gate's tests (Codex T159).

The gate reads `git fetch / pull / rebase / switch / checkout / worktree add / branch` command lines
to see whether they move a base branch, and to do that it must know which options take a value (the
word after `--jobs` is not the repository). bin/crewguard.py carries those tables (GIT_OPTS). This
module asks the installed git for the truth, so tests/test_guard.py can check the tables against it
and generate its sweeps from it:

  parse_help(text)   `git <cmd> -h` → {"V": long options whose value may be the next word, "O": long
                     options whose value only comes after "=", "P": plain long options, "sv" / "so" /
                     "sp": the same for short letters, "alias": {letter: long name}}
  needs_value(...)   run `git <cmd> --opt` alone in a scratch repo: does git say it requires a value?
  table(...)         the two together, git's behaviour winning: `git pull -h` lists --jobs[=<n>], a
                     value only after "=", yet `git pull --jobs 1 . x:main` hands "--jobs 1" on to
                     git fetch, which takes the 1 (and main moved, unheld: found by running it)
"""
import re
import subprocess

SUBS = ["fetch", "pull", "push", "rebase", "switch", "checkout", "worktree add", "branch"]
ARG = re.compile(r"^(<[^>]*>|\([^)]*\)|\.\.\.)")   # <n>, (drop|keep|stop): an argument, not the description


def help_text(sub, repo, env):
    r = subprocess.run(["git", "-C", str(repo), *sub.split(), "-h"], env=env, capture_output=True, text=True)
    return r.stdout + r.stderr


def parse_help(text):
    out = {"V": set(), "O": set(), "P": set(), "sv": set(), "so": set(), "sp": set(), "alias": {}}
    for line in text.splitlines():
        if not re.match(r"^\s{2,}-", line):
            continue
        toks = line.strip().split()
        names, i = [], 0
        while i < len(toks) and toks[i].startswith("-"):
            names.append(toks[i].rstrip(","))
            last_had_comma = toks[i].endswith(",")
            i += 1
            if not last_had_comma:
                break
        rest = toks[i] if i < len(toks) else ""
        separate = bool(ARG.match(rest))       # "--depth <depth>", "--empty (drop|keep|stop)", "-C <n>"
        longs, shorts, stuck = [], [], False
        for n in names:
            if "[=" in n or re.search(r"\[<", n):          # "--gpg-sign[=<key-id>]": only after "="
                stuck = True
                n = re.split(r"\[=|\[<", n)[0]
            if n.startswith("--"):
                m = re.match(r"^--(\[no-\])?([A-Za-z0-9][A-Za-z0-9-]*)$", n)
                if m:
                    longs.append(m.group(2))
                    if m.group(1):
                        out["P"].add("no-" + m.group(2))   # a negation never takes a value
            elif re.match(r"^-[A-Za-z0-9]$", n):
                shorts.append(n[1])
        kind = "O" if stuck else "V" if separate else "P"
        for n in longs:
            out[kind].add(n)
        for c in shorts:
            out[{"O": "so", "V": "sv", "P": "sp"}[kind]].add(c)
            if longs:
                out["alias"][c] = longs[0]
    out["P"] -= out["V"] | out["O"]
    return out


def needs_value(sub, opt, repo, env):
    """`git <sub> <opt>` with nothing after it, in a scratch repo: True when git refuses it for lack
    of a value, False when it doesn't, None when git doesn't know the option."""
    r = subprocess.run(["git", "-C", str(repo), *sub.split(), opt], env=env, capture_output=True, text=True, timeout=30,
                       stdin=subprocess.DEVNULL)
    err = r.stderr
    if "requires a value" in err:
        return True
    if re.search(r"unknown (option|switch)", err):
        return None
    return False


def table(sub, repo, env):
    """parse_help, corrected by what git does: an option git refuses without a value takes one."""
    t = parse_help(help_text(sub, repo, env))
    for name in sorted(t["O"] | t["P"]):
        if needs_value(sub, f"--{name}", repo, env) is True:
            t["O"].discard(name); t["P"].discard(name); t["V"].add(name)
    for c in sorted(t["so"] | t["sp"]):
        if needs_value(sub, f"-{c}", repo, env) is True:
            t["so"].discard(c); t["sp"].discard(c); t["sv"].add(c)
    return t
