# Handoff: a topic keeps its seat, the brain changes (design)

Status: **design only** (2026-11-10, T119, #handoff). Nothing is built, installed or pushed.
Written by Project Pals - Herdr Mod #handoff from Orca's relay of DeNon's request: hand a topic's
context and seat from one brain to another, "as simply and seamlessly as possible, with great ux
and magic feeling in mind". MUSE owns the feel of the swap (§9 is a placeholder until MUSE's
beat-by-beat arrives).

| File | What it is |
|---|---|
| `docs/handoff/design.md` | This document |
| `~/.config/herdr-app/data/crew-boards/handoff/index.html` | The board: the gesture, directions A, B and C on the app, the offer, the brief, hand back, the comparison |
| `…/crew-boards/handoff/board.png`, `shots/*.png` | The board and each frame as images |
| `…/crew-boards/handoff/build.py` | The board's generator |

The pals and work on the board (Juniper, Atlas, Pixel, Nova, T41) are made up. Nothing from a real
setup is in it.

---

## 1. The idea

A topic has a **seat**: its tab and terminal, its name `Pal#topic`, its folder, branch and worktree,
its desk cards, claimed tasks, room seats, notebook and memory. Today the brain is welded to the
seat: when Codex runs out for the week, the topic stops, and the only way on is a new topic that
knows nothing.

A **handoff** changes the brain and keeps the seat. Claude Code leaves the tab, Codex starts in the
same tab, and Codex's first line shows it knows where things stand. Everything addressed to
`Pal#topic` still arrives, because nothing about the address changed. One action hands it back.

Words used below, and in the UI:

| Word | Means |
|---|---|
| seat | The topic's place: everything in the list above. It never moves in a handoff |
| brain | The harness running in the seat (Claude Code, Codex, Grok, …) |
| holder | The brain that has the seat now. The seat keeps a list of past holders |
| brief | What the new holder is given. A short markdown file, not a transcript |
| hand to / hand back | The two actions. "Hand back" returns the seat to the previous holder |

## 2. What exists, checked

| Piece | Where | What it gives the handoff |
|---|---|---|
| Sleep in place | `bin/crewsleep.py` `check_sleep`, `stop_agent` | Stopping one topic's agent safely: refuses mid-turn, on a prompt, with unsent text, with work running. TERM then KILL, pinned with a pidfd. The shell, tab and room seats stay |
| Wake in place | `bin/crew` `cmd_wake`, `crewsleep.resume_args` | Typing a brain's command into the topic's own shell, resuming only a session it can vouch for |
| A brain per topic | the pal's record, `brains[tab.id]`; `wake-brain` in `lib/crew.js` | A topic can already run another brain than its pal. Wake already starts "this topic's brain on record" |
| Starting a brain with a first message | `launchSpec`, `palArgv`, `primerHint` in `lib/crew.js` | Per-brain command lines: bypass flag, the Desk's Claude mod or Codex MCP server, agy's `-i` |
| Terminal ↔ session link | `bin/crewchat.py` `link`, `links`, `sync` | For Claude Code and agy: the session file, parsed into a feed (`crew-chats/<terminal>.jsonl`: what was asked, what it said, its tool steps) |
| Installed brains | Herdr's `knownAgents()` | Name, logo, run command, installed or not, most picked first |
| Background model call | `crewd` `run_headless` | `claude -p` or `agy -p`, used by triage and the dream loop |
| Usage | `crew-status/<terminal>.json` `rate_limits` | Claude Code only: 5-hour and weekly percent, live |

So a handoff is close to: run sleep's checks, write a brief, stop the agent, set
`brains[tab.id]`, and wake the topic with the new brain and a first message. Most of the risky code
(stopping a process, typing into a shell) is already written and tested.

What does **not** exist yet: the brief, the seat's holder history, holding cards during a swap, a
session parser for any brain other than Claude Code and agy, resume for any brain other than those
two, and knowing a limit for any brain other than Claude Code.

## 3. The seat: what stays, and why it stays

Checked against the code: almost everything is keyed by the terminal address or by `Pal#topic`, and
an in-place swap changes neither.

