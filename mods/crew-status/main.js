// Project Pals status bar: one 28 px hairline strip under the whole window. Left: how many
// channels are working (and, in Pro, how many need you) and the shown channel's usage. Right:
// in Pro, the shown channel's branch with ahead/behind; then the mode switch (Focus | Pro) with
// its shortcut, and the installed version. The switch sits in the same spot in both modes.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, theme, keys, exec, appHome, readTextFile } from "herdr";
import { leadPane, layoutMode, setMode, ds, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewStatus extends View {
  init(_props, cx) {
    this.meta = null;
    this.version = null;
    this.git = null; // { branch, ahead, behind }
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
      // Ahead/behind its upstream (Pro only, so Focus never runs git).
      this.git = null;
      if (layoutMode() === "pro" && lead?.cwd && lead.branch) {
        const r = await exec("git", ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], { cwd: lead.cwd, on: space.machine }).catch(() => null);
        const m = r?.code === 0 ? r.stdout.trim().split(/\s+/).map(Number) : null;
        this.git = { branch: lead.branch, behind: m?.[0] ?? null, ahead: m?.[1] ?? null };
      }
      cx.notify();
    });
  }

  // Drawn to the boards: Focus 24 px, Pro 26 px; #0E0E0F with a #18181A hairline on top, 12 px in,
  // 14 px between items, 1x12 #1E1E20 separators, Inter 11 px.
  render() {
    const t = tone(theme());
    const d = ds(t);
    const mode = layoutMode();
    const pro = mode === "pro";
    const all = agents();
    const working = all.filter((x) => x.status === "working").length;
    const needs = all.filter((x) => x.status === "blocked").length;
    const text = (s, color = d.fg2) => div().flex_none().text_size(11).line_height("14px").text_color(color).child(s);
    const dot = (color) => div().size(6).flex_none().rounded(3).bg(color);
    const sep = () => div().w(1).h(12).flex_none().bg(d.line);

    // Usage: the 5-hour and weekly limits of the shown channel, when its agent reports them.
    const rl = this.meta?.rate_limits ?? {};
    const pct = (x) => (x ? `${Math.round(x.used_percentage ?? 0)}%` : null);
    const usage = [rl.five_hour && `5h ${pct(rl.five_hour)}`, rl.seven_day && `week ${pct(rl.seven_day)}`].filter(Boolean).join(" · ");
    const five = Math.max(0, Math.min(100, rl.five_hour?.used_percentage ?? 0));

    // The shortcut, as keys.json binds it (nothing shown when it isn't bound).
    const bound = keys().find((k) => k.action === "crew-roster.mode");
    const hint = bound ? bound.keys.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("+") : null;

    const seg = (id, label, icon, on) => h_flex().id(id).h(16).px(7).gap(5).items_center().rounded(2).cursor_pointer()
      .when(on, (el) => el.bg(d.sel))
      .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => { if (!on) setMode(id === "mode-pro" ? "pro" : "focus"); cx.notify(); })
      .child(svg(`${ICON}/${icon}.svg`).size(10).text_color(on ? d.fg1 : d.fg2))
      .child(div().text_size(11).line_height("14px").font_weight(500).text_color(on ? d.fg1 : d.fg2).child(label));

    const g = pro ? this.git : null;
    const items = [];
    items.push(h_flex().flex_none().items_center().gap(6).child(dot(working ? d.info : d.lineStrong)).child(text(`${working} working`)));
    if (pro) items.push(sep(), h_flex().flex_none().items_center().gap(6).child(dot(needs ? d.warn : d.lineStrong)).child(text(`${needs} need${needs === 1 ? "s" : ""} you`)));
    if (usage) items.push(sep(), pro
      ? h_flex().flex_none().items_center().gap(6)
        .child(div().w(32).h(3).flex_none().bg(d.sel).child(div().h(3).w(Math.round(32 * five / 100)).bg(d.fg2)))
        .child(text(usage))
      : text(usage, d.fg3));
    items.push(div().flex_1());
    if (g) items.push(div().min_w(0).truncate().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg3)
      .child(`${g.branch}${g.ahead != null ? ` ↑${g.ahead} ↓${g.behind}` : ""}`), sep());
    items.push(h_flex().flex_none().items_center().gap(8)
      .when(Boolean(hint), (el) => el.child(div().text_size(10).line_height("12px").font_family(d.mono).text_color(d.fg4).child(hint)))
      .child(h_flex().id("mode-switch").p(1).gap(1).rounded(d.r.xs).bg(d.inset).border_1().border_color(d.line)
        .child(seg("mode-focus", "Focus", "ds-focus", !pro))
        .child(seg("mode-pro", "Pro", "ds-pro", pro))));
    if (this.version) items.push(sep(), text(`pal ${this.version}`));
    return h_flex().id("crew-status").size_full().items_center().px(12).gap(14).bg(d.bg1).border_t_1().border_color(d.lineSoft).children(items);
  }
}
