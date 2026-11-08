// Project Pals pocket pets: each pal as a little LED-dot critter in a status tile. install.sh copies
// this file into each mod as ./pets.js (next to crew.js, which uses it).
//
// The engine (species, accessories, eyes, the profile laptop, the eight state poses, the LED grid)
// is docs/pocket-pets/pets.mjs from the pocket-pets study, unchanged except: the tile has the
// design system's r3 corners (docs/design-system/analysis.md), and the laptop has a "tap" frame (paw
// up) so working can alternate frames natively. One tile is 172x135; every layer is filled with
// round LEDs on a fixed hex grid, so the dots never move when the pal does.
//
// A pal's tile = its species and accessory (from its brain) + its own colour (the pal glows in it)
// + its state (the pose, and the tile's frame: green edge for done / asks you, edge strips for
// PR open / merged / closing / stuck, the blue loader corner while working).

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
const T = (d, ox, oy) => d.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g, (_, a, b) => `${+a + ox},${+b + oy}`);

// ---------- species (body centred on 66,66 before offset) ----------
function species(sp, ox, oy) {
  const t = (d) => T(d, ox, oy), C = (x, y, r, ry) => circ(x + ox, y + oy, r, ry), K = (x1, y1, x2, y2, w) => cap(x1 + ox, y1 + oy, x2 + ox, y2 + oy, w), Rr = (x, y, w, h, r) => rr(x + ox, y + oy, w, h, r);
  let body = C(66, 66, 30, 29), parts = [], E = [[70, 60], [87, 60]], er = [6.5, 7.5], feet = true;
  if (sp === 'kit') parts.push(t('M44,46 L46,22 L60,40 Z M76,40 L90,22 L90,46 Z'));
  if (sp === 'bun') parts.push(K(54, 42, 48, 10, 11), K(76, 40, 84, 10, 11));
  if (sp === 'cub') parts.push(C(44, 42, 9), C(88, 42, 9));
  if (sp === 'fox') parts.push(t('M42,48 L40,16 L62,38 Z M74,38 L94,16 L92,48 Z'), t('M40,86 C18,90 12,64 24,54 C24,70 30,80 44,78 Z'));
  if (sp === 'mochi') { body = C(66, 72, 33, 25); feet = false; parts.push(K(64, 48, 62, 34, 3.5), t('M62,34 C66,22 80,22 84,22 C80,32 70,36 62,34 Z')); E = [[72, 66], [88, 66]]; }
  if (sp === 'dino') parts.push(t('M46,42 L38,30 L52,37 Z M38,56 L24,50 L39,46 Z M37,72 L22,72 L36,62 Z'), t('M42,90 C28,98 16,94 12,84 C24,88 32,84 40,78 Z'));
  if (sp === 'owl') { parts.push(t('M46,44 L36,20 L58,36 Z M74,36 L96,20 L86,44 Z')); er = [8, 9]; E = [[66, 60], [87, 60]]; }
  if (sp === 'pup') parts.push(t('M50,40 C34,40 30,64 38,72 C44,68 48,56 54,46 Z M80,40 C98,38 100,62 92,70 C86,66 82,54 78,46 Z'));
  if (feet) parts.push(Rr(46, 90, 12, 14, 5), Rr(70, 90, 12, 14, 5));
  return { body, parts, E: E.map(([x, y]) => [x + ox, y + oy]), er, top: 36 + oy, ox, oy };
}

