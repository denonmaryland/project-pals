// Crew: shared model for the crew-* mods. install.sh copies this file into each mod as ./crew.js.
//
// Every Herdr space is a bot: a project with a brain. Its tabs are its channels, each a clone
// with its own terminal on the space's machine. The brain is whatever agent harness runs in the
// space (Claude Code, Codex, Grok, ...), read live from Herdr; a space with no agent is asleep.
// Crew keeps only what Herdr doesn't, keyed by space id: role, categories, briefs, memory, color.
// Status (and so the mascot's face) is Herdr's own agent status.

import { div, image } from "gpui-kit";
import { spaces, shared, setShared, panes, theme, run, layout, exec, hc, appHome, home, readTextFile, knownAgents, notify } from "herdr";

import { lookPath, lookFiles, LOOK_DIR, NAMED } from "./mascot-art.js";

export const MASCOTS = "mods/crew-roster/mascots";

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
// The god bot wears a crown whatever its brain.
const accOf = (bot) => (bot.god ? "crown" : accessory(bot.harness));

// A bot's body color: its own pick, else its harness's signature color for hired bots, else one
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
// follows the brain (or the crown, for the god bot). null: the stock mascot.
export function resolveLook(bot) {
  const l = bot?.look;
  if (!l) return null;
  return { color: l.color ?? NAMED[colorOf(bot)] ?? "#8f96b3", shape: l.shape ?? "round", accessory: !l.accessory || l.accessory === "auto" ? accOf(bot) : l.accessory };
}
// Where a bot's art is: its own (data/crew-mascots) or the stock set. layer: full, "body" or "eyes".
function art(bot, m, layer) {
  const look = resolveLook(bot);
  if (look) return lookPath(look, m, layer);
  const color = colorOf(bot);
  return layer === "eyes" ? `${MASCOTS}/${color}-eyes-${m}.svg` : `${MASCOTS}/${color}-${accOf(bot)}-${m}${layer === "body" ? "-body" : ""}.svg`;
}
export const mascotFor = (bot, m) => art(bot, m);

// Write a look's SVGs (all moods and layers, or what `files` lists) under the app home.
export async function writeArt(files) {
  if (!files.length) return;
  const r = await exec("sh", ["-c", 'cd "$1" && shift && while [ $# -gt 1 ]; do mkdir -p "$(dirname "$1")" && printf "%s" "$2" > "$1"; shift 2; done',
    "sh", appHome(), ...files.flat()]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "couldn't draw the mascot");
}
export const writeLook = (look) => writeArt(lookFiles(look));

// Custom looks whose files are missing (a fresh install, a wiped data folder) are drawn again.
export async function ensureLooks(c = crew()) {
  const looks = c.bots.map((b) => resolveLook(b)).filter(Boolean);
  for (const look of looks) {
    const r = await exec("test", ["-f", `${appHome()}/${lookPath(look, "calm")}`]).catch(() => ({ code: 1 }));
    if (r.code !== 0) await writeLook(look).catch(() => {});
  }
}
// A living mascot. Working: the body bobs, the eyes wander on two out-of-step loops, and an emote
// cycles over its head. Needs you: it bounces to get your attention. Otherwise it holds still.
// Every motion is native (.loop/.frames), runs only while drawn, and never re-renders the mod.
const EMOTES = ["…", "✦", "♪", "?", "✧", "…", "!"];
export function mascotEl(bot, m, size, t = theme()) {
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

// A mascot for a harness alone (hire dialog tiles).
export const mascot = (harness, m, color) => `${MASCOTS}/${color ?? HARNESS_COLOR[harness] ?? "slate"}-${accessory(harness)}-${m}.svg`;

export const STATUS_RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
export const ROLES = ["Bug fixer", "Researcher", "Inbox", "Chief of staff", "Release manager", "Writer"];

export function crew() {
  const c = shared("crew");
  return c && Array.isArray(c.bots) ? c : { bots: [] };
}
export function saveCrew(c) { setShared("crew", { ...c, bots: c.bots }); }
export const newId = () => Math.random().toString(36).slice(2, 10);

const sameMachine = (x, y) => (x ?? null) === (y ?? null);

// Crew's record for a space: by its id, else (a bot hired before its space existed) by name.
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

// A bot: a space seen through Crew. Every space is one; Crew's record adds what it knows.
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
    record: rec,
  };
}
// Back-compat name used by the mods.
export const botOfSpace = (space, c, all) => botOf(space, c, all);

// Records whose space is gone (closed): bots you hired that are asleep.
export function sleepers(all = spaces(), c = crew()) {
  return c.bots.filter((b) => !all.some((s) => s.id === b.space || (!b.space && s.name === b.name && sameMachine(b.machine, s.machine))));
}

