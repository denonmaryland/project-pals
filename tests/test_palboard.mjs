// A pal's board (crew-boards/pal-page/design.md, DeNon's pick G · Board; T108), headless: showing it
// in the center and leaving it, which column a topic sits in (what it waits for; you wins), the
// board drawn with data and without (against stand-ins that fail the render when an element is
// changed after it went into a parent: Herdr's elements are single-use), the owner's clicks
// (approve, a Home answer, close a card) going out with a click token, the message box's three
// sends (a topic between steps, a topic now, a task), the review keys, the empty columns folding to
// rails, and the wiring (the layout, the pal click, the key). Run: node tests/test_palboard.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "palboard-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    export const clicks = new Map(), texts = [], ids = new Set();
    export const reset = () => { clicks.clear(); texts.length = 0; ids.clear(); };
    const el = () => {
      const p = new Proxy(function () {}, {
        get: (t, k) => {
          if (k === "then") return undefined;
          // Herdr's elements are single-use: changing one after it went into a parent fails the render.
          if (t.__attached && typeof k === "string" && !k.startsWith("__")) throw new Error(\`element changed after it was added to a parent (.\${k})\`);
          if (k === "when") return (c, f) => (c ? f(p) : p);
          if (k === "id") return (id) => { p.__id = id; ids.add(id); return p; };
          if (k === "on_click") return (f) => { if (p.__id) clicks.set(p.__id, f); return p; };
          const take = (c) => { if (typeof c === "string") texts.push(c); else if (c === undefined || c === null) throw new Error("child(undefined)"); else { if (c.__attached) throw new Error("an element was added to two parents"); c.__attached = true; } };
          if (k === "child") return (c) => { take(c); return p; };
          if (k === "children") return (cs) => { for (const c of cs) take(c); return p; };
          if (k === "__id") return t.__id;
          if (k === "__attached") return t.__attached;
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
    class St { constructor(o) { this.v = o?.value ?? ""; this.h = {}; } on(ev, f) { this.h[ev] = f; return true; } value() { return this.v; } set_value(v) { this.v = v; } focus() { this.focused = true; } set_auto_grow() {} }
    export const TextareaState = { new: (o) => new St(o) }, InputState = { new: (o) => new St(o) };
    export const Textarea = { new: () => div() }, Input = { new: () => div() };`);
  mod("herdr", `
    export const fx = { calls: [], overlays: [], notes: [], shared: { "crew.settings": { owner: "DeNon", head: "Orca" } }, spaces: [], files: {}, board: null, fail: null };
    export const spaces = () => fx.spaces, agents = () => [], panes = () => [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      const name = String(cmd).split("/").pop();
      fx.calls.push([name, ...(args ?? [])]);
      if (name === "pal") {
        if (fx.fail) return { stdout: "", stderr: fx.fail, code: 1 };
        if (args[0] === "computer") return fx.board ? { stdout: JSON.stringify(fx.board), stderr: "", code: 0 } : { stdout: "", stderr: "no such pal", code: 1 };
        if (args[0] === "desk" && args[1] === "send") return { stdout: JSON.stringify({ card: { id: "c-9", to: args[2] }, what: "queued" }), stderr: "", code: 0 };
        return { stdout: "ok\\n", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };
    export const hc = async () => ({ stdout: "", stderr: "", code: 0 });
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", keys = () => [], settings = () => ({});
    export const layout = () => fx.layout ?? null;
    export const run = (c, a) => { fx.calls.push(["run", c, JSON.stringify(a)]); if (c === "layout.select" && fx.layout) fx.layout.children[0].active = a.child;
      if (c === "space.select") for (const s of fx.spaces) s.active = s.id === a.id; };
    export const notify = (n) => { fx.notes.push(n); }, nextCommand = () => new Promise(() => {});
    export const openOverlay = (o) => { fx.overlays.push(o); return "ov" + fx.overlays.length; }, closeOverlay = () => {};
    export const readTextFile = async (p) => fx.files[p] ?? null, writeTextFile = async (p, v) => { fx.files[p] = v; }, knownAgents = async () => [];
    export const props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {}), focused = () => null;
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods", "crew-palboard", "main.js"), join(dir, "crew-palboard.mjs"));
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks, texts, ids, reset } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
  const c = await import(pathToFileURL(join(dir, "crew.js")).href);
  const { default: Board } = await import(pathToFileURL(join(dir, "crew-palboard.mjs")).href);
  const tick = () => new Promise((r) => setTimeout(r, 15));
  const cx = { focus_handle: () => ({ focus() { this.n = (this.n ?? 0) + 1; } }), timer: { after: (_ms, f) => f(cx), every: () => {} }, notify: () => {}, spawn: (f) => f(cx), stop_propagation: () => {} };
  const pals = () => fx.calls.filter((x) => x[0] === "pal").map((x) => x.slice(1));
  const lastPal = () => pals().at(-1);

  // ── the crew: Orca (the head), Juniper with six topics, Atlas; the pals layout with pal-view ──
  fx.shared.crew = { bots: [{ id: "b0", name: "Orca", space: "s0", god: true }, { id: "b1", name: "Juniper", space: "s1", folder: "/p/checkout" }] };
  fx.spaces = [{ id: "s0", name: "Orca", active: true, tabs: [{ id: "tg", name: "#general" }] },
    { id: "s1", name: "Juniper", status: "working", folder: "/p/checkout",
      tabs: [{ id: "t1", name: "#checkout", status: "working" }, { id: "t2", name: "#api-tests" }, { id: "t3", name: "#perf", status: "blocked", active: true },
        { id: "t4", name: "#docs" }, { id: "t5", name: "#refunds" }, { id: "t6", name: "#notes" }] },
    { id: "s2", name: "Atlas", tabs: [{ id: "t9", name: "#general" }] }];
  fx.layout = { id: "body", type: "row", children: [{ id: "center", type: "stack", active: "tab-view",
    children: [{ id: "tab-view" }, { id: "home-view" }, { id: "pc-view" }, { id: "pal-view" }] }, { id: "sidebar", size: { px: 300 } }] };
  const NOW = Date.now(), min = 60000;
  const data = () => ({ pal: "Juniper", focus: "checkout ships to beta on Friday", statement: "", goals: [], next: [], desk: { open: 0, needs_you: 0 }, due_today: [],
    topics: [
      { topic: "checkout", state: "working", terminal: "a", task: { id: "T41", title: "Stop the double charge" }, waits_for: "itself", needs: [], since: NOW - 12 * min, finished_at: NOW - 200 * min,
        line: { text: "The fix is in, and it's writing the test for a late reply.", from: "turn", at: NOW - 2 * min, asked: { by: "you", at: NOW - 12 * min, text: "fix the double charge" } },
        branch: { name: "crew/checkout", base: "main", ahead: 3, changed: 2, added: 22, removed: 7 }, stuck: 0, blocked: null },
      { topic: "api-tests", state: "working", terminal: "b", task: null, waits_for: "itself", needs: [], since: NOW - 3 * min, finished_at: 0, line: null, branch: null, stuck: 25, blocked: null },
      { topic: "perf", state: "blocked", terminal: "c", task: { id: "T39", title: "Cart page under 1 s" }, waits_for: "you", needs: ["h-1"], since: NOW - 9 * min, finished_at: 0,
        line: { text: "The cart page loads in 0.8 s with the image CDN and 1.4 s without it.", from: "reply", at: NOW - 9 * min, asked: null }, branch: null, stuck: 0, blocked: null },
      { topic: "docs", state: "done", terminal: "d", task: null, waits_for: "you", needs: ["a-1"], since: NOW - 98 * min, finished_at: NOW - 98 * min,
        line: { text: "Rewrote the setup guide. It's ready to push.", from: "reply", at: NOW - 98 * min, asked: null },
        branch: { name: "crew/docs", base: "main", ahead: 5, changed: 0, added: 212, removed: 87 }, stuck: 0, blocked: null },
      { topic: "notes", state: "idle", terminal: "f", task: null, waits_for: "nothing", needs: [], since: NOW - 30 * min, finished_at: NOW - 30 * min,
        line: { text: "Planned the week with you.", from: "reply", at: NOW - 30 * min, asked: null }, branch: null, stuck: 0, blocked: null },
      { topic: "refunds", state: "asleep", terminal: "e", task: null, waits_for: "nothing", needs: [], since: 0, finished_at: NOW - 4000 * min, line: null, branch: null, stuck: 0,
        blocked: { id: "T42", title: "Refund emails", why: "needs the mail provider's test key" } }],
    needs: [
      { kind: "approval", id: "a-1", topic: "docs", title: "git push origin crew/docs", detail: "pushes need the owner", rule: "git-push", since: NOW - 97 * min },
      { kind: "ask", id: "h-1", topic: "perf", title: "Keep the image CDN, or serve the images ourselves?", detail: "", options: ["Keep the CDN", "Serve them ourselves"], does: [], recommend: "Keep the CDN", why: "It's the smaller change.", since: NOW - 9 * min }],
    up_next: [{ id: "T45", title: "Saved addresses: edit and delete", due_label: "due Wed", topic: null }, { id: "T46", title: "Receipt email copy", due_label: "", topic: null }],
    up_next_total: 4, tasks_open: 6, at: NOW });

  // ── showing it and leaving it ──
  assert.equal(c.palClickOpens(), "board", "a click on a pal opens its board by default");
  assert.equal(c.showBoard(fx.spaces[1]), true);
  assert.equal(fx.layout.children[0].active, "pal-view");
  assert.equal(fx.shared["crew.board"].pal, "Juniper");
  assert.ok(fx.spaces[1].active, "the pal is shown too, so the hero is its");
  assert.ok(c.boardMode());
  const stamp1 = fx.shared["crew.board"].shown;
  c.toggleBoard();
  assert.equal(fx.layout.children[0].active, "tab-view", "again: back to its terminal");
  c.toggleBoard();
  assert.equal(fx.layout.children[0].active, "pal-view");
  assert.equal(fx.shared["crew.board"].shown, stamp1 + 1, "each showing is stamped");
  fx.shared["crew.settings"].palClick = "terminal";
  assert.equal(c.palClickOpens(), "terminal", "the setting brings the old click back");
  delete fx.shared["crew.settings"].palClick;
  assert.ok(c.appMenuItems().some((x) => x.id === "board") && c.appMenuItems().some((x) => x.id === "pal-click"));
  assert.ok(c.palMenuItems(fx.spaces[1], c.botOf(fx.spaces[1])).some((r) => r[1] === "board"));
  { const no = { id: "x", children: [{ id: "center", active: "tab-view", children: [{ id: "tab-view" }] }] }; const keep = fx.layout; fx.layout = no;
    assert.equal(c.showBoard(fx.spaces[1]), false, "an old layout without pal-view: nothing happens"); fx.layout = keep; }

  // ── waiting, in plain words ──
  assert.equal(c.waited(NOW - 9 * min, NOW), "9 min");
  assert.equal(c.waited(NOW - 97 * min, NOW), "1 h 37 m");
  assert.equal(c.waited(NOW - 120 * min, NOW), "2 h");
  assert.equal(c.waited(NOW - 3 * 1440 * min, NOW), "3 d");
  assert.equal(c.waited(NOW - 20000, NOW), "just now");
  assert.equal(c.waited(0, NOW), "");

  // ── the columns: what does each topic wait for? ──
  let cols = c.boardColumns(data(), { seen: NOW - 60 * min, who: "DeNon", pals: ["Orca", "Juniper", "Atlas"] });
  assert.deepEqual(cols.you.map((x) => [x.need.id, x.topic?.topic]), [["a-1", "docs"], ["h-1", "perf"]], "the longest wait first; #docs finished, and still waits for you");
  assert.deepEqual(cols.working.map((t) => t.topic), ["checkout", "api-tests"], "the longest-running first");
  assert.deepEqual(cols.resting.map((t) => t.topic), ["notes", "refunds"], "finished topics, then the asleep ones");
  assert.equal(cols.resting[0].fresh, true, "it finished after you last looked");
  assert.equal(cols.resting[1].fresh, false);
  assert.deepEqual([cols.next.length, cols.nextTotal], [2, 4]);
  { const d2 = data(); d2.needs.push({ kind: "prompt", id: "f", topic: "notes", title: "Atlas, can you review the copy?", since: NOW - min });
    const c2 = c.boardColumns(d2, { who: "DeNon", pals: ["Orca", "Juniper", "Atlas"] });
    assert.equal(c2.you.length, 2, "a question plainly put to another pal isn't yours");
    assert.equal(c2.resting.find((t) => t.topic === "notes").asksPal, true);
    d2.needs.at(-1).title = "Should I rename the folder?";
    assert.equal(c.boardColumns(d2, { who: "DeNon", pals: ["Orca", "Juniper", "Atlas"] }).you.length, 3, "one put to you is"); }
  assert.deepEqual(c.boardColumns(null).you, [], "no data yet: empty columns, no throw");

  // ── the board renders: first without data, then with it ──
  fx.board = data();
  const b = new Board();
  b.init({}, cx);
  reset();
  b.render(cx);
  assert.ok(texts.includes("Juniper's board"));
  await tick();
  assert.equal(b.data.pal, "Juniper");
  assert.deepEqual(lastPal(), ["computer", "Juniper", "board", "--json"]);
  reset();
  b.render(cx);
  for (const want of ["NEEDS YOU · 2", "WORKING · 2", "RESTING · 2", "UP NEXT · 4", "2 need you", "2 working", "Focus: checkout ships to beta on Friday",
    "The fix is in, and it's writing the test for a late reply.", "#checkout", "git push origin crew/docs", "waiting 9 min", "waiting 1 h 37 m",
    "Keep the image CDN, or serve the images ourselves?", "Its pick: Keep the CDN. It's the smaller change.", "+212", "−87", "T45", "due Wed", "2 more",
    "Blocked: needs the mail provider's test key", "STUCK 25 MIN", "ASLEEP", "To #perf"]) assert.ok(texts.includes(want), `the board shows “${want}”`);
  assert.ok(texts.some((x) => x.startsWith("It wants to ") && x.includes("Rewrote the setup guide.")), "an approval says what it lets through, and the topic's own words");
  assert.ok(texts.some((x) => x.startsWith("its words this turn · ") && x.endsWith("asked by you")));
  for (const id of ["pb-col-you", "pb-col-working", "pb-col-resting", "pb-col-next", "pb-need-a-1", "pb-need-h-1", "pb-topic-checkout", "pb-topic-refunds", "pb-task-T45", "pb-box", "pb-to"]) assert.ok(ids.has(id), id);
  assert.ok(!ids.has("pb-topic-docs") && !ids.has("pb-topic-perf"), "a topic that waits for you shows as its need, once");
  assert.ok(!ids.has("pb-now"), "Interrupt only shows for a working topic");

  // ── the owner's clicks: with a click token, the exact command ──
  clicks.get("pb-a-1-0")(null, cx);                                   // Approve
  await tick();
  let call = pals().find((x) => x[0] === "approve");
  assert.deepEqual(call.slice(0, 4), ["approve", "a-1", "--inbox", "--click"]);
  assert.match(call[4], /^[0-9a-f]{32}$/);
  assert.ok(Object.keys(fx.files).some((p) => p.includes("/data/crew-clicks/") && JSON.parse(fx.files[p]).args.join(" ") === "approve a-1 --inbox"), "the token is for exactly this command");
  reset(); b.render(cx);
  clicks.get("pb-a-1-1")(null, cx);                                   // Decline
  await tick();
  assert.deepEqual(pals().find((x) => x[0] === "deny").slice(0, 3), ["deny", "a-1", "--inbox"]);
  reset(); b.render(cx);
  clicks.get("pb-h-1-1")(null, cx);                                   // the second option
  await tick();
  assert.deepEqual(pals().find((x) => x[0] === "home").slice(0, 5), ["home", "answer", "h-1", "Serve them ourselves", "--click"]);

  // ── aiming the box, and its three sends ──
  reset(); b.render(cx);
  clicks.get("pb-topic-checkout")(null, cx);
  reset(); b.render(cx);
  assert.ok(texts.includes("To #checkout"));
  assert.ok(texts.includes("Working: it gets this between two of its steps."));
  assert.ok(ids.has("pb-now") && ids.has("pb-term-checkout") && ids.has("pb-pop-checkout"), "the aimed card shows the ways in, and a working topic can be interrupted");
  assert.equal(store.get("board-aim-Juniper"), "checkout", "the aim is remembered for this pal");
  b.input.set_value("also cover a reply that never arrives");
  b.input.h.submit({}, cx);
  await tick();
  call = pals().find((x) => x[0] === "desk" && x[1] === "send");
  assert.deepEqual(call.slice(0, 7), ["desk", "send", "Juniper#checkout", "also cover a reply that never arrives", "--urgency", "normal", "--json"]);
  assert.equal(call[7], "--click", "it goes as the owner's, so the pal sees it headed from you");
  assert.equal(b.input.value(), "", "the box is cleared");
  assert.equal(b.sent.checkout.what, "queued");
  reset(); b.render(cx);
  assert.ok(texts.includes("also cover a reply that never arrives") && texts.includes("QUEUED"), "your message and its receipt show on the card");
  fx.calls.length = 0;
  b.input.h.submit({ shift: true }, cx);
  b.send(cx);
  await tick();
  assert.equal(pals().filter((x) => x[0] === "desk").length, 0, "an empty box sends nothing");
  reset(); b.render(cx);
  clicks.get("pb-now")(null, cx);                                     // an empty box: the button is off
  await tick();
  assert.equal(pals().filter((x) => x[0] === "desk").length, 0);
  b.input.set_value("stop, wrong file");
  reset(); b.render(cx);                                              // typing redraws (the field's change event)
  clicks.get("pb-now")(null, cx);                                     // Interrupt
  await tick();
  assert.equal(pals().find((x) => x[0] === "desk")[5], "now");
  reset(); b.render(cx);
  clicks.get("pb-to")(null, cx);
  reset(); b.render(cx);
  assert.ok(ids.has("pb-picker") && ids.has("pb-pick-refunds") && ids.has("pb-pick-task") && ids.has("pb-pick-new"));
  clicks.get("pb-pick-task")(null, cx);
  reset(); b.render(cx);
  assert.ok(texts.includes("A task for Juniper") && !ids.has("pb-picker"));
  b.input.set_value("Tidy the receipts page\nThe totals wrap on small screens.");
  reset(); b.render(cx);
  assert.ok(texts.includes("Add"), "the button says what it does");
  clicks.get("pb-send")(null, cx);
  await tick();
  call = pals().find((x) => x[0] === "task");
  assert.deepEqual(call.slice(0, 7), ["task", "add", "Tidy the receipts page", "--for", "Juniper", "--body", "The totals wrap on small screens."]);
  // A send that fails: the text comes back.
  fx.fail = "the daemon is down";
  b.input.set_value("try again later");
  b.send(cx);
  await tick();
  assert.equal(b.input.value(), "try again later");
  assert.ok(fx.notes.at(-1).title.startsWith("Couldn't"));
  fx.fail = null;
  b.input.set_value("");

  // ── Up next: Start a topic opens the new-topic dialog with the task as its brief ──
  reset(); b.render(cx);
  clicks.get("pb-start-T45")(null, cx);
  assert.equal(fx.overlays.at(-1).mod, "crew-duplicate");
  assert.match(fx.overlays.at(-1).props.brief, /^T45: Saved addresses/);
  assert.equal(fx.overlays.at(-1).props.space, "s1");
  clicks.get("pb-all-tasks")(null, cx);
  assert.equal(fx.overlays.at(-1).mod, "crew-tasks");

  // ── keys: R reviews what needs you one at a time; typing in the box keeps the keys ──
  b.target = "topic";
  fx.calls.length = 0;
  b.key({ keystroke: "r" }, cx);
  assert.equal(b.review, 0);
  reset(); b.render(cx);
  assert.ok(texts.includes("Reviewing"));
  b.key({ keystroke: "right" }, cx);
  assert.equal(b.review, 1);
  b.key({ keystroke: "1" }, cx);                                      // the first button of the second need
  await tick();
  assert.deepEqual(pals().find((x) => x[0] === "home").slice(0, 4), ["home", "answer", "h-1", "Keep the CDN"]);
  b.key({ keystroke: "right" }, cx);
  assert.equal(b.review, null, "past the last one: done");
  b.key({ keystroke: "r" }, cx); b.key({ keystroke: "escape" }, cx);
  assert.equal(b.review, null, "Esc stops the review");
  assert.equal(fx.layout.children[0].active, "pal-view", "and stays on the board");
  b.typing = true;
  b.key({ keystroke: "r" }, cx);
  assert.equal(b.review, null, "while you type, R is a letter");
  b.key({ keystroke: "escape" }, cx);
  assert.equal(b.typing, false, "Esc leaves the box first");
  assert.equal(fx.layout.children[0].active, "pal-view");
  b.key({ keystroke: "escape" }, cx);
  assert.equal(fx.layout.children[0].active, "tab-view", "Esc again: the aimed topic's terminal");
  assert.ok(fx.calls.some((x) => x[0] === "run" && x[1] === "tab.select" && x[2].includes("t1")), "#checkout, the topic the box points at");

  // ── nothing needs you, nothing unclaimed: both fold to rails; many resting: one line each ──
  c.showBoard(fx.spaces[1]);
  { const d3 = data(); d3.needs = []; d3.up_next = []; d3.up_next_total = 0;
    for (const t of d3.topics) { t.needs = []; if (t.waits_for === "you") { t.waits_for = "nothing"; t.state = "done"; } if (t.state === "working") { t.state = "idle"; t.waits_for = "nothing"; } }
    fx.board = d3; }
  b.loading = false; b.reload(cx); await tick();
  reset(); b.render(cx);
  assert.ok(ids.has("pb-rail-you") && ids.has("pb-rail-next") && !ids.has("pb-col-you") && !ids.has("pb-col-next"));
  assert.ok(texts.includes("Nothing needs you") && texts.includes("Nothing is running right now.") && texts.includes("RESTING · 6"));
  b.key({ keystroke: "r" }, cx);
  assert.equal(b.review, null, "nothing to review");

  // ── a key switches to another pal while the board is up: back to the terminal ──
  fx.board = data(); b.loading = false; b.reload(cx); await tick();
  for (const s of fx.spaces) s.active = s.id === "s2";
  b.shownTime = Date.now() - 2000;
  reset(); b.render(cx);
  assert.equal(fx.layout.children[0].active, "tab-view", "keys never land on a board");

  // ── the pal is gone, and a read that fails ──
  fx.shared["crew.board"] = { pal: "Ghost", shown: 99 };
  fx.layout.children[0].active = "pal-view";
  reset(); b.render(cx);
  assert.ok(texts.includes("Ghost isn't here any more."));
  for (const s of fx.spaces) s.active = s.id === "s1";
  fx.board = null;
  c.showBoard(fx.spaces[1]);
  const b2 = new Board(); b2.init({}, cx);
  reset(); b2.render(cx); await tick(); reset(); b2.render(cx);
  assert.ok(texts.some((x) => x.startsWith("Couldn't read the board")), "it says so, and doesn't draw stale columns");

  // ── the wiring ──
  const lay = readFileSync(join(root, "layouts/pals.json"), "utf8");
  assert.match(lay, /"id": "pal-view", "type": "block", "content": \{ "mod": "crew-palboard" \}/);
  assert.equal(JSON.parse(readFileSync(join(root, "mods/crew-palboard/mod.json"), "utf8")).focusable, true, "it takes keys");
  const roster = readFileSync(join(root, "mods/crew-roster/main.js"), "utf8");
  assert.match(roster, /palClickOpens\(\) === "board" && hasBoard\(\) && !\(boardMode\(\) && boardPal\(\) === space\.name\)\) \{ showBoard\(space\); return; \}/, "a click on a pal opens its board; on the pal whose board is up, its terminal");
  assert.match(roster, /if \(runsHome\(space\) && hasHome\(\)\) \{ showHome\(\); return; \}\n\s+if \(palClickOpens/, "the head pal still opens Home");
  assert.match(roster, /c === "board"\) toggleBoard\(\)/);
  assert.match(roster, /go\(space, tab\) \{ openTerminal\(space, tab\); \}/, "a click on a topic still goes to its terminal");
  assert.match(readFileSync(join(root, "install.sh"), "utf8"), /"ctrl-shift-u crew-roster\.board the pal board"/);
  assert.match(readFileSync(join(root, "bin/crewuninstall.py"), "utf8"), /"ctrl-shift-u": "crew-roster\.board"/);
  assert.match(readFileSync(join(root, "mods/crew-duplicate/main.js"), "utf8"), /if \(props\(\)\?\.brief\) this\.brief\.set_value/);
  console.log("ok: the pal board");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
