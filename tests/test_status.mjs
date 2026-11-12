// The sidebar runs the window's full height (T97, DeNon 2026-11-10): the status strip is the
// sidebar's own last 24 px, not a bar under the whole window; no line above it and none under the
// header; and it holds just the gear (T98), plus "N need you" and the update pill when they apply,
// fitted to the sidebar's width. Headless: the layout file, the fit rule, and the strip drawn for
// real at several widths against stand-ins (every method must be one gpui-kit declares).
// Run: node tests/test_status.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;

// ── The layout: body is the whole window; the sidebar is a column of the roster and the strip ──
const lay = JSON.parse(readFileSync(join(root, "layouts/pals.json"), "utf8"));
const find = (n, id) => n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean) ?? null;
// (Above body there is only the trial strip, hidden unless a branch is being tried: T90, DeNon's pick on h-0a897a.)
assert.deepEqual(lay.children.filter((c) => !c.hidden).map((c) => c.id), ["body"], "nothing spans under the whole window");
assert.deepEqual(lay.children.map((c) => [c.id, Boolean(c.hidden)]), [["crew-live", true], ["body", false]], "body is last: nothing is under it");
const side = find(lay, "sidebar");
assert.equal(find(lay, "body").children[0], side, "the sidebar is the body's first column");
assert.ok(side.type === "column" && side.size.px === 304 && side.min === 56 && side.max === 440, "the sidebar keeps its id, width and limits (resize, fold and the saved width go by them)");
assert.deepEqual(side.children.map((c) => [c.id, c.content.mod]), [["side-main", "crew-roster"], ["status", "crew-status"]]);
assert.equal(side.divider.width, 0, "no divider between the pals and the strip");
const strip = find(lay, "status");
assert.ok(strip.size.px === 24 && strip.min === 24 && strip.max === 24, "the strip is 24 px (the gear menu's window height counts on it)");
assert.ok(!find(lay, "work").children.some((c) => c.id === "status"), "and it isn't under the content");
// The header has no line under it.
const header = readFileSync(join(root, "mods/crew-header/main.js"), "utf8");
assert.ok(!/id\("crew-header"\)[^\n]*border_b_1/.test(header), "no hairline under the header");

