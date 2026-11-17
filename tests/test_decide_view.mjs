// Your call (crew-decide, T235), run headless: the owner's decisions one at a time over the terminal.
// Every kind renders and runs the right pal command with a click token; keys pick (1-9, Enter takes the
// recommendation, nothing without one), L skips, Esc closes, T opens the asker's terminal; focus is
// taken after render, never during it; and the owner-only rule: nextCommand can open or focus the
// dialog but never decides anything. Also the header's pill and Ctrl+Shift+A, the welcome tour's
// dialog, and that nothing in the app still points at Home or the sidebar Inbox.
// Run: node tests/test_decide_view.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, cpSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { HELPERS_ATTENTION, TAPS_FILE } from "../lib/helperlog.js";

const root = new URL("..", import.meta.url).pathname;
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "decideview-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    export const clicks = new Map(), mouse = new Map(), texts = [];
    const el = () => {
      const p = new Proxy(function () {}, {
        get: (t, k) => {
          if (k === "then") return undefined;
          if (k === "when") return (c, f) => (c ? f(p) : p);
          if (k === "map") return (f) => f(p);
          if (k === "id") return (id) => { p.__id = id; return p; };
          if (k === "child") return (c) => { if (typeof c === "string") texts.push(c); return p; };
          if (k === "on_click") return (f) => { if (p.__id) clicks.set(p.__id, f); return p; };
          if (k === "on_mouse_down") return (_b, f) => { if (p.__id) mouse.set(p.__id, f); return p; };
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
    class St { constructor(o) { this.v = o?.value ?? ""; this.h = {}; } on(e, f) { this.h[e] = f; return true; } value() { return this.v; } set_value(v) { this.v = v; } focus() {} set_auto_grow() {} }
    export const TextareaState = { new: (o) => new St(o) }, InputState = { new: (o) => new St(o) };
    export const Textarea = { new: () => div() }, Input = { new: () => div() };`);
  mod("herdr", `
    export const fx = { calls: [], toasts: [], closed: [], cmds: [], shared: { "crew.settings": { owner: "DeNon", head: "Orca" } }, layout: null, desk: null, spaces: [] };
    export const spaces = () => fx.spaces, agents = () => fx.agents ?? [], panes = () => fx.panes ?? [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fx.calls.push([cmd.split("/").pop(), ...args]);
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "ls") return { stdout: JSON.stringify(fx.desk), stderr: "", code: 0 };
      if (cmd.endsWith("/pal") && args[0] === "proposal" && args[1] === "show") return { stdout: JSON.stringify({ text: "the skill's text", text_sha: "abc123" }), stderr: "", code: 0 };
      if (cmd === "sh") return { stdout: String(args.at(-1)).endsWith("crew-approvals") ? fx.approvals ?? "" : String(args.at(-1)).endsWith("crew-proposals") ? fx.proposals ?? "" : "", stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    export const focused = () => null, theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => fx.layout, keys = () => fx.keys ?? [], settings = () => ({});
    export const run = (c, a) => fx.calls.push(["run", c, JSON.stringify(a)]), notify = (n) => fx.toasts.push(n), openOverlay = (o) => { (fx.overlays ??= []).push(o); return "ov1"; };
    // Commands arrive as they're queued (herdr-app do crew-decide.<x>, keys.json), one per await.
    export const nextCommand = () => fx.cmds.length ? Promise.resolve(fx.cmds.shift()) : new Promise(() => {});
    export const closeOverlay = (id) => { fx.closed.push(id); };
    export const hc = exec, readTextFile = async (p) => (fx.files ?? {})[p.replace("/h/.config/herdr-app/", "")] ?? null, writeTextFile = async () => {}, knownAgents = async () => fx.known ?? [], props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {});
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  cpSync(join(root, "mods", "crew-decide", "main.js"), join(dir, "crew-decide.mjs"));
  cpSync(join(root, "mods", "crew-header", "main.js"), join(dir, "crew-header.mjs"));
  cpSync(join(root, "mods", "crew-welcome", "main.js"), join(dir, "crew-welcome.mjs"));
  for (const f of ["welcome.js", "welcome-text.js"]) copyFileSync(join(root, "mods", "crew-welcome", f), join(dir, f));
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks, mouse, texts } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
  const crewjs = await import(pathToFileURL(join(dir, "crew.js")).href);

  const NOON = new Date(); NOON.setHours(12, 0, 0, 0);
  Date.now = () => NOON.getTime();
  const now = Date.now(), min = 60000;
  const iso = (m) => new Date(now - m * min).toISOString().replace(/\.\d+Z$/, "Z");
  fx.shared.crew = { bots: [{ id: "b0", name: "Orca", space: "s0", god: true, awake: true }, { id: "b1", name: "Herdr Mod", space: "s1", awake: true },
    { id: "bm", name: "MUSE", space: "sm", awake: true, partner: true }] };
  fx.spaces = [
    { id: "s0", name: "Orca", tabs: [{ id: "tg", name: "general", status: "working", changed_at: now - 3 * min }] },
    { id: "sm", name: "MUSE", tabs: [{ id: "tm", name: "ideas", status: "idle", changed_at: now - 60 * min }] },
    { id: "s1", name: "Herdr Mod", active: true, tabs: [{ id: "tb1", name: "desk", status: "working", changed_at: now - 16 * min },
      { id: "tb2", name: "landing", status: "blocked", changed_at: now - 12 * min }, { id: "tb3", name: "site", status: "idle", changed_at: now - 50 * min }] },
  ];
  fx.agents = [
    { address: "t1", space: "s1", tab: "tb1", status: "working", title: "Reporting", seq: 3 },
    { address: "tg", space: "s0", tab: "tg", status: "working", title: "Relaying", seq: 2 },
    { address: "t2", space: "s1", tab: "tb2", status: "blocked", title: "", seq: 1 },
  ];
  fx.panes = [{ tab: "tg", terminal: "tg", program: { agent: true } }, { tab: "tb1", terminal: "t1", program: { agent: true } }, { tab: "tb2", terminal: "t2", program: { agent: true } }, { tab: "tb3", terminal: "t3", program: {} }];
  fx.layout = { id: "root", children: [{ id: "center", type: "stack", active: "tab-view", children: [{ id: "tab-view" }] }] };
  fx.shared["crew.needs"] = { count: 3, approvals: 1, items: [{ why: "question", tab: "tb2", label: "Herdr Mod #landing" }, { why: "approval", id: "a-111111", label: "deploy · Herdr Mod #site" }, { why: "card", card: "c-owner1", label: "Which hotkey?" }] };
  fx.approvals = JSON.stringify({ id: "a-111111", status: "pending", at: now - 129 * min, bot: "Herdr Mod", channel: "site", rule: "deploy", why: "deploys a site", command: "vercel deploy --prod" });
  const auth = { bot: "Herdr Mod", channel: "site", commands: [{ command: "git push origin main", guard_context: { cwd: "/h/p" }, land_tip: "abc1234" }] };
  const home = { version: 1, seen: 0, items: [
    { id: "h-aaaaaa", kind: "ask", status: "open", title: "Blur the journal entries?", options: ["Blur them", "Leave as is"], does: ["Re-renders the clip", ""],
      recommend: "Blur them", why: "unreleased work", links: ["https://x.test/a"], images: ["crew-attachments/a.png"], by: "Orca#general", at: now - 112 * min },
    { id: "h-bbbbbb", kind: "ask", status: "open", title: "Pick a palette", options: ["Ink", "Moss"], by: "Orca#general", at: now - 48 * min },
    { id: "h-cccccc", kind: "login", status: "open", title: "Log in to continue", command: "! npx vercel login", topic: "Herdr Mod#site", by: "Orca#general", at: now - 31 * min },
    { id: "h-pppppp", kind: "ask", status: "open", title: "Push it?", options: ["Push"], authorization: auth, by: "Herdr Mod#site", at: now - 20 * min },
    { id: "h-dddddd", kind: "link", status: "done", title: "A board", url: "~/x.html", by: "Orca#general", at: now - 5 * min },
    { id: "h-222222", kind: "ask", status: "answered", title: "Ship it?", answer: "Yes", by: "Orca#general", at: now - 90 * min },
    { id: "h-333333", kind: "ask", status: "parked", title: "Mac support?", options: ["Yes"], by: "Orca#general", at: now - 3000 * min, parked_at: now - 100 * min },
  ], release: { next: null, note: null, queued: [] }, recs: { "a-111111": { option: "approve", why: "only a preview", by: "Herdr Mod#site", at: now } } };
  fx.files = {
    "data/crew-home/home.json": JSON.stringify(home),
    "data/crew-daemon.json": JSON.stringify({ at: now / 1000 }),
    [HELPERS_ATTENTION]: JSON.stringify({ Pals: { reason: "carried-over", fix: "on", since: now - 1 * min, unverified: 3, text: "Pals is off. Turned off, not by you." } }),
  };
  fx.desk = { counts: {}, cards: [
    { id: "c-owner1", kind: "ask", status: "needs you", from: "Herdr Mod#orca-home", from_kind: "pal", to: "DeNon", title: "Which hotkey?", created: iso(5), tray: "_owner" },
    { id: "c-draft1", kind: "tell", status: "draft", from: "MUSE#ideas", from_kind: "pal", to: "Herdr Mod#site", title: "Try a darker footer", body: "It reads better.", attachments: ["crew-attachments/footer.png"], created: iso(4), tray: "_drafts" },
    { id: "c-broken", unreadable: "line 3: bad JSON", to: "_owner", title: "20261116-c-broken.md" },
    { id: "c-orca01", kind: "tell", status: "seen", from: "Herdr Mod#desk", from_kind: "pal", to: "Orca#general", title: "Stage 2 is in", created: iso(20), tray: "orca" },
  ] };

  // Herdr refuses focus() during render: the stub throws the same, so focus must come from a task.
  let rendering = false, focused = 0;
  const handle = { focus() { if (rendering) throw new Error("FocusHandle.focus() cannot run during render or layout"); focused++; } };
  const draw = (view, cx) => { rendering = true; try { return view.render(cx); } finally { rendering = false; } };
  const run = async (f) => { const tasks = []; const cx = { notify() {}, spawn: (g) => tasks.push(g(cx)), timer: { every() {}, after: (_ms, f) => tasks.push(Promise.resolve().then(() => f(cx))) }, focus_handle: () => handle, stop_propagation() {} };
    f(cx); for (let i = 0; i < 8 && tasks.length; i++) await Promise.race([Promise.all(tasks.splice(0)), new Promise((r) => setTimeout(r, 50))]); return cx; };
  const owned = () => fx.calls.filter((c) => c[0] === "pal" && c.includes("--click"));
  const press = (v, k) => run((cx) => v.key({ keystroke: k }, v.list(), cx));

  // ── The queue: every kind, oldest first ──
  const Decide = (await import(pathToFileURL(join(dir, "crew-decide.mjs")).href)).default;
  fx.props = { overlay: "ov-decide" };
  const v = new Decide();
  await run((cx) => v.init({}, cx));
  await run((cx) => draw(v, cx));
  assert.ok(v.loaded, "it read its files when opened");
  assert.ok(focused > 0, "opening it gives it the keyboard (after render, not during)");
  const list = v.list();
  assert.deepEqual(list.map((n) => n.kind), ["unreadable", "approval", "ask", "ask", "login", "ask", "question", "desk", "draft", "helper"], "every kind, oldest first");
  // A card for you that can't be read is shown, with no card actions (Codex T235 P2).
  const bad = v.spec(list[0]);
  assert.match(bad.body, /bad JSON/);
  assert.deepEqual(bad.options.map((o) => o.label), ["Open Orca's terminal"]);
  v.atKey = list[1].key;
  assert.ok(!list.some((n) => n.x?.status === "answered" || n.x?.kind === "link"), "only open asks and logins");
  assert.equal(crewjs.ownerCount(fx.shared["crew.needs"], home.items, fx.desk.cards), 3 + 4 + 1 + 1, "the pill: crew.needs, open asks and logins, drafts, unreadable owner cards");
  assert.ok(texts.includes("Your call") && texts.includes("1 of 10"), "the title and where you are");
  // Attachments show before you act: an ask's images, a draft's files (Codex T235 P1).
  assert.deepEqual(v.spec(list.find((n) => n.key === "h-h-aaaaaa")).files, ["crew-attachments/a.png"]);
  assert.deepEqual(v.spec(list.find((n) => n.kind === "draft")).files, ["crew-attachments/footer.png"]);
  // Everyone's, whichever factory shows: the pill and the list agree (Codex T235 P2).
  fx.shared["crew.factories"] = { factories: [{ id: "f2", name: "Other", foreman: "Nobody" }], current: "f2" };
  assert.equal(v.list().length, list.length, "a factory switch hides nothing");
  delete fx.shared["crew.factories"];

  // An approval: Decline 1, Approve 2; Enter takes the asker's pick (approve), with a click token.
  fx.calls.length = 0;
  await press(v, "enter");
  assert.deepEqual(owned().at(-1).slice(1, 4), ["approve", "a-111111", "--inbox"], "Enter: the recommended option");
  v.busy = {};
  await press(v, "1");
  assert.deepEqual(owned().at(-1).slice(1, 4), ["deny", "a-111111", "--inbox"], "1: the first option");
  v.busy = {};

  // L: the next one. An ask: its options by number; Enter takes the recommendation.
  await press(v, "l");
  assert.equal(v.current(v.list()).key, "h-h-aaaaaa");
  fx.calls.length = 0;
  await press(v, "2");
  assert.deepEqual(owned().at(-1).slice(1, 5), ["home", "answer", "h-aaaaaa", "Leave as is"]);
  v.busy = {};
  await press(v, "enter");
  assert.deepEqual(owned().at(-1).slice(1, 5), ["home", "answer", "h-aaaaaa", "Blur them"]);
  v.busy = {};
  const spA = v.spec(v.current(v.list()));
  assert.deepEqual(spA.options.map((o) => o.label), ["Blur them", "Leave as is", "Park"]);
  // No recommendation: Enter does nothing.
  await press(v, "l");
  fx.calls.length = 0;
  await press(v, "enter");
  assert.equal(owned().length, 0, "no recommendation: Enter decides nothing");
  await press(v, "9");
  assert.equal(owned().length, 0, "a number with no option does nothing");
  // A program owner step: the answer carries the question as shown (--approval-snapshot).
  const step = v.list().find((n) => n.key === "h-h-pppppp");
  v.atKey = step.key;
  fx.calls.length = 0;
  await press(v, "1");
  const ans = owned().at(-1);
  assert.deepEqual(ans.slice(1, 5), ["home", "answer", "h-pppppp", "Push"]);
  const snap = JSON.parse(ans[ans.indexOf("--approval-snapshot") + 1]);
  assert.deepEqual(snap.authorization, auth, "bound to the displayed question");
  assert.match(v.spec(step).options[0].does, /git push origin main/);
  v.busy = {};

  // A login: Open its topic (its terminal, the dialog closes), Copy, Park.
  const login = v.list().find((n) => n.kind === "login");
  const spL = v.spec(login);
  assert.deepEqual(spL.options.map((o) => o.label), ["Open #site", "Copy", "Park"]);
  fx.calls.length = 0; fx.closed.length = 0;
  spL.options[0].run();
  assert.deepEqual(fx.closed, ["ov-decide"], "it closes so you can type");
  assert.ok(fx.calls.some((c) => c[0] === "run" && c[1] === "pane.focus"), "the topic's terminal has the keyboard");

  // A Desk card: Done. A draft: Send (as yours), Edit (the quick-drop), Discard.
  const desk = v.list().find((n) => n.kind === "desk");
  fx.calls.length = 0;
  await run((cx) => v.spec(desk).options[0].run(cx));
  assert.deepEqual(owned().at(-1).slice(1, 4), ["desk", "done", "c-owner1"]);
  v.busy = {};
  const draft = v.list().find((n) => n.kind === "draft");
  const spD = v.spec(draft);
  assert.deepEqual(spD.options.map((o) => o.label), ["Send", "Edit…", "Discard"]);
  await run((cx) => spD.options[0].run(cx));
  assert.deepEqual(owned().at(-1).slice(1, 6), ["desk", "send-draft", "c-draft1", "--to", "Herdr Mod#site"]);
  v.busy = {};
  spD.options[1].run();
  assert.equal(fx.overlays.at(-1).mod, "crew-desk-drop");
  await run((cx) => spD.options[2].run(cx));
  assert.deepEqual(owned().at(-1).slice(1, 4), ["desk", "discard", "c-draft1"]);
  v.busy = {};

  // A helper that's off without your click: the fix is the recommendation.
  const hs = v.spec(v.list().find((n) => n.kind === "helper"));
  assert.deepEqual(hs.options.map((o) => o.label), ["Turn Pals on", "Trusted helpers", "Leave it off"]);
  await run((cx) => hs.options[0].run(cx));
  assert.deepEqual(owned().at(-1).slice(1, 5), ["settings", "trust-helper", "Pals", "on"]);
  v.busy = {};

  // A held tap comes first, with Stop / Let it go now. A Dream proposal: Approve only once its text is
  // shown, bound to that text's digest. A stuck topic and a topic asking you: open its terminal.
  fx.files[TAPS_FILE] = JSON.stringify([{ id: "t-abc123", helper: "Pals", kind: "approval", item: "a-222222", cls: "outward", choice: "Approve", relayed: "yes", title: "Herdr Mod #site: git push",
    by: "Herdr Mod #site", at: now - 2 * min, run_at: now + 3 * min, status: "holding" }]);
  const ops = { approvals: [], proposals: [{ id: "p-dream1", kind: "dream", by: "Orca#general", pal: "Orca", at: now - 7 * min, meta: { kind: "skill", name: "sandbox-keys", pattern: "P-1", summary: "keys", count: 3, pals: ["a", "b"], minutes: 30, quotes: ["it hung"] } },
    { id: "p-agents", kind: "agents", by: "Herdr Mod#site", pal: "Herdr Mod", file: "AGENTS.md", at: now - 6 * min }],
    stalled: { t1: { bot: "Herdr Mod", channel: "desk", since: now - 40 * min } }, taps: JSON.parse(fx.files[TAPS_FILE]) };
  const q = crewjs.ownerQueue({ ops, items: [], cards: [], needs: null, all: fx.spaces, live: fx.agents, onFloor: () => true });
  assert.deepEqual(q.map((n) => n.kind), ["tap", "stuck", "dream", "proposal"]);
  const dream = q.find((n) => n.kind === "dream");
  assert.deepEqual(v.spec(dream).options.map((o) => o.label), ["Show the whole proposal", "Decline"], "no Approve before the text is shown");
  fx.calls.length = 0;
  await run((cx) => v.spec(dream).options[0].run(cx));
  assert.equal(owned().length, 0, "showing it isn't a decision");
  const spDr = v.spec(dream);
  assert.equal(spDr.mono, "the skill's text");
  assert.deepEqual(spDr.options.map((o) => o.label), ["Approve", "Decline"]);
  await run((cx) => spDr.options[0].run(cx));
  assert.deepEqual(owned().at(-1).slice(1, 6), ["proposal", "accept", "p-dream1", "--text-sha", "abc123"]);
  v.busy = {};
  const tap = v.spec(q[0]);
  assert.deepEqual(tap.options.map((o) => o.label), ["Stop", "Let it go now"]);
  await run((cx) => tap.options[0].run(cx));
  assert.deepEqual(owned().at(-1).slice(1, 4), ["taps", "stop", "t-abc123"]);
  v.busy = {};
  delete fx.files[TAPS_FILE];

  // Parked: Unpark and Drop, your click (Codex T235 P2: Home's Parked tab was the only way back).
  assert.deepEqual(v.parked().map((x) => x.id), ["h-333333"]);
  texts.length = 0; clicks.clear();
  await run((cx) => draw(v, cx));
  await run((cx) => clicks.get("decide-parked")(null, cx));
  assert.equal(v.mode, "parked");
  await run((cx) => draw(v, cx));
  assert.ok(texts.includes("Mac support?") && clicks.has("decide-unpark-h-333333") && clicks.has("decide-drop-h-333333"));
  fx.calls.length = 0;
  await run((cx) => clicks.get("decide-unpark-h-333333")(null, cx));
  assert.deepEqual(owned().at(-1).slice(1, 4), ["home", "unpark", "h-333333"]);
  v.busy = {};
  await run((cx) => clicks.get("decide-drop-h-333333")(null, cx));
  assert.deepEqual(owned().at(-1).slice(1, 4), ["home", "drop", "h-333333"]);
  v.busy = {};
  fx.calls.length = 0;
  await press(v, "1");
  assert.equal(owned().length, 0, "in Parked, number keys decide nothing");
  await press(v, "escape");
  assert.equal(v.mode, null, "Esc: back to the queue");
  // Nothing is cut off: the question, the options and all they do are in one scroll area.
  const dsrc = readFileSync(join(root, "mods/crew-decide/main.js"), "utf8");
  assert.ok(!/id\("decide-title"\)[^\n]*(\.h\(|overflow_hidden|truncate)/.test(dsrc), "the title isn't clipped");
  assert.ok(dsrc.includes('body.child(opts)') && dsrc.includes("scrollArea(d, `decide-ctx-${n.key}`, body"), "options scroll with the question");

  // T: the asker's terminal; Esc closes; × closes.
  v.atKey = "q-tb2";
  fx.calls.length = 0; fx.closed.length = 0;
  await press(v, "t");
  assert.deepEqual(fx.closed, ["ov-decide"]);
  assert.ok(fx.calls.some((c) => c[0] === "run" && c[1] === "pane.focus" && c[2].includes("t2")), "T: the asking topic's terminal");
  fx.closed.length = 0;
  await press(v, "escape");
  assert.deepEqual(fx.closed, ["ov-decide"], "Esc closes it");

  // ── The owner-only rule: a command never decides ──
  // `herdr-app do crew-decide.<x>` (a pal or a helper) arrives as nextCommand. Only "focus" does
  // anything; none of these write a click token or run a pal command.
  fx.calls.length = 0;
  fx.cmds.push("approve", "answer", "1", "enter", "Blur them", "decide", "approve a-111111", "focus");
  const before = focused;
  const v2 = new Decide();
  await run((cx) => v2.init({}, cx));
  await run((cx) => draw(v2, cx));
  assert.equal(fx.calls.filter((c) => c[0] === "pal" && c[1] !== "desk").length, 0, "no pal command ran from a command");
  assert.equal(owned().length, 0, "no click token was used");
  assert.ok(!fx.calls.some((c) => c[0] === "mkdir" && String(c[2] ?? c[1]).includes("crew-clicks")), "no click token was even made");
  assert.ok(focused > before, "focus: the keyboard");
  const src = readFileSync(join(root, "mods/crew-decide/main.js"), "utf8");
  const loop = src.match(/nextCommand\(\);([^\n]*)/)[1];
  assert.ok(/c === "focus"/.test(loop) && !/act|run\(|ownerCli/.test(loop), "its nextCommand loop only focuses");
  assert.equal((src.match(/ownerCli\(/g) ?? []).length, 1, "one owner path, act(), reached from clicks and keys only");

  // Nothing waiting: a calm empty state with the head pal's terminal.
  fx.files["data/crew-home/home.json"] = JSON.stringify({ items: [] });
  const savedDesk = fx.desk, savedAp = fx.approvals, savedAtt = fx.files[HELPERS_ATTENTION], savedNeeds = fx.shared["crew.needs"];
  fx.desk = { counts: {}, cards: [] }; fx.approvals = ""; delete fx.files[HELPERS_ATTENTION]; fx.shared["crew.needs"] = { count: 0, items: [] };
  texts.length = 0; clicks.clear();
  const v3 = new Decide();
  await run((cx) => v3.init({}, cx));
  await run((cx) => draw(v3, cx));
  assert.deepEqual(v3.list(), []);
  assert.ok(texts.includes("Nothing needs you"));
  assert.ok(clicks.has("decide-head"));
  fx.desk = savedDesk; fx.approvals = savedAp; fx.files[HELPERS_ATTENTION] = savedAtt; fx.shared["crew.needs"] = savedNeeds;
  fx.files["data/crew-home/home.json"] = JSON.stringify(home);

  // ── The header: the pill, Ctrl+Shift+A, the toasts ──
  const Header = (await import(pathToFileURL(join(dir, "crew-header.mjs")).href)).default;
  store.clear();
  fx.toasts.length = 0; fx.overlays = [];
  const h = new Header();
  await run((cx) => h.init({}, cx));
  await run((cx) => draw(h, cx));
  assert.equal(h.asks.length, 4, "it reads the open asks and logins");
  assert.equal(fx.toasts.length, 0, "a first run toasts nothing old");
  mouse.clear(); texts.length = 0;
  draw(h, { notify() {} });
  assert.ok(texts.includes("Your call · 9"), "the pill counts what waits (an unreadable owner card too)");
  mouse.get("decide-pill")(null, { stop_propagation() {} });
  assert.equal(fx.overlays.at(-1).mod, "crew-decide", "a click opens Your call");
  // A new ask and a newly held command: one toast each, whose click opens Your call.
  home.items.push({ id: "h-newone", kind: "ask", status: "open", title: "New one?", options: ["Yes"], by: "Orca#general", at: now });
  fx.files["data/crew-home/home.json"] = JSON.stringify(home);
  fx.shared["crew.needs"] = { ...fx.shared["crew.needs"], items: [...fx.shared["crew.needs"].items, { why: "approval", id: "a-999999", label: "push · Herdr Mod #site" }] };
  await run((cx) => h.refreshAsks(cx));
  assert.deepEqual(fx.toasts.map((t) => t.action?.name), ["crew-header.decide", "crew-header.decide"]);
  assert.match(fx.toasts[0].title, /Orca asks you/);
  await run((cx) => h.refreshAsks(cx));
  assert.equal(fx.toasts.length, 2, "once each");
  // crew-header.decide (Ctrl+Shift+A, a toast's click) only opens it.
  fx.overlays = []; fx.calls.length = 0;
  fx.cmds.push("decide");
  const h2 = new Header();
  await run((cx) => h2.init({}, cx));
  assert.equal(fx.overlays.filter((o) => o.mod === "crew-decide").length, 1);
  assert.equal(owned().length, 0);

  // ── The welcome tour, as a dialog ──
  const Welcome = (await import(pathToFileURL(join(dir, "crew-welcome.mjs")).href)).default;
  fx.shared["crew.settings"] = { owner: "DeNon", head: "Orca", welcome: { state: "new", beat: 0 } };
  fx.props = { overlay: "ov-wel" };
  texts.length = 0; fx.closed.length = 0;
  const w = new Welcome();
  await run((cx) => w.init({}, cx));
  await run((cx) => draw(w, cx));
  assert.ok(texts.includes("Welcome") && texts.includes("1 of 7"), "the tour draws in its dialog");
  assert.deepEqual(fx.closed, []);
  fx.shared["crew.settings"] = { owner: "DeNon", head: "Orca", welcome: { state: "done", beat: 0 } };
  await run((cx) => draw(w, cx));
  assert.deepEqual(fx.closed, ["ov-wel"], "done: it closes itself, after the render");
  crewjs.replayWelcome();
  assert.equal(fx.overlays.at(-1).mod, "crew-welcome");

  // ── Nothing left pointing at Home or the sidebar Inbox ──
  const files = [];
  const walk = (d) => { for (const e of readdirSync(join(root, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(js|json)$/.test(e.name) && !e.name.endsWith(".d.ts")) files.push(p); } };
  walk("mods"); walk("lib"); walk("layouts");
  for (const f of files) {
    const s = readFileSync(join(root, f), "utf8");
    for (const gone of ["showHome", "toggleHome", "homeMode", "hasHome", "runsHome", "crew.home.shown", '"crew-home"', "crew-home-chat", '"home-view"', 'crew.view"', "crew-roster.you"]) {
      assert.ok(!s.includes(gone), `${f} still has ${gone}`);
    }
  }
  assert.ok(!existsSync(join(root, "mods/crew-home")) && !existsSync(join(root, "mods/crew-home-chat")), "the Home mods are gone");
  const ids = crewjs.appMenuItems().filter((x) => !x.sep).map((x) => x.id);
  assert.ok(ids.includes("decide") && ids.includes("head") && !ids.includes("inbox") && !ids.includes("home"), "the command bar: Your call and the head pal's terminal");
  const inst = readFileSync(join(root, "install.sh"), "utf8");
  assert.match(inst, /for gone in [^\n]* crew-home crew-home-chat; do/, "an update sets the old mods aside");
  assert.match(inst, /"ctrl-shift-a crew-header\.decide Your call"/, "Ctrl+Shift+A, bound only when free");
  const roster = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
  for (const gone of ["hero-inbox", "hero-tasks", "hero-home", "inbox-row", "seg-you", "ap-ok-"]) assert.ok(!roster.includes(gone), `the sidebar has no ${gone}`);
  const status = readFileSync(join(root, "mods/crew-status/main.js"), "utf8");
  assert.ok(!status.includes("crew-needs") && !status.includes("need you`"), "the status strip has no needs-you link");
  console.log("ok: Your call");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
