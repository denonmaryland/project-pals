# Project Pals

Your coding agents as a crew of pals. Any harness works: Claude Code, Codex, Grok CLI, Gemini CLI,
opencode, Hermes, Copilot, Cursor, pi.

Every Herdr space is a pal (a project with a brain), and each of its tabs is a channel, a clone
working on one thing. Pals have living mascot faces that show what they're doing. You can watch
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
      500; click to rename). On the right: a status dot and word, a **Chat | Terminal** switch
      (shown only when the channel has a chat feed), and the details-panel toggle. In a room
      it's a centered pill: overlapping faces, then `#room`.
    - **Center stack:**
      - `tab-view`: the channel's terminal (padding 0/24, pane radius 12).
      - `room-view`: the room as a group chat. Your bubbles are on the right in the accent
        color; pals' are on the left with a 30px face and name. It's a centered column at most
        860px wide, with "• • •" typing bubbles.
      - `chat-view`: the channel as a chat. Light markdown: bold, `code` pills, links, headings,
        hanging-indent lists, quotes, code blocks. Tool calls fold into one line ("Ran 3
        commands · edited x.js", which expands on click). Under it, a strip shows model ·
        effort · context bar · 5-hour/weekly usage, with Working · Stop.
    - **Composer, 86px:** a 48px rounded card, at most 900px wide: a round +, then "Message
      #channel" (one draft per channel or room), then a round send button. Files can be dropped
      in or pasted as images.
    - **Details panel, 340px, hidden by default:**
      - A header: a 38px face (click it to change the look), the name, and
        "harness · computer".
      - The channel: name, folder and a branch tag, then "Take over terminal".
      - A 2×2 grid of stat cards: Context, Usage, Model, This session.
      - Own branch: Review and Land.
      - Other channels, Tasks, Routines, and Memory (a pinned-note field plus the three latest
        remembered facts).
- **Dialogs** (520px, sized to content, the `popover` color):
  - Hire a pal, New channel, New room, Routines, Look (mascot editor), About.
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
- **Mascots:** little folders with faces, drawn by `mascot-art.js` into
  `data/crew-mascots/<hash>-<mood>[-body|-eyes].svg`.
  - The folder has a darker back panel with a tab, a white sheet of paper peeking out, and the
    pal's color on the front panel, with the face centered on it.
  - 8 shapes (folder by default; also round, pebble, bean, squircle, ghost, cat, bear) and 12
    accessories, in any hex color.
  - The eyes are their own layer, so they can move.
  - A pal's stock look is a folder in its color (by harness for hired pals, by a hash of its
    name otherwise), with its brain's accessory (a crown for the head pal).
  - A face shows only once the roster has drawn its art (shared `crew.art`): an image that fails
    to load once isn't retried.
- **Demo filter (for screenshots):** `data/crew-demo.json` `{"only": ["Website", …]}` makes that
  window's sidebar show just those pals; no file, everyone. `preview.png` was made this way in a second
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
  - Chat feeds are built from Claude Code session files.
  - It checks for updates once a day.
- **Approvals:** with the Claude Code hook, these are held for the owner's approval in the
  Inbox: push, publish, release, PR merge or create, GitHub posting, deploys, messaging, and
  `pal land`. An approval lets that exact command through once.
- **Updates:** About → Check for updates → Update. Downloads the latest release of the repo in
  `pal.json`, checks it against `SHA256SUMS`, snapshots the installed files, runs `install.sh`,
  and restores the snapshot if any mod fails `herdr-app check`. Roll back is offered.

### Layout modes: Focus (default) and Pro

One layout, two densities; switching only shows, hides and resizes nodes (nothing re-orders, and
drafts stay put). Anything new is drawn in the design-system look: 1px hairlines, radius 3/4/6/8,
rectangular segments and tags.

- **Focus** (a fresh setup starts here): the sidebar at 304px (the hero pal and the pal list, as
  above), no tab strip. The header has a `# channel ▾` picker on the left (a popup of the pal's
  channels plus New channel; right-click renames), the pal's name chip centred, and its branch on
  the right. A 48px **rail** on the sheet's right edge has Run, Tasks and Memory icons (Run carries
  the channel's live dot) and Expand at the bottom. An icon **peeks** that inspector section in a
  320px panel beside it; clicking it again, or the panel's ×, closes it. A peek isn't remembered.
