// Project Pals: shared model for the crew-* mods. install.sh copies this file into each mod as ./crew.js.
//
// Every Herdr space is a pal: a project with a brain. Its tabs are its channels, each a clone
// with its own terminal on the space's machine. The brain is whatever agent harness runs in the
// space (Claude Code, Codex, Grok, ...), read live from Herdr; a space with no agent is asleep.
// Project Pals keeps only what Herdr doesn't, keyed by space id: role, categories, briefs, memory, color.
// Status (and so the mascot's face) is Herdr's own agent status.

import { div, image, svg } from "gpui-kit";
import { spaces, agents, shared, setShared, panes, theme, run, layout, exec, hc, appHome, home, readTextFile, writeTextFile, knownAgents, notify, openOverlay, closeOverlay, keys } from "herdr";

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
// The zoom, for the scroll areas (read through the namespace, so a host or test without settings() is fine).
import * as herdrApi from "herdr";
import { petSpec, petKey, petPath, petFiles, bitsSvg, BITS, PET_DIR, PET_STATES, petScreen, BARE_VIEW, SMALL_BELOW, TW as PET_W, TH as PET_H } from "./pets.js";
import { PAL_LIST_STYLES, palListStyleOf, DEFAULT_PAL_LIST, petHeight, shortFolder, taskCounts, progressOf, liveTopics, chipWord, treesOn, textLeft } from "./palstyles.js";
import { sameMachine, machineKey, machineLabel, machineKind, kindIcon, machineEntry, machineList, machineState, machineTagOn, connectionOf } from "./machines.js";
export { sameMachine, machineKey, machineLabel, machineKind, kindIcon, machineEntry, machineList, machineState, machineTagOn, connectionOf, isTailscale, guessFolder, movedRecord, MACHINE_KINDS } from "./machines.js";


// Settings (data/crew-settings.json, mirrored into shared "crew.settings" by the roster): who the
// pals work for, and whether new pals start with permissions bypassed.
export const owner = () => shared("crew.settings")?.owner || "you";
export const bypassOn = () => Boolean(shared("crew.settings")?.bypass);
// The head pal's name (About → Settings, or `pal settings head`).
export const headName = () => shared("crew.settings")?.head || "Orchestrator";

// The 'working' indicator beside a working channel (the hero's channel list, the channel picker),
// chosen in Project Pals settings → Working indicator and kept as "workingIndicator" in
// crew-settings.json (DeNon, 2026-11-08). Classic is the old 6 px dot. The rest are looping animated
// WebPs in mods/crew-roster/working/, pre-rendered from DeNon's three design boards by
// tools/working-indicators/build.sh (which also writes styles.json; keep this list in step with it).
// Herdr plays them natively, and only a working row draws one, so the other rows cost nothing.
export const WORKING_GROUPS = [["classic", "Classic"], ["pixel", "Pixel"], ["sphere", "Sphere"], ["ascii", "ASCII"]];
export const WORKING_STYLES = [
  ["classic", "classic", "Classic dot"],
  ["pixel-comet", "pixel", "Comet lap"], ["pixel-breathe", "pixel", "Breathing tile"], ["pixel-radar", "pixel", "Radar sweep"],
  ["pixel-fill", "pixel", "Rising fill"], ["pixel-snake", "pixel", "Snake"], ["pixel-corners", "pixel", "Corner chase"],
  ["pixel-ripple", "pixel", "Halftone ripple"], ["pixel-eq", "pixel", "Equaliser"], ["pixel-square", "pixel", "Spinning pixel square"],
  ["pixel-noise", "pixel", "Static noise"],
  ["sphere-orb", "sphere", "Glossy orb"], ["sphere-wire", "sphere", "Wireframe globe"], ["sphere-dots", "sphere", "Dot-matrix Earth"],
  ["sphere-ring", "sphere", "Ringed planet"], ["sphere-cloud", "sphere", "Point cloud"], ["sphere-scan", "sphere", "Scanning band"],
  ["sphere-glass", "sphere", "Glass orb"], ["sphere-moon", "sphere", "Orbiting moon"], ["sphere-gyro", "sphere", "Gyroscope"],
  ["sphere-pulse", "sphere", "Pulse"],
  ["ascii-ramp", "ascii", "Shaded ramp"], ["ascii-earth", "ascii", "ASCII Earth"], ["ascii-wire", "ascii", "Wireframe chars"],
  ["ascii-binary", "ascii", "Binary"], ["ascii-block", "ascii", "Block shading"], ["ascii-braille", "ascii", "Braille globe"],
  ["ascii-night", "ascii", "Night side"], ["ascii-matrix", "ascii", "Matrix rain"], ["ascii-hex", "ascii", "Hex scan"],
  ["ascii-pals", "ascii", "Pals globe"],
].map(([id, group, name]) => ({ id, group, name }));
// Each style's size in a channel row: the boards' row sizes (12 px; the ASCII globes at their 16 px
// size, as 14 px was too faint to read). The files are drawn at 2x (pixel art at 4x, unsmoothed).
const WORKING_PX = { classic: 6, pixel: 12, sphere: 12, ascii: 16 };
export const workingStyleOf = (id) => WORKING_STYLES.find((x) => x.id === id) ?? WORKING_STYLES[0];
export const workingStyle = () => workingStyleOf(shared("crew.settings")?.workingIndicator);
// The mark itself: `id` defaults to the chosen style; `px` overrides its row size (the picker's
// bigger previews). A classic dot keeps its 6 px whatever `px` says, centred in that box.
export function workingMark(d, id = null, px = null) {
  const st = id ? workingStyleOf(id) : workingStyle();
  const size = px ?? WORKING_PX[st.group];
  if (st.group === "classic") {
    const dot = div().size(6).flex_none().rounded(3).bg(d.info);
    return px ? div().size(px).flex_none().flex().items_center().justify_center().child(dot) : dot;
  }
  return image(`mods/crew-roster/working/${st.id}.webp`).size(size).flex_none();
}

// ── The pal list's looks (Project Pals settings → Pal list style, DeNon 2026-11-08) ───────────
// One renderer for the sidebar's pal rows and the style dialog's preview, so the preview is the
// sidebar. The styles and their pure helpers live in palstyles.js; "palList" in crew-settings.json.
export { PAL_LIST_STYLES, palListStyleOf, DEFAULT_PAL_LIST, treesOn };
export const palListStyle = () => palListStyleOf(shared("crew.settings")?.palList);
// Trees: a working or needs-you pal's live topics under its row, in every look ("palTrees"; on
// unless it's false).
export const palTreesOn = () => treesOn(shared("crew.settings"));
// The hero's Topics list folded to its header (one state for every pal; off unless set).
// Whether a pal's row has its Trees topic rows under it (palLookTree draws them exactly then).
export const treeShows = (f, on = palTreesOn()) => Boolean(on && f?.live?.list?.length);
export const topicsFolded = () => shared("crew.settings")?.heroTopicsFolded === true;

// ── Machines (DeNon 2026-11-08: "which computer a pal works on") ────────────────────────────────
// The machines Herdr knows (`hc machine ls`) and this computer, published as shared "crew.machines"
// by the roster (every 20 s), so every mod reads one list without asking hc itself.
export async function refreshMachines() {
  const prev = shared("crew.machines") ?? {};
  let list = prev.list ?? [];
  try {
    const r = await hc(["machine", "ls", "--json"]);
    if (r.code === 0) list = (JSON.parse(r.stdout).machines ?? []).filter((m) => m?.name)
      .map((m) => ({ name: m.name, host: m.host ?? null, target: m.target ?? null, via: m.via || null, state: m.state ?? "unknown", temporary: Boolean(m.temporary) }));
  } catch {}
  let local = prev.local, localAt = prev.localAt ?? 0;
  if (!local || Date.now() - localAt > 10 * 60000) {
    try {
      const r = await exec("sh", ["-c", '(cat /etc/hostname 2>/dev/null || uname -n) | head -1; ls /sys/class/power_supply 2>/dev/null | grep -q "^BAT" && echo laptop || echo desktop']);
      const [host, kind] = r.stdout.trim().split("\n");
      local = { name: null, local: true, host: (host ?? "").trim() || null, kind: (kind ?? "").trim() || null, state: "connected" };
      localAt = Date.now();
    } catch {}
  }
  const next = { list, local, localAt };
  if (JSON.stringify({ ...prev, at: undefined }) !== JSON.stringify({ ...next, at: undefined })) setShared("crew.machines", { ...next, at: Date.now() });
}
export const machinesNow = () => shared("crew.machines") ?? null;
export const machineKinds = () => shared("crew.settings")?.machineKinds ?? {};
export const machineInfo = (name) => machineEntry(machinesNow(), name);
export const machineIconOf = (name) => kindIcon(machineKind(machineInfo(name), machineKinds()));
// A tiny tag: the machine's icon and name (10.5 mono), for a pal row or a topic row.
export function machineTag(d, name, { dim = false } = {}) {
  const up = machineState(machineInfo(name)).up;
  return div().flex().flex_none().h(16).px(4).gap(3).items_center().rounded(d.r.xs).border_1().border_color(d.line).bg(d.raised)
    .child(svg(`${SAVED}/${machineIconOf(name)}.svg`).size(10).flex_none().text_color(up ? d.iconOn : d.warn))
    .child(div().text_size(10.5).line_height("14px").font_family(d.mono).text_color(dim ? d.fg3 : d.fg2).child(machineLabel(name)));
}
// Change machine… (crew-machine): where the pal's new topics start, its folder there, and the way
// to wake it there or open a topic there.
export function openMachinePicker(spaceId, opts = {}) {
  return openOverlay({ mod: "crew-machine", kind: "dialog", width: 560, props: { space: spaceId ?? null, bot: opts.bot ?? null } });
}
// The style dialog (crew-palstyle): its preview is the sidebar's own width (within 248-340), so the
// dialog is that plus the list of looks and the sheet's margins.
export const palStylePreviewW = () => Math.max(248, Math.min(340, Math.round(sidebarPref())));
export function openPalStyle() { openOverlay({ mod: "crew-palstyle", kind: "dialog", width: palStylePreviewW() + 268 }); }

// The channel a pal's row stands for, and opens: one that needs you, else one that finished, else
// one working, else the most recently active; a pal with no agent anywhere, its shown tab.
export function palLeadTab(space, ags = agents()) {
  // Asks you, then working, then done (DeNon, 2026-11-08: working wins over done).
  const rank = { blocked: 3, working: 2, done: 1 };
  const best = ags.filter((x) => x.space === space.id)
    .sort((x, y) => (rank[y.status] ?? 0) - (rank[x.status] ?? 0) || y.seq - x.seq)[0];
  return (best && space.tabs.find((x) => x.id === best.tab)) ?? space.tabs.find((x) => x.active) ?? space.tabs[0] ?? null;
}

// A pal's status for its row and pet (DeNon, 2026-11-08): needs you if anything asks, else
// working while any topic works, else Herdr's own (done, idle). Herdr ranks done above working.
export function palStatus(space) {
  const tabs = space?.tabs ?? [];
  if (space?.status === "blocked" || tabs.some((x) => x.status === "blocked")) return "blocked";
  if (space?.status === "working" || tabs.some((x) => x.status === "working")) return "working";
  return space?.status ?? "idle";
}

// A pal's state as a word in its colour ("status first"): its pet's state (petState, so PR,
// merged, closing and stuck show too), "Working · 4m" with how long its lead channel has.
// Also the dot colour the compact looks use (null: resting; asleep: the dim one).
export function palStateWord(space, bot, d, lead = palLeadTab(space)) {
  if (bot.starting) return [`Starting`, d.infoText, d.info];
  if (!bot.awake) return ["Asleep", d.fg2, d.ctl];
  const st = petState(bot, mood(palStatus(space), true));
  const since = lead?.changed_at ? ago(lead.changed_at) : "";
  return ({
    work: [since && since !== "now" ? `Working · ${since}` : "Working", d.info, d.info],
    ask: ["Needs you", d.warn, d.warn], done: ["Done", d.ok, d.ok], stuck: ["Stuck", d.warn, d.warn],
    pr: ["PR open", "#3FBF78", "#3FBF78"], merged: ["Merged", "#9466F0", "#9466F0"], closing: ["Closing", d.err, d.err],
  })[st] ?? ["Resting", d.body, d.fg3];
}

// Everything a row shows about one open pal (a space): real data only. `tasks`: the task board.
export function palFacts(space, bot, d, tasks = [], all = panes()) {
  const lead = palLeadTab(space);
  const pane = lead ? leadPane(lead.id, all) : null;
  const [word, wordColor, dot] = palStateWord(space, bot, d, lead);
  const awake = Boolean(bot.awake || bot.starting);
  return {
    key: space.id, name: bot.name, folder: bot.folder ?? space.folder ?? null, branch: pane?.branch ?? null,
    harness: bot.harness ?? null, tag: lead ? channelName(lead) : "", word, wordColor, dot,
    chs: space.tabs.length, blocked: space.tabs.filter((x) => x.status === "blocked").length,
    tasks: taskCounts(tasks, (x) => taskFor(x, space.name)),
    awake, on: Boolean(space.active), pinned: palPinned(bot),
    live: awake ? liveTopics(space.tabs) : { list: [], more: 0 },
    machine: space.machine ?? null,
    // A pal open on two machines (it moved; old topics still run) tags its rows in every look.
    spans: palSpaces(bot).length > 1,
  };
}
// The same for a pal whose space is closed (a sleeper): its record.
export function sleeperFacts(rec, d, tasks = []) {
  return {
    key: `sleep-${rec.id}`, name: rec.name, folder: rec.folder ?? null, branch: null, harness: rec.harness ?? null,
    tag: "", word: "Asleep · click to wake", wordColor: d.fg2, dot: d.ctl,
    chs: Array.isArray(rec.channels) ? rec.channels.length : 0, blocked: 0,
    tasks: taskCounts(tasks, (x) => taskFor(x, rec.name)), awake: false, on: false, pinned: false, live: { list: [], more: 0 },
    machine: rec.machine ?? null,
  };
}

// A pal's pet for a row, w wide (78% as tall): bare over a soft aura, as the sidebar draws it. The
// large rows (60 px and up) also get the small still pool of the state's colour under the pet (asks
// you breathes); the compact ones leave the state to the text and the dot.
export function palPet(bot, m, w, t = tone(theme())) {
  const p = petOf(bot);
  const h = Math.round(w * 108 / 138);
  if (!p || !petReady(p)) return mascotEl(bot, m, w, t);
  const state = petState(bot, m);
  const k = w / 75;
  const lit = w >= 60 && bot.awake && ["work", "done", "ask", "pr", "merged", "closing", "stuck"].includes(state);
  const ax = Math.round(12 * k), ay = Math.round(9 * k);
  return div().relative().w(w).h(h).flex_none()
    // Depth without an edge: a soft radial aura that fades out to nothing (an image, so it stays behind).
    .child(div().absolute().left(-ax).top(-ay).w(w + 2 * ax).h(h + 2 * ay).child(image(`${SAVED}/pet-aura-row.svg`).w(w + 2 * ax).h(h + 2 * ay)))
    .when(lit, (el) => el.child(div().absolute().left(-6).top(h - 17).w(w + 12).h(24)
      .when(state === "ask", (x) => x.loop("opacity", { from: 0.35, to: 1, period: 1100 }))
      .child(image(`${SAVED}/pet-floor-${state}.svg`).w(w + 12).h(24))))
    .child(div().absolute().left(0).top(0).child(petEl(p, state, w, h, { open: true })));
}

