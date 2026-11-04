// Hire a bot: name and job, any installed harness from any company, and the computer it lives
// on. Hiring makes the bot's space (named after it) with its first channel running the harness,
// and hands it the brief (plus its memory) as its first message.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, run, props, closeOverlay, knownAgents, machines, notify } from "herdr";
import { crew, saveCrew, newId, mascot, ROLES, COMPANY, a, withBypass } from "./crew.js";
import { spaces } from "herdr";

export default class CrewHire extends View {
  init(_props, cx) {
    this.name = InputState.new({ placeholder: "Name it" });
    this.channel = InputState.new({ placeholder: "general", value: "general" });
    this.folder = InputState.new({ placeholder: "~/Projects/…" });
    this.brief = TextareaState.new({ placeholder: "What's its first job? (optional)", rows: 2 });
    this.brief.set_auto_grow(2, 6);
    this.picking = null; // "role" | "brain" | "machine": the open list
    for (const s of [this.name, this.channel, this.folder, this.brief]) s.on("change", (_e, cx) => cx.notify());
    this.name.on("submit", () => this.hire());
    this.channel.on("submit", () => this.hire());
    this.role = ROLES[1];
    this.machine = null;
    this.agents = [];
    this.harness = null;
    this.loading = true;
    this.name.focus();
    this.handle = cx.focus_handle();
    this.load(cx);
  }

  load(cx) {
    this.loading = true;
    cx.spawn(async (cx) => {
      try { this.agents = await knownAgents({ on: this.machine }); } catch { this.agents = []; }
      if (!this.harness || !this.agents.some((x) => x.key === this.harness.key && x.installed)) {
        this.harness = this.agents.find((x) => x.installed) ?? null;
      }
      this.loading = false;
      cx.notify();
    });
  }

