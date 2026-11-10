# Changelog

## Unreleased (0.4.2)

- **Pal look: colour presets for your pals and their laptop screens.** Settings → Pal look. Pick
  who gets which colour: each its own (as before, and still the default), all one colour, a
  two-, three- or four-colour split down your list (8 pals are 4 + 4, 3 + 3 + 2 or 2 + 2 + 2 + 2),
  by brain, by state, by project or factory, or your theme's own colours. Pick what the laptop
  screens do, separately: the state's light (as before), the pal's colour, its contrast pair, or
  one colour for all. The dialog says how well the two read together and previews a made-up crew
  of 1, 4, 8 or 12 as you click. A colour you picked for one pal is never lost: it shows under
  Each its own. The choice is kept in your settings, which updates don't touch.

- **A welcome from your head pal.** A new install now starts with the Orchestrator: open Herdr
  and it's on Home with a short tour, seven screens of one message each. It says who it is, what a
  pal is, offers to hire your first pal on one of your project folders (it finds the brains you
  have installed and suggests folders by name and date, reading nothing inside them), shows what
  Home is for, how to talk to it, and that pushes, releases and deploys wait for your click. Skip
  it on any screen; replay it from the gear menu (Welcome tour). Installs that already have pals
  aren't interrupted. The head pal is hired on your first click, and `pal hire --god` now starts
  it in the folder with its brief. A first install also switches Herdr to the `pals` layout.

