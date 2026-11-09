# Profiles: every pal has a profile, every pal has a mission

**Status:** proposal for DeNon to pick from. Nothing is built. Branch `crew/profiles`, 2026-11-08.
Revised the same day for DeNon's decision (relayed by Orca): the profiles live in a **right-side
panel**, hidden until you open one.
**Board:** `PROFILE · Pal + Mission` (see "The board" at the end). It's drawn as `docs/profiles/board.html`
and `board.png` for now, because Paper's app wasn't running.

Every pal gets a **profile**: who it is, what it's on, what it has done, what it remembers.
Every pal also gets a **mission**, with a profile of its own. The mission profile is the hub for
the pal's **project brain**: a few markdown files (mission, decisions, change log, map, notes),
plus a tool for the project's `AGENTS.md` / `CLAUDE.md`.

## Decided, and still to pick

**Decided by DeNon** (relayed by Orca, 2026-11-08):

- **P1, where it lives:** a **right-side panel**, hidden by default. It slides out only when you
  open a profile: from the hero's name, a Profile quick action, the right-click menu, or a
  shortcut. Esc, its ×, or the same trigger again closes it. It's not a permanent rail
  (DeNon removed that from Focus on purpose): closed, the terminal has the full width.
  Section 5 designs it.
- **The ways in** are those four. Which shortcut key is still a pick (P2).
- **The pal's profile is a dashboard** (DeNon, relayed by Orca, after the panel decision). It has:
  the pal's live topics; a task board of what its topics are on and heading for; and a
  **mini terminal on the pal's real, live session**, so DeNon can prompt the pal from there.
  Identity, mission and brain, the AGENTS.md tool and Memory stay. Section 1b designs it.
- **Three more (DeNon, relayed by Orca):** the header's pal chip becomes the way into everything
  about the agent and its project (section 1c); every pal keeps a daily **Notebook** of its
  work, hiccups and lessons (section 3b); and a **Dream loop** reads the notebooks and proposes
  improvements that DeNon approves (section 3c).

**To pick.** ★ is my recommendation; the sections below say why. P10–P12 are three
recommendations of Orca's that DeNon hasn't approved; they're options here, not yeses.

| # | Decision | Options | ★ |
|---|---|---|---|
| P2 | The panel's shortcut | `Ctrl+Shift+I` (free in keys.json today) · another | `Ctrl+Shift+I` |
| P3 | Where the mission and brain are stored | **A** pal data (`data/crew-memory/<pal>/brain/`) · **B** the project (`<project>/.pals/`) · **C** A by default, B per pal | **C** |
| P4 | Who writes the mission | DeNon only, the pal proposes · both freely | DeNon only (the pal keeps Focus and the logs) |
| P5 | What the SessionStart primer carries | mission summary only · the whole brain | summary only (≤ 1,200 characters) |
| P6 | Can a pal edit `AGENTS.md` / `CLAUDE.md` itself? | yes, as today · held for approval (a new `agents-file` gate rule) · proposals only | held, plus proposals |
| P7 | The deep lint (conflicting rules) | off · a button that asks first (sends the files to Claude) | a button |
| P8 | What "N need you" counts (if P12 is a yes) | the Inbox count · only what needs a decision (asks, approvals, stuck, trust) | needs a decision |
| P9 | The panel pushes or covers | **push**: the terminal narrows while it's open · **cover**: it slides over the terminal's right side | **push** |
| P10 | **Review changes** in a worktree topic's right-click | yes · no | yes |
| P11 | **The pal's memory** in its profile (pinned note, MEMORY.md, recent notes, Remember) | yes · no | yes |
| P12 | **"N need you"** in the status bar | yes · no | yes |
| P13 | How the dashboard gets its room | **A** the panel's two sizes: Side (420, beside the terminal) and **Full** (it takes over the work area until closed) · **B** one wide panel (720) beside the terminal · **C** everything inside the 420 panel | **A**, the dashboard opening Full |
| P14 | Which topic the mini terminal shows first | the topic you were looking at · the lead topic · the most recently active | the one you were looking at |
| P16 | Topics in the pal chip menu | none (the `# topic ▾` picker and the hero list cover them) · one compact line ("4 topics · 1 asks you") | none |
| P17 | How the notebook gets written | **A** the pal writes it, prompted by its primer and by a few nudges (task done, blocked, after being stuck) · **B** A, plus a cheap model drafting entries from topic screens at session end | **A** |
| P18 | Lessons in the SessionStart primer | the pal's last 7 days of lessons (at most 400 characters) · none | the last 7 days |
| P19 | Who dreams | **A** Orca, as a routine in its topic · **B** a headless "dreamer" (`claude -p`) run by crewd · **C** crewd does the cheap summary, then hands a short digest to Orca, which drafts the proposals | **C** |
| P20 | Dream cadence and cap | nightly at 03:30 + on demand, at most 3 proposals a night · weekly | nightly, 3 a night |
| P21 | How long a fix is watched for the hiccup coming back | 14 days · 30 days | 14 days |
| P15 | The task board's columns | **Now · Next · Blocked · Done** (tasks plus each topic's live activity) · the board's own statuses (Open · Claimed · Blocked · Done) | Now · Next · Blocked · Done |

## 0. What's already there

These all exist and the design builds on them; nothing here replaces them.

| Piece | Where it lives today | Used for |
|---|---|---|
| Pal record | shared `crew.bots[]`: `name, role, harness, harnessName, machine, folder, space, hired, hiredBy, god, briefs{tab→text}, names{tab→#name}, categories, worktrees{#ch→{path, branch}}, memory` (the pinned note), `pet`, `brains` | identity |
| Look | `crew-look` dialog, the record's `pet {species, acc, eyes}`, colour | pet and colour |
| Memory | `data/crew-memory/<slug>/MEMORY.md` (curated), `notes/<date>.md` (`pal remember`), `USER.md` (shared facts about DeNon) | what the pal knows |
| SessionStart primer | `bin/crew-hook` `session_start`: `PRIMER` + "You are X, in #ch" + `memory_text()` (USER.md, pinned, MEMORY.md, the last 2 days of notes, capped at 6,000 characters) + open tasks | how a session starts |
| Tasks | `data/crew-tasks.json` (`status, assignee, claimed_by, result, updated`) | stats, "done" |
| Routines | `data/crew-routines.json` | the profile's routines |
| Hero quick actions | `crew-roster` `heroCard`: + Topic, Tell, Tasks (count), moon | entry points |
| Review | `crew-review` dialog (props `space`, `tab`): a worktree branch's diff, line comments, Land | Review changes |
| Status bar | `crew-status`: "N working", 5h/week usage, version | "N need you" |
| Rename | `pal renamed` moves `crew-memory/<old>` to `<new>` | the brain moves with it |

What the two pieces of prior art add:

- **init-project-brain** (DeNon's skill, the MEG layout): a lean `CLAUDE.md` index ("I need X →
  read Y"), a `_Brain/PROJECT_BRAIN.md` holding current status, change log, built, next actions,
  decisions and a file map, and small single-purpose rule files. Its lesson: one lean index, one
  persistent status file, small topic files read on demand.
- **MonoCode Monos** (`~/Projects/pals-native/monocode/SPIKE.md` §9): `SOUL.md` (the user's
  standing instructions, edited only with a hash check) and `MEMORY.md` (dated facts, budgeted to
  200 lines / 24 KB, secrets redacted, old facts archived, topic notes read on demand). Files live
  in the app's data, never in a repo.

Projects as they stand, which shape the `AGENTS.md` tool:

| Project | AGENTS.md | CLAUDE.md | The tool would say |
|---|---|---|---|
| hello-lock | 514 lines | 13 lines, says "Read `AGENTS.md`" in prose, no `@` import | Long; pointer is prose, not an import |
| omarchy-theme-studio | 336 lines | 13 lines, one `@` import | Long-ish; pointer fine |
| softly-promo | 109 lines | 109 lines, identical to AGENTS.md | Duplicate: make CLAUDE.md the pointer |
| project-pals | 90 lines | none | No pointer (info) |
| omarchy-customizations, omarchy-tricky-tiles, denonomods | 13–29 lines | none | No pointer (info) |

(Observed in this session: Claude Code loaded this worktree's `AGENTS.md` with no `CLAUDE.md`
present, so a missing pointer is **info**, not a warning. The pointer still matters for tools and
older versions that read only `CLAUDE.md`, and it's the one place Claude-only lines go.)

## 1. The pal profile

### What it holds

What the profile knows about the pal. In Full it's the dashboard's header strip and left
column (section 1b); in Side (420 px) it's the compact Profile tab, one column, top to bottom:

1. **Identity band.** The pet (96 px wide, over the soft aura, its live state) on the left; the
   name (16/600 #EDEDED), the role (one line, #C8C8C8, click to edit: the record's `role`) and
   the state word with its 7 px dot ("Working · 4m") on the right.
2. **Facts**, a hairline list of 30 px rows: label in 11 px mono #6A6A6C (72 px column), value in
   13 px #C8C8C8.
   - Brain: `Claude Code · opus` (harness, plus the `--model` from its command line when there is one)
   - Folder: `~/Projects/project-pals` (mono; click copies it)
   - Machine: `this computer`, or the machine's name
   - Branch: the lead topic's branch
   - Pet: `kit · headphones`, and a colour swatch; both open `crew-look`
   - Hired: `Nov 5 · by Orca`
3. **Stats**, four cells in a hairline-split 2 × 2 grid (value 18/600, label 11 px #808082):
   **Topics** (count), **Tasks done** (last 30 days, from `crew-tasks.json` where
   `claimed_by`/`assignee` is this pal and `status` is done), **Open** (its open tasks),
   **Last active** (the newest `changed_at` across its tabs: "2m ago", "asleep 3d").
4. **Topics.** One 44 px row each, on two lines: its status dot, `#name` and (on worktree
   topics) a **Review** button on the first line; the first line of its brief (the record's
   `briefs`) and a `worktree · <branch>` tag under it. Click a row to show that topic; the
   panel stays open.
5. **Memory** (P11, awaiting DeNon): see below.
6. **Routines**: this pal's routines, one row each (`weekdays 09:00 · daily standup`, next run).
7. **Footer actions**: Tell, + Topic, Customize look, Put to sleep. The same actions as the
   hero, so the profile never strands you.

### Memory, inside the profile (P11: Orca's recommendation, not yet approved)

- **Pinned note**: the record's `memory` field, an editable 3-line box ("Pinned by DeNon").
  It already rides along in every SessionStart, so this just makes it visible and editable.
- **What it remembers**: `MEMORY.md` (the curated part) as markdown, then the last 2 days of
  `notes/`, newest first, each line with its time and `#topic`. These are the same files
  `memory_text()` feeds the primer, so what you see here is what the pal starts with.
- A size line: "4,200 of 6,000 characters it starts with". At the cap, the oldest notes are the
  ones being cut, and the line turns amber. (This pal is there today: `memory_text()` returns
  exactly 6,000 characters for it, so its oldest notes already fall off.)
- Actions: **Remember…** (one line, saved as `pal remember` from DeNon), **Edit MEMORY.md**
  (the editor, saved with a hash check), **Open folder**. **Forget** is on hover per line and
  asks first. It removes the line from that day's note, with a backup.
- `USER.md` (shared by every pal) shows as one read-only row: "Also knows 33 facts about you"
  (today's count).

### How you open it

DeNon's four ways in. Opening and closing are section 5.

## 1b. The profile as a dashboard

DeNon's ask: each pal's profile is a **dashboard** of its topics, what they're doing and
heading for, and a live terminal to prompt the pal. The Profile tab becomes that dashboard.
The identity, facts and Memory above are its left column.

### Where it gets its room (P13)

A board of four columns and a terminal you can actually use (Claude Code wants 60+ columns)
need about 1,100 px. The 420 px panel can't hold that, and a fixed 720 px panel would leave the
topic's terminal 416 px wide at 1440, which is too narrow to use.

| | **A · Two sizes, dashboard Full** ★ | **B · One wide panel** | **C · All in 420** |
|---|---|---|---|
| Shape | the panel has **Side** (420, beside the terminal) and **Full** (it takes the whole work area; the sidebar stays) | the panel is 720 px, pushing the terminal | the dashboard stacked in the 420 panel |
| At 1440 wide | Full: 1,136 px for the dashboard; Side: 716 px left for the terminal | 416 px left for the terminal | 716 px for the terminal |
| The mini terminal | 780 × 300 px, about 90 columns | 720 px, but the topic terminal is squeezed beside it | 420 px, about 48 columns: Claude Code wraps badly |
| The task board | four columns side by side | four narrow columns | four stacked lists |

**Why A.** It keeps DeNon's panel: one place, the same triggers, the same close, and the terminal
at full width when it's closed. It also gives the dashboard the room it needs only while it's
open. **Full** hides the `work` column (`layout.hide {id: "work"}`) and lets the panel fill the row;
**Side** shows it again at the remembered width. So it's a takeover of the work area, but owned by
the panel, and closing it brings back exactly the topic you were on.

- **The Profile tab opens Full.** Mission, Brain and AGENTS.md open in Side, beside the terminal,
  which is how you'd read a mission or fix a CLAUDE.md while watching the pal work.
- **A ⤢ / ⤡ button** in the panel's header switches any tab between Side and Full, and each tab
  remembers its own size. (This replaces the AGENTS.md tab's Wider button.)
- **The Profile tab in Side** is a compact dashboard: identity, the topic list, the Now column as
  a list, and **Open dashboard ⤢**. No mini terminal: at 420 px it's not worth it (C's problem).

### The dashboard, in Full

```
┌ sidebar 304 ┬─ 52: [pet] Project Pals - Herdr Mod  Profile ‖ Mission · Brain · AGENTS.md        ⤡ Side   × ┐
│             ├─ 72: pet · name · role · ● Working 4m │ Claude Code · opus · ~/Projects/project-pals │ Mission … ┤
│ hero        ├─ left 340 ────────────┬─ right ──────────────────────────────────────────────────────────────┤
│             │ CHANNELS            4 │ TASK BOARD · toward: Profiles proposal, then the release notes        │
│             │ ● #profiles   4m      │ NOW 2          NEXT 1          BLOCKED 1          DONE · 7 DAYS 5    │
│ pal list    │   Writing the panel…  │ ┌──────────┐  ┌──────────┐    ┌──────────┐       ┌──────────┐       │
│             │   crew/profiles  [Rev]│ │#profiles │  │T15 Write │    │#integrate│       │T13 Inbox │       │
│             │ ● #integrate  asks 2m │ │activity  │  │release … │    │asks you: │       │spacing …  │       │
│             │ ○ #cli-mods   idle 4h │ └──────────┘  └──────────┘    └──────────┘       └──────────┘       │
│             │ ◌ #general    no agent│ ── TERMINAL · #profiles ▾ · live · Claude Code ─── Open topic ↗ ──  │
│             │ MEMORY (P11)          │ the pal's real terminal (Herdr terminal block), 300 px, type here      │
│             │ pinned · 3 notes · …  │                                                                        │
└─────────────┴───────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

- **Header strip (72 px):** the pet (60 × 47), the name, role and state; then the facts on one
  line (brain · folder · machine · hired); then the mission's statement with "Done when 0 of 2".
  Clicking that opens the Mission tab.
- **Topics (left, 340 px):** every topic of the pal, one 52 px row each. A row shows:
  - the live state: a blue dot for working, amber for asks you, mint for done, grey for idle, and
    a hollow dot (#56565A) for no agent;
  - `#name`, and the time in that state ("4m");
  - what it's on: the agent's terminal title, as in the pal rows today;
  - its branch, or `worktree · <branch>`, with Review on worktree topics (P10).

  Clicking a row points the mini terminal at that topic. **Open topic ↗**, on hover, closes
  the dashboard and shows the topic in the main area.
- **Memory (left, under Topics, P11):** the pinned note and the latest 3 notes, with
  Remember… and "All memory", which opens it in Side.
- **Task board (right, top, P15):** four columns. The header says what the board is heading
  for, the mission's **Focus**, so the board reads relative to this project.
  - **Now:** tasks this pal has claimed, plus a card for each **working topic** that has no
    claimed task, showing its live activity (the terminal title). Most work never reaches the task
    board: today the board has 13 done, 1 cancelled and none open, while this pal has 4
    topics. So without activity cards, Now would usually be empty.
  - **Next:** open tasks assigned to this pal. Ready ones come first; ones waiting on others show
    "after T3".
  - **Blocked:** blocked tasks with their reason, plus topics that ask you or look stuck
    (crewd's 15-minute check). Each card says what it needs from DeNon.
  - **Done · 7 days:** done tasks with their result line, newest first.
  - Every card carries its topic chip: tasks claimed as `Pal#topic` (all of this pal's do,
    e.g. `Project Pals - Herdr Mod#release-prep`) link to that topic, and an activity card *is* a
    topic. Clicking a chip points the mini terminal there; clicking a task expands it (details,
    notes, Mark done, Reopen), as the sidebar's Tasks list does.
  - Cards are 64 px, r6, #161617 with a #1E1E20 hairline; a column scrolls past 4 cards.
- **The mini terminal (right, bottom, 300 px, its top edge draggable, P14):**
  - It's the **real session**: a Herdr terminal block showing the topic's own agent terminal
    (the one `lead()` picks), not a copy or a log. Click it and type, and the keys go to that
    session exactly as they would in the main area; its scrollback is the terminal's own.
  - A 32 px bar over it: `TERMINAL · #profiles ▾` (a picker of the pal's topics), a live dot,
    the program (Claude Code), what it's doing ("working 4m"), and **Open topic ↗**.
  - It starts on the topic you were looking at when you opened the dashboard (P14), else the
    lead topic.
  - A topic with no agent shows "#general has no agent running", with a **Wake** button (the
    sidebar's wake), instead of an empty terminal.

### How the mini terminal is built (to verify in the build)

Herdr can't put a terminal inside a mod's own drawing. A live terminal only shows in a layout block
(`{ "terminal": "t7" }` or `{ "agent": "focused" }`). So in Full, the panel is a small layout
tree, not one mod:

```
profile (column)                      ← the panel; Side = 420 px, Full = fills the row (work hidden)
├ profile-head    mod crew-profile {part: "head"}      52 px: name, tabs, ⤢, ×
└ profile-body    stack
  ├ profile-dash  column                               the dashboard (Full)
  │ ├ dash-top    mod crew-profile {part: "top"}       72 px
  │ └ dash-main   row
  │   ├ dash-left mod crew-profile {part: "left"}      340 px: topics, memory
  │   └ dash-right column
  │     ├ dash-board mod crew-profile {part: "board"}  the task board
  │     ├ dash-tbar  mod crew-profile {part: "tbar"}   32 px: the terminal's bar
  │     └ dash-term  { "agent": "focused" }            300 px: the live session
  └ profile-doc   mod crew-profile {part: "doc"}       Side, and the other tabs
```

- **Pointing it at a topic:** ★ `{ "agent": "focused" }` plus `agent.focus {terminal}`. Herdr
  documents that this block shows "the one chosen with `agent.focus`". The pals layout has no
  other agent block, so nothing else moves. To verify: that `agent.focus` doesn't also
  switch the shown tab. Fallback: `layout.set` rewriting only `dash-term`'s
  `{ "terminal": "<address>" }` (pals.json is our own layout, so this is allowed).
- **One session, one size.** A terminal has one size. If it were visible in the main area and the
  mini terminal at once, the two views would fight. Full hides the `work` column, so the
  dashboard's view is the only visible one. Closing the dashboard gives the terminal back
  its main-area size, and Claude Code redraws. To verify: a hidden block doesn't keep sizing the
  terminal.
- **Esc in the mini terminal is the program's** (it interrupts Claude Code), as in the main area.
  The panel closes with ×, the trigger again, Ctrl+Shift+I, or Esc when the keyboard is
  on the dashboard's own parts, never from inside the terminal.
- **Several mod blocks, one mod:** `crew-profile` copies are told their `part` by props and share
  state through shared `crew.panel`, the same way the roster and header share `crew.*` today.

## 1c. The pal chip menu

The header's pal chip (centred, the pet and the pal's name) opens `crew-pick` today: the pal's
topics. The `# topic ▾` picker on the left opens the same list, and the hero lists the topics
too. So the chip becomes the menu for **the agent and its project**, and topics stay out (P16).

A popup under the chip: 300 px, the `crew-menu` look (r6, #141415, a #2C2C2F hairline,
28 px rows, a 12 px icon and a mono key hint on the right):

| Group | Item | What it opens |
|---|---|---|
| The pal | **Profile** | the panel's Profile tab (the dashboard, Full) |
| | **Notebook** | the Notebook tab, on today's entry |
| | **Memory** | the Profile tab in Side, scrolled to Memory (P11) |
| | **Tasks** | the Profile tab Full, with the task board in view |
| The project | **Mission** | the Mission tab |
| | **Brain** | the Brain tab |
| | **AGENTS.md** | the AGENTS.md tab (with its lint badge on the row) |
| | **Review changes** | `crew-review`, only on a worktree topic (P10) |
| | **Open folder** | the pal's folder in the file manager (`xdg-open`) |
| Actions | **Tell…** | the `crew-tell` dialog |
| | **Put to sleep** / **Wake** | as the hero's moon and the pal menu |

- A one-line header in the popup: the pal's name, and "Claude Code · ~/Projects/project-pals" in
  11 px mono #6A6A6C.
- Keys: ↑/↓, Enter, Esc, like `crew-pick`. The panel's own shortcut (P2) still opens Profile.
- When the panel is already open on a tab, that row is marked, and choosing it closes the panel
  (the "same trigger closes" rule).
- The chip gets a small ▾ after the name, so it reads as a menu.
- The right-click pal menu keeps its own items (pin, rename, look, topic, sleep) and gains
  Profile / Mission at the top, as in section 5. The chip menu is the fuller one.

## 2. The mission

### What it is

A short statement of what this pal is for, then the goals, the current focus and done-when.
One small markdown file, `mission.md`, so a person, a pal and the UI can all read it:

```markdown
# Mission
Get Project Pals ready to announce to the Herdr community.

## Goals
- [x] Focus layout matches the design system
- [ ] Profiles and missions for every pal
- [ ] A herdr.dev listing with a preview

## Focus
Profiles proposal (#profiles), then the release notes.

## Done when
- [ ] A fresh install on a clean machine passes every Done-when in RECIPE.md
- [ ] DeNon has posted it to the Herdr community
```

- The **statement** is the text before the first `##`: one or two sentences, at most 200 characters.
- **Goals** and **Done when** are checklists. Ticking one in the UI writes the file.
- **Focus** is one line. It's the part that changes week to week.
- At most 60 lines. Anything longer belongs in a brain note.

How it relates to what's there: the record's **role** is the pal's job title ("Maintainer of the
Project Pals Herdr mod"); the **mission** is why it exists and when it's done; a topic's
**brief** is that one topic's job. The profile shows all three, and none of them is copied
into the others.

### Where it's stored (P3)

| | **A · Pal data** | **B · The project** | **C · A, or B per pal** ★ |
|---|---|---|---|
| Path | `data/crew-memory/<pal>/brain/mission.md` | `<project>/.pals/mission.md` | A by default; a per-pal setting "Brain lives in: Pal data / This project" |
| Travels with the repo | no | yes, versioned | per pal |
| Worktree topics | one mission for all topics | each branch has its own copy, so they drift | per pal |
| The pal updates it | freely (it's Project Pals' data) | it's a project file write | per pal |
| Shows up in PRs / diffs | never | every change | per pal |
| Follows a rename | yes (`pal renamed` already moves the folder) | not affected | per pal |

**Why C.** For a code repo, pal data is right: one mission across every topic and worktree, no
churn in commits, and the pal can keep Focus and the change log current without anyone clicking.
For a MEG-style project, where the folder *is* the Obsidian vault, DeNon wants the brain in the
project where Obsidian sees it. So the default is A, and "This project" is one setting away.
In-project mode writes under `<project>/.pals/` only (plus reading an existing `_Brain/`, below).

### How a pal reads it (P5)

The SessionStart hook adds one block after "You are X, in #ch", before the memory:

```
Your mission: Get Project Pals ready to announce to the Herdr community.
Focus: Profiles proposal (#profiles), then the release notes.
Done when: (1 of 2) A fresh install on a clean machine passes … · DeNon has posted it …
Your brain: ~/.config/herdr-app/data/crew-memory/project-pals-herdr-mod/brain/
  (pal brain show [file], pal brain log "…", pal brain decide "…", pal mission focus "…")
Latest changes: 11-08 Hero topics scroll after 4 rows · 11-08 Pro view removed · …
```

- At most 1,200 characters, built from `mission.md` and the last 3 change-log lines. It's never
  the whole brain: the rest is read on demand, the way init-project-brain's index works.
- A pal with no mission gets one line: "No mission yet. Ask DeNon, or propose one with
  `pal mission propose`."
- It counts toward the same budget as memory. If both don't fit, memory notes are cut first,
  never the mission.

## 3. The project brain

### What's in it

A folder of markdown, the mission plus four kinds of file, each small and single-purpose (the
init-project-brain lesson):

| File | Holds | Who writes it |
|---|---|---|
| `mission.md` | statement, goals, focus, done-when | DeNon (the statement, goals and done-when); the pal (Focus, and ticking goals) |
| `decisions.md` | dated decisions: what, why, who decided ("DeNon, 11-08: Focus is the only layout. Pro removed.") | the pal records them as they happen; DeNon edits |
| `changelog.md` | one line per change, newest first, with the topic | the pal (`pal brain log`); crewd adds one line when a task is marked done |
| `map.md` | a file map ("I need X → read Y"), **only if AGENTS.md has none** | the pal |
| `notes/*.md` | topic notes (research, a design study), read on demand | the pal and DeNon |

Kept small: `changelog.md` holds 200 lines, and older ones roll into `changelog-2026.md`.
`decisions.md` is never trimmed, since decisions are what the next session most needs.

### Who writes it (P4)

- **The pal keeps it current**, with commands, never by rewriting the files wholesale:
  `pal brain log "…"`, `pal brain decide "…" --why "…"`, `pal mission focus "…"`,
  `pal mission tick "…"`, `pal brain note <topic> "…"`. Each appends or changes one line.
- **DeNon edits anything** from the mission profile. Saves are hash-checked (`writeTextFile`'s
  `expected`, as SOUL.md does), so a pal's append and DeNon's edit can't silently overwrite each other.
  On a clash, DeNon sees both versions.
- **The statement, goals and done-when are DeNon's.** A pal can only propose them:
  `pal mission propose -F draft.md` puts a card in the Inbox ("Pal proposes a mission",
  View / Decline / Accept). Accept writes the file, from DeNon's click.
- **crewd helps a little:** a `pal task done` adds a change-log line ("T12 done: …"), and the
  nightly memory distill notes "Focus unchanged for 7 days while 14 changes landed" in the
  head pal's feed. It never rewrites the mission.

### How it avoids duplicating AGENTS.md / CLAUDE.md

One job per file:

| File | Its one job | Changes | Who reads it |
|---|---|---|---|
| `AGENTS.md` (in the repo) | **how to work here**: layout, commands, testing, release, rules | rarely | every agent and tool, loaded by the harness |
| `CLAUDE.md` (in the repo) | `@AGENTS.md`, plus Claude-only lines | almost never | Claude Code |
| The brain | **why, now, what changed**: mission, focus, decisions, change log | daily | this pal, by the primer and on demand |
| Memory | facts the pal learned along the way | constantly, mostly automatic | this pal, by the primer |

The rules that keep it that way:

- **The brain holds no rules.** When a decision turns into a rule ("never edit the installed
  copies of lib/"), the pal proposes it for `AGENTS.md` through the tool (below), and
  `decisions.md` links to it rather than restating it.
- **No second file map.** If `AGENTS.md` has a layout table (this repo's does), the hub shows
  that section as the map, read-only and linked. `map.md` exists only when AGENTS.md has none.
- **Next actions are tasks.** init-project-brain's "Next Actions" list is the task board here. The
  mission's goals are the long view; the board is the work, and the brain never copies it.
- **The primer doesn't repeat AGENTS.md.** The harness already loads it.
- **The lint checks it:** a brain line that's 80% the same as an AGENTS.md line gets flagged
  "Duplicate of AGENTS.md:42".

**Adopting an existing brain.** If a project already has `_Brain/PROJECT_BRAIN.md` (the MEG
layout), the hub **links to it in place** instead of copying it: its sections show under the same
headings (Current Status → Focus, Change Log → Change log, Decisions → Decisions), and edits go to
that file, with DeNon's click, since it's a project file. "Split into pal brain files" is an
optional one-time action, with a preview.

## 3b. The notebook: each pal's daily journal

Every pal keeps a journal of **how the work went**, written by the pal in its own words. DeNon
reads it in the panel. The part that matters most is the **hiccups**: where it got stuck, what
slowed it, what it would have needed (a tool, a skill, a rule, better context), and what it
learned. Those are what the Dream loop (3c) feeds on.

### How it differs from the other files

| | Holds | Written |
|---|---|---|
| Memory (`pal remember`) | facts to carry into the next session | as they come up |
| Change log (brain) | what changed in the project | per change |
| **Notebook** | how the work went: hiccups, what was missing, lessons | at the end of a piece of work, or at a hiccup |

A notebook entry links to the task or change-log line it's about rather than repeating it ("did:
T16, see change log").

### Where it lives

`data/crew-memory/<pal>/notebook/YYYY-MM-DD.md`: one file per day, in pal data (never the
project). It sits inside the memory folder, so `pal renamed` already carries it. All of a pal's
topics write to the same day file. Files are kept 90 days; older days roll into
`notebook/YYYY-MM.md` as the month's lessons only.

### The entry template

```markdown
### 14:32 · #profiles · T16 · 40m
- did: drew the dashboard frame (board.html, frame 2)
- hiccup: Paper's MCP was down; couldn't draw in Paper  (cost: ~10m)
- needed: tool: a way to reconnect an MCP server from inside a session
- lesson: check `curl 127.0.0.1:29979` before planning a Paper board
```

- **Heading:** time, `#topic`, the task id if any, and roughly how long the work took.
- **`did`:** one line. Required.
- **`hiccup`:** what got in the way, with a rough cost. Zero or more lines. An entry with none is fine.
- **`needed`:** one of `tool:` `skill:` `rule:` `context:` `access:`, then what. These tags are
  what the Dream loop groups by.
- **`lesson`:** one line, if there was one.
- At most 8 lines an entry. The CLI rejects longer ones and says to split or trim.

The pal writes it with `pal notebook "did: …" --hiccup "…" --needed "skill: …" --lesson "…"`,
or `pal notebook hiccup "…"` for a quick one in the middle of work. `pal notebook` with no text
shows today's.

### When it writes (P17 ★ A: cheap, no flood)

- **Only after real work.** The SessionStart primer gets one line: "When you finish a task, hit a
  hiccup, or are about to stop after real work, add a notebook entry (pal notebook); skip it if
  nothing happened."
- **Nudges, one line each, at the moments that matter:**
  - `pal task done` and `pal task block` print a reminder: "Anything slow? pal notebook …".
  - When crewd's stuck check clears (the topic was stuck 15+ minutes and is moving again), it
    queues a one-line note to that topic ("You were stuck 22m in #x. If something was missing,
    note it: pal notebook hiccup …"). It does this at most once an hour per topic, and it's
    delivered when the turn ends, like any message.
- **No flood:** at most one entry per task, plus hiccups. Entries from the same topic within
  10 minutes merge into one. A day with no real work has no file.
- B adds a cheap model drafting entries from topic screens. It's not recommended: it sends
  screens to the API, and the pal's own account of a hiccup is better than a guess from a screen.

### What it never holds

**No secrets, credentials, private user data or raw transcripts.** `pal notebook` enforces it
before writing:
- It masks key- and token-shaped strings, the same check as the AGENTS.md lint's `secret`.
- It rejects pasted terminal output: more than 3 lines that look like a transcript or log.
- It rejects absolute paths under a home folder other than the pal's project. Personal files are
  someone's data.

The primer line says it too. The Notebook tab shows a masked string as `‹masked›`, and DeNon can
delete any entry (with a backup).

### The Notebook tab

In the panel, in the pal's group: **Profile · Notebook ‖ Mission · Brain · AGENTS.md**.
- Days newest first, today on top and **live**: it updates as entries land (`watchFolder` on the
  notebook folder).
- Each entry is drawn from the template: heading in 11 px mono, `did` in body text, hiccups with an
  amber `hiccup` tag and their cost, `needed` with its kind tag (tool / skill / rule / context /
  access), and lessons in #EDEDED.
- A filter: **All · Hiccups · Lessons**, and a count for the week ("6 hiccups · ~2h lost").
- Each hiccup shows whether the Dream loop has picked it up: `in pattern P-3` and its state
  (proposed / accepted / resolved).

## 3c. The Dream loop: the crew learns from its hiccups

An orchestrator reads every pal's notebook hiccups and lessons, finds patterns across pals, and
**proposes** fixes: new or refined skills, AGENTS.md rules, tools and processes. **Nothing is
written until DeNon approves it in the Inbox** (as with P6). The loop also tracks whether a fix
worked: does the same hiccup stop coming back?

### Who dreams (P19 ★ C) and what it costs

1. **Summarise (crewd, no model, nightly at 03:30):** parse every `notebook/` day since the last
   dream for `hiccup`, `needed` and `lesson` lines, with pal, topic, date and cost. That's
   usually a few dozen lines, a few KB. Under 3 new hiccups crew-wide, the night is skipped.
2. **Group (one cheap call, Haiku via `claude -p`):** cluster the lines into patterns, and match
   them to patterns already open in the ledger: "3 pals, 4 times this week: Paper's MCP down at
   session start, ~35m lost". It sends only notebook lines, which are already redacted.
3. **Draft (Orca, only when a pattern qualifies):** a pattern qualifies when it shows up in 2+
   pals, 3+ times, or costs 30+ minutes. crewd sends Orca a short digest (patterns, counts,
   costs, quotes), and Orca drafts at most 3 proposals (P20) with `pal dream propose`. Orca has
   the crew context, it's visible and interruptible, and it goes through the approval gate like any pal.

On demand: `pal dream` (or a button in the Dreams view) runs the same steps now;
`pal dream --dry-run` stops after step 2 and shows the patterns.

A is simpler but costs an Orca turn every night even when nothing happened. B is cheapest but
drafts without crew context, and nobody sees it working.

### What a proposal can be, and what writes it on approval

| Kind | Example | Written on approval by |
|---|---|---|
| **Skill** (new or refined) | "check-mcp-before-design": test a design MCP's port before planning | `pal skill save` (a refined skill shows as a diff of the old SKILL.md) |
| **Rule** | an AGENTS.md line in one project: "Run `herdr-app check` on the installed copy, not lib/" | `pal agents apply` (the AGENTS.md tool's backup, hash check and log) |
| **Tool** | "a `pal mcp status` command" | a task on the board, assigned to the pal that owns that code, with the spec. The dream doesn't write code |
| **Process** | a routine, or a gate-policy change | the existing `pal routine` / policy commands, shown as a diff |
| **Context** | a brain note or a mission line for one pal | the brain writers (section 3) |

Each proposal is an **Inbox card**: the pattern (pals, count, cost, two quotes from notebooks),
what to change, the **diff**, and **Approve · Edit · Decline**. Approve writes through the writer
above, with its usual backup. Decline asks for an optional one-line reason, which teaches the next
dream. Proposals not decided in 7 days expire.

### Closing the loop

`data/crew-dream/ledger.jsonl` keeps one line per pattern and proposal: the pattern's id and
summary, its source hiccups (pal, day, line), the kind, target, diff and status (proposed /
accepted / declined / expired), who decided, and when.

- **Accepted → watching** for 14 days (P21). Each night's grouping step matches new hiccups to
  watched patterns. If none comes back, it's **resolved**. If one does, it's **recurred**:
  the card comes back to the Inbox with the new hiccup, so the fix gets refined, not repeated.
- **Declined** patterns aren't proposed again for 30 days, unless they double in count.
- **The Dreams view** (in the head pal's panel, a **Dreams** segment of its Notebook tab):
  - open patterns, with counts, pals and time lost;
  - proposals and their states;
  - a monthly line: "9 proposed · 6 accepted · 4 resolved · 1 recurred · ~5h of hiccups this
    week vs ~9h a month ago".

### DJM OS's Learning Ledger

DJM OS keeps its own Learning Ledger, which pals can only read. **The Dream loop never writes to
it.** When a lesson matters beyond Project Pals, the dream drafts an **intake note** for DeNon to
file themselves: `data/crew-dream/intake/YYYY-MM-DD-<slug>.md`. It's sanitized (no secrets, no
private data, no transcripts), with what happened, the evidence (pattern, counts), what was
applied, what was checked, and what's still open. Its Inbox card says "Draft for DJM intake",
with Open and Copy. Filing is DeNon's.

## 4. The AGENTS.md / CLAUDE.md tool

It's the panel's **AGENTS.md** tab, the third part of the mission profile.

### What it shows

- Each file the harness loads in this folder: `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`,
  and `CLAUDE.local.md` (marked "not checked in"). Each row has its line count and a lint badge.
- **"What Claude Code loads here"**: one line adding up the global `~/.claude/CLAUDE.md`, the
  project file and what it imports ("~/.claude/CLAUDE.md 25 + CLAUDE.md → @AGENTS.md 90 = 115
  lines"). The global file is read-only here.
- **View** renders the markdown. **Edit** opens the code editor (`EditorState`, markdown, line
  numbers) in the panel. ⤢ makes the panel Full while you edit or review a long file.

### Lint

Deterministic checks, run when the section opens and after every edit (`pal agents lint <pal> --json`,
so the CLI and the UI give the same answer):

| ID | Check | Level |
|---|---|---|
| `long` | over 250 lines, or over 400 (hello-lock's 514) | warn / strong |
| `stale-path` | a backticked path (`lib/crew.js`, `docs/x.md`, `~/…`) that doesn't exist in the checkout; globs and `<placeholders>` are skipped | warn |
| `stale-cmd` | `npm run x` with no `x` in package.json; `./script` or `bin/x` that isn't there; `make x` with no target | warn |
| `bad-import` | an `@path` import to a missing file | error |
| `no-pointer` | AGENTS.md exists, CLAUDE.md doesn't | info, offers **Create pointer** |
| `prose-pointer` | CLAUDE.md says "read AGENTS.md" without `@AGENTS.md` (hello-lock) | warn, offers **Use an import** |
| `duplicate` | CLAUDE.md repeats AGENTS.md (softly-promo: identical, 109 lines each), or a brain line repeats AGENTS.md | warn, offers **Make CLAUDE.md the pointer** |
| `conflict` | the same rule stated two ways across the loaded files, by exact opposites ("always X" / "never X" on the same words) | warn |
| `secret` | something shaped like a key or token | error, shown masked |

**Deep check (P7):** a button, "Deep check (sends these files to Claude)", runs one `claude -p`
(Haiku) pass for conflicting or outdated rules across AGENTS.md, CLAUDE.md, the global CLAUDE.md
and the pal's brain. Its findings come back as `conflict?` rows with both quotes. It's off until
clicked, every time, because it sends the files to the API (the memory review already does
this with topic screens, and RECIPE says so).

### Writing: diff, backup, DeNon's click

**Nothing writes a project's file without DeNon's click.** Every write goes the same way:

1. **Edit** (or a fix button: Create pointer, Use an import, Make CLAUDE.md the pointer). The
   fix fills the editor; it doesn't write.
2. **Review**: a unified diff in the `crew-review` style (+ green, − red, line numbers), with
   "+4 −0 · CLAUDE.md (new file)".
3. **Write CLAUDE.md**: DeNon's click. Then:
   - backup: `data/crew-backups/agents-files/<pal>/<file>.<YYYYmmdd-HHMMSS>.md`, the last 20 kept
     (for a new file, the backup records that it didn't exist);
   - write with a hash check: if the file changed since the diff, nothing is written and the diff
     is shown again against the new text;
   - one change-log line in the brain: "CLAUDE.md: created the @AGENTS.md pointer (DeNon)".
4. **Not committed.** The row says "uncommitted", with **Ask <pal> to commit it** (a `pal tell`).
   Committing stays the pal's or DeNon's normal work.
5. **Restore**: the backups list under each file, with a diff and the same click.

The pointer it creates:

```markdown
@AGENTS.md
```

Claude-only lines, if any, go under it. When CLAUDE.md already has its own content, the fix keeps
it and puts the `@AGENTS.md` line first.

**One writer.** The mod stages the new text in `data/` and runs `pal agents apply <pal> <file>
--from <staged> --expect <hash>`, so the backup, hash check and log live in one Python function
that can be tested with `CREW_DATA`. `pal agents apply` gets a gate rule like `pal land`, so a pal
that types it is held for DeNon; the UI's own call is DeNon's click.

**Pals and these files (P6).** Today a pal can edit `AGENTS.md` like any file. Recommended:
- a new **`agents-file`** gate rule holds a pal's Edit or Write on `AGENTS.md` / `CLAUDE.md` in
  its own folder until DeNon approves (an Inbox card, like a push);
- the smooth way is `pal agents propose AGENTS.md -F new.md`: an Inbox card "Pal proposes an
  AGENTS.md change (+12 −3)" whose View opens this tool on that diff, with Decline and Apply.

As RECIPE says, the gate isn't a security boundary: a pal with permissions bypassed can still
write the file. It makes the normal path visible.

**Remote pals:** `readTextFile` reads on any machine, `writeTextFile` only writes here. For a pal
on another machine, the tool views and lints; Edit says "Edit on this computer only, for now".

## 5. Where it lives: the right-side panel (P1, DeNon's decision)

Closed, nothing changes: the terminal has the full width, and there's no rail. Opening a profile
slides a panel out on the right, beside the topic's terminal. Closing it gives the width back.

```
closed                                          open (push, P9 ★)
┌ sidebar 304 ┬ header 52 ───────────────────┐ ┌ sidebar 304 ┬ header 52 ─────────┬ panel 420 ─────────────────┐
│ hero        │                              │ │ hero        │                    │ [pet] Project Pals - Her… ×│ 52
│  name ──────┼── click: open / close        │ │  name       │                    ├────────────────────────────┤
│  topics   │  terminal, full width        │ │  topics   │  terminal          │ Profile ║ Mission Brain AG…│ 36
│  + Ch Tell  │                              │ │  + Ch Tell  │  (narrower, never  ├────────────────────────────┤
│  Profile ───┼── click: open / close        │ │  [Profile]  │   under 480 px)    │ the shown tab's sections,  │
│ pal list    │                              │ │ pal list    │                    │ stacked, scrolling         │
│  right-click→ Profile / Mission            │ │             │                    │                            │
└─────────────┴──────────────────────────────┘ └─────────────┴────────────────────┴────────────────────────────┘
 status bar 24 (full width)                      status bar 24 (full width)
```

### Its size and place

- **Two sizes (P13):** **Side**, beside the terminal, and **Full**, which hides the `work` column so
  the panel fills the row until it closes or goes back to Side (section 1b). The Profile tab
  (the dashboard) opens Full; the other tabs open Side. ⤢ / ⤡ in the header switches.
- **Side width:** 420 px by default. Drag its left edge between 360 and 640; the width is remembered in
  `crew-settings.json` (`focus.panelPx`, beside the sidebar's `focus.sidebarPx`).
  At 1440 px wide, that leaves the terminal 716 px (about 85 columns of JetBrains Mono 14).
- **Height:** from the top of the window to the status bar, so its 52 px header lines up with
  the topic header, and the status bar stays full width under both.
- **Layout:** a new block in `pals.json`'s `body` row, after `work`:
  `{ "id": "profile", "type": "block", "size": { "px": 420 }, "min": 360, "max": 640,
  "hidden": true, "content": { "mod": "crew-profile" } }`, with the row's 1 px hairline divider.
  Open is `layout.show {id: "profile"}`, close is `layout.hide`. The roster hides it when the app
  starts, so every launch starts with the terminal at full width.
- **Push or cover (P9):** ★ **push**. The terminal narrows while the panel is open, so nothing
  covers the agent's text, and Herdr's own show/hide does the work. Cover would need an overlay
  window held to the right edge (Herdr lets people drag those, and floating blocks spring back to
  edges), and it would hide the terminal's right-hand columns. The one thing push costs: the
  terminal reflows when the panel opens or closes. Claude Code redraws cleanly when that happens.

### Inside the panel

- **Header (52 px, #0E0E0F, a hairline under it):** the pet chip (30 × 24, the pal's live
  state), the pal's name (14/600 #EDEDED, truncated), and two 28 px buttons on the right: ⤢ / ⤡
  (Full / Side) and ×. In Full, the tabs sit in this header row instead of a strip under it.
- **Tabs (36 px):** five rectangular tabs in one strip, radius 4, the shown one #232324 on a
  #2C2C2F hairline: **Profile · Notebook** ‖ **Mission · Brain · AGENTS.md**. A 1 px divider
  and 8 px of space separate the two groups, so the strip is also the Pal / Mission switch: the
  agent on the left, its project on the right. They fit 420 px; under 400 px, AGENTS.md shortens
  to "Agents". On the head pal, the Notebook tab has a Notebook | Dreams switch (3c). AGENTS.md carries its lint badge
  (an amber count for warnings, red for errors, a blue `+` when a pointer can be created).
- **Tabs, not one long page.** Stacking all four in 420 px would be a very long scroll, and the
  editor and the diff need the panel's full height. Inside each tab the sections are stacked,
  16 px in, split by hairlines, with 10 px uppercase mono labels (#6A6A6C).
  - **Profile:** the dashboard (section 1b). In Side it's the compact version: identity, facts,
    stats (2 × 2), the topics, Now as a list, memory (P11), routines, and Open dashboard ⤢.
  - **Notebook:** the pal's journal, days newest first, today live (section 3b).
  - **Mission:** the mission card (statement, goals, done-when, focus), then the last 3 change-log
    lines and the last 2 decisions, with "All in Brain →" (section 2).
  - **Brain:** the brain files as rows (Decisions 12, Change log 48, Map → AGENTS.md,
    Notes 3). A row opens its file in the panel, with ← back to the list; Edit and Save work
    there too (section 3).
  - **AGENTS.md:** "What Claude Code loads here", the lint list with its fix buttons, the files
    with View / Edit, the review diff, Write, and the backups (section 4).

### Opening and closing

| Trigger | Closed | Open on another tab | Open on that tab |
|---|---|---|---|
| The hero's name (underlines on hover) | opens on **Profile** | switches to Profile | closes |
| The **Profile** quick action (looks pressed while the panel is open) | opens on **Profile** | switches to Profile | closes |
| Right-click a pal or the hero → **Profile** / **Mission** (first in the menu) | opens on that tab | switches | closes |
| **Ctrl+Shift+I** (P2; `crew-roster.profile`) | opens on the last tab used | closes | closes |
| × in the panel's header | n/a | closes | closes |
| **Esc**, while the panel has the keyboard | n/a | closes | closes |

- **The panel follows the shown pal.** Open it, then pick another pal or topic, and it shows that
  pal's profile on the same tab. So the hero's pal and the panel's pal are always the same.
- **Esc never comes from the terminal.** Claude Code uses Esc to interrupt, so Esc closes
  the panel only while the panel holds the keyboard (`"focusable": true`; opening it gives it the
  keyboard; clicking the terminal takes it back, and then Esc goes to the program).
- **The slide.** Herdr shows and hides layout blocks at once; it doesn't animate a block's width.
  So the panel's width appears in one frame, and its content slides 24 px in from the right and fades in
  (`.transition` on the mod's root, about 160 ms). That's to be confirmed in the build, since
  `.transition` on a fresh mount isn't proven here. If it doesn't run, the panel just appears, which
  is still fine.
- **Keys:** the installer adds `"ctrl-shift-i": "crew-roster.profile"` to keys.json's `global`
  map only if that key is free there (it is today), with keys.json backed up first.
  Ctrl+Shift+I isn't one of the ctrl-letters terminal programs rely on.

### The DS look

Near-black and flat (#0B0B0C content, #0E0E0F panels, #161617 raised); 1 px hairlines (#1E1E20,
#2C2C2F on controls); radius 3/4/6/8, nothing larger; rectangular segments and tags; Inter for
UI, JetBrains Mono for paths, labels, counts and `#topics`; the text ladder (#EDEDED names,
#C8C8C8 body, #808082 secondary, #6A6A6C meta); state colours only as 7 px dots, pools and tags
(#4CA1F2 working, #34D098 done, #E8AA0A asks/stuck, #F06C6C error). Pets sit on the soft radial
aura (`pet-aura.svg`), with no box and no outline.

## 6. Three proposals awaiting DeNon (P10–P12)

Orca recommended these. DeNon hasn't approved them, so each is a yes/no pick, and none of the
other picks depends on them (except P8, which only matters if P12 is a yes).

1. **P10 · Review changes in a worktree topic's right-click.** `crew-menu` (`what: "tab"`,
   opened from the hero's topic rows) gets **Review changes** second, under Pin, when the record
   has `worktrees["#name"]`. It opens `crew-review` with `{space, tab}` at 86% × 88%, the same as
   the profile's Review button. Topics without a worktree don't show it.
2. **P11 · The pal's memory inside its profile:** section 1, "Memory, inside the profile". If
   it's a no, the Profile tab ends at Topics and Routines, and memory stays in `pal memory`.
3. **P12 · "N need you" in the status bar.** After "N working", a separator, then a 6 px dot and
   "2 need you": amber for asks and stuck, red when an approval waits. Click opens the Inbox
   (`setShared("crew.view", "you")`). It's hidden at zero.
   - P8, what it counts: ★ only what needs a decision: blocked topics (asks you),
     approvals held, stuck topics, and folders waiting on the trust question. Finished
     topics are in the Inbox but don't need you, so they don't count.
   - One source: the roster publishes shared `crew.needs` `{count, asks, approvals, stuck, trust}`
     and the status bar reads it, so the two can't disagree.

## 7. New data and commands, in one place

Internal names stay `crew` (AGENTS.md): new data sits beside the old.

| | What | Where |
|---|---|---|
| Data | brain files | `data/crew-memory/<slug>/brain/` (or `<project>/.pals/` per pal, P3) |
| Data | per-pal brain setting | the record's `brainIn: "pal" \| "project"` |
| Data | AGENTS-file backups | `data/crew-backups/agents-files/<slug>/` |
| Data | proposals (mission, agents files) | `data/crew-proposals/<id>.json` + the staged text |
| Shared | the panel | `crew.panel` `{open, tab: "profile" \| "mission" \| "brain" \| "agents", size: {tab: "side" \| "full"}, term, file}` (the pal is the shown one; `term` is the mini terminal's topic) |
| Settings | the panel's width | `crew-settings.json` `focus.panelPx` |
| Shared | the need-you count (P12) | `crew.needs` |
| CLI | mission | `pal mission [show] [<pal>]`, `focus "…"`, `tick "…"`, `propose -F f` |
| CLI | brain | `pal brain ls / show [file] / log "…" / decide "…" --why "…" / note <topic> "…"` |
| CLI | agents files | `pal agents show / lint [--deep] [--json] / propose <file> -F f / apply` (gated) |
| Gate | rules | `agents-apply` (`pal agents apply`), `agents-file` (Edit/Write on AGENTS.md / CLAUDE.md, P6) |
| Data | notebook | `data/crew-memory/<slug>/notebook/YYYY-MM-DD.md` |
| Data | dream ledger, drafts, intake drafts | `data/crew-dream/ledger.jsonl`, `data/crew-dream/proposals/`, `data/crew-dream/intake/` |
| CLI | notebook | `pal notebook ["…"] [--hiccup …] [--needed kind: …] [--lesson …]`, `pal notebook hiccup "…"` |
| CLI | dream | `pal dream [--dry-run]`, `pal dream propose -F proposal.json` (Orca), `pal dream ls` |
| Hook | SessionStart | the mission block (section 2), the notebook line, and the last 7 days of lessons (P18) |
| crewd | helpers | a change-log line per task done; the stale-Focus note in the nightly distill; the stuck-cleared notebook nudge; the nightly dream summary and grouping (03:30) |
| Mod | new | `crew-profile` (the panel: header, tabs, all four tabs, and the dashboard's parts by `props.part`; `"focusable": true`) |
| Mod | new | `crew-palmenu` (the header chip's popup, section 1c) |
| Mod | changed | `crew-header` (the chip opens `crew-palmenu`, with a ▾), `crew-roster` (name click, Profile action, menu items, `crew-roster.profile`, hides the panel at start, `crew.needs`), `crew-menu` (Profile, Mission, Review changes), `crew-status` (need you, P12) |
| Layout | changed | `layouts/pals.json`: the hidden `profile` column in `body`, with the dashboard tree and its `dash-term` agent block (section 1b) |
| Keys | added if free | `"ctrl-shift-i": "crew-roster.profile"` (P2) |

## 8. Build order, once DeNon picks

Each step works by itself and gets installed and checked before the next.

1. **The panel and the Profile tab:** the `profile` block, `crew-profile` (header, tabs, the
   Profile tab), the four ways in, open/close/toggle, Esc and focus, the remembered width, and
   Memory if P11 is a yes. About 2 days.
2. **The dashboard:** Full / Side, the layout tree with `dash-term`, the topics column, the
   task board with activity cards and topic chips, the mini terminal and its picker. Verify
   `agent.focus` and the one-size question first, on a sandbox window (the
   `herdr-sandbox-live-test` skill), never DeNon's. About 3 days.
3. **The pal chip menu** (`crew-palmenu`) and **the small ones, if DeNon says yes**: Review
   changes in the menu (P10) and "N need you" (P12, `crew.needs`). About a day; the small ones
   don't depend on step 1.
4. **Mission and brain:** the files, `pal mission` / `pal brain`, the primer block, the Mission
   and Brain tabs (mission card, file list, viewer and editor, hash-checked). About 2 days.
5. **The AGENTS.md tab:** `pal agents lint`, View, Edit → Review → Write with backup, Full, the
   three fixes, restore. About 2 days.
6. **Proposals and gates:** `pal mission propose`, `pal agents propose`, the Inbox cards, the
   `agents-apply` / `agents-file` rules; the deep check; adopting `_Brain/`. About 1.5 days.
7. **The notebook:** `pal notebook` with its redaction checks, the primer line and the nudges, the
   Notebook tab. About 1.5 days.
8. **The Dream loop:** the crewd summary and grouping, `pal dream`, the Inbox proposal cards
   with their writers, the ledger and the recurrence check, the Dreams view, and intake drafts.
   About 3 days, after step 7 has collected a week of real notebooks to tune it on.

Each step is checked the AGENTS.md way: the preflight, `herdr-app check` on every mod, an
install into a throwaway HOME, `CREW_DATA` for the CLI, then a live install only with DeNon's OK.

## 9. Watch out

- **Virtual-list rows can't hold `on_click`** (RECIPE): the brain's change log (long) uses
  `on_item_click`, or plain rows.
- **TextView draws no bold here,** so the mission card's statement is set by size (18 px), not
  weight, and checklists use drawn boxes, not markdown `[x]`.
- **No `InputState.new` during render:** the profile's role, pinned-note and Remember fields
  are made in `init`.
- **The primer budget is shared:** a long mission must never push out `USER.md`. The mission
  block is capped at 1,200 characters, and what gets cut is memory notes first.
- **Worktree topics read the pal's brain, not their branch's:** in project mode (P3 B), a
  worktree's `.pals/` can differ from the main checkout's. The hub always shows the pal's main folder
  and says so when the shown topic's copy differs.
- **`writeTextFile` and paths outside `~/.config/herdr-app`:** to be confirmed during the build. The
  one-writer design (`pal agents apply`) doesn't depend on it.
- **`stale-path` needs care, or it cries wolf.** A naive pass over project-pals' AGENTS.md
  flags 12 "missing" paths, and none is really stale: `origin/main` (a git ref),
  `CREW_DATA=/some/dir` (an assignment), `dist/project-pals-X.Y.Z.tar.gz` (a placeholder), bare names
  like `main.js` and `crew.js` (meant per mod folder), and `pals.svg` (listed next to
  `layouts/pals.json`, so it means `layouts/pals.svg`). The check skips git refs, `VAR=` text,
  `X.Y.Z` / `<…>` / `*` / `…`, and checks a bare name only against any file of that name in the
  repo (`git ls-files`). With those rules, 22 paths are checked and all 22 exist.
- **The terminal can get too narrow.** The sidebar (304) plus the panel (420) leaves a 1,280 px
  window's terminal 556 px. Under 1,204 px wide (304 + 420 + 480), the panel opens at the
  width that keeps the terminal at 480 px, down to its 360 px minimum. Below that, it opens
  anyway, and the terminal is narrower.
- **Esc belongs to the terminal** whenever the terminal has the keyboard (section 5). A build that
  closes the panel on every Esc would break Claude Code's interrupt.
- **Layout clicks remember shown/hidden** (`layouts/.state/`), so a panel left open at quit would
  come back open. The roster hides it at start to keep "hidden by default" true.
- **Don't answer the trust question.** The profile can show "waiting on the folder trust
  question" for a new pal. It points at the tab and never answers it (RECIPE).

## Done when (for the build, not this proposal)

- With the panel closed, the terminal is as wide as it is today, and no rail or edge shows.
- The hero's name, the Profile quick action, right-click → Profile and Ctrl+Shift+I each open the
  panel (420 px, on the right, the terminal narrower beside it). The same trigger again, its ×, or
  Esc with the panel focused closes it, and the terminal gets its full width back.
- Esc pressed in the terminal while the panel is open goes to the program, and the panel stays.
- Switching pals with the panel open shows the new pal's profile on the same tab.
- The Profile tab opens Full: the sidebar stays, the work area is the dashboard, and closing it
  brings back the same topic at full width.
- The dashboard's topics show each topic's live state within a second of it changing, and
  a task claimed as `Pal#topic` shows that topic's chip.
- A working topic with no task shows as a Now card with its terminal title.
- Typing "hi" + Enter into the mini terminal sends it to that topic's real Claude Code session:
  the same message shows in the main area after closing the dashboard, and `hc read` on that
  terminal shows it.
- Picking another topic in the mini terminal's bar (or clicking its row or chip) shows that
  topic's live session, and Esc inside it reaches the program, not the panel.
- A dragged width (say 500) is still 500 after closing and reopening, and after a restart, where
  the panel starts hidden.
- The Profile tab shows the record's brain, folder, machine, branch, pet and hire facts, and the
  four stats match `pal team` and `pal task ls`.
- `pal remember "x"` from a topic shows up under Memory without a reload, and the pinned
  note edited there is in the next session's primer.
- A new session's primer starts with the mission block, at most 1,200 characters.
- `pal brain log "x"` appends one line, and DeNon's edit made at the same moment isn't lost
  (the hash check shows both versions).
- For project-pals, the tool shows `no-pointer`. **Create pointer** → Review shows `+1 −0 ·
  CLAUDE.md (new file)` → Write makes `CLAUDE.md` holding `@AGENTS.md`, a backup entry, and a
  change-log line, and nothing else in the repo changes.
- For hello-lock, it shows `long` (514) and `prose-pointer`; for softly-promo, `duplicate`.
- A pal's `Edit` on its AGENTS.md is held in the Inbox (if P6 is on).
- If P10 is a yes: a worktree topic's right-click shows Review changes; a plain topic's doesn't.
- If P12 is a yes: the status bar shows "1 need you" while one topic asks, and nothing at zero.
- The header chip opens the pal menu (Profile, Notebook, Memory, Tasks, Mission, Brain, AGENTS.md,
  Review changes on worktree topics only, Open folder, Tell, Sleep/Wake), with no topics, and each
  item opens its panel tab.
- `pal notebook "did: x" --hiccup "y (cost: 10m)"` adds one entry to today's file, shown live in
  the Notebook tab. A line holding `sk-ant-…` is masked, and a pasted 20-line log is refused.
- `pal dream --dry-run` on a sandbox `CREW_DATA` with planted hiccups (the same one in 2 pals)
  prints one pattern. A full run puts one Inbox card with a diff and writes nothing else.
  Approving it writes through the right writer with a backup, and the ledger shows the
  proposal as watching.
- A planted repeat of an accepted pattern's hiccup turns it "recurred" on the next dream.
- No dream step writes outside `data/` without an Inbox approval, and nothing touches DJM OS.
- No radius above 8, no oval pills: only dots of 9 px or less are round.

## The board

`PROFILE · Pal + Mission`, for the Design system page in Paper. This session's Paper connection
failed at startup, so the board is drawn here as `docs/profiles/board.html`, with a capture at
`docs/profiles/board.png`. These are the frames I'll draw in Paper once it's reconnected:

1. **Closed → open (Side):** the Focus window with the panel closed, then open beside the
   terminal, with the four triggers marked.
2. **The dashboard (Full):** the Profile tab taking over the work area: the header strip, topics
   and memory, the task board and the live mini terminal.
3. **The tabs in Side (420 px):** Profile (compact), Notebook, Mission, Brain, and AGENTS.md with
   the CLAUDE.md pointer fix in review.
4. **The pal chip menu, ways in, and proposals awaiting DeNon (P10–P12).**
5. **The Dream loop:** the flow (notebooks → summary → patterns → proposals → Inbox → watch),
   a proposal's Inbox card with its diff, and the Dreams view in the head pal's panel.
