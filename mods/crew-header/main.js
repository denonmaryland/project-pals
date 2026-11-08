// Project Pals header, drawn to the "MODE · Focus" board: the command bar's field centred (T18:
// the pal chip was redundant with the hero, so the centre is a search field now, with the shown
// pal's small pet in it; a click or Ctrl+Shift+Space opens crew-command over it) and the split
// buttons on the right. The git branch isn't here: it's in the agent's own status line
// (crew-statusline; DeNon, 2026-11-08). No channel picker on the left: DeNon took it out on
// 2026-11-08 (channels switch from the hero's list; "no agent" shows there). In a room: the room's
// members. Under it is the channel's terminal (terminal-first, DeNon 2026-11-08).
// keys.json / herdr-app do: crew-header.search opens the command bar from anywhere.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, focused, layout, nextCommand } from "herdr";
import { shownRoom, roomMembers, botOf, mascotEl, mood, tone, ds, commandField, openCommandBar, splitButtons, FIELD_MAX } from "./crew.js";

const SIDE = 70;         // the split buttons' side, kept clear on both sides so the field stays centred
const FIELD_Y = 11;      // (52 - 30) / 2

const findNode = (n, id) => { if (n?.id === id) return n; for (const c of n?.children ?? []) { const f = findNode(c, id); if (f) return f; } return null; };

export default class CrewHeader extends View {
  init(_props, cx) {
    this.w = 0;           // the header's width (on_size_change)
    this.origin = null;   // its window position, once the pointer has crossed it
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "search") this.open(null);
        cx.notify();
      }
    });
  }

  fieldW() { return Math.max(200, Math.min(FIELD_MAX, this.w - 2 * (SIDE + 16))); }

  // Where the field is in the window: from a press on it, else from the header's last known
  // position (the pointer crossing it), else from the layout (the header starts after the sidebar).
  fieldAt(e) {
    const w = this.fieldW();
    if (e?.local_position) return { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y, w };
    const side = findNode(layout(), "sidebar");
    const x0 = this.origin?.x ?? (side && !side.hidden ? side.size?.px ?? 0 : 0);
    const y0 = this.origin?.y ?? 0;
    return { x: x0 + (this.w - w) / 2, y: y0 + FIELD_Y, w };
  }

  open(e) {
    const all = spaces();
    const space = all.find((s) => s.active) ?? all.find((s) => s.id === focused()?.space);
    openCommandBar(space?.id ?? null, this.w ? this.fieldAt(e) : null);
  }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const all = spaces();
    const space = all.find((s) => s.active) ?? all.find((s) => s.id === focused()?.space);
    const tab = space?.tabs.find((x) => x.active);
    // "MODE · Focus": a 52 px bar on the chat background, a #18181A hairline under it, 16 px in.
    const root = h_flex().id("crew-header").size_full().items_center().px(16).bg(d.bg0).border_b_1().border_color(d.lineSoft)
      .on_size_change((size, cx) => { if (size.width !== this.w) { this.w = size.width; cx.notify(); } })
      .on_mouse_move((e) => { if (e.local_position) this.origin = { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y }; });

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
    const bot = space && tab ? botOf(space) : null;
    return root
      // An empty left side as wide as the right one, so the field stays centred.
      .child(h_flex().flex_1().flex_basis(0).min_w(0))
      .child(commandField(bot, tab, d, { w: this.fieldW(), onOpen: (e) => this.open(e) }))
      .child(h_flex().flex_1().flex_basis(0).min_w(0).justify_end().items_center().gap(8)
        .child(space && tab ? splitButtons(d) : div()));
  }
}