- **Pop out: a topic in its own window you can pin.** "Pop out" (the bar of Home's chat window, and
  "Pop out to a window" on a terminal's right-click) opens that topic's live terminal in a small
  desktop window of its own. On Hyprland it floats, its bar has a Pin button (every workspace;
  Omarchy's Super+O works on it too), it resizes freely with the terminal following, and its size,
  place and pin are remembered per topic. Closing the window never stops the pal.
- **The pocket pets are redrawn.** Each pal has a lit, rounded body with clearer eyes and cheeks,
  and its species has its own marks (a fox's tail tip, an owl's beak, a pup's muzzle). What it
  wears has a clean edge against the body, and the head pal's crown is white dots like the rest of
  the pet, not a yellow shape. The laptop has a real keyboard deck and a lid whose
  screen faces the pal and glows in the state's colour (code scrolls while it works; the lid is
  shut while it sleeps). Small pets (in lists, rooms and menus) show the head alone, so they stay
  sharp. Tails and raised arms are no longer cut off at the left edge, and the floating marks
  (z, sparkle, ?) are whole dots. Every pet is drawn again the first time the new version runs.

- **Factories, phase 1.** A big project can have a crew of its own: a factory, with its own
  foreman and Home. Ctrl+Shift+G (or "Factories" in the command bar) makes one and switches
  between them; a pal's right-click moves it to another factory. Once there's a second factory, a
  chip above the hero names the one you're in and counts what the others need from you, and the
  pal list and Home follow it. Your crew is the default factory: with only one, nothing changes
  and nothing new is written. `pal factory` from the command line.

- **Check for updates says what it found, and when.** About and the update dialog show GitHub's
  newest version and the time they asked ("You have 0.4.0. GitHub's newest: 0.4.1 · checked
  15:48"). Left open, they ask again every 10 minutes, so an About open since the last update no
  longer says "up to date" after a new release. The button always asks GitHub afresh. A check that
  fails says so ("Couldn't check for updates", and why) instead of showing the old answer as new,
  and every check is a line in `data/crew-update.log`.
- Pals editing the Desk's own code (`mods/crew-desk/…`) are no longer held for your approval as if
  they were writing Desk cards. Writes into the cards themselves are still held, including through
  a link that leads into them.

## 0.4.1: sleep, wake and a clean uninstall

Put a pal to sleep to free its memory and wake it where it was, take Project Pals out cleanly,
and know which Herdr versions it works with.

### Sleep and wake, in place
- **Sleep (keep topics, free RAM).** A pal's right-click or pal menu, a topic's right-click
  (Sleep this topic) or a room's (Sleep all): its agents stop, while its tabs, shells and room
  seats stay. `pal sleep <Pal|Pal#topic|#topic>`, or `--idle` for every idle pal, from the command
  line. The result comes back as a toast.
- **Wake (resume topics)** starts each topic's brain again in its own shell and resumes the
  session it had, when that session is still the one it left; otherwise it starts fresh and says
  why. `pal wake` from the command line.
- **It never stops work.** Sleep refuses, and says why, when a pal is working, asking you
  something, has text in its box, is being handed a message, or still runs work of its own (a
  build it started, a helper's children). Only that topic's agent is stopped: a dev server or
  editor in the tab is never touched, and only on this machine. Putting the head pal to sleep by
  name needs your click.
- Cards sent to an asleep pal wait on the Desk as held: asleep and are delivered once it's awake.
- **Close pal (end its space)** is the other way to rest one (it was "Put to sleep" before).
- A dead agy tab no longer looks awake: its leftover Herdr status is cleared.
- Thanks to goodboimax for the original sleep and wake (PR #4).

### Install and uninstall
- **Supported Herdr, stated and checked.** Project Pals works with Herdr 0.1.8 or newer and
  herdr-core 0.1.11 or newer, below 0.2 (tested on 0.1.8–0.1.14 and 0.1.11–0.1.19). The range is
  in `pals.json`; the installer checks both versions and warns loudly outside it, and `pal version`
  and About say so too.
- **Uninstall.** About → Uninstall, or `./install.sh --uninstall` (`--dry-run` to list,
  `--purge` to take your pals' data too). Everything the install added comes out, and your own
  `keys.json`, `~/.claude/settings.json` and `~/.gemini/config/hooks.json` go back to how they
  were. `pal uninstall` needs your click; the approval gate holds a pal's
  `./install.sh --uninstall`.
- **Uninstall is only yours, and never follows a link** (Grok's review). Every way in needs your
  click or you typing `uninstall` at your own terminal (not one with an agent in it or above it),
  checked inside the uninstaller itself; the approval gate also holds the obvious wrappers
  (`expect`, `script`, code importing the uninstaller). A symlinked Herdr home, folder or config
  file is left alone and reported, and only what the install recorded placing is removed. These
  stop mistakes, not a pal determined to get around them: pals run as you.
- **Your own hooks stay yours.** Install, Roll back and uninstall touch only hook entries that are
  exactly Project Pals' commands; a hook of yours that mentions `crew-hook` was rewritten before.
  A config file that is a symlink (a dotfiles manager's) is no longer replaced with a plain file.
- A crash in the Herdr version check is shown as a warning instead of passing silently.

### Fixed
- A card from you that a pal passes on still shows as verified from you and says who passed
  it, instead of turning "unverified"; a pass can move your words, never change them.
- Dialogs and Home wrap full sentences instead of cutting them off (the "Updated to 0.4.0" dialog
  stopped mid-sentence).
- The profile dashboard no longer shows "This view could not be rendered" the first time a pal
  shows.
- `pal peek` keeps a permission option that wraps onto a second line whole.

## 0.4.0: the Desk

Everything sent to a pal is now a card you can follow, Home is one page to come back to, and
messages reach busy pals without typing into their input box. 0.3.1 was never released: what it
held (topics, the new profile page, machines, the command bar, pal list looks) ships here too.

### The Desk
- **Every pal has a desk.** Everything sent to a pal (a tell, a question, a task, how something
  you asked went) is now a card with a status: queued, seen, working, done, held or needs you.
  You see when a pal actually got it, and its result, instead of guessing from its screen.
- **The Desk view.** The header's Desk button opens every desk at once: what waits on you, what
  has no pal yet, what's held and why, then each pal and its topics. Move, raise, lower, close or
  cancel any card with a click.
- **Drop a card from anywhere** with Ctrl+Shift+D: type it, pick a pal or topic (or leave it in
  To route), set how urgent it is, add images. Multi-line cards go on the task board too.
- **Auto finds the pal for you.** Drop a card with Auto and a quick, cheap model (Claude Haiku,
  else Antigravity CLI) picks the pal and topic it belongs to. If it isn't sure, the card waits in
  To route for you to place it, with the reason. It runs in the background helper, at most 100
  times a day; turn it off in Settings → Desk (or `pal settings desk.triage off`) to always place
  cards yourself.
- **Claude Code pals get cards without typing.** A Claude Code mod in each pal hands a card over
  mid-step while the pal works, or starts a turn when it's idle. Whatever you've half-typed in its
  box stays put, and a band above its prompt shows the topic's open cards (`/desk` lists them).
  It's loaded only in pals (with `--plugin-dir`), never in your other Claude Code sessions.
- **Codex pals can check their desk** with a `desk_check` tool (and close cards with
  `desk_done`), given to them on their own command line. They don't get cards mid-step: they're
  typed in when the pal is idle.
- **`pal desk`** for pals (and you, in a shell): their cards, `take`, `done "result"`, `reply`,
  `block`, `pass`, `send`, `sent`. The shipped `pal-desk` skill teaches every pal how to use it.
- **Tasks and their cards stay in step.** Finishing a task's card finishes the task, and the Tasks
  dialog shows whether each new task has reached its pal yet ("not seen yet", "seen", or why it's
  held).
- **Settings → Desk** shows today's numbers and lets you turn triage off, change its daily cap,
  when the head pal hears about held or quiet cards, and when closed cards are archived.
- **Cards are plain files** in `data/crew-desk`, readable in any editor. You can fix a card's title
  or text by hand; its status and who sent it can't be changed that way.

### Home
- **One page to come back to.** Click your head pal (or press Ctrl+Shift+H): one list of
  everything that needs you, oldest first, with one-click Approve, Decline and answers, under one
  line saying who's working and what shipped today; "All caught up" when there's nothing.
  "What happened today" opens a drawer with what finished, got installed or was linked, who's
  working, releases, and what you parked. Your head pal keeps its decisions, logins and links
  there with `pal home`.
- **Decide one thing at a time.** While anything needs you, Home shows one item full screen: who's
  asking, the context (links, images, the command or diff), what each option does, and the asker's
  recommendation with its why. Pick with a click or 1-9, Enter takes the recommendation, C opens a
  chat with the asking pal's terminal, J/K move, L puts it off, Esc shows the list.
- **Your head pal is one key away.** T (or "Talk to <head pal>") opens its terminal from Home, and
  "Message <head pal>" sits under All caught up.

### MUSE, your idea partner
- Hire it from the hire dialog (Idea partner) or with `pal hire --partner`, and riff with it in its
  #ideas topic: half-formed ideas, screenshots. It asks sharp questions and turns them into clean
  card drafts with the right pal suggested. Nothing goes out until you click Send (or Edit, or
  Discard) in the Desk view's Drafts; then it's your own card. MUSE is a Claude Code pal on Sonnet.

### Messages reach busy pals
- **Messages between steps.** A Claude Code or Antigravity CLI pal gets messages from other pals
  while it works, between its tool calls, and as its turn ends, so a draft in its input box no
  longer holds them up. Idle pals and other brains are still typed to, carefully. A pal with
  nothing waiting pays nothing per step: the hooks start only when something is queued.
- **`pal ask` reaches busy pals** mid-turn, and replies are read from the pal's session file
  instead of its screen.
- **No grey suggestions in pals' input boxes.** Claude Code pals start with prompt suggestions
  off (on their own command line; your other Claude Code sessions keep them), so a suggestion
  can't pass for unsent typing and hold messages.
- **Antigravity CLI (`agy`) is a native brain:** hire it, pick its model, its hooks, the approval
  gate and shared skills.

### Safer
- **Only you speak as you.** A message headed "[from you]" now needs your click in Project Pals
  (Tasks, Review, Home). From a plain shell it says "not verified as you", and text inside a
  message can't fake a header. A message file Project Pals didn't write itself (one a script put in
  the queue) reaches the pal labelled "unverified", its header quoted, never as yours.
- **Your settings, updates and landings need your click too.** Changing settings (owner, head pal,
  bypass, Settings → Desk), installing or rolling back an update, landing a branch, renaming pals
  and pruning the Desk's archive go through Project Pals' buttons. A pal, or a terminal Herdr doesn't
  know, is refused. Reading settings still works from any shell.
- **What the approval gate holds** in Claude Code and Antigravity CLI pals, for your click in the
  Inbox: `git push`, package publishes, GitHub releases, PR merges and posts, deploys (fly, vercel
  --prod, netlify --prod, wrangler, kubectl apply/delete), mail and chat webhooks, `pal land`, a
  repo's release script, edits of a project's AGENTS.md or CLAUDE.md, and writes into Project Pals'
  message queue, your click tokens and the Desk's cards. It matches the command as it runs, not as
  it's spelled: behind `npx`, a full path, `env` or `git -C`; inside `sh -c`, a heredoc,
  here-string or `echo` piped to a shell, or a string Python, Node, Perl, Ruby or PHP runs (`os.system`,
  `subprocess`, `child_process`, `system`, backticks); and file writes from those languages
  (`open(…, "w")`, `mode="w"`, `write_text`, `writeFileSync` …) or an editor (`ed`, `vim -es`,
  `code` …). Text that only mentions a command (a grep pattern, a quoted string, `--help`) isn't
  held. If the gate itself fails, the command is stopped, not let through.
- **The gate catches mistakes, not a pal set on getting around it.** A pal runs as you: one
  determined to could build a command from pieces, write a script first and run it later, or edit
  these files directly. Antigravity CLI pals are gated on `run_command` only: their own file-edit
  tools aren't checked yet, so an agy pal's edit of AGENTS.md isn't held.
- **Notebook paths stay in the pal's own project** (and Project Pals' own config), not anywhere
  under your projects folder, however the path is spelled (`~`, `$HOME`, `${HOME}`).
- **Roll back puts the previous version back cleanly:** library files the newer version added go,
  and so do its hooks (Antigravity CLI's too), with no empty hook lists left behind. Your own hooks
  stay. A first install has nothing to roll back to.

### Topics, profiles and the sidebar
- **Channels are now topics.** A pal's tabs are the topics it's working on, and everything you
  see says so: the hero's Topics list and "+ New topic", the picker, the right-click menu, the
  command bar, dialogs, the profile and Vault panels, the pal list ("3 topics"), help text and
  the docs. The `#` stays, and so does `Pal#topic`. `pal topic` is the new command;
  `pal channel` and `--channel` still work, so older scripts and pals don't break.
- **A new profile page.** The pal's pet on a stage lit in its state's colour, its state line,
  name and mission, a "Give <pal> a task…" box, and four cards for the week: Shipped, In motion,
  Needs you, Hiccups. In Full, the shown topic's live terminal sits beside it as a resizable
  column.
- **Which computer a pal works on.** The profile shows the pal's machine (laptop, desktop or
  server, how Herdr reaches it, connected or not), and **Change machine…** moves it: pick or add a
  machine, and the project folder is checked there (or cloned there).
- **The command bar.** The header's search field (or Ctrl+Shift+Space) searches pals, topics,
  open tasks, Vault notes and every command.
- **Inbox in the hero.** The hero's first quick action is Inbox: it opens the sidebar's Inbox and
  shows how many things need you, in amber. New topic is the last row of the hero's list, in the
  command bar and in the right-click menu.
- **New topics on a sleeping pal start its brain.** `pal topic` on a pal with no agent running
  used to open a plain shell. Now pals remember their brain while awake, and a topic (or waking a
  pal) always starts one: its own, else the asking pal's, else Claude Code, and it says
  which when it had to guess. `pal topic` tells you if the
  agent didn't come up.
- **Pick your working indicator.** Project Pals settings → Working indicator: the classic dot or
  one of 30 small animations (pixel spinners, shaded spheres, ASCII globes), with live previews.
- **Pick how your pals are listed.** Project Pals settings → Pal list style: keep the big pets, or
  pick one of nine compact looks with smaller pets, so the full name, the project folder, the
  branch, the brain and topic and task counts fit. The dialog previews each one with your own
  pals; a click applies it.
- **Trees.** In any look, a pal that's working or needs you shows its live topics underneath (at
  most four), each one a click away. On by default; fold or unfold them all from the tree button
  in the Pals header, or in Pal list style.
- **Working wins.** A pal shows Working while any of its topics works; Done only when nothing runs
  (Needs you still comes first).
- **Topic colours show** as a small bar before each #topic in the hero's list, the Trees rows and
  the topic picker.
- **Fold the hero's topics** with the chevron on its Topics header ("Topics 18 · 3 working").
- **Round scrollbars.** Everything Project Pals scrolls has a slim pill-shaped thumb, quiet until
  you hover or drag it.
- Pal rows no longer show last-activity times, so the name and state line get the width.

### Fixed
- A message waiting for a topic whose terminal closed used to be dropped with it. Its card now
  waits as held and goes out once that topic has an agent running again.
- A room seat follows its pal when the pal is renamed.
- Home's Installed line shows the build even when Project Pals was installed from an export
  without `.git`.

### Thanks
**goodboimax** for native Antigravity CLI support and the hook delivery the Desk builds on
(PR #1, #2 and #3), landed here with his commits as he wrote them.

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
