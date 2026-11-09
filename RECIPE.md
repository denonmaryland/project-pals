# Project Pals

Your coding agents as a crew of pals. Any harness works: Claude Code, Codex, Grok CLI, Gemini CLI,
opencode, Hermes, Copilot, Cursor, pi.

Every Herdr space is a pal (a project with a brain), and each of its tabs is a channel, a clone
working on one thing. Pals are pocket pets whose pose shows what they're doing. A channel is its
agent's terminal; you can put pals together in group-chat rooms, and give them tasks and scheduled
routines. A head pal (named Orchestrator by default; the gear's Project Pals settings or `pal
settings head "Name"` renames it) oversees everyone.

The layout updates itself from its GitHub releases.

![Project Pals](preview.png)

## What you see

The window is one shell on the layout's own #0B0B0C, with no title bar, in Inter. Left to right:
the sidebar, the work column (the header, then the shown channel's terminal or a room), and the
profile panel when it's open. The status bar runs under everything.

- **Sidebar** (`crew-roster`; 304px wide, drag between 56 and 440; under 160px it folds to a rail):
  - **The hero, on top:** the shown pal's pet, big, with its name, its channels and four quick
    actions (The layout: Focus, below).
  - **Pals:** a "Pals" header with a search button (the command palette), then the head pal, your
    groups if you've made any, and Unassigned. Each pal is a 64px row: its pet (75x59) and two
    lines, status first (Pocket pets, below). Click a pal to show it, on the channel that most
    needs you. Right-click a pal for Profile, Pin to the top, Rename (memory and routines follow:
    the roster remembers each space's name and runs `pal renamed` when it changes), Customize
    look, New channel, Move up / Move down, its group, and Put to sleep (keeps the model it's on;
    Herdr asks "Close space?"). A pal hired in the last 10 minutes with no brain yet shows
    "starting". Pinned pals sit first in their group, in the order pinned.
  - **Hidden pals** (a 40px row with a count, while there are any): open pals with no agent running,
    and the asleep (closed) ones. A click opens or folds it (remembered). An asleep pal's row reads
    "Asleep · click to wake": a click wakes it with every channel it had, by name (records keep a
    tab id → name map); right-click for Wake, Unpin from the top, Forget this pal.
  - **Inbox** (a 40px row, only while something waits: an amber dot, "Inbox", or "Inbox · waiting
    for your OK" while an approval waits, and the count). It, the status bar's "N need you" and the
    gear's Inbox show the Inbox in the sidebar, under a "back to pals" line:
    - Approval cards ("X wants to push", the command in monospace, Decline / Approve).
    - "X looks stuck" rows.
    - Finished and needs-you channels.
    - A banner if the helper service is off.
  - **Rooms** (only when you have some): a "Rooms" header, then a 32px row per room (`#`, its name,
    its member count); a click shows the room. The gear's Rooms lists them with their members;
    right-click one there for Open / Close room.
  - **The board** (the Tasks dialog's "All tasks on the board →"): an "Add a task, @Pal to assign
    it" field, then bordered lists (Blocked, In progress, Open, Done today); clicking a task
    expands it: details, Open channel, Mark done, Cancel, Reopen.
  - **The folded rail:** a fold button, the count of what needs you (red when a channel asks or an
    approval waits; a click opens the Inbox), the pals' faces (32px, the shown one lit, a red dot
    when one asks, each naming its pal on hover), then + (hire) and the gear.
- **Work column:**
  - **Header** (`crew-header`, 52px): the shown pal's name chip, centred, with a ▾ (a click opens
    the pal menu), and the split buttons on the right. In a room it's a centred pill: the members'
    overlapping faces, then `#room`.
  - **Center stack:**
    - `tab-view`: the channel's terminal, edge to edge (padding 8/16; split panes have a 1px
      hairline, radius 4, gap 8).
    - `room-view`: the room as a group chat. Your bubbles are on the right in the accent
      color; pals' are on the left with a 30px face and name. It's a centered column at most
      860px wide, with "• • •" typing bubbles.
  - **Composer** (rooms only; hidden while a channel is shown): an r8 box, "Message #room" (a draft
    per room), + to attach and send. Files can be dropped in or pasted as images.
- **The profile panel** (right, hidden until you open it; 420px Side, 360-640, or Full over the
  work column): Profile, Vault and AGENTS.md tabs (The profile panel, below).
- **Status bar** (24px, under everything): the gear, the working count, "N need you", usage, the
  update pill and the version (below).