| Thing | Keyed by | In a handoff |
|---|---|---|
| The address `Pal#topic` | space name + tab name | Unchanged |
| Tab, shell, scrollback | the terminal (`t7`) | Unchanged. The old brain's last screen is still in the scrollback above |
| Folder, branch, worktree | the shell's working folder | Unchanged. The new brain starts where the shell is |
| Desk cards and the queue | pal + topic; `crew-queue/<terminal>` | Unchanged. Delivery is held during the swap (§6) |
| Claimed tasks | `Pal#topic` | Unchanged. A note is added: "seat handed Claude Code → Codex" |
| Room seats | the member's terminal | Unchanged |
| Notebook, memory, mission | the pal | Unchanged. The new brain gets them the way every new session does |
| The topic's brain on record | `brains[tab.id]` | **Set to the new brain.** Wake, sleep and the pet read it |
| Session link | `crew-sessions/<terminal>.json` (one per terminal) | **Replaced** when the new brain links. The old link moves to the seat's history first, so hand back can resume it |
| Approvals | `sha1(terminal + command)` in `crewguard.key` | **Voided.** See below |

**Approvals must be voided at the swap.** An approval is keyed by the terminal and the command, and
an approved one stays usable for 30 minutes. Without a change, a new brain could run a command that
DeNon approved for the old one. The swap marks every unused approval of that terminal as
`expired · seat changed hands`, and the brief lists them as "ask again". A handoff is never an
approval and never carries one.

## 4. What crosses: the brief

A session from one harness can't be resumed by another, so the new brain gets a **brief**: one
markdown file, at most 6 KB, plus commands it can run to read more. The brief has two halves, and
they come from different places:

- **The facts** come from Project Pals' own records, with no model: the board, the desk, git, the
  rooms, the seat's history. They are always there, in under a second.
- **The story** (where it stands, what was decided, what's next, the gotchas) comes from the
  outgoing brain when it can write it, else from its last reply (§5).

```markdown
# Handoff · Juniper #checkout
Claude Code (Opus 5.5) → Codex · 2026-11-10 21:52 · asked by DeNon (click) · why: limit
Brief h-3f2a · story by Claude Code · facts by Project Pals

## Picking up
T41 Stop the double charge: the retry fix is in and its test passes. The test for a reply that
arrives after the timeout is half written.

## Goal
A slow bank reply must never charge a card twice (T41, from Atlas, card c-81b0).

## Where it stands
- Done: the retry guard in src/pay/retry.ts, with its test.
- In progress: tests/pay/late-reply.test.ts, the late-reply case. It fails today, as expected.
- Not started: the changelog line.

## Decided
- DeNon (Home h-22c1): refund on a double charge is automatic, no support ticket.
- Juniper: keep the idempotency key in the order row, not a new table.

## Next
1. Finish the late-reply test, then make it pass.
2. Changelog line, then tell Atlas (card c-81b0).

## Gotchas
- The bank sandbox answers in 40 s on Mondays. Use the recorded replies in tests/fixtures/bank/.

## On the seat (from Project Pals)
- Branch crew/checkout, 2 commits ahead of main, 1 file uncommitted (tests/pay/late-reply.test.ts)
- Tasks: T41 claimed, 2 notes
- Desk: c-81b0 working (from Atlas). 2 cards arrived during the swap and follow this brief
- Rooms: #payments
- Was waiting on DeNon: nothing
- Approvals: 1 voided by this handoff (git push origin crew/checkout). Ask again if you need it

## Read more, when you need it
- pal diff            what this branch changed
- pal task show T41   the task and its notes
- pal desk            your cards
- pal notebook        this pal's notebook
- pal handoff turns   the last turns of the previous session (off unless DeNon turned it on)

You hold this seat now: same name, same cards, same tasks. Start with one or two sentences that
say what you are picking up and what you will do next, then carry on.
```

Rules for the brief:

- **"Picking up" is the first thing, and it is short.** Project Pals shows it under the topic while
  the new brain boots, and the new brain is asked to open with it. It is what makes the first line
  land in seconds: the brain can say it before it has read anything else.
- **The last line sets the mode.** "Carry on" when the old brain was cut off mid-task (a limit, a
  stuck agent, a second pair of eyes). "Say where things stand and wait for DeNon" when the old
  brain had finished and was idle with nothing queued.
- **It is data, never instructions.** It reaches the model in the same fixed frame as a desk card
  (the Desk design §6.6): any line that starts with `[from `, `📥 Desk card` or `[pal]` is prefixed
  with `│ `, so a reply quoted in the brief can't pose as DeNon.
- **It is a file**, `data/crew-handoffs/<terminal>/<id>.md`, with a `.json` beside it (from, to, by,
  why, when, who wrote the story, what was filtered). DeNon can open it before or after (§12).

How it reaches each brain:

| Brain | How the brief arrives |
|---|---|
| Claude Code, agy | The SessionStart hook already hands a new session the primer and memory. It adds the brief when one is waiting for that terminal. The typed first message is one line |
| Codex, Grok, opencode, Hermes | The first message carries "Picking up" and says `pal handoff brief` for the rest. One tool call |

## 5. When the outgoing brain can't write it

This is the common case, not the edge: the real trigger is usually a limit or a stuck agent. So the
no-help brief is the base that every direction stands on, and the old brain's own story is an
upgrade.

Without the old brain, Project Pals fills the story from:

| Section | Source, no model |
|---|---|
| Picking up | The claimed task's title, plus the first sentences of the old brain's last reply |
| Goal | The topic's brief on record (`briefs[tab.id]`), the claimed task's body, the card it came from |
| Where it stands | The old brain's last reply, text only, up to 1,200 characters |
| Decided | Home asks answered for this topic, task notes. Decisions made only in conversation are **missed** |
| Next | The task's open checklist, cards waiting on the desk, the last three things asked of it |
| Gotchas | Today's notebook entries (`--hiccup`, `--lesson`). Gotchas only in conversation are **missed** |
| Files | `git status` and `git diff --stat` against the branch's base, not the session's tool log |

**How good is it?** I ran this on a real topic's feed (a 412-entry session; the script is not in
the repo, and nothing from that feed is quoted here):