// One pal row in look `st` (palListStyleOf), filled into `row` (the caller's element, carrying its
// id and handlers: click, right-click, drag). `f`: palFacts / sleeperFacts. `pet`: palPet at
// st.pet wide. Board colours → tokens: #808082 is d.fg2, #6A6A6C d.fg3.
export function palLookRow(d, st, f, pet, row = div(), trees = palTreesOn()) {
  const H = petHeight(st.pet);
  // No last-activity time on pal rows or Trees rows (DeNon, 2026-11-08): the name and the state
  // line have the width. The state line keeps "Working · 4m".
  const pin = (el) => el.when(f.pinned, (x) => x.child(svg(`${SAVED}/pin.svg`).size(10).flex_none().text_color(d.fg4)));
  const nameEl = (size = 13, weight = 600) => div().flex_1().min_w(0).truncate().text_size(size).line_height(`${size + 4}px`)
    .font_weight(weight).text_color(f.awake ? d.fg1 : d.fg2).child(f.name);
  // The machine tag (pals on another machine; Rich detail and Table by default, the others when
  // it's turned on: machineTagOn).
  const mtag = f.spans || (f.machine && machineTagOn(shared("crew.settings"), st.id)) ? machineTag(d, f.machine) : null;
  const tagged = (el) => el.when(Boolean(mtag), (x) => x.child(mtag));
  const head = (name = nameEl()) => pin(tagged(div().flex().items_center().gap(6).min_w(0).child(name)));
  const mono = (text, color = d.fg2, size = 11) => div().min_w(0).truncate().text_size(size).line_height("16px").font_family(d.mono).text_color(color).child(text);
  // "Working · 7m · #indicators": the state word in its colour, then a mono tail.
  const stateLine = (tail, size = 12) => div().flex().items_center().min_w(0).overflow_hidden()
    .child(div().flex_none().text_size(size).line_height("16px").font_weight(500).text_color(f.wordColor).child(f.word))
    .when(Boolean(tail), (el) => el.child(mono(` · ${tail}`)));
  const chip = (text, color = d.fg2) => div().flex_none().h(16).px(5).flex().items_center().rounded(d.r.sm).border_1().border_color(d.line).bg(d.raised)
    .text_size(10.5).line_height("14px").text_color(color).child(text);
  const folder = shortFolder(f.folder, home());
  const rel = shortFolder(f.folder, home(), true);
  // " · #topic" only when no Trees rows show under this pal (resting, asleep, Trees off or folded):
  // with the tree showing, the row says just the state (DeNon, 2026-11-08), in every look.
  const ch = f.tag && !treeShows(f, trees) ? `#${f.tag}` : "";
  const petBox = (extra = null) => div().relative().flex_none().when(!f.awake, (el) => el.opacity(0.5)).child(pet).when(Boolean(extra), (el) => el.child(extra));
  const col = () => div().flex().flex_col().flex_1().min_w(0).gap(1);

  row.relative().flex().flex_none().items_center().rounded(d.r.md).cursor_pointer()
    .when(f.on, (el) => el.bg(d.sel)).when(!f.on, (el) => el.hover((s) => s.bg(d.hover)));
  switch (st.id) {
    case "folder":
      return row.gap(10).px(8).py(6).child(petBox())
        .child(col().child(head()).child(stateLine(ch)).child(mono(folder || "no folder", d.fg3)));
    case "tight":
      return row.gap(10).px(8).py(6)
        .child(petBox(f.dot ? div().absolute().right(-3).bottom(-1).size(9).rounded(5).bg(f.dot).border_2().border_color(f.on ? d.sel : d.bg1) : null))
        .child(col().child(head()).child(mono([folder, f.branch].filter(Boolean).join(" · ") || f.word)));
    case "wrap":
      return row.gap(10).px(8).py(6).items_start()
        .child(div().pt(2).child(petBox()))
        .child(col().child(pin(tagged(div().flex().items_start().gap(6).child(div().flex_1().min_w(0).text_size(13).line_height("17px").font_weight(600)
          .text_color(f.awake ? d.fg1 : d.fg2).child(f.name))))).child(stateLine(ch)));
    case "rich":
      return row.gap(10).px(8).py(6).child(petBox())
        .child(col().child(head())
          .child(div().flex().items_center().min_w(0).overflow_hidden().child(mono(folder || "no folder"))
            .when(Boolean(f.branch), (el) => el.child(div().flex_none().text_size(11).line_height("16px").font_family(d.mono).text_color(d.fg3).child(` · ${f.branch}`))))
          .child(div().flex().items_center().gap(6).pt(2).min_w(0).overflow_hidden()
            .when(Boolean(f.harness), (el) => el.child(brainLogo(f.harness, 12, d)))
            .child(div().flex_none().text_size(11.5).line_height("16px").font_weight(500).text_color(f.wordColor).child(f.word))
            .when(f.chs > 0, (el) => el.child(chip(f.blocked ? `${f.blocked} blocked` : `${f.chs} topic${f.chs === 1 ? "" : "s"}`, f.blocked ? d.warn : d.fg2)))
            .when(f.tasks.open > 0, (el) => el.child(chip(`${f.tasks.open} task${f.tasks.open === 1 ? "" : "s"}`)))));
    case "table":
      return row.h(32).gap(8).px(8).child(petBox())
        .child(div().size(7).flex_none().rounded(4).bg(f.dot ?? d.fg4))
        .child(pin(tagged(div().flex().flex_1().min_w(0).items_center().gap(6).child(nameEl(13, f.awake ? 600 : 500)))))
        .child(div().w(22).flex_none().flex().justify_end().child(mono(String(f.chs || "·"), f.blocked ? d.warn : d.fg2)))
        .child(div().w(20).flex_none().flex().justify_end().child(mono(f.tasks.open ? String(f.tasks.open) : "·")));
    case "progress": {
      const pr = progressOf(f.tasks);
      return row.gap(10).px(8).py(6).child(petBox())
        .child(col().child(head()).child(stateLine(pr ? pr.label : "no open tasks"))
          .when(Boolean(pr), (el) => el.child(div().mt(4).h(3).w_full().rounded(2).bg(d.ctl).overflow_hidden()
            .child(div().h(3).w(`${Math.round((pr?.frac ?? 0) * 100)}%`).rounded(2).bg(d.info)))));
    }
    case "project":
      return row.gap(10).px(8).py(6).child(petBox())
        .child(col()
          .child(pin(tagged(div().flex().items_center().gap(6).min_w(0).child(div().flex_1().min_w(0).truncate().text_size(11).line_height("15px").text_color(d.fg2).child(f.name)))))
          .child(div().min_w(0).truncate().text_size(12.5).line_height("17px").font_weight(500).font_family(d.mono).text_color(f.awake ? d.fg1 : d.body).child(rel || f.name))
          .child(stateLine(f.branch ?? "", 11.5)));
    case "grouped":
      return row.gap(10).px(8).py(4).child(petBox())
        .child(col().child(head(nameEl(13, f.awake ? 600 : 500))).child(stateLine(ch, 11.5)));
    case "card":
      return row.my(2).gap(10).px(8).py(7).items_start().border_1().border_color(f.on ? d.lineMid : d.line)
        .child(div().pt(1).child(petBox()))
        .child(col().child(pin(tagged(div().flex().items_start().gap(6).child(div().flex_1().min_w(0).text_size(12.5).line_height("16px").font_weight(600)
          .text_color(f.awake ? d.fg1 : d.fg2).child(f.name))))).child(mono(folder || "no folder", d.fg3)))
        .child(chip(chipWord(f.word), f.wordColor));
    default:
      // Large pets: the pet 75 wide in a 64 px row, the name (14/600), then the state word in
      // its colour and " · #channel" in 11 px mono.
      return row.h(64).gap(12).px(8).child(petBox())
        .child(div().flex().flex_col().flex_1().min_w(0).gap(2)
          .child(pin(tagged(div().flex().items_center().gap(6).child(div().flex_1().min_w(0).truncate().text_size(14).line_height("18px").font_weight(600)
            .text_color(f.awake ? d.fg1 : d.fg2).child(f.name)))))
          .child(stateLine(ch)));
  }
}

// Trees: a working or needs-you pal's live topics under its row, in any look (`on`: the Trees
// setting). Each topic row is 22 px (at most four, then an 18 px "+N more"), its mark (the working
// indicator you chose, an amber dot when it asks you, a check when it's done) starting at the look's
// text column, then "#topic". `onPick(tab, cx)`: a click; `onMenu(tab, cx)`:
// right-click. Nothing else in the list moves: only these rows are added.
export function palLookTree(d, st, f, id, onPick = null, onMenu = null, on = palTreesOn()) {
  if (!treeShows(f, on)) return null;
  const box = div().flex().flex_col().flex_none().pl(textLeft(st) - 4).pr(8).pb(4);
  for (const tab of f.live.list) {
    const mark = tab.status === "working" ? workingMark(d)
      : tab.status === "blocked" ? div().size(6).flex_none().rounded(3).bg(d.warn)
      : svg(`${SAVED}/ds-check-thin.svg`).size(10).flex_none().text_color(d.ok);
    box.child(div().id(`${id}-tp-${tab.id}`).flex().h(22).flex_none().items_center().gap(7).px(4).rounded(d.r.sm)
      .when(Boolean(onPick), (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => { cx.stop_propagation(); onPick(tab, cx); }))
      .when(Boolean(onMenu), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); onMenu(tab, cx); }))
      .child(div().w(16).flex_none().flex().items_center().justify_center().child(mark))
      .child(topicMark(tab, 11))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).line_height("16px").font_family(d.mono).text_color(tab.active ? d.fg1 : d.fg2).child(`#${channelName(tab)}`)));
  }
  if (f.live.more) box.child(div().h(18).flex_none().flex().items_center().pl(27).text_size(11).line_height("14px").text_color(d.fg4).child(`+${f.live.more} more`));
  return box;
}


// Which helpers this install has (crew-install.json, shared as "crew.helpers" by syncSettings):
// the primer hint is skipped for a brain whose hooks give the primer already.
export const helpersOn = (kind = null) => {
  const h = shared("crew.helpers");
  if (h === false) return false;
  if (h && typeof h === "object") {
    if (h.helpers === false) return false;
    if (kind === "claude" && h.claude_hooks === false) return false;
    if (kind === "agy" && h.agy_hooks === false) return false;
  }
  return true;
};
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
  let ins = {};
  try { ins = JSON.parse((await readTextFile(`${appHome()}/data/crew-install.json`)) ?? "{}"); } catch { ins = {}; }
  const hState = ins?.helpers === false ? false : { helpers: true, claude_hooks: ins?.claude_hooks !== false, agy_hooks: ins?.agy_hooks !== false };
  if (JSON.stringify(hState) !== JSON.stringify(shared("crew.helpers") ?? null)) setShared("crew.helpers", hState);
  let am = null;
  try { am = JSON.parse((await readTextFile(`${appHome()}/data/agy-models.json`)) ?? "null"); } catch { am = null; }
  const agyList = Array.isArray(am) && am.length ? am : null;
  if (JSON.stringify(agyList) !== JSON.stringify(shared("crew.agyModels") ?? null)) setShared("crew.agyModels", agyList);
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

const progBase = (argv) => String(argv?.[0] ?? "").split("/").pop().toLowerCase();
export function isAgy(key, argv) {
  const k = String(key ?? "").toLowerCase(), p = progBase(argv);
  return k === "antigravity" || k === "antigravity-cli" || k === "agy" || k.startsWith("agy-") || p === "agy";
}
export function isClaude(key, argv) {
  const k = String(key ?? "").toLowerCase(), p = progBase(argv);
  return k === "claude" || k === "claude-code" || k.startsWith("claude-") || p === "claude";
}
export function isCodex(key, argv) {
  const k = String(key ?? "").toLowerCase(), p = progBase(argv);
  return k === "codex" || k.startsWith("codex-") || p === "codex";
}

// Harness (program key) → accessory: bandage, monocle, antenna, ears, halo, sprout.
const ACCESSORY = {
  claude: "claude", "claude-code": "claude",
  codex: "codex",
  grok: "grok",
  gemini: "gemini", "antigravity-cli": "gemini", antigravity: "gemini", agy: "gemini",
  hermes: "hermes",
  opencode: "opencode", kilo: "opencode", crush: "opencode",
};
export const accessory = (harness, argv) => {
  if (!harness && !argv?.length) return "none";
  if (ACCESSORY[harness]) return ACCESSORY[harness];
  if (isAgy(harness, argv)) return "gemini";
  if (isClaude(harness, argv)) return "claude";
  return harness ? "other" : "none";
};
// The head pal wears a crown whatever its brain.

