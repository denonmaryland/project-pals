#!/usr/bin/env python3
"""Add Project Pals's Claude Code hooks to ~/.claude/settings.json (idempotent, backs it up first).
They only act inside Herdr spaces; every other Claude Code session is left alone."""
import json
import os
import shutil
import sys
import time
from pathlib import Path

settings = Path.home() / ".claude" / "settings.json"
backup_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else settings.parent / "backups"
hook = str(Path.home() / ".local" / "bin" / "crew-hook")
try:
    data = json.loads(settings.read_text()) if settings.exists() else {}
except ValueError:
    print(f"skipped the Claude Code hooks: {settings} isn't valid JSON (fix it, then run ./install.sh again)")
    sys.exit(0)
hooks = data.setdefault("hooks", {})
want = {
    "SessionStart": {"matcher": "^(startup|resume|clear|compact)$", "hooks": [{"type": "command", "command": f"{hook} session-start", "timeout": 10}]},
    "PreToolUse": {"matcher": "Bash", "hooks": [{"type": "command", "command": f"{hook} pre-tool-use", "timeout": 10}]},
}
changed = False
for event, entry in want.items():
    entries = hooks.setdefault(event, [])
    if any("crew-hook" in h.get("command", "") for e in entries for h in e.get("hooks", [])):
        continue
    entries.append(entry)
    changed = True
# The status line goes through crew-statusline, which saves each channel's model / effort / context /
# usage for the chat view and then runs the original command (kept in data/crew-statusline-original).
wrapper = str(Path.home() / ".local" / "bin" / "crew-statusline")
data_dir = Path(os.environ.get("HERDR_APP_HOME", Path.home() / ".config" / "herdr-app")) / "data"
sl = data.get("statusLine") or {}
if sl.get("type") == "command" and "crew-statusline" not in sl.get("command", ""):
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "crew-statusline-original").write_text(sl["command"])
    data["statusLine"] = {**sl, "command": wrapper}
    changed = True
elif not sl:
    data["statusLine"] = {"type": "command", "command": wrapper}
    changed = True
if changed:
    if settings.exists():
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(settings, backup_dir / f"claude-settings-{time.strftime('%Y%m%d-%H%M%S')}.json")
    settings.parent.mkdir(parents=True, exist_ok=True)
    tmp = settings.with_suffix(".crew.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(settings)
    print("updated Project Pals's Claude Code hooks and status line (backup in %s)" % backup_dir)
else:
    print("Project Pals's Claude Code hooks were already there")
