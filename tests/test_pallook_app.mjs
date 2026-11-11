// Pal look in the app, outside Herdr: crew.js's pet lookup under every preset, and the Settings
// dialog (mods/crew-pallook) drawn and clicked against stand-ins for gpui-kit, gpui-base and herdr.
// Each element method the dialog calls must be one gpui-kit declares, so a mistyped style fails here.
// Run: node tests/test_pallook_app.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), "utf8");
const dts = read("mods/crew-command/gpui-kit.d.ts");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
assert.ok(METHODS.length > 500, "read gpui-kit's element methods");

const dir = mkdtempSync(join(tmpdir(), "pallook-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    const OK = new Set(${JSON.stringify(METHODS)});
    export function el(kind, arg) {
      const node = { kind, arg, calls: [], args: {}, kids: [] };
      const p = new Proxy(node, { get(t, k) {
        if (k === "node") return t;
        if (typeof k !== "string" || k === "then") return undefined;
        if (!OK.has(k)) throw new Error("not a gpui-kit method: ." + k + "()");
        return (...a) => {
          t.calls.push(k);
          t.args[k] = a;
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
    const input = () => { let v = ""; return { on() {}, value: () => v, set_value(x) { v = x; }, focus() {} }; };
    export const InputState = { new: (o) => { const s = input(); s.set_value(o?.value ?? ""); return s; } }, VirtualListScrollHandle = { new: input };
    export const Input = { new: () => el("div") }, Scrollbar = { vertical: () => el("div") };
    export const v_virtual_list = () => el("div");
  `);
  // Six open pals (the head, two projects, an unhired space), a closed one, two factories.
  mod("herdr", `
    const tab = (id) => [{ id, name: "main", status: "idle", changed_at: null, active: true }];
    export const fixtures = {
      spaces: [
        { id: "s0", name: "Orca", folder: "/h/god", index: 0, status: "idle", tabs: tab("t0") },
        { id: "s1", name: "Lumen - Web", folder: "/h/Projects/lumen-web", index: 1, status: "idle", tabs: tab("t1") },
        { id: "s2", name: "Lumen - API", folder: "/h/Projects/lumen-api", index: 2, status: "idle", tabs: tab("t2") },
        { id: "s3", name: "Harbor - App", folder: "/h/Projects/harbor", index: 3, status: "idle", tabs: tab("t3") },
        { id: "s4", name: "Harbor - Sync", folder: "/h/Projects/harbor-sync", index: 4, status: "idle", tabs: tab("t4") },
        { id: "s5", name: "scratch", folder: "/h/scratch", index: 5, status: "idle", tabs: tab("t5") },
      ],
      panes: [
        { tab: "t1", terminal: "a", program: { agent: true, key: "claude", name: "Claude Code" } },
        { tab: "t2", terminal: "b", program: { agent: true, key: "codex", name: "Codex" } },
        { tab: "t3", terminal: "c", program: { agent: true, key: "gemini", name: "Gemini" } },
      ],
      shared: {
        crew: { bots: [{ id: "b0", name: "Orca", space: "s0", god: true }, { id: "b1", name: "Lumen - Web", space: "s1", look: { color: "#33cc88" } },
          { id: "b2", name: "Lumen - API", space: "s2" }, { id: "b3", name: "Harbor - App", space: "s3" }, { id: "b4", name: "Harbor - Sync", space: "s4", harness: "hermes" },
          { id: "b9", name: "Kite - Core", folder: "/h/Projects/kite", harness: "claude" }] },
        "crew.marks": { pals: {}, tabs: {}, groups: [] },
        "crew.settings": {},
        "crew.factories": { factories: [{ id: "f1", name: "Platform", color: "#ff00aa" }], pals: { "Harbor - App": "f1", "Harbor - Sync": "f1" }, current: "default" },
      },
      execs: [],
    };
    export const spaces = () => fixtures.spaces, panes = () => fixtures.panes, agents = () => [];
    export const shared = (k) => fixtures.shared[k], setShared = (k, v) => { fixtures.shared[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED", accent: "#7aa2f7", ansi1: "#f7768e", ansi2: "#9ece6a", ansi3: "#e0af68", ansi4: "#7aa2f7", ansi5: "#bb9af7", ansi6: "#7dcfff" });
    export const home = () => "/h", appHome = () => "/h/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => ({ overlay: "o1" }), keys = () => ({});
    export const machines = () => [], terminals = () => [];
    const nop = () => {};
    export const run = nop, notify = nop, openOverlay = (o) => { fixtures.opened = o; }, closeOverlay = (id) => { fixtures.closed = id; }, nextCommand = () => new Promise(() => {});
    export const exec = async (cmd, args) => { fixtures.execs.push([cmd, args]); return { stdout: "", stderr: "", code: 0 }; };
    export const hc = async () => ({ stdout: "", stderr: "", code: 0 }), readTextFile = async () => fixtures.file ?? null, writeTextFile = async (_p, text) => { fixtures.file = text; }, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods/crew-pallook/main.js"), join(dir, "pallook-dialog.js"));
  copyFileSync(join(root, "mods/crew-look/main.js"), join(dir, "look-dialog.js"));
  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const pets = await import(url("pets.js"));
  const pl = await import(url("pallook.js"));
  const { fixtures } = await import(url("node_modules/herdr/index.js"));
  const { default: Dialog } = await import(url("pallook-dialog.js"));
  const { default: LookDialog } = await import(url("look-dialog.js"));

  const setLook = (palLook) => { fixtures.shared["crew.settings"] = palLook ? { palLook } : {}; };
  const bots = () => fixtures.spaces.map((s) => crew.botOf(s));
  const colors = () => bots().map((b) => crew.petOf(b).color);

  // ---------- the pet lookup ----------
  // Today's look: nothing changes, and a pet's key is what it was before Pal look existed.
  setLook(null);
  const before = bots().map((b) => crew.petOf(b));
  assert.equal(crew.lookOf(bots()[1]), null);
  assert.equal(before[1].color, "#33cc88", "a hand-picked colour");
  assert.ok(before.every((p) => !p.tones && !p.screen));
  assert.equal(pets.petKey(before[2]), pets.petKey(pets.petSpec({ name: "Lumen - API", accessory: "codex", color: before[2].color })), "the old key");
  assert.equal(crew.palLook().pets, "own");

  // All one colour; the pal's own pick stays on its record and comes back.
  setLook({ pets: "one", color: "#4fa8ff" });
  assert.ok(colors().every((c) => c === "#4fa8ff"));
  assert.equal(crew.ownColorOf(bots()[1]), "#33cc88");
  assert.equal(crew.petOf(bots()[1], null).color, "#33cc88", "drawn in another look on request");
  setLook(null);
  assert.equal(crew.petOf(bots()[1]).color, "#33cc88");

  // Split by count: down the list's order, head first; a pal's colour doesn't move with its state.
  setLook({ pets: "split", count: 2 });
  const [A, B] = pl.SPLIT_PALETTES[0].colors;
  assert.deepEqual(colors(), [A, A, A, B, B, B], "6 open pals: 3 + 3");
  fixtures.spaces[4].status = "blocked";   // "who needs you most" would put it first
  assert.deepEqual(colors(), [A, A, A, B, B, B], "steady when a state changes");
  fixtures.spaces[4].status = "idle";
  setLook({ pets: "split", count: 3 });
  assert.equal(new Set(colors()).size, 3);
  // A closed pal is split among the closed ones.
  assert.equal(crew.petOf({ ...fixtures.shared.crew.bots[5], harness: "claude" }).color, pl.SPLIT_PALETTES[0].colors[0]);
  // Your arrangement moves the split with it.
  fixtures.shared["crew.marks"] = { pals: { b4: { pin: 1 } }, tabs: {}, groups: [] };
  setLook({ pets: "split", count: 2 });
  assert.equal(crew.petOf(crew.botOf(fixtures.spaces[4])).color, A, "a pinned pal is near the top");
  assert.equal(crew.petOf(crew.botOf(fixtures.spaces[2])).color, B);
  fixtures.shared["crew.marks"] = { pals: {}, tabs: {}, groups: [] };

  // By brain: the live brain, else the record's.
  setLook({ pets: "brain" });
  { const c = colors();
    assert.equal(c[1], pl.BRAIN_COLORS.claude); assert.equal(c[2], pl.BRAIN_COLORS.codex); assert.equal(c[3], pl.BRAIN_COLORS.gemini);
    assert.equal(c[4], pl.BRAIN_COLORS.hermes); assert.equal(c[5], pl.BRAIN_COLORS.none, "no brain"); }

  // By state: a colour per state, and a screen that follows when it matches.
  setLook({ pets: "state", screen: "match" });
  { const p = crew.petOf(bots()[1]); assert.equal(p.tones.work, pl.STATE_COLORS.work); assert.deepEqual(p.screen, p.tones);
    assert.notEqual(pets.petKey(p), pets.petKey(before[1])); }

  // By project, by factory (a factory's own colour).
  setLook({ pets: "group", group: "project" });
  { const c = colors(); assert.equal(c[1], c[2], "Lumen"); assert.equal(c[3], c[4], "Harbor"); assert.notEqual(c[1], c[3]); assert.notEqual(c[5], c[1]); }
  setLook({ pets: "group", group: "factory" });
  { const c = colors(); assert.equal(c[3], "#ff00aa"); assert.equal(c[4], "#ff00aa"); assert.equal(c[1], c[2]); assert.notEqual(c[1], c[3]); }

  // The theme's colours, and its accent on every screen until you pick one.
  setLook({ pets: "theme", screen: "one" });
  { const ps = bots().map((b) => crew.petOf(b)), palette = pl.themeColors(crew.lookTheme());
    assert.deepEqual(palette.slice(0, 3), ["#7aa2f7", "#9ece6a", "#e0af68"]);
    assert.ok(ps.every((p) => palette.includes(p.color) && p.screen === "#7aa2f7"));
    assert.ok(new Set(ps.map((p) => p.color)).size >= 5, "seven pals (one closed) share the theme's six colours"); }

  // Screens alone.
  setLook({ screen: "contrast" });
  assert.equal(crew.petOf(bots()[1]).screen, pl.contrastOf("#33cc88"));
  assert.equal(crew.petOf(bots()[1]).color, "#33cc88");

  // Drawing ahead: a look's tiles are drawn and published while the tiles showing now stay published.
  setLook(null);
  fixtures.shared["crew.pets"] = ["old-key"];
  fixtures.execs.length = 0;
  const drawn = await crew.ensurePets(crew.crew(), { pets: "one", color: "#4fa8ff" });
  assert.ok(drawn > 0 && fixtures.execs.length > 1);
  assert.ok(fixtures.shared["crew.pets"].includes("old-key"), "what shows now stays ready");
  assert.ok(fixtures.shared["crew.pets"].includes(pets.petKey(crew.petOf(bots()[2], { pets: "one", color: "#4fa8ff" }))));
  await crew.ensurePets();
  assert.ok(!fixtures.shared["crew.pets"].includes("old-key"), "the roster's own pass trims to the look in use");

  // ---------- the dialog ----------
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const cx = { notify() {}, focus_handle: () => ({ focus() {} }), spawn(fn) { return fn(cx); }, stop_propagation() {} };
  const open = () => { const v = Object.create(Dialog.prototype); v.init({}, cx); return v; };
  const all = (p, out = []) => { const n = p.node; out.push(n); n.kids.forEach((k) => k?.node && all(k, out)); return out; };
  const text = (p) => all(p).flatMap((n) => n.kids.filter((k) => typeof k === "string")).join(" | ");
  const click = async (v, id) => { const n = all(v.render()).find((x) => x.args.id?.[0] === id); assert.ok(n, `#${id} is drawn`); n.args.on_click[0]({}, cx); await tick(); };
  const saved = () => fixtures.shared["crew.settings"].palLook ?? null;

  setLook(null);
  let v = open();
  await tick();
  // Every pair, every count: draws, with a verdict.
  for (const p of pl.PET_LOOKS) for (const s of pl.SCREEN_LOOKS) for (const n of [1, 4, 8, 12]) {
    v.look = { pets: p.id, screen: s.id }; v.n = n; v.draw(cx); await tick();
    const t = text(v.render());
    for (const pal of pl.DEMO_PALS.slice(0, n)) assert.ok(t.includes(pal.name), `${p.id}+${s.id} @${n} shows ${pal.name}`);
    assert.ok(t.includes(`${{ best: "Best", good: "Good", weak: "Weak" }[pl.pairFit(p.id, s.id).fit]} together`));
    assert.ok(all(v.render()).some((x) => x.kind === "image" && /data\/crew-pets\/p.*-o\.svg$/.test(x.arg)), "real tiles");
  }
  assert.ok(text((v.look = { pets: "split", count: 3 }, v.n = 8, v.render())).includes("8 pals: 3 + 3 + 2"));
  assert.equal(saved(), null, "looking changes nothing");

  // A click applies (after the crew's tiles are drawn); Cancel puts back; Done keeps.
  v = open(); await tick();
  await click(v, "pl-pets-one");
  assert.deepEqual(saved(), { pets: "one", screen: "state" });
  await click(v, "pl-pc-1");
  assert.equal(saved().color, "#e0866a");
  assert.equal(crew.petOf(bots()[2]).color, "#e0866a", "the sidebar follows");
  assert.ok(fixtures.shared["crew.pets"].includes(pets.petKey(crew.petOf(bots()[2]))), "its tiles were drawn first");
  await click(v, "pl-screen-contrast");
  assert.equal(saved().screen, "contrast");
  v.close(false);
  assert.equal(saved(), null, "Cancel: back to today's look");
  assert.equal(fixtures.closed, "o1");
  assert.ok(fixtures.shared["crew.pets"].includes(pets.petKey(before[2])), "and its tiles are ready again");

  v = open(); await tick();
  await click(v, "pl-pets-split"); await click(v, "pl-k-4"); await click(v, "pl-sp-dusk"); await click(v, "pl-n-12");
  assert.deepEqual(saved(), { pets: "split", screen: "state", count: 4, palette: "dusk" });
  v.close(true);
  assert.deepEqual(saved(), { pets: "split", screen: "state", count: 4, palette: "dusk" }, "Done keeps it");
  await tick();
  assert.deepEqual(JSON.parse(fixtures.file).palLook, saved(), "written to crew-settings.json");

  // Reopened on a saved look: Cancel returns to exactly that, without leftovers.
  v = open(); await tick();
  await click(v, "pl-pets-group"); await click(v, "pl-g-factory");
  assert.equal(saved().group, "factory");
  v.close(false);
  assert.deepEqual(saved(), { pets: "split", screen: "state", count: 4, palette: "dusk" });
  // Match the theme + one screen colour: the accent until you pick, and a way back to it.
  v = open(); await tick();
  await click(v, "pl-pets-theme"); await click(v, "pl-screen-one");
  assert.equal(crew.petOf(bots()[2]).screen, "#7aa2f7");
  await click(v, "pl-sc-3");
  assert.equal(crew.petOf(bots()[2]).screen, "#f0b245");
  await click(v, "pl-sc-accent");
  assert.equal(crew.petOf(bots()[2]).screen, "#7aa2f7");
  v.close(false);

  // ---------- a pal's own Look dialog under a preset ----------
  // It edits the pal's own colour, never the preset's, and says a preset is on.
  setLook({ pets: "one", color: "#4fa8ff" });
  fixtures.props = { space: "s2" };
  { const lk = Object.create(LookDialog.prototype);
    const herdr = await import(url("node_modules/herdr/index.js"));
    assert.ok(herdr);
    lk.bot = crew.botOf(fixtures.spaces[2]);
    const own = lk.bot.look?.color ?? crew.petOf(lk.bot, null).color;
    assert.notEqual(own, "#4fa8ff");
    assert.match(read("mods/crew-look/main.js"), /color: this\.bot\?\.look\?\.color \?\? petOf\(this\.bot, null\)\.color/); }

  // ---------- wiring ----------
  const sh = read("install.sh"), at = (s) => { const i = sh.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('cp "$src/lib/pallook.js" "$dest/pallook.js"') < at('cp "$src/lib/crew.js" "$dest/crew.js"'), "pallook.js is copied before crew.js, which imports it");
  assert.match(sh, /--exclude '\/pallook\.js'/);
  assert.equal(JSON.parse(read("mods/crew-pallook/mod.json")).place, "none");
  const about = read("mods/crew-about/main.js");
  assert.match(about, /"Pal look"/); assert.match(about, /openPalLook\(\)/);
  crew.openPalLook();
  assert.equal(fixtures.opened.mod, "crew-pallook");
  console.log("pallook app ok");
} finally { rmSync(dir, { recursive: true, force: true }); }
