// The welcome tour, on Home (T76; design: data/crew-boards/onboarding, DeNon's pick A "On Home",
// 2026-11-09; RECIPE "The welcome tour"). Seven fixed screens in the head pal's voice, one message
// and one main button each: hello → what a pal is → hire your first pal → Home → talk to me → you
// stay in charge → done. "Skip the tour" is on every screen; a tour left halfway resumes there.
//
// What it does, and when:
// - Looking only, before any click: the installed brains (Herdr's knownAgents, the hire dialog's
//   list) and `pal welcome folders` (git folders in the usual places: names and dates, no contents).
// - The first click (Show me around, or Skip): hires the head pal with `pal hire --god` when there
//   isn't one and a brain is installed. Nothing is sent to it.
// - "Hire <Pal>" on screen 3: `pal hire <Pal> --folder … --harness …`. The view stays on the tour.
// - Nothing else: no second pal, no routines, no settings but the tour's own mark.
//
// The words are in welcome-text.js (pure, tested by tests/test_welcome.mjs). This file is drawn by
// crew-home's render while welcomePending().

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, exec, home as homeDir, knownAgents, notify, openOverlay, run } from "herdr";
import {
  crew, botOf, headName, owner as ownerName, headPet, petOf, petReady, petEl, mascotEl, mood, pebble, keyCap,
  saveUiSettings, welcomeMark, helpersOn, openTerminal, showTabs,
} from "./crew.js";
import { BEATS, beat, beatAt, pickBrain, when } from "./welcome-text.js";

const PAL = () => `${homeDir()}/.local/bin/pal`;
const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const hasHead = () => crew().bots.some((b) => b.god);
// Pals that aren't the head pal, the idea partner or the Chief.
const otherPals = () => spaces().filter((s) => { const b = botOf(s); return !b.god && !b.partner && !b.chief; });

// The tour's own state, kept on the Home view (host.wel).
function state(host) {
  host.wel ??= { loaded: false, loading: false, agents: [], folders: [], pick: 0, brain: null, headBrain: null, hiring: null, hired: null, busy: false };
  return host.wel;
}

// Read what's installed and which folders look like projects. Again on "Check again".
export function welcomeLoad(host, cx, again = false) {
  const w = state(host);
  if (w.loading || (w.loaded && !again)) return;
  w.loading = true;
  cx.spawn(async (cx) => {
    try { w.agents = (await knownAgents({ on: null })).filter((a) => a.installed); } catch { w.agents = []; }
    try {
      const r = await exec(PAL(), ["welcome", "folders", "--json"], { timeout: 15000 });
      w.folders = r.code === 0 ? JSON.parse(r.stdout || "[]") : [];
    } catch { w.folders = []; }
    w.headBrain = w.agents.find((a) => a.key === w.headBrain?.key) ?? pickBrain(w.agents);
    w.brain = w.agents.find((a) => a.key === w.brain?.key) ?? w.headBrain;
    if (w.pick >= w.folders.length) w.pick = 0;
    w.loaded = true;
    w.loading = false;
    if (again && !w.agents.length) notify({ title: "Still no brain found", body: "Install a coding agent and sign in to it, then check again.", level: "info", timeout: 4000 });
    cx.notify();
  });
}

function context(host) {
  const w = state(host);
  const mark = welcomeMark() ?? {};
  const f = w.folders[w.pick] ?? null;
  // A hire in flight is done once its space is there.
  if (w.hiring && spaces().some((s) => same(s.name, w.hiring))) { w.hired = w.hiring; w.hiring = null; }
  const pal = w.hired ?? mark.pal ?? f?.name ?? null;
  return {
    head: headName(), owner: ownerName(), brain: hasHead() ? null : w.headBrain?.name ?? null,
    brains: w.loaded ? w.agents.map((a) => a.name) : ["…"], folders: w.folders.length,
    pal, hired: Boolean(w.hired ?? mark.pal), pals: mark.replay ? otherPals().length : 0,
    palBrain: (w.brain ?? w.headBrain)?.key ?? null, helpers: helpersOn() !== false,
  };
}

const setBeat = (i) => saveUiSettings({ welcome: { beat: Math.min(BEATS.length - 1, Math.max(0, i)) } });

// Hiring makes a space, and its new terminal takes the keyboard (seen live, 2026-11-09: Enter worked
// on screen 1 and not after). Give it back to Home once the hire returns, from a task, never in render.
const refocus = (host) => { try { host.handle?.focus(); } catch {} };

