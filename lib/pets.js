// Project Pals pocket pets: each pal as a little LED-dot critter in a status tile. install.sh copies
// this file into each mod as ./pets.js (next to crew.js, which uses it).
//
// The engine began as docs/pocket-pets/pets.mjs (the pocket-pets study) and was redrawn on
// 2026-11-09: the body is lit from the upper left and has a face (solid eyes, cheeks), each
// species has its own marks, accessories are the pal's LEDs turned down (dark, as before) with a
// clear gap round them (the crown, bow and antenna tip are white LEDs: nothing worn is a colour of its own), and the laptop is LEDs too, turned toward the pal, with a screen that shows
// the state. No mouths (DeNon, 2026-11-09: cheeks yes, mouths no; everything in the one LED world).
// One tile is 172x135. The pal is round LEDs on a fixed hex grid (a mask, so the dots never move
// when the pal does); the screen uses the same grid at half the pitch. Small sizes show the head alone.
//
// A pal's tile = its species and accessory (from its brain) + its own colour (the pal glows in it)
// + its state (the pose and the laptop's screen; the app tints the box's edge and runs the loader).

export const TW = 172, TH = 135;
const R = 3;   // DS radius: r3 tiles (the study drew r17)
export const PX = 6.8, PY = 5.8, DR = 2.4;

// ---------- colour ----------
const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const mix = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

// state schemes (from the DOTFACE recreation) + identity colours
export const STATES = {
  rest:    { dot: '#B6B6B8', glow: '#9a9aa0', ga: 0.10, gs: 0.35, screen: ['#1E1E22', '#252529', '#1E1E22'], gap: '#5a5a5e', strips: [0.10, 0.03], stripC: '#8a8a92', cap: 'REST' },
  work:    { dot: '#9ABCFE', glow: '#2A6AFE', ga: 0.10, gs: 0.75, screen: ['#1C1B22', '#1D1E27', '#1C1B22'], work: true, cap: 'WORKING' },
  done:    { dot: '#B0EDD3', glow: '#52D09E', ga: 0.16, gs: 0.45, border: '#55D19F', screen: ['#283D37', '#2E4C44', '#283C38'], cap: 'DONE' },
  ask:     { dot: '#B0EDD3', glow: '#52D09E', ga: 0.16, gs: 0.45, border: '#55D19F', screen: ['#253F37', '#2E4E44', '#283E39'], cap: 'ASKS YOU' },
  pr:      { dot: '#A2D6B8', glow: '#3FBF78', ga: 0.16, gs: 0.6, screen: ['#1E2226', '#22342D', '#1E2224'], strips: [0.32, 0.30], stripC: '#3FBF78', cap: 'PR OPEN' },
  merged:  { dot: '#D6B5FF', glow: '#9466F0', ga: 0.22, gs: 0.75, screen: ['#211E29', '#29233A', '#211E2B'], strips: [0, 0.70], stripC: '#8A5CF0', cap: 'MERGED' },
  closing: { dot: '#F9A4A6', glow: '#E0484F', ga: 0.24, gs: 0.75, screen: ['#261E25', '#3A2228', '#271E22'], strips: [0.45, 0.42], stripC: '#D8414A', cap: 'CLOSING' },
  stuck:   { dot: '#EACE96', glow: '#D9982E', ga: 0.20, gs: 0.6, screen: ['#222021', '#312A23', '#222020'], strips: [0.30, 0.32], stripC: '#C98A2A', cap: 'STUCK' },
};
export const IDENTITY = {
  mint: '#4FD6A0', sky: '#4FA8FF', lilac: '#A77BFF', coral: '#FF6B6B', amber: '#FFB238', pearl: '#E8E6F0',
  rose: '#FF6FB5', lime: '#A6E34F', cyan: '#3FE0E8', peach: '#FF9E72', ice: '#9FD8FF', ember: '#FF7A2F',
};
// a colour-as-identity scheme: neutral tile, the pal glows in its own colour
export function idScheme(hex, frame = null) {
  const base = frame ? { ...STATES[frame] } : { screen: ['#1D1D21', '#232327', '#1D1D21'], ga: 0.14, gs: 0.5, strips: [0.08, 0.04], stripC: '#8a8a92' };
  return { ...base, dot: mix(hex, '#ffffff', 0.42), glow: hex, gap: hex, palOnly: true };
}

