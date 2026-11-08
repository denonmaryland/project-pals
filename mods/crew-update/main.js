// Update Project Pals (DeNon, 2026-11-08): opened from the status bar's "Update available" pill or
// the gear's "Check for updates". In the dialog kit's "A · Compact sheet" look: the version, the
// release's highlights, then Update now (download, check its SHA256, keep the current version for
// Roll back, install; Herdr reloads the mods) or Later (the pill stays away for 3 days for this
// version). props: { check: true } asks GitHub first. The work is `pal update` (crewupdate.py),
// left running on its own; this dialog follows data/crew-update-run.json, so it picks up where it
// was even though the update reinstalls it.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, exec, notify } from "herdr";
import { ds, tone, sheet, sheetHeader, sheetBody, sheetFooter, sheetFace, headPet, pebble, crewCli,
  readUpdate, updateLater, updateStart, noteHighlights, UPDATE_CHECK_EVERY } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const ago = (s) => { const d = Date.now() / 1000 - s; return d < 90 ? "just now" : d < 3600 ? `${Math.round(d / 60)} min ago` : d < 86400 ? `${Math.round(d / 3600)} h ago` : `${Math.round(d / 86400)} d ago`; };
const day = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };

export default class CrewUpdate extends View {
  init(_props, cx) {
    this.u = null;
    this.checking = false;
    this.error = null;
    this.started = 0;      // when Update now was pressed here (the run file may not exist yet)
    this.handle = cx.focus_handle();
    this.load(cx, true);
    cx.timer.every(1000, (cx) => { if (this.busy()) this.load(cx); });
  }

  busy() { return this.checking || this.started > 0 || this.u?.run?.state === "running"; }

  load(cx, first = false) {
    cx.spawn(async (cx) => {
      this.u = await readUpdate();
      // The run file caught up with the button: from here on it's the truth.
      if (this.started && this.u.run && (this.u.run.started ?? 0) * 1000 >= this.started - 2000) this.started = 0;
      if (this.started && Date.now() - this.started > 20000) { this.started = 0; this.error = "The update didn't start. Try again, or run pal update apply in a terminal."; }
      if (first && (props()?.check || Date.now() / 1000 - this.u.checked > UPDATE_CHECK_EVERY)) this.check(cx);
      cx.notify();
    });
  }

