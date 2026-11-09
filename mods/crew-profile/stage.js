// The profile page (DeNon 2026-11-08: a mix of #1 Hero stage and #5 Mission control from the
// profile-directions board).
//   Top: the hero stage. The pal is the star: its pet, big, with its aura, on a stage lit in its
//        state's colour (blue working, mint done, amber needs you (breathing), red stuck, none at
//        rest); the state line over it ("Working · 12m in #profiles"), the name big under it, the
//        mission as one quiet line (click: the Vault's Mission), and a "Give <pal> a task…" composer
//        (compose.js: a real task on the board, images too).
//   Middle: four week cards (stagedata.js weekCards): Shipped (mint), In motion (blue), Needs you
//        (amber), Hiccups (red), from the board, the channels, the Inbox and the notebook.
//   Below (Full): calm panels: Channels (live state; click shows it in the terminal on the right;
//        Review on worktrees), Tasks (Now / Next / Blocked / Done, a task opens to Mark done or
//        Reopen), the Vault (Home, Mission, Journal, Brain), Memory (pinned note, Remember…), About
//        (role, facts, routines, the quick actions).
// Full: the dashboard layout's "stage" part (layouts/pals.json: dash-stage, beside dash-tbar and the
// live terminal dash-term). Side: the profile tab's top (main.js): a compact hero and the cards 2×2.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { panes, agents, run, notify, openOverlay, setShared, settings } from "herdr";
import {
  mascotEl, mood, petOf, petReady, petEl, petState, channelName, ago, loadOps, crewCli, taskFor,
  openPanel, worktreeOf, openReview, briefOf, taskTitle, tabHasAgent, leadPane, channelOrder, showTabs, TAG_WORDS,
} from "./crew.js";
import { stageTone, stateLine, weekCards, boardOf } from "./stagedata.js";
import { homeData } from "./vaultdata.js";
import { TaskDraft } from "./compose.js";
import { loadBrain } from "./project.js";
import { loadNotebook } from "./notebook.js";

const ICON = "mods/crew-roster/icons";

// ─── data and timers ──────────────────────────────────────────────────────────────────────────
// key: "profile-main" (Side) or "profile-stage" (Full). shownHere(): is this copy on screen.
export function initStage(view, cx, key, shownHere) {
  view.draft = new TaskDraft(key, (cx) => refreshOps(view, cx));
  view.openCard = null;
  view.stageW = 0;
  const need = (cx, quiet) => {
    const s = view.shown();
    if (!s || !shownHere()) return;
    const name = s.bot.name;
    if (view.brainFor !== name && !view.brainLoading) loadBrain(view, cx, true);
    if (view.nbFor !== name && !view.nbLoading) loadNotebook(view, cx, true);
    if (!quiet && view.memFor !== name && !view.loadingFor) { view.loadingFor = name; view.loadMemory(cx, true); }
  };
  cx.timer.every(400, (cx) => need(cx, false));
  cx.timer.every(4000, (cx) => { if (shownHere()) refreshOps(view, cx); });
  cx.timer.every(10000, (cx) => { if (shownHere() && !view.edit) { loadBrain(view, cx, true); loadNotebook(view, cx, true); } });
  refreshOps(view, cx);
}

function refreshOps(view, cx) {
  cx.spawn(async (cx) => { try { view.ops = await loadOps(); } catch {} cx.notify(); });
}

// The shown pal's channels, as the data functions take them.
function channelsOf(space, bot) {
  const all = agents(), ps = panes();
  return space.tabs.map((tab) => {
    const ag = all.filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0];
    return { id: tab.id, name: channelName(tab), status: tab.status, awake: tabHasAgent(tab, ps), changed_at: tab.changed_at, tab,
      title: taskTitle(ag?.title, bot.name, space.name, channelName(tab)) ?? briefOf(bot, tab)?.split("\n")[0] ?? null };
  });
}

const toneColor = (d, tone) => ({ work: [d.info, d.infoText], done: [d.ok, d.okHi], ask: [d.warn, d.warnText], stuck: [d.err, "#F3A3A3"] })[tone] ?? [null, d.fg2];
const mono10 = (d, text, color) => div().text_size(10).line_height("14px").font_family(d.mono).font_weight(500).text_color(color ?? d.fg3).child(text.toUpperCase());