// ---------- geometry helpers ----------
export const rr = (x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - 2 * r}a${r},${r} 0 0 1 -${r},-${r}v-${h - 2 * r}a${r},${r} 0 0 1 ${r},-${r}z`; };
export const cap = (x1, y1, x2, y2, w) => { const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2, r = w / 2;
  return `M${x1 + nx},${y1 + ny}L${x2 + nx},${y2 + ny}A${r},${r} 0 0 0 ${x2 - nx},${y2 - ny}L${x1 - nx},${y1 - ny}A${r},${r} 0 0 0 ${x1 + nx},${y1 + ny}Z`; };
export const circ = (cx, cy, r, ry = r) => `M${cx - r},${cy}a${r},${ry} 0 1 0 ${2 * r},0a${r},${ry} 0 1 0 ${-2 * r},0Z`;
const poly = (pts) => 'M' + pts.map(([a, b]) => `${a},${b}`).join('L') + 'Z';
const rowY = (n) => PY / 2 + n * PY;
const snap = (x, y) => { const n = Math.round((y - PY / 2) / PY), off = n % 2 ? 0 : PX / 2; return [n, off + Math.round((x - off) / PX) * PX]; };
const cell = (n, x) => rr(x - 3, rowY(n) - 2.6, 6, 5.2, 2);
const GLYPH = {
  z: [[0, -2], [0, 0], [0, 2], [1, 1], [2, -2], [2, 0], [2, 2]],
  q: [[0, -2], [0, 0], [0, 2], [1, -3], [1, 3], [2, 2], [3, 1], [5, 1]],
  spark: [[0, 0], [0, -2], [0, 2], [-2, 0], [2, 0]],
  sweat: [[0, 0], [1, -1], [1, 1], [2, 0]],
  x: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  hap: [[0, 0], [1, -1], [1, 1]],
  dash: [[0, -2], [0, 0], [0, 2]],
  dash2: [[0, -1], [0, 1]],
  note: [[0, 0], [0, 2], [1, 3], [2, 2], [3, 1], [4, 0], [4, -2], [3, -1]],
  heart: [[0, -2], [0, 2], [1, -3], [1, -1], [1, 1], [1, 3], [2, -2], [2, 0], [2, 2], [3, -1], [3, 1], [4, 0]],
  dot: [[0, 0]],
  shine: [[0, 0], [-1, -1]],
  pair: [[0, 0], [0, 2]],
};
export const glyph = (name, x, y) => { const [n0, x0] = snap(x, y); return GLYPH[name].filter(([dn, k]) => ((dn + k) % 2 + 2) % 2 === 0).map(([dn, k]) => cell(n0 + dn, x0 + k * PX / 2)).join(' '); };
// The same marks as whole round LEDs, drawn outright. Floating marks use this, not the grid mask:
// resvg rounds a pattern's tile to whole pixels, so far from the origin the mask drifts off the
// grid and would slice a lone dot.
const leds = (name, x, y) => { const [n0, x0] = snap(x, y); return GLYPH[name].filter(([dn, k]) => ((dn + k) % 2 + 2) % 2 === 0).map(([dn, k]) => circ(x0 + k * PX / 2, rowY(n0 + dn), DR)).join(' '); };
const T = (d, ox, oy) => d.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g, (_, a, b) => `${+a + ox},${+b + oy}`);

// ---------- species (body centred on 66,66 before offset) ----------
// Layers are { d, fill, op, mask, rule, glow, under, stroke, sw, back }: fill / stroke name a paint
// (PAINTS in tileSvg) or are a colour; mask picks the LED grid the layer shows through ('big', the
// pal's; 'fine', half the pitch, for hardware; null, solid). Everything stays at x >= 30 before the
// offset, so nothing is cut by the bare crop.
function species(sp, ox, oy) {
  const t = (d) => T(d, ox, oy), C = (x, y, r, ry) => circ(x + ox, y + oy, r, ry), K = (x1, y1, x2, y2, w) => cap(x1 + ox, y1 + oy, x2 + ox, y2 + oy, w);
  let body = C(66, 66, 30, 29), E = [[70, 60], [87, 60]], er = [6.5, 7.5], feet = true, belly = [69, 81, 15, 10], mouth = true;
  const parts = [], marks = [];   // parts: body colour, part of the glow; marks: drawn over the body
  const mark = (d, fill, op = 1, mask = 'big') => marks.push({ d, fill, op, mask });
  if (sp === 'kit') { parts.push(t('M43,47 L45,21 L61,40 Z M75,40 L91,21 L91,47 Z'), K(41, 90, 35, 74, 8)); mark(t('M47,40 L48,28 L55,38 Z M80,38 L88,28 L88,40 Z'), 'dark', 0.9); mark(C(35, 73, 4), 'light', 0.9); }
  if (sp === 'bun') { parts.push(K(54, 42, 49, 17, 11), K(76, 40, 83, 17, 11), C(38, 86, 6.5)); mark(K(54, 38, 50.5, 21, 4.5) + ' ' + K(76.5, 37, 81.5, 21, 4.5), 'cheek', 0.85); mark(C(38, 86, 4), 'light', 0.9); }
  if (sp === 'cub') { body = C(66, 67, 31, 28); parts.push(C(43, 42, 10), C(89, 42, 10)); mark(C(43, 42, 5) + ' ' + C(89, 42, 5), 'dark', 0.9); mark(C(79, 71, 12, 8), 'light', 0.75); }
  if (sp === 'fox') { parts.push(t('M42,49 L40,17 L62,38 Z M74,38 L94,17 L92,49 Z'), t('M46,92 C30,98 28,72 36,56 C38,70 42,78 52,80 Z')); mark(t('M45,41 L44,26 L54,36 Z M80,36 L90,26 L89,41 Z'), 'dark', 0.9); mark(t('M36,56 C33,64 32,70 33,76 C37,72 38,66 38,62 Z'), 'hot', 0.9); mark(C(79, 72, 14, 9), 'light', 0.85); }
  if (sp === 'mochi') { body = C(66, 72, 33, 25); feet = false; belly = [69, 84, 17, 8]; parts.push(K(64, 48, 62, 34, 3.5), t('M62,34 C66,22 80,22 84,22 C80,32 70,36 62,34 Z')); E = [[72, 66], [88, 66]]; mark(t('M62,34 C66,22 80,22 84,22 C80,32 70,36 62,34 Z'), '#8FE38A', 0.95); }
  if (sp === 'dino') { belly = [70, 80, 17, 12]; parts.push(t('M48,42 L41,30 L54,36 Z M40,56 L31,50 L41,46 Z M38,72 L31,70 L37,62 Z'), t('M46,90 C38,100 32,94 32,85 C37,88 40,84 44,78 Z')); mark(t('M48,42 L41,30 L54,36 Z M40,56 L31,50 L41,46 Z M38,72 L31,70 L37,62 Z'), 'dark', 0.55); }
  if (sp === 'owl') { body = C(66, 66, 29, 30); parts.push(t('M45,45 L37,21 L58,36 Z M74,36 L95,21 L87,45 Z')); er = [8, 9]; E = [[67, 60], [88, 60]]; mouth = false; belly = [70, 82, 14, 10]; mark(C(44, 74, 7, 13), 'dark', 0.6); mark(t('M73.5,65 L81.5,65 L77.5,72 Z'), 'gold', 1, null); }
  if (sp === 'pup') { parts.push(t('M50,40 C34,40 30,64 38,72 C44,68 48,56 54,46 Z M80,40 C98,38 100,62 92,70 C86,66 82,54 78,46 Z')); mark(t('M50,40 C34,40 30,64 38,72 C44,68 48,56 54,46 Z'), 'dark', 0.7); mark(C(80, 72, 12, 8), 'light', 0.85); mark(C(80, 68, 2.6, 2.2), 'ink', 0.9, null); }
  if (feet) parts.push(C(52, 96.5, 8, 6.5), C(78, 96.5, 8, 6.5));
  return { body, parts, marks, belly: belly && C(...belly), mouth, E: E.map(([x, y]) => [x + ox, y + oy]), er, top: 36 + oy, ox, oy, cx: 66 + ox, cy: 66 + oy };
}

// ---------- accessories (drawn on top; a 'back' layer first clears a gap round them) ----------
function accessory(a, S, L) {
  const { ox, oy } = S, t = (d) => T(d, ox, oy);
  // dim: the pal's own LEDs turned down, so the thing sits back into the dark; lit: full
  const dim = (d, op = 0.45, rule = 'evenodd') => L.push({ d, fill: 'body', op, mask: 'big', rule });
  const lit = (d, op = 1, rule = 'evenodd') => L.push({ d, fill: 'body', op, mask: 'big', rule, glow: true });
  const hot = (d, fill = 'hot') => L.push({ d, fill, op: 1, mask: 'big' });
  const back = (d) => L.push({ d, back: true });
  if (a === 'phones') { const band = t('M36,58 C30,16 102,14 96,58 L89,58 C92,26 42,26 43,58 Z'); back(band); dim(band, 0.42); const cupD = rr(31 + ox, 49 + oy, 18, 25, 7.5); back(cupD); dim(cupD, 0.5); L.push({ d: circ(40 + ox, 61.5 + oy, 2.4), fill: 'hot', op: 0.95, mask: null }); }
  if (a === 'glasses') { const f = rr(61 + ox, 52 + oy, 34, 15, 5), l1 = rr(64 + ox, 55 + oy, 12, 9, 3), l2 = rr(80 + ox, 55 + oy, 12, 9, 3); back(f); dim(f + ' ' + l1 + ' ' + l2, 0.6); S.lens = [[70 + ox, 59.5 + oy], [86 + ox, 59.5 + oy]]; }
  if (a === 'beanie') { const dome = t('M36,48 C36,20 96,20 96,48 Z'), rim = rr(34 + ox, 43 + oy, 64, 9, 4.5); back(dome + ' ' + rim); dim(dome, 0.5); dim(rim, 0.75); back(circ(66 + ox, 22 + oy, 6)); dim(circ(66 + ox, 22 + oy, 6), 0.75); }
  if (a === 'cap') { const dome = t('M38,44 C38,24 92,22 94,44 Z'), brim = rr(82 + ox, 38 + oy, 26, 7.5, 3.7); back(dome + ' ' + brim); dim(dome, 0.5); dim(brim, 0.75); }
  if (a === 'scarf') { const band = rr(40 + ox, 78 + oy, 54, 10, 5), tail = rr(46 + ox, 84 + oy, 10, 18, 4); back(band + ' ' + tail); dim(tail, 0.45); dim(band, 0.6); }
  if (a === 'bow') { const d = t('M52,34 L39,25 L41,43 Z M52,34 L65,25 L63,43 Z'); back(d); hot(d); }
  if (a === 'crown') { const d = t('M50,36 L50,22 L58,30 L66,18 L74,30 L82,22 L82,36 Z'); back(d); L.push({ d, fill: 'hot', op: 1, mask: 'big', glow: true }); }   // white LEDs, as before the redraw: never gold (DeNon, 2026-11-09)
  if (a === 'antenna') { lit(cap(66 + ox, 38 + oy, 72 + ox, 19 + oy, 3.5), 0.9); hot(circ(73 + ox, 16 + oy, 4.5)); }
  if (a === 'flower') { const petals = circ(84 + ox, 22 + oy, 4.5) + ' ' + circ(84 + ox, 38 + oy, 4.5) + ' ' + circ(76 + ox, 30 + oy, 4.5) + ' ' + circ(92 + ox, 30 + oy, 4.5); back(petals); lit(petals, 0.8, 'nonzero'); hot(circ(84 + ox, 30 + oy, 4.6)); }
  if (a === 'hood') { const d = t('M32,70 C26,24 106,20 100,70 L92,70 C94,36 40,36 40,70 Z'); back(d); dim(d, 0.5); }
}

// ---------- eyes ----------
// Sockets are solid dark discs over the LEDs; pupils are solid white, so a face reads at any size.
function eyes(style, S, mood) {
  const E = S.lens ?? S.E, [r, ry] = S.lens ? [5, 5] : S.er;
  const out = [];
  const ink = (d, op = 0.84) => out.push({ d, fill: 'ink', op, mask: null });
  const white = (d, op = 1) => out.push({ d, fill: 'hot', op, mask: null });
  const line = (d, stroke = 'ink', sw = 3.2, op = 0.9) => out.push({ d, stroke, sw, op, mask: null });
  const sock = (pts, a = r, b = ry) => pts.map(([x, y]) => circ(x, y, a, b)).join(' ');
  const pup = (pts, pr = 3) => pts.map(([x, y]) => circ(x + 0.8, y, pr)).join(' ');
  const arc = ([x, y], w = 6, up = true) => `M${x - w},${y + (up ? 2.5 : -1.5)}Q${x},${y + (up ? -6.5 : 6)} ${x + w},${y + (up ? 2.5 : -1.5)}`;
  const lensed = Boolean(S.lens);   // behind glasses: the lens is dark already
  if (mood === 'rest') { E.forEach((e) => line(arc(e, lensed ? 4 : 5.5, false), lensed ? 'hot' : 'ink', 2.8)); return out; }
  if (mood === 'happy') { E.forEach((e) => line(arc(e, lensed ? 4 : 6, true), lensed ? 'hot' : 'ink', 3.2)); return out; }
  if (mood === 'x') { if (!lensed) ink(sock(E, r + 0.5, ry)); E.forEach(([x, y]) => line(`M${x - 3},${y - 3}L${x + 3},${y + 3}M${x + 3},${y - 3}L${x - 3},${y + 3}`, 'hot', 2.4, 1)); return out; }
  if (lensed) { white(pup(E, 2.6)); return out; }
  if (style === 'big') { ink(sock(E, r + 1.5, ry + 1.5)); white(pup(E, 3.8)); white(E.map(([x, y]) => circ(x - 2.6, y - 3.4, 1.5)).join(' '), 0.9); return out; }
  if (style === 'hollow') { ink(sock(E, r + 0.5, ry + 0.5)); return out; }
  if (style === 'sleepy') { ink(sock(E)); white(pup(E.map(([x, y]) => [x, y + 2.5]), 2.6)); E.forEach(([x, y]) => out.push({ d: rr(x - r - 1, y - ry - 1, 2 * r + 2, ry + 0.5, 2), fill: 'body', op: 1, mask: 'big' })); return out; }
  if (style === 'visor') { ink(rr(E[0][0] - 10, E[0][1] - 5.5, E[1][0] - E[0][0] + 20, 11, 5.5), 0.9); line(`M${E[0][0] - 4},${E[0][1]}L${E[1][0] + 4},${E[1][1]}`, 'state', 3, 1); return out; }
  if (style === 'cyclops') { const c = [(E[0][0] + E[1][0]) / 2, E[0][1]]; ink(sock([c], 9.5, 10)); white(pup([c], 4.2)); return out; }
  if (style === 'wink') { ink(sock([E[0]])); white(pup([E[0]])); line(arc(E[1], 5.5, true)); return out; }
  if (style === 'angry') { ink(sock(E)); white(pup(E)); line(`M${E[0][0] - 8},${E[0][1] - 11}L${E[0][0] + 5},${E[0][1] - 6.5}M${E[1][0] - 5},${E[1][1] - 6.5}L${E[1][0] + 8},${E[1][1] - 11}`, 'ink', 4); return out; }
  if (style === 'dots') { ink(sock(E, 3.8, 4.2), 0.92); white(E.map(([x, y]) => circ(x - 1, y - 1.4, 1.2)).join(' '), 0.9); return out; }
  ink(sock(E)); white(pup(E)); return out;   // default: socket + lit pupil
}
// ---------- the laptop ----------
// Made of the same LEDs as the pal (its own colour, turned down), seen from the pal's side: the
// keyboard deck runs from the hinge toward the pal's paw, the lid leans back with its screen facing
// the pal. The screen is the bright part (fine LEDs in the state's colour, code while working) and
// lights the pal's face. Asleep, the lid is shut. What the state is floats over it in LEDs.
// Drawn obliquely: the hinge runs away from you, the deck comes from it toward the pal, the lid
// leans back from it. Corners: hinge near, hinge far, then the far and near ends of the other edge.
const HN = [142, 93], HW = [15, -8], KEY = [-42, 2], UP = [6, -50];
const pt = (a, b, t = 1) => [a[0] + b[0] * t, a[1] + b[1] * t];
const HF = pt(HN, HW), DECK = [pt(HF, KEY), HF, HN, pt(HN, KEY)], LID = [pt(HN, UP), pt(HF, UP), HF, HN];
const quad = (Q) => (u, v) => { const [a, b, c, d] = Q; const tx = a[0] + (b[0] - a[0]) * u, ty = a[1] + (b[1] - a[1]) * u, bx = d[0] + (c[0] - d[0]) * u, by = d[1] + (c[1] - d[1]) * u; return [tx + (bx - tx) * v, ty + (by - ty) * v]; };
const sub = (Q, u0, v0, u1, v1) => { const m = quad(Q); return poly([m(u0, v0), m(u1, v0), m(u1, v1), m(u0, v1)]); };
function laptop(L, pose, tap) {
  const add = (d, fill, op = 1, mask = 'big', extra = {}) => L.push({ d, fill, op, mask, ...extra });
  const down = (a, b, t) => poly([a, b, [b[0], b[1] + t], [a[0], a[1] + t]]);
  const base = down(DECK[3], DECK[2], 6.5) + ' ' + down(DECK[2], DECK[1], 6.5);   // the deck's near and hinge-end faces
  if (pose === 'rest') {   // shut: the lid lies on the deck
    add(base, 'body', 0.3, 'big', { rule: 'nonzero' }); add(poly(DECK), 'body', 0.5);
    add(poly(DECK.map(([x, y]) => [x, y - 5])), 'body', 0.62);
    return;
  }
  add(base, 'body', 0.3, 'big', { rule: 'nonzero' });
  add(poly(DECK), 'body', 0.55);
  add(sub(DECK, 0.1, 0.1, 0.8, 0.9), 'light', 0.85);                                          // the keys
  add(poly([LID[1], LID[2], pt(LID[2], [5, 1]), pt(LID[1], [5, 1])]), 'body', 0.3);         // the lid's back
  add(poly(LID), 'body', 0.7);
  const scr = sub(LID, 0.1, 0.05, 0.9, 0.93), M = quad([quad(LID)(0.1, 0.05), quad(LID)(0.9, 0.05), quad(LID)(0.9, 0.93), quad(LID)(0.1, 0.93)]);
  add(scr, 'screenInk', 0.9, null, { sglow: true });
  add(scr, 'state', 0.55, null); add(scr, 'stateHi', 1, 'fine');
  const bar = (u0, u1, v, h = 0.055) => poly([M(u0, v), M(u1, v), M(u1, v + h), M(u0, v + h)]);
  if (pose === 'work') add(bar(0.1, 0.8, 0.14) + ' ' + bar(0.3, 0.95, 0.28) + ' ' + bar(0.3, 0.7, 0.42) + ' ' + (tap ? bar(0.1, 0.9, 0.56) + ' ' + bar(0.1, 0.4, 0.7) : bar(0.1, 0.5, 0.56)), 'hot', 0.95, null);
}

// ---------- assemble one pal ----------
// avatar: the head alone (no arms, laptop or floating marks), for the small sizes.
export function pal(spec) {
  const { species: sp = 'kit', pose = 'work', acc = [], eyes: es = 'dot', prop: pr = 'laptop', avatar = false } = spec;
  const L = [];
  let ox = (spec.ox || 0) + (avatar ? 0 : -4), oy = (spec.oy || 0) + (avatar && sp === 'mochi' ? -9 : 0);
  if (!avatar) { if (pose === 'merged') oy -= 4; if (pose === 'rest') oy += 3; }
  const S = species(sp, ox, oy);
  const mood = pose === 'rest' ? 'rest' : pose === 'done' || pose === 'merged' ? 'happy' : pose === 'stuck' ? 'x' : null;
  const tone = pose === 'rest' ? 0.82 : 1;
  const flesh = (d) => L.push({ d, fill: 'body', op: tone, mask: 'big', glow: true, under: true });
  const arm = (x1, y1, x2, y2, w = 8.5) => flesh(cap(x1, y1, x2, y2, w));
  const laptopOn = !avatar && pr !== 'none';
  S.parts.forEach(flesh);
  // raised arms go behind the body, so they never cross the face
  if (!avatar) {
    if (pose === 'done' || pose === 'merged') { arm(44 + ox, 66 + oy, 36.5 + ox, 45 + oy); arm(86 + ox, 66 + oy, 101 + ox, 43 + oy); }
    if (pose === 'ask') arm(86 + ox, 66 + oy, 102 + ox, 41 + oy);
    if (pose === 'closing') arm(86 + ox, 68 + oy, 105 + ox, 50 + oy);
  }
  flesh(S.body);
  if (S.belly) L.push({ d: S.belly, fill: 'light', op: 0.5 * tone, mask: 'big' });
  S.marks.forEach((m) => L.push({ ...m, op: m.op * tone }));
  if (laptopOn && pose !== 'rest') L.push({ d: S.body, fill: 'spill', op: 1, mask: 'big' });   // the screen's light on the pal
  const E = S.E;
  if (mood !== 'rest') L.push({ d: circ(E[0][0] - 7.5, E[0][1] + 10, 4.6, 3.4) + ' ' + circ(E[1][0] + 5, E[1][1] + 10, 4, 3.4), fill: 'cheek', op: 0.8, mask: 'big' });
  acc.forEach((a) => accessory(a, S, L));
  eyes(es, S, mood).forEach((l) => L.push(l));
  if (avatar) return L.filter((l) => l.d && l.d.trim());
  if (laptopOn) laptop(L, pose, Boolean(spec.tap));
  // Marks float over the laptop, in whole LEDs like everything else.
  const float = (d, fill = 'hot', op = 1) => L.push({ d, fill, op, mask: null });
  const sx = 88 + ox, sy = 75 + oy;   // the near shoulder
  if (pose === 'work') { if (spec.tap) arm(sx, sy, 117, 85); else arm(sx, sy, 114, 91); }
  if (pose === 'stuck') { arm(sx, sy, 114, 91); float(leds('sweat', 102, 26)); float(leds('x', 124, 26), 'state'); }
  if (pose === 'rest') { float(leds('z', 112, 46), 'light', 0.75); float(leds('z', 132, 26), 'light', 0.45); }
  if (pose === 'done') float(leds('spark', 122, 28));
  if (pose === 'ask') float(leds('q', 122, 14));
  if (pose === 'pr') { arm(sx, sy, 114, 91); float(leds('dash', 122, 20), 'state'); float(leds('dash', 125, 32), 'light', 0.7); }
  if (pose === 'merged') { float(leds('spark', 122, 28)); L.push({ d: circ(66 + ox, 107, 20, 2.6), fill: 'ink', op: 0.5, mask: null }); }
  if (pose === 'closing') { float(leds('dash', 120, 22), 'light', 0.6); float(leds('dash', 124, 34), 'light', 0.4); }
  return L.filter((l) => l.d && l.d.trim());
}


// ---------- render one tile as a whole SVG file ----------
let uidN = 0;
// Bare: the pet alone, no screen box (no fill, outline, glow wash or edge strips), cropped tight
// (BARE_VIEW) so it fills ~25% more of its space; the app draws a light container behind it.
// Small: the head alone (SMALL_VIEW, the same shape), for sizes where the whole scene is a smudge.
export const BARE_VIEW = [26, 10, 138, 108];
export const SMALL_VIEW = [23, 11, 86, 67.3];
export const INSET = 0.86;
export const STATE_LIGHT = { rest: '#7C7C8A', work: '#4C8DFF', done: '#52D09E', ask: '#52D09E', pr: '#3FBF78', merged: '#9466F0', closing: '#E0484F', stuck: '#D9982E' };
const num = (svg) => svg.replace(/-?\d+\.\d{3,}/g, (n) => String(+(+n).toFixed(2)));
export function tileSvg(spec, opts = {}) {
  const small = Boolean(opts.small), bare = Boolean(opts.bare) || small;
  const id = `t${uidN++}`;
  const s = typeof spec.scheme === 'string' ? STATES[spec.scheme] : spec.scheme;
  // spec.screen: the laptop screen's own colour (Pal look); without it the state's light.
  const c = s.glow, sl = spec.screen ?? STATE_LIGHT[spec.pose] ?? STATE_LIGHT.rest;
  let defs = '', b = '';
  const scr = s.screen;
  defs += `<linearGradient id="${id}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${scr[0]}"/><stop offset="0.5" stop-color="${scr[1]}"/><stop offset="1" stop-color="${scr[2]}"/></linearGradient>`;
  defs += `<radialGradient id="${id}r" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="${s.glow}" stop-opacity="${s.gs * 0.35}"/><stop offset="0.55" stop-color="${s.glow}" stop-opacity="${s.gs * 0.1}"/><stop offset="1" stop-color="${s.glow}" stop-opacity="0"/></radialGradient>`;
  if (bare) { /* no screen box */ }
  else if (s.border) b += `<rect width="${TW}" height="${TH}" rx="${R}" fill="${s.border}"/><rect x="10" y="10" width="${TW - 20}" height="${TH - 20}" rx="2" fill="url(#${id}v)"/>`;
  else b += `<rect width="${TW}" height="${TH}" rx="${R}" fill="url(#${id}v)"/><rect x="0.5" y="0.5" width="${TW - 1}" height="${TH - 1}" rx="${R - 0.5}" fill="none" stroke="#2c2c31" stroke-opacity="0.55"/>`;
  const ix = s.border ? 10 : 0;
  if (!bare) b += `<rect x="${ix}" y="${ix}" width="${TW - 2 * ix}" height="${TH - 2 * ix}" rx="${s.border ? 2 : R}" fill="url(#${id}r)"/>`;
  if (s.strips && !bare) {
    defs += `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0.08" stop-color="${s.stripC}" stop-opacity="0"/><stop offset="0.35" stop-color="${s.stripC}"/><stop offset="0.68" stop-color="${s.stripC}"/><stop offset="0.95" stop-color="${s.stripC}" stop-opacity="0"/></linearGradient>`;
    const [l, r] = s.strips;
    if (l) b += `<rect x="2" y="12" width="7" height="${TH - 24}" rx="3" fill="url(#${id}s)" fill-opacity="${l}"/>`;
    if (r) b += `<rect x="${TW - 9}" y="12" width="7" height="${TH - 24}" rx="3" fill="url(#${id}s)" fill-opacity="${r}"/>`;
  }
  // Working: no loader drawn into the tile; the app runs one round the tile's edge (petEl in crew.js).
  const L = pal({ ...spec, avatar: small });
  const ox = (spec.ox || 0) + (small ? 0 : -4), oy = (spec.oy || 0) + (small && spec.species === 'mochi' ? -9 : 0);
  // The two LED grids, as masks: a layer is its shape in any paint, seen through the dots. The fine
  // grid is the big one at half the pitch, so the two line up.
  const grid = (key, px, py, dr) => `<pattern id="${id}${key}p" x="0" y="0" width="${px}" height="${py * 2}" patternUnits="userSpaceOnUse"><circle cx="${px / 2}" cy="${py / 2}" r="${dr}" fill="#fff"/><circle cx="0" cy="${py * 1.5}" r="${dr}" fill="#fff"/><circle cx="${px}" cy="${py * 1.5}" r="${dr}" fill="#fff"/></pattern><mask id="${id}${key}" maskUnits="userSpaceOnUse" x="0" y="0" width="${TW}" height="${TH}"><rect width="${TW}" height="${TH}" fill="url(#${id}${key}p)"/></mask>`;
  defs += grid('big', PX, PY, small ? DR + 0.25 : DR) + grid('fine', PX / 2, PY / 2, DR / 2 - 0.1);
  // Paints. The body is lit from the upper left.
  defs += `<radialGradient id="${id}gb" gradientUnits="userSpaceOnUse" cx="${58 + ox}" cy="${48 + oy}" r="62"><stop offset="0" stop-color="${mix(c, '#ffffff', 0.72)}"/><stop offset="0.42" stop-color="${mix(c, '#ffffff', 0.4)}"/><stop offset="0.8" stop-color="${mix(c, '#ffffff', 0.12)}"/><stop offset="1" stop-color="${mix(c, '#000000', 0.22)}"/></radialGradient>`;
  defs += `<radialGradient id="${id}gs" gradientUnits="userSpaceOnUse" cx="146" cy="64" r="60"><stop offset="0" stop-color="${mix(sl, '#ffffff', 0.5)}" stop-opacity="0.85"/><stop offset="0.5" stop-color="${sl}" stop-opacity="0.3"/><stop offset="1" stop-color="${sl}" stop-opacity="0"/></radialGradient>`;
  const PAINTS = {
    body: `url(#${id}gb)`, light: mix(c, '#ffffff', 0.8), dark: mix(c, '#000000', 0.42), hot: '#ffffff', ink: '#09090C',
    gold: '#FFD166', cheek: mix(c, '#FF4D7A', 0.62),
    screenInk: '#07080C', state: sl, stateHi: mix(sl, '#ffffff', 0.55), spill: `url(#${id}gs)`,
  };
  const paint = (k) => PAINTS[k] ?? k;
  const glowD = L.filter((l) => l.glow).map((l) => l.d).join(' '), sglowD = L.filter((l) => l.sglow).map((l) => l.d).join(' ');
  defs += `<filter id="${id}b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${small ? 2.5 : 3.5}"/></filter><filter id="${id}b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${small ? 5 : 7.5}"/></filter>`;
  b += `<path d="${glowD}" fill="${c}" fill-opacity="${0.26 * (s.ga / 0.16)}" filter="url(#${id}b8)"/>`;
  b += `<path d="${glowD}" fill="${c}" fill-opacity="0.4" filter="url(#${id}b3)"/>`;
  if (sglowD) b += `<path d="${sglowD}" fill="${sl}" fill-opacity="0.5" filter="url(#${id}b8)"/><path d="${sglowD}" fill="${sl}" fill-opacity="0.45" filter="url(#${id}b3)"/>`;
  const bgFill = bare ? (opts.back ?? '#0B0B0C') : s.screen[1];
  const under = small ? 0.5 : 0.3;
  for (const l of L) {
    if (l.back) { b += `<path d="${l.d}" fill="${bgFill}" stroke="${bgFill}" stroke-width="3.4" stroke-linejoin="round"/>`; continue; }
    const rule = l.rule ? ` fill-rule="${l.rule}"` : '', mask = l.mask ? ` mask="url(#${id}${l.mask})"` : '', op = l.op ?? 1;
    const fill = l.fill ? ` fill="${paint(l.fill)}" fill-opacity="${op}"` : ' fill="none"';
    const stroke = l.stroke ? ` stroke="${paint(l.stroke)}" stroke-width="${l.sw}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round"` : '';
    if (l.under) b += `<path d="${l.d}"${rule} fill="${mix(c, '#000000', 0.25)}" fill-opacity="${under * op}"/>`;
    b += `<path d="${l.d}"${rule}${fill}${stroke}${mask}/>`;
  }
  const [vx, vy, vw, vh] = small ? SMALL_VIEW : bare ? BARE_VIEW : [0, 0, TW, TH];
  // Bare art sits a little inside its frame (INSET, about the frame's centre) and fades out over
  // the last few units of every edge, so neither a shape nor its glow is ever sliced by the frame
  // (DeNon, 2026-11-09: "cut off by some invisible box"). The head also fades out at the bottom.
  if (bare) {
    const cx = vx + vw / 2, cy = vy + vh / 2, e = 7;
    defs += `<filter id="${id}ef" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${e / 2}"/></filter><mask id="${id}edge" maskUnits="userSpaceOnUse" x="${vx}" y="${vy}" width="${vw}" height="${vh}"><rect x="${vx + e}" y="${vy + e}" width="${vw - 2 * e}" height="${vh - 2 * e}" fill="#fff" filter="url(#${id}ef)"/></mask>`;
    b = `<g transform="translate(${cx} ${cy}) scale(${INSET}) translate(${-cx} ${-cy})">${b}</g>`;
    if (small) { defs += `<linearGradient id="${id}fg" gradientUnits="userSpaceOnUse" x1="0" y1="${vy + vh - 16}" x2="0" y2="${vy + vh - 5}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${id}fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${TW}" height="${TH}"><rect width="${TW}" height="${TH}" fill="url(#${id}fg)"/></mask>`; b = `<g mask="url(#${id}fade)">${b}</g>`; }
    b = `<g mask="url(#${id}edge)">${b}</g>`;
  }
  return num(`<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="${vx} ${vy} ${vw} ${vh}"><defs>${defs}</defs>${b}</svg>`);
}

