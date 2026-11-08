// Project Pals header (Focus; Pro hides it and uses the tab strip), drawn to the "MODE · Focus"
// board: a "# channel ▾" picker on the left, the pal's chip centred, its branch on the right. In a
// room: the room's members. Under it is the channel's terminal (terminal-first, DeNon 2026-11-08).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, theme, focused } from "herdr";
import { shownRoom, roomMembers, botOf, channelName, renameChannel, mascotEl, mood, leadPane, tone, ds, palChip, openChannels } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewHeader extends View {
  render() {
    const t = tone(theme());
    const d = ds(t);
    const all = spaces();
    const space = all.find((s) => s.active) ?? all.find((s) => s.id === focused()?.space);
    const tab = space?.tabs.find((x) => x.active);
    // "MODE · Focus": a 52 px bar on the chat background, a #18181A hairline under it, 16 px in.
    const root = h_flex().id("crew-header").size_full().items_center().px(16).bg(d.bg0).border_b_1().border_color(d.lineSoft);

    const room = shownRoom();
    if (room) {
      // A room: its members' pets overlapping and the room's name, centred, in the chip's style.
      const members = roomMembers(room);
      const faces = h_flex().children(members.slice(0, 5).map((m, i) => div().when(i > 0, (el) => el.ml(-7))
        .child(mascotEl(m.bot, mood(m.status, Boolean(m.terminal)), 28, t))));
      return root.justify_center()
        .child(h_flex().id("room-pill").h(30).items_center().gap(8).pl(4).pr(10).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.lineMid)
          .child(faces)
          .child(div().text_size(13).font_weight(600).text_color(d.fg1).child(`#${room.name}`)));
    }
    if (!space || !tab) return root.child(div().text_size(13).text_color(d.fg3).child("No pal open. Hire one on the left."));
    const bot = botOf(space);
    const lead = leadPane(tab.id, panes());
    // Left: "# channel ▾" opens the channel picker; right-click renames.
    const picker = h_flex().id("crew-pick").min_w(0).h(30).px(6).ml(-6).gap(6).items_center().rounded(d.r.sm).cursor_pointer()
      .hover((s) => s.bg(d.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openChannels(space.id); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); renameChannel(tab); })
      .child(div().flex_none().text_size(12).font_family(d.mono).text_color(d.fg3).child("#"))
      .child(div().min_w(0).truncate().text_size(13).font_weight(500).text_color(d.body).child(channelName(tab)))
      .child(svg(`${ICON}/ds-chevron-down.svg`).size(12).flex_none().text_color(d.icon));
    return root
      .child(h_flex().flex_1().flex_basis(0).min_w(0).items_center().child(picker))
      .child(palChip(bot, tab, d, "focus"))
      .child(h_flex().flex_1().flex_basis(0).min_w(0).justify_end().items_center().gap(8)
        .when(Boolean(lead?.branch), (el) => el.child(div().min_w(0).h(22).px(6).flex().items_center().rounded(d.r.xs).bg(d.raised)
          .child(div().truncate().text_size(11).font_family(d.mono).text_color(d.fg2).child(lead.branch)))));
  }
}