// ---------- accessories (drawn on top; 'cut' layers punch holes) ----------
function accessory(a, S, L) {
  const { ox, oy } = S, t = (d) => T(d, ox, oy);
  const lit = (d, tone = 1) => L.push({ d, tone, glow: true, rule: 'evenodd' });
  const hot = (d) => L.push({ d, tone: 'hot' });
  const back = (d) => L.push({ d, back: true });
  if (a === 'phones') { const band = t('M36,58 C30,16 102,14 96,58 L89,58 C92,26 42,26 43,58 Z'); back(band); L.push({ d: band, tone: 0.45, rule: 'evenodd' }); const cupD = rr(32 + ox, 50 + oy, 17, 24, 7); back(cupD); L.push({ d: cupD, tone: 0.5 }); hot(glyph('dot', 40 + ox, 62 + oy)); }
  if (a === 'glasses') { back(rr(62 + ox, 52 + oy, 32, 15, 5)); lit(rr(62 + ox, 52 + oy, 32, 15, 5) + ' ' + rr(65 + ox, 55 + oy, 11, 9, 3) + ' ' + rr(80 + ox, 55 + oy, 11, 9, 3), 0.9); }
  if (a === 'beanie') { back(t('M36,48 C36,20 96,20 96,48 Z')); lit(t('M36,48 C36,20 96,20 96,48 Z'), 0.75); lit(rr(34 + ox, 44 + oy, 64, 8, 4), 1); hot(circ(66 + ox, 20 + oy, 5)); }
  if (a === 'cap') { back(t('M38,44 C38,24 92,22 94,44 Z') + ' ' + rr(84 + ox, 38 + oy, 26, 7, 3.5)); lit(t('M38,44 C38,24 92,22 94,44 Z'), 0.8); lit(rr(84 + ox, 38 + oy, 26, 7, 3.5), 1); }
  if (a === 'scarf') { back(rr(40 + ox, 78 + oy, 54, 10, 5) + ' ' + rr(46 + ox, 84 + oy, 10, 18, 4)); lit(rr(40 + ox, 78 + oy, 54, 10, 5), 0.7); lit(rr(46 + ox, 84 + oy, 10, 18, 4), 0.7); }
  if (a === 'bow') { back(t('M52,34 L40,26 L42,42 Z M52,34 L64,26 L62,42 Z')); hot(t('M52,34 L40,26 L42,42 Z M52,34 L64,26 L62,42 Z')); }
  if (a === 'crown') { back(t('M50,36 L50,22 L58,30 L66,18 L74,30 L82,22 L82,36 Z')); hot(t('M50,36 L50,22 L58,30 L66,18 L74,30 L82,22 L82,36 Z')); }
  if (a === 'antenna') { lit(cap(66 + ox, 38 + oy, 72 + ox, 18 + oy, 3.5), 0.9); hot(circ(73 + ox, 15 + oy, 4.5)); }
  if (a === 'flower') { hot(t('M84,30 m-5,0 a5,5 0 1 0 10,0 a5,5 0 1 0 -10,0')); lit(circ(84 + ox, 22 + oy, 4) + ' ' + circ(84 + ox, 38 + oy, 4) + ' ' + circ(76 + ox, 30 + oy, 4) + ' ' + circ(92 + ox, 30 + oy, 4), 0.8); }
  if (a === 'hood') { back(t('M32,70 C26,24 106,20 100,70 L92,70 C94,36 40,36 40,70 Z')); lit(t('M32,70 C26,24 106,20 100,70 L92,70 C94,36 40,36 40,70 Z'), 0.7); }
}

// ---------- eyes ----------
function eyes(style, S, mood) {
  const E = S.E, [r, ry] = S.er;
  const sock = (pts, a = r, b = ry) => pts.map(([x, y]) => { const [n, sx] = snap(x, y); return circ(sx, rowY(n), a, b); }).join(' ');
  const pup = (pts) => pts.map(([x, y]) => { const [n, sx] = snap(x, y); return cell(n, sx); }).join(' ');
  const slit = (pts, w = 15) => pts.map(([x, y]) => { const [n, sx] = snap(x, y); return rr(sx - w / 2, rowY(n) - 3.4, w, 6.8, 3.4); }).join(' ');
  if (mood === 'rest') return { cut: slit([[E[0][0] - 9, E[0][1]], [E[1][0] - 1, E[1][1]]]), hot: '' };
  if (mood === 'happy') return { cut: sock(E, r + 1, ry + 1), hot: E.map(([x, y]) => glyph('hap', x, y - 3)).join(' ') };
  if (mood === 'x') { const E2 = [[E[0][0] - 4, E[0][1]], [E[1][0] + 3, E[1][1]]]; return { cut: sock(E2, 8, 9), hot: E2.map(([x, y]) => glyph('x', x, y)).join(' ') }; }
  if (style === 'big') { const E2 = [[E[0][0] - 4, E[0][1]], [E[1][0] + 3, E[1][1]]]; return { cut: sock(E2, r + 1.5, ry + 2), hot: E2.map(([x, y]) => glyph('shine', x, y)).join(' ') }; }
  if (style === 'hollow') return { cut: sock(E, r + 0.5, ry + 0.5), hot: '' };
  if (style === 'sleepy') return { cut: E.map(([x, y]) => { const [n, sx] = snap(x, y); return rr(sx - 7, rowY(n) - 2.9, 14, 9, 3); }).join(' '), hot: pup(E.map(([x, y]) => [x, y + 3])) };
  if (style === 'visor') { const [n, sx] = snap((E[0][0] + E[1][0]) / 2, E[0][1]); return { cut: rr(E[0][0] - 10, rowY(n) - 5, E[1][0] - E[0][0] + 20, 10, 5), hot: glyph('dash', sx, E[0][1]) }; }
  if (style === 'cyclops') { const c = [(E[0][0] + E[1][0]) / 2 + 2, E[0][1]]; return { cut: sock([c], 9, 10), hot: pup([c]) }; }
  if (style === 'wink') return { cut: sock([E[0]]) + ' ' + slit([E[1]], 13), hot: pup([E[0]]) };
  if (style === 'angry') return { cut: sock(E) + ' ' + cap(E[0][0] - 8, E[0][1] - 13, E[0][0] + 6, E[0][1] - 9, 5) + ' ' + cap(E[1][0] - 6, E[1][1] - 9, E[1][0] + 8, E[1][1] - 13, 5), hot: pup(E) };
  if (style === 'dots') return { cut: '', hot: pup(E) };
  return { cut: sock(E), hot: pup(E) };   // default: socket + lit pupil
}

