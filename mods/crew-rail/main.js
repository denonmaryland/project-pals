// Project Pals rail (Focus only), drawn to the "MODE · Focus" board: a 48 px #0E0E0F column on the
// right edge (#1E1E20 hairline), 34x34 r4 icons 4 px apart: Tasks (its blue dot while the shown
// channel works), Files (what changed), Branch and Terminal, and Expand at the foot. Each icon
// peeks that inspector section in a 320 px panel beside it; clicking it again closes the peek.
// Expand opens Pro on the section you were looking at.

import { View, div, svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, theme, shared, layout, keys } from "herdr";
import { peek, setMode, modePref, ds, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const SECTIONS = [["tasks", "ds-tasks", "Tasks"], ["files", "ds-file", "Changes"], ["branch", "ds-branch", "Branch"], ["terminal", "ds-terminal", "Terminal"]];

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
    const live = tab?.status === "working" ? d.info : tab?.status === "blocked" ? d.warn : tab?.status === "done" ? d.ok : null;
    const bound = keys().find((k) => k.action === "crew-roster.mode");
    const hint = bound ? bound.keys.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("+") : null;
    const icon = (id, name, label, on, action, dot) => div().id(id).relative().size(34).flex_none().flex().items_center().justify_center()
      .rounded(d.r.sm).cursor_pointer().tooltip(label)
      .when(on, (el) => el.bg(d.sel))
      .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click(action)
      .child(svg(`${ICON}/${name}.svg`).size(16).text_color(on ? d.fg1 : dot ? d.iconOn : d.icon))
      .when(Boolean(dot), (el) => el.child(div().absolute().top(5).right(5).size(6).rounded(3).bg(dot)));
    const pro = { tasks: "tasks", files: "run", branch: "run", terminal: "run" };
    return v_flex().id("crew-rail").size_full().items_center().py(8).gap(4).bg(d.bg1).border_l_1().border_color(d.line)
      .children(SECTIONS.map(([id, name, label]) => icon(`rail-${id}`, name, label, open === id, () => peek(id), id === "tasks" ? live : null)))
      .child(div().flex_1())
      .child(icon("rail-expand", "ds-expand", hint ? `Expand to Pro (${hint})` : "Expand to Pro", false,
        () => setMode("pro", { tab: pro[open] ?? modePref("pro", "inspectorTab") })));
  }
}
