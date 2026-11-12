// The Live channel and "Try it live" in the app (T90), run headless: the trial strip, the status
// bar's chip, toasts and strip switch, About's channel row and Back to stable, and Review's Try it
// live. Each renders in every state without throwing (herdr-app check only draws the first, empty
// one), and each click runs the right pal command, the owner's with a one-time click token.
// Run: node tests/test_live_view.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const store = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } });
const dir = mkdtempSync(join(tmpdir(), "liveview-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  // Every builder call returns the element; children, .when and .map callbacks run, so the whole tree
  // is built. Text children are collected (drawn), clicks kept by id.
  mod("gpui-kit", `
    export const clicks = new Map(), drawn = [], used = new Set();
    const el = () => {
      const p = new Proxy(function () {}, {
        get: (t, k) => {
          if (k === "then") return undefined;
          if (typeof k === "string") used.add(k);
          if (k === "when") return (c, f) => (c ? f(p) : p);
          if (k === "map") return (f) => f(p);
          if (k === "id") return (id) => { t.__id = id; return p; };
          if (k === "on_click" || k === "on_mouse_down") return (...a) => { const f = a.at(-1); if (t.__id && (k === "on_click" || !clicks.has(t.__id))) clicks.set(t.__id, f); return p; };
          if (k === "child") return (c) => { if (typeof c === "string") drawn.push(c); return p; };
          if (k === "tooltip") return (c) => { drawn.push(String(c)); return p; };
          return () => p;
        },
      });
      return p;
    };
    export const div = el, svg = el, image = el; export class View {}`);
  mod("gpui-base", `
    import { div } from "gpui-kit";
    export const v_flex = div, h_flex = div, v_virtual_list = div;
    class St { constructor(o) { this.v = o?.value ?? ""; } on() { return true; } value() { return this.v; } set_value(v) { this.v = v; } focus() {} }
    export const InputState = { new: (o) => new St(o) }, Input = { new: () => div() }, VirtualListScrollHandle = { new: () => ({}) };`);
  mod("herdr", `
    export const fx = { calls: [], toasts: [], closed: 0, shared: { "crew.settings": { owner: "DeNon", head: "Orca" } }, files: {}, layout: null, props: {}, written: [],
      spaces: [{ id: "s1", name: "Builder", active: true, tabs: [{ id: "t1", name: "#x", active: true }] }] };
    export const spaces = () => fx.spaces, agents = () => [], panes = () => [], terminals = () => [], machines = () => [], shared = (k) => fx.shared[k], setShared = (k, v) => { fx.shared[k] = v; };
    export const exec = async (cmd, args) => {
      fx.calls.push([cmd.split("/").pop(), ...args]);
      if (cmd.endsWith("/pal") && args[0] === "diff") return { stdout: JSON.stringify(fx.diff), stderr: "", code: 0 };
      if (cmd.endsWith("/pal") && fx.fail) return { stdout: "", stderr: fx.fail, code: 1 };
      if (cmd.endsWith("/pal") && args[0] === "land") return { stdout: "landed crew/x on main in /p", stderr: "", code: 0 };
      return { stdout: cmd.endsWith("/pal") && args.includes("--json") ? "{}" : "", stderr: "", code: 0 };
    };
    export const theme = () => ({ background: "#0B0B0C", foreground: "#EDEDED", working: "#4CA1F2", blocked: "#F06C6C", accent: "#4CA1F2", done: "#34D098" });
    export const home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => fx.layout, keys = () => [], settings = () => ({});
    export const run = (c, a) => fx.calls.push(["run", c, JSON.stringify(a)]), notify = (n) => fx.toasts.push(n), openOverlay = (o) => { (fx.overlays ??= []).push(o); return "ov1"; }, closeOverlay = () => { fx.closed++; };
    export const nextCommand = () => new Promise(() => {}), watchFolder = () => new Promise(() => {}), props = () => fx.props, focused = () => null;
    export const knownAgents = async () => [];
    export const hc = exec, readTextFile = async (p) => fx.files[p.replace("/h/.config/herdr-app/", "")] ?? null, writeTextFile = async (p, t) => { fx.written.push([p, t]); };`);
  for (const f of readdirSync(join(root, "lib")).filter((f) => f.endsWith(".js"))) copyFileSync(join(root, "lib", f), join(dir, f));   // every shared file, as install.sh does
  for (const m of ["crew-live", "crew-status", "crew-about", "crew-review"]) copyFileSync(join(root, "mods", m, "main.js"), join(dir, `${m}.mjs`));
  const at = (p) => pathToFileURL(join(dir, p)).href;
  const { fx } = await import(at("node_modules/herdr/index.js"));
  const { clicks, drawn, used } = await import(at("node_modules/gpui-kit/index.js"));
  const crew = await import(at("crew.js"));

  // ── The helpers ──
  const build = { hash: "b6c982c", branch: "main", subject: "Trees: lighter", tag: "v0.4.1", ahead: 53, dirty: false };
  assert.equal(crew.buildName(build), "main b6c982c");
  assert.equal(crew.buildLine(build), "main b6c982c · 53 commits after v0.4.1");
  assert.equal(crew.buildLine({ ...build, ahead: 1 }), "main b6c982c · 1 commit after v0.4.1");
  assert.equal(crew.buildLine({}), null, "a release has no build line");
  assert.equal(crew.swapLine({ reloaded: ["crew-about", "crew-status"], crewd: true }), "reloaded about, status in place, crewd restarted");
  assert.equal(crew.swapLine({ reloaded: ["a", "b", "c", "d"] }), "reloaded 4 mods in place");
  assert.equal(crew.swapLine({ reloaded: [] }), "no mod changed");
  assert.equal(crew.liveTests({ build, tests: { hash: "b6c982c1f00d", state: "passed" } }).label, "tests passed");
  assert.equal(crew.liveTests({ build, tests: { hash: "0000000aaaaa", state: "failed" } }), null, "another build's tests say nothing about this one");
  const live1 = crew.swapToast({ id: "1", action: "live", state: "done", branch: "main", hash: "b6c982c1f00d", subject: "Trees: lighter", reloaded: ["crew-roster"], crewd: false });
  assert.equal(live1.title, "main b6c982c is live");
  assert.match(live1.body, /Trees: lighter · reloaded roster in place/);
  const failed = crew.swapToast({ id: "2", action: "live", state: "failed", branch: "main", hash: "deadbeef0000", error: "crew-about doesn't load:\nboom\nSo the build before it was put back." });
  assert.equal(failed.level, "warning");
  assert.match(failed.title, /main deadbee didn't go live/);
  assert.match(failed.body, /put back/);
  assert.match(crew.swapToast({ id: "3", action: "try", state: "failed", branch: "crew/x", error: "no pal called 'Gone'" }).body, /What was running is still running/);
  assert.equal(crew.swapToast({ id: "4", action: "try", state: "done", branch: "crew/x", reloaded: [] }).title, "Trying crew/x");

  // ── Fixtures: the updater's files ──
  const now = Date.now() / 1000;
  const files = ({ channel = "stable", trying = null, hold = null, tests = null, last = null, run = null, ins = build } = {}) => {
    fx.files = {
      "data/crew-install.json": JSON.stringify({ name: "Project Pals", version: "0.4.1", repo: "o/r", source: "live", build: ins }),
      "data/crew-settings.json": JSON.stringify({ owner: "DeNon", channel, live_repo: "/home/sam/Projects/project-pals", live_branch: "main" }),
      "data/crew-live.json": JSON.stringify({ ...(trying && { trying }), ...(hold && { hold }), ...(tests && { tests }), ...(last && { last }) }),
      "data/crew-update-run.json": JSON.stringify(run ?? {}),
      "data/crew-update.json": JSON.stringify({ latest: "0.4.1", checked: now - 60, repo: "o/r" }),
    };
  };
  const trying = { branch: "crew/x", hash: "3c14474aaaaa", spec: "Builder#x", since: now - 300, snapshot: "/b/update-try.tar.gz", base: build };
  const tick = () => new Promise((r) => setTimeout(r, 15));
  // A cx whose spawned tasks run; timers are kept so the test can fire them.
  const mkcx = () => { const cx = { timers: [], notified: 0, notify: () => { cx.notified++; }, stop_propagation: () => {}, focus_handle: () => ({ focus: () => {} }),
    spawn: (f) => { f(cx); }, timer: { every: (ms, f) => { cx.timers.push(f); }, after: () => {} } }; return cx; };
  const open = async (file, props = {}) => {
    fx.props = props;
    const V = (await import(at(file))).default;
    const v = new V(), cx = mkcx();
    v.init(props, cx);
    await tick();
    return { v, cx, draw: () => { drawn.length = 0; clicks.clear(); v.render(cx); return drawn.join(" | "); },
      again: async () => { for (const f of cx.timers) f(cx); await tick(); } };
  };
  const palCalls = () => fx.calls.filter((c) => c[0] === "pal" || c[0] === "sh");
  const token = (args) => fx.written.some(([p, t]) => /crew-clicks\/[0-9a-f]{32}\.json$/.test(p) && JSON.stringify(JSON.parse(t).args) === JSON.stringify(args));

  // ── The trial strip ──
  files();
  const strip = await open("crew-live.mjs");
  assert.equal(strip.draw(), "", "nothing while no branch is tried");
  files({ trying, ins: { ...build, hash: "3c14474", branch: "crew/x" }, tests: { hash: "3c14474aaaaa", state: "running" } });
  await strip.again();
  let text = strip.draw();
  assert.match(text, /Trying \| crew\/x \| 3c14474/);
  assert.match(text, /tests running/);
  assert.match(text, /Back \|.*Land on main/);
  files({ trying: { ...trying, into: "release" }, ins: { ...build, hash: "3c14474", branch: "crew/x" } });
  await strip.again();
  assert.match(strip.draw(), /Land on release/, "the button names the branch it would land on");
  files({ trying, ins: { ...build, hash: "3c14474", branch: "crew/x" }, tests: { hash: "3c14474aaaaa", state: "running" } });
  await strip.again();
  files({ trying, ins: { ...build, hash: "3c14474", branch: "crew/x" }, tests: { hash: "3c14474aaaaa", state: "failed", detail: "2 tests failed: test_a (x.Y)" } });
  await strip.again();
  text = strip.draw();
  assert.match(text, /tests failed: 2 tests failed/);
  assert.match(text, /Held: the tests fail on this branch/);
  fx.calls.length = 0;
  clicks.get("live-land")({}, strip.cx);
  await tick();
  assert.equal(palCalls().length, 0, "Land is held while the branch's tests fail");
  files({ trying, ins: { ...build, hash: "3c14474", branch: "crew/x" }, tests: { hash: "3c14474aaaaa", state: "passed", detail: "350 tests passed" } });
  await strip.again();
  assert.match(strip.draw(), /tests passed/);
  clicks.get("live-land")({}, strip.cx);
  await tick();
  const land = palCalls().find((c) => c[0] === "pal" && c[1] === "land");
  assert.deepEqual(land.slice(1, 5), ["land", "Builder#x", "--at", "3c14474aaaaa"], "only the commit that was tried");
  assert.equal(land[5], "--click");
  assert.ok(token(["land", "Builder#x", "--at", "3c14474aaaaa"]), "Land is the owner's click: a token for exactly that command");
  assert.match(fx.toasts.at(-1).title, /Landed crew\/x/);
  assert.match(strip.draw(), /Landing…/);
  // The trial ends (the files say so): the strip is empty again, and Back works on the next one.
  files();
  await strip.again();
  assert.equal(strip.draw(), "");
  files({ trying, ins: { ...build, hash: "3c14474", branch: "crew/x" } });
  await strip.again();
  strip.draw();
  fx.calls.length = 0; fx.written.length = 0;
  clicks.get("live-back")({}, strip.cx);
  await tick();
  const back = palCalls().find((c) => c[0] === "sh");
  assert.ok(back, "Back runs on its own (it reloads this mod)");
  assert.deepEqual(back.slice(-3), ["update", "back", "--json"]);
  assert.ok(token(["update", "back", "--json"]));
  assert.match(strip.draw(), /Putting back what was running/);

  // ── The status bar: the chip, the strip's show and hide, one toast per swap ──
  const node = { id: "root", children: [{ id: "crew-live", hidden: true }, { id: "body" }] };
  fx.layout = node;
  fx.calls.length = 0; fx.toasts.length = 0;
  files({ channel: "live", last: { id: "100-b6c982c", action: "live", state: "done", branch: "main", hash: "b6c982c1f00d", subject: "Trees: lighter", reloaded: ["crew-roster"], at: now - 5 } });
  const bar = await open("crew-status.mjs");
  text = bar.draw();
  assert.match(text, /live · b6c982c/);
  assert.equal(fx.toasts.length, 0, "the first look only notes the last swap; it doesn't toast an old one");
  assert.ok(!fx.calls.some((c) => c[0] === "run"), "no trial: the strip stays hidden");
  files({ channel: "live", last: { id: "200-aaaaaaa", action: "live", state: "done", branch: "main", hash: "aaaaaaa00000", subject: "About: one", reloaded: ["crew-about"], crewd: true, at: now }, ins: { ...build, hash: "aaaaaaa" } });
  await bar.again();
  assert.equal(fx.toasts.length, 1);
  assert.equal(fx.toasts[0].title, "main aaaaaaa is live");
  assert.match(fx.toasts[0].body, /About: one · reloaded about in place, crewd restarted/);
  await bar.again();
  assert.equal(fx.toasts.length, 1, "once");
  assert.match(bar.draw(), /live · aaaaaaa/);
  // A strip too narrow for the commit still says it's live.
  bar.v.w = 110;
  bar.draw();
  assert.ok(drawn.includes("live") && !drawn.includes("live · aaaaaaa"), "the short form");
  bar.v.w = 304;
  // A commit that didn't come up: a warning toast, and the chip says it's held.
  files({ channel: "live", hold: { hash: "deadbeef0000", why: "crew-about doesn't load" }, last: { id: "300-deadbee", action: "live", state: "failed", branch: "main", hash: "deadbeef0000", error: "crew-about doesn't load", at: now }, ins: { ...build, hash: "aaaaaaa" } });
  await bar.again();
  assert.equal(fx.toasts.at(-1).level, "warning");
  assert.match(bar.draw(), /main deadbee isn't installed: crew-about doesn't load/);
  // A trial: the strip is shown, the chip turns to "trying", and hidden again when it ends.
  files({ channel: "live", trying, ins: { ...build, hash: "3c14474", branch: "crew/x" }, last: { id: "400-3c14474", action: "try", state: "done", branch: "crew/x", hash: "3c14474aaaaa", reloaded: [], at: now } });
  await bar.again();
  assert.ok(fx.calls.some((c) => c[0] === "run" && c[1] === "layout.show" && c[2] === '{"id":"crew-live"}'));
  assert.match(bar.draw(), /trying crew\/x/);
  assert.equal(fx.toasts.at(-1).title, "Trying crew/x");
  node.children[0].hidden = false;
  files({ channel: "live", last: { id: "500-back", action: "back", state: "done", branch: "crew/x", at: now } });
  await bar.again();
  assert.ok(fx.calls.some((c) => c[0] === "run" && c[1] === "layout.hide"));
  // The full suite failing on the running build: one warning.
  node.children[0].hidden = true;
  const n0 = fx.toasts.length;
  files({ channel: "live", tests: { hash: "b6c982c1f00d", state: "failed", detail: "1 test failed: test_x (a.B)" }, last: { id: "500-back", action: "back", state: "done", at: now } });
  await bar.again(); await bar.again();
  assert.equal(fx.toasts.length, n0 + 1);
  assert.match(fx.toasts.at(-1).title, /Tests fail on main b6c982c/);
  // The release pill isn't offered on Live or during a trial (Back to stable is the way there).
  fx.files["data/crew-update.json"] = JSON.stringify({ latest: "0.5.0", checked: now - 60, repo: "o/r" });
  await bar.again();
  for (const f of bar.cx.timers) f(bar.cx);
  await tick();
  assert.ok(!/Update · 0\.5\.0/.test(bar.draw()), "no release pill on Live");
  fx.files["data/crew-settings.json"] = JSON.stringify({ owner: "DeNon", channel: "stable" });
  await bar.again();
  assert.match(bar.draw(), /Update · 0\.5\.0/, "on Stable it's offered as before");
  // Stable, a plain release: just the version.
  files({ ins: null });
  await bar.again();
  text = bar.draw();
  assert.ok(!/live ·|trying/.test(text), text);

  // ── About: the build line, the channel switch, Back to stable ──
  files();
  fx.calls.length = 0; fx.written.length = 0; fx.toasts.length = 0;
  const about = await open("crew-about.mjs", { overlay: "ov1" });
  text = about.draw();
  assert.match(text, /Version 0\.4\.1 · main b6c982c · 53 commits after v0\.4\.1/);
  assert.match(text, /Update channel/);
  assert.match(text, /Stable: GitHub releases\. Live: what you land on main/);
  clicks.get("set-channel-live")({}, about.cx);
  await tick();
  const sw = fx.calls.find((c) => c[0] === "pal" && c[1] === "settings");
  assert.deepEqual(sw.slice(1, 5), ["settings", "channel", "live", "--click"]);
  assert.ok(token(["settings", "channel", "live"]), "the channel is the owner's click");
  assert.equal(fx.toasts.at(-1).title, "Live: following main");
  files({ channel: "live", last: { id: "1", action: "live", state: "done", branch: "main", hash: "b6c982c1f00d", subject: "Trees: lighter", reloaded: ["crew-roster", "crew-about"], crewd: true, at: now - 30 }, tests: { hash: "b6c982c1f00d", state: "passed" } });
  await about.again();
  text = about.draw();
  assert.match(text, /Live: following main/);
  assert.match(text, /“Trees: lighter” · reloaded roster, about in place, crewd restarted · tests passed/);
  assert.match(text, /Live installs what you land on main in ~\/Projects\/project-pals, as you land it/);
  assert.match(text, /Back to stable \(0\.4\.1\)/);
  files({ channel: "live", hold: { hash: "deadbeef0000", why: "crewd didn't come back after its restart" } });
  await about.again();
  assert.match(about.draw(), /main deadbee isn't running \| crewd didn't come back after its restart It's tried again when main moves/);
  files({ channel: "live", trying, ins: { ...build, hash: "3c14474", branch: "crew/x" } });
  await about.again();
  assert.match(about.draw(), /Trying crew\/x \| Since .* Back on the strip at the top puts back main b6c982c/);
  // A switch that fails says why (no checkout found).
  files({ channel: "stable" });
  await about.again();
  about.draw();
  fx.fail = "couldn't find your Project Pals checkout; say where it is";
  clicks.get("set-channel-live")({}, about.cx);
  await tick();
  fx.fail = null;
  assert.match(about.draw(), /That didn't work \| couldn't find your Project Pals checkout/);
  // Back to stable asks once more, then runs on its own with a click token.
  files({ channel: "live" });
  await about.again();
  about.draw();
  fx.calls.length = 0; fx.written.length = 0;
  clicks.get("about-stable")({}, about.cx);
  assert.equal(palCalls().length, 0, "nothing yet: it asks first");
  assert.match(about.draw(), /Go back to release 0\.4\.1\? \| Puts the newest release back over main b6c982c/);
  clicks.get("about-stable-go")({}, about.cx);
  await tick();
  assert.deepEqual(palCalls().find((c) => c[0] === "sh").slice(-3), ["update", "stable", "--json"]);
  assert.ok(token(["update", "stable", "--json"]));

  // ── Review: Try it live, only for a branch of Project Pals itself ──
  fx.diff = { branch: "crew/x", base: "main", path: "/wt/x", files: [{ path: "mods/crew-about/main.js", added: 3, removed: 1 }], untracked: [], commits: ["3c14474 Review: tried"],
    patch: "diff --git a/mods/crew-about/main.js b/mods/crew-about/main.js\n@@ -1,2 +1,3 @@\n a\n+b\n", dirty: false, pals: true };
  const review = await open("crew-review.mjs", { overlay: "ov2", space: "s1", tab: "t1" });
  assert.match(review.draw(), /Try it live/);
  fx.calls.length = 0; fx.written.length = 0; fx.closed = 0;
  clicks.get("rv-try")({}, review.cx);
  await tick();
  assert.deepEqual(palCalls().find((c) => c[0] === "sh").slice(-4), ["update", "try", "Builder#x", "--json"]);
  assert.ok(token(["update", "try", "Builder#x", "--json"]), "a trial is the owner's click");
  assert.equal(fx.closed, 1, "the dialog closes: the strip takes over");
  fx.diff = { ...fx.diff, pals: false };
  const other = await open("crew-review.mjs", { overlay: "ov3", space: "s1", tab: "t1" });
  assert.ok(!/Try it live/.test(other.draw()), "another project's branch has no Try it live");

  // The fake elements accept any method, so a misspelt one would pass here and throw in the app:
  // where this machine has Herdr's own type file, every method these mods called must be in it.
  const dts = join(process.env.HERDR_APP_HOME || join(process.env.HOME ?? "", ".config", "herdr-app"), "gpui-kit.d.ts");
  if (existsSync(dts)) {
    const types = readFileSync(dts, "utf8");
    const missing = [...used].filter((k) => !new RegExp(`\\b${k}\\s*[<(]`).test(types));
    assert.deepEqual(missing, [], "builder methods that aren't in gpui-kit.d.ts");
  }

  console.log("live view: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