// A pal's body color: its own pick, else its harness's signature color for hired pals, else one
// chosen by its name so each project keeps the same face.
const HARNESS_COLOR = {
  claude: "clay", "claude-code": "clay",
  codex: "cream",
  grok: "ink",
  gemini: "blue", antigravity: "blue", "antigravity-cli": "blue", agy: "blue",
  hermes: "violet",
  opencode: "amber",
};
const harnessColor = (harness, argv) => HARNESS_COLOR[harness] ?? (isAgy(harness, argv) ? "blue" : isClaude(harness, argv) ? "clay" : null);
const PALETTE = ["clay", "violet", "blue", "amber", "mint", "pink", "slate", "cream", "ink"];
function hash(s) { let h = 2166136261; for (const ch of s ?? "") h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
export function colorOf(bot) {
  return bot.color ?? (bot.god ? "pearl" : null) ?? (bot.hired ? harnessColor(bot.harness, bot.argv) : null) ?? PALETTE[hash(bot.name) % PALETTE.length];
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
// The idea partner (MUSE, Desk design §13): a role of its own, hired with `pal hire --partner`, which
// renders its brief into data/crew-partner and starts it there on Sonnet in #ideas. At most one.
export const PARTNER_ROLE = "Idea partner";
export const PARTNER_NAME = "MUSE";
export const partnerOf = (c = crew()) => c.bots.find((b) => b.partner || (b.role ?? "").toLowerCase() === PARTNER_ROLE.toLowerCase()) ?? null;

// The Chief (crew-boards/chief/design.md, DeNon's pick 2026-11-09: A · Split deck): the owner's chief
// of staff above the head pal. A pal whose space is hidden from the sidebar and shown in a pop-up
// window (Ctrl+Shift+J, crew-roster.chief) beside its dashboard (crew-chief). It only pulls: nothing is
// typed into it but the owner's words (bin/crewchief.py holds the rules). Hired by the owner's click
// (pal hire --chief), at most one, in data/crew-chief on Opus, topic #chief.
export const CHIEF_ROLE = "Chief of staff";
export const CHIEF_NAME = "Chief";
// Only `chief: true` marks the Chief (set by the owner's clicked `pal hire --chief`); the role text never
// does: ROLES offers "Chief of staff" to any pal in the hire dialog (Grok T69).
export const isChiefRec = (b) => b?.chief === true;
export const chiefOf = (c = crew()) => c.bots.find(isChiefRec) ?? null;
export const isChiefSpace = (space, c = crew()) => Boolean(space) && isChiefRec(recordOf(space, c));
// The pals as the sidebar, Home and the Desk list them: everyone but the Chief.
export const withoutChief = (all = spaces(), c = crew()) => (chiefOf(c) ? all.filter((s) => !isChiefSpace(s, c)) : all);
export const chiefSpace = (all = spaces(), c = crew()) => all.find((s) => isChiefSpace(s, c)) ?? null;
// The Chief's terminal with an agent running in it, or null (asleep, or not hired).
export function chiefTerminal(all = spaces(), ps = panes(), c = crew()) {
  const s = chiefSpace(all, c);
  for (const t of s?.tabs ?? []) {
    const p = leadPane(t.id, ps);
    if (p?.terminal && p.program?.agent) return p.terminal;
  }
  return null;
}
// The pop-up's three sizes (design: Compact for a quick question, Split by default, Full).
export const CHIEF_SIZES = { compact: { width: 480, height: 640 }, split: { width: 1180, height: 760 }, full: { width: 0.94, height: 0.92 } };
export const CHIEF_TERM_W = 470;
// The window: the bar and the Chief's terminal beside the dashboard (Compact: stacked, the dashboard
// cut to its read). Without a live Chief, the bar over the dashboard, which offers Hire or Wake.
// Pure, so tests can check it (tests/test_chief.mjs).
export function chiefWindowSpec(size, terminal) {
  const sz = CHIEF_SIZES[size] ? size : "split";
  const bar = { type: "block", size: { px: 34 }, content: { mod: "crew-chief-bar", props: { size: sz } } };
  const dash = (compact) => ({ type: "block", ...(compact ? { size: { px: 196 } } : {}), content: { mod: "crew-chief", props: { size: sz, compact } } });
  const term = terminal ? { type: "block", content: { terminal } } : null;
  const layout = !term ? { type: "column", children: [bar, dash(false)] }
    : sz === "compact" ? { type: "column", children: [bar, dash(true), term] }
    : { type: "row", children: [{ type: "column", size: { px: CHIEF_TERM_W }, children: [bar, term] }, dash(false)] };
  return { kind: "window", key: "chief", keep: true, ...CHIEF_SIZES[sz], layout };
}
// Ctrl+Shift+J: open the pop-up, or close it when it's open. The window's id lives in shared
// "crew.chief.win" (the dashboard stamps it again when a kept window comes back after a restart).
// Esc never closes it: Esc belongs to the Chief's terminal. Never pane.focus the Chief's terminal
// (it would show its hidden space: the 2026-11-09 spike); the dashboard's Ask field takes the keyboard.
export function toggleChief() {
  const st = shared("crew.chief.win") ?? {};
  if (st.id) return closeChief();
  openChief(st.size);
}
export function openChief(size) {
  const sz = CHIEF_SIZES[size] ? size : "split";
  const id = openOverlay(chiefWindowSpec(sz, chiefTerminal()));
  setShared("crew.chief.win", { id, size: sz, at: Date.now() });
  return id;
}
export function closeChief() {
  const st = shared("crew.chief.win") ?? {};
  if (st.id) { try { closeOverlay(st.id); } catch { /* already gone */ } }
  setShared("crew.chief.win", { size: st.size ?? "split" });
}
// The size toggle in the bar: the same key, so the new window takes the old one's place.
export function resizeChief(size) { openChief(size); }
// Wake a sleeping Chief without showing its space (it lives in the pop-up), then rebuild the window
// around its terminal once one runs (the dashboard's timer calls resizeChief when it sees it).
export async function wakeChief() {
  const rec = chiefOf();
  if (!rec) return;
  const back = holdView();
  try { await wakePal(rec); } finally { back(); }
}

export function crew() {
  const c = shared("crew");
  return c && Array.isArray(c.bots) ? c : { bots: [] };
}
export function saveCrew(c) { setShared("crew", { ...c, bots: c.bots }); }
export const newId = () => Math.random().toString(36).slice(2, 10);

// Project Pals's record for a space: by its id (or one of its other spaces, `also`: the topics a pal
// left running on a machine it moved from), else (a pal hired before its space existed) by name.
export function recordOf(space, c = crew()) {
  if (!space) return null;
  return c.bots.find((b) => b.space === space.id || (b.also ?? []).includes(space.id))
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
    // Where this space runs (its topics' terminals) and where the pal's new topics start (the
    // record's choice: Change machine…); the same until the pal moves.
    machine: space.machine ?? null,
    target: rec && "machine" in rec ? (rec.machine ?? null) : (space.machine ?? null),
    folder: (rec && sameMachine(rec.machine, space.machine) ? rec.folder : null) ?? space.folder ?? rec?.folder ?? null,
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
  return c.bots.filter((b) => !all.some((s) => s.id === b.space || (b.also ?? []).includes(s.id) || (!b.space && s.name === b.name && sameMachine(b.machine, s.machine))));
}

// Every open space of a pal: its own, then the ones it left running on other machines (`also`).
export function palSpaces(bot, all = spaces()) {
  const rec = bot?.record ?? bot;
  if (!rec) return [];
  const ids = [rec.space ?? bot?.space, ...(rec.also ?? [])].filter(Boolean);
  return ids.map((id) => all.find((s) => s.id === id)).filter(Boolean);
}

// Where a pal's new topics go: its open space on the machine it works on now (bot.target), or none
// yet (after Change machine…, until its first topic there).
export function targetSpace(bot, all = spaces()) {
  return palSpaces(bot, all).find((s) => sameMachine(s.machine, bot?.target ?? bot?.machine)) ?? null;
}
// Open a topic for a pal on the machine it works on: a tab in its space there, else a new space
// there with the pal's name, linked to the pal (`also`), so it stays one pal on two machines until
// the old topics are closed. Returns the space it went into.
export function openTopic(bot, { name, argv, task, folder } = {}) {
  const rec = bot?.record ?? null;
  const to = bot?.target ?? bot?.machine ?? null;
  const dir = folder ?? (rec && sameMachine(rec.machine, to) ? rec.folder : null) ?? (sameMachine(bot?.machine, to) ? bot?.folder : null) ?? undefined;
  const there = targetSpace(bot);
  if (there) { run("tab.new", { space: there.id, name, argv, task, folder: dir }); return there; }
  run("space.new", { name: bot.name, tab: name, argv, task, folder: dir, machine: to ?? "" });
  const c = crew();
  const made = spaces().find((s) => s.name === bot.name && sameMachine(s.machine, to) && !c.bots.some((o) => o.space === s.id || (o.also ?? []).includes(s.id)));
  if (made && rec) updateBot(rec, (b) => (b.space && spaces().some((x) => x.id === b.space)
    ? { ...b, also: [...new Set([...(b.also ?? []), made.id])] } : { ...b, space: made.id }));
  return made ?? null;
}

// Records made before their space existed (a hire from a terminal) get its id once it shows up,
// so a later rename keeps the pal's memory.
export function linkRecords(all = spaces(), c = crew()) {
  let changed = false;
  const bots = c.bots.map((b) => {
    // Linked to a space that's still there: nothing to do. Linked to one that's gone (it slept and
    // was opened again): link it to the new space with its name, like a record that never had one.
    // Its other spaces (`also`) that closed are forgotten; if its own closed while one of them is
    // still open, that one becomes its own.
    const also = (b.also ?? []).filter((id) => all.some((x) => x.id === id) && id !== b.space);
    if (also.length !== (b.also ?? []).length) { changed = true; b = { ...b, also: also.length ? also : undefined }; }
    if (b.space && all.some((x) => x.id === b.space)) return b;
    if (also.length) { changed = true; return { ...b, space: also[0], also: also.length > 1 ? also.slice(1) : undefined }; }
    const s = all.find((x) => x.name === b.name && sameMachine(b.machine, x.machine) && !c.bots.some((o) => o.space === x.id || (o.also ?? []).includes(x.id)));
    if (!s) return b;
    changed = true;
    return { ...namedNotes(b), space: s.id };
  });
  if (changed) saveCrew({ ...c, bots });
  rememberBrains(all);
}

// A record without a brain (a space Project Pals didn't hire: categories and briefs only) learns
// the one it runs while it's awake, so a topic added while it's asleep still starts that brain
// (T24: Hello Lock's #lock-loss-2 opened as a plain shell). Never overrides a brain it was hired with.
export function rememberBrains(all = spaces(), c = crew(), ps = panes()) {
  let changed = false;
  const bots = c.bots.map((b) => {
    if (b.harness || b.argv?.length) return b;
    const mine = all.filter((s) => s.id === b.space || (b.also ?? []).includes(s.id));
    for (const s of mine) {
      const key = brainOf(s, ps);
      if (!key) continue;
      changed = true;
      return { ...b, harness: key, harnessName: brainName(s, ps) ?? b.harnessName ?? null };
    }
    return b;
  });
  if (changed) saveCrew({ ...c, bots });
  return changed;
}

// Which brain a new topic starts, best first (T24): the one asked for, the pal's own command line,
// the brain it runs or was seen running, one of its topics' brains, then (a pal whose brain was
// never seen) the asking pal's brain, else Claude Code. `guessed` says the pal's own wasn't known.
// Never "none": a topic with no agent can't take its brief, and that used to happen silently.
export function topicBrains(req, bot, callerKey = null) {
  const out = [], seen = new Set();
  const add = (key, why, extra = {}) => {
    if (!key && !extra.argv) return;
    const k = `${key ?? ""}|${extra.argv ? "argv" : ""}`;
    if (seen.has(k)) return;
    seen.add(k); out.push({ key: key ?? null, why, guessed: why === "yours" || why === "default", ...extra });
  };
  if (req?.harness) { add(req.harness, "asked"); return out; }
  const rec = bot?.record ?? null;
  if (rec?.argv?.length) add(rec.harness ?? bot?.harness ?? null, "hired", { argv: rec.argv });
  add(bot?.harness ?? rec?.harness, "its own");
  for (const k of Object.values(rec?.brains ?? {}).reverse()) add(k, "a topic's");
  add(callerKey, "yours");
  add("claude", "default");
  return out;
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
// Its brain: the command on record, else its brain on record started fresh, else Claude Code, as
// `pal topic` and a room's wake do (T27: a pal with no argv on record woke as bare shells). It says
// which brain it picked when nothing was on record, and keeps it (harness) so the row shows it.
export async function wakePal(rec) {
  const named = namedNotes(rec);
  const chans = Object.keys(named.categories ?? {}).filter((k) => k.startsWith("#") || !/^tb[0-9a-f]{16,}$/.test(k));
  if (!chans.length) chans.push("#general");
  let raw = rec.argv?.length ? rec.argv : null, picked = null;
  if (!raw) {
    try {
      picked = await brainFor(rec.harness ?? "claude", rec.machine);
      raw = withBypass(picked.key, picked.run);
    } catch (e) {
      notify({ title: `Woke ${rec.name} without a brain`, body: `${e?.message ?? e}. Its topics open as plain shells.`, level: "warning", timeout: 8000 });
    }
  }
  updateBot(rec, (b) => ({ ...named, space: null, ...(picked && !b.harness ? { harness: picked.key } : {}) }));
  const argv = palArgv(raw ?? undefined, rec.harness ?? picked?.key);
  if (picked) notify({ title: `Woke ${rec.name} with ${picked.name}`, body: rec.harness ? "its brain on record (no saved command)" : "no brain on record, so Claude Code, as pal topic does", level: "info", timeout: 5000 });
  run("space.new", { name: rec.name, tab: chans[0], folder: rec.folder || undefined, argv, machine: rec.machine ?? "" });
  const made = spaces().find((s) => s.name === rec.name && sameMachine(rec.machine, s.machine) && !crew().bots.some((o) => o.space === s.id));
  if (!made) return;
  updateBot(rec, (b) => ({ ...b, space: made.id }));
  const first = made.tabs[0];
  for (const ch of chans.slice(1)) run("tab.new", { space: made.id, name: ch, argv, folder: rec.folder || undefined });
  if (first) run("tab.select", { id: first.id });
}

// Which brain a topic put to sleep in place starts again (pal wake; T27's order, per topic): the
// topic's own brain on record (pal topic --harness, or a guess it kept), else the pal's command on
// record, else its brain on record started fresh, else Claude Code (kept as its brain, as wakePal
// does). A brain that can't start falls through to the next; none at all is an error, never a
// bare shell. Returns { argv, key, name, why, hint } (palArgv applied; hint: the primer line for a
// brain without Project Pals' hooks).
export async function wakeBrain(rec, topicKey = null, machine = null) {
  const own = rec?.argv?.length ? rec.argv.map(String) : null;
  const ownKey = rec?.harness ?? (own ? (isClaude(null, own) ? "claude" : isAgy(null, own) ? "antigravity" : progBase(own)) : null);
  const tried = [];
  const fresh = async (key, why) => {
    try { const b = await brainFor(key, machine); return { raw: withBypass(b.key, b.run), key: b.key, name: b.name, why }; }
    catch (e) { tried.push(String(e?.message ?? e)); return null; }
  };
  let got = null;
  if (topicKey && !(own && topicKey === ownKey)) got = await fresh(topicKey, "this topic's brain on record");
  if (!got && own) got = { raw: own, key: ownKey, name: rec?.harnessName ?? ownKey, why: "its command on record" };
  if (!got && rec?.harness) got = await fresh(rec.harness, "its brain on record (no saved command)");
  if (!got) {
    got = await fresh("claude", "no brain on record, so Claude Code, as pal topic does");
    if (got && rec && !rec.harness) updateBot(rec, (b) => ({ ...b, harness: b.harness ?? got.key }));
  }
  if (!got) throw new Error(`no brain to start: ${tried.join("; ") || "none known"}`);
  const argv = palArgv(got.raw, got.key);
  return { argv, key: got.key, name: got.name, why: got.why, hint: primerHint(argv, got.key) };
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
// The default category was "Channels" before tabs were called topics (0.4.0); stored ones show as "Topics".
export const categoryName = (c) => (c === "Channels" ? "Topics" : c);
export const categoryOf = (bot, tab) => categoryName(pick(bot.categories, tab) ?? "Topics");
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
  claude: "Anthropic", "claude-code": "Anthropic",
  codex: "OpenAI",
  grok: "xAI",
  gemini: "Google", antigravity: "Google", "antigravity-cli": "Google", agy: "Google",
  hermes: "Nous Research",
  opencode: "any model", copilot: "GitHub", cursor: "Cursor", pi: "any model", crush: "Charm", amp: "Sourcegraph",
};
export const companyOf = (key, argv) => COMPANY[key] ?? (isAgy(key, argv) ? "Google" : isClaude(key, argv) ? "Anthropic" : "");
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
// Claude Code and Antigravity CLI can start on a chosen model. Only ever on the pal's (or
// channel's) own command line: changing `/model` inside the TUI would also change your global default.
export const MODELS = [
  { key: null, name: "Your default", sub: "whatever Claude Code uses" },
  { key: "opus", name: "Opus", sub: "strongest" },
  { key: "sonnet", name: "Sonnet", sub: "balanced" },
  { key: "haiku", name: "Haiku", sub: "fast, cheapest" },
];
export const AGY_MODELS = [
  { key: null, name: "Your default", sub: "whatever Antigravity CLI uses" },
  { key: "gemini-4-argon-high", name: "Gemini 4 Argon (High)", sub: "strongest, deep thinking" },
  { key: "gemini-4-argon-medium", name: "Gemini 4 Argon (Medium)", sub: "balanced reasoning" },
  { key: "gemini-4-argon-low", name: "Gemini 4 Argon (Low)", sub: "fast reasoning" },
  { key: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)", sub: "fast, high effort" },
  { key: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)", sub: "fast, balanced" },
  { key: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)", sub: "fastest, light tasks" },
  { key: "claude-opus-5-5-high", name: "Claude Opus 5.5 (High)", sub: "high effort" },
  { key: "claude-opus-5-5-medium", name: "Claude Opus 5.5 (Medium)", sub: "medium effort" },
  { key: "claude-opus-5-5-low", name: "Claude Opus 5.5 (Low)", sub: "low effort" },
  { key: "claude-sonnet-5-5-high", name: "Claude Sonnet 5.5 (High)", sub: "high effort" },
  { key: "claude-sonnet-5-5-medium", name: "Claude Sonnet 5.5 (Medium)", sub: "medium effort" },
  { key: "claude-sonnet-5-5-low", name: "Claude Sonnet 5.5 (Low)", sub: "low effort" },
  { key: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)", sub: "open weights" },
];
const agyModels = () => {
  const dyn = shared("crew.agyModels");
  return Array.isArray(dyn) && dyn.length ? [AGY_MODELS[0], ...dyn] : AGY_MODELS;
};
export const modelsFor = (key, argv) => (isClaude(key, argv) ? MODELS : isAgy(key, argv) ? agyModels() : null);
export const modelOf = (argv) => {
  const a = argv ?? [];
  const eq = a.find((x) => String(x).startsWith("--model="));
  if (eq) return eq.slice("--model=".length) || null;
  const i = a.indexOf("--model");
  return i >= 0 ? a[i + 1] ?? null : null;
};
// argv with its --model set to `model`, or dropped (so the harness uses your default) when null.
export function withModel(argv, key, model) {
  if (!argv || (!isClaude(key, argv) && !isAgy(key, argv))) return argv;
  const bare = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--model") { i++; continue; }
    if (String(argv[i]).startsWith("--model=")) continue;
    bare.push(argv[i]);
  }
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
  const h = rec?.harness ?? "claude";
  if (!rec || !rec.argv || (!isClaude(h, rec.argv) && !isAgy(h, rec.argv))) return;
  const terms = panes().filter((p) => space.tabs.some((x) => x.id === p.tab)).map((p) => p.terminal).filter(Boolean);
  for (const term of terms) {
    let st = null;
    try { st = JSON.parse((await readTextFile(`${appHome()}/data/crew-status/${String(term).split("/").pop()}.json`)) ?? "null"); } catch {}
    if (isAgy(h, rec.argv) && !st?.model_pinned) continue;
    const id = String(st?.model?.id ?? st?.model?.display_name ?? "").toLowerCase();
    const key = isAgy(h, rec.argv)
      ? agyModels().map((m) => m.key).find((k) => k && k === id) || (id && id !== "auto" ? id : null)
      : ["opus", "sonnet", "haiku"].find((k) => id.includes(k));
    if (key) { if (modelOf(rec.argv) !== key) updateBot(rec, (b) => ({ ...b, argv: withModel(b.argv, h, key) })); return; }
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
// The topic's colour as a mark before its "#" (the hero's list, the Trees rows, the topic picker;
// DeNon, 2026-11-08): a 3 x 12 bar with round ends, its slot always there (empty with no colour)
// so names line up and nothing moves when a colour is set or cleared.
export const topicMark = (tab, h = 12) => {
  const c = tabColor(tab, theme() ?? {});
  return div().w(3).h(h).flex_none().rounded(1.5).when(Boolean(c), (el) => el.bg(c));
};
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
  // From a room, the Desk (desk-view) or Home (home-view) back to the topic.
  const at = findNode(layout(), "center")?.active;
  if (at && at !== "tab-view") run("layout.select", { stack: "center", child: "tab-view" });
  if (findNode(layout(), "crew-composer") && !findNode(layout(), "crew-composer").hidden) run("layout.hide", { id: "crew-composer" });
}

// ── Home: the head pal's page (RECIPE "Home"; DeNon via Orca, 2026-11-08) ─────────────────────
// The center stack's home-view (crew-home). It's the default when you click the head pal; the
// hero's Home pebble, the command bar and Ctrl+Shift+H (crew-roster.home) open it too, and again go
// back to the topic. Showing it also shows the head pal, so the hero is Orca's.
export const HOME_FILE = "data/crew-home/home.json";
export const INSTALLS_FILE = "data/crew-installs.jsonl";
export const homeMode = () => findNode(layout(), "center")?.active === "home-view";
export const hasHome = () => Boolean(findNode(layout(), "home-view"));
export const headSpace = (all = spaces(), c = crew()) => all.find((s) => botOf(s, c).god) ?? null;
export function showHome() {
  if (!hasHome()) return false;
  const head = headSpace();
  if (head && !head.active) run("space.select", { id: head.id });
  run("layout.select", { stack: "center", child: "home-view" });
  if (findNode(layout(), "crew-composer") && !findNode(layout(), "crew-composer").hidden) run("layout.hide", { id: "crew-composer" });
  // Each showing is stamped, so Home knows to take the keyboard and start its review again: a hidden
  // view doesn't render, so Home can't see itself being hidden and shown (live test, 2026-11-08).
  setShared("crew.home.shown", (Number(shared("crew.home.shown")) || 0) + 1);
  return true;
}
export function toggleHome() { if (homeMode()) openTerminal(); else showHome(); }
// A topic's terminal, ready to type in (DeNon via Orca, 2026-11-08: "a fast, obvious way to Orca's
// terminal from Home"): leave Home / a room / the Desk, show the pal and topic, and give its lead pane
// the keyboard (otherwise it stays on the hidden view). No space: the head pal; no tab: its shown one.
export function openTerminal(space = null, tab = null) {
  const s = space ?? headSpace();
  if (!s) { showTabs(); return false; }
  const t = tab ?? s.tabs.find((x) => x.active) ?? s.tabs[0] ?? null;
  showTabs();
  run("space.select", { id: s.id });
  if (t) run("tab.select", { id: t.id });
  const p = t ? leadPane(t.id) : null;
  if (p?.terminal) run("pane.focus", { terminal: p.terminal });
  return true;
}
// home.json as crewhome.load() reads it (missing or broken: empty).
export function homeData(raw) {
  let h = null;
  try { h = JSON.parse(raw ?? "null"); } catch { h = null; }
  const ok = h && typeof h === "object" && !Array.isArray(h);
  const rel = ok && h.release && typeof h.release === "object" ? h.release : {};
  return {
    seen: ok ? Number(h.seen) || 0 : 0,
    items: ok && Array.isArray(h.items) ? h.items.filter((x) => x && typeof x === "object" && x.id) : [],
    release: { next: rel.next ?? null, note: rel.note ?? null, queued: Array.isArray(rel.queued) ? rel.queued.filter((q) => q && q.id) : [] },
    // The askers' picks for approvals and Desk cards (pal home recommend): { "a-…": { option, why, by, at } }.
    recs: ok && h.recs && typeof h.recs === "object" && !Array.isArray(h.recs)
      ? Object.fromEntries(Object.entries(h.recs).filter(([, v]) => v && typeof v === "object" && v.option)) : {},
  };
}
// JSON lines → objects (bad lines skipped).
export const jsonLines = (text) => String(text ?? "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
// Ages as Home shows them: "now", "12m", "2h 9m", "3d".
export function homeAge(ms, now = Date.now()) {
  const s = Math.max(0, (now - (ms || 0)) / 1000);
  if (!ms) return "";
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}
// The feed since `since` as Home's "Since you last looked" rows: tasks done, and one row per topic
// that finished (with how many turns), only from the last 24 h (Orca's call, 2026-11-08). Newest first.
export function feedSince(feed, since, now = Date.now()) {
  const from = Math.max(since || 0, now - 86400000);
  const out = [], topics = new Map();
  for (const e of feed) {
    if (!e || !(e.at > from)) continue;
    if (e.kind === "task" && e.status === "done") out.push({ kind: "task", at: e.at, id: e.task, title: e.title ?? "", by: e.by ?? "" });
    else if (e.kind === "finished" && e.bot) {
      const k = `${e.bot}#${e.channel ?? ""}`;
      const t = topics.get(k) ?? { kind: "finished", bot: e.bot, channel: e.channel ?? "", at: 0, turns: 0 };
      t.turns++; t.at = Math.max(t.at, e.at);
      topics.set(k, t);
    }
  }
  return [...out, ...topics.values()].sort((x, y) => y.at - x.at);
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
    + `Catch up any time with: pal-room read ${room.slug}. Keep room updates short; do the work in your own topic. `
    + `See the whole team with: pal team. Bring another pal in with: pal-room invite ${room.slug} "Pal" (or "Pal#topic"). `
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
const BYPASS = {
  claude: "--dangerously-skip-permissions", "claude-code": "--dangerously-skip-permissions",
  antigravity: "--dangerously-skip-permissions", "antigravity-cli": "--dangerously-skip-permissions", agy: "--dangerously-skip-permissions",
  codex: "--dangerously-bypass-approvals-and-sandbox",
  gemini: "--yolo",
};
export function withBypass(key, argv) {
  if (!bypassOn()) return argv;   // only when the owner turned it on (About → Settings)
  const flag = BYPASS[key] ?? (isAgy(key, argv) || isClaude(key, argv) ? "--dangerously-skip-permissions" : null);
  return flag && argv?.length && !argv.includes(flag) ? [...argv, flag] : argv;
}

// Antigravity CLI takes its initial interactive prompt via `-i <prompt>`, whereas a trailing
// positional argument is parsed as a subcommand and causes `agy` to exit immediately.
// Claude Code's grey prompt suggestions sit in an empty input box, and `hc read` is plain text, so
// crewd took them for unsent drafts and held queued messages behind them (about an hour on
// 2026-11-08; the Desk design §6.7). Pals start with them off, on their own command line only: the
// stored argv and ~/.claude/settings.json stay as they are, so the person's other Claude Code sessions
// keep them. "pal_prompt_suggestions": "keep" in crew-settings.json leaves them on; an argv that
// already passes --settings is left alone.
export const NO_PROMPT_SUGGESTIONS = ["--settings", JSON.stringify({ promptSuggestionEnabled: false })];
// And the Desk's Claude Code mod (claude-mod/pals, installed to ~/.claude/project-pals/pals: Desk
// stage 5): crew-settings.json "claude_mod" names its folder; each Claude Code pal loads it with
// --plugin-dir, so it's only ever in pals' sessions, never your other Claude Code sessions.
// Codex pals (no delivery hooks): the Desk's MCP server (bin/crew-mcp, crew-settings.json "codex_mcp"),
// given on their own command line, so ~/.codex/config.toml isn't touched (Desk stage 6).
export function palArgv(argv, key) {
  if (argv?.length && isCodex(key, argv)) {
    const mcp = shared("crew.settings")?.codex_mcp;
    if (!mcp || argv.some((x) => String(x).includes("mcp_servers.pals"))) return argv;
    return [...argv, "-c", `mcp_servers.pals.command=${JSON.stringify(mcp)}`];
  }
  if (!argv?.length || !isClaude(key, argv)) return argv;
  const mod = shared("crew.settings")?.claude_mod;
  const out = mod && !argv.includes("--plugin-dir") ? [...argv, "--plugin-dir", mod] : argv;
  if (shared("crew.settings")?.pal_prompt_suggestions === "keep") return out;
  if (out.some((x) => x === "--settings" || String(x).startsWith("--settings="))) return out;
  return [...out, ...NO_PROMPT_SUGGESTIONS];
}
export function launchSpec(key, argv, task) {
  const t = String(task ?? "").trim();
  if (!argv?.length) return { argv: undefined, task: undefined };
  argv = palArgv(argv, key);
  if (!t) return { argv, task: undefined };
  if (isAgy(key, argv)) return { argv: [...argv, "-i", t], task: undefined };
  return { argv, task: t };
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
  return tab ? { space, tab } : { error: `${space.name} has no #${ch}. Topics: ${space.tabs.map((t) => "#" + channelName(t)).join(", ")}` };
}

// Keep your view where it was while a pal makes something.
function holdView() {
  const space = spaces().find((s) => s.active), tab = space?.tabs.find((t) => t.active);
  return () => { if (space) run("space.select", { id: space.id }); if (tab) run("tab.select", { id: tab.id }); };
}

async function brainFor(harness, machine) {
  const all = await knownAgents({ on: machine ?? null });
  const h = (harness ?? "claude").toLowerCase();
  const want = h === "agy" || h === "antigravity-cli" ? "antigravity" : h;
  const found = all.find((x) => x.key === h) ?? all.find((x) => x.key === want)
    ?? all.find((x) => x.name.toLowerCase() === h || x.name.toLowerCase() === want)
    ?? all.find((x) => progBase(x.run) === h)
    ?? all.find((x) => x.name.toLowerCase().includes(want) || x.key.includes(want));
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
    // Only the owner hires the Chief (pal hire --chief takes their click); a request from a pal's terminal can't.
    if (req.chief && req.by) throw new Error("only the owner hires the Chief");
    if (req.chief && chiefOf()) throw new Error(`you already have a Chief: ${chiefOf().name}`);
    const role = req.chief ? CHIEF_ROLE : req.role || (req.god ? "Overseer" : req.partner ? PARTNER_ROLE : "Pal");
    const argv = withModel(withBypass(brain.key, brain.run), brain.key, req.model || null);
    const c = crew();
    const rec = {
      id: newId(), name, role, harness: brain.key, harnessName: brain.name, argv, machine, folder: req.folder || null,
      categories: { [channel]: "General" }, briefs: req.task ? { [channel]: req.task } : {}, memory: "", hired: Date.now(),
      hiredBy: req.byName ?? null, ...(req.god ? { god: true } : {}), ...(req.partner ? { partner: true } : {}),
      ...(req.chief ? { chief: true } : {}),
    };
    saveCrew({ ...c, bots: [...c.bots, rec] });
    const back = req.show ? null : holdView();
    const hint = primerHint(argv, brain.key);
    const prompt = req.task ? [req.task, hint].filter(Boolean).join("\n\n") : hint;
    const spec = launchSpec(brain.key, argv, prompt);
    run("space.new", { name, tab: channel, argv: spec.argv, machine: machine ?? "", folder: req.folder || undefined, task: spec.task });
    const made = spaces().find((s) => s.name === name);
    if (made) saveCrew({ ...crew(), bots: crew().bots.map((b) => (b.id === rec.id ? { ...b, space: made.id } : b)) });
    back?.();
    notify({ title: req.byName ? `${req.byName} hired ${name}` : `Hired ${name}`, body: `${brain.name}${machine ? ` on ${machine}` : ""} · ${channel}`, level: "success", timeout: 4000 });
    if (isClaude(brain.key, argv)) watchTrust(name, channel);
    return { ok: true, name, space: made?.id ?? null, channel, harness: brain.name, argv };
  },

  async channel(req) {
    const f = findChannel(req.bot);
    if (f.error) throw new Error(f.error);
    const { space } = f;
    const name = "#" + (req.name ?? "").replace(/^#/, "").trim().replace(/\s+/g, "-");
    if (name === "#") throw new Error("name the topic");
    if (space.tabs.some((x) => channelName(x).toLowerCase() === name.slice(1).toLowerCase())) throw new Error(`${space.name} already has ${name}`);
    const bot = botOf(space);
    // Its brain (topicBrains): asked for, the pal's own, then a guess. A pal asleep with no brain on
    // record used to get a bare shell and lose its brief (T24); now it starts a brain or says why not.
    const by = req.by ? findChannel(req.by) : null;
    const callerKey = by?.space ? brainOf(by.space) : null;
    let brainKey = null, argv, why = null, brainLabel = null;
    const tried = [];
    for (const c of topicBrains(req, bot, callerKey)) {
      if (c.argv) { brainKey = c.key; argv = c.argv; why = c; brainLabel = bot.harnessName ?? c.key ?? "its own command"; break; }
      try { const b = await brainFor(c.key, space.machine); brainKey = b.key; argv = withBypass(b.key, b.run); why = c; brainLabel = b.name; break; }
      catch (e) { tried.push(String(e?.message ?? e)); if (c.why === "asked") break; }
    }
    if (!argv) throw new Error(`couldn't start a brain for ${space.name} ${name}: ${tried.join("; ") || "none known"}. Name one with --harness`);
    if (why.guessed) updateBot(bot.record ?? bot, (b) => ({ ...b, brains: { ...(b.brains ?? {}), [name]: brainKey } }));
    if (req.model !== undefined && argv) argv = withModel(argv, brainKey, req.model || null);
    const category = req.category || "Topics";
    updateBot(bot.record ?? bot, (b) => ({
      ...b,
      categories: { ...(b.categories ?? {}), [name]: category },
      briefs: req.brief ? { ...(b.briefs ?? {}), [name]: req.brief } : (b.briefs ?? {}),
      ...(req.worktree ? { worktrees: { ...(b.worktrees ?? {}), [name]: req.worktree } } : {}),
    }));
    const memory = (bot.memory ?? "").trim();
    const where = req.worktree ? `You work on your own git branch ${req.worktree.branch} in this folder (a worktree of the project); commit there. ${owner()} reviews and lands it.` : "";
    const task = [req.brief && `You are ${bot.name} in ${name}. ${req.brief}`, where, primerHint(argv, brainKey), memory && `Things to remember: ${memory}`].filter(Boolean).join("\n\n");
    const spec = launchSpec(brainKey, argv, task);
    const back = holdView();
    run("tab.new", { space: space.id, name, argv: spec.argv, folder: req.folder || bot.folder || space.folder || undefined, task: spec.task });
    back();
    notify({ title: `${req.byName ?? "A pal"} added ${space.name} ${name}`, body: why.guessed ? `${brainLabel} (its own brain wasn't known)` : undefined, level: "success", timeout: 3500 });
    if (isClaude(brainKey, argv)) watchTrust(space.name, name);
    return { ok: true, bot: space.name, channel: name, argv, harness: brainLabel, brainKey, why: why.why, guessed: why.guessed, awake: bot.awake };
  },

  // pal wake (in place: the topic's shell is still there): which brain it starts again, T27's order
  // per topic. The CLI strips one-shot flags, adds the resume and types it in.
  async "wake-brain"(req) {
    const space = spaces().find((s) => s.id === req.space);
    if (!space) throw new Error("that pal isn't open");
    const tab = space.tabs.find((t) => t.id === req.tab) ?? null;
    const rec = botOf(space).record ?? null;
    const topicKey = tab ? (rec?.brains?.[tab.id] ?? rec?.brains?.[tab.name] ?? rec?.brains?.[`#${channelName(tab)}`] ?? null) : null;
    return { ok: true, ...(await wakeBrain(rec, topicKey, space.machine)) };
  },

  // pal sleep / pal wake --notify (the menus run them detached): what happened, as a toast, so a
  // refusal's reason reaches the person. Fixed titles; the CLI's own lines.
  async "power-report"(req) {
    const lines = (Array.isArray(req.lines) ? req.lines : []).map((l) => String(l).slice(0, 200)).slice(0, 12);
    if (!lines.length) return { ok: true };
    notify({ title: req.mode === "wake" ? "Wake (resume topics)" : "Sleep (keep topics, free RAM)", body: lines.join("\n"),
      level: req.refused ? "warning" : "success", timeout: req.refused ? 12000 : 5000 });
    return { ok: true };
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

// Claude Code and Antigravity CLI pals get the pal primer and their memory from the SessionStart
// hook (unless installed with --no-helpers); other harnesses are told where to find them.
export function primerHint(argv, key) {
  const prog = progBase(argv);
  if (!prog) return "";
  if (isClaude(key, argv) && helpersOn("claude")) return "";
  if (isAgy(key, argv) && helpersOn("agy")) return "";
  return "First run `pal primer` and `pal memory` to learn how the crew works and what you remember.";
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
  const spec = launchSpec(key, argv, task);
  const back = holdView();
  run("tab.new", { space: space.id, name, argv: spec.argv, folder: space.folder || rec?.folder || undefined, task: spec.task });
  back();
  if (rec) updateBot(rec, (b) => ({ ...b, categories: { ...(b.categories ?? {}), [name]: "Rooms" } }));
  for (let i = 0; i < 20; i++) {
    const tab = spaces().find((s) => s.id === space.id)?.tabs.find((t) => t.name === name);
    if (tab) return tab;
    await pause(0.25);
  }
  throw new Error(`couldn't wake ${space.name} (its new topic didn't appear)`);
}

// For the regression tests (tests/test_palrows.mjs: T24's asleep pal).
export const requestHandlers = HANDLERS;

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

// An owner decision from a click (approve, deny, accept or decline a proposal, write AGENTS.md,
// set a mission, move or rewrite a brain): the app writes a one-time token for exactly these
// arguments, and the pal command consumes it (bin/crewlib.py owner_gate; Codex review H1). Without a
// token, those commands refuse everyone: there is no terminal fallback (review H1).
export async function ownerCli(args) {
  return crewCli([...args, "--click", await clickToken(args)]);
}

// A one-time token for exactly `args` (bin/crewlib.py owner_gate): proof that the owner clicked.
export async function clickToken(args) {
  const nonce = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const dir = `${appHome()}/data/crew-clicks`;
  await exec("mkdir", ["-p", dir]);
  await writeTextFile(`${dir}/${nonce}.json`, JSON.stringify({ args, at: Date.now() }), null);
  return nonce;
}

// Run the pal command (as the owner: the app isn't a pal's terminal).
export async function crewCli(args) {
  const r = await exec(`${home()}/.local/bin/pal`, args);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").slice(-3).join(" ") || "crew failed");
  return r.stdout;
}

// Pop out (T70): a topic's live terminal in its own desktop window, which the window manager can pin
// to every workspace and resize (bin/crewpopout.py; the crew-popout-bar mod is its bar). Herdr's
// "window" overlays live inside this window, so they can't be pinned. The owner's click.
export const popOutArgs = (space, tab) => ["popout", `${space.name}#${channelName(tab)}`];
export async function popOut(space, tab) {
  if (!space || !tab) return false;
  try {
    const out = await ownerCli(popOutArgs(space, tab));
    if (/^focused/.test(out)) notify({ title: "Already popped out", body: "That topic's window is open; it was brought up.", level: "info", timeout: 3000 });
    return true;
  } catch (e) {
    notify({ title: "Couldn't pop it out", body: String(e?.message ?? e), level: "warning", timeout: 6000 });
    return false;
  }
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
  thumb: "#FFFFFF26", thumbHot: "#FFFFFF4D",
};
const DS_LIGHT = {
  bg0: "#FFFFFF", bg1: "#F7F7F8", inset: "#F3F3F4", raised: "#F0F0F1", composer: "#FFFFFF",
  bubble: "#F0F0F1", bubbleOld: "#F5F5F6", sel: "#E8E8EA", ctl: "#E4E4E7", hover: "#F0F0F1",
  line: "#E4E4E7", lineSoft: "#EDEDF0", lineMid: "#D9D9DE", lineStrong: "#C9C9CE",
  fg1: "#111113", body: "#2E2E31", fg2: "#6B6B70", fg3: "#8A8A90", fg4: "#A0A0A6",
  icon: "#80808A", iconOn: "#4E5568", iconDim: "#A0A0A6",
  info: "#1F7AD6", infoText: "#1F7AD6", ok: "#0F8A5F", okHi: "#0F8A5F", warn: "#B07800", warnText: "#8A5A00", err: "#C83A3A",
  me: "#E3ECF5", meOld: "#EEF3F8", meEdge: "#1F7AD6", act: "#1F7AD6", actFg: "#FFFFFF", claude: "#D97757",
  thumb: "#0000002E", thumbHot: "#00000059",
};
const lumOf = (c) => { const h = String(c ?? "").replace("#", ""); if (h.length < 6) return 0; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function ds(t) {
  const c = lumOf(t?.background) > 0.5 ? DS_LIGHT : DS_DARK;
  return { ...c, r: { xs: 3, sm: 4, md: 6, lg: 8 }, mono: "JetBrains Mono", ui: "Inter" };
}

// ── Scrolling with a pill thumb (DeNon, 2026-11-08) ──────────────────────────────────────────
// Herdr's scrollbar is a hard-cut rectangle and a mod can't change its shape, width or radius (only
// the theme's colours reach it), nor read where a scroll area is. So our scroll areas are our own:
// `scrollArea` clips its content and moves it by an offset it keeps (wheel and trackpad, clamped
// to the measured sizes), and draws a 5 px thumb with fully round ends (radius = half its width),
// quiet grey, a touch brighter on hover and while dragged, and draggable. It sits 3 px in from the
// right edge, in the padding every list keeps there, so it never covers a time or a dot. Herdr
// draws no bar of its own on these (they don't ask for one). The state lives here, by id (each
// mod has its own copy of this file); the handlers' cx.notify() repaints the view that drew it.
const SCROLLS = new Map();   // id → { y, view, content, drag, hot }
export const THUMB = { w: 5, r: 2.5, min: 24, inset: 3, pad: 2 };
const zoomK = () => Number(herdrApi.settings?.()?.zoom) || 1;
export const scrollState = (id) => { let s = SCROLLS.get(id); if (!s) { s = { y: 0, view: 0, content: 0, drag: null, hot: false }; SCROLLS.set(id, s); } return s; };
// How far it can scroll, and the thumb's box: null when everything fits.
export function thumbGeom(view, content, y, min = THUMB.min, pad = THUMB.pad) {
  if (!(view > 0) || !(content > view + 0.5)) return null;
  const track = view - 2 * pad;
  const h = Math.max(Math.min(min, track), Math.round(track * view / content));
  const max = content - view;
  const top = pad + Math.round((track - h) * Math.min(1, Math.max(0, y / max)));
  return { top, h, max };
}
export const clampScroll = (s) => { s.y = Math.max(0, Math.min(s.y, Math.max(0, s.content - s.view))); return s.y; };
// Scroll so [top, top + h) is in view (the shown row, say); true when it moved.
export function scrollIntoView(id, top, h) {
  const s = scrollState(id), was = s.y;
  if (top < s.y) s.y = top; else if (top + h > s.y + s.view && s.view > 0) s.y = top + h - s.view;
  clampScroll(s);
  return s.y !== was;
}
export function scrollTo(id, y) { const s = scrollState(id); s.y = y; clampScroll(s); }
// The pill itself, for a scroll area (`g` from thumbGeom) or a virtual list (thumbFor).
function pill(d, id, s, g, onDrag) {
  const on = s.hot || Boolean(s.drag);
  // A 12 px strip catches the pointer; the pill inside is 5 px, round at both ends.
  return div().id(`${id}-thumb`).absolute().right(0).top(g.top).w(THUMB.w + 2 * THUMB.inset + 2).h(g.h).flex().justify_end().pr(THUMB.inset)
    .cursor_pointer()
    .on_hover((h, cx) => { if (s.hot !== h) { s.hot = h; cx.notify(); } })
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); s.drag = { y0: e.position.y / zoomK(), top0: g.top }; cx.notify(); })
    .child(div().w(THUMB.w).h(g.h).rounded(THUMB.r).bg(on ? d.thumbHot : d.thumb));
}
// A scroll area: `content` is the element that used to carry overflow_y_scrollbar (its padding,
// gap and children), minus its sizing. Size the returned element as the old one was (flex_1 +
// min_h(0), max_h(n), h(n)); a max_h area still hugs content that fits.
export function scrollArea(d, id, content) {
  const s = scrollState(id);
  const g = thumbGeom(s.view, s.content, s.y);
  const dragTo = (e, cx) => {
    if (!s.drag || !g) return;
    const track = s.view - 2 * THUMB.pad - g.h;
    const top = s.drag.top0 - THUMB.pad + (e.position.y / zoomK() - s.drag.y0);
    const y = track > 0 ? (top / track) * g.max : 0;
    if (Math.abs(y - s.y) >= 0.5) { s.y = y; clampScroll(s); cx.notify(); }
  };
  const end = (cx) => { if (s.drag) { s.drag = null; cx.notify(); } };
  return div().id(id).relative().overflow_hidden().flex().flex_col()
    .on_size_change((size, cx) => { const v = size.height / zoomK(); if (Math.abs(v - s.view) > 0.5) { s.view = v; clampScroll(s); cx.notify(); } })
    .on_scroll_wheel((e, cx) => {
      const before = s.y;
      s.y -= (e.delta?.y ?? 0) / zoomK();
      clampScroll(s);
      // At an end, let an outer area have the wheel.
      if (s.y !== before) { cx.stop_propagation(); cx.notify(); }
    })
    .on_mouse_move((e, cx) => dragTo(e, cx))
    .on_mouse_up("left", (_e, cx) => end(cx))
    .on_hover((h, cx) => { if (!h) { s.hot = false; end(cx); } })
    .child(div().id(`${id}-content`).relative().top(-Math.round(s.y)).flex_none().w_full().flex().flex_col()
      .on_size_change((size, cx) => { const c = size.height / zoomK(); if (Math.abs(c - s.content) > 0.5) { s.content = c; clampScroll(s); cx.notify(); } })
      .child(content))
    .when(Boolean(g), (el) => el.child(pill(d, id, s, g)));
}
// The same pill for a virtual list, which scrolls itself and tells us only which rows it drew:
// `range` is the renderer's last [start, end), `heights` the rows' heights (one number: uniform),
// `view` the list's height. Dragging scrolls to the row under the thumb (handle.scroll_to_item).
export function thumbFor(d, id, { range, count, heights, view, handle }) {
  const hs = typeof heights === "number" ? null : heights;
  const rowH = (i) => (hs ? hs[i] ?? 0 : heights);
  const content = hs ? hs.reduce((x, y) => x + y, 0) : heights * count;
  let y = 0;
  for (let i = 0; i < (range?.[0] ?? 0); i++) y += rowH(i);
  const s = scrollState(id);
  s.view = view; s.content = content; s.y = Math.min(y, Math.max(0, content - view));
  const g = thumbGeom(view, content, s.y);
  if (!g) return null;
  const toRow = (e, cx) => {
    if (!s.drag) return;
    const track = view - 2 * THUMB.pad - g.h;
    const top = s.drag.top0 - THUMB.pad + (e.position.y / zoomK() - s.drag.y0);
    let want = track > 0 ? (top / track) * g.max : 0, i = 0;
    while (i < count - 1 && want >= rowH(i)) { want -= rowH(i); i++; }
    handle?.scroll_to_item(i);
    cx.notify();
  };
  // While dragging, the overlay spans the list so the pointer can wander; otherwise it's the strip.
  return div().absolute().top(0).right(0).h(view).when(Boolean(s.drag), (el) => el.left(0)).when(!s.drag, (el) => el.w(THUMB.w + 2 * THUMB.inset + 2))
    .on_mouse_move((e, cx) => toRow(e, cx))
    .on_mouse_up("left", (_e, cx) => { if (s.drag) { s.drag = null; cx.notify(); } })
    .on_hover((h, cx) => { if (!h && s.drag) { s.drag = null; cx.notify(); } })
    .child(pill(d, id, s, g));
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
  if (nodeOf("profile")) { show("work", true); show("profile", false); show("profile-main", true); show("profile-dash", false); }
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
// The gear menu (crew-appmenu) fits its 13 rows and 3 dividers exactly: 4 px padding top and bottom,
// a 1 px border, 13 x 28 px rows, 15 x 1 px gaps and 3 x 7 px dividers = 410. Change it with the list.
export const APP_MENU = { width: 252, height: 438 };   // + the Chief row (28)
export const PANEL_PX = 420, PANEL_MIN = 360, PANEL_MAX = 640;
const clampPanel = (px) => Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(px)));
export const panelPref = () => clampPanel(shared("crew.settings")?.focus?.panelPx ?? PANEL_PX);
export const panelState = () => shared("crew.panel") ?? {};
export const panelOpen = () => { const n = nodeOf("profile"); return Boolean(n && !n.hidden); };
// The Vault (DeNon 2026-11-08: "vault replaces notebook mission and brain") is one tab whose notes
// are Home and the three old tabs. Their keys still work everywhere: openPanel("mission") opens the
// Vault on Mission, and an old saved crew.panel.tab reads as the Vault.
export const VAULT_NOTES = ["home", "mission", "notebook", "brain"];
const vaultSpec = (tab, note) => (tab === "vault" ? { tab: "vault", note: note ?? panelState().note ?? "home" }
  : VAULT_NOTES.includes(tab) ? { tab: "vault", note: tab } : { tab, note: null });
export const panelTab = () => vaultSpec(panelState().tab ?? "profile", panelState().note).tab;
// The Vault's shown note (null when another tab shows).
export const panelNote = () => vaultSpec(panelState().tab ?? "profile", panelState().note).note;
export const panelFull = () => panelOpen() && Boolean(nodeOf("work")?.hidden);
// The Profile tab (the dashboard) and the Vault open Full; AGENTS.md opens Side (P13).
export const panelSizeOf = (tab) => panelState().sizes?.[tab] ?? (tab === "profile" || tab === "vault" ? "full" : "side");
const showNode = (id, on) => { const n = nodeOf(id); if (n && Boolean(n.hidden) === on) run(on ? "layout.show" : "layout.hide", { id }); };
function layPanel(size, tab = panelTab()) {
  if (size === "full") {
    run("layout.resize", { id: "profile", weight: 1 });
    showNode("work", false);
  } else {
    showNode("work", true);
    run("layout.resize", { id: "profile", px: panelPref() });
  }
  // Full on Profile is the dashboard: its own small layout (profile-dash), with the shown channel's
  // live agent terminal in dash-term ({agent: "focused"}). Anything else is the one panel block.
  const dash = size === "full" && tab === "profile" && Boolean(nodeOf("profile-dash"));
  showNode("profile-main", !dash);
  showNode("profile-dash", dash);
  if (dash) focusShownAgent();
}
// Point the dashboard's terminal (an agent block) at the shown channel's agent.
export function focusShownAgent() {
  const sp = spaces().find((s) => s.active);
  const tab = sp?.tabs.find((x) => x.active);
  const lead = tab ? leadPane(tab.id) : null;
  if (lead?.terminal && lead.program?.agent) run("agent.focus", { terminal: lead.terminal });
  return lead;
}
export const dashShown = () => panelOpen() && !nodeOf("profile-dash")?.hidden && Boolean(nodeOf("profile-dash"));
// Open on a tab (section: a part of it to scroll to, e.g. "memory").
export function openPanel(which = "profile", opts = {}) {
  if (!nodeOf("profile")) return false;
  const { tab, note } = vaultSpec(which, opts.note);
  setShared("crew.panel", { ...panelState(), tab, note: note ?? panelState().note ?? null, section: opts.section ?? null, at: Date.now() });
  layPanel(panelSizeOf(tab), tab);
  if (nodeOf("profile").hidden) run("layout.show", { id: "profile" });
  return true;
}
export function closePanel() {
  if (nodeOf("work")?.hidden) run("layout.show", { id: "work" });
  if (panelOpen()) run("layout.hide", { id: "profile" });
}
// A trigger: opens on its tab, switches tab if the panel shows another, closes it if it's
// already on that tab.
export function togglePanel(which = "profile", opts = {}) {
  const { tab, note } = vaultSpec(which, opts.note);
  if (panelOpen() && panelTab() === tab && (!note || which === "vault" || panelNote() === note)) closePanel();
  else openPanel(which, opts);
}
// The header's ⤢ / ⤡: this tab's size, remembered per tab.
export function setPanelSize(size) {
  const st = panelState();
  setShared("crew.panel", { ...st, sizes: { ...(st.sizes ?? {}), [panelTab()]: size } });
  layPanel(size, panelTab());
}
// The pal menu (crew-palmenu): everything about the agent and its project. The header's chip that
// opened it is the command bar now (T18), whose empty list shows the same rows (palMenuItems).
export function openPalMenu(spaceId) {
  return openOverlay({ mod: "crew-palmenu", kind: "popup", frame: "none", width: 300, props: { space: spaceId } });
}
// A worktree channel's branch, for Review changes (bot.worktrees is keyed by "#name").
export const worktreeOf = (bot, tab) => (tab ? pick(bot?.worktrees, tab) ?? bot?.worktrees?.["#" + channelName(tab)] ?? null : null);
export function openReview(space, tab) {
  return openOverlay({ mod: "crew-review", kind: "dialog", width: 0.86, height: 0.88, props: { space: space.id, tab: tab.id } });
}
// Who a blocked channel is waiting on (T19). Claude Code reports `blocked` from the wording of the
// pal's last message (a question, "let me know which…", "should I proceed"), not only for a real
// prompt, so a pal that ends its turn asking the head pal ("Orca, should I…") or saying "tell
// Orca#general when…" shows as blocked too. That isn't a question for the owner. `msg` is what the
// agent reported (`hc get` → status.msg). Returns "pal" when it's plainly addressed to another pal,
// else "you": a prompt with no text, or anything unclear, still counts for the owner.
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function blockedFor(msg, { owner = "", pals = [] } = {}) {
  const m = String(msg ?? "").trim();
  if (!m) return "you";
  const word = (n) => new RegExp(`(^|[^\\w#])${escRe(n)}(?![\\w])`, "i");
  if (owner && owner !== "you" && word(owner).test(m)) return "you";
  if (/\bpal (?:tell|ask)\b/i.test(m)) return "pal";
  // A question to the owner that merely mentions a pal ("Should I ask Orca to review?") stays theirs.
  const asksOwner = /^(?:should|shall|can|may) i\b|^(?:do you want|want) me\b|\byour (?:ok|call|go-ahead|approval)\b/i.test(m);
  for (const p of pals.filter(Boolean)) {
    const n = escRe(p);
    if (new RegExp(`^@?${n}\\s*[,:—-]`, "i").test(m)) return "pal";           // "Orca, …" / "Orca: …"
    if (new RegExp(`(^|[^\\w])@?${n}#[\\w-]+`, "i").test(m)) return "pal";   // "Orca#general"
    if (!asksOwner && new RegExp(`\\b(?:tell|ask|ping|message|let|for|to)\\s+@?${n}(?![\\w])`, "i").test(m)) return "pal";
  }
  return "you";
}
// What blocked agents said, by address: { [address]: { seq, msg } }. Only blocked agents are asked
// (rare), and an answer is reused until the agent's report changes (its seq).
export async function blockedReports(prev = {}) {
  const out = {};
  for (const a of agents().filter((x) => x.status === "blocked")) {
    const old = prev[a.address];
    if (old && old.seq === a.seq) { out[a.address] = old; continue; }
    let msg = "";
    try { msg = JSON.parse((await exec("hc", ["get", a.address, "--json"], { timeout: 5000 })).stdout)?.status?.msg ?? ""; } catch {}
    out[a.address] = { seq: a.seq, msg };
  }
  return out;
}
// What needs DeNon (the status bar's "N need you"): questions for them, commands held for approval,
// channels that look stuck, and proposals. Finished channels are in the Inbox but don't need a
// decision, and neither does a pal asking another pal (T19: those are listed, not counted). `reports`
// is blockedReports(). `items` says why each one counts, for the tooltip. The roster publishes it as
// shared "crew.needs" so the status bar and the Inbox agree.
// Desk cards waiting on the owner: needs you, or in the owner's tray (_owner). Drafts aren't: they
// wait in Drafts until Sent. The header publishes these as shared("crew.desk").needs; Home uses the
// same filter, so the Inbox, Home and the status bar count agree.
export const needsYouCards = (cards = []) => cards.filter((c) => !c.unreadable && (c.status === "needs you" || c.tray === "_owner"))
  .map((c) => ({ id: c.id, title: c.title ?? "", from: c.from ?? "", from_kind: c.from_kind ?? "", to: c.to ?? "", tray: c.tray ?? "",
    kind: c.kind ?? "", note: c.last?.note ?? "", at: c.updated ?? "" }));

export function needsOf(all, ops, reports = {}, deskNeeds = []) {
  const pals = all.map((s) => s.name), who = owner();
  const byTab = {};
  for (const a of agents()) if (a.status === "blocked") (byTab[a.tab] ??= []).push(reports[a.address]?.msg ?? "");
  const items = [], toPals = [];
  for (const s of all) for (const tab of s.tabs) {
    if (tab.status !== "blocked") continue;
    const label = `${s.name} #${channelName(tab)}`;
    const msgs = byTab[tab.id] ?? [""];
    const others = pals.filter((n) => n !== s.name);
    if (msgs.every((m) => blockedFor(m, { owner: who, pals: others }) === "pal")) toPals.push({ tab: tab.id, label });
    else items.push({ why: "question", tab: tab.id, label });
  }
  for (const ap of ops?.approvals ?? []) items.push({ why: "approval", label: `${ap.rule ?? "command"} · ${ap.bot ?? "a pal"}${ap.channel ? ` #${ap.channel}` : ""}` });
  for (const st of Object.values(ops?.stalled ?? {})) items.push({ why: "stuck", label: `${st.bot ?? "a pal"}${st.channel ? ` #${st.channel}` : ""}` });
  for (const p of ops?.proposals ?? []) items.push({ why: "proposal", label: `${p.kind ?? "change"} · ${p.pal ?? p.by ?? "a pal"}` });
  for (const c of deskNeeds ?? []) items.push({ why: "card", card: c.id, label: `${c.title} · ${(c.from || "?").split("#")[0]}` });
  const n = (w) => items.filter((x) => x.why === w).length;
  return { count: items.length, asks: n("question"), approvals: n("approval"), stuck: n("stuck"), proposals: n("proposal"),
    cards: n("card"), items, toPals: toPals.length, toPalItems: toPals };
}
// The status bar's tooltip for "N need you": why each one counts, then what was left out.
export function needsTooltip(needs) {
  const word = { question: "Question", approval: "Approval", stuck: "Stuck", proposal: "Proposal", card: "Card" };
  const items = needs?.items ?? [];
  const shown = items.slice(0, 5).map((x) => `${word[x.why] ?? x.why}: ${x.label}`);
  if (items.length > 5) shown.push(`+${items.length - 5} more`);
  if (needs?.toPals) shown.push(`not counted: ${needs.toPals} asking a pal`);
  return shown.join(" · ");
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
  // Under SMALL_BELOW px the whole scene is a smudge: the head alone (pets.js small), no paw or bits.
  const small = w < SMALL_BELOW;
  const edge = tint && state !== "work" ? `${tint}66` : "#FFFFFF12";
  const box = div().relative().w(w).h(h).flex_none().rounded(r).bg(PET_BOX).border_1().border_color(edge);
  // Children are placed from the box's outer edge (Herdr places them inside its 1 px border).
  const at = (el, x, y, ew, eh) => el.absolute().left(x - 1).top(y - 1).w(ew).h(eh);
  if (state !== "work") {
    box.child(at(div(), px, py, pw, ph).child(image(petPath(p, state, 0, false, small)).w(pw).h(ph)));
    // Asks you: a brighter edge breathes over the hairline.
    if (state === "ask") box.child(at(div(), 0, 0, w, h).rounded(r).border_1().border_color(tint).loop("opacity", { from: 0.15, to: 1, period: 1100 }));
    return box;
  }
  if (small) return box.child(at(div(), px, py, pw, ph).child(image(petPath(p, "work", 0, false, true)).w(pw).h(ph)))
    .child(at(div(), 0, 0, w, h).child(petSaber(w, h, r, opts.back)));
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
  const small = w < SMALL_BELOW;
  if (state !== "work" || small) return box.child(at(div(), px, py, pw, ph).child(image(petPath(p, state, 0, true, small)).w(pw).h(ph)));
  box.child(at(div(), px, py, pw, ph).child(image(petPath(p, "work", 0, true)).w(pw).h(ph)))
    .child(at(div(), px, py, pw, ph).loop("opacity", { from: 0, to: 1, period: 760 }).child(image(petPath(p, "work", 1, true)).w(pw).h(ph)));
  const k = pw / bw, iw = PET_W * k, ih = PET_H * k, ix = px - bx * k, iy = py - by * k;
  return box.child(at(div(), ix, iy, iw, ih).loop("top", { from: iy, to: iy - ih * 0.16, period: 1700, easing: "ease-out" })
    .child(div().w(iw).h(ih).loop("opacity", { from: 1, to: 0, period: 1700, easing: "ease-out" }).child(image(BITS).w(iw).h(ih))));
}

// The lightsaber: a comet that laps the box's edge once every 1.6 s. Herdr can't blur, stroke a path
// or clip to a rounded shape, so it's faked: a comet-shaped sweep (pet-saber.svg, 40 slices fading
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
// `even`: share the row equally with the other even pebbles whatever their labels or counts (the
// hero's quick actions: a count appearing must not resize them). `slot`: the count's fixed width,
// kept even with no count, so the label never moves when one appears.
export function pebble(d, { id, icon = null, label = null, extra = null, onClick, tooltip = null, grow = false, even = false, slot = 0, primary = false, disabled = false, extraColor = null, w = null }) {
  const { h: H, r: R } = PEBBLE;
  const down = !disabled && pebbleState.down === id, hot = !disabled && pebbleState.hover === id;
  const faces = primary && !disabled ? PEBBLE_PRIMARY : PEBBLE_FACE;
  const ink = disabled ? d.fg4 : primary ? "#E3EEF9" : hot ? d.fg1 : d.body;
  return div().id(id).relative().h(H).flex_none().when(w != null, (el) => el.w(w)).when(grow && !even, (el) => el.flex_auto().min_w(0)).when(even, (el) => el.flex_grow(1).flex_basis(0).min_w(0)).when(!disabled, (el) => el.cursor_pointer())
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
      .when(Boolean(label) || slot > 0, (el) => el.px(9)).when(!label && !slot, (el) => el.w(H))
      .when(Boolean(icon), (el) => el.child(svg(`mods/crew-roster/icons/${icon}.svg`).size(12).flex_none().text_color(disabled ? d.fg4 : primary ? "#C9DCEF" : hot ? d.fg1 : d.iconOn)))
      .when(Boolean(label), (el) => el.child(div().min_w(0).truncate().text_size(12).line_height("16px").font_weight(500).text_color(ink).child(label)))
      .when(extra != null && !slot, (el) => el.child(div().flex_none().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(String(extra))))
      .when(slot > 0, (el) => el.child(div().w(slot).flex_none().text_size(11).line_height("14px").font_weight(500).text_color(extraColor ?? d.fg3).child(extra != null ? String(extra) : ""))));
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
      .when(Boolean(sub), (el) => el.child(div().text_size(12).line_height("16px").text_color(d.fg2).child(sub))))
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
// sheetPanel is the list's content (add the options to it); sheetPanelBox places it: a quiet r6
// box that scrolls past `maxH` with the pill thumb (scrollArea).
export function sheetPanel(d, id) {
  return div().id(`${id}-list`).flex().flex_col().gap(1).p(4);
}
export function sheetPanelBox(d, id, panel, maxH = 180) {
  return scrollArea(d, id, panel).max_h(maxH).rounded(6).bg(d.raised).border_1().border_color(d.line);
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
    .child(div().flex_1().min_w(0).text_size(11).line_height("14px").text_color(d.fg4).child(hint))
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

// Dates and numbers without Intl (Herdr's JS has no locale data: toLocaleDateString's options are
// ignored and toLocaleString adds no separators).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const shortDate = (ms, weekday = false) => { const d = new Date(ms); return `${weekday ? WEEKDAYS[d.getDay()] + " " : ""}${MONTHS[d.getMonth()]} ${d.getDate()}`; };
export const shortTime = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const num = (n) => String(Math.round(n ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// A key's name as people read it ("ctrl-shift-i" → "Ctrl+Shift+I"), from keys.json; null if unbound.
export function keyHint(action) {
  const k = keys().find((x) => x.action === action);
  return k ? k.keys.split("-").map((p) => (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join("+") : null;
}

// ─── The command bar (T18, DeNon 2026-11-08: "this pill is redundant maybe it should be a global
// search / command type of thing, the things that are in the dropdown already there are perfect") ───
//
// The header's centre: a quiet recessed search field (a magnifier, "Search pals, channels, tasks… or
// run a command", the shortcut as a tiny pebble). A click, or the shortcut
// (crew-header.search in keys.json, Ctrl+Shift+Space), opens crew-command over it: the same field,
// live, with the pal menu's items and the global ones under it; typing searches everything.

export const COMMAND_W = 560;        // the popup
export const COMMAND_H = 552;        // fits the empty list (the pal menu, then the global commands)
export const FIELD_MAX = 520;        // the header's field, at most
export const COMMAND_PAD = 6;        // the popup's padding around its live field
export const SEARCH_HINT = "Search pals, topics, tasks… or run a command";

// Open the command bar with its top edge on the field's: `field` is the field's window position
// and width ({x, y, w}); the popup is centred on it and kept inside the window's left edge.
export function openCommandBar(spaceId, field) {
  // The popup's own field sits COMMAND_PAD in from its top: open that much higher, so the two meet.
  const at = field ? { x: Math.max(8, Math.round(field.x + field.w / 2 - COMMAND_W / 2)), y: Math.max(0, Math.round(field.y) - COMMAND_PAD) } : undefined;
  return openOverlay({ mod: "crew-command", kind: "popup", frame: "none", width: COMMAND_W, height: COMMAND_H, ...(at ? { at } : {}), props: { space: spaceId ?? null } });
}

const commandFieldState = { hover: false };
// The command field's recessed look (DeNon, 2026-11-08): a shade darker than the header, a faint
// dark line inside the top, a very faint light one inside the bottom, r7, no outer shadow; hover a
// touch lighter; open (the command bar showing) a subtle blue inner ring. Shared by the header's
// field and the command bar's live one.
export function recessedField(d, id, { hot = false, open = false } = {}) {
  const dark = d.bg0 !== "#FFFFFF";
  const R = PEBBLE.r;
  const face = dark ? (hot ? "#0E0E10" : "#08080A") : (hot ? d.bg1 : d.inset);
  return div().id(id).relative().flex().items_center().h(30).rounded(R).bg(face)
    .border_1().border_color(open ? d.info + "73" : dark ? "#FFFFFF08" : d.line)
    .child(div().absolute().top(0).left(R - 1).right(R - 1).h(1).bg(dark ? "#00000080" : "#0000000F"))
    .child(div().absolute().bottom(0).left(R - 1).right(R - 1).h(1).bg(dark ? "#FFFFFF0A" : "#FFFFFFB3"));
}
// A tiny raised pebble for a key ("Ctrl+Shift+Space", "esc"): h18, r4, the pebble face and lift.
export function keyCap(d, text) {
  const dark = d.bg0 !== "#FFFFFF";
  return div().relative().flex_none().h(18).px(5).flex().items_center().rounded(d.r.sm)
    .bg(dark ? PEBBLE_FACE.rest : d.bg0).border_1().border_color(dark ? "#00000080" : d.lineMid).when(dark, (el) => el.shadow_xs())
    .when(dark, (el) => el.child(div().absolute().top(0).left(3).right(3).h(1).bg("#FFFFFF0F")))
    .child(div().text_size(10.5).line_height("14px").font_family(d.mono).text_color(d.fg3).child(text));
}
// The header's field: w px wide, a magnifier, the hint and its shortcut (no pet: DeNon took it out).
// onOpen(e) gets the press, whose position minus local_position is the field's window position.
export function commandField(d, { w, onOpen }) {
  const hot = commandFieldState.hover;
  const open = Boolean(shared("crew.command.open"));
  const hint = keyHint("crew-header.search");
  return recessedField(d, "crew-search", { hot, open }).flex_none().w(w).pl(10).pr(5).gap(8).cursor_pointer()
    .on_hover((on, cx) => { commandFieldState.hover = on; cx.notify(); })
    // The bar under it drags the window, so stop the press.
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); onOpen(e); })
    .child(svg("mods/crew-roster/icons/ds-search.svg").size(13).flex_none().text_color(hot ? d.fg3 : d.fg4))
    .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(hot ? d.fg2 : d.fg3).child(SEARCH_HINT))
    .when(Boolean(hint) && w >= 360, (el) => el.child(keyCap(d, hint)));
}

// The pal menu's rows (DeNon: "perfect"), shared by crew-palmenu and the command bar's empty list:
// [group, id, icon, label, hint, action]. `open`: this pal's open task count.
export function palMenuItems(space, bot, open = 0) {
  const tab = space.tabs.find((x) => x.active);
  const wt = worktreeOf(bot, tab);
  // The same row again closes the panel; another row switches it.
  const panel = (key, section) => () => {
    const st = panelState();
    if (panelOpen() && panelTab() === key && (st.section ?? null) === (section ?? null)) closePanel();
    else openPanel(key, section ? { section } : {});
  };
  const out = [
    ["The pal", "profile", "ds-user", "Profile", keyHint("crew-roster.profile"), panel("profile")],
    // The Vault replaced Notebook, Mission and Brain (DeNon 2026-11-08): one row, opening on Home.
    ["The pal", "vault", "ds-notebook", "Vault", null, () => (panelOpen() && panelTab() === "vault" ? closePanel() : openPanel("vault", { note: "home" }))],
    ["The pal", "memory", "ds-memory", "Memory", null, panel("profile", "memory")],
    // Tasks: add one for this pal and see its open ones (the crew-tasks dialog; Tell merged into it).
    ["The pal", "tasks", "ds-tasks", "Tasks", open ? `${open} open` : null, () => openOverlay({ mod: "crew-tasks", kind: "dialog", width: 520, props: { space: space.id } })],
  ];
  out.push(["The project", "agents", "ds-agents", "AGENTS.md", null, panel("agents")]);
  if (wt) out.push(["The project", "review", "ds-review", "Review changes", wt.branch ?? `#${channelName(tab)}`, () => openReview(space, tab)]);
  if (bot.folder ?? space.folder) out.push(["The project", "folder", "ds-folder", "Open folder", null, () => exec("xdg-open", [bot.folder ?? space.folder]).catch(() => {})]);
  if (bot.awake) out.push(["", "doze", "ds-moon", SLEEP_LABEL, null, () => powerPals("sleep", [space.name])]);
  else if (!space.machine && space.tabs.length) out.push(["", "doze", "ds-moon", WAKE_LABEL, null, () => powerPals("wake", [space.name])]);
  if (!bot.god) out.push(["", "sleep", "x", CLOSE_LABEL, null, () => sleepPal(space, bot)]);
  return out;
}

// The words for the two ways a pal rests (Orca, T41): sleeping in place keeps its topics' tabs and
// frees the agent's RAM; closing ends its space (it waits under Hidden pals and wakes by reopening).
export const SLEEP_LABEL = "Sleep (keep topics, free RAM)";
export const WAKE_LABEL = "Wake (resume topics)";
export const CLOSE_LABEL = "Close pal (end its space)";

// Sleep or wake pals or topics ("Pal", "Pal#topic") in their own tabs, through pal sleep / pal wake
// (bin/crewsleep.py has the safety rules). One detached shell: a menu closes on click, which would cut
// a task of its own short. It writes the click's one-time token for exactly these arguments (as
// clickToken does: only the owner's click puts the head pal to sleep) and starts pal with it;
// --notify brings the outcome (and any refusal's reason) back as a toast.
export function powerPals(mode, names) {
  const who = [...new Set(names.filter(Boolean))];
  if (!who.length || !["sleep", "wake"].includes(mode)) return;
  const args = [mode, "--notify", ...who];
  const nonce = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  exec("sh", ["-c", 'd="$1"; n="$2"; t="$3"; pal="$4"; shift 4; mkdir -p "$d" && printf "%s" "$t" > "$d/$n.json" && '
    + 'nohup "$pal" "$@" --click "$n" >/dev/null 2>&1 </dev/null &',
    "sh", `${appHome()}/data/crew-clicks`, nonce, JSON.stringify({ args, at: Date.now() }), `${home()}/.local/bin/pal`, ...args]).catch(() => {});
  notify({ title: mode === "sleep" ? "Putting to sleep…" : "Waking…", body: who.join(", "), level: "info", timeout: 2500 });
}
// A topic's agent is running (its lead pane's program is an agent).
export const topicAwake = (tab, all = panes()) => Boolean(leadPane(tab.id, all)?.program?.agent);

// Put a pal to sleep: remember its folder, brain and model, then close its space.
export function sleepPal(space, bot) {
  updateBot(bot.record ?? bot, (b) => ({ ...b, folder: b.folder ?? space.folder ?? null, harness: b.harness ?? bot.harness ?? null }));
  rememberModel(space).catch(() => {}).finally(() => run("space.close", { id: space.id }));
}

// The gear menu's rows (crew-appmenu), shared with the command bar: { label, icon, key?, go } and
// { sep: true }. `quick`: the ones the command bar lists when its box is empty.
export function appMenuItems() {
  const dialog = (mod, width, extra = {}) => () => openOverlay({ mod, kind: "dialog", width, ...extra });
  const view = (v) => () => setShared("crew.view", v);
  return [
    { id: "hire", label: "Hire a pal…", icon: "plus", key: keyHint("crew-roster.hire"), quick: true, go: dialog("crew-hire", 520, { modal: true }) },
    { id: "room", label: "New room…", icon: "users", go: dialog("crew-room-new", 520, { modal: true }) },
    { id: "group", label: "New group…", icon: "plus", quick: true, go: dialog("crew-group", 400, { props: { mode: "new" } }) },
    { sep: true },
    { id: "drop", label: "Drop a card…", icon: "ds-send", key: keyHint("crew-header.drop"), quick: true, go: () => openDrop() },
    { id: "desk", label: "Desk", icon: "ds-inbox", go: () => showDesk() },
    { id: "home", label: `${headName()} home`, icon: "ds-home", key: keyHint("crew-roster.home"), quick: true, go: () => toggleHome() },
    { id: "chief", label: chiefOf()?.name ?? CHIEF_NAME, icon: "ds-terminal", key: keyHint("crew-roster.chief"), quick: true, go: () => toggleChief() },
    { id: "inbox", label: "Inbox", icon: "ds-check", go: view("you") },
    { id: "rooms", label: "Rooms", icon: "users", go: view("rooms") },
    { id: "routines", label: "Routines", icon: "clock", key: keyHint("crew-roster.routines"), go: () => openOverlay({ mod: "crew-routines", kind: "dialog", width: 520 }) },
    { sep: true },
    { id: "look", label: "Theme and look", icon: "ds-sun", go: () => run("app.settings", { section: "look" }) },
    { id: "layout", label: "Switch Herdr layout", icon: "layout-focus", key: keyHint("layout.switch"), go: () => run("layout.switch", {}) },
    { id: "machines", label: "Machines", icon: "server", go: () => run("app.settings", { section: "machines" }) },
    { id: "herdr-settings", label: "Herdr settings", icon: "settings", key: keyHint("app.settings"), go: () => run("app.settings", {}) },
    { id: "palette", label: "Command palette", icon: "search", key: keyHint("app.palette"), go: () => run("app.palette", {}) },
    { sep: true },
    { id: "update", label: "Check for updates", icon: "arrow-down", quick: true, go: dialog("crew-update", 480, { props: { check: true } }) },
    { id: "settings", label: "Project Pals settings", icon: "info", quick: true, go: dialog("crew-about", 480) },
  ];
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
  // A program's own name says nothing (agy and Antigravity CLI too, PR #1), nor does "<x> — fish".
  if (!title || /^(claude|claude code|antigravity|antigravity cli|agy|codex|grok|gemini|opencode|hermes|bash|zsh|fish|sh)$/i.test(title)
      || /\s[-—]\s*(agy|antigravity|fish|bash|zsh)$/i.test(title)) return null;
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
    // The last check that failed, when it's newer than the last answer (crewupdate.check records it).
    error: st.error && (st.tried ?? 0) > (st.checked ?? 0) ? st.error : null, tried: st.tried ?? 0,
    available: Boolean(st.latest && ins.version && verNewer(st.latest, ins.version)),
    run: run.state ? { ...run, state: run.state === "running" && !live ? "failed" : run.state,
      error: run.state === "running" && !live ? "The update stopped without finishing. Roll back puts the previous version back." : run.error } : null,
  };
}
// T64 (2026-11-09): About left open from the 0.4.0 update still said "You're up to date" after
// 0.4.1 shipped; it only asked GitHub when it opened. An open About or update dialog now asks again
// once the last answer is over 10 minutes old (and not more than once per 10 minutes); the button
// always asks. And it says what GitHub's newest was and when it asked, so an old answer reads old.
export const RECHECK_OPEN = 10 * 60;   // seconds
export function checkDue(checked, lastTry, now = Date.now() / 1000) {
  return now - (checked || 0) > RECHECK_OPEN && now - (lastTry || 0) > RECHECK_OPEN;
}
// "15:48", or "Nov 8 15:48" when it wasn't today.
export function checkedAt(s, now = Date.now() / 1000) {
  const d = new Date(s * 1000), n = new Date(now * 1000);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d.toDateString() === n.toDateString() ? hm : `${M[d.getMonth()]} ${d.getDate()} ${hm}`;
}
// One line: what the last check found and when; a failed check after it says so. u: readUpdate()'s
// shape (latest, checked, error, tried), or crew-update.json's.
export function checkLine(u, now = Date.now() / 1000) {
  const err = u.error && (u.tried || 0) > (u.checked || 0) ? u.error : null;
  const found = !u.checked ? "Not checked yet"
    : `${u.latest ? `GitHub's newest: ${u.latest}` : "No releases on GitHub"} · checked ${checkedAt(u.checked, now)}`;
  return err ? `Couldn't check at ${checkedAt(u.tried, now)} (${err}). ${u.checked ? `Last answer: ${found}` : found}` : found;
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
// The click's one-time token goes with it (pal update apply/rollback need the owner's click; Grok review H1).
export async function updateStart(kind = "apply") {
  const nonce = await clickToken(["update", kind, "--json"]);
  return exec("sh", ["-c", 'nohup "$1" update "$2" --json --click "$3" >/dev/null 2>&1 &', "sh", `${home()}/.local/bin/pal`, kind, nonce]);
}

// ─── The Desk (docs/desk/design.md; stage 2) ───────────────────────────────────────────────────
// Everything sent to a pal is a card: a Markdown file with flat front-matter under data/crew-desk/
// (bin/crewdesk.py writes them; `pal desk … --json` reads them for the app). parseCard / renderCard
// are crewdesk.parse / render line for line; tests/test_desk_parser.mjs runs both on
// tests/fixtures/desk/.

export const DESK_DIR = "data/crew-desk";
export const CARD_FIELDS = ["id", "kind", "status", "from", "from_kind", "proof", "relaying", "to", "urgency", "size",
  "held", "held_since", "task", "thread", "depth", "reply_to", "expires", "created", "updated", "attachments", "result"];
const CARD_RECEIPT = /^- (\S+) (.+?) · (.+?) · (.+?)(?: · (.*))?$/;
const CARD_ESCAPED = /^(\\*)(## (?:Reply|Receipts)\s*)$/;
const pyStrip = (s) => s.replace(/^\s+|\s+$/g, "");
const stripNl = (s) => s.replace(/^\n+|\n+$/g, "");
function unreadable(msg, line) { const e = new Error(`line ${line}: ${msg}`); e.line = line; return e; }

// A card's text → { ...front-matter, title, body, reply (null when none), receipts }. Throws an Error
// with .line (1-based) when it can't be read.
export function parseCard(text) {
  if (!text.startsWith("---\n")) throw unreadable("a card starts with --- and its front-matter", 1);
  const end = text.indexOf("\n---\n", 3);
  if (end < 0) throw unreadable("the front-matter has no closing ---", 1);
  const card = {};
  text.slice(4, Math.max(4, end)).split("\n").forEach((line, i) => {
    const n = i + 2;
    if (!pyStrip(line)) return;
    const at = line.indexOf(":");
    const k = pyStrip(at < 0 ? line : line.slice(0, at));
    if (at < 0 || !/^[a-z_]+$/.test(k)) throw unreadable(`expected key: value, got ${JSON.stringify(line.slice(0, 40))}`, n);
    let v = pyStrip(line.slice(at + 1));
    if ("[{\"".includes(v[0] ?? "x")) {
      try { v = JSON.parse(v); } catch { throw unreadable(`${k} isn't valid JSON`, n); }
    }
    card[k] = v;
  });
  const rest = text.slice(end + 5).split("\n");
  let first = text.slice(0, end + 5).split("\n").length;
  while (rest.length && !pyStrip(rest[0])) { rest.shift(); first++; }
  if (!rest.length || !rest[0].startsWith("# ")) throw unreadable("the title (a line starting with '# ') is missing", first);
  card.title = pyStrip(rest[0].slice(2));
  let lines = rest.slice(1);
  const lastIdx = (ls, h) => { for (let i = ls.length - 1; i >= 0; i--) if (ls[i].replace(/\s+$/, "") === h) return i; return -1; };
  const rec = lastIdx(lines, "## Receipts");
  const recLines = rec >= 0 ? lines.slice(rec + 1) : [];
  if (rec >= 0) lines = lines.slice(0, rec);
  const rep = lastIdx(lines, "## Reply");
  const reply = rep >= 0 ? lines.slice(rep + 1) : null;
  if (rep >= 0) lines = lines.slice(0, rep);
  const unescape = (ls) => ls.map((l) => l.replace(CARD_ESCAPED, (_m, bs, h) => bs.slice(1) + h));
  card.body = stripNl(unescape(lines).join("\n"));
  card.reply = reply === null ? null : stripNl(unescape(reply).join("\n"));
  card.receipts = [];
  for (const l of recLines) {
    const m = CARD_RECEIPT.exec(pyStrip(l));
    if (m) card.receipts.push({ at: m[1], status: m[2], by: m[3], via: m[4], note: m[5] ?? "" });
  }
  return card;
}

// Python's json.dumps(v, ensure_ascii=False): ", " and ": " between items.
function pyDumps(v) {
  if (Array.isArray(v)) return `[${v.map(pyDumps).join(", ")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${pyDumps(x)}`).join(", ")}}`;
  return JSON.stringify(v);
}
const cardValue = (v) => (typeof v === "object" && v !== null) || (typeof v === "string" && ("[{\"".includes(v[0] ?? "x") || v.includes("\n") || v !== pyStrip(v)))
  ? pyDumps(v) : typeof v === "boolean" ? (v ? "True" : "False") : String(v);

export function renderCard(card) {
  const out = ["---"];
  const skip = new Set([...CARD_FIELDS, "title", "body", "reply", "receipts"]);
  for (const k of [...CARD_FIELDS, ...Object.keys(card).filter((k) => !skip.has(k)).sort()]) {
    const v = card[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    out.push(`${k}: ${cardValue(v)}`);
  }
  out.push("---", `# ${card.title || "(no title)"}`, "");
  const escape = (t) => (t ?? "").split("\n").map((l) => l.replace(CARD_ESCAPED, (_m, bs, h) => "\\" + bs + h)).join("\n");
  if (card.body) out.push(escape(card.body), "");
  if (card.reply !== null && card.reply !== undefined) out.push("## Reply", escape(card.reply), "");
  out.push("## Receipts");
  for (const r of card.receipts ?? []) out.push(`- ${r.at} ${r.status} · ${r.by || "?"} · ${r.via || "?"}` + (r.note ? ` · ${r.note}` : ""));
  return out.join("\n") + "\n";
}

// crewlib.slug: a pal's desk folder.
export const deskSlug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
export const cardAge = (iso) => ago(Date.parse(iso ?? "") || 0);
export const CARD_OPEN = ["needs you", "held", "draft", "queued", "seen", "working", "blocked"];
export const CARD_STATUS_WORD = { "needs you": "Needs you", held: "Held", draft: "Drafts", queued: "Queued", seen: "Seen", working: "Working",
  blocked: "Blocked", done: "Done", cancelled: "Cancelled", expired: "Expired" };
export const URGENCIES = ["low", "normal", "soon", "now"];
export function urgencyColor(d, u) { return { now: d.err, soon: d.warn, low: d.fg4 }[u] ?? null; }
export function cardStatusColor(d, s) {
  return { "needs you": d.warnText, held: d.warnText, queued: d.fg2, seen: d.infoText, working: d.info, blocked: d.err, done: d.ok, draft: d.fg3 }[s] ?? d.fg3;
}

// Every open card (`pal desk ls --all --json`): { cards, counts }. Throws when the command fails.
export async function loadDesk(done = false) {
  const out = await crewCli(["desk", "ls", "--all", "--json", ...(done ? ["--done"] : [])]);
  const j = JSON.parse(out || "{}");
  return { cards: Array.isArray(j.cards) ? j.cards : [], counts: j.counts ?? {}, pals: j.pals ?? {}, triage: j.triage ?? "auto" };
}

// Is the center showing the Desk (the "center" stack on "desk-view")?
export const deskMode = () => findNode(layout(), "center")?.active === "desk-view";
export function showDesk(desk = null) {
  if (desk) setShared("crew.desk.pick", desk);
  run("layout.select", { stack: "center", child: "desk-view" });
  if (findNode(layout(), "crew-composer") && !findNode(layout(), "crew-composer").hidden) run("layout.hide", { id: "crew-composer" });
}
export const openDrop = (props = {}) => openOverlay({ mod: "crew-desk-drop", kind: "dialog", width: 560, props });

// The idea partner's drafts (data/crew-desk/_drafts): which ones haven't been announced yet.
// `seen` is the ids already toasted (null: never ran here, so today's drafts are taken as seen and
// nothing is toasted). Returns { fresh: [cards to toast], seen: [ids, current drafts only] }.
export function newDrafts(cards, seen) {
  const drafts = (cards ?? []).filter((c) => c.tray === "_drafts" && c.status === "draft");
  const ids = drafts.map((c) => c.id);
  if (!Array.isArray(seen)) return { fresh: [], seen: ids };
  const was = new Set(seen);
  return { fresh: drafts.filter((c) => !was.has(c.id)), seen: ids };
}
// The toast for one: "<Partner> drafted a card" · "<title> → <suggestion>. Review and Send in the Desk."
export function draftToast(c) {
  const by = String(c.from ?? PARTNER_NAME).split("#")[0];
  const to = !c.to || c.to === "auto" ? "Auto" : c.to === "To route" ? "To route" : c.to.replace("#", " #");
  return { title: `${by} drafted a card`, body: `${c.title || "(no title)"} → ${to}. Review and Send in the Desk.`,
    level: "info", timeout: 8000, action: { name: "crew-header.drafts" } };
}

// ── The Desk in the sidebar ───────────────────────────────────────────────────────────────────
// crew-header publishes shared("crew.desk").pals = { <pal folder (deskSlug)>: { pal, open, held,
// held_since, topics: { <topic, or "" for the pal tray>: { open, held, held_since } } } }.
export function deskOf(palName) {
  return shared("crew.desk")?.pals?.[deskSlug(palName)] ?? null;
}
// One topic's lane (case-insensitive: a card's `to` may spell the topic as typed). The pal tray ("")
// isn't a topic: its cards count only on the pal's Desk button.
export function deskLane(palName, topic) {
  const t = deskOf(palName)?.topics ?? {};
  const want = String(topic ?? "").replace(/^#/, "").toLowerCase();
  if (!want) return null;
  const key = Object.keys(t).find((k) => k.toLowerCase() === want);
  return key ? t[key] : null;
}
// The marker on a topic row: "held 12m" (amber) while any of its cards is held, else "N waiting"
// (dim), else nothing. 18 px high like the "no agent" pill, so a row never changes height.
export function deskLaneText(lane) {
  if (!lane?.open) return null;
  if (lane.held) return `held ${ago(Date.parse(lane.held_since ?? "") || Date.now()) || "now"}`;
  return `${lane.open} waiting`;
}
export function deskLaneMark(d, lane) {
  const text = deskLaneText(lane);
  if (!text) return null;
  const held = Boolean(lane.held);
  return div().flex().flex_none().items_center().h(18).px(5).rounded(d.r.xs).border_1()
    .border_color(held ? "#E8AA0A47" : d.line).when(held, (el) => el.bg("#E8AA0A1F"))
    .child(div().text_size(10.5).line_height("14px").text_color(held ? d.warnText : d.fg3).child(text));
}