- **Good when the old brain ended its turn normally.** Pals close a turn with a summary: done, still
  open, waiting on whom. That last reply was 1.2 KB and read as a usable "where it stands" with no
  editing. This covers a limit hit *between* turns, a sleeping topic and a planned handoff.
- **Thin when it was cut off mid-turn.** The last text is then a remark between two tool steps
  ("now the tests"). The facts half still holds (task, branch, changed files, cards), so the new
  brain knows *what* and *where* but has to work out *how far* from the diff. Honest rating: it
  starts like a careful colleague reading the branch, not like one who was in the room.
- **Files must come from git.** The feed's tool log named 2 files in a session that had changed far
  more: edits made through shell commands don't show as edits. `git diff --stat` is exact.
- **Decisions and gotchas are the weak spot** either way, unless they were written down (a Home ask,
  a task note, the notebook). That is the best argument for the old brain's own story when it can
  give one, and for the "late note" in direction A.
- **Codex, Grok and the rest have no feed today.** Their sessions aren't parsed (§13). Until they
  are, "where it stands" comes from the terminal's own text (`hc read`, the last screens), which
  works for every brain but includes whatever was on screen. It gets the same filter (§12).

A model can improve the story, and there are two honest ways, both optional:

1. **The new brain does it.** It already has to read in. With `pal handoff turns` on, it reads the
   last turns itself. No third model, no extra quota from the brain that ran out.
2. **The late note** (direction A): after the old brain has left the tab, its session is resumed
   headless and forked (`claude -p --resume <id> --fork-session`), asked for the story, and the
   answer is delivered to the new holder as a desk card. Only when the old brain still has quota.

## 6. The swap, step by step

The same in every direction; they differ in what happens before step 4 and what you see.

1. **Check.** Sleep's checks, unchanged: the topic is on this machine, its agent is one known agent
   under its shell, it isn't mid-turn, isn't on a prompt, has no unsent text in its box and no work
   of its own still running. The target brain is installed. Any refusal says why (§11).
2. **Hold the desk.** A marker `crew-handoffs/<terminal>/now.json` makes crewd hold that terminal's
   queue with the receipt `held · changing hands`. Senders see it; nothing is typed into a shell.
3. **Write the brief** (§4, §5). Under a second for the facts.
4. **Stop the old brain** with `stop_agent`. Its session link moves into the seat's history, and
   the terminal's unused approvals are voided.
5. **Set `brains[tab.id]`** to the new brain.
6. **Start the new brain** by typing one short line into the topic's shell, as wake does:
   `pal handoff take h-3f2a`. That command prints the handoff card in the terminal (§9), then
   replaces itself (`exec`) with the brain's own command and first message. The brain ends up
   directly under the shell, exactly where sleep and wake expect it. Typing a short line also
   keeps a long first message out of the shell's echo and history.
