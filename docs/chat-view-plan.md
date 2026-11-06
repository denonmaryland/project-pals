# Chat view: what to take from flockbook

DeNon wants the chat view (`mods/crew-chat`, fed by `bin/crewchat.py` through crewd) to feel as
fluid as [flockbook](https://github.com/minchenlee/flockbook)'s (MIT, an unofficial Herdr client).
This compares the two as of flockbook `0a8012a` (2026-11-05) and our `v0.2.3`.

## How flockbook's chat works

- **Reading:** a sidecar binary (`flockbook-modfeed`, Rust/Swift) finds the agent's session log
  itself, reads the last 2 MB, and turns it into rows: `user`, `assistant`, `tools` (chips with each
  call's done/error/output), `perm`, `question`, `sep` (time separators) and `footer`
  ("19:47 · Worked 21m 16s · 8 tools"). Claude Code, Codex, pi, Cursor and Grok logs.
- **Streaming:** the mod polls `feed --cursor` every 2 s. The sidecar re-reads the same byte range
  and answers `unchanged`, or a `splice` (drop rows from index `at`, append these). So a tool result
  that arrives later updates the row that's already on screen. Scrolling up past the first row reads
  the 2 MB before it (`feed --before`) and puts it on top, keeping your place.
- **Rendering:** assistant text is `TextView.markdown` (selectable, real markdown), with code fences
  and tables split out and drawn as rounded boxes (`mdblocks.js`); right-click a code box → Copy code.
  The virtual list needs heights up front, so `estimate.js` guesses each row's height from the text
  with measured font metrics, leaning high. Tool stretches are chips ("Edited 3 files", "Ran 2
  commands") with icons and a spinner while running; a click lists the calls with a check or
  "failed" each.
- **Scrolling:** a `follow` flag. Scrolling up stops following; a round ↓ button fades in; reaching
  the end (or the button) follows again. Switching agents or coming back to the chat opens at the
  newest row. New rows never pull you down while you read.
- **Sending:** the reply box is in the chat. Enter sends through the sidecar, which checks the
  terminal still runs the same agent and conversation the chat showed (`--expect-kind`,
  `--expect-path`) before typing; `unconfirmed` keeps the box empty so nothing is sent twice. Unsent
  text is kept per agent. Drop or paste files to attach.
- **Cards:** when the agent is blocked on a permission prompt or a question, a card above the
  reply box shows it and answers it (Allow once / Deny, option picks), re-reading the screen right
  before each key so the key only goes to the prompt that was shown.
- **Polish:** another agent's chat fades in; new cards fade and rise in (`motion.js`).

## What flockbook does better, by impact

| # | What | Ours today | Effort |
|---|---|---|---|
| 1 | **Follow mode + ↓ button.** Reading older messages is never interrupted. | Every feed change (and coming back) calls `toBottom` three times: you get pulled to the end while reading. | Small, mod only |
| 2 | **Live tool rows.** Spinner while a call runs, a check when done, "failed" in red; each call's output on expand. | Tool calls are written once, with no result: you can't tell running from done or failed. | Medium: crewchat emits `result` lines, mod merges them |
| 3 | **Turn footers and day-aware separators.** "19:47 · Worked 21m 16s · 8 tools"; "Yesterday 09:12". | A clock stamp after a 10-minute gap, no date, no turn length. | Small, mod only |
| 4 | **Selectable, real markdown.** Copy any text; tables drawn as tables; code in rounded boxes with Copy code. | Our own word-wrapper with fixed line heights: text can't be selected, tables show raw pipes, long code lines are cut off. | Large: borrow `estimate.js` + `mdblocks.js`, retune heights on Linux fonts |
| 5 | **Older history on scroll-up.** | Only the last 300 entries; "N earlier messages are in the terminal". | Small: our feed file already has everything |
| 6 | **Chips with icons** per kind of tool ("Edited 3 files" · "Ran 2 commands"), as pills. | One grey line per stretch ("Ran 4 commands · edited x.py"). | Small, comes with #2 |
| 7 | **Approval and question cards in the chat.** | "It's asking you something in the terminal" + Open terminal. | Large; needs DeNon's call (see below) |
| 8 | **Lower latency.** | crewd syncs every 2 s, then the mod re-reads the whole feed. Similar in practice. | Small: sync chats on a faster loop |
| 9 | **Fade on switching channels.** | Hard cut. | Small |
| 10 | **Other agents' logs** (Codex, pi, Cursor, Grok). | Claude Code only. | Medium per agent |

## What we already do better

- **It's a pal, not a log.** The pal's mascot sits by its replies and the typing dots; notes from
  other pals, rooms, routines and Project Pals get their own labelled bubbles ("from Orca"), where
  flockbook shows them as if you typed them.
- **The strip under the chat:** model, effort, a context bar, 5-hour and weekly usage with reset
  times, and a Stop button (`hc interrupt`). Flockbook shows model/effort/context/cost tags only.
- **Events:** slash commands, "Earlier conversation was summarized", "Stopped" show inline.
- **Our composer** already keeps a draft per channel, attaches files, routes `@Pal#channel`, and
  sends to rooms. crewd's delivery never types over unsent text in the pal's input box.
- **Nothing extra to install.** No per-platform binary to download and checksum: crewd (Python,
  already running) writes a small append-only feed; the mod reads a file.
- **Cheap renders.** Row layout is cached by feed version, width, status and folds.

## Not taking (or not yet)

- **Approval cards (#7).** Clicking Allow in the chat is DeNon approving, so it fits the rule that
  only DeNon approves. But it sends keys to a pal's prompt from a mod, next to our own approval
  gate, and flockbook needed a lot of care (screen re-read before each key, one claim per prompt) to
  make that safe. Worth doing, after DeNon says yes, as its own piece of work.
- **The sidecar design.** We keep crewd + feed file. The splice protocol isn't needed: our feed is
  append-only, and a later `result` line can point back at its call by id.

## Build order (this branch)

1. Follow mode + ↓ button (#1).
2. Tool results: crewchat records each call's id and writes `result` lines; the mod shows running /
   done / failed and the first lines of output, as icon chips (#2, #6).
3. Turn footers and day-aware separators (#3).
4. Older history on scroll-up (#5).
5. Then, separately so it can be judged on its own screenshots: selectable markdown (#4).

Status: 1-4 and 6 are built (commit 7fce216). DeNon said yes to #4 on 2026-11-05; it's built too,
with each message measured off-screen rather than trusting the height guess alone.

Credit: anything copied from flockbook gets a comment naming it (MIT, © its authors) and a line in
the README.
