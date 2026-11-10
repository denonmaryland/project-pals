// Project Pals status strip: the sidebar's own last 24 px (T97, DeNon 2026-11-10: the sidebar runs
// the window's full height; it was a bar under the whole window, with a hairline across the top).
// No line above it: it is the sidebar's colour with the sidebar's edge line down its right side.
// Left: the gear (the app menu: hiring, rooms, routines, themes, layouts, Herdr's settings, the
// palette, updates), how many channels are working, how many things need you (a click opens the
// Inbox) and the shown channel's usage. Right: a quiet "Update · X" pill when GitHub has a newer
// release (a click opens crew-update; checked every 6 h at most, here too for installs without
// crewd), and the installed version.
// The sidebar is narrow (304 px, 56 folded), so the strip shows what fits, most important first
// (statusFit): the gear, working, needs you, the update pill ("Update · X", else just "Update"),
// the version, then usage (both limits, else the weekly one). Whatever is left out is still in the tooltip of "N working", which
// always says the whole line. Folded to the rail it is empty (the rail has its own gear).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, agents, theme, appHome, readTextFile, openOverlay, shared, setShared, settings } from "herdr";
import { leadPane, ds, tone, readUpdate, updateSnoozed, crewCli, UPDATE_CHECK_EVERY, appMenuSpec, needsTooltip } from "./crew.js";

// How wide a piece of 11 px Inter draws, near enough to decide what fits (a little generous).
export const textW = (s) => Math.ceil(String(s).length * 5.9);
// Which parts fit `width`: `parts` is [{ key, w }] in priority order; returns the keys kept. PAD:
// the strip's own padding (6 left, 10 right); GAP between parts. A part that doesn't fit is
// skipped and smaller, later ones may still go in; `alt` names a part it stands in for.
export const STRIP = { pad: 16, gap: 10, rail: 100 };
export function statusFit(parts, width) {
  const keep = new Set(); let used = STRIP.pad;
  for (const p of parts) {
    if (p.alt && keep.has(p.alt)) continue;
    const add = p.w + (keep.size ? STRIP.gap : 0);
    if (used + add <= width) { keep.add(p.key); used += add; }
  }
  return keep;
}

export default class CrewStatus extends View {
  init(_props, cx) {
    this.w = 304;
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

  // 24 px, the sidebar's #0E0E0F and its #1E1E20 edge on the right, no line on top; 6 px in, 10 px
  // between parts, 1x12 #1E1E20 separators beside the gear, Inter 11 px.
  render() {
    const t = tone(theme());
    const d = ds(t);
    const root = h_flex().id("crew-status").size_full().items_center().pl(6).pr(10).gap(STRIP.gap).bg(d.bg1).border_r_1().border_color(d.line)
      .on_size_change((size, cx) => { const w = size.width / (Number(settings().zoom) || 1); if (Math.abs(w - this.w) > 1) { this.w = w; cx.notify(); } });
    if (this.w < STRIP.rail) return root;
    const working = agents().filter((x) => x.status === "working").length;
    const text = (s, color = d.fg2) => div().flex_none().text_size(11).line_height("14px").text_color(color).child(s);
    const dot = (color) => div().size(6).flex_none().rounded(3).bg(color);
    const sep = () => div().w(1).h(12).flex_none().bg(d.line);

    // Usage: the 5-hour and weekly limits of the shown channel, when its agent reports them.
    const rl = this.meta?.rate_limits ?? {};
    const pct = (x) => (x ? `${Math.round(x.used_percentage ?? 0)}%` : null);
    const week = rl.seven_day ? `week ${pct(rl.seven_day)}` : "";
    const usage = [rl.five_hour && `5h ${pct(rl.five_hour)}`, week].filter(Boolean).join(" · ");
    // What needs DeNon (the roster's count: questions for them, approvals waiting, stuck channels,
    // proposals; a pal asking another pal isn't counted). The tooltip says why each one counts.
    // Amber; red while an approval waits. A click opens the Inbox. Hidden at zero.
    const needs = shared("crew.needs");
    const needsText = needs?.count > 0 ? `${needs.count} need${needs.count === 1 ? "s" : ""} you` : "";
    // The update pill: quiet (no colour but a small blue dot), gone for 3 days after "Later".
    const u = this.update;
    const running = u?.run?.state === "running";
    const pill = running ? `Updating to ${u.latest ?? "…"}` : u?.available && !updateSnoozed(u.latest) ? `Update · ${u.latest}` : "";
    const version = this.version ? `pal ${this.version}` : "";
    const workText = `${working} working`;

    // What fits, most important first. The gear's width includes its separator and gap.
    const keep = statusFit([
      { key: "gear", w: 20 + STRIP.gap + 1 },
      { key: "work", w: 12 + textW(workText) },
      needsText && { key: "needs", w: 12 + textW(needsText) },
      pill && { key: "pill", w: 30 + textW(pill) },
      pill && !running && { key: "pillShort", w: 30 + textW("Update"), alt: "pill" },
      version && { key: "version", w: textW(version) },
      usage && { key: "usage", w: textW(usage) },
      week && week !== usage && { key: "week", w: textW(week), alt: "usage" },
    ].filter(Boolean), this.w);
    // The whole line, whatever fits: on "N working".
    const whole = [workText, needsText, usage, pill && (running ? pill : `Project Pals ${u.latest} is out`), version].filter(Boolean).join(" · ");

    const items = [];
    // The gear: a quiet 20 px button, its icon #808082, brighter on hover.
    items.push(div().id("crew-gear").size(20).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
      .tooltip("Menu: settings, themes, layouts, hire, routines")
      .hover((s) => s.bg(d.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-appmenu", kind: "popup", ...appMenuSpec() }); })
      .child(svg("mods/crew-roster/icons/settings.svg").size(12).text_color(d.fg2)), sep());
    if (keep.has("work")) items.push(h_flex().id("crew-working").flex_none().items_center().gap(6).tooltip(whole).child(dot(working ? d.info : d.lineStrong)).child(text(workText)));
    if (keep.has("needs")) {
      const urgent = needs.approvals > 0;
      items.push(h_flex().id("crew-needs").flex_none().items_center().gap(6).cursor_pointer()
        .tooltip(needsTooltip(needs))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); setShared("crew.view", "you"); })
        .child(dot(urgent ? d.err : d.warn)).child(text(needsText, urgent ? d.err : d.warnText)));
    }
    if (keep.has("usage") || keep.has("week")) items.push(text(keep.has("usage") ? usage : week, d.fg3));
    items.push(div().flex_1().min_w(0));
    if (keep.has("pill") || keep.has("pillShort")) {
      items.push(h_flex().id("crew-update").h(18).flex_none().items_center().gap(6).px(8).rounded(d.r.sm).cursor_pointer()
        .bg(d.raised).border_1().border_color(d.line).hover((s) => s.border_color(d.lineMid).bg(d.hover))
        .tooltip(running ? "Updating Project Pals" : `Project Pals ${u.latest} is out (you have ${u.current})`)
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-update", kind: "dialog", width: 480 }); })
        .child(running ? svg("mods/crew-roster/icons/spinner.svg").size(10).text_color(d.info).spin(900) : dot(d.info))
        .child(text(keep.has("pill") ? pill : "Update", d.fg2)));
    }
    if (keep.has("version")) items.push(text(version));
    return root.children(items);
  }
}
