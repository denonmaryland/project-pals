// The proposal review dialog (mods/crew-proposal; Pals Lite, T217), headless against single-use
// stand-ins: it shows every line of what Accept would accept (Codex's Pals Lite review: a 400-line
// cap left lines unseen under an enabled Accept), Accept sends the shown proposal's sha and Decline
// declines, both as the owner's click with a token, and neither runs twice while busy.
// Run: node tests/test_proposal_dialog.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "proposal-dialog-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    export const clicks = new Map(), texts = [];
    export const reset = () => { clicks.clear(); texts.length = 0; };
    const el = () => {
      const p = new Proxy(function () {}, {
        get: (t, k) => {
          if (k === "then") return undefined;
          if (t.__attached && typeof k === "string" && !k.startsWith("__")) throw new Error(\`element changed after it was added to a parent (.\${k})\`);
          if (k === "when") return (c, f) => (c ? f(p) : p);
          if (k === "id") return (id) => { p.__id = id; return p; };
          if (k === "on_click") return (f) => { if (p.__id) clicks.set(p.__id, f); return p; };
          const take = (c) => { if (typeof c === "string") texts.push(c); else if (c == null) throw new Error("child(undefined)"); else { if (c.__attached) throw new Error("two parents"); c.__attached = true; } };
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
    class St { constructor(o) { this.v = o?.value ?? ""; } on() { return true; } value() { return this.v; } set_value(v) { this.v = v; } focus() {} set_auto_grow() {} }
    export const TextareaState = { new: (o) => new St(o) }, InputState = { new: (o) => new St(o) };
    export const Textarea = { new: () => div() }, Input = { new: () => div() }, TextView = { markdown: () => div() };`);
  mod("herdr", `
    export const fx = { calls: [], files: {}, closed: [], props: { id: "p-big", overlay: "ov1" }, show: null, gate: null };
    export const spaces = () => [{ id: "s1", name: "Juniper", tabs: [] }], agents = () => [], panes = () => [], shared = () => undefined, setShared = () => {};
    export const exec = async (cmd, args) => {
      const name = String(cmd).split("/").pop();
      fx.calls.push([name, ...(args ?? [])]);
      if (name === "pal" && args[0] === "proposal" && args[1] === "show") return { stdout: JSON.stringify(fx.show), stderr: "", code: 0 };
      if (name === "pal" && fx.gate) await fx.gate;
      return { stdout: "ok\\n", stderr: "", code: 0 };
    };
    export const hc = async () => ({ stdout: "", stderr: "", code: 0 });
    export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", keys = () => [], settings = () => ({});
    export const layout = () => null, run = () => {}, notify = () => {}, nextCommand = () => new Promise(() => {});
    export const openOverlay = () => "ov", closeOverlay = (id) => { fx.closed.push(id); };
    export const readTextFile = async (p) => fx.files[p] ?? null, writeTextFile = async (p, v) => { fx.files[p] = v; }, knownAgents = async () => [];
    export const props = () => fx.props, watchFolder = () => new Promise(() => {}), focused = () => null;`);
  for (const f of ["worlds.js", "crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "machines.js", "helperlog.js"]) {
    try { copyFileSync(join(root, "lib", f), join(dir, f)); } catch { /* not every lib file exists on every branch */ }
  }
  copyFileSync(join(root, "mods", "crew-proposal", "main.js"), join(dir, "crew-proposal.mjs"));
  const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
  const { clicks, texts, reset } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
  const { default: Dialog } = await import(pathToFileURL(join(dir, "crew-proposal.mjs")).href);
  const tick = () => new Promise((r) => setTimeout(r, 15));
  const cx = { focus_handle: () => ({ focus() {} }), timer: { after: (_ms, f) => f(cx), every: () => {} }, notify: () => {}, spawn: (f) => f(cx), stop_propagation: () => {} };
  const pals = () => fx.calls.filter((c) => c[0] === "pal").map((c) => c.slice(1));

  // A 450-line AGENTS.md proposal: every line is shown, the last one included.
  const proposed = Array.from({ length: 450 }, (_, i) => `rule ${i + 1}: keep it short`).join("\n") + "\nLAST LINE, easy to miss";
  const diff = "--- AGENTS.md now\n+++ AGENTS.md proposed\n@@ -0,0 +1,451 @@\n" + proposed.split("\n").map((l) => `+${l}`).join("\n");
  fx.show = { id: "p-big", kind: "agents", pal: "Juniper", by: "Juniper#docs", status: "pending", file: "AGENTS.md", text: proposed, text_sha: "abc123", diff, current: "" };
  const v = new Dialog(); v.init({}, cx); await tick();
  reset(); v.render(cx);
  const shown = texts.filter((x) => /^\+rule \d+: keep it short$/.test(x));
  assert.equal(shown.length, 450, "all 450 proposed lines are on screen (none cut)");
  assert.ok(texts.includes("+LAST LINE, easy to miss"), "the last line too");
  assert.ok(texts.some((x) => /^454 lines, all here: scroll to read them$/.test(x)), "it says how many lines there are");
  assert.ok(texts.includes("Juniper#docs proposes a change to AGENTS.md"));

  // Accept: the owner's click with a token, for exactly the shown proposal and its sha.
  fx.calls.length = 0;
  clicks.get("pr-go")(null, cx); await tick();
  const acc = pals().find((c) => c[0] === "proposal" && c[1] === "accept");
  assert.deepEqual(acc.slice(0, 5), ["proposal", "accept", "p-big", "--text-sha", "abc123"]);
  assert.equal(acc[5], "--click", "the owner's click");
  assert.ok(Object.keys(fx.files).some((p) => p.includes("/data/crew-clicks/") && JSON.parse(fx.files[p]).args.join(" ") === "proposal accept p-big --text-sha abc123"));
  assert.ok(fx.closed.includes("ov1"), "it closes once decided");

  // Decline, and no second decision while the first is on its way.
  const w = new Dialog(); w.init({}, cx); await tick();
  let release; fx.gate = new Promise((r) => { release = r; });
  fx.calls.length = 0;
  reset(); w.render(cx);
  clicks.get("pr-cancel")(null, cx);
  reset(); w.render(cx);
  clicks.get("pr-cancel")(null, cx);
  clicks.get("pr-go")?.(null, cx);
  release(); fx.gate = null; await tick();
  assert.equal(pals().filter((c) => c[0] === "proposal" && (c[1] === "decline" || c[1] === "accept")).length, 1, "one decision only");
  assert.deepEqual(pals().find((c) => c[1] === "decline").slice(0, 3), ["proposal", "decline", "p-big"]);

  // A proposal that's no longer pending: no Accept, the button closes.
  fx.show = { ...fx.show, status: "accepted" };
  const z = new Dialog(); z.init({}, cx); await tick();
  reset(); z.render(cx);
  assert.ok(texts.includes("Already accepted.") && !clicks.has("pr-go"), "nothing to decide");
  console.log("ok: the proposal dialog");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
