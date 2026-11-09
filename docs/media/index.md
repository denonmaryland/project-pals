# Project Pals 0.3.0: screenshots and clips

Two sets, both shot on 2026-11-08 in a second Herdr window with its own app home.

- **Live** (`overview`, `profile-vault`, `profile-vault-side`, `profile-vault-journal`,
  `profile-agents-md`, `pal-menu`, `gear-menu`, `open-profile`): the window runs 0.3.0 against
  the owner's real herdr-core, so the terminals are real Claude Code sessions working on this
  repo (the Project Pals - Herdr Mod pal and its topics). Paths, the usage meter and the vault's
  folder are blurred. The journal's entries are blurred too: they describe work after 0.3.0.
- **Demo** (the rest): its own herdr-core session, with made-up pals (Atlas, Juniper, Pixel, Nova,
  Fern, Bolt, Moss), an owner called Sam, made-up topics, tasks, missions and agent output.

Every still and every clip frame was checked for private content; see "Privacy review" below.
Live stills are 1833x1090 `herdr-app shot` frames; demo stills are 1790x1133 for the wide window
and 876x1133 for the narrow one, or crops of those. Clips are bursts of `herdr-app shot`, as
H.264 MP4 plus a GIF for the README (palette).

## Stills

| File | What it shows |
|---|---|
| `preview.png` | The herdr.dev card picture (1600x1000): the whole window, Juniper's #checkout topic working, the sidebar with groups and the status bar. |
| `overview.png` | Live: the whole window, the Project Pals pal's #docs-check topic with Claude Code working (a task from another pal, background agents checking RECIPE.md), the sidebar with the pal card, topics and pals. |
| `hero.png` | The big pal card: Juniper's pet (working, with its laptop and floor glow), its topics with "+3 more", and the quick actions (+ Topic, Tasks, profile, sleep). |
| `pal-rows.png` | The pal list: the head pal (Atlas, working) on top, the "Client work" group with Juniper pinned (done) and Nova (needs you), "Side projects" with Pixel (done). Status first, in colour. |
| `groups-folded.png` | The same list with "Side projects" folded and "Unassigned" below it. |
| `status-bar.png` | The status bar's left end: the gear, "6 working" and "1 needs you". |
| `update-pill.png` | The status bar's right end with the quiet "Update available · 0.3.0" pill (installed: 0.2.3). |
| `update-dialog.png` | The update dialog: "Project Pals 0.3.0 is out", the release highlights, Later / Update now. |
| `splits.png` | A topic split right: two agent terminals side by side. |
| `profile-vault.png` | Live: the profile panel's Vault in Full, on Home: the file tree, the live Home note (brain, project, topics, owner; focus; Right now with each working topic's task; Now / Next / Blocked / Done today) and the rail (this week's counts, the latest decision with who decided). |
| `profile-vault-side.png` | Live: the Vault in Side, next to the working terminal: Home with the focus card, Right now and the task board. |
| `profile-vault-journal.png` | Live: Vault › Journal in Full: All / Hiccups / Lessons, this week's hiccups and time lost, today's entries (blurred). |
| `profile-vault-mission.png` | Demo: Vault › Mission in Full: the mission card (goals ticked or not, done-when, focus), the latest changes with their topic, and the latest decisions with who decided (Sam). |
| `profile-agents-md.png` | Live: the profile panel on AGENTS.md (Profile · Vault ‖ AGENTS.md) beside the working terminal: what Claude Code loads, the files, the lint. |
| `tasks-dialog.png` | Tasks for Juniper: a task being written with a screenshot attached, and its open tasks (narrow window). |
| `new-channel.png` | The New topic dialog with "docs-site" typed (narrow window). |
| `hire.png` | Hire a pal, with "Scout" typed: brain, model, role, project folder, first topic (narrow window). |
| `new-room.png` | New room "launch" with Juniper and Nova ticked (narrow window). |
| `new-group.png` | New group "Business" (narrow window). |
| `look.png` | Pixel's look: live previews of every state, species, colour, what it wears, eyes (narrow window). |
| `gear-menu.png` | Live: the gear menu over a working session: Hire, New room, New group, Inbox, Rooms, Routines, Theme, layouts, Machines, Herdr settings, Command palette, Check for updates, Project Pals settings. |
| `pal-menu.png` | Live: the pal chip's menu over a working session: Profile, Vault, Memory, Tasks, AGENTS.md, Open folder, Put to sleep. |
| `pal-right-click.png` | A pal row's right-click menu: Profile, Mission, Pin, Move, Rename, Customize look, New topic, groups, Put to sleep (narrow window). |

## Clips

| File | What it shows | Length |
|---|---|---|
| `pet-working.mp4` / `.gif` | The big card's pet while its topic works: paw tapping, bits rising, the blue floor glow. The GIF is cropped to the card. | 6 s |
| `switch-channels.mp4` / `.gif` | Clicking through Juniper's topics (#api-tests, #perf, #docs, #checkout): the list highlight moves and the terminal follows. | 9 s |
| `open-profile.mp4` / `.gif` | Live: from the working #docs-check session, opening the profile panel on Vault › Home in Side, then Full, then Mission and Journal from the file tree (journal entries blurred). 14 fps; the GIF is 7 fps, 860 wide. | 11 s |
| `task-with-image.mp4` / `.gif` | Writing "Tidy the README screenshots" in Tasks, attaching a screenshot, pressing Enter: "Task added for Juniper". | 11 s |

The drag-into-a-group clip from the shot list wasn't taken: dragging needs the real mouse, and the
demo was driven by commands only. `switch-channels` is in its place.

## Privacy review

- Live set: every frame shows only the second Herdr window. Blurred: the usage meter in the
  status bar, the vault's folder path under "On disk", and the journal's entries (work after
  0.3.0). Left visible on purpose: the owner's name (DeNon) as the pal's owner and in the one
  decision, the project path `~/Projects/project-pals`, and the agents' own messages about this
  repo. No emails, keys, tokens, other projects' content or personal files.
- Demo set: only the demo window and made-up content. Paths: the demo projects live in a
  throwaway folder, so some frames show `~/projects/juniper`; in `task-with-image` the
  attachment's path under `/run/user/1000/ppd/…` scrolls through the demo terminal for a moment.
  Neither holds a name or anything personal.
- The status bar's version reads `pal 0.3.0` (`pal 0.2.3` in the update shots, which show an
  install that has 0.3.0 waiting).
