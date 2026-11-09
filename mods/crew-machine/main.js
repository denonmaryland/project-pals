// Change machine… (DeNon 2026-11-08): which computer a pal works on, and an easy way to change it.
// Every machine Herdr knows (this computer, then `hc machine ls`: icon, name, host, how it's
// connected, live state), "+ Add machine" (`hc machine add <target> --name <name>`, or Herdr's own
// Machines settings), and for the one you pick: the project folder ON that machine, checked there
// (`test -d`, run on it), with Clone it there (the git remote) or Choose folder… when it isn't.
//
// Moving saves the pal's record (machine, folder, and the folder per machine, for moving back).
// It moves where NEW topics start: terminals can't move, so the topics running now stay where they
// are until you close them. Then: Wake on <machine> (an asleep pal), or Open a topic on <machine>
// (an awake one: its space there, linked to the pal, crew.js openTopic).
// props: { space } (an open pal) or { bot } (a record id: an asleep pal).

import { View, div, svg } from "gpui-kit";
import { InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, spaces, exec, hc, home, run, notify, knownAgents, pickFolder } from "herdr";
import {
  crew, botOf, updateBot, wakePal, openTopic, palSpaces, withBypass, launchSpec, primerHint, tone, ds, pebble,
  sheet, sheetHeader, sheetFace, sheetBody, sheetField, sheetFooter, refreshMachines, machinesNow, machineList, machineKind, machineKinds,
  kindIcon, machineState, connectionOf, machineLabel, machineKey, sameMachine, guessFolder, movedRecord,
} from "./crew.js";

const ICON = "mods/crew-roster/icons";

