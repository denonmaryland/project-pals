// The trial strip (T90): a 32 px amber strip across the top of the window while a topic's branch is
// being tried in the live install ("Try it live" on Review). It says which branch and commit are
// running and how the full tests went, with Back (put back what was there) and Land on main (the
// commit that was tried, not whatever the branch holds by then). DeNon
// picked the strip over a status-bar chip (Home h-0a897a, 2026-11-09): a trial runs unlanded code in
// the real app, so it should be impossible to forget.
// It's the layout's "crew-live" block, hidden until a trial starts: the status bar (always shown)
// shows and hides it from data/crew-live.json. Back and Land are the owner's click (a one-time
// token); the work itself is `pal update back` and `pal land` (bin/crewupdate.py, bin/crew).

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, notify } from "herdr";
import { tone, ds, readLive, liveTests, liveStart, ownerCli, checkedAt } from "./crew.js";

export default class CrewLive extends View {
  init(_props, cx) {
    this.live = null;
    this.key = "";
    this.acting = null;   // "back" | "land", from the click until the files say it's done
    this.refresh(cx);
    cx.timer.every(2000, (cx) => this.refresh(cx));
  }

  // Redrawn only when something changed: a redraw of any mod redraws the window.
  refresh(cx) {
    cx.spawn(async (cx) => {
      const live = await readLive().catch(() => null);
      const key = JSON.stringify([live?.trying, live?.tests, live?.busy, live?.build?.hash]);
      if (this.acting && (!live?.trying || Date.now() - this.actedAt > 90000)) this.acting = null;
      if (key === this.key && !this.dirty) return;
      this.key = key; this.live = live; this.dirty = false;
      cx.notify();
    });
  }

  back(cx) {
    if (this.acting) return;
    this.acting = "back"; this.actedAt = Date.now(); this.dirty = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try { await liveStart("back"); }
      catch (e) { this.acting = null; notify({ title: "Couldn't go back", body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 10000 }); }
      this.dirty = true;
      cx.notify();
    });
  }

  land(cx) {
    const t = this.live?.trying;
    if (this.acting || !t?.spec) return;
    this.acting = "land"; this.actedAt = Date.now(); this.dirty = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        // --at: only the commit that was tried lands on this click; a branch that moved since is refused.
        const out = await ownerCli(["land", t.spec, "--at", String(t.hash)]);
        notify({ title: `Landed ${t.branch}`, body: `${out.trim().split("\n").pop().slice(0, 160)}. It goes live in a moment.`, level: "success", timeout: 5000 });
      } catch (e) {
        this.acting = null;
        notify({ title: "Not landed", body: String(e.message ?? e).slice(0, 320), level: "warning", timeout: 12000 });
      }
      this.dirty = true;
      cx.notify();
    });
  }

  render() {
    const d = ds(tone(theme()));
    const t = this.live?.trying;
    const root = h_flex().id("crew-live").size_full().items_center();
    if (!t) return root.bg(d.bg0);
    const tests = liveTests(this.live);
    const failed = tests?.state === "failed";
    const into = t.into || "main";
    const busy = this.live?.busy;
    // Amber while it's a trial; red once its tests fail (Land is held then).
    const ink = failed ? d.err : d.warnText, edge = failed ? `${d.err}66` : `${d.warn}47`, wash = failed ? `${d.err}14` : `${d.warn}14`;
    const text = (s, color, mono = false) => div().flex_none().text_size(mono ? 11.5 : 12).line_height("16px").text_color(color)
      .when(mono, (el) => el.font_family(d.mono)).child(s);
    const button = (id, label, { primary = false, off = false, tip = null, go }) => div().id(id).h(22).px(10).flex().flex_none().items_center().rounded(d.r.sm)
      .bg(off ? d.raised : primary ? d.fg1 : d.raised).border_1().border_color(off ? d.line : primary ? d.fg1 : d.lineMid)
      .when(!off, (el) => el.cursor_pointer().hover((s) => s.opacity(0.86)))
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { if (!off) go(cx); })
      .child(div().text_size(11.5).line_height("14px").font_weight(600).text_color(off ? d.fg4 : primary ? d.bg0 : d.fg1).child(label));

    const doing = this.acting === "back" || busy?.action === "back" ? "Putting back what was running…"
      : this.acting === "land" ? "Landing…" : busy?.action === "try" ? "Installing the branch…" : null;
    const state = doing
      ? h_flex().items_center().gap(6).child(svg("mods/crew-roster/icons/spinner.svg").size(10).flex_none().text_color(ink).spin(900)).child(text(doing, d.fg2))
      : div().min_w(0).truncate().text_size(12).line_height("16px").text_color(failed ? d.err : d.fg2)
          .child(`${tests ? `· ${tests.label}${failed && tests.detail ? `: ${tests.detail}` : ""} ` : ""}· since ${checkedAt(t.since ?? 0)}`);
    return root.relative().gap(10).pl(14).pr(8).bg(d.bg0).border_b_1().border_color(edge)
      .child(div().absolute().inset_0().bg(wash))
      .child(div().size(7).flex_none().rounded(2).bg(failed ? d.err : d.warn))
      .child(text("Trying", ink).font_weight(600))
      .child(text(t.branch ?? "a branch", d.fg1, true))
      .child(text(String(t.hash ?? "").slice(0, 7), d.fg2, true))
      .child(div().flex_1().min_w(0).overflow_hidden().child(state))
      .child(button("live-back", "Back", { off: Boolean(this.acting), tip: "Put back what was running before the trial", go: (cx) => this.back(cx) }))
      .child(button("live-land", `Land on ${into}`, { primary: true, off: Boolean(this.acting) || failed || !t.spec,
        tip: failed ? "Held: the tests fail on this branch" : `Merge ${t.branch} (${String(t.hash ?? "").slice(0, 7)}, what you're looking at) into ${into}`, go: (cx) => this.land(cx) }));
  }
}
