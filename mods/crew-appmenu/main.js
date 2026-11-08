// Project Pals' app menu: the gear at the left end of the status bar. Everything that isn't about one
// pal or channel, in one place (DeNon, 2026-11-08: with Pro and the old sidebar footer gone, there
// was no visible way to settings, themes, layouts, hiring, routines or updates). Drawn like the
// terminal menu: an r4 #161617 popover with a hairline, 28 px rows, each with its shortcut from
// keys.json when it has one. Up/Down and Enter work; Esc closes.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme } from "herdr";
import { ds, tone, appMenuItems } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewAppMenu extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = -1;
  }

  // The rows live in crew.js (appMenuItems) so the command bar lists and searches the same ones.
  items() { return appMenuItems(); }

  go(item) {
    closeOverlay(props()?.overlay);
    item.go();
  }

  key(e, cx) {
    const list = this.items().filter((x) => !x.sep);
    if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); return; }
    if (e.key === "down" || e.key === "up") { this.at = (Math.max(this.at, e.key === "down" ? -1 : 0) + (e.key === "down" ? 1 : list.length - 1)) % list.length; cx.stop_propagation(); cx.notify(); return; }
    if (e.key === "enter") { cx.stop_propagation(); const it = list[this.at]; if (it) this.go(it); }
  }

  render() {
    const d = ds(tone(theme()));
    const root = v_flex().id("crew-appmenu").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().p(4).gap(1).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line);
    let i = 0;
    for (const it of this.items()) {
      if (it.sep) { root.child(div().h(1).mx(4).my(3).flex_none().bg(d.line)); continue; }
      const n = i++;
      root.child(h_flex().id(`am-${n}`).h(28).flex_none().px(8).gap(8).items_center().rounded(3).cursor_pointer()
        .when(this.at === n, (el) => el.bg(d.sel))
        .on_hover((h, cx) => { if (h && this.at !== n) { this.at = n; cx.notify(); } })
        .on_click(() => this.go(it))
        .child(svg(`${ICON}/${it.icon}.svg`).size(13).flex_none().text_color(d.fg2))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(d.fg1).child(it.label))
        .when(Boolean(it.key), (el) => el.child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(d.fg4).child(it.key))));
    }
    return root;
  }
}
