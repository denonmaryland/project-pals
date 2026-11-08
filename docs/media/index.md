# Project Pals 0.3.0: screenshots and clips

Shot on 2026-11-08 in a separate demo Herdr window: its own app home and its own herdr-core
session, with made-up pals (Atlas, Juniper, Pixel, Nova, Fern, Bolt, Moss), an owner called Sam,
made-up channels, tasks, missions and agent output (a small script that prints a pretend session
and reports its status). Nothing from a real setup is in any frame. Every still and every clip
frame was checked for private content; see "Privacy review" below.

Stills are `herdr-app shot` frames: 1790x1133 for the wide window and 876x1133 for the narrow
one (the window sizes they were taken at), or crops of those. Clips are bursts of `herdr-app shot`
at 15 fps, as H.264 MP4 plus a GIF for the README (10 fps, palette).

## Stills

| File | What it shows |
|---|---|
| `preview.png` | The herdr.dev card picture (1600x1000): the whole window, Juniper's #checkout channel working, the sidebar with groups and the status bar. |
| `overview.png` | The same frame at full size (1790x1133). |
| `hero.png` | The big pal card: Juniper's pet (working, with its laptop and floor glow), its channels with "+3 more", and the quick actions (+ Channel, Tasks, profile, sleep). |
| `pal-rows.png` | The pal list: the head pal (Atlas, working) on top, the "Client work" group with Juniper pinned (done) and Nova (needs you), "Side projects" with Pixel (done). Status first, in colour. |
| `groups-folded.png` | The same list with "Side projects" folded and "Unassigned" below it. |
| `status-bar.png` | The status bar's left end: the gear, "6 working" and "1 needs you". |
| `update-pill.png` | The status bar's right end with the quiet "Update available · 0.3.0" pill (installed: 0.2.3). |
| `update-dialog.png` | The update dialog: "Project Pals 0.3.0 is out", the release highlights, Later / Update now. |
| `splits.png` | A channel split right: two agent terminals side by side. |
| `profile-vault.png` | The profile panel's Vault in Full, on Home: the vault's file tree, the live Home note (mission, focus, Right now with each channel's task, Now / Next / Blocked / Done today, today's journal) and the rail (this week, latest decisions with who decided). |
| `profile-vault-mission.png` | Vault › Mission in Full: the mission card (goals ticked or not, done-when, focus), the latest changes with their channel, and the latest decisions with who decided (Sam). |
| `profile-agents-md.png` | The profile panel on AGENTS.md (Profile · Vault ‖ AGENTS.md): what Claude Code loads, the files, the lint. |
| `tasks-dialog.png` | Tasks for Juniper: a task being written with a screenshot attached, and its open tasks (narrow window). |
| `new-channel.png` | The New channel dialog with "docs-site" typed (narrow window). |
| `hire.png` | Hire a pal, with "Scout" typed: brain, model, role, project folder, first channel (narrow window). |
| `new-room.png` | New room "launch" with Juniper and Nova ticked (narrow window). |
| `new-group.png` | New group "Business" (narrow window). |
| `look.png` | Pixel's look: live previews of every state, species, colour, what it wears, eyes (narrow window). |
| `gear-menu.png` | The gear menu: Hire, New room, New group, Inbox, Rooms, Routines, Theme, layouts, Machines, Herdr settings, Command palette, Check for updates, Project Pals settings (narrow window). |
| `pal-menu.png` | The pal chip's menu: Profile, Vault, Memory, Tasks (6 open), AGENTS.md, Open folder, Put to sleep (narrow window). |
| `pal-right-click.png` | A pal row's right-click menu: Profile, Mission, Pin, Move, Rename, Customize look, New channel, groups, Put to sleep (narrow window). |

## Clips

| File | What it shows | Length |
|---|---|---|
| `pet-working.mp4` / `.gif` | The big card's pet while its channel works: paw tapping, bits rising, the blue floor glow. The GIF is cropped to the card. | 6 s |
| `switch-channels.mp4` / `.gif` | Clicking through Juniper's channels (#api-tests, #perf, #docs, #checkout): the list highlight moves and the terminal follows. | 9 s |
| `open-profile.mp4` / `.gif` | Opening the profile panel on Vault › Home, then the Vault's Mission, Journal and Brain notes, from the file tree. | 13 s |
| `task-with-image.mp4` / `.gif` | Writing "Tidy the README screenshots" in Tasks, attaching a screenshot, pressing Enter: "Task added for Juniper". | 11 s |

The drag-into-a-group clip from the shot list wasn't taken: dragging needs the real mouse, and the
demo was driven by commands only. `switch-channels` is in its place.

## Privacy review

- Every frame shows only the demo window, and only made-up content.
- No usage meter (the demo's agents report none), no emails, keys, tokens, or real file contents.
- Paths: the demo projects live in a throwaway folder, so some frames show `~/projects/juniper`.
  `profile-brain.png` shows `/run/user/1000/ppd/app/data/crew-memory/juniper/brain`, and in
  `task-with-image` the attachment's path under `/run/user/1000/ppd/…` scrolls through the demo
  terminal for a moment. Neither holds a name or anything personal.
- The status bar's version reads `pal 0.3.0` (`pal 0.2.3` in the update shots, which show an
  install that has 0.3.0 waiting).
