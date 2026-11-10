// Add a channel to a pal: a category, a channel name, a first task, and the brain (the pal's
// harness, or a different one just for this channel). The channel is a new tab in the
// pal's space, on the pal's computer; it starts with the pal's shared memory in its first message.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, run, props, closeOverlay, knownAgents, notify, spaces, exec } from "herdr";
import { botOf, updateBot, openTopic, brainLogo, mascotEl, mood, crewCli, withBypass, a, modelsFor, modelOf, withModel, launchSpec, primerHint, tone, ds,
  sheet, sheetHeader, sheetFace, sheetBody, sheetField, sheetArea, sheetRow, sheetSelect, sheetToggle, sheetPanel, sheetPanelBox, sheetOption, sheetFooter, categoryName } from "./crew.js";

export default class CrewDuplicate extends View {
  init(_props, cx) {
    const space = spaces().find((x) => x.id === props()?.space);
    this.bot = space ? botOf(space) : null;
    this.channel = InputState.new({ placeholder: "hiring" });
    this.newCategory = InputState.new({ placeholder: "New category" });
    this.brief = TextareaState.new({ placeholder: "What's it for? Its first task (optional)", rows: 2 });
    this.brief.set_auto_grow(2, 6);
    // Opened from a pal's board (Start a topic on a task, New topic… from the message box): the brief comes filled in.
    if (props()?.brief) this.brief.set_value(String(props().brief));
    for (const s of [this.channel, this.newCategory, this.brief]) s.on("change", (_e, cx) => cx.notify());
    this.channel.on("submit", (_e, cx) => this.go(cx));
    const cats = this.categories();
    this.category = cats[0] ?? "General";
    this.agents = [];
    this.harness = null; // null: the bot's own brain
    this.same = null;    // the bot's brain as a startable agent (knownAgents entry)
    this.ownBranch = false; // a git worktree on its own branch, reviewed and landed later
    this.picking = null; // "brain" | "model" | "cat": the list open under the selects
    this.model = undefined;  // Claude Code: undefined = same as the pal; else a MODELS key (null = your default)
    this.isRepo = false;    // own branch only makes sense in a git project
    if (this.bot?.folder && !this.bot.machine) {
      exec("git", ["-C", this.bot.folder, "rev-parse", "--is-inside-work-tree"]).then((r) => { this.isRepo = r.code === 0; cx.notify(); }).catch(() => {});
    }
    this.handle = cx.focus_handle();
    this.channel.focus();
    cx.spawn(async (cx) => {
      try { this.agents = (await knownAgents({ on: this.bot?.target ?? this.bot?.machine ?? null })).filter((x) => x.installed); } catch { this.agents = []; }
      this.same = this.agents.find((x) => x.key === this.bot?.harness) ?? null;
      cx.notify();
    });
  }

  categories() {
    return [...new Set(Object.values(this.bot?.categories ?? {}).map(categoryName).concat("General"))];
  }