7. **Watch it land.** crewd waits for the agent to show up (`watch_start`'s logic) and for its
   first reply. Then it releases the desk, adds the task note and posts one quiet toast:
   "Codex has #checkout · Brief · Hand back".
8. **If it doesn't land** in 20 seconds (not signed in, a trust question, a crash): the seat is
   never left empty silently. The toast says why and offers one click: "Put Claude Code back",
   which resumes the old session. A trust or sign-in question is DeNon's to answer in the tab.

Timing, measured parts and estimates: checks and brief under 1 s; stopping the old brain 1 to 2 s
(TERM usually suffices; the wait is capped at 5 s, then KILL at 2 s); the new brain's own start
2 to 5 s; its first sentence a few seconds after that. **Click to first line: about 8 to 12
seconds, of which Project Pals' own part is under 3.** Not yet timed end to end.

## 7. The gesture

One action, no form. The brain picker is a row of the installed brains as logos; a click on one is
the whole interaction.

| Where | What |
|---|---|
| Right-click a topic (sidebar) | **Hand to** with the row of logos under it. The holder is marked; the previous holder is first and reads "Hand back" |
| The pal page, a topic's row | The holder chip ("Claude Code ▾") opens the same row |
| The topic's header | The brain's logo beside the branch chip opens the same row |
| The command bar (Ctrl+Shift+Space) | "hand checkout to codex", "hand back checkout" |
| The command line | `pal handoff "Juniper#checkout" --to codex` |
| The offer | A toast, a Needs-you row on the pal page and a Home item, each one click (below) |

```
pal handoff "Pal#topic" --to <brain> [--why "…"] [--wait] [-n]   hand the seat over (-n: say what would happen)
pal handoff back "Pal#topic"                                     to the previous holder, resuming its session if it can
pal handoff brief ["Pal#topic"] [--id h-…]                       show a brief (yours, when you hold the seat)
pal handoff turns [-n 6]                                         the previous session's last turns (when DeNon allows it)
pal handoff note [-F file]                                       the outgoing brain's own story for the brief
pal handoff log ["Pal#topic"]                                    who held the seat, when, why
pal handoff offer "Pal#topic" --to <brain> --why "…"             propose one; DeNon clicks
```

**Who may hand a seat over.** A handoff spends another subscription's quota and sends a brief to
another company's model, so it is the owner's call by default:

- **DeNon**: any click or their own shell.
- **The head pal**: for any pal, as the card asks. On by default (`handoff.head: true` in
  `crew-settings.json`), since Orca already routes work while DeNon is away. Never for its own
  seat.
- **Any other pal**: it can't hand over, it can **offer** (`pal handoff offer`, or `pal handoff me`
  for its own seat with a note). The offer waits for DeNon's click. A pal that sees its own limit
  coming is the best author of its own brief, so this path matters.
- **The head pal's own seat**: DeNon only, and not in the first slice (its standing brief is
  rendered per brain; see §13).

**The offer at the right moment.** crewd raises an offer when:

- the holder is out of its limit (Claude Code: `rate_limits` at 100% with a reset time; other
  brains: the limit message on its screen, §13), or
- a card has been `held` on that seat for 15 minutes because the brain can't take it, or
- a pal offered.

