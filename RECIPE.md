# Project Pals

Your coding agents as a crew of pals. Any harness works: Claude Code, Codex, Grok CLI, Gemini CLI,
opencode, Hermes, Copilot, Cursor, pi.

Every Herdr space is a pal (a project with a brain), and each of its tabs is a channel, a clone
working on one thing. Pals are pocket pets whose pose shows what they're doing. You can watch
a channel as a chat instead of a terminal, put pals together in group-chat rooms, and give them
tasks and scheduled routines. A head pal (named Orchestrator by default; About → Settings or `pal settings head "Name"`
renames it) oversees everyone.

The layout updates itself from its GitHub releases.

![Project Pals](preview.png)

## What you see

The window is one shell on the `chrome` background, with no title bar. The interface font is
Adwaita Sans, or Geist when Adwaita Sans isn't installed.

- **Sidebar** (left; 300px wide, drag between 56 and 440; under 160px it folds to a 64px rail of
  faces, each naming its pal on hover; its count at the top is what the Inbox counts, red when
  something needs you, hidden at zero):
  - Two round icon buttons at the top: fold, and search (opens the command palette).
  - **The head pal, on top:** a 64px living face, centered, with its name under it and a small status
    dot on the face.
  - **A pill switcher:** Pals · Rooms · Tasks · Inbox. Only Inbox shows a count, with a red or
    green dot, when something waits.
  - **Pals:** each pal is a 40px face, its name (14px, 500), and a one-line preview. The preview
    is its latest channel's terminal title, tagged `[channel]` when it has several. A mark shows
    only when something's happening: a wave while working, a green dot when it finished. A pill
    on the right counts its channels ("4 ch", shown from two up), or turns red ("1 blocked") when
    one needs you. Click a pal to open it; its channels are the tabs along the top, not rows
    here. Right-click a pal for Pin to the top, Rename (memory and routines follow: the roster
    remembers each space's name and runs `pal renamed` when it changes), Customize look, New
    channel, Put to sleep (keeps the model it's on; Herdr asks "Close space?"). Right-click a
    sleeping pal for Wake / Unpin / Forget, a room card for Open / Close room. A pal hired in the
    last 10 minutes with no brain yet shows "starting". Pinned pals
    sit first, in the order pinned, with a small pin after the name and a hairline under them.
    Pals with no agent running fold into an **Asleep** row with a count; clicking a closed one
    wakes it with every channel it had, by name (records keep a tab id → name map).
  - **Rooms:** cards listing each room's members' faces and its goal, plus "New room".
  - **Tasks:** an "Add a task, @Pal to assign it" field, then bordered lists (Blocked, In
    progress, Open, Done today). Each task row shows its owner's face, its title and
    `T3 · Owner`. Clicking a task expands it: details, Open channel, Mark done, Cancel, Reopen.
  - **Inbox:**
    - Approval cards ("X wants to push", the command in monospace, Decline / Approve).
    - "X looks stuck" rows.
    - Finished and needs-you channels.
    - A banner if the helper service is off.
  - **Footer:** "+ Hire a pal", then icons for computers, routines (clock), About (ⓘ, with a dot
    when an update is out) and settings.
- **Frame** (padding 8/10, gap 6):
  - **Tab bar, 38px:** the shown pal's channels as soft pills, the only place channels are
    listed. The shown one is filled; each has a 7px status dot (yellow working, red needs you,
    green done, grey idle) and a name; ✕ appears on hover; double-click renames; a round + adds one.
    Right-click a tab (the `crew-menu` popup) to pin it, color it, rename or close it. Pinned tabs
    move to the front (`tab.move`, so Alt+number reaches them first), show a pin and no ✕, and a
    hairline follows them. Colors are the theme's own (ansi1–6 and accent, stored by name in
    shared `crew.marks`), so a colored tab follows the theme: its pill is tinted and its name
    takes the color. Every new channel gets one automatically: the palette color that looks most
    different (OKLab) from the ones its pal already uses, blue first. Clearing it in the menu
    keeps it plain. In a room, it shows rooms instead (overlapping faces, then `#name`).
  - **Sheet** (radius 18, the `surface` color, 1px border):
    - **Header, 52px:** one line: a 20px face, the pal name (dimmed), `/`, `#channel` (15px,
      500; click to rename). On the right: a status dot and word, and the details-panel toggle. In a room
      it's a centered pill: overlapping faces, then `#room`.
    - **Center stack:**
      - `tab-view`: the channel's terminal (padding 0/24, pane radius 12).
      - `room-view`: the room as a group chat. Your bubbles are on the right in the accent
        color; pals' are on the left with a 30px face and name. It's a centered column at most
        860px wide, with "• • •" typing bubbles.
      - (A `chat-view`, the channel read as a chat, was removed on 2026-11-08: Project Pals is
        terminal-first, and a real chat belongs to the native app.)
      - **Prompt card** (a floating block over `center`, bottom, centred): when the shown channel
        is blocked on a Claude Code permission prompt or question, its command and every option
        (Yes / Yes, don't ask again / No…) or the question's options; a click answers it (below).
    - **Composer** (rooms only; hidden while a channel is shown): an r8 box, "Message #room"
      (a draft per room), + to attach and send. Files can be dropped in or pasted as images.
    - **Details panel, 340px, hidden by default:**
      - A header: a 38px face (click it to change the look), the name, and
        "harness · computer".
      - The channel: name, folder and a branch tag, then "Take over terminal".
      - A 2×2 grid of stat cards: Context, Usage, Model, This session.
      - Own branch: Review and Land.
      - Other channels, Tasks, Routines, and Memory (a pinned-note field plus the three latest
        remembered facts).
- **Dialogs** (520px, sized to content, the `popover` color):
  - Hire a pal, New channel, New room, Routines, Look (the pet's colour), About.
  - Review (86% × 88%, a diff with line comments).
  - Attach (a 400 × 440 popup).
  - All share one look: a small header (face, 17px title, one dim line, ✕), a big name field in
    a rounded card, settings as one-line rows in a bordered list, and a footer with a quiet note,
    Cancel, and a filled pill button that's disabled until the form is ready.

## How it behaves

- **Status → face:**
  - working: the body bobs, the eyes wander, and a symbol cycles overhead (`…✦♪?✧…!`)
  - blocked: it bounces, with a red "!"
  - done: happy eyes and a sparkle
  - idle: calm
  - no agent: asleep, dimmed, with a "z"
- **The folder mascots are retired** (DeNon, 2026-11-08): no pal or brain shows one any more. Pals
  are their pocket pets; brains (harnesses) show Herdr's own program logos (`brainLogo()`:
  `knownAgents()` entries' `icon`, a one-colour glyph in #C8C8C8 when `tint`, else the picture;
  Herdr's `icons/<key>.svg`, or its neutral `icons/agent.svg`), 13-14px in the dialogs' selects and
  lists. The Look dialog (`crew-look`) is the pet's: a live preview of the pet in seven states
  (resting, working with its paw tapping, asks you, done, PR open, stuck, asleep dimmed), then its
  species (8), colour (16 swatches or a hex), what it wears (none or up to two of 10; a third
  replaces the older one) and its eyes (9), each choice shown as a resting thumbnail of the pet with
  it; Reset to its default, Cancel, Save (stores `pet` {species, acc, eyes} and `look.color`). No
  laptop choice: every state uses the profile laptop. (The folder mascots' `mascot-art.js` is gone.)
- **Pocket pets** (`lib/pets.js`, the engine from the pocket-pets study): every pal shows as a
  little critter in round LED dots, glowing in the pal's own colour (its look's colour, else its
  stock colour), drawn bare (no screen box, cropped to 138x108 of the 172x135 tile) at 96% of a
  **faint container**: `#131316` (one step up from the page), a 7% white hairline, radius
  max(4, w/35), the pet centred 4% high and free to break the edge. It replaces the folder mascot
  everywhere a pal's face shows: the Focus hero (no box at all, the sidebar's full width), the
  sidebar list (bare, no box or line: 75x59 in 68px rows over a soft radial aura that fades to
  nothing (`pet-aura.svg`, white at 9% in the middle, for the old box's depth), a small still pool of the state's colour
  under it instead of the edge loader; two lines, "status first": the name (600) and the time, then the
  state word in its colour (Resting, Working · 4m blue, Needs you amber, Done mint, PR open green,
  Merged purple, Closing red, Stuck amber, Asleep #808082) and " · #channel" in 11px mono; 64px rows; half-opacity while the pal is closed or idle-hidden), the header's pal chip (30x24), rooms, dialogs.
  - Species (kit, bun, cub, fox, mochi, dino, owl, pup) comes from the record's `pet`
    (`{species, acc, eyes}`) or a hash of the pal's name; what it wears from its brain (Claude
    headphones, Codex glasses, Grok hood, Gemini antenna, Hermes scarf, OpenCode cap, other
    beanie); the head pal is a kit with the crown. The laptop is the profile one.
  - Eight states, each a pose plus the container's hairline at 40% of the state colour:
    **rest** (asleep or idle; z's, eyes shut; plain hairline), **working** (at the laptop, the
    lightsaber below), **asks you** (Herdr's blocked; "?", a mint edge that breathes), **done**
    (arms up, mint), **PR open** (holding a PR card, green), **merged** (cheering, purple),
    **closing** (waving, red: the PR closed unmerged in the last day), **stuck** (X eyes and sweat,
    amber: crewd says it's been working 15+ minutes with an unchanged screen). PR states show only
    while the pal is idle; merged and closing last a day.
  - Working moves natively: the paw taps (two frames cross-fade), from 44px wide bits drift up off
    the laptop, and a **lightsaber** laps the container's edge every 1.6 s: a white-blue core
    (`#EAF2FF`, 1.5-2 px, 100° comet tail) inside blue glow rings (`#4C8DFF` inside, `#2A6AFE`
    outside, 140° tail) that breathe (opacity 0.55-1 over 2.4 s).
  - Drawn on demand into `data/crew-pets/<hash>-<state>[-b].svg` (9 files a pet, about 12KB each)
    by the roster's art pass, which publishes shared `crew.pets`; the roster also publishes
    shared `crew.petstate` (stuck from `crew-health.json`, PR state from `gh pr list --head
    <branch>` on the space's machine, at most every 2 minutes per folder and branch).
  - Every pal has one (an old record's `"pet": "none"` gets the default). Until its tiles are on
    disk, an empty #131316 box of the same size holds its place.
- **Demo filter (for screenshots):** `data/crew-demo.json` `{"only": ["Website", …]}` makes that
  window's sidebar show just those pals, and `{"states": {"Website": "pr", …}}` shows those pals'
  pets in that tile state; no file, everyone, live. `preview.png` was made this way in a second
  Herdr window (`HERDR_APP_HOME` on a short path, started without the `HC_*` variables), across four
  Omarchy themes.
- **`pal hire --model haiku|sonnet|opus`** puts `--model` on the hired pal's command line.
- **Models:** Hire and New channel have a **Model** row for Claude Code (Your default · Opus ·
  Sonnet · Haiku; New channel adds "Same as <pal>"). It goes on that command line as `--model`,
  never through `/model`, which would change the default for every session.
- **Hire / Add channel / invite:** a pal or you runs `pal hire|channel|invite`. That drops a
  request in `data/crew-requests/`, which the roster carries out with `space.new` / `tab.new`
  and answers with `<id>.result.json`. Your view stays where it was.
- **Rooms:**
  - Messages are lines in `data/crew-rooms/<room>.jsonl`.
  - Pals post with `pal-room say`, and @mentions deliver. A pal's message lands after a typing
    delay (1.5s + 45ms per character, capped at 9s).
  - After 12 pal messages in a row, room messages stop being delivered until the owner posts.
  - Inviting an asleep pal wakes it in a new `#room` channel.
- **Helper (crewd, optional):**
  - Messages wait for a pal's turn to end.
  - Whoever handed out work is told when it's done.
  - Stuck channels (15 minutes of an unchanged screen) get flagged.
  - Routines run on schedule; a reply of NOTHING_NEW stays quiet.
  - A cheap model reviews channels to save memory notes, distilled nightly.
  - It checks for updates once a day.
- **Approvals:** with the Claude Code hook, these are held for the owner's approval in the
  Inbox: push, publish, release, PR merge or create, GitHub posting, deploys, messaging, and
  `pal land`. An approval lets that exact command through once.
- **Updates:** About → Check for updates → Update. Downloads the latest release of the repo in
  `pal.json`, checks it against `SHA256SUMS`, snapshots the installed files, runs `install.sh`,
  and restores the snapshot if any mod fails `herdr-app check`. Roll back is offered.
  A local `./install.sh` over an existing install takes the same kind of snapshot first
  (`update-from-<version>-local-*.tar.gz`, the last 5 kept), so Roll back always undoes the most
  recent install, not an older release update.

### The layout: Focus

One shape, Focus: DeNon removed the Pro view (pal rail, list column, tab strip, inspector and the
switch) on 2026-11-08. Anything new is drawn in the design-system look: 1px hairlines, radius 3/4/6/8,
rectangular segments and tags.

- **Pal groups and order** (DeNon, 2026-11-08, like Grok Bot's): the head pal on top, then named
  groups ("Personal", "Business", …) under small grey headers (11px #6A6A6C name, #56565A count,
  14px of air above) that work like folders: hovering shows an r4 pill and a chevron on the right,
  a click folds the group away or opens it (remembered in `crew.marks.collapsed`),
  then "Unassigned" (where new pals land); with no groups made, no headers at all. Inside a group:
  pinned pals first (pin order), then your order, else who needs you most. **Drag** a pal (press,
  move 5px): it dims and a 2px blue line shows where it lands (above or below the row under the
  pointer; on a header, first in that group; an empty group shows "Drag a pal here"), release
  drops it, leaving the list cancels. Right-click a pal: Pin, Move up / Move down, and a Group
  section (each group, Unassigned, New group…). Right-click a group header: Rename…, Move up /
  down, New group…, Delete group (its pals go to Unassigned). The gear menu has New group… too.
  Saved in shared `crew.marks` (`groups`, `pals[bot].group/order/pin`, `arranged`), so it
  survives restarts; Herdr's own space order isn't touched. The channel list can't drag: it's a
  virtual list, whose rows can't take their own mouse handlers in Herdr.
- **Dialogs** ("A · Compact sheet", DeNon 2026-11-08): New channel, Hire a pal, New room, New group
  and Tasks share one kit (`sheet*` in crew.js): a header row (the pal's bare pet over its aura, a
  15/600 title, a 12px #808082 line, a quiet ×), 32px r6 fields on #0A0A0B with a #2C2C2F hairline
  ("#" prefix for names), quiet multi-line boxes, one row of compact 26px selects (label #6A6A6C,
  value #C8C8C8, chevron) whose list opens under the row, and a footer with a hairline over it: a key
  hint, Cancel and the primary action as pebbles (the primary a step brighter, steel blue #26364A;
  dimmed until it's ready). New channel puts Category behind its own select; Hire's selects are
  Brain, Model, Role and Computer, then the folder (with Browse) and the first channel.
- **The Focus grid:** content (text, icons, pets) starts 16px in; row backgrounds, the channel
  rows and the quick-action buttons sit 8px in from both sides. Text ladder: names #EDEDED,
  previews #C8C8C8, `[channel]` 11px mono #808082, times #6A6A6C; a closed pal's text never goes
  below #808082 (its pet dims instead). The list ends with 24px of padding.
- **Focus:** the sidebar at 304px (the hero pal and the pal list, as above), no tab strip.
  - **The hero** (hero v2 "2 · Floor", DeNon 2026-11-08): no box. The shown pal's pet and its
    laptop at 90% of the sidebar's width, centred (273x214 at 304; the critter about 165px), drawn on the
    sidebar itself over the same soft aura (its own "open" tiles, `-o.svg`), standing on a floor: a pool of the state's colour under the pet (no line: DeNon took it out) (`pet-floor-<state>.svg`:
    working blue, done mint, asks you amber and breathing, PR green, merged purple, closing red,
    stuck amber; none at rest or asleep). Nothing moves along the floor (a saber there was tried
    and removed: DeNon found it annoying). The name (16/600) sits in a 30px band at the top, 14px in, the sprite
    starting 8px into it (bun ears, antennas and crowns reach the sprite's top edge, so the name
    can't sit on the sprite), with the full width so it never cuts off: a 7px state dot before it (blue working, amber
    asks you / stuck, green done / PR); no state word (DeNon took it out; the tooltip names it).
    Under the floor, the pal's channels at full width: a header ("Channels", the count, and a
    magnifier: a search box that filters as you type; Esc or × clears and closes it), then 28px
    rows (`#`, the name, a blue/amber dot, a green check or when it last changed; the shown one
    #232324), up to four (the box hugs fewer); past four the box is four rows plus the top 12px of the
    fifth, cut at its edge, with an always-drawn scrollbar in a gutter: while the list overflows the
    rows end 18px in (11px otherwise) and Herdr's thumb sits in the gap, never over a time, pin or
    dot (Herdr draws the thumb 8-16px in from the scroll area's edge whatever box it's given, and
    picks its colours from the theme) and "+N more" (#808082, rows below the
    box; follows the scroll, gone at the end; a click scrolls to the end) after the count. The
    shown channel is scrolled into view when it changes. Order: pinned channels first (in pin order,
    with a small pin mark), then, once you've arranged that pal's channels, Herdr's tab order, else
    the smart order (needs you, finished, working, idle agents, plain shells). Right-click a channel:
    Pin / Unpin and Move up / Move down (within its group). Pinning and moving move Herdr's own tabs
    (`tab.move`), so the order survives restarts and the pal chip's channel dropdown lists the same.
    No dragging: Herdr's lists have no row drag, and a virtual list's rows can't take their own
    clicks, so there is no hover pin either. Then three quick actions as subtle "pebbles" (one flat #1B1B1E face, a 6% white
    hairline inside the top, a 1px darker line inside the bottom, a thin dark outline, GPUI's faintest
    shadow, 28px, r7, 9px side padding; hover a shade lighter, press a shade darker, nothing moves;
    `pebble()` in crew.js): + Channel (new channel
    dialog), Tasks with this pal's open count, and an icon-only moon (put to sleep; Herdr
    asks first). Tasks (Tell merged into it: DeNon, "a Tell is really a task") opens `crew-tasks`
    (520px): a composer on top (a 13.5px textarea, 3 rows growing to 10; Enter adds, Shift+Enter is
    a new line; images by pasting, dropping files on the dialog, or the paperclip's recent-files list,
    copied into `data/crew-attachments`, images only, 10MB and 6 per task, shown as 64x48 thumbnails
    with ×). Adding makes a real task on the shared board, `pal task add "<first line>" --for <pal>
    --body "<the rest, and the images' paths>"`, marked from the owner; the pal is told when its turn
    ends and its "New task" message carries the body, paths included. Then that pal's open tasks
    (working first, then blocked, then open; a tick finishes one, a click on its title shows its
    details, notes and who asked), and "All tasks on the board →". Quick questions go in the
    terminal. No state pill, no species/brain line; the task text is in its pal row. The header has the pal's name chip centred (a click opens the channel
  dropdown, crew-pick, with New channel) and the split buttons on the right; the git branch is in
  the agent's own status line instead (crew-statusline adds a dim "(worktree)" in a linked worktree,
  or prints the branch when you have no status line of your own); no
  channel picker on the left (DeNon took it out: channels switch from the hero's list, which shows
  "no agent"). Under it, the channel's terminal, and nothing on the right (DeNon, 2026-11-08, after
  Grok Bot).
- **Status bar** (24px, under everything): a quiet gear at its left end, the working count, the
  shown channel's 5-hour and weekly usage, and the installed version. The gear (and the folded
  rail's) opens the app menu (`crew-appmenu`, a 252x392 popup in the terminal menu's look, with
  shortcuts from keys.json): Hire a pal…, New room…, Inbox, Rooms, Routines, Theme and look
  (`app.settings {section: "look"}`), Switch Herdr layout (`layout.switch`), Machines, Herdr
  settings, Command palette, Project Pals: settings and updates (About, update, Roll back).
- **The terminal sits in the app** (DeNon, 2026-11-08): no card around it. The pals layout sets
  its own `colors.background` to the column's #0B0B0C (this layout only, not the person's theme),
  so a terminal's default background is the column itself; programs' own coloured cells keep
  theirs. No frame around a lone pane (`lone: false`; split panes keep their hairline and focus
  border); the block is padded 8/16 and terminals 8/8, so text lines up with the header's.
- **Terminal-first** (DeNon, 2026-11-08): a channel is its terminal; you type in it
  directly, and you answer its permission prompts and questions there too (no prompt card:
  DeNon removed it on 2026-11-08, since it repeated the terminal's question and covered it). The
  composer shows only under a room.
- **Splits:** Herdr's own (Ctrl+Shift+O right, Ctrl+Shift+E down, Ctrl+Shift+X close, Ctrl+Shift+Z
  zoom, Alt+H/J/K/L move, Alt+Shift swap), plus split right / down buttons in the header, and the right-click on a terminal (`crew-termmenu`, the layout's
  `terminal_menu`: split, zoom, copy, paste, right-click routing, close; "Close pane (ends
  Claude Code)" in red on the agent's pane). A new pane is a shell in the channel's folder and
  belongs to that channel; the channel's agent stays its lead pane (state, "no agent" and `pal tell`
  all read the agent's pane).
- **Remembered** in `data/crew-settings.json`: `focus.sidebarPx` (the dragged sidebar width).
  Pro's old keys (`layoutMode`, `pro`) are dropped the next time the settings are written.

## Built from

- **Layout:** `layouts/pals.json`, the tree above.
  - Stack `center` has the children `tab-view` and `room-view`. `showRoom` / `showTabs` switch it
    and show or hide `crew-composer`.
- **Mods:**
  - Persistent: `crew-roster` (sidebar, and it serves requests), `crew-header`, `crew-room`,
    `crew-composer` (rooms), `crew-status`. Popups: `crew-appmenu` (the gear), `crew-termmenu`. Removed with Pro: `crew-palrail`, `crew-tabs`,
    `crew-side` (the installer sets installed copies aside, backed up; Roll back restores them).
  - Dialogs: `crew-group` (props `mode` new/rename, `group`, `bot`), `crew-hire`, `crew-duplicate` (props `space`), `crew-room-new`, `crew-routines`,
    `crew-look` (props `space`), `crew-review` (props `space`, `tab`), `crew-about`,
    `crew-attach`, `crew-tasks` (props `space`). The installer retires the old `crew-tell`.
  - Popup: `crew-menu` (props `what` = "tab" | "pal", `space`, `tab`), the right-click menu.
  - Every mod gets `lib/crew.js` (the shared model) and `lib/pets.js` copied in.
- **Herdr functions:**
  - Data: `spaces`, `panes`, `agents`, `layout`, `shared`/`setShared` (`crew`,
    `crew.settings`, `crew.room`, `crew.marks` for pins and tab colors).
  - Programs and files: `exec`, `hc`, `readTextFile`, `watchFolder`, `knownAgents`.
  - Overlays and notices: `openOverlay`/`closeOverlay`, `notify`, `nextCommand`.
  - Commands: `space.new`, `tab.new`, `tab.select`, `tab.rename`, `tab.close`, `space.select`,
    `layout.select`, `layout.toggle`, `layout.resize`, `pane.focus`, `app.settings`,
    `app.palette`, `mod.open`.
  - Keyable commands: `crew-roster.hire|channel|routines|look|mode`.
- **Programs:**
  - The commands `pal` and `pal-room` (Python 3; `crew` and `crew-room` are aliases), plus
    `crewd`, `crew-hook` and `crew-statusline`.
  - `git` for worktrees, review and land; `claude -p` for memory reviews; `hc`; `herdr-app`;
    `systemctl --user`; `fc-list`; `xdg-open`; `wl-paste` for image paste.
- **Data:** under `~/.config/herdr-app/data/crew-*`. The owner name and bypass live in
  `crew-settings.json`.

## Watch out

- **What a session starts with** (`memory_text`, the SessionStart hook; DeNon 2026-11-08): the
  pinned note, the pal's MEMORY.md, USER.md, always whole; then its newest notes, newest first and
  whole lines only, up to 16,000 characters (`MEMORY_CAP`), and "(N older notes not loaded; run pal
  memory to see them)". It used to keep the LAST 6,000 characters, so USER.md, the pinned note and
  MEMORY.md were cut first. `pal memory <Pal>` prints everything, in the same order.

- **The hero's floor pool** is an `image()`, not an `svg()`, so it stays behind the pet.
- **The pets' lightsaber is faked:** Herdr can't blur, stroke a path, tint a shadow or clip to a
  rounded shape. A comet-shaped sweep (`pet-saber.svg`, 40 slices) spins about the container's
  centre and shows only through 1.5-10 px strips along its edges, one set of strips per glow
  ring (3 rings under 120 px wide, 5 above). Herdr draws svgs over images, so the strips keep the
  sweep off the pet. Rounded saber corners need the backdrop's colour (`petEl` `{back}`): covers in
  that colour and the box's cut the corners to an arc. Rows change colour on hover, so they don't
  pass one, and their 4 px corners stay square.
- **It runs programs and reads outside its folder:** `hc send/read` into terminals, `git`,
  Claude Code session files (`~/.claude/projects/…/*.jsonl`), and `claude -p`, which sends
  channel screens to the API.
- **The helpers change your setup:**
  - They add a systemd user service, `herdr-crew.service`.
  - They edit `~/.claude/settings.json`: SessionStart and PreToolUse hooks, and the status line
    command is wrapped by `crew-statusline`, which keeps the original in
    `data/crew-statusline-original`. The file is backed up first.
  - `./install.sh --no-helpers` skips all of that.
- **Linux only** for the helpers (systemd).
- **Virtual-list rows can't hold `on_click`:** they render blank. Use the list's
  `on_item_click(key)`, or controls outside the list.
- **No `InputState.new` during render:** create inputs in `init` or from a timer.
- **TextView ignores font weights here:** with the layout's Adwaita Sans (a variable font) and with
  Geist, `**bold**` and headings draw at regular weight. Headings still draw larger.
- **Herdr doesn't paint a hidden window,** so `herdr-app shot` fails off-screen.
- **Claude Code's folder-trust question stalls new pals:** a pal or worktree channel in a folder
  Claude Code hasn't seen waits on "Quick safety check … one you trust?". Detect it (whitespace-
  insensitive: "Yes, I trust this folder" plus "Accessing workspace" or "Quick safety check") and
  point the owner at the tab: a toast from the hire handler, a notice from `pal hire` / `pal channel`,
  and crewd's `trust` entry in the feed, the overview's "Waiting on" and a note to the head pal.
  Never answer it: trusting a folder is the owner's call, even with permissions bypassed.
- **Never type over someone's draft:** messages are pasted into a pal's terminal and Enter is
  pressed. If its Claude Code input box holds unsent text (the owner typing), that text would go out
  glued to the message, so nothing is typed in while it's there: crewd keeps the messages queued,
  lists the hold under "Waiting on", and delivers once the box is empty. Callbacks never quote
  that unsent text, since it isn't anyone's answer.
- **The gate sees only the line a pal types:** a script that pushes or publishes inside itself
  (a repo's `./release`) goes around the per-command rules, so release scripts have their own rule
  (`release-script`). An approval is good for one run of that exact command, and lapses
  (`expired`) if it isn't used within 30 minutes. Inbox cards show the request's ID, keep Decline
  and Approve at opposite ends, and every decision attempt is recorded with where it came from.
- **The approval gate isn't a security boundary:** a pal with permissions bypassed can still edit
  the files.

## Done when

- `./install.sh` ends with "all Project Pals mods pass herdr-app check", and switching to the
  `pals` layout shows the sidebar with the head pal on top (once one is hired:
  `pal hire --god`, which takes the name from settings).
- `pal team` lists every space as a pal.
- `pal hire Test --harness claude` makes a space named Test, and your view doesn't move.
- `pal-room new demo --with "A#x" "B#y"` opens a room in Rooms, and `pal-room say demo "@A hi"`
  shows a typing bubble, then the message.
- A Claude Code channel blocked on a question shows "asks you" on its pet and row, and nothing
  floats over its terminal.
- Every pal's face is a pocket pet in its own colour on a faint container: the working one has a
  lightsaber lapping the container's edge and a tapping paw, and `data/crew-demo.json`
  `{"states": {"<pal>": "merged"}}` gives that pal a purple edge and the cheering pose.
- No radius above 8 anywhere, and no oval pills: only status dots of 9px or less are round.
- `pal update check` answers from the repo in `pal.json`, and `pal version` prints the
  installed version.
- The pals layout is Focus only: no pal rail, tab strip, inspector or mode switch, and nothing
  answers Ctrl+Shift+M. The installer removes an old `"ctrl-shift-m": "crew-roster.mode"` from
  keys.json's `global` map, and only that exact binding (keys.json is backed up first).
