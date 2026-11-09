// Draws every pal list look for real, outside Herdr: crew.js, the roster's pal rows and the style
// dialog run against stand-ins for gpui-kit, gpui-base and herdr. Each element method a row calls
// must be one gpui-kit declares (mods/crew-command/gpui-kit.d.ts), so a mistyped style or a look
// that throws fails here; `herdr-app check` only builds the empty roster, never these rows.
// Run: node tests/test_palrows.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
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
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => ({}), keys = () => ({});
    export const machines = () => [], terminals = () => [];
    const nop = () => {}, later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods/crew-roster/main.js"), join(dir, "roster.js"));
  copyFileSync(join(root, "mods/crew-palstyle/main.js"), join(dir, "palstyle.js"));

  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const { fixtures } = await import(url("node_modules/herdr/index.js"));
  const { default: Roster } = await import(url("roster.js"));
  const { default: PalStyle } = await import(url("palstyle.js"));

  const text = (p) => { const n = p.node ?? p; return [...n.kids.map((k) => typeof k === "string" ? k : k?.node ? text(k) : "")].join(" "); };
  const ids = (p, out = []) => { const n = p.node; n.calls.includes("id") && out.push(n); n.kids.forEach((k) => k?.node && ids(k, out)); return out; };

  const d = crew.ds({ background: "#0E0E0F" });
  const tasks = [{ assignee: "Project Pals - Herdr Mod", status: "claimed" }, { assignee: "Project Pals - Herdr Mod", status: "done", updated: Date.now() - 1000 },
    { claimed_by: "Project Pals - Herdr Mod#indicators", status: "open" }];
  const roster = Object.create(Roster.prototype);
  roster.ops = { tasks, approvals: [], proposals: [], stalled: {} };
  const t = crew.tone({ background: "#0E0E0F", foreground: "#EDEDED" });

  for (const st of crew.PAL_LIST_STYLES) {
    fixtures.shared["crew.settings"] = { palList: st.id };
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
      wrap: ["Needs you"], rich: [" · crew/command-bar", "1 blocked", "2 tasks"], table: ["4", "2"], tree: ["project-pals", "#command-bar", "#indicators", "#profiles"],
      progress: ["1/3 tasks"], project: ["project-pals", "crew/command-bar"], grouped: ["#command-bar"], card: ["~/Projects/project-pals", "Needs you"],
    }[st.id];
    for (const w of want) assert.ok(words.includes(w), `${st.id}: "${w}" in ${JSON.stringify(words)}`);
    // Clicks, right-click and drag stay on the row's own element.
    const top = rows[0].node.kids.length && rows[0].node.calls.includes("id") ? rows[0].node : rows[0].node.kids[0].node;
    for (const h of ["on_click", "on_mouse_move"]) assert.ok(top.calls.includes(h), `${st.id} row keeps ${h}`);
    assert.ok(top.calls.filter((c) => c === "on_mouse_down").length >= 2, `${st.id} row keeps press (drag) and right-click`);
    // The Tree's channels open their own channel; other looks have none.
    const sub = ids(rows[0]).filter((n) => n.calls.includes("on_click") && n !== top);
    assert.equal(sub.length, st.id === "tree" ? 3 : 0, `${st.id} channel rows`);
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
  assert.ok(text(pebbleOf(calm, "hero-inbox")).includes("Inbox") && !/\b(Channel|Topic)\b/.test(text(pebbleOf(calm, "hero-inbox"))), "it says Inbox");
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
  // A "Channels" category saved before 0.3.1 shows as Topics; new ones are Topics.
  assert.equal(crew.categoryName("Channels"), "Topics");
  assert.equal(crew.categoryName("Routines"), "Routines");
  assert.equal(crew.categoryOf({ categories: { t1: "Channels" } }, { id: "t1", name: "#a" }), "Topics");
  assert.equal(crew.categoryOf({ categories: {} }, { id: "t2", name: "#b" }), "Topics");
  console.log("palrows: ok (11 looks drawn; the hero is a fixed size)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