const dts = readFileSync(join(root, "mods/crew-command/gpui-kit.d.ts"), "utf8");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "status-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    const OK = new Set(${JSON.stringify(METHODS)});
    export function el(kind, arg) {
      const node = { kind, arg, calls: [], args: {}, kids: [] };
      const p = new Proxy(node, { get(t, k) {
        if (k === "node") return t;
        if (typeof k !== "string" || k === "then") return undefined;
        if (!OK.has(k)) throw new Error("not a gpui-kit method: ." + k + "()");
        return (...a) => {
          t.calls.push(k); t.args[k] = a;
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
  mod("herdr", `
    export const fx = { shared: { "crew.settings": {} }, agents: [], overlays: [] };
    export const spaces = () => [], panes = () => [], agents = () => fx.agents, machines = () => [], terminals = () => [];
    export const shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED" });
    export const home = () => "/home/x", appHome = () => "/home/x/.config/herdr-app";
    export const settings = () => ({ zoom: fx.zoom ?? 1 }), layout = () => null, props = () => ({}), keys = () => [];
    const later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = () => {}, notify = () => {}, openOverlay = (o) => { fx.overlays.push(o); return "ov"; }, closeOverlay = () => {}, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of readdirSync(join(root, "lib")).filter((x) => x.endsWith(".js"))) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods/crew-status/main.js"), join(dir, "status.js"));
  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const { fx } = await import(url("node_modules/herdr/index.js"));
  const { default: Status, statusFit, textW, STRIP } = await import(url("status.js"));

  // ── What fits: in priority order, skipping what doesn't, an alternative only when its fuller form is out ──
  const P = [{ key: "a", w: 50 }, { key: "b", w: 100 }, { key: "big", w: 400 }, { key: "c", w: 40 }, { key: "full", w: 90 }, { key: "short", w: 30, alt: "full" }];
  assert.deepEqual([...statusFit(P, 1000)], ["a", "b", "big", "c", "full"], "room for all: the short form isn't added to the full one");
  assert.deepEqual([...statusFit(P, 16 + 50 + 10 + 100 + 10 + 40 + 10 + 30)], ["a", "b", "c", "short"], "the short form stands in");
  assert.deepEqual([...statusFit(P, 16 + 50)], ["a"]);
  assert.deepEqual([...statusFit(P, 60)], ["c"], "a part too wide is skipped; a smaller, later one still goes in");
  assert.deepEqual([...statusFit(P, 40)], [], "nothing fits: nothing");

  // ── The strip, drawn ────────────────────────────────────────────────────────────────────────
  const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
  const strings = (nodes) => nodes.flatMap((n) => n.kids.filter((k) => typeof k === "string"));
  const st = Object.create(Status.prototype);
  Object.assign(st, { w: 304, update: { current: "0.4.1", latest: "0.4.2", available: false } });
  fx.agents = [{ status: "working" }, { status: "working" }, { status: "idle" }];
  const draw = (w) => { st.w = w; return all(st.render()); };
  const d = crew.ds(crew.tone({ background: "#0E0E0F", foreground: "#EDEDED" }));
  const ids = (nodes) => nodes.map((x) => x.args.id?.[0]).filter(Boolean);

  let n = draw(304);
  const rootEl = n[0];
  assert.equal(rootEl.args.id[0], "crew-status");
  assert.ok(!rootEl.calls.includes("border_t_1"), "no line above the strip");
  assert.ok(rootEl.calls.includes("border_r_1") && rootEl.args.border_color[0] === d.line && rootEl.args.bg[0] === d.bg1, "the sidebar's colour and its edge line, down to the window's bottom");
  assert.ok(rootEl.calls.includes("on_size_change"), "it measures its own width");
  // Calm: just the gear (T98, DeNon 2026-11-10: "N working", the usage limits and "pal 0.x.y" went).
  assert.deepEqual(ids(n), ["crew-status", "crew-gear"], "calm: the gear alone");
  assert.deepEqual(strings(n), [], "no text: no working count, usage or version");
  const src = readFileSync(join(root, "mods/crew-status/main.js"), "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  for (const gone of ["working`", "rate_limits", "seven_day", "`pal ${", "agents()"]) assert.ok(!src.includes(gone), `the strip no longer draws or reads ${gone}`);
  // The gear opens the app menu, at the size that fits the window.
  n.find((x) => x.args.id?.[0] === "crew-gear").args.on_mouse_down[1]({}, { stop_propagation() {} });
  assert.equal(fx.overlays.at(-1).mod, "crew-appmenu");
  // The version is still one click away: the menu's Project Pals settings row opens About.
  assert.ok(crew.appMenuItems().some((x) => x.id === "settings" && x.label === "Project Pals settings"));
  assert.match(readFileSync(join(root, "mods/crew-about/main.js"), "utf8"), /ins\.version/, "About shows the installed version");
  // Something needs you: it shows beside the gear (a separator between) and opens the Inbox.
  fx.shared["crew.needs"] = { count: 2, approvals: 0 };
  n = draw(304);
  assert.deepEqual(strings(n), ["2 need you"]);
  assert.ok(n.find((x) => x.args.id?.[0] === "crew-needs").calls.includes("on_mouse_down"), "and still opens the Inbox");
  assert.equal(n[0].kids.filter((k) => k.node.args.w?.[0] === 1 && k.node.args.h?.[0] === 12).length, 1, "one separator, between the gear and it");
  // An update: the pill on the right, naming the version; a click opens the update dialog.
  st.update = { current: "0.4.1", latest: "0.4.2", available: true };
  n = draw(304);
  assert.deepEqual(strings(n), ["2 need you", "Update · 0.4.2"]);
  n.find((x) => x.args.id?.[0] === "crew-update").args.on_mouse_down[1]({}, { stop_propagation() {} });
  assert.equal(fx.overlays.at(-1).mod, "crew-update");
  // Narrower: the pill shortens to "Update", then steps aside and the gear's tooltip says it.
  assert.deepEqual(strings(draw(210)), ["2 need you", "Update"]);
  n = draw(160);
  assert.deepEqual(strings(n), ["2 need you"]);
  assert.ok(n.find((x) => x.args.id?.[0] === "crew-gear").args.tooltip[0].includes("Project Pals 0.4.2 is out"), "nothing lost: the gear says an update is out");
  assert.ok(!draw(304).find((x) => x.args.id?.[0] === "crew-gear").args.tooltip[0].includes("is out"), "while the pill shows, the gear's tooltip is just the menu");
  // What's drawn never adds up to more than the strip (the estimate the fit uses), and the gear is always there.
  for (const w of [120, 160, 200, 240, 304, 360, 440]) {
    const nodes = draw(w);
    const used = STRIP.pad + 20 + (ids(nodes).includes("crew-needs") ? STRIP.gap * 2 + 1 + 12 + textW("2 need you") : 0)
      + (ids(nodes).includes("crew-update") ? STRIP.gap + 30 + textW(strings(nodes).at(-1)) : 0);
    assert.ok(used <= w, `${w} px: what shows fits (${used}: ${strings(nodes)})`);
    assert.ok(ids(nodes).includes("crew-gear"), `${w} px: the gear is always there`);
  }
  // Folded to the rail: an empty strip (the rail has its own gear), still the sidebar's colour and edge.
  n = draw(56);
  assert.equal(n.length, 1, "folded: nothing in it");
  assert.ok(n[0].args.bg[0] === d.bg1 && n[0].calls.includes("border_r_1"));
  // The width comes from the strip's own size, in design px.
  fx.zoom = 1.5; let notes = 0;
  draw(304)[0].args.on_size_change[0]({ width: 456, height: 36 }, { notify() { notes++; } });
  assert.equal(st.w, 304); assert.equal(notes, 0, "the same width: no redraw");
  draw(304)[0].args.on_size_change[0]({ width: 300, height: 36 }, { notify() { notes++; } });
  assert.equal(st.w, 200); assert.equal(notes, 1);
  console.log("status: ok (the strip is the sidebar's last 24 px: the gear, and needs-you / update when they apply)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
