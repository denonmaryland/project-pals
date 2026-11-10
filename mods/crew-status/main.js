// Project Pals status strip: the sidebar's own last 24 px (T97, DeNon 2026-11-10: the sidebar runs
// the window's full height; it was a bar under the whole window, with a hairline across the top).
// No line above it: it is the sidebar's colour with the sidebar's edge line down its right side.
// It holds the gear (the app menu: hiring, rooms, routines, themes, layouts, Herdr's settings, the
// palette, updates, and Project Pals settings, where the version is) and two things that show only
// when they apply: "N need you" (a click opens the Inbox), and on the right a quiet "Update · X"
// pill when GitHub has a newer release (a click opens crew-update; checked every 6 h at most, here
// too for installs without crewd). "N working", the usage limits and "pal 0.x.y" went (T98, DeNon
// 2026-11-10): the row is just the gear when all is calm.
// The sidebar is narrow (304 px, 56 folded), so the strip shows what fits, most important first
// (statusFit): the gear, needs you, the update pill ("Update · X", else just "Update"). If the pill
// doesn't fit, the gear's tooltip says an update is out. Folded to the rail it is empty (the rail
// has its own gear).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, openOverlay, shared, setShared, settings } from "herdr";
import { ds, tone, readUpdate, updateSnoozed, crewCli, UPDATE_CHECK_EVERY, appMenuSpec, needsTooltip } from "./crew.js";

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
    this.update = null;
    this.lastCheck = 0;
    this.refresh(cx);
    cx.timer.every(5000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      this.update = await readUpdate().catch(() => null);
      // Ask GitHub when the last check is over 6 h old (crewd does too; at most once an hour from here).
      if (this.update?.current && Date.now() / 1000 - (this.update.checked ?? 0) > UPDATE_CHECK_EVERY && Date.now() - this.lastCheck > 3600 * 1000) {
        this.lastCheck = Date.now();
        crewCli(["update", "check", "--json"]).catch(() => {});
      }
      cx.notify();   // also keeps "N need you" current
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
    const text = (s, color = d.fg2) => div().flex_none().text_size(11).line_height("14px").text_color(color).child(s);
    const dot = (color) => div().size(6).flex_none().rounded(3).bg(color);
    const sep = () => div().w(1).h(12).flex_none().bg(d.line);

    // What needs DeNon (the roster's count: questions for them, approvals waiting, stuck channels,
    // proposals; a pal asking another pal isn't counted). The tooltip says why each one counts.
    // Amber; red while an approval waits. A click opens the Inbox. Hidden at zero.
    const needs = shared("crew.needs");
    const needsText = needs?.count > 0 ? `${needs.count} need${needs.count === 1 ? "s" : ""} you` : "";
    // The update pill: quiet (no colour but a small blue dot), gone for 3 days after "Later".
    const u = this.update;
    const running = u?.run?.state === "running";
    const pill = running ? `Updating to ${u.latest ?? "…"}` : u?.available && !updateSnoozed(u.latest) ? `Update · ${u.latest}` : "";

    // What fits, most important first. With needs-you beside it the gear has a separator.
    const keep = statusFit([
      { key: "gear", w: 20 },
      needsText && { key: "needs", w: STRIP.gap + 1 + 12 + textW(needsText) },
      pill && { key: "pill", w: 30 + textW(pill) },
      pill && !running && { key: "pillShort", w: 30 + textW("Update"), alt: "pill" },
    ].filter(Boolean), this.w);
    const pillShown = keep.has("pill") || keep.has("pillShort");

    const items = [];
    // The gear: a quiet 20 px button, its icon #808082, brighter on hover.
    items.push(div().id("crew-gear").size(20).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
      .tooltip(pill && !pillShown ? `Menu: settings, themes, layouts, hire, routines · ${running ? pill : `Project Pals ${u.latest} is out`}` : "Menu: settings, themes, layouts, hire, routines")
      .hover((s) => s.bg(d.hover))
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-appmenu", kind: "popup", ...appMenuSpec() }); })
      .child(svg("mods/crew-roster/icons/settings.svg").size(12).text_color(d.fg2)));
    if (keep.has("needs")) {
      const urgent = needs.approvals > 0;
      items.push(sep(), h_flex().id("crew-needs").flex_none().items_center().gap(6).cursor_pointer()
        .tooltip(needsTooltip(needs))
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); setShared("crew.view", "you"); })
        .child(dot(urgent ? d.err : d.warn)).child(text(needsText, urgent ? d.err : d.warnText)));
    }
    items.push(div().flex_1().min_w(0));
    if (pillShown) {
      items.push(h_flex().id("crew-update").h(18).flex_none().items_center().gap(6).px(8).rounded(d.r.sm).cursor_pointer()
        .bg(d.raised).border_1().border_color(d.line).hover((s) => s.border_color(d.lineMid).bg(d.hover))
        .tooltip(running ? "Updating Project Pals" : `Project Pals ${u.latest} is out (you have ${u.current})`)
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-update", kind: "dialog", width: 480 }); })
        .child(running ? svg("mods/crew-roster/icons/spinner.svg").size(10).text_color(d.info).spin(900) : dot(d.info))
        .child(text(keep.has("pill") ? pill : "Update", d.fg2)));
    }
    return root.children(items);
  }
}
