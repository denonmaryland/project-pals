// Project Pals pal rail (Pro only): every pal as its face, in the sidebar's order, 60 px wide.
// The shown pal is lit, a dot says who's working, done or waiting on you. Click switches pals;
// the list column beside it then shows that pal's channels. + hires one.

import { View, div, svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, panes, theme, run, shared, openOverlay } from "herdr";
import { crew, botOf, mascotEl, mood, palOrder, statusColor, showTabs, ds, tone } from "./crew.js";

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
      const dot = bot.awake && ["working", "blocked", "done"].includes(st) ? statusColor(st, t) : null;
      return div().id(`prail-${space.id}`).relative().size(44).flex_none().flex().items_center().justify_center().rounded(d.r.md)
        .cursor_pointer().tooltip(bot.name)
        .when(space.active, (el) => el.bg(d.sel).border_1().border_color(d.lineStrong))
        .when(!space.active, (el) => el.hover((s) => s.bg(d.hover)))
        .on_click(() => { showTabs(); run("space.select", { id: space.id }); })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "pal", space: space.id } }); })
        .child(mascotEl(bot, mood(st, bot.awake || bot.starting), 38, t))
        .when(Boolean(dot), (el) => el.child(div().absolute().top(3).right(3).size(7).rounded_full().bg(dot).border_1().border_color(t.chrome)));
    };
    const icon = (id, name, label, action) => div().id(id).size(36).flex_none().flex().items_center().justify_center().rounded(d.r.sm)
      .cursor_pointer().tooltip(label).hover((s) => s.bg(d.hover)).on_click(action)
      .child(svg(`${ICON}/${name}.svg`).size(15).text_color(d.fg3));
    return v_flex().id("crew-palrail").size_full().items_center().pt(12).pb(10).gap(6)
      .child(v_flex().id("prail-list").flex_1().min_h(0).overflow_y_scrollbar().items_center().gap(6).children(rows.map(face))
        .child(div().w(28).h(1).my(4).flex_none().bg(d.line))
        .child(icon("prail-hire", "plus", "Hire a pal", () => openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true }))))
      .child(icon("prail-about", "settings", "Project Pals settings", () => openOverlay({ mod: "crew-about", kind: "dialog", width: 480 })));
  }
}
