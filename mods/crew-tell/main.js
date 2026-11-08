// Tell a pal something without opening its terminal (the Focus hero's Tell button). Sends it with
// `pal tell "<Pal>#<channel>"`, which queues it for that channel and delivers it when its turn ends,
// marked "[from <owner>]". props: { space, tab } (tab: the channel; else the pal's shown one).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces } from "herdr";
import { botOf, mascotEl, mood, crewCli, channelName, ds, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewTell extends View {
  init(_props, cx) {
    this.input = InputState.new({ placeholder: "Message" });
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (_e, cx) => this.send(cx));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
    this.busy = false;
  }

  target() {
    const p = props() ?? {};
    const space = spaces().find((x) => x.id === p.space);
    const tab = space?.tabs.find((x) => x.id === p.tab) ?? space?.tabs.find((x) => x.active) ?? space?.tabs[0];
    return space && tab ? { space, tab, bot: botOf(space), spec: `${space.name}#${channelName(tab)}` } : null;
  }

  send(cx) {
    const tg = this.target();
    const text = this.input.value().trim();
    if (!tg || !text || this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await crewCli(["tell", tg.spec, text]);
        notify({ title: `Told ${tg.bot.name} #${channelName(tg.tab)}`, body: "It gets it when its turn ends.", level: "success", timeout: 2500 });
        closeOverlay(props().overlay);
      } catch (e) {
        notify({ title: "Couldn't send it", body: String(e.message ?? e).slice(0, 200), level: "warning" });
        this.busy = false;
        cx.notify();
      }
    });
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    const tg = this.target();
    if (!tg) return div().p(24).bg(d.bg1).text_color(d.fg2).child("That pal is gone.");
    const empty = !this.input.value().trim();
    return v_flex().id("crew-tell").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); } })
      .w_full().gap(14).p(20).bg(d.bg1).text_color(d.fg1)
      .child(h_flex().items_center().gap(10)
        .child(mascotEl(tg.bot, mood(tg.tab.status, tg.bot.awake), 36, t))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().text_size(15).line_height("20px").font_weight(600).child(`Tell ${tg.bot.name}`))
          .child(div().truncate().text_size(12).line_height("16px").text_color(d.fg3).child(`#${channelName(tg.tab)} · it gets it when its turn ends`))))
      .child(div().h(36).px(12).flex().items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color(d.lineMid)
        .child(Input.new(this.input).w_full().text_size(13).text_color(d.fg1)))
      .child(h_flex().justify_end().gap(8)
        .child(div().id("tell-cancel").h(28).px(12).flex().items_center().rounded(d.r.sm).cursor_pointer()
          .bg(d.raised).border_1().border_color(d.lineMid).hover((s) => s.bg(d.hover))
          .text_size(12).font_weight(500).text_color(d.body).child("Cancel")
          .on_click(() => closeOverlay(props().overlay)))
        .child(h_flex().id("tell-send").h(28).px(12).gap(6).items_center().rounded(d.r.sm)
          .when(!empty && !this.busy, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click((_e, cx) => this.send(cx)))
          .bg(empty ? d.raised : d.act).border_1().border_color(empty ? d.lineMid : d.act)
          .child(svg(`${ICON}/ds-send.svg`).size(12).text_color(empty ? d.fg4 : d.actFg))
          .child(div().text_size(12).font_weight(500).text_color(empty ? d.fg4 : d.actFg).child(this.busy ? "Sending…" : "Send"))));
  }
}