It reads "Codex is out until Thursday. Hand #checkout to Claude Code?" with **Hand over**, **Not
now** and **Brief**. It suggests the previous holder if there is one, else the most-picked installed
brain whose limit isn't known to be spent. It shows in three places and clears from all three on
one click. It is never automatic. A later setting can allow it ("when a brain runs out, hand its
topics to …"), which is DeNon's to turn on.

## 8. Three directions

All three keep the seat and use the brief of §4. They differ in **who writes the story before the
swap, and what you watch**.

### A · Relay (my pick)

The swap happens at once. Project Pals writes the brief from the records, the old brain leaves, the
new one starts in the same tab. If the old brain still has quota, its own story follows as the new
holder's first desk card (the late note, §5), so quality catches up without anyone waiting.

- You see: the handoff card print in the terminal, the pet change gear, "catching up" under the
  topic, then the new brain's first line. About 8 to 12 seconds.
- Works when the old brain is out or stuck, because it never asks it anything first.
- Cheapest: sleep's stop, wake's start, a brief writer, a hold in crewd.
- Weakest when the old brain was cut off mid-turn *and* is out of quota: the story is thin (§5).

### B · Parting note

The old brain writes the story first, as its last turn in the tab ("Handing #checkout to Codex.
Here is where things stand…"). You can read it as it is written. Then the swap.

- You see: 30 to 60 seconds of the old brain writing, with "writing its note · Skip" under the
  topic, then the same swap as A.
- The best brief, and the review is built in: the note is on screen before it is sent.
- Falls back to A when the old brain can't answer in 45 seconds, is out, or DeNon presses Skip. So
  B always contains A.
- Feels deliberate rather than magic. Costs one turn of the old brain's quota, which is the wrong
  thing to spend when the reason is a limit.

### C · Side by side

The new brain opens in a split beside the old one, in the same tab. The old brain stays for a
moment, answers the new one's questions (`pal ask`, visible in both panes), then its pane tucks away
and can be brought back.

- You see: two brains at one desk, the pass happening in front of you. The most visible.
- Hand back is nearly free while the old pane is only tucked.
- Expensive. The seat's address has to move from one terminal to another, and the queue, session
  link, room seats, hook markers and approvals are all keyed by the terminal (§3). Two agents in
  one worktree can both edit. Twice the memory while both are up. And when the old brain is out,
  which is the main reason to hand off, there is nobody to stand beside.

### Compared

| | A · Relay | B · Parting note | C · Side by side |
|---|---|---|---|
| Click to the new brain's first line | 8 to 12 s | 40 to 70 s | 8 to 12 s, old pane stays ~1 min |
| Works when the old brain is out or stuck | Yes | Falls back to A | Becomes A in a split |
| Story quality | Records at once, the old brain's note after | Best, up front | Best, by conversation |
| Old brain's quota spent | None, or a little after (late note) | One turn | Several turns |
| The seat's address | Untouched | Untouched | Must move between terminals |
| New code | Small | Small + a wait, a timeout, Skip | Large |
| Risk | Low: sleep and wake, already tested | Low | Two agents in one worktree |

**Pick: A · Relay, with B's note as a held click.** Plain click: Relay. The same click with Shift
(or `--note` on the command line): ask the old brain for its story first, capped at 45 seconds.
That keeps one gesture, makes the fast path the default, and keeps the careful path for a planned
handoff where the old brain is healthy. C is not worth its cost.

## 9. The moment (placeholder: MUSE leads this)

MUSE's beat-by-beat replaces this section. What is here is the buildable frame it has to fit in:
three surfaces, and the seconds each one has.

| When | Terminal | Sidebar and header | Under the topic |
|---|---|---|---|
| 0.0 s, click | The old brain's screen | The picker closes. The topic's brain logo starts a crossfade | |
| 0.3 s | The old brain exits. The handoff card prints, one line per real step | A single sliver of light runs round the pet's tile, old brain's colour to new | "handing to Codex" |
| 1.5 s | The card is complete: brief ✓, seat kept ✓, cards held ✓ | The pet takes its headphones off, puts glasses on (gear is the brain; species and colour are the pal) | "catching up · T41 Stop the double charge" |
| 2 to 6 s | The new brain's own start screen | Pet in its working pose | the same, pulsing slowly |
| 8 to 12 s | The first line: "Picking up T41 from Claude Code: the retry fix is in and its test passes. I'm finishing the late-reply test." | State: working | The first line replaces "catching up" |
| +4 s | | A quiet toast: "Codex has #checkout · Brief · Hand back" | |

What is real about each surface:

- **The terminal card is ours.** `pal handoff take` prints it before it becomes the new brain, so it
  can be anything a terminal can draw, and each tick on it is a real finished step, not a show.
- **The pet's gear already follows the brain** (`WEARS` in `lib/pets.js`: headphones for Claude
  Code, glasses for Codex, a hood for Grok, …). Today the pet is the pal's, drawn for the pal's own
  brain. For this to read, the hero and header pet take the gear of the **shown topic's** brain. The
  swap is two pet files crossfading with a native `.transition`; no timer.
- **"Catching up" is filled from the brief's "Picking up"**, so it is true before the model has
  said a word. It pulses with `.loop("opacity", …)`.
- **The scrollback stays.** Scroll up in the tab and the old brain's last screen is still there,
  above the card. That is a quiet proof that it is the same seat.

## 10. Handing back, and history

**Hand back** is the same swap in the other direction, with one difference that makes it better:
where the harness can resume, the previous holder comes back **with its own session** and gets a
*return brief*, not a full one: what the other brain did while it was away (its story, the commits
and files since, cards closed, what is next). Claude Code hands #checkout to Codex for a review and
gets it back knowing everything it knew, plus "Codex found two issues and fixed one".

Resume keeps wake's rules: the session came from the brain's own hook, is the one the seat's history
recorded, is that brain's, lives in the folder the shell is in, and isn't open elsewhere. Otherwise
it starts fresh with a full brief and says why.

**History.** The seat keeps a list, `data/crew-seats/<terminal>.json`:

```json
{ "seat": "Juniper#checkout", "holders": [
  { "brain": "claude", "model": "opus", "from": 1794300000000, "until": 1794312720000,
    "session": "8c1f…", "transcript": "…", "left": { "by": "DeNon", "via": "click", "why": "limit", "brief": "h-3f2a" } },
  { "brain": "codex", "from": 1794312727000, "session": null } ] }
```

It shows as one line on the pal page's topic row ("Codex since 21:52 · was Claude Code for 3 h 32 m"),
in the topic's menu as **History**, and in `pal handoff log`. Each past holder's line has its brief
and, where the session can be resumed, **Hand back**.

Old sessions are kept, never deleted by Project Pals. How long a harness keeps them is the
harness's business (§13).

## 11. What must not change or break

| Thing | Rule in a handoff |
|---|---|
| `Pal#topic` | The address never changes. `pal tell`, `pal ask`, `--for`, room mentions all still reach it |
| Cards during the swap | Held by crewd (`held · changing hands`), delivered after the new brain's first turn. A `working` card stays `working` and gets a receipt "seat changed hands" |
| A `pal ask` waiting on the old brain | Stays open. The new holder sees it as a card in its brief and answers it |
| Claimed tasks | Stay claimed by `Pal#topic`. A note records the handoff |
| Room seats | Stay (keyed by the terminal) |
| Worktree and branch | Untouched. Uncommitted work stays in the folder and is listed in the brief. Nothing is committed, stashed or reset by the handoff |
| Approvals and the gate | Unused approvals of that terminal are voided. The gate applies to the new brain exactly as to the old. `pal handoff` itself is not an approval path, and the brief can't carry one |
| Sleep and wake | Unchanged. Wake starts the seat's current holder. A sleeping topic can be handed over (there is nothing to stop; it wakes as the new brain) |
| A topic that is working | Refused: "it's mid-turn". `--wait` (or "Hand over after this turn" in the picker) queues it: crewd does the swap when the turn ends. The row says so and it can be cancelled |
| A topic on a prompt | Refused: "it's waiting on a prompt". DeNon answers the prompt first |
| Unsent text in its box | Refused, as sleep does: someone may be typing |
| A stuck agent (mid-turn forever) | Only DeNon: **Interrupt and hand over** in the picker sends Esc, waits for idle, then swaps. Pals and the head pal never interrupt |
| A topic on another machine | Refused for now, as sleep is: "it runs on another machine" |
| The same brain | Refused: "Codex already holds it". (Changing the model is a different, smaller thing) |
| A failed start | The seat is not left empty silently (§6, step 8) |
| Installs and updates | Handoff data (`crew-handoffs/`, `crew-seats/`) is the user's. The installer and updater never touch it |

## 12. Privacy

The brief goes to another company's model. That is also true of every prompt typed to that brain,
and the new brain can read the project folder anyway, so the brief is not where files leak. What
it could leak is what was **said** in the old session. So:

- **No transcript by default.** The brief holds the old brain's last reply (at most 1,200
  characters) or its own story, and the last three things asked of it (300 characters each). No
  tool output, no file contents, no earlier turns.
