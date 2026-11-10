// T19: the "N need you" count. Claude Code reports `blocked` from the wording of a pal's last message,
// so a pal that ends its turn asking the head pal ("Orca, should I…", "tell Orca#general when…") used
// to count as needing the owner. Checks blockedFor (who a blocked channel is waiting on), needsOf
// (what counts, and why), the tooltip text, and that blockedReports asks `hc` only about blocked
// agents and reuses an answer until the agent's report changes.
// Run: node tests/test_needs.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "needs-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    const el = () => new Proxy({}, { get: (t, k) => (k === "then" ? undefined : () => el()) });
    export const div = el, svg = el, image = el; export class View {}`);
  mod("gpui-base", `export const v_flex = () => null, h_flex = () => null;`);
  // Orca's #general asks DeNon; Herdr Mod #desk ends its turn telling Orca; #profiles asks Orca by name;
  // OMA CMZ #theme is on a prompt with no text. One terminal per blocked tab.
  mod("herdr", `
    export const fixtures = {
      spaces: [
        { id: "s1", name: "Project Pals - Herdr Mod", tabs: [
          { id: "tb1", name: "desk", status: "blocked" }, { id: "tb2", name: "profiles", status: "blocked" },
          { id: "tb3", name: "indicators", status: "working" }] },
        { id: "s2", name: "Orca", tabs: [{ id: "tb4", name: "general", status: "blocked" }] },
        { id: "s3", name: "OMA CMZ", tabs: [{ id: "tb5", name: "theme", status: "blocked" }] },
      ],
      agents: [
        { address: "t1", tab: "tb1", status: "blocked", seq: 1 }, { address: "t2", tab: "tb2", status: "blocked", seq: 1 },
        { address: "t3", tab: "tb3", status: "working", seq: 1 }, { address: "t4", tab: "tb4", status: "blocked", seq: 1 },
        { address: "t5", tab: "tb5", status: "blocked", seq: 1 },
      ],
      msgs: {
        t1: "Tell Orca#general when the Desk doc is reviewed so it can install it.",
        t2: "Orca, should I rebase onto crew/next first?",
        t4: "DeNon, do you want the 0.3.1 release tonight?",
        t5: "",
      },
      calls: [],
      shared: { "crew.settings": { owner: "DeNon", head: "Orca" } },
    };
    export const spaces = () => fixtures.spaces, agents = () => fixtures.agents, panes = () => [];
    export const shared = (k) => fixtures.shared[k], setShared = (k, v) => { fixtures.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fixtures.calls.push([cmd, ...args].join(" "));
      if (cmd === "hc" && args[0] === "get") return { stdout: JSON.stringify({ status: { state: "blocked", msg: fixtures.msgs[args[1]] ?? "" } }), stderr: "", code: 0 };
      return { stdout: "", stderr: "", code: 0 };
    };
    const nop = () => {};
    export const theme = () => ({}), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => null, keys = () => ({});
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, hc = exec, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  const crew = await import(pathToFileURL(join(dir, "crew.js")).href);
  const { fixtures } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);

  // ── who a blocked channel is waiting on ──
  const ctx = { owner: "DeNon", pals: ["Orca", "OMA CMZ", "Pals Native"] };
  const cases = [
    ["Orca, should I rebase first?", "pal"],
    ["@Orca: which branch?", "pal"],
    ["Tell Orca#general when it's reviewed.", "pal"],
    ["Ready for Orca#general to install; let me know which channel.", "pal"],
    ["Waiting for Orca to answer which branch to use.", "pal"],
    ["I'll pal tell Orca once it's done — let me know if that's wrong?", "pal"],
    ["Let OMA CMZ know when the theme lands?", "pal"],
    ["DeNon, tell Orca to install it?", "you"],               // the owner named: theirs
    ["Should I ask Orca to review this?", "you"],             // a question to the owner that mentions a pal
    ["Do you want me to tell Orca now?", "you"],
    ["Which option do you prefer, A or B?", "you"],
    ["", "you"],                                              // a prompt with no text
    ["Should I proceed with the orcas.json migration?", "you"], // "orcas" isn't the pal Orca
    ["Ping Orchestrator when done?", "you"],                  // not a pal in this crew
  ];
  for (const [msg, want] of cases) assert.equal(crew.blockedFor(msg, ctx), want, msg);
  assert.equal(crew.blockedFor("tell Orca now", { owner: "you", pals: ["Orca"] }), "pal", "no owner name set");
  assert.equal(crew.blockedFor("Ask (weird) pal, then?", { owner: "DeNon", pals: ["(weird) pal"] }), "pal", "names are escaped");

  // ── reports: only blocked agents are asked, and an answer is reused until its seq changes ──
  let reports = await crew.blockedReports({});
  assert.deepEqual(Object.keys(reports).sort(), ["t1", "t2", "t4", "t5"]);
  assert.equal(fixtures.calls.filter((c) => c.startsWith("hc get")).length, 4);
  assert.ok(!fixtures.calls.some((c) => c.includes(" t3 ")), "a working agent isn't asked");
  fixtures.calls.length = 0;
  reports = await crew.blockedReports(reports);
  assert.equal(fixtures.calls.length, 0, "unchanged reports are reused");
  fixtures.agents[3].seq = 2;
  fixtures.msgs.t4 = "DeNon, do you want the 0.3.1 release now?";
  reports = await crew.blockedReports(reports);
  assert.deepEqual(fixtures.calls, ["hc get t4 --json"], "only the changed one is asked again");

  // ── what counts, and why ──
  const ops = {
    approvals: [{ rule: "push", bot: "OMA CMZ", channel: "dotfiles" }],
    stalled: { t9: { bot: "Pals Native", channel: "shell" } },
    proposals: [{ kind: "rule", pal: "Orca" }],
  };
  const n = crew.needsOf(fixtures.spaces, ops, reports);
  assert.equal(n.asks, 2, "Orca's question to DeNon and the textless prompt count; the two to Orca don't");
  assert.equal(n.toPals, 2);
  assert.deepEqual(n.toPalItems.map((x) => x.tab).sort(), ["tb1", "tb2"]);
  assert.equal(n.approvals, 1); assert.equal(n.stuck, 1); assert.equal(n.proposals, 1);
  assert.equal(n.count, 5);
  assert.deepEqual(n.items.map((x) => x.why), ["question", "question", "approval", "stuck", "proposal"]);
  assert.equal(n.items[0].label, "Orca #general");

  const tip = crew.needsTooltip(n);
  assert.equal(tip, "Question: Orca #general · Question: OMA CMZ #theme · Approval: push · OMA CMZ #dotfiles · Stuck: Pals Native #shell · Proposal: rule · Orca · not counted: 2 asking a pal");
  // More than five reasons are summed up.
  const many = crew.needsOf(fixtures.spaces, { ...ops, approvals: Array.from({ length: 6 }, () => ops.approvals[0]) }, reports);
  assert.match(crew.needsTooltip(many), / · \+5 more · not counted: 2 asking a pal$/);

  // Without reports (hc unreachable), every blocked channel still counts: fail toward the owner.
  assert.equal(crew.needsOf(fixtures.spaces, {}, {}).asks, 4);
  // A tab with two blocked agents counts unless both are asking a pal.
  fixtures.agents.push({ address: "t6", tab: "tb1", status: "blocked", seq: 1 });
  fixtures.msgs.t6 = "Which of these should I keep?";
  reports = await crew.blockedReports(reports);
  assert.equal(crew.needsOf(fixtures.spaces, {}, reports).asks, 3);
  assert.equal(crew.needsTooltip({ count: 0, items: [] }), "");
  // Desk cards waiting on the owner count too, with why (the same filter as Home's): needs you, or
  // sent to the owner; drafts and other open cards don't.
  const cards = [
    { id: "c-111111", status: "needs you", tray: "helper", title: "Pick a palette", from: "Helper#build", last: { note: "which one?" } },
    { id: "c-222222", status: "queued", tray: "_owner", title: "Can I push?", from: "Worker#general" },
    { id: "c-333333", status: "draft", tray: "_drafts", title: "An idea", from: "MUSE#ideas" },
    { id: "c-444444", status: "seen", tray: "helper", title: "Do a thing", from: "Worker#general" },
  ];
  const waiting = crew.needsYouCards(cards);
  assert.deepEqual(waiting.map((c) => c.id), ["c-111111", "c-222222"]);
  assert.equal(waiting[0].note, "which one?");
  const withCards = crew.needsOf(fixtures.spaces, {}, reports, waiting);
  assert.equal(withCards.cards, 2);
  assert.equal(withCards.count, crew.needsOf(fixtures.spaces, {}, reports).count + 2);
  assert.match(crew.needsTooltip(withCards), /Card: Pick a palette · Helper/);
  console.log("needs: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
