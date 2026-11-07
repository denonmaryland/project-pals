#!/usr/bin/env python3
"""Add Project Pals's hooks to ~/.claude/settings.json and ~/.gemini/config/hooks.json (idempotent, backed up first).
They only act inside Herdr spaces; every other Claude Code or Antigravity CLI session is left alone."""
import json
import os
import shutil
import sys
import time
from pathlib import Path

flags = {a for a in sys.argv[1:] if a.startswith("--")}
positional = [a for a in sys.argv[1:] if not a.startswith("--")]
backup_dir = Path(positional[0]) if positional else Path.home() / ".claude" / "backups"
hook = str(Path.home() / ".local" / "bin" / "crew-hook")


def write_with_backup(path, data, backup_prefix):
    existed = path.exists()
    if existed:
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup_dir / f"{backup_prefix}-{time.strftime('%Y%m%d-%H%M%S')}.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".crew.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(path)
    return existed


def install_claude():
    settings = Path.home() / ".claude" / "settings.json"
    try:
        data = json.loads(settings.read_text()) if settings.exists() else {}
    except ValueError:
        print(f"skipped the Claude Code hooks: {settings} isn't valid JSON (fix it, then run ./install.sh again)")
        return
    hooks = data.setdefault("hooks", {})
    want = {
        "SessionStart": {"matcher": "^(startup|resume|clear|compact)$", "hooks": [{"type": "command", "command": f"{hook} session-start", "timeout": 10}]},
        "PreToolUse": {"matcher": "Bash", "hooks": [{"type": "command", "command": f"{hook} pre-tool-use", "timeout": 10}]},
        # Messages from other pals: handed over between tools and as a turn ends, instead of typed in.
        "PostToolUse": {"matcher": ".*", "hooks": [{"type": "command", "command": f"{hook} post-tool-use", "timeout": 10}]},
        "Stop": {"hooks": [{"type": "command", "command": f"{hook} stop", "timeout": 10}]},
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
        if write_with_backup(settings, data, "claude-settings"):
            print("updated Project Pals's Claude Code hooks and status line (backup in %s)" % backup_dir)
        else:
            print("added Project Pals's Claude Code hooks and status line to %s" % settings)
    else:
        print("Project Pals's Claude Code hooks were already there")


def install_agy():
    hooks_file = Path.home() / ".gemini" / "config" / "hooks.json"
    try:
        data = json.loads(hooks_file.read_text()) if hooks_file.exists() else {}
    except ValueError:
        print(f"skipped the Antigravity CLI hooks: {hooks_file} isn't valid JSON (fix it, then run ./install.sh again)")
        return
    if not isinstance(data, dict):
        print(f"skipped the Antigravity CLI hooks: {hooks_file} isn't a JSON object")
        return
    want = {
        "SessionStart": [{"type": "command", "command": f"{hook} agy-session-start", "timeout": 10}],
        "PreToolUse": [{"matcher": "run_command", "hooks": [{"type": "command", "command": f"{hook} agy-pre-tool-use", "timeout": 10}]}],
        # Messages from other pals: handed over before each model call and as a turn ends, instead of typed in.
        "PreInvocation": [{"type": "command", "command": f"{hook} agy-pre-invocation", "timeout": 10}],
        "Stop": [{"type": "command", "command": f"{hook} agy-stop", "timeout": 10}],
    }
    cur = data.get("project-pals")
    cur = cur if isinstance(cur, dict) else {}
    if all(cur.get(k) == v for k, v in want.items()):
        print("Project Pals's Antigravity CLI hooks were already there")
        return
    data["project-pals"] = {**cur, **want}
    if write_with_backup(hooks_file, data, "agy-hooks"):
        print("updated Project Pals's Antigravity CLI hooks (backup in %s)" % backup_dir)
    else:
        print("added Project Pals's Antigravity CLI hooks to %s" % hooks_file)


if "--no-claude" not in flags:
    install_claude()
if "--no-agy" not in flags:
    install_agy()
