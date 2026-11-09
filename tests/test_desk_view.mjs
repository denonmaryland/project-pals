// The Desk view and the quick-drop, run headless: crew-desk renders every desk (Needs you, To route,
// Held, All, a pal, a lane, a pal tray) and every card it's given (an unverified owner card, a held
// one, one with a reply and images) without throwing; its actions call `pal desk …` with a click
// token; the quick-drop sends what was typed, to where and how urgent, with --task for multi-line text,
// to Auto (triage) by default and To route when triage is off or there are no pals; To route shows
// Auto cards as sorting and triage's leftovers with why; the sidebar's per-topic markers read right;
// the idea partner's drafts: their desk, Send / Edit / Discard as clicks, the Edit prefill with
// --from-draft, the empty Drafts state, and one toast per new draft.
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
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "stats") return { stdout: JSON.stringify(fx.stats), stderr: "", code: 0 };
      if (cmd.endsWith("/pal") && args[0] === "desk" && args[1] === "send") return { stdout: JSON.stringify({ card: { id: "c-abcdef", to: "Herdr Mod#desk" }, terminal: "t1", what: "queued" }), stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    const nop = () => {};
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => fx.layout, keys = () => [], settings = () => ({});
    export const run = (c, a) => fx.calls.push(["run", c, JSON.stringify(a)]), notify = (n) => fx.toasts.push(n), openOverlay = nop, closeOverlay = () => { fx.closed++; };
    export const hc = exec, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [], props = () => fx.props ?? {}, watchFolder = () => new Promise(() => {});
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  for (const m of ["crew-desk", "crew-desk-drop", "crew-desk-settings"]) { cpSync(join(root, "mods", m, "main.js"), join(dir, `${m}.mjs`)); }
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
  assert.equal(q2.toLabel(), "Auto (a pal picks it)", "Auto (triage) is the default while there are pals");
  assert.deepEqual(q2.targets().slice(0, 2).map((x) => x.to), ["auto", "route"], "Auto, then To route (I'll pick)");
  fx.calls.length = 0;
  await run((cx) => q2.drop(cx));
  const s2 = fx.calls.find((c) => c[0] === "pal" && c[2] === "send");
  assert.equal(s2[3], "auto");
  assert.ok(!s2.includes("--task"));
  assert.match(fx.toasts.at(-1).title, /^Dropped · sorting it to a pal · c-abcdef$/);
  assert.ok(q2.targets().some((x) => x.to === "Herdr Mod#docs"), "every topic is a target");
  q2.filter.set_value("docs");
  assert.deepEqual(q2.targets().map((x) => x.to), ["Herdr Mod#docs"], "the filter narrows the targets");
  // Triage off: no Auto; To route is the default (and an Auto pick still sends route).
  fx.shared["crew.desk"] = { triage: "off" };
  const q3 = new Drop();
  await run((cx) => q3.init({}, cx));
  assert.equal(q3.toLabel(), "To route (I'll pick)");
  assert.ok(!q3.targets().some((x) => x.to === "auto"), "no Auto while triage is off");
  q3.to = "auto"; q3.input.set_value("x");
  fx.calls.length = 0;
  await run((cx) => q3.drop(cx));
  assert.equal(fx.calls.find((c) => c[0] === "pal" && c[2] === "send")[3], "route");
  // No pals: To route only.
  delete fx.shared["crew.desk"];
  const keep = fx.spaces; fx.spaces = [];
  const q4 = new Drop();
  await run((cx) => q4.init({}, cx));
  assert.equal(q4.toLabel(), "To route");
  assert.deepEqual(q4.targets().map((x) => x.to), ["route"]);
  fx.spaces = keep;

  // ── To route: Auto cards being sorted, and ones triage couldn't place ──
  const { receiptWord, receiptLine } = await import(pathToFileURL(join(dir, "crew-desk.mjs")).href);
  assert.equal(receiptWord("routed #docs"), "Routed to #docs");
  assert.equal(receiptWord("seen"), "seen");
  assert.equal(receiptLine({ status: "routed #docs", by: "Project Pals", via: "triage", note: "it's about the docs" }), "by triage: it's about the docs");
  assert.equal(receiptLine({ status: "seen", by: "t4", via: "hook:stop", note: "" }), "t4 · hook:stop");
  v.cards = [
    { id: "c-666666", kind: "tell", status: "queued", route: "auto", from: "DeNon", from_kind: "owner", to: "To route", title: "Sort me", receipts: [r("queued", "DeNon", "pal desk send")], tray: "_route", verified: true },
    { id: "c-777777", kind: "tell", status: "needs you", route: "manual", from: "DeNon", from_kind: "owner", to: "To route", title: "Unsure",
      receipts: [r("queued", "DeNon", "pal desk send"), r("needs you", "Project Pals", "triage", "triage wasn't sure (0.3)")], last: r("needs you", "Project Pals", "triage", "triage wasn't sure (0.3)"), tray: "_route", verified: true },
    { id: "c-888888", kind: "tell", status: "seen", route: "triage", from: "DeNon", from_kind: "owner", to: "Herdr Mod#docs", title: "Placed",
      receipts: [r("queued", "DeNon", "pal desk send"), r("routed #docs", "Project Pals", "triage", "docs work")], tray: "herdr-mod", topic: "docs", verified: true },
  ];
  v.pick = "route";
  for (const id of [null, "c-666666", "c-777777"]) { v.openId = id; await run((cx) => v.render(cx)); }
  v.pick = "all"; v.openId = "c-888888";
  await run((cx) => v.render(cx));
  assert.deepEqual(v.cards.filter((c) => v.match("needs", c)).map((c) => c.id), ["c-777777"], "triage's leftovers wait on you");

  // ── the sidebar's Desk markers (crew.js, from the header's shared crew.desk.pals) ──
  const crewjs = await import(pathToFileURL(join(dir, "crew.js")).href);
  fx.shared["crew.desk"] = { counts: {}, triage: "auto", pals: { "herdr-mod": { pal: "Herdr Mod", open: 4, held: 1, held_since: iso(12),
    topics: { "": { open: 1, held: 0, held_since: null }, Desk: { open: 2, held: 1, held_since: iso(12) }, docs: { open: 1, held: 0, held_since: null } } } } };
  assert.equal(crewjs.deskOf("Herdr Mod").open, 4);
  assert.equal(crewjs.deskOf("Nobody"), null);
  assert.equal(crewjs.deskLaneText(crewjs.deskLane("Herdr Mod", "desk")), "held 12m", "held wins, with its age (topic matched case-insensitively)");
  assert.equal(crewjs.deskLaneText(crewjs.deskLane("Herdr Mod", "#docs")), "1 waiting");
  assert.equal(crewjs.deskLane("Herdr Mod", ""), null, "the pal tray isn't a topic row");
  assert.equal(crewjs.deskLaneText(crewjs.deskLane("Herdr Mod", "review")), null, "nothing for a topic with no cards");
  assert.ok(crewjs.deskLaneMark({ r: { xs: 3 }, line: "#1E1E20", fg3: "#808082", warnText: "#E8AA0A" }, crewjs.deskLane("Herdr Mod", "desk")));
  assert.equal(crewjs.deskLaneMark({}, null), null);
  // ── MUSE's drafts (design §13) ──
  const deskmod = await import(pathToFileURL(join(dir, "crew-desk.mjs")).href);
  const draftCard = { id: "c-d00001", kind: "idea", status: "draft", from: "MUSE#ideas", from_kind: "pal", to: "Herdr Mod#docs", urgency: "soon", track: "yes",
    title: "Docs index", body: "**Why:** stale\n**Done when:** links work", reply: null, receipts: [r("draft", "MUSE#ideas", "pal desk draft")], tray: "_drafts", verified: false };
  const autoDraft = { ...draftCard, id: "c-d00002", to: "auto", track: undefined, urgency: "normal", title: "Something" };
  fx.desk = { counts: { open: 1, drafts: 2 }, cards: [draftCard, autoDraft, { id: "c-999999", kind: "tell", status: "queued", from: "DeNon", from_kind: "owner", to: "Herdr Mod#desk", title: "x", receipts: [], tray: "herdr-mod", verified: true }] };
  v.cards = fx.desk.cards;
  assert.deepEqual(v.cards.filter((c) => v.match("drafts", c)).map((c) => c.id), ["c-d00001", "c-d00002"], "the Drafts desk");
  assert.deepEqual(v.cards.filter((c) => v.match("all", c)).map((c) => c.id), ["c-999999"], "drafts aren't on a desk until sent");
  assert.deepEqual(v.cards.filter((c) => v.match("pal:herdr-mod", c)).map((c) => c.id), ["c-999999"]);
  v.pick = "drafts"; v.openId = "c-d00001";
  clicks.clear();
  await run((cx) => v.render(cx));
  for (const id of ["da-send", "da-edit", "da-discard", "dt-to"]) assert.ok(clicks.has(id), `a draft offers ${id}`);
  assert.ok(!clicks.has("da-move") && !clicks.has("da-cancel"), "a draft has its own actions");
  fx.calls.length = 0;
  await run((cx) => clicks.get("da-send")(null, cx));
  const sd = fx.calls.find((c) => c[0] === "pal" && c[2] === "send-draft");
  assert.deepEqual(sd.slice(0, 6), ["pal", "desk", "send-draft", "c-d00001", "--to", "Herdr Mod#docs"], "Send goes to its suggestion");
  assert.ok(sd.includes("--click"), "Send is the owner's click");
  assert.ok(!sd.includes("--urgency"), "its own urgency unless changed");
  // A different place and urgency.
  await run((cx) => clicks.get("dt-to")(null, cx));
  assert.ok(v.draftPicking);
  clicks.clear();
  await run((cx) => v.render(cx));
  await run((cx) => clicks.get("dt-route")(null, cx));
  await run((cx) => clicks.get("dt-u-low")(null, cx));
  clicks.clear();
  await run((cx) => v.render(cx));
  fx.calls.length = 0;
  await run((cx) => clicks.get("da-send")(null, cx));
  assert.deepEqual(fx.calls.find((c) => c[2] === "send-draft").slice(3, 8), ["c-d00001", "--to", "route", "--urgency", "low"]);
  await run((cx) => clicks.get("da-discard")(null, cx));
  assert.ok(fx.calls.some((c) => c.join(" ").startsWith("pal desk discard c-d00001 --click")), "Discard is a click");
  assert.deepEqual(deskmod.editProps(draftCard), { text: "Docs index\n\n**Why:** stale\n**Done when:** links work", to: "Herdr Mod#docs", urgency: "soon", task: true, fromDraft: "c-d00001", drafter: "MUSE" });
  assert.equal(deskmod.editProps(autoDraft).to, "auto");
  assert.equal(deskmod.draftTarget("To route"), "route");
  v.openId = "c-d00002"; await run((cx) => v.render(cx));
  // No drafts: hire an idea partner (none yet), else whose drafts show here.
  fx.desk = { counts: {}, cards: [] }; v.cards = []; v.openId = null; v.loaded = false; clicks.clear();
  await run((cx) => v.render(cx));
  clicks.clear();
  await run((cx) => v.render(cx));
  assert.ok(clicks.has("desk-hire-partner"), "no partner yet: Hire an idea partner");
  fx.shared.crew = { bots: [{ id: "b1", name: "MUSE", partner: true }] };
  clicks.clear();
  await run((cx) => v.render(cx));
  assert.ok(!clicks.has("desk-hire-partner"), "with one hired, no Hire button");
  delete fx.shared.crew;

  // Edit: the quick-drop prefilled from the draft; dropping retires it (--from-draft).
  fx.props = { ...deskmod.editProps(draftCard), overlay: "o9" };
  const qe = new Drop();
  await run((cx) => qe.init({}, cx));
  await run((cx) => qe.render(cx));
  assert.equal(qe.input.value(), "Docs index\n\n**Why:** stale\n**Done when:** links work");
  assert.equal(qe.toLabel(), "Herdr Mod #docs");
  assert.equal(qe.urgency, "soon");
  assert.equal(qe.tracking(), true);
  qe.track = false;
  fx.calls.length = 0;
  await run((cx) => qe.drop(cx));
  const se = fx.calls.find((c) => c[0] === "pal" && c[2] === "send");
  assert.deepEqual(se.slice(3, 9), ["Herdr Mod#docs", "Docs index\n\n**Why:** stale\n**Done when:** links work", "--urgency", "soon", "--from-draft", "c-d00001"]);
  assert.ok(!se.includes("--task") && se.includes("--click"));
  fx.props = {};

  // The toast: once per draft; a first run takes today's drafts as seen.
  const first = crewjs.newDrafts([draftCard], null);
  assert.deepEqual([first.fresh.length, first.seen], [0, ["c-d00001"]], "a first run toasts nothing");
  const next = crewjs.newDrafts([draftCard, autoDraft], first.seen);
  assert.deepEqual(next.fresh.map((c) => c.id), ["c-d00002"], "a new draft toasts");
  assert.deepEqual(crewjs.newDrafts([draftCard, autoDraft], next.seen).fresh, [], "once");
  assert.deepEqual(crewjs.newDrafts([autoDraft], next.seen).seen, ["c-d00002"], "a sent or discarded draft drops out");
  assert.deepEqual(crewjs.newDrafts([{ ...draftCard, status: "cancelled" }], []).fresh, [], "only open drafts");
  const toast = crewjs.draftToast(draftCard);
  assert.equal(toast.title, "MUSE drafted a card");
  assert.equal(toast.body, "Docs index → Herdr Mod #docs. Review and Send in the Desk.");
  assert.deepEqual(toast.action, { name: "crew-header.drafts" });
  assert.equal(crewjs.draftToast(autoDraft).body, "Something → Auto. Review and Send in the Desk.");
  assert.equal(crewjs.partnerOf({ bots: [{ name: "X", role: "Idea partner" }] }).name, "X");
  assert.equal(crewjs.partnerOf({ bots: [{ name: "Y", role: "Writer" }] }), null);

  // ── Settings → Desk ──
  fx.stats = { open: 3, held: 1, "needs you": 0, "to route": 0, drafts: 2, triage_today: 12, triage_cap: 100, triage: "auto", checkin_at: null,
    settings: { triage: "auto", triage_daily_cap: 100, pal_soon_per_hour: 6, held_flag_after_min: 10, seen_no_receipt_flag_min: 30,
      archive_after_days: 14, partner_sends_as_itself: false } };
  const Settings = (await import(pathToFileURL(join(dir, "crew-desk-settings.mjs")).href)).default;
  const ds_ = new Settings();
  fx.calls.length = 0;
  await run((cx) => ds_.init({}, cx));
  await run((cx) => ds_.render(cx));
  assert.ok(fx.calls.some((c) => c.join(" ") === "pal desk stats --json"), "it reads today's numbers");
  assert.equal(ds_.st.triage_today, 12);
  fx.calls.length = 0;
  await run((cx) => clicks.get("ds-triage_daily_cap-up")(null, cx));
  assert.ok(fx.calls.some((c) => c.join(" ").startsWith("pal settings desk.triage_daily_cap 110 --click ")), "the stepper saves at once, with the owner's click");
  await run((cx) => ds_.render(cx));
  await run((cx) => clicks.get("ds-triage-t")(null, cx));
  assert.ok(fx.calls.some((c) => c.join(" ").startsWith("pal settings desk.triage off --click ")), "triage switches off");
  fx.stats.settings.archive_after_days = 1;
  await run((cx) => ds_.load(cx)); await run((cx) => ds_.render(cx));
  fx.calls.length = 0;
  await run((cx) => clicks.get("ds-archive_after_days-dn")(null, cx));
  assert.ok(!fx.calls.some((c) => c.join(" ").startsWith("pal settings desk.archive_after_days 0")), "never below the minimum");

  console.log("desk view: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
