// Project Pals status bar: one 24 px hairline strip under the whole window. Left: the gear (the app
// menu: hiring, rooms, routines, themes, layouts, Herdr's settings, the palette, updates), how many
// channels are working, how many things need you (a click opens the Inbox) and the shown channel's usage. Right: a quiet
// "Update available · X" pill when GitHub has a newer release (a click opens crew-update; checked every 6 h at most,
// here too for installs without crewd), and the installed version.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, theme, appHome, readTextFile, openOverlay, shared, setShared } from "herdr";
import { leadPane, ds, tone, readUpdate, updateSnoozed, crewCli, UPDATE_CHECK_EVERY, APP_MENU, needsTooltip } from "./crew.js";

export default class CrewStatus extends View {
  init(_props, cx) {
    this.meta = null;
    this.version = null;
    this.update = null;
    this.lastCheck = 0;
    this.refresh(cx);
    cx.timer.every(5000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      const space = spaces().find((s) => s.active);
      const tab = space?.tabs.find((x) => x.active);
      const lead = tab ? leadPane(tab.id, panes()) : null;
      // The shown channel's Claude Code usage, saved by crew-statusline.
      try { this.meta = lead?.terminal ? JSON.parse((await readTextFile(`${appHome()}/data/crew-status/${lead.terminal}.json`)) ?? "null") : null; } catch { this.meta = null; }
      this.update = await readUpdate().catch(() => null);
      this.version = this.update?.current ?? null;
      // Ask GitHub when the last check is over 6 h old (crewd does too; at most once an hour from here).
      if (this.update?.current && Date.now() / 1000 - (this.update.checked ?? 0) > UPDATE_CHECK_EVERY && Date.now() - this.lastCheck > 3600 * 1000) {
        this.lastCheck = Date.now();
        crewCli(["update", "check", "--json"]).catch(() => {});
      }
      cx.notify();
    });
  }

  // Drawn to the board: 24 px, #0E0E0F with a #18181A hairline on top, 12 px in, 14 px between
  // items, 1x12 #1E1E20 separators, Inter 11 px.
  render() {
    const t = tone(theme());
    const d = ds(t);
    const working = agents().filter((x) => x.status === "working").length;
    const text = (s, color = d.fg2) => div().flex_none().text_size(11).line_height("14px").text_color(color).child(s);
    const dot = (color) => div().size(6).flex_none().rounded(3).bg(color);
    const sep = () => div().w(1).h(12).flex_none().bg(d.line);

    // Usage: the 5-hour and weekly limits of the shown channel, when its agent reports them.
    const rl = this.meta?.rate_limits ?? {};
    const pct = (x) => (x ? `${Math.round(x.used_percentage ?? 0)}%` : null);
    const usage = [rl.five_hour && `5h ${pct(rl.five_hour)}`, rl.seven_day && `week ${pct(rl.seven_day)}`].filter(Boolean).join(" · ");

    const items = [];
    // The gear: a quiet 20 px button, its icon #808082, brighter on hover.
    items.push(div().id("crew-gear").size(20).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
      .tooltip("Menu: settings, themes, layouts, hire, routines")
      .hover((s) => s.bg(d.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-appmenu", kind: "popup", ...APP_MENU }); })
      .child(svg("mods/crew-roster/icons/settings.svg").size(12).text_color(d.fg2)), sep());
    items.push(h_flex().flex_none().items_center().gap(6).child(dot(working ? d.info : d.lineStrong)).child(text(`${working} working`)));
    // What needs DeNon (the roster's count: questions for them, approvals waiting, stuck channels,
    // proposals; a pal asking another pal isn't counted). The tooltip says why each one counts.
    // Amber; red while an approval waits. A click opens the Inbox. Hidden at zero.
    const needs = shared("crew.needs");
    if (needs?.count > 0) {
      const urgent = needs.approvals > 0;
      items.push(sep(), h_flex().id("crew-needs").flex_none().items_center().gap(6).cursor_pointer()
        .tooltip(needsTooltip(needs))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); setShared("crew.view", "you"); })
        .child(dot(urgent ? d.err : d.warn)).child(text(`${needs.count} need${needs.count === 1 ? "s" : ""} you`, urgent ? d.err : d.warnText)));
    }
    if (usage) items.push(sep(), text(usage, d.fg3));
    items.push(div().flex_1());
    // The update pill: quiet (no colour but a small blue dot), gone for 3 days after "Later".
    const u = this.update;
    const running = u?.run?.state === "running";
    if (running || (u?.available && !updateSnoozed(u.latest))) {
      items.push(h_flex().id("crew-update").h(18).flex_none().items_center().gap(6).px(8).rounded(d.r.sm).cursor_pointer()
        .bg(d.raised).border_1().border_color(d.line).hover((s) => s.border_color(d.lineMid).bg(d.hover))
        .tooltip(running ? "Updating Project Pals" : `Project Pals ${u.latest} is out (you have ${u.current})`)
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-update", kind: "dialog", width: 480 }); })
        .child(running ? svg("mods/crew-roster/icons/spinner.svg").size(10).text_color(d.info).spin(900) : dot(d.info))
        .child(text(running ? `Updating to ${u.latest ?? "…"}` : `Update available · ${u.latest}`, d.fg2)), sep());
    }
    if (this.version) items.push(text(`pal ${this.version}`));
    return h_flex().id("crew-status").size_full().items_center().pl(6).pr(12).gap(12).bg(d.bg1).border_t_1().border_color(d.lineSoft).children(items);
  }
}
