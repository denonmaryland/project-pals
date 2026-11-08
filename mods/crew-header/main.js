// Project Pals header: one quiet line over the channel. Focus: a "# channel ▾" picker on the left,
// the pal's name chip centred, its branch on the right. Pro (where the channel tabs sit above):
// the channel and its state on the left, the name chip at the right end. Everything else lives
// in the inspector (the rail's peek in Focus). In a room: the room's members.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, theme, focused, layout, run, exec, appHome, openOverlay } from "herdr";
import { shownRoom, roomMembers, botOf, channelName, renameChannel, mascotEl, mood, statusWord, statusColor, leadPane, chatPref, setChatPref, syncCenter, a, tone, layoutMode, ds } from "./crew.js";

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

  // Chat or Terminal, for channels whose conversation Project Pals can read.
  viewSwitch(tab, t) {
    const chat = chatPref(tab.id);
    const d = ds(t);
    const seg = (id, label, on, value) => div().id(id).h(22).px(8).flex().items_center().rounded(d.r.xs).cursor_pointer()
      .when(on, (el) => el.bg(d.sel))
      .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click(() => setChatPref(tab.id, value))
      .child(div().text_size(12).text_color(on ? d.fg1 : d.fg3).child(label));
    return h_flex().p(2).gap(2).rounded(d.r.sm).border_1().border_color(d.line)
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
    const t = tone(theme());
    const all = spaces();
    const space = all.find((s) => s.active) ?? all.find((s) => s.id === focused()?.space);
    const tab = space?.tabs.find((x) => x.active);
    const root = h_flex().id("crew-header").size_full().items_center().justify_between().px(24).gap(16).border_b_1().border_color(ds(t).line);
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
    if (!space || !tab) return root.child(div().text_size(13).text_color(t.dim).child("No pal open. Hire one on the left."));
    const bot = botOf(space);
    const status = bot.awake ? (tab.status ?? "idle") : bot.starting ? "starting" : "asleep";
    const d = ds(t);
    const live = bot.awake && ["working", "blocked", "done"].includes(tab.status);
    // The pal's name chip: face, name, and a dot while its channel is busy.
    const chip = h_flex().id("crew-chip").flex_none().h(30).pl(4).pr(10).gap(8).items_center().rounded(d.r.sm).border_1().border_color(d.line)
      .child(mascotEl(bot, mood(tab.status, bot.awake || bot.starting), 22, t))
      .child(div().text_size(13).font_medium().text_color(d.fg1).child(bot.name))
      .when(live, (el) => el.child(div().size(6).rounded_full().bg(statusColor(tab.status, t))));
    const lead = leadPane(tab.id, panes());

    if (layoutMode() === "focus") {
      const picker = h_flex().id("crew-pick").min_w(0).h(30).px(8).ml(-8).gap(6).items_center().rounded(d.r.sm).cursor_pointer()
        .hover((s) => s.bg(d.hover))
        .on_click(() => openOverlay({ mod: "crew-pick", kind: "popup", width: 260, props: { space: space.id } }))
        // Right-click renames it, as clicking the title did before.
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); renameChannel(tab); })
        .child(div().flex_none().text_size(14).text_color(d.fg3).child("#"))
        .child(div().min_w(0).truncate().text_size(14).font_medium().text_color(d.fg1).child(channelName(tab)))
        .child(svg(`${ICON}/chevron-down.svg`).size(12).flex_none().text_color(d.fg3));
      return root.px(20)
        .child(h_flex().flex_1().flex_basis(0).min_w(0).items_center().child(picker))
        .child(chip)
        .child(h_flex().flex_1().flex_basis(0).min_w(0).justify_end().items_center().gap(10)
          .when(Boolean(lead?.branch), (el) => el.child(div().min_w(0).h(22).px(6).flex().items_center().rounded(d.r.xs).bg(d.inset).border_1().border_color(d.lineSoft)
            .child(div().truncate().text_size(11.5).font_family(d.mono).text_color(d.fg3).child(lead.branch))))
          .when(this.linked, (el) => el.child(this.viewSwitch(tab, t))));
    }

    return root
      .child(h_flex().items_center().gap(8).min_w(0)
        .child(div().flex_none().text_size(15).text_color(d.fg3).child("#"))
        .child(div().id("crew-title").min_w(0).truncate().cursor_pointer().hover((s) => s.opacity(0.8))
          .on_click(() => renameChannel(tab))
          .text_size(15).font_medium().text_color(t.foreground).child(channelName(tab))))
      .child(h_flex().items_center().gap(12).flex_none()
        .child(h_flex().items_center().gap(6)
          .child(div().size(6).rounded_full().bg(statusColor(tab.status, t)))
          .child(div().text_size(12.5).text_color(t.dim).child(statusWord(status))))
        .when(this.linked, (el) => el.child(this.viewSwitch(tab, t)))
        .child(chip));
  }
}