// ---------- props ----------
// each returns arm(s) + prop layers; laptop styles are the signature
function prop(kind, S, L, mood) {
  const lit = (d, tone = 1) => d && L.push({ d, tone, glow: true, rule: 'evenodd' });
  const dim = (d, tone = 0.45, rule) => d && L.push({ d, tone, rule });
  const hot = (d) => d && L.push({ d, tone: 'hot' });
  const back = (d) => d && L.push({ d, back: true });
  const oy = S.oy, arm = (x2, y2) => mood !== 'rest' && lit(cap(90 + S.ox, 74 + oy, x2, y2, 8));
  const code = (lines) => hot(lines.map(([n, m0, c]) => { const x0 = (n % 2 ? 0 : PX / 2) + m0 * PX - PX / 2; return rr(x0, rowY(n) - 2.6, c * PX, 5.2, 2.6); }).join(' '));
  switch (kind) {
    case 'keys': dim(rr(104, rowY(15) - PY / 2, 46, PY, PY / 2)); arm(112, 86); break;
    case 'side': {   // profile laptop: thick lid with a lit screen edge, base slab with keys, light falling on the pal
      dim(poly([[104, 88], [150, 52], [156, 56], [114, 96]]), 0.08);            // screen light
      dim(rr(98, 90, 60, 9, 4), 0.55);                                      // base
      dim(glyph('dash', 112, 90), 0.85);                                    // keys on the deck edge
      dim(cap(152, 94, 160, 36, 10), 0.5);                                  // lid
      L.push({ d: cap(147, 91, 155, 40, 3.2), tone: 'hot' });              // screen edge facing the pal
      if (S.tap) arm(122, 80); else { arm(116, 88); mood !== 'rest' && hot(glyph('dot', 112, 90)); }   // tap: paw up / paw down, key lit
      break; }
    case 'front': {  // open laptop, three-quarter: leaning lid with code, wide keyboard deck, trackpad
      const scr = poly([[110, 26], [158, 20], [156, 70], [108, 76]]), inner = poly([[114, 30], [154, 25], [152, 66], [112, 71.5]]);
      dim(scr + ' ' + inner, 0.62, 'evenodd'); dim(inner, 0.14);
      if (mood !== 'rest') code([[6, 17, 4], [8, 18, 3], [10, 17, 4]]);
      dim(poly([[104, 78], [158, 72], [170, 92], [98, 100]]), 0.4);        // deck
      dim([[14, 16, 7], [15, 16, 7]].map(([n, m0, c]) => { const x0 = (n % 2 ? 0 : PX / 2) + m0 * PX - PX / 2; return rr(x0 + 2, rowY(n) - 2.2, c * PX - 4, 4.4, 2); }).join(' '), 0.8);   // key rows
      dim(rr(124, 92, 18, 5, 2), 0.7);                                     // trackpad
      arm(114, 86); break; }
    case 'peek': case 'stickers': {   // pal behind the lid, paws on top; glowing logo on the lid back
      const lid = rr(46, 74, 84, 44, 8), inner = rr(50, 78, 76, 36, 6);
      back(lid); dim(lid + ' ' + inner, 0.62, 'evenodd'); dim(inner, 0.3);
      if (kind === 'peek') hot(circ(88, 96, 7));
      else { hot(circ(64, 88, 5)); dim(rr(96, 84, 20, 10, 4), 0.9); hot(glyph('heart', 74, 98)); dim(glyph('spark', 116, 104), 0.9); }
      dim(rr(40, 118, 96, 6, 3), 0.4);
      lit(circ(58, 74, 6.5) + ' ' + circ(118, 74, 6.5)); break; }
    case 'belly': {  // lying on its belly, tiny laptop on the floor
      dim(rr(106, 100, 48, 7, 3), 0.55); dim(cap(148, 103, 158, 66, 8), 0.5); L.push({ d: cap(144, 100, 152, 70, 3), tone: 'hot' });
      mood !== 'rest' && lit(cap(94, 90, 118, 98, 7)); break; }
    case 'retro': {  // chunky beige-era laptop in profile with a thick screen bezel
      dim(rr(98, 88, 60, 12, 4), 0.55); dim(cap(150, 92, 158, 36, 14), 0.45); L.push({ d: cap(144, 88, 151, 42, 4), tone: 'hot' });
      dim(rr(104, 82, 30, 4, 2), 0.7); arm(112, 86); break; }
    case 'phone': lit(cap(90, 76 + oy, 104, 64, 8)); dim(rr(100, 36, 20, 34, 4), 0.6); hot(rr(103, 40, 14, 22, 2)); break;
    case 'pad': lit(cap(90, 74 + oy, 110, 76, 8)); dim(rr(108, 58, 40, 30, 4), 0.55); hot(glyph('heart', 128, 64)); break;
    case 'mug': lit(cap(90, 76 + oy, 104, 74, 8)); dim(rr(100, 62, 18, 22, 4) + ' ' + circ(121, 72, 5, 6) + ' ' + circ(121, 72, 2, 3), 0.65, 'evenodd'); dim(glyph('dash2', 106, 52) + ' ' + glyph('dot', 112, 44), 0.5); break;
    case 'book': lit(cap(90, 74 + oy, 108, 72, 8)); dim(poly([[100, 58], [124, 62], [148, 58], [148, 92], [124, 96], [100, 92]]), 0.6); dim(cap(124, 62, 124, 96, 2), 0.2); break;
    case 'crt': dim(rr(104, 28, 58, 50, 6) + ' ' + rr(110, 34, 46, 38, 4), 0.55, 'evenodd'); dim(rr(110, 34, 46, 38, 4), 0.12); code([[7, 17, 3], [9, 17, 5], [11, 18, 2]]); dim(rr(122, 78, 22, 8, 2), 0.5); dim(rr(102, 92, 56, 6, 3), 0.45); arm(112, 92); break;
    case 'holo': dim(rr(106, 22, 40, 26, 4), 0.3); hot(rr(112, 28, 18, 4, 2) + ' ' + rr(112, 36, 26, 4, 2)); dim(rr(124, 60, 36, 22, 4), 0.25); hot(rr(130, 66, 20, 4, 2)); dim(rr(104, rowY(15) - PY / 2, 46, PY, PY / 2), 0.35); arm(112, 86); break;
    case 'pad2': lit(cap(90, 72 + oy, 112, 80, 8)); lit(cap(44, 76 + oy, 30, 86, 7)); dim(rr(98, 74, 44, 20, 9), 0.6); hot(glyph('dot', 109, 84) + ' ' + glyph('pair', 126, 80)); break;   // game controller
    case 'music': hot(glyph('note', 116, 24)); dim(glyph('note', 136, 54), 0.6); break;
    case 'none': break;
  }
}

