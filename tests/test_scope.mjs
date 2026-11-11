// Memory safety (T153), the app's side: each pal's agent starts in its own systemd scope (scoped),
// only on this machine and only when crewd's probe found that works; the command on record is never
// changed. crew-memory.json is shared rounded (memoryShare), a stale one says nothing about low memory,
// and the low-memory toast comes at most once per ten minutes (warnIfLow). wakePal starts every topic
// scoped.
// Run: node tests/test_scope.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "scope-"));
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
  mod("herdr", `
    export const fixtures = { spaces: [], runs: [], toasts: [], shared: { "crew.settings": { owner: "DeNon", head: "Orca" } } };
    export const spaces = () => fixtures.spaces, agents = () => [], panes = () => [];
    export const shared = (k) => fixtures.shared[k], setShared = (k, v) => { fixtures.shared[k] = v; };
    export const exec = async () => ({ stdout: "", stderr: "", code: 0 });
    export const theme = () => ({}), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => null, keys = () => ({});
    export const run = (name, args) => { fixtures.runs.push([name, args]); };
    export const notify = (n) => { fixtures.toasts.push(n); };
    export const openOverlay = () => {}, hc = exec, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  const crew = await import(pathToFileURL(join(dir, "crew.js")).href);
  const { fixtures } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);

  const now = Date.now();
  const on = { scope: true, noexpand: true, fresh: true, low: false };
  // scoped: the agent's command behind systemd-run --user --scope, with a unit naming the pal and topic.
  const got = crew.scoped(["claude", "--model", "opus"], { pal: "Project Pals - Herdr Mod", topic: "#memory" }, on, {});
  // --expand-environment=no: systemd 254+ would otherwise turn $VARS in the agent's arguments into values.
  assert.deepEqual(got.slice(0, 6), ["systemd-run", "--user", "--scope", "--quiet", "--collect", "--expand-environment=no"]);
  assert.match(got[6], /^--unit=pal-project-pals-herdr-mod-memory-[0-9a-z]+$/);
  assert.deepEqual(got.slice(7), ["--", "claude", "--model", "opus"]);
  assert.match(crew.scoped(["claude"], { pal: "Orca" }, { ...on, noexpand: false }, {})[5], /^--unit=/, "an older systemd: no flag");
  const again = crew.scoped(["claude"], { pal: "Orca", topic: "#ops" }, on, {});
  assert.notEqual(again[6], crew.scoped(["claude"], { pal: "Orca", topic: "#ops" }, on, {})[6], "every unit name is new");
  // Not: on another machine, without crewd's probe, when turned off, an empty command, already scoped.
  assert.deepEqual(crew.scoped(["claude"], { pal: "Orca", machine: "vps" }, on, {}), ["claude"], "another machine");
  assert.deepEqual(crew.scoped(["claude"], { pal: "Orca" }, { scope: false }, {}), ["claude"], "probe failed");
  assert.deepEqual(crew.scoped(["claude"], { pal: "Orca" }, null, {}), ["claude"], "no crewd state");
  assert.deepEqual(crew.scoped(["claude"], { pal: "Orca" }, on, { pal_scopes: false }), ["claude"], "pal_scopes: false");
  assert.equal(crew.scoped(undefined, { pal: "Orca" }, on, {}), undefined, "a bare shell stays one");
  assert.deepEqual(crew.scoped(got, { pal: "Orca" }, on, {}), got, "never wrapped twice");
  const stored = ["codex"];
  crew.scoped(stored, { pal: "X" }, on, {});
  assert.deepEqual(stored, ["codex"], "the stored argv isn't changed");
  // A pal whose name is all punctuation still gets a valid unit name.
  assert.match(crew.scoped(["claude"], { pal: "✨✨" }, on, {})[6], /^--unit=pal-x-[0-9a-z]+$/);

  // memoryShare: rounded to a tenth of a GB; stale: scope kept, low dropped.
  const mem = { at: now, total: 15120, available: 1000, floor: 1536, low: true, scope: true, scope_flags: ["--expand-environment=no"] };
  assert.deepEqual(crew.memoryShare(mem, now), { scope: true, noexpand: true, fresh: true, low: true, available: 1, total: 14.8, floor: 1.5, dropin: null });
  assert.deepEqual(crew.memoryShare({ ...mem, at: now - 6 * 60 * 1000 }, now), { scope: true, noexpand: true, fresh: false, low: false, available: null, total: 14.8, floor: 1.5, dropin: null });
  assert.equal(crew.memoryShare({ ...mem, scope_flags: [] }, now).noexpand, false);
  assert.equal(crew.memoryShare(null), null);
  assert.equal(crew.memoryLine({ ...crew.memoryShare(mem, now), low: false }), null);
  assert.match(crew.memoryLine(crew.memoryShare(mem, now)), /^1 GB available of 14\.8 GB \(warns under 1\.5 GB\)\. Sleep idle pals/);

  // warnIfLow: once per ten minutes, and only when low.
  fixtures.shared["crew.memory"] = crew.memoryShare({ ...mem, low: false }, now);
  assert.equal(crew.warnIfLow("hiring A", now), false);
  fixtures.shared["crew.memory"] = crew.memoryShare(mem, now);
  assert.equal(crew.warnIfLow("hiring A", now), true);
  assert.equal(crew.warnIfLow("hiring B", now + 60_000), false, "not again within ten minutes");
  assert.equal(crew.warnIfLow("hiring C", now + 11 * 60_000), true);
  assert.equal(fixtures.toasts.length, 2);
  assert.match(fixtures.toasts[0].title, /^Memory is low \(hiring A\)$/);
  assert.equal(fixtures.toasts[0].level, "warning");

  // wakePal: every topic it opens starts scoped; the record keeps its plain command.
  fixtures.shared["crew.memory"] = { scope: true, noexpand: true, fresh: true, low: false };
  fixtures.shared["crew.roster"] = undefined;
  const rec = { id: "b1", name: "Docs", argv: ["codex"], harness: "codex", categories: { "#general": "General", "#api": "Topics" } };
  fixtures.runs.length = 0;
  const realRun = fixtures.runs;
  // The space shows up as soon as space.new runs, so the remaining topics are opened as tabs in it.
  const origPush = realRun.push.bind(realRun);
  realRun.push = (x) => { if (x[0] === "space.new") fixtures.spaces.push({ id: "s9", name: x[1].name, machine: null, tabs: [{ id: "tb9", name: x[1].tab }] }); return origPush(x); };
  await crew.wakePal(rec);
  const opened = fixtures.runs.filter(([n]) => n === "space.new" || n === "tab.new");
  assert.equal(opened.length, 2, JSON.stringify(fixtures.runs));
  for (const [, a] of opened) {
    assert.equal(a.argv[0], "systemd-run", JSON.stringify(a));
    assert.ok(a.argv.includes("codex"));
  }
  assert.match(opened[0][1].argv[6], /^--unit=pal-docs-general-/);
  assert.match(opened[1][1].argv[6], /^--unit=pal-docs-api-/);
  assert.deepEqual(rec.argv, ["codex"]);
  // About's Memory row.
  assert.match(crew.memoryAbout({ scope: true, dropin: "theirs" }), /own scope.*your own drop-in/);
  assert.match(crew.memoryAbout({ scope: true, dropin: "none" }), /install\.sh/);
  assert.doesNotMatch(crew.memoryAbout({ scope: false, dropin: "none" }), /install/, "no systemd: nothing to add");
  assert.match(crew.memoryAbout(null), /hasn't checked/);
  console.log("scope: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
