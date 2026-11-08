// Project Pals status bar: one 24 px hairline strip under the whole window. Left: how many
// channels are working and the shown channel's usage. Right: the installed version.

import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, theme, appHome, readTextFile } from "herdr";
import { leadPane, ds, tone } from "./crew.js";

export default class CrewStatus extends View {
  init(_props, cx) {
    this.meta = null;
    this.version = null;
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
      try { this.version = JSON.parse((await readTextFile(`${appHome()}/data/crew-install.json`)) ?? "{}")?.version ?? null; } catch { this.version = null; }
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
    items.push(h_flex().flex_none().items_center().gap(6).child(dot(working ? d.info : d.lineStrong)).child(text(`${working} working`)));
    if (usage) items.push(sep(), text(usage, d.fg3));
    items.push(div().flex_1());
    if (this.version) items.push(text(`pal ${this.version}`));
    return h_flex().id("crew-status").size_full().items_center().px(12).gap(14).bg(d.bg1).border_t_1().border_color(d.lineSoft).children(items);
  }
}
