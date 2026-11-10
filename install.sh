#!/usr/bin/env bash
# Install Project Pals into the Herdr app home: its layout (pals) and the crew-* mods, plus the
# commands pals use (pal, pal-room; the older names buddy, botz and crew still work).
#
#   ./install.sh                    everything (the helpers too: see below)
#   ./install.sh --no-claude-hooks  helpers + Antigravity CLI hooks, leaving ~/.claude/settings.json alone
#   ./install.sh --no-agy-hooks     helpers + Claude Code hooks, leaving ~/.gemini/config/hooks.json alone
#   ./install.sh --no-helpers       only the layout, mods and commands
#   ./install.sh --uninstall [--purge] [--dry-run]
#                                   take Project Pals out again (bin/crewuninstall.py): everything it
#                                   added, nothing of yours; your pals' data stays unless --purge
#
# Helpers: crewd (a user service that queues messages between turns, runs routines, reports back
# and keeps memory) plus Claude Code and Antigravity CLI hooks and the Claude status line (pal primer
# and memory at session start, the approval gate, messages handed over between steps instead of
# typed in, model/context/usage facts for the status bar). They change files outside Herdr:
# ~/.config/systemd/user, ~/.claude/settings.json and ~/.gemini/config/hooks.json (backed up first).
#
# Herdr hot-reloads mods and layouts, so a running window picks this up at once. Previous copies
# are backed up to ~/.config/herdr-app/.crew-backups/. Your pals, rooms and memory are never touched.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
stamp="$(date +%Y%m%d-%H%M%S)"
backup="$home/.crew-backups/$stamp"
helpers=1
claude_hooks=1
agy_hooks=1
from="local"
uninstall=0
un_flags=()
for arg in "$@"; do
  case "$arg" in
    --no-helpers) helpers=0; claude_hooks=0; agy_hooks=0 ;;
    --no-claude-hooks) claude_hooks=0 ;;
    --no-agy-hooks) agy_hooks=0 ;;
    --from-release) from="release" ;;
    --uninstall) uninstall=1 ;;
    --purge|--dry-run) un_flags+=("$arg") ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
version="$(cat "$src/VERSION" 2>/dev/null || echo 0.0.0)"

# Uninstall: the same code as `pal uninstall` (which needs the owner's click in About), run from here.
if [[ $uninstall -eq 1 ]]; then
  command -v python3 >/dev/null || { echo "uninstalling needs python3" >&2; exit 1; }
  HERDR_APP_HOME="$home" exec python3 "$src/bin/crewuninstall.py" uninstall ${un_flags[@]+"${un_flags[@]}"}
