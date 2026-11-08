// Working indicator: the mark beside a working channel, in the hero's channel list and the channel
// picker (DeNon, 2026-11-08). Thirty-one styles in four groups (Classic · Pixel · Sphere · ASCII),
// every one a live preview. A click applies it at once (crew-settings.json "workingIndicator", via
// saveUiSettings, so the sidebar follows straight away); the fake channel rows on top show the style
// under the pointer, else the chosen one. Done keeps it; Cancel or Esc puts back the one you had.
// In the dialog kit's "A · Compact sheet" look. The styles and their art: crew.js WORKING_STYLES.

import { View, div } from "gpui-kit";
import { theme, props, closeOverlay } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetFooter, saveUiSettings,
  WORKING_STYLES, WORKING_GROUPS, workingStyle, workingStyleOf, workingMark } from "./crew.js";

const TILE = 44, GAP = 4, PREVIEW = 24;

export default class CrewIndicator extends View {
  init(_props, cx) {
    this.was = workingStyle().id;
    this.hot = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  pick(id) { if (id !== workingStyle().id) saveUiSettings({ workingIndicator: id }); }

  close(keep) {
    if (!keep) this.pick(this.was);
    closeOverlay(props()?.overlay);
  }

  // A channel row as the hero list draws it (28 px, r4, "#" in mono, the mark at the right end):
  // one picked (the selected fill), one not.
  row(d, id, name, on, mark) {
    return div().id(id).flex().h(28).px(8).gap(8).items_center().rounded(d.r.sm).when(on, (el) => el.bg(d.sel))
      .child(div().flex_none().text_size(12).line_height("16px").font_family(d.mono).text_color(on ? d.fg2 : d.fg4).child("#"))
      .child(div().flex_1().min_w(0).truncate().text_size(13).line_height("16px").when(on, (el) => el.font_weight(500))
        .text_color(on ? d.fg1 : d.body).child(name))
      .child(mark);
  }

  render() {
    const d = ds(tone(theme()));
    const chosen = workingStyle();
    const shown = workingStyleOf(this.hot ?? chosen.id);
    const groupName = (g) => WORKING_GROUPS.find(([k]) => k === g)?.[1] ?? g;

    const preview = div().flex().flex_col().gap(2).p(6).rounded(6).bg(d.bg0).border_1().border_color(d.line)
      .child(this.row(d, "wi-row-a", "indicators", true, workingMark(d, shown.id)))
      .child(this.row(d, "wi-row-b", "integrate", false, workingMark(d, shown.id)))
      .child(this.row(d, "wi-row-c", "docs-check", false,
        div().flex_none().text_size(11).line_height("14px").text_color(d.fg4).child("12m")));

    const caption = div().flex().items_center().justify_between()
      .child(div().text_size(12).line_height("16px").text_color(d.fg1).font_weight(500).child(shown.name))
      .child(div().text_size(11).line_height("14px").text_color(d.fg3)
        .child(this.hot && this.hot !== chosen.id ? `${groupName(shown.group)} · click to use` : groupName(shown.group)));

    const tile = (st) => {
      const on = st.id === chosen.id;
      return div().id(`wi-${st.id}`).size(TILE).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
        .border_1().border_color(on ? d.lineStrong : d.bg1).when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
        .tooltip(st.name)
        .on_hover((h, cx) => { const next = h ? st.id : (this.hot === st.id ? null : this.hot); if (next !== this.hot) { this.hot = next; cx.notify(); } })
        .on_click((_e, cx) => { this.pick(st.id); cx.notify(); })
        .child(workingMark(d, st.id, PREVIEW));
    };

    const body = sheetBody().child(preview).child(caption);
    for (const [g, label] of WORKING_GROUPS) {
      const list = WORKING_STYLES.filter((x) => x.group === g);
      body.child(div().pt(4).text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(label))
        .child(div().flex().flex_wrap().gap(GAP).children(list.map(tile)));
    }

    return sheet(d, "crew-indicator", this.handle, (e, cx) => { if (e.key === "escape") { this.close(false); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "wi", face: div().size(40).flex_none().flex().items_center().justify_center().rounded(8).bg(d.bg0).border_1().border_color(d.line)
        .child(workingMark(d, chosen.id, PREVIEW)),
        title: "Working indicator", sub: "Beside a channel while its agent works", onClose: () => this.close(true) }))
      .child(body)
      .child(sheetFooter(d, { id: "wi", hint: "Applies as you click · Esc puts back the old one", onCancel: () => this.close(false),
        primary: "Done", onPrimary: () => this.close(true) }));
  }
}
