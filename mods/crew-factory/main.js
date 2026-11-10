// Name a factory: a new one (props.mode "new": a name and a template) or an existing one
// (props.mode "rename", props.factory). Enter saves, Esc cancels. Factories live in
// data/crew-factories.json, written by `pal factory …` with the click made here (crew.js: newFactory,
// renameFactory). Making one doesn't switch to it or move anyone: pals go in from their own menu.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay } from "herdr";
import { ds, tone, factories, newFactory, renameFactory, FACTORY_TEMPLATES, sheet, sheetHeader, sheetBody, sheetField, sheetFooter } from "./crew.js";

export default class CrewFactory extends View {
  init(_props, cx) {
    const p = props() ?? {};
    const f = p.mode === "rename" ? factories().find((x) => x.id === p.factory) : null;
    this.template = FACTORY_TEMPLATES[0].id;
    this.input = InputState.new({ placeholder: "The product or project this crew is for", value: f?.name ?? "" });
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", () => this.save());
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  // A name another factory already has can't be saved (pal factory refuses it too).
  taken() {
    const p = props() ?? {};
    const name = this.input.value().trim().toLowerCase();
    return Boolean(name) && factories().some((f) => f.name.toLowerCase() === name && f.id !== p.factory);
  }

  save() {
    const p = props() ?? {};
    const name = this.input.value().trim();
    if (!name || this.taken()) return;
    if (p.mode === "rename") renameFactory(p.factory, name);
    else newFactory(name, this.template);
    closeOverlay(p.overlay);
  }

  render() {
    const d = ds(tone(theme()));
    const p = props() ?? {};
    const close = () => closeOverlay(p.overlay);
    const rename = p.mode === "rename";
    const pick = (t) => {
      const on = this.template === t.id;
      return v_flex().id(`fac-t-${t.id}`).flex_1().min_w(0).p(10).gap(2).rounded(d.r.sm).cursor_pointer().border_1().border_color(on ? d.info : d.line)
        .when(on, (el) => el.bg(d.sel)).hover((s) => s.bg(d.hover))
        .on_click((_e, cx) => { this.template = t.id; cx.notify(); })
        .child(div().text_size(13).font_weight(600).text_color(d.fg1).child(t.name))
        .child(div().text_size(12).text_color(d.fg2).child(t.about));
    };
    const body = sheetBody().child(sheetField(d, Input.new(this.input).w_full().text_size(13).text_color(d.fg1)));
    if (this.taken()) body.child(div().mt(6).text_size(12).text_color(d.warn).child("There's already a factory with that name."));
    if (!rename) body.child(h_flex().mt(10).gap(8).children(FACTORY_TEMPLATES.map(pick)));
    return sheet(d, "crew-factory", this.handle, (e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "fac", title: rename ? "Rename factory" : "New factory",
        sub: rename ? null : "A crew of its own, with its own foreman and Home. Your pals stay where they are.", onClose: close }))
      .child(body)
      .child(sheetFooter(d, { id: "fac", hint: "Enter saves · Esc cancels", onCancel: close, ready: Boolean(this.input.value().trim()) && !this.taken(),
        primary: rename ? "Rename" : "Create", onPrimary: () => this.save() }));
  }
}