// Show a channel: the dashboard's terminal follows the shown channel.
export function pointAt(space, tab) {
  showTabs();
  run("space.select", { id: space.id });
  run("tab.select", { id: tab.id });
}

// ─── the hero ─────────────────────────────────────────────────────────────────────────────────
// compact: Side (a smaller pet). w: the hero's width.
export function heroStage(view, space, bot, t, d, { compact = false, w = 420 } = {}) {
  const tab = space.tabs.find((x) => x.active);
  const m = mood(tab?.status ?? space.status, bot.awake || bot.starting);
  const state = petState(bot, m);
  const tone = stageTone(state, bot.awake);
  const [lit, ink] = toneColor(d, tone);
  const word = !bot.awake ? (bot.starting ? "Starting" : "Asleep") : TAG_WORDS[state] ?? "Resting";
  const since = state === "work" || state === "ask" ? ago(tab?.changed_at) : "";
  const line = stateLine({ word, since, channel: tone && tab ? channelName(tab) : null });
  const p = petOf(bot);
  const PH = compact ? 92 : 140, PW = Math.round(PH * 138 / 108);
  const H = compact ? 186 : 252;
  const W = Math.max(200, Math.round(w));
  const mis = view.brain && view.brainFor === bot.name ? view.brain.mission : null;
  const pet = div().relative().w(PW).h(PH).flex_none()
    .child(div().absolute().left(-28).top(-18).w(PW + 56).h(PH + 36).child(image(`${ICON}/pet-aura.svg`).w(PW + 56).h(PH + 36)))
    .when(Boolean(tone), (el) => el.child(div().absolute().left(-Math.round(PW * 0.2)).top(PH - Math.round(PH * 0.2)).w(Math.round(PW * 1.4)).h(Math.round(PH * 0.34))
      .when(tone === "ask", (e) => e.loop("opacity", { from: 0.45, to: 1, period: 1100 }))
      .child(image(`${ICON}/stage-spot-${tone}.svg`).w(Math.round(PW * 1.4)).h(Math.round(PH * 0.34)))))
    .child(div().absolute().left(0).top(0).child(p && petReady(p) ? petEl(p, state, PW, PH, { open: true })
      : div().w(PW).h(PH).flex().items_center().justify_center().child(mascotEl(bot, m, compact ? 56 : 84, t))));
  const stage = v_flex().id(`${view.draft.key}-stage`).relative().w(W).h(H).flex_none().items_center().overflow_hidden()
    .pt(compact ? 12 : 18)
    .when(Boolean(tone), (el) => el.border_b_1().border_color(`${lit}33`))
    .when(!tone, (el) => el.border_b_1().border_color(d.line));
  // The light: drawn first, as an image, so the pet and the text sit on it.
  if (tone) stage.child(div().absolute().left(0).top(0).w(W).h(H)
    .when(tone === "ask", (el) => el.loop("opacity", { from: 0.55, to: 1, period: 1100 }))
    .child(image(`${ICON}/stage-${tone}.svg`).w(W).h(H)));
  stage
    .child(h_flex().items_center().gap(6).h(16)
      .when(Boolean(lit), (el) => el.child(div().size(6).rounded(3).bg(lit)))
      .child(div().text_size(11).line_height("16px").font_family(d.mono).font_weight(500).text_color(ink).child(line)))
    .child(div().mt(compact ? 4 : 6).child(pet))
    .child(div().mt(compact ? 2 : 4).max_w(W - 32).truncate().text_size(compact ? 17 : 22).line_height(compact ? "22px" : "28px").font_weight(700).text_color(d.fg1).child(bot.name))
    .child(div().id(`${view.draft.key}-mission`).max_w(Math.min(W - 32, 620)).truncate().cursor_pointer().hover((s) => s.text_color(d.fg1))
      .tooltip(mis?.statement ? "The mission (in the Vault)" : "Write its mission (in the Vault)")
      .on_click((_e, cx) => { openPanel("mission"); cx.notify(); })
      .text_size(12.5).line_height("18px").text_color(mis?.statement ? d.fg2 : d.fg3)
      .child(mis?.statement || (bot.role ? bot.role : "No mission yet · write one")));
  view.draft.follow(space, bot);
  const cw = Math.min(compact ? W - 24 : 600, W - 32);
  return v_flex().id(`${view.draft.key}-hero`).w(W).flex_none().items_center()
    .on_drop((e, cx) => view.draft.attach(e.paths ?? [], cx))
    .child(stage)
    .child(div().pt(compact ? 10 : 14).pb(compact ? 4 : 6).child(view.draft.view(d, `${view.draft.key}-compose`, cw)));
}

