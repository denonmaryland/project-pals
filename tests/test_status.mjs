// The sidebar runs the window's full height (T97, DeNon 2026-11-10): the status strip is the
// sidebar's own last 24 px, not a bar under the whole window; no line above it and none under the
// header; and in a 304 px sidebar it shows what fits, most important first, losing nothing (the
// whole line is in a tooltip). Headless: the layout file, the fit rule, and the strip drawn for
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
assert.deepEqual(lay.children.map((c) => c.id), ["body"], "nothing spans under the whole window");
const side = find(lay, "sidebar");
assert.equal(lay.children[0].children[0], side, "the sidebar is the body's first column");
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
  Object.assign(st, { w: 304, meta: { rate_limits: { five_hour: { used_percentage: 12 }, seven_day: { used_percentage: 52 } } }, version: "0.4.1",
    update: { current: "0.4.1", latest: "0.4.2", available: false } });
  fx.agents = [{ status: "working" }, { status: "working" }, { status: "idle" }];
  const draw = (w) => { st.w = w; return all(st.render()); };
  const d = crew.ds(crew.tone({ background: "#0E0E0F", foreground: "#EDEDED" }));
  const widthOf = (nodes) => {   // the fit's own arithmetic, from what was drawn
    const kids = nodes[0].kids.map((k) => k.node).filter((n) => !n.calls.includes("flex_1"));
    return kids.length;
  };

  let n = draw(304);
  const rootEl = n[0];
  assert.equal(rootEl.args.id[0], "crew-status");
  assert.ok(!rootEl.calls.includes("border_t_1"), "no line above the strip");
  assert.ok(rootEl.calls.includes("border_r_1") && rootEl.args.border_color[0] === d.line && rootEl.args.bg[0] === d.bg1, "the sidebar's colour and its edge line, down to the window's bottom");
  assert.ok(rootEl.calls.includes("on_size_change"), "it measures its own width");
  // 304 px, calm: the gear, working, both limits and the version all fit.
  assert.deepEqual(strings(n), ["2 working", "5h 12% · week 52%", "pal 0.4.1"]);
  assert.ok(n.some((x) => x.args.id?.[0] === "crew-gear"), "the gear");
  assert.ok(widthOf(n) >= 4);
  // Something needs you: it comes before usage, which shortens to the weekly limit or steps aside.
  fx.shared["crew.needs"] = { count: 2, approvals: 0 };
  n = draw(304);
  let s = strings(n);
  assert.ok(s.includes("2 working") && s.includes("2 need you") && s.includes("pal 0.4.1"), `needs you shows (${s})`);
  assert.ok(!s.includes("5h 12% · week 52%"), "both limits no longer fit beside it");
  assert.ok(n.find((x) => x.args.id?.[0] === "crew-needs").calls.includes("on_mouse_down"), "and still opens the Inbox");
  // An update: the pill comes before the version and usage.
  st.update = { current: "0.4.1", latest: "0.4.2", available: true };
  n = draw(304); s = strings(n);
  assert.ok(s.includes("Update") && s.includes("2 working") && s.includes("2 need you"), `beside needs-you the pill shortens to "Update" (${s})`);
  assert.ok(strings(draw(440)).includes("Update · 0.4.2"), "with room it names the version");
  n = draw(304);
  n.find((x) => x.args.id?.[0] === "crew-update").args.on_mouse_down[1]({}, { stop_propagation() {} });
  assert.equal(fx.overlays.at(-1).mod, "crew-update");
  // Nothing is lost: the whole line is the tooltip of "N working", whatever the width.
  for (const w of [200, 304, 440]) {
    const tip = draw(w).find((x) => x.args.id?.[0] === "crew-working").args.tooltip[0];
    for (const part of ["2 working", "2 need you", "5h 12% · week 52%", "Project Pals 0.4.2 is out", "pal 0.4.1"]) assert.ok(tip.includes(part), `${w} px: the tooltip keeps "${part}" (${tip})`);
  }
  // What's drawn never adds up to more than the strip (the estimate the fit uses).
  for (const w of [120, 160, 200, 240, 304, 360, 440]) {
    const nodes = draw(w), texts = strings(nodes);
    const parts = nodes[0].kids.map((k) => k.node).filter((x) => !x.calls.includes("flex_1") && x.args.w?.[0] !== 1);
    const est = (x) => x.args.id?.[0] === "crew-gear" ? 20 + STRIP.gap + 1 : x.args.id?.[0] === "crew-update" ? 30 + textW(strings(all({ node: x }))[0])
      : (x.kids.some((k) => typeof k === "string") ? 0 : 12) + textW(strings(all({ node: x }))[0]);
    const used = STRIP.pad + parts.reduce((a, x) => a + est(x), 0) + STRIP.gap * (parts.length - 1);
    assert.ok(used <= w, `${w} px: what shows fits (${used}: ${texts})`);
    assert.ok(nodes.some((x) => x.args.id?.[0] === "crew-gear"), `${w} px: the gear is always there`);
  }
  // Wider shows more, never less.
  const count = (w) => strings(draw(w)).length;
  assert.ok(count(440) >= count(304) && count(304) >= count(200) && count(200) >= count(120));
  assert.ok(strings(draw(440)).includes("pal 0.4.1"), "at 440 px the version is back beside the pill");
  // The weekly limit alone stands in when both don't fit (no update, something needs you, a wide sidebar).
  st.update = { current: "0.4.1", latest: "0.4.2", available: false };
  assert.ok(strings(draw(330)).includes("week 52%") && !strings(draw(330)).includes("5h 12% · week 52%"), `330 px: the weekly limit alone (${strings(draw(330))})`);
  assert.ok(strings(draw(440)).includes("5h 12% · week 52%"), "440 px: both limits");
  st.update = { current: "0.4.1", latest: "0.4.2", available: true };
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
  console.log("status: ok (the strip is the sidebar's last 24 px; it fits 120-440 px and loses nothing)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
