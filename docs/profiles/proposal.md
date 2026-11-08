# Profiles: every pal has a profile, every pal has a mission

**Status:** proposal for DeNon to pick from. Nothing is built. Branch `crew/profiles`, 2026-11-08.
**Board:** `PROFILE · Pal + Mission` (see "The board" at the end). It's drawn as `docs/profiles/board.html`
for now, because Paper's app wasn't running when this was written.

Every pal gets a **profile**: who it is, what it's on, what it has done, what it remembers.
Every pal also gets a **mission**, with a profile of its own. The mission profile is the hub for
the pal's **project brain**: a few markdown files (mission, decisions, change log, map, notes),
plus a tool for the project's `AGENTS.md` / `CLAUDE.md`.

## The picks, in one table

Each row is a decision for DeNon. ★ is my recommendation; the sections below say why.

| # | Decision | Options | ★ |
|---|---|---|---|
| P1 | Where the profile lives | **A** dialog · **B** full view in the main area · **C** the sidebar | **B** |
| P2 | How you open it | hero name click, a Profile quick action, right-click → Profile (all three), or fewer | all three |
| P3 | Where the mission and brain are stored | **A** pal data (`data/crew-memory/<pal>/brain/`) · **B** the project (`<project>/.pals/`) · **C** A by default, B per pal | **C** |
| P4 | Who writes the mission | DeNon only, the pal proposes · both freely | DeNon only (the pal keeps Focus and the logs) |
| P5 | What the SessionStart primer carries | mission summary only · the whole brain | summary only (≤ 1,200 characters) |
| P6 | Can a pal edit `AGENTS.md` / `CLAUDE.md` itself? | yes, as today · held for approval (a new `agents-file` gate rule) · proposals only | held, plus proposals |
| P7 | The deep lint (conflicting rules) | off · a button that asks first (sends the files to Claude) | a button |
| P8 | What "N need you" counts | the Inbox count · only what needs a decision (asks, approvals, stuck, trust) | needs a decision |

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
| Hero quick actions | `crew-roster` `heroCard`: + Channel, Tell, Tasks (count), moon | entry points |
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

Top to bottom, on the **Pal** page of the profile view:

