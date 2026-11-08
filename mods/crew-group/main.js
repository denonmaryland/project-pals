// Name a pal group: a new one (props.mode "new", optionally props.bot: a pal to move into it) or an
// existing one (props.mode "rename", props.group). Enter saves, Esc cancels. Groups live in shared
// "crew.marks" (crew.js: newGroup, renameGroup, setPalGroup).

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, spaces } from "herdr";
import { ds, tone, palGroups, newGroup, renameGroup, setPalGroup, botOf } from "./crew.js";

export default class CrewGroup extends View {
  init(_props, cx) {
    const p = props() ?? {};
    const g = p.mode === "rename" ? palGroups().find((x) => x.id === p.group) : null;
    this.input = InputState.new({ placeholder: "Personal, Business, …", value: g?.name ?? "" });
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", () => this.save());
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  save() {
    const p = props() ?? {};
    const name = this.input.value().trim();
    if (!name) return;
    if (p.mode === "rename") renameGroup(p.group, name);
    else {
      const id = newGroup(name);
      const sp = p.bot ? spaces().find((s) => botOf(s).id === p.bot) : null;
      if (sp) setPalGroup(botOf(sp), id);
    }
    closeOverlay(p.overlay);
  }

  render() {
    const d = ds(tone(theme()));
    const p = props() ?? {};
    const empty = !this.input.value().trim();
    const btn = (id, text, primary, action) => div().id(id).h(28).px(12).flex().items_center().rounded(d.r.sm)
      .bg(primary && !empty ? d.act : d.raised).border_1().border_color(primary && !empty ? d.act : d.lineMid)
      .when(!primary || !empty, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).on_click(action))
      .text_size(12).font_weight(500).text_color(primary ? (empty ? d.fg4 : d.actFg) : d.body).child(text);
    return v_flex().id("crew-group").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().gap(14).p(20).bg(d.bg1).text_color(d.fg1)
      .child(div().text_size(15).line_height("20px").font_weight(600).child(p.mode === "rename" ? "Rename group" : "New group"))
      .child(div().h(36).px(12).flex().items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color(d.lineMid)
        .child(Input.new(this.input).w_full().text_size(13).text_color(d.fg1)))
      .child(h_flex().justify_end().gap(8)
        .child(btn("grp-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(btn("grp-save", p.mode === "rename" ? "Rename" : "Create", true, () => this.save())));
  }
}
