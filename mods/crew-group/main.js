// Name a pal group: a new one (props.mode "new", optionally props.bot: a pal to move into it) or an
// existing one (props.mode "rename", props.group). Enter saves, Esc cancels. Groups live in shared
// "crew.marks" (crew.js: newGroup, renameGroup, setPalGroup).

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, spaces } from "herdr";
import { ds, tone, palGroups, newGroup, renameGroup, setPalGroup, botOf, sheet, sheetHeader, sheetBody, sheetField, sheetFooter } from "./crew.js";

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
    const close = () => closeOverlay(p.overlay);
    const rename = p.mode === "rename";
    return sheet(d, "crew-group", this.handle, (e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "grp", title: rename ? "Rename group" : "New group", sub: rename ? null : "A section in the pal list; drag pals into it", onClose: close }))
      .child(sheetBody().child(sheetField(d, Input.new(this.input).w_full().text_size(13).text_color(d.fg1))))
      .child(sheetFooter(d, { id: "grp", hint: "Enter saves · Esc cancels", onCancel: close, ready: Boolean(this.input.value().trim()),
        primary: rename ? "Rename" : "Create", onPrimary: () => this.save() }));
  }
}
