// Pal look (Project Pals settings → Pal look, DeNon 2026-11-09): colour presets for the pets and
// for their laptop screens. Kept pure (no Herdr imports) so node tests can cover it:
// node tests/test_pallook.mjs. install.sh copies this file into every mod next to crew.js.
//
// Two choices, saved together as "palLook" in crew-settings.json (the installer and the updater
// never touch that file, so the choice survives updates):
//   pets    who gets which colour: each its own (today), all one, a 2/3/4-colour split by count,
//           by brain, by state, by project or factory, or the theme's colours
//   screen  the laptop screen: the state's light (today), the pal's colour, its contrast pair, or
//           one colour for all
// A pal's hand-picked colour (its own Look dialog) is never changed by a preset: it shows under
// "Each its own" and comes back whenever you return to it.
//
// crewLook(look, pals, ctx) turns the saved choice and the crew, in sidebar order, into what
// pets.js draws: { color, tones?, screen? } per pal (petSpec takes them as they are).

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function hash(s) { let h = 2166136261; for (const ch of s ?? "") h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

export function toHsl(c) {
  const [r, g, b] = hx(c).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor((((h % 360) + 360) % 360) / 60)];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
// The colour across the wheel from `c`, kept bright enough to be a screen. A grey pal (pearl,
// cream, ink) has no opposite: it gets the cool white of a real screen.
export const NEUTRAL_SCREEN = "#9fd8ff";
export function contrastOf(c) {
  if (!HEX6.test(c ?? "")) return NEUTRAL_SCREEN;
  const [r, g, b] = hx(c).map((v) => v / 255), [h, s] = toHsl(c);
  if (Math.max(r, g, b) - Math.min(r, g, b) < 0.1) return NEUTRAL_SCREEN;   // by chroma: a pale tint has a high HSL saturation
  return fromHsl(h + 180, Math.max(0.78, Math.min(1, s)), 0.64);
}

// ---------- the presets ----------
export const PET_LOOKS = [
  ["own", "Each its own", "Every pal keeps the colour it has: the one you picked for it, else its brain's, else one from its name."],
  ["one", "All one colour", "The whole crew in one colour you pick. Only the screens and the tile's edge change."],
  ["split", "Split by count", "Two, three or four colours shared out down the list: 8 pals are 4 + 4, 3 + 3 + 2 or 2 + 2 + 2 + 2."],
  ["brain", "By brain", "Claude, Codex, Gemini and the rest each have a colour, so you see what runs where."],
  ["state", "By state", "The pal itself turns the state's colour: working, needs you, done, asleep."],
  ["group", "By project or factory", "Pals of one project (or one factory) share a colour."],
  ["theme", "Match the theme", "The pals take your theme's own colours, and follow it when it changes."],
].map(([id, name, about]) => ({ id, name, about }));
export const SCREEN_LOOKS = [
  ["state", "By state", "The screen is the state's light, so a glance shows who works and who needs you."],
  ["match", "Match the pal", "The screen glows in the pal's own colour. Quiet; the state stays on the tile's edge."],
  ["contrast", "Contrast pair", "The screen takes the colour across the wheel from its pal."],
  ["one", "Same for all", "Every screen in one colour you pick."],
].map(([id, name, about]) => ({ id, name, about }));

// Split palettes: four colours each, a split of n takes the first n. Ordered so the first two are
// a warm and a cool that sit well side by side, and none is one of the state lights' own hues
// (blue for working, green for needs you) at full strength, so the screens still read.
export const SPLIT_PALETTES = [
  ["signal", "Signal", ["#4fa8ff", "#ffb238", "#ff6fb5", "#4fd6a0"]],
  ["dusk", "Dusk", ["#a77bff", "#ff9e72", "#9fd8ff", "#a6e34f"]],
  ["ember", "Ember", ["#ff7a2f", "#e8e6f0", "#3fe0e8", "#ff6b6b"]],
].map(([id, name, colors]) => ({ id, name, colors }));

// A brain's colour, by accessory key: the ones hired pals start in today (crew.js HARNESS_COLOR;
// Grok's ink is a grey here, since a near-black pal doesn't glow).
export const BRAIN_COLORS = { claude: "#e0866a", codex: "#e6e8ef", grok: "#8f96b3", gemini: "#6f9cf0", hermes: "#a28cf0", opencode: "#f0b245", other: "#6fd6a8", none: "#8f96b3" };
export const BRAIN_NAMES = { claude: "Claude", codex: "Codex", grok: "Grok", gemini: "Gemini", hermes: "Hermes", opencode: "opencode", other: "Other", none: "No brain" };
// A state's colour, as the tiles' edges and screens show it (pets.js STATE_LIGHT).
export const STATE_COLORS = { rest: "#7c7c8a", work: "#4c8dff", done: "#52d09e", ask: "#52d09e", pr: "#3fbf78", merged: "#9466f0", closing: "#e0484f", stuck: "#d9982e" };
// Groups (projects, factories) and themes without enough colours of their own draw from these.
// Nine hues kept well apart, so two groups never look alike.
export const GROUP_COLORS = ["#4fa8ff", "#ffb238", "#a77bff", "#4fd6a0", "#ff6fb5", "#3fe0e8", "#a6e34f", "#ff6b6b", "#e8e6f0"];

export const DEFAULT_PAL_LOOK = { pets: "own", screen: "state", color: "#e8e6f0", count: 2, palette: "signal", group: "project", screenColor: NEUTRAL_SCREEN };
const hexOr = (v, d) => (HEX6.test(v ?? "") ? v.toLowerCase() : d);
// The saved "palLook", made whole: unknown ids and bad colours fall back to today's look.
export function palLookOf(saved) {
  const s = saved && typeof saved === "object" ? saved : {}, d = DEFAULT_PAL_LOOK;
  return {
    pets: PET_LOOKS.some((x) => x.id === s.pets) ? s.pets : d.pets,
    screen: SCREEN_LOOKS.some((x) => x.id === s.screen) ? s.screen : d.screen,
    color: hexOr(s.color, d.color),
    count: [2, 3, 4].includes(s.count) ? s.count : d.count,
    palette: SPLIT_PALETTES.some((x) => x.id === s.palette) ? s.palette : d.palette,
    group: s.group === "factory" ? "factory" : "project",
    screenColor: hexOr(s.screenColor, d.screenColor),
  };
}
export const isDefaultLook = (look) => look.pets === "own" && look.screen === "state";

// n pals in k parts, as even as they go, the bigger parts first: 8 → 4+4, 3+3+2, 2+2+2+2.
export function splitSizes(n, k) {
  const parts = Math.max(1, Math.min(k, n)), base = Math.floor(n / parts), extra = n % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}
// Which part pal i of n is in.
export function splitPart(i, n, k) {
  let from = 0;
  const sizes = splitSizes(n, k);
  for (let p = 0; p < sizes.length; p++) { from += sizes[p]; if (i < from) return p; }
  return sizes.length - 1;
}

// A pal's project: its record's, else the part of its name before " - " ("Lumen - Web" → "Lumen"),
// else its folder's last part, else its whole name.
export function projectOf(pal) {
  if (pal.project) return String(pal.project);
  const name = String(pal.name ?? ""), cut = name.indexOf(" - ");
  if (cut > 0) return name.slice(0, cut);
  const folder = String(pal.folder ?? "").replace(/\/+$/, "");
  return folder ? folder.split("/").pop() : name;
}

// Keys → colours that stay put: each key starts at the colour its name picks and takes the next
// free one, in sorted order, so a new project only moves another when they'd collide.
export function steadyColors(keys, palette) {
  const out = {}, taken = new Set();
  for (const k of [...new Set(keys)].sort()) {
    let i = hash(k) % palette.length;
    if (taken.size < palette.length) while (taken.has(i)) i = (i + 1) % palette.length;
    taken.add(i);
    out[k] = palette[i];
  }
  return out;
}

// The theme's colours for pals: its six ANSI hues (blue, green, yellow, magenta, cyan, red), then
// the bright six, without near-repeats. A theme that names fewer than three is topped up.
const near = (a, b) => { const x = hx(a), y = hx(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 36; };
export function themeColors(theme) {
  const ansi = Array.isArray(theme?.ansi) ? theme.ansi : [];
  const out = [];
  for (const i of [4, 2, 3, 5, 6, 1, 12, 10, 11, 13, 14, 9]) {
    const c = HEX6.test(ansi[i] ?? "") ? ansi[i].toLowerCase() : null;
    if (c && !out.some((o) => near(o, c))) out.push(c);
  }
  for (const c of GROUP_COLORS) { if (out.length >= 3) break; if (!out.some((o) => near(o, c))) out.push(c); }
  return out;
}

// What each pal looks like under `look`. pals: the crew in sidebar order, each
// { name, own, brain, project?, folder?, factory? } (own: the colour it has today; brain: its
// accessory key). ctx: { theme: { accent, ansi } } for the theme preset and its screens.
// Returns one { color, tones?, screen? } per pal: petSpec's colour fields.
export function crewLook(saved, pals, ctx = {}) {
  const look = palLookOf(saved), n = pals.length;
  const own = (p) => hexOr(p.own, "#8f96b3");
  let colorOf = own, tones = null;
  if (look.pets === "one") colorOf = () => look.color;
  if (look.pets === "split") {
    const colors = SPLIT_PALETTES.find((x) => x.id === look.palette).colors;
    colorOf = (_p, i) => colors[splitPart(i, n, look.count)];
  }
  if (look.pets === "brain") colorOf = (p) => BRAIN_COLORS[p.brain] ?? BRAIN_COLORS.other;
  if (look.pets === "state") { tones = { ...STATE_COLORS }; colorOf = () => STATE_COLORS.rest; }
  if (look.pets === "group") {
    const key = (p) => (look.group === "factory" ? String(p.factory ?? "") || "—" : projectOf(p));
    const map = steadyColors(pals.map(key), GROUP_COLORS);
    colorOf = (p) => map[key(p)];
  }
  if (look.pets === "theme") {
    const map = steadyColors(pals.map((p) => String(p.name ?? "")), themeColors(ctx.theme));
    colorOf = (p) => map[String(p.name ?? "")];
  }
  return pals.map((p, i) => {
    const color = colorOf(p, i), out = { color };
    if (tones) out.tones = tones;
    if (look.screen === "match") out.screen = tones ? { ...tones } : color;
    if (look.screen === "contrast") out.screen = tones ? Object.fromEntries(Object.entries(tones).map(([st, c]) => [st, contrastOf(c)])) : contrastOf(color);
    if (look.screen === "one") out.screen = look.pets === "theme" && !HEX6.test(saved?.screenColor ?? "") && HEX6.test(ctx.theme?.accent ?? "") ? ctx.theme.accent.toLowerCase() : look.screenColor;
    return out;
  });
}

// Which pairs read best (the Settings dialog says so next to the choice; the board is
// crew-boards/pal-colors). best: made for each other; good: fine; weak: works, but one of the two
// says nothing new or the crew gets loud.
const FIT = {
  own:   { state: ["best", "Today's look. Each pal is itself; its screen says how it's doing."], match: ["good", "Calm. The state is left to the tile's edge and the words."], contrast: ["weak", "As many screen colours as pals: lively, hard to scan."], one: ["good", "One screen colour ties a mixed crew together."] },
  one:   { state: ["best", "A tidy fleet where only the screens speak. The quickest to scan."], match: ["weak", "Everything one colour: nothing tells pals or states apart but the pose."], contrast: ["good", "A two-colour crew: one for the pals, one for every screen."], one: ["good", "Two colours you pick. A uniform, not a status board."] },
  split: { state: ["best", "Teams by colour, states on the screens."], match: ["good", "Just the teams."], contrast: ["good", "Each team gets its own screen colour too: reads well with two colours, busy with four."], one: ["good", "Teams, with one screen colour holding them together."] },
  brain: { state: ["best", "What runs where, and how it's doing."], match: ["good", "Just the brains."], contrast: ["weak", "Each brain becomes two colours: more to learn than it tells you."], one: ["good", "Brains, one screen colour."] },
  state: { state: ["weak", "The pal and its screen say the same thing twice."], match: ["good", "The whole pal is the state, screen included: loud and clear from across the room."], contrast: ["weak", "The screen fights the state's colour."], one: ["best", "The pal is the state; one quiet screen colour keeps it from shouting."] },
  group: { state: ["best", "Which project, and how it's doing."], match: ["good", "Just the projects."], contrast: ["weak", "Busy once there are more than two or three groups."], one: ["good", "Projects, one screen colour."] },
  theme: { state: ["good", "The state lights aren't the theme's colours, so they stand out; some themes clash."], match: ["best", "Everything from your theme: the pals blend into the app."], contrast: ["weak", "The opposite colours aren't in your theme."], one: ["best", "Pals in the theme's colours, every screen in its accent."] },
};
export function pairFit(pets, screen) {
  const [fit, why] = FIT[pets]?.[screen] ?? ["good", ""];
  return { fit, why };
}
