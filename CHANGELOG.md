# Changelog

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
  message can't fake a header. Writing into the message queue by hand is held for your approval.
- **The approval gate matches the command as it runs**, not as it's spelled: `npx vercel`,
  `/usr/bin/git push`, `env -i … git push` and `git -C repo push` are held like `git push`, while
  text that only mentions a command (a grep pattern, a quoted string) isn't.
- **Agent files are guarded from scripts and editors too.** Writing AGENTS.md or CLAUDE.md through
  Python, a heredoc, or a terminal editor (`ed`, `vim -es`, `sed`'s `w` …) is held for your click;
  a script that only names those files without writing them isn't.
- **Notebook paths stay in the pal's own project** (and Project Pals' own config), not anywhere
  under your projects folder.
- **Roll back covers the new hooks** (and Antigravity CLI's hooks file), leaving your own.

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