- **Pro:** a 60px **pal rail** (faces in sidebar order, state dots, + to hire, settings), a 264px
  list column (the shown pal as a banner card, its channels with what each is on, Channels ·
  Rooms · Tasks · Inbox, and "Across pals": who else is working or needs you), the channel tabs
  above the sheet, and the **inspector** open at 320px with Run / Tasks / Memory tabs and Fold.
- **Switching:** Ctrl+Shift+M (`crew-roster.mode`), the status bar's `Focus | Pro` segment, Expand
  (opens Pro on the peeked section) and Fold, About › Settings › Layout (two picture tiles), or
  `pal settings layout focus|pro` from your own shell (the window follows within 3 seconds).
- **Status bar** (28px, under everything): working count (Pro adds needs-you), the shown channel's
  5-hour and weekly usage, in Pro its branch with ahead/behind, the shortcut, the mode switch and
  the installed version.
- **Composer** (both modes): one r8 box, the prompt on top, then attach, the channel's brain and
  model, its permission mode (Bypass / Ask first, read from the terminal's command), mic, voice
  and send. 720px centred in Focus, full width in Pro. Mic and voice only say they're coming.
- **Remembered** in `data/crew-settings.json`: `layoutMode`, `focus.sidebarPx`, `pro.listPx`,
  `pro.inspectorPx` and `pro.inspectorTab`. Each mode keeps its own drag widths.

## Built from

- **Layout:** `layouts/pals.json`, the tree above.
  - Stack `center` has the children `tab-view`, `room-view` and `chat-view`.
  - `crew-header` keeps it on the channel's choice (shared `crew.chat`) unless a room is shown.
  - The `panel` block starts hidden and is toggled with `layout.toggle {id: "panel"}`.
- **Mods:**
  - Persistent: `crew-roster` (sidebar, and it serves requests), `crew-tabs`, `crew-header`,
    `crew-room`, `crew-chat`, `crew-composer`, `crew-side`.
  - Dialogs: `crew-hire`, `crew-duplicate` (props `space`), `crew-room-new`, `crew-routines`,
    `crew-look` (props `space`), `crew-review` (props `space`, `tab`), `crew-about`,
    `crew-attach`.
  - Popup: `crew-menu` (props `what` = "tab" | "pal", `space`, `tab`), the right-click menu.
  - Every mod gets `lib/crew.js` (the shared model) and `lib/mascot-art.js` copied in.
- **Herdr functions:**
  - Data: `spaces`, `panes`, `agents`, `layout`, `shared`/`setShared` (`crew`, `crew.chat`,
    `crew.settings`, `crew.room`, `crew.marks` for pins and tab colors).
  - Programs and files: `exec`, `hc`, `readTextFile`, `watchFolder`, `knownAgents`.
  - Overlays and notices: `openOverlay`/`closeOverlay`, `notify`, `nextCommand`.
  - Commands: `space.new`, `tab.new`, `tab.select`, `tab.rename`, `tab.close`, `space.select`,
    `layout.select`, `layout.toggle`, `layout.resize`, `pane.focus`, `app.settings`,
    `app.palette`, `mod.open`.
  - Keyable commands: `crew-roster.hire|channel|routines|look|chat`.
- **Programs:**
  - The commands `pal` and `pal-room` (Python 3; `crew` and `crew-room` are aliases), plus
    `crewd`, `crew-hook` and `crew-statusline`.
  - `git` for worktrees, review and land; `claude -p` for memory reviews; `hc`; `herdr-app`;
    `systemctl --user`; `fc-list`; `xdg-open`; `wl-paste` for image paste.
- **Data:** under `~/.config/herdr-app/data/crew-*`. The owner name and bypass live in
  `crew-settings.json`.

## Watch out

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
- **The chat view must cache its layout:** laying out hundreds of messages every frame makes
  Herdr abort the render ("could not be re-rendered").
- **Herdr doesn't paint a hidden window,** so `herdr-app shot` fails off-screen.
- **Claude Code's session format isn't public:** unknown entries are skipped. Chat view and
  approvals cover Claude Code only (Codex and others stay terminal-only and un-gated).
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
- In a Claude Code channel the header shows Chat | Terminal, and Chat shows your last message as
  a right-hand bubble.
- `pal update check` answers from the repo in `pal.json`, and `pal version` prints the
  installed version.
- On a fresh setup the pals layout opens in Focus; Ctrl+Shift+M flips to Pro and back, and the
  mode and each mode's widths come back after a restart. The installer binds Ctrl+Shift+M only when
  it's free in every keys.json section (keys.json is backed up first).
