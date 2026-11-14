// Trusted helpers (T116): what the dialog (mods/crew-helpers) and Home say about a helper and its
// record (lib/helperlog.js, pure), and that the app's side is wired the way the plan says: every
// change is the owner's click, nothing in the app reads a key.
// Run: node tests/test_helperlog.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { helperSub, helperLine, helperAgo, logRow, helperRows, helperToday, helperNameOk, helperNeed, tapNeed, tapsHolding, tapUndoable, TAP_SWITCHES, helperLevel, HELPER_LEVELS } from "../lib/helperlog.js";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(root + p, "utf8");
const NOW = 1794380000000, MIN = 60000, H = 3600000;

// ── a helper's line in the dialog ──
assert.equal(helperAgo(NOW - 30000, NOW), "just now");
assert.equal(helperAgo(NOW - 2 * H, NOW), "2h ago");
assert.equal(helperAgo(0, NOW), "");
const pals = { name: "Pals", on: true, key: "3fa9c2d1", key_there: true, made: NOW - 5 * H, last_used: NOW - 2 * H, sent: 14, refused: 1, sent_hour: 3, per_hour: 20 };
assert.equal(helperSub(pals, NOW), "Key made 5h ago · last used 2h ago · 14 sent · 1 refused");
assert.equal(helperSub({ ...pals, rotated: NOW - 10 * MIN, refused: 0 }, NOW), "Key rotated 10 min ago · last used 2h ago · 14 sent");
assert.match(helperSub({ ...pals, sent_hour: 20 }, NOW), /at this hour's limit$/);
assert.match(helperSub({ ...pals, key_there: false }, NOW), /key file is missing: Rotate key makes a new one/);
assert.match(helperSub({ name: "Wabi", on: false, key: null }, NOW), /No key yet/);
assert.match(helperSub({ name: "Pals", on: false, key: null, carried_over: true }, NOW), /Carried over from the earlier build, switched off/);

// Legacy trust and tap flags never imply Full control; unknown levels fail closed.
assert.deepEqual(HELPER_LEVELS.map(([key]) => key), ["off", "work", "full"]);
assert.equal(helperLevel(pals), "work");
assert.equal(helperLevel({ ...pals, taps: { outward: true, home: true, local: true } }), "work");
assert.equal(helperLevel({ ...pals, level: "full" }), "full");
assert.equal(helperLevel({ ...pals, level: "full", on: false }), "off");
assert.equal(helperLevel({ ...pals, level: "unknown" }), "off");
assert.equal(helperLevel(null), "off");
assert.ok(!helperSub({ ...pals, level: "full", sent_hour: 500 }, NOW).includes("hour's limit"));

// The line a helper is given never has a key in it, and a name with a space is quoted for a shell.
assert.equal(helperLine("Pals"), 'PAL_HELPER=Pals pal tell "<Pal>" "…"');
assert.equal(helperLine("Grok Bot 2"), `PAL_HELPER='Grok Bot 2' pal tell "<Pal>" "…"`);
assert.ok(!/palkey_/.test(helperLine("Pals")));

assert.ok(helperNameOk("Pals") && helperNameOk("Grok Bot 2") && helperNameOk(" Wabi "));
for (const bad of ["", "   ", "../x", "a/b", "x".repeat(25), "-lead"]) assert.ok(!helperNameOk(bad), bad);

// ── the record, one row each ──
const sent = { at: NOW - MIN, kind: "sent", helper: "Pals", card: "c-41b9d0", to: "Orca#ops", card_kind: "tell", via: "pal tell", title: "Look into the update pill" };
assert.deepEqual(logRow(sent), { bold: "Pals told Orca#ops", rest: "Look into the update pill", tone: "sent", card: "c-41b9d0" });
assert.equal(logRow({ ...sent, card_kind: "ask" }).bold, "Pals asked Orca#ops");
assert.equal(logRow({ ...sent, card_kind: "task" }).bold, "Pals gave a task to Orca#ops");
const refused = { at: NOW - 2 * MIN, kind: "refused", helper: "Pals", verified: true, command: "pal home answer h-e8c822 Release today", what: "answer a question on Home" };
assert.deepEqual(logRow(refused), { bold: "Pals tried: home answer h-e8c822 Release today", rest: "refused · only your click does that", tone: "warn", card: null });
assert.match(logRow({ ...refused, verified: false }).rest, /no valid key$/);
assert.match(logRow(refused, "DeNon").rest, /only DeNon's click/);
const unv = { at: NOW - 3 * MIN, kind: "unverified", helper: "Pals", why: "Pals's trusted link is off", via: "pal tell" };
assert.deepEqual(logRow(unv), { bold: "Pals: not sent in your name", rest: "Pals's trusted link is off · it went as not verified", tone: "warn", card: null });
assert.equal(logRow({ kind: "switch", helper: "Pals", action: "on", key: "made" }).bold, "You switched Pals on · key made");
assert.equal(logRow({ kind: "switch", helper: "Pals", action: "off" }).bold, "You switched Pals off");
assert.equal(logRow({ kind: "switch", helper: "Pals", action: "rotate" }).bold, "You rotated Pals's key");
assert.equal(logRow({ kind: "switch", helper: "Pals", action: "remove" }).bold, "You removed Pals");
const carried = logRow({ kind: "switch", helper: "Pals", action: "carried over, off" });
assert.equal(carried.bold, "Pals was carried over, switched off");
assert.match(carried.rest, /turn it on again/);
assert.equal(logRow({ kind: "switch", helper: "Pals", action: "on" }).tone, "quiet");
// A long title or command is cut, never the whole row lost.
assert.ok(logRow({ ...sent, title: "x".repeat(400) }).rest.length <= 120);
assert.ok(logRow({ ...refused, command: "pal " + "y".repeat(400) }).bold.length < 80);

// Full-control actions retain helper attribution even if a misleading label is present.
const action = { kind: "action", id: "d-1", helper: "Pals", grant: "g-1", label: "DeNon clicked", at: NOW - MIN,
  action: "release", target: "project-pals 0.5.0", status: "done" };
assert.deepEqual(logRow(action), { bold: "Pals acted under Full control", rest: "release · project-pals 0.5.0 · done", tone: "sent", card: null });
assert.equal(logRow({ ...action, status: "started" }).tone, "quiet");
assert.equal(logRow({ ...action, status: "failed" }).tone, "warn");
assert.match(logRow({ ...action, status: "unrecognized" }).rest, /outcome unknown$/);
assert.equal(logRow({ kind: "switch", helper: "Pals", action: "level full" }).bold, "You gave Pals Full control");
assert.equal(logRow({ kind: "switch", helper: "Pals", action: "level off" }).bold, "You revoked Pals's access");
const started = { ...action, at: NOW - 2 * MIN, status: "started" };
assert.deepEqual(helperRows([started, action]), [action], "one displayed outcome per operation");
assert.equal(helperToday([started, action], NOW), "1 Full control action", "start and outcome count once");
assert.equal(helperToday([{ ...action, status: "failed" }, { ...action, id: "d-2", status: "started" }], NOW), "1 failed · 1 awaiting outcome");
assert.equal(helperRows([action, { ...action, helper: "Other" }, { ...action, grant: "g-2" }]).length, 3, "ids are scoped to helper and grant");
assert.equal(helperRows([started, { ...action, at: started.at }])[0].status, "done", "same-millisecond receipts use file order");

// ── a helper that isn't working (T170): the record's line, and Home's card ──
assert.deepEqual(logRow({ kind: "notice", helper: "Pals", reason: "no-key", text: "Pals is on, but its key file is missing. What it sends is not in your name until it has a new key." }),
  { bold: "Pals is not working", rest: "Pals is on, but its key file is missing. What it sends is not in your name until it has a new key.", tone: "warn", card: null });
assert.deepEqual(logRow({ kind: "notice", helper: "Pals", reason: "ok", text: "is working again" }), { bold: "Pals is working again", rest: "what it sends is in your name again", tone: "quiet", card: null });
// A notice closed by your own Off or Remove says that, not "working again" (Codex T174).
assert.deepEqual(logRow({ kind: "notice", helper: "Pals", reason: "off", text: "is off, by your click; its notice is closed" }),
  { bold: "Pals is off", rest: "your click · its notice is closed", tone: "quiet", card: null });
assert.equal(logRow({ kind: "notice", helper: "Wabi", reason: "removed", text: "was removed; its notice is closed" }).bold, "Wabi was removed");
assert.equal(logRow({ kind: "notice", helper: "The list of helpers", reason: "restored", text: "was unreadable and was put back from its backup copy" }).bold, "The list of helpers");
const carriedOver = { name: "Pals", reason: "carried-over", fix: "on", since: NOW - 19 * H, unverified: 3,
  text: "Pals is off. An earlier build's helper was carried over switched off, not by you. What it sends is not in your name." };
const need = helperNeed(carriedOver, NOW);
assert.equal(need.title, "Pals is off.");
assert.equal(need.sub, "An earlier build's helper was carried over switched off, not by you. What it sends is not in your name. · since 19h ago · 3 messages since then arrived not verified");
assert.deepEqual(need.fix, { label: "Turn Pals on", action: "on", does: "Makes its key; what it sends is in your name again" });
assert.equal(need.off.label, "Leave it off");
const noKey = helperNeed({ name: "Wabi", reason: "no-key", fix: "rotate", since: NOW - MIN, unverified: 1, text: "Wabi is on, but its key file is missing, or is a link. What it sends is not in your name until it has a new key." }, NOW);
assert.equal(noKey.title, "Wabi is on, but its key file is missing, or is a link.");
assert.match(noKey.sub, /1 message since then arrived not verified$/);
assert.equal(noKey.fix.action, "rotate");
assert.equal(noKey.off.label, "Switch Wabi off");
const limit = helperNeed({ name: "Pals", reason: "limit", fix: null, since: NOW, unverified: 0, text: "Pals reached its limit of 20 messages an hour. The rest arrive not verified until the hour passes." }, NOW);
assert.equal(limit.fix, null);
assert.equal(limit.off, null, "at its limit there's nothing to switch: the sheet has the setting");
assert.equal(helperNeed({ name: "X" }, NOW).title, "X isn't working.");
// Restored switched off because its copy couldn't be vouched for: Turn on, or leave it (Codex T174).
const restored = helperNeed({ name: "Pals", reason: "restored-off", fix: "on", since: NOW, unverified: 0,
  text: "Pals is off. The list of helpers was damaged and came back from a copy that another build may have made out of date, so Pals was switched off, not guessed on, and not by you. What it sends is not in your name." }, NOW);
assert.equal(restored.title, "Pals is off.");
assert.equal(restored.fix.label, "Turn Pals on");
assert.equal(restored.off.label, "Leave it off");

// ── relayed taps (T147): Home's card for a held tap, and the record's lines ──
const at = new Date(NOW); at.setHours(14, 7, 0, 0);
const held = { id: "t-abc123", helper: "Pals", kind: "approval", item: "a-111111", cls: "outward", choice: "Approve", relayed: "yes push it",
  title: "Helper #build: git push origin main", by: "Helper #build", at: at.getTime() - 5 * MIN, run_at: at.getTime(), status: "holding" };
const tn = tapNeed(held, at.getTime() - 4 * MIN);
assert.equal(tn.title, "Pals tapped Approve: Helper #build: git push origin main");
assert.equal(tn.outward, true);
assert.equal(tn.goes, "goes through at 14:07", "a clock time, so the card needs no timer");
assert.match(tn.sub, /unless you stop it · Pals says you said: "yes push it" · an outward action · can't be undone once it runs$/);
const soft = tapNeed({ ...held, cls: "home", kind: "home" }, at.getTime() + MIN);
assert.equal(soft.goes, "going through now");
assert.ok(!soft.outward && !/can't be undone/.test(soft.sub));
const hs = [{ ...held, id: "t-2", at: 2 }, { ...held, id: "t-1", at: 1 }, { ...held, id: "t-3", status: "done", kind: "home" }, { ...held, id: "t-4", status: "done" }, null];
assert.deepEqual(tapsHolding(hs).map((h) => h.id), ["t-1", "t-2"], "only what's still held, oldest first");
assert.equal(tapUndoable(hs, "t-3"), true, "a question on Home that went through on a tap");
assert.equal(tapUndoable(hs, "t-4"), false, "an approval that ran has run");
assert.equal(tapUndoable(hs, "t-1"), false);
assert.deepEqual(TAP_SWITCHES.map((s) => s[0]), ["home", "local", "outward"]);
assert.match(TAP_SWITCHES[2][2], /can't be undone/);
assert.deepEqual(logRow({ kind: "tap", helper: "Pals", choice: "Approve", title: "git push origin main", relayed: "yes", item: "a-111111", item_class: "outward", run_at: at.getTime() }),
  { bold: "Pals tapped Approve", rest: 'git push origin main · you said: "yes" · held until 14:07', tone: "warn", card: "a-111111" });
assert.equal(logRow({ kind: "tap", helper: "Pals", choice: "Recessed", title: "Q?", relayed: "r", item: "h-1", item_class: "home" }).tone, "sent");
assert.equal(logRow({ kind: "tap-done", helper: "Pals", choice: "Recessed", title: "Q?", item: "h-1" }).bold, "Tap went through");
assert.equal(logRow({ kind: "tap-stopped", helper: "Pals", choice: "Approve", title: "x" }).bold, "Tap stopped by you");
assert.equal(logRow({ kind: "tap-cancelled", helper: "Pals", choice: "Approve", title: "x" }).bold, "Tap taken back by Pals");
assert.deepEqual([logRow({ kind: "tap-dropped", helper: "Pals", choice: "A", title: "x", why: "it changed" }).tone, logRow({ kind: "tap-failed", helper: "Pals" }).tone], ["warn", "warn"]);
assert.equal(logRow({ kind: "tap-undone", helper: "Pals", choice: "A", title: "x" }).bold, "Tap undone by you");
assert.deepEqual(logRow({ kind: "tap-refused", helper: "Pals", why: "that ticket was used already" }), { bold: "Pals's tap was refused", rest: "that ticket was used already", tone: "warn", card: null });
// Nothing in the record ever reads as the owner having approved.
for (const k of ["tap", "tap-done", "tap-stopped", "tap-failed"]) assert.ok(!/You approved|You answered/.test(JSON.stringify(logRow({ kind: k, helper: "Pals", choice: "Approve", title: "x", relayed: "y" }))));

// ── for Home ──
const old = { ...sent, at: NOW - 30 * H, card: "c-000001" };
const log = [old, unv, refused, sent, { at: NOW - 4 * MIN, kind: "switch", helper: "Pals", action: "on" }, null, "junk"];
assert.deepEqual(helperRows(log).map((e) => e.at), [NOW - MIN, NOW - 2 * MIN, NOW - 3 * MIN, NOW - 4 * MIN, NOW - 30 * H], "newest first, junk dropped");
assert.equal(helperRows(log, NOW - 150000).length, 2, "only what's after the floor (today, or Mark all seen)");
assert.equal(helperToday(log, NOW), "1 sent · 1 refused · 1 not verified");
assert.equal(helperToday([old], NOW), "");
assert.equal(helperToday([], NOW), "");

// ── wiring: the app's side ──
const dialog = read("mods/crew-helpers/main.js"), about = read("mods/crew-about/main.js"), home = read("mods/crew-home/main.js");
// Every change is the owner's click (the token is written at the click): never the plain CLI.
assert.ok(dialog.includes('ownerCli(["settings", "trust-helper", name, what])'));
assert.ok(!/crewCli\(\["settings"/.test(dialog), "no change without the click's token");
assert.ok(dialog.includes('crewCli(["helpers", "--json"])'), "the list and the record come from pal helpers --json");
// Nothing in the app reads a key file or shows one.
for (const [name, src] of [["crew-helpers", dialog], ["crew-about", about], ["crew-home", home]]) {
  assert.ok(!/\.key["'`]|project-pals\/helpers|palkey_|readTextFile\([^)]*key/.test(src), `${name} never touches a key file`);
}
// Removing asks once more in place; rotating and switching don't open anything else.
assert.ok(dialog.includes('"Remove it"') && dialog.includes("this.confirm = h.name"));
// About's row opens the dialog; Home's rows and its tab do too.
assert.ok(about.includes('row("set-helpers", "Trusted helpers"') && about.includes('openOverlay({ mod: "crew-helpers", kind: "dialog", width: 560 })'));
assert.ok(home.includes('["name", "Helper activity"]') && home.includes("nameBody(d)"));
assert.ok(home.includes('out.push({ kind: "helper", at: e.at, e })'), "what a helper sent or tried is in Today");
assert.ok(home.includes('k !== "name" || this.helperLog.length > 0'), "the tab shows once there's anything to show");
assert.deepEqual(JSON.parse(read("mods/crew-helpers/mod.json")).overlay, { kind: "dialog", width: 560 });
// install.sh gives every mod the shared file and keeps it through the mirror.
const ins = read("install.sh");
assert.ok(ins.includes('cp "$src/lib/helperlog.js" "$dest/helperlog.js"'), "install.sh copies helperlog.js into each mod");
assert.ok(ins.includes("--exclude '/helperlog.js'"), "and keeps it through the rsync");

// ── the dialog, run headless with two helpers and a record: every state draws, and each button
// runs the right pal command with a click token (the Home view test's stubs, cut down) ──
{
  const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "helpersview-"));
  try {
    const mod = (name, src) => {
      mkdirSync(join(dir, "node_modules", name), { recursive: true });
      writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
      writeFileSync(join(dir, "node_modules", name, "index.js"), src);
    };
    mod("gpui-kit", `
      export const clicks = new Map(), texts = [];
      const el = () => {
        const p = new Proxy(function () {}, {
          get: (t, k) => {
            if (k === "then") return undefined;
            if (k === "__attached") return t.__attached;
            if (k === "when") return (c, f) => (c ? f(p) : p);
            if (k === "id") return (id) => { p.__id = id; return p; };
            if (k === "on_click") return (f) => { if (p.__id) clicks.set(p.__id, f); return p; };
            if (k === "child") return (c) => {
              if (t.__attached) throw new Error("element changed after attachment");
              if (typeof c === "string") texts.push(c);
              else if (c && typeof c === "function") c.__attached = true;
              return p;
            };
            if (k === "__id") return t.__id;
            return () => { if (t.__attached) throw new Error("element changed after attachment"); return p; };
          },
          set: (t, k, v) => { t[k] = v; return true; },
        });
        return p;
      };
      export const div = el, svg = el, image = el; export class View {}`);
    mod("gpui-base", `
      import { div } from "gpui-kit";
      export const v_flex = div, h_flex = div;
      class St { constructor(o) { this.v = o?.value ?? ""; this.h = {}; } on(e, f) { this.h[e] = f; return true; } value() { return this.v; } set_value(v) { this.v = v; } focus() {} }
      export const InputState = { new: (o) => new St(o) }, TextareaState = InputState, Input = { new: () => div() }, Textarea = Input;`);
    mod("herdr", `
      export const fx = { calls: [], toasts: [], closed: 0, info: null, fail: null, shared: { "crew.settings": { owner: "DeNon", head: "Orca" } } };
      export const shared = (k) => fx.shared[k], setShared = () => {}, spaces = () => [], agents = () => [], panes = () => [], layout = () => null, keys = () => [], settings = () => ({});
      export const exec = async (cmd, args) => {
        fx.calls.push([cmd.split("/").pop(), ...args]);
        if (cmd.endsWith("/pal") && args[0] === "helpers") return { stdout: JSON.stringify(fx.info), stderr: "", code: 0 };
        if (cmd.endsWith("/pal") && fx.fail) return { stdout: "", stderr: fx.fail, code: 1 };
        return { stdout: "", stderr: "", code: 0 };
      };
      export const theme = () => ({ background: "#0B0B0C" }), home = () => "/h", appHome = () => "/h/.config/herdr-app", props = () => ({ overlay: "ov1" });
      export const notify = (n) => fx.toasts.push(n), closeOverlay = () => { fx.closed++; }, openOverlay = () => "ov2", run = () => {}, hc = exec;
      export const readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [], nextCommand = () => new Promise(() => {});`);
    for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
    copyFileSync(join(root, "mods", "crew-helpers", "main.js"), join(dir, "crew-helpers.mjs"));
    const { fx } = await import(pathToFileURL(join(dir, "node_modules/herdr/index.js")).href);
    const { clicks, texts } = await import(pathToFileURL(join(dir, "node_modules/gpui-kit/index.js")).href);
    const handle = { focus() {} };
    const run = async (f) => { const tasks = []; const cx = { notify() {}, spawn: (g) => tasks.push(g(cx)), timer: { every() {}, after() {} }, focus_handle: () => handle, stop_propagation() {} };
      f(cx); for (let i = 0; i < 6 && tasks.length; i++) await Promise.race([Promise.all(tasks.splice(0)), new Promise((r) => setTimeout(r, 50))]); return cx; };
    const draw = async (v) => { clicks.clear(); texts.length = 0; await run((cx) => v.render(cx)); };
    const palCalls = () => fx.calls.filter((c) => c[0] === "pal" && c[1] !== "helpers");
    const Dialog = (await import(pathToFileURL(join(dir, "crew-helpers.mjs")).href)).default;

    // Nothing yet: the dialog says so, and offers only to add one.
    fx.info = { helpers: [], log: [], max: 8 };
    const v = new Dialog();
    await run((cx) => v.init({}, cx));
    await draw(v);
    assert.ok(texts.some((t) => t.startsWith("No trusted helpers.")));
    assert.ok(texts.some((t) => t.includes("Full control lets it decide and act autonomously")), "the full delegation is explained before choosing it");
    assert.ok(clicks.has("th-add") && !clicks.has("th-sw-0"));
    // Add one: nothing happens for a bad name; a good one is your click.
    v.name.set_value("../x");
    await run((cx) => v.add(cx));
    assert.deepEqual(palCalls(), []);
    v.name.set_value("Pals");
    fx.info = { helpers: [pals, { name: "Wabi", on: false, key: null, key_there: false, sent: 0, refused: 0 }], log: [refused, sent], max: 8 };
    await run((cx) => v.add(cx));
    const add = palCalls().at(-1);
    assert.deepEqual(add.slice(1, 6), ["settings", "trust-helper", "Pals", "level", "work"], "new helpers start with Work only");
    assert.ok(add.includes("--click"), "with the click's token");
    assert.equal(v.shown, "Pals");
    // Two helpers and a record: rows, the line to give the helper, the record with its refused try.
    await draw(v);
    for (const id of ["th-level-work-0", "th-level-full-0", "th-level-off-0", "th-revoke-0", "th-rot-0", "th-level-off-1", "th-rm-1", "th-copy", "th-add", "th-x", "th-cancel"]) assert.ok(clicks.has(id), `has ${id}`);
    assert.ok(!clicks.has("th-rm-0"), "a helper that's on is switched off before it's removed");
    assert.ok(texts.includes('PAL_HELPER=Pals pal tell "<Pal>" "…"'));
    assert.ok(texts.includes("Pals tried: home answer h-e8c822 Release today") && texts.includes("Pals told Orca#ops"));
    assert.ok(!texts.some((t) => /palkey_/.test(t)));
    // One level selector replaces all tap switches. Rendering never grants anything.
    assert.ok(![...clicks.keys()].some((id) => id.startsWith("th-tap-") || id.startsWith("th-hold-")));
    const nLevel = palCalls().length;
    await draw(v);
    assert.equal(palCalls().length, nLevel);
    await run((cx) => clicks.get("th-level-work-0")(null, cx));
    assert.equal(palCalls().length, nLevel, "clicking the current level doesn't write again");
    await run((cx) => clicks.get("th-level-full-0")(null, cx));
    assert.deepEqual(palCalls().at(-1).slice(1, 6), ["settings", "trust-helper", "Pals", "level", "full"]);
    assert.equal(palCalls().length, nLevel + 1, "one owner click grants Full control, no second confirmation");
    assert.ok(palCalls().at(-1).includes("--click"));
    fx.info = { ...fx.info, helpers: [{ ...pals, level: "full", sent_hour: 500 }, fx.info.helpers[1]], log: [action, started, refused, sent] };
    await run((cx) => v.load(cx));
    await draw(v);
    assert.ok(texts.includes("Full control"));
    assert.ok(texts.some((t) => t.includes("No further approval prompts or waiting period")));
    assert.ok(texts.includes("Pals acted under Full control"));
    assert.ok(!clicks.has("th-lim-up-0") && !clicks.has("th-lim-dn-0"), "Full control has no hourly quota control");
    await run((cx) => clicks.get("th-revoke-0")(null, cx));
    assert.deepEqual(palCalls().at(-1).slice(1, 6), ["settings", "trust-helper", "Pals", "level", "off"]);
    fx.info = { ...fx.info, helpers: [{ ...pals, level: "off", on: false }, fx.info.helpers[1]] };
    await run((cx) => v.load(cx));
    await draw(v);
    assert.ok(!clicks.has("th-revoke-0") && !clicks.has("th-rot-0"));
    await run((cx) => clicks.get("th-level-work-0")(null, cx));
    assert.deepEqual(palCalls().at(-1).slice(1, 6), ["settings", "trust-helper", "Pals", "level", "work"], "resuming from Off is an explicit selected level");
    fx.info = { helpers: [pals, { name: "Wabi", on: false, key: null, key_there: false, sent: 0, refused: 0 }], log: [refused, sent], max: 8 };
    await run((cx) => v.load(cx));
    await draw(v);
    // The hourly limit, 5 at a time, your click; a helper that isn't working says why in its row.
    await run((cx) => clicks.get("th-lim-up-0")(null, cx));
    assert.deepEqual(palCalls().at(-1).slice(1, 6), ["settings", "trust-helper", "Pals", "limit", "25"]);
    assert.ok(palCalls().at(-1).includes("--click"));
    fx.info = { ...fx.info, helpers: [{ ...pals, per_hour: 5, attention: { reason: "limit", text: "Pals reached its limit of 5 messages an hour." } }, fx.info.helpers[1]] };
    await run((cx) => v.load(cx));
    await draw(v);
    assert.ok(texts.includes("Pals reached its limit of 5 messages an hour.") && texts.includes("5/h"));
    const n0 = palCalls().length;
    await run((cx) => clicks.get("th-lim-dn-0")(null, cx));
    assert.equal(palCalls().length, n0, "5 an hour is the floor: the button does nothing");
    fx.info = { helpers: [pals, { name: "Wabi", on: false, key: null, key_there: false, sent: 0, refused: 0 }], log: [refused, sent], max: 8 };
    await run((cx) => v.load(cx));
    await draw(v);
    // Off, rotate: one click each.
    await run((cx) => clicks.get("th-revoke-0")(null, cx));
    assert.deepEqual(palCalls().at(-1).slice(1, 6), ["settings", "trust-helper", "Pals", "level", "off"]);
    await draw(v);
    await run((cx) => clicks.get("th-rot-0")(null, cx));
    assert.deepEqual(palCalls().at(-1).slice(1, 5), ["settings", "trust-helper", "Pals", "rotate"]);
    // Remove asks once more in place.
    await draw(v);
    const before = palCalls().length;
    await run((cx) => clicks.get("th-rm-1")(null, cx));
    assert.equal(palCalls().length, before, "the first click only asks");
    await draw(v);
    assert.ok(clicks.has("th-rm-yes-1") && clicks.has("th-rm-no-1"));
    await run((cx) => clicks.get("th-rm-yes-1")(null, cx));
    assert.deepEqual(palCalls().at(-1).slice(1, 5), ["settings", "trust-helper", "Wabi", "remove"]);
    assert.ok(palCalls().every((c) => c.includes("--click")), "every change carried a click token");
    // A refusal from pal is said, not swallowed.
    fx.fail = "changing settings: only DeNon decides this";
    fx.toasts.length = 0;
    await draw(v);
    await run((cx) => clicks.get("th-revoke-0")(null, cx));
    assert.equal(fx.toasts.at(-1)?.level, "warning");
    // At the cap there's no Add; Close closes.
    fx.fail = null;
    fx.info = { helpers: Array.from({ length: 8 }, (_, i) => ({ ...pals, name: `H${i}` })), log: [], max: 8 };
    await run((cx) => v.load(cx));
    await draw(v);
    assert.ok(!clicks.has("th-add"));
    await run((cx) => clicks.get("th-cancel")(null, cx));
    assert.equal(fx.closed, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log("helperlog: ok");