// ---------- assemble one pal ----------
export function pal(spec) {
  const { species: sp = 'kit', pose = 'work', acc = [], eyes: es = 'dot', prop: pr = 'side' } = spec;
  const L = [];
  let ox = spec.ox || 0, oy = spec.oy || 0;
  if (pose === 'merged') oy -= 8; if (pose === 'rest') oy += 4;
  if (pr === 'peek' || pr === 'stickers') { ox += 22; oy += 4; }
  if (pr === 'front') ox -= 10;
  if (pr === 'lap') { ox -= 8; }
  if (pr === 'belly') { oy += 10; }
  const S = species(sp, ox, oy);
  S.tap = Boolean(spec.tap);
  if (pr === 'peek' || pr === 'stickers') S.E = S.E.map(([x, y]) => [x - 10, y]);
  const mood = pose === 'rest' ? 'rest' : pose === 'done' || pose === 'merged' ? 'happy' : pose === 'stuck' ? 'x' : null;
  const ey = eyes(es, S, mood);
  const tone = pose === 'rest' ? 0.75 : 1;
  const bodyD = pr === 'belly' ? circ(68 + ox, 70 + oy, 36, 26) : S.body;
  L.push({ d: bodyD + ' ' + ey.cut, tone, glow: true, rule: 'evenodd' });
  S.parts.filter((p, i) => !(pr === 'belly' && i >= S.parts.length - 2 && sp !== 'mochi')).forEach((p) => L.push({ d: p, tone, glow: true, rule: 'evenodd' }));
  ey.hot && L.push({ d: ey.hot, tone: 'hot' });
  acc.forEach((a) => accessory(a, S, L));
  // pose extras (arms/props)
  const lit = (d) => L.push({ d, tone: 1, glow: true, rule: 'evenodd' }), hot = (d) => L.push({ d, tone: 'hot' }), dim = (d, t = 0.45) => L.push({ d, tone: t });
  if (pose === 'work' || pose === 'stuck' || pose === 'rest') prop(pr, S, L, pose);
  if (pose === 'rest') { dim(glyph('z', 112 + (pr === 'peek' || pr === 'stickers' ? 22 : 0), 24), 0.8); dim(glyph('z', 132 + (pr === 'peek' || pr === 'stickers' ? 14 : 0), 12), 0.5); L.forEach((l) => { if (l.arm) l.d = ''; }); }
  if (pose === 'done') { lit(cap(90 + ox, 66 + oy, 104 + ox, 42 + oy, 8)); lit(cap(42 + ox, 66 + oy, 30 + ox, 44 + oy, 8)); hot(glyph('spark', 128, 30)); }
  if (pose === 'ask') { lit(cap(90 + ox, 68 + oy, 100 + ox, 38 + oy, 8)); hot(glyph('q', 118, 22)); }
  if (pose === 'pr') { lit(cap(92 + ox, 74 + oy, 110, 68, 8)); L.push({ d: rr(108, 44, 30, 38, 4) + ' ' + rr(112, 48, 22, 30, 2), tone: 0.7, rule: 'evenodd' }); hot(glyph('dash', 123, 55) + ' ' + glyph('dash', 123, 66)); }
  if (pose === 'merged') { lit(cap(90 + ox, 66 + oy, 104 + ox, 42 + oy, 8)); lit(cap(42 + ox, 66 + oy, 30 + ox, 44 + oy, 8)); hot(glyph('spark', 124, 30) + ' ' + glyph('spark', 140, 64)); dim(glyph('dash', 66, 116), 0.4); }
  if (pose === 'closing') { lit(cap(90 + ox, 68 + oy, 108 + ox, 46 + oy, 8)); dim(glyph('dash', 120, 40) + ' ' + glyph('dash', 124, 56), 0.6); }
  if (pose === 'stuck') hot(glyph('sweat', 104, 30));
  return L.filter((l) => l.d && l.d.trim());
}