  hire() {
    const t = theme();
    const name = this.name.value().trim();
    const channel = "#" + (this.channel.value().trim().replace(/^#/, "").replace(/\s+/g, "-") || "general");
    const brief = this.brief.value().trim();
    const folder = this.folder.value().trim();
    if (!name) return notify({ title: "Give your bot a name", level: "warning", timeout: 2500 });
    if (!this.harness) return notify({ title: "Pick a harness", level: "warning", timeout: 2500 });
    const c = crew();
    if (spaces().some((s) => s.name.toLowerCase() === name.toLowerCase() && (s.machine ?? null) === this.machine)) {
      return notify({ title: `You already have a ${name}`, level: "warning", timeout: 2500 });
    }
    const bot = {
      id: newId(), name, role: this.role, harness: this.harness.key, harnessName: this.harness.name,
      argv: withBypass(this.harness.key, this.harness.run), machine: this.machine, folder: folder || null,
      categories: { [channel]: "General" }, briefs: brief ? { [channel]: brief } : {}, memory: "", hired: Date.now(),
    };
    saveCrew({ ...c, bots: [...c.bots, bot] });
    closeOverlay(props().overlay);
    run("space.new", {
      name, tab: channel, argv: bot.argv, machine: this.machine ?? "",
      folder: folder || undefined,
      task: brief ? `You are ${name}, my ${this.role.toLowerCase()}. ${brief}` : undefined,
    });
    // Link the record to its new space so renaming the space later keeps its memory.
    const made = spaces().find((s) => s.name === name && (s.machine ?? null) === this.machine);
    if (made) saveCrew({ ...crew(), bots: crew().bots.map((b) => (b.id === bot.id ? { ...b, space: made.id } : b)) });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = theme();
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const hair = () => div().h(1).mx(16).bg(a(t.foreground, "0c"));
    const chev = (open) => svg(`mods/crew-roster/icons/${open ? "chevron-down" : "chevron-right"}.svg`).size(11).text_color(t.dim);
    const row = (id, label, right, action) => h_flex().id(id).items_center().justify_between().gap(12).px(16).min_h(48)
      .when(Boolean(action), (el) => el.cursor_pointer().hover((s) => s.bg(a(t.foreground, "05"))).on_click(action))
      .child(div().flex_none().text_size(13.5).text_color(t.foreground).child(label))
      .child(right);
    const pick = (which) => (_e, cx) => { this.picking = this.picking === which ? null : which; cx.notify(); };
    const option = (id, on, left, label, sub, action) => h_flex().id(id).items_center().gap(10).px(10).py(7).rounded(10).cursor_pointer()
      .when(on, (el) => el.bg(a(t.foreground, "0c"))).hover((s) => s.bg(a(t.foreground, "08")))
      .on_click(action)
      .child(left ?? div().size(22))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(label))
      .when(Boolean(sub), (el) => el.child(div().text_size(12).text_color(t.dim).child(sub)))
      .when(on, (el) => el.child(svg("mods/crew-roster/icons/check.svg").size(13).text_color(t.accent)));
    const inline = (state, w) => stop(div().w(w).h(30).px(10).flex().items_center().rounded(8).bg(a(t.foreground, "08"))
      .child(Input.new(state).w_full().text_size(13).text_color(t.foreground)));

    const name = this.name.value().trim();
    const h = this.harness;

    // Header: the bot-to-be's face changes with the brain you pick.
    const header = h_flex().items_center().gap(12).px(24).pt(22).pb(6)
      .child(image(mascot(h?.key, name ? "done" : "calm")).w(38).h(38).flex_none())
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(17).font_medium().text_color(t.foreground).child("Hire a bot"))
        .child(div().text_size(12.5).text_color(t.dim).child("Any harness, any company, on any of your computers")))
      .child(div().id("hire-x").size(28).rounded(8).flex().items_center().justify_center().cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "10"))).on_click(() => closeOverlay(props().overlay))
        .child(svg("mods/crew-roster/icons/x.svg").size(13).text_color(t.dim)));

    // The one thing that matters: its name, and optionally its first job.
    const named = v_flex().rounded(14).bg(a(t.canvas, "aa")).border_1().border_color(a(t.foreground, "10"))
      .child(stop(div().px(16).pt(14).pb(6).child(Input.new(this.name).w_full().text_size(20).text_color(t.foreground))))
      .child(stop(div().px(6).pb(6).child(Textarea.new(this.brief).w_full().px(10).py(6).text_size(13.5).text_color(t.foreground))));

    // Settings, one line each; the lists open in place.
    const roleRow = row("hire-role", "Role", h_flex().items_center().gap(8)
      .child(div().text_size(13).text_color(t.muted).child(this.role)).child(chev(this.picking === "role")), pick("role"));
    const roleList = v_flex().px(8).pb(8).children(ROLES.map((r, i) =>
      option(`role-${i}`, this.role === r, null, r, null, (_e, cx) => { this.role = r; this.picking = null; cx.notify(); })));

    const brainRow = row("hire-brain", "Brain", h_flex().items_center().gap(8)
      .when(Boolean(h), (el) => el.child(image(mascot(h.key, "calm")).w(20).h(20)))
      .child(div().text_size(13).text_color(t.muted).child(this.loading ? "Looking…" : h ? h.name : "None installed"))
      .when(Boolean(h && COMPANY[h.key]), (el) => el.child(div().text_size(12).text_color(t.dim).child(COMPANY[h.key])))
      .child(chev(this.picking === "brain")), pick("brain"));
    const installed = this.agents.filter((x) => x.installed);
    const missing = this.agents.filter((x) => !x.installed);
    const brainList = v_flex().px(8).pb(8)
      .children(installed.map((ag, i) => option(`brain-${i}`, h?.key === ag.key, image(mascot(ag.key, "calm")).w(22).h(22),
        ag.name, COMPANY[ag.key] ?? "", (_e, cx) => { this.harness = ag; this.picking = null; cx.notify(); })))
      .when(missing.length > 0, (el) => el.child(div().px(10).pt(6).text_size(12).text_color(t.dim)
        .child(`Not installed here: ${missing.map((x) => x.name).join(", ")}`)));

    const ms = [null, ...machines().map((m) => m.name).filter(Boolean)];
    const machineRow = ms.length > 1 ? row("hire-machine", "Computer", h_flex().items_center().gap(8)
      .child(div().text_size(13).text_color(t.muted).child(this.machine ?? "This computer")).child(chev(this.picking === "machine")), pick("machine")) : null;
    const machineList = v_flex().px(8).pb(8).children(ms.map((m, i) =>
      option(`m-${i}`, this.machine === m, null, m ?? "This computer", null, (_e, cx) => { this.machine = m; this.picking = null; this.load(cx); cx.notify(); })));

    const folderRow = row("hire-folder", "Project folder", inline(this.folder, 230));
    const channelRow = row("hire-channel", "First channel", h_flex().items_center().gap(4)
      .child(div().text_size(13).text_color(t.dim).child("#")).child(inline(this.channel, 150)));

    const settings = v_flex().rounded(14).border_1().border_color(a(t.foreground, "10"))
      .child(roleRow).when(this.picking === "role", (el) => el.child(roleList))
      .child(hair()).child(brainRow).when(this.picking === "brain", (el) => el.child(brainList))
      .when(Boolean(machineRow), (el) => el.child(hair()).child(machineRow).when(this.picking === "machine", (el) => el.child(machineList)))
      .child(hair()).child(folderRow)
      .child(hair()).child(channelRow);

    const ready = Boolean(name && h);
    const footer = h_flex().items_center().justify_between().gap(12).px(24).pt(14).pb(20)
      .child(div().min_w(0).truncate().text_size(12).text_color(t.dim)
        .child(`${this.role} · ${h?.name ?? "no brain"} · ${this.machine ?? "this computer"}`))
      .child(h_flex().gap(14).items_center().flex_none()
        .child(div().id("hire-cancel").cursor_pointer().text_size(13.5).text_color(t.muted).on_click(() => closeOverlay(props().overlay)).child("Cancel"))
        .child(div().id("hire-go").px(18).py(9).rounded_full().cursor_pointer().bg(ready ? t.solid : a(t.foreground, "1a"))
          .hover((s) => s.opacity(0.88)).on_click(() => this.hire())
          .child(div().text_size(13.5).font_medium().text_color(ready ? t.solid_foreground : t.dim).child(name ? `Hire ${name}` : "Hire"))));

    return v_flex().id("crew-hire").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().bg(t.popover).text_color(t.foreground)
      .child(header)
      .child(v_flex().gap(12).px(24).pt(12).child(named).child(settings))
      .child(footer);
  }
}
