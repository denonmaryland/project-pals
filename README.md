# Project Pals

A [Herdr](https://herdr.dev) layout that turns your coding agents into a crew of pals, in the
spirit of Grok's bots but for any harness: Claude Code, Codex, Grok CLI, Gemini CLI, opencode,
Hermes and more.

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
| Claude Code | Tested daily: hiring, channels, hooks, the approval gate, status line and chat view |
| Codex | Tested as a pal. The approval gate, hooks, status line and chat view are Claude Code only |
| Grok CLI, Gemini CLI, opencode, Hermes, others | Supported by the code but not tested yet. The approval gate, hooks and status line are Claude Code only |

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

Project Pals runs programs (`hc`, `git`, `claude -p`) and reads files outside Herdr's folder.

- **Layout, mods and commands:** `~/.config/herdr-app/layouts/pals.json`, `mods/crew-*`, and
  `~/.local/bin/pal` and friends (`crew` is an alias).
- **Helpers (skip them with `--no-helpers`):**
  - `herdr-crew.service`, the background helper.
  - Claude Code hooks and a status-line wrapper in `~/.claude/settings.json`, backed up first.
- **Memory reviews:** these send channel screens to Claude (Haiku). Nightly memory distillation
  uses Sonnet.

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

The chat view's reading behaviour (following the newest message until you scroll up, tool chips
with live status, turn footers, loading earlier messages in place) follows
[flockbook](https://github.com/minchenlee/flockbook)'s chat, and its selectable markdown
(`mods/crew-chat/markdown.js`, `estimate.js`) is adapted from flockbook's code. MIT,
© 2026 Min-Chen Lee.
