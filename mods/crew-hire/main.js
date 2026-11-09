// Hire a pal: name and job, any installed harness from any company, and the computer it lives
// on. Hiring makes the pal's space (named after it) with its first channel running the harness,
// and hands it the brief (plus its memory) as its first message.
// The Idea partner role (MUSE, Desk design §13) hires through `pal hire --partner`: its brief is
// rendered into data/crew-partner, where it starts (Sonnet unless a model is picked, topic #ideas).
// There's at most one; with one hired the role says so and can't be picked. props: { partner? }.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, run, props, closeOverlay, knownAgents, machines, notify, pickFolder, exec, home } from "herdr";
import { crew, saveCrew, newId, brainLogo, ROLES, PARTNER_ROLE, PARTNER_NAME, partnerOf, companyOf, a, withBypass, modelsFor, withModel, launchSpec, primerHint, isClaude, tone, ds, pebble,
  sheet, sheetHeader, sheetBody, sheetField, sheetArea, sheetRow, sheetSelect, sheetPanel, sheetPanelBox, sheetOption, sheetFooter } from "./crew.js";
import { spaces } from "herdr";

export default class CrewHire extends View {
  init(_props, cx) {
    this.name = InputState.new({ placeholder: "Name it" });
    this.channel = InputState.new({ placeholder: "general", value: "general" });
    this.folder = InputState.new({ placeholder: "Project folder (optional): ~/Projects/…" });
    this.brief = TextareaState.new({ placeholder: "What's its first job? (optional)", rows: 2 });
    this.brief.set_auto_grow(2, 6);
    this.picking = null; // "role" | "brain" | "machine" | "model": the open list
    this.model = null;   // Claude Code only: null = your default; else passed as --model (nothing global changes)
    for (const s of [this.name, this.channel, this.folder, this.brief]) s.on("change", (_e, cx) => cx.notify());
    this.name.on("submit", () => this.hire());
    this.channel.on("submit", () => this.hire());
    this.role = ROLES[1];
    if (props()?.partner && !partnerOf()) this.pickPartner();
    this.machine = null;
    this.agents = [];
    this.harness = null;
    this.loading = true;
    this.name.focus();
    this.handle = cx.focus_handle();
    this.load(cx);
  }

  // The Idea partner: MUSE by default, in #ideas (its home folder is data/crew-partner, set by pal hire).
  pickPartner() {
    this.role = PARTNER_ROLE;
    if (!this.name.value().trim()) this.name.set_value(PARTNER_NAME);
    if (!this.channel.value().trim() || this.channel.value().trim() === "general") this.channel.set_value("ideas");
  }