  go(cx) {
    const bot = this.bot;
    const space = bot && spaces().find((x) => x.id === bot.space);
    if (!space) return notify({ title: "That pal is gone", level: "warning" });
    const name = "#" + (this.channel.value().trim().replace(/^#/, "").replace(/\s+/g, "-"));
    if (name === "#") return notify({ title: "Name the topic", level: "warning", timeout: 2500 });
    if (space.tabs.some((x) => x.name === name || x.name === name.slice(1))) return notify({ title: `${bot.name} already has ${name}`, level: "warning", timeout: 2500 });
    const category = this.category === "+new" ? (this.newCategory.value().trim() || "General") : this.category;
    const brief = this.brief.value().trim();
    // Its own branch: the crew command makes the worktree and has Project Pals open the channel in it.
    if (this.ownBranch) {
      if (this.busy) return;
      const args = ["channel", space.name, name.slice(1), "--worktree", "--category", category];
      if (brief) args.push("--brief", brief);
      if (this.harness) args.push("--harness", this.harness.key);
      // Stay open (saying so) until the branch is made: a dialog that closes first ends this mod,
      // and the notice with it.
      this.busy = true;
      cx?.notify();
      const done = (fn) => { fn(); closeOverlay(props().overlay); };
      crewCli(args)
        .then((out) => done(() => notify({ title: `${bot.name} ${name} is on its own branch`, body: out.trim().slice(0, 160), level: "success", timeout: 4000 })))
        .catch((e) => { this.busy = false; notify({ title: "Couldn't make its branch", body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 6000 }); cx?.notify(); });
      return;
    }
    // The pal's brain: as it was hired, else what runs in it now; none: a shell.
    const brainKey = this.harness?.key ?? bot.harness;
    let argv = this.harness ? withBypass(this.harness.key, this.harness.run) : (bot.record?.argv ?? (this.same ? withBypass(this.same.key, this.same.run) : undefined));
    // A model picked here goes on this channel's own command line ("Your default" drops the pal's).
    if (this.model !== undefined && argv && modelsFor(brainKey, argv)) argv = withModel(argv, brainKey, this.model);
    updateBot(bot.record ?? bot, (b) => ({
      ...b,
      categories: { ...(b.categories ?? {}), [name]: category },
      briefs: brief ? { ...(b.briefs ?? {}), [name]: brief } : (b.briefs ?? {}),
      brains: this.harness ? { ...(b.brains ?? {}), [name]: this.harness.key } : (b.brains ?? {}),
    }));
    const memory = (bot.memory ?? "").trim();
    // A brain without Project Pals hooks is asked to read its primer; agy takes its task as `-i` (PR #1).
    const task = [brief && `You are ${bot.name} in ${name}. ${brief}`, primerHint(argv, brainKey), memory && `Things to remember: ${memory}`].filter(Boolean).join("\n\n");
    const spec = launchSpec(brainKey, argv, argv ? task : "");
    closeOverlay(props().overlay);
    // On the machine the pal works on (Change machine…): its space there, else a new one there.
    openTopic(bot, { name, argv: spec.argv, task: spec.task });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  // "A · Compact sheet" (DeNon's pick): the pal's pet in the header, "# name" and the first task as
  // fields, then one row of selects (Brain, Model for Claude Code, Own branch in a git project, and
  // More for the category); a select's list opens under the row.
  render() {
    const t = tone(theme());
    const d = ds(t);
    const bot = this.bot;
    if (!bot) return div().p(24).bg(d.bg1).text_color(d.fg2).child("That pal is gone.");
    const close = () => closeOverlay(props().overlay);
    const short = bot.name.split(" - ")[0];
    const toggle = (which) => () => { this.picking = this.picking === which ? null : which; };

    const current = this.harness ?? this.same;
    const brainName = this.harness ? this.harness.name : `${bot.harnessName ?? "Shell"} (same)`;
    const brainKey = this.harness?.key ?? bot.harness;
    // Claude Code and Antigravity CLI channels can run on another model than the pal.
    const models = modelsFor(brainKey, this.harness ? this.harness.run : (bot.record?.argv ?? this.same?.run));
    const palModel = !this.harness ? modelOf(bot.record?.argv) : null;
    const modelName = (k) => (models ?? []).find((m) => m.key === k)?.name ?? k;
    const modelLabel = this.model === undefined ? (palModel ? `${modelName(palModel)} (same)` : "Same") : modelName(this.model);
    const cats = this.categories();

    const row = sheetRow()
      .child(sheetSelect(d, "dup-brain", { label: "Brain", value: brainName, open: this.picking === "brain", onClick: toggle("brain"),
        face: brainLogo(current?.key ?? bot.harness, 13, d, this.agents) }))
      .when(Boolean(models), (el) => el.child(sheetSelect(d, "dup-model", { label: "Model", value: modelLabel, open: this.picking === "model", onClick: toggle("model") })))
      .when(this.isRepo, (el) => el.child(sheetToggle(d, "dup-branch", { label: "Own branch", on: this.ownBranch, onClick: () => { this.ownBranch = !this.ownBranch; } })))
      .child(sheetSelect(d, "dup-more", { label: "Category", value: this.category === "+new" ? "New…" : this.category, open: this.picking === "cat", onClick: toggle("cat") }));

    let panel = null;
    if (this.picking === "brain") {
      panel = sheetPanel(d, "dup-brains")
        .child(sheetOption(d, "brain-same", { on: !this.harness, left: brainLogo(bot.harness, 14, d, this.agents), label: `Same as ${short}`, sub: bot.harnessName ?? "", onClick: () => { this.harness = null; this.picking = null; } }))
        .children(this.agents.filter((x) => x.key !== bot.harness).map((ag, i) => sheetOption(d, `brain-${i}`, { on: this.harness?.key === ag.key,
          left: brainLogo(ag.key, 14, d, this.agents), label: ag.name, onClick: () => { this.harness = ag; this.model = undefined; this.picking = null; } })));
    } else if (this.picking === "model") {
      panel = sheetPanel(d, "dup-models")
        .child(sheetOption(d, "model-same", { on: this.model === undefined, label: `Same as ${short}`, sub: palModel ? modelName(palModel) : "", onClick: () => { this.model = undefined; this.picking = null; } }))
        .children((models ?? []).map((m, i) => sheetOption(d, `model-${i}`, { on: this.model === m.key, label: m.name, sub: m.sub, onClick: () => { this.model = m.key; this.picking = null; } })));
    } else if (this.picking === "cat") {
      panel = sheetPanel(d, "dup-cats")
        .children(cats.map((c, i) => sheetOption(d, `cat-${i}`, { on: this.category === c, label: c, onClick: () => { this.category = c; this.picking = null; } })))
        .child(this.category === "+new"
          ? div().p(2).child(sheetField(d, Input.new(this.newCategory).w_full().text_size(13).text_color(d.fg1)))
          : sheetOption(d, "cat-new", { left: svg("mods/crew-roster/icons/ds-plus.svg").size(12).text_color(d.fg3), label: "New category…",
              onClick: () => { this.category = "+new"; this.newCategory.focus(); } }));
    }

    const ready = Boolean(this.channel.value().trim()) && !this.busy;
    return sheet(d, "crew-duplicate", this.handle, (e, cx) => this.key(e, cx))
      .child(sheetHeader(d, { id: "dup", face: sheetFace(bot, t), title: "New topic", onClose: close,
        sub: `in ${bot.name} · ${bot.machine ?? "this computer"} · ${bot.memory?.trim() ? "starts with its memory" : "shares its project"}` }))
      .child(sheetBody()
        .child(sheetField(d, Input.new(this.channel).w_full().text_size(13).text_color(d.fg1), { prefix: "#" }))
        .child(sheetArea(d, Textarea.new(this.brief).w_full().px(6).py(4).text_size(13).text_color(d.fg1)))
        .child(row)
        .when(Boolean(panel), (el) => el.child(sheetPanelBox(d, `dup-panel-${this.picking}`, panel))))
      .child(sheetFooter(d, { id: "dup", hint: "Enter adds · Esc cancels", onCancel: close, ready,
        primary: this.busy ? "Making its branch…" : "Add topic", onPrimary: (cx) => this.go(cx) }));
  }
}
