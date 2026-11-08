// Project Pals: shared model for the crew-* mods. install.sh copies this file into each mod as ./crew.js.
//
// Every Herdr space is a pal: a project with a brain. Its tabs are its channels, each a clone
// with its own terminal on the space's machine. The brain is whatever agent harness runs in the
// space (Claude Code, Codex, Grok, ...), read live from Herdr; a space with no agent is asleep.
// Project Pals keeps only what Herdr doesn't, keyed by space id: role, categories, briefs, memory, color.
// Status (and so the mascot's face) is Herdr's own agent status.

import { div, image, svg } from "gpui-kit";
import { spaces, shared, setShared, panes, theme, run, layout, exec, hc, appHome, home, readTextFile, writeTextFile, knownAgents, notify, openOverlay, keys } from "herdr";

// Named colours (the stock pal colours) and the Look dialog's swatches. These lived in mascot-art.js
// with the folder mascots, which are retired (2026-11-08).
export const NAMED = {
  clay: "#e0866a", cream: "#e6e8ef", ink: "#1b1e2b", blue: "#6f9cf0", violet: "#a28cf0",
  amber: "#f0b245", mint: "#6fd6a8", pink: "#f08cc0", slate: "#8f96b3", pearl: "#f7f2e6",
};
export const SWATCHES = ["#e0866a", "#ff7a6b", "#f0b245", "#f7d64a", "#6fd6a8", "#9ccb9a", "#7cc8f2", "#6f9cf0",
  "#a28cf0", "#c4a7f5", "#f08cc0", "#f6b38e", "#8f96b3", "#e6e8ef", "#f7f2e6", "#1b1e2b"];
export const validHex = (s) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test((s ?? "").trim());
export const normHex = (s) => { let h = s.trim().replace("#", "").toLowerCase(); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return "#" + h; };
import { petSpec, petKey, petPath, petFiles, bitsSvg, BITS, PET_DIR, PET_STATES, petScreen, BARE_VIEW, TW as PET_W, TH as PET_H } from "./pets.js";


// Settings (data/crew-settings.json, mirrored into shared "crew.settings" by the roster): who the
// pals work for, and whether new pals start with permissions bypassed.
export const owner = () => shared("crew.settings")?.owner || "you";
export const bypassOn = () => Boolean(shared("crew.settings")?.bypass);
// The head pal's name (About → Settings, or `pal settings head`).
export const headName = () => shared("crew.settings")?.head || "Orchestrator";
export async function syncSettings() {
  let s = {};
  const started = Date.now();
  try { s = JSON.parse((await readTextFile(`${appHome()}/data/crew-settings.json`)) ?? "{}"); } catch { s = {}; }
  // A change made here (saveUiSettings) is shared at once and written a moment later: don't let a
  // read from before that write put the old value back.
  // (Every mod has its own copy of this file, so the marker lives in shared state.)
  const mark = shared("crew.uiwrite") ?? { busy: false, at: 0 };
  const busy = mark.busy && started - (mark.at ?? 0) < 5000;
  const fresh = !busy && started > (mark.at ?? 0) + 300;
  if (fresh && JSON.stringify(s) !== JSON.stringify(shared("crew.settings") ?? {})) setShared("crew.settings", s);
  // Demo filter, for screenshots: data/crew-demo.json {"only": ["Website", ...]} makes this window's
  // sidebar show just those pals, and {"states": {"Website": "pr", ...}} shows those pals' pets in
  // that tile state (any of PET_STATES). No file (the normal case): everyone, live states.
  let d = null;
  try { d = JSON.parse((await readTextFile(`${appHome()}/data/crew-demo.json`)) ?? "null"); } catch { d = null; }
  const only = Array.isArray(d?.only) ? d.only : null;
  if (JSON.stringify(only) !== JSON.stringify(shared("crew.demo") ?? null)) setShared("crew.demo", only);
  const states = d?.states && typeof d.states === "object" && !Array.isArray(d.states) ? d.states : null;
  if (JSON.stringify(states) !== JSON.stringify(shared("crew.demo.states") ?? null)) setShared("crew.demo.states", states);
}

// Harness (program key) → accessory: bandage, monocle, antenna, ears, halo, sprout.
const ACCESSORY = {
  claude: "claude", "claude-code": "claude",
  codex: "codex",
  grok: "grok",
  gemini: "gemini", "antigravity-cli": "gemini", antigravity: "gemini",
  hermes: "hermes",
  opencode: "opencode", kilo: "opencode", crush: "opencode",
};
export const accessory = (harness) => (harness ? ACCESSORY[harness] ?? "other" : "none");
// The head pal wears a crown whatever its brain.

// A pal's body color: its own pick, else its harness's signature color for hired pals, else one
// chosen by its name so each project keeps the same face.
const HARNESS_COLOR = { claude: "clay", codex: "cream", grok: "ink", gemini: "blue", hermes: "violet", opencode: "amber" };
const PALETTE = ["clay", "violet", "blue", "amber", "mint", "pink", "slate", "cream", "ink"];
function hash(s) { let h = 2166136261; for (const ch of s ?? "") h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
export function colorOf(bot) {
  return bot.color ?? (bot.god ? "pearl" : null) ?? (bot.hired ? HARNESS_COLOR[bot.harness] : null) ?? PALETTE[hash(bot.name) % PALETTE.length];
}

// Herdr status → face. No agent running in the space: asleep.
export function mood(status, awake = true) {
  if (!awake) return "asleep";
  return { blocked: "blocked", working: "working", done: "done" }[status] ?? "calm";
}
// A pal's own colour, from its record's `look` (the Look dialog sets it; it tints its pet). null:
// its stock colour.
export function resolveLook(bot) {
  const l = bot?.look;
  if (!l?.color) return null;
  return { color: l.color };
}

// Write generated SVGs ([[path, svg]], relative to the app home): the pets' tiles.
export async function writeArt(files) {
  if (!files.length) return;
  const r = await exec("sh", ["-c", 'cd "$1" && shift && while [ $# -gt 1 ]; do mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1" || exit 1; shift 2; done',
    "sh", appHome(), ...files.flat()]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "couldn't draw the pet");
}
// Draw what's missing: every pal's pet tiles (live and asleep). Cheap when nothing is.
export const ensureLooks = (c = crew()) => ensurePets(c);

// A pal's face: its pocket pet (the folder mascots are retired, DeNon 2026-11-08). Until its tiles
// are on disk (the roster draws them within seconds) an empty box of the same size holds its place.
// size is the width; a pet draws size x 0.78*size in its faint box (petEl).
export function mascotEl(bot, m, size, t = tone(theme())) {
  const p = petOf(bot);
  if (p && petReady(p)) return petEl(p, petState(bot, m), size);
  return div().w(size).h(Math.round(size * 108 / 138)).flex_none().rounded(Math.max(4, Math.round(size / 35))).bg("#131316");
}

// A brain's (harness's) logo, from Herdr's own program table: knownAgents() entries carry `icon`
// (icons/<key>.svg, shipped with Herdr) and `tint` (a one-colour glyph, drawn in #C8C8C8; else a
// picture, drawn as is). Without an entry, Herdr's icon for that key when it has one, else its
// neutral agent glyph. `list`: the dialog's knownAgents().
const HERDR_AGENT_ICONS = new Set(["claude", "codex", "cursor", "copilot", "opencode", "grok", "hermes", "gemini", "kimi", "ollama", "pi", "amp", "crush", "antigravity"]);
export function brainLogo(key, size, d, list = []) {
  const p = list.find((x) => x.key === key);
  const icon = p?.icon ?? (HERDR_AGENT_ICONS.has(key) ? `icons/${key}.svg` : "icons/agent.svg");
  if (p && p.tint === false) return image(icon).size(size).flex_none();
  return svg(icon).size(size).flex_none().text_color(d.body);
}

// The head pal's pet (the About screen): its pal when it's open, else one made from its name.
export function headPet() {
  return spaces().map((s) => botOf(s)).find((b) => b.god) ?? { name: headName(), god: true, awake: false };
}

export const STATUS_RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
export const ROLES = ["Bug fixer", "Researcher", "Inbox", "Chief of staff", "Release manager", "Writer"];

export function crew() {
  const c = shared("crew");
  return c && Array.isArray(c.bots) ? c : { bots: [] };
}
export function saveCrew(c) { setShared("crew", { ...c, bots: c.bots }); }
export const newId = () => Math.random().toString(36).slice(2, 10);

const sameMachine = (x, y) => (x ?? null) === (y ?? null);

// Project Pals's record for a space: by its id, else (a pal hired before its space existed) by name.
export function recordOf(space, c = crew()) {
  if (!space) return null;
  return c.bots.find((b) => b.space === space.id)
    ?? c.bots.find((b) => !b.space && b.name === space.name && sameMachine(b.machine, space.machine))
    ?? null;
}

// The harness running in a space: its agents' program, most common first.
export function brainOf(space, all = panes()) {
  const tabs = new Set((space?.tabs ?? []).map((t) => t.id));
  const keys = all.filter((p) => tabs.has(p.tab) && p.program?.agent).map((p) => p.program.key);
  if (!keys.length) return null;
  const count = new Map();
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count.entries()].sort((x, y) => y[1] - x[1])[0][0];
}
export function brainName(space, all = panes()) {
  const tabs = new Set((space?.tabs ?? []).map((t) => t.id));
  return all.find((p) => tabs.has(p.tab) && p.program?.agent)?.program?.name ?? null;
}

// A pal: a space seen through Project Pals. Every space is one; Project Pals's record adds what it knows.
export function botOf(space, c = crew(), all = panes()) {
  if (!space) return null;
  const rec = recordOf(space, c);
  const live = brainOf(space, all);
  return {
    ...(rec ?? {}),
    id: rec?.id ?? space.id,
    space: space.id,
    name: space.name,
    machine: space.machine ?? null,
    folder: rec?.folder ?? space.folder ?? null,
    harness: live ?? rec?.harness ?? null,
    harnessName: brainName(space, all) ?? rec?.harnessName ?? null,
    awake: Boolean(live),
    // Hired in the last 10 minutes and no brain seen yet: starting up (Claude Code asks whether
    // to trust a new folder first), not asleep.
    starting: !live && Boolean(rec?.hired) && Date.now() - rec.hired < 10 * 60 * 1000,
    record: rec,
  };
}
// Back-compat name used by the mods.
export const botOfSpace = (space, c, all) => botOf(space, c, all);

// Records whose space is gone (closed): pals you hired that are asleep.
export function sleepers(all = spaces(), c = crew()) {
  return c.bots.filter((b) => !all.some((s) => s.id === b.space || (!b.space && s.name === b.name && sameMachine(b.machine, s.machine))));
}

// Records made before their space existed (a hire from a terminal) get its id once it shows up,
// so a later rename keeps the pal's memory.
export function linkRecords(all = spaces(), c = crew()) {
  let changed = false;
  const bots = c.bots.map((b) => {
    // Linked to a space that's still there: nothing to do. Linked to one that's gone (it slept and
    // was opened again): link it to the new space with its name, like a record that never had one.
    if (b.space && all.some((x) => x.id === b.space)) return b;
    const s = all.find((x) => x.name === b.name && sameMachine(b.machine, x.machine) && !c.bots.some((o) => o.space === x.id));
    if (!s) return b;
    changed = true;
    return { ...namedNotes(b), space: s.id };
  });
  if (changed) saveCrew({ ...c, bots });
}

// A record's per-channel notes keyed by channel name again (from tab ids, through its names map),
// for a pal whose old tabs are gone; migrateChannelKeys then moves them to the new tab ids.
function namedNotes(b) {
  const nameOf = (k) => (b.names?.[k] ?? k);
  const byName = (m) => Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [nameOf(k), v]));
  return { ...b, categories: byName(b.categories), briefs: byName(b.briefs), brains: byName(b.brains), names: {} };
}

// Wake a pal that's asleep (its space was closed): open its space again with every channel it had,
// by name, running its own brain, and link the record to it. No first task: it's resuming, not
// starting over.
export function wakePal(rec) {
  const named = namedNotes(rec);
  const chans = Object.keys(named.categories ?? {}).filter((k) => k.startsWith("#") || !/^tb[0-9a-f]{16,}$/.test(k));
  if (!chans.length) chans.push("#general");
  updateBot(rec, () => ({ ...named, space: null }));
  run("space.new", { name: rec.name, tab: chans[0], folder: rec.folder || undefined, argv: rec.argv, machine: rec.machine ?? "" });
  const made = spaces().find((s) => s.name === rec.name && sameMachine(rec.machine, s.machine) && !crew().bots.some((o) => o.space === s.id));
  if (!made) return;
  updateBot(rec, (b) => ({ ...b, space: made.id }));
  const first = made.tabs[0];
  for (const ch of chans.slice(1)) run("tab.new", { space: made.id, name: ch, argv: rec.argv, folder: rec.folder || undefined });
  if (first) run("tab.select", { id: first.id });
}

// Update (or create) Project Pals's record for a pal.
export function updateBot(bot, fn) {
  const c = crew();
  const has = c.bots.some((b) => b.id === bot.id);
  const base = has ? c.bots.find((b) => b.id === bot.id) : { id: bot.id ?? newId(), space: bot.space, name: bot.name, machine: bot.machine ?? null };
  const next = fn({ ...base });
  saveCrew({ ...c, bots: has ? c.bots.map((b) => (b.id === bot.id ? next : b)) : [...c.bots, next] });
  return next;
}

