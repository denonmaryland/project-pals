// A view's render has about 100 ms in Herdr; past that Herdr stops it ("This view could not be
// re-rendered ... interrupted") and the panel freezes on its last frame. Every panes() / spaces()
// call copies that whole list out of Herdr, so a render that asks again per topic (or per
// comparison in a sort) gets slower with every tab open anywhere: on 2026-11-09 the hero's topic
// list read panes() ~400 times for a pal with 38 topics (60+ ms) and the roster and the profile
// panel both froze. Here the roster draws a busy setup against stand-ins that count those reads:
// they must not grow with the number of topics.
// Run: node tests/test_render_reads.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "render-reads-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  // Elements take any call (test_palrows.mjs checks the method names); only the tree matters here.
  mod("gpui-kit", `
    export function el(kind) {
      const node = { kind, kids: [] };
      const p = new Proxy(node, { get(t, k) {
        if (k === "node") return t;
        if (typeof k !== "string" || k === "then") return undefined;
        return (...a) => {
          if (k === "child") { if (a[0] != null) t.kids.push(a[0]); }
          else if (k === "children") t.kids.push(...a[0].filter((x) => x != null));
          else if (k === "when") { if (a[0]) a[1](p); }
          else if (k === "id") t.id = a[0];
          return p;
        };
      } });
      return p;
    }
    export const div = () => el("div"), svg = () => el("svg"), image = () => el("image");
    export class View {}
  `);
  mod("gpui-base", `
    import { el } from "gpui-kit";
    export const v_flex = () => el("div"), h_flex = () => el("div");
    const stub = { new: () => ({ on() {}, value: () => "", set_value() {}, focus() {} }) };
    export const InputState = stub, VirtualListScrollHandle = stub, Input = { new: () => el("div") }, Scrollbar = { vertical: () => el("div") };
    export const v_virtual_list = () => el("div");
  `);
  mod("herdr", `
    export const fixtures = { spaces: [], panes: [], shared: {} };
    export const reads = { panes: 0, spaces: 0, agents: 0, terminals: 0 };
    export const spaces = () => { reads.spaces++; return fixtures.spaces; }, panes = () => { reads.panes++; return fixtures.panes; };
    export const agents = () => { reads.agents++; return []; }, terminals = () => { reads.terminals++; return []; };
    export const shared = (k) => fixtures.shared[k], setShared = (k, v) => { fixtures.shared[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED", ansi4: "#4C8DFF" });
    export const home = () => "/home/denon", appHome = () => "/home/denon/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => ({}), keys = () => ({});
    export const machines = () => [];
    const nop = () => {}, later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of readdirSync(join(root, "lib")).filter((x) => x.endsWith(".js"))) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods/crew-roster/main.js"), join(dir, "roster.js"));

  // Mods have a localStorage (the roster remembers "Hidden pals" open there).
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const { fixtures, reads } = await import(url("node_modules/herdr/index.js"));
  const { default: Roster } = await import(url("roster.js"));

  // A busy window: the shown pal with `n` topics (agents in most, a few bare shells, mixed states),
  // and eight more pals with a few topics each, the way DeNon's looked when it froze.
  const now = Date.now();
  const STATES = ["working", "blocked", "done", "idle"];
  const setup = (n) => {
    const tabsOf = (sp, count) => Array.from({ length: count }, (_, i) => ({ id: `${sp}-t${i}`, name: `#topic-${i}`, index: i, status: STATES[i % 4], changed_at: now - i * 60000, active: i === 0 }));
    const spaces = [{ id: "s0", name: "Project Pals - Herdr Mod", folder: "/home/denon/Projects/project-pals", active: true, index: 0, status: "working", tabs: tabsOf("s0", n) },
      ...Array.from({ length: 8 }, (_, k) => ({ id: `s${k + 1}`, name: `Pal ${k + 1}`, folder: `/home/denon/Projects/p${k + 1}`, index: k + 1, status: STATES[k % 4], tabs: tabsOf(`s${k + 1}`, 3) }))];
    fixtures.spaces = spaces;
    // Every fifth topic is a bare shell (no agent).
    fixtures.panes = spaces.flatMap((sp) => sp.tabs.map((tab, i) => ({ tab: tab.id, terminal: `term-${tab.id}`, program: i % 5 === 4 ? { agent: false, key: "fish", name: "fish" } : { agent: true, key: "claude", name: "Claude Code" } })));
    fixtures.shared = { crew: { bots: spaces.map((sp, k) => ({ id: `b${k}`, name: sp.name, space: sp.id, god: k === 1 })) },
      "crew.marks": { pals: {}, tabs: { "s0-t7": { pin: 1 } } }, "crew.settings": {} };
    return spaces;
  };
  const count = (f) => { for (const k of Object.keys(reads)) reads[k] = 0; f(); return { ...reads }; };
  const tree = (p, out = []) => { const n = p?.node; if (!n) return out; out.push(n); n.kids.forEach((k) => tree(k, out)); return out; };
  const roster = () => {
    const r = Object.create(Roster.prototype);
    r.ops = { tasks: [], approvals: [], proposals: [], routines: [], stalled: {}, daemon: true };
    r.chSearch = { value: () => "", set_value() {}, focus() {} };
    r.chSearchOpen = false;
    return r;
  };

  // 1. The order of a pal's topics: one panes() read, however many topics (it was two per comparison).
  {
    const [s0] = setup(40);
    const bot = crew.botOf(s0);
    const got = count(() => crew.channelOrder(s0, bot));
    assert.ok(got.panes <= 1, `channelOrder reads panes() once, not per topic (read ${got.panes} times for 40 topics)`);
    // And the order itself is what it was: pinned first, then asks you, finished, working, idle
    // agents, bare shells last, ties by tab order.
    const order = crew.channelOrder(s0, bot);
    assert.equal(order[0].id, "s0-t7", "the pinned topic leads");
    const rank = (x) => (!crew.tabHasAgent(x) ? 4 : { blocked: 0, done: 1, working: 2 }[x.status] ?? 3);
    const rest = order.slice(1);
    for (let i = 1; i < rest.length; i++) {
      const [a, b] = [rest[i - 1], rest[i]];
      assert.ok(rank(a) < rank(b) || (rank(a) === rank(b) && a.index < b.index), `${a.name} (${a.status}) before ${b.name} (${b.status})`);
    }
    assert.equal(order.length, 40);
    // A caller that already has the panes passes them: no read at all.
    const ps = fixtures.panes;
    assert.equal(count(() => crew.channelOrder(s0, bot, ps)).panes, 0, "channelOrder uses the panes it's given");
    assert.deepEqual([...crew.agentTabs(ps)].filter((id) => id.startsWith("s0-")).length, 32, "agentTabs: the 32 of 40 topics with an agent");
  }

  // 2. The whole roster (the hero's topic list, the pals and their trees): what it reads from Herdr
  // doesn't grow with the shown pal's topics. Every topic still gets its row.
  {
    const draw = (n) => {
      setup(n);
      const r = roster();
      let out;
      const got = count(() => { out = r.render(); });
      const rows = tree(out).filter((x) => typeof x.id === "string" && /^hero-ch-s0-t\d+$/.test(x.id)).length;
      return { got, rows };
    };
    const few = draw(4), many = draw(40);
    assert.equal(few.rows, 4, "the hero lists the shown pal's 4 topics");
    assert.equal(many.rows, 40, "the hero lists all 40 topics");
    for (const k of Object.keys(few.got)) {
      assert.ok(many.got[k] <= few.got[k], `a render's ${k}() reads don't grow with topics: ${few.got[k]} for 4 topics, ${many.got[k]} for 40`);
    }
  }
  console.log("ok: render reads");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
