# Layouts: Focus and Pro

Status: design proposal (2026-11-08). Nothing here is wired in. Paper boards are on the
**Design system** page of the pixel-study file:

- **MODE · Focus (default)**: the Grok-leaning fusion (FUSION · A), retinted to the shared DS tokens.
- **MODE · Pro**: the DS-leaning fusion (FUSION · C), with the shared composer.
- **MODE · Switching Focus ⇄ Pro**: where the switch lives, what moves where, and a storyboard.

DeNon asked for both fusion layouts, with A as the default. (Orca read "fusion and fusion A" as
A + C; if DeNon meant B, Pro would swap to B's layout, and the rest of this doc still holds.)

## The idea

One app, two densities. Pro is Focus with its panels opened up, never a different app:
same tokens, avatars, components, data, and the same composer. Switching only changes widths
and which nodes are shown. Content never re-orders and a draft never gets lost.

| | **Focus** (default) | **Pro** |
|---|---|---|
| For | Talking to one pal, reading, the everyday | Running several pals, reviewing work, watching tools |
| Left | 304 px sidebar: **hero pal** (hero v2 Floor: no box, the pet full width on a lit floor, name + state, channel chips, quick actions), then the **pal list** with avatar, name, `[tag] preview`, time, unread/state dot, and "Hidden pals N" | **Pal rail** 60 px (avatars + state dots, same order) + **list column** 264 px: banner pal card (art cropped to 150 px), the active pal's **channels** with previews, and "Across pals" (working / needs you) |
| Header | `# channel ▾` picker on the left, **pal name chip centred**, branch chip on the right | **Channel tabs** (30 px, r4), name chip at the right end |
| Chat | Centred 720 px column, 28 px between groups, airy | Fluid column, 16 px between groups, inline **tool log** under replies |
| Right | Nothing: the chat takes the full width (the rail was removed 2026-11-08; terminal via Chat · Terminal) | **Inspector** 320 px: Run / Tasks / Memory tabs, Tasks list, **Changes** with +/− per file, **Terminal** tail, and Fold |
| Composer | **Shared** (below) | **Shared**, full width |
| Status bar | working count · usage · **mode switch** · version | Same, plus needs-you count and git ahead/behind |

Hidden in Focus (one click away, never removed): channel tabs, the Changes list, the terminal tail,
the tool-log detail (a single tool chip shows instead), and the cross-pal summary (state dots in the
pal list carry it).

### Shared pieces (identical in both)

- **Tokens:** the DS set in `analysis.md`: near-black surfaces, 1 px hairlines, radius 3/4/6/8, Inter + JetBrains Mono.
  FUSION A's navy tint is dropped; near-black stays until DeNon decides otherwise.
- **Avatars:** pocket pets, bare, on a faint container (`#131316`, 7% white hairline, radius w/35; DeNon's
  pick "A · Faint + 1 · Lightsaber", 2026-11-08). Sizes: 75×59 bare (no box, a state pool under it) in the Focus pal list (68 px rows), 44×34 in the Pro rail, 30×24 / 25×20
  in the name chip, full width on the hero card and banner.
- **Composer:** one component, a r8 box with two rows: the prompt, then `+` · model dropdown · permission dropdown ·
  (spacer) · mic · voice · send. Only its width differs (720 in Focus, fluid in Pro).
- **Messages:** grouped stacks of r4 rectangles, the avatar once per group, quiet centred timestamps between groups,
  and your own messages as **option A** (r4 slab + 2 px edge in your colour) until DeNon picks A or B.
- **States:** dots/tags as today; "closing" stays as is until DeNon picks grey vs red outline.

## Switching

Four ways in, one setting behind them:

1. **Status bar segmented control** `Focus | Pro`, bottom right, same spot in both modes.
2. **Shortcut `Ctrl+Shift+M`** (M for mode) toggles. Checked on 2026-11-08: it's free in the user's
   `~/.config/herdr-app/keys.json`, in every default key compiled into the Herdr binary, and in the installed mods.
   It's bound in the `global` map like Herdr's other `ctrl-shift-*` keys, so Herdr takes it before any terminal
   sees it. (In legacy terminal encoding it would read as Ctrl+M, i.e. Enter, which is why it must stay global.)
   Rejected: `Ctrl+\` is SIGQUIT in terminals, and `Ctrl+Shift+L` is Herdr's own `layout.switch`.
3. **In place:** Pro's inspector **Fold** returns to Focus. (Focus had a rail with Expand until 2026-11-08; see below.)
4. **Settings › Appearance › Layout:** two picture radio tiles (Focus *default*, Pro), plus an optional
   "Remember a layout for each pal" (off by default).

**No right rail in Focus (DeNon, 2026-11-08).** Focus first had a 48 px rail of icons (Tasks · Files · Branch ·
Terminal, Expand) that peeked one inspector section beside it. DeNon compared Focus with their Grok Bot app (sidebar,
chat and composer, the chat taking the full width) and had the rail removed: the chat column recentres in the freed
width, and Tasks, Changes and Branch live in Pro. No peek by default;
if one comes back it opens from the pal-chip dropdown or the header, never a rail.

**Motion:** 180 ms ease-out on widths only. The sidebar goes 304 → 60 + 264, and the inspector opens at 320 (sections fade
in after 60 ms). The chat column's max-width releases, and scroll stays anchored on the last visible message. With
reduce-motion on, the switch is instant.

## What gets remembered (per user)

Stored with the other UI prefs in `data/crew-settings.json` (mirrored to shared `crew.settings`, as now):

| Key | Default | Notes |
|---|---|---|
| `layoutMode` | `"focus"` | `"focus"` or `"pro"`. Last choice wins and survives restarts and updates. |
| `layoutPerPal` | `false` | When on, `layoutModeByPal[<pal>]` overrides `layoutMode` for that pal. |
| `focus.sidebarPx` / `pro.listPx` / `pro.inspectorPx` | 304 / 264 / 320 | Each mode remembers its own drag widths, so switching never fights a resize. |
| `pro.inspectorTab` | `"run"` | The last inspector tab. |

Not remembered: an open peek, the scroll position, the composer draft (that belongs to the channel, as today).
Per-pal data under `data/` is never touched by the switch (see AGENTS.md rules of thumb).

## Implementation plan for the mod (not started)

Small steps. Each step ships alone behind `layoutMode` defaulting to today's behaviour until the last one.

1. **Tokens first.** Move the DS colours, radii and spacing into `lib/crew.js` as one `ds` object (dark + light), and
   swap the hard-coded `rounded(14)`/`rounded(18)` for `ds.r.*`. In `layouts/pals.json`, set the sheet's `radius: 18`
   to 8 or 0 (hairline split). This is visible but low-risk. Check it with the throwaway-HOME install from AGENTS.md
   plus `herdr-app shot`.
2. **One layout, two shapes.** Keep a single `pals.json` (so updates and `layout.reset` stay simple) and add nodes:
   - `pal-rail` (block, 60 px, a new small mod or a narrow mode of `crew-roster`) left of `sidebar`;
   - (a Focus `rail` block of icons right of `panel` was built, then removed on 2026-11-08: see "No right rail".)
   A mode is then a list of `layout.show`/`layout.hide`/`layout.resize` calls:
   Focus = hide `pal-rail`, `panel`, and `crew-tabs`; show `crew-header`; resize `sidebar` 304.
   Pro = show `pal-rail`, `panel`, and `crew-tabs`; hide `crew-header`; resize `sidebar` 264 and `panel` 320.
   The roster already does this kind of thing (`toggleRail()` resizes `sidebar`); reuse that pattern.
3. **`setMode(mode)` in `lib/crew.js`.** It runs the calls above, writes `layoutMode`, and saves and restores the per-mode widths.
   The roster calls it on start, so the remembered mode comes back.
4. **Commands + keys.** Add `mode` / `mode.focus` / `mode.pro` to the roster's `nextCommand()` loop
   (callable as `crew-roster.mode` from `keys.json`, `herdr-app do` and the command palette). The installer adds
   `"ctrl-shift-m": "crew-roster.mode"` to the `global` map **only if that key is free**, and never rewrites a user's existing binding.
5. **Roster renders by mode.** Focus draws the hero card + pal list with previews (the `[tag]` is the channel name or
   the last task tag). Pro draws the banner card + channel list + "Across pals". Both use the same row and avatar code.
6. **`crew-header`** shows the channel picker and centred chip in Focus, and the tab strip's chip in Pro (it reads `layoutMode`).
7. **`crew-side` becomes the inspector** (Run/Tasks/Memory, Changes, Terminal) and also renders a single section,
   (Focus no longer peeks; Pro shows it.)
8. **`crew-composer`** gets the shared two-row control set (model, permission, mic, voice) in both modes. Mic and voice
   are UI only until a dictation backend is chosen (likely Softly; that's a cross-project call for Orca).
9. **Status bar switch + Settings tile**, then flip the default to Focus.
10. **Checks:** release preflight, `herdr-app check` on each mod, a throwaway-HOME install (fresh, then over an existing one,
    then `--no-helpers`), and screenshots of both modes and both themes. Shipping needs DeNon's go, per AGENTS.md.

Open before building: the A vs B bubble, closing grey vs red outline, near-black vs navy, and whether "fusion" meant C.


## Terminal-first: the chat view is removed (DeNon, 2026-11-08)

DeNon felt a chat view fights Herdr's nature: the channel's terminal is the main view in both Focus
and Pro, and a real chat belongs to the parked native app later. Removed: the `crew-chat` mod
(and its session-file feeds, `bin/crewchat.py`), the Chat | Terminal switch, and the composer for
channels. The composer stays for rooms only (a room has no terminal). The prompt card that answered
Claude Code's permission prompts and questions moved to a floating block over the terminal
(`crew-prompt`), then was removed the same day: it repeated the terminal's question and covered it. On the Paper boards, everything drawn in the chat column (bubbles, groups, the tool
log, the channel composer) is history: read that column as the channel's terminal.
