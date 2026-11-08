# Design system: analysis of the structured reference

Reference: `docs/refs/ds-ref-structured.png` (1920×1200, a dark desktop agent app; someone else's
product, kept out of commits). This captures its *system* (surfaces, lines, radii, rhythm), not
its branding. All numbers are measured from the PNG with ImageMagick pixel scans (row/column runs,
bounding boxes, brightest-pixel sampling), not eyeballed.

**Scale caveat (a guess):** text cap heights are 11–13 px, which in Inter means 15–18 px type. That's
large for a 1× desktop app, so the shot is probably at roughly 1.1–1.15× UI zoom. Below, **"ref px"**
is the raw screenshot value. **"PP token"** is the value proposed for Project Pals, scaled about 0.85× and
snapped to a 2/4 px grid so it fits Herdr's narrower sidebar.

Why ours feels floaty: the current mods draw cards with `rounded(14)` and `rounded(18)`, roughly 2–3× the
ref's radii, and separate regions with floating rounded panels where the ref uses straight 1 px lines.

---

## 1. Surfaces (sampled)

The ref is near-black, neutral (a hair cool) and flat: no shadows, no gradients except a faint
vignette at the window's top and bottom edges (≈ #060606 to #0C0C0C over 10 px; ignore it).

| Role | Ref sample | Where | PP token |
|---|---|---|---|
| Base / app | `#0C0C0C` | tab strip, chat column top | `--bg-0 #0B0B0C` |
| Panel | `#0E0E0E` / `#0D0E0E` | sidebar, sessions column, status bar | `--bg-1 #0E0E0F` |
| Inset (field) | `#0C0C0C` inside a hairline | sidebar search box (darker than its panel) | `--bg-inset #0A0A0B` |
| Raised 1 | `#161617` | inactive tab, chat area bottom | `--bg-2 #161617` |
| Raised 2 | `#181819` / `#1A1A1B` | Working panel, composer fill | `--bg-3 #1A1A1B` |
| Selected | `#232323` | selected sidebar row, active tab, active segment | `--sel #232324` |
| Selected card | `#242526` | selected session card (slightly cool) | (same as `--sel`) |
| Control fill | `#2F2F30` to `#313132` | model/access dropdowns, + button | `--ctl #2E2E30` |
| Code chip | `#1F1F20` | inline path chips | `--chip #1F1F21` |

That makes 3 flat steps for regions (bg-0 / bg-1 / bg-2–3), plus 2 interaction steps (sel, ctl).

## 2. Lines

| Role | Ref | PP token |
|---|---|---|
| Hairline (column split, section rule) | `#1D1D1E`, exactly **1 px** (x=376, y=83/128/173) | `--line #1E1E20` |
| Hairline, soft (under tabs, status bar top) | `#161617`, 1 px | `--line-soft #18181A` |
| Field border (search) | `#1E1E1E`, 1 px | `--line` |
| Strong border (composer) | `#3E3F3F`, 1 px | `--line-strong #3C3C3F` |

Every border is 1 px. There are no 2 px borders and no drop shadows anywhere. Columns are split by a
single hairline, never by gaps or cards.

## 3. Text (brightest-pixel samples; regular weight never quite reaches its true colour because of anti-aliasing)

| Role | Ref | Examples | PP token |
|---|---|---|---|
| Primary | `#E7E7E7` to `#E9E9EA` | titles, selected item, active tab, bold in chat, dropdown labels | `--fg-1 #EDEDED` |
| Body | ≈ `#C4C4C4` (peak `#BEBFBF`) | assistant message text | `--fg-body #C8C8C8` |
| Secondary | `#7A7A7B` to `#7F7F7F` | nav items (Inbox, Notes), section labels, inactive tab/segment, "worked for" | `--fg-2 #808082` |
| Tertiary | `#6F7070` / `#707071` | session meta (model, date), branch line, composer placeholder | `--fg-3 #6A6A6C` |
| Faint | `#5A5A5B` | search placeholder, timestamps, icon strokes | `--fg-4 #56565A` |
| Disabled | `#424243` | "Current checkout" | `--fg-5 #404043` |

Contrast on `#0E0E0E`: fg-1 ≈ 16:1, fg-2 ≈ 4.9:1, fg-3 ≈ 3.6:1. Keep fg-3/fg-4 for meta only, never
for anything you must read to act.