// A tab is a channel; its name is the channel's name ("#pricing" shows as "pricing").
// Categories, briefs and brains are keyed by tab id, so they survive a rename; entries saved
// under a channel's name (before its tab existed) are moved to its id by migrateChannelKeys().
export const channelName = (tab) => (tab.name.startsWith("#") ? tab.name.slice(1) : tab.name);
const pick = (map, tab) => map?.[tab.id] ?? map?.[tab.name];
export const categoryOf = (bot, tab) => pick(bot.categories, tab) ?? "Channels";
export const briefOf = (bot, tab) => pick(bot.briefs, tab) ?? null;

// Rename a channel: Herdr asks for the new name in its own prompt.
export const renameChannel = (tab) => run("tab.rename", { id: tab.id });

// Move name-keyed channel data onto tab ids. Saves only when something moved.
export function migrateChannelKeys(all = spaces(), c = crew()) {
  let changed = false;
  const bots = c.bots.map((b) => {
    const space = all.find((s) => s.id === b.space);
    if (!space) return b;
    const next = { ...b };
    for (const field of ["categories", "briefs", "brains"]) {
      const map = { ...(b[field] ?? {}) };
      for (const key of Object.keys(map)) {
        if (space.tabs.some((t) => t.id === key)) continue;
        const tab = space.tabs.find((t) => t.name === key);
        if (tab) { map[tab.id] ??= map[key]; delete map[key]; changed = true; }
      }
      next[field] = map;
    }
    const names = {};
    for (const t of space.tabs) names[t.id] = t.name;
    if (JSON.stringify(names) !== JSON.stringify(b.names ?? {})) { next.names = names; changed = true; }
    return next;
  });
  if (changed) saveCrew({ ...c, bots });
  return changed;
}

// Channels grouped by category, in the order categories first appear.
export function channelsByCategory(bot, space) {
  const groups = new Map();
  for (const tab of space?.tabs ?? []) {
    const cat = categoryOf(bot, tab);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(tab);
  }
  return [...groups.entries()];
}

// The terminal a channel talks through: its agent pane, else its first terminal pane.
export function leadPane(tabId, all = panes()) {
  const mine = all.filter((p) => p.tab === tabId && p.terminal);
  return mine.find((p) => p.program?.agent) ?? mine.find((p) => p.focused) ?? mine[0] ?? null;
}

export const COMPANY = {
  claude: "Anthropic", codex: "OpenAI", grok: "xAI", gemini: "Google", hermes: "Nous Research",
  opencode: "any model", copilot: "GitHub", cursor: "Cursor", pi: "any model", crush: "Charm", amp: "Sourcegraph",
};
export const harnessName = (bot) => bot.harnessName ?? (bot.harness ? bot.harness : "no brain running");

export function ago(ms) {
  if (!ms) return "";
  const d = Math.max(0, (Date.now() - ms) / 1000);
  return d < 60 ? "now" : d < 3600 ? `${Math.round(d / 60)}m` : d < 86400 ? `${Math.round(d / 3600)}h` : `${Math.round(d / 86400)}d`;
}

// Glass: a theme color at an alpha, so every surface follows the active theme.
export const a = (color, alpha) => (color?.length === 7 ? color + alpha : color);

// An approval rule's reason ("makes a release", "pushes code to a remote") after "wants to":
// its first verb in the base form ("make a release", "push code to a remote").
export function wantsTo(why) {
  const [verb, ...rest] = String(why ?? "").trim().split(" ");
  const base = /(sh|ch|ss|x)es$/.test(verb) ? verb.slice(0, -2) : /[^s]s$/.test(verb) ? verb.slice(0, -1) : verb;
  return [base, ...rest].join(" ");
}

// ─── Models ──────────────────────────────────────────────────────────────────────────────────
// Claude Code can start on a chosen model. Only ever on the pal's (or channel's) own command line:
// `/model` inside Claude Code would also change the default for every session.
export const MODELS = [
  { key: null, name: "Your default", sub: "whatever Claude Code uses" },
  { key: "opus", name: "Opus", sub: "strongest" },
  { key: "sonnet", name: "Sonnet", sub: "balanced" },
  { key: "haiku", name: "Haiku", sub: "fast, cheapest" },
];
export const modelOf = (argv) => { const i = (argv ?? []).indexOf("--model"); return i >= 0 ? argv[i + 1] ?? null : null; };
// argv with its --model set to `model`, or dropped (so Claude Code uses your default) when null.
export function withModel(argv, key, model) {
  if (key !== "claude" || !argv) return argv;
  const i = argv.indexOf("--model");
  const bare = i >= 0 ? [...argv.slice(0, i), ...argv.slice(i + 2)] : argv;
  return model ? [...bare, "--model", model] : bare;
}

// Forget a pal that's asleep: drop its record and pin. Its memory folder stays on disk.
export function forgetPal(rec) {
  const c = crew();
  saveCrew({ ...c, bots: c.bots.filter((b) => b.id !== rec.id) });
  setMark("pals", rec.id, { pin: null });
}

export async function rememberModel(space) {
  const rec = recordOf(space);
  if (!rec || (rec.harness ?? "claude") !== "claude" || !rec.argv) return;
  const terms = panes().filter((p) => space.tabs.some((x) => x.id === p.tab)).map((p) => p.terminal).filter(Boolean);
  for (const term of terms) {
    let st = null;
    try { st = JSON.parse((await readTextFile(`${appHome()}/data/crew-status/${String(term).split("/").pop()}.json`)) ?? "null"); } catch {}
    const id = String(st?.model?.id ?? st?.model?.display_name ?? "").toLowerCase();
    const key = ["opus", "sonnet", "haiku"].find((k) => id.includes(k));
    if (key) { if (modelOf(rec.argv) !== key) updateBot(rec, (b) => ({ ...b, argv: withModel(b.argv, "claude", key) })); return; }
  }
}

// ─── Pins and colors ────────────────────────────────────────────────────────────────────────
// Kept in shared "crew.marks": pals by their id, channels (tabs) by their tab id. Colors are the
// theme's own names (ansi1…, accent), so a tab's color follows the theme when it changes.
// Blue first and red late, so a fresh channel doesn't look like it needs you.
export const TAB_COLORS = ["ansi4", "ansi5", "ansi6", "ansi2", "ansi3", "ansi1", "accent"];
export const marks = () => shared("crew.marks") ?? { pals: {}, tabs: {} };
function setMark(kind, id, patch) {
  const m = marks();
  const cur = { ...(m[kind]?.[id] ?? {}), ...patch };
  for (const k of Object.keys(cur)) if (cur[k] == null) delete cur[k];
  const next = { ...(m[kind] ?? {}) };
  if (Object.keys(cur).length) next[id] = cur; else delete next[id];
  setShared("crew.marks", { ...m, [kind]: next });
}
export const palPinned = (bot) => Boolean(marks().pals?.[bot.id]?.pin);
export const pinPal = (bot, on) => setMark("pals", bot.id, { pin: on ? Date.now() : null });
export const tabPinned = (tab) => Boolean(marks().tabs?.[tab.id]?.pin);
export const tabColorKey = (tab) => { const k = marks().tabs?.[tab.id]?.color; return k && k !== "none" ? k : null; };
export const tabColor = (tab, t) => { const k = tabColorKey(tab); return k ? t[k] ?? null : null; };
// Clearing a color by hand stores "none", so autoColor leaves that channel plain.
export const colorTab = (tab, key) => setMark("tabs", tab.id, { color: key || "none" });
// Every channel gets a color of its own as soon as it exists: the first palette color its pal
// isn't using yet, then round again. Run on a timer by the roster.
// How a theme color looks to the eye (OKLab), so "different" means different to a person.
function oklab(hex) {
  const n = parseInt(String(hex ?? "").replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return null;
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363015264 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s];
}
// The palette color that stands furthest from the ones a pal already uses (first one: blue). In a
// muted theme whose colors are near-twins, this still spreads them as far apart as they go.
function distinctColor(used, t) {
  const fresh = TAB_COLORS.filter((k) => !used.includes(k));
  const pool = fresh.length ? fresh : TAB_COLORS;
  if (!used.length) return pool[0];
  const seen = used.map((k) => oklab(t[k])).filter(Boolean);
  let best = pool[0], far = -1;
  for (const k of pool) {
    const c = oklab(t[k]);
    if (!c) continue;
    const near = Math.min(...seen.map((u) => Math.hypot(c[0] - u[0], c[1] - u[1], c[2] - u[2])));
    if (near > far) { far = near; best = k; }
  }
  return best;
}

const mixHex = (x, y, w) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(String(h).replace("#", "").padEnd(6, "0").slice(i - 1, i + 1), 16));
  const [u, v] = [p(x), p(y)];
  return "#" + u.map((c, i) => Math.round(c + (v[i] - c) * w).toString(16).padStart(2, "0")).join("");
};
const labDist = (x, y) => (x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 1);
let toned = { key: null, t: null };
export function tone(t) {
  const key = `${t.working}|${t.blocked}|${t.accent}`;
  if (toned.key === key) return toned.t;
  let out = t;
  const b = oklab(t.blocked);
  if (labDist(oklab(t.working), b) < 0.09) {
    const best = ["accent", "ansi3", "ansi4", "ansi6", "ansi2", "ansi5"]
      .map((k) => [k, labDist(oklab(t[k]), b)]).sort((x, y) => y[1] - x[1])[0];
    if (best && best[1] >= 0.09) out = { ...t, working: t[best[0]] };
    // A theme whose colors are all near-twins: lift working toward the text color, so it reads
    // by brightness (needs-you also pulses, so the two differ in motion too).
    else out = { ...t, working: mixHex(t.working, t.foreground, 0.45) };
  }
  toned = { key, t: out };
  return out;
}

export function autoColor(all = spaces()) {
  const t = tone(theme());
  const m = marks();
  const tabs = { ...(m.tabs ?? {}) };
  let changed = false;
  for (const sp of all) {
    const used = sp.tabs.map((x) => tabs[x.id]?.color).filter((k) => TAB_COLORS.includes(k));
    for (const tab of sp.tabs) {
      if (tabs[tab.id]?.color) continue;
      const pick = distinctColor(used, t);
      tabs[tab.id] = { ...(tabs[tab.id] ?? {}), color: pick };
      used.push(pick);
      changed = true;
    }
  }
  // Marks for this machine's closed tabs go (remote ones, "machine/…", may just be out of reach).
  const live = new Set(all.flatMap((sp) => sp.tabs.map((x) => x.id)));
  if (all.length) for (const id of Object.keys(tabs)) if (!id.includes("/") && !live.has(id)) { delete tabs[id]; changed = true; }
  if (changed) setShared("crew.marks", { ...m, tabs });
  return changed;
}
// Pinned channels go to the front of their pal's tabs (in the order they were pinned), so
// tab.next and Alt+number reach them first; unpinning puts one just after the pinned ones.
export function pinTab(space, tab, on) {
  setMark("tabs", tab.id, { pin: on ? Date.now() : null });
  orderPins(spaces().find((s) => s.id === space.id) ?? space);
}
// Puts a pal's pinned tabs first (in pin order), the rest after in their current order. Moves
// only what's out of place, tracking the order as it goes. Returns whether it moved anything.
export function orderPins(space) {
  const m = marks().tabs ?? {};
  const order = [...space.tabs].sort((x, y) => x.index - y.index).map((x) => x.id);
  const pinned = order.filter((id) => m[id]?.pin).sort((x, y) => m[x].pin - m[y].pin);
  const want = [...pinned, ...order.filter((id) => !m[id]?.pin)];
  let moved = false;
  for (let i = 0; i < want.length; i++) {
    if (order[i] === want[i]) continue;
    run("tab.move", { id: want[i], index: i + 1 });
    order.splice(order.indexOf(want[i]), 1);
    order.splice(i, 0, want[i]);
    moved = true;
  }
  return moved;
}

