// Project Pals prompt card: when the shown channel is blocked on a Claude Code permission prompt or
// question, a card floats over its terminal (a floating block at the bottom of `center`) and answers
// it with a click. The prompt is read with `pal prompt <t>` (bin/crewprompt.py); a click runs
// `pal prompt <t> --answer N --request ID`, which re-reads the screen and presses the key only if
// the same prompt is still there. Answering never runs inside a herdr-core terminal, so no pal or
// helper can answer its own prompts: only a click here can.
//
// A permission shows its command and every option Claude offers (Yes / Yes, don't ask again / No);
// a question its options with their descriptions, and "Type your own answer…" (picks Claude's
// "Type something." and puts the keyboard in the terminal). Anything it can't read (the trust
// question, a pick-several question) draws nothing: the terminal right there shows it.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, theme, exec, home, run } from "herdr";
import { leadPane, shownRoom, ds, tone } from "./crew.js";

const PAL = () => `${home()}/.local/bin/pal`;

export default class CrewPrompt extends View {
  init(_props, cx) {
    this.prompt = null;      // the parsed prompt (crewprompt.py), or null
    this.note = null;        // { text, error } after an answer
    cx.timer.every(1200, (cx) => this.poll(cx));
  }

  target() {
    const tab = spaces().find((s) => s.active)?.tabs.find((x) => x.active);
    return { tab, terminal: tab ? leadPane(tab.id, panes())?.terminal ?? null : null };
  }

  poll(cx) {
    const { tab, terminal } = this.target();
    if (tab?.status !== "blocked" || !terminal || shownRoom()) {
      if (this.prompt || this.note) { this.prompt = null; this.note = null; cx.notify(); }
      return;
    }
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      let p = null;
      try { const r = await exec(PAL(), ["prompt", terminal]); p = JSON.parse(r.stdout || "null"); } catch { p = null; }
      this.busy = false;
      if (p && p.terminal !== this.target().terminal) return;
      if ((p?.request ?? null) !== (this.prompt?.request ?? null)) this.note = null;
      if (JSON.stringify(p) !== JSON.stringify(this.prompt)) { this.prompt = p; cx.notify(); }
    });
  }

  answer(o, cx) {
    const p = this.prompt;
    if (!p || this.answering) return;
    this.answering = true;
    this.note = { text: "Sending…" };
    cx.notify();
    cx.spawn(async (cx) => {
      let out = null;
      try { const r = await exec(PAL(), ["prompt", p.terminal, "--answer", String(o.n), "--request", p.request]); out = JSON.parse(r.stdout || "null"); }
      catch (e) { out = { result: "failed", message: String(e?.message ?? e) }; }
      this.answering = false;
      if (out?.result === "sent") {
        this.note = { text: o.type ? "Type your answer in the terminal." : "Answer sent. Waiting for the agent." };
        if (o.type) run("pane.focus", { terminal: p.terminal });
      } else if (out?.result === "changed") { this.note = { text: out.message, error: true }; this.prompt = null; }
      else this.note = { text: out?.message || "That didn't go through. Answer it in the terminal.", error: true };
      cx.notify();
      this.poll(cx);
    });
  }

  render() {
    const p = this.prompt;
    if (!p || p.multi) return div();
    const d = ds(tone(theme()));
    const stop = (_e, cx) => cx.stop_propagation();   // presses on the card don't drag it
    const box = v_flex().id("prompt-card").w(560).gap(10).p(12);
    const head = (title, label) => h_flex().items_center().gap(8)
      .child(div().size(8).flex_none().rounded(4).bg(d.warn))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_weight(600).text_color(d.fg1).child(title))
      .child(div().flex_none().text_size(11).text_color(d.fg3).child(label));
    if (p.kind === "approval") {
      box.child(head(p.title, "Permission"));
      p.detail.forEach((x) => box.child(div().text_size(12).text_color(d.fg2).child(x)));
      if (p.command) box.child(div().id("prompt-cmd").max_h(140).overflow_y_scrollbar().px(10).py(8).rounded(d.r.sm).bg(d.inset).border_1().border_color(d.line)
        .child(div().text_size(12).line_height("18px").font_family(d.mono).text_color(d.body).child(p.command)));
      box.child(div().text_size(13).text_color(d.body).child(p.question));
      box.child(h_flex().flex_wrap().gap(6).children(p.options.map((o, i) => h_flex().id(`prompt-opt-${o.n}`).h(28).min_w(0).max_w(340).px(10).gap(6)
        .items_center().rounded(d.r.sm).cursor_pointer().bg(i === 0 ? d.act : d.ctl).hover((s) => s.opacity(0.85))
        .when(Boolean(this.answering), (el) => el.opacity(0.5))
        .on_mouse_down("left", stop).on_click((_e, cx) => this.answer(o, cx))
        .child(div().flex_none().text_size(11).font_family(d.mono).text_color(i === 0 ? d.actFg : d.fg3).child(String(o.n)))
        .child(div().min_w(0).truncate().text_size(13).font_weight(500).text_color(i === 0 ? d.actFg : /^no\b/i.test(o.label) ? d.err : d.fg1).child(o.label)))));
    } else {
      box.child(head(p.title, p.steps > 1 ? `Question · ${p.steps} parts` : "Question"));
      if (p.question) box.child(div().text_size(14).line_height("20px").text_color(d.fg1).child(p.question));
      box.child(v_flex().gap(4).children(p.options.filter((o) => !o.chat).map((o) => h_flex().id(`prompt-opt-${o.n}`).min_h(32).py(6).px(10).gap(10).items_start()
        .rounded(d.r.sm).cursor_pointer().bg(d.inset).border_1().border_color(d.line).hover((s) => s.bg(d.sel))
        .when(Boolean(this.answering), (el) => el.opacity(0.5))
        .on_mouse_down("left", stop).on_click((_e, cx) => this.answer(o, cx))
        .child(div().flex_none().pt(1).text_size(11).font_family(d.mono).text_color(d.fg3).child(String(o.n)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(13).font_weight(500).text_color(o.type ? d.fg2 : d.fg1).child(o.type ? "Type your own answer…" : o.label))
          .when(Boolean(o.detail), (el) => el.child(div().text_size(12).text_color(d.fg2).child(o.detail)))))));
    }
    if (this.note) box.child(div().text_size(12).text_color(this.note.error ? d.err : d.fg3).child(this.note.text));
    return box;
  }
}
