// Project Pals channel dropdown: opened from the pal chip (Focus header and Pro tab strip) and from
// Focus's "# channel ▾". The shown pal's channels, one 32 px row each: "# name", what it's on (its
// terminal title, else the last message in its chat), a state mark (blue dot working, amber dot
// needs you, green check done) and when it last changed; the current channel is marked. "+ New
// channel" at the foot. Drawn in the design system: an r4 #161617 popover with a 1 px hairline and
// no shadow (frame "none"). Keys: ↑/↓ move, Enter opens, Esc closes; the pointer moves the mark too.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, theme, props, closeOverlay, openOverlay, run, appHome, readTextFile } from "herdr";
import { channelName, statusWord, leadPane, stamp, ds, tone, showTabs, taskTitle, botOf } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const ROW = 32;

// The newest message in a chat feed, as one line ("you: …" for yours).
function lastLine(text) {
  const lines = (text ?? "").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 200; i--) {
    let e = null;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    if (!["bot", "you", "note"].includes(e?.kind) || !e.text) continue;
    const one = e.text.replace(/<\/?pasted_content[^>]*>/g, "").replace(/[`*_#>]/g, "").replace(/\s+/g, " ").trim();
    if (one) return e.kind === "you" ? `you: ${one}` : one;
  }
  return null;
}

export default class CrewPick extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.cursor = null;      // index into rows (the channels, then New channel)
    this.previews = {};      // tab id → last message, for channels whose title says nothing
    cx.spawn(async (cx) => {
      const space = this.space();
      for (const tab of space?.tabs ?? []) {
        const term = leadPane(tab.id, panes())?.terminal;
        if (!term) continue;
        const text = await readTextFile(`${appHome()}/data/crew-chats/${term}.jsonl`).catch(() => null);
        const line = lastLine(text);
        if (line) this.previews[tab.id] = line;
      }
      cx.notify();
    });
  }

  space() { return spaces().find((s) => s.id === props()?.space) ?? spaces().find((s) => s.active); }
  close() { closeOverlay(props()?.overlay); }
  newChannel(space) { this.close(); openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } }); }
  open(tab) { showTabs(); if (!tab.active) run("tab.select", { id: tab.id }); this.close(); }

  key(e, cx) {
    const space = this.space();
    if (!space) return;
    const n = space.tabs.length + 1;
    const at = this.cursor ?? space.tabs.findIndex((x) => x.active);
    if (e.key === "escape") { this.close(); cx.stop_propagation(); return; }
    if (e.key === "down" || e.key === "up") {
      this.cursor = ((at < 0 ? -1 : at) + (e.key === "down" ? 1 : -1) + n) % n;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (e.key === "enter") {
      cx.stop_propagation();
      if (at === space.tabs.length) this.newChannel(space);
      else if (at >= 0) this.open(space.tabs[at]);
    }
  }

  // What a channel is on: its terminal title (agents set it to the task), else its last message.
  what(tab) {
    const ag = agents().filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0];
    const space = this.space();
    return taskTitle(ag?.title, space?.name, botOf(space)?.name, channelName(tab)) ?? this.previews[tab.id] ?? (ag ? statusWord(ag.status ?? "idle") : "no agent running");
  }

  render() {
    const d = ds(tone(theme()));
    const space = this.space();
    const root = v_flex().id("crew-pick").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().p(4).gap(1).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line).text_color(d.fg1);
    if (!space) return root.child(div().p(8).text_size(12).text_color(d.fg3).child("No pal shown."));
    const at = this.cursor ?? space.tabs.findIndex((x) => x.active);
    const row = (id, i) => h_flex().id(id).h(ROW).flex_none().px(8).gap(8).items_center().rounded(3).cursor_pointer()
      .when(at === i, (el) => el.bg(d.sel))
      .on_hover((h, cx) => { if (h && this.cursor !== i) { this.cursor = i; cx.notify(); } });

    root.child(h_flex().h(26).flex_none().items_center().px(8)
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_weight(500).text_color(d.fg3).child(space.name))
      .child(div().flex_none().text_size(11).text_color(d.fg4).child(`${space.tabs.length} channel${space.tabs.length === 1 ? "" : "s"}`)));
    space.tabs.forEach((tab, i) => {
      const on = tab.active;
      const mark = tab.status === "working" ? div().size(6).flex_none().rounded(3).bg(d.info)
        : tab.status === "blocked" ? div().size(6).flex_none().rounded(3).bg(d.warn)
        : tab.status === "done" ? svg(`${ICON}/ds-check-thin.svg`).size(11).flex_none().text_color(d.ok)
        : null;
      root.child(row(`pick-${tab.id}`, i)
        .on_click(() => this.open(tab))
        .child(div().w(10).flex_none().text_size(12).font_family(d.mono).text_color(on ? d.fg2 : d.fg4).child("#"))
        .child(div().flex_none().max_w(130).truncate().text_size(13).when(on, (el) => el.font_weight(500)).text_color(on ? d.fg1 : d.body).child(channelName(tab)))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(on ? d.fg2 : d.fg3).child(this.what(tab)))
        .when(Boolean(mark), (el) => el.child(mark))
        .child(div().w(38).flex_none().text_size(11).text_color(d.fg4).text_right().child(stamp(tab.changed_at)))
        // The channel you're in: a check at the end of its row (and the lit fill until you move).
        .child(div().w(12).flex_none().flex().justify_end()
          .when(on, (el) => el.child(svg(`${ICON}/ds-check.svg`).size(10).text_color(d.fg2)))));
    });
    root.child(div().h(1).mx(4).my(3).flex_none().bg(d.line));
    root.child(row("pick-new", space.tabs.length)
      .on_click(() => this.newChannel(space))
      .child(div().w(10).flex_none().flex().justify_center().child(svg(`${ICON}/ds-plus.svg`).size(12).text_color(d.fg2)))
      .child(div().text_size(13).text_color(d.body).child("New channel")));
    return root;
  }
}
