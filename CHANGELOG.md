# Changelog

## 0.3.0

A new look and a simpler shape: pocket pets, terminal-first channels, and a profile panel with a
Vault for every pal.

- **Pocket pets.** Every pal is a little LED critter whose pose shows what it's doing: resting,
  working, needs you, done, PR open, merged, closing or stuck. The Look dialog picks its species,
  colour, what it wears and its eyes. The old folder faces are gone.
- **Terminal-first.** A channel is its agent's terminal, with no card around it. Split it right or
  down from the header or by right-clicking. The chat view is gone: you answer an agent's
  questions in its terminal.
- **One layout.** The channel tab strip and the inspector are gone: channels live in the sidebar,
  and each pal's details in its profile panel.
- **The sidebar.** The shown pal up top with its channels (pin them, reorder them, search them) and
  quick actions, then every pal with its state in colour. Pals go in folders you name, pin to the
  top, and drag into any order.
- **Tasks.** One Tasks button per pal: write a task (with screenshots pasted, dropped or attached)
  and the pal is told when its current turn ends, so it picks it up next. It's a real task on the
  shared board, marked as from you.
- **Profiles.** A panel per pal, opened from its header chip: Profile (facts, channels, memory,
  routines, tasks; in Full, a dashboard with a Now / Next / Blocked / Done board and the shown
  channel's live terminal), the Vault, and an AGENTS.md tool that lints what Claude Code loads and
  writes a fix only after you've seen the diff and clicked, with backups.
- **The Vault.** Each pal's notes as a vault: a Home note that writes itself as work lands (its
  mission and focus, the channels working now, its tasks, today's journal, the week's hiccups and
  lessons, the latest decisions and changes), with Mission, Journal and Brain beside it. Plain
  markdown on disk, so it opens in Obsidian too.
- **Journal and the Dream loop.** Each pal logs what it did, what got in the way and what it cost,
  and what it learned (`pal notebook`); the week's lessons open each new session. Nightly, the
  Dream loop groups hiccups across pals and proposes fixes; nothing changes until you approve it.
- **Missions.** A pal proposes its mission (`pal mission propose`) as an Inbox card; you accept it,
  and every new session starts with it.
- **Dialogs** share one calm look, with the pal's pet in the header of a pal's dialogs.
- **A settings gear** in the status bar: hire, new rooms and groups, the Inbox, rooms, routines,
  theme and look, Herdr layouts, machines, Herdr settings, the command palette, updates and
  Project Pals settings.
- **Updates you can see.** A quiet "Update available" pill in the status bar when a new release
  is out: click it for the highlights, then Update now (checked against the release's SHA256
  sums, with Roll back) or Later. The gear menu has Check for updates.
- **One-paste install.** The README's install command downloads the latest release, checks its
  SHA256 sums and runs the installer.
- **Start-up memory.** A pal always gets its pinned note, its main memory and what it knows about
  you, whole, then the newest notes.
- **Safer approvals.** A security pass on the approval gate and on your clicks in the Inbox and
  the panel, with tests.
- The git branch moved from the header into Claude Code's status line.

### Fixed

- Updating no longer fails when Herdr's folder is outside your home folder (HERDR_APP_HOME).
- Roll back undoes the latest install, including one from `./install.sh` (it used to go back to
  the last update's files).
- Claude Code's "Press up to edit queued messages" hint no longer counts as unsent text, so
  messages to that pal go through; a finished hold leaves Waiting on.