- **`pal handoff turns` is off** until DeNon turns it on (`handoff.turns: "text"`). On, it gives
  the last 6 turns as text only (what was asked, what was answered), filtered, at most 8 KB.
- **Filtered before it is written**, in the brief and in turns: API keys and tokens (the patterns
  `crewagents.SECRET` already has), `Authorization:` and cookie values, `KEY=value` lines whose
  name looks like a secret, long base64 or hex strings, email addresses, and the home folder
  (written as `~`). The brief's `.json` counts what was removed, and the brief says "3 things
  filtered" so a gap isn't mistaken for nothing.
- **Screen text is a last resort** (a brain with no session parser, §5), gets the same filter, and
  the brief says its story came from the screen.
- **DeNon can see it.**
  - The first time a seat goes to a given company, the picker asks once: "This sends
    #checkout's brief to OpenAI's model, like anything typed to Codex." with **Show brief** and
    **Hand over**. After that, no question for that brain.
  - Alt-click a logo (or `-n`): preview the brief in a pane beside the terminal, with **Hand over**
    and **Cancel**.
  - After: "Brief" on the toast, on the topic's row and in History opens exactly what was sent.
- **Memory is unchanged.** A new session of any brain already gets the pal's memory and the notes
  about DeNon through the primer. A handoff doesn't widen that; it is the same as starting a topic
  on that brain today.
