// New room: a name, an optional goal, and which bots join (each with one of its channels).
// Making it writes the room, shows it, and briefs every member on how to talk in it. A bot
// that's asleep is woken in a new channel for the room.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces, panes } from "herdr";
import { enqueue, crew, botOf, rooms, roomSlug, newId, saveRoom, showRoom, roomMembers, writeRoomFile, briefing,
  mascotEl, mood, channelName, leadPane, crewCli, a } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewRoomNew extends View {
  init(_props, cx) {
    this.name = InputState.new({ placeholder: "room-name" });
    this.goal = TextareaState.new({ placeholder: "What's it for? (optional)", rows: 2 });
    this.goal.set_auto_grow(2, 5);
    for (const s of [this.name, this.goal]) s.on("change", (_e, cx) => cx.notify());
    this.name.on("submit", () => this.create());
    // Picked bots: space id → the tab (channel) that joins.
    this.picked = new Map();
    for (const key of props()?.with ?? []) { const [s, tb] = key.split("|"); this.picked.set(s, tb); }
    this.choosing = null; // a picked bot whose channel list is open
    this.handle = cx.focus_handle();
    this.name.focus();
  }

  // A bot's best channel for a room: the one it's showing if an agent runs there, else any with an agent.
  defaultTab(space, ps) {
    const live = (tab) => Boolean(leadPane(tab.id, ps)?.program?.agent);
    return space.tabs.find((x) => x.active && live(x)) ?? space.tabs.find(live) ?? space.tabs.find((x) => x.active) ?? space.tabs[0];
  }

  create() {
    const name = this.name.value().trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (!name) return notify({ title: "Name the room", level: "warning", timeout: 2500 });
    if (this.picked.size < 2) return notify({ title: "Pick at least two bots", body: "A room is where bots work together.", level: "warning", timeout: 3000 });
    let slug = roomSlug(name), n = 2;
    const taken = new Set(rooms().map((r) => r.slug));
    while (taken.has(slug)) slug = `${roomSlug(name)}-${n++}`;
    const all = spaces();
    const members = [...this.picked].map(([space, tab]) => {
      const s = all.find((x) => x.id === space);
      return { space, tab, bot: s?.name, channel: channelName(s?.tabs.find((x) => x.id === tab) ?? { name: "" }) };
    });
    const room = { id: newId(), slug, name, goal: this.goal.value().trim(), members, created: Date.now() };
    saveRoom(room);
    closeOverlay(props().overlay);
    showRoom(room.id);
    const live = roomMembers(room);
    const sleeping = live.filter((m) => !m.agent && m.space);
    writeRoomFile(room).then(async () => {
      for (const m of live) if (m.terminal && m.agent) enqueue(m.terminal, briefing(room, live, m), { sender: "crew", kind: "room" }).catch(() => {});
      // Asleep: wake each in a new channel for this room (the invite replaces its asleep membership).
      for (const m of sleeping) await crewCli(["invite", slug, m.space.name]).catch(() => {});
    }).catch(() => {});
    notify({ title: `#${name} is open`, body: sleeping.length ? `Waking ${sleeping.map((m) => m.name.split(" - ")[0]).join(", ")} for it.` : `${live.length} bots briefed.`, level: "success", timeout: 3500 });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = theme();
    const c = crew(), ps = panes(), all = spaces();
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const picked = all.filter((s) => this.picked.has(s.id));

    // Header: the faces of who's coming, overlapping, or an empty circle until someone is.
    const faces = picked.length
      ? h_flex().children(picked.slice(0, 4).map((s, i) => div().when(i > 0, (el) => el.ml(-12)).child(mascotEl(botOf(s, c, ps), "calm", 34, t))))
      : div().size(34).rounded_full().border_1().border_color(a(t.foreground, "22"));
    const header = h_flex().items_center().gap(12).px(24).pt(22).pb(6)
      .child(div().flex_none().child(faces))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(17).font_medium().text_color(t.foreground).child("New room"))
        .child(div().text_size(12.5).text_color(t.dim).child("A group chat where bots work together")))
      .child(div().id("rn-x").size(28).rounded(8).flex().items_center().justify_center().cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "10"))).on_click(() => closeOverlay(props().overlay))
        .child(svg(`${ICON}/x.svg`).size(13).text_color(t.dim)));

    // Its name and goal.
    const named = v_flex().rounded(14).bg(a(t.canvas, "aa")).border_1().border_color(a(t.foreground, "10"))
      .child(stop(h_flex().items_center().gap(6).px(16).pt(14).pb(6)
        .child(div().text_size(20).text_color(t.dim).child("#"))
        .child(div().flex_1().child(Input.new(this.name).w_full().text_size(20).text_color(t.foreground)))))
      .child(stop(div().px(6).pb(6).child(Textarea.new(this.goal).w_full().px(10).py(6).text_size(13.5).text_color(t.foreground))));

    // Who's in it: one row per bot; a picked bot shows which channel joins (click to change).
    const list = v_flex().id("rn-bots").max_h(320).overflow_y_scrollbar().rounded(14).border_1().border_color(a(t.foreground, "10")).py(4);
    all.forEach((space, i) => {
      const bot = botOf(space, c, ps);
      const on = this.picked.has(space.id);
      const tab = on ? space.tabs.find((x) => x.id === this.picked.get(space.id)) : null;
      const awake = Boolean(tab && leadPane(tab.id, ps)?.program?.agent);
      const check = div().size(20).flex_none().rounded_full().flex().items_center().justify_center()
        .bg(on ? t.accent : a(t.foreground, "00")).border_1().border_color(on ? t.accent : a(t.foreground, "2a"))
        .when(on, (el) => el.child(svg(`${ICON}/check.svg`).size(11).text_color(t.accent_foreground)));
      if (i > 0) list.child(div().h(1).mx(16).bg(a(t.foreground, "0a")));
      list.child(h_flex().id(`rn-bot-${space.id}`).items_center().gap(11).px(14).py(8).cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "05")))
        .on_click((_e, cx) => {
          if (on) { this.picked.delete(space.id); if (this.choosing === space.id) this.choosing = null; }
          else this.picked.set(space.id, this.defaultTab(space, ps).id);
          cx.notify();
        })
        .child(mascotEl(bot, mood(space.status, bot.awake), 30, t))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_size(13.5).text_color(bot.awake ? t.foreground : t.muted).child(bot.name))
          .when(on && Boolean(tab), (el) => el.child(h_flex().id(`rn-ch-${space.id}`).items_center().gap(4).cursor_pointer()
            .on_click((_e, cx) => { cx.stop_propagation(); this.choosing = this.choosing === space.id ? null : space.id; cx.notify(); })
            .child(div().text_size(12).text_color(t.dim).child(`#${channelName(tab)}${awake ? "" : " · asleep, will wake"}`))
            .when(space.tabs.length > 1, (el) => el.child(svg(`${ICON}/${this.choosing === space.id ? "chevron-down" : "chevron-right"}.svg`).size(10).text_color(t.dim))))))
        .child(check));
      // Which of its channels joins.
      if (on && this.choosing === space.id) {
        list.child(v_flex().pl(55).pr(12).pb(8).children(space.tabs.map((x) => {
          const sel = x.id === tab?.id;
          return h_flex().id(`rn-pick-${x.id}`).items_center().gap(8).px(10).py(5).rounded(8).cursor_pointer()
            .when(sel, (el) => el.bg(a(t.foreground, "0c"))).hover((s) => s.bg(a(t.foreground, "08")))
            .on_click((_e, cx) => { this.picked.set(space.id, x.id); this.choosing = null; cx.notify(); })
            .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(sel ? t.foreground : t.muted).child(`#${channelName(x)}`))
            .when(sel, (el) => el.child(svg(`${ICON}/check.svg`).size(12).text_color(t.accent)));
        })));
      }
    });

    const name = this.name.value().trim();
    const ready = Boolean(name) && this.picked.size >= 2;
    const footer = h_flex().items_center().justify_between().gap(12).px(24).pt(14).pb(20)
      .child(div().text_size(12).text_color(t.dim)
        .child(this.picked.size < 2 ? "Pick at least two bots" : `${this.picked.size} bots`))
      .child(h_flex().gap(14).items_center().flex_none()
        .child(div().id("rn-cancel").cursor_pointer().text_size(13.5).text_color(t.muted).on_click(() => closeOverlay(props().overlay)).child("Cancel"))
        .child(div().id("rn-go").px(18).py(9).rounded_full().cursor_pointer().bg(ready ? t.solid : a(t.foreground, "1a"))
          .hover((s) => s.opacity(0.88)).on_click(() => this.create())
          .child(div().text_size(13.5).font_medium().text_color(ready ? t.solid_foreground : t.dim).child("Open room"))));

    return v_flex().id("crew-room-new").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().bg(t.popover).text_color(t.foreground)
      .child(header)
      .child(v_flex().gap(12).px(24).pt(12)
        .child(named)
        .child(div().pl(4).pt(2).text_size(12.5).text_color(t.dim).child("Who's in it"))
        .child(list))
      .child(footer);
  }
}
