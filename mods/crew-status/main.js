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
// The Live channel and trials (T90): on the right, in the pill's place, "trying crew/x" in amber
// while a branch is tried, or a green dot and "live · b6c982c" while the Live channel follows main
// (the release pill isn't offered then: Back to stable in About is how a release comes back). Being
// always there, this is also the mod that shows and hides the trial strip (the layout's crew-live
// block) and toasts each swap, once: what went live and what had to restart, or that the last good
// build was put back.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, openOverlay, shared, setShared, settings, layout, run, notify } from "herdr";
import { ds, tone, readUpdate, updateSnoozed, crewCli, UPDATE_CHECK_EVERY, appMenuSpec, needsTooltip,
  readLive, buildName, buildLine, liveTests, swapToast } from "./crew.js";

const findNode = (n, id) => { if (n?.id === id) return n; for (const c of [...(n?.children ?? []), ...(n?.floating ?? [])]) { const f = findNode(c, id); if (f) return f; } return null; };

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
    this.live = null;
    this.liveKey = "";
    this.refresh(cx);
    cx.timer.every(5000, (cx) => this.refresh(cx));
    this.followLive(cx);
    cx.timer.every(2000, (cx) => this.followLive(cx));
  }

  // The Live channel and trials, from the updater's files, every 2 s (a few small reads). Redrawn only
  // on a change. The trial strip is shown exactly while a branch is tried; each swap toasts once (the
  // last one toasted is kept in this copy's localStorage, so a reload doesn't repeat it, and the first
  // run only notes it).
  followLive(cx) {
    cx.spawn(async (cx) => {
      const live = await readLive().catch(() => null);
      if (!live) return;
      const strip = findNode(layout(), "crew-live");
      if (strip && Boolean(strip.hidden) === Boolean(live.trying)) run(live.trying ? "layout.show" : "layout.hide", { id: "crew-live" });
      let seen = null;
      try { seen = JSON.parse(localStorage.getItem("live-seen") ?? "null"); } catch { seen = null; }
      const tests = liveTests(live);
      const now = { swap: live.last?.id ?? null, failed: tests?.state === "failed" ? live.tests.hash : null };
      if (seen && now.swap && now.swap !== seen.swap && Date.now() / 1000 - (live.last.at ?? 0) < 600) {
        const toast = swapToast(live.last);
        if (toast) notify(toast);
      }
      if (seen && now.failed && now.failed !== seen.failed) {
        notify({ title: `Tests fail on ${buildName(live.build) ?? "this build"}`, body: `${tests.detail || "The full suite didn't pass."} It's still running; Roll back in About puts the build before it back.`, level: "warning", timeout: 20000 });
      }
      if (JSON.stringify(now) !== JSON.stringify(seen)) { try { localStorage.setItem("live-seen", JSON.stringify(now)); } catch { /* shown again after a reload, at worst */ } }
      const key = JSON.stringify([live.channel, live.build?.hash, live.build?.branch, live.trying?.branch, live.hold?.hash, live.busy?.action, tests?.state]);
      if (key !== this.liveKey) { this.liveKey = key; this.live = live; cx.notify(); }
    });
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
    // What's running, when it isn't a plain release: a trial (amber), else the Live channel's commit.
    // It takes the pill's place: releases aren't offered on Live or during a trial.
    const live = this.live;
    const held = !live?.trying && live?.channel === "live" ? live.hold?.hash : null;
    const following = live?.busy?.action === "follow";
    const chip = live?.trying ? `trying ${live.trying.branch}`
      : live?.channel === "live" ? (following ? `installing ${live.follows}…` : `live · ${String(live.build?.hash ?? live.follows).slice(0, 7)}`) : "";
    const chipShort = live?.trying ? "trying" : "live";
    const pill = chip ? "" : running ? `Updating to ${u.latest ?? "…"}` : u?.available && !updateSnoozed(u.latest) ? `Update · ${u.latest}` : "";

    // What fits, most important first. With needs-you beside it the gear has a separator.
    const keep = statusFit([
      { key: "gear", w: 20 },
      needsText && { key: "needs", w: STRIP.gap + 1 + 12 + textW(needsText) },
      pill && { key: "pill", w: 30 + textW(pill) },
      pill && !running && { key: "pillShort", w: 30 + textW("Update"), alt: "pill" },
      chip && { key: "chip", w: 12 + textW(chip) },
      chip && { key: "chipShort", w: 12 + textW(chipShort), alt: "chip" },
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
    if (keep.has("chip") || keep.has("chipShort")) {
      const amber = Boolean(live.trying || held);
      items.push(h_flex().id(live.trying ? "crew-trying" : "crew-live-chip").flex_none().items_center().gap(6).cursor_pointer()
        .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-about", kind: "dialog", width: 480 }); })
        .tooltip(live.trying ? `Running ${live.trying.branch} (${String(live.trying.hash ?? "").slice(0, 7)}), not what's landed. Back on the strip at the top puts back what was there.`
          : held ? `${live.follows} ${String(held).slice(0, 7)} isn't installed: ${live.hold.why ?? "it didn't come up"}. It's tried again when ${live.follows} moves.`
          : `Live: what you land on ${live.follows} is installed as you land it${buildLine(live.build) ? ` · running ${buildLine(live.build)}` : ""}`)
        .child(following && !live.trying ? svg("mods/crew-roster/icons/spinner.svg").size(10).text_color(d.info).spin(900) : dot(amber ? d.warn : d.ok))
        .child(text(keep.has("chip") ? chip : chipShort, amber ? d.warnText : d.fg2)));
    }
    return root.children(items);
  }
}