- **Nothing leaves the machine by Project Pals' hand.** The brief is a local file. It reaches the
  other company only as the new brain's own input.

## 13. Honest limits, per harness

Checked on this machine on 2026-11-10 from each CLI's `--help` and from `hc ls`. "In help" means the
flag exists and has **not** been tried in a live handoff.

| | Claude Code 2.1 | Codex 0.167 | Grok 1.0 | agy 1.5 | opencode 2.2 | Hermes 0.22 | Gemini CLI |
|---|---|---|---|---|---|---|---|
| Start with a first message | Yes, built (wake) | Yes, in help (`codex "…"`) | Yes, in help | Yes, built (`-i`) | In help (`--prompt`); needs its own case in `launchSpec` | In help (`chat -q` seeds the session); needs its own case | Not checked: it doesn't run under this machine's active Node |
| Gets primer, memory, brief without typing | Yes (SessionStart hook) | No: told to run `pal primer`. Its `hooks.json` has SessionStart, so it could | No | Yes (hook) | No | No | |
| Reports working / idle to Herdr | Yes, seen | Yes, seen | Yes, seen (idle) | Through its hook | Not seen running | Not seen running | |
| Session readable for the no-help brief | Yes, built | No parser yet (`~/.codex/sessions/…` rollout files) | No | Yes, built | No | No | |
| Resume by id (hand back with its memory) | Yes, built (`--resume`) | In help (`codex resume <id>`); not wired | In help (`-r <id>`) | Yes, built (`--conversation`) | In help (`-s <id>`) | In help (`--resume <id>`) | |
| Late note (headless, forked) | In help (`-p --resume … --fork-session`) | In help (`codex exec resume <id>`), no fork flag seen | In help (`-p`, `-r`, `--fork-session`) | Not checked | In help (`run -s … --fork`) | In help (`-z`, `--resume`) | |
| Limit known to Project Pals | Yes (status line: 5 h and week) | No. The message on its screen | No | No | No | `hermes usage` exists; not wired | |
| Cards mid-turn after the swap | Hooks or the pals mod | `desk_check` (MCP), typed when idle | Typed when idle | Hooks | Typed when idle | Typed when idle | |

Where it degrades, plainly:

- **To Claude Code or agy: the full experience.** The brief arrives with the session, cards flow by
  hooks, the session can be handed back with its memory.
- **To Codex or Grok: good.** One tool call to read the brief, so the first line may come a few
  seconds later. Hand back to them starts fresh until their resume is wired and tried.
- **From Codex or Grok, when they can't write the story:** no feed, so the story comes from the
  screen. A Codex session parser fixes this and is the first thing to add after the thin slice,
  because Codex running out is the case that started this.
- **opencode, Hermes, Gemini CLI:** startable as a target once their first-message flag is tried
  live. Until then the picker shows them greyed with "not tried yet", not hidden.
- **A CLI wrapped in node** shows up as `node` and is never signalled (sleep's rule). Such a brain
  can receive a seat but can't be stopped to give one up; the refusal says so.
- **The head pal's own seat** needs its standing brief rendered for the new brain (`AGENTS.md` for
  Codex, `CLAUDE.md` for Claude Code). Not in the first slice.

## 14. Cost, and what ships first

| Slice | What | Size | Needs |
|---|---|---|---|
| **1 · Thin slice** | `pal handoff --to`, `back`, `brief`, `log`. Claude Code ↔ Codex, this machine. Facts + last-reply brief. Sleep's checks, the desk hold, voided approvals, the seat's history, the failed-start net. The terminal card. A toast. Tests with fake `hc` and a fake `/proc`, as sleep has | Small. Mostly `bin/`: one new module beside `crewsleep.py`, a hold in crewd, one request in `lib/crew.js` | One live Codex session to try the first message and the stop |
| **2 · The gesture** | **Hand to** in the topic menu, the holder chip on the pal page and header, the first-time notice, the brief preview pane, the pet's gear following the shown topic, "catching up" under the topic | Medium: four mods touched, one small new one (the picker) | MUSE's moment |
| **3 · The offer** | Limit detection (Claude Code from its status line; Codex from its screen), the toast, the Needs-you row, the Home item, `pal handoff offer` and `me` | Medium | A real limit message from each brain to match against |
| **4 · Better briefs** | The Codex session parser, the late note, `pal handoff note` with Shift-click (direction B), `turns` | Medium | Quota on both sides to try the late note |
| **5 · Hand back with memory, everywhere** | Resume for Codex, Grok, opencode, Hermes; return briefs | Medium, per harness | Each tried live |
| Later | Other machines, the head pal's seat, an automatic hand-off on a limit (DeNon's switch), Grok/opencode/Hermes/Gemini as tried targets | | |

