#!/usr/bin/env bash
# Install Project Pals into the Herdr app home: its layout (pals) and the crew-* mods, plus the
# commands pals use (pal, pal-room; the older names buddy, botz and crew still work).
#
#   ./install.sh                 everything (the helpers too: see below)
#   ./install.sh --no-helpers    only the layout, mods and commands
#
# Helpers: crewd (a user service that queues messages between turns, runs routines, reports back
# and keeps memory) and Claude Code hooks + status line (pal primer and memory at session start,
# the approval gate, model/context/usage facts for the status bar). They change files outside Herdr:
# ~/.config/systemd/user and ~/.claude/settings.json (backed up first).
#
# Herdr hot-reloads mods and layouts, so a running window picks this up at once. Previous copies
# are backed up to ~/.config/herdr-app/.crew-backups/. Your pals, rooms and memory are never touched.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
stamp="$(date +%Y%m%d-%H%M%S)"
backup="$home/.crew-backups/$stamp"
helpers=1
from="local"
for arg in "$@"; do
  case "$arg" in
    --no-helpers) helpers=0 ;;
    --from-release) from="release" ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
version="$(cat "$src/VERSION" 2>/dev/null || echo 0.0.0)"

[[ -d "$home" ]] || { echo "no Herdr app home at $home (open Herdr once first)" >&2; exit 1; }
for need in rsync python3; do command -v "$need" >/dev/null || { echo "Project Pals needs $need; install it and run this again" >&2; exit 1; }; done

# About › Roll back puts back the newest update snapshot (.crew-backups/update-*.tar.gz). The
# updater takes one before it installs a release (and runs this with --from-release); take one here
# too, so Roll back undoes THIS install. Without it, Roll back after a local install skipped past it
# to whatever release the updater last replaced (on 2026-11-08 that put 0.2.1 back over Focus/Pro).
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
  # Mirror the mod (keep the files Herdr writes itself: jsconfig.json, *.d.ts).
  rsync -a --delete --exclude 'jsconfig.json' --exclude '*.d.ts' "$dir/" "$dest/"
  cp "$src/lib/crew.js" "$dest/crew.js"
  cp "$src/lib/mascot-art.js" "$dest/mascot-art.js"
  cp "$src/lib/pets.js" "$dest/pets.js"
done

# Mods Project Pals no longer ships: set aside (backed up like the rest), so nothing stale lingers.
for gone in crew-rail crew-chat; do
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
# Ctrl+Shift+M switches Focus ⇄ Pro (crew-roster.mode). It goes in keys.json's global map, so Herdr
# takes it before a terminal sees it, but only when the key is free in every section and nothing is
# bound to the mode yet: a key you already use is never changed. keys.json is backed up first.
# (Any edit makes the file yours: Herdr stops adding its new default shortcuts to it.)
if [[ -f "$home/keys.json" ]]; then
  mkdir -p "$backup"; cp -a "$home/keys.json" "$backup/keys.json"
  python3 - "$home/keys.json" <<'PY' || echo "left keys.json as it was (couldn't read it); bind ctrl-shift-m to crew-roster.mode yourself"
import json, os, sys
path = sys.argv[1]
keys = json.load(open(path))
want, action = "ctrl-shift-m", "crew-roster.mode"
same = lambda k: sorted(k.lower().split("-")) == sorted(want.split("-"))
used = [(sec, k) for sec, m in keys.items() if isinstance(m, dict) for k in m if same(k)]
bound = [k for m in keys.values() if isinstance(m, dict) for k, v in m.items() if v == action]
if bound:
    print(f"Focus/Pro switch: already on {bound[0]}")
elif used:
    print(f"Focus/Pro switch: {want} is taken ({used[0][0]} → {keys[used[0][0]][used[0][1]]}), so it has no key; bind {action} to one in keys.json")
else:
    keys.setdefault("global", {})[want] = action
    tmp = path + ".crew-tmp"
    with open(tmp, "w") as f:
        json.dump(keys, f, indent=2)
    os.replace(tmp, path)
    print(f"Focus/Pro switch: bound {want} in keys.json (backup in the install's .crew-backups folder)")
PY
else
  echo "Focus/Pro switch: no keys.json yet, so no shortcut; switch from the status bar, or bind ctrl-shift-m to crew-roster.mode"
fi
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
[[ -L "$bin/pal" ]] && rm -f "$bin/pal"
[[ -L "$bin/pal-room" ]] && rm -f "$bin/pal-room"
install -m 755 "$src/bin/crew" "$bin/pal"
install -m 755 "$src/bin/crew-room" "$bin/pal-room"
for b in crewd crew-hook crew-statusline; do install -m 755 "$src/bin/$b" "$bin/$b"; done
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
# Modules Project Pals no longer ships (crewchat.py fed the removed chat view).
rm -f "$HOME/.local/lib/herdr-crew/crewchat.py"

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
  # Claude Code hooks and status line.
  python3 "$src/install-hooks.py" "$home/.crew-backups/$stamp" || echo "skipped the Claude Code hooks (see above)"
  # Shared skills: link any into ~/.claude/skills and ~/.codex/skills.
  python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import crewskills; crewskills.curate(lambda *_: None)' "$HOME/.local/lib/herdr-crew" || true
fi

# Settings: who the pals work for (your git name, else your username) and bypass (off). Set once;
# change them in About → Settings or with: pal settings owner "Name" | bypass on|off.
mkdir -p "$home/data"
if [[ ! -f "$home/data/crew-settings.json" ]]; then
  python3 -c 'import sys, json; sys.path.insert(0, sys.argv[1]); import crewlib; json.dump({"owner": crewlib._default_owner(), "bypass": False}, open(sys.argv[2], "w"), indent=2)' \
    "$HOME/.local/lib/herdr-crew" "$home/data/crew-settings.json"
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

# What's installed, for the updater (About → Check for updates).
mkdir -p "$home/data"
python3 - "$src/pals.json" "$home/data/crew-install.json" "$version" "$helpers" "$from" <<'PY'
import json, sys, time
manifest, out, version, helpers, source = sys.argv[1:]
m = json.load(open(manifest))
json.dump({"name": m.get("name"), "repo": m.get("repo"), "version": version, "helpers": helpers == "1",
           "source": source, "installed": int(time.time())}, open(out, "w"), indent=2)
PY

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
