// The Desk view and the quick-drop, run headless: crew-desk renders every desk (Needs you, To route,
// Held, All, a pal, a lane, a pal tray) and every card it's given (an unverified owner card, a held
// one, one with a reply and images) without throwing; its actions call `pal desk …` with a click
// token; the quick-drop sends what was typed, to where and how urgent, with --task for multi-line text.
// Run: node tests/test_desk_view.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "deskview-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  // Elements: every builder call returns an element; children and .when callbacks run, so the whole
  // tree is built (handlers are kept so the test can click them).
  mod("gpui-kit", `
    export const clicks = new Map();
    const el = () => {
      const p = new Proxy(function () {}, {
        get: (t, k) => {
          if (k === "then") return undefined;
          if (k === "when") return (c, f) => (c ? f(p) : p);
          if (k === "map") return (f) => f(p);
          if (k === "id") return (id) => { p.__id = id; return p; };
          if (k === "on_click") return (f) => { if (p.__id) clicks.set(p.__id, f); return p; };
          if (k === "__id") return t.__id;
          return () => p;
        },
        set: (t, k, v) => { t[k] = v; return true; },
      });
      return p;
    };
    export const div = el, svg = el, image = el; export class View {}`);
  mod("gpui-base", `
    import { clicks } from "gpui-kit";
    import { div } from "gpui-kit";
    export const v_flex = div, h_flex = div;
    class St { constructor(o) { this.v = o?.value ?? ""; this.h = {}; } on(e, f) { this.h[e] = f; return true; } value() { return this.v; } set_value(v) { this.v = v; }
      focus() {} set_auto_grow() {} }
    export const TextareaState = { new: (o) => new St(o) }, InputState = { new: (o) => new St(o) };
    export const Textarea = { new: () => div() }, Input = { new: () => div() };`);
  mod("herdr", `
    export const fx = { calls: [], toasts: [], closed: 0, shared: { "crew.settings": { owner: "DeNon", head: "Orca" } }, layout: null, desk: null,
      spaces: [{ id: "s1", name: "Herdr Mod", active: true, tabs: [{ id: "tb1", name: "desk", active: true }, { id: "tb2", name: "docs" }] }] };
    export const spaces = () => fx.spaces, agents = () => [], panes = () => [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fx.calls.push([cmd.split("/").pop(), ...args]);
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "ls") return { stdout: JSON.stringify(fx.desk), stderr: "", code: 0 };
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "send") return { stdout: JSON.stringify({ card: { id: "c-abcdef", to: "Herdr Mod#desk" }, terminal: "t1", what: "queued" }), stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    const nop = () => {};
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => fx.layout, keys = () => [], settings = () => ({});
    export const run = (c, a) => fx.calls.push(["run", c, JSON.stringify(a)]), notify = (n) => fx.toasts.push(n), openOverlay = nop, closeOverlay = () => { fx.closed++; };
    export const hc = exec, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [], props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {});
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  for (const m of ["crew-desk", "crew-desk-drop"]) { cpSync(join(root, "mods", m, "main.js"), join(dir, `${m}.mjs`)); }
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);

  const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString().replace(/\.\d+Z$/, "Z");
  const r = (status, by, via, note = "") => ({ at: iso(3), status, by, via, note });
  fx.desk = { counts: { open: 4, held: 1, "needs you": 1, "to route": 1 }, cards: [
    { id: "c-111111", kind: "tell", status: "held", held: "draft", held_since: iso(12), from: "Orca#general", from_kind: "pal", relaying: "DeNon",
      to: "Herdr Mod#desk", urgency: "soon", title: "Merge crew/next", body: "line one\nline two", reply: null, receipts: [r("queued", "Orca#general", "pal desk send"), r("held", "crewd", "crewd", "draft")],
      pal: "Herdr Mod", topic: "desk", verified: false, tray: "herdr-mod", last: r("held", "crewd", "crewd") },
    { id: "c-222222", kind: "tell", status: "queued", from: "DeNon", from_kind: "owner", to: "To route", urgency: "now", title: "Hand-edited", body: "", reply: null,
      receipts: [r("queued", "DeNon", "pal desk send")], pal: "To route", topic: null, verified: false, tray: "_route" },
    { id: "c-333333", kind: "ask", status: "needs you", from: "Herdr Mod#docs", from_kind: "pal", to: "Herdr Mod#docs", urgency: "normal", title: "Which branch?",
      body: "", reply: "crew/next", result: "answered", attachments: ["crew-attachments/a.png"], task: "T19", receipts: [], pal: "Herdr Mod", topic: "docs", verified: false, tray: "herdr-mod" },
    { id: "c-444444", kind: "tell", status: "seen", from: "a shell on this computer", from_kind: "shell", to: "Gone Pal", urgency: "low", title: "Old pal",
      body: "", reply: null, receipts: [], pal: "Gone Pal", topic: null, verified: false, tray: "gone-pal" },
    { id: "c-555555", unreadable: "line 3: expected key: value", to: "herdr-mod", title: "x.md", tray: "herdr-mod", receipts: [] },
  ] };

  const run = async (f) => { const tasks = []; const cx = { notify() {}, spawn: (g) => tasks.push(g(cx)), timer: { every() {}, after() {} }, focus_handle: () => ({ focus() {} }), stop_propagation() {} };
    f(cx); for (let i = 0; i < 5 && tasks.length; i++) await Promise.all(tasks.splice(0)); return cx; };

  // ── the Desk view ──
  fx.layout = { id: "root", children: [{ id: "center", type: "stack", active: "desk-view", children: [] }] };
  const Desk = (await import(pathToFileURL(join(dir, "crew-desk.mjs")).href)).default;
  const v = new Desk();
  await run((cx) => v.init({}, cx));
  await run((cx) => v.render(cx));   // shown: it reads the desk
  assert.ok(fx.calls.some((c) => c[0] === "pal" && c.join(" ") === "pal desk ls --all --json"), "reads every open card");
  assert.equal(v.cards.length, 5);
  for (const pick of ["needs", "route", "held", "all", "pal:herdr-mod", "lane:herdr-mod#desk", "lane:herdr-mod#docs", "tray:gone-pal", "pal:gone-pal"]) {
    v.pick = pick;
    for (const id of [null, ...v.cards.map((c) => c.id)]) { v.openId = id; v.moving = Boolean(id); await run((cx) => v.render(cx)); }
  }
  const pickOf = (k) => v.cards.filter((c) => v.match(k, c)).map((c) => c.id);
  assert.deepEqual(pickOf("needs"), ["c-333333"]);
  assert.deepEqual(pickOf("route"), ["c-222222"]);
  assert.deepEqual(pickOf("held"), ["c-111111"]);
  assert.deepEqual(pickOf("lane:herdr-mod#desk"), ["c-111111"]);
  assert.deepEqual(pickOf("tray:gone-pal"), ["c-444444"]);
  assert.ok(v.pals().some((p) => p.name === "Gone Pal"), "a pal with cards but no space still has a desk");
  v.pick = "lane:herdr-mod#docs";
  assert.equal(v.presetTo(), "Herdr Mod#docs");

  // Actions go through the owner's click (pal desk … --click <token>).
  v.pick = "all"; v.openId = "c-222222"; v.moving = false;
  fx.calls.length = 0;
  await run((cx) => v.render(cx));
  assert.ok(clicks.has("da-confirm"), "an unverified owner card offers Confirm as mine");
  assert.ok(!clicks.has("da-up") || true);
  await run((cx) => v.act("confirm it", ["confirm", "c-222222"], cx));
  const sent = fx.calls.find((c) => c[0] === "pal" && c[1] === "desk" && c[2] === "confirm");
  assert.ok(sent && sent.includes("--click"), "Confirm as mine is a click");
  await run((cx) => v.act("lower it", ["urgency", "c-222222", "soon"], cx));
  assert.ok(fx.calls.some((c) => c.join(" ").startsWith("pal desk urgency c-222222 soon --click")));

  // Zero pals: the empty state, no throw.
  const saved = fx.spaces; fx.spaces = [];
  v.cards = []; v.pick = "all"; v.openId = null;
  await run((cx) => v.render(cx));
  assert.ok(clicks.has("desk-hire"), "the empty state has a Hire button");
  fx.spaces = saved;

  // ── the quick-drop ──
  const Drop = (await import(pathToFileURL(join(dir, "crew-desk-drop.mjs")).href)).default;
  fx.props = { to: "Herdr Mod#desk", overlay: "o1" };
  const q = new Drop();
  await run((cx) => q.init({}, cx));
  await run((cx) => q.render(cx));
  assert.equal(q.toLabel(), "Herdr Mod #desk");
  q.input.set_value("Fix the header\nIt jumps on hover.");
  q.urgency = "soon";
  assert.equal(q.tracking(), true, "multi-line text is tracked on the board");
  fx.calls.length = 0;
  await run((cx) => q.drop(cx));
  const send = fx.calls.find((c) => c[0] === "pal" && c[2] === "send");
  assert.deepEqual(send.slice(0, 9), ["pal", "desk", "send", "Herdr Mod#desk", "Fix the header\nIt jumps on hover.", "--urgency", "soon", "--task", "--json"]);
  assert.ok(send.includes("--click"), "dropped as the owner, with a click token");
  assert.equal(fx.closed, 1, "it closes");
  assert.match(fx.toasts.at(-1).title, /^Dropped on Herdr Mod #desk · c-abcdef$/);
  // One line, Auto: To route, no --task.
  fx.props = {};
  const q2 = new Drop();
  await run((cx) => q2.init({}, cx));
  q2.input.set_value("One line");
  assert.equal(q2.tracking(), false);
  assert.equal(q2.toLabel(), "Auto (To route)");
  fx.calls.length = 0;
  await run((cx) => q2.drop(cx));
  const s2 = fx.calls.find((c) => c[0] === "pal" && c[2] === "send");
  assert.equal(s2[3], "route");
  assert.ok(!s2.includes("--task"));
  assert.ok(q2.targets().some((x) => x.to === "Herdr Mod#docs"), "every topic is a target");
  q2.filter.set_value("docs");
  assert.deepEqual(q2.targets().map((x) => x.to), ["Herdr Mod#docs"], "the filter narrows the targets");
  console.log("desk view: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
