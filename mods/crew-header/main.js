// Crew header: one quiet line over the terminal. Which bot and channel this is, how it's doing,
// and the button that shows or hides the details panel on the right. Everything else (the
// harness, the computer, other channels, memory) lives in that panel, out of the way.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, theme, focused, layout, run, exec, appHome } from "herdr";
import { shownRoom, roomMembers, botOf, channelName, renameChannel, mascotEl, mood, statusWord, statusColor, leadPane, chatPref, setChatPref, syncCenter, a } from "./crew.js";

const ICON = "mods/crew-roster/icons";

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}

export default class CrewHeader extends View {
  init(_props, cx) {
    this.linked = false;
    this.terminal = null;
    // Does the shown channel have a chat feed? And keep the center on chat or terminal to match.
    cx.timer.every(400, (cx) => {
      const space = spaces().find((s) => s.active);
      const tab = space?.tabs.find((x) => x.active);
      const term = tab ? leadPane(tab.id, panes())?.terminal ?? null : null;
      if (term !== this.terminal || !this.checked || Date.now() - this.checked > 3000) {
        this.checked = Date.now();
        cx.spawn(async (cx) => {
          const r = term ? await exec("test", ["-s", `${appHome()}/data/crew-chats/${term}.jsonl`]).catch(() => ({ code: 1 })) : { code: 1 };
          const linked = r.code === 0;
          if (linked !== this.linked || term !== this.terminal) { this.linked = linked; this.terminal = term; cx.notify(); }
        });
      }
      syncCenter(this.linked && term === this.terminal);
    });
  }

  // Chat or Terminal, for channels whose conversation Crew can read.
  viewSwitch(tab, t) {
    const chat = chatPref(tab.id);
    const seg = (id, label, on, value) => div().id(id).px(10).py(3).rounded_full().cursor_pointer()
      .when(on, (el) => el.bg(a(t.foreground, "14")))
      .on_click(() => setChatPref(tab.id, value))
      .child(div().text_size(12).text_color(on ? t.foreground : t.dim).child(label));
    return h_flex().p(2).rounded_full().bg(a(t.foreground, "07"))
      .child(seg("view-chat", "Chat", chat, true))
      .child(seg("view-term", "Terminal", !chat, false));
  }

  panelButton(t) {
    const open = !findNode(layout(), "panel")?.hidden;
    return div().id("crew-details").size(30).flex_none().rounded(8).flex().items_center().justify_center().cursor_pointer()
      .when(open, (el) => el.bg(a(t.foreground, "0f")))
      .hover((s) => s.bg(a(t.foreground, "14")))
      .on_click(() => run("layout.toggle", { id: "panel" }))
      .child(svg(`${ICON}/panel-right.svg`).size(15).text_color(open ? t.foreground : t.dim));
  }

  render() {
    const t = theme();
    const all = spaces();
    const space = all.find((s) => s.active) ?? all.find((s) => s.id === focused()?.space);
    const tab = space?.tabs.find((x) => x.active);
    const root = h_flex().id("crew-header").size_full().items_center().justify_between().px(30).gap(16);
    const sep = () => div().text_size(13).text_color(a(t.dim, "77")).child("/");

    const room = shownRoom();
    if (room) {
      // A room: one centered pill, its members' faces overlapping, and the room's name.
      const members = roomMembers(room);
      const faces = h_flex().children(members.slice(0, 5).map((m, i) => div().when(i > 0, (el) => el.ml(-7))
        .child(mascotEl(m.bot, mood(m.status, Boolean(m.terminal)), 22, t))));
      return root.relative()
        .child(div().w(30))
        .child(h_flex().id("room-pill").items_center().gap(9).pl(6).pr(14).py(5).rounded_full().bg(a(t.foreground, "0c"))
          .child(faces)
          .child(div().text_size(14).font_medium().text_color(t.foreground).child(`#${room.name}`)))
        .child(this.panelButton(t));
    }
    if (!space || !tab) return root.child(div().text_size(13).text_color(t.dim).child("No bot open. Hire one on the left."));
    const bot = botOf(space);
    const status = bot.awake ? (tab.status ?? "idle") : "asleep";

    return root
      .child(h_flex().items_center().gap(8).min_w(0)
        .child(mascotEl(bot, mood(tab.status, bot.awake), 20, t))
        .child(div().flex_none().text_size(13.5).text_color(t.dim).child(bot.name))
        .child(sep())
        .child(div().id("crew-title").min_w(0).truncate().cursor_pointer().hover((s) => s.opacity(0.8))
          .on_click(() => renameChannel(tab))
          .text_size(15).font_medium().text_color(t.foreground).child(`#${channelName(tab)}`)))
      .child(h_flex().items_center().gap(12).flex_none()
        .child(h_flex().items_center().gap(6)
          .child(div().size(6).rounded_full().bg(statusColor(tab.status, t)))
          .child(div().text_size(12.5).text_color(t.dim).child(statusWord(status))))
        .when(this.linked, (el) => el.child(this.viewSwitch(tab, t)))
        .child(this.panelButton(t)));
  }
}
