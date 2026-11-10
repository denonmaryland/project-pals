// A pal's Computer: its desktop (crew-boards/pal-computer/design.md, DeNon's pick B · Desktop; T81).
// The center stack's pc-view, shown by showComputer (the profile, the pal menu, the command bar,
// Ctrl+Shift+Y). The wallpaper is the pal's pet, large and live; the clock; the Today widget (each
// topic now, next up, the desk, the mission's focus) so the desktop opens on the work; desktop icons
// and a dock that open the apps as real Herdr windows (crew-computer-app). Keys: 1–6 open an app,
// t the Today widget's first topic, Esc back to the topic.
// Data comes from `pal computer <pal> today --json`, read only while shown (every 4 s), like Home.
// The keyboard: shown → this view takes it; a window closed → crew.pc.focus says who's next, and
// "<pal>|desktop" means here (the T81 spike: Herdr hands a closed window's keyboard to no one).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, spaces, shared, nextCommand, layout } from "herdr";
import {
  ds, botOf, petOf, petEl, petState, mood, crewCli, openTerminal, findNode, computerMode, pcPal, PC_APPS,
  openComputerApp, pcKey, closeComputerWindows, dayDate,
} from "./crew.js";

const ICONS = "mods/crew-computer";
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const two = (n) => String(n).padStart(2, "0");
const STATE = { working: "working", blocked: "needs you", done: "done", idle: "idle", asleep: "asleep", shell: "shell" };