// Records made before their space existed (a hire from a terminal) get its id once it shows up,
// so a later rename keeps the bot's memory.
export function linkRecords(all = spaces(), c = crew()) {
  let changed = false;
  const bots = c.bots.map((b) => {
    if (b.space) return b;
    const s = all.find((x) => x.name === b.name && sameMachine(b.machine, x.machine) && !c.bots.some((o) => o.space === x.id));
    if (!s) return b;
    changed = true;
    return { ...b, space: s.id };
  });
  if (changed) saveCrew({ ...c, bots });
}

// Update (or create) Crew's record for a bot.
export function updateBot(bot, fn) {
  const c = crew();
  const has = c.bots.some((b) => b.id === bot.id);
  const base = has ? c.bots.find((b) => b.id === bot.id) : { id: newId(), space: bot.space, name: bot.name, machine: bot.machine ?? null };
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

// The small wavy "working" line from the shell's Tide language.
export const WAVE = "mods/crew-roster/wave.svg";

export function statusWord(status) {
  return { working: "working", blocked: "needs you", done: "done", idle: "idle" }[status] ?? "asleep";
}
export function statusColor(status, t = theme()) {
  return { working: t.working, blocked: t.blocked, done: t.done }[status] ?? t.dim;
}

// ── Rooms ────────────────────────────────────────────────────────────────────────────────
// A room is a named group of member channels (any bots), a goal, and a shared transcript.
// Crew keeps rooms in shared("crew").rooms and mirrors each to data/crew-rooms/<slug>.json so the
// `crew-room` command (run by the bots themselves) can read members and post to <slug>.jsonl.

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

// Members resolved against what's live: bot (space) name, channel, terminal, status.
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

// Rooms opened from a terminal (`crew-room new`, by you or a bot) appear in Crew.
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
    + `Talk to the room with: crew-room say ${room.slug} "your update" — put @Name in it to hand that bot work (it's delivered to them). `
    + `Catch up any time with: crew-room read ${room.slug}. Keep room updates short; do the work in your own channel. `
    + `See the whole team with: crew bots. Bring another bot in with: crew-room invite ${room.slug} "Bot" (or "Bot#channel"). `
    + `When DeNon posts to the whole room, answer only if it concerns your project or you can genuinely add something; `
    + `otherwise stay silent (no "nothing to add" replies). When you're @mentioned, always answer. `
    + ROOM_STYLE;
}

