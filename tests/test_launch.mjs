// The Desk stage 1 (§6.7): Claude Code pals start with prompt suggestions off, on their own command
// line only (palArgv, applied by launchSpec and when a pal wakes); other brains, an argv that already
// passes --settings, and "pal_prompt_suggestions": "keep" are left alone. agy still takes its first
// task as -i (launchSpec, PR #1).
// Run: node tests/test_launch.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "launch-"));
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
  for (const f of ["worlds.js", "crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  const crew = await import(pathToFileURL(join(dir, "crew.js")).href);
  const { fixtures } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const OFF = ["--settings", '{"promptSuggestionEnabled":false}'];

  assert.deepEqual(crew.palArgv(["claude", "--dangerously-skip-permissions"], "claude"), ["claude", "--dangerously-skip-permissions", ...OFF]);
  assert.deepEqual(crew.palArgv(["/opt/mise/claude"], "my-claude"), ["/opt/mise/claude", ...OFF], "found by its program too");
  assert.deepEqual(crew.palArgv(["codex"], "codex"), ["codex"]);
  assert.deepEqual(crew.palArgv(["agy"], "agy"), ["agy"]);
  assert.deepEqual(crew.palArgv(["claude", "--settings", "/x.json"], "claude"), ["claude", "--settings", "/x.json"]);
  assert.deepEqual(crew.palArgv(["claude", "--settings={}"], "claude"), ["claude", "--settings={}"]);
  assert.equal(crew.palArgv(undefined, "claude"), undefined);
  const stored = ["claude"];
  crew.palArgv(stored, "claude");
  assert.deepEqual(stored, ["claude"], "the stored argv isn't changed");

  // launchSpec: the flag goes on every launch; the task stays separate (agy: -i).
  assert.deepEqual(crew.launchSpec("claude", ["claude"], "hi"), { argv: ["claude", ...OFF], task: "hi" });
  assert.deepEqual(crew.launchSpec("claude", ["claude"], ""), { argv: ["claude", ...OFF], task: undefined });
  assert.deepEqual(crew.launchSpec("agy", ["agy"], "hi"), { argv: ["agy", "-i", "hi"], task: undefined });

  fixtures.shared["crew.settings"] = { ...fixtures.shared["crew.settings"], pal_prompt_suggestions: "keep" };
  assert.deepEqual(crew.palArgv(["claude"], "claude"), ["claude"], "keep: left on");
  // The Desk's Claude Code mod (stage 5): Claude Code pals load it with --plugin-dir; nothing else does.
  fixtures.shared["crew.settings"] = { owner: "DeNon", head: "Orca", claude_mod: "/h/.claude/project-pals/pals" };
  assert.deepEqual(crew.palArgv(["claude"], "claude"), ["claude", "--plugin-dir", "/h/.claude/project-pals/pals", ...OFF]);
  assert.deepEqual(crew.palArgv(["codex"], "codex"), ["codex"], "not other brains");
  assert.deepEqual(crew.palArgv(["claude", "--plugin-dir", "/mine"], "claude"), ["claude", "--plugin-dir", "/mine", ...OFF], "one already given is kept");
  // Codex pals get the Desk's MCP server on their command line (stage 6); a pal that names its own keeps it.
  fixtures.shared["crew.settings"] = { owner: "DeNon", head: "Orca", codex_mcp: "/h/.local/bin/crew-mcp" };
  assert.deepEqual(crew.palArgv(["codex", "--no-daemon"], "codex"), ["codex", "--no-daemon", "-c", 'mcp_servers.pals.command="/h/.local/bin/crew-mcp"']);
  assert.deepEqual(crew.palArgv(["codex", "-c", "mcp_servers.pals.command=x"], "codex"), ["codex", "-c", "mcp_servers.pals.command=x"]);
  assert.deepEqual(crew.palArgv(["agy"], "agy"), ["agy"]);
  console.log("launch: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