## 4. Accent (used sparingly)

| Role | Ref | Use | PP token |
|---|---|---|---|
| Success, bright | `#6DE4B4` | "+179" diff counts | `--ok-hi #6EE3B4` |
| Success | `#34D098` | ✓ Done | `--ok #34D098` |
| Warning | `#E8AA09` | shield on "Full access" | `--warn #E8AA0A` |
| Info / live | `#4CA1F2` | status dot "Working" | `--info #4CA1F2` |
| Danger | `#F47070` | usage meter bar | `--err #F06C6C` |
| Primary action fill | `#324960`, glyph `#71808F` | send button (muted slate-blue, not saturated) | `--act #2F4760`, `--act-fg #A9C3DD` |
| User bubble | `#273D51` | user message background | `--me #22364A` |

Colour shows up as text, small glyphs or 6 px dots, almost never as a fill. The only coloured fills
are the send button, the user bubble and the 24 px tab icon tiles.

## 5. Radius (measured from where the anti-aliasing curve meets the straight edge)

| Element | Ref | PP token |
|---|---|---|
| Code/path chip | ≈ 4 | `--r-xs 3` |
| Tab icon tile (24 px) | ≈ 4 | `--r-xs 3` |
| Segmented-control segment | ≈ 5 | `--r-sm 4` |
| Selected list row, session card, tab, dropdown button, send | ≈ 6 | `--r-md 6`, or `--r-sm 4` on short controls |
| Working panel | ≈ 6 | `--r-md 6` |
| Composer | ≈ 12 (the largest) | `--r-lg 8` (tightened on purpose) |
| User bubble | full pill (h/2 ≈ 22) | **replaced:** `--r-sm 4` rectangle (see §11) |

Scale: **0 / 3 / 4 / 6 / 8**. Nothing gets more than 8 px, and nothing is fully rounded except 6 px status dots.

## 6. Spacing (ref px; it's a 4 px rhythm)

- Column header height: 48 (window top to the first hairline at y=83)
- Toolbar rows (segmented row, search row): 44 between hairlines (84–128, 129–173)
- Sidebar row pitch: 41 (Inbox 148, Notes 189, Automations 230); selected row is **40 tall**
- Session card: 100 tall (3 lines: meta 14 / title 18 / branch 13 with 6–8 gaps), 290 wide, 8 px side inset
- Tabs: 34 tall, **4 px gap** between tabs, about 278 wide
- Row inset from the column edge: 8 (selected row starts 8 px inside); text inset: 40 (icon 18 + 12 gap)
- Composer: 102 tall; 12 inner padding; control row of 32-tall buttons with 8 px gaps
- Chat column: text measure about 975 px (787 to 1762); paragraph gap about 20; line-height 30 on 17 px (1.75)

PP spacing scale: **2, 4, 6, 8, 12, 16, 20, 24, 32**. Row heights: dense 28, default 32, tall 36.

## 7. Control heights

| Control | Ref | PP |
|---|---|---|
| Segmented segment | 30 | 26 |
| Dropdown / chip button | 32 | 28 |
| Icon button (+) | 28–30 square | 28 square |
| Send | 30 × 28 | 28 square |
| Search field | 40 | 32 |
| Nav row (selected) | 40 | 32 |
| Tab | 34 | 30 |
| Status bar | 34 (plus 1 px hairline) | 26 |

## 8. Type

Families (closest free fonts):
- UI sans: proportions and the single-storey/double-storey glyphs match **Inter** (a near-exact
  fit; Geist is a close alternative). Weights seen: **400** body/nav, **500** titles/active items,
  **600** "Workspace" header and bold spans. No light weights, no italics.
- Mono: paths/code chips look like **JetBrains Mono** (installed here as JetBrainsMono Nerd Font);
  **Geist Mono** and **IBM Plex Mono** are fine alternatives.

| Role | Ref cap height → size | PP size / line-height / weight |
|---|---|---|
| Chat body | 13 → ~17 | 14 / 22 / 400 |
| Nav item, header "Workspace" | 13 → ~17 | 14 / 20 / 400 (header 600) |
| List title (session) | 12 → ~16 | 13 / 18 / 500 |
| Tab label, segment, section label | 11 → ~15 | 12 / 16 / 500 (section label 500, fg-2, sentence case) |
| Meta (model, date, branch) | 11 → ~15 | 12 / 16 / 400, fg-3 |
| Mono chip | 11 → ~14.5 | mono 12 / 16 / 400 |
| Status bar | 11 → ~15 | 11 / 14 / 400 |

