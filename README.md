# Project Pals

A [Herdr](https://herdr.dev) layout that turns your coding agents into a crew of pals, in the
spirit of Grok's bots but for any harness: Claude Code, Codex, Grok CLI, Gemini CLI, opencode,
Hermes and more.

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

## Install

```sh
git clone https://github.com/denonmaryland/terminal-pal && cd terminal-pal
./install.sh            # or ./install.sh --no-helpers for just the layout, mods and commands
```

Then switch Herdr to the `pals` layout (Ctrl+Shift+L). Linux only for now: the helpers use a
systemd user service.

## What it changes on your computer

Project Pals runs programs (`hc`, `git`, `claude -p`) and reads files outside Herdr's folder.

- **Layout, mods and commands:** `~/.config/herdr-app/layouts/pals.json`, `mods/crew-*`, and
  `~/.local/bin/pal` and friends (`crew` is an alias).
- **Helpers (skip them with `--no-helpers`):**
  - `herdr-crew.service`, the background helper.
  - Claude Code hooks and a status-line wrapper in `~/.claude/settings.json`, backed up first.
- **Memory reviews:** these send channel screens to Claude (Haiku). Nightly memory distillation
  uses Sonnet.

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
