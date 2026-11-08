// Project Pals status bar: one 28 px hairline strip under the whole window. Left: how many
// channels are working (and, in Pro, how many need you) and the shown channel's usage. Right:
// in Pro, the shown channel's branch with ahead/behind; then the mode switch (Focus | Pro) with
// its shortcut, and the installed version. The switch sits in the same spot in both modes.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, theme, keys, exec, appHome, readTextFile } from "herdr";
import { leadPane, layoutMode, setMode, ds, tone, a } from "./crew.js";

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

  render() {
    const t = tone(theme());
    const d = ds(t);
    const mode = layoutMode();
    const all = agents();
    const working = all.filter((x) => x.status === "working").length;
    const needs = all.filter((x) => x.status === "blocked").length;
    const text = (s, color = d.fg3) => div().flex_none().text_size(11.5).text_color(color).child(s);
    const dot = (color) => div().size(6).flex_none().rounded_full().bg(color);
    const sep = () => div().w(1).h(12).flex_none().bg(d.line);

    // Usage: the 5-hour and weekly limits of the shown channel, when its agent reports them.
    const rl = this.meta?.rate_limits ?? {};
    const pct = (x) => (x ? `${Math.round(x.used_percentage ?? 0)}%` : null);
    const usage = [rl.five_hour && `5h ${pct(rl.five_hour)}`, rl.seven_day && `week ${pct(rl.seven_day)}`].filter(Boolean).join(" · ");

    // The shortcut, as keys.json binds it (nothing shown when it isn't bound).
    const bound = keys().find((k) => k.action === "crew-roster.mode");
    const hint = bound ? bound.keys.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("+") : null;

    const seg = (id, label, icon, on) => h_flex().id(id).h(20).px(7).gap(5).items_center().rounded(d.r.xs).cursor_pointer()
      .when(on, (el) => el.bg(d.sel))
      .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => { if (!on) setMode(id === "mode-pro" ? "pro" : "focus"); cx.notify(); })
      .child(svg(`${ICON}/${icon}.svg`).size(12).text_color(on ? d.fg1 : d.fg3))
      .child(div().text_size(11.5).text_color(on ? d.fg1 : d.fg2).child(label));

    const g = mode === "pro" ? this.git : null;
    return h_flex().id("crew-status").size_full().items_center().justify_between().px(12).gap(12).bg(t.chrome)
      .child(h_flex().items_center().gap(10).min_w(0)
        .child(h_flex().items_center().gap(6).child(dot(working ? t.working : a(t.foreground, "30"))).child(text(`${working} working`, working ? d.fg2 : d.fg3)))
        .when(mode === "pro", (el) => el.child(sep()).child(h_flex().items_center().gap(6)
          .child(dot(needs ? t.blocked : a(t.foreground, "30"))).child(text(`${needs} need${needs === 1 ? "s" : ""} you`, needs ? d.fg2 : d.fg3))))
        .when(Boolean(usage), (el) => el.child(sep()).child(text(usage))))
      .child(h_flex().items_center().gap(10).flex_none()
        .when(Boolean(g), (el) => el.child(h_flex().items_center().gap(6)
          .child(svg(`${ICON}/git-branch.svg`).size(12).text_color(d.fg3))
          .child(div().max_w(220).truncate().text_size(11.5).font_family(d.mono).text_color(d.fg2).child(g.branch))
          .when(g.ahead != null, (el) => el.child(text(`↑${g.ahead} ↓${g.behind}`))))
          .child(sep()))
        .when(Boolean(hint), (el) => el.child(div().text_size(11).font_family(d.mono).text_color(d.fg3).child(hint)))
        .child(h_flex().id("mode-switch").p(2).gap(2).rounded(d.r.sm).border_1().border_color(d.line)
          .child(seg("mode-focus", "Focus", "layout-focus", mode === "focus"))
          .child(seg("mode-pro", "Pro", "layout-pro", mode === "pro")))
        .when(Boolean(this.version), (el) => el.child(sep()).child(text(`pal ${this.version}`))));
  }
}
