// About Terminal Botz: the installed version, and updates from the project's GitHub releases.
// Check for updates asks GitHub (crewd also checks once a day); Update downloads the release,
// backs up the current files, installs it and checks every mod, putting the old version back if
// anything fails. Roll back restores the last backup. Bots, rooms and memory are never touched.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, notify, appHome, readTextFile, exec, home } from "herdr";
import { crewCli, MASCOTS, a } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const vt = (v) => (String(v ?? "0").match(/\d+/g) ?? []).concat(["0", "0", "0"]).slice(0, 3).map(Number);
const newer = (x, y) => { const p = vt(x), q = vt(y); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] > q[i]; return false; };
const ago = (s) => { const d = Date.now() / 1000 - s; return d < 90 ? "just now" : d < 3600 ? `${Math.round(d / 60)} min ago` : d < 86400 ? `${Math.round(d / 3600)}h ago` : `${Math.round(d / 86400)}d ago`; };

export default class CrewAbout extends View {
  init(_props, cx) {
    this.ins = {};
    this.state = {};
    this.busy = null;      // "check" | "update" | "rollback"
    this.error = null;
    this.backups = 0;
    this.load(cx);
    cx.timer.every(3000, (cx) => this.load(cx));
    this.handle = cx.focus_handle();
  }

  load(cx) {
    cx.spawn(async (cx) => {
      const d = `${appHome()}/data`;
      try { this.ins = JSON.parse((await readTextFile(`${d}/crew-install.json`)) ?? "{}"); } catch { this.ins = {}; }
      try { this.state = JSON.parse((await readTextFile(`${d}/crew-update.json`)) ?? "{}"); } catch { this.state = {}; }
      const r = await exec("sh", ["-c", 'ls "$1"/update-*.tar.gz 2>/dev/null | wc -l', "sh", `${appHome()}/.crew-backups`]).catch(() => null);
      this.backups = Number((r?.stdout ?? "0").trim()) || 0;
      cx.notify();
    });
  }

  run(kind, args, cx) {
    this.busy = kind;
    this.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const out = JSON.parse(await crewCli([...args, "--json"]));
        if (kind === "update") notify({ title: out.updated ? `Updated to ${out.version}` : "Already up to date", level: "success", timeout: 4000 });
        if (kind === "rollback") notify({ title: "Put the previous version back", level: "success", timeout: 4000 });
      } catch (e) {
        // crew update --json prints {ok:false,error} and exits 1: crewCli throws with that text.
        const msg = String(e.message ?? e);
        const m = msg.match(/"error":\s*"((?:[^"\\]|\\.)*)"/);
        this.error = m ? JSON.parse(`"${m[1]}"`) : msg;
      }
      this.busy = null;
      this.load(cx);
    });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = theme();
    const ins = this.ins, st = this.state;
    const current = ins.version ?? "?";
    const available = st.latest && newer(st.latest, current);
    const button = (id, label, primary, action, disabled) => div().id(id).px(16).py(8).rounded_full().cursor_pointer()
      .bg(disabled ? a(t.foreground, "10") : primary ? t.solid : a(t.foreground, "10")).hover((s) => s.opacity(0.88))
      .on_click(disabled ? () => {} : action)
      .child(div().text_size(13).font_medium().text_color(disabled ? t.dim : primary ? t.solid_foreground : t.foreground).child(label));

    const header = h_flex().items_center().gap(12).px(24).pt(22).pb(6)
      .child(image(`${MASCOTS}/pearl-crown-${available ? "done" : "calm"}.svg`).w(40).h(40).flex_none())
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(17).font_medium().text_color(t.foreground).child(ins.name ?? "Terminal Botz"))
        .child(div().truncate().text_size(12.5).text_color(t.dim).child(`Version ${current}${ins.repo ? ` · ${ins.repo}` : ""}`)))
      .child(div().id("about-x").size(28).rounded(8).flex().items_center().justify_center().cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "10"))).on_click(() => closeOverlay(props().overlay))
        .child(svg(`${ICON}/x.svg`).size(13).text_color(t.dim)));

    // Where things stand.
    let title, sub, color = t.foreground;
    if (this.busy === "check") { title = "Checking for updates…"; sub = ins.repo ?? ""; }
    else if (this.busy === "update") { title = `Updating to ${st.latest}…`; sub = "Downloading, backing up, installing, checking each mod"; }
    else if (this.busy === "rollback") { title = "Putting the previous version back…"; sub = ""; }
    else if (this.error) { title = "That didn't work"; sub = this.error; color = t.blocked; }
    else if (available) { title = `${st.name || st.latest} is available`; sub = st.published ? `released ${String(st.published).slice(0, 10)}` : ""; }
    else if (st.checked && !st.latest) { title = "No releases yet"; sub = `checked ${ago(st.checked)}`; }
    else if (st.checked) { title = "You're up to date"; sub = `checked ${ago(st.checked)}`; }
    else { title = "Not checked yet"; sub = "Terminal Botz checks once a day by itself"; }

    const notes = available && st.notes ? v_flex().id("about-notes").max_h(220).overflow_y_scrollbar().gap(3).pt(4)
      .children(st.notes.split("\n").filter((l) => l.trim()).slice(0, 40).map((l) =>
        div().text_size(12.5).text_color(t.muted).child(l.replace(/^#+\s*/, "").replace(/^\s*[-*]\s+/, "• ").replace(/\*\*(.+?)\*\*/g, "$1")))) : null;

    const status = v_flex().gap(4).px(16).py(14).rounded(14).bg(a(t.foreground, available ? "0c" : "07"))
      .child(div().text_size(14.5).font_medium().text_color(color).child(title))
      .when(Boolean(sub), (el) => el.child(div().text_size(12.5).text_color(this.error ? t.blocked : t.dim).child(sub)))
      .when(Boolean(notes), (el) => el.child(notes))
      .when(Boolean(available && st.url), (el) => el.child(div().id("about-notes-link").pt(4).cursor_pointer().hover((s) => s.opacity(0.75))
        .on_click(() => exec("xdg-open", [st.url]).catch(() => {}))
        .child(div().text_size(12).text_color(t.accent).child("Full release notes"))));

    const footer = h_flex().items_center().justify_between().gap(12).px(24).pt(14).pb(20)
      .child(this.backups && !this.busy
        ? div().id("about-rollback").cursor_pointer().hover((s) => s.opacity(0.75)).on_click((_e, cx) => this.run("rollback", ["update", "rollback"], cx))
            .child(div().text_size(12.5).text_color(t.dim).child("Roll back"))
        : div())
      .child(h_flex().gap(8).items_center()
        .child(button("about-check", "Check for updates", !available, (_e, cx) => this.run("check", ["update", "check"], cx), Boolean(this.busy)))
        .when(Boolean(available), (el) => el.child(button("about-update", `Update to ${st.latest}`, true, (_e, cx) => this.run("update", ["update", "apply"], cx), Boolean(this.busy)))));

    return v_flex().id("crew-about").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().bg(t.popover).text_color(t.foreground)
      .child(header)
      .child(v_flex().gap(10).px(24).pt(12)
        .child(status)
        .child(div().px(4).text_size(12).text_color(t.dim)
          .child("Updates replace Terminal Botz's own files only. Your bots, rooms, memory and routines stay as they are, and the previous version is kept so you can roll back.")))
      .child(footer);
  }
}
