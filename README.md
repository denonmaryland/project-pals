# Terminal Botz

A [Herdr](https://herdr.dev) layout that turns your coding agents into a crew of bots, in the
spirit of Grok Bot but for any harness: Claude Code, Codex, Grok CLI, Gemini CLI, opencode,
Hermes and more.

Each Herdr space is a bot (a project with a brain), and each of its tabs is a channel. Bots can
work together in rooms. A god bot, Shepherd, oversees the rest. On top of that you get:

- tasks and routines
- memory and shared skills
- branch-per-channel review
- an approval gate
- a chat view for channels

## Install

```sh
git clone https://github.com/denonmaryland/terminal-botz && cd terminal-botz
./install.sh            # or ./install.sh --no-helpers for just the layout, mods and commands
```

Then switch Herdr to the `crew` layout (Ctrl+Shift+L). Linux only for now: the helpers use a
systemd user service.

## What it changes on your computer

Terminal Botz runs programs (`hc`, `git`, `claude -p`) and reads files outside Herdr's folder.

- **Layout, mods and commands:** `~/.config/herdr-app/layouts/crew.json`, `mods/crew-*`, and
  `~/.local/bin/botz` and friends (`crew` is an alias).
- **Helpers (skip them with `--no-helpers`):**
  - `herdr-crew.service`, the background helper.
  - Claude Code hooks and a status-line wrapper in `~/.claude/settings.json`, backed up first.
- **Memory reviews:** these send channel screens to Claude (Haiku). Nightly memory distillation
  uses Sonnet.

## Updates

About (the ⓘ in the sidebar) → **Check for updates** → **Update**. Terminal Botz also checks once
a day by itself.

- Updates come only from this repo's GitHub releases, and must match the release's
  `SHA256SUMS`.
- Updates replace only Terminal Botz's own files. Your bots, rooms, memory, routines and tasks
  are never touched.
- The previous version is kept for **Roll back**.

From a terminal: `botz version`, `botz update check | apply | rollback`.

## Releasing (maintainers)

```sh
./release 0.2.0 "What changed"
```

This bumps `VERSION`, tags it, builds the tarball and `SHA256SUMS`, pushes, and creates the
GitHub release.

## License

MIT
