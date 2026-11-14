// Which computer a pal works on (lib/machines.js, crew.js's records and openTopic, the crew-machine
// dialog, Change machine… in the pal menu, the pal list's machine tag). The helpers first, then
// the views drawn outside Herdr against stand-ins (like tests/test_palrows.mjs): every element method
// they call must be one gpui-kit declares.
// Run: node tests/test_machines.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isTailscale, connectionOf, machineKind, kindIcon, machineState, machineList, machineEntry, guessFolder, movedRecord, machineTagOn, machineLabel, sameMachine,
} from "../lib/machines.js";

// ── the helpers ──
assert.ok(isTailscale("mrmaryland@100.99.35.54"));
assert.ok(isTailscale("denon@100.117.162.32:2222"));
assert.ok(isTailscale("box.tail1234.ts.net"));
assert.ok(!isTailscale("me@100.20.1.1"), "100.20 isn't Tailscale's range");
assert.ok(!isTailscale("me@192.168.1.4"));
assert.equal(connectionOf({ local: true }), "this computer");
assert.equal(connectionOf({ name: "macbookey", target: "mrmaryland@100.99.35.54" }), "SSH via Tailscale");
assert.equal(connectionOf({ name: "vps", target: "root@203.0.113.9" }), "SSH");
assert.equal(connectionOf({ name: "fly", via: "fly ssh console -a app" }), "via fly");
assert.equal(machineKind({ name: "macbookey", host: "denons-macbook-pro" }), "laptop");
assert.equal(machineKind({ name: "peecee", host: "desktop-m1058cr" }), "desktop");
assert.equal(machineKind({ name: "hetzner", host: "ubuntu-4gb" }), "server");
assert.equal(machineKind({ local: true, kind: "laptop" }), "laptop", "this computer: a battery says laptop");
assert.equal(machineKind({ name: "hetzner" }, { hetzner: "desktop" }), "desktop", "a saved kind wins");
assert.equal(kindIcon("laptop"), "ds-laptop");
assert.equal(kindIcon("nonsense"), "ds-server");
assert.deepEqual(machineState({ name: "x", state: "connected" }), { word: "connected", up: true });
assert.deepEqual(machineState({ name: "x", state: "needs_login" }), { word: "needs login", up: false });
assert.ok(machineState({ local: true }).up);
const pub = { local: { host: "denonomarchy", kind: "laptop" }, list: [{ name: "macbookey", host: "denons-macbook-pro", state: "connected" }, { name: "peecee", state: "offline" }] };
assert.deepEqual(machineList(pub).map((m) => m.name), [null, "macbookey", "peecee"], "this computer first");
assert.equal(machineList(pub)[0].host, "denonomarchy");
assert.equal(machineEntry(pub, "peecee").state, "offline");
assert.equal(machineEntry(pub, "gone").state, "unknown", "a machine hc no longer lists");
assert.equal(machineEntry(null, null).local, true);
assert.equal(machineLabel(null), "this computer");
assert.ok(sameMachine(undefined, null));
assert.equal(guessFolder("/home/denon/Projects/pals", "/home/denon", "/Users/mrmaryland"), "/Users/mrmaryland/Projects/pals");
assert.equal(guessFolder("/home/denon/Projects/pals", "/home/denon", "/Users/x", "/srv/pals"), "/srv/pals", "the folder it had there before");
assert.equal(guessFolder("/opt/thing", "/home/denon", "/Users/x"), "/opt/thing");
const moved = movedRecord({ id: "b1", machine: null, folder: "/home/denon/p" }, "macbookey", "/Users/m/p");
assert.deepEqual([moved.machine, moved.folder, moved.folders], ["macbookey", "/Users/m/p", { "": "/home/denon/p", macbookey: "/Users/m/p" }]);
assert.equal(movedRecord(moved, null, "/home/denon/p").folders.macbookey, "/Users/m/p", "moving back keeps both");
assert.ok(machineTagOn({}, "rich") && machineTagOn({}, "table"), "Rich detail and Table by default");
assert.ok(!machineTagOn({}, "large"), "off elsewhere by default");
assert.ok(machineTagOn({ palMachine: true }, "large") && !machineTagOn({ palMachine: false }, "rich"));

