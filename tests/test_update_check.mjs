// T64 (2026-11-09): an About left open since the 0.4.0 update still said "You're up to date"
// after 0.4.1 shipped: it asked GitHub only when it opened, and its line didn't say what GitHub's
// newest was or when it asked. About and the update dialog are run here against stand-ins (like
// test_wrap.mjs): with a clock moved on, an open copy asks GitHub again; and what they draw names
// the newest version and the time of the check, or the failed check.
// Run: node tests/test_update_check.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dts = readFileSync(join(root, "mods/crew-command/gpui-kit.d.ts"), "utf8");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
const dir = mkdtempSync(join(tmpdir(), "update-check-"));
const realNow = Date.now;
// Today at noon, not the real now (T149): the clock moves 20 minutes ahead below, and the time format
// compares with the real date (new Date()), so a run at 23:40 crossed midnight and showed a date.
const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime(); };
let now = noon();
Date.now = () => now;
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    const OK = new Set(${JSON.stringify(METHODS)});
    export function el(kind, arg) {
      const node = { kind, arg, calls: [], kids: [] };
      const p = new Proxy(node, { get(t, k) {
        if (k === "node") return t;
        if (typeof k !== "string" || k === "then") return undefined;
        if (!OK.has(k)) throw new Error("not a gpui-kit method: ." + k + "()");
        return (...a) => {
          t.calls.push(k);
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
    const state = () => ({ on() {}, value: () => "", set_value() {}, focus() {}, set_auto_grow() {} });
    export const InputState = { new: state }, TextareaState = { new: state }, EditorState = { new: state };
    export const Input = { new: () => el("div") }, Textarea = { new: () => el("div") }, Editor = { new: () => el("div") };
    export const TextView = { markdown: (id, md) => el("md", md) };
  `);
  mod("herdr", `
    export const world = { files: {}, calls: [], props: {} };
    export const spaces = () => [], panes = () => [], agents = () => [];
    const sh = {}; export const shared = (k) => sh[k], setShared = (k, v) => { sh[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED" });
    export const home = () => "/home/x", appHome = () => "/home/x/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => world.props, keys = () => ({});
    const nop = () => {};
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = async (cmd, args) => {
      world.calls.push([cmd, ...(args ?? [])]);
      if (String(cmd).endsWith("/pal") && args[0] === "update" && args[1] === "check") {
        world.files["data/crew-update.json"] = JSON.stringify(world.github);   // what pal update check writes
        return { stdout: "{}", stderr: "", code: 0 };
      }
      return { stdout: "0", stderr: "", code: 0 };
    };
    export const hc = exec, writeTextFile = async () => {}, knownAgents = async () => [];
    export const readTextFile = async (p) => world.files[p.replace("/home/x/.config/herdr-app/", "")] ?? null;
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  for (const m of ["crew-about", "crew-update"]) copyFileSync(join(root, "mods", m, "main.js"), join(dir, `${m}.js`));
  const crew = await import(pathToFileURL(join(dir, "crew.js")).href);
  const { world } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);

  // checkLine / checkDue on their own.
  const at = (h, m) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d.getTime() / 1000; };
  const s = now / 1000;
  assert.equal(crew.checkLine({ latest: "0.4.0", checked: at(15, 19) }, s), "GitHub's newest: 0.4.0 · checked 15:19");
  assert.equal(crew.checkLine({ checked: 0 }, s), "Not checked yet");
  assert.equal(crew.checkLine({ latest: null, checked: at(9, 5) }, s), "No releases on GitHub · checked 09:05");
  assert.match(crew.checkLine({ latest: "0.4.0", checked: s - 2 * 86400 }, s), /checked [A-Z][a-z]{2} \d+ \d\d:\d\d$/, "an older check names its day");
  const failed = crew.checkLine({ latest: "0.4.0", checked: at(15, 19), tried: at(15, 45), error: "couldn't reach GitHub" }, s);
  assert.equal(failed, "Couldn't check at 15:45 (couldn't reach GitHub). Last answer: GitHub's newest: 0.4.0 · checked 15:19");
  assert.equal(crew.checkLine({ latest: "0.4.1", checked: at(15, 50), tried: at(15, 45), error: "old" }, s),
    "GitHub's newest: 0.4.1 · checked 15:50", "a failure older than the last answer is over");
  assert.equal(crew.checkDue(s - 60, 0, s), false);
  assert.equal(crew.checkDue(s - 11 * 60, 0, s), true);
  assert.equal(crew.checkDue(s - 11 * 60, s - 60, s), false, "not more than once per 10 minutes");

  // A stand-in cx: spawned tasks are collected so the test can wait for them; timers are kept.
  const harness = () => {
    const tasks = [], timers = [];
    const cx = { notify() {}, spawn: (f) => { const p = Promise.resolve().then(() => f(cx)); tasks.push(p); return p; },
      timer: { every: (ms, f) => timers.push({ ms, f }) }, focus_handle: () => ({ focus() {} }), stop_propagation() {} };
    const settle = async () => { for (let i = 0; i < 6; i++) await Promise.all(tasks.splice(0)); };
    const tick = async (ms) => { for (const t of timers) if (t.ms === ms) t.f(cx); await settle(); };
    return { cx, settle, tick };
  };
  const texts = (p, out = []) => { const n = p?.node; if (!n) return out; for (const k of n.kids) typeof k === "string" ? out.push(k) : texts(k, out); return out; };
  const checks = () => world.calls.filter((c) => String(c[0]).endsWith("/pal") && c[1] === "update" && c[2] === "check").length;
  const install = JSON.stringify({ version: "0.4.0", repo: "denonmaryland/project-pals" });

  // About, opened right after the 0.4.0 update (checked a minute ago): no new check yet.
  now = noon();
  world.files = { "data/crew-install.json": install,
    "data/crew-update.json": JSON.stringify({ checked: now / 1000 - 60, latest: "0.4.0", repo: "denonmaryland/project-pals" }) };
  world.calls = [];
  const About = (await import(pathToFileURL(join(dir, "crew-about.js")).href)).default;
  const a = new About(), ha = harness();
  a.init({}, ha.cx);
  await ha.settle();
  assert.equal(checks(), 0, "a one-minute-old answer isn't asked again");
  let shown = texts(a.render(ha.cx)).join(" | ");
  assert.match(shown, /You're up to date/);
  assert.match(shown, /You have 0\.4\.0\. GitHub's newest: 0\.4\.0 · checked \d\d:\d\d/, "it says what GitHub had and when");

  // Left open: 0.4.1 ships, 20 minutes pass. The 3 s reload asks GitHub again by itself (T64).
  world.github = { checked: (now + 20 * 60000) / 1000, latest: "0.4.1", name: "Project Pals 0.4.1", published: "2026-11-09T23:35:00Z", repo: "denonmaryland/project-pals" };
  now += 20 * 60000;
  await ha.tick(3000);
  await ha.settle();
  assert.equal(checks(), 1, "an open About asks GitHub again once the answer is over 10 minutes old");
  shown = texts(a.render(ha.cx)).join(" | ");
  assert.match(shown, /Project Pals 0\.4\.1 is available/);
  assert.match(shown, /checked \d\d:\d\d/);
  assert.ok(texts(a.render(ha.cx)).some((t) => t === "Update to 0.4.1"), "and offers the update");
  await ha.tick(3000);
  assert.equal(checks(), 1, "not again right away");

  // A failed check after the last answer: About says so, with the last answer's version and time.
  world.files["data/crew-update.json"] = JSON.stringify({ checked: now / 1000 - 3600, latest: "0.4.0", tried: now / 1000 - 60, error: "couldn't reach GitHub", repo: "r" });
  await ha.tick(3000);
  shown = texts(a.render(ha.cx)).join(" | ");
  assert.match(shown, /Couldn't check for updates/);
  assert.match(shown, /Couldn't check at \d\d:\d\d \(couldn't reach GitHub\)\. Last answer: GitHub's newest: 0\.4\.0/);

  // The update dialog (status pill, gear): the same, on its 60 s timer.
  now = noon();
  world.files = { "data/crew-install.json": install,
    "data/crew-update.json": JSON.stringify({ checked: now / 1000 - 60, latest: "0.4.0", repo: "denonmaryland/project-pals" }) };
  world.calls = [];
  world.props = {};
  const Update = (await import(pathToFileURL(join(dir, "crew-update.js")).href)).default;
  const u = new Update(), hu = harness();
  u.init({}, hu.cx);
  await hu.settle();
  assert.equal(checks(), 0);
  shown = texts(u.render(hu.cx)).join(" | ");
  assert.match(shown, /You have 0\.4\.0\. GitHub's newest: 0\.4\.0 · checked \d\d:\d\d/);
  world.github = { checked: (now + 20 * 60000) / 1000, latest: "0.4.1", repo: "denonmaryland/project-pals" };
  now += 20 * 60000;
  await hu.tick(60000);
  await hu.settle();
  assert.equal(checks(), 1, "an open update dialog asks GitHub again when due");
  assert.match(texts(u.render(hu.cx)).join(" | "), /Project Pals 0\.4\.1 is out/);

  // The gear's Check for updates (props check: true) always asks, however fresh the answer.
  world.calls = [];
  world.props = { check: true };
  world.files["data/crew-update.json"] = JSON.stringify({ checked: now / 1000 - 5, latest: "0.4.1", repo: "r" });
  const g = new Update(), hg = harness();
  g.init({}, hg.cx);
  await hg.settle();
  assert.equal(checks(), 1, "the gear's check always asks GitHub");

  console.log("test_update_check: ok");
} finally {
  Date.now = realNow;
  rmSync(dir, { recursive: true, force: true });
}