  partner() { return this.role === PARTNER_ROLE; }

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
    const t = tone(theme());
    const name = this.name.value().trim();
    const channel = "#" + (this.channel.value().trim().replace(/^#/, "").replace(/\s+/g, "-") || "general");
    const brief = this.brief.value().trim();
    const folder = this.folder.value().trim();
    if (!name) return notify({ title: "Give your pal a name", level: "warning", timeout: 2500 });
    if (!this.harness) return notify({ title: "Pick a harness", level: "warning", timeout: 2500 });
    if (this.partner()) return this.hirePartner(name, channel, brief);
    const c = crew();
    if (spaces().some((s) => s.name.toLowerCase() === name.toLowerCase() && (s.machine ?? null) === this.machine)) {
      return notify({ title: `You already have a ${name}`, level: "warning", timeout: 2500 });
    }
    const bot = {
      id: newId(), name, role: this.role, harness: this.harness.key, harnessName: this.harness.name,
      argv: withModel(withBypass(this.harness.key, this.harness.run), this.harness.key, this.model), machine: this.machine, folder: folder || null,
      categories: { [channel]: "General" }, briefs: brief ? { [channel]: brief } : {}, memory: "", hired: Date.now(),
    };
    saveCrew({ ...c, bots: [...c.bots, bot] });
    // A brain without Project Pals hooks (Codex, …) is asked to read its primer first; agy takes its
    // first task as `-i` (launchSpec, from goodboimax's PR #1).
    const hint = primerHint(bot.argv, this.harness.key);
    const prompt = [brief && `You are ${name}, my ${this.role.toLowerCase()}. ${brief}`, hint].filter(Boolean).join("\n\n");
    const spec = launchSpec(this.harness.key, bot.argv, prompt);
    closeOverlay(props().overlay);
    run("space.new", {
      name, tab: channel, argv: spec.argv, machine: this.machine ?? "",
      folder: folder || undefined,
      task: spec.task,
    });
    // Link the record to its new space so renaming the space later keeps its memory.
    const made = spaces().find((s) => s.name === name && (s.machine ?? null) === this.machine);
    if (made) saveCrew({ ...crew(), bots: crew().bots.map((b) => (b.id === bot.id ? { ...b, space: made.id } : b)) });
  }

  // `pal hire --partner`, in the background: it renders the brief, then asks the layout to hire (the
  // roster's "Hired MUSE" toast says it worked); only a failure is ours to say.
  hirePartner(name, channel, brief) {
    if (partnerOf()) return notify({ title: `You already have an idea partner: ${partnerOf().name}`, level: "info", timeout: 3000 });
    const args = ["hire", name, "--partner", "--harness", this.harness.key, "--channel", channel.replace(/^#/, ""),
      ...(this.model ? ["--model", this.model] : []), ...(this.machine ? ["--machine", this.machine] : []), ...(brief ? ["--task", brief] : [])];
    closeOverlay(props().overlay);
    exec(`${home()}/.local/bin/pal`, args, { timeout: 90000 })
      .then((r) => { if (r.code !== 0) notify({ title: `Couldn't hire ${name}`, body: (r.stderr || r.stdout).trim().split("\n").slice(-2).join(" "), level: "warning" }); })
      .catch((e) => notify({ title: `Couldn't hire ${name}`, body: String(e.message ?? e).slice(0, 200), level: "warning" }));
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  // "A · Compact sheet": the would-be pal's face (its brain's mascot) in the header, its name and
  // first job as fields, then one row of selects (Brain, Model for Claude Code, Role, Computer when
  // you have several), the project folder (with Browse) and its first channel.
  render() {
    const t = tone(theme());
    const d = ds(t);
    const close = () => closeOverlay(props().overlay);
    const pick = (which) => () => { this.picking = this.picking === which ? null : which; };
    const name = this.name.value().trim();
    const h = this.harness;
    const installed = this.agents.filter((x) => x.installed);
    const missing = this.agents.filter((x) => !x.installed);
    // Claude Code and Antigravity CLI can start on a chosen model (on the pal's own command line).
    const models = h ? modelsFor(h.key, h.run) : null;
    const ms = [null, ...machines().map((m) => m.name).filter(Boolean)];

    const row = sheetRow()
      .child(sheetSelect(d, "hire-brain", { label: "Brain", value: this.loading ? "Looking…" : h ? h.name : "None installed", open: this.picking === "brain", onClick: pick("brain"),
        face: h ? brainLogo(h.key, 13, d, this.agents) : null }))
      .when(Boolean(models), (el) => el.child(sheetSelect(d, "hire-model", { label: "Model", value: models.find((m) => m.key === this.model)?.name ?? "Your default", open: this.picking === "model", onClick: pick("model") })))
      .child(sheetSelect(d, "hire-role", { label: "Role", value: this.role, open: this.picking === "role", onClick: pick("role") }))
      .when(ms.length > 1, (el) => el.child(sheetSelect(d, "hire-machine", { label: "Computer", value: this.machine ?? "This one", open: this.picking === "machine", onClick: pick("machine") })));

    let panel = null;
    if (this.picking === "brain") {
      panel = sheetPanel(d, "hire-brains")
        .children(installed.map((ag, i) => sheetOption(d, `brain-${i}`, { on: h?.key === ag.key, left: brainLogo(ag.key, 14, d, this.agents), label: ag.name, sub: companyOf(ag.key, ag.run),
          onClick: () => { this.harness = ag; if (!modelsFor(ag.key, ag.run)?.some((m) => m.key === this.model)) this.model = null; this.picking = null; } })))
        .when(missing.length > 0, (el) => el.child(div().px(8).py(4).text_size(11).line_height("14px").text_color(d.fg3).child(`Not installed here: ${missing.map((x) => x.name).join(", ")}`)));
    } else if (this.picking === "model") {
      panel = sheetPanel(d, "hire-models").children((models ?? []).map((m, i) => sheetOption(d, `model-${i}`, { on: this.model === m.key, label: m.name, sub: m.sub, onClick: () => { this.model = m.key; this.picking = null; } })));
    } else if (this.picking === "role") {
      const has = partnerOf();
      panel = sheetPanel(d, "hire-roles").children(ROLES.map((r, i) => sheetOption(d, `role-${i}`, { on: this.role === r, label: r, onClick: () => { this.role = r; this.picking = null; } })))
        .child(sheetOption(d, "role-partner", { on: this.partner(), label: PARTNER_ROLE, sub: has ? `you have one: ${has.name}` : "you riff, it drafts cards you Send",
          onClick: () => { if (has) notify({ title: `You already have an idea partner: ${has.name}`, level: "info", timeout: 3000 }); else this.pickPartner(); this.picking = null; } }));
    } else if (this.picking === "machine") {
      panel = sheetPanel(d, "hire-machines").children(ms.map((m, i) => sheetOption(d, `m-${i}`, { on: this.machine === m, label: m ?? "This computer",
        onClick: (cx) => { this.machine = m; this.picking = null; this.load(cx); } })));
    }

    const browse = this.machine ? null : pebble(d, { id: "hire-browse", label: "Browse…", onClick: (cx) => cx.spawn(async (cx) => {
      const picked = await pickFolder({ prompt: "Use this folder" }).catch(() => null);
      if (picked) this.folder.set_value(picked);
      cx.notify();
    }) });
    const trustNote = isClaude(h?.key, h?.run) && (this.folder.value().trim() || this.partner());
    const ready = Boolean(name && h);
    return sheet(d, "crew-hire", this.handle, (e, cx) => this.key(e, cx))
      .child(sheetHeader(d, { id: "hire", face: div().size(40).flex_none().flex().items_center().justify_center().rounded(8).bg(d.raised).border_1().border_color(d.line).child(brainLogo(h?.key, 20, d, this.agents)), title: "Hire a pal", onClose: close,
        sub: `Any harness, any company · ${this.machine ?? "this computer"}` }))
      .child(sheetBody()
        .child(sheetField(d, Input.new(this.name).w_full().text_size(13).text_color(d.fg1)))
        .child(sheetArea(d, Textarea.new(this.brief).w_full().px(6).py(4).text_size(13).text_color(d.fg1)))
        .child(row)
        .when(Boolean(panel), (el) => el.child(sheetPanelBox(d, `hire-panel-${this.picking}`, panel)))
        .when(!this.partner(), (el) => el.child(sheetField(d, Input.new(this.folder).w_full().text_size(13).text_color(d.fg1), { trailing: browse })))
        .when(this.partner(), (el) => el.child(div().text_size(11).line_height("15px").text_color(d.fg3)
          .child("Lives in data/crew-partner with its brief, on Sonnet unless you pick a model. It drafts cards; nothing goes out until you click Send.")))
        .child(sheetField(d, Input.new(this.channel).w_full().text_size(13).text_color(d.fg1), { prefix: "#" }))
        .when(Boolean(trustNote), (el) => el.child(div().text_size(11).line_height("15px").text_color(d.fg3)
          .child("If Claude Code hasn't opened this folder before, it first asks whether you trust it. The new pal shows \"starting\" until you answer in its topic."))))
      .child(sheetFooter(d, { id: "hire", hint: "Enter hires · Esc cancels", onCancel: close, ready, primary: name ? `Hire ${name}` : "Hire", onPrimary: () => this.hire() }));
  }
}
