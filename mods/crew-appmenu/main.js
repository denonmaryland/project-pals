// Project Pals' app menu: the gear at the left end of the status bar. Everything that isn't about one
// pal or channel, in one place (DeNon, 2026-11-08: with Pro and the old sidebar footer gone, there
// was no visible way to settings, themes, layouts, hiring, routines or updates). Drawn like the
// terminal menu: an r4 #161617 popover with a hairline, 28 px rows, each with its shortcut from
// keys.json when it has one. Up/Down and Enter work; Esc closes.
// It is never taller than the window (crew.js appMenuSpec); when its rows don't fit they scroll, by
// wheel, by the pill at the right, and by the keyboard: Up/Down (wrapping), Home/End and
// PageUp/PageDown move the highlight and keep it in view (T95).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, theme } from "herdr";
import { ds, tone, appMenuItems, appMenuTops, APP_MENU, scrollArea, scrollState, scrollTo, scrollIntoView, thumbGeom } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const SID = "crew-appmenu-list";

export default class CrewAppMenu extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = -1;
    // The scroll offset is kept by id for the whole app run: every opening starts at the top.
    scrollTo(SID, 0);
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
    const n = list.length, page = Math.max(1, Math.floor((scrollState(SID).view || APP_MENU.height) / (APP_MENU.row + APP_MENU.gap)) - 1);
    const to = e.key === "down" ? (Math.max(this.at, -1) + 1) % n
      : e.key === "up" ? (Math.max(this.at, 0) + n - 1) % n
      : e.key === "home" ? 0 : e.key === "end" ? n - 1
      : e.key === "pagedown" ? Math.min(n - 1, Math.max(this.at, 0) + page)
      : e.key === "pageup" ? Math.max(0, Math.max(this.at, 0) - page) : null;
    if (to !== null) { this.at = to; this.keyedAt = Date.now(); this.reveal(); cx.stop_propagation(); cx.notify(); return; }
    if (e.key === "enter") { cx.stop_propagation(); const it = list[this.at]; if (it) this.go(it); }
  }

  // Bring the highlighted row into view; the first and last also show the list's very ends.
  reveal() {
    const { tops, height } = appMenuTops(this.items());
    if (this.at < 0 || this.at >= tops.length) return;
    const first = this.at === 0, last = this.at === tops.length - 1;
    scrollIntoView(SID, first ? 0 : tops[this.at], last ? height - tops[this.at] : first ? tops[0] + APP_MENU.row : APP_MENU.row);
  }

  render() {
    const d = ds(tone(theme()));
    // The frame fills the popup; the rows scroll inside it. While they don't all fit, the rows end
    // 9 px further in so the pill never covers a shortcut.
    const sc = scrollState(SID);
    const scrolls = Boolean(thumbGeom(sc.view, sc.content, sc.y));
    const root = v_flex().id("crew-appmenu").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(APP_MENU.pad).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line);
    const list = v_flex().w_full().gap(APP_MENU.gap).when(scrolls, (el) => el.pr(9));
    let i = 0;
    for (const it of this.items()) {
      if (it.sep) { list.child(div().h(1).mx(4).my(3).flex_none().bg(d.line)); continue; }
      const n = i++;
      list.child(h_flex().id(`am-${n}`).h(28).flex_none().px(8).gap(8).items_center().rounded(3).cursor_pointer()
        .when(this.at === n, (el) => el.bg(d.sel))
        // The pointer takes the highlight, but not in the moment after a key moved it: a keyboard
        // scroll slides another row under a still pointer, and that must not steal it back.
        .on_hover((h, cx) => { if (h && this.at !== n && Date.now() - (this.keyedAt ?? 0) > 250) { this.at = n; cx.notify(); } })
        .on_click(() => this.go(it))
        .child(svg(`${ICON}/${it.icon}.svg`).size(13).flex_none().text_color(d.fg2))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(d.fg1).child(it.label))
        .when(Boolean(it.key), (el) => el.child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(d.fg4).child(it.key))));
    }
    return root.child(scrollArea(d, SID, list).flex_1().min_h(0).w_full());
  }
}
