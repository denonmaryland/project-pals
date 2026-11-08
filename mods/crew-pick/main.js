// Project Pals channel picker: the popup under Focus's "# channel ▾" in the header. The shown
// pal's channels with their state; click one to switch, or start a new one.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, theme, props, closeOverlay, openOverlay, run } from "herdr";
import { channelName, statusColor, statusWord, ago, ds, tone, showTabs } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewPick extends View {
  close() { closeOverlay(props()?.overlay); }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const space = spaces().find((s) => s.id === props()?.space) ?? spaces().find((s) => s.active);
    const root = v_flex().id("crew-pick").w_full().p(4).gap(1).text_color(d.fg1);
    if (!space) return root.child(div().p(8).text_size(12.5).text_color(d.fg3).child("No pal shown."));
    const row = (id, left, right, action, on = false) => h_flex().id(id).h(30).px(8).gap(8).items_center().rounded(d.r.sm).cursor_pointer()
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click(action).child(left).when(Boolean(right), (el) => el.child(right));
    root.child(div().px(8).pt(4).pb(6).text_size(11.5).text_color(d.fg3).child(`${space.name.split(" - ")[0]} · channels`));
    for (const tab of space.tabs) {
      const live = ["working", "blocked", "done"].includes(tab.status);
      root.child(row(`pick-${tab.id}`,
        h_flex().flex_1().min_w(0).gap(6).items_center()
          .child(div().text_size(13).text_color(d.fg3).child("#"))
          .child(div().min_w(0).truncate().text_size(13).text_color(tab.active ? d.fg1 : d.fg2).child(channelName(tab))),
        h_flex().flex_none().gap(6).items_center()
          .when(live, (el) => el.child(div().text_size(11).text_color(d.fg3).child(statusWord(tab.status))).child(div().size(6).rounded_full().bg(statusColor(tab.status, t))))
          .when(!live && Boolean(tab.changed_at), (el) => el.child(div().text_size(11).text_color(d.fg3).child(ago(tab.changed_at)))),
        () => { showTabs(); run("tab.select", { id: tab.id }); this.close(); }, tab.active));
    }
    root.child(div().h(1).mx(4).my(4).bg(d.line));
    root.child(row("pick-new",
      h_flex().gap(8).items_center().child(svg(`${ICON}/plus.svg`).size(12).text_color(d.fg3)).child(div().text_size(12.5).text_color(d.fg2).child("New channel")),
      null, () => { this.close(); openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } }); }));
    return root;
  }
}
