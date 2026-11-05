// Project Pals tabs: the shown pal's channels as tabs along the shell's top edge, above the sheet.
// Click switches, double-click renames, × (on hover) closes the channel, + adds one. The sidebar lists
// only pals, so this bar is where channels live: each tab has a status dot (working, needs you,
// done, idle), so you can see what every channel is up to without leaving the one you're in.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, theme, openOverlay } from "herdr";
import { mood, mascotEl, channelName, renameChannel, a, rooms, shownRoom, showRoom, roomMembers, tabPinned, tabColor, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewTabs extends View {
  init() { this.hover = null; }

  render() {
    const t = tone(theme());
    const space = spaces().find((s) => s.active);
    const root = h_flex().id("crew-tabs").size_full().items_center().gap(2).pl(2).pr(6);
    // The same soft pills as the rest of Project Pals: the shown one filled, the rest quiet text.
    const pill = (id, on) => h_flex().id(id).h(30).min_w(0).max_w(220).flex_shrink_1().items_center().gap(7).px(12).rounded_full().cursor_pointer()
      .when(on, (el) => el.bg(a(t.foreground, "0e")))
      .when(!on, (el) => el.hover((s) => s.bg(a(t.foreground, "07"))));
    const name = (text, on) => div().min_w(0).truncate().text_size(13).text_color(on ? t.foreground : t.dim).child(text);  // room tabs
    // What the channel's agent is doing, in a fixed 12px slot so the name never shifts: a spinning
    // ring while it works, a slow red pulse when it needs you, a green dot when it's done, grey
    // when idle. All native animation (spin/loop), so nothing redraws on a timer.
    const dot = (status, color) => div().size(12).flex_none().flex().items_center().justify_center()
      .child(status === "working"
        ? svg(`${ICON}/spinner.svg`).size(12).text_color(t.working).spin(900)
        : div().size(7).rounded_full()
          // Idle: the channel's own color (grey when it has none), so colors read even in a muted theme.
          .bg(status === "blocked" ? t.blocked : status === "done" ? t.done : color ?? a(t.foreground, "30"))
          .when(status === "blocked", (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1100 })));
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
    // Pinned channels first (pinning also moves them to the front in Herdr), then a hairline.
    const pinned = space.tabs.filter((x) => tabPinned(x));
    const rest = space.tabs.filter((x) => !tabPinned(x));
    const menu = (tab) => openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "tab", space: space.id, tab: tab.id } });
    const tabEl = (tab) => {
      const on = tab.active;
      const hovered = this.hover === tab.id;
      const pin = tabPinned(tab);
      // A colored channel: the whole pill takes its color, softly, and its name the color itself.
      const color = tabColor(tab, t);
      return pill(`tab-${tab.id}`, on).pr(hovered && !pin ? 6 : 12)
        .when(Boolean(color), (el) => el.bg(a(color, on ? "4a" : "24")).hover((s) => s.bg(a(color, on ? "56" : "34"))))
        .on_hover((h, cx) => { this.hover = h ? tab.id : (this.hover === tab.id ? null : this.hover); cx.notify(); })
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.click_count === 2) renameChannel(tab);
          else if (!on) run("tab.select", { id: tab.id });
        })
        // Right-click: pin, color, rename, close.
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); menu(tab); })
        .child(dot(tab.status, color))
        .child(div().min_w(0).truncate().text_size(13).text_color(on ? t.foreground : color ?? t.dim).child(channelName(tab)))
        // A pinned channel shows its pin and has no ✕ (unpin it first, from its menu).
        .when(pin, (el) => el.child(svg(`${ICON}/pin.svg`).size(11).flex_none().text_color(color ?? t.dim)))
        // Close only on hover, so the bar stays calm.
        .when(hovered && !pin, (el) => el.child(div().id(`tab-x-${tab.id}`).size(18).flex_none().flex().items_center().justify_center().rounded_full()
          .hover((s) => s.bg(a(t.foreground, "14")))
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); run("tab.close", { id: tab.id }); })
          .child(svg(`${ICON}/x.svg`).size(10).text_color(t.dim))));
    };
    root.children(pinned.map(tabEl));
    if (pinned.length && rest.length) root.child(div().w(1).h(16).mx(4).flex_none().bg(a(t.foreground, "18")));
    root.children(rest.map(tabEl));

    return root.child(plus("tab-add", () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } })));
  }
}