fi
[[ ${#un_flags[@]} -eq 0 ]] || { echo "--purge and --dry-run go with --uninstall" >&2; exit 2; }

[[ -d "$home" ]] || { echo "no Herdr app home at $home (open Herdr once first)" >&2; exit 1; }
for need in rsync python3; do command -v "$need" >/dev/null || { echo "Project Pals needs $need; install it and run this again" >&2; exit 1; }; done

# Which Herdr this release works with (pals.json "herdr"): outside that range, say so loudly, then go on.
# If the check itself breaks, say that loudly too (Grok T56): the install goes on, unchecked.
if ! python3 "$src/bin/crewcompat.py" "$src/pals.json"; then
  echo "WARNING: couldn't check which Herdr this is (the check failed, above). Installing anyway; Project Pals needs Herdr 0.1.8+ and herdr-core 0.1.11+, below 0.2." >&2
fi

# What exists before this install touches anything (and the person's config files as they are now,
# the first time), so an uninstall can take out exactly what Project Pals added (bin/crewuninstall.py).
HERDR_APP_HOME="$home" python3 "$src/bin/crewuninstall.py" record || echo "couldn't record what was here before the install; an uninstall will be less exact" >&2

# About › Roll back puts back the newest update snapshot (.crew-backups/update-*.tar.gz). The
# updater takes one before it installs a release (and runs this with --from-release); take one here
# too, so Roll back undoes THIS install. Without it, Roll back after a local install skipped past it
# to whatever release the updater last replaced (on 2026-11-08 that put 0.2.1 back over the new build).
# Only over an existing install (a fresh one has nothing to go back to); the last 5 are kept.
if [[ "$from" == "local" && -d "$home/mods/crew-roster" ]]; then
  HERDR_APP_HOME="$home" python3 - "$src/bin" <<'PY' || echo "couldn't snapshot the current install for Roll back; continuing" >&2
import sys
sys.path.insert(0, sys.argv[1])
import crewupdate
crewupdate._snapshot(f"from-{crewupdate.installed().get('version', 'unknown')}-local")
local = [p for p in crewupdate.backups() if "-local-" in p.name]
for p in local[:-5]:
    p.unlink(missing_ok=True)
PY
fi

for dir in "$src"/mods/crew-*; do
  name="$(basename "$dir")"
  dest="$home/mods/$name"
  if [[ -d "$dest" ]]; then mkdir -p "$backup/mods/$name"; rsync -a --exclude mascots "$dest/" "$backup/mods/$name/"; fi
  mkdir -p "$dest"
  # main.js goes in LAST, after the shared JS and the mod's other files: Herdr reloads a mod when
  # its files change, and a reload that ran between main.js and crew.js kept the old crew.js (seen
  # live 2026-11-08: Trees didn't show; nothing errored, as the old crew.js had every name). So:
  # the shared JS (crew.js, pets.js, palstyles.js: the pal list's looks, machines.js: which computer
  # a pal works on), then the mirror (keeping
  # the files Herdr writes itself: jsconfig.json, *.d.ts; the shared JS and main.js are excluded,
  # which also keeps --delete off them), then main.js, copied fresh so the last change is its own.
  cp "$src/lib/machines.js" "$dest/machines.js"
  cp "$src/lib/pets.js" "$dest/pets.js"
  cp "$src/lib/palstyles.js" "$dest/palstyles.js"
  cp "$src/lib/factories.js" "$dest/factories.js"
  cp "$src/lib/crew.js" "$dest/crew.js"
  # The folder mascots are retired (2026-11-08): no mod needs mascot-art.js any more.
  rm -f "$dest/mascot-art.js"
  rsync -a --delete --exclude 'jsconfig.json' --exclude '*.d.ts' --exclude '/crew.js' --exclude '/pets.js' --exclude '/palstyles.js' --exclude '/factories.js' --exclude '/machines.js' --exclude '/main.js' "$dir/" "$dest/"
  cp "$dir/main.js" "$dest/main.js.new" && mv -f "$dest/main.js.new" "$dest/main.js"
done

# Mods Project Pals no longer ships: set aside (backed up like the rest), so nothing stale lingers.
for gone in crew-rail crew-chat crew-prompt crew-palrail crew-tabs crew-side crew-tell; do
  if [[ -d "$home/mods/$gone" ]]; then
    mkdir -p "$backup/mods"; cp -a "$home/mods/$gone" "$backup/mods/" && rm -rf "$home/mods/$gone"
  fi
done

mkdir -p "$home/layouts"
if [[ -f "$home/layouts/pals.json" ]]; then mkdir -p "$backup/layouts"; cp -a "$home/layouts/pals.json" "$backup/layouts/"; fi
cp "$src/layouts/pals.json" "$home/layouts/pals.json"
# Its interface font is Adwaita Sans; without it, Geist (which ships with Herdr).
if ! fc-list 2>/dev/null | grep -qi "Adwaita Sans"; then
  sed -i 's/"ui_font": "Adwaita Sans"/"ui_font": "Geist"/' "$home/layouts/pals.json"
fi
[[ -f "$src/layouts/pals.svg" ]] && cp "$src/layouts/pals.svg" "$home/layouts/pals.svg"
# Pro was removed (2026-11-08), and with it the Focus ⇄ Pro switch. Older installs bound
# ctrl-shift-m to crew-roster.mode in keys.json's global map: take that one binding out, and only
# when it's exactly ours (that key, that action, in "global"). keys.json is backed up first; any
# other binding, or the same action on another key, is left alone.
# A keys.json that is a link (a dotfiles manager's) is never written: a rename would replace the link.
[[ -L "$home/keys.json" ]] && echo "skipped keys.json's shortcuts: it's a link; bind them yourself (README: What it changes)"
if [[ -f "$home/keys.json" && ! -L "$home/keys.json" ]] && grep -q '"crew-roster.mode"' "$home/keys.json"; then
  mkdir -p "$backup"; [[ -f "$backup/keys.json" ]] || cp -a "$home/keys.json" "$backup/keys.json"
  python3 - "$home/keys.json" <<'PY' || echo "left keys.json as it was (couldn't read it)"
import json, os, sys
path = sys.argv[1]
keys = json.load(open(path))
g = keys.get("global")
if isinstance(g, dict) and g.get("ctrl-shift-m") == "crew-roster.mode":
    del g["ctrl-shift-m"]
    tmp = path + ".crew-tmp"
    with open(tmp, "w") as f:
        json.dump(keys, f, indent=2)
    os.replace(tmp, path)
    print("removed the old Focus/Pro shortcut (ctrl-shift-m) from keys.json (backup in the install's .crew-backups folder)")
PY
fi
# Project Pals' shortcuts in keys.json's global map: ctrl-shift-i → crew-roster.profile (the profile
# panel, 2026-11-08), ctrl-shift-space → crew-header.search (the command bar, T18; Herdr leaves
# it free, and Ctrl+K stays with the terminal, where it's the shell's kill-line) and ctrl-shift-d →
# crew-header.drop (the Desk's quick-drop; free in Herdr and in keys.json) and ctrl-shift-h →
# crew-roster.home (Home, the head pal's page; free in both too) and ctrl-shift-g →
# crew-roster.factory (the factory switcher, T66; free in both, checked 2026-11-09). Each only when
# nothing in the file uses that key yet and its action isn't bound already. keys.json is backed up
# first; without a keys.json, nothing is written (a new file would replace Herdr's default keys), and
# the panel and the command bar still open from the header, the hero and the menus.
for pair in "ctrl-shift-i crew-roster.profile the profile panel" "ctrl-shift-space crew-header.search the command bar" "ctrl-shift-d crew-header.drop the quick-drop" "ctrl-shift-h crew-roster.home Home" "ctrl-shift-g crew-roster.factory the factory switcher"; do
  read -r key action what <<<"$pair"
  if [[ -f "$home/keys.json" && ! -L "$home/keys.json" ]] && ! grep -q "\"$action\"" "$home/keys.json"; then
    mkdir -p "$backup"; [[ -f "$backup/keys.json" ]] || cp -a "$home/keys.json" "$backup/keys.json"
    python3 - "$home/keys.json" "$key" "$action" "$what" <<'PY2' || echo "left keys.json as it was (couldn't read it)"
import json, os, sys
path, key, action, what = sys.argv[1:5]
keys = json.load(open(path))
used = any(isinstance(m, dict) and key in m for m in keys.values())
if used:
    print(f"{key} is taken in keys.json: bind {action} to a key of your own for {what}")
else:
    keys.setdefault("global", {})[key] = action
    tmp = path + ".crew-tmp"
    with open(tmp, "w") as f:
        json.dump(keys, f, indent=2)
    os.replace(tmp, path)
    print(f"added {key} for {what} to keys.json (backup in the install's .crew-backups folder)")
PY2
  fi
done
# The layout used to be called crew, then buddies: move over (backing the old one up) and show the
# new one if an old one was showing.
was_shown=""
for old in crew buddies; do
  if [[ -f "$home/layouts/$old.json" ]] && grep -q '"crew-roster"' "$home/layouts/$old.json"; then
    command -v herdr-app >/dev/null && herdr-app status 2>/dev/null | grep -q "\"layout\": \"$old\"" && was_shown=1
    mkdir -p "$backup/layouts"; mv "$home/layouts/$old.json" "$backup/layouts/$old.json"
    [[ -f "$home/layouts/$old.svg" ]] && mv "$home/layouts/$old.svg" "$backup/layouts/$old.svg"
  fi
done

# The commands pals (and you) use: pal and pal-room. buddy / botz / crew (and -room) are older names
# for them, linked only where nothing else (CrewAI's `crew`, say) already uses the name.
bin="$HOME/.local/bin"
mkdir -p "$bin" "$HOME/.local/lib/herdr-crew"
# What crewd runs (itself and the modules it imports), before this install: a running crewd keeps the
# old code until it restarts.
crewd_code() { { cat "$bin/crewd" "$HOME/.local/lib/herdr-crew/"crew*.py 2>/dev/null || true; } | cksum; }
crewd_before="$(crewd_code)"
[[ -L "$bin/pal" ]] && rm -f "$bin/pal"
[[ -L "$bin/pal-room" ]] && rm -f "$bin/pal-room"
install -m 755 "$src/bin/crew" "$bin/pal"
install -m 755 "$src/bin/crew-room" "$bin/pal-room"
for b in crewd crew-hook crew-hook-fast crew-statusline crew-mcp; do install -m 755 "$src/bin/$b" "$bin/$b"; done
ours() { grep -qsE "Project Pals|Project Buddies|Terminal Botz|Herdr Crew" "$1"; }
for alias in buddy:pal buddy-room:pal-room botz:pal botz-room:pal-room crew:pal crew-room:pal-room; do
  name="${alias%%:*}"; target="${alias##*:}"
  if [[ ! -e "$bin/$name" && ! -L "$bin/$name" ]] || [[ -L "$bin/$name" && -z "$(readlink -e "$bin/$name")" ]] || ours "$bin/$name"; then
    rm -f "$bin/$name"; ln -s "$target" "$bin/$name"   # relative, so backups restore cleanly
  else
    echo "left $bin/$name alone (it isn't Project Pals'); use $target"
  fi
done
install -m 644 "$src"/bin/crew*.py "$HOME/.local/lib/herdr-crew/"
# Modules Project Pals no longer ships (crewprompt.py fed the removed prompt card). crewchat.py stays:
# it no longer feeds a chat view, but pal ask and the callbacks read pals' replies from session files
# through it (PR #2).
# prompt card).
rm -f "$HOME/.local/lib/herdr-crew/crewprompt.py"

if [[ $helpers -eq 1 ]]; then
  # crewd, as a user service (needs a systemd user session: not in most containers or WSL).
  if command -v systemctl >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/systemd/user"
    install -m 644 "$src/systemd/herdr-crew.service" "$HOME/.config/systemd/user/herdr-crew.service"
    systemctl --user daemon-reload
    systemctl --user enable herdr-crew.service >/dev/null 2>&1 || true
    systemctl --user restart herdr-crew.service || echo "crewd didn't start; see: journalctl --user -u herdr-crew"
  else
    echo "skipped crewd: no systemd user session here (messages are typed in directly; no routines or callbacks)"
  fi
  # Claude Code and Antigravity CLI hooks (plus Claude's status line).
  hook_flags=()
  [[ $claude_hooks -eq 0 ]] && hook_flags+=(--no-claude)
  [[ $agy_hooks -eq 0 ]] && hook_flags+=(--no-agy)
  python3 "$src/install-hooks.py" ${hook_flags[@]+"${hook_flags[@]}"} "$home/.crew-backups/$stamp" || echo "skipped the agent hooks (see above)"
  # The Desk's Claude Code mod (claude-mod/pals): it hands cards to Claude Code pals mid-step and when
  # idle without typing in their box, and draws them as cards. Copied to ~/.claude/project-pals/pals
  # (the old copy backed up first); Claude Code pals load it with --plugin-dir (crew-settings.json
  # "claude_mod"), so your other Claude Code sessions never do. Skipped with --no-claude-hooks.
  if [[ $claude_hooks -eq 1 && -d "$src/claude-mod/pals" ]]; then
    cmod="$HOME/.claude/project-pals/pals"
    if [[ -d "$cmod" ]]; then mkdir -p "$backup/claude-mod"; cp -a "$cmod" "$backup/claude-mod/"; fi
    rm -rf "$cmod.new"; mkdir -p "$cmod.new"
    (cd "$src/claude-mod/pals" && find . -type f ! -name '*.test.*' ! -path './.claude-plugin/types/*' -exec install -D -m 644 {} "$cmod.new/{}" \;)
    rm -rf "$cmod"; mv "$cmod.new" "$cmod"
    claude_mod_path="$cmod"
  fi
  # Shared skills: link any into ~/.claude/skills, ~/.codex/skills and ~/.gemini/config/skills.
  python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import crewskills, crewchat; crewskills.curate(lambda *_: None); crewchat.refresh_agy_models()' "$HOME/.local/lib/herdr-crew" || true
elif [[ "$(crewd_code)" != "$crewd_before" ]] && command -v systemctl >/dev/null \
     && systemctl --user is-active --quiet herdr-crew.service 2>/dev/null; then
  # --no-helpers leaves systemd alone, so the running crewd still has the old code (its routines,
  # nightly dream, notebook nudges). Say so, loudly, with the one command that fixes it.
  echo "NOTE: crewd's code changed, but it's still running the old version (--no-helpers doesn't restart it)."
  echo "      Restart it to load the new code:  systemctl --user restart herdr-crew.service"
fi

# Settings: who the pals work for (your git name, else your username) and bypass (off). Set once;
# change them in About → Settings (pal settings changes them only with the owner's click from the app).
mkdir -p "$home/data"
if [[ ! -f "$home/data/crew-settings.json" ]]; then
  python3 -c 'import sys, json; sys.path.insert(0, sys.argv[1]); import crewlib; json.dump({"owner": crewlib._default_owner(), "bypass": False}, open(sys.argv[2], "w"), indent=2)' \
    "$HOME/.local/lib/herdr-crew" "$home/data/crew-settings.json"
fi
# Codex pals get the Desk's MCP server (desk_check …) on their own command line, from here.
python3 - "$home/data/crew-settings.json" "$bin/crew-mcp" <<'PY'
import json, sys
path, mcp = sys.argv[1:]
try:
    s = json.load(open(path))
except (OSError, ValueError):
    s = {}
if s.get("codex_mcp") != mcp:
    s["codex_mcp"] = mcp
    json.dump(s, open(path, "w"), indent=2)
PY
# Where Claude Code pals load the Desk's mod from (set above when it was installed).
if [[ -n "${claude_mod_path:-}" ]]; then
    python3 - "$home/data/crew-settings.json" "$claude_mod_path" <<'PY'
import json, sys
path, mod = sys.argv[1:]
try:
    s = json.load(open(path))
except (OSError, ValueError):
    s = {}
if s.get("claude_mod") != mod:
    s["claude_mod"] = mod
    json.dump(s, open(path, "w"), indent=2)
PY
fi
# The head pal's name became a setting (Orchestrator by default). One already hired keeps its name.
python3 - "$home/data/crew-settings.json" "$home/shared.json" <<'PY'
import json, sys
path, shared = sys.argv[1:]
s = json.load(open(path))
if not s.get("head"):
    try:
        god = next((b for b in json.load(open(shared)).get("crew", {}).get("bots", []) if b.get("god")), None)
    except (OSError, ValueError):
        god = None
    # Its space's live name (it may have been renamed in Herdr since), else the record's.
    live = None
    if god and god.get("space"):
        try:
            import subprocess
            out = subprocess.run(["herdr-app", "ls"], capture_output=True, text=True, timeout=20).stdout
            live = next((x["name"] for x in json.loads(out).get("spaces", []) if x.get("id") == god["space"]), None)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            live = None
    s["head"] = live or (god or {}).get("name") or "Orchestrator"
    json.dump(s, open(path, "w"), indent=2)
PY

# The head pal's home: its standing brief (with the owner's name), read by whatever harness runs it.
god="$home/data/crew-god"
if [[ -f "$god/AGENTS.md" ]]; then mkdir -p "$backup/crew-god"; cp -a "$god/AGENTS.md" "$backup/crew-god/"; fi
install -m 644 "$src/god/AGENTS.md" "$HOME/.local/lib/herdr-crew/god-AGENTS.md"
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import crewlib; crewlib.render_god()' "$HOME/.local/lib/herdr-crew"
# The idea partner's (MUSE's) brief, the same way: its home is data/crew-partner (pal hire --partner).
if [[ -f "$src/partner/AGENTS.md" ]]; then
  install -m 644 "$src/partner/AGENTS.md" "$HOME/.local/lib/herdr-crew/partner-AGENTS.md"
  python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import crewlib; crewlib.render_partner()' "$HOME/.local/lib/herdr-crew"
fi

# The Desk (every pal's cards): data/crew-desk with its README and trays, the desk settings that are
# missing, and the shipped pal-desk skill (an edited one is kept and the new one written beside it as
# SKILL.md.new). Cards themselves are never touched, like pals, rooms, memory, routines and tasks.
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import crewdesk; print(crewdesk.install(sys.argv[2], sys.argv[3]))' \
  "$HOME/.local/lib/herdr-crew" "$src/skills/pal-desk/SKILL.md" "$version" || echo "couldn't set up the Desk (see above)"

# What's installed, for the updater (About → Check for updates).
mkdir -p "$home/data"
# Which build this is (Home's "Installed" line and its install log): the commit, its branch and
# subject, and whether the folder had uncommitted changes. From a git checkout; else, from an export
# (git archive, which the head pal installs from so other pals' untracked files stay out), from
# CREW_BUILD=<hash> (with CREW_BUILD_BRANCH / CREW_BUILD_SUBJECT if known) or a BUILD file at the
# root (a hash, or JSON with hash, branch, subject, tag, ahead). A release tarball has none.
# data/crew-installs.jsonl keeps one line per install (the last 200).
python3 - "$src/pals.json" "$home/data/crew-install.json" "$version" "$helpers" "$claude_hooks" "$agy_hooks" "$from" "$src" "$home/data/crew-installs.jsonl" <<'PY'
import json, os, subprocess, sys, time
manifest, out, version, helpers, claude_hooks, agy_hooks, source, src, log = sys.argv[1:]
m = json.load(open(manifest))
def git(*a):
    try:
        r = subprocess.run(["git", "-C", src, *a], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None
build = None
if os.path.exists(os.path.join(src, ".git")) and git("rev-parse", "--short", "HEAD"):
    build = {"hash": git("rev-parse", "--short", "HEAD"), "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
             "subject": (git("log", "-1", "--format=%s") or "")[:160], "dirty": bool(git("status", "--porcelain", "--untracked-files=no")),
             "tag": git("describe", "--tags", "--abbrev=0"), "ahead": None}
    if build["tag"]:
        n = git("rev-list", "--count", f"{build['tag']}..HEAD")
        build["ahead"] = int(n) if n and n.isdigit() else None
else:
    import re
    given = None
    if os.environ.get("CREW_BUILD", "").strip():
        given = {"hash": os.environ["CREW_BUILD"].strip(), "branch": os.environ.get("CREW_BUILD_BRANCH") or None,
                 "subject": os.environ.get("CREW_BUILD_SUBJECT") or None}
    elif os.path.isfile(os.path.join(src, "BUILD")):
        raw = open(os.path.join(src, "BUILD")).read().strip()
        try:
            given = json.loads(raw) if raw.startswith("{") else {"hash": raw.split()[0] if raw else ""}
        except ValueError:
            given = None
    if given is not None and not isinstance(given, dict):
        given = {"hash": ""}
    h = str((given or {}).get("hash") or "").strip()
    if re.fullmatch(r"[0-9a-f]{4,40}", h):
        g = given
        ahead = g.get("ahead")
        build = {"hash": h[:12] if len(h) > 12 else h, "branch": (str(g["branch"])[:80] if g.get("branch") else None),
                 "subject": (str(g["subject"])[:160] if g.get("subject") else None), "dirty": False,
                 "tag": (str(g["tag"])[:40] if g.get("tag") else None), "ahead": ahead if isinstance(ahead, int) else None,
                 "export": True}
    elif given is not None:
        print(f"ignored the build id {h[:40]!r} (CREW_BUILD or BUILD): it isn't a commit hash", file=sys.stderr)
now = int(time.time())
rec = {"name": m.get("name"), "repo": m.get("repo"), "version": version, "helpers": helpers == "1",
       "claude_hooks": claude_hooks == "1", "agy_hooks": agy_hooks == "1",
       "source": source, "installed": now}
if build:
    rec["build"] = build
# The Herdr it was installed on, and whether that's in the supported range (pals.json "herdr").
try:
    sys.path.insert(0, os.path.join(src, "bin"))
    import crewcompat
    c = crewcompat.check(m)
    rec["herdr"] = {"app": c["programs"][0]["version"], "core": c["programs"][1]["version"], "supported": c["ok"],
                    "warn": c["warn"], "range": m.get("herdr")}
except Exception as e:
    print(f"couldn't check the Herdr version: {e}", file=sys.stderr)
json.dump(rec, open(out, "w"), indent=2)
try:
    lines = open(log).read().splitlines()[-199:]
except OSError:
    lines = []
lines.append(json.dumps({"at": now * 1000, "version": version, "source": source, "build": build}))
tmp = log + ".tmp"
open(tmp, "w").write("\n".join(lines) + "\n")
os.replace(tmp, log)
PY

# The manifest: what this install placed, so an uninstall removes only that (bin/crewuninstall.py).
HERDR_APP_HOME="$home" python3 "$src/bin/crewuninstall.py" record-installed "$src" || echo "couldn't record what was installed; an uninstall will check each file's content instead" >&2

echo "installed Project Pals $version into $home"
[[ -d "$backup" ]] && echo "previous copies: $backup"
if [[ -n "$was_shown" ]]; then herdr-app do layout.switch '{"name":"pals"}' >/dev/null 2>&1 && echo "switched Herdr to the pals layout"; fi

if command -v herdr-app >/dev/null; then
  fail=0
  for dir in "$home"/mods/crew-*; do
    if ! out="$(herdr-app check "$dir" 2>&1)"; then echo "check failed: $(basename "$dir")"; echo "$out"; fail=1; fi
  done
  [[ $fail -eq 0 ]] && echo "all Project Pals mods pass herdr-app check"
  exit $fail
fi
