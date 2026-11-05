// Project Pals: shared model for the crew-* mods. install.sh copies this file into each mod as ./crew.js.
//
// Every Herdr space is a pal: a project with a brain. Its tabs are its channels, each a clone
// with its own terminal on the space's machine. The brain is whatever agent harness runs in the
// space (Claude Code, Codex, Grok, ...), read live from Herdr; a space with no agent is asleep.
// Project Pals keeps only what Herdr doesn't, keyed by space id: role, categories, briefs, memory, color.
// Status (and so the mascot's face) is Herdr's own agent status.

import { div, image } from "gpui-kit";
import { spaces, shared, setShared, panes, theme, run, layout, exec, hc, appHome, home, readTextFile, knownAgents, notify } from "herdr";

import { lookPath, lookFiles, lookKey, LOOK_DIR, NAMED } from "./mascot-art.js";


// Settings (data/crew-settings.json, mirrored into shared "crew.settings" by the roster): who the
// pals work for, and whether new pals start with permissions bypassed.
export const owner = () => shared("crew.settings")?.owner || "you";
export const bypassOn = () => Boolean(shared("crew.settings")?.bypass);
// The head pal's name (About → Settings, or `pal settings head`).
export const headName = () => shared("crew.settings")?.head || "Orchestrator";
export async function syncSettings() {
  let s = {};
  try { s = JSON.parse((await readTextFile(`${appHome()}/data/crew-settings.json`)) ?? "{}"); } catch { s = {}; }
  if (JSON.stringify(s) !== JSON.stringify(shared("crew.settings") ?? {})) setShared("crew.settings", s);
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
const accOf = (bot) => (bot.god ? "crown" : accessory(bot.harness));

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
// A custom look (the record's `look`: color, shape, accessory) with its accessory decided: "auto"
// follows the brain (or the crown, for the head pal). null: the stock mascot.
export function resolveLook(bot) {
  const l = bot?.look;
  if (!l) return null;
  return { color: l.color ?? NAMED[colorOf(bot)] ?? colorOf(bot), shape: l.shape ?? "folder", accessory: !l.accessory || l.accessory === "auto" ? accOf(bot) : l.accessory };
}
// Every mascot is drawn on demand (mascot-art.js) into data/crew-mascots: a pal's own look, or its
// stock one (its color, the folder shape, its brain's accessory). layer: full, "body" or "eyes".
export const stockLook = (bot) => ({ color: NAMED[colorOf(bot)] ?? colorOf(bot), shape: "folder", accessory: accOf(bot) });
export const harnessLook = (harness, color) => ({ color: NAMED[color ?? HARNESS_COLOR[harness] ?? "slate"] ?? color, shape: "folder", accessory: accessory(harness) });
export const godLook = { color: NAMED.pearl, shape: "folder", accessory: "crown" };
function art(bot, m, layer) { return lookPath(resolveLook(bot) ?? stockLook(bot), m, layer); }
export const mascotFor = (bot, m) => art(bot, m);

// Write a look's SVGs (all moods and layers, or what `files` lists) under the app home.
export async function writeArt(files) {
  if (!files.length) return;
  const r = await exec("sh", ["-c", 'cd "$1" && shift && while [ $# -gt 1 ]; do mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1" || exit 1; shift 2; done',
    "sh", appHome(), ...files.flat()]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "couldn't draw the mascot");
}
export const writeLook = (look) => writeArt(lookFiles(look));

// Draw what's missing: every pal's look (live and asleep), each harness's, and the head pal's.
// Cheap when nothing is (one directory listing). Returns how many looks were drawn.
export async function ensureLooks(c = crew()) {
  const looks = new Map();
  const add = (l) => looks.set(lookKey(l), l);
  for (const sp of spaces()) { const b = botOf(sp, c); add(resolveLook(b) ?? stockLook(b)); }
  for (const b of c.bots) add(resolveLook(b) ?? stockLook(b));
  for (const h of [...Object.keys(ACCESSORY), "other", null]) add(harnessLook(h));
  add(godLook);
  const r = await exec("sh", ["-c", 'ls -1 "$1" 2>/dev/null; true', "sh", `${appHome()}/${LOOK_DIR}`]).catch(() => ({ stdout: "" }));
  const have = new Set(r.stdout.split("\n"));
  const done = (l) => have.has(lookPath(l, "calm").split("/").pop()) && have.has(lookPath(l, "asleep", "eyes").split("/").pop());
  const ready = [];
  let drawn = 0;
  for (const l of looks.values()) {
    if (!done(l)) {
      try { await writeLook(l); drawn++; } catch { continue; }
    }
    ready.push(lookKey(l));
  }
  // Every Project Pals mod shows a face only once its art is on disk (an image that failed to load
  // once isn't tried again), so publish which are.
  const before = shared("crew.art") ?? [];
  if (ready.length !== before.length || ready.some((k) => !before.includes(k))) setShared("crew.art", ready);
  return drawn;
}
// A living mascot. Working: the body bobs, the eyes wander on two out-of-step loops, and an emote
// cycles over its head. Needs you: it bounces to get your attention. Otherwise it holds still.
// Every motion is native (.loop/.frames), runs only while drawn, and never re-renders the mod.
const EMOTES = ["…", "✦", "♪", "?", "✧", "…", "!"];
// Is a look's art on disk yet? (ensureLooks in the roster draws it and says so.) Custom looks being
// edited in the Look dialog are drawn by the dialog itself, which checks on its own.
export const artReady = (look) => (shared("crew.art") ?? []).includes(lookKey(look));

export function mascotEl(bot, m, size, t = tone(theme())) {
  if (!artReady(resolveLook(bot) ?? stockLook(bot))) return div().w(size).h(size).flex_none();
  const still = image(art(bot, m)).w(size).h(size).flex_none();
  if (m !== "working" && m !== "blocked") return still;
  const s = size, layer = (el) => el.absolute().top(0).left(0).w(s).h(s);
  const eyes = layer(div()).loop("top", { from: -s * 0.025, to: s * 0.03, period: 3700 })
    .child(layer(image(art(bot, m, "eyes")))
      .loop("left", { from: -s * (m === "working" ? 0.075 : 0.03), to: s * (m === "working" ? 0.075 : 0.03), period: m === "working" ? 2600 : 900 }));
  const body = layer(div())
    .loop("top", m === "working" ? { from: s * 0.02, to: -s * 0.05, period: 1400 } : { from: 0, to: -s * 0.12, period: 620 })
    .child(layer(image(art(bot, m, "body"))))
    .child(eyes);
  const root = div().relative().w(s).h(s).flex_none().child(body);
  if (m === "working" && s >= 22) {
    root.child(div().absolute().top(-s * 0.32).left(s * 0.72).text_size(Math.max(9, Math.round(s * 0.34)))
      .text_color(t.working).font_family("JetBrains Mono").frames(EMOTES, 850).child("…"));
  }
  return root;
}

// A mascot for a harness alone (hire and channel dialogs), and the head pal's.
export const mascot = (harness, m, color) => lookPath(harnessLook(harness, color), m);
export const godMascot = (m) => lookPath(godLook, m);

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
export function showRoom(id) { setShared("crew.room", id); run("layout.select", { stack: "center", child: "room-view" }); }
export function showTabs() { if (roomMode()) run("layout.select", { stack: "center", child: chatPref(activeTabId()) ? "chat-view" : "tab-view" }); }

// Chat view or terminal, per channel (shared "crew.chat": { tabId: true } for chat). Terminal is the default.
const activeTabId = () => spaces().find((s) => s.active)?.tabs.find((x) => x.active)?.id ?? null;
export const chatPref = (tabId) => Boolean(tabId && (shared("crew.chat") ?? {})[tabId]);
export function setChatPref(tabId, on) {
  if (!tabId) return;
  const prefs = { ...(shared("crew.chat") ?? {}) };
  if (on) prefs[tabId] = true; else delete prefs[tabId];
  setShared("crew.chat", prefs);
  syncCenter();
}
// Show what the shown channel wants (chat or terminal), unless a room is shown.
export function syncCenter(linked = true) {
  const active = findNode(layout(), "center")?.active;
  if (active === "room-view") return;
  const want = chatPref(activeTabId()) && linked ? "chat-view" : "tab-view";
  if (active !== want) run("layout.select", { stack: "center", child: want });
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
    const argv = withBypass(brain.key, brain.run);
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
  const beat = await read("crew-daemon.json", {});
  // An update waiting? (crewd checks once a day; About checks on demand.)
  const ins = await read("crew-install.json", {}), upd = await read("crew-update.json", {});
  const vt = (v) => (String(v ?? "0").match(/\d+/g) ?? []).concat(["0", "0", "0"]).slice(0, 3).map(Number);
  const [p, q] = [vt(upd.latest), vt(ins.version)];
  const newer = Boolean(upd.latest) && (p[0] - q[0] || p[1] - q[1] || p[2] - q[2]) > 0;
  return {
    update: { current: ins.version ?? null, latest: upd.latest ?? null, available: newer },
    approvals: approvals.filter((x) => x.status === "pending").sort((x, y) => x.at - y.at),
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
