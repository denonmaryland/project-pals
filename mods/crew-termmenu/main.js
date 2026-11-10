// Project Pals terminal menu: the right-click on a channel's terminal (the pals layout's
// "terminal_menu"). It replaces Herdr's menu, so it keeps all of Herdr's items: split right and
// down (new panes are shells in the channel's folder, and belong to that channel), zoom, copy,
// paste, where right-clicks go, sending a helper back to its parent, and close. Drawn in the DS:
// an r4 #161617 popover with a hairline, 28 px rows, each with its shortcut from keys.json.
// Closing the pane that runs the channel's agent ends that agent, so that row says so in red.
// Every action uses the right-clicked pane (props().target), never the focused one.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, keys, terminals, panes, spaces } from "herdr";
import { ds, tone, popOut } from "./crew.js";

const ICON = "mods/crew-roster/icons";

function shortcut(action) {
  const k = keys().find((x) => x.action === action);
  return k ? k.keys.split("-").map((p) => p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join("+") : "";
}

// The pal and topic a pane belongs to ({ space, tab }), or null (a mod pane, a pane we can't place).
function topicOf(pane) {
  if (!pane?.terminal || !pane.tab) return null;
  for (const space of spaces()) {
    const tab = space.tabs.find((t) => t.id === pane.tab);
    if (tab) return { space, tab };
  }
  return null;
}

export default class CrewTermMenu extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = 0;
  }

  items() {
    const tg = props()?.target ?? {};
    const all = terminals();
    const term = all.find((t) => t.address === tg.terminal);
    const parent = term?.parent && all.find((t) => t.address === term.parent);
    const toProgram = term?.labels?.["herdr.right-click"] === "program";
    const pane = panes().find((p) => p.pane === tg.pane);
    const agent = pane?.program?.agent ? (pane.program.name || "the agent") : null;
    const home = topicOf(pane);
    return [
      { label: "Split right", icon: "panel-right", key: shortcut("pane.split:right"), cmd: ["pane.split", { direction: "right", pane: tg.pane }] },
      { label: "Split down", icon: "ds-split-down", key: shortcut("pane.split:down"), cmd: ["pane.split", { direction: "down", pane: tg.pane }] },
      { label: "Zoom", icon: "maximize", key: shortcut("pane.zoom"), cmd: ["pane.zoom", { pane: tg.pane }] },
      { sep: true },
      { label: "Copy", icon: "copy", key: shortcut("terminal.copy"), cmd: ["terminal.copy", {}] },
      { label: "Paste", icon: "paperclip", key: shortcut("terminal.paste"), cmd: ["terminal.paste", {}] },
      ...(term ? [toProgram
        ? { label: "Use this menu on right-click", icon: "ds-terminal", cmd: ["terminal.right_click", { terminal: term.address, to: "menu" }] }
        : { label: "Send right-clicks to the program", icon: "ds-terminal", cmd: ["terminal.right_click", { terminal: term.address, to: "program" }] }] : []),
      // Pop out (T70): this topic in its own desktop window, when the pane is a topic's own terminal.
      ...(home ? [{ label: "Pop out to a window", icon: "ds-expand", fn: () => popOut(home.space, home.tab) }] : []),
      ...(parent ? [{ label: `Send back to ${parent.name || parent.address}`, icon: "minimize", cmd: ["terminal.park", { terminal: term.address }] }] : []),
      { sep: true },
      { label: agent ? `Close pane (ends ${agent})` : "Close pane", icon: "x", key: shortcut("pane.close"), danger: Boolean(agent), cmd: ["pane.close", { pane: tg.pane }] },
    ];
  }

  go(item) {
    closeOverlay(props()?.overlay);
    // Copy and paste act on the focused terminal: focus the right-clicked pane first.
    if (item.fn) return item.fn();
    const tg = props()?.target ?? {};
    if (item.cmd[0].startsWith("terminal.") && item.cmd[0] !== "terminal.right_click" && item.cmd[0] !== "terminal.park" && tg.pane) run("pane.focus", { pane: tg.pane });
    run(item.cmd[0], item.cmd[1]);
  }

  key(e, cx) {
    const list = this.items().filter((x) => !x.sep);
    if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); return; }
    if (e.key === "down" || e.key === "up") { this.at = (this.at + (e.key === "down" ? 1 : list.length - 1)) % list.length; cx.stop_propagation(); cx.notify(); return; }
    if (e.key === "enter") { cx.stop_propagation(); const it = list[this.at]; if (it) this.go(it); }
  }

  render() {
    const d = ds(tone(theme()));
    const root = v_flex().id("crew-termmenu").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().p(4).gap(1).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line);
    let i = 0;
    for (const it of this.items()) {
      if (it.sep) { root.child(div().h(1).mx(4).my(3).flex_none().bg(d.line)); continue; }
      const n = i++;
      root.child(h_flex().id(`tm-${n}`).h(28).flex_none().px(8).gap(8).items_center().rounded(3).cursor_pointer()
        .when(this.at === n, (el) => el.bg(d.sel))
        .on_hover((h, cx) => { if (h && this.at !== n) { this.at = n; cx.notify(); } })
        .on_click(() => this.go(it))
        .child(svg(`${ICON}/${it.icon}.svg`).size(13).flex_none().text_color(it.danger ? d.err : d.fg2))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(it.danger ? d.err : d.fg1).child(it.label))
        .when(Boolean(it.key), (el) => el.child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(d.fg4).child(it.key))));
    }
    return root;
  }
}
