// The Chief's pop-up (crew-boards/chief/design.md, T63), headless: the window spec (terminal beside
// the dashboard; Compact stacked; no live Chief: the dashboard alone), Ctrl+Shift+J opening and
// closing it by its id, the Chief left out of the pal lists, the dashboard rendering (live, asleep, not
// hired) without throwing, the Ask field sending into the Chief's terminal with hc send (never
// pane.focus), and its notes parsing. Run: node tests/test_chief.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "chief-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    export const clicks = new Map();
    const el = () => {
      const p = new Proxy(function () {}, {
        get: (t, k) => {
          if (k === "then") return undefined;
          if (k === "when") return (c, f) => (c ? f(p) : p);
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
    import { div } from "gpui-kit";
    export const v_flex = div, h_flex = div;
    class St { constructor(o) { this.v = o?.value ?? ""; this.h = {}; this.focused = 0; } on(e, f) { this.h[e] = f; return true; } value() { return this.v; } set_value(v) { this.v = v; }
      focus() { this.focused++; } set_auto_grow() {} }
    export const TextareaState = { new: (o) => new St(o) }, InputState = { new: (o) => new St(o) };
    export const Textarea = { new: () => div() }, Input = { new: () => div() };`);
  mod("herdr", `
    export const fx = { calls: [], toasts: [], closed: [], overlays: [], shared: { "crew.settings": { owner: "DeNon", head: "Orca" } }, spaces: [], files: {} };
    export const spaces = () => fx.spaces, agents = () => fx.agents ?? [], panes = () => fx.panes ?? [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fx.calls.push([String(cmd).split("/").pop(), ...(args ?? [])]);
      if (String(cmd).endsWith("/pal") && args[0] === "desk") return { stdout: JSON.stringify(fx.desk ?? { cards: [] }), stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    export const hc = async (args) => { fx.calls.push(["hc", ...args]); return { stdout: "", stderr: "", code: 0 }; };
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => null, keys = () => [], settings = () => ({});
    export const run = (c, a) => fx.calls.push(["run", c, JSON.stringify(a)]), notify = (n) => fx.toasts.push(n), nextCommand = () => new Promise(() => {});
    export const openOverlay = (o) => { fx.overlays.push(o); return "ov" + fx.overlays.length; }, closeOverlay = (id) => { fx.closed.push(id); };
    export const readTextFile = async (p) => fx.files[p.replace("/h/.config/herdr-app/", "")] ?? null, writeTextFile = async () => {}, knownAgents = async () => [];
    export const props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {}), focused = () => null;
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods", "crew-chief", "main.js"), join(dir, "crew-chief.mjs"));
  copyFileSync(join(root, "mods", "crew-chief-bar", "main.js"), join(dir, "crew-chief-bar.mjs"));
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
  const c = await import(pathToFileURL(join(dir, "crew.js")).href);
  const { default: Dash, notesItems } = await import(pathToFileURL(join(dir, "crew-chief.mjs")).href);
  const { default: Bar } = await import(pathToFileURL(join(dir, "crew-chief-bar.mjs")).href);

  // ── the window spec ──
  const split = c.chiefWindowSpec("split", "tC");
  assert.equal(split.kind, "window"); assert.equal(split.key, "chief"); assert.equal(split.keep, true);
  assert.equal(split.width, 1180); assert.equal(split.layout.type, "row");
  const [left, right] = split.layout.children;
  assert.deepEqual(left.size, { px: c.CHIEF_TERM_W });
  assert.equal(left.children[0].content.mod, "crew-chief-bar");
  assert.deepEqual(left.children[1].content, { terminal: "tC" });
  assert.equal(right.content.mod, "crew-chief");
  const compact = c.chiefWindowSpec("compact", "tC");
  assert.equal(compact.width, 480); assert.equal(compact.layout.type, "column");
  assert.deepEqual(compact.layout.children.map((x) => x.content.mod ?? x.content.terminal), ["crew-chief-bar", "crew-chief", "tC"]);
  assert.equal(compact.layout.children[1].content.props.compact, true);
  assert.equal(c.chiefWindowSpec("full", "tC").width, 0.94);
  const none = c.chiefWindowSpec("bogus", null);
  assert.equal(none.width, 1180);
  assert.deepEqual(none.layout.children.map((x) => x.content.mod), ["crew-chief-bar", "crew-chief"]);
  assert.ok(!JSON.stringify(none).includes("terminal"));

  // ── the crew: Orca, a pal, the Chief ──
  fx.shared.crew = { bots: [{ id: "b0", name: "Orca", space: "s0", god: true }, { id: "b1", name: "Herdr Mod", space: "s1" },
    { id: "bC", name: "Chief", space: "sC", chief: true, role: "Chief of staff" }] };
  fx.spaces = [{ id: "s0", name: "Orca", tabs: [{ id: "tg", name: "#general", status: "working" }, { id: "to", name: "#ops", status: "idle" }] },
    { id: "s1", name: "Herdr Mod", active: true, tabs: [{ id: "t1", name: "#chief", status: "working" }, { id: "t2", name: "#grok-review", status: "blocked" }] },
    { id: "sC", name: "Chief", tabs: [{ id: "tc", name: "#chief", status: "done" }] }];
  fx.agents = [{ address: "tg", space: "s0", tab: "tg", status: "working", title: "Routing" }, { address: "t1", space: "s1", tab: "t1", status: "working", title: "Chief build" },
    { address: "tC", space: "sC", tab: "tc", status: "working", title: "" }];
  fx.panes = [{ tab: "tg", terminal: "tg", program: { agent: true, key: "claude" } }, { tab: "t1", terminal: "t1", program: { agent: true, key: "claude" } }, { tab: "tc", terminal: "tC", program: { agent: true, key: "claude" } }];
  assert.deepEqual(c.withoutChief().map((s) => s.name), ["Orca", "Herdr Mod"]);
  assert.equal(c.chiefOf().name, "Chief");
  assert.equal(c.chiefTerminal(), "tC");
  assert.ok(c.appMenuItems().some((x) => x.id === "chief"));

  // ── Ctrl+Shift+J: open, then close by its id ──
  c.toggleChief();
  assert.equal(fx.overlays.length, 1);
  assert.deepEqual(fx.overlays[0].layout.children[0].children[1].content, { terminal: "tC" });
  assert.equal(fx.shared["crew.chief.win"].id, "ov1");
  c.toggleChief();
  assert.deepEqual(fx.closed, ["ov1"]);
  assert.equal(fx.shared["crew.chief.win"].id, undefined);
  assert.equal(fx.shared["crew.chief.win"].size, "split");
  c.resizeChief("compact");
  assert.equal(fx.overlays.at(-1).width, 480);
  assert.equal(fx.shared["crew.chief.win"].size, "compact");
  assert.ok(!fx.calls.some((x) => x[0] === "run" && x[1] === "pane.focus"), "never pane.focus the Chief");

  // ── the dashboard ──
  const cx = { focus_handle: () => ({}), timer: { after: () => {}, every: () => {} }, notify: () => {}, spawn: (f) => f(cx) };
  fx.files["data/crew-chief/priorities.md"] = "# Priorities\n\n- Ship 0.4.2 (why: T63)\n1. Quiet #general\n";
  fx.files["data/crew-chief/watch.md"] = "- T59, check 18:00\n";
  fx.desk = { cards: [{ id: "c-111111", from: "Chief#chief", to: "Orca#ops", title: "Nudge Grok", status: "working", created: new Date().toISOString() },
    { id: "c-222222", from: "Herdr Mod#chief", to: "Orca#ops", title: "Not the Chief's", status: "seen", created: new Date().toISOString() }] };
  fx.shared["crew.needs"] = { count: 1, items: [{ why: "question", label: "Herdr Mod #grok-review" }] };
  fx.props = { size: "split", overlay: "ov9" };
  const dash = new Dash();
  dash.init(fx.props, cx);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fx.shared["crew.chief.win"].id, "ov9", "a kept window says which id it is");
  assert.ok(dash.ask.focused >= 1, "the Ask field takes the keyboard");
  assert.deepEqual(dash.priorities, ["Ship 0.4.2 (why: T63)", "Quiet #general"]);
  assert.deepEqual(dash.handed().map((k) => k.id), ["c-111111"]);
  assert.equal(dash.counts().working, 2, "the Chief's own work isn't counted");
  dash.render(cx);
  fx.props = { size: "compact", compact: true };
  dash.render(cx);
  new Bar().render();
  // Ask: into its terminal with hc send
  dash.ask.set_value("what should I care about?");
  dash.send(cx);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(fx.calls.filter((x) => x[0] === "hc"), [["hc", "send", "tC", "what should I care about?"]]);
  assert.equal(dash.ask.value(), "");
  // A topic click leaves the pop-up and opens it
  fx.props = { size: "split" };
  dash.render(cx);
  clicks.get("cht-t2")?.();
  assert.ok(fx.calls.some((x) => x[0] === "run" && x[1] === "tab.select" && x[2].includes("t2")));

  // ── T96: on Claude Code's trust question no agent reports yet. That's "starting", not asleep: the
  // window still shows its terminal (the question is answered there), nothing offers to wake it, and
  // no wake ever opens a second space while the first is open. ──
  const newSpaces = () => fx.calls.filter((x) => x[0] === "run" && x[1] === "space.new").length;
  const agentPanes = fx.panes;
  const setChief = (extra) => { fx.shared.crew = { bots: fx.shared.crew.bots.map((b) => (b.chief ? { id: b.id, name: b.name, space: b.space, chief: true, role: b.role, ...extra } : b)) }; };
  fx.panes = fx.panes.map((p) => (p.terminal === "tC" ? { tab: "tc", terminal: "tC", program: { agent: false, key: "bash" } } : p));
  setChief({ hired: Date.now() });
  assert.equal(c.chiefTerminal(), null);
  assert.equal(c.chiefShell(), "tC");
  assert.equal(c.chiefState(), "starting");
  c.openChief("split");
  assert.deepEqual(fx.overlays.at(-1).layout.children[0].children[1].content, { terminal: "tC" }, "its terminal is in the window before its agent reports");
  clicks.clear();
  fx.props = { size: "split" };
  dash.render(cx);
  assert.equal(clicks.has("chief-go"), false, "a starting Chief is never offered Wake");
  fx.props = { size: "compact", compact: true };
  dash.render(cx);
  new Bar().render();
  await c.wakeChief();
  await c.wakePal(c.chiefOf());
  assert.equal(newSpaces(), 0, "no second space while its space is open");
  assert.equal(c.chiefOf().space, "sC", "and its record still points at its space");
  // Asleep in place (its space open, hired long ago): Wake resumes it in its own terminal (pal wake)
  setChief({ hired: Date.now() - 3600e3 });
  assert.equal(c.chiefState(), "resting");
  fx.props = { size: "split" };
  dash.render(cx);
  fx.calls.length = 0;
  clicks.get("chief-go")?.(null, cx);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(newSpaces(), 0);
  const woke = fx.calls.find((x) => x[0] === "sh" && x.includes("wake"));
  assert.ok(woke && woke.includes("Chief") && woke.includes("--notify"), "Wake goes through pal wake: " + JSON.stringify(fx.calls));
  // The window open before the Chief has a terminal: it's rebuilt around the terminal as soon as there is one
  fx.panes = fx.panes.filter((p) => p.terminal !== "tC");
  let every = null;
  const dash2 = new Dash();
  dash2.init(fx.props, { ...cx, timer: { after: () => {}, every: (_ms, f) => { every = f; } } });
  const before = fx.overlays.length;
  every(cx);
  assert.equal(fx.overlays.length, before);
  fx.panes = [...fx.panes, { tab: "tc", terminal: "tC", program: { agent: false, key: "bash" } }];
  every(cx);
  assert.equal(fx.overlays.length, before + 1, "rebuilt once its terminal exists");
  assert.deepEqual(fx.overlays.at(-1).layout.children[0].children[1].content, { terminal: "tC" });
  every(cx);
  assert.equal(fx.overlays.length, before + 1, "and only once");
  // Its space closed: Wake opens it again, once
  const open = fx.spaces;
  fx.spaces = fx.spaces.filter((s) => s.id !== "sC");
  assert.equal(c.chiefState(), "closed");
  await c.wakeChief();
  assert.equal(newSpaces(), 1);
  fx.spaces = open; fx.panes = agentPanes; fx.calls.length = 0;
  setChief({});
  assert.equal(c.chiefState(), "awake");

  // Asleep, and not hired: the empty state (Wake / Hire)
  fx.panes = fx.panes.filter((p) => p.terminal !== "tC");
  assert.equal(c.chiefTerminal(), null);
  dash.render(cx);
  fx.shared.crew = { bots: fx.shared.crew.bots.filter((b) => !b.chief) };
  fx.spaces = fx.spaces.filter((s) => s.id !== "sC");
  dash.render(cx);
  clicks.get("chief-go")?.(null, cx);
  await new Promise((r) => setTimeout(r, 10));
  const hire = fx.calls.find((x) => x[0] === "pal" && x[1] === "hire");
  assert.ok(hire && hire.includes("--chief") && hire.includes("--click"), "Hire is the owner's click: " + JSON.stringify(hire));

  // Grok T69: the role alone isn't the Chief (the hire dialog offers it to anyone).
  assert.equal(c.isChiefRec({ name: "Staffer", role: "Chief of staff" }), false);
  assert.equal(c.isChiefRec({ name: "Chief", chief: "yes" }), false);
  assert.equal(c.isChiefRec({ name: "Chief", chief: true }), true);
  fx.shared.crew = { bots: [{ id: "b0", name: "Orca", space: "s0", god: true }, { id: "bS", name: "Staffer", space: "sS", role: "Chief of staff" }] };
  fx.spaces = [{ id: "s0", name: "Orca", tabs: [] }, { id: "sS", name: "Staffer", tabs: [] }];
  assert.equal(c.chiefOf(), null);
  assert.deepEqual(c.withoutChief().map((s) => s.name), ["Orca", "Staffer"]);

  assert.deepEqual(notesItems("x\n- a\n* b\n3) c\n  - d\ntext"), ["a", "b", "c", "d"]);
  console.log("test_chief.mjs: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
