// Add a channel to a pal: a category, a channel name, a first task, and the brain (the pal's
// harness, or a different one just for this channel). The channel is a new tab in the
// pal's space, on the pal's computer; it starts with the pal's shared memory in its first message.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, run, props, closeOverlay, knownAgents, notify, spaces, exec } from "herdr";
import { botOf, updateBot, mascot, mascotEl, mood, crewCli, withBypass, a, MODELS, modelOf, withModel, tone } from "./crew.js";

export default class CrewDuplicate extends View {
  init(_props, cx) {
    const space = spaces().find((x) => x.id === props()?.space);
    this.bot = space ? botOf(space) : null;
    this.channel = InputState.new({ placeholder: "hiring" });
    this.newCategory = InputState.new({ placeholder: "New category" });
    this.brief = TextareaState.new({ placeholder: "What's it for? Its first task (optional)", rows: 2 });
    this.brief.set_auto_grow(2, 6);
    for (const s of [this.channel, this.newCategory, this.brief]) s.on("change", (_e, cx) => cx.notify());
    this.channel.on("submit", (_e, cx) => this.go(cx));
    const cats = this.categories();
    this.category = cats[0] ?? "General";
    this.agents = [];
    this.harness = null; // null: the bot's own brain
    this.same = null;    // the bot's brain as a startable agent (knownAgents entry)
    this.ownBranch = false; // a git worktree on its own branch, reviewed and landed later
    this.pickBrain = false; // the brain list is open
    this.model = undefined;  // Claude Code: undefined = same as the pal; else a MODELS key (null = your default)
    this.pickModel = false;
    this.isRepo = false;    // own branch only makes sense in a git project
    if (this.bot?.folder && !this.bot.machine) {
      exec("git", ["-C", this.bot.folder, "rev-parse", "--is-inside-work-tree"]).then((r) => { this.isRepo = r.code === 0; cx.notify(); }).catch(() => {});
    }
    this.handle = cx.focus_handle();
    this.channel.focus();
    cx.spawn(async (cx) => {
      try { this.agents = (await knownAgents({ on: this.bot?.machine ?? null })).filter((x) => x.installed); } catch { this.agents = []; }
      this.same = this.agents.find((x) => x.key === this.bot?.harness) ?? null;
      cx.notify();
    });
  }

  categories() {
    return [...new Set(Object.values(this.bot?.categories ?? {}).concat("General"))];
  }

