// A pal's tasks (the hero's Tasks button; DeNon, 2026-11-08: "a Tell is really a task"). An "Add a
// task for <pal>…" field on top: Enter puts a real task on the shared board, assigned to that pal
// (`pal task add "…" --for <pal>`, marked from the owner), and the pal is told when its turn ends, so
// it picks it up next. Below, that pal's open tasks: tick one to finish it, click its title to see
// its details, notes and who asked. Quick questions you want answered now go in the terminal.
// props: { space }.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces, setShared } from "herdr";
import { botOf, crewCli, loadOps, taskFor, ago, ds, tone, sheet, sheetHeader, sheetFace, sheetBody, sheetField, sheetFooter } from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewTasks extends View {
  init(_props, cx) {
    this.input = InputState.new({ placeholder: `Add a task for ${this.pal()?.bot.name ?? "this pal"}…` });
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (_e, cx) => this.add(cx));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
    this.tasks = [];
    this.open = null;     // the task whose details are shown
    this.busy = false;
    this.reload(cx);
    cx.timer.every(4000, (cx) => this.reload(cx));
  }

  pal() {
    const space = spaces().find((x) => x.id === props()?.space);
    return space ? { space, bot: botOf(space) } : null;
  }

  reload(cx) {
    cx.spawn(async (cx) => {
      try { this.tasks = (await loadOps()).tasks ?? []; } catch { this.tasks = []; }
      cx.notify();
    });
  }

  add(cx) {
    const p = this.pal();
    const title = this.input.value().trim();
    if (!p || !title || this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await crewCli(["task", "add", title, "--for", p.space.name]);
        this.input.set_value("");
        notify({ title: `Task added for ${p.bot.name}`, body: "It's on the board; it picks it up when its turn ends.", level: "success", timeout: 2500 });
      } catch (e) {
        notify({ title: "Couldn't add the task", body: String(e.message ?? e).slice(0, 200), level: "warning" });
      }
      this.busy = false;
      this.reload(cx);
    });
  }

  finish(t, cx) {
    cx.spawn(async (cx) => {
      try { await crewCli(["task", "done", t.id]); }
      catch (e) { notify({ title: "Couldn't finish it", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      this.reload(cx);
    });
  }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const p = this.pal();
    const close = () => closeOverlay(props()?.overlay);
    if (!p) return div().p(24).bg(d.bg1).text_color(d.fg2).child("That pal is gone.");
    const { space, bot } = p;
    const mine = this.tasks.filter((x) => ["open", "claimed", "blocked"].includes(x.status) && taskFor(x, space.name))
      .sort((x, y) => (x.status === "claimed" ? 0 : x.status === "blocked" ? 1 : 2) - (y.status === "claimed" ? 0 : y.status === "blocked" ? 1 : 2) || x.created - y.created);
    const empty = !this.input.value().trim();

    const row = (x) => {
      const on = this.open === x.id;
      const tag = x.status === "claimed" ? ["working", d.infoText] : x.status === "blocked" ? ["blocked", d.warnText] : null;
      return v_flex().id(`tk-${x.id}`).flex_none().rounded(d.r.sm).when(on, (el) => el.bg(d.raised))
        .child(h_flex().h(32).px(8).gap(10).items_center()
          // The tick: finishes it.
          .child(div().id(`tk-done-${x.id}`).size(14).flex_none().rounded(3).border_1().border_color(d.lineStrong).cursor_pointer()
            .hover((s) => s.border_color(d.ok).bg(d.hover)).tooltip("Done")
            .on_click((_e, cx) => this.finish(x, cx)))
          .child(div().id(`tk-title-${x.id}`).flex_1().min_w(0).truncate().cursor_pointer().text_size(13).line_height("16px").text_color(d.fg1)
            .on_click((_e, cx) => { this.open = on ? null : x.id; cx.notify(); }).child(x.title))
          .when(Boolean(tag), (el) => el.child(div().flex_none().text_size(11).line_height("14px").font_weight(500).text_color(tag[1]).child(tag[0])))
          .child(div().flex_none().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg4).child(x.id)))
        .when(on, (el) => el.child(v_flex().gap(4).pl(32).pr(10).pb(10)
          .when(Boolean(x.body), (e2) => e2.child(div().text_size(12).line_height("17px").text_color(d.body).child(x.body)))
          .children((x.notes ?? []).slice(-2).map((n, i) => div().id(`tk-n-${x.id}-${i}`).text_size(12).line_height("17px").text_color(d.fg2)
            .child(`${n.by ?? ""}${n.by ? ": " : ""}${n.text ?? n}`)))
          .child(div().text_size(11).line_height("14px").text_color(d.fg3)
            .child([x.by && `from ${x.by}`, x.created && ago(x.created), x.claimed_by && `claimed by ${x.claimed_by}`].filter(Boolean).join(" · ")))));
    };

    return sheet(d, "crew-tasks", this.handle, (e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "tk", face: sheetFace(bot, t), title: `Tasks for ${bot.name}`, onClose: close,
        sub: mine.length ? `${mine.length} open · it picks new ones up when its turn ends` : "Nothing open · it picks new ones up when its turn ends" }))
      .child(sheetBody()
        // Add: one line, Enter adds.
        .child(sheetField(d, Input.new(this.input).w_full().text_size(13).text_color(d.fg1), { prefix: "+" }))
        .child(v_flex().id("tk-list").gap(2).max_h(320).overflow_y_scrollbar()
          .children(mine.map(row))
          .when(!mine.length, (el) => el.child(div().py(8).px(8).text_size(12).line_height("16px").text_color(d.fg3)
            .child(`Add one above: it goes on the shared board, assigned to ${bot.name}.`))))
        .child(div().id("tk-board").cursor_pointer().hover((s) => s.opacity(0.75)).on_click(() => { setShared("crew.view", "tasks"); close(); })
          .child(div().text_size(12).line_height("16px").text_color(d.fg2).child("All tasks on the board →"))))
      .child(sheetFooter(d, { id: "tk", hint: "Enter adds · Esc closes", onCancel: close, cancelLabel: "Close", ready: !empty && !this.busy,
        primary: this.busy ? "Adding…" : "Add task", onPrimary: (cx) => this.add(cx) }));
  }
}