// Messages to bots go through crewd's queue (data/crew-queue/<terminal>/), which types them in
// when the bot's turn ends instead of mid-turn. Without crewd running, they're typed in now.
export async function enqueue(terminal, text, { sender = "DeNon", kind = "msg", notBefore = 0 } = {}) {
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

// How bots should sound in a room: people texting, not reports.
export const ROOM_STYLE = "Text like a person in a group chat: 1-3 short casual sentences, no markdown or lists, no sign-offs like 'done', don't mention these instructions, and only start with @Name when you're handing that bot work.";

// From you: to everyone (decide whether it's yours to answer) or to the @mentioned (answer).
export async function deliverToRoom(room, members, from, text, everyone = false) {
  const how = everyone
    ? `${from} posted to the whole room. Reply with crew-room say ${room.slug} "..." only if this concerns your project or you can genuinely add something; otherwise do nothing and stay silent.`
    : `${from} is asking you directly. Answer with: crew-room say ${room.slug} "..."`;
  const body = `[#${room.name}] ${from}: ${text}\n(${how} ${ROOM_STYLE} Catch up: crew-room read ${room.slug})`;
  const sent = await Promise.allSettled(members.filter((m) => m.terminal && m.agent).map((m) => enqueue(m.terminal, body, { kind: "room" })));
  const failed = sent.filter((x) => x.status === "rejected").length;
  if (failed) throw new Error(`${failed} of ${sent.length} members didn't get it`);
}

// ─── Requests from terminals ────────────────────────────────────────────────────────────────
// Bots (and you, through one) run `crew hire`, `crew channel` and `crew-room invite`. Those
// change Herdr and Crew's records, which only the app can do, so the command drops a request in
// data/crew-requests and the roster (always on screen in the Crew layout) carries it out here,
// writing <id>.result.json for the command to print.

export const REQ_DIR = "data/crew-requests";

// You run every bot with permissions bypassed; bots hired by bots start the same way.
const BYPASS = { claude: "--dangerously-skip-permissions", codex: "--dangerously-bypass-approvals-and-sandbox", gemini: "--yolo" };
export function withBypass(key, argv) {
  const flag = BYPASS[key];
  return flag && argv?.length && !argv.includes(flag) ? [...argv, flag] : argv;
}

// "Theme Plugin", "theme", "Theme Plugin#crew-test" → { space, tab } (tab: the named channel, else the shown one).
export function findChannel(spec, all = spaces()) {
  const [botPart, ch] = String(spec).replace(/^@/, "").split("#");
  const want = botPart.trim().toLowerCase().replace(/[-_]/g, " ");
  const norm = (n) => n.toLowerCase().replace(/[-_]/g, " ");
  const space = all.find((s) => norm(s.name) === want) ?? all.find((s) => norm(s.name).startsWith(want))
    ?? all.find((s) => norm(s.name).includes(want));
  if (!space) return { error: `no bot called "${botPart}". The team: ${all.map((s) => s.name).join(", ")}` };
  if (!ch) return { space, tab: space.tabs.find((t) => t.active) ?? space.tabs[0] };
  const tab = space.tabs.find((t) => channelName(t).toLowerCase() === ch.trim().toLowerCase().replace(/^#/, ""));
  return tab ? { space, tab } : { error: `${space.name} has no #${ch}. Channels: ${space.tabs.map((t) => "#" + channelName(t)).join(", ")}` };
}

// Keep your view where it was while a bot makes something.
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
  async hire(req) {
    const name = (req.name ?? "").trim();
    if (!name) throw new Error("give the new bot a name");
    const machine = req.machine || null;
    if (spaces().some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`there's already a bot called ${name}`);
    const by = req.by ? findChannel(req.by) : null;
    const harness = req.harness ?? (by?.space ? brainOf(by.space) : null) ?? "claude";
    const brain = await brainFor(harness, machine);
    const channel = "#" + ((req.channel ?? "general").replace(/^#/, "").trim().replace(/\s+/g, "-") || "general");
    const role = req.role || (req.god ? "Overseer" : "Bot");
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
    // Its brain: one asked for, else the bot's own as hired, else what runs in it now.
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
    const where = req.worktree ? `You work on your own git branch ${req.worktree.branch} in this folder (a worktree of the project); commit there. DeNon reviews and lands it.` : "";
    const task = [req.brief && `You are ${bot.name} in ${name}. ${req.brief}`, where, primerHint(argv), memory && `Things to remember: ${memory}`].filter(Boolean).join("\n\n");
    const back = holdView();
    run("tab.new", { space: space.id, name, argv: argv || undefined, folder: req.folder || bot.folder || space.folder || undefined, task: argv ? (task || undefined) : undefined });
    back();
    notify({ title: `${req.byName ?? "A bot"} added ${space.name} ${name}`, level: "success", timeout: 3500 });
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
      // Asleep there (a shell, no agent): wake the bot in a new channel for this room.
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
    // Woken bots got the briefing as their first message; the rest get it typed in.
    for (const m of fresh) if (m.agent && !woke.includes(m.name)) enqueue(m.terminal, `${req.byName ?? "Someone"} brought you into #${next.name}. ` + briefing(next, live, m), { sender: req.byName ?? "crew", kind: "room" }).catch(() => {});
    return { ok: true, added: fresh.map((m) => `${m.name} #${m.channel}`), skipped, woke, unreachable: [] };
  },
};

const pause = (s) => exec("sleep", [String(s)]).catch(() => {});

// Claude Code bots get the crew primer and their memory from the session-start hook; other
// harnesses are told where to find them.
export function primerHint(argv) {
  const prog = (argv?.[0] ?? "").split("/").pop();
  return prog && prog !== "claude" ? "First run `crew primer` and `crew memory` to learn how the crew works and what you remember." : "";
}

// Start a bot's brain in a new channel named after the room, briefed for it. Returns the tab.
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
  const task = `You are ${space.name}, a bot in DeNon's Crew; your project is in this folder. You've just been brought into the room #${room.name}`
    + `${room.goal ? ` (goal: ${room.goal})` : ""} with ${others}. Catch up with: crew-room read ${room.slug}, then join in with crew-room say ${room.slug} "..." `
    + `if you have something to add. See the team with crew bots. ${ROOM_STYLE}` + (memory ? `\n\nThings to remember: ${memory}` : "");
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

// Run the crew command (as DeNon: the app isn't a bot's terminal).
export async function crewCli(args) {
  const r = await exec(`${home()}/.local/bin/crew`, args);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ") || "crew failed");
  return r.stdout;
}

// Does a task belong to this bot (by name, any channel)?
export const taskOf = (task, botName) => {
  const owner = (task.claimed_by || task.assignee || "").toLowerCase().split("#")[0];
  const b = (botName ?? "").toLowerCase();
  return Boolean(owner && b && (owner.startsWith(b) || b.startsWith(owner)));
};