// Bits rising off the laptop screen while working: a few white LEDs on the same grid, alone on a
// transparent tile, so a layer over the tile can drift them up and fade them (natively).
export function bitsSvg() {
  const d = glyph('dot', 141, 42) + ' ' + glyph('dot', 148, 30) + ' ' + glyph('dot', 136, 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}"><defs><filter id="bb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter></defs><path d="${d}" fill="#9ABCFE" fill-opacity="0.8" filter="url(#bb)"/><path d="${d}" fill="#ffffff" fill-opacity="0.95"/></svg>`;
}

// ---------- a pal's pet ----------
// The eight states a tile shows, and the pose / frame each one uses.
export const PET_STATES = ['rest', 'work', 'done', 'ask', 'pr', 'merged', 'closing', 'stuck'];
export const PET_SPECIES = ['kit', 'bun', 'cub', 'fox', 'mochi', 'dino', 'owl', 'pup'];
export const PET_DIR = 'data/crew-pets';
// Brain → what the pet wears (the stock mascots' accessory idea, in pocket-pet terms). The head
// pal wears the crown whatever its brain.
const WEARS = { claude: ['phones'], codex: ['glasses'], grok: ['hood'], gemini: ['antenna'], hermes: ['scarf'], opencode: ['cap'], other: ['beanie'], none: [] };
function hash(s) { let h = 2166136261; for (const ch of s ?? '') h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
// A very dark identity colour (ink) wouldn't glow on the dark tile: lift it toward white.
const lum = (c) => { const [r, g, b] = hx(c).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const glowable = (c) => (lum(c) < 0.22 ? mix(c, '#ffffff', 0.45) : c);

// pet: the record's own pick ({species, acc, eyes}, any part), else one chosen by the pal's name
// (so a project keeps the same critter). acc: the brain's ("auto"), or a list.
// Pal look (lib/pallook.js, Settings → Pal look) may add two things to a pet: `tones`, its colour
// per state (the "by state" preset), and `screen`, its laptop screen's colour (one hex, or one per
// state). Without them a pet is exactly what it was: its own colour, the state's light on its screen.
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const perState = (v, f = (c) => c) => {
  if (typeof v === 'string') return HEX6.test(v) ? f(v.toLowerCase()) : null;
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const st of PET_STATES) if (HEX6.test(v[st] ?? '')) out[st] = f(v[st].toLowerCase());
  return Object.keys(out).length ? out : null;
};
const lookSig = (v) => (!v ? '' : typeof v === 'string' ? v : PET_STATES.map((st) => v[st] ?? '').join(','));
const at = (v, state) => (v && typeof v === 'object' ? v[state] : v) ?? null;
export function petSpec({ name, god, accessory, color, pet, tones, screen }) {
  const own = pet && typeof pet === 'object' ? pet : {};
  const species = PET_SPECIES.includes(own.species) ? own.species : god ? 'kit' : PET_SPECIES[hash(name) % PET_SPECIES.length];
  const acc = Array.isArray(own.acc) ? own.acc.slice(0, 2) : god ? ['crown'] : WEARS[accessory] ?? WEARS.other;
  const hex = /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color.toLowerCase() : '#8f96b3';
  const out = { species, acc, eyes: own.eyes ?? 'dot', color: glowable(hex) };
  const t = perState(tones && typeof tones === 'object' ? tones : null, glowable), sc = perState(screen);
  if (t) out.tones = t;
  if (sc) out.screen = sc;
  return out;
}
// A pet without a Pal look keeps the key it had (so an update redraws nothing).
export const petKey = (p) => 'p' + hash(`7|${p.species}|${p.acc.join('+')}|${p.eyes}|${p.color}${p.tones || p.screen ? `|${lookSig(p.tones)}|${lookSig(p.screen)}` : ''}`).toString(36);
// open: the Focus hero's copy, drawn straight on the sidebar (no box), so its occluding shapes are
// filled with the sidebar's colour (OPEN_BACK) instead of the box's.
// small: the head alone (tileSvg's small), which petEl shows under SMALL_BELOW px wide.
export const petPath = (p, state, frame = 0, open = false, small = false) => `${PET_DIR}/${petKey(p)}-${state}${frame ? '-b' : ''}${open ? '-o' : ''}${small ? '-s' : ''}.svg`;
export const SMALL_BELOW = 46;
export const OPEN_BACK = '#0E0E0F';
export const BITS = `${PET_DIR}/bits-2.svg`;
const specFor = (p, state, tap) => ({ species: p.species, acc: p.acc, eyes: p.eyes, prop: 'laptop', pose: state, tap, scheme: idScheme(at(p.tones, state) ?? p.color, state), screen: at(p.screen, state) ?? undefined });
// Every file a pet needs: eight states and working's second frame, boxed and open. [relative path, svg].
// Since 2026-11-08 (DeNon picked "A · Faint + 1 · Lightsaber"): bare pets, no screen box; the app
// draws a faint container behind them and shows the state on its edge (petEl in crew.js).
export function petFiles(p) {
  const out = PET_STATES.map((st) => [petPath(p, st), tileSvg(specFor(p, st, false), { bare: true, back: '#131316' })]);
  out.push([petPath(p, 'work', 1), tileSvg(specFor(p, 'work', true), { bare: true, back: '#131316' })]);
  // The Focus hero's open copies (2026-11-08, hero v2: no box).
  for (const st of PET_STATES) out.push([petPath(p, st, 0, true), tileSvg(specFor(p, st, false), { bare: true, back: OPEN_BACK })]);
  out.push([petPath(p, 'work', 1, true), tileSvg(specFor(p, 'work', true), { bare: true, back: OPEN_BACK })]);
  // The heads for the small sizes (2026-11-09), boxed and open.
  for (const st of PET_STATES) out.push([petPath(p, st, 0, false, true), tileSvg(specFor(p, st, false), { small: true, back: '#131316' })], [petPath(p, st, 0, true, true), tileSvg(specFor(p, st, false), { small: true, back: OPEN_BACK })]);
  return out;
}


// A state's tile backdrop at its top edge, so a cropped pet runs into a matching
// fill (the board's #1C1B22 is the working tile's).
export const petScreen = (state) => (STATES[state] ?? STATES.rest).screen[0];
