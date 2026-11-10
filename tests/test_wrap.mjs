// Full sentences wrap; names, paths and list rows may stay one line (DeNon 2026-11-09: the
// "Updated to 0.4.0" dialog cut "Herdr reloaded the mods. Your pals, rooms, memory and…").
// The shared dialog header and footer are drawn for real against stand-ins (like test_stage.mjs);
// the other sentence sites are checked in the source.
// Run: node tests/test_wrap.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dts = readFileSync(join(root, "mods/crew-command/gpui-kit.d.ts"), "utf8");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
const dir = mkdtempSync(join(tmpdir(), "wrap-"));
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
    export const spaces = () => [], panes = () => [], agents = () => [];
    const sh = {}; export const shared = (k) => sh[k], setShared = (k, v) => { sh[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED" });
    export const home = () => "/home/x", appHome = () => "/home/x/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => ({}), keys = () => ({});
    const nop = () => {}, later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "factories.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  const crew = await import(pathToFileURL(join(dir, "crew.js")).href);
  const d = crew.ds({ background: "#0E0E0F" });

  // The element whose own text is `s`, anywhere under p.
  const holder = (p, s) => { const n = p.node; if (n.kids.includes(s)) return n; for (const k of n.kids) { const f = k?.node && holder(k, s); if (f) return f; } return null; };

  const SENTENCE = "Herdr reloaded the mods. Your pals, rooms, memory and tasks are as they were.";
  const head = crew.sheetHeader(d, { title: "Updated to 0.4.0", sub: SENTENCE, onClose() {} });
  const subEl = holder(head, SENTENCE);
  assert.ok(subEl, "the header shows the sentence");
  assert.ok(!subEl.calls.includes("truncate"), "a dialog's subtitle wraps, never cut to 'memory and…'");
  const title = holder(head, "Updated to 0.4.0");
  assert.ok(title && !title.calls.includes("truncate"));

  const HINT = "Enter adds the task · Shift+Enter for a new line · images by pasting or dropping them";
  const foot = crew.sheetFooter(d, { hint: HINT, onCancel() {}, primary: "Add", onPrimary() {} });
  const hintEl = holder(foot, HINT);
  assert.ok(hintEl && !hintEl.calls.includes("truncate"), "a dialog's footer hint wraps");
  assert.ok(hintEl.calls.includes("flex_1"), "and takes the room beside the buttons");

  // Elsewhere: the line drawing each sentence must not .truncate() it.
  const src = (f) => readFileSync(join(root, f), "utf8").split("\n");
  const sites = [
    ["mods/crew-update/main.js", "child(h.detail)"],                              // release-note highlights
    ["mods/crew-desk-settings/main.js", "text_color(d.fg3).child(sub)"],          // what a Desk setting does
    ["mods/crew-routines/main.js", "text_color(t.dim).child(sub)"],               // the routines dialog's subtitle
    ["mods/crew-routines/main.js", "Skipped while the pal is busy"],
    ["mods/crew-home/main.js", "child(sp.sub ?? \"\")"],                          // the review's who line
    ["mods/crew-home/main.js", "${rec.why}"],                                    // the recommendation's why
    ["mods/crew-home/main.js", "The asker didn't pick one"],
    ["mods/crew-home/main.js", "child(op.does || \"\")"],                         // an option's "does" (rows)
    ["mods/crew-home/main.js", "child(op.does || \" \")"],                        // and (cards)
  ];
  for (const [f, mark] of sites) {
    const lines = src(f).filter((l) => l.includes(mark));
    assert.ok(lines.length, `${f}: "${mark}" is still drawn`);
    for (const l of lines) assert.ok(!l.includes(".truncate()"), `${f}: "${mark}" wraps`);
  }
  // A Needs-you card's sentence wraps; only a command (mono) stays on one line.
  assert.ok(src("mods/crew-home/main.js").some((l) => l.includes("const line = sub == null") && l.includes("when(mono, (el) => el.truncate())")));
  // Boxes holding a wrapping sentence grow instead of clipping it.
  const home = readFileSync(join(root, "mods/crew-home/main.js"), "utf8");
  for (const box of ['id(`need-${n.key}`).min_h(CARD)', 'id("rv-rec").min_h(52)', 'id(`rv-o-${j}`).min_h(40)', 'min_w(0).min_h(72)'])
    assert.ok(home.includes(box), `crew-home: ${box}`);
  assert.ok(readFileSync(join(root, "mods/crew-desk-settings/main.js"), "utf8").includes("flex().min_h(48)"), "Desk settings rows grow");
  console.log("test_wrap: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
