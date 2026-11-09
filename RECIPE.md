# Project Pals

Your coding agents as a crew of pals. Any harness works: Claude Code, Antigravity CLI (`agy`),
Codex, Grok CLI, Gemini CLI, opencode, Hermes, Copilot, Cursor, pi.

Every Herdr space is a pal (a project with a brain), and each of its tabs is a topic, a clone
working on one thing. Pals are pocket pets whose pose shows what they're doing. You can watch
a topic as a chat instead of a terminal, put pals together in group-chat rooms, and give them
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
    is its latest topic's terminal title, tagged `[topic]` when it has several. A mark shows
    only when something's happening: a wave while working, a green dot when it finished. A pill
    on the right counts its topics ("4 ch", shown from two up), or turns red ("1 blocked") when
    one needs you. Click a pal to open it; its topics are the tabs along the top, not rows
    here. Right-click a pal for Pin to the top, Rename (memory and routines follow: the roster
    remembers each space's name and runs `pal renamed` when it changes), Customize look, New
    topic, Put to sleep (keeps the model it's on; Herdr asks "Close space?"). Right-click a
    sleeping pal for Wake / Unpin / Forget, a room card for Open / Close room. A pal hired in the
    last 10 minutes with no brain yet shows "starting". Pinned pals
    sit first, in the order pinned, with a small pin after the name and a hairline under them.
    Pals with no agent running fold into an **Asleep** row with a count; clicking a closed one
    wakes it with every topic it had, by name (records keep a tab id → name map).
  - **Rooms:** cards listing each room's members' faces and its goal, plus "New room".
  - **Tasks:** an "Add a task, @Pal to assign it" field, then bordered lists (Blocked, In
    progress, Open, Done today). Each task row shows its owner's face, its title and
    `T3 · Owner`. Clicking a task expands it: details, Open topic, Mark done, Cancel, Reopen.
  - **Inbox:**
    - Approval cards ("X wants to push", the command in monospace, Decline / Approve).
    - "X looks stuck" rows.
    - Finished and needs-you topics.
    - A banner if the helper service is off.
  - **Footer:** "+ Hire a pal", then icons for computers, routines (clock), About (ⓘ, with a dot
    when an update is out) and settings.
- **Frame** (padding 8/10, gap 6):
  - **Tab bar, 38px:** the shown pal's topics as soft pills, the only place topics are
    listed. The shown one is filled; each has a 7px status dot (yellow working, red needs you,
    green done, grey idle) and a name; ✕ appears on hover; double-click renames; a round + adds one.
    Right-click a tab (the `crew-menu` popup) to pin it, color it, rename or close it. Pinned tabs
    move to the front (`tab.move`, so Alt+number reaches them first), show a pin and no ✕, and a
    hairline follows them. Colors are the theme's own (ansi1–6 and accent, stored by name in
    shared `crew.marks`), so a colored tab follows the theme: its pill is tinted and its name
    takes the color. Every new topic gets one automatically: the palette color that looks most
    different (OKLab) from the ones its pal already uses, blue first. Clearing it in the menu
    keeps it plain. In a room, it shows rooms instead (overlapping faces, then `#name`).
  - **Sheet** (radius 18, the `surface` color, 1px border):
    - **Header, 52px:** one line: a 20px face, the pal name (dimmed), `/`, `#topic` (15px,
      500; click to rename). On the right: a status dot and word, and the details-panel toggle. In a room
      it's a centered pill: overlapping faces, then `#room`.
    - **Center stack:**
      - `tab-view`: the topic's terminal (padding 0/24, pane radius 12).
      - `room-view`: the room as a group chat. Your bubbles are on the right in the accent
        color; pals' are on the left with a 30px face and name. It's a centered column at most
        860px wide, with "• • •" typing bubbles.
      - (A `chat-view`, the topic read as a chat, was removed on 2026-11-08: Project Pals is
        terminal-first, and a real chat belongs to the native app.)
      - **Prompt card** (a floating block over `center`, bottom, centred): when the shown topic
        is blocked on a Claude Code permission prompt or question, its command and every option
        (Yes / Yes, don't ask again / No…) or the question's options; a click answers it (below).
    - **Composer** (rooms only; hidden while a topic is shown): an r8 box, "Message #room"
      (a draft per room), + to attach and send. Files can be dropped in or pasted as images.
    - **Details panel, 340px, hidden by default:**
      - A header: a 38px face (click it to change the look), the name, and
        "harness · computer".
      - The topic: name, folder and a branch tag, then "Take over terminal".
      - A 2×2 grid of stat cards: Context, Usage, Model, This session.
      - Own branch: Review and Land.
      - Other topics, Tasks, Routines, and Memory (a pinned-note field plus the three latest
        remembered facts).
- **Dialogs** (520px, sized to content, the `popover` color):
  - Hire a pal, New topic, New room, Routines, Look (the pet's colour), About.
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
- **Scrolling** (DeNon, 2026-11-08: round scrollbars, not Herdr's hard-cut rectangle). A mod can't
  shape Herdr's scrollbar (no radius or width; its colours come from the theme) or read where a
  scroll area is, so every area our mods scroll is our own (`crew.js scrollArea`): it clips its
  content and moves it by an offset it keeps (wheel and trackpad in pixels, clamped to the measured
  view and content; at an end the wheel goes on to an outer area), and draws a 5px pill thumb,
  radius 2.5 (half its width), 3px in from the right edge in the padding every list keeps, at least
  24px tall, quiet (#FFFFFF26 dark, #0000002E light), brighter on hover and while dragged
  (#FFFFFF4D / #00000059), and draggable. The hero's topics, the pal list (and the folded rail),
  the Inbox's diff and proposal text, the profile panels (Overview, the tabs, the stage, the
  Vault), dialogs (task list, routines, update and About notes, attach, the review's file list,
  the selects' lists via `sheetPanelBox`) all use it. The two long virtual lists (the review's diff,
  a room's chat) keep their virtualisation: Herdr's bar is gone and the same pill is placed from
  the rows the list drew (`thumbFor`; dragging it scrolls to the row under it). No mod uses
  `overflow_*_scrollbar` or `Scrollbar` (a test checks). The command bar's results never scroll
  (they're capped to fit).
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
  Merged purple, Closing red, Stuck amber, Asleep #808082) and " · #topic" in 11px mono; 64px rows; half-opacity while the pal is closed or idle-hidden), rooms, dialogs.
  - **Pal list style** (Project Pals settings → Pal list style, `crew-palstyle`, saved as
    `palList` in crew-settings.json; DeNon 2026-11-08). The rows above are **Large pets**, the
    default. Nine compact looks from DeNon's board (`crew-boards/compact-pals`) use 22-34px pets
    (bare, a scaled aura, no pool) so more fits: 1 Name + folder (32px: name · time, state ·
    #topic, the folder in mono), 2 Two tight lines (26px: name · time, folder · branch; the
    state is a dot on the pet), 3 Name wraps (30px: the name may take two lines), 4 Rich detail
    (28px: name; folder · branch; the brain's logo from Herdr's icons, the state, "N topics" or
    "N blocked", "N tasks"), 5 Table (22px, one 32px line: dot, name, topics, open tasks, time),
    6 Progress (28px: a 3px bar of the pal's tasks, done today of done + open), 7 Folder first
    (30px: the folder relative to ~/Projects as the mono headline, the name small above, state ·
    branch), 8 Grouped (24px tight rows under the group headers), 9 Mini card (34px: a bordered
    card, the name may wrap, the folder, a state chip). All real data: the folder from the pal's
    record or space, the branch of the row's lead topic's pane, topic counts from its tabs, task
    counts from the board (open, claimed, blocked; done in the last day). Every look keeps the
    row's behaviour: a click opens the lead topic, right-click its menu, pins (the pin mark),
    groups and folding, drag to reorder, Hidden pals (a quieter 30px line in the compact looks)
    and the status-first colours.
    **Trees** (DeNon, 2026-11-08; `palTrees`, on unless false), an option for every look (it
    replaced the board's Tree look; a saved `palList: "tree"` shows as Two tight lines): a pal
    with a topic working or asking you unfolds its live topics under its row, asks you first,
    then working, then done, latest first, at most four and an 18px "+N more". Each topic row is
    22px, starting at the look's text column (`palstyles.js textLeft`): the mark (the chosen
    working indicator, an amber dot when it asks you, a check when done) in a 16px slot, "#topic"
    in 11.5px mono (#EDEDED for the shown one) and when it changed; a click opens that topic,
    right-click is its menu. Only those rows are added: nothing else moves. Resting, asleep and
    hidden pals never unfold.
    The sidebar and the dialog's preview draw rows with one renderer (`crew.js palLookRow` /
    `palLookTree`; the look list and its pure helpers in `lib/palstyles.js`, copied into every
    mod). The dialog: the ten looks on the left (number, name, pet size, a check on the chosen
    one), then the caption and the **Trees** switch ("Show working topics under each pal"); a
    live preview of your own pals in the look under the pointer (else the chosen one), with or
    without Trees, at the sidebar's width on the right; a click applies at once, Done keeps it,
    Cancel or Esc puts back the look and Trees you had. Unknown values fall back to Large pets.
    **Machine tag** (DeNon, 2026-11-08; `palMachine`: true / false, unset = the look's default):
    a pal on another machine gets a tiny tag after its name (the machine's laptop / desktop /
    server icon, amber when it isn't connected, and its name in 10.5px mono). On by default in
    Rich detail and Table, off elsewhere; the dialog's **Machine tag** switch sets it for every
    look (Cancel puts it back). No tag means this computer. A pal open on two machines (it moved
    and its old topics still run) is tagged in every look, "this computer" included.
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
- **`pal hire --model <model>`** puts `--model` on the hired pal's command line.
- **Models:** Hire and New topic have a **Model** row for Claude Code (Your default · Opus ·
  Sonnet · Haiku) and Antigravity CLI (Your default · Gemini 4 Argon · Gemini 3.8 Flash · Claude
  Opus/Sonnet · GPT-OSS; New topic adds "Same as <pal>"). It goes on that command line as `--model`,
  never through `/model`, which would change the default for every session. Antigravity CLI initial
  tasks are passed via `-i <prompt>` rather than positional args so interactive sessions stay alive.
- **Hire / Add topic / invite:** a pal or you runs `pal hire|topic|invite` (`pal channel` is the same as `pal topic`). That drops a
  request in `data/crew-requests/`, which the roster carries out with `space.new` / `tab.new`
  and answers with `<id>.result.json`. Your view stays where it was.
- **Rooms:**
  - Messages are lines in `data/crew-rooms/<room>.jsonl`.
  - Pals post with `pal-room say`, and @mentions deliver. A pal's message lands after a typing
    delay (1.5s + 45ms per character, capped at 9s).
  - After 12 pal messages in a row, room messages stop being delivered until the owner posts.
  - Inviting an asleep pal wakes it in a new `#room` topic.
- **Helper (crewd, optional):**
  - Messages wait for a pal's turn to end.
  - Whoever handed out work is told when it's done.
  - Stuck topics (15 minutes of an unchanged screen) get flagged.
  - Routines run on schedule; a reply of NOTHING_NEW stays quiet.
  - A cheap model (`claude -p` or `agy -p`, chosen with `pal settings llm`) reviews topics to save memory notes, distilled nightly.
  - Pals' replies (for `pal ask` and the "finished what you asked" callbacks) are read from Claude Code (`~/.claude/projects/…`) and Antigravity CLI (`~/.gemini/antigravity-cli/brain/…`) session files, through `crewchat.py`.
  - It checks for updates every 6 hours at most (`crewupdate.CHECK_EVERY`).
- **Approvals:** with the Claude Code or Antigravity CLI hook, these are held for the owner's approval in the
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
  in `pal.json`, checks it against `SHA256SUMS`, snapshots the installed files, runs `install.sh`,
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
  survives restarts; Herdr's own space order isn't touched. The topic list can't drag: it's a
  virtual list, whose rows can't take their own mouse handlers in Herdr.
- **Dialogs** ("A · Compact sheet", DeNon 2026-11-08): New topic, Hire a pal, New room, New group
  and Tasks share one kit (`sheet*` in crew.js): a header row (the pal's bare pet over its aura, a
  15/600 title, a 12px #808082 line, a quiet ×), 32px r6 fields on #0A0A0B with a #2C2C2F hairline
  ("#" prefix for names), quiet multi-line boxes, one row of compact 26px selects (label #6A6A6C,
  value #C8C8C8, chevron) whose list opens under the row, and a footer with a hairline over it: a key
  hint, Cancel and the primary action as pebbles (the primary a step brighter, steel blue #26364A;
  dimmed until it's ready). New topic puts Category behind its own select; Hire's selects are
  Brain, Model, Role and Computer, then the folder (with Browse) and the first topic.
- **The Focus grid:** content (text, icons, pets) starts 16px in; row backgrounds, the topic
  rows and the quick-action buttons sit 8px in from both sides. Text ladder: names #EDEDED,
  previews #C8C8C8, `[topic]` 11px mono #808082, times #6A6A6C; a closed pal's text never goes
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
    Under the floor, the pal's topics at full width: a header ("Topics", the count, and a
    magnifier: a search box that filters as you type; Esc or × clears and closes it), then 28px
    rows (`#`, the name, the working indicator or an amber dot, a green check or when it last changed; the shown one
    #232324), up to four; the box is ALWAYS four rows plus the 12px peek (132px), whatever the pal has,
    so switching pals never moves the quick actions or the Pals list (DeNon, 2026-11-08): fewer rows
    leave the rest blank, with a faint "+ New topic" row (#56565A, opens the New topic dialog) after the last
    when not searching; past four the box is four rows plus the top 12px of the
    fifth, cut at its edge, scrolling in our own area with the pill thumb (see Scrolling below; the
    rows end 11px in and the pill sits in that gap, never over a time, pin or dot) and "+N more"
    (#808082, rows below the
    box; follows the scroll, gone at the end; a click scrolls to the end) after the count. The
    shown topic is scrolled into view when it changes. Order: pinned topics first (in pin order,
    with a small pin mark), then, once you've arranged that pal's topics, Herdr's tab order, else
    the smart order (needs you, finished, working, idle agents, plain shells). Right-click a topic:
    Pin / Unpin, Review changes (a worktree topic only: `crew-review`), and Move up / Move down
    (within its group). Pinning and moving move Herdr's own tabs
    (`tab.move`), so the order survives restarts and the `crew-pick` dropdown lists the same.
    The working indicator (here and in `crew-pick`) is the owner's pick in Project Pals settings →
    Working indicator (`crew-indicator`, saved as `workingIndicator` in crew-settings.json): Classic
    dot (6px blue, the default) or one of 30 looping animations in four groups, Pixel (10 dithered
    spinners, 12px), Sphere (10 shaded spheres, 12px) and ASCII (10 character globes, 16px). They
    are animated WebPs in `mods/crew-roster/working/`, pre-rendered from DeNon's three design boards
    by `tools/working-indicators/build.sh` and played by Herdr natively; only working rows draw
    one. The dialog: fake topic rows on top showing the style under the pointer (else the chosen
    one), then a grid of 44px tiles with live 24px previews per group; a click applies at once,
    Done keeps it, Cancel or Esc puts back the one you had.
    No dragging: Herdr's lists have no row drag, so there is no hover pin either; each row takes its
    own click and right-click. Then four quick actions as subtle "pebbles" (Inbox and
    Tasks share the row evenly, flex-basis 0, and each keeps an 18px slot for its count even at zero,
    so no count or pal switch changes their widths; Profile and Sleep are 28px squares) (one flat #1B1B1E face, a 6% white
    hairline inside the top, a 1px darker line inside the bottom, a thin dark outline, GPUI's faintest
    shadow, 28px, r7, 9px side padding; hover a shade lighter, press a shade darker, nothing moves;
    `pebble()` in crew.js): Inbox (DeNon, 2026-11-08: it took "+ Channel"'s place; an inbox icon,
    the sidebar's Inbox view, a second click goes back to the pals; its count is what needs you,
    the status bar's "N need you" from shared `crew.needs`, amber #F0C04A when any, blank at zero;
    New topic is still the list's "+ New topic" row, the command bar and the right-click menu), Tasks with this pal's open count, an icon-only Profile (the profile panel, below;
    Ctrl+Shift+I; the hero's name, underlined on hover, opens it too) and an icon-only moon (put to
    sleep; Herdr asks first). Tasks (Tell merged into it: DeNon, "a Tell is really a task") opens `crew-tasks`
    (520px): a composer on top (a 13.5px textarea, 3 rows growing to 10; Enter adds, Shift+Enter is
    a new line; images by pasting, dropping files on the dialog, or the paperclip's recent-files list,
    copied into `data/crew-attachments`, images only, 10MB and 6 per task, shown as 64x48 thumbnails
    with ×). Adding makes a real task on the shared board, `pal task add "<first line>" --for <pal>
    --body "<the rest, and the images' paths>"`, marked from the owner; the pal is told when its turn
    ends and its "New task" message carries the body, paths included. Then that pal's open tasks
    (working first, then blocked, then open; a tick finishes one, a click on its title shows its
    details, notes and who asked), and "All tasks on the board →". Quick questions go in the
    terminal. No state pill, no species/brain line; the task text is in its pal row. The header has the
  command bar's field centred (T18; DeNon: "this pill is redundant maybe it should be a global
  search / command type of thing, the things that are in the dropdown already there are perfect"):
  a quiet recessed field up to 520 px wide (DeNon: no pet in it; h30, r7, a shade darker than the
  header (#08080A), a faint dark line inside the top, a very faint light one inside the bottom, no
  outer shadow; hover a touch lighter; a subtle blue inner ring while the command bar is open,
  shared `crew.command.open`), a magnifier, "Search pals, topics, tasks… or run a command" and
  its shortcut as a tiny raised pebble (`keyCap`); a click or **Ctrl+Shift+Space**
  (`crew-header.search`) opens the command bar over it (below).
  The split buttons are on the right; the git branch is in
  the agent's own status line instead (crew-statusline adds a dim "(worktree)" in a linked worktree,
  or prints the branch when you have no status line of your own); no
  topic picker on the left (DeNon took it out: topics switch from the hero's list, which shows
  "no agent"). Under it, the topic's terminal, and nothing on the right (DeNon, 2026-11-08, after
  Grok Bot).
- **The profile panel** (DeNon, 2026-11-08; `docs/profiles/proposal.md`): a right-side panel,
  hidden by default. It opens from the hero's name, the Profile quick action, right-click a pal →
  Profile, the pal menu, or **Ctrl+Shift+I** (`crew-roster.profile`); Esc while the panel has the
  keyboard, its × or the same trigger again close it, and the terminal gets its full width back.
  Esc in the terminal stays the program's (it interrupts Claude Code). It always shows the shown pal.
  - Two sizes: **Side**, beside the terminal (420 px by default; drag its edge, 360-640,
    remembered as `focus.panelPx`), and **Full** (⤢ in its header: it hides the `work` column, so
    the panel fills everything right of the sidebar). Profile opens Full, the project tabs Side;
    each tab remembers its size. It starts hidden on every launch.
  - **The profile page** (DeNon 2026-11-08: a mix of #1 Hero stage and #5 Mission control from
    `data/crew-boards/profile-directions`; `stage.js`, numbers from `stagedata.js`). **The hero:**
    the pal is the star: its pet on the soft aura, standing on a stage lit in its state's colour
    (blue working, mint done or PR open, amber asks you (breathing), red stuck; no light at rest or
    asleep: a hairline under the stage instead); a pool of the same colour under its feet; the
    state line over it in mono ("Working · 12m in #profiles": the shown topic); the name big under
    it (22/700; 17 in Side); the mission as one quiet line (else the role; a click opens Vault ›
    Mission); then the **composer**, "Give <pal> a task…" (`compose.js`): it does what the Tasks
    dialog does: Enter adds a real task for the pal (`pal task add --for`, told when its turn ends),
    Shift+Enter is a new line, images by paste, drop on the hero or the paperclip (6 at most,
    `crewattach.py`). Each pal has its own draft; Esc doesn't close the panel over a half-written
    one. **The week cards** (four, r8, tinted fill and edge in their colour): **Shipped** (mint: the
    pal's tasks done in 7 days; opens Vault › Home), **In motion** (blue: working topics plus
    claimed tasks not on one; shows the working topic), **Needs you** (amber: asking topics,
    commands held for approval, proposals, stuck topics; shows the asking topic, else the
    Inbox), **Hiccups** (red: the notebook's hiccups in 7 days and the minutes they cost; opens
    the Journal). Side: a compact hero (92 px pet) and the cards 2×2, then the sections below.
  - **Which computer it works on** (DeNon 2026-11-08; `lib/machines.js`, `crew-machine`). The
    roster publishes the machines as shared `crew.machines` every 20 s (`hc machine ls --json`,
    plus this computer's host name and laptop-or-desktop from its battery). The hero has a machine
    chip under the mission (icon, name, host; an amber dot when it isn't connected; "→ new topics
    on <m>" after a move); a click opens **Change machine…**. The **Machine** card (Full: a panel,
    Side: a section above Facts) shows the machine (icon by kind: a saved
    `machineKinds[<name>]`, else from its name, else server), its host, how Herdr reaches it
    ("this computer (local)", "SSH via Tailscale · user@100.x" for Tailscale's 100.64/10 or
    *.ts.net, "SSH", "via <command>"), connected or not, the project folder on it; when new
    topics start elsewhere, a blue note with Open one there; each of the pal's spaces on other
    machines ("also running: N topics", Show); Change machine…. A pal open on two machines lists
    its topics from both, each with a machine tag.
    **Change machine…** (a 560 px sheet): this computer, then every added machine (icon, name,
    host · connection · target, the state dot and word, "new topics start here", "N running");
    Add machine… (`hc machine add <target> --name <name> --json`, or Herdr's Machines settings);
    then the **project folder on** the picked machine (what it had there before, else the same
    path under that machine's home), checked there (`test -d` run on it, 0.7 s after typing
    stops; an offline machine says it can't look), with **Clone it there** (`git clone` of the
    project's origin, run there) and, on this computer, **Choose folder…**; a warning when the
    pal's brain isn't installed there. Move to <m> (ready once the folder is found) saves the
    record: `machine` (where new topics start and where it wakes), `folder`, and `folders` (the
    folder per machine, "" for this computer, for moving back). Terminals can't move: running
    topics stay where they are, and the sheet says so. Then **Open a topic on <m>** (an awake
    pal) or **Wake on <m>** (an asleep one). Every new topic (+ Topic too) goes through
    `openTopic`: a tab in the pal's space on that machine, else a new space there with the pal's
    name, linked to the record as `also`, so it stays one pal (`recordOf`, `sleepers`,
    `palSpaces`); `linkRecords` forgets closed `also` spaces and hands over to one when the pal's
    own space closes.
  - **Profile in Full is the dashboard** (`profile-dash`): the header with the tabs inline, ⤡ Side
    and ×; then a row: the **stage** (`dash-stage`, scrolling: the hero across its width, the four
    cards in a row, then calm panels (#161617, r8, a 34 px mono header): **Topics** (live state
    dot, or hollow for no agent; `#name` and how long; what it's on; branch or `worktree · <branch>`
    with Review; a click points the terminal at it; + Topic), **Tasks** (Now · Blocked · Next ·
    Done · 7 days: the pal's tasks, plus each working topic without a claimed task, asking and
    stuck topics; a task opens to its body, result and Mark done / Reopen; All tasks opens the
    dialog), **Vault** (Home, Mission with its done-when count, Journal with today's entries,
    Brain with its decision and change counts; a click opens that note), **Memory** (as in Side,
    with Remember… in place), **About** (role, facts, routines with Manage, the quick actions); in
    1, 2 or 3 columns by width) | the **mini terminal** column (`dash-right`, 460 px, min 320,
    resizable): a 33 px bar (`TERMINAL`, a `#topic ▾` picker, live, program and state, Open
    topic ↗) over `dash-term`, an `{agent: "focused"}` block showing the shown topic's agent:
    the real session, typed into directly. A topic row, a task's topic or the picker points
    it at another topic (`tab.select`, then `agent.focus`). A topic with no agent hides the
    terminal; the bar then fills the column and says so, with Wake for a sleeping pal.
  - Header (52 px, #0E0E0F, a hairline under it): the pal's 30 px pet, its name (14/600), ⤢ / ⤡
    and ×. Tabs (36 px, r4, the shown one #232324): **Profile · Vault** ‖ **AGENTS.md** (a 1 px
    divider between the pal's tabs and its project's; AGENTS.md carries the lint's badge:
    red errors, amber warnings, a blue + when a fix is offered). Esc leaves an edit or a review
    first, then closes the panel.
  - **Profile** (Side): the compact hero and the 2×2 cards (above); Facts (role, click to change:
    the record's `role`; brain and `--model`, folder, machine, branch, pet, hired by); every topic
    (its state dot, or a hollow one with no agent; what it's on, else its brief; `worktree ·
    <branch>` and Review on worktree topics; click shows it); **Memory** (the pinned note,
    editable and saved on blur; what a new session starts with and what the 6,000-character primer
    cap cuts; MEMORY.md; the last two days of notes; how many facts about the owner it shares;
    Remember…, saved as `pal remember --bot`; Open folder); its routines; and Tasks (the
    `crew-tasks` dialog), + Topic, Customize look, Put to sleep, as pebbles.
  - **Vault** (DeNon 2026-11-08: it replaced the Notebook, Mission and Brain tabs, which are now
    its notes; their old keys still open them, e.g. `openPanel("mission")`). Opens Full. Full: the
    file tree (232 px, #0B0B0C: Home with a mint live dot, Mission, Journal with its day count (the
    days with entries in the last 14), Brain › Decisions / Change log / Map (left out when AGENTS.md
    has a layout section) / All brain files, Notes (up to 12), then On disk with the folder, "Plain
    markdown: it opens in Obsidian." and Open folder) | the note (max 820 px) | on Home, a 260 px
    rail (This week 2×2, Latest decisions). The tree's counts and brain rows fill in once their data
    has loaded: the brain and the journal both load on every Vault note (refreshed every 8 s and
    5 s while the Vault shows). A brain file that arrives after you moved on (another pal, note,
    file or the list) is dropped.
    Side: a Home · Mission · Journal · Brain strip (34 px) over the note.
    `crew-profile.<name>` (keys.json or `herdr-app do`, while the panel shows) opens a tab or note:
    profile, vault, agents, home, mission, notebook, brain. `vault` (and the header's Vault tab)
    reopens the last note shown; the pal menu's Vault row always opens Home.
  - **Vault › Home** (`vault.js`, numbers from `vaultdata.js`): "<Pal> / Home.md · ● live" (Full adds
    "writes itself from the vault and the board"); the name (26/700, Full only) and mission
    statement (15 px); Brain / Project / Topics ("8 · 3 working" in blue) / Owner; the Focus now
    callout (blue tint: focus 15 px, Goals x of y, Done when x of y, Mission →; with no focus it
    says how the pal sets one, `pal mission focus`, or with no mission how it proposes one); Right
    now (topics working or needing the owner, needing first, amber-tinted; each with its claimed
    task, else its agent's own title (never a shell's user@host), else its brief; click shows it;
    at most 5 in Side, 6 in Full as two rows of three); Tasks as NOW (claimed) / NEXT (open) /
    BLOCKED / DONE TODAY, four columns in Full (4 rows each), rows in Side (3 each), then "+N
    more", Board → opens `crew-tasks`; Today's journal (newest 3: time · topic · task · how long,
    did, the first hiccup in amber, the first lesson in mint; Journal →); This week (entries and
    time logged, hiccups and minutes lost, lessons, needs, over the last 7 calendar days; in Full
    it's in the rail); Latest changes (3, newest first, with the topic; Brain →). In Side, Latest
    decisions (2) closes the note.
  - **Vault › Journal** (was the Notebook tab): the pal's journal, newest day first, today (the
    local date, as the day files are named) live ("live" in mint), All · Hiccups · Lessons, and the
    week's count ("4 hiccups · ~50m lost": from `pal notebook ls`, over the last 7 day files, so
    with gaps it can differ from Home's This week). Each entry: time · #topic · task · how long;
    did; hiccups (an amber tag, with what they cost); needed (tool / skill / rule / context /
    access); lesson. × then "Click again to delete" removes an entry (the day is copied to
    `data/crew-backups/notebook/` first). The head pal's has a Notebook · Dreams switch.
  - **Vault › Mission:** the mission card (statement 16/500; Goals and Done when as checklists you can
    tick; Focus), Edit (the code editor, saved with a hash check), the last 3 change-log lines and
    the last 2 decisions, "All in Brain →". No mission: "Write the mission" (a template). A pal's
    mission proposal shows here with Decline / View.
  - **Vault › Brain:** the files (Decisions, Change log, Map, or "→ AGENTS.md" when AGENTS.md has a layout
    section, notes, and an adopted `_Brain/PROJECT_BRAIN.md`), each opening in the panel with ← Files
    and Edit (a `_Brain/` file in the project saves through Review, a diff, like AGENTS.md); "Brain
    lives in: Pal data | This project" (moves it, copying files, deleting nothing); who writes it.
  - **AGENTS.md:** what Claude Code loads here (global CLAUDE.md + the project's, with imports,
    in lines), the files (View in a read-only editor, Edit), the lint with its fixes (Create
    pointer, Use an import, Make CLAUDE.md the pointer), "Deep check (sends these files to Claude)",
    pals' proposals, and backups with Restore…. Every write: Edit or a fix → **Review** (a diff, a
    note for the change log) → **Write <file>** (the owner's click) → `pal agents apply` (backup in
    `data/crew-backups/agents-files/<pal>/`, refused if the file changed since the diff, a line in
    the brain's change log). Not committed. A pal on another machine: view and lint only.
- **Missions and brains** (`bin/crewbrain.py`): `data/crew-memory/<pal>/brain/` (or the project's
  `.pals/` when the record says `brainIn: project`): `mission.md` (statement, `## Goals`,
  `## Focus`, `## Done when`), `decisions.md`, `changelog.md` (newest first, 200 lines, older ones in
  `changelog-YYYY.md`), `map.md`, `notes/`. Every SessionStart gets a mission block (statement,
  focus, open done-when items, where the brain is, the last 3 changes; at most 1,200 characters)
  before the memory. The mission's statement, goals and done-when are the owner's: a pal runs `pal
  mission propose`; it keeps `pal mission focus`, ticks goals, and logs with `pal brain log` /
  `decide` / `note`. `pal task done` adds a change-log line to the task's pal.
- **Notebooks** (`bin/crewnotebook.py`): `data/crew-memory/<pal>/notebook/YYYY-MM-DD.md`, one entry
  per piece of work (`### 14:32 · #ch · T16 · 40m`, then `- did:`, `- hiccup: … (cost: ~10m)`,
  `- needed: skill: …`, `- lesson:`; at most 8 lines; the same topic within 10 minutes merges).
  The pal writes it with `pal notebook` (`hiccup` for a quick one); every SessionStart says when
  (only after real work) and carries the last 7 days' lessons (at most 400 characters). `pal task
  done` / `block` print a reminder, and crewd queues one line when a topic that was stuck 15+
  minutes moves again (once an hour per topic). Guards: key- and token-shaped text is masked
  (‹masked›); more than 3 lines, or log-looking lines, are refused; paths into someone's home
  other than config (~/.x), ~/Projects and the pal's project are refused. Days older than 90 roll
  into `YYYY-MM.md` (lessons only).
- **The Dream loop** (`bin/crewdream.py`; proposals only): nightly at 03:30 (crewd, after the memory
  distill, one model run at a time) and on demand (`pal dream`, or Dream now in the head pal's
  Vault › Journal → Dreams). (1) Every notebook's hiccup / needed / lesson lines since the last dream,
  no model; under 3 new hiccups crew-wide it skips. (2) One Haiku call groups them into patterns
  (`P-n`), reusing the ledger's open ones; if the call fails, word overlap (2+ shared words). (3)
  Patterns seen in 2+ pals, 3+ times or costing 30+ minutes (at most 3) go to the head pal as a
  `[dream]` digest; it drafts fixes with `pal dream propose` (skill, rule = lines added to a pal's
  AGENTS.md as an agent-file proposal, tool / process = a task, context = a brain note). Each is an
  Inbox card (the pattern, two quotes, the text; Decline · Approve) or, for a rule, the usual
  agent-file review. Approve writes through that kind's writer. `data/crew-dream/patterns.json`
  + `ledger.jsonl`: accepted → watching 14 days → resolved, or recurred when the hiccup comes back;
  declined rests 30 days unless it doubles; a proposal that expires reopens its pattern. It never
  writes DJM OS's Learning Ledger: `pal dream intake` drafts a sanitized note in
  `data/crew-dream/intake/` for the owner to file. The Dreams view: this month's proposed /
  accepted / resolved / recurred, the week's minutes lost, every pattern with its state, the
  intake drafts.
- **Proposals** (`bin/crewproposals.py`, `data/crew-proposals/<id>.json` + `.md`): a pal's
  `pal mission propose` or `pal agents propose <file>` becomes an Inbox card (View opens the panel
  on it; Decline tells the pal), counted in "N need you", expiring after 7 days. Nothing is
  written until the owner accepts (the mission) or writes it after the diff (agent files).
- **The command bar** (`crew-command`, T18): a 560x552 r4 #161617 popup with a hairline, laid with
  its field on the header's and centred on it: the field again, live (the same recessed field with
  its blue ring, 6 px in: a magnifier, the query, "esc" as a tiny pebble), then the rows, then a foot ("↑↓ move · ↵ open · esc close"). An empty box lists the pal
  menu's rows unchanged (`palMenuItems` in crew.js, shared with `crew-palmenu`) under "<Pal> · The
  pal" and "<Pal> · The project", Put to sleep after a hairline, then "Project Pals": New topic
  (for the shown pal), Hire a pal…, New group…, Check for updates, Project Pals settings (the gear's
  `quick` rows, `appMenuItems`). Typing searches pals (asleep ones say "wake" and Enter wakes them),
  topics (a state dot: blue working, amber needs you, green done; their task title is searchable),
  open tasks (Enter opens `crew-tasks` for the pal working it), the Vault's notes (Home, Mission,
  Journal, Brain; the shown pal's first, another pal's shows that pal) and every command (the pal
  menu's, New topic, the whole gear menu). Matching (`mods/crew-command/search.js`, tested by
  `tests/test_command.mjs`): every word must match; a label's start beats a word's start beats
  anywhere beats its letters in order from a word start; sub lines and extra words count less and
  aren't bolded; the matched letters are bold. Groups come best hit first (ties: Pals, Topics,
  Tasks, Vault, Commands), capped (4, 4, 3, 3, 4) and trimmed so no more than 13 rows (headers
  included) show, so it never scrolls. ↑/↓ move (wrapping), Enter opens or runs, Esc closes; the
  pointer moves the mark too. Ctrl+K isn't used: in a terminal it's the shell's kill-line, and
  Herdr's own picker is Ctrl+Shift+K.
- **The pal menu** (`crew-palmenu`, 300 px, crew-pick's look; the header's chip opened it until the
  command bar replaced the chip, whose empty list shows the same rows): the pal's
  name and "harness · folder", then The pal (Profile with its shortcut, Vault, Memory, Tasks with
  the open count: the `crew-tasks` dialog), The project (AGENTS.md, Review changes on
  a worktree topic, Open folder), then Put to sleep. No topics: the hero lists them. ↑/↓, Enter, Esc. The row the panel is already
  on is checked, and choosing it closes the panel.
- **Status bar** (24px, under everything): a quiet gear at its left end, the working count,
  **"N need you"** (questions for you, approvals waiting, stuck topics, proposals; amber, red while
  an approval waits; a click opens the Inbox; hidden at zero; the roster publishes it as shared
  `crew.needs`). Claude Code marks a topic blocked from the wording of its last message, so a
  blocked topic plainly addressed to another pal ("Orca, should I…", "tell Orca#general when…",
  `pal tell`) isn't counted: the roster reads blocked agents' `hc get` → `status.msg` (only theirs,
  cached until the report changes) and `blockedFor()` decides; anything unclear, or no text,
  still counts. Its tooltip says why each one counts ("Question: Orca #general · Approval: push ·
  OMA CMZ #dotfiles · Stuck: … · not counted: 1 asking a pal"). The Inbox lists the pal-to-pal ones
  as "<pal> asked another pal", after your questions, and they don't turn the Inbox red. Then come the shown topic's 5-hour and weekly usage, the update pill (see Updates) and the installed
  version. The gear (and the folded rail's) opens the app menu (`crew-appmenu`, a 252x454 popup in the terminal menu's look, with
  shortcuts from keys.json): Hire a pal…, New room…, Inbox, Rooms, Routines, Theme and look
  (`app.settings {section: "look"}`), Switch Herdr layout (`layout.switch`), Machines, Herdr
  settings, Command palette, Check for updates (`crew-update` with props `check: true`),
  Project Pals settings (About: owner, head pal, update, Roll back).
- **The terminal sits in the app** (DeNon, 2026-11-08): no card around it. The pals layout sets
  its own `colors.background` to the column's #0B0B0C (this layout only, not the person's theme),
  so a terminal's default background is the column itself; programs' own coloured cells keep
  theirs. No frame around a lone pane (`lone: false`; split panes keep their hairline and focus
  border); the block is padded 8/16 and terminals 8/8, so text lines up with the header's.
- **Terminal-first** (DeNon, 2026-11-08): a topic is its terminal; you type in it
  directly, and you answer its permission prompts and questions there too (no prompt card:
  DeNon removed it on 2026-11-08, since it repeated the terminal's question and covered it). The
  composer shows only under a room.
- **Splits:** Herdr's own (Ctrl+Shift+O right, Ctrl+Shift+E down, Ctrl+Shift+X close, Ctrl+Shift+Z
  zoom, Alt+H/J/K/L move, Alt+Shift swap), plus split right / down buttons in the header, and the right-click on a terminal (`crew-termmenu`, the layout's
  `terminal_menu`: split, zoom, copy, paste, right-click routing, close; "Close pane (ends
  Claude Code)" in red on the agent's pane). A new pane is a shell in the topic's folder and
  belongs to that topic; the topic's agent stays its lead pane (state, "no agent" and `pal tell`
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
    (52 px), then a row of `dash-stage` and the `dash-right` column (460 px, min 320) of `dash-tbar`
    (33 px; the whole column while no agent runs) and `dash-term` (`{agent: "focused"}`), each mod
    block a `crew-profile` copy with its `part` (head, stage, tbar).
    `layPanel` shows `profile-dash` instead of `profile-main` only in Full on Profile. `openPanel` / `closePanel` / `togglePanel` / `setPanelSize` in `crew.js` use
    `layout.show` / `layout.hide` / `layout.resize` (`px` for Side, `weight: 1` with `work`
    hidden for Full); shared `crew.panel` holds `{tab, sizes, section, at}`.
- **Mods:**
  - Persistent: `crew-roster` (sidebar, and it serves requests), `crew-header`, `crew-room`,
    `crew-composer` (rooms), `crew-status`, `crew-profile` (the profile panel; `focusable`).
    Popups: `crew-appmenu` (the gear), `crew-termmenu`, `crew-palmenu` (props `space`), `crew-command` (props `space`; `at` the header's field). Removed with Pro: `crew-palrail`, `crew-tabs`,
    `crew-side` (the installer sets installed copies aside, backed up; Roll back restores them).
  - Dialogs: `crew-group` (props `mode` new/rename, `group`, `bot`), `crew-hire`, `crew-duplicate` (props `space`), `crew-room-new`, `crew-routines`,
    `crew-look` (props `space`), `crew-review` (props `space`, `tab`), `crew-about`, `crew-update` (props `check`),
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
  - Keyable commands: `crew-roster.hire|topic|routines|look|profile` (`crew-roster.channel` still works), `crew-header.search`. The
    installer binds `ctrl-shift-i` to `crew-roster.profile` and `ctrl-shift-space` to
    `crew-header.search` in keys.json's `global` map, each when no section uses that key yet and
    the action isn't bound (keys.json backed up first; no keys.json, no change).
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
  crewguard.py): redirects in both heredoc orders and to quoted paths with spaces, `tee`, `sed`/`perl
  -i`, `cp`/`mv`/`install`/`ln`/`rsync` destinations, `dd of=`, inside `sh -c` too. Policy defaults
  version 7. Anything cleverer (a script, python) isn't caught: the gate isn't a boundary.
- **The profile panel binds every edit and review to its pal** (H4, `bind.js`): space, name,
  folder and a generation that bumps when the shown pal changes. A late diff for another pal is
  dropped, Write and Save refuse a changed target, and `pal agents apply --folder --staged-sha`
  checks both again. The role and pinned note save to the record they were opened for.
- **Attachments** (M4, M5, `bin/crewattach.py`): opened without following symlinks, a regular file,
  read at most 10 MB + 1 byte from that handle, the bytes must be an image; a fresh unique name created
  exclusively, so nothing is overwritten and a failure never removes an existing file.
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
  without an id is named "HH:MM #topic" and must match only one.
- **The dream's housekeeping runs every night** (M7): expired proposals reopen their patterns and
  quiet watched fixes resolve even when the night is skipped for having too few new hiccups.
- **Roll back restores Project Pals' config entries** (M6): each snapshot records `keys.json`'s
  ctrl-shift-i / ctrl-shift-space / ctrl-shift-m and Project Pals' hook entries and status-line wrapper in
  `~/.claude/settings.json` (absence included); Roll back puts back only those still Project Pals'
  own, after a backup, and leaves later edits. A key an older snapshot doesn't list counts as unset
  there, so rolling back to 0.3.0 takes ctrl-shift-space out again while it's still ours. Hook events
  work the same way (`crewupdate.MANAGED_EVENTS`: SessionStart, PreToolUse, PostToolUse, Stop): an
  older snapshot lists only the first two, so rolling back to 0.3.x takes Project Pals' PostToolUse
  and Stop entries out (the person's own hooks on those events stay). The snapshot also records
  whether `~/.gemini/config/hooks.json` had the `project-pals` key; without it, Roll back removes it.
- **Only the owner's click speaks as the owner** (the Desk §10.1, 0.4). `[from <owner>]` is written
  only when the app passes a click token for exactly that command line (`pal tell|ask|task …
  --click`, from `ownerCli`: Tasks' add and done, Review's notes); a bad or used token is refused,
  never downgraded. With no pal terminal it's `[from a shell on this computer, not verified as
  <owner>]` (a terminal that isn't a pal's: `[from terminal tN, …]`); before 0.4, an empty
  `HC_TERMINAL_ID` meant the owner, so `env -u HC_TERMINAL_ID pal tell` (or a `claude -p` child,
  which crewd starts without `HC_*`) could pass as them. Bodies can't fake a header: `[from `, `[pal]`
  and `[dream]` anywhere in a pal's text become `[quoted: …` (`crewlib.unforge`). `pal-room` from a
  shell won't take the owner's name from `CREW_NAME`. Shell or edit-tool writes into
  `data/crew-queue/` from a pal are held (`queue-write`, policy defaults version 9).
- **Messages reach busy pals through hooks** (goodboimax's PR #2 and #3): Claude Code's PostToolUse
  (`additionalContext`) and Stop (`decision: block`), agy's PreInvocation (`injectSteps`) and Stop
  (`decision: continue`). Queue files are claimed by renaming to `.taken`, so a hook and crewd never
  both deliver one. The per-step hooks are installed as `crew-hook-fast <event>`, a `sh` script that
  starts Python only when `data/crew-queue/<terminal>/` holds a `*.json` or the terminal has no
  `data/crew-hooked/<terminal>` yet (and keeps that heartbeat fresh), so a pal with nothing waiting
  pays a few shell builtins per tool call. Idle pals are still typed to, with the draft guard.
- **Pals start with Claude Code's prompt suggestions off** (`palArgv`, applied by `launchSpec` and
  `wakePal`): `--settings '{"promptSuggestionEnabled":false}'` on the pal's own command line, never
  in the stored argv or `~/.claude/settings.json`. `hc read` is plain text, so ghost text looked
  like an unsent draft and held messages for an hour (2026-11-08). An argv with its own `--settings`
  is left alone; `"pal_prompt_suggestions": "keep"` in crew-settings.json turns this off. Whether
  the flag outranks a user setting of `true` is unverified (Claude Code's docs put command-line
  settings above user settings).

- **What a session starts with** (`memory_text`, the SessionStart hook; DeNon 2026-11-08): the
  pinned note, the pal's MEMORY.md, USER.md, always whole; then its newest notes, newest first and
  whole lines only, up to 16,000 characters (`MEMORY_CAP`), and "(N older notes not loaded; run pal
  memory to see them)". It used to keep the LAST 6,000 characters, so USER.md, the pinned note and
  MEMORY.md were cut first. `pal memory <Pal>` prints everything, in the same order.
- **A project's AGENTS.md / CLAUDE.md change only with the owner's click.** `pal agents apply`
  refuses from a pal's terminal; the approval gate holds a pal's Edit / Write of a file named
  AGENTS.md or CLAUDE.md (`agents-file`, the hook turns it into "edit <path>"; the PreToolUse
  matcher is `Bash|Edit|Write|MultiEdit|NotebookEdit`, and install-hooks.py updates an older
  `Bash` one) and shell writes to one (`agents-file-shell`: `>`, `>>`, `tee`, `sed -i`, `cp`/`mv`
  onto it). Policy defaults version 6. Not a security boundary: a pal can still find a way.
- **The lint's stale-path check** skips git refs, `VAR=…`, placeholders (X.Y.Z, `<x>`, `*`, `…`,
  an ALL-CAPS first part), slash commands (`/name`), bare names not at the root, and relative paths
  whose first folder isn't in the project; `~` and `/` paths are info ("isn't on this machine
  now"). With that, DeNon's seven projects show no false stale paths (2026-11-08).
- **Testing proposals in a `CREW_DATA` sandbox from a pal's terminal** still tells the proposer:
  with no crewd for that data, the message is typed into the real terminal. Run such tests with
  `HC_TERMINAL_ID=` for both sides.
- **The dashboard's terminal is the shown topic's own session in a second view.** Full hides the
  `work` column, so it's the only visible view and sets the terminal's size; closing the dashboard
  gives the size back and Claude Code redraws. `{agent: "focused"}` shows the agent chosen with
  `agent.focus`, else the focused pane's, else the FIRST agent anywhere, so `dash-tbar` hides
  `dash-term` while the shown topic has no agent. To verify live (2026-11-08, not yet seen): that
  `agent.focus` doesn't move the view elsewhere, and that a hidden block doesn't keep the size.
- **The profile panel's focus:** it takes the keyboard on every open (a 250 ms poll of
  `crew.panel.at`, not in render), so Esc closes it; a click in the terminal gives the keyboard back.
  Herdr shows and hides a layout block at once (no slide).

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
  topic screens to the API.
- **The helpers change your setup:**
  - They add a systemd user service, `herdr-crew.service`.
  - They edit `~/.claude/settings.json` (SessionStart, PreToolUse, PostToolUse and Stop hooks, plus the
    `crew-statusline` wrapper) and `~/.gemini/config/hooks.json` (`project-pals` SessionStart, PreToolUse
    `run_command`, PreInvocation and Stop hooks).
    Existing files are backed up first.
  - `./install.sh --no-helpers` skips all of that.
- **Linux only** for the helpers (systemd).
- **Virtual-list rows can't hold `on_click`:** they render blank. Use the list's
  `on_item_click(key)`, or controls outside the list.
- **No `InputState.new` during render:** create inputs in `init` or from a timer.
- **TextView ignores font weights here:** with the layout's Adwaita Sans (a variable font) and with
  Geist, `**bold**` and headings draw at regular weight. Headings still draw larger.
- **Herdr doesn't paint a hidden window,** so `herdr-app shot` fails off-screen.
- **Session formats aren't public:** unknown entries are skipped when replies are read from session
  files. Approvals cover Claude Code and Antigravity CLI (Codex and others stay un-gated).
- **Claude Code's folder-trust question stalls new pals:** a pal or worktree topic in a folder
  Claude Code hasn't seen waits on "Quick safety check … one you trust?". Detect it (whitespace-
  insensitive: "Yes, I trust this folder" plus "Accessing workspace" or "Quick safety check") and
  point the owner at the tab: a toast from the hire handler, a notice from `pal hire` / `pal topic`,
  and crewd's `trust` entry in the feed, the overview's "Waiting on" and a note to the head pal.
  Never answer it: trusting a folder is the owner's call, even with permissions bypassed.
- **Never type over someone's draft:** messages are pasted into a pal's terminal and Enter is
  pressed. If its Claude Code input box holds unsent text (the owner typing), that text would go out
  glued to the message, so nothing is typed in while it's there: crewd keeps the messages queued,
  lists the hold under "Waiting on", and delivers once the box is empty. Callbacks never quote
  that unsent text, since it isn't anyone's answer.
- **Hooks deliver to busy pals:** a Claude Code or agy pal with the hooks installed takes its own
  queue (`crew-hook stop` / `post-tool-use`, `agy-stop` / `agy-pre-invocation`), so messages reach it
  mid-turn or as its turn ends without typing; crewd still types to idle pals. Queue files are
  claimed by renaming them to `.taken`, so crewd and a hook never deliver the same one. Replies for
  `pal ask` and callbacks come from the pal's session file, the screen only when it has none.
  `pal ask` to a busy pal with hooks doesn't wait its turn out: the question goes in mid-turn and
  the answer comes back as soon as it's written.
- **agy gets its primer back after compacting:** agy drops everything before a compaction's
  `CHECKPOINT` entry, the SessionStart primer included, so `agy-pre-invocation` watches the session
  file (only the bytes added since the last call) and injects the primer again once per compaction.
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
- A Claude Code topic blocked on a question shows "asks you" on its pet and row, and nothing
  floats over its terminal.
- Every pal's face is a pocket pet in its own colour on a faint container: the working one has a
  lightsaber lapping the container's edge and a tapping paw, and `data/crew-demo.json`
  `{"states": {"<pal>": "merged"}}` gives that pal a purple edge and the cheering pose.
- With the profile panel closed, the terminal is as wide as before. The hero's name, the Profile
  quick action, right-click → Profile, the pal menu's Profile and Ctrl+Shift+I each open it on the
  right, beside the terminal; the same trigger, × or Esc (panel focused) close it. ⤢ fills the work
  area; ⤡ goes back.
- A worktree topic's right-click has Review changes; a plain topic's doesn't.
- `pal mission set` from a pal is refused; `pal mission propose -F f` puts a card in the Inbox; View
  shows it in the panel's Vault › Mission; Accept writes `mission.md`, and the next session's primer
  starts with the new mission.
- For a project with AGENTS.md and no CLAUDE.md, the AGENTS.md tab shows `no-pointer`; Create
  pointer → Review shows `+1 −0` and "new file"; Write makes CLAUDE.md holding `@AGENTS.md`, a backup
  marked `.absent`, and a change-log line, and nothing else in the repo changes.
- A pal's Edit of an AGENTS.md is held in the Inbox.
- `pal notebook "did: x" --hiccup "y (cost: 10m)"` from a pal adds one entry, shown live in the
  Vault › Journal; a line with `sk-ant-…` comes out ‹masked›; a pasted 20-line log is refused.
- With three pals' notebooks holding the same hiccup, `pal dream --no-model --dry-run` shows one
  qualifying pattern; a real run sends the head pal one `[dream]` digest; `pal dream propose
  --kind skill …` puts one card in the Inbox; Approve saves the skill and `pal dream ls` shows the
  pattern watching; the same hiccup again makes it recurred; 15 quiet days, resolved.
- Ctrl+Shift+I opens the dashboard over the work area; typing "hi" + Enter in its terminal reaches
  that topic's Claude Code (closing the dashboard shows it there too); clicking another topic
  row shows that topic's session; a topic with no agent shows "no agent running" and Wake.
- The status bar shows "1 needs you" while one topic asks, and nothing at zero. A topic that ends
  its turn with "Orca, should I…?" doesn't raise it, and the tooltip names why each one counts
  (`node tests/test_needs.mjs`).
- No radius above 8 anywhere, and no oval pills: only status dots of 9px or less are round.
- `pal update check` answers from the repo in `pal.json`, and `pal version` prints the
  installed version.
- The pals layout is Focus only: no pal rail, tab strip, inspector or mode switch, and nothing
  answers Ctrl+Shift+M. The installer removes an old `"ctrl-shift-m": "crew-roster.mode"` from
  keys.json's `global` map, and only that exact binding (keys.json is backed up first).
- A busy Claude Code pal with unsent text in its input box gets a `pal tell` between its steps,
  and nothing is typed into the box. An empty-desk PostToolUse starts no Python (`crew-hook-fast`).
- `env -u HC_TERMINAL_ID pal tell P#c "x"` arrives as "[from a shell on this computer, not verified
  as <owner>] x"; a task added from the Tasks dialog arrives as "[from <owner>]"
  (`tests/test_stage1.py`).
- A Claude Code pal launched or woken from Project Pals shows no grey prompt suggestion in its box
  (`node tests/test_launch.mjs`).
- Rolling 0.4 back to 0.3.x leaves `~/.claude/settings.json` with only the person's own PostToolUse
  and Stop hooks.
