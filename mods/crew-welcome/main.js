// The welcome tour's dialog (T76; RECIPE "The welcome tour"). It was drawn on Home; T235 took Home
// out, so it's a 760 x 580 dialog of its own, opened by the roster on a first install (the mark is
// "new") and by the gear menu's Welcome tour (replayWelcome). The screens, words and keys are
// welcome.js and welcome-text.js. Once the tour is done or skipped it closes itself.

import { View } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme, props, closeOverlay, nextCommand } from "herdr";
import { ds, tone, welcomePending, WELCOME_SIZE } from "./crew.js";
import { welcomeView, welcomeKey } from "./welcome.js";

export default class CrewWelcome extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.focused = false;
    this.closing = false;
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "focus") this.focusSoon(cx); } });
  }

  // Herdr refuses focus() and closing during render: both go after the frame.
  focusSoon(cx) { cx.timer.after(0, () => { try { this.handle.focus(); } catch {} }); }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    if (!this.focused) { this.focused = true; this.focusSoon(cx); }
    const root = v_flex().id("crew-welcome").w(WELCOME_SIZE.width).h(WELCOME_SIZE.height).bg(d.bg0).text_color(d.fg1)
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (welcomeKey(this, e, cx)) { cx.stop_propagation(); cx.notify(); } })
      .on_mouse_down("left", () => this.handle.focus());
    if (!welcomePending()) {
      if (!this.closing) { this.closing = true; cx.timer.after(0, () => { try { closeOverlay(props()?.overlay); } catch {} }); }
      return root;
    }
    this.w = WELCOME_SIZE.width;
    return root.child(welcomeView(this, d, t, cx));
  }
}