export default class CrewMachine extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    const b = this.pal()?.bot;
    this.sel = b ? (b.target ?? null) : null;      // the machine picked in the list
    this.folder = InputState.new({ placeholder: "The project folder on that machine" });
    this.folder.on("change", (_e, cx) => { this.check = null; this.dirty = Date.now(); cx.notify(); });
    this.folder.on("submit", (_e, cx) => this.runCheck(cx));
    this.check = null;     // { key, path, state: "checking" | "yes" | "no" | "offline", msg }
    this.homes = {};       // machine key → its home folder
    this.brains = {};      // machine key → true / false (the pal's brain is installed there) / null
    this.runs = {};        // machine key → how to start that brain there (knownAgents' run)
    this.origin = undefined;
    this.busy = null;      // "clone" | "add" | "move"
    this.done = null;      // { from, to, folder } after a move
    this.adding = false;
    this.addTarget = InputState.new({ placeholder: "user@host, an IP, or a Host from ~/.ssh/config" });
    this.addName = InputState.new({ placeholder: "What to call it (e.g. server)" });
    for (const s of [this.addTarget, this.addName]) s.on("change", (_e, cx) => cx.notify());
    this.addErr = null;
    this.topic = InputState.new({ placeholder: "general" });
    cx.spawn(async (cx) => { await refreshMachines(); cx.notify(); });
    // The project's git remote, where it is now (for Clone it there).
    if (b?.folder) cx.spawn(async (cx) => {
      try { const r = await exec("git", ["-C", b.folder, "remote", "get-url", "origin"], { on: b.machine ?? null, timeout: 15000 }); this.origin = r.code === 0 ? r.stdout.trim() || null : null; }
      catch { this.origin = null; }
      cx.notify();
    });
    this.choose(this.sel, cx, true);
    // Check the folder a moment after typing stops.
    cx.timer.every(700, (cx) => { if (this.dirty && Date.now() - this.dirty > 650) { this.dirty = 0; this.runCheck(cx); } });
  }

  // The pal: an open one (props.space), else an asleep one's record (props.bot).
  pal() {
    const p = props() ?? {};
    const space = p.space ? spaces().find((x) => x.id === p.space) : null;
    if (space) return { space, bot: botOf(space) };
    const rec = crew().bots.find((x) => x.id === p.bot);
    if (!rec) return null;
    const open = spaces().find((x) => x.id === rec.space);
    return open ? { space: open, bot: botOf(open) } : { space: null, bot: { ...rec, record: rec, target: rec.machine ?? null, awake: false } };
  }

  close() { closeOverlay(props()?.overlay); }

  // Pick a machine: fill in the folder it'd use there, and look it up there.
  choose(name, cx, first = false) {
    this.sel = name ?? null;
    this.check = null;
    this.done = first ? null : this.done;
    const p = this.pal();
    if (!p) return;
    const rec = p.bot.record ?? p.bot;
    const key = machineKey(name);
    cx.spawn(async (cx) => {
      const h = await this.homeOf(name);
      const fromHome = await this.homeOf(rec.machine ?? null);
      const remembered = sameMachine(name, rec.machine) ? rec.folder : rec.folders?.[key];
      this.folder.set_value(guessFolder(rec.folder ?? p.bot.folder, fromHome, h, remembered ?? null));
      cx.notify();
      this.runCheck(cx);
      if (!(key in this.brains) && (rec.harness || p.bot.harness)) {
        this.brains[key] = null;
        try {
          const found = (await knownAgents({ on: name ?? null })).find((x) => x.key === (rec.harness ?? p.bot.harness) && x.installed);
          this.brains[key] = Boolean(found);
          if (found) this.runs[key] = found.run;
        }
        catch { this.brains[key] = false; }
        cx.notify();
      }
    });
  }

  async homeOf(name) {
    const key = machineKey(name);
    if (key in this.homes) return this.homes[key];
    if (!name) return (this.homes[key] = home());
    try { const r = await exec("sh", ["-c", 'printf %s "$HOME"'], { on: name, timeout: 15000 }); this.homes[key] = r.code === 0 ? r.stdout.trim() || null : null; }
    catch { this.homes[key] = null; }
    return this.homes[key];
  }

  // Is the folder there? `test -d`, run on that machine.
  runCheck(cx) {
    const path = this.folder.value().trim();
    const name = this.sel;
    const key = machineKey(name);
    if (!path) { this.check = null; cx.notify(); return; }
    const m = machineList(machinesNow()).find((x) => sameMachine(x.name, name));
    if (name && m && !machineState(m).up) { this.check = { key, path, state: "offline", msg: `${name} is ${machineState(m).word}: Herdr can't look there now.` }; cx.notify(); return; }
    this.check = { key, path, state: "checking" };
    cx.notify();
    cx.spawn(async (cx) => {
      let st;
      try { const r = await exec("test", ["-d", path], { on: name ?? null, timeout: 15000 }); st = r.code === 0 ? { state: "yes" } : { state: "no" }; }
      catch (e) { st = { state: "offline", msg: `Couldn't reach ${machineLabel(name)}: ${String(e.message ?? e).slice(0, 120)}` }; }
      if (this.sel === name && this.folder.value().trim() === path) this.check = { key, path, ...st };
      cx.notify();
    });
  }

  clone(cx) {
    const path = this.folder.value().trim();
    const name = this.sel;
    if (!this.origin || !path || this.busy) return;
    this.busy = "clone";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("git", ["clone", "--", this.origin, path], { on: name ?? null, timeout: 600000 });
        if (r.code !== 0) throw new Error(r.stderr.trim().split("\n").pop() || "git clone failed");
        notify({ title: `Cloned to ${machineLabel(name)}`, body: path, level: "success", timeout: 3000 });
      } catch (e) { notify({ title: "Couldn't clone it there", body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 6000 }); }
      this.busy = null;
      this.runCheck(cx);
    });
  }

  chooseFolder(cx) {
    cx.spawn(async (cx) => {
      const f = await pickFolder({ prompt: "Use this folder" }).catch(() => null);
      if (f) { this.folder.set_value(f); this.runCheck(cx); }
      cx.notify();
    });
  }

  // Save it: new topics (and waking) use the picked machine and folder from now on.
  move(cx) {
    const p = this.pal();
    if (!p || this.check?.state !== "yes" || this.busy) return;
    const rec = p.bot.record;
    if (!rec) return notify({ title: "Can't move this one", body: "It has no Project Pals record (hire it, or give it a role first).", level: "warning" });
    const from = rec.machine ?? null;
    const folder = this.folder.value().trim();
    updateBot(rec, (b) => movedRecord(b, this.sel, folder));
    this.done = { from, to: this.sel, folder };
    notify({ title: `${p.bot.name} now works on ${machineLabel(this.sel)}`, body: "New topics start there. Running topics stay where they are.", level: "success", timeout: 3500 });
    cx.notify();
  }

  // A topic on the machine the pal works on (its space there, else a new one there, linked).
  openThere(cx) {
    const p = this.pal();
    if (!p) return;
    const rec = p.bot.record ?? p.bot;
    const name = "#" + ((this.topic.value().trim() || "general").replace(/^#/, "").replace(/\s+/g, "-"));
    // Its brain as it was hired, else as that machine starts it.
    const run0 = this.runs[machineKey(rec.machine)];
    const argv = rec.argv ?? (run0 ? withBypass(rec.harness, run0) : undefined);
    const spec = launchSpec(rec.harness, argv, argv ? primerHint(argv, rec.harness) : "");
    const bot = { ...p.bot, target: rec.machine ?? null };
    const sp = openTopic(bot, { name, argv: spec.argv, task: spec.task || undefined });
    if (!sp) notify({ title: `Couldn't open a topic on ${machineLabel(rec.machine)}`, body: "Herdr didn't make the space; is the machine connected?", level: "warning" });
    this.close();
  }

  wakeThere() {
    const p = this.pal();
    const rec = p?.bot.record;
    if (rec) wakePal(crew().bots.find((x) => x.id === rec.id) ?? rec);
    this.close();
  }

  addMachine(cx) {
    const target = this.addTarget.value().trim();
    const name = this.addName.value().trim();
    if (!target || this.busy) return;
    this.busy = "add";
    this.addErr = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "add", target, ...(name ? ["--name", name] : []), "--json"]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ") || "hc machine add failed");
        await refreshMachines();
        this.adding = false;
        this.addTarget.set_value(""); this.addName.set_value("");
        notify({ title: `Added ${name || target}`, level: "success", timeout: 2500 });
      } catch (e) { this.addErr = String(e.message ?? e).slice(0, 300); }
      this.busy = null;
      cx.notify();
    });
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    const p = this.pal();
    if (!p) return div().p(24).bg(d.bg1).text_color(d.fg2).child("That pal is gone.");
    const { space, bot } = p;
    const rec = bot.record ?? bot;
    const target = rec.machine ?? null;
    const kinds = machineKinds();
    const list = machineList(machinesNow());
    const running = palSpaces(bot).map((s) => ({ machine: s.machine ?? null, topics: s.tabs.length }));
    const changing = !sameMachine(this.sel, target);
    const body = sheetBody();

    // Where it is now.
    body.child(div().text_size(12).line_height("17px").text_color(d.body)
      .child(running.length ? `Running now: ${running.map((x) => `${x.topics} topic${x.topics === 1 ? "" : "s"} on ${machineLabel(x.machine)}`).join(" · ")}. New topics start on ${machineLabel(target)}.`
        : `Asleep. It wakes on ${machineLabel(target)}.`));

    // The machines.
    const rows = div().flex().flex_col().gap(1).p(4).rounded(6).bg(d.raised).border_1().border_color(d.line);
    for (const m of list) {
      const key = machineKey(m.name);
      const on = sameMachine(this.sel, m.name);
      const st = machineState(m);
      const kind = machineKind(m, kinds);
      const here = running.filter((x) => sameMachine(x.machine, m.name)).reduce((n, x) => n + x.topics, 0);
      rows.child(div().id(`mc-${key || "local"}`).flex().items_center().gap(10).px(8).py(6).rounded(4).cursor_pointer()
        .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
        .on_click((_e, cx) => { this.choose(m.name, cx); cx.notify(); })
        .child(div().size(30).flex_none().flex().items_center().justify_center().rounded(6).bg(d.bg0).border_1().border_color(d.line)
          .child(svg(`${ICON}/${kindIcon(kind)}.svg`).size(15).text_color(st.up ? d.iconOn : d.fg4)))
        .child(div().flex().flex_col().flex_1().min_w(0)
          .child(div().flex().items_center().gap(6)
            .child(div().truncate().text_size(13).line_height("17px").font_weight(500).text_color(d.fg1).child(machineLabel(m.name)))
            .when(sameMachine(m.name, target), (el) => el.child(div().flex_none().h(16).px(5).flex().items_center().rounded(3).border_1().border_color(d.lineMid)
              .text_size(10).text_color(d.fg2).child("new topics start here")))
            .when(here > 0, (el) => el.child(div().flex_none().text_size(10.5).text_color(d.fg3).child(`${here} running`))))
          .child(div().truncate().text_size(11).line_height("15px").font_family(d.mono).text_color(d.fg3)
            .child([m.host, m.local ? "this computer" : connectionOf(m), m.local ? null : m.target].filter(Boolean).join(" · "))))
        .child(div().flex().flex_none().items_center().gap(5)
          .child(div().size(6).rounded(3).bg(st.up ? d.ok : d.warn))
          .child(div().text_size(11).text_color(st.up ? d.fg2 : d.warnText).child(st.word)))
        .when(on, (el) => el.child(svg(`${ICON}/check.svg`).size(12).flex_none().text_color(d.info))));
    }
    // + Add machine.
    rows.child(div().id("mc-add").flex().items_center().gap(10).px(8).h(30).rounded(4).cursor_pointer().hover((s) => s.bg(d.hover))
      .on_click((_e, cx) => { this.adding = !this.adding; if (this.adding) this.addTarget.focus(); cx.notify(); })
      .child(div().w(30).flex_none().flex().justify_center().child(svg(`${ICON}/ds-plus.svg`).size(12).text_color(d.fg2)))
      .child(div().flex_1().text_size(12.5).text_color(d.body).child("Add machine…")));
    body.child(rows);
    if (this.adding) body.child(div().flex().flex_col().gap(6)
      .child(sheetField(d, Input.new(this.addTarget).w_full().text_size(12.5), { prefix: "ssh" }))
      .child(sheetField(d, Input.new(this.addName).w_full().text_size(12.5), { prefix: "as" }))
      .when(Boolean(this.addErr), (el) => el.child(div().text_size(11.5).line_height("16px").text_color(d.warnText).child(this.addErr)))
      .child(div().flex().items_center().gap(8)
        .child(pebble(d, { id: "mc-add-go", label: this.busy === "add" ? "Adding…" : "Add", primary: true, disabled: !this.addTarget.value().trim() || Boolean(this.busy), onClick: (cx) => this.addMachine(cx) }))
        .child(div().id("mc-settings").text_size(11.5).text_color(d.fg2).cursor_pointer().hover((s) => s.text_color(d.fg1))
          .on_click(() => { run("app.settings", { section: "machines" }); this.close(); }).child("or Herdr's Machines settings →"))));

    // The folder there, checked there.
    const ck = this.check;
    const ckLine = !ck ? null
      : ck.state === "checking" ? [d.fg3, `Looking on ${machineLabel(this.sel)}…`]
      : ck.state === "yes" ? [d.okHi, `Found on ${machineLabel(this.sel)}.`]
      : ck.state === "no" ? [d.warnText, `Not on ${machineLabel(this.sel)}.`]
      : [d.warnText, ck.msg];
    const brain = this.brains[machineKey(this.sel)];
    body.child(div().flex().flex_col().gap(6)
      .child(div().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(`Project folder on ${machineLabel(this.sel)}`))
      .child(sheetField(d, Input.new(this.folder).w_full().text_size(12.5).font_family(d.mono)))
      .child(div().flex().flex_wrap().items_center().gap(8)
        .when(Boolean(ckLine), (el) => el.child(div().flex().items_center().gap(6)
          .child(div().size(6).rounded(3).bg(ck.state === "yes" ? d.ok : ck.state === "checking" ? d.fg4 : d.warn))
          .child(div().text_size(11.5).line_height("16px").text_color(ckLine[0]).child(ckLine[1]))))
        .when(ck?.state === "no" && Boolean(this.origin), (el) => el.child(pebble(d, { id: "mc-clone", icon: "ds-branch", label: this.busy === "clone" ? "Cloning…" : "Clone it there",
          disabled: Boolean(this.busy), tooltip: `git clone ${this.origin}`, onClick: (cx) => this.clone(cx) })))
        .when(ck?.state === "no" && !this.sel, (el) => el.child(pebble(d, { id: "mc-pick", icon: "ds-folder", label: "Choose folder…", onClick: (cx) => this.chooseFolder(cx) })))
        .when(ck?.state === "no" && Boolean(this.sel), (el) => el.child(div().text_size(11).text_color(d.fg3).child(this.origin ? "or type where it is there" : "Type where it is there (no git remote to clone from).")))
        .when(brain === false, (el) => el.child(div().text_size(11.5).text_color(d.warnText).child(`${bot.harnessName ?? rec.harness ?? "Its brain"} isn't installed on ${machineLabel(this.sel)}.`)))));

    // What moving means.
    if (changing && !this.done) body.child(div().px(10).py(8).rounded(6).bg(d.inset).border_1().border_color(d.line)
      .text_size(11.5).line_height("16px").text_color(d.fg2)
      .child(`New topics, and waking it, will use ${machineLabel(this.sel)}. ${running.length ? "Topics already running stay where they are until you close them: terminals can't move between machines." : ""}`));

    // After a move (or a pal whose new topics already start elsewhere): wake it there, or open a topic there.
    const there = palSpaces(bot).some((s) => sameMachine(s.machine, target));
    const offer = !changing && (!running.length || !there);
    if (offer) body.child(div().flex().flex_col().gap(6).px(10).py(10).rounded(6).bg(d.raised).border_1().border_color(d.line)
      .child(div().text_size(12).line_height("16px").text_color(d.body).child(this.done
        ? `Saved. ${bot.name}'s new topics start on ${machineLabel(target)}.${running.length ? " Its running topics stay where they are." : ""}`
        : `${bot.name} has nothing running on ${machineLabel(target)} yet.`))
      .child(running.length
        ? div().flex().items_center().gap(8)
          .child(div().flex_1().child(sheetField(d, Input.new(this.topic).w_full().text_size(12.5), { prefix: "#" })))
          .child(pebble(d, { id: "mc-open", icon: "ds-plus", label: `Open a topic on ${machineLabel(target)}`, primary: true, disabled: brain === false, onClick: (cx) => this.openThere(cx) }))
        : div().flex().child(pebble(d, { id: "mc-wake", icon: "ds-sun", label: `Wake on ${machineLabel(target)}`, primary: true, disabled: brain === false, onClick: () => this.wakeThere() }))));

    const ready = changing && this.check?.state === "yes" && !this.busy && Boolean(rec.id);
    return sheet(d, "crew-machine", this.handle, (e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "mc", face: sheetFace(bot, t), title: `Where ${bot.name} works`, onClose: () => this.close(),
        sub: "New topics start on the machine you pick; running topics stay put." }))
      .child(body)
      .child(sheetFooter(d, { id: "mc", hint: changing ? "Moves where new topics start" : "Pick a machine to move it",
        onCancel: () => this.close(), cancelLabel: this.done || !changing ? "Done" : "Cancel",
        primary: changing ? `Move to ${machineLabel(this.sel)}` : null, ready, onPrimary: (cx) => this.move(cx) }));
  }
}
