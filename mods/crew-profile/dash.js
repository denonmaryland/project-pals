// The profile dashboard (stage 3 of docs/profiles/proposal.md): the Profile tab in Full. It's a
// small layout of its own (layouts/pals.json, profile-dash), each part a copy of crew-profile with
// props.part: "head" (the header and the pal's strip), "left" (its channels and memory), "board"
// (Now / Next / Blocked / Done) and "tbar" (the bar over dash-term, the shown channel's live agent
// terminal: an {agent: "focused"} block, the real session, typed into directly).
//
// Pointing the terminal at a channel = showing that channel (tab.select, then agent.focus on its
// agent). In Full the work column is hidden, so the session shows in one place only.

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, run, notify, layout } from "herdr";
import {
  botOf, mascotEl, mood, petOf, petReady, petEl, petState, channelName, ago, loadOps, crewCli, taskOf,
  panelTab, openPanel, closePanel, setPanelSize, worktreeOf, openReview, briefOf, taskTitle, tabHasAgent, leadPane,
  channelOrder, showTabs, dashShown, focusShownAgent, openChannels, TAG_WORDS, wakePal,
} from "./crew.js";
import { loadBrain } from "./project.js";

const ICON = "mods/crew-roster/icons";
const TABS = [["profile", "Profile"], ["notebook", "Notebook"], ["|"], ["mission", "Mission"], ["brain", "Brain"], ["agents", "AGENTS.md"]];
const OPEN = ["open", "claimed", "blocked"];

export function initDash(view, cx, part) {
  if (part === "board" || part === "head") {
    const ops = (cx) => cx.spawn(async (cx) => { try { view.ops = await loadOps(); } catch {} cx.notify(); });
    ops(cx);
    cx.timer.every(4000, (cx) => { if (dashShown()) ops(cx); });
  }
  if (part === "head") cx.timer.every(10000, (cx) => { if (dashShown()) loadBrain(view, cx, true); });
  if (part === "left") cx.timer.every(8000, (cx) => { if (dashShown()) view.loadMemory(cx, true); });
  if (part === "tbar") {
    // Keep dash-term on the shown channel's agent, and hidden when that channel has no agent (an
    // agent block would otherwise show some other pal's agent).
    cx.timer.every(700, (cx) => {
      if (!dashShown()) return;
      const sp = spaces().find((s) => s.active);
      const tab = sp?.tabs.find((x) => x.active);
      const has = tab ? tabHasAgent(tab) : false;
      const term = has ? leadPane(tab.id)?.terminal : null;
      if (term && term !== view.termFor) { view.termFor = term; focusShownAgent(); }
      const hidden = Boolean(findNode("dash-term")?.hidden);
      if (hidden === has) run(has ? "layout.show" : "layout.hide", { id: "dash-term" });
      cx.notify();
    });
  }
}

function findNode(id) {
  const walk = (n) => { if (n?.id === id) return n; for (const c of n?.children ?? []) { const f = walk(c); if (f) return f; } return null; };
  return walk(layout());
}

// Show a channel: in the dashboard that means the terminal below follows it.
function pointAt(space, tab) {
  showTabs();
  run("space.select", { id: space.id });
  run("tab.select", { id: tab.id });
}

const mono10 = (d, text) => div().text_size(10).line_height("14px").font_family(d.mono).font_weight(500).text_color(d.fg3).child(text.toUpperCase());

export function renderDash(view, part, t, d) {
  const s = view.shown();
  const root = v_flex().id(`dash-${part}`).size_full().bg(part === "left" || part === "head" || part === "tbar" ? d.bg1 : d.bg0);
  if (!s) return root;
  if (part === "head") return root.child(head(view, s, t, d));
  if (part === "left") return root.border_r_1().border_color(d.line).child(left(view, s, t, d));
  if (part === "board") return root.child(board(view, s, d));
  if (part === "tbar") return root.border_t_1().border_color(d.line).child(tbar(view, s, d));
  return root;
}