// ─── the week cards ───────────────────────────────────────────────────────────────────────────
export function statCards(view, space, bot, d, { cols = 4, w = 420 } = {}) {
  const nb = view.nb && view.nbFor === bot.name ? view.nb : null;
  const cards = weekCards({ pal: space.name, channels: channelsOf(space, bot), tasks: view.ops?.tasks, approvals: view.ops?.approvals,
    proposals: view.ops?.proposals, stalled: view.ops?.stalled, nb });
  const chans = channelsOf(space, bot);
  const act = {
    shipped: () => openPanel("home"),
    motion: () => { const c = chans.find((x) => x.awake && x.status === "working"); if (c) pointAt(space, c.tab); },
    needs: () => { const c = chans.find((x) => x.awake && x.status === "blocked"); if (c) pointAt(space, c.tab); else setShared("crew.view", "you"); },
    hiccups: () => openPanel("notebook"),
  };
  const tip = { shipped: "The Vault's Home: the week", motion: "Show the topic at work", needs: "Show the topic that asks, or the Inbox", hiccups: "The Journal" };
  const gap = 10;
  const cw = Math.floor((w - gap * (cols - 1)) / cols);
  const grid = h_flex().flex_wrap().gap(gap).w(w);
  for (const c of cards) {
    const [col] = toneColor(d, c.tone);
    grid.child(v_flex().id(`${view.draft.key}-card-${c.key}`).w(cw).flex_none().px(12).py(10).gap(1).rounded(d.r.lg)
      .bg(`${col}1C`).border_1().border_color(`${col}40`).cursor_pointer().hover((s) => s.border_color(`${col}80`)).tooltip(tip[c.key])
      .on_click((_e, cx) => { act[c.key](); cx.notify(); })
      .child(div().text_size(24).line_height("30px").font_weight(700).text_color(col).child(c.value == null ? "—" : String(c.value)))
      .child(div().text_size(12).line_height("16px").font_weight(500).text_color(d.body).child(c.label))
      .child(div().truncate().text_size(10.5).line_height("14px").text_color(d.fg3).child(c.sub)));
  }
  return grid;
}

// ─── Full: the stage column ───────────────────────────────────────────────────────────────────
export function stagePart(view, space, bot, t, d) {
  const zoom = Number(settings()?.zoom) || 1;
  const W = view.stageW || 900;
  const inner = Math.min(W, 1240) - 40;
  const col = v_flex().w_full().items_center().pb(24)
    .child(heroStage(view, space, bot, t, d, { w: W }))
    .child(div().pt(8).child(statCards(view, space, bot, d, { cols: inner >= 560 ? 4 : 2, w: inner })));
  const panels = [
    ["channels", () => channelsPanel(view, space, bot, d)],
    ["tasks", () => tasksPanel(view, space, bot, d)],
    ["vault", () => vaultPanel(view, space, bot, d)],
    ["memory", () => panel(d, "memory", "Memory", null, link(d, "ps-mem-add", "Remember…", () => { view.showRemember = !view.showRemember; if (view.showRemember) view.remember.focus(); }), view.memory(bot, d))],
    ["about", () => aboutPanel(view, space, bot, t, d)],
  ];
  const n = inner >= 980 ? 3 : inner >= 600 ? 2 : 1;
  const order = { 1: [[0, 1, 2, 3, 4]], 2: [[0, 2, 4], [1, 3]], 3: [[0, 2], [1, 4], [3]] }[n];
  const gap = 12;
  const pw = Math.floor((inner - gap * (n - 1)) / n);
  col.child(h_flex().w(inner).pt(14).gap(gap).items_start()
    .children(order.map((ix, i) => v_flex().id(`ps-col-${i}`).w(pw).flex_none().gap(gap).children(ix.map((k) => panels[k][1]())))));
  return div().id("ps-scroll").size_full().overflow_y_scrollbar()
    .on_size_change((size, cx) => { const w = size.width / zoom; if (Math.abs((view.stageW ?? 0) - w) > 1) { view.stageW = w; cx.notify(); } })
    .child(col);
}

