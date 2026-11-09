// Home (the head pal's page), run headless: crew-home renders every box with every kind of item
// (approvals, the head pal's asks and logins, topics asking you, Desk cards waiting on you,
// proposals, stuck topics; installs, tasks done, finished topics, links, notes, answers; working,
// held; queued and deploys; parked) and the all-clear state without throwing; Needs you is oldest
// first; finished topics show for 24 h at most; its actions are the right pal commands, the owner's
// with a click token. Run: node tests/test_home_view.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
// Herdr gives each mod copy a localStorage; here, a small in-memory one.
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "homeview-"));
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
    export const spaces = () => fx.spaces, agents = () => fx.agents ?? [], panes = () => [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fx.calls.push([cmd.split("/").pop(), ...args]);
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "ls") return { stdout: JSON.stringify(fx.desk), stderr: "", code: 0 };
      if (cmd === "tail") return { stdout: fx.feed ?? "", stderr: "", code: 0 };
      if (cmd === "sh") return { stdout: String(args.at(-1)).endsWith("crew-approvals") ? fx.approvals ?? "" : "", stderr: "", code: 0 };
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "send") return { stdout: JSON.stringify({ card: { id: "c-abcdef", to: "Herdr Mod#desk" }, terminal: "t1", what: "queued" }), stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    const nop = () => {};
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => fx.layout, keys = () => [], settings = () => ({});
    export const run = (c, a) => fx.calls.push(["run", c, JSON.stringify(a)]), notify = (n) => fx.toasts.push(n), openOverlay = nop, closeOverlay = () => { fx.closed++; };
    export const hc = exec, readTextFile = async (p) => (fx.files ?? {})[p.replace("/h/.config/herdr-app/", "")] ?? null, writeTextFile = async () => {}, knownAgents = async () => [], props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {});
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  cpSync(join(root, "mods", "crew-home", "main.js"), join(dir, "crew-home.mjs"));
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
  const crewjs = await import(pathToFileURL(join(dir, "crew.js")).href);

  // A fixed clock at noon, so "today" (since midnight) holds every fixture whenever this runs.
  const NOON = new Date(); NOON.setHours(12, 0, 0, 0);
  const realNow = Date.now; Date.now = () => NOON.getTime();
  const now = Date.now(), min = 60000;
  const iso = (m) => new Date(now - m * min).toISOString().replace(/\.\d+Z$/, "Z");
  fx.shared["crew.settings"] = { owner: "DeNon", head: "Orca" };
  fx.shared.crew = { bots: [{ id: "b0", name: "Orca", space: "s0", god: true, awake: true }, { id: "b1", name: "Herdr Mod", space: "s1", awake: true }] };
  fx.spaces = [
    { id: "s0", name: "Orca", tabs: [{ id: "tg", name: "general", status: "working", changed_at: now - 3 * min }] },
    { id: "s1", name: "Herdr Mod", active: true, tabs: [{ id: "tb1", name: "desk", status: "working", changed_at: now - 16 * min },
      { id: "tb2", name: "landing", status: "blocked", changed_at: now - 12 * min }, { id: "tb3", name: "site", status: "idle", changed_at: now - 50 * min }] },
  ];
  fx.agents = [
    { address: "t1", space: "s1", tab: "tb1", status: "working", title: "Reporting stage 2", seq: 3 },
    { address: "tg", space: "s0", tab: "tg", status: "working", title: "Relaying the brief", seq: 2 },
    { address: "t2", space: "s1", tab: "tb2", status: "blocked", title: "", seq: 1 },
  ];
  fx.shared["crew.needs"] = { count: 1, items: [{ why: "question", tab: "tb2", label: "Herdr Mod #landing" }] };
  fx.approvals = JSON.stringify({ id: "a-111111", status: "pending", at: now - 129 * min, bot: "Herdr Mod", channel: "site", rule: "deploy", why: "deploys a site", command: "vercel deploy --prod" });
  const feed = [
    { at: now - 30 * min, kind: "finished", bot: "Herdr Mod", channel: "desk" },
    { at: now - 20 * min, kind: "finished", bot: "Herdr Mod", channel: "desk" },
    { at: now - 26 * 60 * min, kind: "finished", bot: "Herdr Mod", channel: "old" },
    { at: now - 40 * min, kind: "task", task: "T23", status: "done", title: "RECIPE matches", by: "Herdr Mod" },
    { at: now - 10 * min, kind: "remembered", bot: "Orca" },
  ];
  fx.feed = feed.map((x) => JSON.stringify(x)).join("\n") + "\nnot json\n";
  const home = { version: 1, seen: now - 134 * min, items: [
    { id: "h-aaaaaa", kind: "ask", status: "open", title: "Blur the journal entries?", options: ["Blur them", "Leave as is"], by: "Orca#general", at: now - 112 * min },
    { id: "h-bbbbbb", kind: "ask", status: "open", title: "Pick a palette", by: "Orca#general", at: now - 48 * min },
    { id: "h-cccccc", kind: "login", status: "open", title: "Log in to continue", command: "! npx vercel login", topic: "Herdr Mod#site", by: "Orca#general", at: now - 31 * min },
    { id: "h-dddddd", kind: "link", status: "done", title: "Orca home board", url: "~/.config/herdr-app/data/crew-boards/orca-home/index.html", by: "Herdr Mod#orca-home", at: now - 5 * min },
    { id: "h-eeeeee", kind: "note", status: "done", title: "Trees checked", by: "Orca#general", at: now - 60 * min },
    { id: "h-ffffff", kind: "deploy", status: "open", title: "The site to Vercel", topic: "Herdr Mod#site", by: "Orca#general", at: now - 31 * min },
    { id: "h-111111", kind: "later", status: "parked", title: "Mac support", by: "Orca#general", at: now - 3000 * min, parked_at: now - 3000 * min },
    { id: "h-222222", kind: "ask", status: "answered", title: "Ship it?", answer: "Yes", answered_at: now - 2 * min, closed_at: now - 2 * min, by: "Orca#general", at: now - 90 * min },
  ], release: { next: "0.3.1", note: "held for your OK", queued: [{ id: "r-1", text: "Desk cards", at: now - 60 * min }] } };
  fx.files = {
    "data/crew-home/home.json": JSON.stringify(home),
    "data/crew-installs.jsonl": JSON.stringify({ at: now - 15 * min, version: "0.2.3", source: "local", build: { hash: "052716e", branch: "crew/next", subject: "Desk stage 2", dirty: false } }) + "\n",
    "data/crew-install.json": JSON.stringify({ version: "0.2.3", source: "local", installed: Math.floor(now / 1000) - 900, build: { hash: "052716e", branch: "crew/next", subject: "Desk stage 2", tag: "v0.2.3", ahead: 14 } }),
    "data/crew-update.json": JSON.stringify({ latest: "0.2.3", checked: now / 1000 - 600, published: "2026-11-05T18:05:01Z", repo: "denonmaryland/project-pals" }),
    "data/crew-daemon.json": JSON.stringify({ at: now / 1000 }),
  };
  fx.desk = { counts: {}, cards: [
    { id: "c-owner1", kind: "ask", status: "needs you", from: "Herdr Mod#orca-home", from_kind: "pal", to: "DeNon", title: "Which hotkey?", created: iso(5), tray: "_owner" },
    { id: "c-orca01", kind: "tell", status: "seen", from: "Herdr Mod#desk", from_kind: "pal", to: "Orca#general", title: "Stage 2 is in", created: iso(20), tray: "orca" },
    { id: "c-orca02", kind: "tell", status: "done", from: "Herdr Mod#orca-home", from_kind: "pal", to: "Orca#general", title: "Mock ready", result: "opened it", created: iso(40), updated: iso(8), tray: "orca" },
    { id: "c-held01", kind: "tell", status: "held", held: "draft", held_since: iso(41), from: "Orca#general", from_kind: "pal", to: "Herdr Mod#site", title: "Go", created: iso(41), tray: "herdr-mod" },
  ] };

  const run = async (f) => { const tasks = []; const cx = { notify() {}, spawn: (g) => tasks.push(g(cx)), timer: { every() {}, after() {} }, focus_handle: () => ({ focus() {} }), stop_propagation() {} };
    f(cx); for (let i = 0; i < 6 && tasks.length; i++) await Promise.all(tasks.splice(0)); return cx; };

  // Pure helpers.
  assert.equal(crewjs.homeAge(now - 129 * min, now), "2h 9m");
  assert.equal(crewjs.homeAge(now - 30 * 1000, now), "now");
  assert.equal(crewjs.homeAge(0, now), "");
  assert.deepEqual(crewjs.homeData("{bad").items, []);
  assert.deepEqual(crewjs.homeData(JSON.stringify({ items: [{ id: "h-1" }, null, { no: 1 }] })).items.map((x) => x.id), ["h-1"]);
  const fs = crewjs.feedSince(feed, 0, now);
  assert.deepEqual(fs.map((x) => x.kind), ["finished", "task"], "one row per finished topic; older than 24 h is gone");
  assert.equal(fs[0].turns, 2);
  assert.deepEqual(crewjs.feedSince(feed, now - 25 * min, now).map((x) => x.kind), ["finished"], "since the owner last looked");

  // The view, shown.
  fx.layout = { id: "root", children: [{ id: "center", type: "stack", active: "home-view", children: [{ id: "tab-view" }, { id: "home-view" }] }] };
  const Home = (await import(pathToFileURL(join(dir, "crew-home.mjs")).href)).default;
  const v = new Home();
  await run((cx) => v.init({}, cx));
  await run((cx) => v.render(cx));
  assert.ok(v.loaded, "it read its files when shown");
  const needs = v.needs();
  assert.deepEqual(needs.map((n) => n.kind), ["approval", "ask", "ask", "login", "question", "desk"], "every kind, oldest first");
  const since = v.since();
  for (const k of ["install", "link", "note", "answered", "finished", "task", "card"]) assert.ok(since.some((r) => r.kind === k), `Since you last looked has ${k}`);
  assert.ok(!since.some((r) => r.kind === "finished" && r.channel === "old"));
  const prog = v.progress();
  assert.deepEqual(prog.rows.map((r) => r.ch), ["site", "desk", "general"], "working topics and a held one, longest first");
  assert.equal(prog.rows[0].held, "draft");
  assert.deepEqual(prog.desk.map((c) => c.id), ["c-orca01"], "what's open on the head pal's desk");
  await run((cx) => v.render(cx));
  for (const id of ["ap-a-111111-ok", "ap-a-111111-no", "h-h-aaaaaa-o0", "h-h-aaaaaa-o1", "h-h-aaaaaa-park", "h-h-bbbbbb-go", "h-h-cccccc-copy", "h-h-cccccc-go",
    "q-tb2-go", "c-c-owner1-done", "c-c-owner1-desk", "what-happened"])
    assert.ok(clicks.has(id), `has a ${id} button`);
  // Inbox zero: the page is the list; the rest is in the drawer, closed until asked for.
  assert.equal(v.drawer, null, "the drawer starts closed");
  clicks.clear();
  await run((cx) => v.render(cx));
  assert.ok(!clicks.has("mark-seen") && !clicks.has("drawer-x"), "no drawer controls while it's closed");
  clicks.get("what-happened")(null, { notify() {} });
  assert.equal(v.drawer, "today", "What happened today opens the drawer on Today");
  const tabIds = { today: ["mark-seen", "drawer-x", "drawer-tab-working"], working: ["prog-w-t1"], releases: ["rel-h-ffffff"], parked: ["park-up-h-111111", "park-drop-h-111111"] };
  for (const [tab, ids] of Object.entries(tabIds)) {
    v.openDrawer(tab); clicks.clear();
    await run((cx) => v.render(cx));
    for (const id of ids) assert.ok(clicks.has(id), `${tab}: has ${id}`);
  }
  clicks.get("drawer-x")(null, { notify() {} });
  assert.equal(v.drawer, null, "× closes it");
  clicks.clear();
  await run((cx) => v.render(cx));
  clicks.get("what-happened")(null, { notify() {} });
  assert.equal(v.drawer, "parked", "it opens on the tab you used last");
  // Leaving Home closes it.
  fx.layout.children[0].active = "tab-view";
  await run((cx) => v.render(cx));
  assert.equal(v.drawer, null, "leaving Home closes the drawer");
  fx.layout.children[0].active = "home-view";
  await run((cx) => v.render(cx));

  // Actions: the owner's are clicks (pal … --click), the rest plain.
  const last = (pred) => fx.calls.filter((c) => c[0] === "pal" && pred(c)).at(-1);
  fx.calls.length = 0;
  await run((cx) => v.act("x1", ["home", "answer", "h-aaaaaa", "Blur them"], null, cx));
  assert.ok(last((c) => c[1] === "home" && c[2] === "answer").includes("--click"), "an answer is the owner's click");
  await run((cx) => v.act("x2", ["approve", "a-111111", "--inbox"], null, cx));
  assert.ok(last((c) => c[1] === "approve").includes("--click"));
  await run((cx) => v.act("x3", ["home", "seen"], null, cx));
  assert.ok(last((c) => c[1] === "home" && c[2] === "seen").includes("--click"));
  // Open a topic: the space and tab, then back to the topic view.
  fx.calls.length = 0;
  v.openTopic("Herdr Mod#site");
  assert.ok(fx.calls.some((c) => c[1] === "space.select" && c[2].includes("s1")));
  assert.ok(fx.calls.some((c) => c[1] === "tab.select" && c[2].includes("tb3")));
  assert.ok(fx.calls.some((c) => c[1] === "layout.select" && c[2].includes("tab-view")), "leaving Home shows the terminal");

  // showHome selects the head pal and the home-view; toggleHome goes back.
  fx.calls.length = 0;
  fx.layout.children[0].active = "tab-view";
  assert.equal(crewjs.showHome(), true);
  assert.ok(fx.calls.some((c) => c[1] === "space.select" && c[2].includes("s0")), "Home shows the head pal");
  assert.ok(fx.calls.some((c) => c[1] === "layout.select" && c[2].includes("home-view")));
  fx.layout.children[0].active = "home-view";
  fx.calls.length = 0;
  crewjs.toggleHome();
  assert.ok(fx.calls.some((c) => c[1] === "layout.select" && c[2].includes("tab-view")));
  // A layout without home-view (an older one): no Home.
  const keep = fx.layout; fx.layout = { id: "root", children: [{ id: "center", type: "stack", active: "tab-view", children: [] }] };
  assert.equal(crewjs.showHome(), false);
  fx.layout = keep;

  // All clear: nothing waiting, nothing new, nobody working.
  fx.approvals = ""; fx.shared["crew.needs"] = { items: [] }; fx.agents = []; fx.feed = ""; fx.desk = { counts: {}, cards: [] };
  fx.files["data/crew-home/home.json"] = JSON.stringify({ seen: now, items: [] });
  fx.files["data/crew-installs.jsonl"] = "";
  const w = new Home();
  await run((cx) => w.init({}, cx));
  await run((cx) => w.render(cx));
  await run((cx) => w.render(cx));
  assert.equal(w.needs().length, 0);
  assert.equal(w.progress().rows.length, 0);
  // Hidden: it reads nothing.
  fx.layout.children[0].active = "tab-view";
  fx.calls.length = 0;
  const h = new Home();
  await run((cx) => h.init({}, cx));
  await run((cx) => h.render(cx));
  assert.ok(!fx.calls.some((c) => c[0] === "tail"), "hidden, it reads nothing");
  Date.now = realNow;
  console.log("home view: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