// ─── head: the panel header (with the tabs inline) and the pal's strip ────────────────────────
function head(view, { space, bot }, t, d) {
  const tab = space.tabs.find((x) => x.active);
  const m = mood(tab?.status ?? space.status, bot.awake || bot.starting);
  const btn = (id, icon, text, tip, act) => h_flex().id(id).h(28).gap(6).px(text ? 10 : 0).when(!text, (el) => el.w(28)).flex_none().items_center().justify_center()
    .rounded(d.r.sm).border_1().border_color(d.lineMid).cursor_pointer().tooltip(tip).hover((s) => s.bg(d.hover).border_color(d.lineStrong))
    .on_click((_e, cx) => { act(); cx.notify(); })
    .child(svg(`${ICON}/${icon}.svg`).size(13).text_color(d.fg2))
    .when(Boolean(text), (el) => el.child(div().text_size(12).font_weight(500).text_color(d.body).child(text)));
  const tabs = h_flex().items_center().gap(2).pl(8);
  for (const [key, label] of TABS) {
    if (key === "|") { tabs.child(div().w(1).h(16).mx(6).bg(d.lineMid)); continue; }
    const on = key === "profile";
    tabs.child(div().id(`dh-tab-${key}`).h(26).px(10).flex().items_center().rounded(d.r.sm).border_1()
      .border_color(on ? d.lineMid : "#00000000").when(on, (el) => el.bg(d.sel))
      .when(!on, (el) => el.cursor_pointer().hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => { openPanel(key); cx.notify(); }))
      .text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child(label));
  }
  const top = h_flex().h(52).flex_none().items_center().gap(10).pl(16).pr(10).border_b_1().border_color(d.line)
    .child(mascotEl(bot, m, 30))
    .child(div().flex_none().max_w(260).truncate().text_size(14).font_weight(600).text_color(d.fg1).child(bot.name))
    .child(tabs)
    .child(div().flex_1())
    .child(btn("dh-side", "ds-side", "Side", "Side: beside the terminal", () => setPanelSize("side")))
    .child(btn("dh-close", "ds-x", null, "Close (Esc in the panel)", () => closePanel()));
  // The strip: pet, name, role, state │ facts │ the mission.
  const p = petOf(bot);
  const state = petState(bot, m);
  const pet = div().relative().w(60).h(47).flex_none()
    .child(div().absolute().left(-12).top(-10).w(84).h(66).child(image(`${ICON}/pet-aura.svg`).w(84).h(66)))
    .child(div().absolute().left(0).top(0).child(p && petReady(p) ? petEl(p, state, 60, 47, { open: true }) : mascotEl(bot, m, 40, t)));
  const word = !bot.awake ? "Asleep" : TAG_WORDS[state] ?? "Resting";
  const since = state === "work" || state === "ask" ? ago(tab?.changed_at) : "";
  const dot = { work: d.info, ask: d.warn, stuck: d.warn, done: d.ok, pr: d.ok }[state];
  const done = view.ops?.tasks?.filter((x) => taskOf(x, bot.name) && x.status === "done").length ?? 0;
  const hired = bot.hired ? new Date(bot.hired).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const facts = [["brain", bot.harnessName ?? "no agent"], ["folder", (bot.folder ?? space.folder ?? "").replace(/^\/home\/[^/]+/, "~")],
    ["hired", [hired && `${hired}${bot.hiredBy ? ` · by ${bot.hiredBy}` : ""}`, `${done} tasks done`].filter(Boolean).join(" · ")]];
  const mis = view.brain && view.brainFor === bot.name ? view.brain.mission : null;
  const vsep = () => div().w(1).h(40).flex_none().bg(d.line);
  const strip = h_flex().h(72).flex_none().items_center().gap(16).px(16).border_b_1().border_color(d.line)
    .child(pet)
    .child(v_flex().flex_none().max_w(260).gap(2)
      .child(div().truncate().text_size(15).line_height("20px").font_weight(600).text_color(d.fg1).child(bot.name))
      .child(div().truncate().text_size(12).line_height("16px").text_color(d.fg2).child(bot.role || "No role yet"))
      .child(h_flex().items_center().gap(6).when(Boolean(dot), (el) => el.child(div().size(6).rounded(3).bg(dot)))
        .child(div().text_size(11).font_weight(500).text_color(dot === d.info ? d.infoText : dot === d.warn ? d.warnText : dot ? d.okHi : d.fg2)
          .child(since && since !== "now" ? `${word} · ${since}` : word))))
    .child(vsep())
    .child(v_flex().flex_none().max_w(320).gap(1).children(facts.map(([k, v]) => h_flex().gap(8)
      .child(div().w(44).flex_none().text_size(10).line_height("17px").font_family(d.mono).text_color(d.fg3).child(k))
      .child(div().truncate().text_size(12).line_height("17px").when(k === "folder", (el) => el.font_family(d.mono)).text_color(d.body).child(v)))))
    .child(vsep())
    .child(v_flex().id("dh-mission").flex_1().min_w(0).gap(2).cursor_pointer().on_click((_e, cx) => { openPanel("mission"); cx.notify(); })
      .child(mono10(d, mis?.done_when?.length ? `Mission · done when ${mis.done_when.filter((x) => x.done).length} of ${mis.done_when.length}` : "Mission"))
      .child(div().text_size(13).line_height("18px").font_weight(500).text_color(mis?.statement ? d.fg1 : d.fg3)
        .child(mis?.statement || "No mission yet: write one in the Mission tab.")));
  return v_flex().size_full().child(top).child(strip);
}

