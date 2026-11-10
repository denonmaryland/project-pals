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
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED", ansi4: "#4C8DFF" });
    export const home = () => "/home/denon", appHome = () => "/home/denon/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => fixtures.layout ?? null, props = () => ({}), keys = () => ({});
    export const machines = () => [], terminals = () => [];
    const nop = () => {}, later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = (op, a) => { (fixtures.ran ??= []).push([op, a]); }, notify = (x) => { (fixtures.notes ??= []).push(x); }, openOverlay = nop, closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => fixtures.known ?? [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "factories.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
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
      assert.ok(sub.every((n) => n.calls.includes("on_mouse_down") && n.args.h?.[0] === 24), `${st.id}: 24 px topic rows with a right-click menu`);
      for (const w of ["#command-bar", "#indicators", "#profiles"]) assert.ok(words.includes(w), `${st.id} trees: ${w}`);
      assert.ok(words.indexOf("#command-bar") < words.indexOf("#indicators"), "asks you first, then working");
      const box = rows[0].node.kids[1].node;
      assert.equal(box.args.pl[0], textLeft(st) - 4, `${st.id}: topics start at the text column`);
      // The recessed channel (DeNon's pick C, 2026-11-09, T75; lightened 2026-11-10 so it never
      // reads like the Topics list's near-black well): one clipped, rounded, slightly darker box
      // with no edge holds the rows; its first children are the shade (a dark line inside the top
      // that fades down) and a faint light line at the bottom.
      const well = box.kids[0].node;
      assert.equal(box.kids.length, 1, `${st.id}: the tree is one well`);
      assert.ok(well.calls.includes("overflow_hidden") && well.args.rounded?.[0] === 7 && well.args.bg?.[0] === "#0C0C0D" && !well.calls.includes("border_1"), `${st.id}: a soft well, no edge`);
      const shade = well.kids.map((k) => k.node).filter((n) => n.calls.includes("absolute"));
      assert.ok(shade.length >= 3 && shade[0].args.top?.[0] === 0 && shade[0].args.h?.[0] === 1 && shade.at(-1).args.bottom?.[0] === 0, `${st.id}: the well's shade and bottom line`);
      assert.ok(sub.every((n) => well.kids.some((k) => k.node === n)), `${st.id}: the topic rows are in the well`);
      // Status stays on the left (a 16 px slot first); the topic on screen is a shade lighter with
      // a 2 px blue edge; a finished topic says when, on the right.
      assert.ok(sub.every((n) => n.kids[0].node.args.w?.[0] === 16), `${st.id}: the status mark comes first`);
      const shown = sub.find((n) => n.args.id[0].endsWith("-tp-t1")), quiet = sub.find((n) => n.args.id[0].endsWith("-tp-t2"));
      const edge = (n) => n.kids.map((k) => k.node).find((x) => x.calls.includes("absolute") && x.args.w?.[0] === 2);
      assert.ok(shown.args.bg?.[0] === d.hover && edge(shown)?.args.bg?.[0] === d.info, `${st.id}: the shown topic has the blue edge`);
      assert.ok(!quiet.args.bg && !edge(quiet), `${st.id}: other topics are plain`);
      const done = sub.find((n) => n.args.id[0].endsWith("-tp-t3"));
      assert.match(text({ node: done }), /#profiles\s+\d\d:\d\d$/, `${st.id}: a finished topic ends with its time`);
      for (const n of [shown, quiet]) assert.ok(!/\d\d:\d\d/.test(text({ node: n })), `${st.id}: no time on a working or asking topic`);
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
    // No last-activity times on pal rows (DeNon, 2026-11-08): nothing clock-like ("21:48", "Fri",
    // "Nov 2") is drawn; "Working · 4m" in the state line stays. The one exception is the Trees'
    // finished topic, which says when it finished (DeNon's pick C, 2026-11-09, T75).
    {
      const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
      const strs = all(rows[0]).flatMap((n) => n.kids.filter((k) => typeof k === "string"));
      const clock = strs.filter((x) => /^\d{1,2}:\d{2}$|^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$|^[A-Z][a-z]{2} \d{1,2}$/.test(x.trim()));
      assert.equal(clock.length, trees ? 1 : 0, `${st.id} trees ${trees}: only a finished topic's time (${clock})`);
      assert.ok(!all(rows[0]).some((n) => n.args.text_right && n.args.w?.[0] === 38), `${st.id}: no time slot`);
    }
    // One live topic: no channel around it (DeNon, 2026-11-10: a single row in a box looks odd).
    // The lone row sits straight on the sidebar, in the same place and size as a row in a channel.
    if (trees) {
      const solo = { ...s1, id: "s7", tabs: [s1.tabs[0]] };
      const r = roster.palRow({ space: solo, bot: crew.botOf(solo) }, t, d, null);
      const wrap = r.node.kids[1].node, holder = wrap.kids[0].node;
      const lone = ids(r).filter((n) => n.args.id?.[0]?.includes("-tp-"));
      assert.equal(lone.length, 1, `${st.id}: one topic row`);
      assert.equal(crew.TREE_SINGLE, "plain");
      assert.ok(!holder.args.bg && !holder.calls.includes("overflow_hidden") && !holder.calls.includes("rounded") && holder.kids.length === 1, `${st.id}: a lone topic has no channel`);
      assert.ok(lone[0].args.h?.[0] === 24 && wrap.args.pl[0] === textLeft(st) - 4 && holder.args.pr?.[0] === 3, `${st.id}: the lone row keeps its place and size`);
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
    // The box is a recessed well (DeNon's pick, 2026-11-09, T75): darker than the sidebar, a dark
    // edge, rounded, inset 8 px each side, the shade under its top edge drawn first.
    assert.ok(b.args.bg?.[0] === "#030304" && b.calls.includes("border_1") && b.args.rounded?.[0] === 8 && b.args.mx?.[0] === 8, `${space.tabs.length} channels: the Topics list is a deep well`);
    assert.ok(b.kids[0].node.calls.includes("absolute") && b.kids[0].node.args.top?.[0] === 0, "the well's shade is under the rows");
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
  // Working wins (DeNon, 2026-11-08): a pal with a topic working says Working (blue) even when
  // Herdr's own status for it is done; asks-you still beats both; Done only when nothing runs.
  {
    const now = Date.now();
    const sp = (status, tabs) => ({ id: "s6", name: "Mixed", index: 5, status, folder: "/x",
      tabs: tabs.map(([id, st, at]) => ({ id, name: id, status: st, changed_at: now - at })) });
    const saved = fixtures.agents;
    const mixed = sp("done", [["w1", "working", 300000], ["d1", "done", 1000]]);
    fixtures.agents = [{ space: "s6", tab: "w1", status: "working", seq: 1 }, { space: "s6", tab: "d1", status: "done", seq: 2 }];
    const bot = { ...crew.botOf(fixtures.spaces[0]), awake: true, space: "s6", name: "Mixed" };
    assert.equal(crew.palStatus(mixed), "working");
    assert.equal(crew.palLeadTab(mixed).id, "w1", "the lead topic is the working one");
    const [w, c] = crew.palStateWord(mixed, bot, d);
    assert.ok(w.startsWith("Working") && c === d.info, `working wins over done: ${w}`);
    assert.equal(w, "Working · 5m", "the state line keeps how long it's been working");
    assert.equal(crew.palStatus(sp("working", [["b1", "blocked", 1], ["w1", "working", 1]])), "blocked", "asks you beats working");
    assert.equal(crew.palStatus(sp("done", [["d1", "done", 1], ["i1", "idle", 1]])), "done", "done when nothing runs");
    assert.equal(crew.palStatus(sp("idle", [])), "idle");
    fixtures.agents = saved;
  }
  // Topic colours (DeNon, 2026-11-08): a 3 x 12 mark before each "#topic", in the topic's saved
  // colour, its slot there either way so nothing moves.
  {
    const tabA = { id: "ca" }, tabB = { id: "cb" };
    fixtures.shared["crew.marks"] = { ...fixtures.shared["crew.marks"], tabs: { ca: { color: "ansi4" }, cb: { color: "none" } } };
    const ma = crew.topicMark(tabA).node, mb = crew.topicMark(tabB).node;
    assert.equal(ma.args.bg?.[0], "#4C8DFF", "the saved colour");
    assert.equal(mb.args.bg, undefined, "no colour, no fill");
    for (const m of [ma, mb]) assert.ok(m.args.w[0] === 3 && m.args.h[0] === 12 && m.calls.includes("flex_none"), "a fixed 3 x 12 slot");
    // In the hero's list and the Trees rows, right before the "#".
    const s1 = fixtures.spaces[0];
    fixtures.shared["crew.marks"].tabs = { t1: { color: "ansi4" } };
    fixtures.shared["crew.settings"] = { palList: "large" };
    const hero = heroOf(s1, false);
    const heroRow = ids(hero).find((n) => n.args.id?.[0] === "hero-ch-t1");
    const k = heroRow.kids.map((x) => x.node);
    const hash = k.findIndex((x) => x.kids.includes("#"));
    assert.ok(hash > 0 && k[hash - 1].args.w?.[0] === 3 && k[hash - 1].args.bg?.[0] === "#4C8DFF", "the hero row: the mark, then #");
    const other = ids(hero).find((n) => n.args.id?.[0] === "hero-ch-t2").kids.map((x) => x.node);
    assert.ok(other[other.findIndex((x) => x.kids.includes("#")) - 1].args.w?.[0] === 3, "an uncoloured topic keeps the slot");
    // The shown topic is a raised tile (a lighter face, a shadow, a light line inside its top);
    // the others are plain.
    assert.ok(heroRow.args.bg?.[0] === "#1A1A1C" && heroRow.calls.includes("shadow_sm") && k[0].calls.includes("absolute") && k[0].args.h?.[0] === 1, "the shown topic is raised");
    const plain = ids(hero).find((n) => n.args.id?.[0] === "hero-ch-t2");
    assert.ok(!plain.args.bg && !plain.calls.includes("shadow_sm"), "other topics lie flat in the well");
    const tree = ids(roster.palRow({ space: s1, bot: crew.botOf(s1) }, t, d, null)).find((n) => n.args.id?.[0]?.endsWith("-tp-t1"));
    const tk = tree.kids.map((x) => x.node);
    const ti = tk.findIndex((x) => typeof x.kids[0] === "string" && x.kids[0].startsWith("#"));
    assert.ok(ti > 0 && tk[ti - 1].args.w?.[0] === 3 && tk[ti - 1].args.bg?.[0] === "#4C8DFF", "the Trees row: the mark, then #topic");
    assert.match(readFileSync(join(root, "mods/crew-pick/main.js"), "utf8"), /\.child\(topicMark\(tab\)\)\s*\.child\(div\(\)\.w\(10\)[^\n]*child\("#"\)\)/, "the topic picker: the mark, then #");
    fixtures.shared["crew.marks"].tabs = {};
    fixtures.shared["crew.settings"] = {};
  }
  // No "+N more" in the Topics header (DeNon, 2026-11-08): the count beside "Topics" says it.
  {
    const h = heroOf(many, true);
    assert.ok(!ids(h).some((n) => n.args.id?.[0] === "hero-ch-more"), "no +N more button");
    assert.ok(!/\+\d+ more/.test(text(ids(h).find((n) => n.args.id?.[0] === "hero-ch-head"))), "no +N more in the header");
    assert.ok(box(h), "the fixed box (with its cut fifth row) is still there");
  }
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
  // T24: `pal topic` on a pal that's asleep (no agent running) and has no brain on record (a space
  // Project Pals didn't hire, like Hello Lock) opened a bare shell and dropped its brief.
  const saved = fixtures.shared.crew;
  // A record without a brain learns the one it runs while awake; one with a brain keeps it.
  fixtures.shared.crew = { bots: [{ id: "r1", name: "Project Pals - Herdr Mod", space: "s1" }, { id: "r2", name: "Orca", space: "s2", harness: "claude" },
    { id: "r3", name: "Softly - Dictation App with a very long name indeed", space: "s3" }] };
  assert.equal(crew.rememberBrains(), true);
  const byId = (id) => fixtures.shared.crew.bots.find((b) => b.id === id);
  assert.equal(byId("r1").harness, "claude", "seen awake: its brain is remembered");
  assert.equal(byId("r1").harnessName, "Claude Code");
  assert.equal(byId("r2").harness, "claude", "a hired brain isn't overridden by what runs (codex)");
  assert.equal(byId("r3").harness, undefined, "asleep and never seen: nothing to remember");
  assert.equal(crew.rememberBrains(), false, "nothing new the second time");
  // The order a new topic's brain is picked in.
  const keys = (req, bot, caller) => crew.topicBrains(req, bot, caller).map((c) => `${c.key}:${c.why}`);
  assert.deepEqual(keys({ harness: "codex" }, { harness: "claude" }), ["codex:asked"], "asked for: only that, no fallback");
  assert.deepEqual(keys({}, { harness: "codex", record: { harness: "codex", argv: ["codex"] } }, "claude"), ["codex:hired", "codex:its own", "claude:yours"]);
  assert.deepEqual(keys({}, { harness: null, record: { brains: { "#a": "agy" } } }, "codex"), ["agy:a topic's", "codex:yours", "claude:default"]);
  assert.deepEqual(keys({}, { harness: null, record: {} }, null), ["claude:default"], "never 'no brain'");
  assert.equal(crew.topicBrains({}, { record: {} }, "codex")[0].guessed, true);
  // The request itself: Softly is asleep (no agent) with no brain on record; Orca (codex here) asks.
  fixtures.known = [{ key: "codex", name: "Codex", installed: true, run: ["codex"] }];
  fixtures.ran = [];
  const res = await crew.requestHandlers.channel({ op: "channel", bot: "Softly", name: "lock-loss-2", brief: "Find why the lock drops", by: "Orca#general", byName: "Orca" });
  assert.equal(res.ok, true);
  assert.equal(res.argv?.[0], "codex", "it starts a brain (the asking pal's), not a bare shell");
  assert.equal(res.guessed, true); assert.equal(res.why, "yours"); assert.equal(res.harness, "Codex");
  const made = fixtures.ran.find(([op]) => op === "tab.new")[1];
  assert.equal(made.name, "#lock-loss-2"); assert.equal(made.argv?.[0], "codex");
  assert.ok(String(made.task).includes("Find why the lock drops"), "the brief goes to the new topic");
  assert.equal(byId("r3").brains["#lock-loss-2"], "codex", "the guess is remembered for that topic");
  // Asked for a brain that isn't installed: an error, never a bare shell.
  fixtures.ran = [];
  await assert.rejects(crew.requestHandlers.channel({ op: "channel", bot: "Softly", name: "x", harness: "nope" }), /couldn't start a brain for Softly.*no harness called "nope"/);
  assert.equal(fixtures.ran.filter(([op]) => op === "tab.new").length, 0);
  fixtures.shared.crew = saved; delete fixtures.known; delete fixtures.ran;
  // T27: waking a closed pal with no command on record starts a brain, never bare shells: its brain
  // on record, else Claude Code (as pal topic does), and it says which; with no brain to be had it
  // says so and opens shells.
  {
    const CLAUDE = { key: "claude", name: "Claude Code", run: ["claude"], installed: true };
    const CODEX = { key: "codex", name: "Codex", run: ["codex"], installed: true };
    const wake = async (rec, known) => {
      fixtures.known = known; fixtures.ran = []; fixtures.notes = [];
      fixtures.shared.crew = { ...fixtures.shared.crew, bots: [...fixtures.shared.crew.bots.filter((b) => b.id !== rec.id), rec] };
      await crew.wakePal(rec);
      const made = fixtures.ran.find(([op]) => op === "space.new")?.[1];
      return { argv: made?.argv, notes: fixtures.notes, saved: fixtures.shared.crew.bots.find((b) => b.id === rec.id) };
    };
    const bare = await wake({ id: "w1", name: "Sleepy", folder: "/x", categories: { "#main": "Topics" } }, [CODEX, CLAUDE]);
    assert.equal(bare.argv?.[0], "claude", "no brain on record: Claude Code, not a bare shell");
    assert.ok(bare.notes.some((n) => /Woke Sleepy with Claude Code/.test(n.title) && /no brain on record/.test(n.body)), "it says which brain");
    assert.equal(bare.saved.harness, "claude", "and keeps it on the record");
    const hired = await wake({ id: "w2", name: "Coder", harness: "codex", categories: {} }, [CODEX, CLAUDE]);
    assert.equal(hired.argv?.[0], "codex", "its brain on record, started fresh");
    const saved = await wake({ id: "w3", name: "Kept", harness: "claude", argv: ["claude", "--model", "opus"], categories: {} }, [CLAUDE]);
    assert.deepEqual(saved.argv.slice(0, 3), ["claude", "--model", "opus"], "a saved command is used as is");
    assert.ok(!saved.notes.some((n) => /^Woke/.test(n.title)), "nothing to say when it was on record");
    const none = await wake({ id: "w4", name: "Lost", categories: {} }, []);
    assert.equal(none.argv, undefined);
    assert.ok(none.notes.some((n) => /without a brain/.test(n.title) && n.level === "warning"), "no brain to be had: it says so");
    fixtures.known = undefined; fixtures.notes = [];
  }
  // T41: waking a topic in place (pal wake asks wake-brain): T27's order, per topic.
  {
    const CLAUDE = { key: "claude", name: "Claude Code", run: ["claude"], installed: true };
    const AGY = { key: "antigravity", name: "Antigravity CLI", run: ["agy"], installed: true };
    const CODEX = { key: "codex", name: "Codex", run: ["codex"], installed: false };
    fixtures.known = [CLAUDE, AGY, CODEX];
    const kept = await crew.wakeBrain({ id: "k", harness: "claude", argv: ["claude", "--model", "opus"] });
    assert.deepEqual(kept.argv.slice(0, 3), ["claude", "--model", "opus"], "the pal's command on record");
    assert.equal(kept.why, "its command on record");
    const topic = await crew.wakeBrain({ id: "k", harness: "claude", argv: ["claude"] }, "antigravity");
    assert.equal(topic.argv[0], "agy", "a topic with its own brain on record starts that one");
    assert.equal(topic.why, "this topic's brain on record");
    const same = await crew.wakeBrain({ id: "k", harness: "claude", argv: ["claude", "--model", "opus"] }, "claude");
    assert.deepEqual(same.argv.slice(0, 3), ["claude", "--model", "opus"], "the topic's brain is the pal's own: its saved command");
    const fresh = await crew.wakeBrain({ id: "k", harness: "antigravity" });
    assert.equal(fresh.argv[0], "agy"); assert.match(fresh.why, /no saved command/);
    const fallback = await crew.wakeBrain({ id: "k", harness: "codex" });
    assert.equal(fallback.argv[0], "claude", "a brain that isn't installed falls through to Claude Code, never a bare shell");
    const none = await crew.wakeBrain(null);
    assert.equal(none.argv[0], "claude"); assert.match(none.why, /Claude Code/);
    fixtures.known = [];
    await assert.rejects(crew.wakeBrain({ id: "k", harness: "codex" }), /no brain to start/);
    // The request: a topic's brain is found by its tab id, else its name.
    fixtures.known = [CLAUDE, AGY];
    const s1 = fixtures.spaces.find((s) => crew.botOf(s).record);
    const rec = crew.botOf(s1).record;
    assert.ok(rec, "a pal with a record");
    const tab = s1.tabs[0];
    const before = fixtures.shared.crew;
    fixtures.shared.crew = { ...before, bots: before.bots.map((b) => (b.id === rec?.id ? { ...b, brains: { [tab.id]: "antigravity" } } : b)) };
    const r = await crew.requestHandlers["wake-brain"]({ op: "wake-brain", space: s1.id, tab: tab.id });
    assert.equal(r.ok, true); assert.equal(r.argv[0], "agy", "its topic's brain, found by tab id");
    await assert.rejects(crew.requestHandlers["wake-brain"]({ op: "wake-brain", space: "nope" }), /isn't open/);
    // The outcome toast: fixed titles, a refusal is a warning.
    fixtures.notes = [];
    await crew.requestHandlers["power-report"]({ op: "power-report", mode: "sleep", lines: ["not putting X to sleep: it's mid-turn (working)"], refused: true });
    assert.equal(fixtures.notes[0].title, "Sleep (keep topics, free RAM)"); assert.equal(fixtures.notes[0].level, "warning");
    assert.match(fixtures.notes[0].body, /mid-turn/);
    fixtures.shared.crew = before; fixtures.known = undefined; fixtures.notes = [];
  }
  // Factories (T66). One factory: the whole sidebar draws as it always did, with no chip.
  {
    fixtures.shared["crew.settings"] = { head: "Orca", owner: "DeNon" };
    Object.defineProperty(globalThis, "localStorage", { value: { getItem: () => null, setItem() {} }, configurable: true });
    roster.ops = { tasks: [], approvals: [], proposals: [], stalled: {} };
    const idsOf = () => ids(roster.render()).map((n) => n.args.id[0]);
    const one = idsOf();
    assert.ok(!one.includes("factory-chip"), "no chip with one factory");
    const before = text(roster.render());
    for (const n of ["Orca", "Softly", "Project Pals - Herdr Mod"]) assert.ok(before.includes(n), `one factory shows ${n}`);
    // A second factory holding Softly; the default one is shown.
    const st = { current: "default", defaultName: "Mods", factories: [{ id: "f-app001", name: "Example app", template: "platform-lanes", foreman: "", foremanTopic: "ops", color: "#E2935A" }],
      pals: { "Softly - Dictation App with a very long name indeed": "f-app001" } };
    fixtures.shared["crew.factories"] = st;
    fixtures.shared["crew.factory.needs"] = { "f-app001": 2, default: 5 };
    let out = roster.render();
    assert.ok(ids(out).some((n) => n.args.id[0] === "factory-chip"), "the chip shows once there's a second factory");
    assert.ok(text(out).includes("Mods"), "it names the shown factory");
    assert.equal(text(ids(out).find((n) => n.args.id[0] === "factory-chip-n")), "2", "and counts what the OTHER factories need");
    assert.ok(!ids(out).some((n) => String(n.args.id[0]).includes("s3")), "a pal on another floor isn't listed");
    assert.ok(ids(out).some((n) => String(n.args.id[0]).includes("s2")), "the head pal is");
    // Switch: the other floor, and only it. The head pal stays in the default factory.
    fixtures.ran = [];
    await crew.switchFactory("f-app001");
    assert.equal(fixtures.shared["crew.factories.at"], 0, "the store is read again after the click");
    fixtures.shared["crew.factories"] = { ...st, current: "f-app001" };
    assert.deepEqual(fixtures.ran.filter((r) => r[0] === "space.select").map((r) => r[1].id), ["s3"], "the pal on show wasn't on that floor: its first pal is shown");
    out = roster.render();
    assert.ok(text(out).includes("Example app"));
    assert.equal(text(ids(out).find((n) => n.args.id[0] === "factory-chip-n")), "5");
    assert.ok(ids(out).some((n) => String(n.args.id[0]).includes("s3")));
    assert.ok(!ids(out).some((n) => /(^|-)s2($|-)/.test(String(n.args.id[0]))), "the head pal isn't on this floor");
    assert.equal(crew.currentFactory().name, "Example app");
    assert.deepEqual(crew.countFactoryNeeds([{ space: fixtures.spaces[2] }, { space: fixtures.spaces[0] }], { approvals: [{ bot: "Orca" }], stalled: {} }, [{ factory: "f-app001" }]),
      { "f-app001": 2, default: 2 });
    delete fixtures.shared["crew.factories"]; delete fixtures.shared["crew.factory.needs"];
    assert.deepEqual(crew.countFactoryNeeds([{ space: fixtures.spaces[2] }], { approvals: [] }, []), {}, "one factory: nothing is counted");
    assert.ok(!idsOf().includes("factory-chip"));
  }
  console.log("palrows: ok (10 looks x Trees on/off drawn; the hero is a fixed size)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