// ---------- render one tile as a whole SVG file ----------
let uidN = 0;
// Bare: the pet alone, no screen box (no fill, outline, glow wash or edge strips), cropped tight
// (BARE_VIEW) so it fills ~25% more of its space; the app draws a light container behind it.
export const BARE_VIEW = [26, 10, 138, 108];
export function tileSvg(spec, opts = {}) {
  const bare = Boolean(opts.bare);
  const id = `t${uidN++}`;
  const s = typeof spec.scheme === 'string' ? STATES[spec.scheme] : spec.scheme;
  let defs = '', b = '';
  const dotPat = (pid, col, op) => `<pattern id="${pid}" x="0" y="0" width="${PX}" height="${PY * 2}" patternUnits="userSpaceOnUse"><circle cx="${PX / 2}" cy="${PY / 2}" r="${DR}" fill="${col}" fill-opacity="${op}"/><circle cx="0" cy="${PY * 1.5}" r="${DR}" fill="${col}" fill-opacity="${op}"/><circle cx="${PX}" cy="${PY * 1.5}" r="${DR}" fill="${col}" fill-opacity="${op}"/></pattern>`;
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
  const L = pal(spec);
  const glowD = L.filter((l) => l.glow).map((l) => l.d).join(' ');
  defs += `<filter id="${id}b3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter><filter id="${id}b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>`;
  b += `<path d="${glowD}" fill-rule="evenodd" fill="${s.glow}" fill-opacity="${0.28 * (s.ga / 0.16)}" filter="url(#${id}b8)"/>`;
  b += `<path d="${glowD}" fill-rule="evenodd" fill="${s.glow}" fill-opacity="0.52" filter="url(#${id}b3)"/>`;
  const bgFill = bare ? (opts.back ?? '#0B0B0C') : s.screen[1];
  L.forEach((l, n) => {
    if (l.back) { b += `<path d="${l.d}" fill="${bgFill}"/>`; return; }
    const pid = `${id}p${n}`, hot = l.tone === 'hot';
    const col = hot ? '#ffffff' : s.dot, op = hot ? 0.95 : l.tone;
    defs += dotPat(pid, col, op);
    const rule = l.rule ? ` fill-rule="${l.rule}"` : '';
    if (op >= 0.9) b += `<path d="${l.d}"${rule} fill="${s.gap || s.glow}" fill-opacity="0.1"/>`;
    b += `<path d="${l.d}"${rule} fill="url(#${pid})"/>`;
  });
  const [vx, vy, vw, vh] = bare ? BARE_VIEW : [0, 0, TW, TH];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vw}" height="${vh}" viewBox="${vx} ${vy} ${vw} ${vh}"><defs>${defs}</defs>${b}</svg>`;
}

