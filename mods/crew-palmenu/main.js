// Project Pals pal menu (the header's pal chip opened it until the command bar replaced the chip,
// T18; its rows are palMenuItems, the command bar's empty list). Everything about THE AGENT and
// THAT PROJECT, not its channels (the hero lists those): its profile, memory and tasks; its project's
// review and folder; and the pal's actions (Sleep / Wake). Each opens the right-side panel's tab, or the dialog it
// names. Drawn like crew-pick:
// an r4 #161617 popover, a 1 px hairline, 30 px rows. Keys: ↑/↓ move, Enter opens, Esc closes.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, theme, props, closeOverlay, home } from "herdr";
import { botOf, ds, tone, taskFor, loadOps, panelOpen, panelTab, panelState, palMenuItems } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const ROW = 30;

// A folder as people say it: ~ for the home folder (wherever it is: /home/x, /Users/x).
const tilde = (f) => { const h = home(); return h && (f === h || f.startsWith(`${h}/`)) ? `~${f.slice(h.length)}` : f; };

export default class CrewPalMenu extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.cursor = 0;
    this.open = 0;
    cx.spawn(async (cx) => {
      try { const ops = await loadOps(); const b = botOf(this.space()); this.open = ops.tasks.filter((x) => taskFor(x, b?.name) && ["open", "claimed", "blocked"].includes(x.status)).length; } catch {}
      cx.notify();
    });
  }

  space() { return spaces().find((s) => s.id === props()?.space) ?? spaces().find((s) => s.active); }
  close() { closeOverlay(props()?.overlay); }

  // [group, id, icon, label, hint, action] rows (palMenuItems, shared with the command bar); a
  // group change draws its small header.
  items(space, bot) { return palMenuItems(space, bot, this.open); }

  pick(item) { this.close(); item[5](); }

  key(e, cx, items) {
    if (e.key === "escape") { this.close(); cx.stop_propagation(); return; }
    if (e.key === "down" || e.key === "up") { this.cursor = (this.cursor + (e.key === "down" ? 1 : -1) + items.length) % items.length; cx.stop_propagation(); cx.notify(); return; }
    if (e.key === "enter") { cx.stop_propagation(); this.pick(items[this.cursor]); }
  }

  render() {
    const d = ds(tone(theme()));
    const space = this.space();
    const root = v_flex().id("crew-palmenu").track_focus(this.handle).w_full().p(4).gap(1).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line).text_color(d.fg1);
    if (!space) return root.child(div().p(8).text_size(12).text_color(d.fg3).child("No pal shown."));
    const bot = botOf(space);
    const items = this.items(space, bot);
    root.on_key_down((e, cx) => this.key(e, cx, items));
    // Which row the open panel is already on (choosing it again closes the panel).
    const onTab = panelOpen() ? (panelState().section === "memory" ? "memory" : panelTab()) : null;
    root.child(v_flex().px(8).pt(6).pb(7).mb(2).border_b_1().border_color(d.line)
      .child(div().truncate().text_size(13).line_height("18px").font_weight(600).text_color(d.fg1).child(bot.name))
      .child(div().truncate().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg3)
        .child([bot.harnessName ?? "no agent", tilde(bot.folder ?? space.folder ?? "")].filter(Boolean).join(" · "))));
    let group = null;
    items.forEach((it, i) => {
      const [g, id, icon, label, hint] = it;
      if (g !== group) {
        if (group !== null && !g) root.child(div().h(1).mx(4).my(3).flex_none().bg(d.line));
        else if (g) root.child(div().px(8).pt(group === null ? 2 : 6).pb(2).text_size(10).line_height("14px").font_family(d.mono).text_color(d.fg3).child(g.toUpperCase()));
        group = g;
      }
      const on = onTab === id;
      root.child(h_flex().id(`pm-${id}`).h(ROW).flex_none().px(8).gap(9).items_center().rounded(3).cursor_pointer()
        .when(this.cursor === i, (el) => el.bg(d.sel))
        .on_hover((h, cx) => { if (h && this.cursor !== i) { this.cursor = i; cx.notify(); } })
        .on_click(() => this.pick(it))
        .child(svg(`${ICON}/${icon}.svg`).size(13).flex_none().text_color(on ? d.fg1 : d.iconOn))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(on ? d.fg1 : d.body).when(on, (el) => el.font_weight(500)).child(label))
        .when(Boolean(hint), (el) => el.child(div().flex_none().max_w(120).truncate().text_size(11).font_family(d.mono).text_color(d.fg3).child(hint)))
        .when(on, (el) => el.child(svg(`${ICON}/ds-check.svg`).size(10).flex_none().text_color(d.fg2))));
    });
    return root;
  }
}