// A pal's channels in the order the hero (and the picker) lists them: pinned ones first, in pin
// order; then, once you've arranged this pal's channels (Move up / Move down), Herdr's own tab
// order; else the smart order: needs you, finished, working, idle agents, plain shells (ties by
// tab order). Arranging moves Herdr's tabs (tab.move), so the order is Herdr's and survives
// restarts; the "arranged" mark is per pal (marks.pals[bot].arranged).
const CH_RANK = { blocked: 0, done: 1, working: 2 };
export function channelOrder(space, bot = botOf(space)) {
  const m = marks();
  const pins = m.tabs ?? {};
  const byIndex = [...space.tabs].sort((x, y) => x.index - y.index);
  const pinned = byIndex.filter((x) => pins[x.id]?.pin).sort((x, y) => pins[x.id].pin - pins[y.id].pin);
  let rest = byIndex.filter((x) => !pins[x.id]?.pin);
  if (!m.pals?.[bot?.id]?.arranged) {
    const rank = (x) => (!tabHasAgent(x) ? 4 : CH_RANK[x.status] ?? 3);
    rest = rest.map((x, i) => [x, i]).sort(([x, i], [y, j]) => rank(x) - rank(y) || i - j).map(([x]) => x);
  }
  return [...pinned, ...rest];
}
// Herdr's tab order made to match `ids` (moving only what's out of place).
function applyTabOrder(space, ids) {
  const order = [...space.tabs].sort((x, y) => x.index - y.index).map((x) => x.id);
  for (let i = 0; i < ids.length; i++) {
    if (order[i] === ids[i]) continue;
    run("tab.move", { id: ids[i], index: i + 1 });
    order.splice(order.indexOf(ids[i]), 1);
    order.splice(i, 0, ids[i]);
  }
}
// Move a channel one place up (-1) or down (+1) in its pal's list, within its group (pinned ones
// among pinned, the rest among the rest). Returns false at an end.
export function canMoveChannel(space, tab, dir) {
  const order = channelOrder(space);
  const j = order.findIndex((x) => x.id === tab.id) + dir;
  return j >= 0 && j < order.length && tabPinned(order[j]) === tabPinned(tab);
}
export function moveChannel(space, tab, dir) {
  space = spaces().find((s) => s.id === space.id) ?? space;
  if (!canMoveChannel(space, tab, dir)) return false;
  const bot = botOf(space);
  const order = channelOrder(space, bot);
  const i = order.findIndex((x) => x.id === tab.id), other = order[i + dir];
  if (tabPinned(tab)) {
    // Pinned: trade pin times, then Herdr's order follows (orderPins).
    const pins = marks().tabs ?? {};
    const a = pins[tab.id].pin, b = pins[other.id].pin;
    setMark("tabs", tab.id, { pin: b });
    setMark("tabs", other.id, { pin: a });
    orderPins(space);
    return true;
  }
  const ids = order.map((x) => x.id);
  [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
  if (bot?.id) setMark("pals", bot.id, { arranged: true });
  applyTabOrder(space, ids);
  return true;
}

// The small wavy "working" line from the shell's Tide language.
export const WAVE = "mods/crew-roster/wave.svg";

export function statusWord(status) {
  return { working: "working", blocked: "needs you", done: "done", idle: "idle", starting: "starting" }[status] ?? "asleep";
}
export function statusColor(status, t = tone(theme())) {
  return { working: t.working, blocked: t.blocked, done: t.done }[status] ?? t.dim;
}

// ── Rooms ────────────────────────────────────────────────────────────────────────────────
// A room is a named group of member channels (any pals), a goal, and a shared transcript.
// Project Pals keeps rooms in shared("crew").rooms and mirrors each to data/crew-rooms/<slug>.json so the
// `pal-room` command (run by the pals themselves) can read members and post to <slug>.jsonl.

export const roomSlug = (name) => (name ?? "").toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "room";
export const rooms = (c = crew()) => (Array.isArray(c.rooms) ? c.rooms : []);
export const ROOM_DIR = "data/crew-rooms";

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const ch of node?.children ?? []) { const f = findNode(ch, id); if (f) return f; }
  return null;
}
// Is the center showing a room (the layout's "center" stack on "room-view")?
export const roomMode = () => findNode(layout(), "center")?.active === "room-view";
export const shownRoom = (c = crew()) => (roomMode() ? rooms(c).find((r) => r.id === shared("crew.room")) ?? null : null);
// A room is shown with the composer under it (a room has no terminal to type in); a channel is
// its terminal, nothing under it (terminal-first, DeNon 2026-11-08).
export function showRoom(id) {
  setShared("crew.room", id);
  run("layout.select", { stack: "center", child: "room-view" });
  if (findNode(layout(), "crew-composer")?.hidden) run("layout.show", { id: "crew-composer" });
}
export function showTabs() {
  if (roomMode()) run("layout.select", { stack: "center", child: "tab-view" });
  if (findNode(layout(), "crew-composer") && !findNode(layout(), "crew-composer").hidden) run("layout.hide", { id: "crew-composer" });
}

// Members resolved against what's live: pal (space) name, channel, terminal, status.
export function roomMembers(room, all = spaces(), ps = panes(), c = crew()) {
  return (room?.members ?? []).map((m) => {
    const space = all.find((s) => s.id === m.space);
    const tab = space?.tabs.find((t) => t.id === m.tab);
    const bot = space ? botOf(space, c, ps) : { name: m.bot ?? "gone", harness: null, awake: false };
    const lead = tab ? leadPane(tab.id, ps) : null;
    // agent: something is running there that can read a message (a bare shell would run it as commands).
    return { ...m, space, tab, bot, name: bot.name, channel: tab ? channelName(tab) : m.channel, terminal: lead?.terminal ?? null, agent: Boolean(lead?.program?.agent), status: tab?.status ?? null };
  });
}

export async function writeRoomFile(room) {
  const dir = `${appHome()}/${ROOM_DIR}`;
  const members = roomMembers(room).map((m) => ({ bot: m.name, channel: m.channel, terminal: m.terminal, space: m.space?.id ?? m.space, tab: m.tab?.id ?? m.tab }));
  const r = await exec("sh", ["-c", 'mkdir -p "$1" && printf "%s" "$3" > "$1/$2.json"', "sh", dir, room.slug,
    JSON.stringify({ name: room.name, goal: room.goal ?? "", members }, null, 2)]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "couldn't write the room file");
}

export function saveRoom(room) {
  const c = crew();
  const list = rooms(c);
  const next = list.some((r) => r.id === room.id) ? list.map((r) => (r.id === room.id ? room : r)) : [...list, room];
  saveCrew({ ...c, rooms: next });
  writeRoomFile(room).catch(() => {});
}
export function deleteRoom(id) {
  const c = crew();
  const room = rooms(c).find((r) => r.id === id);
  saveCrew({ ...c, rooms: rooms(c).filter((r) => r.id !== id) });
  // The transcript stays (renamed) in case you want it; the room file goes so it isn't re-adopted.
  if (room) exec("sh", ["-c", 'cd "$1" && rm -f "$2.json" && [ -f "$2.jsonl" ] && mv "$2.jsonl" "$2.closed-$(date +%s).jsonl" || true', "sh", `${appHome()}/${ROOM_DIR}`, room.slug]).catch(() => {});
}

// Rooms opened from a terminal (`pal-room new`, by you or a pal) appear in Project Pals.
export async function adoptRooms() {
  const dir = `${appHome()}/${ROOM_DIR}`;
  const r = await exec("sh", ["-c", 'ls -1 "$1" 2>/dev/null | grep "\\.json$" || true', "sh", dir]);
  const known = new Set(rooms().map((x) => x.slug));
  for (const file of r.stdout.split("\n").filter(Boolean)) {
    const slug = file.replace(/\.json$/, "");
    if (known.has(slug)) continue;
    const meta = JSON.parse((await readTextFile(`${dir}/${file}`)) ?? "{}");
    if (!Array.isArray(meta.members)) continue;
    const c = crew();
    saveCrew({ ...c, rooms: [...rooms(c), { id: newId(), slug, name: meta.name ?? slug, goal: meta.goal ?? "", created: Date.now(),
      members: meta.members.map((m) => ({ space: m.space, tab: m.tab, bot: m.bot, channel: m.channel })) }] });
  }
}

