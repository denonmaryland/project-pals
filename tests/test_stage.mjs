// The profile page's hero and week cards (mods/crew-profile/stage.js, stagedata.js, compose.js).
// First the data, then the views drawn for real outside Herdr against stand-ins for gpui-kit,
// gpui-base and herdr (like tests/test_palrows.mjs): every element method they call must be one
// gpui-kit declares, so a mistyped style or a view that throws fails here.
// Run: node tests/test_stage.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { stageTone, stateLine, weekCards, boardOf, taskIsFor } from "../mods/crew-profile/stagedata.js";

const NOW = new Date(2026, 10, 8, 15, 0).getTime();
const DAY = 86400000;
const PAL = "Project Pals - Herdr Mod";

// ── the stage's light and line ──
assert.equal(stageTone("work"), "work");
assert.equal(stageTone("done"), "done");
assert.equal(stageTone("pr"), "done", "a PR open is done-coloured");
assert.equal(stageTone("ask"), "ask");
assert.equal(stageTone("stuck"), "stuck");
assert.equal(stageTone("rest"), null, "no light at rest");
assert.equal(stageTone("work", false), null, "no light asleep");
assert.equal(stateLine({ word: "Working", since: "12m", channel: "profiles" }), "Working · 12m in #profiles");
assert.equal(stateLine({ word: "Working", since: "now", channel: "profiles" }), "Working in #profiles");
assert.equal(stateLine({ word: "Resting", since: "", channel: null }), "Resting");

// ── whose task ──
assert.ok(taskIsFor({ assignee: "project pals - herdr mod " }, PAL));
assert.ok(taskIsFor({ claimed_by: `${PAL}#profiles` }, PAL));
assert.ok(!taskIsFor({ assignee: "Orca" }, PAL));
assert.ok(!taskIsFor({ assignee: "" }, ""), "no pal, no tasks");

// ── the four cards, from real data only ──
const channels = [
  { id: "t1", name: "profiles", status: "working", awake: true },
  { id: "t2", name: "review", status: "blocked", awake: true },
  { id: "t3", name: "notes", status: "working", awake: false },   // no agent: not in motion
  { id: "t4", name: "integrate", status: "done", awake: true },
];
const tasks = [
  { id: "T1", assignee: PAL, status: "done", updated: NOW - 2 * DAY },
  { id: "T2", assignee: PAL, status: "done", updated: NOW - 9 * DAY },            // too old
  { id: "T3", assignee: "Orca", status: "done", updated: NOW - DAY },              // not ours
  { id: "T4", claimed_by: `${PAL}#profiles`, status: "claimed", created: 1 },      // on a working channel: counted once
  { id: "T5", claimed_by: `${PAL}#notes`, status: "claimed", created: 2 },         // a claimed task elsewhere
  { id: "T6", assignee: PAL, status: "open", created: 3, deps: ["T1", "T9"] },
  { id: "T7", assignee: PAL, status: "blocked", created: 4 },
];
const approvals = [{ bot: PAL, status: "pending" }, { bot: "Orca", status: "pending" }];
const proposals = [{ pal: PAL, status: "pending" }];
const stalled = { term9: { bot: PAL, channel: "review", since: NOW - 600000 } };
const nb = { days: [
  { day: "2026-11-08", entries: [{ hiccups: [{ text: "Paper down (cost: ~15m)" }, { text: "x", cost: 20 }] }] },
  { day: "2026-11-04", entries: [{ hiccups: [{ text: "y" }] }] },
  { day: "2026-10-20", entries: [{ hiccups: [{ text: "too old" }] }] },
] };
const cards = weekCards({ pal: PAL, channels, tasks, approvals, proposals, stalled, nb, now: NOW });
const by = Object.fromEntries(cards.map((c) => [c.key, c]));
assert.deepEqual(cards.map((c) => [c.label, c.tone]), [["Shipped", "done"], ["In motion", "work"], ["Needs you", "ask"], ["Hiccups", "stuck"]]);
assert.equal(by.shipped.value, 1, "done in the last 7 days, this pal's only");
assert.equal(by.motion.value, 2, "one working channel plus one claimed task not on it");
assert.equal(by.motion.sub, "1 topic · 1 task");
assert.equal(by.needs.value, 4, "an ask, an approval, a proposal, a stuck channel");
assert.equal(by.needs.sub, "1 ask · 1 approval · 1 proposal · 1 stuck");
assert.equal(by.hiccups.value, 3, "the notebook's hiccups in 7 days");
assert.equal(by.hiccups.sub, "~35m lost · 7 days");
const quiet = weekCards({ pal: PAL, channels: [], tasks: [], nb: null, now: NOW });
assert.equal(quiet.find((c) => c.key === "hiccups").value, null, "unknown until the notebook is read");
assert.equal(quiet.find((c) => c.key === "needs").sub, "all clear");
assert.equal(quiet.find((c) => c.key === "motion").sub, "nothing running");

