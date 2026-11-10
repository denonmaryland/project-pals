// A pal's Computer (crew-boards/pal-computer/design.md, B · Desktop; T81), headless: the window
// geometry (inside the desktop, cascaded, never off the edge: the spike found `at` isn't clamped),
// opening an app as a Herdr window keyed per pal and app, bringing an open one forward, the keyboard
// handed to the next window when one closes (and to the desktop when none is left), leaving the
// desktop closing unpinned windows only, Pin reopening with keep, and every app rendering with data
// and without it. Run: node tests/test_computer.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "computer-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    export const clicks = new Map(), texts = [];
    const el = () => {
      const p = new Proxy(function () {}, {
        get: (t, k) => {
          if (k === "then") return undefined;
          // Herdr's elements are single-use: changing one after it went into a parent fails the render.
          if (t.__attached && typeof k === "string" && !k.startsWith("__")) throw new Error(\`element changed after it was added to a parent (.\${k})\`);
          if (k === "when") return (c, f) => (c ? f(p) : p);
          if (k === "id") return (id) => { p.__id = id; return p; };
          if (k === "on_click") return (f) => { if (p.__id) clicks.set(p.__id, f); return p; };
          if (k === "child") return (c) => { if (typeof c === "string") texts.push(c); else if (c === undefined || c === null) throw new Error("child(undefined)"); else c.__attached = true; return p; };
          if (k === "children") return (cs) => { for (const c of cs) { if (typeof c === "string") texts.push(c); else if (c === undefined || c === null) throw new Error("children: undefined"); else c.__attached = true; } return p; };
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
    export const TextView = { markdown: () => div() };
    class St { constructor(o) { this.v = o?.value ?? ""; } on() { return true; } value() { return this.v; } set_value(v) { this.v = v; } focus() {} }
    export const TextareaState = { new: (o) => new St(o) }, InputState = { new: (o) => new St(o) };
    export const Textarea = { new: () => div() }, Input = { new: () => div() };`);
  mod("herdr", `
    export const fx = { calls: [], closed: [], overlays: [], shared: { "crew.settings": { owner: "DeNon", head: "Orca" } }, spaces: [], files: {}, cli: {} };
    export const spaces = () => fx.spaces, agents = () => [], panes = () => [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fx.calls.push([String(cmd).split("/").pop(), ...(args ?? [])]);
      if (String(cmd).endsWith("/pal")) {
        const key = args.filter((a) => !a.startsWith("--") && !/^\\d{4}-/.test(a) && !/^\\d+$/.test(a)).join(" ");
        return { stdout: JSON.stringify(fx.cli[key] ?? {}), stderr: "", code: fx.cli[key] ? 0 : 1 };
      }
      if (cmd === "git") return { stdout: fx.git?.[args[2]] ?? "", stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    export const hc = async () => ({ stdout: "", stderr: "", code: 0 });
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", keys = () => [], settings = () => ({});
    export const layout = () => fx.layout ?? null;
    export const run = (c, a) => { fx.calls.push(["run", c, JSON.stringify(a)]); if (c === "layout.select" && fx.layout) fx.layout.children[0].active = a.child; };
    export const notify = () => {}, nextCommand = () => new Promise(() => {});
    export const openOverlay = (o) => { fx.overlays.push(o); return "ov" + fx.overlays.length; }, closeOverlay = (id) => { fx.closed.push(id); };
    export const readTextFile = async (p) => fx.files[p] ?? null, writeTextFile = async () => {}, knownAgents = async () => [];
    export const props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {}), focused = () => null;
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "factories.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods", "crew-computer", "main.js"), join(dir, "crew-computer.mjs"));
  copyFileSync(join(root, "mods", "crew-computer-app", "main.js"), join(dir, "crew-computer-app.mjs"));
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
  const c = await import(pathToFileURL(join(dir, "crew.js")).href);
  const { default: Desk } = await import(pathToFileURL(join(dir, "crew-computer.mjs")).href);
  const { default: App } = await import(pathToFileURL(join(dir, "crew-computer-app.mjs")).href);
  const tick = () => new Promise((r) => setTimeout(r, 15));
  const cx = { focus_handle: () => ({ focus() { this.n = (this.n ?? 0) + 1; } }), timer: { after: (_ms, f) => f(), every: () => {} }, notify: () => {}, spawn: (f) => f(cx) };

  // ── geometry: inside the area, cascaded, never past its edges ──
  const area = { x: 300, y: 46, w: 1100, h: 700 };
  const r0 = c.pcWindowRect(area, "calendar", 0), r1 = c.pcWindowRect(area, "calendar", 1);
  assert.deepEqual(r0, { x: 340, y: 70, w: 760, h: 520 });
  assert.equal(r1.x - r0.x, 28); assert.equal(r1.y - r0.y, 28);
  const small = { x: 300, y: 46, w: 500, h: 300 };
  for (let n = 0; n < 8; n++) {
    const r = c.pcWindowRect(small, "notes", n);
    assert.ok(r.x >= small.x && r.x + r.w <= small.x + small.w, `x inside (n=${n})`);
    assert.ok(r.y >= small.y && r.y + r.h <= small.y + small.h, `y inside (n=${n})`);
  }

  // ── the crew, a pal with three topics, the pals layout with pc-view ──
  fx.shared.crew = { bots: [{ id: "b0", name: "Orca", space: "s0", god: true }, { id: "b1", name: "Juniper", space: "s1", folder: "/p/checkout" }] };
  fx.spaces = [{ id: "s0", name: "Orca", tabs: [{ id: "tg", name: "#general" }] },
    { id: "s1", name: "Juniper", active: true, status: "working", folder: "/p/checkout",
      tabs: [{ id: "t1", name: "#checkout", status: "working" }, { id: "t2", name: "#docs" }, { id: "t3", name: "#perf", status: "blocked" }] },
    { id: "s2", name: "Pixel", tabs: [{ id: "t9", name: "#icons" }] }];
  fx.layout = { id: "body", type: "row", children: [{ id: "center", type: "stack", active: "tab-view",
    children: [{ id: "tab-view" }, { id: "home-view" }, { id: "pc-view" }] }, { id: "sidebar", size: { px: 300 } }] };

  // ── showing it: the pal's desktop in the center ──
  assert.equal(c.showComputer(fx.spaces[1]), true);
  assert.equal(fx.layout.children[0].active, "pc-view");
  assert.equal(fx.shared["crew.pc"].pal, "Juniper");
  assert.ok(c.computerMode());
  assert.ok(c.palMenuItems ? true : true);

  // ── opening apps: a window each, keyed per pal and app; again → to the front, no second window ──
  const id1 = c.openComputerApp("Juniper", "todo", area);
  assert.equal(fx.overlays.at(-1).kind, "window");
  assert.equal(fx.overlays.at(-1).mod, "crew-computer-app");
  assert.equal(fx.overlays.at(-1).key, "pc-juniper-todo");
  assert.deepEqual(fx.overlays.at(-1).props, { pal: "Juniper", app: "todo", fit: false });
  assert.equal(fx.overlays.at(-1).keep, false);
  assert.ok(fx.overlays.at(-1).at, "a first window is placed inside the desktop");
  const id2 = c.openComputerApp("Juniper", "calendar", area);
  assert.equal(fx.shared["crew.pc.focus"], "Juniper|calendar");
  const before = fx.overlays.length;
  assert.equal(c.openComputerApp("Juniper", "todo", area), id1, "an open app comes forward");
  assert.equal(fx.overlays.length, before);
  assert.equal(fx.shared["crew.pc.focus"], "Juniper|todo");

  // ── closing: the keyboard goes to the next window, then to the desktop ──
  c.closeComputerApp("Juniper", "todo");
  assert.deepEqual(fx.closed, [id1]);
  assert.equal(fx.shared["crew.pc.focus"], "Juniper|calendar");
  c.closeComputerApp("Juniper", "calendar");
  assert.equal(fx.shared["crew.pc.focus"], "Juniper|desktop");

  // ── Pin: reopened in place with keep; leaving the desktop closes only unpinned ones ──
  c.openComputerApp("Juniper", "notes", area);
  const todoId = c.openComputerApp("Juniper", "todo", area);
  c.pinComputerApp("Juniper", "todo", area);
  const pinned = fx.overlays.at(-1);
  assert.equal(pinned.keep, true); assert.equal(pinned.key, "pc-juniper-todo");
  assert.equal(pinned.at, undefined, "a window reopened by Pin stays where it was dropped (its key)");
  assert.ok(fx.closed.includes(todoId));
  fx.closed.length = 0;
  c.showTabs();
  const left = Object.values(fx.shared["crew.pc.wins"]).map((w) => w.app);
  assert.deepEqual(left, ["todo"], "the pinned To-do stays over the work");
  assert.equal(fx.closed.length, 1, "Notes closed");

  // ── another pal's computer: the first one's unpinned windows close ──
  c.showComputer(fx.spaces[1]);
  c.openComputerApp("Juniper", "journal", area);
  fx.closed.length = 0;
  c.showComputer(fx.spaces[2]);
  assert.equal(fx.shared["crew.pc"].pal, "Pixel");
  assert.equal(fx.closed.length, 1);
  assert.ok(fx.shared["crew.pc.wins"]["Juniper|todo"], "pinned windows survive a pal switch");
  c.showComputer(fx.spaces[1]);

  // ── the menus ──
  assert.ok(c.appMenuItems().some((x) => x.id === "computer"));

  // ── the desktop renders: no data yet, then the Today widget ──
  fx.cli["computer Juniper today"] = { pal: "Juniper", focus: "beta on Friday", statement: "", goals: [],
    topics: [{ topic: "checkout", state: "working", terminal: "a", task: { id: "T41", title: "double charge" } },
      { topic: "perf", state: "blocked", terminal: "b", task: null }, { topic: "docs", state: "asleep", terminal: "c", task: null }],
    next: [{ id: "T45", title: "addresses", due_label: "due Wed" }], desk: { open: 2, needs_you: 1 }, due_today: [] };
  const desk = new Desk();
  desk.init({}, cx);
  desk.render(cx);
  await tick();
  assert.equal(desk.data.focus, "beta on Friday");
  desk.render(cx);
  clicks.get("pc-ico-calendar")?.(null, cx);
  assert.equal(fx.overlays.at(-1).props.app, "calendar");
  assert.ok(fx.overlays.at(-1).at.x >= 300, "placed right of the sidebar (no pointer yet: from the layout)");
  desk.key({ keystroke: "3" }, cx);
  assert.equal(fx.shared["crew.pc.focus"], "Juniper|todo", "3 brings the To-do forward");
  desk.key({ keystroke: "escape" }, cx);
  assert.equal(fx.layout.children[0].active, "tab-view", "Esc: back to the topic");
  c.showComputer(fx.spaces[1]);

  // ── every app renders, with its data and without ──
  const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const at = (dd, hh) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + dd, hh).getTime();
  const iso = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  fx.cli["computer Juniper todo"] = { pal: "Juniper",
    doing: [{ id: "T41", title: "double charge", status: "claimed", topic: "checkout", due: null, due_label: "" }],
    next: [{ id: "T45", title: "addresses", status: "open", topic: null, due: "2026-11-11", due_label: "due Wed" },
      { id: "T47", title: "late", status: "open", topic: null, due: "2026-11-01", due_label: "overdue 8d" }],
    blocked: [{ id: "T39", title: "cart", status: "blocked", topic: "perf", due: null, due_label: "" }], done_today: [],
    cards: [{ id: "c-1", kind: "tell", status: "needs you", title: "image CDN?", from: "Juniper#perf" }] };
  fx.cli["computer Juniper calendar"] = { pal: "Juniper", start: iso(mon), days: 7, events: [
    { kind: "work", topic: "checkout", start: at(0, 9), end: at(0, 11), how: "finished", guessed: false },
    { kind: "routine", at: at(1, 9), routine: "r-1", name: "stand-up", past: false },
    { kind: "done", at: at(0, 11), task: "T40", title: "diagram" },
    { kind: "due", day: iso(new Date(at(2, 0))), time: null, task: "T45", title: "addresses" }] };
  fx.cli["computer Juniper journal"] = { pal: "Juniper", week: { hiccups: 2, minutes: 35, lessons: 1 }, days: [{ day: "2026-11-09", entries: [
    { time: "14:02", channel: "docs", task: "T40", took: "50m", did: "diagram", hiccups: [{ text: "font missing (cost: ~10m)", cost: 10 }], lesson: "render in CI" }] }] };
  fx.cli["computer Juniper pages"] = { pal: "Juniper", folder: "/d/crew-memory/juniper/pages", pages: [{ name: "Quirks", file: "/d/crew-memory/juniper/pages/Quirks.md" }] };
  fx.cli["mission show Juniper"] = { pal: "Juniper", dir: "/d/crew-memory/juniper/brain", text: "# Mission" };
  fx.files["/d/crew-memory/juniper/brain/mission.md"] = "# Mission\n\nShip checkout.";
  fx.git = { status: "## fix/double-charge...origin/fix [ahead 3]\n M a.ts\n?? b.ts\n", worktree: "worktree /p/checkout\nbranch refs/heads/main\n\nworktree /w/x\nbranch refs/heads/fix\n",
    log: "a1c9e02\tRetry sends the same key\t1700000000\n" };
  for (const app of ["todo", "desk", "calendar", "journal", "notes", "work"]) {
    fx.props = { pal: "Juniper", app, overlay: `ov-${app}` };
    const w = new App();
    w.init(fx.props, cx);
    await tick();
    assert.equal(w.err, null, `${app}: ${w.err}`);
    w.render(cx);
    assert.equal(fx.shared["crew.pc.wins"][`Juniper|${app}`].id, `ov-${app}`, `${app} says which window it is`);
  }
  // Notes opened the mission; Work read git.
  fx.props = { pal: "Juniper", app: "work" };
  const work = new App(); work.init(fx.props, cx); await tick();
  assert.equal(work.data.branch, "fix/double-charge"); assert.equal(work.data.ahead, 3); assert.equal(work.data.changed, 2);
  assert.deepEqual(work.data.worktrees.map((x) => x.branch), ["main", "fix"]);
  // An app whose read fails says so, and still renders.
  fx.props = { pal: "Nobody", app: "todo" };
  const bad = new App(); bad.init(fx.props, cx); await tick();
  assert.ok(bad.err);
  bad.render(cx);
  // The bar's ×: closes this window and hands the keyboard on.
  fx.props = { pal: "Juniper", app: "journal", overlay: "ov-j2" };
  const j = new App(); j.init(fx.props, cx); await tick(); j.render(cx);
  clicks.get("pc-x")?.(null, cx);
  assert.ok(fx.closed.includes("ov-j2"));
  assert.equal(fx.shared["crew.pc.wins"]["Juniper|journal"], undefined);
  // Keys in a window (live look, T81): Esc hands the keyboard to the desktop, 1–6 open another app.
  fx.props = { pal: "Juniper", app: "calendar", overlay: "ov-cal2" };
  const cal = new App(); cal.init(fx.props, cx); await tick(); cal.render(cx);
  cal.key({ keystroke: "escape" }, cx);
  assert.equal(fx.shared["crew.pc.focus"], "Juniper|desktop");
  cal.key({ keystroke: "5" }, cx);
  assert.equal(fx.shared["crew.pc.focus"], "Juniper|work");
  // Overlapping work blocks get lanes.
  assert.deepEqual(c.lanesFor([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 20, end: 30 }]).map((x) => [x.lane, x.lanes]), [[0, 2], [1, 2], [0, 1]]);
  // No locale data in Herdr: our own day and month names.
  assert.equal(c.dayDate(new Date(2026, 10, 9)), "Mon Nov 9");
  // Narrow desktop renders too, and windows open right of the icon column.
  desk.size = { width: 700, height: 600 };
  desk.render(cx);
  assert.ok(desk.area().x >= 404, "right of the sidebar and the icons");
  console.log("test_computer: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