// ── crew.js and the views, against stand-ins ──
const root = new URL("..", import.meta.url).pathname;
const dts = readFileSync(join(root, "mods/crew-command/gpui-kit.d.ts"), "utf8");
const METHODS = [...new Set([...dts.matchAll(/^\s+([a-z_][a-z0-9_]*)\s*(?:<[^>]*>)?\s*\(/gm)].map((m) => m[1]))];
const dir = mkdtempSync(join(tmpdir(), "machines-"));
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
    export const calls = [];
    export const fixtures = {
      props: {},
      spaces: [
        { id: "s1", name: "Pals", folder: "/home/denon/Projects/pals", machine: null, active: true, status: "working",
          tabs: [{ id: "t1", name: "profiles", status: "working", changed_at: now - 60000, active: true }, { id: "t2", name: "notes", status: "idle" }] },
        { id: "macbookey/s9", name: "Pals", folder: "/Users/m/Projects/pals", machine: "macbookey", status: "idle",
          tabs: [{ id: "macbookey/t9", name: "general", status: "idle", active: true }] },
        { id: "s2", name: "Softly", folder: "/home/denon/Projects/softly", machine: "peecee", status: "idle", tabs: [{ id: "peecee/t5", name: "main", status: "idle", active: true }] },
      ],
      panes: [{ tab: "t1", terminal: "a", program: { agent: true, key: "claude", name: "Claude Code" } }],
      agents: [],
      shared: {
        crew: { bots: [
          { id: "b1", name: "Pals", space: "s1", also: ["macbookey/s9", "gone/s0"], machine: "macbookey", folder: "/Users/m/Projects/pals", folders: { "": "/home/denon/Projects/pals" }, harness: "claude", argv: ["claude"] },
          { id: "b2", name: "Softly", space: "s2", machine: "peecee", folder: "/home/denon/Projects/softly" },
          { id: "b3", name: "Sleepy", space: "gone/s7", machine: null, folder: "/home/denon/x", harness: "claude" },
        ] },
        "crew.settings": { owner: "DeNon" }, "crew.panel": { tab: "profile" }, "crew.pets": [],
        "crew.machines": { local: { name: null, local: true, host: "denonomarchy", kind: "laptop", state: "connected" },
          list: [{ name: "macbookey", host: "denons-macbook-pro", target: "mrmaryland@100.99.35.54", state: "connected" }, { name: "peecee", host: "desktop-m1058cr", target: "denon@100.117.162.32", state: "offline" }] },
      },
    };
    export const spaces = () => fixtures.spaces, panes = () => fixtures.panes, agents = () => fixtures.agents;
    export const shared = (k) => fixtures.shared[k], setShared = (k, v) => { fixtures.shared[k] = v; };
    export const theme = () => ({ background: "#0E0E0F", foreground: "#EDEDED" });
    export const home = () => "/home/denon", appHome = () => "/home/denon/.config/herdr-app";
    export const settings = () => ({ zoom: 1 }), layout = () => null, props = () => fixtures.props, keys = () => ({});
    export const machines = () => [], terminals = () => [];
    let n = 0;
    export const run = (name, args) => {
      calls.push([name, args]);
      if (name === "space.new") fixtures.spaces.push({ id: (args.machine ? args.machine + "/" : "") + "new" + (++n), name: args.name, folder: args.folder ?? "", machine: args.machine || null, tabs: [{ id: "nt" + n, name: args.tab }] });
    };
    const nop = () => {}, later = async () => ({ stdout: "", stderr: "", code: 0 });
    export const notify = nop, openOverlay = (o) => calls.push(["overlay", o]), closeOverlay = nop, nextCommand = () => new Promise(() => {});
    export const exec = later, hc = later, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [], pickFolder = async () => null;
  `);
  for (const f of ["worlds.js", "crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  copyFileSync(join(root, "mods/crew-machine/main.js"), join(dir, "machine.js"));
  const url = (f) => pathToFileURL(join(dir, f)).href;
  const crew = await import(url("crew.js"));
  const herdr = await import(url("node_modules/herdr/index.js"));
  const { div } = await import(url("node_modules/gpui-kit/index.js"));
  const row = (look, f) => crew.palLookRow(d, st(look), f, div(), div());
  const { fixtures, calls } = herdr;
  const [s1, s9, s2] = fixtures.spaces;

  // A pal's other space (`also`) is the same pal.
  assert.equal(crew.recordOf(s9).id, "b1", "the space left on macbookey is still Pals");
  const b1 = crew.botOf(s1), b9 = crew.botOf(s9);
  assert.equal(b1.machine, null, "this space runs here");
  assert.equal(b1.target, "macbookey", "new topics start on macbookey");
  assert.equal(b1.folder, "/home/denon/Projects/pals", "the folder of the machine this space is on");
  assert.equal(b9.folder, "/Users/m/Projects/pals");
  assert.deepEqual(crew.palSpaces(b1).map((s) => s.id), ["s1", "macbookey/s9"]);
  assert.ok(!crew.sleepers().some((b) => b.id === "b1"));
  assert.deepEqual(crew.sleepers().map((b) => b.id), ["b3"]);
  assert.equal(crew.targetSpace(b1).id, "macbookey/s9");
  // A closed other space is forgotten; a closed own space hands over to an open other one.
  crew.linkRecords();
  assert.deepEqual(crew.crew().bots[0].also, ["macbookey/s9"], "gone/s0 dropped");
  const saved = structuredClone(fixtures.shared.crew);
  fixtures.shared.crew.bots[0] = { ...fixtures.shared.crew.bots[0], space: "gone/s1" };
  crew.linkRecords();
  assert.equal(crew.crew().bots[0].space, "macbookey/s9", "the open one becomes its own");
  assert.equal(crew.crew().bots[0].also, undefined);
  fixtures.shared.crew = structuredClone(saved);

  // A new topic goes to the machine the pal works on: its space there...
  calls.length = 0;
  crew.openTopic(crew.botOf(s1), { name: "#fix", argv: ["claude"] });
  assert.deepEqual(calls[0], ["tab.new", { space: "macbookey/s9", name: "#fix", argv: ["claude"], task: undefined, folder: "/Users/m/Projects/pals" }]);
  // ...else a new space there, linked to the pal.
  fixtures.shared.crew.bots[0].also = [];
  calls.length = 0;
  const made = crew.openTopic(crew.botOf(s1), { name: "#fix", argv: ["claude"] });
  assert.equal(calls[0][0], "space.new");
  assert.deepEqual([calls[0][1].machine, calls[0][1].name, calls[0][1].tab, calls[0][1].folder], ["macbookey", "Pals", "#fix", "/Users/m/Projects/pals"]);
  assert.ok(crew.crew().bots[0].also.includes(made.id), "linked as the pal's");
  assert.equal(crew.recordOf(made).id, "b1");
  fixtures.spaces.pop();
  fixtures.shared.crew = structuredClone(saved);
  // A pal that never moved: a tab in its own space, its own folder, as before.
  calls.length = 0;
  crew.openTopic(crew.botOf(s2), { name: "#x" });
  assert.deepEqual(calls[0], ["tab.new", { space: "s2", name: "#x", argv: undefined, task: undefined, folder: "/home/denon/Projects/softly" }]);

  const text = (p) => { const n = p.node ?? p; return n.kids.map((k) => typeof k === "string" ? k : k?.node ? text(k) : "").join(" "); };
  const find = (p, id, out = []) => { const n = p.node; if ((n.args.id ?? []).some((a) => String(a[0]).startsWith(id))) out.push(n); n.kids.forEach((k) => k?.node && find(k, id, out)); return out; };
  const svgs = (p, out = []) => { const n = p.node; if (n.kind === "svg") out.push(n.arg); n.kids.forEach((k) => k?.node && svgs(k, out)); return out; };
  const d = crew.ds({ background: "#0E0E0F" });
  const t = crew.tone({ background: "#0E0E0F", foreground: "#EDEDED" });

  // The pal list: Rich detail tags a pal on another machine; Large doesn't, unless it's on; a pal
  // open on two machines is tagged in every look.
  const st = (id) => crew.palListStyleOf(id);
  const softly = crew.palFacts(s2, crew.botOf(s2), d);
  assert.equal(softly.machine, "peecee");
  const rich = text(row("rich", softly));
  assert.ok(rich.includes("peecee"), "Rich detail shows the machine");
  assert.ok(!text(row("large", softly)).includes("peecee"), "Large doesn't by default");
  fixtures.shared["crew.settings"] = { palMachine: true };
  assert.ok(text(row("large", softly)).includes("peecee"), "on for every look when turned on");
  fixtures.shared["crew.settings"] = {};
  const pals = crew.palFacts(s1, crew.botOf(s1), d);
  assert.ok(pals.spans);
  assert.ok(text(row("large", pals)).includes("this computer"), "a pal on two machines is tagged");
  assert.ok(svgs(row("rich", softly)).includes("mods/crew-roster/icons/ds-desktop.svg"), "peecee's icon: desktop");

  // Change machine… is in the pal menu (Pals Lite, T217: the profile panel that had the Machine card is gone).
  { const row = crew.palMenuItems(s1, crew.botOf(s1)).find((r) => r[1] === "machine");
    assert.ok(row && row[3] === "Change machine…", "the pal menu has Change machine…");
    row[5]();
    assert.equal(calls.filter((c) => c[0] === "overlay").at(-1)[1].mod, "crew-machine", "it opens the machine dialog"); }

  // The dialog: every machine with its state, the folder there, what moving means.
  const { default: Machine } = await import(url("machine.js"));
  fixtures.props = { space: "s2" };
  const dlg = Object.create(Machine.prototype);
  const fakeCx = { focus_handle: () => ({ focus() {} }), spawn() {}, timer: { every() {} }, notify() {} };
  dlg.init({}, fakeCx);
  assert.equal(dlg.sel, "peecee", "starts on where its new topics start");
  dlg.sel = null;
  dlg.folder.set_value("/home/denon/Projects/softly");
  dlg.check = { key: "", path: "/home/denon/Projects/softly", state: "no" };
  dlg.origin = "git@github.com:denon/softly.git";
  const out = dlg.render(fakeCx);
  const ow = text(out);
  for (const w of ["Where Softly works", "this computer", "macbookey", "peecee", "denons-macbook-pro", "SSH via Tailscale", "offline", "new topics start here",
    "Add machine…", "Project folder on this computer", "Not on this computer.", "Clone it there", "Choose folder…", "terminals can't move", "Move to this computer"])
    assert.ok(ow.includes(w), `dialog: "${w}"`);
  // Moving saves the record: the machine, the folder there, and the old one for going back.
  dlg.check = { state: "yes" };
  dlg.move(fakeCx);
  const b2 = crew.crew().bots.find((b) => b.id === "b2");
  assert.deepEqual([b2.machine, b2.folder, b2.folders], [null, "/home/denon/Projects/softly", { peecee: "/home/denon/Projects/softly", "": "/home/denon/Projects/softly" }]);
  assert.ok(text(dlg.render(fakeCx)).includes("Open a topic on this computer"), "then: open a topic there");
  // An asleep pal: Wake on <machine>.
  fixtures.props = { bot: "b3" };
  const sl = Object.create(Machine.prototype);
  sl.init({}, fakeCx);
  assert.ok(text(sl.render(fakeCx)).includes("Wake on this computer"));
  console.log("test_machines: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