// The first click: every install gets its head pal (when a brain is installed and there isn't one).
function hireHead(host) {
  const w = state(host);
  if (hasHead() || w.headAsked || !w.headBrain) return;
  w.headAsked = true;
  exec(PAL(), ["hire", "--god", "--harness", w.headBrain.key], { timeout: 90000 })
    .then((r) => { refocus(host); if (r.code !== 0 && !hasHead()) { w.headAsked = false; notify({ title: `Couldn't hire ${headName()}`, body: (r.stderr || r.stdout).trim().split("\n").slice(-2).join(" "), level: "warning", timeout: 8000 }); } })
    .catch((e) => { if (!hasHead()) { w.headAsked = false; notify({ title: `Couldn't hire ${headName()}`, body: String(e.message ?? e).slice(0, 200), level: "warning", timeout: 8000 }); } });
}

function hireFirst(host, cx) {
  const w = state(host);
  const f = w.folders[w.pick];
  const brain = w.brain ?? w.headBrain;
  if (!f || !brain || w.hiring) return;
  if (spaces().some((s) => same(s.name, f.name))) { notify({ title: `There's already a pal called ${f.name}`, body: "Pick another folder, or hire it under another name from the + in the sidebar.", level: "info", timeout: 5000 }); return; }
  w.hiring = f.name;
  const fail = (msg) => { if (w.hiring === f.name && !spaces().some((s) => same(s.name, f.name))) { w.hiring = null; notify({ title: `Couldn't hire ${f.name}`, body: msg, level: "warning", timeout: 8000 }); cx.notify(); } };
  exec(PAL(), ["hire", f.name, "--harness", brain.key, "--folder", f.path], { timeout: 90000 })
    .then((r) => { refocus(host); if (r.code !== 0) fail((r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ")); else { w.hired = f.name; w.hiring = null; saveUiSettings({ welcome: { pal: f.name } }); cx.notify(); } })
    .catch((e) => fail(String(e.message ?? e).slice(0, 200)));
}

function finish(host, cx, go) {
  const w = state(host);
  const pal = w.hired ?? welcomeMark()?.pal ?? null;
  saveUiSettings({ welcome: { state: "done", beat: 0, replay: false, pal: null, at: Date.now() } });
  host.wel = null;
  if (go && pal) {
    const s = spaces().find((x) => same(x.name, pal));
    if (s) { run("space.select", { id: s.id }); showTabs(); }
  }
  cx.notify();
}

function skip(host, cx) {
  hireHead(host);
  saveUiSettings({ welcome: { state: "skipped", beat: 0, replay: false, pal: null, at: Date.now() } });
  host.wel = null;
  notify({ title: "No problem", body: `${headName()} is in the sidebar if you need it. The tour is in the gear menu: Welcome tour.`, level: "info", timeout: 5000 });
  cx.notify();
}

// The main button of the screen that shows.
function forward(host, cx) {
  const w = state(host);
  const i = beatAt(welcomeMark());
  const id = BEATS[i];
  const b = beat(id, context(host));
  if (id === "hello") hireHead(host);
  if (id === "hire") {
    if (b.check) return welcomeLoad(host, cx, true);
    if (b.list) {
      if (w.hiring) return;
      if (w.folders[w.pick]) return hireFirst(host, cx);
      return openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true });
    }
  }
  if (id === "done") return finish(host, cx, true);
  setBeat(i + 1);
}

function back(host) { const i = beatAt(welcomeMark()); if (i > 0) setBeat(i - 1); }

// Keys: Enter the main button, ← or K back, ↑↓ the folder list, T the head pal's terminal (screen 5).
// Returns true when it took the key.
export function welcomeKey(host, e, cx) {
  const w = state(host);
  const k = e.keystroke;
  const id = BEATS[beatAt(welcomeMark())];
  if (k === "enter") forward(host, cx);
  else if (k === "left" || k === "k") back(host);
  else if (id === "hire" && (k === "down" || k === "j")) w.pick = Math.min(Math.max(0, w.folders.length - 1), w.pick + 1);
  else if (id === "hire" && k === "up") w.pick = Math.max(0, w.pick - 1);
  else if (id === "talk" && k === "t" && hasHead()) openTerminal();
  else return false;
  return true;
}

// The head pal's pet (hired or not), or a sample pose.
function face(state, w, t) {
  const bot = headPet();
  const p = petOf(bot);
  const h = Math.round(w * 108 / 138);
  return div().w(w).h(h).flex_none().flex().items_center().justify_center()
    .child(p && petReady(p) ? petEl(p, state, w, h, { open: true }) : mascotEl(bot, mood("idle", true), Math.min(h, 40), t));
}

export function welcomeView(host, d, t, cx) {
  const w = state(host);
  welcomeLoad(host, cx);
  const mark = welcomeMark() ?? {};
  const i = beatAt(mark);
  const id = BEATS[i];
  const ctx = context(host);
  const b = beat(id, ctx);
  const narrow = (host.w ?? 1200) < 720;

  const pips = h_flex().flex_none().gap(4).children(BEATS.map((_, j) => div().w(22).h(3).rounded(2).bg(j === i ? d.fg1 : j < i ? d.fg3 : d.lineMid)));
  const top = h_flex().h(32).flex_none().items_center().gap(12)
    .child(div().flex_none().text_size(13).font_weight(600).text_color(d.fg2).child("Welcome"))
    .child(pips)
    .child(div().flex_none().text_size(12).font_weight(500).text_color(d.body).child(`${i + 1} of ${BEATS.length}`));

  const say = div().text_size(24).line_height("32px").font_weight(600).text_color(d.fg1).text_center().child(b.say);
  const more = div().max_w(560).text_size(14).line_height("22px").text_color(d.body).text_center().child(b.more);
  const mid = v_flex().id(`wel-${id}`).flex_1().min_h(0).items_center().justify_center().gap(12).px(narrow ? 8 : 40);

  if (id === "hello") {
    mid.child(face("rest", 150, t)).child(say).child(more);
    // Which brain runs the head pal: click to take the next installed one.
    const fine = h_flex().gap(6).items_center().text_size(12).line_height("16px").text_color(d.fg3).child(div().child(`I'll call you ${ctx.owner}`));
    if (!hasHead() && w.headBrain) {
      fine.child(div().child("·")).child(div().child("running on"))
        .child(div().id("wel-brain").px(4).rounded(d.r.xs).text_color(d.fg2).when(w.agents.length > 1, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover))
          .tooltip("Click for another installed brain")
          .on_click((_e, cx) => { const at = w.agents.findIndex((a) => a.key === w.headBrain.key); w.headBrain = w.agents[(at + 1) % w.agents.length]; if (!w.hired) w.brain = w.headBrain; cx.notify(); }))
          .child(w.headBrain.name));
    } else if (w.loaded && !hasHead()) fine.child(div().child("·")).child(div().text_color(d.warnText).child("no brain installed yet"));
    mid.child(fine);
  } else if (id === "pal") {
    // A sample pal: its folder, its brain, two topics.
    mid.child(h_flex().flex_none().gap(12).items_center().px(14).py(10).rounded(6).bg(d.bg1).border_1().border_color(d.line)
      .child(v_flex().gap(4)
        .child(div().text_size(14).font_weight(600).text_color(d.fg1).child(ctx.pal ?? "Weather App"))
        .child(div().text_size(12).font_family(d.mono).text_color(d.fg2).child(`${(w.folders[w.pick]?.show) ?? "~/Projects/weather-app"} · ${(w.brain ?? w.headBrain)?.name ?? "a coding agent"}`))
        .child(h_flex().gap(6)
          .child(div().px(5).rounded(3).border_1().border_color(d.info + "66").text_size(11.5).font_family(d.mono).text_color(d.infoText).child("#fix-login"))
          .child(div().px(5).rounded(3).border_1().border_color(d.line).text_size(11.5).font_family(d.mono).text_color(d.fg2).child("#new-map")))))
      .child(div().h(4)).child(say).child(more);
  } else if (id === "hire") {
    mid.child(face(ctx.hired ? "done" : "ask", 110, t)).child(say).child(more);
    if (b.list && !ctx.hired) {
      const list = v_flex().w(narrow ? 320 : 520).flex_none().rounded(6).border_1().border_color(d.line).overflow_hidden();
      w.folders.forEach((f, j) => list.child(h_flex().id(`wel-f-${j}`).h(32).flex_none().items_center().gap(10).px(10).cursor_pointer()
        .when(j > 0, (el) => el.border_t_1().border_color(d.line)).when(j === w.pick, (el) => el.bg(d.sel)).hover((s) => s.bg(j === w.pick ? d.sel : d.hover))
        .on_click((_e, cx) => { if (!w.hiring) w.pick = j; cx.notify(); })
        .child(div().size(10).flex_none().rounded(5).border_1().border_color(j === w.pick ? d.fg1 : d.fg3).when(j === w.pick, (el) => el.bg(d.fg1)))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_family(d.mono).text_color(j === w.pick ? d.fg1 : d.body).child(f.show))
        .child(div().flex_none().text_size(11.5).text_color(d.fg3).child(when(f.at)))));
      list.child(h_flex().id("wel-f-other").h(32).flex_none().items_center().px(10).cursor_pointer().when(w.folders.length > 0, (el) => el.border_t_1().border_color(d.line)).hover((s) => s.bg(d.hover))
        .on_click(() => openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true }))
        .child(div().text_size(12.5).text_color(d.fg2).child("Choose another folder…")));
      mid.child(list);
      if (w.folders.length && w.agents.length) {
        mid.child(h_flex().flex_none().gap(8).items_center()
          .child(div().text_size(12).text_color(d.fg2).child("Its brain:"))
          .children(w.agents.slice(0, 6).map((a) => { const on = a.key === (w.brain ?? w.headBrain)?.key; return div().id(`wel-b-${a.key}`).h(22).px(8).flex().items_center().rounded(4).border_1().border_color(on ? d.fg2 : d.lineMid).cursor_pointer()
            .hover((s) => s.border_color(d.fg2)).on_click((_e, cx) => { w.brain = a; cx.notify(); })
            .child(div().text_size(12).text_color(on ? d.fg1 : d.body).child(a.name)); }))
          .child(div().text_size(11.5).text_color(d.fg4).child("found on this computer")));
      }
    }
  } else if (id === "home") {
    // What a decision looks like here (an example, not a real one).
    mid.child(v_flex().w(narrow ? 320 : 420).flex_none().gap(8).px(14).py(12).rounded(6).bg(d.bg1).border_1().border_color(d.line)
      .child(h_flex().gap(8).items_center()
        .child(div().h(16).px(5).flex().items_center().rounded(3).border_1().border_color(d.warnText + "66").text_size(9.5).font_weight(600).text_color(d.warnText).child("DECISION"))
        .child(div().text_size(11.5).text_color(d.fg3).child(`from ${ctx.pal ?? "a pal"} · an example`)))
      .child(div().text_size(13).font_weight(600).text_color(d.fg1).child("Tests pass. Open a pull request?"))
      .child(h_flex().gap(8).items_center()
        .child(div().h(22).px(8).flex().items_center().rounded(4).bg(d.sel).border_1().border_color(d.lineMid).text_size(11.5).text_color(d.fg1).child("Open it"))
        .child(div().h(22).px(8).flex().items_center().rounded(4).border_1().border_color(d.lineMid).text_size(11.5).text_color(d.body).child("Not yet"))
        .child(div().text_size(11.5).text_color(d.fg3).child("my pick: Open it"))))
      .child(div().h(4)).child(say).child(more);
  } else if (id === "talk") {
    mid.child(face("rest", 110, t)).child(say).child(more)
      .child(v_flex().flex_none().gap(6).items_center().children((b.chips ?? []).map((c, j) => div().id(`wel-chip-${j}`).h(26).px(10).flex().items_center().rounded(4).bg(d.bg1).border_1().border_color(d.line)
        .text_size(12).font_family(d.mono).text_color(d.body).child(`❯ ${c}`))));
  } else if (id === "charge") {
    mid.child(face("ask", 110, t)).child(say).child(more);
    if (b.fine) mid.child(div().text_size(12).text_color(d.fg3).child(b.fine));
  } else {
    mid.child(face("done", 150, t)).child(say).child(more);
  }

  const busy = Boolean(w.hiring) || (id === "hire" && !w.loaded);
  const label = w.hiring ? `Hiring ${w.hiring}…` : b.go;
  const foot = h_flex().h(56).flex_none().items_center().gap(10).border_t_1().border_color(d.line)
    .child(pebble(d, { id: "wel-go", label, primary: true, disabled: busy, onClick: (cx) => forward(host, cx) }))
    .child(keyCap(d, "↵"));
  if (b.alt && !w.hiring) foot.child(pebble(d, { id: "wel-alt", label: b.alt, onClick: (cx) => { if (id === "done") finish(host, cx, false); else setBeat(i + 1); cx.notify(); } }));
  if (i > 0 && id !== "done") foot.child(pebble(d, { id: "wel-back", label: "Back", onClick: () => back(host) }));
  if (id === "talk" && hasHead()) foot.child(pebble(d, { id: "wel-term", icon: "ds-terminal", label: `Open ${ctx.head}'s terminal`, extra: "T", onClick: () => openTerminal() }));
  foot.child(div().flex_1());
  if (id !== "done") foot.child(div().id("wel-skip").h(24).px(8).flex().items_center().rounded(d.r.xs).cursor_pointer().hover((s) => s.bg(d.hover))
    .on_click((_e, cx) => skip(host, cx))
    .child(div().text_size(12).text_color(d.fg3).child("Skip the tour")));

  return v_flex().id("welcome").size_full().px(narrow ? 16 : 40).pt(16).pb(8).child(top).child(mid).child(foot);
}
