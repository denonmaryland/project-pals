# Project Pals

A [Herdr](https://herdr.dev) layout that turns your coding agents into a crew of pals, in the
spirit of Grok's bots but for any harness: Claude Code, Antigravity CLI (`agy`), Codex, Grok CLI,
Gemini CLI, opencode, Hermes and more.

![Project Pals in Herdr: the pals sidebar with pocket pets, a pal's channels and its terminal](preview.png)

**Linux only for now.** The helpers run as a systemd user service, so macOS (and WSL or containers
without a systemd user session) aren't supported yet. See [docs/mac-support.md](docs/mac-support.md).

Each Herdr space is a pal (a project with a brain), and each of its tabs is a channel. Pals can
work together in rooms. A head pal (Orchestrator unless you rename it) oversees the rest. On top of that you get:

- **Pocket pets:** every pal is a little LED critter whose pose shows what it's doing (working,
  needs you, done, PR open, merged, stuck, asleep). Pick its species, colour, what it wears and its
  eyes.
- **Terminal-first:** a channel is its agent's own terminal. Split it right or down, and answer the
  agent's questions right there.
- **A sidebar built for scanning:** the shown pal up top with its channels and quick actions, then
  every pal with its state in colour. Group pals into folders ("Personal", "Business"), pin them,
  and drag them into any order. Pin and reorder channels too.
- **Profiles:** a panel per pal with its mission, brain, memory, channels and tasks.
- **The Vault:** each pal's notes, with a live Home note: mission, focus, what's running, tasks,
  today's journal and the week, updating as work lands.
- **Tasks:** give a pal a task (with screenshots attached); it picks it up when its current turn
  ends. Routines run on a schedule.
- Hire pals and add channels on any harness, with a model per pal (cheap helpers on Haiku).
- Memory and shared skills, branch-per-channel review, and an approval gate.

## Harnesses

| Harness | Status |
|---|---|
| Claude Code | Tested daily: hiring, channels, model picker, hooks (messages handed over between steps), the approval gate and status line |
| Antigravity CLI (`agy`) | Native (goodboimax's PR #1): hiring, channels, model picker, `-i` startup prompt, hooks (`SessionStart`, `PreToolUse`, `PreInvocation`, `Stop`), the approval gate, shared skills |
| Codex | Tested as a pal. Shared skills work; the approval gate and hooks are Claude Code and Antigravity CLI only, so messages are typed in when it's idle |
| Grok CLI, Gemini CLI, opencode, Hermes, others | Supported by the code as terminal pals. Hooks and the approval gate are Claude Code and Antigravity CLI only |

Reports from other harnesses are welcome.

## Install

Paste this in a terminal. It downloads the latest release, checks it against the release's
`SHA256SUMS` (it stops if they don't match), and runs the installer:

```sh
cd "$(mktemp -d)" && u=https://github.com/denonmaryland/project-pals/releases/latest/download \
  && curl -fsSLO "$u/SHA256SUMS" && f=$(awk '{print $2}' SHA256SUMS) \
  && curl -fsSLO "$u/$f" && sha256sum -c SHA256SUMS \
  && tar xzf "$f" && cd "${f%.tar.gz}" && ./install.sh
```

Or from a clone (to follow `main`, or to read everything first):

```sh
git clone https://github.com/denonmaryland/project-pals && cd project-pals
./install.sh            # or ./install.sh --no-helpers for just the layout, mods and commands
```

Needs Linux, Herdr (open it once first), `python3`, `curl` and `rsync`. Then switch Herdr to the
`pals` layout (Ctrl+Shift+L). Without a systemd user session the install still works, but crewd is
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

When a newer release is out, a quiet **Update available · 0.x.y** pill shows in the status bar.
Click it for the version and its highlights, then **Update now** or **Later** (the pill stays away
for 3 days for that version). The gear menu has **Check for updates** too. Project Pals looks at
most every 6 hours.

- Updates come only from this repo's GitHub releases, and must match the release's
  `SHA256SUMS`.
- Updates replace only Project Pals's own files. Your pals, rooms, memory, routines and tasks
  are never touched. Herdr reloads the mods by itself; nothing restarts.
- The previous version is kept for **Roll back** (in the update dialog after an update, and in
  Project Pals settings). If an install fails, the previous version goes back by itself.

From a terminal: `pal version`, `pal update check | apply | rollback`.

## Releasing (maintainers)

```sh
./release 0.2.0 "What changed"
```

This bumps `VERSION`, tags it, builds the tarball and `SHA256SUMS`, pushes, and creates the
GitHub release.

## License

MIT