function panel(d, id, label, count, action, body) {
  return v_flex().id(`ps-${id}`).w_full().flex_none().rounded(d.r.lg).bg(d.raised).border_1().border_color(d.line)
    .child(h_flex().h(34).px(12).items_center().gap(6).border_b_1().border_color(d.line)
      .child(mono10(d, label))
      .when(count != null, (el) => el.child(div().text_size(10).font_family(d.mono).text_color(d.fg4).child(String(count))))
      .child(div().flex_1())
      .when(Boolean(action), (el) => el.child(action)))
    .child(div().px(12).py(10).child(body));
}

function link(d, id, text, act) {
  return div().id(id).text_size(11).line_height("14px").font_weight(500).text_color(d.fg2).cursor_pointer()
    .hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => { act(cx); cx.notify(); }).child(text);
}

function smallBtn(d, id, text, fn) {
  return div().id(id).h(20).px(7).flex().flex_none().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid).cursor_pointer()
    .hover((s) => s.border_color(d.lineStrong).bg(d.hover)).on_click((_e, cx) => { cx.stop_propagation(); fn(cx); cx.notify(); })
    .text_size(11).font_weight(500).text_color(d.body).child(text);
}

// Channels: live state, what each is on, its worktree with Review. Click: the terminal shows it.
function channelsPanel(view, space, bot, d) {
  const ps = panes();
  const list = v_flex().mx(-6);
  for (const tab of channelOrder(space, bot)) {
    const c = channelsOf(space, bot).find((x) => x.id === tab.id);
    const st = c.awake ? tab.status : null;
    const dot = { working: d.info, blocked: d.warn, done: d.ok }[st] ?? null;
    const word = !c.awake ? "no agent" : { working: "working", blocked: "asks you", done: "done", idle: "idle" }[st] ?? "idle";
    const since = c.awake ? ago(tab.changed_at) : "";
    const wt = worktreeOf(bot, tab);
    const lead = leadPane(tab.id, ps);
    list.child(v_flex().id(`ps-ch-${tab.id}`).px(6).py(6).gap(2).rounded(d.r.sm).cursor_pointer()
      .when(tab.active, (el) => el.bg(d.sel)).when(!tab.active, (el) => el.hover((s) => s.bg(d.hover)))
      .tooltip(tab.active ? "Shown in the terminal" : "Show it in the terminal")
      .on_click((_e, cx) => { if (!tab.active) pointAt(space, tab); cx.notify(); })
      .child(h_flex().items_center().gap(8)
        .child(dot ? div().size(7).flex_none().rounded(4).bg(dot) : c.awake ? div().size(7).flex_none().rounded(4).bg(d.fg4)
          : div().size(7).flex_none().rounded(4).border_1().border_color(d.fg4))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).font_weight(500).text_color(c.awake ? d.fg1 : d.fg2).child(`#${channelName(tab)}`))
        .child(div().flex_none().text_size(11).text_color(st === "blocked" ? d.warnText : st === "done" ? d.okHi : st === "working" ? d.infoText : d.fg3)
          .child(since && since !== "now" ? `${word} ${since}` : word)))
      .when(Boolean(c.title), (el) => el.child(div().pl(15).truncate().text_size(12).line_height("16px").text_color(c.awake ? d.body : d.fg3).child(c.title)))
      .when(Boolean(wt || lead?.branch), (el) => el.child(h_flex().pl(15).items_center().gap(6)
        .child(div().h(16).px(5).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid)
          .text_size(10).font_family(d.mono).text_color(d.fg2).child(wt ? `worktree · ${wt.branch ?? channelName(tab)}` : lead.branch))
        .child(div().flex_1())
        .when(Boolean(wt), (e) => e.child(smallBtn(d, `ps-rev-${tab.id}`, "Review", () => openReview(space, tab)))))));
  }
  return panel(d, "channels", "Topics", space.tabs.length,
    link(d, "ps-ch-new", "+ Topic", () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } })), list);
}