1. **Identity band.** The pet (120 px wide, over the soft aura, its live state), the name
   (20/600 #EDEDED), the role (one line, #C8C8C8, click to edit: the record's `role`), and the
   state word with its 7 px dot ("Working · 4m").
2. **Facts**, a hairline list of 32 px rows: label in 11 px mono #6A6A6C, value in 13 px #C8C8C8.
   - Brain: `Claude Code · opus` (harness, plus the `--model` from its command line when there is one)
   - Folder: `~/Projects/project-pals` (mono; click copies it)
   - Machine: `this computer`, or the machine's name
   - Branch: the lead channel's branch
   - Pet: `kit · headphones`, and a colour swatch; both open `crew-look`
   - Hired: `Nov 5 · by Orca`
3. **Stats**, four cells in one hairline-split row (value 18/600, label 11 px #808082):
   **Channels** (count), **Tasks done** (last 30 days, from `crew-tasks.json` where
   `claimed_by`/`assignee` is this pal and `status` is done), **Open** (its open tasks),
   **Last active** (the newest `changed_at` across its tabs: "2m ago", "asleep 3d").
4. **Channels.** One 32 px row each: `#name`, the first line of its brief (the record's
   `briefs`), its status dot, a `worktree` tag with the branch when it has one, and, on
   worktree channels, a **Review** button (opens `crew-review`). Click a row to show that channel.
5. **Memory** (DeNon's yes, folded in): see below.
6. **Routines**: this pal's routines, one row each (`weekdays 09:00 · daily standup`, next run).
7. **Footer actions**: Tell, + Channel, Customize look, Put to sleep. The same actions as the
   hero, so the profile never strands you.

### Memory, inside the profile

- **Pinned note**: the record's `memory` field, an editable 3-line box ("Pinned by DeNon").
  It already rides along in every SessionStart, so this just makes it visible and editable.
- **What it remembers**: `MEMORY.md` (the curated part) as markdown, then the last 2 days of
  `notes/`, newest first, each line with its time and `#channel`. These are the same files
  `memory_text()` feeds the primer, so what you see here is what the pal starts with.
- A size line: "4,200 of 6,000 characters it starts with". At the cap, the oldest notes are the
  ones being cut, and the line turns amber. (This pal is there today: `memory_text()` returns
  exactly 6,000 characters for it, so its oldest notes already fall off.)
- Actions: **Remember…** (one line, saved as `pal remember` from DeNon), **Edit MEMORY.md**
  (the editor, saved with a hash check), **Open folder**. **Forget** is on hover per line and
  asks first. It removes the line from that day's note, with a backup.
- `USER.md` (shared by every pal) shows as one read-only row: "Also knows about you: 14 facts".

### How you open it

All three ways (P2), each `crew-roster.profile` underneath, so it can also take a key:

- **The hero's name**: hover underlines it, click opens the profile. The pet keeps its current
  click (show the pal).
- **A Profile quick action.** The row is full at 304 px, so: `+ Channel · Tell · Profile`,
  then two 28 px icon buttons: tasks (with its count as a small badge) and the moon. Tasks
  loses its label, not its count.
- **Right-click** a pal row or the hero: **Profile** goes first in the menu.
- **Tell stays** a quick action and a footer button. Nothing about it changes.

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
Project Pals Herdr mod"); the **mission** is why it exists and when it's done; a channel's
**brief** is that one channel's job. The profile shows all three, and none of them is copied
into the others.

### Where it's stored (P3)

| | **A · Pal data** | **B · The project** | **C · A, or B per pal** ★ |
|---|---|---|---|
| Path | `data/crew-memory/<pal>/brain/mission.md` | `<project>/.pals/mission.md` | A by default; a per-pal setting "Brain lives in: Pal data / This project" |
| Travels with the repo | no | yes, versioned | per pal |
| Worktree channels | one mission for all channels | each branch has its own copy, so they drift | per pal |
| The pal updates it | freely (it's Project Pals' data) | it's a project file write | per pal |
| Shows up in PRs / diffs | never | every change | per pal |
| Follows a rename | yes (`pal renamed` already moves the folder) | not affected | per pal |

**Why C.** For a code repo, pal data is right: one mission across every channel and worktree, no
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
Latest changes: 11-08 Hero channels scroll after 4 rows · 11-08 Pro view removed · …
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
| `changelog.md` | one line per change, newest first, with the channel | the pal (`pal brain log`); crewd adds one line when a task is marked done |
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

## 4. The AGENTS.md / CLAUDE.md tool

It's the **Project files** section of the mission profile.

### What it shows

- Each file the harness loads in this folder: `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`,
  and `CLAUDE.local.md` (marked "not checked in"). Each row has its line count and a lint badge.
- **"What Claude Code loads here"**: one line adding up the global `~/.claude/CLAUDE.md`, the
  project file and what it imports ("~/.claude/CLAUDE.md 25 + CLAUDE.md → @AGENTS.md 90 = 115
  lines"). The global file is read-only here.
- **View** renders the markdown. **Edit** opens the code editor (`EditorState`, markdown, line
  numbers).

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
this with channel screens, and RECIPE says so).

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

## 5. Where it lives in the UI (P1)

| | **A · Dialog** | **B · Full view** ★ | **C · Sidebar** |
|---|---|---|---|
| Shape | a 720 × 640 overlay over the window | a third child of the `center` stack (`profile-view`, beside `tab-view` and `room-view`), filling the main area | the sidebar's list swaps to the profile, like Tasks and Inbox |
| Room for an editor and a diff | tight | plenty | none: 288 px |
| The terminal | hidden behind it | one click away: the header's back button, Esc, or any channel | stays visible |
| Fits how Pals works now | like Hire and Look | like a room: the header changes, the sidebar stays | like Tasks |

**Why B.** The mission hub is a document editor and a diff viewer, and neither fits in 520 or
288 px. Rooms already prove the pattern: the center stack switches, the sidebar and hero stay,
and you're one click from the terminal. A dialog would be fine for the Pal page alone, but then
the two profiles would live in two places.

### The full view

```
┌ sidebar 304 ─┬─ header 44: ← #profiles   Project Pals - Herdr Mod · Profile     [Pal | Mission] ┐
│ hero         │ ┌ left 248 ──────────┬─ content (max 760, 24 in) ───────────────────────────────┐ │
│ (pet, name,  │ │ pet 120 + aura     │  Pal page:     identity · facts · stats · channels ·      │ │
│  channels,   │ │ name · role        │                memory · routines                           │ │
│  quick       │ │ ── Pal             │  Mission page: the mission card, then the open file:       │ │
│  actions)    │ │ ── Mission         │                view / edit / diff                          │ │
│              │ │    Mission         │                                                            │ │
│ pal list     │ │    Decisions  12   │                                                            │ │
│              │ │    Change log 48   │                                                            │ │
│              │ │    Map → AGENTS.md │                                                            │ │
│              │ │    Notes       3   │                                                            │ │
│              │ │ ── Project files   │                                                            │ │
│              │ │    AGENTS.md  ▲2   │                                                            │ │
│              │ │    CLAUDE.md  +    │                                                            │ │
│              │ └────────────────────┴────────────────────────────────────────────────────────────┘ │
└──────────────┴─ status bar 24: ● 3 working │ ● 2 need you │ 5h 41% · week 18%          pal 0.9.x ─┘
```

- **Header (44 px):** a back button with the channel you came from (`← #profiles`), the pal
  name and "Profile" (or "Mission"), and on the right a rectangular two-segment switch
  `Pal | Mission` (radius 4, the shown one #232324).
- **Left column (248 px, #0E0E0F, a hairline on its right):** the pet with its aura, the name
  and role, then the nav: Pal, Mission, the brain files with counts, and Project files with lint
  badges (an amber ▲ count for warnings, red for errors, `+` for "can create").
- **Content (#0B0B0C):** at most 760 px wide, 24 px in, sections split by hairlines with 11 px
  uppercase mono labels (#6A6A6C, letter-spacing 0.06em). Markdown renders with `TextView`.
  Edit swaps in the code editor, with Save (or Review, for project files) and Cancel at the
  section's top right.

### The DS look

Near-black and flat (#0B0B0C content, #0E0E0F panels, #161617 raised); 1 px hairlines (#1E1E20,
#2C2C2F on controls); radius 3/4/6/8, nothing larger; rectangular segments and tags; Inter for
UI, JetBrains Mono for paths, labels, counts and `#channels`; the text ladder (#EDEDED names,
#C8C8C8 body, #808082 secondary, #6A6A6C meta); state colours only as 7 px dots, pools and tags
(#4CA1F2 working, #34D098 done, #E8AA0A asks/stuck, #F06C6C error). Pets sit on the soft radial
aura (`pet-aura.svg`), with no box and no outline.

## 6. DeNon's pending yeses, folded in

1. **Review changes in a worktree channel's right-click.** `crew-menu` (`what: "tab"`, opened
   from the hero's channel rows) gets **Review changes** second, under Pin, when the record
   has `worktrees["#name"]`. It opens `crew-review` with `{space, tab}` at 86% × 88%, the same as
   the profile's Review button. Channels without a worktree don't show it.
2. **The pal's memory inside the profile:** section 1, "Memory, inside the profile".
3. **"N need you" in the status bar.** After "N working", a separator, then a 6 px dot and
   "2 need you": amber for asks and stuck, red when an approval waits. Click opens the Inbox
   (`setShared("crew.view", "you")`). It's hidden at zero.
   - P8, what it counts: ★ only what needs a decision: blocked channels (asks you),
     approvals held, stuck channels, and folders waiting on the trust question. Finished
     channels are in the Inbox but don't need you, so they don't count.
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
| Shared | which profile is shown | `crew.profile` `{space, page: "pal" \| "mission", file}` |
| Shared | the need-you count | `crew.needs` |
| CLI | mission | `pal mission [show] [<pal>]`, `focus "…"`, `tick "…"`, `propose -F f` |
| CLI | brain | `pal brain ls / show [file] / log "…" / decide "…" --why "…" / note <topic> "…"` |
| CLI | agents files | `pal agents show / lint [--deep] [--json] / propose <file> -F f / apply` (gated) |
| Gate | rules | `agents-apply` (`pal agents apply`), `agents-file` (Edit/Write on AGENTS.md / CLAUDE.md, P6) |
| Hook | SessionStart | the mission block (section 2) |
| crewd | helpers | a change-log line per task done; the stale-Focus note in the nightly distill |
| Mod | new | `crew-profile` (the full view; both pages) |
| Mod | changed | `crew-roster` (name click, Profile action, menu item, `crew.needs`), `crew-menu` (Profile, Review changes), `crew-header` (the profile header), `crew-status` (need you), `layouts/pals.json` (`profile-view`) |

## 8. Build order, once DeNon picks

Each step works by itself and gets installed and checked before the next.

1. **The small yeses:** Review changes in the menu, and "N need you" (`crew.needs`). About half a day.
2. **The Pal profile:** the `crew-profile` view (Pal page), the header, all three ways in,
   Memory with the pinned note and Remember. About 1.5 days.
3. **Mission and brain:** the files, `pal mission` / `pal brain`, the primer block, the Mission
   page (mission card and file viewer and editor, hash-checked). About 2 days.
4. **The AGENTS.md tool:** `pal agents lint`, View, Edit → Review → Write with backup, the three
   fixes, restore. About 2 days.
5. **Proposals and gates:** `pal mission propose`, `pal agents propose`, the Inbox cards, the
   `agents-apply` / `agents-file` rules; the deep check; adopting `_Brain/`. About 1.5 days.

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
- **Worktree channels read the pal's brain, not their branch's:** in project mode (P3 B), a
  worktree's `.pals/` can differ from the main checkout's. The hub always shows the pal's main folder
  and says so when the shown channel's copy differs.
- **`writeTextFile` and paths outside `~/.config/herdr-app`:** to be confirmed during the build. The
  one-writer design (`pal agents apply`) doesn't depend on it.
- **`stale-path` needs care, or it cries wolf.** A naive pass over project-pals' AGENTS.md
  flags 12 "missing" paths, and none is really stale: `origin/main` (a git ref),
  `CREW_DATA=/some/dir` (an assignment), `dist/project-pals-X.Y.Z.tar.gz` (a placeholder), bare names
  like `main.js` and `crew.js` (meant per mod folder), and `pals.svg` (listed next to
  `layouts/pals.json`, so it means `layouts/pals.svg`). The check skips git refs, `VAR=` text,
  `X.Y.Z` / `<…>` / `*` / `…`, and checks a bare name only against any file of that name in the
  repo (`git ls-files`). With those rules, 22 paths are checked and all 22 exist.
- **Don't answer the trust question.** The profile can show "waiting on the folder trust
  question" for a new pal. It points at the tab and never answers it (RECIPE).

## Done when (for the build, not this proposal)

- Clicking the hero's name, the Profile quick action, or right-click → Profile all open the same
  full view, and `← #channel` or Esc goes back to that channel's terminal.
- The Pal page shows the record's brain, folder, machine, branch, pet and hire facts, and the
  four stats match `pal team` and `pal task ls`.
- `pal remember "x"` from a channel shows up under Memory without a reload, and the pinned
  note edited there is in the next session's primer.
- A new session's primer starts with the mission block, at most 1,200 characters.
- `pal brain log "x"` appends one line, and DeNon's edit made at the same moment isn't lost
  (the hash check shows both versions).
- For project-pals, the tool shows `no-pointer`. **Create pointer** → Review shows `+1 −0 ·
  CLAUDE.md (new file)` → Write makes `CLAUDE.md` holding `@AGENTS.md`, a backup entry, and a
  change-log line, and nothing else in the repo changes.
- For hello-lock, it shows `long` (514) and `prose-pointer`; for softly-promo, `duplicate`.
- A pal's `Edit` on its AGENTS.md is held in the Inbox (if P6 is on).
- A worktree channel's right-click shows Review changes; a plain channel's doesn't.
- The status bar shows "1 need you" while one channel asks, and nothing at zero.
- No radius above 8, no oval pills: only dots of 9 px or less are round.

## The board

`PROFILE · Pal + Mission`, for the Design system page in Paper. **Paper's app wasn't running**
(its MCP at 127.0.0.1:29979 refused the connection), so the board is drawn here as
`docs/profiles/board.html`, with a capture at `docs/profiles/board.png`. It's the same
four frames I'll draw in Paper once the app is open:

1. **Pal profile** (P1 B): the full view on the Pal page, for Project Pals - Herdr Mod.
2. **Mission profile**: the Mission page with the mission card and the brain files.
3. **AGENTS.md tool**: the CLAUDE.md pointer fix in Review, with the diff and the lint list.
4. **The small yeses**: the channel menu with Review changes, the hero's quick actions with
   Profile, and the status bar with "2 need you".
