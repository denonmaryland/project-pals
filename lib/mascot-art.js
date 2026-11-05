// Mascot art, drawn on demand: any body color, a shape, an accessory, and a face per mood. A pal
// with a custom look (its record's `look`) gets its own SVGs in data/crew-mascots/, named by a
// hash of the look so a change never shows a cached old image. Stock looks (a pal's color and its
// brain's accessory) are drawn the same way, on demand, by ensureLooks in crew.js.

export const LOOK_DIR = "data/crew-mascots";
export const MOODS = ["calm", "working", "blocked", "done", "asleep"];

// The ten stock colors (pearl is the head pal's), by name, as hex (custom looks can use any hex).
export const NAMED = {
  clay: "#e0866a", cream: "#e6e8ef", ink: "#1b1e2b", blue: "#6f9cf0", violet: "#a28cf0",
  amber: "#f0b245", mint: "#6fd6a8", pink: "#f08cc0", slate: "#8f96b3", pearl: "#f7f2e6",
};
export const SWATCHES = ["#e0866a", "#ff7a6b", "#f0b245", "#f7d64a", "#6fd6a8", "#9ccb9a", "#7cc8f2", "#6f9cf0",
  "#a28cf0", "#c4a7f5", "#f08cc0", "#f6b38e", "#8f96b3", "#e6e8ef", "#f7f2e6", "#1b1e2b"];

export const SHAPES = [
  ["folder", "Folder"], ["round", "Round"], ["pebble", "Pebble"], ["bean", "Bean"], ["squircle", "Squircle"],
  ["ghost", "Ghost"], ["cat", "Cat"], ["bear", "Bear"],
];
export const ACCESSORIES = [
  ["auto", "Its brain's"], ["none", "None"], ["crown", "Crown"], ["claude", "Bandage"], ["codex", "Monocle"],
  ["grok", "Antenna"], ["hermes", "Halo"], ["opencode", "Sprout"], ["gemini", "Ears"], ["bow", "Bow"],
  ["star", "Star"], ["other", "Arc"],
];

function rgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(hex) {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const mix = (hex, to, t) => "#" + rgb(hex).map((v, i) => Math.max(0, Math.min(255, Math.round(v + (rgb(to)[i] - v) * t))).toString(16).padStart(2, "0")).join("");
export const validHex = (s) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test((s ?? "").trim());
export const normHex = (s) => { let h = s.trim().replace("#", "").toLowerCase(); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return "#" + h; };

// Ink (eyes, mouth), blush and outline follow from the body color.
function palette(body) {
  const L = lum(body);
  const dark = L < 0.12;
  return {
    body,
    ink: dark ? "#ffffff" : mix(body, "#000000", 0.86),
    blush: "#ff7a8a",
    stroke: dark ? "rgba(255,255,255,0.24)" : L > 0.8 ? "rgba(0,0,0,0.14)" : null,
    hl: L > 0.75 ? 0.55 : dark ? 0.14 : 0.3,
  };
}

function face(mood, ink, blush) {
  const hl = ink !== "#ffffff" ? "#ffffff" : "#1b1e2b";
  const cheeks = `<ellipse cx="10.5" cy="28" rx="2.6" ry="1.4" fill="${blush}" opacity="0.42"/><ellipse cx="29.5" cy="28" rx="2.6" ry="1.4" fill="${blush}" opacity="0.42"/>`;
  const line = (d, w = 1.3) => `<path d="${d}" stroke="${ink}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  switch (mood) {
    case "calm": return [
      `<ellipse cx="14.5" cy="23" rx="2.2" ry="2.8" fill="${ink}"/><ellipse cx="25.5" cy="23" rx="2.2" ry="2.8" fill="${ink}"/><circle cx="15.2" cy="22" r="0.8" fill="${hl}"/><circle cx="26.2" cy="22" r="0.8" fill="${hl}"/>`,
      cheeks + line("M18.2 28.2 Q20 29.9 21.8 28.2")];
    case "working": return [
      `<ellipse cx="15.2" cy="23.2" rx="2.2" ry="2.6" fill="${ink}"/><ellipse cx="26.2" cy="23.2" rx="2.2" ry="2.6" fill="${ink}"/><circle cx="15.9" cy="22.3" r="0.8" fill="${hl}"/><circle cx="26.9" cy="22.3" r="0.8" fill="${hl}"/>`,
      cheeks + line("M12.6 19.4 L16.8 19.9", 1.2) + line("M23.6 19.9 L27.8 19.4", 1.2) + `<ellipse cx="20" cy="28.7" rx="1.5" ry="1.1" fill="${ink}"/>`
      + `<path d="M33.6 13 C35 14.6 35 16 33.6 16.8 C32.2 16 32.2 14.6 33.6 13Z" fill="#9bd6ff"/>`];
    case "blocked": return [
      `<ellipse cx="14.5" cy="23" rx="2.4" ry="3.1" fill="${ink}"/><ellipse cx="25.5" cy="23" rx="2.4" ry="3.1" fill="${ink}"/><circle cx="15.3" cy="21.8" r="0.9" fill="${hl}"/><circle cx="26.3" cy="21.8" r="0.9" fill="${hl}"/>`,
      line("M12 18.5 L16.6 17.2") + line("M23.4 17.2 L28 18.5") + `<ellipse cx="20" cy="29" rx="1.4" ry="1.6" fill="${ink}"/>`
      + `<circle cx="34" cy="8" r="4.4" fill="#ff6947"/><path d="M34 5.6 L34 8.6" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/><circle cx="34" cy="10.5" r="0.85" fill="#ffffff"/>`];
    case "done": return [
      line("M12.3 23.6 Q14.5 20.8 16.7 23.6", 1.6) + line("M23.3 23.6 Q25.5 20.8 27.7 23.6", 1.6),
      `<ellipse cx="10.5" cy="27.6" rx="2.8" ry="1.6" fill="${blush}" opacity="0.55"/><ellipse cx="29.5" cy="27.6" rx="2.8" ry="1.6" fill="${blush}" opacity="0.55"/>`
      + line("M17.4 27.6 Q20 31 22.6 27.6", 1.4) + `<path d="M33.5 5 L34.4 7.1 L36.5 8 L34.4 8.9 L33.5 11 L32.6 8.9 L30.5 8 L32.6 7.1 Z" fill="#ffe17a"/>`];
    default: return [
      line("M12.4 23 Q14.5 24.9 16.6 23", 1.4) + line("M23.4 23 Q25.5 24.9 27.6 23", 1.4),
      cheeks + `<ellipse cx="20" cy="28.8" rx="1.1" ry="0.9" fill="${ink}"/>`
      + `<path d="M31 4.5 L34.2 4.5 L31 8.1 L34.2 8.1" stroke="#a9aec8" stroke-width="0.9" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`];
  }
}

const ears = (body) => `<ellipse cx="8.6" cy="11.5" rx="4.2" ry="4.6" fill="${body}"/><ellipse cx="8.8" cy="11.8" rx="2.3" ry="2.6" fill="#ffffff" opacity="0.4"/>`
  + `<ellipse cx="31.4" cy="11.5" rx="4.2" ry="4.6" fill="${body}"/><ellipse cx="31.2" cy="11.8" rx="2.3" ry="2.6" fill="#ffffff" opacity="0.4"/>`;

const ACC = {
  claude: { front: `<g transform="rotate(32 28 12)"><rect x="22.5" y="10" width="11" height="4.4" rx="2.2" fill="#ffe8d2"/><rect x="26.6" y="10" width="2.8" height="4.4" fill="#f4caa2"/></g>` },
  codex: { front: `<circle cx="25.5" cy="23" r="4.9" fill="none" stroke="#c9a24a" stroke-width="1.3"/><path d="M30.2 24.6 Q32.6 30 30.6 35" stroke="#c9a24a" stroke-width="0.9" fill="none" stroke-linecap="round"/>` },
  grok: { back: `<path d="M20 9 L20 4.5" stroke="#4a5070" stroke-width="1.5" stroke-linecap="round"/><circle cx="20" cy="3.7" r="3.6" fill="#8eb0e6" opacity="0.25"/><circle cx="20" cy="3.7" r="2.4" fill="#8eb0e6"/>` },
  gemini: { ears: true },
  hermes: { back: `<ellipse cx="20" cy="5.8" rx="8.5" ry="2.3" fill="none" stroke="#f4e7a1" stroke-width="1.4"/>` },
  opencode: { back: `<path d="M20 9 C20.2 6 21.6 4 25 3.4 C24.8 6.6 22.8 8.4 20 9Z" fill="#7fd99a"/><path d="M20 9 C19.4 6.6 17.8 5.4 15.4 5.4 C16 7.6 17.6 8.8 20 9Z" fill="#5fc27f"/>` },
  other: { back: `<path d="M14 9.6 Q20 5 26 9.6" stroke="#c3c8dc" stroke-width="1.4" fill="none" stroke-linecap="round"/>` },
  crown: {
    back: `<circle cx="20" cy="7" r="6.6" fill="#ffd66b" opacity="0.22"/>`,
    front: `<path d="M13.2 10.6 L12.6 4.4 L16.6 7.6 L20 2.6 L23.4 7.6 L27.4 4.4 L26.8 10.6 Z" fill="#f2c14e" stroke="#c9952a" stroke-width="0.7" stroke-linejoin="round"/>`
      + `<rect x="13.2" y="9.4" width="13.6" height="1.9" rx="0.95" fill="#e0ac38"/><circle cx="20" cy="2.7" r="1.1" fill="#fff4cc"/><circle cx="12.6" cy="4.4" r="0.9" fill="#fff4cc"/><circle cx="27.4" cy="4.4" r="0.9" fill="#fff4cc"/><circle cx="20" cy="7.6" r="1.15" fill="#e8607a"/>`,
  },
  bow: { front: `<g transform="rotate(18 12 9)"><path d="M12 9 L6.5 5.6 Q5.4 9 6.5 12.4 Z" fill="#ff7aa8"/><path d="M12 9 L17.5 5.6 Q18.6 9 17.5 12.4 Z" fill="#ff7aa8"/><circle cx="12" cy="9" r="1.7" fill="#e8558a"/></g>` },
  star: { front: `<g transform="translate(-17 1)"><path d="M28.5 6.5 L29.8 9.4 L32.9 9.7 L30.6 11.8 L31.3 14.9 L28.5 13.3 L25.7 14.9 L26.4 11.8 L24.1 9.7 L27.2 9.4 Z" fill="#ffd34d" stroke="#e0a92a" stroke-width="0.6" stroke-linejoin="round"/></g>` },
  none: {},
};

function shape(name, c) {
  const st = c.stroke ? ` stroke="${c.stroke}" stroke-width="0.8"` : "";
  const hl = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.4" fill="#ffffff" opacity="${c.hl}" transform="rotate(-22 ${x} ${y})"/>`;
  switch (name) {
    case "pebble": return { body: `<ellipse cx="20" cy="24" rx="17" ry="13"${st} fill="${c.body}"/>` + hl(12.5, 17.5) };
    case "bean": return { body: `<ellipse cx="20" cy="22.5" rx="14" ry="16"${st} fill="${c.body}"/>` + hl(14, 14) };
    case "squircle": return { body: `<rect x="4" y="8.5" width="32" height="29" rx="12"${st} fill="${c.body}"/>` + hl(12.5, 15) };
    case "ghost": return { body: `<path d="M4 23 C4 13 11 7.5 20 7.5 C29 7.5 36 13 36 23 L36 35.5 Q33.3 33 30.7 35.5 Q28 38 25.3 35.5 Q22.7 33 20 35.5 Q17.3 38 14.7 35.5 Q12 33 9.3 35.5 Q6.7 38 4 35.5 Z"${st} fill="${c.body}"/>` + hl(12.5, 15) };
    case "cat": return {
      back: `<path d="M6 16 L7.5 4 L16 10.5 Z" fill="${c.body}"${st}/><path d="M34 16 L32.5 4 L24 10.5 Z" fill="${c.body}"${st}/><path d="M8.2 12.5 L9 7.2 L12.8 10 Z" fill="#ffb3c2" opacity="0.7"/><path d="M31.8 12.5 L31 7.2 L27.2 10 Z" fill="#ffb3c2" opacity="0.7"/>`,
      body: `<ellipse cx="20" cy="23" rx="16" ry="14.5"${st} fill="${c.body}"/>` + hl(13.5, 15.5),
    };
    case "bear": return { back: ears(c.body), body: `<ellipse cx="20" cy="23" rx="16" ry="14.5"${st} fill="${c.body}"/>` + hl(13.5, 15.5) };
    case "folder": {
      // A folder: a darker back panel with a tab, a sheet of paper peeking out, a front panel with the face.
      const back = mix(c.body, "#000000", lum(c.body) < 0.12 ? -0.25 : 0.16);
      return {
        body: `<path d="M3.5 12.5 Q3.5 9 7 9 L14.2 9 Q15.6 9 16.5 10.2 L17.6 11.6 L33 11.6 Q36.5 11.6 36.5 15 L36.5 33.5 Q36.5 37 33 37 L7 37 Q3.5 37 3.5 33.5 Z" fill="${back}"${st}/>`
          + `<rect x="7" y="13" width="26" height="12" rx="1.6" fill="#ffffff" opacity="0.92"/>`
          + `<path d="M9.5 16.2 H24 M9.5 19 H28" stroke="${mix(c.body, "#9aa0b4", 0.6)}" stroke-width="0.8" stroke-linecap="round" opacity="0.6"/>`
          + `<path d="M3.5 18.8 Q3.5 15.8 6.5 15.8 L33.5 15.8 Q36.5 15.8 36.5 18.8 L36.5 33.5 Q36.5 37 33 37 L7 37 Q3.5 37 3.5 33.5 Z" fill="${c.body}"${st}/>`
          + `<path d="M6.5 17.6 L33.5 17.6" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="${Math.min(0.5, c.hl + 0.1)}"/>`,
      };
    }
    default: return { body: `<ellipse cx="20" cy="23" rx="16" ry="14.5"${st} fill="${c.body}"/>` + hl(13.5, 15.5) };
  }
}

const wrap = (inner, dim) => `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 40 40"><g${dim ? ' opacity="0.8"' : ""}>${inner}</g></svg>\n`;

// One mood of a look: the whole mascot, the body without eyes, and the eyes alone.
export function draw(look, mood) {
  const c = palette(look.color);
  const sh = shape(look.shape ?? "round", c);
  const acc = ACC[look.accessory] ?? {};
  let [eyes, rest] = face(mood, c.ink, c.blush);
  let front = acc.front ?? "";
  // On a folder the face sits lower, in the middle of the front panel (and the monocle with it).
  if (look.shape === "folder") {
    const down = (svg) => `<g transform="translate(0 2.2)">${svg}</g>`;
    eyes = down(eyes);
    rest = down(rest);
    if (look.accessory === "codex") front = down(front);
  }
  const back = (sh.back ?? "") + (acc.ears ? ears(c.body) : acc.back ?? "");
  const body = back + sh.body + front + rest;
  const dim = mood === "asleep";
  return { full: wrap(body + eyes, dim), body: wrap(body, dim), eyes: wrap(eyes, dim) };
}

function hash(s) { let h = 2166136261; for (const ch of s ?? "") h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
// A resolved look (accessory decided) → its file key.
export const lookKey = (look) => "m" + hash(`2|${look.color}|${look.shape}|${look.accessory}`).toString(36);
export const lookPath = (look, mood, layer) => {
  const k = lookKey(look);
  return layer === "body" ? `${LOOK_DIR}/${k}-${mood}-body.svg` : layer === "eyes" ? `${LOOK_DIR}/${k}-eyes-${mood}.svg` : `${LOOK_DIR}/${k}-${mood}.svg`;
};

// Every file a look needs (or just one mood's whole mascot, for previews): [relative path, svg].
export function lookFiles(look, moods = MOODS, layers = true) {
  const out = [];
  for (const m of moods) {
    const d = draw(look, m);
    out.push([lookPath(look, m), d.full]);
    if (layers) { out.push([lookPath(look, m, "body"), d.body]); out.push([lookPath(look, m, "eyes"), d.eyes]); }
  }
  return out;
}
