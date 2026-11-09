// Draws every pal list look for real, outside Herdr: crew.js, the roster's pal rows and the style
// dialog run against stand-ins for gpui-kit, gpui-base and herdr. Each element method a row calls
// must be one gpui-kit declares (mods/crew-command/gpui-kit.d.ts), so a mistyped style or a look
// that throws fails here; `herdr-app check` only builds the empty roster, never these rows.
// Run: node tests/test_palrows.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dts = readFileSync(join(root, "mods/crew-command/gpui-kit.d.ts"), "utf8");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
assert.ok(METHODS.length > 500, "read gpui-kit's element methods");

const dir = mkdtempSync(join(tmpdir(), "palrows-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  // An element records what it's given and refuses any method gpui-kit doesn't have.
  mod("gpui-kit", `
    const OK = new Set(${JSON.stringify(METHODS)});
    export function el(kind, arg) {
      const node = { kind, arg, calls: [], args: {}, kids: [] };
      const p = new Proxy(node, { get(t, k) {
        if (k === "node") return t;
        if (typeof k !== "string" || k === "then") return undefined;
        if (!OK.has(k)) throw new Error("not a gpui-kit method: ." + k + "()");
        return (...a) => {
          t.calls.push(k);
          t.args[k] = a;
          if (k === "child") { if (a[0] != null) t.kids.push(a[0]); }
          else if (k === "children") t.kids.push(...a[0].filter((x) => x != null));
          else if (k === "when") { if (a[0]) a[1](p); }
          else if (k === "hover") a[0](el("style"));
          return p;
        };
      } });
      return p;
    }
    export const div = () => el("div"), svg = (x) => el("svg", x), image = (x) => el("image", x);
    export class View {}
  `);
  mod("gpui-base", `
    import { el } from "gpui-kit";
    export const v_flex = () => el("div"), h_flex = () => el("div");
    const stub = { new: () => ({ on() {}, value: () => "", set_value() {}, focus() {} }) };
    export const InputState = stub, VirtualListScrollHandle = stub, Input = { new: () => el("div") }, Scrollbar = { vertical: () => el("div") };
    export const v_virtual_list = () => el("div");
  `);
  // Three open pals (a working one with live channels, the head pal resting, one starting) and one
  // closed pal; a grouped layout; the task board.
  mod("herdr", `
    const now = Date.now();
    export const fixtures = {
      spaces: [
        { id: "s1", name: "Project Pals - Herdr Mod", folder: "/home/denon/Projects/project-pals", active: true, index: 0, status: "blocked",
          tabs: [{ id: "t1", name: "indicators", status: "working", changed_at: now - 420000, active: true },
                 { id: "t2", name: "command-bar", status: "blocked", changed_at: now - 120000 },
                 { id: "t3", name: "profiles", status: "done", changed_at: now - 900000 },
                 { id: "t4", name: "notes", status: "idle", changed_at: now - 99999999 }] },
        { id: "s2", name: "Orca", folder: "/home/denon/.config/herdr-app/data/crew-god", index: 1, status: "idle",
          tabs: [{ id: "t5", name: "general", status: "idle", changed_at: now - 60000, active: true }] },
        { id: "s3", name: "Softly - Dictation App with a very long name indeed", folder: "/home/denon/Projects/softly", index: 2, status: "idle",
          tabs: [{ id: "t6", name: "main", status: "idle", changed_at: null }] },
      ],
      panes: [
        { tab: "t1", terminal: "a", program: { agent: true, key: "claude", name: "Claude Code" }, branch: "crew/pal-looks", cwd: "/home/denon/Projects/project-pals" },
        { tab: "t2", terminal: "b", program: { agent: true, key: "claude", name: "Claude Code" }, branch: "crew/command-bar" },
        { tab: "t3", terminal: "c", program: { agent: true, key: "claude", name: "Claude Code" } },
        { tab: "t5", terminal: "d", program: { agent: true, key: "codex", name: "Codex" }, branch: "main" },
      ],
      agents: [
        { space: "s1", tab: "t1", status: "working", seq: 3 }, { space: "s1", tab: "t2", status: "blocked", seq: 2 },
        { space: "s1", tab: "t3", status: "done", seq: 1 }, { space: "s2", tab: "t5", status: "idle", seq: 4 },
      ],
      shared: {
        crew: { bots: [{ id: "b2", name: "Orca", space: "s2", god: true }, { id: "b3", name: "Softly - Dictation App with a very long name indeed", space: "s3", hired: now - 1000 },
                       { id: "b9", name: "Tricky Tiles - Plugin", folder: "/home/denon/Projects/omarchy-tricky-tiles", harness: "claude", channels: ["main", "ui"] }] },
        "crew.marks": { pals: { b3: { pin: 1, group: "g1" } }, tabs: {}, groups: [{ id: "g1", name: "Personal" }] },
        "crew.settings": {},
      },
    };
    export const spaces = () => fixtures.spaces, panes = () => fixtures.panes, agents = () => fixtures.agents;
    export const shared = (k) => fixtures.shared[k], setShared = (k, v) => { fixtures.shared[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED" });
    export const home = () => "/home/denon", appHome = () => "/home/denon/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => fixtures.layout ?? null, props = () => ({}), keys = () => ({});
    export const machines = () => [], terminals = () => [];
    const nop = () => {}, later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods/crew-roster/main.js"), join(dir, "roster.js"));
  copyFileSync(join(root, "mods/crew-palstyle/main.js"), join(dir, "palstyle.js"));

  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const { fixtures } = await import(url("node_modules/herdr/index.js"));
  const { default: Roster } = await import(url("roster.js"));
  const { default: PalStyle } = await import(url("palstyle.js"));
  const { textLeft } = await import(url("palstyles.js"));

  const text = (p) => { const n = p.node ?? p; return [...n.kids.map((k) => typeof k === "string" ? k : k?.node ? text(k) : "")].join(" "); };
  const ids = (p, out = []) => { const n = p.node; n.calls.includes("id") && out.push(n); n.kids.forEach((k) => k?.node && ids(k, out)); return out; };

  const d = crew.ds({ background: "#0E0E0F" });
  const tasks = [{ assignee: "Project Pals - Herdr Mod", status: "claimed" }, { assignee: "Project Pals - Herdr Mod", status: "done", updated: Date.now() - 1000 },
    { claimed_by: "Project Pals - Herdr Mod#indicators", status: "open" }];
  const roster = Object.create(Roster.prototype);
  roster.ops = { tasks, approvals: [], proposals: [], stalled: {} };
  const t = crew.tone({ background: "#0E0E0F", foreground: "#EDEDED" });

  for (const [st, trees] of crew.PAL_LIST_STYLES.flatMap((x) => [[x, true], [x, false]])) {
    fixtures.shared["crew.settings"] = trees ? { palList: st.id } : { palList: st.id, palTrees: false };
    assert.equal(crew.palListStyle().id, st.id);
    const [s1, s2, s3] = fixtures.spaces;
    const f1 = crew.palFacts(s1, crew.botOf(s1), d, tasks);
    // The real data each row has.
    assert.equal(f1.branch, "crew/command-bar", "the branch of the channel the row stands for");
    assert.equal(f1.harness, "claude");
    assert.equal(f1.chs, 4);
    assert.equal(f1.blocked, 1);
    assert.deepEqual(f1.tasks, { open: 2, done: 1, total: 3 });
    assert.equal(f1.word, "Needs you", "status first: the lead channel asks");
    // The roster's rows (open pals, the head pal, a pinned one in a group, a closed one) all draw.
    const rows = [roster.palRow({ space: s1, bot: crew.botOf(s1) }, t, d, null), roster.palRow({ space: s2, bot: crew.botOf(s2) }, t, d),
      roster.palRow({ space: s3, bot: crew.botOf(s3) }, t, d, "g1"), roster.sleeperRow(fixtures.shared.crew.bots[2], t, d)];
    const all = rows.map(text).join(" | ");
    for (const name of ["Project Pals - Herdr Mod", "Orca", "Softly", "Tricky Tiles - Plugin"]) assert.ok(all.includes(name), `${st.id} shows ${name}`);
    const words = text(rows[0]);
    const want = {
      large: ["Needs you", "#command-bar"], folder: ["~/Projects/project-pals", "#command-bar"], tight: ["~/Projects/project-pals · crew/command-bar"],
      wrap: ["Needs you"], rich: [" · crew/command-bar", "1 blocked", "2 tasks"], table: ["4", "2"],
      progress: ["1/3 tasks"], project: ["project-pals", "crew/command-bar"], grouped: ["#command-bar"], card: ["~/Projects/project-pals", "Needs you"],
    }[st.id];
    for (const w of want) assert.ok(words.includes(w), `${st.id}: "${w}" in ${JSON.stringify(words)}`);
    // Clicks, right-click and drag stay on the row's own element.
    const top = rows[0].node.kids.length && rows[0].node.calls.includes("id") ? rows[0].node : rows[0].node.kids[0].node;
    for (const h of ["on_click", "on_mouse_move"]) assert.ok(top.calls.includes(h), `${st.id} row keeps ${h}`);
    assert.ok(top.calls.filter((c) => c === "on_mouse_down").length >= 2, `${st.id} row keeps press (drag) and right-click`);
    // Trees (any look): the working pal's live topics under it, asks you first, each opening its
    // own topic (right-click: its menu), lined up with the look's text column; off: none.
    const sub = ids(rows[0]).filter((n) => n.calls.includes("on_click") && n !== top);
    assert.equal(sub.length, trees ? 3 : 0, `${st.id} trees ${trees}: topic rows`);
    if (trees) {
      assert.ok(sub.every((n) => n.calls.includes("on_mouse_down") && n.args.h?.[0] === 22), `${st.id}: 22 px topic rows with a right-click menu`);
      for (const w of ["#command-bar", "#indicators", "#profiles"]) assert.ok(words.includes(w), `${st.id} trees: ${w}`);
      assert.ok(words.indexOf("#command-bar") < words.indexOf("#indicators"), "asks you first, then working");
      const box = rows[0].node.kids[1].node;
      assert.equal(box.args.pl[0], textLeft(st) - 4, `${st.id}: topics start at the text column`);
    }
    // " · #topic" on the row only when no tree shows under it (DeNon, 2026-11-08): with Trees on
    // the working pal's row says just its state; off, the looks that name the topic do; a resting
    // pal (no tree) keeps it either way.
    {
      const rowText = text(top);
      const names = ["large", "folder", "wrap", "grouped"].includes(st.id);
      if (trees) assert.ok(!rowText.includes("· #"), `${st.id} trees: the row drops its #topic (${rowText})`);
      else if (names) assert.ok(rowText.includes("· #command-bar"), `${st.id} trees off: the row names its topic (${rowText})`);
      if (names) assert.ok(text(rows[1]).includes("· #general"), `${st.id}: a resting pal keeps its #topic`);
    }
    // Resting and closed pals never unfold.
    for (const r of rows.slice(1)) assert.equal(ids(r).filter((n) => n.args.id?.[0]?.includes("-tp-")).length, 0, `${st.id}: no trees for a resting pal`);
    // The style dialog draws with this look shown.
    const dlg = Object.create(PalStyle.prototype);
    Object.assign(dlg, { was: "large", hot: st.id, tasks, handle: {} });
    const out = text(dlg.render());
    assert.ok(out.includes("Pal list style") && out.includes(st.name) && out.includes("Hidden pals") && out.includes("Personal"), `dialog previews ${st.id}`);
  }
  // The hero never changes height or its buttons' widths from pal to pal (DeNon, 2026-11-08):
  // switching from Orca (one channel) to a pal with fifteen must not move the Pals list.
  fixtures.shared["crew.settings"] = {};
  Object.assign(roster, { width: 281, chSearch: { value: () => "" }, chSearchOpen: false, chScroll: { scroll_to_item() {} } });
  const many = { ...fixtures.spaces[0], id: "s9", tabs: Array.from({ length: 15 }, (_, i) => ({ id: `m${i}`, name: `ch${i}`, status: "idle", changed_at: 1, active: i === 0 })) };
  const one = fixtures.spaces[1];
  const none = { ...fixtures.spaces[1], id: "s8", tabs: [] };
  // The hero's shape: every fixed height and width it sets, top-down (text and counts left out).
  const shape = (p) => { const n = p.node; const own = ["h", "w", "size", "pt", "pb", "flex_grow", "flex_basis", "flex_auto"]
    .filter((k) => n.args[k]).map((k) => `${k}${JSON.stringify(n.args[k])}`).join(" ");
    return [own, ...n.kids.filter((k) => k?.node && !String(k.node.args.id?.[0] ?? "").match(/^hero-ch-(m|t)\d/)).map(shape)].join("|"); };
  const heroOf = (space, open) => { roster.ops.tasks = open ? [{ assignee: space.name, status: "open" }] : []; return roster.heroCard({ space, bot: crew.botOf(space) }, t, d, 281); };
  const box = (p) => { const n = p.node; if (n.args.h?.[0] === 132) return n; for (const k of n.kids) { const f = k?.node && box(k); if (f) return f; } return null; };
  for (const [space, open] of [[one, false], [many, true], [none, false], [fixtures.spaces[0], true]]) {
    const h = heroOf(space, open);
    const b = box(h);
    assert.ok(b && b.calls.includes("flex_none") && b.calls.includes("overflow_hidden"), `${space.tabs.length} channels: the channel box is always 4 rows + the peek (132 px)`);
  }
  const outline = (p) => shape(p).replace(/h\[(30|120|90|60)\]/g, "h[list]");
  assert.equal(outline(heroOf(many, true)).split("|").filter((x) => /flex_grow|w\[18\]/.test(x)).join(),
    outline(heroOf(one, false)).split("|").filter((x) => /flex_grow|w\[18\]/.test(x)).join(), "the quick actions keep their widths and the Tasks count slot");
  assert.ok(/w\[18\]/.test(shape(heroOf(one, false))), "Tasks reserves its count slot even with no tasks");
  // Inbox took "+ Channel"'s place (DeNon, 2026-11-08): the needs-you count in a fixed slot, amber
  // when something waits, and the same widths with or without it. New topic stays in the list.
  const pebbleOf = (h, id) => ids(h).find((n) => n.args.id?.[0] === id);
  fixtures.shared["crew.needs"] = { count: 0 };
  const calm = heroOf(one, false);
  assert.ok(pebbleOf(calm, "hero-inbox") && !pebbleOf(calm, "hero-channel"), "the hero's first pebble is Inbox");
  assert.ok(pebbleOf(calm, "hero-inbox").args.tooltip[0].startsWith("Inbox") && !/\b(Channel|Topic)\b/.test(text(pebbleOf(calm, "hero-inbox"))), "its tooltip says Inbox");
  // At the 304 px sidebar (DeNon via Orca, 2026-11-08): Inbox, Tasks and Desk are icon + count pebbles
  // of one fixed width, names only in tooltips, so nothing truncates to "In…"; with room, the names show.
  for (const id of ["hero-inbox", "hero-tasks", "hero-desk"]) {
    const narrow = pebbleOf(roster.heroCard({ space: one, bot: crew.botOf(one) }, t, d, 304), id);
    assert.equal(narrow.args.w?.[0], 54, `${id} is 54 px at 304`);
    assert.equal(text(narrow).trim(), "", `${id} shows no label at 304`);
    assert.ok(narrow.args.tooltip?.[0], `${id} has a tooltip`);
    const wide = pebbleOf(roster.heroCard({ space: one, bot: crew.botOf(one) }, t, d, 420), id);
    assert.equal(wide.args.w?.[0], 96, `${id} is 96 px with room`);
    assert.ok(/Inbox|Tasks|Desk/.test(text(wide)), `${id} shows its name with room`);
  }
  // Home (the head pal's page, when the layout has home-view): the head pal never sleeps, so its
  // last pebble is Home instead of the moon; other pals keep the moon. Same widths either way.
  assert.ok(!pebbleOf(calm, "hero-home"), "no Home pebble without a home-view");
  fixtures.layout = { id: "root", children: [{ id: "center", type: "stack", active: "tab-view", children: [{ id: "tab-view" }, { id: "home-view" }] }] };
  const heroAt = (sp, w) => roster.heroCard({ space: sp, bot: crew.botOf(sp) }, t, d, w);
  const head = fixtures.spaces.find((sp) => crew.botOf(sp).god);
  const other = fixtures.spaces.find((sp) => !crew.botOf(sp).god);
  assert.ok(head && other, "the fixtures have a head pal and another");
  assert.ok(pebbleOf(heroAt(head, 281), "hero-home") && !pebbleOf(heroAt(head, 281), "hero-sleep"), "the head pal's hero: Home in the moon's place");
  assert.ok(!pebbleOf(heroAt(other, 281), "hero-home") && pebbleOf(heroAt(other, 281), "hero-sleep"), "other pals keep the moon");
  assert.equal(outline(heroAt(head, 281)).split("|").filter((x) => /flex_grow|w\[(18|28|54)\]/.test(x)).length,
    outline(heroAt(other, 281)).split("|").filter((x) => /flex_grow|w\[(18|28|54)\]/.test(x)).length, "same pebble row for the head pal and the rest");
  fixtures.layout = null;
  assert.ok(text(calm).includes("New topic"), "New topic is still the list's last row");
  fixtures.shared["crew.needs"] = { count: 3 };
  const busy = heroOf(one, false);
  const inbox = pebbleOf(busy, "hero-inbox");
  assert.ok(text(inbox).includes("3"), "Inbox shows what needs you");
  const slot = (n) => { if (n.args.w?.[0] === 18) return n; for (const k of n.kids) { const f = k?.node && slot(k.node); if (f) return f; } return null; };
  assert.equal(slot(inbox).args.text_color?.[0], d.warnText, "the count is amber while something waits");
  assert.equal(outline(busy).split("|").filter((x) => /flex_grow|w\[18\]/.test(x)).join(),
    outline(calm).split("|").filter((x) => /flex_grow|w\[18\]/.test(x)).join(), "a needs-you count never changes the pebbles' widths");
  fixtures.shared["crew.view"] = "bots";
  const cx = { notify() {}, stop_propagation() {} };
  inbox.args.on_click[0](null, cx);
  assert.equal(fixtures.shared["crew.view"], "you", "Inbox opens the sidebar's Inbox");
  pebbleOf(heroOf(one, false), "hero-inbox").args.on_click[0](null, cx);
  assert.equal(fixtures.shared["crew.view"], "bots", "a second click goes back to the pals");
  delete fixtures.shared["crew.needs"]; delete fixtures.shared["crew.view"];
  // The Topics fold (DeNon, 2026-11-08): the chevron folds the hero's list to its header, for every
  // pal at once (remembered in crew-settings), so the hero is still one height whoever is shown.
  {
    const fold = (h) => pebbleOf(h, "hero-ch-fold");
    const open1 = heroOf(many, true);
    assert.ok(fold(open1) && fold(open1).args.size[0] === 22 && fold(open1).calls.includes("flex_none"), "a fixed 22 px chevron");
    assert.equal(fold(open1).args.tooltip[0], "Fold topics");
    fold(open1).args.on_click[0](null, cx);
    assert.equal(fixtures.shared["crew.settings"].heroTopicsFolded, true, "folding is remembered");
    const busyPal = { ...fixtures.spaces[0], id: "s7", tabs: [...fixtures.spaces[0].tabs, ...many.tabs] };
    const heros = [heroOf(one, false), heroOf(many, true), heroOf(none, false), heroOf(busyPal, true)];
    for (const h of heros) {
      assert.equal(box(h), null, "folded: no topic box");
      assert.ok(!ids(h).some((n) => /^hero-ch-(m|t)\d|^hero-ch-(new|more)$/.test(n.args.id?.[0] ?? "")), "folded: no rows, New topic or +N more");
      assert.equal(fold(h).args.tooltip[0], "Show topics");
    }
    // (The pet stage differs for the head pal, as it always has; the Topics part and the quick
    // actions, what sits between the stage and the Pals list, must be identical.)
    const section = (p) => { const n = p.node; if (n.kids.some((k) => k?.node?.args.id?.[0] === "hero-ch-head")) return n; for (const k of n.kids) { const f = k?.node && section(k); if (f) return f; } return null; };
    const topicsShape = (h) => { const n = section(h); return shape({ node: n }) + "#" + outline(h).split("|").filter((x) => /flex_grow|w\[18\]/.test(x)).join(); };
    assert.equal(new Set(heros.map(topicsShape)).size, 1, "folded, every pal's Topics part and quick actions are the same shape");
    assert.equal(section(heros[0]).kids.length, 1, "folded: the Topics part is just its header");
    const head = (h) => text(pebbleOf(h, "hero-ch-head"));
    assert.ok(head(heros[3]).includes("19 · 1 working · 1 needs you"), `the folded header says what's live: ${head(heros[3])}`);
    assert.ok(/Topics\s+1\b/.test(head(heros[0])) && !head(heros[0]).includes("working"), "a quiet pal: just the count");
    // Searching unfolds (a search needs the list); the chevron unfolds too.
    roster.chSearch = { value: () => "", focus() {} };
    pebbleOf(heros[1], "hero-ch-search").args.on_click[0](null, cx);
    assert.equal(fixtures.shared["crew.settings"].heroTopicsFolded, false, "search unfolds");
    roster.chSearchOpen = false;
    fixtures.shared["crew.settings"].heroTopicsFolded = true;
    fold(heroOf(one, false)).args.on_click[0](null, cx);
    assert.equal(fixtures.shared["crew.settings"].heroTopicsFolded, false, "the chevron unfolds");
    assert.ok(box(heroOf(one, false)), "unfolded: the 132 px box is back");
    fixtures.shared["crew.settings"] = {};
  }
  // A "Channels" category saved before 0.3.1 shows as Topics; new ones are Topics.
  assert.equal(crew.categoryName("Channels"), "Topics");
  assert.equal(crew.categoryName("Routines"), "Routines");
  assert.equal(crew.categoryOf({ categories: { t1: "Channels" } }, { id: "t1", name: "#a" }), "Topics");
  assert.equal(crew.categoryOf({ categories: {} }, { id: "t2", name: "#b" }), "Topics");
  // Scrolling with a pill thumb (DeNon, 2026-11-08): our own areas, since Herdr's bar can't be rounded.
  {
    const { thumbGeom, scrollArea, scrollState, scrollIntoView, THUMB } = crew;
    const { div } = await import(url("node_modules/gpui-kit/index.js"));
    assert.equal(thumbGeom(100, 100, 0), null, "no thumb when it fits");
    assert.equal(thumbGeom(0, 500, 0), null, "no thumb before it's measured");
    const g0 = thumbGeom(200, 800, 0), gEnd = thumbGeom(200, 800, 600), gMid = thumbGeom(200, 800, 300);
    assert.equal(g0.top, THUMB.pad);
    assert.equal(gEnd.top + gEnd.h, 200 - THUMB.pad, "at the end the pill reaches the bottom");
    assert.ok(gMid.top > g0.top && gMid.top < gEnd.top);
    assert.equal(g0.h, Math.round((200 - 2 * THUMB.pad) * 200 / 800));
    assert.equal(thumbGeom(200, 100000, 0).h, THUMB.min, "never thinner than the minimum");
    assert.equal(THUMB.r, THUMB.w / 2, "fully round ends: radius = half the width");
    assert.ok(THUMB.w >= 4 && THUMB.w <= 6, "4-6 px wide");
    const mkcx = () => ({ n: 0, stopped: false, notify() { this.n++; }, stop_propagation() { this.stopped = true; } });
    const draw = () => scrollArea(d, "t-area", div().child("rows"));
    let el = draw().node;
    const inner = () => el.kids[0].node;
    // Measure: a 200 px view over 800 px of content.
    el.args.on_size_change[0]({ width: 280, height: 200 }, mkcx());
    inner().args.on_size_change[0]({ width: 280, height: 800 }, mkcx());
    el = draw().node;
    const pillOf = (n) => n.kids.map((k) => k.node).find((k) => String(k.args.id?.[0]).endsWith("-thumb"));
    let thumb = pillOf(el);
    assert.ok(thumb, "a thumb once it overflows");
    const pillEl = thumb.kids[0].node;
    assert.equal(pillEl.args.w[0], THUMB.w);
    assert.equal(pillEl.args.rounded[0], THUMB.w / 2, "the pill is round at both ends");
    assert.equal(pillEl.args.bg[0], d.thumb, "quiet grey at rest");
    assert.ok(el.calls.includes("overflow_hidden") && !el.calls.includes("overflow_y_scrollbar"), "clips; no Herdr bar");
    // The wheel: down 120 px (GPUI's delta is negative going down), clamped at the ends; at an end
    // it lets the wheel through to an outer area.
    let c = mkcx(); el.args.on_scroll_wheel[0]({ delta: { x: 0, y: -120 } }, c);
    assert.equal(scrollState("t-area").y, 120); assert.ok(c.stopped && c.n === 1);
    c = mkcx(); el.args.on_scroll_wheel[0]({ delta: { x: 0, y: -5000 } }, c);
    assert.equal(scrollState("t-area").y, 600, "clamped at the end");
    c = mkcx(); el.args.on_scroll_wheel[0]({ delta: { x: 0, y: -50 } }, c);
    assert.ok(!c.stopped, "at the end the wheel goes on to an outer area");
    el = draw().node;
    assert.equal(inner().args.top[0], -600, "the content moves up by the offset");
    // Hover brightens it; dragging the pill to the top scrolls back to the start.
    thumb = pillOf(el);
    c = mkcx(); thumb.args.on_hover[0](true, c);
    assert.equal(pillOf(draw().node).kids[0].node.args.bg[0], d.thumbHot, "brighter on hover");
    el = draw().node; thumb = pillOf(el);
    c = mkcx(); thumb.args.on_mouse_down[1]({ position: { x: 270, y: 500 } }, c);
    el = draw().node;
    c = mkcx(); el.args.on_mouse_move[0]({ position: { x: 270, y: 0 } }, c);
    assert.equal(scrollState("t-area").y, 0, "dragged to the top");
    c = mkcx(); el.args.on_mouse_up[1]({}, c);
    assert.equal(scrollState("t-area").drag, null);
    // Bringing a row into view.
    scrollIntoView("t-area", 700, 30);
    assert.equal(scrollState("t-area").y, 530);
    // The content shrinking pulls the offset back.
    inner().args.on_size_change[0]({ width: 280, height: 300 }, mkcx());
    assert.equal(scrollState("t-area").y, 100);
  }
  // Nothing of ours asks Herdr for its rectangular bar any more.
  {
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(join(root, "mods")).flatMap((m) => readdirSync(join(root, "mods", m)).filter((f) => f.endsWith(".js")).map((f) => join(root, "mods", m, f)));
    for (const f of [...files, join(root, "lib/crew.js")]) {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      assert.ok(!/\.overflow_(?:y_|x_)?scrollbar\(|Scrollbar\.(?:vertical|horizontal|new)\(/.test(src), `${f} uses Herdr's scrollbar`);
    }
  }
  // The Pals header's fold-all toggle: the same palTrees as the Settings switch (so it's
  // remembered), flips it both ways, fixed 20 px whatever it shows, and the rows follow.
  {
    fixtures.shared["crew.settings"] = { palList: "table" };
    const mkcx = () => ({ notify() {}, stop_propagation() {} });
    const tg = () => roster.treesToggle(d).node;
    assert.equal(tg().args.id[0], "pals-trees");
    assert.equal(tg().args.size[0], 20);
    assert.ok(tg().calls.includes("flex_none"), "the toggle never shrinks");
    assert.equal(tg().args.tooltip[0], "Fold all topics");
    assert.match(tg().kids[0].node.arg, /ds-tree\.svg$/);
    const topics = () => ids(roster.palRow({ space: fixtures.spaces[0], bot: crew.botOf(fixtures.spaces[0]) }, t, d, null)).filter((n) => n.args.id?.[0]?.includes("-tp-")).length;
    assert.equal(topics(), 3);
    tg().args.on_click[0]({}, mkcx());
    assert.equal(fixtures.shared["crew.settings"].palTrees, false, "fold all saves palTrees off");
    assert.equal(fixtures.shared["crew.settings"].palList, "table", "and keeps the look");
    assert.equal(topics(), 0, "folded: no topic rows");
    assert.equal(tg().args.tooltip[0], "Unfold all topics");
    assert.match(tg().kids[0].node.arg, /ds-tree-folded\.svg$/);
    assert.equal(tg().args.size[0], 20, "same size folded");
    tg().args.on_click[0]({}, mkcx());
    assert.equal(fixtures.shared["crew.settings"].palTrees, true, "unfold all turns it back on");
    assert.equal(topics(), 3);
    const src = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
    assert.ok(/this\.treesToggle\(d\)\)\s*\.child\(div\(\)\.id\("pals-search"\)/.test(src), "the toggle sits just before the search button");
    for (const f of ["ds-tree.svg", "ds-tree-folded.svg"]) assert.ok(existsSync(join(root, "mods/crew-roster/icons", f)), f);
  }
  console.log("palrows: ok (10 looks x Trees on/off drawn; the hero is a fixed size)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
