// Project Pals rail (Focus only): a 48 px column of icons on the right edge of the sheet. Each
// icon peeks one inspector section (Run, Tasks, Memory) in a 320 px panel beside it; clicking it
// again closes the peek. Expand at the bottom opens Pro on the section you were looking at.

import { View, div, svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, theme, shared, layout, keys } from "herdr";
import { peek, setMode, modePref, statusColor, ds, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const SECTIONS = [["run", "activity", "Run"], ["tasks", "list-checks", "Tasks"], ["memory", "book-open", "Memory"]];

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}

export default class CrewRail extends View {
  render() {
    const t = tone(theme());
    const d = ds(t);
    const open = !findNode(layout(), "panel")?.hidden ? shared("crew.peek") : null;
    const tab = spaces().find((s) => s.active)?.tabs.find((x) => x.active);
    // The live dot: the shown channel is working, waiting on you, or done.
    const live = tab && ["working", "blocked", "done"].includes(tab.status) ? statusColor(tab.status, t) : null;
    const bound = keys().find((k) => k.action === "crew-roster.mode");
    const hint = bound ? bound.keys.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("+") : null;
    const icon = (id, name, label, on, action, dot) => div().id(id).relative().size(32).flex_none().flex().items_center().justify_center()
      .rounded(d.r.sm).cursor_pointer().tooltip(label)
      .when(on, (el) => el.bg(d.sel))
      .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click(action)
      .child(svg(`${ICON}/${name}.svg`).size(16).text_color(on ? d.fg1 : d.fg3))
      .when(Boolean(dot), (el) => el.child(div().absolute().top(5).right(5).size(6).rounded_full().bg(dot)));
    return v_flex().id("crew-rail").size_full().items_center().pt(10).pb(10).gap(4)
      .children(SECTIONS.map(([id, name, label]) => icon(`rail-${id}`, name, label, open === id, () => peek(id), id === "run" ? live : null)))
      .child(div().flex_1())
      .child(icon("rail-expand", "maximize", hint ? `Expand to Pro (${hint})` : "Expand to Pro", false,
        () => setMode("pro", { tab: open ?? modePref("pro", "inspectorTab") })));
  }
}
