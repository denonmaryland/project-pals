// New room: a name, an optional goal, and which pals join (each with one of its channels).
// Making it writes the room, shows it, and briefs every member on how to talk in it. A pal
// that's asleep is woken in a new channel for the room.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces, panes } from "herdr";
import { enqueue, crew, botOf, rooms, roomSlug, newId, saveRoom, showRoom, roomMembers, writeRoomFile, briefing,
  mascotEl, mood, channelName, leadPane, crewCli, a, tone, ds,
  sheet, sheetHeader, sheetBody, sheetField, sheetArea, sheetPanel, sheetPanelBox, sheetOption, sheetFooter } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewRoomNew extends View {
  init(_props, cx) {
    this.name = InputState.new({ placeholder: "room-name" });
    this.goal = TextareaState.new({ placeholder: "What's it for? (optional)", rows: 2 });
    this.goal.set_auto_grow(2, 5);
    for (const s of [this.name, this.goal]) s.on("change", (_e, cx) => cx.notify());
    this.name.on("submit", () => this.create());
    // Picked pals: space id → the tab (channel) that joins.
    this.picked = new Map();
    for (const key of props()?.with ?? []) { const [s, tb] = key.split("|"); this.picked.set(s, tb); }
    this.choosing = null; // a picked pal whose channel list is open
    this.handle = cx.focus_handle();
    this.name.focus();
  }

  // A pal's best channel for a room: the one it's showing if an agent runs there, else any with an agent.
  defaultTab(space, ps) {
    const live = (tab) => Boolean(leadPane(tab.id, ps)?.program?.agent);
    return space.tabs.find((x) => x.active && live(x)) ?? space.tabs.find(live) ?? space.tabs.find((x) => x.active) ?? space.tabs[0];
  }

  create() {
    const name = this.name.value().trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (!name) return notify({ title: "Name the room", level: "warning", timeout: 2500 });
    if (this.picked.size < 2) return notify({ title: "Pick at least two pals", body: "A room is where pals work together.", level: "warning", timeout: 3000 });
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
    notify({ title: `#${name} is open`, body: sleeping.length ? `Waking ${sleeping.map((m) => m.name.split(" - ")[0]).join(", ")} for it.` : `${live.length} pals briefed.`, level: "success", timeout: 3500 });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  // "A · Compact sheet": who's coming in the header, "# name" and the goal as fields, then the pals
  // as a list (tick to add; a picked pal's channel opens under it), and the footer.
  render() {
    const t = tone(theme());
    const d = ds(t);
    const c = crew(), ps = panes(), all = spaces();
    const close = () => closeOverlay(props().overlay);
    const picked = all.filter((s) => this.picked.has(s.id));
    const faces = picked.length
      ? h_flex().flex_none().children(picked.slice(0, 4).map((s, i) => div().when(i > 0, (el) => el.ml(-12)).child(mascotEl(botOf(s, c, ps), "calm", 34, t))))
      : div().size(34).flex_none().rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line).flex().items_center().justify_center()
          .child(svg(`${ICON}/users.svg`).size(16).text_color(d.fg3));

    // Awake pals first (they can join now); asleep ones after.
    const order = [...all].sort((x, y) => Number(botOf(y, c, ps).awake) - Number(botOf(x, c, ps).awake));
    const list = sheetPanel(d, "rn-bots");
    for (const space of order) {
      const bot = botOf(space, c, ps);
      const on = this.picked.has(space.id);
      const tab = on ? space.tabs.find((x) => x.id === this.picked.get(space.id)) : null;
      const awake = Boolean(tab && leadPane(tab.id, ps)?.program?.agent);
      list.child(h_flex().id(`rn-bot-${space.id}`).flex_none().min_h(40).items_center().gap(10).px(8).py(4).rounded(4).cursor_pointer()
        .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
        .on_click((_e, cx) => {
          if (on) { this.picked.delete(space.id); if (this.choosing === space.id) this.choosing = null; }
          else this.picked.set(space.id, this.defaultTab(space, ps).id);
          cx.notify();
        })
        .child(div().size(14).flex_none().rounded(3).border_1().border_color(on ? d.info : d.lineStrong).bg(on ? d.info : d.inset).flex().items_center().justify_center()
          .when(on, (el) => el.child(svg(`${ICON}/check.svg`).size(10).text_color(d.fg1))))
        .child(mascotEl(bot, mood(space.status, bot.awake), 30, t))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_size(13).line_height("16px").text_color(bot.awake ? d.fg1 : d.fg2).child(bot.name))
          .when(on && Boolean(tab), (el) => el.child(h_flex().id(`rn-ch-${space.id}`).items_center().gap(4).cursor_pointer()
            .on_click((_e, cx) => { cx.stop_propagation(); this.choosing = this.choosing === space.id ? null : space.id; cx.notify(); })
            .child(div().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg2).child(`#${channelName(tab)}${awake ? "" : " · asleep, will wake"}`))
            .when(space.tabs.length > 1, (el) => el.child(svg(`${ICON}/${this.choosing === space.id ? "chevron-down" : "chevron-right"}.svg`).size(10).text_color(d.fg3)))))));
      if (on && this.choosing === space.id) {
        list.children(space.tabs.map((x) => sheetOption(d, `rn-pick-${x.id}`, { on: x.id === tab?.id, label: `#${channelName(x)}`,
          onClick: () => { this.picked.set(space.id, x.id); this.choosing = null; } }).ml(48)));
      }
    }

    const ready = Boolean(this.name.value().trim()) && this.picked.size >= 2;
    return sheet(d, "crew-room-new", this.handle, (e, cx) => this.key(e, cx))
      .child(sheetHeader(d, { id: "rn", face: faces, title: "New room", sub: "A group chat where pals work together", onClose: close }))
      .child(sheetBody()
        .child(sheetField(d, Input.new(this.name).w_full().text_size(13).text_color(d.fg1), { prefix: "#" }))
        .child(sheetArea(d, Textarea.new(this.goal).w_full().px(6).py(4).text_size(13).text_color(d.fg1)))
        .child(div().pt(2).text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child("Who's in it"))
        .child(sheetPanelBox(d, "rn-bots", list, 300)))
      .child(sheetFooter(d, { id: "rn", hint: this.picked.size < 2 ? "Pick at least two pals" : `${this.picked.size} pals · Esc cancels`, onCancel: close, ready,
        primary: "Open room", onPrimary: () => this.create() }));
  }
}