- **Dialogs** (sized to content, the `popover` color; 520px for Hire a pal, New room, Routines and
  Tasks, 500 for New channel, 480 for Project Pals settings and the update, 400 for New group):
  - Hire a pal, New channel, New room, New group, Routines, Look (the pet), Tasks, Project Pals
    settings, the update.
  - Review (86% × 88%, a diff with line comments).
  - Attach (a 400 × 440 popup).
  - New channel, Hire a pal, New room, New group and Tasks share the compact sheet kit (Dialogs,
    below).

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
  stock colour), drawn bare (no screen box, cropped to 138x108 of the 172x135 tile). Two ways:
  - **Open** (`petEl` `{open: true}`: no box, edge or saber; the `-o.svg` tiles): the hero (the
    sidebar's width less 16px each side), the sidebar's pal rows, the profile panel and the
    dashboard. A row's pet is 75x59 over a soft radial aura that fades to nothing (`pet-aura.svg`,
    white at 9% in the middle), with a small still pool of the state's colour under it; then two
    lines, status first: the name (600) and the time, then the state word in its colour (Resting,
    Working · 4m blue, Needs you amber, Done mint, PR open green, Merged purple, Closing red, Stuck
    amber, Asleep #808082) and " · #channel" in 11px mono; 64px rows; half-opacity while the pal
    is closed or idle-hidden.
  - **Boxed** (`mascotEl`, the small faces: the header's pal chip (30x24), the folded rail, rooms,
    dialogs): at 96% of a **faint container**: `#131316` (one step up from the page), a 7% white
    hairline, radius max(4, w/35), the pet centred 4% high and free to break the edge.
  - Species (kit, bun, cub, fox, mochi, dino, owl, pup) comes from the record's `pet`
    (`{species, acc, eyes}`) or a hash of the pal's name; what it wears from its brain (Claude
    headphones, Codex glasses, Grok hood, Gemini antenna, Hermes scarf, OpenCode cap, other
    beanie); the head pal is a kit with the crown. The laptop is the profile one.
  - Eight states, each a pose (on a boxed face, plus the container's hairline at 40% of the state
    colour): **rest** (asleep or idle; z's, eyes shut; plain hairline), **working** (at the laptop,
    the lightsaber below), **asks you** (Herdr's blocked; "?", a mint edge that breathes), **done**
    (arms up, mint), **PR open** (holding a PR card, green), **merged** (cheering, purple),
    **closing** (waving, red: the PR closed unmerged in the last day), **stuck** (X eyes and sweat,
    amber: crewd says it's been working 15+ minutes with an unchanged screen). PR states show only
    while the pal is idle; merged and closing last a day.
  - Working moves natively: the paw taps (two frames cross-fade), from 44px wide bits drift up off
    the laptop, and on a boxed face a **lightsaber** laps the container's edge every 1.6 s: a
    white-blue core (`#EAF2FF`, 1.5-2 px, 100° comet tail) inside blue glow rings (`#4C8DFF` inside,
    `#2A6AFE` outside, 140° tail) that breathe (opacity 0.55-1 over 2.4 s).
  - Drawn on demand into `data/crew-pets/<hash>-<state>[-b][-o].svg` (18 files a pet, about 12KB
    each: the eight states and working's second frame, boxed and open) by the roster's art pass,
    which publishes shared `crew.pets`; the roster also publishes
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
  - It checks for updates every 6 hours at most (`crewupdate.CHECK_EVERY`).
- **Approvals:** with the Claude Code hook, these are held for the owner's approval in the
  Inbox: push, publish, release, PR merge or create, GitHub posting, deploys, messaging, and
  `pal land`. An approval lets that exact command through once.
- **Updates:** the status bar's quiet **Update available · X** pill (a 18px raised rectangle,
  a 6px blue dot, 11px #808082 text; while an update runs, a spinning ring and "Updating to X")
  or the gear's **Check for updates** opens `crew-update`, an A-style sheet: the head pal's pet,
  "Project Pals X is out" over "You have Y · released <date>", the release notes' bullet
  highlights (bold headline, one truncated line of detail, at most 6; the "### Fixed" part is
  left out), Full release notes →, a shield line saying what happens, then **Later** (hides the
  pill for that version for 3 days: shared `crew.update.later`) and **Update now**. Update now runs
  `pal update apply --json` detached (`updateStart`): it downloads the latest release of the repo
  in `data/crew-install.json` (written by install.sh from `pals.json`), checks it against
  `SHA256SUMS`, snapshots the installed files, runs `install.sh`,
  and restores the snapshot if any mod fails `herdr-app check`. It writes its progress to
  `data/crew-update-run.json` (`running` with a `step`, then `done` or `failed`), which the pill
  and the dialog read, because the update reinstalls the dialog itself; a run silent for 15
  minutes counts as failed. After it: "Updated to X" with Roll back. The status bar also asks
  GitHub when the last check is over 6 hours old (at most once an hour), for installs without
  crewd. Snapshots store Herdr's home as `@app/…` (it needn't be inside `$HOME`); Roll back still
  reads older snapshots stored relative to `$HOME`.
  A local `./install.sh` over an existing install takes the same kind of snapshot first
  (`update-from-<version>-local-*.tar.gz`, the last 5 kept), so Roll back always undoes the most
  recent install, not an older release update.

### The layout: Focus

One shape, Focus: DeNon removed the Pro view (pal rail, list column, tab strip, inspector and the
switch) on 2026-11-08. Anything new is drawn in the design-system look: 1px hairlines, radius
3/4/6/8, rectangular segments and tags.

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
  value #C8C8C8, chevron) whose list opens under the row, and a footer with a hairline over it: a
  key hint, Cancel and the primary action as pebbles (the primary a step brighter, steel blue
  #26364A; dimmed until it's ready). New channel puts Category behind its own select; Hire's selects
  are Brain, Model, Role and Computer, then the folder (with Browse) and the first channel.
- **The Focus grid:** content (text, icons, pets) starts 16px in; row backgrounds, the channel
  rows and the quick-action buttons sit 8px in from both sides. Text ladder: names #EDEDED,
  a pal row's state word in its state's colour (Resting #C8C8C8), ` · #channel` 11px mono #808082,
  times #6A6A6C; a closed pal's text never goes
  below #808082 (its pet dims instead). The list ends with 24px of padding.
- **Focus:** the sidebar at 304px (the hero pal and the pal list, as above), no tab strip.
  - **The hero** (hero v2 "2 · Floor", DeNon 2026-11-08): no box. The shown pal's pet and its laptop
    16px in from both sides (271x212 at 304), drawn on the sidebar itself over the same soft aura
    (its own "open" tiles, `-o.svg`), standing on a floor: a pool of the state's colour under the
    pet (no line: DeNon took it out) (`pet-floor-<state>.svg`: working blue, done mint, asks you
    amber and breathing, PR green, merged purple, closing red, stuck amber; none at rest or asleep).
    Nothing moves along the floor (a saber there was tried and removed: DeNon found it annoying).
    The name (16/600) sits in a 36px band at the top, 16px in and 10px down, the sprite starting
    32px down (bun ears, antennas and crowns reach the sprite's top edge, so the name can't sit on
    the sprite), with the full width so it never cuts off: a 7px state dot before it (blue working,
    amber asks you / stuck, green done / PR); no state word (DeNon took it out; the tooltip names
    it). Under the floor, the pal's channels at full width: a header ("Channels", the count, and a
    magnifier: a search box that filters as you type; Esc or × clears and closes it), then 28px rows
    (`#`, the name, a blue/amber dot, a green check or when it last changed; the shown one
    #232324), up to four (the box hugs fewer); past four the box is four rows plus the top 12px of
    the fifth, cut at its edge, with an always-drawn scrollbar in a gutter: while the list overflows
    the rows end 18px in (11px otherwise) and Herdr's thumb sits in the gap, never over a time, pin
    or dot (Herdr draws the thumb 8-16px in from the scroll area's edge whatever box it's given, and
    picks its colours from the theme) and "+N more" (#808082, rows below the box; follows the
    scroll, gone at the end; a click scrolls to the end) after the count. The shown channel is
    scrolled into view when it changes. Order: pinned channels first (in pin order, with a small pin
    mark), then, once you've arranged that pal's channels, Herdr's tab order, else the smart order
    (needs you, finished, working, idle agents, plain shells). Right-click a channel (the
    `crew-menu` popup): Pin / Unpin, Review changes (a worktree channel only: `crew-review`), Move
    up / Move down (within its group), Color, Rename, Close channel. Colors are the theme's own
    (ansi1–6 and accent, stored by name in shared `crew.marks`); every new channel gets the one that
    looks most different (OKLab) from its pal's others, blue first, and clearing it keeps it plain.
    Nothing draws a channel's color since the tab strip went. Pinning and moving move Herdr's own
    tabs (`tab.move`), so the order survives restarts and the `crew-pick` dropdown lists the same.
    No dragging: Herdr's lists have no row drag, and a virtual list's rows can't take their own
    clicks, so there is no hover pin either. Then four quick actions as subtle "pebbles" (one flat
    #1B1B1E face, a 6% white hairline inside the top, a 1px darker line inside the bottom, a thin
    dark outline, GPUI's faintest shadow, 28px, r7, 9px side padding; hover a shade lighter, press a
    shade darker, nothing moves; `pebble()` in crew.js): + Channel (new channel dialog), Tasks with
    this pal's open count, an icon-only Profile (the profile panel, below; Ctrl+Shift+I; the hero's
    name, underlined on hover, opens it too) and an icon-only moon (put to sleep; Herdr asks first).
    Tasks (Tell merged into it: DeNon, "a Tell is really a task") opens `crew-tasks` (520px): a
    composer on top (a 13.5px textarea, 3 rows growing to 10; Enter adds, Shift+Enter is a new line;
    images by pasting, dropping files on the dialog, or the paperclip's recent-files list, copied
    into `data/crew-attachments`, images only, 10MB and 6 per task, shown as 64x48 thumbnails with
    ×). Adding makes a real task on the shared board, `pal task add "<first line>" --for <pal>
    --body "<the rest, and the images' paths>"`, marked from the owner; the pal is told when its
    turn ends and its "New task" message carries the body, paths included. Then that pal's open
    tasks (working first, then blocked, then open; a tick finishes one, a click on its title shows
    its details, notes and who asked), and "All tasks on the board →". Quick questions go in the
    terminal. No state pill, no species/brain line; its pal row shows the state word and channel,
    not the task. The header has the pal's name chip centred with a ▾ (a click opens the pal menu,
    `crew-palmenu`, below) and the split buttons on the right; the git branch is in the agent's own
    status line instead (crew-statusline adds a dim "(worktree)" in a linked worktree, or prints the
    branch when you have no status line of your own); no channel picker on the left (DeNon took it
    out: channels switch from the hero's list, which shows "no agent"). Under it, the channel's
    terminal, and nothing on the right (DeNon, 2026-11-08, after Grok Bot).
- **The profile panel** (DeNon, 2026-11-08; `docs/profiles/proposal.md`): a right-side panel,
  hidden by default. It opens from the hero's name, the Profile quick action, right-click a pal →
  Profile, the pal menu, or **Ctrl+Shift+I** (`crew-roster.profile`); Esc while the panel has the
  keyboard, its × or the same trigger again close it, and the terminal gets its full width back.
  Esc in the terminal stays the program's (it interrupts Claude Code). It always shows the shown
  pal.
  - Two sizes: **Side**, beside the terminal (420 px by default; drag its edge, 360-640,
    remembered as `focus.panelPx`), and **Full** (⤢ in its header: it hides the `work` column, so
    the panel fills everything right of the sidebar). Profile opens Full, the project tabs Side;
    each tab remembers its size. It starts hidden on every launch.
  - **Profile in Full is the dashboard** (`profile-dash`): the header with the tabs inline, ⤡ Side
    and ×; a 72 px strip (pet, name, role, state │ brain, folder, hired, tasks done │ the mission
    and its done-when count, a click opens Mission); then the pal's **channels** (340 px: live state
    dot, or hollow for no agent; `#name` and how long; what it's on; branch or `worktree · <branch>`
    with Review) and compact **memory** (pinned, the latest notes, the primer's cut, "All ·
    Remember…"); the **task board** ("toward: <focus>", Now · Next · Blocked · Done · 7 days: the
    pal's tasks, plus an activity card for each working channel without a claimed task, its asking
    and stuck channels in Blocked; 64 px r6 #161617 cards with a channel chip; a task expands to
    Mark done / Reopen); and the **mini terminal**: a 33 px bar (`TERMINAL`, a `#channel ▾` picker,
    live, program and state, Open channel ↗) over `dash-term`, an `{agent: "focused"}` block showing
    the shown channel's agent: the real session, typed into directly. A channel row, a chip or the
    picker points it at another channel (it shows that channel: `tab.select`, then `agent.focus`). A
    channel with no agent hides the terminal ("#name has no agent running"), with Wake when the pal
    itself is asleep.
  - Header (52 px, #0E0E0F, a hairline under it): the pal's 30 px pet, its name (14/600), ⤢ / ⤡
    and ×. Tabs (36 px, r4, the shown one #232324): **Profile · Vault** ‖ **AGENTS.md** (a 1 px
    divider between the pal's tabs and its project's; AGENTS.md carries the lint's badge:
    red errors, amber warnings, a blue + when a fix is offered). Esc leaves an edit or a review
    first, then closes the panel.
  - **Profile:** the pet (96 px on the soft aura), name, role (click to change: the record's `role`)
    and state; Facts (brain and `--model`, folder, machine, branch, pet, hired by); four stats
    (channels, tasks done, open tasks, last active: 2×2, or one row in Full); every channel (its
    state dot, or a hollow one with no agent; what it's on, else its brief; `worktree · <branch>`
    and Review on worktree channels; click shows it); **Memory** (the pinned note, editable and
    saved on blur; what a new session starts with and what the 16,000-character primer cap
    (`MEMORY_CAP`) cuts; MEMORY.md; the last two days of notes; how many facts about the owner it
    shares; Remember…, saved as `pal remember --bot`; Open folder); its routines; and Tasks (the
    `crew-tasks` dialog), + Channel, Customize look, Put to sleep, as pebbles. In Full, two columns.
  - **Vault** (DeNon 2026-11-08: it replaced the Notebook, Mission and Brain tabs, which are now its
    notes; their old keys still open them, e.g. `openPanel("mission")`). Opens Full. Full: the file
    tree (232 px, #0B0B0C: Home with a mint live dot, Mission, Journal with its day count (the days
    with entries in the last 14), Brain › Decisions / Change log / Map (left out when AGENTS.md has
    a layout section) / All brain files, Notes (up to 12), then On disk with the folder, "Plain
    markdown: it opens in Obsidian." and Open folder) | the note (max 820 px) | on Home, a 260 px
    rail (This week 2×2, Latest decisions). The tree's counts and brain rows fill in once their data
    has loaded: the brain and the journal both load on every Vault note (refreshed every 8 s and 5 s
    while the Vault shows). A brain file that arrives after you moved on (another pal, note, file or
    the list) is dropped. Side: a Home · Mission · Journal · Brain strip (34 px) over the note.
    `crew-profile.<name>` (keys.json or `herdr-app do`, while the panel shows) opens a tab or note:
    profile, vault, agents, home, mission, notebook, brain. `vault` (and the header's Vault tab)
    reopens the last note shown; the pal menu's Vault row always opens Home.
  - **Vault › Home** (`vault.js`, numbers from `vaultdata.js`): "<Pal> / Home.md · ● live" (Full
    adds "writes itself from the vault and the board"); the name (26/700, Full only) and mission
    statement (15 px); Brain / Project / Channels ("8 · 3 working" in blue) / Owner; the Focus now
    callout (blue tint: focus 15 px, Goals x of y, Done when x of y, Mission →; with no focus it
    says how the pal sets one, `pal mission focus`, or with no mission how it proposes one); Right
    now (channels working or needing the owner, needing first, amber-tinted; each with its claimed
    task, else its agent's own title (never a shell's user@host), else its brief; click shows it; at
    most 5 in Side, 6 in Full as two rows of three); Tasks as NOW (claimed) / NEXT (open) / BLOCKED
    / DONE TODAY, four columns in Full (4 rows each), rows in Side (3 each), then "+N more", Board →
    opens `crew-tasks`; Today's journal (newest 3: time · channel · task · how long, did, the first
    hiccup in amber, the first lesson in mint; Journal →); This week (entries and time logged,
    hiccups and minutes lost, lessons, needs, over the last 7 calendar days; in Full it's in the
    rail); Latest changes (3, newest first, with the channel; Brain →). In Side, Latest decisions
    (2) closes the note.
  - **Vault › Journal** (was the Notebook tab): the pal's journal, newest day first, today (the
    local date, as the day files are named) live ("live" in mint), All · Hiccups · Lessons, and the
    week's count ("4 hiccups · ~50m lost": from `pal notebook ls`, over the last 7 day files, so
    with gaps it can differ from Home's This week). Each entry: time · #channel · task · how long;
    did; hiccups (an amber tag, with what they cost); needed (tool / skill / rule / context /
    access); lesson. × then "Click again to delete" removes an entry (the day is copied to
    `data/crew-backups/notebook/` first). The head pal's has a Notebook · Dreams switch.
  - **Vault › Mission:** the mission card (statement 16/500; Goals and Done when as checklists you
    can tick; Focus), Edit (the code editor, saved with a hash check), the last 3 change-log lines
    and the last 2 decisions, "All in Brain →". No mission: "Write the mission" (a template). A
    pal's mission proposal shows here with Decline / View.
  - **Vault › Brain:** the files (Decisions, Change log, Map, or "→ AGENTS.md" when AGENTS.md has a
    layout section, notes, and an adopted `_Brain/PROJECT_BRAIN.md`), each opening in the panel with
    ← Files and Edit (a `_Brain/` file in the project saves through Review, a diff, like AGENTS.md);
    "Brain lives in: Pal data | This project" (moves it, copying files, deleting nothing); who
    writes it.
  - **AGENTS.md:** what Claude Code loads here (global CLAUDE.md + the project's, with imports,
    in lines), the files (View in a read-only editor, Edit), the lint with its fixes (Create
    pointer, Use an import, Make CLAUDE.md the pointer), "Deep check (sends these files to Claude)",
    pals' proposals, and backups with Restore…. Every write: Edit or a fix → **Review** (a diff, a
    note for the change log) → **Write <file>** (the owner's click) → `pal agents apply` (backup in
    `data/crew-backups/agents-files/<pal>/`, refused if the file changed since the diff, a line in
    the brain's change log). Not committed. A pal on another machine: view and lint only.
- **Missions and brains** (`bin/crewbrain.py`): `data/crew-memory/<pal>/brain/` (or the project's
  `.pals/` when the record says `brainIn: project`): `mission.md` (statement, `## Goals`, `##
  Focus`, `## Done when`), `decisions.md`, `changelog.md` (newest first, 200 lines, older ones in
  `changelog-YYYY.md`), `map.md`, `notes/`. Every SessionStart gets a mission block (statement,
  focus, open done-when items, where the brain is, the last 3 changes; at most 1,200 characters)
  before the memory. The mission's statement, goals and done-when are the owner's: a pal runs `pal
  mission propose`; it keeps `pal mission focus`, ticks goals, and logs with `pal brain log` /
  `decide` / `note`. `pal task done` adds a change-log line to the task's pal.
- **Notebooks** (`bin/crewnotebook.py`): `data/crew-memory/<pal>/notebook/YYYY-MM-DD.md`, one entry
  per piece of work (`### 14:32 · #ch · T16 · 40m`, then `- did:`, `- hiccup: … (cost: ~10m)`,
  `- needed: skill: …`, `- lesson:`; at most 8 lines; the same channel within 10 minutes merges).
  The pal writes it with `pal notebook` (`hiccup` for a quick one); every SessionStart says when
  (only after real work) and carries the last 7 days' lessons (at most 400 characters). `pal task
  done` / `block` print a reminder, and crewd queues one line when a channel that was stuck 15+
  minutes moves again (once an hour per channel). Guards: key- and token-shaped text is masked
  (‹masked›); more than 3 lines, or log-looking lines, are refused; paths into someone's home
  other than config (~/.x), ~/Projects and the pal's project are refused. Days older than 90 roll
  into `YYYY-MM.md` (lessons only).
- **The Dream loop** (`bin/crewdream.py`; proposals only): nightly at 03:30 (crewd, after the memory
  distill, one model run at a time) and on demand (`pal dream`, or Dream now in the head pal's Vault
  › Journal → Dreams). (1) Every notebook's hiccup / needed / lesson lines since the last dream, no
  model; under 3 new hiccups crew-wide it skips. (2) One Haiku call groups them into patterns
  (`P-n`), reusing the ledger's open ones; if the call fails, word overlap (2+ shared words). (3)
  Patterns seen in 2+ pals, 3+ times or costing 30+ minutes (at most 3) go to the head pal as a
  `[dream]` digest; it drafts fixes with `pal dream propose` (skill, rule = lines added to a pal's
  AGENTS.md as an agent-file proposal, tool / process = a task, context = a brain note). Each is an
  Inbox card (the pattern, two quotes, the text; Decline · Approve) or, for a rule, the usual
  agent-file review. Approve writes through that kind's writer. `data/crew-dream/patterns.json` +
  `ledger.jsonl`: accepted → watching 14 days → resolved, or recurred when the hiccup comes back;
  declined rests 30 days unless it doubles; a proposal that expires reopens its pattern. It never
  writes DJM OS's Learning Ledger: `pal dream intake` drafts a sanitized note in
  `data/crew-dream/intake/` for the owner to file. The Dreams view: this month's proposed / accepted
  / resolved / recurred, the week's minutes lost, every pattern with its state, the intake drafts.
- **Proposals** (`bin/crewproposals.py`, `data/crew-proposals/<id>.json` + `.md`): a pal's
  `pal mission propose` or `pal agents propose <file>` becomes an Inbox card (View opens the panel
  on it; Decline tells the pal), counted in "N need you", expiring after 7 days. Nothing is
  written until the owner accepts (the mission) or writes it after the diff (agent files).
- **The pal menu** (`crew-palmenu`, the header chip's 300 px popup, crew-pick's look): the pal's
  name and "harness · folder", then The pal (Profile with its shortcut, Vault, Memory, Tasks with
  the open count: the `crew-tasks` dialog), The project (AGENTS.md, Review changes on a worktree
  channel, Open folder), then Put to sleep. No channels: the hero lists them. ↑/↓, Enter, Esc. The
  row the panel is already on is checked, and choosing it closes the panel.
- **Status bar** (24px, under everything): a quiet gear at its left end, the working count, **"N
  need you"** (channels asking, approvals waiting, stuck channels; amber, red while an approval
  waits; a click opens the Inbox; hidden at zero; the roster publishes it as shared `crew.needs`),
  the shown channel's 5-hour and weekly usage, the update pill (see Updates) and the installed
  version. The gear (and the folded rail's) opens the app menu (`crew-appmenu`, a 252x410 popup, 13
  rows in the terminal menu's look, with shortcuts from keys.json): Hire a pal…, New room…, New
  group…, Inbox, Rooms, Routines, Theme and look (`app.settings {section: "look"}`), Switch Herdr
  layout (`layout.switch`), Machines, Herdr settings, Command palette, Check for updates
  (`crew-update` with props `check: true`), Project Pals settings (About: owner, head pal, update,
  Roll back).
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
  zoom, Alt+H/J/K/L move, Alt+Shift swap), plus split right / down buttons in the header, and the
  right-click on a terminal (`crew-termmenu`, the layout's
  `terminal_menu`: split, zoom, copy, paste, right-click routing, close; "Close pane (ends
  Claude Code)" in red on the agent's pane). A new pane is a shell in the channel's folder and
  belongs to that channel; the channel's agent stays its lead pane (state, "no agent" and `pal tell`
  all read the agent's pane).
- **Remembered** in `data/crew-settings.json`: `focus.sidebarPx` (the dragged sidebar width) and
  `focus.panelPx` (the profile panel's Side width).
  Pro's old keys (`layoutMode`, `pro`) are dropped the next time the settings are written.

## Built from

- **Layout:** `layouts/pals.json`, the tree above.
  - Stack `center` has the children `tab-view` and `room-view`. `showRoom` / `showTabs` switch it
    and show or hide `crew-composer`.
  - The `profile` column (after `work` in `body`, hidden, `min` 360) holds `profile-main`
    (`crew-profile`, props `part: "main"`) and the hidden `profile-dash` column: `dash-head`
    (125 px), then a row of `dash-left` (340 px) and a column of `dash-board`, `dash-tbar` (33 px)
    and `dash-term` (300 px, `{agent: "focused"}`), each a `crew-profile` copy with its `part`.
    `layPanel` shows `profile-dash` instead of `profile-main` only in Full on Profile. `openPanel` /
    `closePanel` / `togglePanel` / `setPanelSize` in `crew.js` use
    `layout.show` / `layout.hide` / `layout.resize` (`px` for Side, `weight: 1` with `work`
    hidden for Full); shared `crew.panel` holds `{tab, note, sizes, section, at}`, plus `proposal`
    while one is open.
- **Mods:**
  - Persistent: `crew-roster` (sidebar, and it serves requests), `crew-header`, `crew-room`,
    `crew-composer` (rooms), `crew-status`, `crew-profile` (the profile panel; `focusable`). Popups:
    `crew-appmenu` (the gear), `crew-termmenu`, `crew-palmenu` (props `space`), `crew-pick` (a pal's
    channels dropdown), `crew-attach` (the paperclip's recent files). Removed: `crew-rail`,
    `crew-palrail`, `crew-tabs`, `crew-side`, `crew-chat`, `crew-prompt` and `crew-tell` (the
    installer sets installed copies aside, backed up; Roll back restores them).
  - Dialogs: `crew-group` (props `mode` new/rename, `group`, `bot`), `crew-hire`, `crew-duplicate`
    (props `space`), `crew-room-new`, `crew-routines`, `crew-look` (props `space`), `crew-review`
    (props `space`, `tab`), `crew-about`, `crew-update` (props `check`), `crew-tasks` (props
    `space`).
  - Popup: `crew-menu` (props `what` = "tab" | "pal" | "group" | "room" | "sleeper", `space`,
    `tab`), the right-click menu.
  - Every mod gets `lib/crew.js` (the shared model) and `lib/pets.js` copied in.
- **Herdr functions:**
  - Data: `spaces`, `panes`, `agents`, `layout`, `shared`/`setShared` (`crew`,
    `crew.settings`, `crew.room`, `crew.marks` for pins and tab colors).
  - Programs and files: `exec`, `hc`, `readTextFile`, `watchFolder`, `knownAgents`.
  - Overlays and notices: `openOverlay`/`closeOverlay`, `notify`, `nextCommand`.
  - Commands: `space.new`, `space.select`, `space.rename`, `space.close`, `tab.new`, `tab.select`,
    `tab.rename`, `tab.move`, `tab.close`, `pane.focus`, `pane.split`, `agent.focus`,
    `layout.select`,
    `layout.switch`, `layout.show`, `layout.hide`, `layout.resize`, `app.settings`, `app.palette`,
    `mod.open`.
  - Keyable commands: `crew-roster.hire|channel|routines|look|profile`. The installer binds
    `ctrl-shift-i` to `crew-roster.profile` in keys.json's `global` map when no section uses that
    key yet (keys.json backed up first; no keys.json, no change).
- **Programs:**
  - The commands `pal` and `pal-room` (Python 3; `crew` and `crew-room` are aliases), plus
    `crewd`, `crew-hook` and `crew-statusline`.
  - `git` for worktrees, review and land; `claude -p` for memory reviews; `hc`; `herdr-app`;
    `systemctl --user`; `fc-list`; `xdg-open`; `wl-paste` for image paste.
- **Data:** under `~/.config/herdr-app/data/crew-*`. The owner name and bypass live in
  `crew-settings.json`.

## Watch out

- **Owner decisions need the owner's click** (Codex review H1): approve / deny, accepting or
  declining a proposal, `pal agents apply`, `pal mission set`, `pal brain where` / `write`. The mod
  writes a one-time token for exactly that command line into `data/crew-clicks/` (`ownerCli` in
  crew.js) and the pal command consumes it within 2 minutes. There's no terminal fallback (a pal can
  drive a pseudo-terminal and type "yes"): decisions come only from the app. No terminal ID, or an
  unknown one, is never the owner. A pal writing into
  `crew-clicks` is held (`owner-click`). Same-user processes can still forge one on purpose: this
  guards against accidents and peer influence, not a hostile process.
- **An AGENTS.md / CLAUDE.md edit approval is for one exact edit** (H2): the request is bound to the
  path, a hash of the edit and a hash of the file it applies to, and the Inbox card shows the
  resulting diff. A different payload, or the file having changed, is a new request.
- **Shell writes to AGENTS.md / CLAUDE.md are found by a parse** (H3, `write_targets` in
  crewguard.py): redirects in both heredoc orders and to quoted paths with spaces, `tee`,
  `sed`/`perl -i`, `cp`/`mv`/`install`/`ln`/`rsync` destinations, `dd of=`, inside `sh -c` too.
  Policy defaults version 8. Anything cleverer (a script, python) isn't caught: the gate isn't a
  boundary.
- **The profile panel binds every edit and review to its pal** (H4, `bind.js`): space, name,
  folder and a generation that bumps when the shown pal changes. A late diff for another pal is
  dropped, Write and Save refuse a changed target, and `pal agents apply --folder --staged-sha`
  checks both again. The role and pinned note save to the record they were opened for.
- **Attachments** (M4, M5, `bin/crewattach.py`): opened without following symlinks, a regular file,
  read at most 10 MB + 1 byte from that handle, the bytes must be an image; a fresh unique name
  created exclusively, so nothing is overwritten and a failure never removes an existing file.
- **Dream Approve shows the whole proposal first** (H5): the Inbox card loads the full text on "Show
  the whole proposal"; Approve stays off until then and passes `--text-sha`, the digest of the text
  shown, which `pal proposal accept` checks (a dream or mission proposal without it, or with
  another text, is refused).
- **Private keys never enter a notebook** (H6): a PEM / OpenSSH / PGP private-key block, whole or
  flattened, is refused by `pal notebook` and by `pal dream intake`.
- **Notebook paths are checked resolved** (M1): `~`, `..` and symlinks resolved, then containment
  by whole path components: the pal's project, ~/Projects, and a short list of config trees
  (`SAFE_CONFIG`). Everything else in a home folder is refused.
- **Notebook writes hold a per-pal lock and their own temp file** (M2), and every entry has an id
  (`· e1a2b3` at the end of its heading); deleting removes exactly that entry (M3). An older entry
  without an id is named "HH:MM #channel" and must match only one.
- **The dream's housekeeping runs every night** (M7): expired proposals reopen their patterns and
  quiet watched fixes resolve even when the night is skipped for having too few new hiccups.
- **Roll back restores Project Pals' config entries** (M6): each snapshot records `keys.json`'s
  ctrl-shift-i / ctrl-shift-m and Project Pals' hook entries and status-line wrapper in
  `~/.claude/settings.json` (absence included); Roll back puts back only those still Project Pals'
  own, after a backup, and leaves later edits.

- **What a session starts with** (`memory_text`, the SessionStart hook; DeNon 2026-11-08): the
  pinned note, the pal's MEMORY.md, USER.md, always whole; then its newest notes, newest first and
  whole lines only, up to 16,000 characters (`MEMORY_CAP`), and "(N older notes not loaded; run pal
  memory to see them)". It used to keep the LAST 6,000 characters, so USER.md, the pinned note and
  MEMORY.md were cut first. `pal memory <Pal>` prints everything, in the same order.
- **A project's AGENTS.md / CLAUDE.md change only with the owner's click.** `pal agents apply`
  refuses from a pal's terminal; the approval gate holds a pal's Edit / Write of a file named
  AGENTS.md or CLAUDE.md (`agents-file`, the hook turns it into "edit <path>"; the PreToolUse
  matcher is `Bash|Edit|Write|MultiEdit|NotebookEdit`, and install-hooks.py updates an older `Bash`
  one) and shell writes to one (`agents-file-shell`, found by the `write_targets` parse above).
  Policy defaults version 8. Not a security boundary: a pal can still find a way.
- **The lint's stale-path check** skips git refs, `VAR=…`, placeholders (X.Y.Z, `<x>`, `*`, `…`,
  an ALL-CAPS first part), slash commands (`/name`), bare names not at the root, and relative paths
  whose first folder isn't in the project; `~` and `/` paths are info ("isn't on this machine
  now"). With that, DeNon's seven projects show no false stale paths (2026-11-08).
- **Testing proposals in a `CREW_DATA` sandbox from a pal's terminal** still tells the proposer:
  with no crewd for that data, the message is typed into the real terminal. Run such tests with
  `HC_TERMINAL_ID=` for both sides.
- **The dashboard's terminal is the shown channel's own session in a second view.** Full hides the
  `work` column, so it's the only visible view and sets the terminal's size; closing the dashboard
  gives the size back and Claude Code redraws. `{agent: "focused"}` shows the agent chosen with
  `agent.focus`, else the focused pane's, else the FIRST agent anywhere, so `dash-tbar` hides
  `dash-term` while the shown channel has no agent. To verify live (2026-11-08, not yet seen): that
  `agent.focus` doesn't move the view elsewhere, and that a hidden block doesn't keep the size.
- **The profile panel's focus:** it takes the keyboard on every open (a 250 ms poll of
  `crew.panel.at`, not in render), so Esc closes it; a click in the terminal gives the keyboard
  back. Herdr shows and hides a layout block at once (no slide).

- **The hero's floor pool** is an `image()`, not an `svg()`, so it stays behind the pet.
- **The pets' lightsaber is faked:** Herdr can't blur, stroke a path, tint a shadow or clip to a
  rounded shape. On a boxed face (the open pets have no saber), a comet-shaped sweep
  (`pet-saber.svg`, 40 slices) spins about the container's centre and shows only through 1.5-10 px
  strips along its edges, one set of strips per glow ring (3 rings under 120 px wide, 5 above).
  Herdr draws svgs over images, so the strips keep the sweep off the pet. Rounded saber corners
  would need the backdrop's colour (`petEl` `{back}`: covers in that colour and the box's cut the
  corners to an arc); no caller passes one, so the corners stay square.
- **It runs programs and reads outside its folder:** `hc send/read` into terminals, `git`, and
  `claude -p`, which sends channel screens to the API.
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
- **TextView ignores font weights here:** with the layout's Inter, `**bold**` and headings draw at
  regular weight. Headings still draw larger.
- **Herdr doesn't paint a hidden window,** so `herdr-app shot` fails off-screen.
- **Claude Code's folder-trust question stalls new pals:** a pal or worktree channel in a folder
  Claude Code hasn't seen waits on "Quick safety check … one you trust?". Detect it (whitespace-
  insensitive: "Yes, I trust this folder" plus "Accessing workspace" or "Quick safety check") and
  point the owner at the tab: a toast from the hire handler, a notice from `pal hire` / `pal
  channel`, and crewd's `trust` entry in the feed, the overview's "Waiting on" and a note to the
  head pal. Never answer it: trusting a folder is the owner's call, even with permissions bypassed.
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
- Every pal's face is a pocket pet in its own colour: open (no box) in the hero, the pal rows and
  the profile panel, on a faint container in the small faces (header chip, rail, rooms, dialogs),
  where a working one has a lightsaber lapping the edge. A working pet's paw taps, and
  `data/crew-demo.json` `{"states": {"<pal>": "merged"}}` gives that pal the cheering pose (and a
  purple edge on its boxed faces).
- With the profile panel closed, the terminal is as wide as before. The hero's name, the Profile
  quick action, right-click → Profile, the pal menu's Profile and Ctrl+Shift+I each open it on the
  right: Profile and the Vault Full over the work area, AGENTS.md Side beside the terminal; the
  same trigger, × or Esc (panel focused) close it. ⤡ goes to Side, ⤢ back to Full.
- A worktree channel's right-click has Review changes; a plain channel's doesn't.
- `pal mission set` from a pal is refused; `pal mission propose -F f` puts a card in the Inbox; View
  shows it in the panel's Vault › Mission; Accept writes `mission.md`, and the next session's primer
  starts with the new mission.
- For a project with AGENTS.md and no CLAUDE.md, the AGENTS.md tab shows `no-pointer`; Create
  pointer → Review shows `+1 −0` and "new file"; Write makes CLAUDE.md holding `@AGENTS.md`, a
  backup marked `.absent`, and a change-log line, and nothing else in the repo changes.
- A pal's Edit of an AGENTS.md is held in the Inbox.
- `pal notebook "did: x" --hiccup "y (cost: 10m)"` from a pal adds one entry, shown live in the
  Vault › Journal; a line with `sk-ant-…` comes out ‹masked›; a pasted 20-line log is refused.
- With three pals' notebooks holding the same hiccup, `pal dream --no-model --dry-run` shows one
  qualifying pattern; a real run sends the head pal one `[dream]` digest; `pal dream propose
  --kind skill …` puts one card in the Inbox; Approve saves the skill and `pal dream ls` shows the
  pattern watching; the same hiccup again makes it recurred; 15 quiet days, resolved.
- Ctrl+Shift+I opens the dashboard over the work area; typing "hi" + Enter in its terminal reaches
  that channel's Claude Code (closing the dashboard shows it there too); clicking another channel
  row shows that channel's session; a channel with no agent shows "no agent running" (and Wake when
  the pal is asleep).
- The status bar shows "1 needs you" while one channel asks, and nothing at zero.
- No radius above 8 anywhere, and no oval pills: only status dots of 9px or less are round.
- `pal update check` answers from the repo in `data/crew-install.json`, and `pal version` prints the
  installed version.
- The pals layout is Focus only: no pal rail, tab strip, inspector or mode switch, and nothing
  answers Ctrl+Shift+M. The installer removes an old `"ctrl-shift-m": "crew-roster.mode"` from
  keys.json's `global` map, and only that exact binding (keys.json is backed up first).