export default class CrewComputer extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.data = null;
    this.err = null;
    this.size = { width: 1100, height: 760 };
    this.origin = null;          // the view's top left in the window, from the pointer (bounds)
    this.loading = false;
    this.shownAt = null;
    cx.timer.every(4000, (cx) => { if (computerMode()) this.reload(cx); });
    cx.timer.every(30000, (cx) => { if (computerMode()) cx.notify(); });   // the clock
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.handle.focus();
        else if (/^open-\w+$/.test(c)) this.open(c.slice(5));
        cx.notify();
      }
    });
  }

  pal() { return pcPal(); }
  space() { const p = this.pal(); return spaces().find((s) => s.name === p) ?? null; }

  reload(cx) {
    const pal = this.pal();
    if (!pal || this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try { this.data = JSON.parse(await crewCli(["computer", pal, "today", "--json"])); this.err = null; }
      catch (e) { this.err = String(e?.message ?? e); }
      this.loading = false;
      cx.notify();
    });
  }

  // Where the windows go: this view's rectangle in the window (logical px). Until the pointer has
  // been over it, a guess from the layout (the sidebar's width, the header's height).
  area() {
    const w = this.size.width, h = this.size.height;
    // Right of the icon column (104 px) and above the dock (74 px), so a window never covers either.
    const ICON_COL = 104;
    if (this.origin) return { x: this.origin.x + ICON_COL, y: this.origin.y, w: w - ICON_COL, h: h - 74 };
    const px = (id, dflt) => { const n = findNode(layout(), id); return n?.hidden ? 0 : (n?.size?.px ?? dflt); };
    return { x: px("sidebar", 300) + ICON_COL, y: px("crew-header", 46), w: w - ICON_COL, h: h - 74 };
  }

  open(app, opts = {}) {
    const pal = this.pal();
    if (!pal || !PC_APPS.some((a) => a.id === app)) return;
    openComputerApp(pal, app, this.area(), opts);
  }

  key(e, cx) {
    const k = e.keystroke;
    if (k === "escape") { openTerminal(this.space()); return; }
    if (/^[1-6]$/.test(k)) { this.open(PC_APPS[Number(k) - 1].id); return; }
    if (k === "t") { const t = this.data?.topics?.[0]; const s = this.space(); if (s && t) openTerminal(s, s.tabs.find((x) => x.name.replace(/^#/, "") === t.topic)); }
  }

  render(cx) {
    const t = theme(), d = ds(t);
    const shown = computerMode();
    const stamp = shared("crew.pc")?.shown ?? 0;
    // A new showing: read now, take the keyboard (in a task: Herdr refuses focus() during render).
    if (shown && stamp !== this.shownAt) {
      this.shownAt = stamp; this.data = null; this.reload(cx);
      cx.timer.after(0, () => { try { this.handle.focus(); } catch {} });
    }
    // The keyboard handed back here by a closing window.
    const want = shared("crew.pc.focus");
    if (shown && want === pcKey(this.pal(), "desktop") && this.wantSeen !== want + stamp) {
      this.wantSeen = want + stamp;
      cx.timer.after(0, () => { try { this.handle.focus(); } catch {} });
    }
    const space = this.space();
    const root = div().id("crew-computer").relative().size_full().overflow_hidden().bg(d.bg0).text_color(d.fg1)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down("left", () => this.handle.focus())
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_mouse_move((e) => { if (e.bounds) this.origin = { x: Math.round(e.bounds.x), y: Math.round(e.bounds.y) }; });
    if (!space) {
      return root.child(v_flex().size_full().items_center().justify_center().gap(8).text_color(d.fg2).text_size(13)
        .child(div().child(this.pal() ? `${this.pal()} isn't here any more.` : "No pal chosen."))
        .child(div().id("pc-back").cursor_pointer().text_color(d.info).child("Back to the topic").on_click(() => openTerminal())));
    }
    const bot = botOf(space);
    const pet = petOf(bot);
    const st = petState(bot, mood(space.status, bot?.awake !== false));
    const W = this.size.width, H = this.size.height;
    // Wide: the pet left of centre, Today on the right. Narrow (under 900 px): Today across the top,
    // the pet smaller under it.
    const wide = W >= 900;
    const petW = wide ? Math.max(220, Math.min(420, Math.round(W * 0.34))) : Math.max(160, Math.min(300, Math.round(W * 0.5)));
    const petX = wide ? Math.round(W * 0.37 - petW / 2) : Math.round(104 + (W - 104) / 2 - petW / 2);
    const petY = wide ? Math.round(H * 0.46 - petW * 0.4) : Math.round(H * 0.62 - petW * 0.4);
    const glow = Math.round(Math.min(wide ? W * 0.5 : W * 0.7, H * 0.62));
    const now = new Date();
    const wins = shared("crew.pc.wins") ?? {};
    const isOpen = (app) => Boolean(wins[pcKey(space.name, app)]);

    // The wallpaper: a soft glow under the pet, in the theme's colours.
    root.child(div().absolute().inset_0().bg(d.bg0))
      .child(div().absolute().left(Math.round(petX + petW / 2 - glow / 2)).top(Math.round(petY + petW * 0.4 - glow / 2)).size(glow).rounded(9999)
        .bg(lumBg(d)).opacity(0.55));
    // The pet, live.
    root.child(div().absolute().left(petX).top(petY)
      .child(petEl(pet, st, petW, undefined, { open: true })));
    // The clock and whose computer this is.
    root.child(v_flex().absolute().left(112).top(22).gap(2)
      .child(div().text_size(30).font_weight(500).child(`${two(now.getHours())}:${two(now.getMinutes())}`))
      .child(div().text_size(12).font_family(d.mono).text_color(d.fg2)
        .child(`${space.name}'s computer · ${dayDate(now)}`)));
    // Desktop icons, left.
    root.child(v_flex().absolute().left(18).top(18).gap(12)
      .children(PC_APPS.map((a, i) => v_flex().id(`pc-ico-${a.id}`).w(74).items_center().gap(5).cursor_pointer().rounded(d.r.md).py(4)
        .hover((s) => s.bg(d.hover))
        .on_click((_e, cx) => { this.open(a.id); cx.notify(); })
        .tooltip(`${a.label} (${i + 1})`)
        .child(div().size(44).rounded(11).bg(a.tile).border_1().border_color("#FFFFFF22").flex().items_center().justify_center()
          .child(svg(`${ICONS}/${a.icon}.svg`).size(20).text_color("#FFFFFF")))
        .child(div().text_size(11).text_color(d.body).child(a.label)))));
    // The Today widget, right.
    root.child(this.today(d, space, W, wide));
    // The dock, bottom centre: a dot under open apps, the desk's count on Desk.
    const deskN = this.data?.desk?.open ?? 0;
    root.child(h_flex().absolute().bottom(14).left(0).right(0).justify_center()
      .child(h_flex().gap(8).px(10).py(8).rounded(14).bg(d.raised).border_1().border_color(d.lineStrong)
        .children(PC_APPS.map((a) => v_flex().id(`pc-dock-${a.id}`).items_center().gap(3).cursor_pointer()
          .on_click((_e, cx) => { this.open(a.id); cx.notify(); })
          .tooltip(a.label)
          .child(div().relative().size(42).rounded(10).bg(a.tile).flex().items_center().justify_center()
            .hover((s) => s.opacity(0.85))
            .child(svg(`${ICONS}/${a.icon}.svg`).size(19).text_color("#FFFFFF"))
            .when(a.id === "desk" && deskN > 0, (el) => el.child(div().absolute().top(-4).right(-4).px(4).h(13).rounded(6).bg(d.warn)
              .text_size(9.5).font_family(d.mono).text_color(d.bg0).flex().items_center().child(String(deskN)))))
          .child(div().size(4).rounded(2).bg(isOpen(a.id) ? d.fg1 : "#00000000"))))));
    return root;
  }

  today(d, space, W, wide = true) {
    const w = wide ? Math.max(320, Math.min(420, Math.round(W * 0.34))) : Math.max(240, W - 104 - 24);
    const box = v_flex().absolute().right(wide ? 28 : 16).top(wide ? 70 : 92).w(w).p(14).gap(2).rounded(d.r.lg).bg(d.bg1).border_1().border_color(d.lineMid);
    const head = (l, r) => h_flex().justify_between().pb(6).text_size(10.5).font_family(d.mono).text_color(d.fg3)
      .child(div().child(l.toUpperCase())).child(div().child(r.toUpperCase()));
    const x = this.data;
    if (!x) return box.child(head("Today", "")).child(div().py(8).text_size(12).text_color(d.fg2).child(this.err ? `Couldn't read it: ${clip(this.err, 80)}` : "Reading…"));
    const working = x.topics.filter((t) => t.state === "working").length;
    box.child(head("Today", `working in ${working} of ${x.topics.length} topics`));
    for (const tp of x.topics.slice(0, 6)) {
      const color = { working: d.info, blocked: d.warn, done: d.ok }[tp.state] ?? d.fg4;
      const tab = space.tabs.find((y) => y.name.replace(/^#/, "") === tp.topic);
      box.child(h_flex().id(`pc-tp-${tp.topic}`).items_start().gap(8).py(6).border_b_1().border_color(d.line).cursor_pointer()
        .hover((s) => s.bg(d.hover))
        .on_click(() => openTerminal(space, tab))
        .child(div().mt(5).size(7).rounded(4).bg(color).flex_none())
        .child(div().w(96).flex_none().text_size(12).font_family(d.mono).text_color(d.fg1).child(`#${clip(tp.topic, 12)}`))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_size(12.5).text_color(d.body).truncate().child(tp.task ? `${tp.task.id} ${tp.task.title}` : (tp.state === "asleep" ? "asleep" : "no task")))
          .child(div().text_size(11).text_color(d.fg3).child(STATE[tp.state] ?? tp.state))));
    }
    if (x.next.length || x.desk.open) {
      box.child(div().h(8)).child(head("Next", `desk ${x.desk.open}${x.desk.needs_you ? ` · ${x.desk.needs_you} need you` : ""}`));
      for (const r of x.next) box.child(h_flex().justify_between().gap(8).py(3).text_size(12.5).text_color(d.body)
        .child(div().truncate().child(`${r.id} ${r.title}`))
        .child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(r.due_label.startsWith("overdue") ? d.err : d.warnText).child(r.due_label.replace(/^due /, ""))));
    }
    if (x.focus) box.child(div().mt(8).pt(8).border_t_1().border_color(d.line).text_size(12).text_color(d.claude).child(`Focus: ${clip(x.focus, 120)}`));
    return box;
  }
}

// A faint glow colour under the pet, from the theme (dark: a deep blue; light: a pale one).
function lumBg(d) { return d.bg0 === "#FFFFFF" ? "#E6EEF8" : "#14263A"; }

export { closeComputerWindows };
