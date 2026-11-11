// Draws every pal list look for real, outside Herdr: crew.js, the roster's pal rows and the style
// dialog run against stand-ins for gpui-kit, gpui-base and herdr. Each element method a row calls
// must be one gpui-kit declares (mods/crew-command/gpui-kit.d.ts), so a mistyped style or a look
// that throws fails here; `herdr-app check` only builds the empty roster, never these rows.
// Run: node tests/test_palrows.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
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
  // An element records what it's given and refuses any method gpui-kit doesn't have. Like Herdr's,
  // it is single-use: changing one after it went into a parent, or giving it a second parent, throws
  // (T102's rocker was added to the pet's box before it was filled, and Herdr's real sidebar stopped
  // drawing with "element `div` was already added to a parent"; herdr-app check never drew it).
  mod("gpui-kit", `
    const OK = new Set(${JSON.stringify(METHODS)});
    export function el(kind, arg) {
      const node = { kind, arg, calls: [], args: {}, kids: [] };
      const p = new Proxy(node, { get(t, k) {
        if (k === "node") return t;
        if (typeof k !== "string" || k === "then") return undefined;
        if (!OK.has(k)) throw new Error("not a gpui-kit method: ." + k + "()");
        if (t.attached && k !== "node") throw new Error("single-use: ." + k + "() on a " + t.kind + " (id " + (t.args.id?.[0] ?? "?") + ") already added to a parent");
        return (...a) => {
          const att = (c) => { if (c && typeof c === "object" && c.node) { if (c.node.attached) throw new Error("single-use: " + c.node.kind + " (id " + (c.node.args.id?.[0] ?? "?") + ") added to a second parent"); c.node.attached = true; } };
          if (k === "child") att(a[0]); else if (k === "children") for (const c of a[0]) att(c);
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
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
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
  // The tools are five pebbles of one size (T109): each shares the row equally, whatever it shows.
  assert.equal(shape(heroOf(one, false)).split("|").filter((x) => /flex_grow/.test(x)).length, 5, "five equal pebbles, with or without counts");
  // Inbox took "+ Channel"'s place (DeNon, 2026-11-08): the needs-you count in a fixed slot, amber
  // when something waits, and the same widths with or without it. New topic stays in the list.
  const pebbleOf = (h, id) => ids(h).find((n) => n.args.id?.[0] === id);
  fixtures.shared["crew.needs"] = { count: 0 };
  const calm = heroOf(one, false);
  assert.ok(pebbleOf(calm, "hero-inbox") && !pebbleOf(calm, "hero-channel"), "the hero's first pebble is Inbox");
  assert.ok(pebbleOf(calm, "hero-inbox").args.tooltip[0].startsWith("Inbox") && !/\b(Channel|Topic)\b/.test(text(pebbleOf(calm, "hero-inbox"))), "its tooltip says Inbox");
  // The tools (T109, DeNon 2026-11-10: back to the separate raised buttons, "just laid out in a
  // more uniform way"): five pebbles of ONE size, 6 px apart, from the Topics well's left edge to
  // its right; icon and count centred together; the count only when there is one. At the 304 px
  // sidebar they show icons only (names in tooltips, so nothing truncates to "In…").
  {
    const h304 = roster.heroCard({ space: one, bot: crew.botOf(one) }, t, d, 304);
    const row = ids(h304).find((n) => n.args.id?.[0] === "hero-tools");
    assert.ok(row.args.px[0] === 8 && row.args.gap[0] === 6, "the row: 8 px in (the well's edges), 6 px between");
    const pebs = row.kids.map((k) => k.node);
    assert.deepEqual(pebs.map((n) => n.args.id[0]), ["hero-inbox", "hero-tasks", "hero-desk", "hero-profile", "hero-sleep"], "the five tools, in order, and nothing else in the row");
    for (const n of pebs) {
      assert.ok(n.args.flex_grow?.[0] === 1 && n.args.flex_basis?.[0] === 0 && !n.args.w, `${n.args.id[0]}: an equal share of the row, no fixed width`);
      assert.ok(n.args.h[0] === 28 && n.args.rounded[0] === 7 && n.args.bg[0] === "#1B1B1E" && n.calls.includes("shadow_xs"), `${n.args.id[0]}: the same raised pebble (28 px, r7, one face)`);
      assert.ok(n.args.tooltip?.[0], `${n.args.id[0]} has a tooltip`);
      const inner = n.kids.at(-1).node;
      assert.ok(inner.calls.includes("justify_center") && inner.calls.includes("items_center") && inner.args.px?.[0] === 6 && !inner.args.w, `${n.args.id[0]}: icon and count centred together`);
      assert.equal(text({ node: n }).trim(), "", `${n.args.id[0]}: no name at 304, and no count when there is none`);
      assert.ok(!inner.kids.some((k) => k.node.args.w?.[0] === 18), `${n.args.id[0]}: no empty count slot`);
    }
    const wide = roster.heroCard({ space: one, bot: crew.botOf(one) }, t, d, 440);
    for (const [id, name] of [["hero-inbox", "Inbox"], ["hero-tasks", "Tasks"], ["hero-desk", "Desk"]]) assert.ok(text(pebbleOf(wide, id)).includes(name), `${id} shows its name with room`);
    assert.equal(text(pebbleOf(wide, "hero-profile")).trim(), "", "Profile stays an icon");
    assert.ok(ids(wide).find((n) => n.args.id?.[0] === "hero-tools").kids.every((k) => k.node.args.flex_grow?.[0] === 1), "still five equal pebbles with names");
    // The open view's pebble is the lit one (the pebble's own primary face); the rest are plain.
    const lit = (n) => n.args.bg?.[0] !== "#1B1B1E";
    assert.ok(pebs.every((n) => !lit(n)), "nothing open: all plain");
    fixtures.shared["crew.view"] = "you";
    const open = roster.heroCard({ space: one, bot: crew.botOf(one) }, t, d, 304);
    assert.ok(lit(pebbleOf(open, "hero-inbox")) && !lit(pebbleOf(open, "hero-tasks")), "Inbox open: its pebble is lit");
    delete fixtures.shared["crew.view"];
    fixtures.layout = { id: "root", children: [{ id: "profile", hidden: false }, { id: "center", type: "stack", active: "desk-view", children: [{ id: "tab-view" }, { id: "desk-view" }] }] };
    const other0 = fixtures.spaces.find((sp) => !crew.botOf(sp).god);
    const two = roster.heroCard({ space: other0, bot: crew.botOf(other0) }, t, d, 304);
    assert.ok(lit(pebbleOf(two, "hero-desk")) && lit(pebbleOf(two, "hero-profile")), "the Desk view and the profile panel open: both lit");
    fixtures.layout = null;
    // A count sits beside the icon, in the same centred group, and doesn't change the pebble's share.
    const src = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
    assert.ok(!/toolStrip/.test(src) && !/toolStrip|"strip"/.test(readFileSync(join(root, "lib/crew.js"), "utf8")), "the recessed strip is gone");
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
  assert.equal(outline(heroAt(head, 281)).split("|").filter((x) => /flex_grow/.test(x)).length, 5);
  assert.equal(outline(heroAt(other, 281)).split("|").filter((x) => /flex_grow/.test(x)).length, 5, "the same five slots for the head pal and the rest");
  // On the head pal with Home showing, the last slot is raised (and Desk, which opens Home there, isn't).
  fixtures.layout = { id: "root", children: [{ id: "center", type: "stack", active: "home-view", children: [{ id: "tab-view" }, { id: "home-view" }] }] };
  { const h = heroAt(head, 304); assert.ok(pebbleOf(h, "hero-home").args.bg?.[0] !== "#1B1B1E" && pebbleOf(h, "hero-desk").args.bg?.[0] === "#1B1B1E", "Home showing: the Home pebble is the lit one"); }
  fixtures.layout = null;
  assert.ok(text(calm).includes("New topic"), "New topic is still the list's last row");
  fixtures.shared["crew.needs"] = { count: 3 };
  const busy = heroOf(one, false);
  const inbox = pebbleOf(busy, "hero-inbox");
  assert.ok(text(inbox).includes("3"), "Inbox shows what needs you");
  const countOf = (n) => n.kids.at(-1).node.kids.map((k) => k.node).find((x) => x.kids.includes("3"));
  assert.equal(countOf(inbox).args.text_color?.[0], d.warnText, "the count is amber while something waits");
  assert.ok(inbox.args.flex_grow?.[0] === 1 && !inbox.args.w, "and the pebble keeps its equal share");
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
    // T119, pal handoff: the brain a seat is handed to. Asking changes nothing; `keep` records it as
    // this topic's brain (what wake starts again); a brain that isn't installed is an error, said.
    const CODEX_IN = { key: "codex", name: "Codex", run: ["codex"], installed: true };
    fixtures.known = [CLAUDE, AGY, CODEX_IN];
    fixtures.shared.crew = before;
    const brainsOf = () => fixtures.shared.crew.bots.find((b) => b.id === rec.id)?.brains ?? {};
    const ask = await crew.requestHandlers["handoff-brain"]({ op: "handoff-brain", space: s1.id, tab: tab.id, to: "codex" });
    assert.equal(ask.ok, true); assert.equal(ask.key, "codex"); assert.equal(ask.name, "Codex"); assert.equal(ask.argv[0], "codex");
    assert.equal(ask.agy, false);
    assert.match(ask.hint, /pal primer/, "a brain without Project Pals' hooks is told where its primer is");
    assert.equal(brainsOf()[tab.id], undefined, "asking records nothing");
    await crew.requestHandlers["handoff-brain"]({ op: "handoff-brain", space: s1.id, tab: tab.id, to: "codex", keep: true });
    assert.equal(brainsOf()[tab.id], "codex", "kept as this topic's brain");
    const woke = await crew.requestHandlers["wake-brain"]({ op: "wake-brain", space: s1.id, tab: tab.id });
    assert.equal(woke.argv[0], "codex", "wake starts the seat's holder");
    fixtures.known = [CLAUDE, AGY, CODEX];
    await assert.rejects(crew.requestHandlers["handoff-brain"]({ op: "handoff-brain", space: s1.id, tab: tab.id, to: "codex" }), /isn't installed/);
    await assert.rejects(crew.requestHandlers["handoff-brain"]({ op: "handoff-brain", space: "nope", to: "codex" }), /isn't open/);
    fixtures.notes = [];
    await crew.requestHandlers["power-report"]({ op: "power-report", mode: "handoff", lines: ["handed X #y to Codex (was Claude Code)"], refused: false });
    assert.equal(fixtures.notes[0].title, "Handoff (same seat, another brain)"); assert.equal(fixtures.notes[0].level, "success");
    // The click (T138): who holds a topic's seat, and Hand to in the topic's menu.
    const sA = fixtures.spaces.find((s) => s.id === "s1"), sB = fixtures.spaces.find((s) => s.id === "s2");
    assert.equal(crew.topicBrain(sA, sA.tabs[0]), "claude", "the agent running there");
    assert.equal(crew.topicBrain(sB, sB.tabs[0]), "codex");
    const asleepTab = sA.tabs[3];   // #notes: no pane, so its brain on record, else the pal's
    fixtures.shared.crew = { ...before, bots: before.bots.map((b) => (b.id === rec.id ? { ...b, brains: { [asleepTab.id]: "codex" } } : b)) };
    if (crew.botOf(sA).record?.id === rec.id) assert.equal(crew.topicBrain(sA, asleepTab), "codex", "asleep: this topic's brain on record");
    fixtures.shared.crew = before;
    assert.deepEqual(await crew.seatHolders(sA.tabs[0]), [], "a seat that never changed hands");
    assert.deepEqual(crew.HANDOFF_BRAINS, ["claude", "codex"]);
    fixtures.notes = [];
    crew.handOff(sA, sA.tabs[0], "codex", { codex: "Codex" });
    assert.equal(fixtures.notes[0].title, "Handing #indicators to Codex…");
    crew.handOff(sA, sA.tabs[0], null);
    assert.equal(fixtures.notes.length, 1, "no brain named: nothing happens");
    const crewSrc = readFileSync(join(root, "lib/crew.js"), "utf8");
    assert.match(crewSrc, /const args = \["handoff", spec, "--to", to, "--notify"\];[\s\S]{0,500}JSON\.stringify\(\{ args, at: Date\.now\(\) \}\)[\s\S]{0,120}\.\.\.args\]/,
      "pal handoff is started with the click's token for exactly its arguments");
    const handMenu = readFileSync(join(root, "mods/crew-menu/main.js"), "utf8");
    assert.match(handMenu, /const canHand = !space\.machine && !botOf\(space\)\.god && brains\.some\(\(x\) => x\.key !== holds\)/, "not on another machine, not the head pal, not with one brain");
    assert.match(handMenu, /when\(!on, \(el\) => el\.cursor_pointer\(\)[\s\S]{0,260}handOff\(space, tab, ag\.key, names\); this\.close\(\)/, "the holder's own tile does nothing; another's hands over");
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
  // ── The working count beside "Pals" (T98, DeNon 2026-11-10): it moved here from the status strip
  // and counts every working agent: all pals and topics, every machine, every factory. ─────────
  {
    const keep = { agents: fixtures.agents, spaces: fixtures.spaces };
    fixtures.shared["crew.settings"] = {};
    let w = crew.workingEverywhere();
    assert.equal(w.count, 1, "the fixture: one topic working");
    assert.deepEqual(w.rows, [{ pal: "Project Pals - Herdr Mod", channel: "indicators", machine: null, factory: null }]);
    let chip = roster.workingChip(d).node;
    assert.equal(chip.args.id[0], "pals-working");
    assert.ok(text({ node: chip }).includes("1 working") && chip.args.tooltip[0].includes("Project Pals - Herdr Mod #indicators"), "the count, and who on hover");
    assert.equal(chip.kids[0].node.args.bg[0], d.info, "a blue dot while any works");
    // Another machine, another factory, a pal this list doesn't show, and an agent whose space is gone: all counted.
    fixtures.spaces = [...keep.spaces, { id: "s20", name: "Remote Pal", machine: "peecee", folder: "/x", index: 5, status: "working", tabs: [{ id: "t20", name: "build", status: "working" }] },
      { id: "s21", name: "Away Pal", folder: "/y", index: 6, status: "working", tabs: [{ id: "t21", name: "ship", status: "working" }] }];
    fixtures.agents = [...keep.agents, { space: "s20", tab: "t20", status: "working" }, { space: "s21", tab: "t21", status: "working" }, { space: "gone", tab: "t99", tab_name: "#orphan", status: "working" },
      { space: "s21", tab: "t21", status: "idle" }];
    fixtures.shared["crew.factories"] = { current: "default", factories: [{ id: "f-app001", name: "App Factory" }], pals: { "Away Pal": "f-app001" } };
    w = crew.workingEverywhere();
    assert.equal(w.count, 4, "every working agent, whatever the shown factory");
    assert.ok(w.rows.some((r) => r.pal === "Remote Pal" && r.machine === "peecee"), "another machine's");
    assert.ok(w.rows.some((r) => r.pal === "Away Pal" && r.factory === "App Factory"), "another factory's, named");
    assert.equal(crew.factoryOf("Away Pal"), "f-app001", "(a pal in a factory that isn't the shown one)");
    assert.ok(w.tip.includes("Remote Pal #build · peecee") && w.tip.includes("Away Pal #ship · App Factory") && w.tip.includes("#orphan"), w.tip);
    assert.ok(text({ node: roster.workingChip(d).node }).includes("4 working"));
    // More than eight: the tooltip names eight and counts the rest. None: grey, and it says so.
    fixtures.agents = Array.from({ length: 11 }, () => ({ space: "s20", tab: "t20", status: "working" }));
    assert.ok(crew.workingEverywhere().tip.endsWith("+3 more"));
    fixtures.agents = [{ space: "s1", tab: "t1", status: "idle" }];
    chip = roster.workingChip(d).node;
    assert.ok(text({ node: chip }).includes("0 working") && chip.kids[0].node.args.bg[0] === d.lineStrong && chip.args.tooltip[0].startsWith("No agent is working"));
    fixtures.agents = keep.agents; fixtures.spaces = keep.spaces; delete fixtures.shared["crew.factories"];
    const src = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
    assert.match(src, /child\("Pals"\)\)[\s\S]{0,400}\.child\(this\.workingChip\(d\)\)[\s\S]{0,600}\.child\(this\.treesToggle\(d\)\)/, "it sits in the Pals header, between the title and the buttons");
  }
  // ── The Rooms section folds (T99, DeNon 2026-11-09): a chevron on its header, the state
  // remembered in the settings ("roomsFolded", like the Topics list), a count, and a dot while a
  // room is busy. ──────────────────────────────────────────────────────────────────────────────
  {
    const rs = [{ id: "r1", name: "launch", members: [] }, { id: "r2", name: "design", members: [] }];
    fixtures.shared["crew.settings"] = {};
    assert.equal(crew.roomsFolded(), false, "open unless folded");
    let h = roster.roomsHeader(rs, d).node;
    assert.equal(h.args.id[0], "rooms-head");
    assert.ok(text({ node: h }).includes("Rooms") && text({ node: h }).includes("2"), "the title and how many");
    const chevron = (n) => ids({ node: n }).length >= 0 && JSON.stringify(n.kids.at(-1).node.kids.map((k) => k.node.arg));
    assert.match(chevron(h), /chevron-down\.svg/);
    assert.equal(h.args.tooltip[0], "Fold rooms");
    // A click folds it and saves the setting; the header then shows the other chevron.
    const before = fixtures.shared["crew.uiwrite"]?.at ?? 0;
    let notes = 0;
    h.args.on_click[0]({}, { notify() { notes++; } });
    assert.ok((fixtures.shared["crew.uiwrite"]?.at ?? 0) >= before && fixtures.shared["crew.uiwrite"]?.busy === true, "the setting is being saved (saveUiSettings, as the Topics fold does)");
    assert.equal(notes, 1);
    fixtures.shared["crew.settings"] = { roomsFolded: true };
    assert.equal(crew.roomsFolded(), true);
    h = roster.roomsHeader(rs, d).node;
    assert.match(chevron(h), /chevron-right\.svg/);
    assert.equal(h.args.tooltip[0], "Show rooms");
    assert.ok(text({ node: h }).includes("2"), "folded: still the count");
    // The list draws the rows only while unfolded; the keyboard command flips the same setting.
    const src = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
    assert.match(src, /list\.child\(this\.roomsHeader\(rs, d\)\);\s*if \(!roomsFolded\(\)\) list\.children\(rs\.map/, "folded: the header alone");
    assert.match(src, /c === "rooms-fold"\) \{ saveUiSettings\(\{ roomsFolded: !roomsFolded\(\) \}\); cx\.notify\(\); \}/, "crew-roster.rooms-fold does it from the keyboard");
    assert.ok(!ids({ node: h }).some((n) => n.args.id?.[0] === "rooms-dot"), "quiet rooms: no dot");
    fixtures.shared["crew.settings"] = {};
  }
  // ── A working pal rocks; its dot is steady (T102, DeNon 2026-11-10: this replaced T100's pulsing
  // dot). Wherever the sprite is drawn (petEl), boxed or open, big or a small head. ─────────────
  {
    const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
    const pets = await import(url("pets.js"));
    const bot = crew.botOf(fixtures.spaces[0]);
    const pet = crew.petOf(bot);
    assert.ok(pet, "the fixture pal has a pet");
    const sway = (el) => all(el).filter((n) => n.args.loop?.[0] === "left");
    for (const [w, open] of [[75, true], [75, false], [150, true], [32, true], [32, false], [20, false], [240, true]]) {
      const el = crew.petEl(pet, "work", w, undefined, { open });
      const s = sway(el);
      assert.equal(s.length, 1, `${w}px ${open ? "open" : "boxed"}: one swaying wrapper`);
      const [, pol] = s[0].args.loop;
      assert.ok(pol.from === -crew.rockPx(w) && pol.to === crew.rockPx(w) && pol.period === 2600 && !pol.easing, `${w}px: side to side and back in 2.6 s, eased (the default)`);
      assert.ok(crew.rockPx(w) >= 0.75 && crew.rockPx(w) <= 3, `${w}px: a gentle ${crew.rockPx(w)} px`);
      assert.ok(s[0].args.w[0] === w && s[0].calls.includes("absolute"), "the wrapper fills the pet's box");
      // Every sprite layer is inside it (the pet and its paw), so they move as one; the box itself doesn't.
      const imgs = all(el).filter((n) => n.kind === "image" && /crew-pets/.test(String(n.arg)));
      const inside = all({ node: s[0] }).filter((n) => n.kind === "image");
      assert.ok(imgs.length >= 1 && imgs.every((n) => inside.includes(n)), `${w}px ${open ? "open" : "boxed"}: all ${imgs.length} sprite layers sway together`);
      assert.ok(!el.node.calls.includes("loop"), "the box keeps still");
      // No dots float up off the laptop (T107, DeNon 2026-11-10): no bits image, nothing drifting upward, and the
      // sprite is the pet plus its paw frame (a small head: the pet alone).
      assert.ok(!all(el).some((n) => n.kind === "image" && /bits/.test(String(n.arg))), `${w}px ${open ? "open" : "boxed"}: no rising bits`);
      assert.ok(!all(el).some((n) => n.args.loop?.[0] === "top"), `${w}px ${open ? "open" : "boxed"}: nothing drifts up`);
      assert.equal(imgs.length, w < pets.SMALL_BELOW ? 1 : 2, `${w}px ${open ? "open" : "boxed"}: the pet${w < pets.SMALL_BELOW ? "" : " and its paw frame"}, nothing else`);
      // Not working: nothing sways. Working but told to keep still: nothing sways.
      for (const st of ["rest", "done", "ask"]) assert.equal(sway(crew.petEl(pet, st, w, undefined, { open })).length, 0, `${w}px ${st}: still`);
      assert.equal(sway(crew.petEl(pet, "work", w, undefined, { open, rock: false })).length, 0, `${w}px: rock off keeps a working pet still`);
    }
    assert.equal(crew.rockPx(75), 1.5); assert.equal(crew.rockPx(20), 0.75); assert.equal(crew.rockPx(400), 3);
    // In the sidebar: a working pal's row sways its pet (Trees on or off), a resting pal's doesn't, and no dot pulses.
    const keep = { agents: fixtures.agents, spaces: fixtures.spaces, pets: fixtures.shared["crew.pets"], panes: fixtures.panes };
    const busy = { ...fixtures.spaces[0], id: "s30", status: "working", tabs: [{ id: "t30", name: "build", status: "working", changed_at: Date.now(), active: true }] };
    const calm = { ...fixtures.spaces[0], id: "s32", status: "idle", tabs: [{ id: "t34", name: "main", status: "idle", changed_at: 1, active: true }] };
    fixtures.spaces = [busy, calm];
    fixtures.panes = [...keep.panes, { tab: "t30", terminal: "z0", program: { agent: true, key: "claude", name: "Claude Code" } }, { tab: "t34", terminal: "z1", program: { agent: true, key: "claude", name: "Claude Code" } }];
    fixtures.agents = [{ space: "s30", tab: "t30", status: "working" }, { space: "s32", tab: "t34", status: "idle" }];
    for (const sp of [busy, calm]) { const p = crew.petOf(crew.botOf(sp)); fixtures.shared["crew.pets"] = [...(fixtures.shared["crew.pets"] ?? []), pets.petKey(p)]; }
    for (const look of ["large", "table", "tight"]) for (const trees of [true, false]) {
      fixtures.shared["crew.settings"] = trees ? { palList: look } : { palList: look, palTrees: false };
      const rowOf = (sp) => roster.palRow({ space: sp, bot: crew.botOf(sp) }, t, d, null);
      assert.equal(sway(rowOf(busy)).length, 1, `${look} trees ${trees}: the working pal's pet rocks`);
      assert.equal(sway(rowOf(calm)).length, 0, `${look} trees ${trees}: a resting pal is still`);
      const dots = all(rowOf(busy)).filter((n) => n.calls.includes("rounded") && (n.args.size?.[0] === 7 || n.args.size?.[0] === 9) && n.args.bg);
      assert.ok(dots.every((n) => !n.calls.includes("loop")), `${look} trees ${trees}: the dot is steady`);
    }
    // No timer of ours drives it.
    assert.ok(!/setInterval/.test(readFileSync(join(root, "lib/crew.js"), "utf8")), "no timer for the rocking");
    fixtures.agents = keep.agents; fixtures.spaces = keep.spaces; fixtures.shared["crew.pets"] = keep.pets; fixtures.panes = keep.panes; fixtures.shared["crew.settings"] = {};
  }
  // ── Room rows: the members' heads, overlapping, instead of "#" (T101, DeNon's pick B) ─────────
  {
    const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
    const mk = (name, channel) => ({ name, channel, bot: { name, harness: "claude", awake: true } });
    const chips = (el) => el.node.kids.map((k) => k.node);
    // Three pals: three round 24 px chips, 16 px apart (so they overlap by 8), edged in the row's colour.
    let el = crew.roomHeads(d, [mk("Orca", "ops"), mk("Softly", "main"), mk("Tiles", "ui")], d.bg1, t);
    let c = chips(el);
    assert.equal(c.length, 3);
    assert.deepEqual(c.map((n) => n.args.left[0]), [0, 16, 32], "each 16 px along");
    assert.ok(c.every((n) => n.args.size[0] === 24 && n.args.rounded[0] === 12 && n.calls.includes("overflow_hidden") && n.args.border_color[0] === d.bg1), "round chips cut out of the row");
    assert.equal(el.node.args.w[0], 24 + 2 * 16, "the icon is as wide as its chips");
    assert.equal(el.node.args.tooltip[0], "Orca #ops, Softly #main, Tiles #ui", "hover names every member");
    assert.ok(c.every((n) => n.kids.length === 1), "one head in each");
    // Two members: two heads. One head per member (a seat), so a pal with several topics in the
    // room shows once for each: three topics of one pal is a three-member room, not a one-member one.
    assert.equal(chips(crew.roomHeads(d, [mk("Orca", "ops"), mk("Softly", "main")], d.bg1, t)).length, 2);
    assert.equal(chips(crew.roomHeads(d, [mk("Pals", "factories"), mk("Pals", "chief"), mk("Pals", "factories-chief")], d.bg1, t)).length, 3, "three seats of one pal: three heads");
    el = crew.roomHeads(d, [mk("Orca", "ops"), mk("Orca", "general"), mk("Softly", "main")], d.sel, t);
    assert.equal(chips(el).length, 3, "one head per seat");
    assert.ok(el.node.args.tooltip[0].includes("Orca #ops, Orca #general"), "the tooltip still lists both topics");
    assert.equal(chips(el)[0].args.border_color[0], d.sel, "on the shown room the edge is the selection's colour");
    // Five members (here two pals' seats among them): three heads and "+2".
    assert.ok(text({ node: chips(crew.roomHeads(d, [mk("A", "1"), mk("A", "2"), mk("B", "1"), mk("B", "2"), mk("C", "1")], d.bg1, t))[3] }).includes("+2"), "+N counts members, not pals");
    el = crew.roomHeads(d, ["A", "B", "C", "D", "E"].map((x) => mk(x, "x")), d.bg1, t);
    c = chips(el);
    assert.equal(c.length, 4);
    assert.ok(text({ node: c[3] }).includes("+2") && c[3].args.left[0] === 48, "then +N for the rest");
    assert.equal(el.node.args.w[0], 24 + 3 * 16);
    // Nobody yet: one quiet chip, so names still line up.
    el = crew.roomHeads(d, [], d.bg1, t);
    assert.ok(chips(el).length === 1 && el.node.args.tooltip[0] === "Nobody is in this room yet");
    // A pal whose pet is drawn shows its own small head (pets.js small: the "-s" tile), so Pal look colours apply.
    const bot = crew.botOf(fixtures.spaces[0]);
    const pet = crew.petOf(bot);
    if (pet) {
      const keep = fixtures.shared["crew.pets"];
      fixtures.shared["crew.pets"] = [...(keep ?? []), (await import(url("pets.js"))).petKey(pet)];
      const img = all(crew.roomHeads(d, [{ name: bot.name, channel: "x", bot }], d.bg1, t)).find((n) => n.kind === "image");
      assert.ok(img && /-rest-s\.svg$/.test(img.arg), `the pal's own small head (${img?.arg})`);
      fixtures.shared["crew.pets"] = keep;
    }
    // The sidebar's room rows, drawn for real (open and folded): the heads, the name, no "#", no count.
    {
      const { el: mkEl } = await import(url("node_modules/gpui-kit/index.js"));
      const keepCrew = fixtures.shared.crew;
      fixtures.shared.crew = { ...keepCrew, rooms: [{ id: "r1", name: "launch", members: [{ space: "s1", tab: "t1" }, { space: "s2", tab: "t5" }] }, { id: "r2", name: "empty-room", members: [] }] };
      fixtures.shared["crew.settings"] = {};
      const list = mkEl("div");
      roster.extras(list, [], 0, d);
      const rowsDrawn = ids(list).filter((n) => /^room-r\d$/.test(n.args.id?.[0] ?? ""));
      assert.equal(rowsDrawn.length, 2, "both rooms draw");
      const launch = rowsDrawn[0];
      assert.ok(text({ node: launch }).includes("launch") && !text({ node: launch }).includes("#"), "the name, and no #");
      const icon = launch.kids[0].node;
      assert.ok(icon.args.tooltip[0].includes("Project Pals - Herdr Mod #indicators") && icon.args.tooltip[0].includes("Orca #general"), `its members on hover (${icon.args.tooltip[0]})`);
      assert.equal(icon.kids.length, 2, "two members: two heads");
      assert.equal(launch.kids.length, 2, "the icon and the name: no count");
      fixtures.shared["crew.settings"] = { roomsFolded: true };
      const folded = mkEl("div");
      roster.extras(folded, [], 0, d);
      assert.equal(ids(folded).filter((n) => /^room-r\d$/.test(n.args.id?.[0] ?? "")).length, 0, "folded: no room rows");
      assert.ok(ids(folded).some((n) => n.args.id?.[0] === "rooms-head"), "folded: the header stays");
      fixtures.shared.crew = keepCrew; fixtures.shared["crew.settings"] = {};
    }
    // And in the source: no "#", no count.
    const src = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
    const rowSrc = src.slice(src.indexOf("if (!roomsFolded()) list.children(rs.map"), src.indexOf("if (!roomsFolded()) list.children(rs.map") + 900);
    assert.ok(rowSrc.includes("roomHeads(d, roomMembers(room)") && !rowSrc.includes('child("#")') && !rowSrc.includes("roomMembers(room).length"), "room rows: heads, no # and no count");
  }
  // ── No hard edges (T103, DeNon 2026-11-10): the hero's floor glow ends inside its image and the
  // image ends with the art; scroll areas fade at an end while there is more beyond it. ─────────
  {
    const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
    // The floor glows: every one reaches zero opacity inside its 300x80 image, on the bottom, top and right.
    for (const f of readdirSync(join(root, "mods/crew-roster/icons")).filter((x) => /^pet-floor-.*\.svg$/.test(x))) {
      const svg = readFileSync(join(root, "mods/crew-roster/icons", f), "utf8");
      const m = /gradientUnits="userSpaceOnUse" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" gradientTransform="translate\(0 ([\d.]+)\) scale\(1 ([\d.]+)\) translate\(0 -([\d.]+)\)"/.exec(svg);
      assert.ok(m, `${f}: an ellipse in the image's own pixels`);
      const [cx, cy, r, , ky] = m.slice(1).map(Number);
      assert.ok(cy + r * ky < 80 && cy - r * ky > 0 && cx + r < 300, `${f}: the glow ends inside the image (bottom ${cy + r * ky}, top ${cy - r * ky}, right ${cx + r})`);
      assert.match(svg, /<stop offset="1" [^>]*stop-opacity="0"\/>/, `${f}: and it ends at nothing`);
    }
    // In the hero the pool's image ends exactly where the art does.
    fixtures.shared["crew.settings"] = {};
    const busy = { ...fixtures.spaces[0], id: "s40", status: "working", tabs: Array.from({ length: 9 }, (_, i) => ({ id: `u${i}`, name: `topic${i}`, status: i ? "idle" : "working", changed_at: 1, active: i === 0 })) };
    const keepA = fixtures.agents, keepP = fixtures.shared["crew.pets"], keepPanes = fixtures.panes;
    fixtures.agents = [{ space: "s40", tab: "u0", status: "working" }];
    fixtures.panes = [...keepPanes, { tab: "u0", terminal: "zz", program: { agent: true, key: "claude", name: "Claude Code" } }];
    const bot = crew.botOf(busy);
    fixtures.shared["crew.pets"] = [...(keepP ?? []), (await import(url("pets.js"))).petKey(crew.petOf(bot))];
    const hero = roster.heroCard({ space: busy, bot }, t, d, 304);
    const art = ids(hero).find((n) => n.args.id?.[0] === "hero-art"), pool = ids(hero).find((n) => n.args.id?.[0] === "hero-pool");
    assert.ok(pool, "a working pal has its pool of light");
    assert.equal(pool.args.top[0] + pool.args.h[0], art.args.h[0], "the pool's image ends with the art: nothing lit is cut off above Topics");
    assert.ok(pool.args.top[0] >= 0, "and starts inside it");
    // Scroll fades: none while everything fits; the bottom one while there's more below; both in the middle; the top one at the end.
    const sc = crew.scrollState("fade-test");
    // A fresh card each time: an element goes into one parent only.
    const fades = () => ids(crew.scrollArea(d, "fade-test", roster.heroCard({ space: busy, bot }, t, d, 304), { fade: "side" })).map((n) => n.args.id[0]);
    Object.assign(sc, { view: 200, content: 200, y: 0 });
    assert.deepEqual(fades().filter((x) => x === "fade-top" || x === "fade-bottom"), [], "everything fits: no fade");
    Object.assign(sc, { view: 200, content: 500, y: 0 });
    assert.deepEqual(fades().filter((x) => x === "fade-top" || x === "fade-bottom"), ["fade-bottom"], "at the top: only the bottom fades");
    sc.y = 120;
    assert.deepEqual(fades().filter((x) => x === "fade-top" || x === "fade-bottom"), ["fade-top", "fade-bottom"], "in the middle: both");
    sc.y = 300;
    assert.deepEqual(fades().filter((x) => x === "fade-top" || x === "fade-bottom"), ["fade-top"], "at the end: only the top");
    // A fade is a clipped strip of unscaled 64 px tiles of the surface's colour, with no handlers, under the pill.
    sc.y = 120;
    const area = crew.scrollArea(d, "fade-test", hero, { fade: "well" }).node;
    const strip = area.kids.map((k) => k.node).filter((n) => /^fade-(top|bottom)$/.test(n.args.id?.[0] ?? ""));
    assert.equal(strip.length, 2);
    for (const n of strip) {
      const edge = n.args.id[0].slice(5);
      assert.ok(n.calls.includes("overflow_hidden") && n.args.h[0] === crew.FADE[edge] && n.args[edge]?.[0] === 0, `${edge}: on that edge, ${crew.FADE[edge]} px`);
      assert.ok(!n.calls.some((c) => c.startsWith("on_")), `${edge}: takes no pointer events`);
      const imgs = all({ node: n }).filter((x) => x.kind === "image");
      assert.equal(imgs.length, crew.FADE.tiles);
      assert.ok(imgs.every((x) => x.arg.endsWith(`fade-well-${edge}.svg`) && x.args.w[0] === 64 && x.args.h[0] === crew.FADE[edge]), `${edge}: tiles at their own size`);
      assert.ok((crew.FADE.tiles - 1) * 63 + 64 >= 440, "the tiles cover the widest sidebar");
    }
    const order = area.kids.map((k) => k.node.args.id?.[0] ?? "");
    assert.ok(order.indexOf("fade-bottom") < order.indexOf("fade-test-thumb") && order.indexOf("fade-test-content") < order.indexOf("fade-top"), "over the rows, under the pill");
    // The images exist for both surfaces, dark and light, and go from the surface's colour to clear.
    for (const [name, hex] of [["side", "#0E0E0F"], ["well", "#030304"], ["side-light", "#F7F7F8"], ["well-light", "#E6E6E9"]]) for (const edge of ["top", "bottom"]) {
      const svg = readFileSync(join(root, `mods/crew-roster/icons/fade-${name}-${edge}.svg`), "utf8");
      const ops = [...svg.matchAll(/stop-color="(#[0-9A-F]{6})" stop-opacity="([\d.]+)"/g)].map((m) => [m[1], Number(m[2])]);
      assert.ok(ops.length === 3 && ops.every(([c]) => c === hex), `fade-${name}-${edge}: the surface's colour`);
      assert.deepEqual([ops[0][1], ops[2][1]], edge === "top" ? [1, 0] : [0, 1], `fade-${name}-${edge}: solid at the edge, clear inside`);
      assert.match(svg, new RegExp(`width="64" height="${crew.FADE[edge]}"`));
    }
    assert.equal(crew.ds({ background: "#0E0E0F" }).bg1, "#0E0E0F"); assert.equal(crew.ds({ background: "#FFFFFF" }).bg1, "#F7F7F8");
    // The two sidebar scroll areas ask for them: the list on the sidebar, the Topics list on its well.
    const src = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
    assert.match(src, /scrollArea\(d, "crew-list", inner, \{ fade: "side" \}\)/);
    assert.match(src, /scrollArea\(d, SID, [^\n]*\{ fade: "well" \}\)/);
    // And the hero's own Topics list, nine topics: a bottom fade over the cut fifth row.
    assert.ok(ids(hero).some((n) => n.args.id?.[0] === "hero-ch-list"), "the Topics list draws");
    fixtures.agents = keepA; fixtures.shared["crew.pets"] = keepP; fixtures.panes = keepPanes;
  }
  // ── Dragging a pal to reorder, with no groups made and a head pal in the list (T104, DeNon
  // 2026-11-10: "dragging pals to reorder doesn't work"). The drop looked its target up in the
  // head pal's own section, never found it, and put the pal last every time. ─────────────────
  {
    const keep = { spaces: fixtures.spaces, marks: fixtures.shared["crew.marks"], crew: fixtures.shared.crew };
    const mk = (id, name, index) => ({ id, name, folder: `/p/${id}`, index, status: "idle", tabs: [{ id: `${id}t`, name: "main", status: "idle", changed_at: 1, active: true }] });
    fixtures.spaces = [mk("d0", "Orca", 0), mk("d1", "Alpha", 1), mk("d2", "Beta", 2), mk("d3", "Gamma", 3), mk("d4", "Delta", 4)];
    fixtures.shared.crew = { bots: [{ id: "b-orca", name: "Orca", space: "d0", god: true }, ...["Alpha", "Beta", "Gamma", "Delta"].map((n, i) => ({ id: `b-${n.toLowerCase()}`, name: n, space: `d${i + 1}` }))] };
    fixtures.shared["crew.marks"] = { pals: {}, tabs: {} };
    const idOf = (n) => crew.botOf(fixtures.spaces.find((x) => x.name === n)).id;
    const order = () => crew.palSections(fixtures.spaces.map((space) => ({ space, bot: crew.botOf(space) }))).find((x) => x.group === null).rows.map((r) => r.bot.name);
    assert.deepEqual(order(), ["Alpha", "Beta", "Gamma", "Delta"], "to start with");
    assert.equal(crew.palGroups().length, 0, "no groups made");
    const cx = { notify() {} };
    const drag = (who, onto, after) => { roster.drag = { id: idOf(who), gid: null, y0: 0, active: true, over: { id: idOf(onto), gid: null, after } }; roster.drop(cx); };
    drag("Delta", "Beta", false);
    assert.deepEqual(order(), ["Alpha", "Delta", "Beta", "Gamma"], "dropped on Beta's top half: Delta lands before Beta (not last)");
    drag("Alpha", "Beta", true);
    assert.deepEqual(order(), ["Delta", "Beta", "Alpha", "Gamma"], "dropped on Beta's bottom half: after it");
    drag("Gamma", "Delta", false);
    assert.deepEqual(order(), ["Gamma", "Delta", "Beta", "Alpha"], "to the very top");
    drag("Gamma", "Alpha", true);
    assert.deepEqual(order(), ["Delta", "Beta", "Alpha", "Gamma"], "and to the very end");
    assert.equal(roster.drag, null, "the drag is over");
    // The rows themselves take the drag in every look, the head pal's doesn't, and the order survives a redraw.
    for (const look of ["table", "large", "tight"]) {
      fixtures.shared["crew.settings"] = { palList: look };
      const row = roster.palRow({ space: fixtures.spaces[1], bot: crew.botOf(fixtures.spaces[1]) }, t, d, null);
      const top = ids(row).find((n) => n.args.id?.[0] === "bot-d1");
      assert.ok(top.calls.includes("on_mouse_move") && top.calls.filter((c) => c === "on_mouse_down").length >= 2, `${look}: a pal row starts a drag`);
    }
    // With groups made, a drop into Unassigned also lands where it was dropped.
    fixtures.shared["crew.marks"] = { ...fixtures.shared["crew.marks"], groups: [{ id: "g9", name: "Work" }] };
    drag("Gamma", "Beta", false);
    assert.deepEqual(order(), ["Delta", "Gamma", "Beta", "Alpha"], "with a group made too: before Beta in Unassigned");
    fixtures.spaces = keep.spaces; fixtures.shared["crew.marks"] = keep.marks; fixtures.shared.crew = keep.crew; fixtures.shared["crew.settings"] = {};
  }
  // ── Topic areas in the Topics list (T105 stage 2, DeNon's pick B: an area switcher in one row
  // of chips over the same four-row list). ───────────────────────────────────────────────────
  {
    const keep = { spaces: fixtures.spaces, agents: fixtures.agents, panes: fixtures.panes, areas: fixtures.shared["crew.areas"] };
    const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
    const tab = (id, name, status, changed = 1, active = false) => ({ id, name, status, changed_at: changed, active });
    const big = { ...fixtures.spaces[0], id: "s50", name: "Big Pal", status: "working", tabs: [
      tab("a1", "rel-harden", "idle", 50, true), tab("a2", "rel-docs", "idle", 40), tab("a3", "topics-look", "working", 90), tab("a4", "pal-looks", "idle", 10),
      tab("a5", "desk", "blocked", 80), tab("a6", "landing", "idle", 5), tab("a7", "scratch", "idle", 3), tab("a8", "old-notes", "idle", 2)] };
    const plain = { ...fixtures.spaces[1], id: "s51", name: "Plain Pal", tabs: [tab("p1", "general", "idle", 1, true)] };
    fixtures.spaces = [big, plain];
    // Awake (an agent running): rel-harden, topics-look, desk. The rest are asleep.
    fixtures.panes = ["a1", "a3", "a5", "p1"].map((t, i) => ({ tab: t, terminal: `y${i}`, program: { agent: true, key: "claude", name: "Claude Code" } }));
    fixtures.agents = [{ space: "s50", tab: "a3", status: "working" }, { space: "s50", tab: "a5", status: "blocked" }, { space: "s50", tab: "a1", status: "idle" }];
    const store = crew.cleanAreas({ pals: { "big pal": { areas: [{ id: "a-rel001", name: "Releases" }, { id: "a-side01", name: "Sidebar and look" }, { id: "a-empty1", name: "Empty" }, { id: "bad", name: "x" }],
      topics: { "rel-harden": "a-rel001", "#rel-docs": "a-rel001", "topics-look": "a-side01", "Pal_Looks": "a-side01", desk: "a-gone00", "": "a-rel001" } }, Nobody: { areas: [] }, Odd: 3 } });
    // The store, cleaned as the command-line side cleans it.
    assert.deepEqual(Object.keys(store.pals), ["big pal"], "pals with no areas, and junk, are dropped");
    assert.deepEqual(store.pals["big pal"].areas.map((a) => a.name), ["Releases", "Sidebar and look", "Empty"]);
    assert.deepEqual(store.pals["big pal"].topics, { "rel-harden": "a-rel001", "rel-docs": "a-rel001", "topics-look": "a-side01", Pal_Looks: "a-side01" }, "dangling filings are dropped");
    assert.deepEqual(crew.cleanAreas(null), { pals: {} }); assert.deepEqual(crew.cleanAreas("x"), { pals: {} });
    assert.equal(crew.areaOfTopic("Big Pal", "#pal-looks", store).name, "Sidebar and look", "names match as pal names do (case, - and _)");
    assert.equal(crew.areaOfTopic("Big Pal", "desk", store), null);
    assert.equal(crew.anyAreas(store), true); assert.equal(crew.anyAreas({ pals: {} }), false);
    // The views, in chip order. Live: every awake topic and the one on screen. Empty areas are left out.
    const awake = new Set(["a1", "a3", "a5"]), has = (t) => awake.has(t.id);
    const views = crew.areaViews("Big Pal", big.tabs, has, store);
    assert.deepEqual(views.map((v) => [v.id, v.name, v.tabs.map((t) => t.name).join(",")]), [
      ["live", "Live", "rel-harden,topics-look,desk"],
      ["a-rel001", "Releases", "rel-harden,rel-docs"],
      ["a-side01", "Sidebar and look", "topics-look,pal-looks"],
      ["none", "Unsorted", "desk,landing,scratch,old-notes"],
      ["all", "All", big.tabs.map((t) => t.name).join(",")]]);
    assert.deepEqual(views.map((v) => [v.working, v.asks]), [[1, 1], [0, 0], [1, 0], [0, 1], [1, 1]], "each view knows what works and what asks in it");
    assert.ok(views[0].tabs.some((t) => t.status === "blocked"), "a topic that needs you is always in Live, whatever its area");
    // Nothing awake: Live is the shown topic and the four most recently active, so it's never empty.
    assert.deepEqual(crew.areaViews("Big Pal", big.tabs, () => false, store)[0].tabs.map((t) => t.name), ["rel-harden", "rel-docs", "topics-look", "desk"]);
    // A pal with no areas of its own, once anyone has areas: Live and All only.
    assert.deepEqual(crew.areaViews("Plain Pal", plain.tabs, () => true, store).map((v) => v.id), ["live", "all"]);

    // In the sidebar. No areas anywhere: no chip row, the list is every topic (as before).
    Object.assign(roster, { width: 304, chSearch: { value: () => "", set_value() {}, focus() {} }, chSearchOpen: false, areaView: {}, areaX: {}, areaShownKey: null });
    delete fixtures.shared["crew.areas"]; fixtures.shared["crew.settings"] = {};
    const heroOfBig = () => roster.heroCard({ space: big, bot: crew.botOf(big) }, t, d, 304);
    // (The list keeps its own order: what asks you, then what works, then the rest; compare as sets.)
    const rowsOf = (h) => ids(h).filter((n) => /^hero-ch-a\d$/.test(n.args.id?.[0] ?? "")).map((n) => n.args.id[0].slice(8)).sort();
    let h = heroOfBig();
    assert.ok(!ids(h).some((n) => n.args.id?.[0] === "hero-areas"), "no areas anywhere: no chip row");
    assert.equal(rowsOf(h).length, 8, "and every topic is listed");
    const artH = (x) => all(x).filter((n) => n.args.h && !n.args.id?.[0]?.startsWith("hero-ch-")).map((n) => n.args.h[0]).join(",");
    // With areas: one 26 px chip row, Live chosen, the list is the Live view.
    fixtures.shared["crew.areas"] = store;
    h = heroOfBig();
    const chipRow = ids(h).find((n) => n.args.id?.[0] === "hero-areas");
    assert.ok(chipRow && chipRow.args.h[0] === 26, "a 26 px row of chips");
    const track = ids(h).find((n) => n.args.id?.[0] === "hero-areas-track");
    assert.ok(track.calls.includes("overflow_hidden") && track.calls.includes("on_scroll_wheel") && track.args.h[0] === 22, "one row, clipped, scrolled sideways by the wheel");
    const chipIds = () => ids(heroOfBig()).filter((n) => n.args.id?.[0]?.startsWith("hero-area-")).map((n) => n.args.id[0].slice(10));
    assert.deepEqual(chipIds(), ["live", "a-rel001", "a-side01", "none", "all"]);
    assert.deepEqual(rowsOf(h), ["a1", "a3", "a5"], "Live: the awake topics");
    const chipOf = (hh, id) => ids(hh).find((n) => n.args.id?.[0] === `hero-area-${id}`);
    assert.equal(chipOf(h, "live").args.bg[0], d.me, "the chosen chip is filled");
    assert.equal(chipOf(h, "a-rel001").args.bg[0], d.raised);
    assert.ok(text({ node: chipOf(h, "a-side01") }).includes("Sidebar and look") && text({ node: chipOf(h, "a-side01") }).includes("2"), "a chip: the name and how many");
    const dotOf = (n) => n.kids.map((k) => k.node).find((x) => x.args.size?.[0] === 6)?.args.bg[0] ?? null;
    assert.equal(dotOf(chipOf(h, "a-side01")), d.info, "a blue dot: something in it works");
    assert.equal(dotOf(chipOf(h, "none")), d.warn, "an amber dot: something in it asks you");
    assert.equal(dotOf(chipOf(h, "a-rel001")), null, "quiet: no dot");
    assert.match(chipOf(h, "none").args.tooltip[0], /Unsorted: 4 topics, 1 needs you/);
    // The header still counts every topic.
    assert.ok(text({ node: ids(h).find((n) => n.args.id?.[0] === "hero-ch-head") }).includes("8"), "Topics still says 8");
    // A click on a chip shows that area; the choice is per pal and is remembered while the app runs.
    let notes = 0;
    chipOf(h, "a-rel001").args.on_click[0]({}, { notify() { notes++; } });
    assert.equal(notes, 1);
    h = heroOfBig();
    assert.deepEqual(rowsOf(h), ["a1", "a2"], "Releases: its two topics");
    assert.equal(chipOf(h, "a-rel001").args.bg[0], d.me);
    chipOf(h, "all").args.on_click[0]({}, { notify() {} });
    assert.equal(rowsOf(heroOfBig()).length, 8, "All: every topic");
    // A view that goes away (its last topic was unfiled) falls back to Live.
    roster.areaView.s50 = "a-gone00";
    assert.deepEqual(rowsOf(heroOfBig()), ["a1", "a3", "a5"]);
    // A pal that has no such area (the choice is per pal, but be sure): Live, and no throw.
    roster.areaView.s51 = "a-rel001";
    assert.doesNotThrow(() => roster.heroCard({ space: plain, bot: crew.botOf(plain) }, t, d, 304), "an unknown view never fails the render");
    delete roster.areaView.s51;
    // A search looks through every topic, whatever the view.
    roster.areaView.s50 = "a-rel001"; roster.chSearchOpen = true; roster.chSearch = { value: () => "notes", set_value() {}, focus() {} };
    assert.deepEqual(rowsOf(heroOfBig()), ["a8"], "search finds a topic outside the shown area");
    roster.chSearchOpen = false; roster.chSearch = { value: () => "", set_value() {}, focus() {} };
    // Every pal gets the row once areas exist, so the hero is the same height whichever pal shows.
    roster.areaView = {};
    const hPlain = roster.heroCard({ space: plain, bot: crew.botOf(plain) }, t, d, 304);
    assert.deepEqual(ids(hPlain).filter((n) => n.args.id?.[0]?.startsWith("hero-area-")).map((n) => n.args.id[0].slice(10)), ["live", "all"], "a pal with no areas: Live and All");
    assert.equal(ids(hPlain).find((n) => n.args.id?.[0] === "hero-areas").args.h[0], 26);
    const boxH = (x) => all(x).find((n) => n.args.h?.[0] === 132 && n.args.bg?.[0] === "#030304");
    assert.ok(boxH(hPlain) && boxH(heroOfBig()), "and the well is still its fixed 132 px for both");
    // The wheel slides the chips when they don't fit, and never past the ends; at 304 px these five need more room than there is.
    roster.areaX = {}; roster.areaShownKey = null;
    const tr = () => ids(heroOfBig()).find((n) => n.args.id?.[0] === "hero-areas-track");
    const strip = (n) => n.kids[0].node.args.left[0];
    assert.equal(strip(tr()), -0, "starts at the left");
    let moved = 0;
    tr().args.on_scroll_wheel[0]({ delta: { x: 0, y: -60 } }, { notify() { moved++; }, stop_propagation() {} });
    assert.ok(moved === 1 && strip(tr()) === -60, "the wheel slides the chips");
    tr().args.on_scroll_wheel[0]({ delta: { x: -5000, y: 0 } }, { notify() {}, stop_propagation() {} });
    const end = -strip(tr());
    assert.ok(end > 60 && end < 400, `it stops at the end (${end})`);
    tr().args.on_scroll_wheel[0]({ delta: { x: 5000, y: 0 } }, { notify() {}, stop_propagation() {} });
    assert.equal(strip(tr()), -0, "and at the start");
    // Choosing the last chip brings it into view.
    roster.areaView = { s50: "all" };
    assert.ok(-strip(tr()) > 0, "the chosen chip is scrolled into view");
    // Folded: the header alone, no chips.
    fixtures.shared["crew.settings"] = { heroTopicsFolded: true };
    assert.ok(!ids(heroOfBig()).some((n) => n.args.id?.[0] === "hero-areas"), "folded: no chip row");
    fixtures.shared["crew.settings"] = {};
    // A renamed topic: the roster says so, once, and only for a topic that is filed.
    roster.tabNames = undefined; roster.areaView = {};
    roster.followRenames();
    assert.equal(roster.tabNames.get("a2"), "rel-docs");
    fixtures.spaces = [{ ...big, tabs: big.tabs.map((x) => x.id === "a2" ? { ...x, name: "release-docs" } : x.id === "a7" ? { ...x, name: "scratchpad" } : x) }, plain];
    const ran = []; const realExec = fixtures.exec;
    roster.followRenames();
    assert.equal(roster.tabNames.get("a2"), "release-docs", "the new name is remembered");
    assert.equal(roster.tabNames.get("a7"), "scratchpad");
    fixtures.spaces = [plain]; roster.followRenames();
    assert.ok(!roster.tabNames.has("a2") && roster.tabNames.has("p1"), "closed topics are forgotten");
    void ran; void realExec; void artH;
    // The topic's right-click menu: an "Area: …" row once the pal has areas, opening the list.
    const menuSrc = readFileSync(join(root, "mods/crew-menu/main.js"), "utf8");
    assert.match(menuSrc, /when\(areasOf\(space\.name\)\.areas\.length > 0, \(el\) => el\.child\(line\(\)\)\s*\.child\(item\("m-area"/, "the Area row shows only when the pal has areas");
    assert.match(menuSrc, /if \(p\.what === "area"\)[\s\S]{0,700}fileTopic\(space\.name, channelName\(tab\), a\.id \? a\.name : null\)/, "the list files the topic, or unfiles it");
    Object.assign(fixtures, { spaces: keep.spaces, agents: keep.agents, panes: keep.panes });
    if (keep.areas === undefined) delete fixtures.shared["crew.areas"]; else fixtures.shared["crew.areas"] = keep.areas;
    roster.areaView = {}; roster.areaX = {};
  }
  console.log("palrows: ok (10 looks x Trees on/off drawn; the hero is a fixed size; working count; Rooms fold; working pals rock; room heads; soft edges; drag to reorder; topic areas)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