// Bits rising off the laptop screen while working: a few white LEDs on the same grid, alone on a
// transparent tile, so a layer over the tile can drift them up and fade them (natively).
export function bitsSvg() {
  const d = glyph('dot', 140, 40) + ' ' + glyph('dot', 150, 26) + ' ' + glyph('dot', 133, 16);
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
export function petSpec({ name, god, accessory, color, pet }) {
  const own = pet && typeof pet === 'object' ? pet : {};
  const species = PET_SPECIES.includes(own.species) ? own.species : god ? 'kit' : PET_SPECIES[hash(name) % PET_SPECIES.length];
  const acc = Array.isArray(own.acc) ? own.acc.slice(0, 2) : god ? ['crown'] : WEARS[accessory] ?? WEARS.other;
  const hex = /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color.toLowerCase() : '#8f96b3';
  return { species, acc, eyes: own.eyes ?? 'dot', color: glowable(hex) };
}
export const petKey = (p) => 'p' + hash(`3|${p.species}|${p.acc.join('+')}|${p.eyes}|${p.color}`).toString(36);
// open: the Focus hero's copy, drawn straight on the sidebar (no box), so its occluding shapes are
// filled with the sidebar's colour (OPEN_BACK) instead of the box's.
export const petPath = (p, state, frame = 0, open = false) => `${PET_DIR}/${petKey(p)}-${state}${frame ? '-b' : ''}${open ? '-o' : ''}.svg`;
export const OPEN_BACK = '#0E0E0F';
export const BITS = `${PET_DIR}/bits-1.svg`;
const specFor = (p, state, tap) => ({ species: p.species, acc: p.acc, eyes: p.eyes, prop: 'side', pose: state, tap, scheme: idScheme(p.color, state) });
// Every file a pet needs: eight states and working's second frame, boxed and open. [relative path, svg].
// Since 2026-11-08 (DeNon picked "A · Faint + 1 · Lightsaber"): bare pets, no screen box; the app
// draws a faint container behind them and shows the state on its edge (petEl in crew.js).
export function petFiles(p) {
  const out = PET_STATES.map((st) => [petPath(p, st), tileSvg(specFor(p, st, false), { bare: true, back: '#131316' })]);
  out.push([petPath(p, 'work', 1), tileSvg(specFor(p, 'work', true), { bare: true, back: '#131316' })]);
  // The Focus hero's open copies (2026-11-08, hero v2: no box).
  for (const st of PET_STATES) out.push([petPath(p, st, 0, true), tileSvg(specFor(p, st, false), { bare: true, back: OPEN_BACK })]);
  out.push([petPath(p, 'work', 1, true), tileSvg(specFor(p, 'work', true), { bare: true, back: OPEN_BACK })]);
  return out;
}


// A state's tile backdrop at its top edge, so a cropped pet runs into a matching
// fill (the board's #1C1B22 is the working tile's).
export const petScreen = (state) => (STATES[state] ?? STATES.rest).screen[0];
