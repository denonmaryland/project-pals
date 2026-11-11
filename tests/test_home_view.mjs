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
    export const spaces = () => fx.spaces, agents = () => fx.agents ?? [], panes = () => fx.panes ?? [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fx.calls.push([cmd.split("/").pop(), ...args]);
      if (cmd.endsWith("/pal") && args[0] === "welcome") return { stdout: JSON.stringify(fx.folders ?? []), stderr: "", code: 0 };
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "ls") return { stdout: JSON.stringify(fx.desk), stderr: "", code: 0 };
      if (cmd === "tail") return { stdout: String(args.at(-1)).includes("crew-helpers") ? fx.helperLog ?? "" : fx.feed ?? "", stderr: "", code: 0 };
      if (cmd === "sh") return { stdout: String(args.at(-1)).endsWith("crew-approvals") ? fx.approvals ?? "" : "", stderr: "", code: 0 };
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "send") return { stdout: JSON.stringify({ card: { id: "c-abcdef", to: "Herdr Mod#desk" }, terminal: "t1", what: "queued" }), stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    const nop = () => {};
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => fx.layout, keys = () => [], settings = () => ({});
    export const run = (c, a) => fx.calls.push(["run", c, JSON.stringify(a)]), notify = (n) => fx.toasts.push(n), openOverlay = (o) => { (fx.overlays ??= []).push(o); return "ov1"; }, nextCommand = () => new Promise(() => {}), closeOverlay = () => { fx.closed++; };
    export const hc = exec, readTextFile = async (p) => (fx.files ?? {})[p.replace("/h/.config/herdr-app/", "")] ?? null, writeTextFile = async () => {}, knownAgents = async () => fx.known ?? [], props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {});
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  cpSync(join(root, "mods", "crew-home", "main.js"), join(dir, "crew-home.mjs"));
  for (const f of ["welcome.js", "welcome-text.js"]) copyFileSync(join(root, "mods", "crew-home", f), join(dir, f));
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
  const crewjs = await import(pathToFileURL(join(dir, "crew.js")).href);

  // A fixed clock at noon, so "today" (since midnight) holds every fixture whenever this runs.
  const NOON = new Date(); NOON.setHours(12, 0, 0, 0);
  const realNow = Date.now; Date.now = () => NOON.getTime();
  const now = Date.now(), min = 60000;
  const iso = (m) => new Date(now - m * min).toISOString().replace(/\.\d+Z$/, "Z");
  fx.shared["crew.settings"] = { owner: "DeNon", head: "Orca" };
  fx.shared.crew = { bots: [{ id: "b0", name: "Orca", space: "s0", god: true, awake: true }, { id: "b1", name: "Herdr Mod", space: "s1", awake: true },
    { id: "bm", name: "MUSE", space: "sm", awake: true, partner: true }] };
  fx.spaces = [
    { id: "s0", name: "Orca", tabs: [{ id: "tg", name: "general", status: "working", changed_at: now - 3 * min }] },
    { id: "sm", name: "MUSE", tabs: [{ id: "tm", name: "ideas", status: "idle", changed_at: now - 60 * min }] },
    { id: "s1", name: "Herdr Mod", active: true, tabs: [{ id: "tb1", name: "desk", status: "working", changed_at: now - 16 * min },
      { id: "tb2", name: "landing", status: "blocked", changed_at: now - 12 * min }, { id: "tb3", name: "site", status: "idle", changed_at: now - 50 * min }] },
  ];
  fx.agents = [
    { address: "t1", space: "s1", tab: "tb1", status: "working", title: "Reporting stage 2", seq: 3 },
    { address: "tg", space: "s0", tab: "tg", status: "working", title: "Relaying the brief", seq: 2 },
    { address: "t2", space: "s1", tab: "tb2", status: "blocked", title: "", seq: 1 },
    { address: "tm", space: "sm", tab: "tm", status: "idle", title: "", seq: 0 },
  ];
  fx.panes = [{ tab: "tg", terminal: "tg", program: { agent: true } }, { tab: "tb1", terminal: "t1", program: { agent: true } }];
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
  // Trusted helpers (T116): what one sent in your name, what it tried, and your switch (data/crew-helpers/log.jsonl).
  fx.helperLog = [
    { at: now - 26 * 60 * min, kind: "sent", helper: "Pals", card: "c-old001", to: "Orca#ops", card_kind: "tell", title: "Yesterday's" },
    { at: now - 70 * min, kind: "switch", helper: "Pals", action: "on", key: "made" },
    { at: now - 45 * min, kind: "sent", helper: "Pals", card: "c-41b9d0", to: "Orca#ops", card_kind: "tell", via: "pal tell", title: "Look into the update pill" },
    { at: now - 9 * min, kind: "refused", helper: "Pals", verified: true, command: "pal home answer h-aaaaaa Blur them", what: "answer a question on Home" },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n";
  const home = { version: 1, seen: now - 134 * min, items: [
    { id: "h-aaaaaa", kind: "ask", status: "open", title: "Blur the journal entries?", options: ["Blur them", "Leave as is"], does: ["Re-renders the clip", ""],
      recommend: "Blur them", why: "unreleased work", links: ["https://x.test/a", "~/b.html"], images: ["crew-attachments/a.png"], by: "Orca#general", at: now - 112 * min },
    { id: "h-bbbbbb", kind: "ask", status: "open", title: "Pick a palette", by: "Orca#general", at: now - 48 * min },
    { id: "h-cccccc", kind: "login", status: "open", title: "Log in to continue", command: "! npx vercel login", topic: "Herdr Mod#site", by: "Orca#general", at: now - 31 * min },
    { id: "h-dddddd", kind: "link", status: "done", title: "Orca home board", url: "~/.config/herdr-app/data/crew-boards/orca-home/index.html", by: "Herdr Mod#orca-home", at: now - 5 * min },
    { id: "h-eeeeee", kind: "note", status: "done", title: "Trees checked", by: "Orca#general", at: now - 60 * min },
    { id: "h-ffffff", kind: "deploy", status: "open", title: "The site to Vercel", topic: "Herdr Mod#site", by: "Orca#general", at: now - 31 * min },
    { id: "h-111111", kind: "later", status: "parked", title: "Mac support", by: "Orca#general", at: now - 3000 * min, parked_at: now - 3000 * min },
    { id: "h-222222", kind: "ask", status: "answered", title: "Ship it?", answer: "Yes", answered_at: now - 2 * min, closed_at: now - 2 * min, by: "Orca#general", at: now - 90 * min },
  ], release: { next: "0.3.1", note: "held for your OK", queued: [{ id: "r-1", text: "Desk cards", at: now - 60 * min }] },
  recs: { "a-111111": { option: "approve", why: "only adds a section", by: "Herdr Mod#site", at: now } } };
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

  // cx.spawn runs its body at once, as Herdr's does (up to the first await); cx.timer.after later.
  // Herdr refuses FocusHandle.focus() during render or layout ("mutate state from an event handler or
  // task"; DeNon's first live test of the review fell back to the old view). The stub throws the same.
  let rendering = false, focused = 0;
  const handle = { focus() { if (rendering) throw new Error("FocusHandle.focus() cannot run during render or layout"); focused++; } };
  const draw = (view, cx) => { rendering = true; try { return view.render(cx); } finally { rendering = false; } };
  const run = async (f) => { const tasks = []; const cx = { notify() {}, spawn: (g) => tasks.push(g(cx)), timer: { every() {}, after: (_ms, f) => tasks.push(Promise.resolve().then(() => f(cx))) }, focus_handle: () => handle, stop_propagation() {} };
    // A task that never ends (the nextCommand loop) doesn't hold the test: each round waits 50 ms at most.
    f(cx); for (let i = 0; i < 6 && tasks.length; i++) await Promise.race([Promise.all(tasks.splice(0)), new Promise((r) => setTimeout(r, 50))]); return cx; };

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
  await run((cx) => draw(v, cx));
  assert.ok(v.loaded, "it read its files when shown");
  assert.ok(focused > 0, "showing Home gives it the keyboard (from a task, not during render)");
  const needs = v.needs();
  assert.deepEqual(needs.map((n) => n.kind), ["approval", "ask", "ask", "login", "question", "desk"], "every kind, oldest first");
  const since = v.since();
  for (const k of ["install", "link", "note", "answered", "finished", "task", "card"]) assert.ok(since.some((r) => r.kind === k), `Since you last looked has ${k}`);
  assert.ok(!since.some((r) => r.kind === "finished" && r.channel === "old"));
  // Trusted helpers: today's sends, refused tries and switches are in Today; the tab holds the whole record.
  assert.deepEqual(since.filter((r) => r.kind === "helper").map((r) => r.e.kind), ["refused", "sent", "switch"], "newest first, yesterday's left out");
  assert.equal(v.helperLog.length, 4);
  v.openDrawer("name");
  await run((cx) => draw(v, cx));
  for (const id of ["drawer-tab-name", "name-open", "name-0", "name-3"]) assert.ok(clicks.has(id) || id.startsWith("name-"), `In your name: ${id}`);
  assert.ok(clicks.has("drawer-tab-name") && clicks.has("name-open"));
  clicks.get("name-open")();
  assert.deepEqual(fx.overlays.at(-1), { mod: "crew-helpers", kind: "dialog", width: 560 }, "its link opens the Trusted helpers dialog");
  v.openDrawer("today");
  await run((cx) => draw(v, cx));
  v.drawer = null;
  v.lastTab = "today";
  const prog = v.progress();
  assert.deepEqual(prog.rows.map((r) => r.ch), ["site", "desk", "general"], "working topics and a held one, longest first");
  assert.equal(prog.rows[0].held, "draft");
  assert.deepEqual(prog.desk.map((c) => c.id), ["c-orca01"], "what's open on the head pal's desk");
  // Factories (T66): with a second factory, Home is the shown one's. Herdr Mod moves to "Example app".
  const facs = { current: "default", defaultName: "", factories: [{ id: "f-app001", name: "Example app", template: "platform-lanes", foreman: "", foremanTopic: "ops", color: "#E2935A" }],
    pals: { "Herdr Mod": "f-app001" } };
  fx.shared["crew.factories"] = facs;
  await run((cx) => draw(v, cx));
  assert.deepEqual(v.needs().map((n) => n.kind), ["ask", "ask"], "the default factory: the head pal's asks, not the other floor's approval, login, question or card");
  assert.deepEqual(v.progress().rows.map((r) => r.ch), ["general"]);
  assert.deepEqual(v.progress().desk.map((c) => c.id), ["c-orca01"]);
  assert.equal(v.home.release.next, "0.3.1", "the release track is the default factory's");
  assert.ok(v.since().some((r) => r.kind === "install"));
  fx.shared["crew.factories"] = { ...facs, current: "f-app001" };
  await run((cx) => draw(v, cx));
  assert.deepEqual(v.needs().map((n) => n.kind), ["approval", "login", "question", "desk"], "Example app: what its pal waits on");
  assert.deepEqual(v.progress().rows.map((r) => r.ch), ["site", "desk"]);
  assert.deepEqual(v.progress().desk, [], "no foreman yet: nobody's desk");
  assert.equal(v.home.release.next, null);
  assert.ok(!v.since().some((r) => r.kind === "install" || r.kind === "card"), "installs and the head pal's cards are the default factory's news");
  assert.ok(v.since().some((r) => r.kind === "finished" && r.bot === "Herdr Mod"));
  assert.equal(v.who(), "the foreman");
  // A foreman: Home is its desk, and Home's terminal button goes to it.
  fx.shared["crew.factories"] = { ...facs, current: "f-app001", factories: [{ ...facs.factories[0], foreman: "Herdr Mod" }] };
  assert.equal(v.who(), "Herdr Mod");
  assert.equal(crewjs.foremanSpace().id, "s1");
  assert.equal(crewjs.runsHome(fx.spaces[2]), true);
  assert.equal(crewjs.runsHome(fx.spaces[1]), false);
  // Back to one factory: everything as before.
  delete fx.shared["crew.factories"];
  await run((cx) => draw(v, cx));
  assert.deepEqual(v.needs().map((n) => n.kind), ["approval", "ask", "ask", "login", "question", "desk"]);
  assert.equal(crewjs.runsHome(fx.spaces[2]), false);
  await run((cx) => draw(v, cx));
  const last = (pred) => fx.calls.filter((c) => c[0] === "pal" && pred(c)).at(-1);
  // The review: one item at a time, the oldest first (the approval), with its recommendation.
  assert.equal(v.mode, "review");
  for (const id of ["rv-o-0", "rv-o-1", "rv-chat", "rv-back", "rv-skip", "rv-later", "rv-list"]) assert.ok(clicks.has(id), `review: has ${id}`);
  assert.equal(v.current(needs).kind, "approval");
  const sp0 = v.spec(v.current(needs));
  assert.deepEqual(sp0.options.map((o) => o.label), ["Decline", "Approve"], "Decline first, Approve last");
  assert.equal(sp0.rec.option, "Approve");
  const key = async (k) => run((cx) => v.key({ keystroke: k, key: k }, v.needs(), cx));
  fx.calls.length = 0;
  await key("enter");
  assert.ok(last((c) => c[1] === "approve" && c[2] === "a-111111")?.includes("--click"), "Enter takes the recommended: Approve, by click");
  v.busy = {};
  await key("j");
  assert.equal(v.current(v.needs()).key, "h-h-aaaaaa", "J: the next one");
  const sp1 = v.spec(v.current(v.needs()));
  assert.deepEqual(sp1.options.map((o) => o.label), ["Blur them", "Leave as is", "Park"]);
  assert.equal(sp1.options[0].does, "Re-renders the clip");
  assert.deepEqual(sp1.links, ["https://x.test/a", "~/b.html"]);
  await run((cx) => draw(v, cx));
  assert.ok(clicks.has("rv-l-0") && clicks.has("rv-i-0"), "links and images are clickable");
  fx.calls.length = 0;
  await key("2");
  assert.deepEqual(last((c) => c[1] === "home" && c[2] === "answer").slice(0, 5), ["pal", "home", "answer", "h-aaaaaa", "Leave as is"], "2 picks the second option");
  v.busy = {};
  await key("l");
  assert.deepEqual(last((c) => c[1] === "home" && c[2] === "park").slice(0, 4), ["pal", "home", "park", "h-aaaaaa"], "L parks it");
  v.busy = {};
  await key("k");
  assert.equal(v.current(v.needs()).kind, "approval", "K: back");
  // Chat: the asking topic's live terminal in a window; Muse when that topic is asleep.
  fx.overlays = [];
  await key("j");
  await key("c");
  const win = fx.overlays.at(-1);
  assert.equal(win.kind, "window");
  assert.equal(win.layout.children[1].content.terminal, "tg", "chat opens Orca #general's terminal");
  assert.equal(win.layout.children[0].content.mod, "crew-home-chat");
  v.chat({ topic: "Ghost#x", who: "Ghost#x", title: "x" });
  assert.equal(fx.overlays.at(-1).layout.children[1].content.terminal, "tm", "an asleep asker: the idea partner");
  assert.equal(fx.overlays.at(-1).layout.children[0].content.props.muse, true);
  // T: the head pal's terminal, with the keyboard (DeNon: a fast, obvious way to Orca's terminal).
  assert.ok(clicks.has("rv-term"), "the review's top bar has the terminal");
  fx.calls.length = 0;
  await key("t");
  const runs = fx.calls.filter((c) => c[0] === "run").map((c) => `${c[1]} ${c[2]}`);
  assert.ok(runs.some((r) => r.startsWith("layout.select") && r.includes("tab-view")), "T leaves Home");
  assert.ok(runs.some((r) => r.startsWith("space.select") && r.includes("s0")), "T shows the head pal");
  assert.ok(runs.some((r) => r.startsWith("pane.focus") && r.includes('"terminal":"tg"')), "T puts the keyboard in its terminal");
  // Esc: first the chat window it opened (Home keeps its id; Herdr's overlay.close can't reach a
  // window), then the list.
  const closedBefore = fx.closed;
  await key("escape");
  assert.equal(fx.closed, closedBefore + 1, "Esc closes the chat window first");
  assert.equal(v.mode, "review");
  await key("escape");
  assert.equal(v.mode, "list");
  clicks.clear();
  await run((cx) => draw(v, cx));
  assert.ok(clicks.has("review-all"), "the list offers the review again");
  assert.ok(clicks.has("open-terminal"), "the list's header has Talk to Orca");
  fx.calls.length = 0;
  clicks.get("open-terminal")(null, { notify() {} });
  assert.ok(fx.calls.some((c) => c[1] === "pane.focus" && c[2].includes('"terminal":"tg"')), "Talk to Orca opens its terminal, focused");
  for (const id of ["ap-a-111111-ok", "ap-a-111111-no", "h-h-aaaaaa-o0", "h-h-aaaaaa-o1", "h-h-aaaaaa-park", "h-h-bbbbbb-go", "h-h-cccccc-copy", "h-h-cccccc-go",
    "q-tb2-go", "c-c-owner1-done", "c-c-owner1-desk", "what-happened"])
    assert.ok(clicks.has(id), `has a ${id} button`);
  // Inbox zero: the page is the list; the rest is in the drawer, closed until asked for.
  assert.equal(v.drawer, null, "the drawer starts closed");
  clicks.clear();
  await run((cx) => draw(v, cx));
  assert.ok(!clicks.has("mark-seen") && !clicks.has("drawer-x"), "no drawer controls while it's closed");
  clicks.get("what-happened")(null, { notify() {} });
  assert.equal(v.drawer, "today", "What happened today opens the drawer on Today");
  const tabIds = { today: ["mark-seen", "drawer-x", "drawer-tab-working"], working: ["prog-w-t1"], releases: ["rel-h-ffffff"], parked: ["park-up-h-111111", "park-drop-h-111111"] };
  for (const [tab, ids] of Object.entries(tabIds)) {
    v.openDrawer(tab); clicks.clear();
    await run((cx) => draw(v, cx));
    for (const id of ids) assert.ok(clicks.has(id), `${tab}: has ${id}`);
  }
  clicks.get("drawer-x")(null, { notify() {} });
  assert.equal(v.drawer, null, "× closes it");
  clicks.clear();
  await run((cx) => draw(v, cx));
  clicks.get("what-happened")(null, { notify() {} });
  assert.equal(v.drawer, "parked", "it opens on the tab you used last");
  // Leaving Home closes it.
  fx.layout.children[0].active = "tab-view";
  await run((cx) => draw(v, cx));
  assert.equal(v.drawer, null, "leaving Home closes the drawer");
  fx.layout.children[0].active = "home-view";
  await run((cx) => draw(v, cx));

  // Actions: the owner's are clicks (pal … --click), the rest plain.
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
  assert.ok(fx.calls.some((c) => c[1] === "pane.focus"), "Ctrl+Shift+H from Home: the terminal, focused");
  // Home, the terminal, Home again: a hidden view doesn't render, so the second showing must still
  // take the keyboard and restart the review (live test: keys stopped working after a trip away).
  {
    const x = new Home();
    fx.layout.children[0].active = "home-view";
    await run((cx) => x.init({}, cx));
    crewjs.showHome();
    await run((cx) => draw(x, cx));
    const f1 = focused;
    x.mode = "list";
    fx.layout.children[0].active = "tab-view";   // to the terminal; Home isn't rendered while hidden
    await new Promise((r) => setTimeout(r, 5));
    crewjs.showHome();
    fx.layout.children[0].active = "home-view";
    await run((cx) => draw(x, cx));
    assert.ok(focused > f1, "shown again: Home takes the keyboard again");
    assert.equal(x.mode, "review", "shown again: the review starts over");
  }
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
  await run((cx) => draw(w, cx));
  await run((cx) => draw(w, cx));
  assert.equal(w.needs().length, 0);
  assert.ok(clicks.has("message-head"), "All caught up has Message Orca");
  fx.calls.length = 0;
  clicks.get("message-head")(null, { notify() {} });
  assert.ok(fx.calls.some((c) => c[1] === "pane.focus" && c[2].includes('"terminal":"tg"')), "Message Orca: its terminal, focused");
  assert.equal(w.progress().rows.length, 0);
  // Hidden: it reads nothing.
  fx.layout.children[0].active = "tab-view";
  fx.calls.length = 0;
  const h = new Home();
  await run((cx) => h.init({}, cx));
  await run((cx) => draw(h, cx));
  assert.ok(!fx.calls.some((c) => c[0] === "tail"), "hidden, it reads nothing");

  // ── The welcome tour (T76): a first install, nobody hired, two brains and two project folders ──
  {
    const click = async (id) => run((cx) => clicks.get(id)(null, cx));
    const hires = () => fx.calls.filter((c) => c[0] === "pal" && c[1] === "hire");
    const mark = () => fx.shared["crew.settings"].welcome;
    fx.layout.children[0].active = "home-view";
    fx.shared["crew.settings"] = { owner: "Sam", welcome: { state: "new", beat: 0 } };
    fx.shared.crew = { bots: [] };
    fx.spaces = [];
    fx.known = [{ key: "codex", name: "Codex", installed: true }, { key: "claude", name: "Claude Code", installed: true }, { key: "grok", name: "Grok", installed: false }];
    fx.folders = [{ path: "/h/Projects/weather-app", show: "~/Projects/weather-app", name: "Weather App", at: now - 120 * min },
      { path: "/h/code/docs-site", show: "~/code/docs-site", name: "Docs Site", at: now - 3000 * min }];
    fx.calls.length = 0; fx.toasts.length = 0; clicks.clear();
    assert.ok(crewjs.welcomePending());
    const t = new Home();
    await run((cx) => t.init({}, cx));
    await run((cx) => draw(t, cx));
    await run((cx) => draw(t, cx));
    assert.ok(clicks.has("wel-go") && clicks.has("wel-skip"), "screen 1 has its button and Skip the tour");
    assert.ok(!clicks.has("message-head") && !clicks.has("rv-o-0"), "the tour has the whole page");
    assert.equal(hires().length, 0, "nothing is hired before a click");
    assert.equal(t.wel.headBrain.key, "claude", "the head pal's brain: Claude Code first");
    assert.ok(fx.calls.some((c) => c[0] === "pal" && c[1] === "welcome" && c[2] === "folders"), "it looked for project folders");
    // The first click hires the head pal, once, and moves on.
    const f0 = focused;
    await click("wel-go");
    assert.deepEqual(hires().at(-1).slice(0, 5), ["pal", "hire", "--god", "--harness", "claude"]);
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(focused > f0, "after the hire, Home takes the keyboard back from the new terminal");
    assert.equal(mark().beat, 1);
    const key = async (k) => run((cx) => t.key({ keystroke: k, key: k }, [], cx));
    await key("enter");
    assert.equal(mark().beat, 2, "Enter is the main button");
    await key("left");
    assert.equal(mark().beat, 1, "← goes back");
    await key("enter");
    assert.equal(hires().length, 1, "the head pal is hired once");
    // Screen 3: the folders, the brains found, and Hire.
    clicks.clear();
    await run((cx) => draw(t, cx));
    for (const id of ["wel-f-0", "wel-f-1", "wel-f-other", "wel-b-claude", "wel-b-codex", "wel-alt", "wel-back"]) assert.ok(clicks.has(id), `screen 3 has ${id}`);
    assert.ok(!clicks.has("wel-b-grok"), "a brain that isn't installed isn't offered");
    await key("down");
    assert.equal(t.wel.pick, 1);
    await click("wel-f-0");
    await click("wel-b-codex");
    await click("wel-go");
    assert.deepEqual(hires().at(-1), ["pal", "hire", "Weather App", "--harness", "codex", "--folder", "/h/Projects/weather-app"]);
    assert.equal(mark().beat, 2, "it stays on the screen: the pal is hired, and says so");
    assert.equal(mark().pal, "Weather App", "the hire is remembered, so a restart doesn't offer it again");
    assert.ok(!fx.calls.some((c) => c[0] === "run" && c[1] === "space.select"), "your view stays on the tour");
    // The pal's space shows up: hired, and the button carries on.
    fx.spaces = [{ id: "sw", name: "Weather App", tabs: [{ id: "tw", name: "general" }] }];
    fx.shared.crew = { bots: [{ id: "bh", name: "Orchestrator", god: true }, { id: "bw", name: "Weather App", space: "sw", harness: "codex" }] };
    clicks.clear();
    await run((cx) => draw(t, cx));
    assert.equal(t.wel.hired, "Weather App");
    assert.ok(!clicks.has("wel-f-0"), "hired: the folder list is gone");
    await click("wel-go");
    assert.equal(hires().length, 2, "the button carries on; it doesn't hire twice");
    assert.equal(mark().beat, 3);
    for (const want of [4, 5, 6]) { await key("enter"); assert.equal(mark().beat, want); }
    // Done: the mark is set, and "Go to Weather App" shows it.
    clicks.clear();
    await run((cx) => draw(t, cx));
    assert.ok(clicks.has("wel-go") && clicks.has("wel-alt") && !clicks.has("wel-skip"), "the last screen: go to the pal, or stay");
    fx.calls.length = 0;
    await click("wel-go");
    assert.equal(mark().state, "done");
    assert.ok(!crewjs.welcomePending());
    assert.ok(fx.calls.some((c) => c[0] === "run" && c[1] === "space.select" && c[2].includes("sw")), "Go to Weather App");
    clicks.clear();
    await run((cx) => draw(t, cx));
    assert.ok(!clicks.has("wel-go"), "after the tour, Home is Home");

    // Skip: the head pal is still hired, nothing else, and it says where the tour lives.
    fx.shared["crew.settings"] = { owner: "Sam", welcome: { state: "new", beat: 0 } };
    fx.shared.crew = { bots: [] }; fx.spaces = []; fx.calls.length = 0; fx.toasts.length = 0; clicks.clear();
    const k = new Home();
    await run((cx) => k.init({}, cx));
    await run((cx) => draw(k, cx));
    await run((cx) => draw(k, cx));
    await click("wel-skip");
    assert.equal(mark().state, "skipped");
    assert.deepEqual(hires().map((c) => c.slice(1, 3)), [["hire", "--god"]], "Skip leaves you with a head pal and nobody else");
    assert.match(fx.toasts.at(-1).body, /gear menu: Welcome tour/);

    // No brain installed: nobody is hired, and screen 3 asks for one and can check again.
    fx.shared["crew.settings"] = { owner: "Sam", welcome: { state: "new", beat: 0 } };
    fx.known = []; fx.calls.length = 0; clicks.clear();
    const nb = new Home();
    await run((cx) => nb.init({}, cx));
    await run((cx) => draw(nb, cx));
    await run((cx) => draw(nb, cx));
    await click("wel-go");
    assert.equal(hires().length, 0, "no brain: the head pal waits");
    fx.shared["crew.settings"] = { ...fx.shared["crew.settings"], welcome: { state: "new", beat: 2 } };
    clicks.clear();
    await run((cx) => draw(nb, cx));
    assert.ok(!clicks.has("wel-f-other"), "no brain: no folder list");
    fx.known = [{ key: "claude", name: "Claude Code", installed: true }];
    await click("wel-go");
    assert.equal(mark().beat, 2, "Check again stays on the screen");
    assert.equal(nb.wel.headBrain?.key, "claude", "Check again found the brain");

    // An install from before the tour (no mark) never shows it; the gear menu replays it.
    fx.shared["crew.settings"] = { owner: "Sam" };
    assert.ok(!crewjs.welcomePending());
    assert.ok(crewjs.appMenuItems().some((x) => x.id === "welcome" && x.label === "Welcome tour"));
    fx.calls.length = 0;
    crewjs.replayWelcome();
    assert.equal(mark().state, "open");
    assert.equal(mark().replay, true);
    assert.ok(fx.calls.some((c) => c[1] === "layout.select" && c[2].includes("home-view")), "the replay opens Home");
    // A replay with pals: "You have 1 pal. Hire another?", and the head pal isn't hired again.
    fx.spaces = [{ id: "s0", name: "Orchestrator", tabs: [] }, { id: "sw", name: "Weather App", tabs: [] }];
    fx.shared.crew = { bots: [{ id: "bh", name: "Orchestrator", space: "s0", god: true }, { id: "bw", name: "Weather App", space: "sw" }] };
    fx.calls.length = 0; clicks.clear();
    const rp = new Home();
    await run((cx) => rp.init({}, cx));
    await run((cx) => draw(rp, cx));
    await run((cx) => draw(rp, cx));
    await click("wel-go");
    assert.equal(hires().length, 0, "a replay doesn't hire a second head pal");
    fx.shared["crew.settings"] = { owner: "Sam" };
  }
  Date.now = realNow;
  console.log("home view: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