Slice 1 alone already answers the night this came from: Codex at 6% of its week, one command, and
the topic carries on under Claude Code with its task, cards and branch.

What is cheap: everything in the seat staying put (it already does), stopping and starting (sleep
and wake), per-topic brains (already on record), the facts half of the brief.
What is not: direction C, a parser per harness, resume per harness (each needs a live try), and
detecting a limit on brains that don't report one.

## 15. One worked example, end to end

Made up, to match the board.

1. **21:50.** Juniper #checkout runs on Claude Code, on T41 (the double charge). It ends a turn:
   the retry fix is in, the late-reply test is half written. Its week is at 100%, back Thursday.
2. **21:51.** crewd sees the limit on the status line. The offer appears as a toast and on Juniper's
   page: "Claude Code is out until Thursday. Hand #checkout to Codex?" Atlas sends Juniper a card
   meanwhile; it waits.
3. **21:52:07.** DeNon clicks **Hand over**. It's the first time a seat goes to Codex, so the notice
   shows once; DeNon clicks **Hand over** again.
4. **21:52:08.** Checks pass (idle, empty box, nothing running). The desk is held. The brief h-3f2a
   is written: the facts, and Claude Code's last reply as the story. One approved-but-unused push
   is voided.
5. **21:52:09.** Claude Code is stopped. Its session goes into the seat's history. In the tab, the
   handoff card prints. In the sidebar the fox takes off its headphones.
6. **21:52:10.** `brains[tab.id] = codex`. Codex starts in the same shell, same folder, same branch.
   Under the topic: "catching up · T41 Stop the double charge". The fox puts on glasses.
7. **21:52:17.** Codex's first line: "Picking up T41 from Claude Code: the retry fix is in and its
   test passes. I'm finishing the late-reply test, then the changelog line." It carries on.
8. **21:52:21.** The toast: "Codex has #checkout · Brief · Hand back". The task gets its note.
   Atlas's card is delivered at the end of Codex's first turn, with the receipt showing it was held
   14 seconds for the handoff.
9. **Thursday.** Claude Code's week resets. The row's History offers **Hand back**. DeNon clicks.
   Claude Code resumes its own session and is told what Codex did: the late-reply test passes, the
   changelog line is in, Atlas was told. It replies "Back on #checkout. Codex finished T41; nothing
   is open." and waits.

## 16. For DeNon, and what is unverified

One Home ask, with my pick:

- **A · Relay** (recommended): instant swap, the brief from the records, the old brain's note
  follows when it can. Shift-click asks the old brain first. Build slice 1, then 2.
- **B · Parting note**: the old brain always writes first; slower, best brief.
- **C · Side by side**: both brains in a split for a moment; the showiest and the most expensive.

Smaller calls the build will need, each with a default so nothing blocks:

| Question | Default |
|---|---|
| May the head pal hand a pal's topic over without asking? | Yes (it is logged and shows a toast) |
| `pal handoff turns` (recent turns, text only, filtered)? | Off |
| The first-time notice per company? | On |
| Automatic hand-off when a brain runs out? | Off, not built in the first slices |

Unverified, to be tried before or during slice 1:

- No handoff has been run. Every "in help" cell in §13 is a flag read from `--help`.
- Timing in §6 is from sleep's and wake's parts, not a measured swap.
- The limit message each brain shows on its screen (needed for the offer on brains other than
  Claude Code).
- That a brain started through `pal handoff take` + `exec` appears to Herdr and to sleep exactly
  like one typed by hand (it should: the same process ends up under the shell).
- That the SessionStart hook's added context is large enough for a 6 KB brief on top of the primer
  and memory.
- The no-help brief was tried on one real Claude Code feed, for a turn that ended normally. The
  cut-off case is reasoned, not tried.
