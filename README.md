# Project Pals

A [Herdr](https://herdr.dev) layout that turns your coding agents into a crew of pals, in the
spirit of Grok's bots but for any harness: Claude Code, Antigravity CLI (`agy`), Codex, Grok CLI,
Gemini CLI, opencode, Hermes and more.

![Project Pals in Herdr: the pals sidebar, channel tabs and a chat view](preview.png)

**Linux only for now.** The helpers run as a systemd user service, so macOS (and WSL or containers
without a systemd user session) aren't supported yet. See [docs/mac-support.md](docs/mac-support.md).

Each Herdr space is a pal (a project with a brain), and each of its tabs is a channel. Pals can
work together in rooms. A head pal (Orchestrator unless you rename it) oversees the rest. On top of that you get:

- a sidebar of pals (folder faces that show what each is doing) and their channels as tabs:
  pin them, color them from your theme, rename them, put a pal to sleep and wake it later
- hire pals and add channels on any harness, with a model per pal (cheap helpers on Haiku)
- tasks and routines
- memory and shared skills
- branch-per-channel review
- an approval gate
- a chat view for channels

## Harnesses

| Harness | Status |
|---|---|
| Claude Code | Native: hiring, channels, model picker, hooks, the approval gate, status line and chat view |
| Antigravity CLI (`agy`) | Native: hiring, channels, model picker, `-i` startup prompt, hooks (`SessionStart`, `PreToolUse`, `PreInvocation`, `Stop`), the approval gate, shared skills, session stats and chat view |
| Codex | Tested as a pal. Shared skills work; the approval gate, hooks and chat view are Claude Code and Antigravity CLI only |
| Grok CLI, Gemini CLI, opencode, Hermes, others | Supported by the code as terminal pals. Hooks, the approval gate and chat view are Claude Code and Antigravity CLI only |

Reports from other harnesses are welcome.

## Install

```sh
git clone https://github.com/denonmaryland/project-pals && cd project-pals
./install.sh            # or ./install.sh --no-helpers for just the layout, mods and commands
```

Needs Linux, Herdr (open it once first), `python3` and `rsync`. Then switch Herdr to the `pals`
layout (Ctrl+Shift+L). Without a systemd user session the install still works, but crewd is
skipped: messages are typed in directly and routines and callbacks don't run.

## What it changes on your computer

Project Pals runs programs (`hc`, `git`, `claude -p` / `agy -p`) and reads files outside Herdr's folder.

- **Layout, mods and commands:** `~/.config/herdr-app/layouts/pals.json`, `mods/crew-*`, and
  `~/.local/bin/pal` and friends (`crew` is an alias).
- **Helpers (skip all with `--no-helpers`, or skip one harness's hooks with `--no-claude-hooks` / `--no-agy-hooks`):**
  - `herdr-crew.service`, the background helper.
  - Claude Code hooks and a status-line wrapper in `~/.claude/settings.json`, backed up first.
  - Antigravity CLI hooks (`project-pals`) in `~/.gemini/config/hooks.json`, backed up first, plus shared skill symlinks in `~/.gemini/config/skills`.
- **Memory reviews:** these send channel screens to Claude (Haiku/Sonnet) or Antigravity CLI (Gemini Flash; configurable with `pal settings llm auto|claude|agy`).

## Hiring a pal into a new folder

The first time Claude Code runs in a folder, it asks **"Quick safety check: Is this a project you
created or one you trust?"** and waits for you. A pal hired into a folder Claude Code hasn't seen
(or a channel on a new worktree) stops on that question, and its first task starts only after
you answer it.

Project Pals never answers it for you: trusting a folder is your call. It tells you instead:
`pal hire` and `pal channel` print a notice, Herdr shows a toast (click it to jump to the tab), and
`pal overview` lists it under "Waiting on" until you answer. Open the tab and pick
**Yes, I trust this folder** (or **No, exit**).

## Updates

About (the ⓘ in the sidebar) → **Check for updates** → **Update**. Project Pals also checks once
a day by itself.

- Updates come only from this repo's GitHub releases, and must match the release's
  `SHA256SUMS`.
- Updates replace only Project Pals's own files. Your pals, rooms, memory, routines and tasks
  are never touched.
- The previous version is kept for **Roll back**.

From a terminal: `pal version`, `pal update check | apply | rollback`.

## Releasing (maintainers)

```sh
./release 0.2.0 "What changed"
```

This bumps `VERSION`, tags it, builds the tarball and `SHA256SUMS`, pushes, and creates the
GitHub release.

## License

MIT
