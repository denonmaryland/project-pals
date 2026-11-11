// Settings → Trusted helpers (T116). A trusted helper is one of your own assistants (a chat app, a
// script) that may send NORMAL work to your pals in your name: it says who it is
// (PAL_HELPER=<name> pal tell …) and `pal` checks its key. It is never your click.
//
// Here you switch a helper on or off, rotate its key, remove it or add one, and see what they sent
// in your name and what they tried that was refused. Every change is your click:
// `pal settings trust-helper <name> on|off|rotate|remove` with the click's token (ownerCli); the list
// and the record are read with `pal helpers --json`, which never carries a key. Opened from About →
// Settings → Trusted helpers, and from Home's "In your name". The dialog kit's compact sheet.

import { View, div, svg } from "gpui-kit";
import { InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, notify, exec, shared } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetFooter, sheetField, sheetToggle, pebble, scrollArea, crewCli, ownerCli } from "./crew.js";
import { helperSub, helperLine, helperAgo, logRow, helperToday, helperNameOk } from "./helperlog.js";

const ICON = "mods/crew-roster/icons";
const ROW = 34;

export default class CrewHelpers extends View {
  init(_props, cx) {
    this.info = null;        // pal helpers --json: {helpers, log, max}
    this.error = null;
    this.busy = null;        // the helper being changed
    this.shown = null;       // the helper whose line is shown (the one just switched on)
    this.confirm = null;     // the helper Remove asked about
    this.name = InputState.new({ placeholder: "A name your pals will see, e.g. Pals" });
    this.name.on("submit", (_e, cx) => this.add(cx));
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.load(cx);
    cx.timer.every(4000, (cx) => this.load(cx));
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try { this.info = JSON.parse(await crewCli(["helpers", "--json"])); this.error = null; }
      catch (e) { this.error = String(e.message ?? e).slice(0, 200); }
      cx.notify();
    });
  }

  // Your click: on, off, rotate or remove (never without this dialog's button).
  change(name, what, cx) {
    if (this.busy) return;
    this.busy = name;
    this.confirm = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await ownerCli(["settings", "trust-helper", name, what]);
        if (what === "on" || what === "rotate") this.shown = name;
        if (what === "remove" && this.shown === name) this.shown = null;
        const said = { on: `${name} is trusted`, off: `${name} is switched off`, rotate: `${name} has a new key`, remove: `${name} is removed` }[what];
        const body = { on: "Normal work only. Approvals stay your click.", off: "What it sends now arrives as not verified.",
          rotate: "Every copy of the old key is dead.", remove: "Its key file is gone. What it sent stays in the record." }[what];
        notify({ title: said, body, level: "success", timeout: 3500 });
      } catch (e) { notify({ title: "That didn't work", body: String(e.message ?? e).slice(0, 220), level: "warning", timeout: 6000 }); }
      this.busy = null;
      this.load(cx);
    });
  }

  add(cx) {
    const name = this.name.value().trim();
    if (!helperNameOk(name) || this.busy) return;
    this.name.set_value("");
    this.change(name, "on", cx);
  }

  copy(text) {
    exec("wl-copy", [text], { timeout: 3000 })
      .then((r) => notify(r.code === 0 ? { title: "Copied", body: text, level: "success", timeout: 2000 } : { title: "Couldn't copy", body: "Select the line instead.", level: "warning", timeout: 4000 }))
      .catch(() => notify({ title: "Couldn't copy", body: "wl-copy isn't installed; select the line instead.", level: "warning", timeout: 4000 }));
  }

  close() { closeOverlay(props()?.overlay); }

  helperRow(d, h, i) {
    const busy = this.busy === h.name;
    const tag = (text, color) => div().flex_none().px(5).rounded(3).border_1().border_color(`${color}66`)
      .text_size(9.5).line_height("14px").font_weight(600).text_color(color).child(text);
    const asking = this.confirm === h.name;
    return div().id(`th-${i}`).flex().min_h(52).py(7).flex_none().items_center().gap(12)
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(div().size(30).flex_none().flex().items_center().justify_center().rounded(5).bg(d.raised).border_1().border_color(d.line)
        .child(div().text_size(12).font_weight(600).text_color(h.on ? d.infoText : d.fg3).child(h.name.slice(0, 1).toUpperCase())))
      .child(div().flex().flex_col().flex_1().min_w(0).gap(2)
        .child(div().flex().items_center().gap(8)
          .child(div().min_w(0).truncate().text_size(13).line_height("16px").font_weight(500).text_color(d.fg1).child(h.name))
          .child(tag(h.on ? "ON" : "OFF", h.on ? d.infoText : d.fg2)))
        .child(div().text_size(11).line_height("14px").text_color(h.key && !h.key_there ? d.warnText : d.fg3).child(helperSub(h))))
      .child(div().flex().flex_none().items_center().gap(6)
        // On: Rotate key. Off: Remove (asked once more in place, as it deletes the key).
        .when(h.on && Boolean(h.key), (el) => el.child(pebble(d, { id: `th-rot-${i}`, label: "Rotate key", disabled: busy, tooltip: "A new key; every copy of the old one stops working", onClick: (cx) => this.change(h.name, "rotate", cx) })))
        .when(!h.on && !asking, (el) => el.child(pebble(d, { id: `th-rm-${i}`, label: "Remove", disabled: busy, onClick: (cx) => { this.confirm = h.name; cx.notify(); } })))
        .when(!h.on && asking, (el) => el.child(pebble(d, { id: `th-rm-no-${i}`, label: "Keep", onClick: (cx) => { this.confirm = null; cx.notify(); } }))
          .child(pebble(d, { id: `th-rm-yes-${i}`, label: "Remove it", primary: true, disabled: busy, onClick: (cx) => this.change(h.name, "remove", cx) })))
        .child(sheetToggle(d, `th-sw-${i}`, { label: h.on ? "On" : "Off", on: h.on, onClick: (cx) => this.change(h.name, h.on ? "off" : "on", cx) })));
  }

  recordRow(d, e, i, owner) {
    const r = logRow(e, "you");
    const color = r.tone === "warn" ? d.warnText : r.tone === "quiet" ? d.fg2 : d.fg1;
    return div().id(`thl-${i}`).flex().h(ROW).flex_none().items_center().gap(8)
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(div().size(6).flex_none().rounded(3).bg(r.tone === "warn" ? d.warn : r.tone === "quiet" ? d.fg4 : d.info))
      .child(div().flex_none().max_w(250).truncate().text_size(12).line_height("16px").font_weight(500).text_color(color).child(r.bold))
      .child(div().flex_1().min_w(0).truncate().text_size(12).line_height("16px").text_color(d.fg2).child(r.rest))
      .when(Boolean(r.card), (el) => el.child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(d.fg4).child(r.card)))
      .child(div().w(56).flex_none().text_right().text_size(11).text_color(d.fg4).child(helperAgo(e.at)));
  }

  render() {
    const d = ds(tone(theme()));
    const owner = shared("crew.settings")?.owner ?? "you";
    const info = this.info;
    const helpers = info?.helpers ?? [];
    const log = info?.log ?? [];
    const body = sheetBody();
    // What this is, and what it never is, before any switch.
    body.child(div().px(10).py(8).rounded(6).bg(d.bg0).border_1().border_color(d.line).flex().flex_col().gap(4)
      .child(div().text_size(12).line_height("17px").text_color(d.body)
        .child("A trusted helper can send normal work to your pals in your name. It can never approve, push, release, merge, message people, change settings or answer what's waiting on Home. Those stay your click."))
      .child(div().text_size(11).line_height("15px").text_color(d.fg3)
        .child("Its key is a file on this computer. Anything running as you that reads it can do the same, so switch a helper off when you don't use it.")));
    if (this.error) body.child(div().text_size(12).line_height("16px").text_color(d.warnText).child(`Couldn't read the helpers: ${this.error}`));
    if (info) {
      const list = div().flex().flex_col();
      helpers.forEach((h, i) => list.child(this.helperRow(d, h, i)));
      if (!helpers.length) list.child(div().h(40).flex().items_center().text_size(12).text_color(d.fg3).child("No trusted helpers. Nothing outside Project Pals can send in your name."));
      body.child(list);
      // The line to give the helper that was just switched on (or its key rotated).
      const on = helpers.find((h) => h.name === this.shown && h.on);
      if (on) {
        const line = helperLine(on.name);
        body.child(div().px(10).py(8).rounded(6).bg(`${d.ok}0D`).border_1().border_color(`${d.ok}44`).flex().flex_col().gap(6)
          .child(div().text_size(12).line_height("17px").text_color(d.body)
            .child(`${on.name} is on. Give your assistant this line. It works from a plain terminal on this computer, not from inside a pal.`))
          .child(div().flex().items_center().gap(6)
            .child(div().flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(4).bg(d.inset).border_1().border_color(d.lineMid)
              .child(div().truncate().text_size(12).font_family(d.mono).text_color(d.fg1).child(line)))
            .child(pebble(d, { id: "th-copy", label: "Copy", onClick: () => this.copy(line) }))));
      }
      // Add one: a name, then it's trusted (its key is made).
      if (helpers.length < (info.max ?? 8)) {
        const ok = helperNameOk(this.name.value());
        body.child(div().flex().items_center().gap(6)
          .child(div().flex_1().min_w(0).child(sheetField(d, Input.new(this.name).w_full().text_size(13).text_color(d.fg1))))
          .child(pebble(d, { id: "th-add", label: "Add and trust", primary: ok, disabled: !ok || Boolean(this.busy), onClick: (cx) => this.add(cx) })));
      }
      // The record: what they sent in your name, and what they tried.
      const today = helperToday(log);
      body.child(div().flex().items_center().justify_between().pt(4)
        .child(div().text_size(12).line_height("16px").font_weight(500).text_color(d.fg2).child("In your name"))
        .child(div().text_size(11).line_height("14px").text_color(d.fg3).child(today ? `${today} today` : "Nothing in the last day")));
      if (log.length) {
        const rows = div().flex().flex_col().px(10);
        log.slice(0, 60).forEach((e, i) => rows.child(this.recordRow(d, e, i, owner)));
        body.child(scrollArea(d, "th-log", rows).max_h(ROW * 6).rounded(6).bg(d.bg0).border_1().border_color(d.line));
      } else {
        body.child(div().h(ROW).px(10).flex().items_center().rounded(6).bg(d.bg0).border_1().border_color(d.line)
          .text_size(12).text_color(d.fg4).child("Nothing yet. Every message a helper sends in your name shows here."));
      }
    } else if (!this.error) {
      body.child(div().h(48).flex().items_center().text_size(12).text_color(d.fg3).child("Reading…"));
    }
    return sheet(d, "crew-helpers", this.handle, (e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "th", face: div().size(40).flex_none().flex().items_center().justify_center().rounded(8).bg(d.bg0).border_1().border_color(d.line)
        .child(svg(`${ICON}/ds-tell.svg`).size(16).text_color(d.fg2)),
        title: "Trusted helpers", sub: "Your own assistants, sending normal work in your name", onClose: () => this.close() }))
      .child(body)
      .child(sheetFooter(d, { id: "th", hint: "Every change here is your click · pal helpers log", onCancel: () => this.close(), cancelLabel: "Close" }));
  }
}
