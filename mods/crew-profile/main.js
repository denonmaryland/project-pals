// Project Pals profile panel (DeNon 2026-11-08): a right-side panel, hidden until you open a pal's
// profile from the hero's name, the Profile quick action, the pal menus or Ctrl+Shift+I. Esc (while
// it has the keyboard), its × or the same trigger again close it, and the terminal gets its full
// width back. It always shows the shown pal. Two sizes: Side (beside the terminal, 420 px by
// default, 360-640, remembered) and Full (the work area). See docs/profiles/proposal.md.
//
// Tabs, in two groups: the agent (Profile, Notebook) ‖ its project (Mission, Brain, AGENTS.md: project.js).
// Profile: identity, facts, stats, channels (Review on worktree channels), memory, routines, actions.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import { spaces, panes, agents, theme, run, exec, settings, notify, openOverlay, nextCommand, shared, props } from "herdr";
import {
  crew, botOf, mascotEl, mood, petOf, petReady, petEl, petState, channelName, ago, loadOps, crewCli, taskOf, updateBot,
  ds, tone, panelState, panelTab, panelFull, panelOpen, closePanel, openPanel, setPanelSize, worktreeOf, openReview, briefOf, taskTitle,
  tabHasAgent, leadPane, modelOf, rememberModel, showTabs, channelOrder, TAG_WORDS,
} from "./crew.js";
import { initProject, ensureProject, loadAgents, loadBrain, missionTab, brainTab, agentsTab, agentsBadge, badgeTag } from "./project.js";
import { initDash, renderDash } from "./dash.js";
import { initNotebook, notebookTab } from "./notebook.js";

const ICON = "mods/crew-roster/icons";
// The tabs built so far, as [key, label]; "|" is the divider between the pal and its project.
const TABS = [["profile", "Profile"], ["notebook", "Notebook"], ["|"], ["mission", "Mission"], ["brain", "Brain"], ["agents", "AGENTS.md"]];
const STATE_DOT = (d) => ({ work: d.info, ask: d.warn, stuck: d.warn, done: d.ok, pr: d.ok, merged: "#A78BFA", closing: d.err });