Section labels ("Monos", "Projects") are **not** uppercase or tracked. They're sentence case, the same size
as meta, and muted. Letter-spacing is 0 everywhere.

## 9. Icons

Outline icons in the Lucide family (inbox, sticky-note, zap, search, git-branch, copy). Box **18 px**
in nav, **15–16 px** in toolbars/actions, **13 px** inline (branch). Stroke ≈ **1.5 px**, round caps,
colour `fg-4` (#5A5A5A) at rest and `fg-2` when active. Same stroke weight everywhere. Free:
**Lucide**, stroke-width 1.5.

## 10. States

| State | Look |
|---|---|
| Selected (row, card, tab, segment) | flat fill one step up (`#232323` on `#0E0E0E`), text goes fg-2 → fg-1. No border, no accent bar, no glow |
| Hover | not visible in the shot. **Guess:** a half step, `#18181A`, same shape as selected |
| Focus | not visible. Composer shows a stronger 1 px border (`#3E3F3F`) when active, so **guess:** focus = 1 px `--line-strong`, with an accent ring only for keyboard focus (1 px `--info` at 60 %) |
| Live | 6 px dot, `--info`, beside a muted label ("Working 2") |
| Done | `--ok` ✓ glyph plus a word, no fill |
| Count badge | bare coloured text ("+179"), right-aligned, no pill around it |

## 11. Proposals for Project Pals

- **User bubble, no oval:** a rectangle with `--r-sm 4`, fill `--me`, right-aligned, max 70 % measure,
  12/8 padding, plus a 2 px right edge in the pal's identity colour so "who's talking" reads without
  roundness. Alternative: no fill at all, just a right-aligned block with a 1 px `--line` border.
- **Pills → tags:** every status chip/tag becomes a 20–22 px tall rectangle, `--r-xs 3`, 1 px
  border or a 10–15 % tinted fill, uppercase-free 11–12 px label.
- **Pal tiles (dotface):** 24 px square tiles with `--r-xs 3`, the dotface on a near-black LED field.
  Pal identity colour lives in the tile, state lives in a 6 px dot or the tile's 1 px edge.
- **Regions:** sidebar | channel chat | (optional) right panel, each split by one 1 px hairline,
  each with a 40 px header ending in a hairline, and a 26 px status bar under a hairline.

---

## 12. Explored in Paper (step 2)

The file `Project Pals — Geek mascots · hi-fi pixel study` has a new page, **Design system**:

- **DS · Tokens:** surfaces, text, lines, accents, radius, spacing, type, plus the components: buttons,
  rectangular tags/status chips, segmented control, dropdown, channel tabs, pal rows (rest/hover/
  selected/focus), task card, input, composer, the two non-oval "your message" options, status bar.
- **DS · Project Pals screen:** 1440×900 dark. Pals sidebar with dotface tiles, channel tabs,
  chat feed with tool chips and a state strip, composer, tasks panel, status bar.
- **DS · Light check:** 880×520, the same pieces inverted.

Light tokens (first pass): bg `#FFFFFF`, panel `#F7F7F8`, raised `#F0F0F1`, sel `#E8E8EA`,
line `#E4E4E7` (`#EDEDF0` soft), line-strong `#C9C9CE`, fg-1 `#111113`, body `#2E2E31`,
fg-2 `#6B6B70`, fg-3 `#8A8A90`, ok `#0F8A5F`, info `#1F7AD6`, warn text `#8A5A00`, me `#E3ECF5`.
Dotface tiles stay dark LED panels in both modes.

Pal tiles come from `tiles.mjs` (pocket-pet engine, corners squared from r17 to r3) and are written
to `tiles/*.svg`.

## 13. Open questions / guesses

- UI zoom of the ref (≈1.1–1.15×) is inferred from cap heights, so the PP sizes are a scaled guess.
- Hover and keyboard focus aren't visible in the ref; both are proposals.
- **State colours clash:** DOTFACE draws ASKS YOU with a green frame (same as DONE), and STUCK in amber.
  The DS uses amber for "needs you". Pick one mapping before wiring anything in.
- User bubble: A (r4 slab plus a 2 px identity-colour edge) is recommended; B (outline) is the dense option.
