#!/usr/bin/env bash
# Install Terminal Botz into the Herdr app home: its layout (crew) and the crew-* mods, plus the
# commands bots use (botz, botz-room; crew and crew-room still work).
#
#   ./install.sh                 everything (the helpers too: see below)
#   ./install.sh --no-helpers    only the layout, mods and commands
#
# Helpers: crewd (a user service that queues messages between turns, runs routines, reports back
# and keeps memory) and Claude Code hooks + status line (crew primer and memory at session start,
# the approval gate, model/context facts for the chat view). They change files outside Herdr:
# ~/.config/systemd/user and ~/.claude/settings.json (backed up first).
#
# Herdr hot-reloads mods and layouts, so a running window picks this up at once. Previous copies
# are backed up to ~/.config/herdr-app/.crew-backups/. Your bots, rooms and memory are never touched.
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

python3 "$src/gen-mascots.py" >/dev/null

for dir in "$src"/mods/crew-*; do
  name="$(basename "$dir")"
  dest="$home/mods/$name"
  if [[ -d "$dest" ]]; then mkdir -p "$backup/mods/$name"; rsync -a --exclude mascots "$dest/" "$backup/mods/$name/"; fi
  mkdir -p "$dest"
  # Mirror the mod (keep the files Herdr writes itself: jsconfig.json, *.d.ts).
  rsync -a --delete --exclude 'jsconfig.json' --exclude '*.d.ts' "$dir/" "$dest/"
  cp "$src/lib/crew.js" "$dest/crew.js"
  cp "$src/lib/mascot-art.js" "$dest/mascot-art.js"
done

mkdir -p "$home/layouts"
if [[ -f "$home/layouts/crew.json" ]]; then mkdir -p "$backup/layouts"; cp -a "$home/layouts/crew.json" "$backup/layouts/"; fi
cp "$src/layouts/crew.json" "$home/layouts/crew.json"
[[ -f "$src/layouts/crew.svg" ]] && cp "$src/layouts/crew.svg" "$home/layouts/crew.svg"

# The commands bots (and you) use. botz / botz-room are the names; crew / crew-room stay as aliases.
mkdir -p "$HOME/.local/bin" "$HOME/.local/lib/herdr-crew"
for b in crew crew-room crewd crew-hook crew-statusline; do install -m 755 "$src/bin/$b" "$HOME/.local/bin/$b"; done
# Relative links, so backups of them restore cleanly.
ln -sfn crew "$HOME/.local/bin/botz"
ln -sfn crew-room "$HOME/.local/bin/botz-room"
install -m 644 "$src"/bin/crew*.py "$HOME/.local/lib/herdr-crew/"

if [[ $helpers -eq 1 ]]; then
  # crewd, as a user service.
  mkdir -p "$HOME/.config/systemd/user"
  install -m 644 "$src/systemd/herdr-crew.service" "$HOME/.config/systemd/user/herdr-crew.service"
  systemctl --user daemon-reload
  systemctl --user enable herdr-crew.service >/dev/null 2>&1 || true
  systemctl --user restart herdr-crew.service
  # Claude Code hooks and status line.
  python3 "$src/install-hooks.py" "$home/.crew-backups/$stamp"
fi

# Shared skills: link any into ~/.claude/skills and ~/.codex/skills.
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); import crewskills; crewskills.curate(lambda *_: None)' "$HOME/.local/lib/herdr-crew"

# The god bot's home: its standing brief, read by whatever harness runs it (AGENTS.md, CLAUDE.md).
god="$home/data/crew-god"
mkdir -p "$god"
if [[ -f "$god/AGENTS.md" ]] && ! cmp -s "$god/AGENTS.md" "$src/god/AGENTS.md"; then mkdir -p "$backup/crew-god"; cp -a "$god/AGENTS.md" "$backup/crew-god/"; fi
cp "$src/god/AGENTS.md" "$god/AGENTS.md"
printf '@AGENTS.md\n' > "$god/CLAUDE.md"

# What's installed, for the updater (About → Check for updates).
mkdir -p "$home/data"
python3 - "$src/botz.json" "$home/data/crew-install.json" "$version" "$helpers" "$from" <<'PY'
import json, sys, time
manifest, out, version, helpers, source = sys.argv[1:]
m = json.load(open(manifest))
json.dump({"name": m.get("name"), "repo": m.get("repo"), "version": version, "helpers": helpers == "1",
           "source": source, "installed": int(time.time())}, open(out, "w"), indent=2)
PY

echo "installed Terminal Botz $version into $home"
[[ -d "$backup" ]] && echo "previous copies: $backup"

if command -v herdr-app >/dev/null; then
  fail=0
  for dir in "$home"/mods/crew-*; do
    if ! out="$(herdr-app check "$dir" 2>&1)"; then echo "check failed: $(basename "$dir")"; echo "$out"; fail=1; fi
  done
  [[ $fail -eq 0 ]] && echo "all Terminal Botz mods pass herdr-app check"
  exit $fail
fi
