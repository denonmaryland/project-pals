# Project Pals

A [Herdr](https://herdr.dev) layout that turns your coding agents into a crew of pals, in the
spirit of Grok's bots but for any harness: Claude Code, Antigravity CLI (`agy`), Codex, Grok CLI,
Gemini CLI, opencode, Hermes and more.

**Website:** [project-pals.vercel.app](https://project-pals.vercel.app)

![Project Pals in Herdr: the pals sidebar with pocket pets, a pal's topics and a Claude Code session at work](preview.png)

**Linux only for now.** The helpers run as a systemd user service, so macOS (and WSL or containers
without a systemd user session) aren't supported yet. See [docs/mac-support.md](docs/mac-support.md).

Each Herdr space is a pal (a project with a brain), and each of its tabs is a topic. Pals can
work together in rooms. A head pal (Orchestrator unless you rename it) oversees the rest. On top of that you get:

- **Pocket pets:** every pal is a little LED critter whose pose shows what it's doing (working,
  needs you, done, PR open, merged, stuck, asleep). Pick its species, colour, what it wears and its
  eyes.
- **Terminal-first:** a topic is its agent's own terminal. Split it right or down, and answer the
  agent's questions right there.
- **A sidebar built for scanning:** the shown pal up top with its topics and quick actions, then
  every pal with its state in colour. Group pals into folders ("Personal", "Business"), pin them,
  and drag them into any order. Pin and reorder topics too.
- **Profiles:** a panel per pal with its mission, brain, memory, topics and tasks.
- **The Vault:** each pal's notes, with a live Home note: mission, focus, what's running, tasks,
  today's journal and the week, updating as work lands.
- **Tasks:** give a pal a task (with screenshots attached); it lands on its desk as a card.
  Routines run on a schedule.
- **Sleep (keep topics, free RAM):** a pal's agents stop while its topics' tabs and room seats
  stay; **Wake (resume topics)** starts them again where they were, resuming each topic's session.
  It never stops a pal that's working, asking you something, being typed to, or still running work
  of its own, and says why. **Close pal (end its space)** is the other way to rest one: its space
  closes and it waits under Hidden pals. (`pal sleep` / `pal wake` from the command line.)
- Hire pals and add topics on any harness, with a model per pal (cheap helpers on Haiku).
- Memory and shared skills, branch-per-topic review, and an approval gate.

## The Desk

Everything sent to a pal (a message, a question, a task, the answer to something it asked) is a
card with a status: queued, seen, working, done, held or needs you. You see when a pal actually
got it and what it did with it, instead of guessing from its screen.

- The header's **Desk** button shows every desk at once: what waits on you, what has no pal yet,
  what's held and why, then each pal and its topics. Move, raise, lower, close or cancel a card.
- **Ctrl+Shift+D** drops a card from anywhere. Pick a pal or topic, or **Auto**: a quick, cheap
  model (Claude Haiku) picks one for you, and a card it isn't sure about waits for you to place it.
- Claude Code pals get cards mid-step or when idle without anything typed into their box, so a
  half-written prompt stays put. Antigravity CLI pals get them between steps through hooks; Codex
  pals check with a `desk_check` tool; other brains get them typed in when idle.
- Pals work their desk with `pal desk` (`take`, `done "result"`, `reply`, `block`, `pass`).
  Cards are plain files in `~/.config/herdr-app/data/crew-desk`.

## Home

Click your head pal (or press **Ctrl+Shift+H**) for one page to come back to: everything that
needs you, oldest first, under one line saying who's working and what shipped today, or "All
caught up". While something needs you, Home shows one decision at a time: who's asking, the
context, what each option does and the asker's recommendation. Pick with a click or 1-9 (Enter
takes the recommendation). **T** opens your head pal's terminal, and "What happened today" opens
a drawer with what finished, got installed or was linked.

## Memory

Every awake topic is an agent holding memory, and Herdr keeps all of its terminals in one systemd
unit. When memory ran out, systemd-oomd killed that unit, and with it every pal. So:

- **One pal, one scope.** With a systemd user session, each pal's agent starts in its own scope
  (`systemd-run --user --scope`, unit `pal-<pal>-<topic>-….scope`), so oomd takes the one hungry pal,
  not the crew. The agent keeps its pid and shell, so sleep and wake work as before. Only on this
  machine; without systemd, pals start as before. Off: `"pal_scopes": false` in
  `data/crew-settings.json`.
- **Herdr's holder goes last.** The installer adds `ManagedOOMPreference=avoid` for
  `hc-hold-<id>.service` (`~/.config/systemd/user/hc-hold-.service.d/00-project-pals-oomd.conf`),
  unless a drop-in of yours there already sets it (yours wins either way: ours sorts first). Skip it
  with `--no-oomd-dropin`; uninstall takes it out.
- **Warned before it runs out.** Under the floor (1.5 GB available or 10% of RAM, whichever is larger;
  `"memory_floor_mb"` to change it), `pal hire`, `pal topic` and `pal wake` say so, the app's hire
  and topic paths show a toast, and Home shows a quiet "Memory is low" row with **Sleep idle pals**.
- **Idle topics can sleep by themselves.** `"sleep_idle_hours": 6` (off by default) has crewd put
  topics idle that long to sleep, with `pal sleep`'s usual checks (never the head pal, never one
  that's mid-turn or waiting). `pal sleep --idle --older 6` does the same once.
- **`pal ram`** lists what each awake topic holds and the machine's free memory.

Roughly what one awake topic holds (its agent and what it started, resident plus swapped, measured
with `pal ram` on Linux, 2026-11-11):

| Harness | Per awake topic |
|---|---|
| Claude Code | 0.2–0.45 GB (more in a long session) |
| Codex | about 0.4 GB, most of it its helper processes |
| Antigravity CLI, others | not measured yet |

Before waking many topics at once, check `pal ram`'s available figure against that.

## MUSE, the idea partner

An optional pal to think out loud with. Hire it from the hire dialog (Idea partner) or with
`pal hire --partner`, then riff in its #ideas topic: half-formed ideas, screenshots. It asks sharp
questions and turns what you settle on into card drafts with the right pal suggested. Nothing goes
out until you click **Send** in the Desk's Drafts; then it's your own card. MUSE runs on Claude
Code (Sonnet).

## Harnesses

| Harness | Status |
|---|---|
| Claude Code | Tested daily: hiring, topics, model picker, hooks and the Desk's pals mod (cards handed over mid-step or when idle), the approval gate and status line |
| Antigravity CLI (`agy`) | Native (goodboimax's PR #1): hiring, topics, model picker, `-i` startup prompt, hooks (`SessionStart`, `PreToolUse`, `PreInvocation`, `Stop`), the approval gate (shell commands only; its file-edit tools aren't gated yet), shared skills |
| Codex | Tested as a pal. Shared skills work, and a `desk_check` / `desk_done` tool lets it check its desk; the approval gate and hooks are Claude Code and Antigravity CLI only, so cards are typed in when it's idle |
| Grok CLI, Gemini CLI, opencode, Hermes, others | Supported by the code as terminal pals. Hooks and the approval gate are Claude Code and Antigravity CLI only |

Reports from other harnesses are welcome.

## Try it in 10 minutes

Project Pals is early software. Start with a disposable project folder and one pal.
You need **Linux**, **Herdr 0.1.8+ (below 0.2)** and
**herdr-core 0.1.11+ (below 0.2)**, plus an installed, signed-in coding harness.
Open Herdr once first. Agent usage uses your harness's account and may cost money.
Use a systemd user session for the full experience: without one, the crewd background helper
is skipped, messages are typed in directly, and routines and callbacks don't run.

1. Follow [Install](#install), including the prerequisites. Read
   [what it changes](#what-it-changes-on-your-computer) first, then select the **pals**
   layout with **Ctrl+Shift+L** and complete any welcome prompts.
2. In your own terminal, make a small test project and hire one pal:

   ```sh
   mkdir -p ~/pals-tryout
   pal hire Tryout --harness claude --folder ~/pals-tryout
   ```

   Use `--harness codex` or `--harness agy` if that's what you have. If `pal` isn't found,
   open a new terminal and check that `~/.local/bin` is on your PATH. Open Tryout's topic
   and answer any sign-in or folder-trust question yourself.
3. Send it a small request from your terminal:

   ```sh
   pal tell Tryout "Say hello and suggest one tiny project we could make here. Do not change files yet."
   ```

   Watch its topic and pet, then check the header's **Desk** for the card's delivery state.
   If it waits, open the topic for a prompt and check the Desk for a held reason.
4. Tell us what worked or where you got stuck. Run `pal report`, review the output, then
   paste it into a [bug, install problem or harness report](https://github.com/denonmaryland/project-pals/issues/new/choose).
   Include what you tried, what you expected, and what happened. A successful first run is
   useful too: choose **Harness report**.

`pal report` prints local diagnostics and uploads nothing: installed Project Pals/build,
Herdr/hc versions, distro, known harness command names found on PATH, crewd's systemd state,
up to five recognized error categories from the last 100 crewd journal lines, and the last
update-run state. It omits raw error text, paths, names, prompts, transcripts, settings and
credentials. Unknown/missing probes are marked as such; a harness being found does not mean
it's signed in or tested. Review any extra text or screenshots yourself before sharing.

If install failed before `pal` was available, run `python3 bin/crew report` from the downloaded
source folder. If your older release has no `report` command, give the three version numbers
manually (`pal version`, `herdr-app --version`, `hc --version`); don't paste paths or repo details
from `pal version`. Reporting a failed install doesn't require installing again.

When finished, **About → Uninstall** removes Project Pals while keeping your pals' data.
See [Uninstall](#uninstall) for details. For a first week, try a second topic, a second harness
if you use one, and a restart; report each separate problem with the step that triggered it.
See [CONTRIBUTING.md](CONTRIBUTING.md) for reporting and contributing.

## The approval gate

Claude Code and Antigravity CLI pals ask you before they push, publish, make a GitHub release,
merge or post on GitHub, deploy, send mail or webhooks, land a branch (with `pal land`, or by hand:
moving `main` with `git update-ref`, `git branch -f` and the like), run a repo's release script,
edit a project's AGENTS.md or CLAUDE.md, or write into Project Pals' message queue, your click
tokens or the Desk's cards. The command waits in your Inbox until you click Approve.

- It looks at the command as it runs: behind `npx`, a full path or `env`; inside `sh -c`, a heredoc
  fed to a shell, or a string that Python, Node, Perl, Ruby or PHP runs; file writes from those
  languages and from editors. A command that's only mentioned (a grep pattern, a quoted string,
  `--help`) isn't held. If the gate itself fails, the command is stopped, not let through.
- Settings, updates, roll back, uninstall, landing and renaming need your click in Project Pals too, and only
  your click sends a message as you.
- `./release` asks for your click from any terminal, not only a pal's, and only whoever put
  something on Home, the head pal or your click takes it off.
- **Trusted helpers** (About → Settings): you can let one of your own assistants send normal work
  to your pals in your name (`PAL_HELPER=<name> pal tell …`). It's off until you switch a helper
  on, one click turns it off or gives it a new key, and Home shows everything it sent and tried. It
  is never your click: approvals, push, release, merge, messaging people, settings and what's
  waiting on Home still need you. Its key is a file on your computer, so anything running as you
  that reads it can do the same, and an assistant that's been tricked by something it read will
  pass the trick on with your name on it. That's why it covers only work that's safe to undo.
- **It catches mistakes, not a pal set on getting around it.** Pals run as you: a determined one
  could build a command from pieces or write a script and run it later. Antigravity CLI pals are
  gated on shell commands only: their own file-edit tools aren't checked yet.

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

Needs Linux, Herdr (open it once first), `python3`, `curl` and `rsync`. A first install switches
Herdr to the `pals` layout (Ctrl+Shift+L if it didn't), and your head pal is waiting on Home with
a one-minute welcome tour: it introduces itself and offers to hire your first pal on one of your
project folders. Skip it any time; it's in the gear menu as Welcome tour. Without a systemd user
session the install still works, but crewd is skipped: messages are typed in directly and routines
and callbacks don't run.

### Supported Herdr

| | Supported | Run live (install, hire, topic, tell; uninstall on 0.1.14) | Checked (every mod loads, every command and argument it uses exists) |
|---|---|---|---|
| Herdr (`herdr-app`) | 0.1.8 or newer, below 0.2 | 0.1.8, 0.1.12, 0.1.14 | also 0.1.6, 0.1.7, 0.1.10, 0.1.13 |
| herdr-core (`hc`) | 0.1.11 or newer, below 0.2 | 0.1.11, 0.1.15, 0.1.19 | also 0.1.17, 0.1.18 |

Herdr is still at 0.1.x, so a Herdr update can change what Project Pals relies on. The installer
checks `herdr-app --version` and `hc --version` against this range (it's in `pals.json`) and warns
loudly outside it; it installs anyway. A Herdr newer than the tested one gets a quiet note. `pal
version` shows the same check. Herdr 0.1.5 and older don't work (two mods fail to load). Each
release states the range it was tested on.

## What it changes on your computer

Project Pals runs programs (`hc`, `git`, `claude -p` / `agy -p`) and reads files outside Herdr's folder.

- **Layout, mods and commands:** `~/.config/herdr-app/layouts/pals.json`, `mods/crew-*`, and
  `~/.local/bin/pal` and friends (`crew` is an alias).
- **Shortcuts:** Ctrl+Shift+I (profile), Ctrl+Shift+Space (command bar), Ctrl+Shift+D (drop a
  card) and Ctrl+Shift+H (Home) go into Herdr's `keys.json`, backed up first, and only where the
  key and the action are free.
- **Helpers (skip all with `--no-helpers`, or skip one harness's hooks with `--no-claude-hooks` / `--no-agy-hooks`):**
  - `herdr-crew.service`, the background helper.
  - Claude Code hooks and a status-line wrapper in `~/.claude/settings.json`, backed up first.
  - The Desk's Claude Code mod in `~/.claude/project-pals/pals`, loaded only by pals (with
    `--plugin-dir`), never by your other Claude Code sessions.
  - Antigravity CLI hooks (`project-pals`) in `~/.gemini/config/hooks.json`, backed up first, plus shared skill symlinks in `~/.gemini/config/skills`.
  - With systemd: a drop-in making Herdr's terminal holder oomd's last pick
    (`~/.config/systemd/user/hc-hold-.service.d/00-project-pals-oomd.conf`; skip with
    `--no-oomd-dropin`), and each pal's agent in its own `pal-*.scope` (see Memory).
- **Memory reviews:** these send topic screens to Claude (Haiku/Sonnet) or Antigravity CLI (Gemini Flash; choose in About → Background model).
- **The Desk's Auto routing:** a card you drop with Auto is sent to Claude Haiku (else Antigravity
  CLI) with your pals' names and topics, at most 100 times a day. Turn it off in Settings → Desk.

## Uninstall

In Project Pals: **About → Uninstall** (it asks once more). From your own terminal, in a clone or
an unpacked release (it asks you to type `uninstall`):

```sh
./install.sh --uninstall --dry-run   # list what would go, change nothing
./install.sh --uninstall             # take Project Pals out; your pals' data stays
./install.sh --uninstall --purge     # and the data too (pals, memory, the Desk, tasks, backups)
```

It takes out everything the install added: the layout and mods (Herdr goes back to its `main`
layout), `pal` and the other commands, the library in `~/.local/lib/herdr-crew`, crewd's service,
the Claude Code hooks, status-line wrapper and Desk mod, the Antigravity CLI hooks, the shared
skill links, and the shortcuts it added to `keys.json`. Your own settings in those files stay as
they are: when you haven't changed a file since the install, it goes back byte for byte; when you
have, only Project Pals' entries come out (and the file is backed up first). Folders the install
made go too, once empty.

Your pals' data (`~/.config/herdr-app/data/crew-*`) and install backups (`.crew-backups`) stay
unless you `--purge`. `--purge` still keeps `data/crew-worktrees` when it holds git worktrees,
which can have uncommitted work. Agents already running in a pal's space keep the old hooks until
they restart.

- **Only you.** Every way in (About, `pal uninstall`, `./install.sh --uninstall`, the Python module
  itself) needs your click or you typing `uninstall` at a terminal with no agent in it or above it.
  A pal's shell has no terminal to type in, and a terminal a pal makes for it (`expect`, `script`, a
  pty) has the pal above it, so both are refused. The approval gate also holds a pal's
  `./install.sh --uninstall`, the same wrapped in `expect` / `script` / `unbuffer`, and code that
  imports the uninstaller or reaches its click tokens. `--dry-run` needs neither. `--purge` tells you
  what it will delete before you type.
- **That stops mistakes, not a pal set on it.** Pals run as you, so a pal determined to get around
  these checks (detaching from its own process tree, writing a script file first) can still
  uninstall Project Pals, as it could delete the files by hand.
- **Never through a link.** If Herdr's home, a folder above it (`~/.config`) or on the way
  (`~/.local/lib`, `~/.claude`, Herdr's `mods` or `data`), or a config file is a symlink, uninstall
  leaves it and tells you, instead of deleting or writing where the link points. Install skips a
  `~/.claude/settings.json`, `~/.gemini` hooks file or `keys.json` that is a link too, and says so.
- It removes only what the install recorded placing, and only when it still holds Project Pals'
  own content (installs before 0.4.1 have no record: the content alone decides), and only hook
  entries that are exactly Project Pals' commands.

## Hiring a pal into a new folder

The first time Claude Code runs in a folder, it asks **"Quick safety check: Is this a project you
created or one you trust?"** and waits for you. A pal hired into a folder Claude Code hasn't seen
(or a topic on a new worktree) stops on that question, and its first task starts only after
you answer it.

Project Pals never answers it for you: trusting a folder is your call. It tells you instead:
`pal hire` and `pal topic` print a notice, Herdr shows a toast (click it to jump to the tab), and
`pal overview` lists it under "Waiting on" until you answer. Open the tab and pick
**Yes, I trust this folder** (or **No, exit**).

## Updates

When a newer release is out, a quiet **Update · 0.x.y** pill shows at the bottom of the sidebar.
Click it for the version and its highlights, then **Update now** or **Later** (the pill stays away
for 3 days for that version). The gear menu has **Check for updates** too: it always asks GitHub,
and says what the newest release is and when it asked. Project Pals looks by itself every 6 hours
at most, and every 10 minutes while About or the update dialog is open.

- Updates come only from this repo's GitHub releases, and must match the release's
  `SHA256SUMS`.
- Updates replace only Project Pals's own files. Your pals, rooms, memory, routines and tasks
  are never touched. Herdr reloads the mods by itself; nothing restarts.
- The previous version is kept for **Roll back** (in the update dialog after an update, and in
  Project Pals settings). If an install fails, the previous version goes back by itself.

From a terminal: `pal version` and `pal update check`. Installing and rolling back are buttons in
Project Pals: they need your click, so a pal can't start one.

### Working on Project Pals itself: the Live channel

If you have a checkout of this repo and change Project Pals with your own pals, **About › Update
channel › Live** makes your install follow your checkout's `main`: what you land is checked,
installed and reloaded in place within seconds, and a toast says what reloaded. Only the mods that
changed reload; the helper restarts only when its own code changed. A build that doesn't come up is
put back by itself and held until `main` moves.

Before landing, Review has **Try it live**: it runs a topic's branch in your real install, with an
amber strip across the top saying so, and **Back** (what was running returns) and **Land on main**
on it. **Back to stable** in About puts the newest release back.

All of these are your click. A pal can't switch the channel, start a trial or install, and while
Live is on, a pal moving `main` by hand is held for your approval like any landing.
A first install has nothing to roll back to; to take it out again, use Uninstall (above).

## Releasing (maintainers)

```sh
./release 0.2.0 "What changed"
```

This bumps `VERSION`, tags it, builds the tarball and `SHA256SUMS`, pushes, and creates the
GitHub release. It first asks for the owner's go: a request in Project Pals' Inbox, then the same
command once more after the click (without Project Pals, you type the version). `./release 0.2.0
--dry-run` runs every check and nothing else.

## License

MIT