  check(cx) {
    this.checking = true;
    this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try { await crewCli(["update", "check", "--json"]); }
      catch (e) { const m = String(e.message ?? e).match(/"error":\s*"((?:[^"\\]|\\.)*)"/); this.error = m ? JSON.parse(`"${m[1]}"`) : "Couldn't reach GitHub. Check the connection and try again."; }
      this.checking = false;
      this.load(cx);
    });
  }

  update(cx) {
    this.error = null;
    this.started = Date.now();
    cx.notify();
    cx.spawn(async (cx) => {
      try { await updateStart("apply"); } catch (e) { this.started = 0; this.error = String(e.message ?? e); }
      this.load(cx);
    });
  }

  rollback(cx) {
    this.error = null;
    this.started = Date.now();
    cx.spawn(async (cx) => {
      try { await updateStart("rollback"); } catch (e) { this.started = 0; this.error = String(e.message ?? e); }
      this.load(cx);
    });
  }

  render() {
    const t = tone(theme());
    const d = ds(t);
    const p = props() ?? {};
    const close = () => closeOverlay(p.overlay);
    const u = this.u ?? {};
    const run = u.run;
    const running = this.started > 0 || run?.state === "running";
    // What the dialog is showing: running, just finished (done or failed, in the last 10 minutes),
    // an update to offer, or up to date.
    const recent = run && Date.now() / 1000 - (run.at ?? 0) < 600;
    const mode = running ? "running" : recent && run.state === "failed" ? "failed" : recent && run.state === "done" && run.action === "apply" && run.updated ? "done"
      : recent && run.state === "done" && run.action === "rollback" ? "rolled" : u.available ? "offer" : "current";

    const text = (s, color = d.fg2, size = 12) => div().text_size(size).line_height(`${size + 6}px`).text_color(color).child(s);
    const titles = {
      running: [run?.action === "rollback" ? "Putting the previous version back…" : `Updating to ${u.latest ?? "the new version"}…`, run?.step ? cleanStep(run.step) : "Starting"],
      done: [`Updated to ${run?.version ?? u.current}`, "Herdr reloaded the mods. Your pals, rooms, memory and tasks are as they were."],
      rolled: [`Back on ${u.current ?? "the previous version"}`, "The previous version is installed again."],
      failed: ["The update didn't finish", "Nothing was lost: a failed install puts the previous version back by itself."],
      offer: [`Project Pals ${u.latest} is out`, `You have ${u.current}${u.published ? ` · released ${day(u.published)}` : ""}`],
      current: [this.checking ? "Checking for updates…" : "Project Pals is up to date",
        this.checking ? (u.repo ?? "GitHub") : `${u.current ?? "?"}${u.checked ? ` · checked ${ago(u.checked)}` : ""}`],
    };
    const [title, sub] = titles[mode];

    const body = sheetBody();
    if (mode === "offer" || mode === "running" && run?.action !== "rollback") {
      const hl = noteHighlights(u.notes, 6);
      if (hl.length) body.child(v_flex().gap(8).max_h(260).overflow_y_scrollbar().pr(6)
        .children(hl.map((h, i) => h_flex().id(`up-hl-${i}`).items_start().gap(8)
          .child(div().mt(6).size(4).flex_none().rounded(2).bg(d.fg3))
          .child(div().flex_1().min_w(0).text_size(12).line_height("18px").text_color(d.fg2)
            .child(div().text_color(d.fg1).font_weight(500).child(h.head))
            .when(Boolean(h.detail), (el) => el.child(div().truncate().child(h.detail)))))));
      else body.child(text("This release has no notes."));
      if (u.url) body.child(div().id("up-notes").cursor_pointer().hover((s) => s.opacity(0.75)).text_size(12).text_color(d.infoText)
        .on_click(() => exec("xdg-open", [u.url]).catch(() => {})).child("Full release notes →"));
      body.child(h_flex().items_start().gap(8).pt(4)
        .child(svg(`${ICON}/ds-shield.svg`).size(13).mt(2).flex_none().text_color(d.fg3))
        .child(text("Downloads the release from GitHub, checks it against its SHA256 sums, keeps your current version for Roll back, then installs. Only Project Pals's own files change.", d.fg3)));
    }
    if (mode === "running") body.child(h_flex().items_center().gap(8).child(svg(`${ICON}/spinner.svg`).size(14).text_color(d.info).spin(900)).child(text("This takes a few seconds; you can close this and keep working.")));
    if (mode === "failed" || this.error) body.child(div().p(10).rounded(6).bg(d.inset).border_1().border_color(d.lineMid)
      .child(text(this.error ?? run?.error ?? "Something went wrong.", d.warnText)));
    if (mode === "done" || mode === "failed") body.child(h_flex().gap(8)
      .child(pebble(d, { id: "up-rollback", label: "Roll back", onClick: (cx) => this.rollback(cx), disabled: running })));
    if (mode === "current" && !this.checking) body.child(h_flex().gap(8)
      .child(pebble(d, { id: "up-check", label: "Check again", onClick: (cx) => this.check(cx) })));

    const footer = mode === "offer"
      ? sheetFooter(d, { id: "up", hint: "Later hides this for 3 days", cancelLabel: "Later", onCancel: () => { updateLater(u.latest); close(); },
          primary: "Update now", onPrimary: (cx) => this.update(cx), ready: true })
      : sheetFooter(d, { id: "up", hint: running ? "Esc closes; the update keeps going" : "Esc closes", cancelLabel: "Close", onCancel: close,
          primary: mode === "failed" && u.available ? "Try again" : null, ready: !running, onPrimary: (cx) => this.update(cx) });
    return sheet(d, "crew-update", this.handle, (e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "up", face: sheetFace(headPet(), t, 52), title, sub, onClose: close }))
      .child(body)
      .child(footer);
  }
}

// A log line from the updater, as a person would say it.
function cleanStep(s) {
  const m = String(s);
  if (/^downloading/.test(m)) return "Downloading and checking the release";
  if (/^backed up/.test(m)) return "Kept the current version for Roll back; installing";
  if (/^installed/.test(m)) return "Installed; Herdr is reloading the mods";
  return m.replace(/^starting$/, "Starting");
}