export async function readRoomLog(room) {
  const text = await readTextFile(`${appHome()}/${ROOM_DIR}/${room.slug}.jsonl`);
  return (text ?? "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
export async function appendRoomLog(room, entry) {
  const dir = `${appHome()}/${ROOM_DIR}`;
  const r = await exec("sh", ["-c", 'mkdir -p "$1" && printf "%s\\n" "$3" >> "$1/$2.jsonl"', "sh", dir, room.slug, JSON.stringify(entry)]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "couldn't write the transcript");
}

// Who a message goes to: @Name / @Name#channel / @all, else (from you) everyone.
export function roomTargets(members, text, everyoneByDefault = true) {
  const live = members.filter((m) => m.terminal && m.agent);
  const names = [...text.matchAll(/@([\w.-]+(?:#[\w.-]+)?)/g)].map((x) => x[1].toLowerCase());
  if (!names.length) return everyoneByDefault ? live : [];
  if (names.includes("all")) return live;
  return live.filter((m) => names.some((n) => {
    const [bot, ch] = n.split("#");
    const b = m.name.toLowerCase(), dashed = b.replace(/\s+/g, "-");
    return (b === bot || dashed === bot || dashed.startsWith(bot)) && (!ch || (m.channel ?? "").toLowerCase() === ch);
  }));
}

export function briefing(room, members, me) {
  const others = members.filter((m) => m !== me).map((m) => `${m.name} (#${m.channel})`).join(", ") || "nobody else yet";
  return `You've joined the room #${room.name}${room.goal ? ` — goal: ${room.goal}` : ""}. Also here: ${others}. `
    + `Talk to the room with: pal-room say ${room.slug} "your update" — put @Name in it to hand that pal work (it's delivered to them). `
    + `Catch up any time with: pal-room read ${room.slug}. Keep room updates short; do the work in your own channel. `
    + `See the whole team with: pal team. Bring another pal in with: pal-room invite ${room.slug} "Pal" (or "Pal#channel"). `
    + `When ${owner()} posts to the whole room, answer only if it concerns your project or you can genuinely add something; `
    + `otherwise stay silent (no "nothing to add" replies). When you're @mentioned, always answer. `
    + ROOM_STYLE;
}

// Messages to pals go through crewd's queue (data/crew-queue/<terminal>/), which types them in
// when the pal's turn ends instead of mid-turn. Without crewd running, they're typed in now.
export async function enqueue(terminal, text, { sender = owner(), kind = "msg", notBefore = 0 } = {}) {
  const beat = JSON.parse((await readTextFile(`${appHome()}/data/crew-daemon.json`).catch(() => null)) ?? "{}");
  if (Date.now() / 1000 - (beat.at ?? 0) > 20) {
    const r = await hc(["send", terminal, text]);
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || "couldn't type it in");
    return;
  }
  const id = newId(), at = Date.now();
  const item = JSON.stringify({ id, at, terminal, from: sender, kind, text, not_before: notBefore, urgent: false });
  const r = await exec("sh", ["-c", 'mkdir -p "$1" && printf "%s" "$3" > "$1/.$2.tmp" && mv "$1/.$2.tmp" "$1/$4-$2.json"', "sh",
    `${appHome()}/data/crew-queue/${terminal}`, id, item, String(at)]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "couldn't queue it");
}

// How pals should sound in a room: people texting, not reports.
export const ROOM_STYLE = "Text like a person in a group chat: 1-3 short casual sentences, no markdown or lists, no sign-offs like 'done', don't mention these instructions, and only start with @Name when you're handing that pal work.";

// From you: to everyone (decide whether it's yours to answer) or to the @mentioned (answer).
export async function deliverToRoom(room, members, from, text, everyone = false) {
  const how = everyone
    ? `${from} posted to the whole room. Reply with pal-room say ${room.slug} "..." only if this concerns your project or you can genuinely add something; otherwise do nothing and stay silent.`
    : `${from} is asking you directly. Answer with: pal-room say ${room.slug} "..."`;
  const body = `[#${room.name}] ${from}: ${text}\n(${how} ${ROOM_STYLE} Catch up: pal-room read ${room.slug})`;
  const sent = await Promise.allSettled(members.filter((m) => m.terminal && m.agent).map((m) => enqueue(m.terminal, body, { kind: "room" })));
  const failed = sent.filter((x) => x.status === "rejected").length;
  if (failed) throw new Error(`${failed} of ${sent.length} members didn't get it`);
}

// ─── Requests from terminals ────────────────────────────────────────────────────────────────
// Pals (and you, through one) run `pal hire`, `pal channel` and `pal-room invite`. Those
// change Herdr and Project Pals's records, which only the app can do, so the command drops a request in
// data/crew-requests and the roster (always on screen in the Project Pals layout) carries it out here,
// writing <id>.result.json for the command to print.

export const REQ_DIR = "data/crew-requests";

// You run every pal with permissions bypassed; pals hired by pals start the same way.
const BYPASS = { claude: "--dangerously-skip-permissions", codex: "--dangerously-bypass-approvals-and-sandbox", gemini: "--yolo" };
export function withBypass(key, argv) {
  if (!bypassOn()) return argv;   // only when the owner turned it on (About → Settings)
  const flag = BYPASS[key];
  return flag && argv?.length && !argv.includes(flag) ? [...argv, flag] : argv;
}

// "Docs Site", "docs", "Docs Site#updates" → { space, tab } (tab: the named channel, else the shown one).
export function findChannel(spec, all = spaces()) {
  const [botPart, ch] = String(spec).replace(/^@/, "").split("#");
  const want = botPart.trim().toLowerCase().replace(/[-_]/g, " ");
  const norm = (n) => n.toLowerCase().replace(/[-_]/g, " ");
  const space = all.find((s) => norm(s.name) === want) ?? all.find((s) => norm(s.name).startsWith(want))
    ?? all.find((s) => norm(s.name).includes(want));
  if (!space) return { error: `no pal called "${botPart}". The team: ${all.map((s) => s.name).join(", ")}` };
  if (!ch) return { space, tab: space.tabs.find((t) => t.active) ?? space.tabs[0] };
  const tab = space.tabs.find((t) => channelName(t).toLowerCase() === ch.trim().toLowerCase().replace(/^#/, ""));
  return tab ? { space, tab } : { error: `${space.name} has no #${ch}. Channels: ${space.tabs.map((t) => "#" + channelName(t)).join(", ")}` };
}

// Keep your view where it was while a pal makes something.
function holdView() {
  const space = spaces().find((s) => s.active), tab = space?.tabs.find((t) => t.active);
  return () => { if (space) run("space.select", { id: space.id }); if (tab) run("tab.select", { id: tab.id }); };
}

async function brainFor(harness, machine) {
  const all = await knownAgents({ on: machine ?? null });
  const h = (harness ?? "claude").toLowerCase();
  const found = all.find((x) => x.key === h) ?? all.find((x) => x.name.toLowerCase() === h)
    ?? all.find((x) => x.name.toLowerCase().includes(h) || x.key.includes(h));
  if (!found) throw new Error(`no harness called "${harness}". Known: ${all.map((x) => x.key).join(", ")}`);
  if (!found.installed) throw new Error(`${found.name} isn't installed${machine ? ` on ${machine}` : ""}. Installed: ${all.filter((x) => x.installed).map((x) => x.key).join(", ")}`);
  return found;
}

const HANDLERS = {
  // `pal brain where`: a record field the owner changes from the command line (brainIn only).
  async record(req) {
    if (req.by) throw new Error("only the owner changes a pal's record");
    const sp = spaces().find((s) => s.id === req.space);
    const rec = sp ? recordOf(sp) : null;
    if (!rec) throw new Error("that pal has no record");
    const f = req.fields ?? {};
    const ok = {};
    if (f.brainIn === "pal" || f.brainIn === "project") ok.brainIn = f.brainIn;
    updateBot(rec, (b) => ({ ...b, ...ok }));
    return { ok: true };
  },
  // `pal settings head "Name"`: rename the head pal's space and record (the command moves its
  // memory and routines). No head pal hired yet: nothing to rename, the name waits in settings.
  async "rename-head"(req) {
    const name = (req.name ?? "").trim();
    if (!name) throw new Error("give the head pal a name");
    const rec = crew().bots.find((b) => b.god);
    if (!rec) return { ok: true, old: null };
    const space = spaces().find((s) => s.id === rec.space) ?? spaces().find((s) => s.name === rec.name);
    const old = space?.name ?? rec.name;
    if (old === name) return { ok: true, old };
    const taken = (n) => n.toLowerCase() === name.toLowerCase();
    if (spaces().some((s) => s.id !== space?.id && taken(s.name)) || crew().bots.some((b) => b.id !== rec.id && taken(b.name ?? "")))
      throw new Error(`there's already a pal called ${name} (awake or asleep)`);
    if (space) run("space.rename", { id: space.id, name });
    updateBot(rec, (b) => ({ ...b, name }));
    return { ok: true, old };
  },

  async hire(req) {
    const name = (req.name ?? "").trim();
    if (!name) throw new Error("give the new pal a name");
    const machine = req.machine || null;
    if (spaces().some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`there's already a pal called ${name}`);
    const by = req.by ? findChannel(req.by) : null;
    const harness = req.harness ?? (by?.space ? brainOf(by.space) : null) ?? "claude";
    const brain = await brainFor(harness, machine);
    const channel = "#" + ((req.channel ?? "general").replace(/^#/, "").trim().replace(/\s+/g, "-") || "general");
    const role = req.role || (req.god ? "Overseer" : "Pal");
    const argv = withModel(withBypass(brain.key, brain.run), brain.key, req.model || null);
    const c = crew();
    const rec = {
      id: newId(), name, role, harness: brain.key, harnessName: brain.name, argv, machine, folder: req.folder || null,
      categories: { [channel]: "General" }, briefs: req.task ? { [channel]: req.task } : {}, memory: "", hired: Date.now(),
      hiredBy: req.byName ?? null, ...(req.god ? { god: true } : {}),
    };
    saveCrew({ ...c, bots: [...c.bots, rec] });
    const back = req.show ? null : holdView();
    const hint = primerHint(argv);
    run("space.new", { name, tab: channel, argv, machine: machine ?? "", folder: req.folder || undefined, task: req.task ? [req.task, hint].filter(Boolean).join("\n\n") : (hint || undefined) });
    const made = spaces().find((s) => s.name === name);
    if (made) saveCrew({ ...crew(), bots: crew().bots.map((b) => (b.id === rec.id ? { ...b, space: made.id } : b)) });
    back?.();
    notify({ title: req.byName ? `${req.byName} hired ${name}` : `Hired ${name}`, body: `${brain.name}${machine ? ` on ${machine}` : ""} · ${channel}`, level: "success", timeout: 4000 });
    if (/claude/i.test(brain.key)) watchTrust(name, channel);
    return { ok: true, name, space: made?.id ?? null, channel, harness: brain.name, argv };
  },

  async channel(req) {
    const f = findChannel(req.bot);
    if (f.error) throw new Error(f.error);
    const { space } = f;
    const name = "#" + (req.name ?? "").replace(/^#/, "").trim().replace(/\s+/g, "-");
    if (name === "#") throw new Error("name the channel");
    if (space.tabs.some((x) => channelName(x).toLowerCase() === name.slice(1).toLowerCase())) throw new Error(`${space.name} already has ${name}`);
    const bot = botOf(space);
    // Its brain: one asked for, else the pal's own as hired, else what runs in it now.
    const fresh = async (h) => { const b = await brainFor(h, space.machine); return withBypass(b.key, b.run); };
    const argv = req.harness ? await fresh(req.harness) : bot.record?.argv ?? (bot.harness ? await fresh(bot.harness) : undefined);
    const category = req.category || "Channels";
    updateBot(bot.record ?? bot, (b) => ({
      ...b,
      categories: { ...(b.categories ?? {}), [name]: category },
      briefs: req.brief ? { ...(b.briefs ?? {}), [name]: req.brief } : (b.briefs ?? {}),
      ...(req.worktree ? { worktrees: { ...(b.worktrees ?? {}), [name]: req.worktree } } : {}),
    }));
    const memory = (bot.memory ?? "").trim();
    const where = req.worktree ? `You work on your own git branch ${req.worktree.branch} in this folder (a worktree of the project); commit there. ${owner()} reviews and lands it.` : "";
    const task = [req.brief && `You are ${bot.name} in ${name}. ${req.brief}`, where, primerHint(argv), memory && `Things to remember: ${memory}`].filter(Boolean).join("\n\n");
    const back = holdView();
    run("tab.new", { space: space.id, name, argv: argv || undefined, folder: req.folder || bot.folder || space.folder || undefined, task: argv ? (task || undefined) : undefined });
    back();
    notify({ title: `${req.byName ?? "A pal"} added ${space.name} ${name}`, level: "success", timeout: 3500 });
    if (/claude/i.test((argv ?? [])[0] ?? "")) watchTrust(space.name, name);
    return { ok: true, bot: space.name, channel: name };
  },

  async invite(req) {
    const c = crew();
    const slug = String(req.room ?? "").replace(/^#/, "").toLowerCase();
    const room = rooms(c).find((r) => r.slug === slug);
    if (!room) throw new Error(`no room #${slug}. Rooms: ${rooms(c).map((r) => "#" + r.slug).join(", ") || "none"}`);
    const added = [], skipped = [];
    const woke = [];
    let members = [...room.members];
    for (const spec of req.who ?? []) {
      const f = findChannel(spec);
      if (f.error) throw new Error(f.error);
      let tab = f.tab;
      // Asleep there (a shell, no agent): wake the pal in a new channel for this room.
      if (!leadPane(tab.id)?.program?.agent) {
        tab = await wakeFor(f.space, room);
        woke.push(f.space.name);
        // Its old, asleep membership (if any) gives way to the woken channel.
        members = members.filter((m) => !(m.space === f.space.id && !leadPane(m.tab)?.program?.agent));
      }
      if (members.some((m) => m.space === f.space.id && m.tab === tab.id)) { skipped.push(f.space.name); continue; }
      members.push({ space: f.space.id, tab: tab.id, bot: f.space.name, channel: channelName(tab) });
      added.push(`${f.space.id}|${tab.id}`);
    }
    if (!added.length) return { ok: true, added: [], skipped };
    const next = { ...room, members };
    saveRoom(next);
    await writeRoomFile(next);
    const live = roomMembers(next);
    const fresh = live.filter((m) => added.includes(`${m.space?.id}|${m.tab?.id}`));
    const names = fresh.map((m) => m.name);
    await appendRoomLog(next, { at: Date.now(), from: req.byName ?? "Someone", kind: "event", text: `${req.byName ?? "Someone"} added ${names.join(" and ")}` });
    // Woken pals got the briefing as their first message; the rest get it typed in.
    for (const m of fresh) if (m.agent && !woke.includes(m.name)) enqueue(m.terminal, `${req.byName ?? "Someone"} brought you into #${next.name}. ` + briefing(next, live, m), { sender: req.byName ?? "crew", kind: "room" }).catch(() => {});
    return { ok: true, added: fresh.map((m) => `${m.name} #${m.channel}`), skipped, woke, unreachable: [] };
  },
};

const pause = (s) => exec("sleep", [String(s)]).catch(() => {});

// Claude Code asks "Quick safety check: … one you trust?" the first time it runs in a folder and
// waits for a person. A pal hired into a new folder would just sit there, so point at the tab.
// Never answer it: trusting a folder is the owner's call. (crewd watches for it too, for the overview.)
// Compared with all whitespace removed: the screen may wrap lines or draw spaces as cursor moves.
export function onTrustPrompt(text) {
  const t = String(text ?? "").replace(/\s+/g, "");
  return t.includes("Yes,Itrustthisfolder") && /Accessingworkspace|Quicksafetycheck/.test(t);
}
async function watchTrust(bot, channel) {
  for (let i = 0; i < 6; i++) {
    await pause(3);
    const space = spaces().find((s) => s.name === bot);
    const tab = space?.tabs.find((t) => channelName(t).toLowerCase() === channel.replace(/^#/, "").toLowerCase());
    const terminal = tab && panes().find((p) => p.tab === tab.id && p.terminal)?.terminal;
    if (!terminal) continue;
    if (tab.status === "working") return;
    const r = await hc(["read", terminal, "--lines", "40"]).catch(() => null);
    if (r?.code === 0 && onTrustPrompt(r.stdout)) {
      notify({ title: `${bot} is waiting on you`, body: `Claude Code asks whether to trust this folder. Open ${bot} ${channel} and answer it; its first task starts after that.`, level: "warning", timeout: 30000, action: { name: "tab.select", args: { id: tab.id } } });
      return;
    }
  }
}

// Claude Code pals get the pal primer and their memory from the session-start hook; other
// harnesses are told where to find them.
export function primerHint(argv) {
  const prog = (argv?.[0] ?? "").split("/").pop();
  return prog && prog !== "claude" ? "First run `pal primer` and `pal memory` to learn how the crew works and what you remember." : "";
}

// Start a pal's brain in a new channel named after the room, briefed for it. Returns the tab.
async function wakeFor(space, room) {
  const bot = botOf(space);
  const rec = bot.record;
  const key = rec?.harness ?? "claude";
  const brain = rec?.argv ? null : await brainFor(key, space.machine);
  const argv = rec?.argv ?? withBypass(brain.key, brain.run);
  let name = `#${room.slug}`, n = 2;
  while (space.tabs.some((t) => t.name === name)) name = `#${room.slug}-${n++}`;
  const others = roomMembers(room).map((m) => `${m.name} (#${m.channel})`).join(", ");
  const memory = (rec?.memory ?? "").trim();
  const task = `You are ${space.name}, a pal in ${owner()}'s Project Pals crew; your project is in this folder. You've just been brought into the room #${room.name}`
    + `${room.goal ? ` (goal: ${room.goal})` : ""} with ${others}. Catch up with: pal-room read ${room.slug}, then join in with pal-room say ${room.slug} "..." `
    + `if you have something to add. See the team with pal team. ${ROOM_STYLE}` + (memory ? `\n\nThings to remember: ${memory}` : "");
  const back = holdView();
  run("tab.new", { space: space.id, name, argv, folder: space.folder || rec?.folder || undefined, task });
  back();
  if (rec) updateBot(rec, (b) => ({ ...b, categories: { ...(b.categories ?? {}), [name]: "Rooms" } }));
  for (let i = 0; i < 20; i++) {
    const tab = spaces().find((s) => s.id === space.id)?.tabs.find((t) => t.name === name);
    if (tab) return tab;
    await pause(0.25);
  }
  throw new Error(`couldn't wake ${space.name} (its new channel didn't appear)`);
}

let serving = false;
export async function serveRequests() {
  if (serving) return;
  serving = true;
  const dir = `${appHome()}/${REQ_DIR}`;
  try {
    const r = await exec("sh", ["-c", 'ls -1 "$1" 2>/dev/null | grep "\\.req\\.json$" || true', "sh", dir]);
    for (const file of r.stdout.split("\n").filter(Boolean)) {
      const id = file.replace(/\.req\.json$/, "");
      // Claim it first, so it's carried out once.
      const claim = await exec("sh", ["-c", 'mv "$1/$2.req.json" "$1/$2.work.json"', "sh", dir, id]);
      if (claim.code !== 0) continue;
      let result;
      try {
        const req = JSON.parse((await readTextFile(`${dir}/${id}.work.json`)) ?? "{}");
        const handler = HANDLERS[req.op];
        result = handler ? await handler(req) : { ok: false, error: `unknown request "${req.op}"` };
      } catch (e) {
        result = { ok: false, error: String(e?.message ?? e) };
      }
      await exec("sh", ["-c", 'printf "%s" "$3" > "$1/$2.result.json" && rm -f "$1/$2.work.json"', "sh", dir, id, JSON.stringify(result)]);
    }
  } finally {
    serving = false;
  }
}

// ─── What crewd and the crew command keep: tasks, approvals, routines, stuck channels ──────

export async function loadOps() {
  const d = `${appHome()}/data`;
  const read = async (f, dflt) => { try { return JSON.parse((await readTextFile(`${d}/${f}`)) ?? "null") ?? dflt; } catch { return dflt; } };
  const r = await exec("sh", ["-c", 'for f in "$1"/*.json; do [ -f "$f" ] && tr -d "\\n" < "$f" && echo; done; true', "sh", `${d}/crew-approvals`]);
  const approvals = r.stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  // Proposals (data/crew-proposals): a change a pal wants made to a file the owner decides on.
  const pr = await exec("sh", ["-c", 'for f in "$1"/*.json; do [ -f "$f" ] && tr -d "\\n" < "$f" && echo; done; true', "sh", `${d}/crew-proposals`]);
  const proposals = pr.stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((x) => x && x.status === "pending" && Date.now() - (x.at ?? 0) < 7 * 86400000).sort((x, y) => x.at - y.at);
  const beat = await read("crew-daemon.json", {});
  // An update waiting? (crewd checks once a day; About checks on demand.)
  const ins = await read("crew-install.json", {}), upd = await read("crew-update.json", {});
  const vt = (v) => (String(v ?? "0").match(/\d+/g) ?? []).concat(["0", "0", "0"]).slice(0, 3).map(Number);
  const [p, q] = [vt(upd.latest), vt(ins.version)];
  const newer = Boolean(upd.latest) && (p[0] - q[0] || p[1] - q[1] || p[2] - q[2]) > 0;
  return {
    update: { current: ins.version ?? null, latest: upd.latest ?? null, available: newer },
    approvals: approvals.filter((x) => x.status === "pending").sort((x, y) => x.at - y.at),
    proposals,
    tasks: (await read("crew-tasks.json", { tasks: [] })).tasks ?? [],
    routines: await read("crew-routines.json", []),
    stalled: (await read("crew-health.json", {})).stalled ?? {},
    daemon: Date.now() / 1000 - (beat.at ?? 0) < 20,
  };
}

// Run the pal command (as the owner: the app isn't a pal's terminal).
export async function crewCli(args) {
  const r = await exec(`${home()}/.local/bin/pal`, args);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ") || "crew failed");
  return r.stdout;
}

// Does a task belong to this pal (by name, any channel)?
export const taskOf = (task, botName) => {
  const owner = (task.claimed_by || task.assignee || "").toLowerCase().split("#")[0];
  const b = (botName ?? "").toLowerCase();
  return Boolean(owner && b && (owner.startsWith(b) || b.startsWith(owner)));
};

// ─── The pals layout's shape ────────────────────────────────────────────────────────────────
//
// One shape, Focus (DeNon removed Pro on 2026-11-08): the pal sidebar with the hero, and the shown
// channel's terminal. Its width is remembered in data/crew-settings.json (mirrored to shared
// "crew.settings") as focus.sidebarPx.

export const SIDEBAR_PX = 304;
export const sidebarPref = () => shared("crew.settings")?.focus?.sidebarPx ?? SIDEBAR_PX;

// The design-system tokens: the exact values of the Paper boards "MODE · Focus (default)" and
// "MODE · Pro" (docs/design-system/analysis.md). The pals layout paints these itself rather than
// the theme's colours, so it looks the same under any dark theme (a theme picked for the layout
// would override a layout theme anyway); a light theme gets the DS light set.
const DS_DARK = {
  bg0: "#0B0B0C", bg1: "#0E0E0F", inset: "#0A0A0B", raised: "#161617", composer: "#1A1A1B",
  bubble: "#161617", bubbleOld: "#131314", sel: "#232324", ctl: "#2E2E30", hover: "#18181A",
  line: "#1E1E20", lineSoft: "#18181A", lineMid: "#2C2C2F", lineStrong: "#3C3C3F",
  fg1: "#EDEDED", body: "#C8C8C8", fg2: "#808082", fg3: "#6A6A6C", fg4: "#56565A",
  icon: "#646C80", iconOn: "#8089A0", iconDim: "#4E5568",
  info: "#4CA1F2", infoText: "#8EC3F6", ok: "#34D098", okHi: "#6EE3B4", warn: "#E8AA0A", warnText: "#F0C04A", err: "#F06C6C",
  me: "#22364A", meOld: "#1A2836", meEdge: "#4FA8FF", act: "#2F4760", actFg: "#C9DCEF", claude: "#D97757",
};
const DS_LIGHT = {
  bg0: "#FFFFFF", bg1: "#F7F7F8", inset: "#F3F3F4", raised: "#F0F0F1", composer: "#FFFFFF",
  bubble: "#F0F0F1", bubbleOld: "#F5F5F6", sel: "#E8E8EA", ctl: "#E4E4E7", hover: "#F0F0F1",
  line: "#E4E4E7", lineSoft: "#EDEDF0", lineMid: "#D9D9DE", lineStrong: "#C9C9CE",
  fg1: "#111113", body: "#2E2E31", fg2: "#6B6B70", fg3: "#8A8A90", fg4: "#A0A0A6",
  icon: "#80808A", iconOn: "#4E5568", iconDim: "#A0A0A6",
  info: "#1F7AD6", infoText: "#1F7AD6", ok: "#0F8A5F", okHi: "#0F8A5F", warn: "#B07800", warnText: "#8A5A00", err: "#C83A3A",
  me: "#E3ECF5", meOld: "#EEF3F8", meEdge: "#1F7AD6", act: "#1F7AD6", actFg: "#FFFFFF", claude: "#D97757",
};
const lumOf = (c) => { const h = String(c ?? "").replace("#", ""); if (h.length < 6) return 0; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function ds(t) {
  const c = lumOf(t?.background) > 0.5 ? DS_LIGHT : DS_DARK;
  return { ...c, r: { xs: 3, sm: 4, md: 6, lg: 8 }, mono: "JetBrains Mono", ui: "Inter" };
}

// Merge a change into data/crew-settings.json (the Python side keeps any keys it doesn't know),
// and into shared "crew.settings" at once, so every mod follows without waiting for the next sync.
// Objects (`focus`) merge one level deep. Pro's old keys (layoutMode, pro) are dropped on write.
let settingsWrite = Promise.resolve();
export function saveUiSettings(patch) {
  setShared("crew.uiwrite", { busy: true, at: Date.now() });
  const merge = (s) => {
    const out = { ...s };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = v && typeof v === "object" && !Array.isArray(v) ? { ...(s[k] ?? {}), ...v } : v;
    }
    delete out.layoutMode;
    delete out.pro;
    return out;
  };
  setShared("crew.settings", merge(shared("crew.settings") ?? {}));
  const path = `${appHome()}/data/crew-settings.json`;
  // One write at a time; each re-reads the file so a `pal settings` change in between survives.
  settingsWrite = settingsWrite.then(async () => {
    for (let i = 0; i < 3; i++) {
      const before = await readTextFile(path).catch(() => null);
      let s = {};
      try { s = JSON.parse(before ?? "{}") ?? {}; } catch { s = {}; }
      try { await writeTextFile(path, JSON.stringify(merge(s), null, 2) + "\n", before); return; } catch {}
    }
  }).catch(() => {}).finally(() => setShared("crew.uiwrite", { busy: false, at: Date.now() }));
  return settingsWrite;
}

const nodeOf = (id) => findNode(layout(), id);
const pxOf = (id) => nodeOf(id)?.size?.px ?? null;
let applying = 0; // when the layout was last laid out: a width read right after is still the old one

// Lay the pals layout out: its fixed heights (a 52 px header, a 24 px status bar, a 96 px composer
// area that shows only under a room) and the remembered sidebar width. Anywhere else it's a no-op.
export function applyLayout() {
  if (!nodeOf("crew-header") || !nodeOf("sidebar")) return false;
  applying = Date.now();
  const show = (id, on) => { const n = nodeOf(id); if (n && Boolean(n.hidden) === on) run(on ? "layout.show" : "layout.hide", { id }); };
  const height = (id, px) => { const n = nodeOf(id); if (n && n.size?.px !== px) run("layout.resize", { id, px }); };
  show("crew-header", true);
  height("status", 24);
  height("crew-composer", 96);
  show("crew-composer", roomMode());
  run("layout.resize", { id: "sidebar", px: sidebarPref() });
  // The profile panel starts hidden on every launch (Herdr remembers shown/hidden as a layout
  // click, so a panel left open at quit would come back open), with the terminal at full width.
  if (nodeOf("profile")) { show("work", true); show("profile", false); }
  return true;
}

// The sidebar's width now, saved (called on a timer).
export function rememberWidths() {
  if (Date.now() - applying < 1500) return;
  const side = pxOf("sidebar");
  if (side && side !== sidebarPref()) saveUiSettings({ focus: { sidebarPx: side } });
  // The profile panel's Side width, when it's open beside the terminal and was dragged.
  const panel = panelOpen() && !panelFull() ? pxOf("profile") : null;
  if (panel && clampPanel(panel) !== panelPref()) saveUiSettings({ focus: { panelPx: clampPanel(panel) } });
}

// ─── The profile panel (DeNon 2026-11-08: a right-side panel, hidden until you open one) ─────
//
// layouts/pals.json's `profile` column sits in the body row after `work`, hidden. It opens from
// the hero's name, the Profile quick action, the pal menus and Ctrl+Shift+I (crew-roster.profile);
// Esc (while it has the keyboard), its × or the same trigger again close it, and the terminal gets
// its full width back. Two sizes: Side, beside the terminal (focus.panelPx, 360-640, 420 by
// default), and Full, which hides `work` so the panel fills the row. It always shows the shown
// pal. Shared "crew.panel": { tab, sizes: {[tab]: "side" | "full"}, section, at }.
export const PANEL_PX = 420, PANEL_MIN = 360, PANEL_MAX = 640;
const clampPanel = (px) => Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(px)));
export const panelPref = () => clampPanel(shared("crew.settings")?.focus?.panelPx ?? PANEL_PX);
export const panelState = () => shared("crew.panel") ?? {};
export const panelOpen = () => { const n = nodeOf("profile"); return Boolean(n && !n.hidden); };
export const panelTab = () => panelState().tab ?? "profile";
export const panelFull = () => panelOpen() && Boolean(nodeOf("work")?.hidden);
export const panelSizeOf = (tab) => panelState().sizes?.[tab] ?? "side";
function layPanel(size) {
  if (size === "full") {
    run("layout.resize", { id: "profile", weight: 1 });
    if (!nodeOf("work")?.hidden) run("layout.hide", { id: "work" });
  } else {
    if (nodeOf("work")?.hidden) run("layout.show", { id: "work" });
    run("layout.resize", { id: "profile", px: panelPref() });
  }
}
// Open on a tab (section: a part of it to scroll to, e.g. "memory").
export function openPanel(tab = "profile", opts = {}) {
  if (!nodeOf("profile")) return false;
  setShared("crew.panel", { ...panelState(), tab, section: opts.section ?? null, at: Date.now() });
  layPanel(panelSizeOf(tab));
  if (nodeOf("profile").hidden) run("layout.show", { id: "profile" });
  return true;
}
export function closePanel() {
  if (nodeOf("work")?.hidden) run("layout.show", { id: "work" });
  if (panelOpen()) run("layout.hide", { id: "profile" });
}
// A trigger: opens on its tab, switches tab if the panel shows another, closes it if it's
// already on that tab.
export function togglePanel(tab = "profile", opts = {}) {
  if (panelOpen() && panelTab() === tab) closePanel();
  else openPanel(tab, opts);
}
// The header's ⤢ / ⤡: this tab's size, remembered per tab.
export function setPanelSize(size) {
  const st = panelState();
  setShared("crew.panel", { ...st, sizes: { ...(st.sizes ?? {}), [panelTab()]: size } });
  layPanel(size);
}
// The pal menu under the header's chip (crew-palmenu): everything about the agent and its project.
export function openPalMenu(spaceId) {
  return openOverlay({ mod: "crew-palmenu", kind: "popup", frame: "none", width: 300, props: { space: spaceId } });
}
// A worktree channel's branch, for Review changes (bot.worktrees is keyed by "#name").
export const worktreeOf = (bot, tab) => (tab ? pick(bot?.worktrees, tab) ?? bot?.worktrees?.["#" + channelName(tab)] ?? null : null);
export function openReview(space, tab) {
  return openOverlay({ mod: "crew-review", kind: "dialog", width: 0.86, height: 0.88, props: { space: space.id, tab: tab.id } });
}
// What needs DeNon (the status bar's "N need you"): channels that ask, commands held for approval,
// channels that look stuck. Finished channels are in the Inbox but don't need a decision. The
// roster publishes it as shared "crew.needs" so the status bar and the Inbox agree.
export function needsOf(all, ops) {
  const asks = all.reduce((n, s) => n + s.tabs.filter((x) => x.status === "blocked").length, 0);
  const approvals = ops?.approvals?.length ?? 0, stuck = Object.keys(ops?.stalled ?? {}).length;
  const proposals = ops?.proposals?.length ?? 0;
  return { count: asks + approvals + stuck + proposals, asks, approvals, stuck, proposals };
}
// A proposal from the Inbox: the panel opens on its tab with it in review.
export function openProposalPanel(p) {
  setShared("crew.panel", { ...panelState(), proposal: p.id });
  openPanel(p.kind === "mission" ? "mission" : "agents");
}

// Pals in sidebar order: the head pal, then pinned ones (in pin order),
// then whoever needs you most.
// ─── Pal groups and order (DeNon, 2026-11-08: groups like Grok Bot's, pins, free arranging) ────
//
// The pal list is split into named groups ("Personal", "Business", …) the owner makes, renames,
// orders and deletes; pals with no group are "Unassigned" (new pals land there). The head pal stays
// on top, outside the groups. Inside a group: pinned pals first (in pin order), then the order you
// gave them (dragging, or Move up / Move down), else who needs you most. All of it lives in shared
// "crew.marks" (saved by Herdr, so it survives restarts):
//   groups: [{id, name}] in order · pals[bot]: {pin, group, order} · arranged: {[group or "_"]: true}

export const palGroups = () => marks().groups ?? [];
export const groupOf = (bot) => { const g = marks().pals?.[bot?.id]?.group; return g && palGroups().some((x) => x.id === g) ? g : null; };
function saveMarks(m) { setShared("crew.marks", m); }
export function newGroup(name) {
  const m = marks();
  let id;
  do id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; while ((m.groups ?? []).some((g) => g.id === id));
  saveMarks({ ...m, groups: [...(m.groups ?? []), { id, name: String(name).trim() || "New group" }] });
  return id;
}
export function renameGroup(id, name) {
  const m = marks();
  saveMarks({ ...m, groups: (m.groups ?? []).map((g) => (g.id === id ? { ...g, name: String(name).trim() || g.name } : g)) });
}
// Deleting a group sends its pals back to Unassigned (nothing else about them changes).
export function deleteGroup(id) {
  const m = marks();
  const pals = Object.fromEntries(Object.entries(m.pals ?? {}).map(([k, v]) => [k, v.group === id ? { ...v, group: null } : v]));
  saveMarks({ ...m, groups: (m.groups ?? []).filter((g) => g.id !== id), pals });
}
export function moveGroup(id, dir) {
  const gs = [...palGroups()];
  const i = gs.findIndex((g) => g.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= gs.length) return false;
  [gs[i], gs[j]] = [gs[j], gs[i]];
  saveMarks({ ...marks(), groups: gs });
  return true;
}

// One group's rows in order (rows: [{space, bot}], all in that group).
function sortGroup(rows, gid) {
  const m = marks();
  const pals = m.pals ?? {};
  const arranged = Boolean((m.arranged ?? {})[gid ?? "_"]) || (!gid && m.palsArranged);
  const pin = (r) => pals[r.bot.id]?.pin;
  const ord = (r) => pals[r.bot.id]?.order;
  return [...rows].sort((x, y) => (pin(x) ? 0 : 1) - (pin(y) ? 0 : 1)
    || (pin(x) && pin(y) ? pin(x) - pin(y) : 0)
    || (arranged ? (ord(x) ?? 1e9) - (ord(y) ?? 1e9) : (STATUS_RANK[y.space.status] ?? 0) - (STATUS_RANK[x.space.status] ?? 0))
    || x.space.index - y.space.index);
}
// The pal list as sections: the head pal alone first (group: undefined), then each group in order,
// then Unassigned (group: null). `all` keeps empty groups (drop targets); Unassigned shows only when
// there are groups or it has pals.
export function palSections(rows, all = true) {
  const gs = palGroups();
  const known = new Set(gs.map((g) => g.id));
  const pals = marks().pals ?? {};
  const gidOf = (r) => { const g = pals[r.bot.id]?.group; return g && known.has(g) ? g : null; };
  const heads = rows.filter((r) => r.bot.god);
  const rest = rows.filter((r) => !r.bot.god);
  const out = [];
  if (heads.length) out.push({ group: undefined, rows: heads });
  for (const g of gs) {
    const mine = rest.filter((r) => gidOf(r) === g.id);
    if (mine.length || all) out.push({ group: g, rows: sortGroup(mine, g.id) });
  }
  const loose = rest.filter((r) => gidOf(r) === null);
  if (loose.length || (all && gs.length)) out.push({ group: null, rows: sortGroup(loose, null) });
  return out;
}
// Every pal in list order (the folded rail and anything that wants one flat list).
export const palOrder = (rows) => palSections(rows, false).flatMap((sec) => sec.rows);

// Put a pal into a group (null: Unassigned) just before another pal (or at the end), and make that
// group's order the one now shown. Pinned pals keep their pins, re-numbered to the new order.
export function placePal(bot, gid, beforeId = null) {
  if (!bot?.id || bot.god) return false;
  const rows = spaces().map((space) => ({ space, bot: botOf(space) })).filter((r) => !r.bot.god);
  const sec = palSections(rows).find((x) => (x.group?.id ?? null) === (gid ?? null));
  const seq = (sec?.rows ?? []).filter((r) => r.bot.id !== bot.id).map((r) => r.bot.id);
  const at = beforeId ? seq.indexOf(beforeId) : -1;
  seq.splice(at < 0 ? seq.length : at, 0, bot.id);
  const m = marks();
  const pals = { ...(m.pals ?? {}) };
  pals[bot.id] = { ...(pals[bot.id] ?? {}), group: gid ?? null };
  const base = Date.now();
  seq.forEach((id, i) => {
    const cur = { ...(pals[id] ?? {}) };
    if (cur.pin) cur.pin = base + i;
    cur.order = i;
    pals[id] = cur;
  });
  saveMarks({ ...m, pals, arranged: { ...(m.arranged ?? {}), [gid ?? "_"]: true } });
  return true;
}
export function setPalGroup(bot, gid) { return placePal(bot, gid, null); }
// Move up / Move down inside its group (the menu's; dragging does the same with placePal).
function neighbours(space) {
  const rows = spaces().map((s) => ({ space: s, bot: botOf(s) }));
  const me = rows.find((r) => r.space.id === space.id);
  if (!me || me.bot.god) return null;
  const sec = palSections(rows).find((x) => x.rows.some((r) => r.space.id === space.id));
  const i = sec.rows.findIndex((r) => r.space.id === space.id);
  return { me, sec, i };
}
export function canMovePal(space, dir) {
  const n = neighbours(space);
  if (!n) return false;
  const other = n.sec.rows[n.i + dir];
  const pinned = (r) => Boolean(marks().pals?.[r.bot.id]?.pin);
  return Boolean(other) && pinned(other) === pinned(n.me);
}
export function movePal(space, dir) {
  if (!canMovePal(space, dir)) return false;
  const { me, sec, i } = neighbours(space);
  const ids = sec.rows.map((r) => r.bot.id);
  const before = dir < 0 ? ids[i - 1] : ids[i + 2] ?? null;
  return placePal(me.bot, sec.group?.id ?? null, before);
}

// ─── Pocket pets (pets.js) ──────────────────────────────────────────────────────────────────
//
// Every pal shows as a pocket pet: a critter in LED dots inside a dark status tile, glowing in the
// pal's own colour (its look's colour, else the stock one colorOf picks). Its species comes from
// the record's `pet` ({species, acc, eyes}) or its name; what it wears from its brain (the head
// pal wears the crown). The tile shows one of eight states:
//
//   rest     asleep, or idle with nothing open         working  Herdr says working
//   ask      it needs you (Herdr's blocked)            done     finished while you weren't looking
//   stuck    working, but crewd says its screen hasn't changed in 15+ minutes (crew-health.json)
//   pr       idle, and its branch has an open PR       merged   idle, its PR merged in the last day
//   closing  idle, its PR closed unmerged in the last day (red, as the pocket-pet study draws it)
//
// The roster publishes stuck and PR state per space in shared "crew.petstate" (it reads crewd's
// health file and asks `gh` every two minutes). A record with `pet: "none"` keeps the stock
// mascot, and so does any pal until its tiles are on disk (ensurePets publishes "crew.pets").

export function petOf(bot) {
  // Every pal has a pet now; an old record's pet: "none" gets the default one.
  if (!bot) return null;
  const look = resolveLook(bot);
  return petSpec({ name: bot.name, god: bot.god, accessory: bot.god ? "crown" : accessory(bot.harness),
    color: look?.color ?? NAMED[colorOf(bot)] ?? colorOf(bot), pet: bot.pet });
}
export const petReady = (p) => (shared("crew.pets") ?? []).includes(petKey(p));

// Herdr mood (+ what the roster knows) → one of the eight tile states.
export function petState(bot, m) {
  const demo = (shared("crew.demo.states") ?? {})[bot?.name];
  if (PET_STATES.includes(demo)) return demo;
  if (m === "asleep") return "rest";
  const live = (shared("crew.petstate") ?? {})[bot?.space] ?? {};
  if (m === "blocked") return "ask";
  if (m === "working") return live.stuck ? "stuck" : "work";
  if (m === "done") return "done";
  return { open: "pr", merged: "merged", closed: "closing" }[live.pr] ?? "rest";
}

// One pet, w x h: "A · Faint + 1 · Lightsaber" (DeNon's pick, 2026-11-08). The pet is bare (just the
// critter, pets.js BARE_VIEW) at 96% of its box, centred a touch high, free to break the edge, on a
// faint container one step up from the page (#131316, a 7% white hairline, radius w/35). Its state
// shows on that hairline: tinted for done, asks you (breathing), PR open, merged, closing, stuck.
// Working: the paw taps, bits drift up, and a lightsaber runs round the edge (petSaber).
// opts.back: the colour behind the box, when it's fixed (the hero card, the banner): rounds the
// saber's corners. Without it (rows, which change colour on hover) the corners stay square; at
// those sizes the radius is 4 px and it doesn't show.
export const PET_BOX = "#131316";
const SAVED = "mods/crew-roster/icons";
// opts.open: no box at all (the Focus hero, hero v2): the open tiles, no edge, no saber.
export function petEl(p, state, w, h = Math.round(w * BARE_VIEW[3] / BARE_VIEW[2]), opts = {}) {
  const [bx, by, bw, bh] = BARE_VIEW;
  if (opts.open) return petOpen(p, state, w, h);
  const r = Math.max(4, Math.round(w / 35));
  const ph = Math.min(w * 0.96 * bh / bw, h * 0.96), pw = ph * bw / bh;
  const px = (w - pw) / 2, py = (h - ph) / 2 - h * 0.04;
  const tint = PET_TINT[state];
  const edge = tint && state !== "work" ? `${tint}66` : "#FFFFFF12";
  const box = div().relative().w(w).h(h).flex_none().rounded(r).bg(PET_BOX).border_1().border_color(edge);
  // Children are placed from the box's outer edge (Herdr places them inside its 1 px border).
  const at = (el, x, y, ew, eh) => el.absolute().left(x - 1).top(y - 1).w(ew).h(eh);
  if (state !== "work") {
    box.child(at(div(), px, py, pw, ph).child(image(petPath(p, state)).w(pw).h(ph)));
    // Asks you: a brighter edge breathes over the hairline.
    if (state === "ask") box.child(at(div(), 0, 0, w, h).rounded(r).border_1().border_color(tint).loop("opacity", { from: 0.15, to: 1, period: 1100 }));
    return box;
  }
  box.child(at(div(), px, py, pw, ph).child(image(petPath(p, "work")).w(pw).h(ph)))
    // The paw taps: its two frames cross-fade.
    .child(at(div(), px, py, pw, ph).loop("opacity", { from: 0, to: 1, period: 760 }).child(image(petPath(p, "work", 1)).w(pw).h(ph)));
  // Bits drift up off the laptop (bigger pets only). BITS is drawn on the full 172x135 tile, so it
  // is placed to line up with the bare crop.
  if (w >= 44) {
    const k = pw / bw, iw = PET_W * k, ih = PET_H * k, ix = px - bx * k, iy = py - by * k;
    box.child(at(div(), ix, iy, iw, ih).loop("top", { from: iy - 1, to: iy - 1 - ih * 0.16, period: 1700, easing: "ease-out" })
      .child(div().w(iw).h(ih).loop("opacity", { from: 1, to: 0, period: 1700, easing: "ease-out" }).child(image(BITS).w(iw).h(ih))));
  }
  return box.child(at(div(), 0, 0, w, h).child(petSaber(w, h, r, opts.back)));
}

function petOpen(p, state, w, h) {
  const [bx, by, bw, bh] = BARE_VIEW;
  const ph = Math.min(w * bh / bw, h), pw = ph * bw / bh, px = (w - pw) / 2, py = (h - ph) / 2;
  const at = (el, x, y, ew, eh) => el.absolute().left(x).top(y).w(ew).h(eh);
  const box = div().relative().w(w).h(h).flex_none();
  if (state !== "work") return box.child(at(div(), px, py, pw, ph).child(image(petPath(p, state, 0, true)).w(pw).h(ph)));
  box.child(at(div(), px, py, pw, ph).child(image(petPath(p, "work", 0, true)).w(pw).h(ph)))
    .child(at(div(), px, py, pw, ph).loop("opacity", { from: 0, to: 1, period: 760 }).child(image(petPath(p, "work", 1, true)).w(pw).h(ph)));
  const k = pw / bw, iw = PET_W * k, ih = PET_H * k, ix = px - bx * k, iy = py - by * k;
  return box.child(at(div(), ix, iy, iw, ih).loop("top", { from: iy, to: iy - ih * 0.16, period: 1700, easing: "ease-out" })
    .child(div().w(iw).h(ih).loop("opacity", { from: 1, to: 0, period: 1700, easing: "ease-out" }).child(image(BITS).w(iw).h(ih))));
}

// The lightsaber: a comet that laps the box's edge once every 1.6 s. Herdr can't blur, stroke a path
// or clip to a rounded shape, so it's faked: a comet-shaped sweep (pet-saber.svg, 14 slices fading
// as (1-i/40)^1.6, a 140° tail) turns about the box's centre (svg spin, native) and shows only through thin
// strips along the edges. Five rings of strips, each its own colour and strength, stack into a
// glow: two outside the edge (#2A6AFE, faint, the outer glow), two inside (#4C8DFF, the inner
// glow) and a 1.5-2 px white-blue core (#EAF2FF) with a shorter (100°) tail. The glow rings breathe
// (native opacity loop, 2.4 s); the core doesn't. Small pets get three rings (12 sweeps), big ones
// five (20). With a known backdrop, the corners are rounded: the core runs round each corner in its
// own small box, and covers in the backdrop's and the box's colour cut it to an arc.
function petSaber(w, h, r, back) {
  const big = w >= 120;
  const D = Math.ceil(Math.hypot(w, h)) + 24;
  const ring = (icon, color, band, outside) => {
    const sweep = (x, y, sw, sh) => div().absolute().left(x).top(y).w(sw).h(sh).overflow_hidden()
      .child(svg(icon).absolute().left(Math.round(w / 2 - D / 2 - x)).top(Math.round(h / 2 - D / 2 - y)).size(D).text_color(color).spin(1600));
    const b = band;
    const out = div().absolute().left(0).top(0).w(w).h(h);
    // Outside, the corner squares are left out, so the glow follows the rounded box.
    if (outside) return out.child(sweep(0, -b, w, b)).child(sweep(0, h, w, b)).child(sweep(-b, 0, b, h)).child(sweep(w, 0, b, h));
    return out.child(sweep(0, 0, w, b)).child(sweep(0, h - b, w, b)).child(sweep(0, b, b, h - 2 * b)).child(sweep(w - b, b, b, h - 2 * b));
  };
  const SABER = `${SAVED}/pet-saber.svg`, CORE = `${SAVED}/pet-saber-core.svg`;
  const glow = div().absolute().left(0).top(0).w(w).h(h).loop("opacity", { from: 0.55, to: 1, period: 2400 });
  if (big) glow.child(ring(SABER, "#2A6AFE0D", 6, true));
  glow.child(ring(SABER, "#2A6AFE24", 2, true));
  if (big) glow.child(ring(SABER, "#4C8DFF14", 10, false));
  glow.child(ring(SABER, "#4C8DFF40", big ? 4 : 2.5, false));
  const core = big ? 2 : 1.5;
  const layer = div().absolute().left(0).top(0).w(w).h(h).child(glow);
  if (!back || r < 6) return layer.child(ring(CORE, "#EAF2FF", core, false));
  // Rounded: straight core strips stop short of the corners; each corner gets an r x r box with the
  // core sweep, a quarter disc in the box colour over its inside and a cover in the backdrop colour
  // over its outside, leaving an arc `core` thick.
  const straight = (x, y, sw, sh) => div().absolute().left(x).top(y).w(sw).h(sh).overflow_hidden()
    .child(svg(CORE).absolute().left(Math.round(w / 2 - D / 2 - x)).top(Math.round(h / 2 - D / 2 - y)).size(D).text_color("#EAF2FF").spin(1600));
  layer.child(straight(r, 0, w - 2 * r, core)).child(straight(r, h - core, w - 2 * r, core))
    .child(straight(0, r, core, h - 2 * r)).child(straight(w - core, r, core, h - 2 * r));
  const q = r - core;
  for (const [c, x, y, qx, qy] of [["tl", 0, 0, core, core], ["tr", w - r, 0, 0, core], ["br", w - r, h - r, 0, 0], ["bl", 0, h - r, core, 0]]) {
    layer.child(straight(x, y, r, r))
      .child(svg(`${SAVED}/pet-qd-${c}.svg`).absolute().left(x + qx).top(y + qy).size(q).text_color(PET_BOX))
      .child(svg(`${SAVED}/pet-corner-${c}.svg`).absolute().left(x).top(y).size(r).text_color(back));
  }
  return layer;
}

// Draw the tiles that are missing for every pal (live and asleep), then publish which pets are
// ready. Cheap when nothing is (one directory listing). Returns how many pets were drawn.
export async function ensurePets(c = crew()) {
  const pets = new Map();
  const add = (b) => { const p = b && petOf(b); if (p) pets.set(petKey(p), p); };
  for (const sp of spaces()) add(botOf(sp, c));
  for (const b of c.bots) add({ ...b, harness: b.harness ?? null });
  const r = await exec("sh", ["-c", 'ls -1 "$1" 2>/dev/null; true', "sh", `${appHome()}/${PET_DIR}`]).catch(() => ({ stdout: "" }));
  const have = new Set(r.stdout.split("\n"));
  const name = (path) => path.split("/").pop();
  let drawn = 0;
  if (!have.has(name(BITS))) { try { await writeArt([[BITS, bitsSvg()]]); } catch {} }
  const ready = [];
  for (const [k, p] of pets) {
    const files = petFiles(p);
    if (!files.every(([path]) => have.has(name(path)))) {
      try { await writeArt(files); drawn++; } catch { continue; }
    }
    ready.push(k);
  }
  const before = shared("crew.pets") ?? [];
  if (ready.length !== before.length || ready.some((k) => !before.includes(k))) setShared("crew.pets", ready);
  return drawn;
}

// What the roster knows per space for the tiles: stuck (crewd's health file, by terminal) and the
// branch's PR state (`gh pr list --head <branch>`, on the space's machine, at most every 2 min per
// folder+branch; no gh, no repo or no PR: nothing). Published as shared "crew.petstate".
const prCache = new Map();   // "machine|folder|branch" → { at, pr }
export async function syncPetState(stalled = {}, all = spaces(), ps = panes()) {
  const out = {};
  const stuckTerms = new Set(Object.keys(stalled ?? {}));
  const now = Date.now();
  for (const sp of all) {
    const tabs = new Set(sp.tabs.map((x) => x.id));
    const mine = ps.filter((p) => tabs.has(p.tab));
    const stuck = mine.some((p) => p.terminal && stuckTerms.has(p.terminal));
    const lead = mine.find((p) => p.branch && p.cwd) ?? null;
    let pr = null;
    const branch = lead?.branch;
    if (branch && !["main", "master", "trunk", "develop", "HEAD"].includes(branch)) {
      const key = `${sp.machine ?? ""}|${lead.cwd}|${branch}`;
      let hit = prCache.get(key);
      if (!hit || now - hit.at > 120000) {
        hit = { at: now, pr: hit?.pr ?? null };
        prCache.set(key, hit);
        try {
          const r = await exec("gh", ["pr", "list", "--head", branch, "--state", "all", "--limit", "1", "--json", "state,mergedAt,closedAt"],
            { cwd: lead.cwd, on: sp.machine ?? undefined });
          const x = r.code === 0 ? JSON.parse(r.stdout || "[]")[0] : null;
          const recent = (at) => at && now - Date.parse(at) < 24 * 3600 * 1000;
          hit.pr = !x ? null : x.state === "OPEN" ? "open" : x.state === "MERGED" ? (recent(x.mergedAt) ? "merged" : null)
            : x.state === "CLOSED" ? (recent(x.closedAt) ? "closed" : null) : null;
        } catch { hit.pr = null; }
      }
      pr = hit.pr;
    }
    if (stuck || pr) out[sp.id] = { ...(stuck ? { stuck } : {}), ...(pr ? { pr } : {}) };
  }
  if (JSON.stringify(out) !== JSON.stringify(shared("crew.petstate") ?? {})) setShared("crew.petstate", out);
  return out;
}

// A tile state as words and a colour, for the state tags beside a pet (hero card, banner).
export const PET_WORDS = { rest: "resting", work: "working", ask: "asks you", done: "done", pr: "PR open", merged: "merged", closing: "closing", stuck: "stuck" };
// The tile's own state colour (its frame / strips / loader), so a tag always matches its pet.
const PET_TINT = { work: "#4C8DFF", ask: "#55D19F", done: "#55D19F", pr: "#3FBF78", merged: "#9466F0", closing: "#E0484F", stuck: "#D9982E" };
export function petColor(state, t = tone(theme())) {
  return PET_TINT[state] ?? t.dim;
}

// A "pebble" button (DeNon, after the Omarchy Recess plugin's Raised look, then "subtle and sleek"):
// one flat face a step above the surface, a hairline of white (6%) along its top and a 1 px darker
// line along its bottom for a hint of lift, a thin dark outline and GPUI's faintest shadow; 28 px tall,
// r7 (a rectangle, not a pill), 9 px side padding. Hover: the face a shade lighter. Press: a shade
// darker, nothing moves. `grow`: start from the label's width and share what's left (flex auto), so a
// label is only cut when the row really can't hold it. opts: { id, icon, label?, extra?, onClick(cx), tooltip?, grow? }.
const PEBBLE = { h: 28, r: 7 };
const pebbleState = { hover: null, down: null };
const PEBBLE_FACE = { rest: "#1B1B1E", hover: "#222226", down: "#151517" };
// The primary one (a dialog's Add / Hire / Create): the same build a step brighter, in steel blue.
const PEBBLE_PRIMARY = { rest: "#26364A", hover: "#2E425A", down: "#1E2B3B" };
export function pebble(d, { id, icon = null, label = null, extra = null, onClick, tooltip = null, grow = false, primary = false, disabled = false }) {
  const { h: H, r: R } = PEBBLE;
  const down = !disabled && pebbleState.down === id, hot = !disabled && pebbleState.hover === id;
  const faces = primary && !disabled ? PEBBLE_PRIMARY : PEBBLE_FACE;
  const ink = disabled ? d.fg4 : primary ? "#E3EEF9" : hot ? d.fg1 : d.body;
  return div().id(id).relative().h(H).flex_none().when(grow, (el) => el.flex_auto().min_w(0)).when(!disabled, (el) => el.cursor_pointer())
    .rounded(R).bg(faces[down ? "down" : hot ? "hover" : "rest"]).border_1().border_color("#00000080").shadow_xs()
    .when(Boolean(tooltip), (el) => el.tooltip(tooltip))
    .on_hover((on, cx) => { pebbleState.hover = on ? id : (pebbleState.hover === id ? null : pebbleState.hover); if (!on && pebbleState.down === id) pebbleState.down = null; cx.notify(); })
    .on_mouse_down("left", (_e, cx) => { pebbleState.down = id; cx.notify(); })
    .on_mouse_up("left", (_e, cx) => { if (pebbleState.down === id) pebbleState.down = null; cx.notify(); })
    .on_click((_e, cx) => { if (!disabled) onClick?.(cx); cx.notify(); })
    // The lift: a white hairline just inside the top edge, a darker one just inside the bottom
    // (both stop short of the corners), gone while pressed.
    .when(!down, (el) => el
      .child(div().absolute().top(0).left(R - 1).right(R - 1).h(1).bg(primary && !disabled ? "#FFFFFF1A" : "#FFFFFF0F"))
      .child(div().absolute().bottom(0).left(R - 1).right(R - 1).h(1).bg("#00000040")))
    .child(div().flex().size_full().items_center().justify_center().gap(6).overflow_hidden()
      .when(Boolean(label), (el) => el.px(9)).when(!label, (el) => el.w(H))
      .when(Boolean(icon), (el) => el.child(svg(`mods/crew-roster/icons/${icon}.svg`).size(12).flex_none().text_color(disabled ? d.fg4 : primary ? "#C9DCEF" : hot ? d.fg1 : d.iconOn)))
      .when(Boolean(label), (el) => el.child(div().min_w(0).truncate().text_size(12).line_height("16px").font_weight(500).text_color(ink).child(label)))
      .when(extra != null, (el) => el.child(div().flex_none().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(String(extra)))));
}

// ── Dialogs: "A · Compact sheet" (DeNon's pick, 2026-11-08) ──────────────────────────────────
// Every Project Pals dialog is built from these: a header row (the pal's pet with its aura, a
// 15/600 title, a 12 px #808082 line under it, a quiet ×), 32 px r6 fields on the inset colour, one
// row of compact 26 px selects instead of a settings form (a list opens under the row), and a
// footer with a hairline over it: a key hint on the left, Cancel and the primary action as pebbles.
const SHEET_X = 20;
export function sheet(d, id, handle, onKey) {
  return div().id(id).track_focus(handle).on_key_down(onKey).flex().flex_col().w_full().bg(d.bg1).text_color(d.fg1);
}
// The pal's pet, bare, over its aura (the sidebar's look), w wide; the stock mascot before its art.
export function sheetFace(bot, t, w = 56) {
  const p = petOf(bot);
  const h = Math.round(w * 108 / 138);
  if (!p || !petReady(p)) return div().flex_none().child(mascotEl(bot, mood(null, bot?.awake), 40, t));
  return div().relative().w(w).h(h).flex_none()
    .child(div().absolute().left(-10).top(-8).w(w + 20).h(h + 16).child(image("mods/crew-roster/icons/pet-aura-row.svg").w(w + 20).h(h + 16)))
    .child(div().absolute().left(0).top(0).child(petEl(p, petState(bot, bot?.awake ? "calm" : "asleep"), w, h, { open: true })));
}
export function sheetHeader(d, { face = null, title, sub = null, onClose, id = "sheet" }) {
  return div().flex().items_center().gap(12).px(SHEET_X).pt(16).pb(6)
    .when(Boolean(face), (el) => el.child(face))
    .child(div().flex().flex_col().flex_1().min_w(0).gap(2)
      .child(div().text_size(15).line_height("20px").font_weight(600).text_color(d.fg1).child(title))
      .when(Boolean(sub), (el) => el.child(div().truncate().text_size(12).line_height("16px").text_color(d.fg2).child(sub))))
    .child(div().id(`${id}-x`).size(24).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
      .hover((s) => s.bg(d.hover)).on_click(() => onClose())
      .child(svg("mods/crew-roster/icons/x.svg").size(11).text_color(d.fg3)));
}
export const sheetBody = () => div().flex().flex_col().gap(10).px(SHEET_X).pt(10).pb(14);
const stopPress = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
// A one-line field: `input` is an Input element; `prefix` a short mono mark ("#"); `trailing` any element.
export function sheetField(d, input, { prefix = null, trailing = null } = {}) {
  return stopPress(div().flex().h(32).items_center().gap(6).pl(10).pr(trailing ? 3 : 10).rounded(6).bg(d.inset).border_1().border_color(d.lineMid)
    .when(Boolean(prefix), (el) => el.child(div().flex_none().text_size(13).font_family(d.mono).text_color(d.fg4).child(prefix)))
    .child(div().flex_1().min_w(0).child(input))
    .when(Boolean(trailing), (el) => el.child(trailing)));
}
// A quiet multi-line box: `area` is a Textarea element.
export function sheetArea(d, area) {
  return stopPress(div().px(4).py(2).rounded(6).bg(d.inset).border_1().border_color(d.lineMid).child(area));
}
export const sheetRow = () => div().flex().flex_wrap().items_center().gap(6);
// A compact select: "Label value ▾" (▴ while its list is open). `face`: a small image before the value.
export function sheetSelect(d, id, { label, value, face = null, open = false, onClick }) {
  return div().id(id).flex().h(26).items_center().gap(6).px(8).rounded(6).cursor_pointer()
    .bg(open ? d.sel : d.raised).border_1().border_color(open ? d.lineStrong : d.line).hover((s) => s.border_color(d.lineMid))
    .on_click((_e, cx) => { onClick(cx); cx.notify(); })
    .child(div().flex_none().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(label))
    .when(Boolean(face), (el) => el.child(face))
    .child(div().min_w(0).truncate().text_size(12).line_height("16px").font_weight(500).text_color(d.body).child(value))
    .child(svg(`mods/crew-roster/icons/${open ? "chevron-down" : "chevron-right"}.svg`).size(10).flex_none().text_color(d.fg3));
}
// An on/off select: "Label" and a small r3 switch.
export function sheetToggle(d, id, { label, on, onClick }) {
  return div().id(id).flex().h(26).items_center().gap(8).px(8).rounded(6).cursor_pointer()
    .bg(d.raised).border_1().border_color(d.line).hover((s) => s.border_color(d.lineMid))
    .on_click((_e, cx) => { onClick(cx); cx.notify(); })
    .child(div().text_size(12).line_height("16px").font_weight(500).text_color(d.body).child(label))
    .child(div().flex().w(24).h(14).p(2).rounded(3).bg(on ? d.info : d.ctl).when(on, (el) => el.justify_end())
      .child(div().size(10).rounded(2).bg(on ? d.fg1 : d.fg2)));
}
// The list a select opens, under the row.
export function sheetPanel(d, id) {
  return div().id(id).flex().flex_col().gap(1).p(4).max_h(180).overflow_y_scrollbar().rounded(6).bg(d.raised).border_1().border_color(d.line);
}
export function sheetOption(d, id, { on = false, left = null, label, sub = null, onClick }) {
  return div().id(id).flex().h(30).flex_none().items_center().gap(10).px(8).rounded(4).cursor_pointer()
    .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
    .on_click((_e, cx) => { onClick(cx); cx.notify(); })
    .when(Boolean(left), (el) => el.child(left))
    .child(div().flex_1().min_w(0).truncate().text_size(13).line_height("16px").text_color(d.fg1).child(label))
    .when(Boolean(sub), (el) => el.child(div().flex_none().text_size(11).line_height("14px").text_color(d.fg3).child(sub)))
    .when(on, (el) => el.child(svg("mods/crew-roster/icons/check.svg").size(12).flex_none().text_color(d.info)));
}
export function sheetFooter(d, { hint = "", id = "sheet", onCancel, cancelLabel = "Cancel", primary, ready = true, onPrimary }) {
  return div().flex().items_center().justify_between().gap(12).px(SHEET_X).py(12).border_t_1().border_color(d.lineSoft)
    .child(div().min_w(0).truncate().text_size(11).line_height("14px").text_color(d.fg4).child(hint))
    .child(div().flex().gap(8).flex_none()
      .child(pebble(d, { id: `${id}-cancel`, label: cancelLabel, onClick: () => onCancel() }))
      .when(Boolean(primary), (el) => el.child(pebble(d, { id: `${id}-go`, label: primary, primary: true, disabled: !ready, onClick: (cx) => onPrimary(cx) }))));
}

// Is a task this pal's? Its assignee or claimer is "Pal" or "Pal#channel" (pal names can have " - "
// in them, so only the "#" splits).
export function taskFor(task, palName) {
  const who = (x) => String(x ?? "").split("#")[0].trim().toLowerCase();
  const me = String(palName ?? "").trim().toLowerCase();
  return Boolean(me) && (who(task.assignee) === me || who(task.claimed_by) === me);
}

// The pal chip in the header: its pet (30x24), name (13/600), a blue dot while its channel works,
// and a ▾: a click opens the pal menu (crew-palmenu: the agent and its project; channels are the
// hero's). h30.
// Dates and numbers without Intl (Herdr's JS has no locale data: toLocaleDateString's options are
// ignored and toLocaleString adds no separators).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const shortDate = (ms, weekday = false) => { const d = new Date(ms); return `${weekday ? WEEKDAYS[d.getDay()] + " " : ""}${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export const shortTime = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const num = (n) => String(Math.round(n ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function palChip(bot, tab, d) {
  const live = bot.awake && tab?.status === "working";
  return div().id("crew-chip").flex().flex_none().items_center().h(30).pl(4).pr(8).gap(8)
    .rounded(d.r.sm).bg(d.raised).border_1().border_color(d.lineMid)
    .cursor_pointer().hover((s) => s.border_color(d.lineStrong)).tooltip("Profile, mission, memory…")
    // The bar under it drags the window, so stop the press.
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openPalMenu(bot.space); })
    .child(mascotEl(bot, mood(tab?.status, bot.awake || bot.starting), 30))
    .child(div().text_size(13).font_weight(600).text_color(d.fg1).child(bot.name))
    .when(live, (el) => el.child(div().size(6).rounded(3).bg(d.info)))
    .child(svg("mods/crew-roster/icons/ds-chevron-down.svg").size(11).flex_none().text_color(d.fg3));
}

export { petScreen };
// A row's time: "21:48" today, the weekday within a week ("Fri"), else "Nov 2".
export function stamp(ms) {
  if (!ms) return "";
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (now - d < 6 * 86400000) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
// The state tag beside a pal's name (the boards' "Working" tag): r3, 20 px, a 6 px dot, 11/500,
// tinted with its tile's state colour (12% fill, 28% edge); resting and asleep are neutral.
export const TAG_WORDS = { rest: "Resting", work: "Working", ask: "Asks you", done: "Done", pr: "PR open", merged: "Merged", closing: "Closing", stuck: "Stuck" };
export function stateTag(state, d, asleep = false) {
  const c = state === "rest" ? null : state === "work" ? d.info : petColor(state);
  const text = state === "work" ? d.infoText : c ?? d.fg2;
  return div().flex().flex_none().items_center().gap(6).h(20).px(6).rounded(d.r.xs)
    .bg(c ? c + "1F" : d.raised).border_1().border_color(c ? c + "47" : d.line)
    .child(div().size(6).flex_none().rounded(3).bg(c ?? d.fg4))
    .child(div().text_size(11).line_height("14px").font_weight(500).text_color(text).child(asleep && state === "rest" ? "Asleep" : TAG_WORDS[state]));
}

// The shown pal's channels as a dropdown (crew-pick): from the pal chip and the hero's "+N".
export function openChannels(spaceId) {
  return openOverlay({ mod: "crew-pick", kind: "popup", frame: "none", width: 420, props: { space: spaceId } });
}

// What a terminal's title says it's on (agents set it to the task), or null when it says nothing:
// empty, the agent's own name ("Claude Code"), a shell, or just the pal's or channel's name.
export function taskTitle(raw, ...names) {
  const title = String(raw ?? "").replace(/^[^\p{L}\p{N}\[(]+/u, "").trim();
  if (!title || /^(claude|claude code|codex|grok|gemini|opencode|bash|zsh|fish|sh)$/i.test(title)) return null;
  const same = (x) => x && title.toLowerCase() === String(x).replace(/^#/, "").trim().toLowerCase();
  return names.some(same) ? null : title;
}

// Is an agent running in this channel? A channel can be just a shell (its agent ended, or it never
// started one): say so wherever a channel is named, so a bare prompt never passes for a pal.
export const tabHasAgent = (tab, all = panes()) => Boolean(tab) && all.some((p) => p.tab === tab.id && p.program?.agent);
export function noAgentTag(d) {
  return div().flex().flex_none().items_center().h(18).px(5).rounded(d.r.xs).border_1().border_color(d.line)
    .child(div().text_size(10.5).line_height("14px").text_color(d.fg3).child("no agent"));
}

// Split the shown channel's terminal (the header's buttons): right and down,
// as Herdr's own Ctrl+Shift+O / Ctrl+Shift+E. A new pane is a shell in the channel's folder and
// belongs to that channel; the channel's agent stays its lead pane (leadPane prefers the agent).
export function splitButtons(d) {
  const hint = (action, fallback) => {
    const k = keys().find((x) => x.action === action);
    return k ? k.keys.split("-").map((p) => p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join("+") : fallback;
  };
  const btn = (id, icon, tip, direction) => div().id(id).size(26).flex().flex_none().items_center().justify_center().rounded(d.r.sm)
    .cursor_pointer().tooltip(tip).hover((s) => s.bg(d.hover))
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); run("pane.split", { direction }); })
    .child(svg(`mods/crew-roster/icons/${icon}.svg`).size(14).text_color(d.fg2));
  return div().flex().flex_none().items_center().gap(2)
    .child(btn("split-right", "panel-right", `Split right (${hint("pane.split:right", "Ctrl+Shift+O")})`, "right"))
    .child(btn("split-down", "ds-split-down", `Split down (${hint("pane.split:down", "Ctrl+Shift+E")})`, "down"));
}

// ─── Updates (DeNon, 2026-11-08: a quiet "Update available" pill, a small dialog, no nagging) ───
//
// `pal update check|apply|rollback` does the work (crewupdate.py): GitHub's latest release, its
// tarball checked against SHA256SUMS, a snapshot for Roll back, the installer. The app reads:
//   data/crew-install.json      what's installed (version)
//   data/crew-update.json       the last check (latest, notes, url, checked)
//   data/crew-update-run.json   an install as it goes: running (step) → done | failed (error)
// "Later" hides the pill for that version for 3 days (shared "crew.update.later").

export const UPDATE_CHECK_EVERY = 6 * 3600;    // seconds; the same as crewupdate.CHECK_EVERY
const vparts = (v) => (String(v ?? "0").match(/\d+/g) ?? []).concat(["0", "0", "0"]).slice(0, 3).map(Number);
export function verNewer(x, y) {
  const p = vparts(x), q = vparts(y);
  for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] > q[i];
  return false;
}
export async function readUpdate() {
  const d = `${appHome()}/data`;
  const read = async (f) => { try { return JSON.parse((await readTextFile(`${d}/${f}`)) ?? "{}") ?? {}; } catch { return {}; } };
  const [ins, st, run] = await Promise.all([read("crew-install.json"), read("crew-update.json"), read("crew-update-run.json")]);
  // A run that stopped reporting for 15 minutes died with its process (a crash, a reboot).
  const live = run.state === "running" && Date.now() / 1000 - (run.at ?? 0) < 15 * 60;
  return {
    current: ins.version ?? null, latest: st.latest ?? null, checked: st.checked ?? 0, notes: st.notes ?? "",
    url: st.url ?? null, published: st.published ?? null, repo: ins.repo ?? st.repo ?? null,
    available: Boolean(st.latest && ins.version && verNewer(st.latest, ins.version)),
    run: run.state ? { ...run, state: run.state === "running" && !live ? "failed" : run.state,
      error: run.state === "running" && !live ? "The update stopped without finishing. Roll back puts the previous version back." : run.error } : null,
  };
}
export function updateLater(version) { setShared("crew.update.later", { version, until: Date.now() + 3 * 86400 * 1000 }); }
export function updateSnoozed(version) {
  const l = shared("crew.update.later");
  return Boolean(l && l.version === version && Date.now() < l.until);
}
// A release's notes as highlights: "- **Headline.** detail" bullets (continuation lines joined),
// up to `max`; plain bullets keep their text as the headline.
export function noteHighlights(md, max = 6) {
  const out = [];
  let cur = null;
  for (const raw of String(md ?? "").split("\n")) {
    if (/^#{1,6}\s/.test(raw) && out.length + (cur ? 1 : 0) > 0 && /fixed/i.test(raw)) break;
    const m = raw.match(/^\s*[-*]\s+(.*)$/);
    if (m) { if (cur) out.push(cur); cur = m[1]; }
    else if (cur && /^\s{2,}\S/.test(raw)) cur += " " + raw.trim();
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.slice(0, max).map((s) => {
    const b = s.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    return b ? { head: b[1].replace(/[.:]$/, ""), detail: b[2] } : { head: s.replace(/\*\*/g, ""), detail: "" };
  });
}
// The pal command, with the app's environment (HERDR_APP_HOME etc.), left running on its own: an
// update reinstalls this very mod, so the dialog reads crew-update-run.json rather than awaiting it.
export function updateStart(kind = "apply") {
  return exec("sh", ["-c", 'nohup "$1" update "$2" --json >/dev/null 2>&1 &', "sh", `${home()}/.local/bin/pal`, kind]);
}