  go(cx) {
    const bot = this.bot;
    const space = bot && spaces().find((x) => x.id === bot.space);
    if (!space) return notify({ title: "That pal is gone", level: "warning" });
    const name = "#" + (this.channel.value().trim().replace(/^#/, "").replace(/\s+/g, "-"));
    if (name === "#") return notify({ title: "Name the channel", level: "warning", timeout: 2500 });
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
    let argv = this.harness ? withBypass(this.harness.key, this.harness.run) : (bot.record?.argv ?? (this.same ? withBypass(this.same.key, this.same.run) : undefined));
    // A model picked here goes on this channel's own command line ("Your default" drops the pal's).
    if (this.model !== undefined && argv && (this.harness?.key ?? bot.harness) === "claude") argv = withModel(argv, "claude", this.model);
    updateBot(bot.record ?? bot, (b) => ({
      ...b,
      categories: { ...(b.categories ?? {}), [name]: category },
      briefs: brief ? { ...(b.briefs ?? {}), [name]: brief } : (b.briefs ?? {}),
      brains: this.harness ? { ...(b.brains ?? {}), [name]: this.harness.key } : (b.brains ?? {}),
    }));
    const memory = (bot.memory ?? "").trim();
    const task = [brief && `You are ${bot.name} in ${name}. ${brief}`, memory && `Things to remember: ${memory}`].filter(Boolean).join("\n\n");
    closeOverlay(props().overlay);
    run("tab.new", { space: space.id, name, argv: argv || undefined, folder: bot.folder || undefined, task: argv ? (task || undefined) : undefined });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  render() {
    const t = tone(theme());
    const bot = this.bot;
    if (!bot) return div().p(24).bg(t.popover).text_color(t.dim).child("That pal is gone.");
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const hair = () => div().h(1).mx(16).bg(a(t.foreground, "0c"));
    const row = (id, label, right, action) => h_flex().id(id).items_center().justify_between().gap(12).px(16).min_h(48)
      .when(Boolean(action), (el) => el.cursor_pointer().hover((s) => s.bg(a(t.foreground, "05"))).on_click(action))
      .child(div().flex_none().text_size(13.5).text_color(t.foreground).child(label))
      .child(right);
    const pill = (id, text, on, action) => div().id(id).px(11).py(4).rounded_full().cursor_pointer()
      .bg(on ? a(t.foreground, "1a") : a(t.foreground, "00")).hover((s) => s.bg(a(t.foreground, "10")))
      .text_size(12.5).text_color(on ? t.foreground : t.dim).on_click(action).child(text);

    // Header: whose channel this is.
    const header = h_flex().items_center().gap(12).px(24).pt(22).pb(6)
      .child(mascotEl(bot, mood(null, bot.awake), 34, t))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().text_size(17).font_medium().text_color(t.foreground).child("New channel"))
        .child(div().truncate().text_size(12.5).text_color(t.dim).child(`in ${bot.name}`)))
      .child(div().id("dup-x").size(28).rounded(8).flex().items_center().justify_center().cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "10"))).on_click(() => closeOverlay(props().overlay))
        .child(svg("mods/crew-roster/icons/x.svg").size(13).text_color(t.dim)));

    // The one thing that matters: its name, and optionally what it's for.
    const named = v_flex().rounded(14).bg(a(t.canvas, "aa")).border_1().border_color(a(t.foreground, "10"))
      .child(stop(h_flex().items_center().gap(6).px(16).pt(14).pb(6)
        .child(div().text_size(20).text_color(t.dim).child("#"))
        .child(div().flex_1().child(Input.new(this.channel).w_full().text_size(20).text_color(t.foreground)))))
      .child(stop(div().px(6).pb(6).child(Textarea.new(this.brief).w_full().px(10).py(6).text_size(13.5).text_color(t.foreground))));

    // Settings, one line each.
    const cats = this.categories();
    const category = row("dup-cat", "Category", h_flex().gap(2).items_center().flex_wrap().justify_end()
      .children(cats.map((c, i) => pill(`cat-${i}`, c, this.category === c, (_e, cx) => { this.category = c; cx.notify(); })))
      .child(this.category === "+new"
        ? stop(div().w(120).h(28).px(10).flex().items_center().rounded_full().border_1().border_color(a(t.accent, "66"))
            .child(Input.new(this.newCategory).w_full().text_size(12.5).text_color(t.foreground)))
        : pill("cat-new", "+ New", false, (_e, cx) => { this.category = "+new"; this.newCategory.focus(); cx.notify(); })));

    const current = this.harness ?? this.same;
    const brainName = this.harness ? this.harness.name : `${bot.harnessName ?? "Shell"} (same as ${bot.name.split(" - ")[0]})`;
    const brainRow = row("dup-brain", "Brain", h_flex().items_center().gap(8)
      .when(Boolean(current), (el) => el.child(image(mascot(current.key, "calm")).size(20)))
      .child(div().text_size(13).text_color(t.muted).child(brainName))
      .child(svg(`mods/crew-roster/icons/${this.pickBrain ? "chevron-down" : "chevron-right"}.svg`).size(11).text_color(t.dim)),
      (_e, cx) => { this.pickBrain = !this.pickBrain; cx.notify(); });
    const options = [{ key: null, name: `Same as ${bot.name.split(" - ")[0]}`, sub: bot.harnessName ?? "", ag: null },
      ...this.agents.filter((x) => x.key !== bot.harness).map((x) => ({ key: x.key, name: x.name, sub: "", ag: x }))];
    const brainList = v_flex().px(8).pb(8).children(options.map((o, i) => {
      const on = (this.harness?.key ?? null) === o.key;
      return h_flex().id(`brain-${i}`).items_center().gap(10).px(10).py(7).rounded(10).cursor_pointer()
        .when(on, (el) => el.bg(a(t.foreground, "0c"))).hover((s) => s.bg(a(t.foreground, "08")))
        .on_click((_e, cx) => { this.harness = o.ag; this.pickBrain = false; cx.notify(); })
        .child(image(mascot(o.key ?? bot.harness, "calm")).size(22))
        .child(div().flex_1().text_size(13).text_color(t.foreground).child(o.name))
        .when(Boolean(o.sub), (el) => el.child(div().text_size(12).text_color(t.dim).child(o.sub)))
        .when(on, (el) => el.child(svg("mods/crew-roster/icons/check.svg").size(13).text_color(t.accent)));
    }));

    // Claude Code channels can run on another model than the pal (a cheap helper channel, say).
    const brainKey = this.harness?.key ?? bot.harness;
    const palModel = modelOf(bot.record?.argv);
    const modelName = (k) => MODELS.find((m) => m.key === k)?.name ?? k;
    const modelLabel = this.model === undefined ? `Same as ${bot.name.split(" - ")[0]}${palModel ? ` (${modelName(palModel)})` : ""}` : modelName(this.model);
    const modelRow = brainKey === "claude" ? row("dup-model", "Model", h_flex().items_center().gap(8)
      .child(div().text_size(13).text_color(t.muted).child(modelLabel))
      .child(svg(`mods/crew-roster/icons/${this.pickModel ? "chevron-down" : "chevron-right"}.svg`).size(11).text_color(t.dim)),
      (_e, cx) => { this.pickModel = !this.pickModel; cx.notify(); }) : null;
    const modelOpts = [{ key: undefined, name: `Same as ${bot.name.split(" - ")[0]}`, sub: palModel ? modelName(palModel) : "" }, ...MODELS];
    const modelList = v_flex().px(8).pb(8).children(modelOpts.map((m, i) => {
      const on = this.model === m.key;
      return h_flex().id(`model-${i}`).items_center().gap(10).px(10).py(7).rounded(10).cursor_pointer()
        .when(on, (el) => el.bg(a(t.foreground, "0c"))).hover((s) => s.bg(a(t.foreground, "08")))
        .on_click((_e, cx) => { this.model = m.key; this.pickModel = false; cx.notify(); })
        .child(div().flex_1().text_size(13).text_color(t.foreground).child(m.name))
        .when(Boolean(m.sub), (el) => el.child(div().text_size(12).text_color(t.dim).child(m.sub)))
        .when(on, (el) => el.child(svg("mods/crew-roster/icons/check.svg").size(13).text_color(t.accent)));
    }));

    const toggle = div().w(36).h(22).p(2).rounded_full().bg(this.ownBranch ? t.accent : a(t.foreground, "22")).flex().items_center()
      .when(this.ownBranch, (el) => el.justify_end()).child(div().size(18).rounded_full().bg(t.popover));
    const branchRow = row("dup-branch", "Own branch", h_flex().items_center().gap(10)
      .child(div().text_size(12).text_color(t.dim).child(this.ownBranch ? "you review and land it" : "works on the project directly"))
      .child(toggle), (_e, cx) => { this.ownBranch = !this.ownBranch; cx.notify(); });

    const settings = v_flex().rounded(14).border_1().border_color(a(t.foreground, "10"))
      .child(category).child(hair()).child(brainRow).when(this.pickBrain, (el) => el.child(brainList))
      .when(Boolean(modelRow), (el) => el.child(hair()).child(modelRow).when(this.pickModel, (el) => el.child(modelList)))
      .when(this.isRepo, (el) => el.child(hair()).child(branchRow));

    const ready = Boolean(this.channel.value().trim());
    const footer = h_flex().items_center().justify_between().gap(12).px(24).pt(14).pb(20)
      .child(div().min_w(0).truncate().text_size(12).text_color(t.dim)
        .child(`${bot.memory?.trim() ? "Starts with its memory" : "Shares its project"} · ${bot.machine ?? "this computer"}`))
      .child(h_flex().gap(14).items_center().flex_none()
        .child(div().id("dup-cancel").cursor_pointer().text_size(13.5).text_color(t.muted).on_click(() => closeOverlay(props().overlay)).child("Cancel"))
        .child(div().id("dup-go").px(18).py(9).rounded_full().cursor_pointer().bg(ready ? t.solid : a(t.foreground, "1a"))
          .hover((s) => s.opacity(0.88)).on_click((_e, cx) => this.go(cx))
          .child(div().text_size(13.5).font_medium().text_color(ready ? t.solid_foreground : t.dim).child(this.busy ? "Making its branch…" : "Add channel"))));

    return v_flex().id("crew-duplicate").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().bg(t.popover).text_color(t.foreground)
      .child(header)
      .child(v_flex().gap(12).px(24).pt(12).child(named).child(settings))
      .child(footer);
  }
}
