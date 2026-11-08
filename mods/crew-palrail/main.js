// Project Pals pal rail (Pro only): every pal as its pocket pet, in the sidebar's order, 60 px wide.
// Drawn to the "MODE · Pro" board: 38x30 tiles in 44x36 slots (r5), the shown pal's slot lit
// (#232324 with a #3C3C3F hairline), an 8 px dot on the slot's corner while a pal works (blue),
// needs you (amber) or finished (green), a dashed + to hire, and settings at the bottom.

import { View, div, svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, panes, theme, run, shared, openOverlay } from "herdr";
import { crew, botOf, mascotEl, mood, palOrder, showTabs, ds, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewPalRail extends View {
  render() {
    const t = tone(theme());
    const d = ds(t);
    const c = crew(), ps = panes();
    const only = shared("crew.demo");
    const rows = palOrder((only ? spaces().filter((s) => only.includes(s.name)) : spaces()).map((space) => ({ space, bot: botOf(space, c, ps) })));
    const face = ({ space, bot }) => {
      const st = space.status;
      const dot = !bot.awake ? null : st === "working" ? d.info : st === "blocked" ? d.warn : st === "done" ? d.ok : null;
      return div().id(`prail-${space.id}`).relative().flex_none().flex().p(3).rounded(5).cursor_pointer().tooltip(bot.name)
        .when(space.active, (el) => el.bg(d.sel).border_1().border_color(d.lineStrong))
        .when(!space.active, (el) => el.hover((s) => s.bg(d.hover)))
        .on_click(() => { showTabs(); run("space.select", { id: space.id }); })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "pal", space: space.id } }); })
        .child(mascotEl(bot, mood(st, bot.awake || bot.starting), 38, t))
        .when(Boolean(dot), (el) => el.child(div().absolute().top(0).right(0).size(8).rounded(4).bg(dot).border_2().border_color(d.bg0)));
    };
    return v_flex().id("crew-palrail").size_full().items_center().py(8).gap(6).bg(d.bg0).border_r_1().border_color(d.line)
      .child(v_flex().id("prail-list").flex_1().min_h(0).w_full().overflow_y_scrollbar().items_center().gap(6)
        .children(rows.map(face))
        .child(div().w(28).h(1).my(2).flex_none().bg(d.line))
        .child(div().id("prail-hire").w(44).h(36).flex_none().flex().items_center().justify_center().rounded(d.r.sm)
          .border_1().border_dashed().border_color(d.lineMid).cursor_pointer().tooltip("Hire a pal").hover((s) => s.bg(d.hover))
          .on_click(() => openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true }))
          .child(svg(`${ICON}/ds-plus.svg`).size(14).text_color(d.fg3))))
      .child(div().id("prail-about").size(36).flex_none().flex().items_center().justify_center().rounded(d.r.sm)
        .cursor_pointer().tooltip("Project Pals settings").hover((s) => s.bg(d.hover))
        .on_click(() => openOverlay({ mod: "crew-about", kind: "dialog", width: 480 }))
        .child(svg(`${ICON}/ds-sun.svg`).size(16).text_color(d.fg3)));
  }
}