// Tasks: Now · Next · Blocked · Done (7 days). A task opens to its details and Mark done / Reopen;
// a channel's activity shows that channel.
function tasksPanel(view, space, bot, d) {
  const b = boardOf({ pal: space.name, tasks: view.ops?.tasks, channels: channelsOf(space, bot), stalled: view.ops?.stalled });
  const groups = [["now", "Now", b.now, d.infoText], ["blocked", "Blocked", b.blocked, d.warnText], ["next", "Next", b.next, null], ["done", "Done · 7 days", b.done, d.okHi]];
  const body = v_flex().gap(8);
  let any = false;
  for (const [key, title, items, color] of groups) {
    if (!items.length) continue;
    any = true;
    const g = v_flex().gap(2).child(h_flex().items_center().gap(6).pb(2).child(mono10(d, title, color)).child(div().text_size(10).font_family(d.mono).text_color(d.fg4).child(String(items.length))));
    items.slice(0, key === "done" ? 4 : 8).forEach((c, i) => g.child(taskRow(view, space, d, c, key, i)));
    if (items.length > (key === "done" ? 4 : 8)) g.child(div().text_size(11).text_color(d.fg3).child(`${items.length - (key === "done" ? 4 : 8)} more`));
    body.child(g);
  }
  if (!any) body.child(div().text_size(12).line_height("16px").text_color(d.fg3).child(`Nothing on the board. Give ${bot.name} a task above.`));
  const open = (view.ops?.tasks ?? []).filter((x) => taskFor(x, space.name) && ["open", "claimed", "blocked"].includes(x.status)).length;
  return panel(d, "tasks", "Tasks", open,
    link(d, "ps-tasks-all", "All tasks", () => openOverlay({ mod: "crew-tasks", kind: "dialog", width: 520, props: { space: space.id } })), body);
}

function taskRow(view, space, d, c, col, i) {
  const key = c.task ? c.task.id : `${col}-${c.ch?.id ?? c.key ?? i}`;
  const open = view.openCard === key;
  const mark = col === "done" ? [d.ok, "✓"] : c.ask || c.stuck ? [d.warn, "!"] : col === "now" ? [d.info, "●"] : [d.fg4, "○"];
  const meta = c.task ? (col === "next" && c.after?.length ? `after ${c.after.join(", ")}` : c.task.id)
    : c.ask ? "needs you" : c.stuck ? `stuck${c.since ? ` ${ago(c.since)}` : ""}` : c.since ? ago(c.since) : "";
  const row = v_flex().id(`ps-t-${key}`).px(6).py(5).mx(-6).rounded(d.r.sm).cursor_pointer().when(open, (el) => el.bg(d.sel)).when(!open, (el) => el.hover((s) => s.bg(d.hover)))
    .on_click((_e, cx) => { if (c.task) view.openCard = open ? null : key; else if (c.ch) pointAt(space, c.ch.tab); cx.notify(); })
    .child(h_flex().items_center().gap(8)
      .child(div().w(10).flex_none().text_size(11).text_color(mark[0]).child(mark[1]))
      .child(div().flex_1().min_w(0).truncate().text_size(12).line_height("16px").text_color(col === "done" ? d.fg2 : d.fg1).child(c.task ? c.task.title : c.activity))
      .when(Boolean(c.ch), (el) => el.child(div().flex_none().text_size(10).font_family(d.mono).text_color(d.fg2).child(`#${c.ch.name}`)))
      .child(div().flex_none().text_size(10).font_family(d.mono).text_color(c.ask || c.stuck ? d.warnText : d.fg4).child(meta)));
  if (open && c.task) {
    const x = c.task;
    row.child(v_flex().gap(6).pl(18).pt(6)
      .when(Boolean(x.body), (e) => e.child(div().text_size(12).line_height("16px").text_color(d.body).child(String(x.body).slice(0, 1200))))
      .when(Boolean(x.result), (e) => e.child(div().text_size(12).line_height("16px").text_color(d.fg2).child(`Result: ${x.result}`)))
      .child(h_flex().gap(6)
        .when(x.status !== "done", (e) => e.child(smallBtn(d, `ps-done-${x.id}`, "Mark done", (cx) => taskCmd(view, cx, ["task", "done", x.id]))))
        .when(x.status === "done", (e) => e.child(smallBtn(d, `ps-reopen-${x.id}`, "Reopen", (cx) => taskCmd(view, cx, ["task", "reopen", x.id]))))));
  }
  return row;
}

