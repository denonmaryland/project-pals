// Project Pals tab strip (Pro; Focus has the header's channel picker instead): the shown pal's
// channels as tabs along the top of the chat column, drawn to the "MODE · Pro" board: a 40 px strip
// (8 px in, 4 px apart, #18181A hairline under it), 156x28 r4 tabs (the shown one #232324 with a
// #808082 "#" and #EDEDED 12/500 name; the rest #161617 with dim text), a 6 px dot while a channel
// works (blue), needs you (amber) or finished (green), and the pal's chip at the right end.
// Click switches, double-click renames, right-click opens the channel menu, × (on hover) closes.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run, theme, openOverlay } from "herdr";
import { mood, mascotEl, channelName, renameChannel, rooms, shownRoom, showRoom, roomMembers, tabPinned, botOf, ds, tone, palChip } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewTabs extends View {
  init() { this.hover = null; }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const space = spaces().find((s) => s.active);
    const strip = h_flex().id("crew-tabs-row").flex_1().min_w(0).items_center().gap(4).overflow_hidden();
    const root = h_flex().id("crew-tabs").size_full().items_center().gap(8).px(8).bg(d.bg0).border_b_1().border_color(d.lineSoft);
    const tabBox = (id, on) => h_flex().id(id).w(156).h(28).flex_shrink_1().min_w(72).items_center().gap(6).px(10).rounded(d.r.sm).cursor_pointer()
      .bg(on ? d.sel : d.raised)
      .when(!on, (el) => el.hover((s) => s.bg(d.hover)));
    const hash = (on) => div().flex_none().text_size(12).font_family(d.mono).text_color(on ? d.fg2 : d.fg4).child("#");
    const label = (text, on) => div().flex_1().min_w(0).truncate().text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child(text);
    const state = (status) => status === "working" ? d.info : status === "blocked" ? d.warn : status === "done" ? d.ok : null;

    const shown = shownRoom();
    if (shown) {
      for (const room of rooms()) {
        const on = room.id === shown.id;
        const members = roomMembers(room);
        strip.child(tabBox(`rtab-${room.id}`, on)
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); if (!on) showRoom(room.id); })
          .child(hash(on))
          .child(label(room.name, on))
          .child(h_flex().flex_none().children(members.slice(0, 3).map((m, i) => div().when(i > 0, (el) => el.ml(-6))
            .child(mascotEl(m.bot, mood(m.status, Boolean(m.terminal)), 18, t))))));
      }
      return root.child(strip);
    }
    if (!space) return root;
    const bot = botOf(space);
    // Pinned channels first (pinning also moves them to the front in Herdr).
    const tabs = [...space.tabs.filter((x) => tabPinned(x)), ...space.tabs.filter((x) => !tabPinned(x))];
    const menu = (tab) => openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "tab", space: space.id, tab: tab.id } });
    strip.children(tabs.map((tab) => {
      const on = tab.active;
      const hovered = this.hover === tab.id;
      const pin = tabPinned(tab);
      const dot = state(tab.status);
      return tabBox(`tab-${tab.id}`, on)
        .on_hover((h, cx) => { this.hover = h ? tab.id : (this.hover === tab.id ? null : this.hover); cx.notify(); })
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.click_count === 2) renameChannel(tab);
          else if (!on) run("tab.select", { id: tab.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); menu(tab); })
        .child(hash(on))
        .child(label(channelName(tab), on))
        .when(pin && !hovered, (el) => el.child(svg(`${ICON}/pin.svg`).size(10).flex_none().text_color(d.fg4)))
        .when(Boolean(dot) && !hovered, (el) => el.child(div().size(6).flex_none().rounded(3).bg(dot)))
        // Close only on hover (a pinned channel is unpinned from its menu first).
        .when(hovered && !pin, (el) => el.child(div().id(`tab-x-${tab.id}`).size(16).flex_none().flex().items_center().justify_center().rounded(2)
          .hover((s) => s.bg(d.ctl))
          .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); run("tab.close", { id: tab.id }); })
          .child(svg(`${ICON}/x.svg`).size(10).text_color(d.fg2))));
    }));
    const tab = space.tabs.find((x) => x.active);
    return root.child(strip)
      .child(palChip(bot, tab, d, "pro"));
  }
}
