// The profile dashboard: the Profile tab in Full. It's a small layout of its own (layouts/pals.json,
// profile-dash), each part a copy of crew-profile with props.part: "head" (the header: the pet chip,
// the name, the tabs, Side and ×), "stage" (stage.js: the hero, the week cards and the panels),
// "tbar" (the bar over dash-term, the shown channel's live agent terminal: an {agent: "focused"}
// block, the real session, typed into directly). The terminal is the column on the right.
//
// Pointing the terminal at a channel = showing that channel (tab.select, then agent.focus on its
// agent). In Full the work column is hidden, so the session shows in one place only.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, run, layout } from "herdr";
import {
  mascotEl, mood, channelName, ago, pebble, openPanel, closePanel, setPanelSize, tabHasAgent, leadPane,
  dashShown, focusShownAgent, openChannels, wakePal,
} from "./crew.js";

const ICON = "mods/crew-roster/icons";
const TABS = [["profile", "Profile"], ["vault", "Vault"], ["|"], ["agents", "AGENTS.md"]];

export function initDash(view, cx, part) {
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
      // No agent: the bar takes the column and says so (with Wake for a sleeping pal).
      if (hidden === has) { run(has ? "layout.show" : "layout.hide", { id: "dash-term" }); run("layout.resize", has ? { id: "dash-tbar", px: 33 } : { id: "dash-tbar", weight: 1 }); }
      cx.notify();
    });
  }
}

function findNode(id) {
  const walk = (n) => { if (n?.id === id) return n; for (const c of n?.children ?? []) { const f = walk(c); if (f) return f; } return null; };
  return walk(layout());
}


export function renderDash(view, part, t, d) {
  const s = view.shown();
  const root = v_flex().id(`dash-${part}`).size_full().bg(d.bg1);
  if (!s) return root;
  if (part === "head") return root.child(head(view, s, t, d));
  if (part === "tbar") return root.border_l_1().border_color(d.line).child(tbar(view, s, d));
  return root;
}

// ─── head: the panel header, with the tabs inline ─────────────────────────────────────────────
function head(view, { space, bot }, t, d) {
  const tab = space.tabs.find((x) => x.active);
  const m = mood(tab?.status ?? space.status, bot.awake || bot.starting);
  const btn = (id, icon, text, tip, act) => pebble(d, { id, icon, label: text, tooltip: tip, onClick: () => act() });
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
  return top;
}

// ─── tbar: the terminal's bar ─────────────────────────────────────────────────────────────────
function tbar(view, { space, bot }, d) {
  const tab = space.tabs.find((x) => x.active);
  const has = tab ? tabHasAgent(tab) : false;
  const lead = tab ? leadPane(tab.id) : null;
  const st = has ? tab.status : null;
  const word = !has ? "no agent running" : { working: `working ${ago(tab.changed_at)}`, blocked: "asks you", done: "done", idle: "idle" }[st] ?? "idle";
  const bar = h_flex().h(33).flex_none().w_full().items_center().gap(10).px(16).border_b_1().border_color(d.line)
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
  const col = v_flex().size_full().child(bar);
  // No agent: dash-term is hidden and this part fills the column (initDash), so say so here.
  if (!has) col.child(v_flex().flex_1().items_center().justify_center().gap(8).px(24)
    .child(div().text_size(12).line_height("16px").text_color(d.fg2).child(bot.awake ? `No agent is running in #${tab ? channelName(tab) : ""}.` : `${bot.name} is asleep.`))
    .child(div().text_size(11).line_height("15px").text_color(d.fg3).child("Its live terminal shows here while one runs."))
    .when(!bot.awake && Boolean(bot.record), (el) => el.child(act(d, "dt-wake2", "Wake it", () => wakePal(bot.record)))));
  return col;
}

function act(d, id, text, fn) {
  return div().id(id).h(22).px(8).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid).cursor_pointer()
    .hover((s) => s.border_color(d.lineStrong)).on_click((_e, cx) => { cx.stop_propagation(); fn(cx); })
    .text_size(11).font_weight(500).text_color(d.body).child(text);
}
