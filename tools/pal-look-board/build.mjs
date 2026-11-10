// Builds the Pal look design board (T92): every preset drawn the way the app draws it, with the
// real renderer (lib/pets.js) and the real preset logic (lib/pallook.js). Everything on it is made
// up (Lumen, Harbor, Kite, Orbit).
//   node tools/pal-look-board/build.mjs <out dir> [theme.json]
// then render board.png from index.html (see the README line at the end of the output).
import { mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { petSpec, petFiles, petPath, petKey } from "../../lib/pets.js";
import { crewLook, palLookOf, pairFit, splitSizes, contrastOf, PET_LOOKS, SCREEN_LOOKS, SPLIT_PALETTES, BRAIN_COLORS, BRAIN_NAMES, STATE_COLORS, themeColors, DEFAULT_PAL_LOOK, DEMO_PALS } from "../../lib/pallook.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.argv[2];
if (!OUT) { console.error("usage: build.mjs <out dir> [theme.json]"); process.exit(2); }
mkdirSync(join(OUT, "art"), { recursive: true });
for (const f of ["pet-aura-row.svg", "pet-floor-work.svg", "pet-floor-ask.svg", "pet-floor-done.svg", "pet-floor-stuck.svg", "pet-floor-pr.svg", "pet-floor-merged.svg", "pet-floor-closing.svg"])
  copyFileSync(join(ROOT, "mods/crew-roster/icons", f), join(OUT, "art", f));

// ---------- the made-up crew, in sidebar order (the app's own preview crew, plus topics) ----------
const EXTRA = { "Orchestrator": ["ops", "Working · 2m"], "Lumen - Web": ["checkout"], "Lumen - API": ["rate-limits", "Working · 7m"], "Harbor - App": ["onboarding"],
  "Harbor - Sync": ["conflicts", "Working · 31m"], "Harbor - Site": ["deploy"], "Kite - CLI": ["flags", "Working · 4m"], "Kite - Infra": ["terraform"], "Orbit - Ops": ["alerts"] };
const CREW = DEMO_PALS.map((p) => ({ ...p, topic: EXTRA[p.name]?.[0], word: EXTRA[p.name]?.[1] }));
const WORDS = { work: ["Working", "#4CA1F2"], ask: ["Needs you", "#E8AA0A"], done: ["Done", "#34D098"], stuck: ["Stuck", "#E8AA0A"], pr: ["PR open", "#3FBF78"], rest: ["Resting", "#C8C8C8"], asleep: ["Asleep", "#808082"] };
const THEMES = {
  "Tokyo Night": { accent: "#7aa2f7", ansi: ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6", "#414868", "#ff899d", "#9fe044", "#faba4a", "#8db0ff", "#c7a9ff", "#a4daff", "#c0caf5"] },
  "Gruvbox": { accent: "#fe8019", ansi: ["#282828", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2", "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#fbf1c7"] },
  "Catppuccin": { accent: "#cba6f7", ansi: ["#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de", "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8"] },
  "Nord": { accent: "#88c0d0", ansi: ["#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0", "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4"] },
};
// The theme in use here, when given (only its colours are read).
let HERE = null;
if (process.argv[3] && existsSync(process.argv[3])) {
  try { const t = JSON.parse(readFileSync(process.argv[3], "utf8")); HERE = { accent: t.colors?.accent ?? t.ansi?.[4], ansi: t.ansi }; } catch {}
}
const THEME = HERE ?? THEMES["Tokyo Night"];

// ---------- art ----------
const written = new Set();
// One pal's open tile for a state, drawn by the app's own pipeline (petSpec → petFiles); returns
// the file's name under art/.
function art(pal, lookOne, state) {
  const p = petSpec({ name: pal.name, god: pal.head, accessory: pal.brain, color: lookOne.color, tones: lookOne.tones, screen: lookOne.screen });
  const st = state === "asleep" ? "rest" : state;
  const path = petPath(p, st, 0, true), name = path.split("/").pop();
  if (!written.has(name)) {
    const hit = petFiles(p).find(([f]) => f === path);
    writeFileSync(join(OUT, "art", name), hit[1]);
    written.add(name);
  }
  return `art/${name}`;
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

// A pet as the Large rows draw it (crew.js palPet): bare, over a soft aura, with the state's pool.
function petHtml(pal, lookOne, state, w = 75) {
  const h = Math.round(w * 108 / 138), k = w / 75, ax = Math.round(12 * k), ay = Math.round(9 * k);
  const st = state === "asleep" ? "rest" : state, lit = w >= 60 && state !== "asleep" && st !== "rest";
  return `<span class="pet${state === "asleep" ? " zz" : ""}" style="width:${w}px;height:${h}px">`
    + `<img class="aura" src="art/pet-aura-row.svg" style="left:${-ax}px;top:${-ay}px;width:${w + 2 * ax}px;height:${h + 2 * ay}px">`
    + (lit ? `<img class="floor${st === "ask" ? " breathe" : ""}" src="art/pet-floor-${st}.svg" style="left:-6px;top:${h - 17}px;width:${w + 12}px;height:24px">` : "")
    + `<img class="art" src="${art(pal, lookOne, state)}" style="width:${w}px;height:${h}px"></span>`;
}
function rowHtml(pal, lookOne, state = pal.state, sel = false) {
  const [word, color] = WORDS[state];
  const tail = pal.topic && state !== "asleep" && state !== "rest" ? `<u> · #${esc(pal.topic)}</u>` : "";
  return `<div class="prow${sel ? " sel" : ""}">${petHtml(pal, lookOne, state)}<div class="pt"><div class="pn${state === "asleep" ? " dim" : ""}">${esc(pal.name)}</div>`
    + `<div class="ps"><b style="color:${color}">${esc(state === "work" ? pal.word ?? word : word)}</b>${tail}</div></div></div>`;
}
// The sidebar's pal list for the first n of the crew under a saved look.
function sidebar(saved, n = 8, { theme = THEME, hero = false, h = null } = {}) {
  const pals = CREW.slice(0, n), looks = crewLook(saved, pals, { theme });
  let out = `<div class="side"${h ? ` style="height:${h}px"` : ""}>`;
  if (hero) out += `<div class="hero">${petHtml(pals[0], looks[0], pals[0].state, 150)}<b>${esc(pals[0].name)}</b></div>`;
  out += `<div class="hd"><span>Pals</span><span>${n}</span></div>`;
  out += pals.map((p, i) => rowHtml(p, looks[i], p.state, i === 0 && hero)).join("");
  return out + "</div>";
}
// A strip of bare pets (no rows): pals[i] in states[i].
function strip(saved, idx, states, w = 62, theme = THEME, n = 8) {
  const pals = CREW.slice(0, n), looks = crewLook(saved, pals, { theme });
  return `<div class="strip">${idx.map((i, j) => petHtml(pals[i], looks[i], states[j] ?? pals[i].state, w)).join("")}</div>`;
}
const dots = (colors) => `<span class="dots">${colors.map((c) => `<i style="background:${c}"></i>`).join("")}</span>`;
const card = (tag, name, about, body, pick = "") => `<div class="v"><h2><b>${tag}</b>${esc(name)}${pick ? `<i>${esc(pick)}</i>` : ""}</h2><p>${about}</p>${body}</div>`;

// ---------- 1 · pet colours (screens: by state, as today) ----------
const L = (o) => ({ ...DEFAULT_PAL_LOOK, ...o });
const about = (id) => PET_LOOKS.find((x) => x.id === id).about;
const pal = SPLIT_PALETTES[0].colors;
const sizes = (k) => splitSizes(8, k).join(" + ");
const pets = [
  card("P1", "Each its own", `${about("own")} <em>This is today.</em>`, sidebar(L({ pets: "own" })), "the default I'd keep"),
  card("P2", "All one colour", `${about("one")} Shown in Pearl; you pick any colour.`, sidebar(L({ pets: "one" }))),
  card("P3", "Split by count · 2", `Two colours down the list: 8 pals are ${sizes(2)}. ${dots(pal.slice(0, 2))} Signal`, sidebar(L({ pets: "split", count: 2 }))),
  card("P3", "Split by count · 3", `Three colours: 8 pals are ${sizes(3)}. ${dots(pal.slice(0, 3))}`, sidebar(L({ pets: "split", count: 3 }))),
  card("P3", "Split by count · 4", `Four colours: 8 pals are ${sizes(4)}. ${dots(pal)}`, sidebar(L({ pets: "split", count: 4 }))),
  card("P4", "By brain", `${about("brain")} ${Object.entries(BRAIN_COLORS).filter(([k]) => !["other", "none"].includes(k)).map(([k, c]) => `${dots([c])} ${BRAIN_NAMES[k]}`).join(" &nbsp;")}`, sidebar(L({ pets: "brain" }))),
  card("P5", "By state", `${about("state")} ${dots([STATE_COLORS.work])} working &nbsp;${dots([STATE_COLORS.ask])} needs you, done &nbsp;${dots([STATE_COLORS.stuck])} stuck &nbsp;${dots([STATE_COLORS.rest])} resting, asleep. Shown with one screen colour, its best pair.`, sidebar(L({ pets: "state", screen: "one" }))),
  card("P6", "By project", `${about("group")} A pal's project is the part of its name before " - ". Here: Lumen, Harbor, Kite.`, sidebar(L({ pets: "group", group: "project" }))),
  card("P6", "By factory", `The same preset, grouped by factory instead. Here: Studio (the first seven) and Platform.`, sidebar(L({ pets: "group", group: "factory" }))),
  card("P7", "Match the theme", `${about("theme")} Shown with ${HERE ? "the theme this Herdr uses now" : "Tokyo Night"} and every screen in its accent.`, sidebar(L({ pets: "theme", screen: "one", screenColor: undefined }))),
];

// Variations inside a preset.
const four = [1, 2, 4, 6], fourS = ["ask", "work", "done", "stuck"];
const variations = `<div class="vars">
  <div><h4>All one colour: any colour works, Pearl reads best</h4><div class="vrow">${[["Pearl", "#e8e6f0"], ["Sky", "#4fa8ff"], ["Mint", "#4fd6a0"], ["Amber", "#ffb238"], ["Lilac", "#a77bff"], ["Rose", "#ff6fb5"]].map(([n, c]) => `<div class="vc"><span class="cap">${dots([c])} ${n}</span>${strip(L({ pets: "one", color: c }), four, fourS)}</div>`).join("")}</div>
  <p class="note">Blue pals hide the working screen and green pals hide "needs you": the screen is the same hue as the pal. Pearl, Lilac and Rose keep every state readable.</p></div>
  <div><h4>Split by count: three palettes, each for 2, 3 or 4</h4><div class="vrow">${SPLIT_PALETTES.map((sp) => `<div class="vc"><span class="cap">${dots(sp.colors)} ${sp.name}</span>${strip(L({ pets: "split", count: 4, palette: sp.id }), [0, 2, 4, 6], ["work", "work", "done", "stuck"])}</div>`).join("")}</div></div>
  <div><h4>Match the theme: four more themes</h4><div class="vrow">${Object.entries(THEMES).map(([n, t]) => `<div class="vc"><span class="cap">${dots(themeColors(t).slice(0, 6))} ${n}</span>${strip(L({ pets: "theme", screen: "one", screenColor: undefined }), [0, 1, 2, 4, 5, 6], ["work", "ask", "work", "done", "work", "stuck"], 62, t)}</div>`).join("")}</div></div>
</div>`;

// ---------- 2 · laptop screens ----------
const big = (saved, i, state) => { const pals = CREW.slice(0, 8), looks = crewLook(saved, pals, { theme: THEME }); return `<div class="bigp">${petHtml(pals[i], looks[i], state, 132)}<span>${WORDS[state][0]}</span></div>`; };
const sAbout = (id) => SCREEN_LOOKS.find((x) => x.id === id).about;
const screens = [
  ["S1", "By state", "state", `${sAbout("state")} <em>This is today.</em>`, "the default I'd keep"],
  ["S2", "Match the pal", "match", sAbout("match"), ""],
  ["S3", "Contrast pair", "contrast", `${sAbout("contrast")} Clay gets teal, blue gets orange; a grey pal gets a cool white.`, ""],
  ["S4", "Same for all", "one", `${sAbout("one")} Shown in the cool white of a real screen.`, ""],
].map(([tag, name, id, text, pick]) => card(tag, name, text,
  `<div class="bigs">${big(L({ screen: id }), 1, "ask")}${big(L({ screen: id }), 5, "work")}</div>` + sidebar(L({ screen: id }), 8), pick));

// ---------- 3 · which pairs read best ----------
const FITS = { best: "Best", good: "Good", weak: "Weak" };
const matrix = `<table class="mx"><tr><th></th>${SCREEN_LOOKS.map((s) => `<th>Screens: ${s.name}</th>`).join("")}</tr>`
  + PET_LOOKS.map((p) => `<tr><td class="rl"><b>${p.name}</b></td>` + SCREEN_LOOKS.map((s) => {
    const { fit, why } = pairFit(p.id, s.id);
    return `<td class="${fit}"><span class="fit">${FITS[fit]}</span>${strip(L({ pets: p.id, screen: s.id, count: 2, screenColor: p.id === "theme" ? undefined : DEFAULT_PAL_LOOK.screenColor }), [1, 2, 4, 5, 6], ["ask", "work", "done", "work", "stuck"], 52)}<p>${esc(why)}</p></td>`;
  }).join("") + "</tr>").join("") + "</table>";

// ---------- 4 · the Settings dialog ----------
// The dialog's preview: the first n made-up pals, all in view at once, as big as they fit.
function crewGrid(saved, n) {
  const pals = CREW.slice(0, n), looks = crewLook(saved, pals, { theme: THEME });
  const [cols, w] = n === 1 ? [1, 208] : n === 4 ? [2, 132] : [3, 88];
  return `<div class="pv c${cols}">${pals.map((p, i) => { const [word, color] = WORDS[p.state]; return `<div class="pc">${petHtml(p, looks[i], p.state, w)}<b${p.state === "asleep" ? ' class="dim"' : ""}>${esc(p.name)}</b><span style="color:${color}">${word}</span></div>`; }).join("")}</div>`;
}
const check = `<svg class="ck" viewBox="0 0 12 12"><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>`;
function dialog(saved, n) {
  const look = palLookOf(saved);
  const opt = (list, on, key) => list.map((x, i) => `<div class="opt${x.id === on ? " on" : ""}"><span class="n">${i + 1}</span><span class="l">${x.name}</span>${key === "screen" ? `<span class="f ${pairFit(look.pets, x.id).fit}">${FITS[pairFit(look.pets, x.id).fit]}</span>` : ""}${x.id === on ? check : ""}</div>`).join("");
  const SW = ["#e8e6f0", "#e0866a", "#ff7a6b", "#f0b245", "#f7d64a", "#6fd6a8", "#7cc8f2", "#6f9cf0", "#a28cf0", "#f08cc0", "#8f96b3"];
  const sw = (cur) => `<div class="sws">${SW.map((c) => `<i style="background:${c}"${c === cur ? ' class="on"' : ""}></i>`).join("")}<span class="hex">${cur}</span></div>`;
  let sub = "";
  if (look.pets === "one") sub = sw(look.color);
  if (look.pets === "split") sub = `<div class="chips"><span class="lbl">Colours</span>${[2, 3, 4].map((k) => `<span class="chip${k === look.count ? " on" : ""}">${k}</span>`).join("")}<span class="gap"></span>${SPLIT_PALETTES.map((sp) => `<span class="chip${sp.id === look.palette ? " on" : ""}">${dots(sp.colors.slice(0, look.count))}${sp.name}</span>`).join("")}</div><div class="hint">${n} pals: ${splitSizes(n, look.count).join(" + ")}</div>`;
  if (look.pets === "group") sub = `<div class="chips"><span class="lbl">Group by</span><span class="chip${look.group === "project" ? " on" : ""}">Project</span><span class="chip${look.group === "factory" ? " on" : ""}">Factory</span></div>`;
  if (look.pets === "own") sub = `<div class="hint">Change one pal's colour in its own Look (right-click the pal).</div>`;
  const ssub = look.screen === "one" ? sw(look.screenColor) : "";
  const fit = pairFit(look.pets, look.screen);
  return `<div class="dlg"><div class="dh"><span class="face">${petHtml(CREW[1], crewLook(saved, CREW.slice(0, 8), { theme: THEME })[1], "work", 46)}</span><div><b>Pal look</b><span>Colours for your pals and their laptop screens</span></div><span class="x">✕</span></div>
  <div class="db"><div class="dl">
    <div class="sec">Pals</div>${opt(PET_LOOKS, look.pets, "pets")}${sub}
    <div class="rule"></div>
    <div class="sec">Laptop screens</div>${opt(SCREEN_LOOKS, look.screen, "screen")}${ssub}
    <div class="rule"></div>
    <div class="fitline"><span class="f ${fit.fit}">${FITS[fit.fit]} together</span> ${esc(fit.why)}</div>
  </div><div class="dr"><div class="seg"><span class="lbl">Preview with</span>${[1, 4, 8, 12].map((k) => `<span class="chip${k === n ? " on" : ""}">${k}</span>`).join("")}<span class="lbl">made-up pals</span></div>${crewGrid(saved, n)}</div></div>
  <div class="df"><span>Applies as you click · Esc puts back what you had</span><span class="btn">Cancel</span><span class="btn pri">Done</span></div></div>`;
}
const dialogs = `<div class="dlgs">
  <div><span class="cap">Opens on today's look · 8 pals</span>${dialog(L({}), 8)}</div>
  <div><span class="cap">Split by count, three colours, contrast screens · 12 pals</span>${dialog(L({ pets: "split", count: 3, screen: "contrast" }), 12)}</div>
  <div><span class="cap">All one colour, state screens · 4 pals</span>${dialog(L({ pets: "one" }), 4)}</div>
  <div><span class="cap">By state, one screen colour · 1 pal</span>${dialog(L({ pets: "state", screen: "one" }), 1)}</div>
</div>`;

// ---------- the page ----------
const CSS = `
:root{--bg:#0B0B0C;--side:#0E0E0F;--inset:#0A0A0B;--pop:#121213;--raised:#161617;--sel:#232324;--hover:#18181A;--line:#1E1E20;--mid:#2C2C2F;--strong:#3C3C3F;
--fg1:#EDEDED;--body:#C8C8C8;--fg2:#808082;--fg3:#6A6A6C;--fg4:#56565A;--info:#4CA1F2;--infoT:#8EC3F6;--ok:#34D098;--warn:#E8AA0A;
--sans:Inter,system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg1);font:13px/1.45 var(--sans);padding:40px 32px 96px;-webkit-font-smoothing:antialiased}
h1{font-size:26px;font-weight:600;letter-spacing:-.015em}
h3{font-size:18px;font-weight:600;margin:72px 0 4px;letter-spacing:-.01em}
h4{font-size:13px;font-weight:600;color:var(--body);margin:0 0 10px}
.lede{color:var(--fg2);max-width:900px;margin-top:8px;font-size:14px}
.lede b,.note b{color:var(--body);font-weight:500}
.sub{color:var(--fg2);margin:4px 0 24px;max-width:900px}
.note{color:var(--fg2);font-size:12.5px;max-width:900px;margin-top:10px}
em{font-style:normal;color:var(--body)}
.pickbox{margin-top:24px;max-width:900px;border:1px solid #4CA1F247;background:#4CA1F20F;border-radius:6px;padding:14px 16px}
.pickbox h4{color:var(--infoT);margin-bottom:6px}
.pickbox p{color:var(--body);font-size:13px}
.pickbox ul{margin:8px 0 0 18px;color:var(--fg2);font-size:12.5px}
.pickbox li{margin-top:3px}.pickbox li b{color:var(--body);font-weight:500}
.grid{display:grid;grid-template-columns:repeat(auto-fill,304px);gap:40px 28px;align-items:start}
.v h2{font-size:13px;font-weight:600;margin-bottom:4px;display:flex;gap:8px;align-items:center;white-space:nowrap}
.v h2 b{font:500 11px var(--mono);color:var(--fg2);border:1px solid var(--mid);border-radius:4px;padding:0 5px}
.v h2 i{font:500 11px var(--sans);font-style:normal;color:var(--infoT);background:#4CA1F21F;border:1px solid #4CA1F247;border-radius:4px;padding:0 6px}
.v p{color:var(--fg2);font-size:12px;margin-bottom:12px;min-height:72px;max-width:304px}
.dots{display:inline-flex;gap:3px;vertical-align:-1px;margin-right:2px}
.dots i{width:9px;height:9px;border-radius:2px;display:inline-block}
/* the sidebar, Large pets rows (crew.js palLookRow / palPet) */
.side{width:304px;background:var(--side);border:1px solid var(--line);border-radius:8px;padding:4px 8px 8px;overflow:hidden}
.hd{display:flex;justify-content:space-between;height:28px;align-items:center;padding:0 8px 0 8px;color:var(--fg3);font-size:12px;font-weight:500}
.prow{height:64px;display:flex;gap:12px;align-items:center;padding:0 8px;border-radius:6px;margin-top:2px}
.prow.sel{background:var(--sel)}
.pt{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.pn{font-size:14px;line-height:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pn.dim{color:var(--fg2)}
.ps{font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ps b{font-weight:500}
.ps u{text-decoration:none;font:11px var(--mono);color:var(--fg2)}
.pet{position:relative;display:block;flex:none}
.pet.zz{opacity:.5}
.pet img{position:absolute;display:block}
.pet .art{left:0;top:0}
.hero{height:150px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:8px;border-bottom:1px solid var(--line);margin:0 -8px 4px}
.hero b{font-size:13.5px;margin-top:4px;font-weight:600}
.strip{display:flex;gap:14px;padding:12px 14px 14px;background:var(--side);border:1px solid var(--line);border-radius:8px;width:max-content}
.cap{display:block;color:var(--fg2);font-size:12px;margin-bottom:6px}
.vars{display:flex;flex-direction:column;gap:36px;margin-top:48px}
.vrow{display:flex;gap:20px;flex-wrap:wrap}
.bigs{display:flex;justify-content:space-around;background:var(--side);border:1px solid var(--line);border-radius:8px;padding:18px 8px 10px;margin-bottom:8px;width:304px}
.bigp{display:flex;flex-direction:column;align-items:center;gap:12px}
.bigp span{font-size:11px;color:var(--fg2)}
/* the pairs */
.mx{border-collapse:separate;border-spacing:0;margin-top:8px}
.mx th{font-size:12px;font-weight:500;color:var(--fg2);text-align:left;padding:0 12px 8px}
.mx td{border-top:1px solid var(--line);padding:12px;vertical-align:top;width:330px;position:relative}
.mx td.rl{width:150px;font-size:13px;padding-left:0}
.mx td.rl b{font-weight:600}
.mx td p{font-size:11.5px;color:var(--fg2);margin-top:8px;max-width:300px}
.mx .strip{gap:8px;padding:10px 10px 12px}
.fit,.f{font:500 10.5px var(--mono);border-radius:3px;padding:1px 5px;border:1px solid var(--mid);color:var(--fg2);display:inline-block}
.mx .fit{margin-bottom:8px}
.best .fit,.f.best{color:#6EE3B4;border-color:#1D5A44;background:#34D0981A}
.weak .fit,.f.weak{color:var(--fg3);border-color:var(--line)}
/* the dialog (the kit's "A · Compact sheet") */
.dlgs{display:grid;grid-template-columns:repeat(2,max-content);gap:40px 36px;margin-top:8px}
.dlg{width:714px;background:var(--pop);border:1px solid var(--mid);border-radius:8px;overflow:hidden}
.dh{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
.dh .face{width:46px;height:36px;display:block}
.dh b{display:block;font-size:14px;font-weight:600}.dh span{color:var(--fg2);font-size:12px}
.dh .x{margin-left:auto;color:var(--fg3);font-size:12px}
.db{display:flex;gap:14px;padding:12px 16px 14px;align-items:flex-start}
.dl{width:330px;flex:none;display:flex;flex-direction:column;gap:1px}
.dr{flex:none}
.sec{font-size:11px;font-weight:500;color:var(--fg3);padding:2px 8px 4px}
.opt{height:30px;display:flex;align-items:center;gap:8px;padding:0 8px;border-radius:4px;font-size:13px;color:var(--body)}
.opt.on{background:var(--sel);color:var(--fg1);font-weight:500}
.opt .n{width:16px;font:11px var(--mono);color:var(--fg3)}
.opt .l{flex:1}
.ck{width:12px;height:12px;stroke:var(--info);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.rule{height:1px;background:var(--line);margin:8px 0}
.sws{display:flex;gap:6px;align-items:center;padding:8px 8px 2px;flex-wrap:wrap}
.sws i{width:18px;height:18px;border-radius:4px;border:2px solid var(--pop)}
.sws i.on{border-color:var(--fg1)}
.hex{font:11px var(--mono);color:var(--fg2);border:1px solid var(--mid);border-radius:4px;padding:1px 6px;margin-left:4px;background:var(--inset)}
.chips,.seg{display:flex;gap:4px;align-items:center;padding:8px 8px 2px;flex-wrap:wrap}
.seg{padding:0 0 8px}
.lbl{font-size:11.5px;color:var(--fg2);margin-right:4px}.seg .lbl:last-child{margin-left:4px}
.gap{width:8px}
.chip{height:22px;min-width:24px;padding:0 7px;display:inline-flex;gap:4px;align-items:center;justify-content:center;border:1px solid var(--mid);border-radius:4px;font-size:11.5px;color:var(--body);background:var(--raised)}
.chip.on{border-color:#4CA1F27A;background:#4CA1F21F;color:var(--infoT)}
.hint{font-size:11.5px;color:var(--fg2);padding:6px 8px 0}
.fitline{font-size:11.5px;color:var(--fg2);padding:0 8px;line-height:17px}
.df{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--line);color:var(--fg3);font-size:11.5px}
.df span:first-child{flex:1}
.btn{height:26px;padding:0 12px;display:inline-flex;align-items:center;border:1px solid var(--mid);border-radius:5px;color:var(--body);font-size:12px;background:var(--raised)}
.btn.pri{background:#EDEDED;color:#0B0B0C;border-color:#EDEDED;font-weight:500}
.pv{width:320px;height:468px;background:var(--side);border:1px solid var(--line);border-radius:6px;display:grid;align-content:center;justify-items:center;gap:14px 0;padding:12px 6px}
.pv.c1{grid-template-columns:1fr}.pv.c2{grid-template-columns:1fr 1fr;gap:28px 0}.pv.c3{grid-template-columns:1fr 1fr 1fr}
.pc{display:flex;flex-direction:column;align-items:center;min-width:0;max-width:100%}
.pc b{font-size:11.5px;line-height:15px;font-weight:600;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:98px}
.pv.c1 .pc b,.pv.c2 .pc b{font-size:13px;line-height:17px;max-width:150px;margin-top:10px}
.pc b.dim{color:var(--fg2)}
.pc span{font-size:10.5px;line-height:14px;font-weight:500}
.pv.c1 .pc span,.pv.c2 .pc span{font-size:12px;line-height:16px}
ul.how{margin:10px 0 0 18px;color:var(--fg2);font-size:12.5px;max-width:900px}
ul.how li{margin-top:4px}ul.how b{color:var(--body);font-weight:500}
`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pal look</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<h1>Pal look</h1>
<p class="lede">A new section in Settings: colour presets for the pets and, separately, for their laptop screens, with a live preview. Every picture below is drawn by the app's own pet renderer, on a made-up crew (Lumen, Harbor, Kite, Orbit), in the sidebar's Large pets rows. <b>One thing to decide: which pair is the default.</b> All the presets ship as options either way.</p>
<div class="pickbox"><h4>My pick for the default: P1 Each its own + S1 screens by state</h4>
<p>It is what the app does today, so nobody's crew changes colour on update, and it is the pair where both halves say something: the pal's colour is who it is, its screen is how it's doing.</p>
<ul><li><b>Runner-up: P2 All one colour (Pearl) + S1.</b> The quickest to scan for "who needs me", because the screens are the only colour on the list. It gives up telling pals apart by colour.</li>
<li><b>P4 By brain + S1</b> is close to today for hired pals (they already start in their brain's colour) but overrides colours you picked by hand.</li>
<li><b>P5 By state + S4</b> is the loudest status board. The pal no longer has a colour of its own.</li></ul></div>

<h3>1 · Pet colours</h3>
<p class="sub">Seven presets. The same eight pals in the same states in every column: working, needs you, working, resting, done, working, stuck, asleep. Screens are by state (today's) unless a card says otherwise.</p>
<div class="grid">${pets.join("")}</div>
${variations}

<h3>2 · Laptop screens</h3>
<p class="sub">Four presets, chosen separately from the pets. Shown on "Each its own" pals. Two pals up close (needs you, working), then the list. Whatever the screen does, the state also stays on the pool of light under the pet and in the words beside it.</p>
<div class="grid">${screens.join("")}</div>

<h3>3 · Which pairs read best</h3>
<p class="sub">Every pet preset with every screen preset, on five pals: needs you, working, done, working, stuck. The dialog shows the same verdict next to your choice.</p>
${matrix}
<ul class="how"><li><b>Screens by state</b> pair best with any preset where the pal's colour means something else (itself, its team, its brain, its project).</li>
<li><b>Pets by state</b> want a quiet screen: one colour for all, or matching. State on both is the same message twice.</li>
<li><b>Contrast pair</b> reads well with one or two pal colours and gets loud past three.</li>
<li><b>Match the theme</b> looks most at home with the theme's accent on every screen.</li></ul>

<h3>4 · The Settings dialog</h3>
<p class="sub">Settings → Pal look opens it, in the same sheet as Pal list style. Two short lists on the left, the preview on the right: a made-up crew of 1, 4, 8 or 12, all in view at once and as big as they fit, in the states a real crew is in. A click applies at once, so your own sidebar behind the dialog follows too; Esc puts back what you had.</p>
${dialogs}
<ul class="how"><li><b>Where it shows:</b> everywhere a pet is drawn. The compact list styles draw heads without a laptop, so the screen presets show in Large pets rows, the hero and the profile.</li>
<li><b>Saved</b> as one entry in your settings file, which updates and reinstalls never touch.</li>
<li><b>Nothing is lost:</b> a colour you picked for one pal stays on its record. It shows under Each its own and comes back when you return to it.</li>
<li><b>The head pal</b> follows the preset like everyone else; its crown marks it.</li>
<li><b>State colours</b> are the app's own (needs you and done are both green today; the pose and the breathing light tell them apart). This board doesn't change them.</li></ul>
</body></html>`;
writeFileSync(join(OUT, "index.html"), html);
console.log(`board: ${join(OUT, "index.html")} · ${written.size} pet tiles`);