// ─── left: the channels, then memory ──────────────────────────────────────────────────────────
function left(view, { space, bot }, t, d) {
  const all = agents();
  const ps = panes();
  const col = v_flex().id("dl-scroll").size_full().overflow_y_scrollbar().pb(16);
  col.child(h_flex().px(16).pt(14).pb(6).items_center().gap(6).child(mono10(d, "Channels")).child(div().text_size(10).font_family(d.mono).text_color(d.fg4).child(String(space.tabs.length))));
  for (const tab of channelOrder(space, bot)) {
    const ag = all.filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0];
    const awake = tabHasAgent(tab, ps);
    const st = awake ? tab.status : null;
    const dot = { working: d.info, blocked: d.warn, done: d.ok }[st] ?? null;
    const word = !awake ? "no agent" : { working: "working", blocked: "asks you", done: "done", idle: "idle" }[st] ?? "idle";
    const since = awake ? ago(tab.changed_at) : "";
    const on = taskTitle(ag?.title, bot.name, space.name, channelName(tab)) ?? briefOf(bot, tab)?.split("\n")[0] ?? null;
    const wt = worktreeOf(bot, tab);
    const lead = leadPane(tab.id, ps);
    col.child(v_flex().id(`dl-ch-${tab.id}`).mx(8).px(8).py(7).gap(2).rounded(d.r.sm).cursor_pointer()
      .when(tab.active, (el) => el.bg(d.sel)).when(!tab.active, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => { if (!tab.active) pointAt(space, tab); cx.notify(); })
      .child(h_flex().items_center().gap(8)
        .child(dot ? div().size(7).flex_none().rounded(4).bg(dot) : div().size(7).flex_none().rounded(4).border_1().border_color(d.fg4))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).font_weight(500).text_color(awake ? d.fg1 : d.fg2).child(`#${channelName(tab)}`))
        .child(div().flex_none().text_size(11).text_color(st === "blocked" ? d.warnText : st === "done" ? d.okHi : d.fg3).child(since && since !== "now" ? `${word} ${since}` : word)))
      .child(div().pl(15).truncate().text_size(12).line_height("16px").text_color(awake ? d.body : d.fg3).child(on ?? (awake ? "" : "asleep")))
      .child(h_flex().pl(15).items_center().gap(6)
        .when(Boolean(wt || lead?.branch), (el) => el.child(div().h(16).px(5).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid)
          .text_size(10).font_family(d.mono).text_color(d.fg2).child(wt ? `worktree · ${wt.branch ?? channelName(tab)}` : lead.branch)))
        .child(div().flex_1())
        .when(Boolean(wt), (el) => el.child(div().id(`dl-rev-${tab.id}`).h(20).px(7).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid)
          .cursor_pointer().hover((s) => s.border_color(d.lineStrong)).on_click((_e, cx) => { cx.stop_propagation(); openReview(space, tab); })
          .text_size(11).font_weight(500).text_color(d.body).child("Review")))));
  }
  // Memory, compact: the pinned note and the latest notes; the full section is the Profile tab in Side.
  const m = view.mem?.bot === bot.name ? view.mem : null;
  col.child(div().mx(16).mt(12).h(1).bg(d.line));
  col.child(h_flex().px(16).pt(12).pb(6).items_center().gap(8).child(mono10(d, "Memory")).child(div().flex_1())
    .child(div().id("dl-mem-all").text_size(11).font_weight(500).text_color(d.fg2).cursor_pointer().hover((s) => s.text_color(d.fg1))
      .on_click((_e, cx) => { setPanelSize("side"); openPanel("profile", { section: "memory" }); cx.notify(); }).child("All · Remember…")));
  if (!m) return col.child(div().px(16).text_size(12).text_color(d.fg3).child("Reading its memory…"));
  if ((m.pinned ?? "").trim()) col.child(div().mx(16).mb(6).px(10).py(6).rounded(d.r.md).bg(d.inset).border_1().border_color(d.lineMid)
    .child(div().text_size(10).font_family(d.mono).text_color(d.fg3).child("Pinned")).child(div().text_size(12).line_height("16px").text_color(d.body).child(m.pinned)));
  const lines = (m.notes ?? []).flatMap((n) => n.lines.map((l) => [n.day, l])).slice(0, 4);
  for (const [day, l] of lines) {
    const mm = l.match(/^(\d\d:\d\d)(?:\s+(#\S+))?:\s*([\s\S]*)$/);
    col.child(h_flex().px(16).py(3).items_start().gap(8)
      .child(div().w(70).flex_none().text_size(10).line_height("16px").font_family(d.mono).text_color(d.fg3).child(`${day.slice(5)} ${mm?.[1] ?? ""}`))
      .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(d.body).child(mm ? mm[3] : l)));
  }
  if (m.total > m.limit) col.child(div().px(16).pt(6).text_size(11).line_height("15px").text_color(d.warnText)
    .child(`New sessions get ${m.limit.toLocaleString()} of ${m.total.toLocaleString()} characters.`));
  return col;
}

// ─── board: Now · Next · Blocked · Done ───────────────────────────────────────────────────────
function board(view, { space, bot }, d) {
  const tasks = (view.ops?.tasks ?? []).filter((x) => taskOf(x, bot.name));
  const chanOf = (task) => { const w = String(task.claimed_by || task.assignee || ""); const ch = w.includes("#") ? w.split("#")[1] : null; return ch ? space.tabs.find((x) => channelName(x).toLowerCase() === ch.toLowerCase()) ?? null : null; };
  const all = agents();
  const ps = panes();
  const done = new Set((view.ops?.tasks ?? []).filter((x) => x.status === "done").map((x) => x.id));
  const now = [], next = [], blocked = [], fin = [];
  // Tasks first.
  for (const x of tasks) {
    const card = { task: x, tab: chanOf(x) };
    if (x.status === "claimed") now.push(card);
    else if (x.status === "open") next.push({ ...card, after: (x.deps ?? []).filter((dd) => !done.has(dd)) });
    else if (x.status === "blocked") blocked.push(card);
    else if (x.status === "done" && Date.now() - (x.updated ?? 0) < 7 * 86400000) fin.push(card);
  }
  // Then what each channel is really doing: most work never reaches the task board.
  for (const tab of space.tabs) {
    if (!tabHasAgent(tab, ps)) continue;
    const ag = all.filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0];
    const title = taskTitle(ag?.title, bot.name, space.name, channelName(tab)) ?? briefOf(bot, tab)?.split("\n")[0] ?? null;
    const claimed = now.some((c) => c.tab?.id === tab.id);
    if (tab.status === "working" && !claimed) now.push({ activity: title ?? "working", tab, since: tab.changed_at });
    if (tab.status === "blocked") blocked.push({ activity: title ? `Asks you: ${title}` : "Asks you something", tab, since: tab.changed_at, ask: true });
  }
  for (const [term, st] of Object.entries(view.ops?.stalled ?? {})) {
    if (String(st.bot ?? "").toLowerCase() !== bot.name.toLowerCase()) continue;
    const tab = space.tabs.find((x) => channelName(x) === st.channel) ?? null;
    blocked.push({ activity: `Looks stuck since ${ago(st.since)}`, tab, stuck: true, key: term });
  }
  fin.sort((x, y) => (y.task.updated ?? 0) - (x.task.updated ?? 0));
  const mis = view.brain && view.brainFor === bot.name ? view.brain.mission : null;
  const chip = (tab, color, key) => tab ? div().id(`db-chip-${key}`).h(18).px(6).flex().flex_none().items_center().gap(5).rounded(d.r.xs)
    .bg(d.bg0).border_1().border_color(d.lineMid).cursor_pointer().hover((s) => s.border_color(d.lineStrong))
    .on_click((_e, cx) => { cx.stop_propagation(); pointAt(space, tab); cx.notify(); })
    .when(Boolean(color), (el) => el.child(div().size(6).rounded(3).bg(color)))
    .child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(d.body).child(`#${channelName(tab)}`)) : null;
  const card = (c, i, col) => {
    const key = c.task ? c.task.id : `${col}-${c.tab?.id ?? c.key ?? i}`;
    const open = view.openCard === key;
    const edge = c.ask || c.stuck ? "#E8AA0A55" : c.activity && col === "now" ? "#4CA1F244" : d.line;
    const kind = c.task ? (col === "next" && c.after?.length ? `after ${c.after.join(", ")}` : col === "done" ? "done" : c.task.status)
      : c.ask ? "needs you" : c.stuck ? "stuck" : `activity${c.since ? ` · ${ago(c.since)}` : ""}`;
    const el = v_flex().id(`db-${key}`).gap(6).p(9).mb(6).rounded(d.r.md).bg(d.raised).border_1().border_color(edge).cursor_pointer()
      .hover((s) => s.border_color(d.lineStrong))
      .on_click((_e, cx) => { if (c.task) view.openCard = open ? null : key; else if (c.tab) pointAt(space, c.tab); cx.notify(); })
      .child(div().text_size(12).line_height("16px").text_color(col === "done" ? d.fg2 : d.fg1).child(c.task ? `${c.task.id} · ${c.task.title}` : c.activity))
      .child(h_flex().items_center().gap(6)
        .when(Boolean(c.tab), (el) => el.child(chip(c.tab, c.activity && col === "now" ? d.info : c.ask ? d.warn : null, key)))
        .child(div().flex_1())
        .child(div().text_size(10).font_family(d.mono).text_color(c.ask || c.stuck ? d.warnText : d.fg3).child(kind)));
    if (open && c.task) {
      const x = c.task;
      el.child(v_flex().gap(6).pt(6).border_t_1().border_color(d.line)
        .when(Boolean(x.body), (e) => e.child(div().text_size(12).line_height("16px").text_color(d.body).child(x.body)))
        .when(Boolean(x.result), (e) => e.child(div().text_size(12).line_height("16px").text_color(d.fg2).child(`Result: ${x.result}`)))
        .child(h_flex().gap(6)
          .when(x.status !== "done", (e) => e.child(act(d, `db-done-${x.id}`, "Mark done", (cx) => taskCmd(view, cx, ["task", "done", x.id]))))
          .when(x.status === "done", (e) => e.child(act(d, `db-reopen-${x.id}`, "Reopen", (cx) => taskCmd(view, cx, ["task", "reopen", x.id]))))));
    }
    return el;
  };
  const column = (key, title, cards, color) => v_flex().flex_1().min_w(0)
    .child(h_flex().pb(6).mb(8).border_b_1().border_color(d.line).items_center()
      .child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(color ?? d.fg2).child(title.toUpperCase()))
      .child(div().flex_1())
      .child(div().text_size(10).font_family(d.mono).text_color(d.fg4).child(String(cards.length))))
    .child(v_flex().id(`db-col-${key}`).flex_1().min_h(0).overflow_y_scrollbar()
      .children(cards.length ? cards.slice(0, 12).map((c, i) => card(c, i, key)) : [div().text_size(11).text_color(d.fg4).child("—")]));
  return v_flex().size_full().px(16).pt(12).pb(8)
    .child(h_flex().items_center().gap(10).mb(10)
      .child(mono10(d, "Task board"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.fg2).child(mis?.focus ? `toward: ${mis.focus}` : "Set a focus in the Mission tab to say what this is heading for.")))
    .child(h_flex().flex_1().min_h(0).items_start().gap(10)
      .child(column("now", "Now", now))
      .child(column("next", "Next", next))
      .child(column("blocked", "Blocked", blocked, blocked.length ? d.warnText : null))
      .child(column("done", "Done · 7 days", fin)));
}

