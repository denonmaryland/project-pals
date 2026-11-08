// Project Pals header, drawn to the "MODE · Focus" board: the pal's chip centred (a click opens its
// channels) and the split buttons on the right. The git branch isn't here: it's in the agent's own
// status line (crew-statusline; DeNon, 2026-11-08). No channel picker on the left: DeNon
// took it out on 2026-11-08 (channels switch from the hero's list; "no agent" shows there). In a
// room: the room's members. Under it is the channel's terminal (terminal-first, DeNon 2026-11-08).

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, focused } from "herdr";
import { shownRoom, roomMembers, botOf, mascotEl, mood, tone, ds, palChip, splitButtons } from "./crew.js";

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
    return root
      // An empty left side as wide as the right one, so the chip stays centred.
      .child(h_flex().flex_1().flex_basis(0).min_w(0))
      .child(palChip(bot, tab, d))
      .child(h_flex().flex_1().flex_basis(0).min_w(0).justify_end().items_center().gap(8)
        .child(splitButtons(d)));
  }
}