export default class CrewProfile extends View {
  init(_props, cx) {
    this.h = cx.focus_handle();
    this.ops = { approvals: [], tasks: [], routines: [], stalled: {} };
    this.mem = null;          // pal memory --json for the shown pal
    this.memFor = null;
    this.seenAt = 0;
    this.pinned = TextareaState.new({ placeholder: "Pin a note every session of this pal starts with…", rows: 2 });
    this.pinned.set_auto_grow(2, 6);
    this.pinned.on("blur", (_e, cx) => this.savePinned(cx));
    this.remember = InputState.new({ placeholder: "Remember something for this pal…" });
    this.remember.on("submit", (_e, cx) => this.addFact(cx));
    this.role = InputState.new({ placeholder: "What this pal does" });
    this.role.on("submit", (_e, cx) => this.saveRole(cx));
    this.role.on("blur", (_e, cx) => this.saveRole(cx));
    this.editingRole = false;
    this.showRemember = false;
    // The Full dashboard's parts (props.part: head, left, board, tbar) are copies of this mod too:
    // each loads only what it shows (dash.js).
    this.part = props()?.part ?? "main";
    if (this.part !== "main") {
      initDash(this, cx, this.part);
      if (this.part === "left") this.loadMemory(cx, true);
      if (this.part === "head") {
        loadBrain(this, cx, true);
        cx.timer.every(250, () => { const st = panelState(); if (st.at && st.at !== this.seenAt && this.isOpen()) { this.seenAt = st.at; this.h.focus(); } });
      }
      return;
    }
    const ops = (cx) => cx.spawn(async (cx) => { try { this.ops = await loadOps(); } catch {} cx.notify(); });
    ops(cx);
    cx.timer.every(5000, (cx) => { if (this.isOpen()) ops(cx); });
    cx.timer.every(8000, (cx) => { if (this.isOpen()) this.loadMemory(cx, true); });
    // A new open (any trigger stamps crew.panel.at): take the keyboard, so Esc closes the panel,
    // and read the shown pal's memory now. Polled, not done in render (no side effects there).
    cx.timer.every(250, (cx) => {
      const st = panelState();
      if (st.at && st.at !== this.seenAt && this.isOpen()) { this.seenAt = st.at; this.h.focus(); this.loadMemory(cx, true); }
      const s = this.shown();
      if (s && this.isOpen() && this.memFor !== s.bot.name && !this.loadingFor) { this.loadingFor = s.bot.name; this.loadMemory(cx, true); }
    });
    // Mission, Brain and AGENTS.md (project.js): their data, editors and timers.
    initProject(this, cx);
    initNotebook(this, cx);
    // What the shown tab needs, and the AGENTS.md tab's lint badge for the shown pal.
    cx.timer.every(400, (cx) => {
      const s = this.shown();
      if (!s || !this.isOpen()) return;
      ensureProject(this, cx, s.bot);
      if (this.agentsFor !== s.bot.name && !this.agentsLoading) loadAgents(this, cx, true);
    });
    // pane.go sends "focus" when it moves onto the panel.
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "focus") this.h.focus(); cx.notify(); } });
  }

  isOpen() { return panelOpen(); }

  shown() {
    const all = spaces();
    const space = all.find((s) => s.active);
    return space ? { space, bot: botOf(space) } : null;
  }

  loadMemory(cx, quiet = false) {
    const s = this.shown();
    if (!s) return;
    const name = s.bot.name;
    cx.spawn(async (cx) => {
      try {
        const m = JSON.parse(await crewCli(["memory", name, "--json"]));
        if (this.shown()?.bot.name !== name) return;
        const first = this.memFor !== name;
        this.mem = m;
        this.memFor = name;
        this.loadingFor = null;
        // The pinned note's box shows the record's note, unless you're typing in it.
        if (first || (!quiet && !this.pinnedDirty)) this.pinned.set_value(m.pinned ?? "");
      } catch { if (!quiet) this.mem = null; this.loadingFor = null; this.memFor = name; }
      cx.notify();
    });
  }

  savePinned(cx) {
    const s = this.shown();
    if (!s?.bot.record) return;
    const text = this.pinned.value().trim();
    if (text === (s.bot.record.memory ?? "").trim()) return;
    updateBot(s.bot.record, (b) => ({ ...b, memory: text }));
    notify({ title: `Pinned for ${s.bot.name}`, body: text ? "Every new session starts with it." : "Pinned note cleared.", level: "success", timeout: 2000 });
    this.loadMemory(cx);
  }

  addFact(cx) {
    const s = this.shown();
    const fact = this.remember.value().trim();
    if (!s || !fact) return;
    this.remember.set_value("");
    cx.spawn(async (cx) => {
      try { await crewCli(["remember", fact, "--bot", s.bot.name]); this.showRemember = false; }
      catch (e) { notify({ title: "Couldn't save it", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      this.loadMemory(cx);
    });
  }

  saveRole(cx) {
    if (!this.editingRole) return;
    this.editingRole = false;
    const s = this.shown();
    const role = this.role.value().trim();
    if (s?.bot.record && role !== (s.bot.record.role ?? "")) updateBot(s.bot.record, (b) => ({ ...b, role: role || undefined }));
    cx.notify();
  }

  go(space, tab) {
    showTabs();
    run("space.select", { id: space.id });
    run("tab.select", { id: tab.id });
    // In Full the terminal is hidden: showing a channel means seeing it.
    if (panelFull()) closePanel();
  }

  sleep(space, bot) {
    updateBot(bot.record ?? bot, (b) => ({ ...b, folder: b.folder ?? space.folder ?? null, harness: b.harness ?? bot.harness ?? null }));
    return (cx) => cx.spawn(async () => { try { await rememberModel(space); } catch {} run("space.close", { id: space.id }); });
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    const s = this.shown();
    if (this.part !== "main") {
      // The panel's left edge: a hairline on the parts that touch it (the header and the channels).
      return div().id(`crew-profile-${this.part}`).size_full().when(this.part === "head" || this.part === "left", (el) => el.border_l_1().border_color(d.line))
        .track_focus(this.h).on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); closePanel(); } })
        .child(renderDash(this, this.part, t, d));
    }
    const root = v_flex().id("crew-profile").size_full().bg(d.bg1).border_l_1().border_color(d.line)
      .track_focus(this.h)
      // Esc: out of an edit or a review first, else close the panel.
      .on_key_down((e, cx) => {
        if (e.key !== "escape" || this.editingRole) return;
        cx.stop_propagation();
        if (this.edit || this.review) { this.edit = null; this.review = null; cx.notify(); return; }
        closePanel();
      });
    if (!s) return root.child(div().p(16).text_size(13).text_color(d.fg3).child("No pal shown."));
    const { space, bot } = s;
    const full = panelFull();
    const tab = panelTab();
    const scroll = (el) => div().id(`pf-scroll-${tab}`).flex_1().min_h(0).overflow_y_scrollbar().child(full ? div().max_w(980).child(el) : el);
    return root
      .child(this.header(space, bot, d, full))
      .child(this.tabs(d, bot))
      .child(tab === "notebook" ? scroll(notebookTab(this, space, bot, d, full))
        : tab === "mission" ? scroll(missionTab(this, space, bot, d, full))
        : tab === "brain" ? scroll(brainTab(this, space, bot, d, full))
        : tab === "agents" ? scroll(agentsTab(this, space, bot, d, full))
        : this.profileTab(space, bot, t, d, full));
  }

  // 52 px: the pet chip, the name, ⤢ / ⤡ and ×.
  header(space, bot, d, full) {
    const tab = space.tabs.find((x) => x.active);
    const btn = (id, icon, tip, act) => div().id(id).size(28).flex().flex_none().items_center().justify_center().rounded(d.r.sm)
      .border_1().border_color(d.lineMid).cursor_pointer().tooltip(tip).hover((s) => s.bg(d.hover).border_color(d.lineStrong))
      .on_click((_e, cx) => { act(); cx.notify(); })
      .child(svg(`${ICON}/${icon}.svg`).size(13).text_color(d.fg2));
    return h_flex().h(52).flex_none().items_center().gap(10).pl(16).pr(10).border_b_1().border_color(d.line)
      .child(mascotEl(bot, mood(tab?.status, bot.awake || bot.starting), 30))
      .child(div().flex_1().min_w(0).truncate().text_size(14).line_height("18px").font_weight(600).text_color(d.fg1).child(bot.name))
      .child(btn("pf-size", full ? "ds-side" : "ds-full", full ? "Side: beside the terminal" : "Full: the whole work area", () => setPanelSize(full ? "side" : "full")))
      .child(btn("pf-close", "ds-x", "Close (Esc)", () => closePanel()));
  }

  // 36 px: rectangular tabs; the pal's on the left of the divider, its project's on the right.
  tabs(d, bot) {
    const cur = panelTab();
    const strip = h_flex().h(36).flex_none().items_center().gap(2).px(12).border_b_1().border_color(d.line);
    const badge = agentsBadge(this, bot);
    for (const [key, label] of TABS) {
      if (key === "|") { strip.child(div().w(1).h(16).mx(6).bg(d.lineMid)); continue; }
      const on = cur === key;
      strip.child(h_flex().id(`pf-tab-${key}`).h(26).px(8).gap(6).items_center().rounded(d.r.sm).border_1()
        .border_color(on ? d.lineMid : "#00000000").when(on, (el) => el.bg(d.sel))
        .when(!on, (el) => el.cursor_pointer().hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => { this.edit = null; this.review = null; openPanel(key); cx.notify(); }))
        .text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child(label)
        .when(key === "agents" && Boolean(badge), (el) => el.child(badgeTag(d, badge[1], badge[0]))));
    }
    return strip;
  }

  // ─── Profile ───────────────────────────────────────────────────────────────────────────────
  profileTab(space, bot, t, d, full) {
    const sec = (id, label, body, act) => v_flex().id(`pf-${id}`).flex_none().py(14).border_t_1().border_color(d.line)
      .child(h_flex().items_center().gap(8).mb(8)
        .child(div().text_size(10).line_height("14px").font_family(d.mono).font_weight(500).text_color(d.fg3).child(label.toUpperCase()))
        .child(div().flex_1())
        .when(Boolean(act), (el) => el.child(act)))
      .child(body);
    const identity = this.identity(space, bot, t, d);
    const facts = sec("facts", "Facts", this.facts(space, bot, d), this.link("pf-look", "Customize look", d, () => openOverlay({ mod: "crew-look", kind: "dialog", width: 520, props: { space: space.id } })));
    const stats = v_flex().flex_none().py(14).border_t_1().border_color(d.line).child(this.stats(space, bot, d, full));
    const channels = sec("channels", "Channels", this.channels(space, bot, d));
    const memory = sec("memory", "Memory", this.memory(bot, d), h_flex().gap(10)
      .child(this.link("pf-remember", "Remember…", d, () => { this.showRemember = !this.showRemember; if (this.showRemember) this.remember.focus(); }))
      .when(Boolean(this.mem?.folder), (el) => el.child(this.link("pf-memfolder", "Open folder", d, () => exec("xdg-open", [this.mem.folder]).catch(() => {})))));
    const routines = sec("routines", "Routines", this.routines(bot, d), this.link("pf-routines", "Manage", d, () => openOverlay({ mod: "crew-routines", kind: "dialog", width: 520 })));
    const actions = v_flex().flex_none().py(14).border_t_1().border_color(d.line).child(this.actions(space, bot, d));
    // The chip menu's Memory opens the tab with Memory first.
    const memFirst = panelState().section === "memory";
    if (full) {
      const left = v_flex().w(380).flex_none().child(identity).child(facts).child(stats).child(routines).child(actions);
      const right = v_flex().flex_1().min_w(0).child(memFirst ? memory : channels).child(memFirst ? channels : memory);
      return div().id("pf-body").flex_1().min_h(0).overflow_y_scrollbar()
        .child(h_flex().items_start().gap(32).px(24).pb(24).child(left).child(right));
    }
    const body = v_flex().px(16).pb(24).child(identity);
    if (memFirst) body.child(memory);
    body.child(facts).child(stats).child(channels);
    if (!memFirst) body.child(memory);
    body.child(routines).child(actions);
    return div().id("pf-body").flex_1().min_h(0).overflow_y_scrollbar().child(body);
  }

  link(id, text, d, act) {
    return div().id(id).text_size(11).line_height("14px").font_weight(500).text_color(d.fg2).cursor_pointer()
      .hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => { act(cx); cx.notify(); }).child(text);
  }

  // The pet (96 px, on the soft aura) and the name, role (click to edit) and state.
  identity(space, bot, t, d) {
    const tab = space.tabs.find((x) => x.active);
    const m = mood(tab?.status ?? space.status, bot.awake || bot.starting);
    const p = petOf(bot);
    const state = petState(bot, m);
    const W = 96, H = 75;
    const pet = div().relative().w(W).h(H).flex_none()
      .child(div().absolute().left(-16).top(-12).w(W + 32).h(H + 25).child(image(`${ICON}/pet-aura.svg`).w(W + 32).h(H + 25)))
      .child(div().absolute().left(0).top(0).child(p && petReady(p) ? petEl(p, state, W, H, { open: true })
        : div().w(W).h(H).flex().items_center().justify_center().child(mascotEl(bot, m, 56, t))));
    const word = !bot.awake ? (bot.starting ? "Starting" : "Asleep") : TAG_WORDS[state] ?? "Resting";
    const since = state === "work" || state === "ask" ? ago(tab?.changed_at) : "";
    const dot = STATE_DOT(d)[state];
    const role = this.editingRole
      ? div().h(26).px(8).flex().items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color(d.lineMid)
        .child(Input.new(this.role).w_full().text_size(12).text_color(d.fg1))
      : div().id("pf-role").text_size(12).line_height("16px").text_color(bot.role ? d.body : d.fg3).cursor_pointer()
        .hover((s) => s.text_color(d.fg1)).tooltip("Click to change")
        .on_click((_e, cx) => { if (!bot.record) return; this.role.set_value(bot.role ?? ""); this.editingRole = true; this.role.focus(); cx.notify(); })
        .child(bot.role || "Add a role");
    return h_flex().flex_none().items_center().gap(14).pt(16).pb(14)
      .child(pet)
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(div().text_size(16).line_height("20px").font_weight(600).text_color(d.fg1).child(bot.name))
        .child(role)
        .child(h_flex().items_center().gap(6).mt(2)
          .when(Boolean(dot), (el) => el.child(div().size(7).rounded(4).bg(dot)))
          .child(div().text_size(12).line_height("16px").font_weight(500).text_color(dot === d.info ? d.infoText : dot === d.warn ? d.warnText : dot ? d.okHi : d.fg2)
            .child(since && since !== "now" ? `${word} · ${since}` : word))));
  }

  facts(space, bot, d) {
    const tab = space.tabs.find((x) => x.active);
    const lead = tab ? leadPane(tab.id, panes()) : null;
    const model = modelOf(bot.record?.argv);
    const p = petOf(bot);
    const hired = bot.hired ? new Date(bot.hired).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
    const rows = [
      ["brain", (bot.harnessName ?? (bot.harness ? bot.harness : "no agent running")) + (model ? ` · ${model}` : ""), false],
      ["folder", (bot.folder ?? space.folder ?? "").replace(/^\/home\/[^/]+/, "~"), true],
      ["machine", bot.machine ?? "this computer", false],
      ["branch", lead?.branch ?? null, true],
      ["pet", p ? `${p.species} · ${p.acc.join(" + ") || "nothing"}` : "folder mascot", false],
      ["hired", hired ? `${hired}${bot.hiredBy ? ` · by ${bot.hiredBy}` : ""}` : null, false],
    ].filter(([, v]) => v);
    return v_flex().children(rows.map(([k, v, mono], i) => h_flex().h(30).items_center().gap(10)
      .when(i < rows.length - 1, (el) => el.border_b_1().border_color(d.lineSoft))
      .child(div().w(72).flex_none().text_size(11).font_family(d.mono).text_color(d.fg3).child(k))
      .child(div().flex_1().min_w(0).truncate().text_size(mono ? 12 : 13).when(mono, (el) => el.font_family(d.mono)).text_color(d.body)
        .when(k === "pet", (el) => el.child(h_flex().items_center().gap(6).child(div().size(12).rounded(3).bg(p?.color ?? d.fg4)).child(v)))
        .when(k !== "pet", (el) => el.child(v)))));
  }

  stats(space, bot, d, full) {
    const mine = this.ops.tasks.filter((x) => taskOf(x, bot.name));
    const last = Math.max(0, ...space.tabs.map((x) => x.changed_at ?? 0));
    const cells = [
      [String(space.tabs.length), space.tabs.length === 1 ? "Channel" : "Channels"],
      [String(mine.filter((x) => x.status === "done").length), "Tasks done"],
      [String(mine.filter((x) => ["open", "claimed", "blocked"].includes(x.status)).length), "Open tasks"],
      [!bot.awake ? "asleep" : last ? ago(last) : "—", "Last active"],
    ];
    const cols = full ? 4 : 2;
    const grid = v_flex().rounded(d.r.md).border_1().border_color(d.line);
    for (let r = 0; r < cells.length / cols; r++) {
      const row = h_flex().when(r > 0, (el) => el.border_t_1().border_color(d.line));
      cells.slice(r * cols, r * cols + cols).forEach(([v, l], i) => row.child(v_flex().flex_1().px(12).py(9)
        .when(i > 0, (el) => el.border_l_1().border_color(d.line))
        .child(div().text_size(18).line_height("22px").font_weight(600).text_color(d.fg1).child(v))
        .child(div().text_size(11).line_height("14px").text_color(d.fg2).child(l))));
      grid.child(row);
    }
    return grid;
  }

  // One row per channel: its state, name and time; what it's on (else its brief); its worktree
  // branch with Review. Click: show it.
  channels(space, bot, d) {
    const all = agents();
    const ps = panes();
    const list = v_flex().rounded(d.r.md).border_1().border_color(d.line);
    channelOrder(space, bot).forEach((tab, i) => {
      const ag = all.filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0];
      const awake = tabHasAgent(tab, ps);
      const status = awake ? tab.status : null;
      const dot = { working: d.info, blocked: d.warn, done: d.ok }[status] ?? null;
      const word = !awake ? "no agent" : { working: "working", blocked: "asks you", done: "done", idle: "idle" }[status] ?? "idle";
      const since = awake ? ago(tab.changed_at) : "";
      const on = taskTitle(ag?.title, bot.name, space.name, channelName(tab)) ?? briefOf(bot, tab)?.split("\n")[0] ?? null;
      const wt = worktreeOf(bot, tab);
      list.child(v_flex().id(`pf-ch-${tab.id}`).px(10).py(7).gap(3).cursor_pointer()
        .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
        .when(tab.active, (el) => el.bg(d.sel)).hover((s) => s.bg(d.hover))
        .on_click((_e, cx) => { this.go(space, tab); cx.notify(); })
        .child(h_flex().items_center().gap(8)
          .child(dot ? div().size(7).flex_none().rounded(4).bg(dot) : div().size(7).flex_none().rounded(4).border_1().border_color(d.fg4))
          .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).font_weight(500).text_color(d.fg1).child(`#${channelName(tab)}`))
          .child(div().flex_none().text_size(11).text_color(status === "blocked" ? d.warnText : d.fg3).child(since && since !== "now" ? `${word} ${since}` : word)))
        .when(Boolean(on), (el) => el.child(div().pl(15).truncate().text_size(12).line_height("16px").text_color(d.body).child(on)))
        .when(Boolean(wt), (el) => el.child(h_flex().pl(15).items_center().gap(6)
          .child(div().h(18).px(5).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid)
            .text_size(10).font_family(d.mono).text_color(d.fg2).child(`worktree · ${wt.branch ?? channelName(tab)}`))
          .child(div().flex_1())
          .child(div().id(`pf-review-${tab.id}`).h(20).px(7).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid)
            .cursor_pointer().hover((s) => s.border_color(d.lineStrong).bg(d.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); openReview(space, tab); })
            .text_size(11).font_weight(500).text_color(d.body).child("Review")))));
    });
    return list;
  }

  // The pinned note, what it remembers (MEMORY.md, then the last notes), and how much of it a new
  // session actually starts with (the primer keeps the last 6,000 characters).
  memory(bot, d) {
    const m = this.mem?.bot === bot.name ? this.mem : null;
    const col = v_flex().gap(10);
    col.child(v_flex().px(10).py(8).rounded(d.r.md).bg(d.inset).border_1().border_color(d.lineMid)
      .child(div().text_size(10).font_family(d.mono).text_color(d.fg3).mb(2).child(`Pinned by ${shared("crew.settings")?.owner ?? "you"}`))
      .child(Textarea.new(this.pinned).w_full().text_size(12).text_color(d.body)));
    if (this.showRemember) col.child(div().h(30).px(10).flex().items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color(d.lineStrong)
      .child(Input.new(this.remember).w_full().text_size(12).text_color(d.fg1)));
    if (!m) return col.child(div().text_size(12).text_color(d.fg3).child("Reading its memory…"));
    // What reaches a new session.
    const cut = m.parts.filter((x) => x.kept < x.chars);
    const over = m.total > m.limit;
    col.child(h_flex().items_start().gap(8)
      .child(div().mt(5).w(64).h(4).flex_none().rounded(2).bg(d.lineMid)
        .child(div().h(4).rounded(2).bg(over ? d.warn : d.fg2).w(Math.max(2, Math.round(64 * Math.min(1, m.total / m.limit))))))
      .child(div().flex_1().text_size(11).line_height("15px").text_color(over ? d.warnText : d.fg3)
        .child(over
          ? `A new session starts with ${m.limit.toLocaleString()} of ${m.total.toLocaleString()} characters: ${cut.map((x) => x.kept ? `part of ${x.label}` : x.label).join(", ")} ${cut.length === 1 ? "is" : "are"} cut.`
          : `A new session starts with all ${m.total.toLocaleString()} characters (of ${m.limit.toLocaleString()}).`)));
    if ((m.memory_md ?? "").trim()) {
      col.child(div().text_size(10).font_family(d.mono).text_color(d.fg3).child("MEMORY.md"));
      col.child(div().px(10).py(6).rounded(d.r.md).border_1().border_color(d.line).text_size(12).text_color(d.body)
        .child(TextView.markdown("pf-memory-md", m.memory_md.slice(0, 4000))));
    }
    for (const n of m.notes.slice(0, 2)) {
      col.child(div().text_size(10).font_family(d.mono).text_color(d.fg3).child(`Notes · ${n.day}`));
      col.child(v_flex().gap(4).children(n.lines.slice(0, 6).map((l) => {
        const mm = l.match(/^(\d\d:\d\d)(?:\s+(#\S+))?:\s*([\s\S]*)$/);
        return h_flex().items_start().gap(8)
          .child(div().w(84).flex_none().text_size(10).line_height("16px").font_family(d.mono).text_color(d.fg3).child(mm ? `${mm[1]}${mm[2] ? " " + mm[2] : ""}` : ""))
          .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(d.body).child(mm ? mm[3] : l));
      })));
      if (n.lines.length > 6) col.child(div().text_size(11).text_color(d.fg3).child(`${n.lines.length - 6} more that day`));
    }
    if (m.user_facts) col.child(div().text_size(11).text_color(d.fg3).child(`Also knows ${m.user_facts} facts about ${shared("crew.settings")?.owner ?? "you"} (USER.md, shared by every pal).`));
    return col;
  }

  routines(bot, d) {
    const mine = (this.ops.routines ?? []).filter((r) => String(r.bot ?? r.pal ?? r.target ?? "").split("#")[0].toLowerCase() === bot.name.toLowerCase());
    if (!mine.length) return div().text_size(12).text_color(d.fg3).child("No routines.");
    return v_flex().gap(4).children(mine.map((r) => h_flex().items_center().gap(10).h(24)
      .child(div().w(150).flex_none().truncate().text_size(11).font_family(d.mono).text_color(d.fg2).child(r.schedule ?? r.when ?? ""))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.body).child(r.name ?? r.title ?? r.prompt ?? ""))));
  }

  actions(space, bot, d) {
    const tab = space.tabs.find((x) => x.active);
    const btn = (id, icon, text, act) => h_flex().id(id).h(28).flex_1().items_center().justify_center().gap(6).rounded(d.r.sm)
      .bg(d.raised).border_1().border_color(d.lineMid).cursor_pointer().hover((s) => s.bg(d.hover).border_color(d.lineStrong))
      .on_click((_e, cx) => { act(cx); cx.notify(); })
      .child(svg(`${ICON}/${icon}.svg`).size(12).text_color(d.iconOn))
      .child(div().text_size(12).font_weight(500).text_color(d.body).child(text));
    return v_flex().gap(6)
      .child(h_flex().gap(6)
        .child(btn("pf-tell", "ds-tell", "Tell", () => openOverlay({ mod: "crew-tell", kind: "dialog", width: 460, props: { space: space.id, tab: tab?.id } })))
        .child(btn("pf-channel", "ds-plus", "Channel", () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id } }))))
      .child(h_flex().gap(6)
        .child(btn("pf-look", "ds-user", "Customize look", () => openOverlay({ mod: "crew-look", kind: "dialog", width: 520, props: { space: space.id } })))
        .when(!bot.god, (el) => el.child(btn("pf-sleep", "ds-moon", "Put to sleep", (cx) => this.sleep(space, bot)(cx)))));
  }
}
