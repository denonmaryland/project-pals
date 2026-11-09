// Settings → Desk (docs/desk/design.md §12.9): triage on or off and its daily cap, how many soon cards
// a pal may send one topic an hour, when the head pal's check-in lists a held or quiet card, when
// closed cards are archived, and whether MUSE sends as itself; with today's numbers on top. Each change
// is saved at once with `pal settings desk.<key> <value>` (validated there; crewd reads it on its next
// pass, no restart). Opened from About → Settings → Desk. In the dialog kit's "A · Compact sheet" look.

import { View, div, svg } from "gpui-kit";
import { theme, props, closeOverlay, notify } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetFooter, sheetToggle, pebble, crewCli } from "./crew.js";

// key → [label, what it does, step, min, max]
const NUMBERS = [
  ["triage_daily_cap", "Triage calls a day", "Over it, cards wait for you to place them", 10, 0, 1000],
  ["pal_soon_per_hour", "Soon cards per topic an hour", "From pals; past it they arrive as normal", 1, 0, 60],
  ["held_flag_after_min", "Check-in: held for (min)", "Before the head pal's check-in lists a held card", 5, 1, 1440],
  ["seen_no_receipt_flag_min", "Check-in: quiet for (min)", "Seen, with no receipt from its pal", 5, 1, 1440],
  ["archive_after_days", "Archive closed cards after (days)", "They move to archive/; nothing is deleted", 1, 1, 3650],
];

const ago = (s) => { const d = Date.now() / 1000 - s; return d < 90 ? "just now" : d < 3600 ? `${Math.round(d / 60)}m ago` : `${Math.round(d / 3600)}h ago`; };

export default class CrewDeskSettings extends View {
  init(_props, cx) {
    this.st = null;
    this.error = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.load(cx);
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try { this.st = JSON.parse(await crewCli(["desk", "stats", "--json"])); this.error = null; }
      catch (e) { this.error = String(e.message ?? e).slice(0, 200); }
      cx.notify();
    });
  }

  set(key, value, cx) {
    // Shown at once, then saved; the saved value comes back with the reload.
    if (this.st) this.st.settings = { ...this.st.settings, [key]: value };
    cx.notify();
    cx.spawn(async (cx) => {
      const v = typeof value === "boolean" ? (value ? "on" : "off") : String(value);
      try { await crewCli(["settings", `desk.${key}`, v]); }
      catch (e) { notify({ title: "Couldn't change it", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      this.load(cx);
    });
  }

  close() { closeOverlay(props()?.overlay); }

  // A setting row: its label and what it does on the left, the control on the right (fixed height).
  row(d, id, label, sub, control) {
    return div().id(id).flex().h(48).flex_none().items_center().justify_between().gap(12)
      .child(div().flex().flex_col().min_w(0).gap(1)
        .child(div().truncate().text_size(13).line_height("16px").text_color(d.fg1).child(label))
        .child(div().truncate().text_size(11).line_height("14px").text_color(d.fg3).child(sub)))
      .child(control);
  }

  stepper(d, key, value, step, min, max) {
    const clamp = (v) => Math.max(min, Math.min(max, v));
    return div().flex().flex_none().items_center().gap(6)
      .child(pebble(d, { id: `ds-${key}-dn`, icon: "minus", disabled: value <= min, tooltip: `−${step}`, onClick: (cx) => this.set(key, clamp(value - step), cx) }))
      .child(div().w(44).flex_none().text_size(13).line_height("16px").font_family(d.mono).text_color(d.fg1).flex().justify_center().child(String(value)))
      .child(pebble(d, { id: `ds-${key}-up`, icon: "plus", disabled: value >= max, tooltip: `+${step}`, onClick: (cx) => this.set(key, clamp(value + step), cx) }));
  }

  render() {
    const d = ds(tone(theme()));
    const st = this.st;
    const s = st?.settings ?? {};
    const body = sheetBody();
    if (this.error) body.child(div().text_size(12).line_height("16px").text_color(d.warnText).child(`Couldn't read the Desk: ${this.error}`));
    if (st) {
      // Today, in one quiet box.
      const today = [`${st.open} open`, st.held ? `${st.held} held` : null, st["needs you"] ? `${st["needs you"]} need you` : null,
        st.drafts ? `${st.drafts} draft${st.drafts === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
      body.child(div().flex().flex_col().gap(2).px(10).py(8).rounded(6).bg(d.bg0).border_1().border_color(d.line)
        .child(div().text_size(12).line_height("16px").text_color(d.fg1).child(today))
        .child(div().text_size(11).line_height("14px").text_color(d.fg3)
          .child(`Triage ${st.triage === "off" ? "off" : `${st.triage_today} of ${st.triage_cap} calls today`}`
            + ` · last check-in ${st.checkin_at ? ago(st.checkin_at) : "not yet"}`)));
      body.child(this.row(d, "ds-triage", "Triage", "A quick model places Auto drops and cards to a pal with no topic",
        sheetToggle(d, "ds-triage-t", { label: s.triage === "off" ? "Off" : "Auto", on: s.triage !== "off",
          onClick: (cx) => this.set("triage", s.triage === "off" ? "auto" : "off", cx) })));
      for (const [key, label, sub, step, min, max] of NUMBERS) {
        body.child(this.row(d, `ds-${key}`, label, sub, this.stepper(d, key, Number(s[key] ?? min), step, min, max)));
      }
      body.child(this.row(d, "ds-partner", "MUSE sends as itself", "Its cards go out at once as a pal's, with no Send click",
        sheetToggle(d, "ds-partner-t", { label: s.partner_sends_as_itself ? "On" : "Off", on: Boolean(s.partner_sends_as_itself),
          onClick: (cx) => this.set("partner_sends_as_itself", !s.partner_sends_as_itself, cx) })));
    } else if (!this.error) {
      body.child(div().h(48).flex().items_center().text_size(12).text_color(d.fg3).child("Reading the Desk…"));
    }
    return sheet(d, "crew-desk-settings", this.handle, (e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "dset", face: div().size(40).flex_none().flex().items_center().justify_center().rounded(8).bg(d.bg0).border_1().border_color(d.line)
        .child(svg("mods/crew-roster/icons/ds-tell.svg").size(16).text_color(d.fg2)),
        title: "Desk", sub: "How cards are placed, flagged and kept", onClose: () => this.close() }))
      .child(body)
      .child(sheetFooter(d, { id: "dset", hint: "Saved as you change them · pal settings desk", onCancel: () => this.close(), cancelLabel: "Close" }));
  }
}