// ── the board ──
const b = boardOf({ pal: PAL, tasks, channels: channels.map((c) => ({ ...c, title: `on ${c.name}` })), stalled, now: NOW });
assert.deepEqual(b.now.map((x) => x.task?.id ?? x.activity), ["T4", "T5"], "claimed tasks; #profiles is busy with T4 already");
assert.equal(b.now[0].ch.name, "profiles");
assert.deepEqual(b.next.map((x) => [x.task.id, x.after]), [["T6", ["T9"]]], "waits on what isn't done");
assert.deepEqual(b.blocked.map((x) => x.task?.id ?? x.activity), ["T7", "Asks you: on review", "Looks stuck"]);
assert.equal(b.blocked[2].ch.name, "review");
assert.deepEqual(b.done.map((x) => x.task.id), ["T1"]);

// ── the views, drawn ──
const root = new URL("..", import.meta.url).pathname;
const dts = readFileSync(join(root, "mods/crew-command/gpui-kit.d.ts"), "utf8");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
const dir = mkdtempSync(join(tmpdir(), "stage-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    const OK = new Set(${JSON.stringify(METHODS)});
    export function el(kind, arg) {
      const node = { kind, arg, calls: [], kids: [], args: {} };
      const p = new Proxy(node, { get(t, k) {
        if (k === "node") return t;
        if (typeof k !== "string" || k === "then") return undefined;
        if (!OK.has(k)) throw new Error("not a gpui-kit method: ." + k + "()");
        return (...a) => {
          t.calls.push(k); (t.args[k] ??= []).push(a);
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
    const state = (o = {}) => { let v = o.value ?? ""; return { placeholder: o.placeholder, on() {}, value: () => v, set_value(x) { v = x; }, focus() {}, set_auto_grow() {}, set_rows() {} }; };
    export const InputState = { new: state }, TextareaState = { new: state }, EditorState = { new: state };
    export const Input = { new: () => el("div") }, Textarea = { new: (s) => el("textarea", s) }, Editor = { new: () => el("div") };
    export const TextView = { markdown: (id, md) => el("md", md) };
  `);
  mod("herdr", `
    const now = Date.now();
    export const fixtures = {
      spaces: [{ id: "s1", name: ${JSON.stringify(PAL)}, folder: "/home/denon/Projects/project-pals", active: true, status: "working",
        tabs: [{ id: "t1", name: "profiles", status: "working", changed_at: now - 720000, active: true },
               { id: "t2", name: "review", status: "blocked", changed_at: now - 60000 }, { id: "t3", name: "notes", status: "idle" }] }],
      panes: [{ tab: "t1", terminal: "a", program: { agent: true, key: "claude", name: "Claude Code" }, branch: "crew/next" },
              { tab: "t2", terminal: "b", program: { agent: true, key: "claude", name: "Claude Code" } }],
      agents: [{ space: "s1", tab: "t1", status: "working", seq: 2, title: "Profile hero" }, { space: "s1", tab: "t2", status: "blocked", seq: 1 }],
      shared: { crew: { bots: [{ id: "b1", name: ${JSON.stringify(PAL)}, space: "s1", role: "Keeps the mod sleek", worktrees: { "#review": { branch: "crew/review" } } }] },
        "crew.settings": { owner: "DeNon" }, "crew.panel": { tab: "profile" }, "crew.pets": [] },
    };
    export const spaces = () => fixtures.spaces, panes = () => fixtures.panes, agents = () => fixtures.agents;
    export const shared = (k) => fixtures.shared[k], setShared = (k, v) => { fixtures.shared[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED" });
    export const home = () => "/home/denon", appHome = () => "/home/denon/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => ({}), keys = () => ({});
    const nop = () => {}, later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  for (const f of readdirSync(join(root, "mods/crew-profile")).filter((f) => f.endsWith(".js"))) copyFileSync(join(root, "mods/crew-profile", f), join(dir, f));
  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const { default: Profile } = await import(url("main.js"));
  const { stagePart } = await import(url("stage.js"));
  const { TaskDraft, taskOf } = await import(url("compose.js"));
  const { fixtures } = await import(url("node_modules/herdr/index.js"));

  // The task a draft makes: the Tasks dialog's rule.
  assert.deepEqual(taskOf("Fix the hero\nmore detail", []), ["Fix the hero", "more detail"]);
  assert.deepEqual(taskOf("", [{ path: "/x/a.png" }]), ["Look at the attached image", "Attached image (open with your image tool):\n- /x/a.png"]);
  const long = "x".repeat(120);
  assert.equal(taskOf(long, [])[0].length, 98);
  assert.equal(taskOf(long, [])[1], long, "a long first line keeps its whole text in the body");

  // Each pal has its own draft: switching pals never carries text over.
  const dr = new TaskDraft("profile-test");
  dr.follow({ id: "s1", name: "A" }, { name: "A" });
  dr.input.set_value("for A");
  dr.follow({ id: "s2", name: "B" }, { name: "B" });
  assert.equal(dr.input.value(), "", "B starts empty");
  assert.match(dr.input.placeholder, /Give B a task/);
  dr.follow({ id: "s1", name: "A" }, { name: "A" });
  assert.equal(dr.input.value(), "for A", "A's draft comes back");
  assert.equal(dr.spaceName, "A");

  const text = (p) => { const n = p.node ?? p; return n.kids.map((k) => typeof k === "string" ? k : k?.node ? text(k) : "").join(" "); };
  const find = (p, id, out = []) => { const n = p.node; if ((n.args.id ?? []).some((a) => String(a[0]).startsWith(id))) out.push(n); n.kids.forEach((k) => k?.node && find(k, id, out)); return out; };
  const d = crew.ds({ background: "#0E0E0F" });
  const t = crew.tone({ background: "#0E0E0F", foreground: "#EDEDED" });
  const view = Object.create(Profile.prototype);
  Object.assign(view, {
    part: "stage", h: {}, ops: { tasks: [{ id: "T1", assignee: PAL, status: "done", updated: Date.now() - 1000, title: "Shipped one" },
      { id: "T2", assignee: PAL, status: "open", title: "Next thing" }], approvals: [{ bot: PAL, status: "pending" }], proposals: [], stalled: {}, routines: [] },
    mem: null, brain: { mission: { statement: "Get Project Pals ready to announce", done_when: [{ done: true }, { done: false }] }, decisions: [], changelog: [], notes: [] },
    brainFor: PAL, nb: { days: [] }, nbFor: PAL, draft: new TaskDraft("profile-stage"), stageW: 900,
    role: { value: () => "", set_value() {}, focus() {} }, pinned: {}, remember: {},
  });
  const space = fixtures.spaces[0];
  const bot = crew.botOf(space);
  for (const W of [900, 520, 1400]) {
    view.stageW = W;
    const out = stagePart(view, space, bot, t, d);
    const words = text(out);
    for (const w of ["Working · 12m in #profiles", PAL, "Get Project Pals ready to announce", "Shipped", "In motion", "Needs you", "Hiccups",
      "TOPICS", "#profiles", "#review", "Review", "TASKS", "Next thing", "VAULT", "Mission", "Journal", "Brain", "MEMORY", "ABOUT", "Keeps the mod sleek"])
      assert.ok(words.includes(w), `${W}px: "${w}" in the stage`);
    assert.equal(find(out, "profile-stage-card-").length, 4, "four cards");
    assert.ok(find(out, "profile-stage-compose").length >= 1, "the composer is in the hero");
    // The stage is lit blue (working), with the pet's spot under it.
    const imgs = []; const walk = (p) => { const n = p.node; if (n.kind === "image") imgs.push(n.arg); n.kids.forEach((k) => k?.node && walk(k)); }; walk(out);
    assert.ok(imgs.includes("mods/crew-roster/icons/stage-work.svg") && imgs.includes("mods/crew-roster/icons/stage-spot-work.svg"), `${W}px: the stage's light`);
  }
  // In motion 1 working channel; Needs you: the ask and the approval.
  const cardsOut = text(stagePart(view, space, bot, t, d));
  assert.ok(cardsOut.includes("1 topic") && cardsOut.includes("1 ask · 1 approval"), "the cards' real numbers");
  // At rest: no light.
  space.tabs[0].status = "idle"; space.status = "idle";
  const rest = stagePart(view, space, bot, t, d);
  const restImgs = []; const walk2 = (p) => { const n = p.node; if (n.kind === "image") restImgs.push(n.arg); n.kids.forEach((k) => k?.node && walk2(k)); }; walk2(rest);
  assert.ok(!restImgs.some((x) => /stage-/.test(x)), "no stage light at rest");
  space.tabs[0].status = "working";

  // Side: the compact hero and the 2×2 cards on top of the Profile tab.
  view.part = "main"; view.draft = new TaskDraft("profile-main"); view.sideW = 420;
  const side = view.profileTab(space, bot, t, d, false);
  const sw = text(side);
  for (const w of ["Working · 12m in #profiles", "Shipped", "Hiccups", "FACTS", "role", "TOPICS", "MEMORY", "ROUTINES"]) assert.ok(sw.includes(w), `Side: "${w}"`);
  const cardW = find(side, "profile-main-card-").map((n) => n.args.w[0][0]);
  assert.equal(cardW.length, 4);
  assert.ok(cardW.every((w) => w * 2 + 10 <= 420 - 32), "two cards to a row");
  console.log("test_stage: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
