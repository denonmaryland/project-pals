// The gear menu (crew-appmenu) never runs past the window and scrolls when its rows don't fit (T95,
// DeNon 2026-11-10: it had grown past its fixed 438 px box, Settings was cut off and nothing
// scrolled). Headless: the size the openers ask for at several window heights, the menu drawn for
// real against stand-ins (every method must be one gpui-kit declares), every row inside the scroll
// area, and the keyboard and wheel keeping rows reachable in a short window.
// Run: node tests/test_appmenu.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dts = readFileSync(join(root, "mods/crew-command/gpui-kit.d.ts"), "utf8");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });

const dir = mkdtempSync(join(tmpdir(), "appmenu-"));
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
    export const fx = { shared: { "crew.settings": {} }, closed: [], ran: [], sets: 0 };
    export const spaces = () => [], panes = () => [], agents = () => [], machines = () => [], terminals = () => [];
    export const shared = (k) => fx.shared[k], setShared = (k, v) => { fx.sets++; fx.shared[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED" });
    export const home = () => "/home/x", appHome = () => "/home/x/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => ({ overlay: "ov1" }), keys = () => [];
    const later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = (op, a) => { fx.ran.push([op, a]); }, notify = () => {}, openOverlay = () => "ov2", closeOverlay = (id) => { fx.closed.push(id); }, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of readdirSync(join(root, "lib")).filter((x) => x.endsWith(".js"))) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods/crew-appmenu/main.js"), join(dir, "appmenu.js"));
  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const { fx } = await import(url("node_modules/herdr/index.js"));
  const { default: AppMenu } = await import(url("appmenu.js"));

  // ── What the menu needs, and what the openers ask for ───────────────────────────────────────
  const items = crew.appMenuItems();
  const rows = items.filter((x) => !x.sep), seps = items.length - rows.length;
  const needs = crew.appMenuNeeds(items);
  assert.equal(needs, rows.length * 28 + seps * 7 + (items.length - 1) + 10, "rows, dividers, gaps, padding and border");
  assert.ok(needs > 438, `the list is taller than the old fixed box (${needs})`);
  assert.equal(rows.at(-1).id, "welcome");
  assert.ok(rows.some((x) => x.id === "settings"), "Project Pals settings is a row");
  // No window height known yet: the old box (it scrolls). Known: everything, or what the window holds.
  delete fx.shared["crew.window"];
  assert.deepEqual(crew.appMenuSpec(), { width: 252, height: 438 });
  for (const [win, want] of [[1100, needs], [needs + 16, needs], [needs + 15, needs - 1], [700, Math.min(needs, 684)], [500, Math.min(needs, 484)], [360, Math.min(needs, 344)], [90, 120]]) {
    fx.shared["crew.window"] = { h: win };
    const spec = crew.appMenuSpec();
    assert.equal(spec.height, want, `a ${win} px window: the menu is ${want} px`);
    if (win >= 136) assert.ok(spec.height <= win - 16, `a ${win} px window: the menu stays inside it`);
  }
  // The roster reports its own height; the status bar's 24 px make the window's. Unchanged: no write.
  delete fx.shared["crew.window"]; fx.sets = 0;
  crew.noteWindowHeight(476);
  assert.deepEqual(fx.shared["crew.window"], { h: 500 });
  crew.noteWindowHeight(476.4); crew.noteWindowHeight(476);
  assert.equal(fx.sets, 1, "the same height isn't written again");
  crew.noteWindowHeight(876);
  assert.equal(crew.appMenuSpec().height, Math.min(needs, 900 - 16));
  // Both openers use it, and the roster measures.
  const roster = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8"), status = readFileSync(join(root, "mods/crew-status/main.js"), "utf8");
  for (const [name, src] of [["roster", roster], ["status", status]]) {
    assert.match(src, /mod: "crew-appmenu", kind: "popup", \.\.\.appMenuSpec\(\)/, `${name} opens the menu at the size that fits`);
    assert.ok(!/\.\.\.APP_MENU\b/.test(src), `${name}: no fixed size`);
  }
  assert.match(roster, /noteWindowHeight\(size\.height \/ k\)/, "the roster reports its height");

  // ── The menu itself ─────────────────────────────────────────────────────────────────────────
  const SID = "crew-appmenu-list";
  const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
  const menu = Object.create(AppMenu.prototype);
  const cx = { notes: 0, stops: 0, notify() { this.notes++; }, stop_propagation() { this.stops++; }, focus_handle: () => ({ focus() {} }) };
  crew.scrollState(SID).y = 77;
  menu.init({}, cx);
  assert.equal(crew.scrollState(SID).y, 0, "every opening starts at the top");
  const draw = () => all(menu.render());
  let nodes = draw();
  const frame = nodes[0];
  assert.ok(frame.calls.includes("size_full") && frame.args.id[0] === "crew-appmenu", "the frame fills the popup");
  const area = nodes.find((n) => n.args.id?.[0] === SID);
  assert.ok(area && area.calls.includes("overflow_hidden") && area.calls.includes("on_scroll_wheel") && area.calls.includes("flex_1") && area.args.min_h?.[0] === 0, "the rows are in a scroll area that takes the room there is");
  const inArea = all({ node: area });
  const drawn = inArea.filter((n) => /^am-\d+$/.test(n.args.id?.[0] ?? ""));
  assert.equal(drawn.length, rows.length, "every row is inside the scroll area");
  assert.ok(drawn.every((n) => n.args.h[0] === 28 && n.calls.includes("flex_none")), "28 px rows that don't squash");
  const strings = (n) => all({ node: n }).flatMap((x) => x.kids.filter((k) => typeof k === "string"));
  assert.deepEqual(drawn.map((n) => strings(n)[0]), rows.map((x) => x.label), "in order, Settings and the rest included");
  // Where rows start matches what's drawn: 28 px rows, 7 px dividers, 1 px gaps.
  const { tops, height } = crew.appMenuTops(items);
  assert.equal(tops.length, rows.length);
  assert.equal(height + 10, needs);
  assert.equal(tops[0], 0); assert.equal(tops[1], 29); assert.equal(tops[3], 3 * 28 + 7 + 4, "after the first divider: three rows, the divider, four gaps");

  // A short window: 300 px of rows showing. Everything fits → no gutter; it doesn't → 9 px for the pill.
  const sc = crew.scrollState(SID);
  const list = () => { const a = all(menu.render()).find((n) => n.args.id?.[0] === `${SID}-content`); return a.kids[0].node; };
  sc.view = height; sc.content = height;
  assert.ok(!list().args.pr, "everything fits: no gutter");
  sc.view = 300; sc.content = height; sc.y = 0;
  assert.equal(list().args.pr?.[0], 9, "scrolling: the rows leave room for the pill");
  assert.ok(all(menu.render()).some((n) => n.args.id?.[0] === `${SID}-thumb`), "and the pill shows");
  // The keyboard: the highlighted row is always wholly in view; End reaches the last row (and the
  // list's very end), Down from it wraps to the top, Home, PageDown / PageUp.
  const press = (key) => menu.key({ key }, cx);
  const visible = () => tops[menu.at] >= sc.y - 0.5 && tops[menu.at] + 28 <= sc.y + sc.view + 0.5;
  for (let i = 0; i < rows.length; i++) { press("down"); assert.equal(menu.at, i); assert.ok(visible(), `Down to row ${i} (${rows[i].label}) keeps it in view (y ${sc.y})`); }
  assert.equal(sc.y, height - 300, "the last row: scrolled to the very end");
  press("down"); assert.equal(menu.at, 0); assert.equal(sc.y, 0, "Down from the last row wraps to the top");
  press("up"); assert.equal(menu.at, rows.length - 1); assert.ok(visible(), "Up from the first wraps to the last, in view");
  for (let i = rows.length - 2; i >= 0; i--) { press("up"); assert.equal(menu.at, i); assert.ok(visible(), `Up to row ${i} keeps it in view`); }
  assert.equal(sc.y, 0);
  press("end"); assert.equal(menu.at, rows.length - 1); assert.equal(sc.y, height - 300);
  press("home"); assert.equal(menu.at, 0); assert.equal(sc.y, 0);
  press("pagedown"); assert.ok(menu.at > 1 && menu.at < rows.length - 1 && visible(), "PageDown moves about a screen");
  const mid = menu.at; press("pagedown"); press("pagedown"); press("pagedown"); assert.equal(menu.at, rows.length - 1, "and stops at the last row");
  press("pageup"); assert.ok(menu.at < rows.length - 1 && visible()); press("pageup"); press("pageup"); press("pageup"); assert.equal(menu.at, 0);
  assert.ok(mid > 0);
  // Enter runs the highlighted row (here the last one, reached by keyboard) and closes the menu.
  press("end");
  let ran = 0; const real = menu.items; menu.items = () => real.call(menu).map((x) => x.id === "welcome" ? { ...x, go: () => { ran++; } } : x);
  press("enter");
  assert.equal(ran, 1, "Enter on the last row runs it");
  assert.deepEqual(fx.closed, ["ov1"]);
  menu.items = real;
  press("escape"); assert.equal(fx.closed.length, 2, "Esc closes");
  // Hover takes the highlight, but not in the moment after a key moved it (a keyboard scroll slides
  // another row under a still pointer).
  press("home");
  const row5 = () => all(menu.render()).find((n) => n.args.id?.[0] === "am-5");
  row5().args.on_hover[0](true, cx);
  assert.equal(menu.at, 0, "just after a key: hover doesn't steal the highlight");
  menu.keyedAt = Date.now() - 1000;
  row5().args.on_hover[0](true, cx);
  assert.equal(menu.at, 5, "otherwise the pointer takes it");
  // The wheel scrolls, clamped to the ends.
  sc.y = 0;
  const wheel = (dy) => all(menu.render()).find((n) => n.args.id?.[0] === SID).args.on_scroll_wheel[0]({ delta: { y: dy } }, cx);
  wheel(-120); assert.equal(sc.y, 120);
  wheel(-5000); assert.equal(sc.y, height - 300, "down to the end, no further");
  wheel(5000); assert.equal(sc.y, 0);
  console.log(`appmenu: ok (${rows.length} rows need ${needs} px; fits or scrolls at every window height)`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