function taskCmd(view, cx, args) {
  cx.spawn(async (cx) => {
    try { await crewCli(args); } catch (e) { notify({ title: "Couldn't change the task", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
    try { view.ops = await loadOps(); } catch {}
    cx.notify();
  });
}

// The Vault: its notes, each with what's in it. Click: that note, in the Vault tab.
function vaultPanel(view, space, bot, d) {
  const brain = view.brain && view.brainFor === bot.name ? view.brain : null;
  const nb = view.nb && view.nbFor === bot.name ? view.nb : null;
  const h = homeData({ brain, nb, tasks: (view.ops?.tasks ?? []).filter((x) => taskFor(x, space.name)) });
  const last = h.today[0];
  const rows = [
    ["home", "ds-focus", "Home", "The week, written for you", null],
    ["mission", "ds-mission", "Mission", h.statement || "No mission yet", h.doneWhen.total ? `${h.doneWhen.done}/${h.doneWhen.total}` : null],
    ["notebook", "ds-notebook", "Journal", last ? (last.did ?? last.task ?? "today's entry") : nb ? "Nothing written today" : "Reading…", nb ? `${h.today.length} today` : null],
    ["brain", "ds-brain", "Brain", h.decisions[0]?.text ?? (brain ? "No decisions yet" : "Reading…"), brain ? `${h.counts.decisions} dec · ${h.counts.changes} chg` : null],
  ];
  const body = v_flex().mx(-6).children(rows.map(([key, icon, label, sub, meta]) => h_flex().id(`ps-v-${key}`).px(6).py(6).gap(10).items_center().rounded(d.r.sm)
    .cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => { openPanel(key); cx.notify(); })
    .child(svg(`${ICON}/${icon}.svg`).size(14).flex_none().text_color(d.iconOn))
    .child(v_flex().flex_1().min_w(0)
      .child(div().text_size(12).line_height("16px").font_weight(500).text_color(d.fg1).child(label))
      .child(div().truncate().text_size(11.5).line_height("15px").text_color(d.fg2).child(sub)))
    .when(Boolean(meta), (el) => el.child(div().flex_none().text_size(10).font_family(d.mono).text_color(d.fg3).child(meta)))));
  if (h.focus) body.child(div().pt(6).px(6).truncate().text_size(11).line_height("15px").text_color(d.fg3).child(`Focus: ${h.focus}`));
  return panel(d, "vault", "Vault", null, link(d, "ps-vault-open", "Open", () => openPanel("vault")), body);
}

// About: the role (click to change), the facts, routines, and the quick actions.
function aboutPanel(view, space, bot, t, d) {
  const body = v_flex().gap(10)
    .child(view.roleRow(bot, d))
    .child(view.facts(space, bot, d))
    .child(v_flex().gap(4).child(h_flex().items_center().child(mono10(d, "Routines")).child(div().flex_1())
      .child(link(d, "ps-routines", "Manage", () => openOverlay({ mod: "crew-routines", kind: "dialog", width: 520 }))))
      .child(view.routines(bot, d)))
    .child(view.actions(space, bot, d));
  return panel(d, "about", "About", null, link(d, "ps-look", "Customize look", () => openOverlay({ mod: "crew-look", kind: "dialog", width: 520, props: { space: space.id } })), body);
}
