// Trusted helpers: one owner-set level per helper, until revoked. Full control covers
// autonomous app decisions, including pushes and releases. Trust changes use ownerCli.
// The list and record never expose a credential.

import { View, div, svg } from "gpui-kit";
import { InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, notify, exec, shared } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetFooter, sheetField, pebble, scrollArea, crewCli, ownerCli } from "./crew.js";
import { helperSub, helperLine, helperAgo, logRow, helperRows, helperToday, helperNameOk, helperLevel, HELPER_LEVELS } from "./helperlog.js";

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

  // The one click that sets a standing level. No second outward switch or confirmation.
  setLevel(name, level, cx) {
    if (this.busy) return;
    this.busy = name;
    this.confirm = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await ownerCli(["settings", "trust-helper", name, "level", level]);
        if (level !== "off") this.shown = name;
        const label = HELPER_LEVELS.find(([key]) => key === level)?.[1] ?? level;
        notify({ title: level === "off" ? `${name}'s access is revoked` : `${name}: ${label}`,
          body: level === "full" ? "May decide and act autonomously, including pushes and releases. Revoke at any time."
            : level === "work" ? "Normal work only. Owner decisions still need your approval." : "New and queued work can no longer use this grant.",
          level: "success", timeout: 3500 });
      } catch (e) { notify({ title: "That didn't work", body: String(e.message ?? e).slice(0, 220), level: "warning", timeout: 6000 }); }
      this.busy = null;
      this.load(cx);
    });
  }

  // The hourly limit, your click: 5 at a time, 5 to 500.
  limit(h, by, cx) {
    if (this.busy) return;
    const n = Math.max(5, Math.min(500, (h.per_hour ?? 20) + by));
    this.busy = h.name;
    cx.notify();
    cx.spawn(async (cx) => {
      try { await ownerCli(["settings", "trust-helper", h.name, "limit", String(n)]); }
      catch (e) { notify({ title: "That didn't work", body: String(e.message ?? e).slice(0, 220), level: "warning", timeout: 6000 }); }
      this.busy = null;
      this.load(cx);
    });
  }

  add(cx) {
    const name = this.name.value().trim();
    if (!helperNameOk(name) || this.busy) return;
    this.name.set_value("");
    this.setLevel(name, "work", cx);
  }

  copy(text) {
    exec("wl-copy", [text], { timeout: 3000 })
      .then((r) => notify(r.code === 0 ? { title: "Copied", body: text, level: "success", timeout: 2000 } : { title: "Couldn't copy", body: "Select the line instead.", level: "warning", timeout: 4000 }))
      .catch(() => notify({ title: "Couldn't copy", body: "wl-copy isn't installed; select the line instead.", level: "warning", timeout: 4000 }));
  }

  close() { closeOverlay(props()?.overlay); }

  helperRow(d, h, i) {
    const busy = this.busy === h.name, level = helperLevel(h), on = level !== "off";
    const label = HELPER_LEVELS.find(([key]) => key === level)[1];
    const asking = this.confirm === h.name;
    const header = div().flex().min_h(44).items_center().gap(10)
      .child(div().size(30).flex_none().flex().items_center().justify_center().rounded(5).bg(d.raised).border_1().border_color(d.line)
        .child(div().text_size(12).font_weight(600).text_color(on ? d.infoText : d.fg3).child(h.name.slice(0, 1).toUpperCase())))
      .child(div().flex().flex_col().flex_1().min_w(0).gap(2)
        .child(div().flex().items_center().gap(8)
          .child(div().min_w(0).truncate().text_size(13).line_height("16px").font_weight(500).text_color(d.fg1).child(h.name))
          .child(div().flex_none().px(5).rounded(3).border_1().border_color(d.line).text_size(10).line_height("14px").text_color(on ? d.infoText : d.fg3).child(label)))
        .child(div().truncate().text_size(11).line_height("14px").text_color(h.attention || (h.key && !h.key_there) ? d.warnText : d.fg3)
          .child(h.attention ? h.attention.text : helperSub(h))))
      .when(on && Boolean(h.key), (el) => el.child(pebble(d, { id: `th-rot-${i}`, label: "Rotate key", disabled: busy,
        tooltip: "A new key; every copy of the old one stops working", onClick: (cx) => this.change(h.name, "rotate", cx) })))
      .when(on, (el) => el.child(pebble(d, { id: `th-revoke-${i}`, label: "Revoke", disabled: busy,
        tooltip: "Revoke this helper's access now", onClick: (cx) => this.setLevel(h.name, "off", cx) })))
      .when(!on && !asking, (el) => el.child(pebble(d, { id: `th-rm-${i}`, label: "Remove", disabled: busy, onClick: (cx) => { this.confirm = h.name; cx.notify(); } })))
      .when(!on && asking, (el) => el.child(pebble(d, { id: `th-rm-no-${i}`, label: "Keep", onClick: (cx) => { this.confirm = null; cx.notify(); } }))
        .child(pebble(d, { id: `th-rm-yes-${i}`, label: "Remove it", primary: true, disabled: busy, onClick: (cx) => this.change(h.name, "remove", cx) })));
    const levels = div().flex().items_center().gap(6);
    for (const [key, text] of HELPER_LEVELS) levels.child(pebble(d, { id: `th-level-${key}-${i}`, label: text,
      primary: level === key, disabled: busy, tooltip: level === key ? "Current trust level" : `Set ${h.name} to ${text}`,
      onClick: (cx) => { if (level !== key) this.setLevel(h.name, key, cx); } }));
    const row = div().id(`th-${i}`).flex().flex_col().py(9).gap(6)
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(header).child(levels)
      .child(div().text_size(11).line_height("15px").text_color(level === "full" ? d.infoText : d.fg3)
        .child(level === "full" ? "Full control: autonomous app decisions, pushes and releases. No further approval prompts or waiting period."
          : level === "work" ? "Work only: sends normal work. Owner decisions still need your approval." : "Off: this helper has no delegated access."));
    if (level === "work" && h.key) row.child(div().flex().items_center().gap(6)
      .child(div().flex_1().text_size(11).text_color(d.fg3).child("Work-only messages per hour"))
      .child(pebble(d, { id: `th-lim-dn-${i}`, icon: "minus", disabled: busy || (h.per_hour ?? 20) <= 5, tooltip: "5 fewer an hour", onClick: (cx) => this.limit(h, -5, cx) }))
      .child(div().w(38).flex_none().flex().justify_center().text_size(11).font_family(d.mono).text_color(d.fg2).child(`${h.per_hour ?? 20}/h`))
      .child(pebble(d, { id: `th-lim-up-${i}`, icon: "plus", disabled: busy || (h.per_hour ?? 20) >= 500, tooltip: "5 more an hour", onClick: (cx) => this.limit(h, 5, cx) })));
    return row;
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
    const log = helperRows(info?.log ?? []);
    const body = sheetBody();
    // What this is, and what it never is, before any switch.
    body.child(div().px(10).py(8).rounded(6).bg(d.bg0).border_1().border_color(d.line).flex().flex_col().gap(4)
      .child(div().text_size(12).line_height("17px").text_color(d.body)
        .child("Choose one trust level per helper. Work only sends normal work. Full control lets it decide and act autonomously across the app, including pushes and releases, without further approval prompts or delays."))
      .child(div().text_size(11).line_height("15px").text_color(d.fg3)
        .child("Only you set trust and revoke access. Helpers cannot promote themselves or erase their activity. Revoke blocks future work; it cannot undo a completed external action.")));
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
          .child(pebble(d, { id: "th-add", label: "Add · Work only", primary: ok, disabled: !ok || Boolean(this.busy), onClick: (cx) => this.add(cx) })));
      }
      // The record: what they sent in your name, and what they tried.
      const today = helperToday(log);
      body.child(div().flex().items_center().justify_between().pt(4)
        .child(div().text_size(12).line_height("16px").font_weight(500).text_color(d.fg2).child("Helper activity"))
        .child(div().text_size(11).line_height("14px").text_color(d.fg3).child(today ? `${today} today` : "Nothing in the last day")));
      if (log.length) {
        const rows = div().flex().flex_col().px(10);
        log.slice(0, 60).forEach((e, i) => rows.child(this.recordRow(d, e, i, owner)));
        body.child(scrollArea(d, "th-log", rows).max_h(ROW * 6).rounded(6).bg(d.bg0).border_1().border_color(d.line));
      } else {
        body.child(div().h(ROW).px(10).flex().items_center().rounded(6).bg(d.bg0).border_1().border_color(d.line)
          .text_size(12).text_color(d.fg4).child("Nothing yet. Helper messages, decisions and actions appear here."));
      }
    } else if (!this.error) {
      body.child(div().h(48).flex().items_center().text_size(12).text_color(d.fg3).child("Reading…"));
    }
    return sheet(d, "crew-helpers", this.handle, (e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "th", face: div().size(40).flex_none().flex().items_center().justify_center().rounded(8).bg(d.bg0).border_1().border_color(d.line)
        .child(svg(`${ICON}/ds-tell.svg`).size(16).text_color(d.fg2)),
        title: "Trusted helpers", sub: "One trust level per helper · your choice, until revoked", onClose: () => this.close() }))
      .child(scrollArea(d, "th-body", body).max_h(480))
      .child(sheetFooter(d, { id: "th", hint: "Every change here is your click · pal helpers log", onCancel: () => this.close(), cancelLabel: "Close" }));
  }
}
