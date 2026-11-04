// Crew tabs: the shown bot's channels as tabs along the shell's top edge, above the sheet.
// Click switches, double-click renames, × (on hover) closes the channel, + adds one. Each tab carries its
// channel's living mascot, so a working channel looks around even while you're elsewhere.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, theme, openOverlay } from "herdr";
import { botOf, mood, mascotEl, channelName, renameChannel, a, rooms, shownRoom, showRoom, roomMembers } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewTabs extends View {
  init() { this.hover = null; }

  render() {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const root = h_flex().id("crew-tabs").size_full().items_center().gap(2).pl(2).pr(6);
    // The same soft pills as the rest of Crew: the shown one filled, the rest quiet text.
    const pill = (id, on) => h_flex().id(id).h(30).min_w(0).max_w(220).flex_shrink_1().items_center().gap(7).px(12).rounded_full().cursor_pointer()
      .when(on, (el) => el.bg(a(t.foreground, "0e")))
      .when(!on, (el) => el.hover((s) => s.bg(a(t.foreground, "07"))));
    const name = (text, on) => div().min_w(0).truncate().text_size(13).text_color(on ? t.foreground : t.dim).child(text);
    const mark = (status) => status === "blocked" ? div().size(6).flex_none().rounded_full().bg(t.blocked)
      : status === "done" ? div().size(6).flex_none().rounded_full().bg(t.done) : null;
    const plus = (id, action) => div().id(id).size(28).flex_none().ml(2).rounded_full().flex().items_center().justify_center().cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "0a")))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); action(); })
      .child(svg(`${ICON}/plus.svg`).size(13).text_color(t.dim));

    const shown = shownRoom();
    if (shown) {
      for (const room of rooms()) {
        const on = room.id === shown.id;
        const members = roomMembers(room);
        const faces = h_flex().flex_none().children(members.slice(0, 3).map((m, i) => div().when(i > 0, (el) => el.ml(-6))
          .child(mascotEl(m.bot, mood(m.status, Boolean(m.terminal)), 18, t))));
        root.child(pill(`rtab-${room.id}`, on)
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (!on) showRoom(room.id); })
          .child(faces)
          .child(name(`#${room.name}`, on)));
      }
      return root.child(plus("rtab-add", () => openOverlay({ mod: "crew-room-new", kind: "dialog", width: 520, modal: true })));
    }
    if (!space) return root;
    const bot = botOf(space);

    for (const tab of space.tabs) {
      const on = tab.active;
      const hovered = this.hover === tab.id;
      const m = mark(tab.status);
      root.child(pill(`tab-${tab.id}`, on).pr(hovered ? 6 : 12)
        .on_hover((h, cx) => { this.hover = h ? tab.id : (this.hover === tab.id ? null : this.hover); cx.notify(); })
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.click_count === 2) renameChannel(tab);
          else if (!on) run("tab.select", { id: tab.id });
        })
        .child(mascotEl(bot, mood(tab.status, bot.awake), 18, t))
        .child(name(channelName(tab), on))
        .when(Boolean(m) && !hovered, (el) => el.child(m))
        // Close only on hover, so the bar stays calm.
        .when(hovered, (el) => el.child(div().id(`tab-x-${tab.id}`).size(18).flex_none().flex().items_center().justify_center().rounded_full()
          .hover((s) => s.bg(a(t.foreground, "14")))
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); run("tab.close", { id: tab.id }); })
          .child(svg(`${ICON}/x.svg`).size(10).text_color(t.dim)))));
    }

    return root.child(plus("tab-add", () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } })));
  }
}