function act(d, id, text, fn) {
  return div().id(id).h(22).px(8).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid).cursor_pointer()
    .hover((s) => s.border_color(d.lineStrong)).on_click((_e, cx) => { cx.stop_propagation(); fn(cx); })
    .text_size(11).font_weight(500).text_color(d.body).child(text);
}

function taskCmd(view, cx, args) {
  cx.spawn(async (cx) => {
    try { await crewCli(args); } catch (e) { notify({ title: "Couldn't change the task", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
    try { view.ops = await loadOps(); } catch {}
    cx.notify();
  });
}

// ─── tbar: the terminal's bar ─────────────────────────────────────────────────────────────────
function tbar(view, { space, bot }, d) {
  const tab = space.tabs.find((x) => x.active);
  const has = tab ? tabHasAgent(tab) : false;
  const lead = tab ? leadPane(tab.id) : null;
  const st = has ? tab.status : null;
  const word = !has ? "no agent running" : { working: `working ${ago(tab.changed_at)}`, blocked: "asks you", done: "done", idle: "idle" }[st] ?? "idle";
  const bar = h_flex().size_full().items_center().gap(10).px(16)
    .child(div().text_size(10).font_family(d.mono).font_weight(500).text_color(d.fg3).child("TERMINAL"))
    .child(h_flex().id("dt-pick").h(22).px(8).gap(6).items_center().rounded(d.r.xs).border_1().border_color(d.lineMid).cursor_pointer()
      .hover((s) => s.border_color(d.lineStrong)).tooltip("Another channel")
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openChannels(space.id); })
      .child(div().text_size(11).font_family(d.mono).font_weight(500).text_color(d.fg1).child(tab ? `#${channelName(tab)}` : "—"))
      .child(svg(`${ICON}/ds-chevron-down.svg`).size(10).text_color(d.fg3)));
  if (has) bar.child(h_flex().items_center().gap(5).child(div().size(6).rounded(3).bg(d.ok)).child(div().text_size(11).text_color(d.okHi).child("live")))
    .child(div().truncate().text_size(11).text_color(d.fg2).child(`${lead?.program?.name ?? bot.harnessName ?? "agent"} · ${word}`));
  else bar.child(div().text_size(11).text_color(d.fg3).child(`#${tab ? channelName(tab) : ""} has no agent running`))
    .when(!bot.awake && Boolean(bot.record), (el) => el.child(act(d, "dt-wake", "Wake", () => wakePal(bot.record))));
  bar.child(div().flex_1());
  bar.child(h_flex().id("dt-open").h(22).px(8).gap(6).items_center().rounded(d.r.xs).border_1().border_color(d.lineMid).cursor_pointer()
    .hover((s) => s.border_color(d.lineStrong)).tooltip("Close the dashboard and show this channel")
    .on_click((_e, cx) => { closePanel(); cx.notify(); })
    .child(div().text_size(11).font_weight(500).text_color(d.body).child("Open channel ↗")));
  return bar;
}
