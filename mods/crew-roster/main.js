// Project Pals roster: your pals (left pane of the Project Pals layout). Every space is a pal, a project with a
// brain; its tabs are its channels, shown along the top (crew-tabs), not here. Pals tab: each
// pal's mascot shows its most urgent channel, with a pill for its channel count (red when one is
// blocked). Inbox tab: every channel that needs you, across all pals and machines.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, agents, run, theme, openOverlay, machines, shared, setShared, nextCommand, layout, notify } from "herdr";
import {
  crew, botOf, sleepers, mascotFor, mascotEl, mood, channelName, harnessName, ago, a,
  migrateChannelKeys, linkRecords, updateBot,
  STATUS_RANK, WAVE, statusColor, statusWord, rooms, roomMembers, shownRoom, showRoom, showTabs, adoptRooms, serveRequests,
  loadOps, crewCli, taskOf, findChannel, ensureLooks, chatPref, setChatPref, syncSettings, owner as ownerName, marks, headName, autoColor, orderPins, pinPal, wakePal, wantsTo, tone,
  layoutMode, applyMode, setMode, toggleMode, rememberWidths, modePref, ds, leadPane } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const RAIL = 64;

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
// The rail goes by the sidebar's width, so dragging its edge narrow works too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
function toggleRail() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow() && width) setShared("crew.sidebar.width", width);
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("crew.sidebar.width") ?? modePref("focus", "sidebarPx")) : RAIL });
}

export default class CrewRoster extends View {
  init(_props, cx) {
    // Relative times ("4m") stay true.
    cx.timer.every(60000, (cx) => cx.notify());
    // Channel data follows tab ids, so renames keep categories and briefs.
    migrateChannelKeys();
    cx.timer.every(5000, () => { migrateChannelKeys(); linkRecords(); });
    // New channels get a color from the theme's palette right away.
    autoColor();
    // A pal renamed (from its menu or in Herdr): its memory and routines follow the new name.
    this.seen = JSON.parse(localStorage.getItem("space-names") ?? "{}");
    cx.timer.every(2000, (cx) => this.followRenames(cx));
    cx.timer.every(1500, (cx) => {
      let changed = autoColor();
      // Pinned channels stay first when tabs are dragged or new ones open beside them.
      const m = marks().tabs ?? {};
      for (const sp of spaces()) if (sp.tabs.some((x) => m[x.id]?.pin) && orderPins(sp)) changed = true;
      if (changed) cx.notify();
    });
    // Rooms opened with `pal-room new` show up here.
    const adopt = (cx) => cx.spawn(async () => { try { await adoptRooms(); } catch {} });
    adopt(cx);
    cx.timer.every(3000, (cx) => adopt(cx));
    // `pal hire` / `pal channel` / `pal-room invite` from pals' terminals are carried out here.
    const serve = (cx) => cx.spawn(async (cx) => { try { await serveRequests(); } catch {} cx.notify(); });
    cx.timer.every(1200, (cx) => serve(cx));
    // Settings (owner name, bypass) from data/crew-settings.json, for every Project Pals mod.
    // Then lay the window out in the remembered mode (Focus on a fresh setup), and follow a mode
    // set from elsewhere (`pal settings layout pro`, another window).
    const sync = (first) => cx.spawn(async (cx) => {
      try { await syncSettings(); } catch {}
      if (first || (this.modeReady && shared("crew.mode.applied") !== layoutMode())) { applyMode(layoutMode()); this.modeReady = true; cx.notify(); }
    });
    sync(true);
    cx.timer.every(3000, () => sync(false));
    // Each mode keeps its own widths: a drag is remembered for the mode it was made in.
    cx.timer.every(2000, () => { if (this.modeReady) rememberWidths(); });
    // Custom looks whose art is missing get drawn again.
    const draw = (cx) => cx.spawn(async (cx) => { try { if (await ensureLooks()) cx.notify(); } catch {} });
    draw(cx);
    cx.timer.every(5000, (cx) => draw(cx));
    // Tasks, approvals, routines and stuck channels (kept by crewd and the crew command).
    this.ops = { approvals: [], tasks: [], routines: [], stalled: {}, daemon: true };
    const ops = (cx) => cx.spawn(async (cx) => { try { this.ops = await loadOps(); } catch {} cx.notify(); });
    ops(cx);
    cx.timer.every(2500, (cx) => ops(cx));
    this.refreshOps = ops;
    // Add a task from the Tasks view: "title" or "@Pal title".
    this.taskInput = InputState.new({ placeholder: "Add a task, @Pal to assign it" });
    this.taskInput.on("submit", (_e, cx) => this.addTask(cx));
    // keys.json / herdr-app do: crew-roster.hire, crew-roster.routines, crew-roster.channel (add one to the shown pal), crew-roster.you / .pals.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "hire") this.hire();
        else if (c === "routines") this.routines();
        else if (c === "chat") { const tb = spaces().find((x) => x.active)?.tabs.find((x) => x.active); if (tb) setChatPref(tb.id, !chatPref(tb.id)); }
        else if (c === "look") { const sp = spaces().find((x) => x.active); if (sp) this.look(sp); }
        else if (c === "channel" || c === "duplicate") { const s = spaces().find((x) => x.active); if (s) this.duplicate(botOf(s)); }
        else if (c === "you" || c === "bots") setShared("crew.view", c);
        // Focus ⇄ Pro: crew-roster.mode toggles (Ctrl+Shift+M); .focus / .pro pick one.
        else if (c === "mode") toggleMode();
        else if (c === "mode.focus" || c === "focus") setMode("focus");
        else if (c === "mode.pro" || c === "pro") setMode("pro");
        cx.notify();
      }
    });
  }

  view() { const v = shared("crew.view"); return v === "you" || v === "rooms" || v === "tasks" ? v : "bots"; }

  addTask(cx) {
    const raw = this.taskInput.value().trim();
    if (!raw) return;
    const m = raw.match(/^@(\S+)\s+([\s\S]+)$/);
    const args = m ? ["task", "add", m[2], "--for", m[1].replace(/[-_]/g, " ")] : ["task", "add", raw];
    this.taskInput.set_value("");
    cx.spawn(async (cx) => {
      try { await crewCli(args); } catch (e) { notify({ title: "Couldn't add the task", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      this.refreshOps(cx);
    });
  }

  decide(a, approve, cx) {
    cx.spawn(async (cx) => {
      try {
        await crewCli([approve ? "approve" : "deny", a.id, "--inbox"]);
        notify({ title: approve ? `Approved for ${a.bot}` : `Declined for ${a.bot}`, body: a.command.slice(0, 120), level: approve ? "success" : "info", timeout: 3000 });
      } catch (e) { notify({ title: "Couldn't decide", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      this.refreshOps(cx);
    });
  }

  // A pal by name (as tasks and approvals name them) → its space and a channel to show.
  locate(spec) {
    const f = findChannel(spec ?? "");
    return f.error ? null : f;
  }

  go(space, tab) {
    showTabs();
    run("space.select", { id: space.id });
    if (tab) run("tab.select", { id: tab.id });
  }

  // A hired pal whose space was closed: open it again with its first channel.
  wake(rec) { wakePal(rec); }

  followRenames(cx) {
    if (this.renaming) return;
    const all = spaces();
    const save = () => localStorage.setItem("space-names", JSON.stringify(this.seen));
    const moved = all.find((s) => this.seen[s.id] && this.seen[s.id] !== s.name && s.named);
    // New spaces (and remote ones) just get remembered.
    let fresh = false;
    for (const s of all) if (!this.seen[s.id]) { this.seen[s.id] = s.name; fresh = true; }
    if (fresh) save();
    if (!moved) return;
    const old = this.seen[moved.id], name = moved.name;
    const rec = crew().bots.find((b) => b.space === moved.id);
    this.renaming = true;
    cx.spawn(async (cx) => {
      try {
        // The head pal's name is a setting; that path also renames its record.
        if (rec?.god) await crewCli(["settings", "head", name]);
        else { await crewCli(["renamed", old, name]); if (rec) updateBot(rec, (b) => ({ ...b, name })); }
        this.seen[moved.id] = name;
        save();
        notify({ title: `${old.split(" - ")[0]} is now ${name.split(" - ")[0]}`, body: "Its memory and routines moved with it.", level: "success", timeout: 3000 });
      } catch (e) {
        // Couldn't move its memory (a folder with the new name already exists, say): put the old
        // name back so nothing is left behind.
        run("space.rename", { id: moved.id, name: old });
        notify({ title: `Couldn't rename ${old.split(" - ")[0]}`, body: String(e.message ?? e).slice(0, 200), level: "warning", timeout: 6000 });
      }
      this.renaming = false;
      cx.notify();
    });
  }

  look(space) { openOverlay({ mod: "crew-look", kind: "dialog", width: 520, props: { space: space.id } }); }
  menu(space) { openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "pal", space: space.id } }); }
  routines() { openOverlay({ mod: "crew-routines", kind: "dialog", width: 520 }); }
  hire() { openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true }); }
  duplicate(bot) { openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: bot.space } }); }

  render() {
    const t = tone(theme());
    const all = spaces();
    const ps = panes();
    const c = crew();
    const only = shared("crew.demo");
    const rows = (only ? all.filter((s) => only.includes(s.name)) : all).map((space) => ({ space, bot: botOf(space, c, ps) }))
      // The head pal sits above everyone; then whoever needs you most.
      .sort((x, y) => (y.bot.god ? 1 : 0) - (x.bot.god ? 1 : 0) || (STATUS_RANK[y.space.status] ?? 0) - (STATUS_RANK[x.space.status] ?? 0) || x.space.index - y.space.index);
    const asleep = sleepers(all, c);
    // Inbox: channels that finished while you weren't looking ("done"), and the rare question ("blocked").
    const waiting = rows.flatMap((r) => r.space.tabs.filter((tb) => tb.status === "blocked" || tb.status === "done").map((tab) => ({ ...r, tab })));
    // Also waiting on you: commands held for approval, and channels that look stuck.
    const extra = this.ops.approvals.length + Object.keys(this.ops.stalled).length;
    if (narrow()) return this.rail(rows, waiting, t, extra);
    if (layoutMode() === "pro") return this.proColumn(rows, waiting, t, extra);

    // The head pal sits above everyone, big and centered. Pinned pals come next, in the order
    // they were pinned (while their space is open; a closed one waits under Asleep, where a
    // right-click unpins it); the rest sort by who needs you, and those with no brain running
    // fold away.
    const god = rows.find((r) => r.bot.god);
    const pins = marks().pals ?? {};
    const pinned = rows.filter((r) => !r.bot.god && pins[r.bot.id]?.pin).sort((x, y) => pins[x.bot.id].pin - pins[y.bot.id].pin);
    const loose = rows.filter((r) => !r.bot.god && !pins[r.bot.id]?.pin);
    const awake = loose.filter((r) => r.bot.awake || r.space.active);
    const dozing = loose.filter((r) => !r.bot.awake && !r.space.active);
    const nAsleep = dozing.length + asleep.length;
    const showAsleep = localStorage.getItem("asleep-open") === "1";

    return v_flex().id("crew-roster").size_full().pt(16).px(12).pb(14).gap(14).text_color(t.foreground)
      .child(this.brand(t))
      .when(Boolean(god), (el) => el.child(this.hero(god, t)))
      .child(this.segments(t, rows.length, waiting, extra))
      .child(v_flex().id("crew-list").flex_1().min_h(0).overflow_y_scrollbar().gap(2)
        .when(this.view() === "bots", (el) => el
          .children(pinned.map((r) => this.botRow(r, t, true)))
          .when(pinned.length > 0 && awake.length > 0, (el) => el.child(div().mx(10).my(6).h(1).bg(a(t.foreground, "10"))))
          .children(awake.length || god || pinned.length ? awake.map((r) => this.botRow(r, t)) : [this.empty(t)])
          .when(nAsleep > 0, (el) => el.child(h_flex().id("asleep-toggle").items_center().justify_between().px(10).pt(12).pb(6).cursor_pointer()
            .on_click((_e, cx) => { localStorage.setItem("asleep-open", showAsleep ? "0" : "1"); cx.notify(); })
            .child(div().text_size(13).text_color(t.muted).child("Asleep"))
            .child(div().text_size(12.5).text_color(t.dim).child(String(nAsleep)))))
          .when(showAsleep, (el) => el.children(dozing.map((r) => this.botRow(r, t))).children(asleep.map((rec) => this.sleeperRow(rec, t)))))
        .when(this.view() === "you", (el) => el.child(this.inbox(waiting, t)))
        .when(this.view() === "tasks", (el) => el.child(this.taskList(rows, t)))
        .when(this.view() === "rooms", (el) => el.child(this.roomList(t))))
      .child(this.footer(t));
  }

  // Folded: just the pals' faces, the active one lit, a red count for what needs you.
  rail(rows, waiting, t, extra = 0) {
    // What waits on you, as the Inbox counts it: finished and blocked channels, approvals, stuck ones.
    const total = waiting.length + extra;
    const urgent = waiting.some((w) => w.tab.status === "blocked") || this.ops.approvals.length > 0;
    // Pinned pals first here too (after the head pal).
    const pins = marks().pals ?? {};
    const rank = (r) => (r.bot.god ? 0 : pins[r.bot.id]?.pin ? 1 : 2);
    rows = [...rows].sort((x, y) => rank(x) - rank(y) || (rank(x) === 1 ? pins[x.bot.id].pin - pins[y.bot.id].pin : 0));
    const icon = (id, name, action, color = t.muted) => div().id(id).size(36).flex().items_center().justify_center().rounded(10).cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "10"))).on_click(action).child(svg(`${ICON}/${name}.svg`).size(16).text_color(color));
    return v_flex().id("crew-rail").size_full().items_center().pt(16).pb(12).gap(10).text_color(t.foreground)
      .child(icon("rail-open", "panel-left", () => toggleRail()))
      .when(total > 0, (el) => el.child(div().id("rail-you").relative().cursor_pointer().on_click((_e, cx) => { setShared("crew.view", "you"); toggleRail(); cx.notify(); })
        .child(div().size(36).flex().items_center().justify_center().rounded(10).hover((s) => s.bg(a(t.foreground, "10")))
          .child(div().text_size(15).font_weight(300).text_color(urgent ? t.blocked : t.done).child(String(total))))))
      .child(div().w(28).h(1).bg(a(t.foreground, "14")))
      .child(v_flex().id("rail-list").flex_1().min_h(0).overflow_y_scrollbar().items_center().gap(6)
        // Faces only here, so each one names its pal on hover.
        .children(rows.map(({ space, bot }) => div().id(`rail-${space.id}`).tooltip(bot.name).relative().size(44).flex().items_center().justify_center().rounded(12).cursor_pointer()
          .when(space.active, (el) => el.bg(a(t.accent, "26")))
          .when(!space.active, (el) => el.hover((s) => s.bg(a(t.foreground, "0c"))))
          .on_click(() => this.go(space))
          .child(mascotEl(bot, mood(space.status, bot.awake), 32, t))
          .when(space.status === "blocked", (el) => el.child(div().absolute().top(4).right(4).size(8).rounded_full().bg(t.blocked))))))
      .child(icon("rail-hire", "plus", () => this.hire()))
      .child(icon("rail-settings", "settings", () => run("app.settings")));
  }

  brand(t) {
    const icon = (id, name, action) => div().id(id).size(30).flex().items_center().justify_center().rounded_full().cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "0f"))).on_click(action).child(svg(`${ICON}/${name}.svg`).size(15).text_color(t.dim));
    return h_flex().items_center().justify_between().px(2)
      .child(icon("crew-fold", "panel-left", () => toggleRail()))
      .child(icon("crew-search", "search", () => run("app.palette")));
  }

  // What a pal is on: its most recently active channel and that terminal's title (agents set it to
  // the task), like "[general] Fix the lock screen fade".
  preview(space, bot) {
    if (bot.starting) return "starting · it may be asking you something";
    if (!bot.awake) return "asleep";
    const mine = agents().filter((x) => x.space === space.id).sort((x, y) => y.seq - x.seq);
    const ag = mine[0];
    if (!ag) return "";
    const title = (ag.title ?? "").replace(/^[^\p{L}\p{N}\[(]+/u, "").trim();
    const ch = channelName({ name: ag.tab_name });
    const boring = !title || /^(claude|claude code|codex|grok|gemini|opencode|bash|zsh)$/i.test(title);
    const what = boring ? statusWord(ag.status ?? "idle") : title;
    return space.tabs.length > 1 ? `[${ch}] ${what}` : what;
  }

  // The head pal: pinned at the top, its face big and centered.
  hero({ space, bot }, t) {
    const st = space.status;
    const badge = st === "blocked" ? t.blocked : st === "done" ? t.done : st === "working" ? t.working : null;
    const face = div().relative().size(64)
      .child(mascotEl(bot, mood(st, bot.awake), 64, t))
      .when(Boolean(badge), (el) => el.child(div().absolute().right(2).bottom(4).size(14).rounded_full().bg(t.background)
        .flex().items_center().justify_center().child(div().size(9).rounded_full().bg(badge))));
    // Its channels are the tabs along the top, so clicking only switches to it.
    return v_flex().id(`hero-${space.id}`).items_center().gap(6).py(4).cursor_pointer().hover((s) => s.opacity(0.9))
      .on_click((_e, cx) => { this.go(space); cx.notify(); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(space); })
      .child(face)
      .child(div().text_size(13.5).when(space.active, (el) => el.font_medium()).text_color(space.active ? t.foreground : t.muted).child(bot.name));
  }

  // How many channels a pal has, as a quiet pill; a red one when any of them needs you.
  countPill(space, t) {
    const blocked = space.tabs.filter((tb) => tb.status === "blocked").length;
    const n = space.tabs.length;
    if (!blocked && n < 2) return null;
    return div().flex_none().px(7).py(2).rounded_full().text_size(11.5)
      .bg(blocked ? a(t.blocked, "22") : a(t.foreground, "0c"))
      .text_color(blocked ? t.blocked : t.dim)
      .child(blocked ? `${blocked} blocked` : `${n} ch`);
  }

  segments(t, bots, waiting, extra = 0, first = "Pals") {
    const asked = waiting.some((w) => w.tab.status === "blocked") || this.ops.approvals.length > 0;
    const seg = (id, label, count, dot) => {
      const on = this.view() === id;
      return h_flex().id(`seg-${id}`).flex_1().justify_center().items_center().gap(5).py(5).rounded(3).cursor_pointer()
        .when(on, (el) => el.bg(a(t.foreground, "14")))
        .on_click((_e, cx) => { setShared("crew.view", id); cx.notify(); })
        .when(Boolean(dot), (el) => el.child(div().size(5).rounded_full().bg(dot)))
        .child(div().text_size(12.5).when(on, (el) => el.font_medium()).text_color(on ? t.foreground : t.muted).child(label))
        .when(Boolean(dot) && count > 0, (el) => el.child(div().text_size(11.5).text_color(on ? t.muted : t.dim).child(String(count))));
    };
    return h_flex().p(2).gap(2).rounded(4).border_1().border_color(a(t.foreground, "14"))
      .child(seg("bots", first, bots, false))
      .child(seg("rooms", "Rooms", rooms().length, false))
      .child(seg("tasks", "Tasks", this.ops.tasks.filter((x) => ["open", "claimed", "blocked"].includes(x.status)).length, false))
      .child(seg("you", "Inbox", waiting.length + extra, asked ? t.blocked : waiting.length + extra ? t.done : null));
  }

  botRow({ space, bot }, t, pinned = false) {
    const st = space.status;
    // A mark only when something's happening: working (wave) or finished. Needs-you shows in the pill.
    const mark = !bot.awake ? null : st === "working" ? svg(WAVE).w(22).h(7).text_color(t.working)
      : st === "done" ? div().size(7).rounded_full().bg(t.done) : null;
    const pill = this.countPill(space, t);
    const preview = this.preview(space, bot);

    // Its channels are the tabs along the top, so clicking only switches to it.
    return h_flex().id(`bot-${space.id}`).items_center().gap(12).px(8).py(8).rounded(6).cursor_pointer()
      .when(space.active, (el) => el.bg(a(t.foreground, "0c")))
      .when(!space.active, (el) => el.hover((s) => s.bg(a(t.foreground, "07"))))
      .on_click((_e, cx) => { this.go(space); cx.notify(); })
      // Right-click: pin, look, new channel.
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(space); })
      .child(mascotEl(bot, mood(st, bot.awake || bot.starting), 40, t))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().min_w(0).gap(6).items_center()
          .child(div().min_w(0).truncate().text_size(14).font_medium().text_color(bot.awake ? t.foreground : t.muted).child(bot.name))
          .when(pinned, (el) => el.child(svg(`${ICON}/pin.svg`).size(11).flex_none().text_color(t.dim))))
        .when(Boolean(preview), (el) => el.child(div().truncate().text_size(12.5).text_color(t.dim).child(preview))))
      .when(Boolean(mark || pill), (el) => el.child(h_flex().flex_none().gap(8).items_center()
        .when(Boolean(mark), (el) => el.child(mark))
        .when(Boolean(pill), (el) => el.child(pill))));
  }

  sleeperRow(rec, t) {
    const bot = { ...rec, awake: false };
    return h_flex().id(`sleep-${rec.id}`).items_center().gap(12).px(8).py(8).rounded(6).cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "07")))
      .on_click(() => this.wake(rec))
      // Right-click: wake, unpin, forget.
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 260, props: { what: "sleeper", rec: rec.id } }); })
      .child(mascotEl(bot, "asleep", 40, t))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_size(14).font_medium().text_color(t.muted).child(rec.name))
        .child(div().truncate().text_size(12.5).text_color(t.dim).child("closed · click to wake")));
  }


  inbox(waiting, t) {
    const list = v_flex().gap(4);
    const { approvals, stalled } = this.ops;
    const total = waiting.length + approvals.length + Object.keys(stalled).length;
    list.child(h_flex().items_baseline().gap(8).px(8).pb(10)
      .child(div().text_size(44).font_weight(200).text_color(t.foreground).child(String(total)))
      .child(div().text_size(14).text_color(t.muted).child("ready for you")));
    if (!this.ops.daemon) {
      list.child(div().mx(8).mb(8).px(12).py(9).rounded(12).bg(a(t.blocked, "18")).text_size(12).text_color(t.muted)
        .child("crewd isn't running, so messages aren't queued and routines won't fire. systemctl --user start herdr-crew"));
    }
    // Commands a pal wants to run that need you: push, publish, deploy…
    for (const ap of approvals) {
      const f = this.locate(ap.bot);
      const bot = f ? botOf(f.space) : { name: ap.bot, harness: null };
      list.child(v_flex().id(`ap-${ap.id}`).gap(9).px(12).py(11).rounded(14).bg(a(t.blocked, "12")).border_1().border_color(a(t.blocked, "30"))
        .child(h_flex().items_center().gap(11)
          .child(mascotEl(bot, "blocked", 32, t))
          .child(v_flex().flex_1().min_w(0).gap(2)
            .child(div().text_size(14).font_medium().text_color(t.foreground).child(`${ap.bot.split(" - ")[0]} wants to ${wantsTo(ap.why || ap.rule)}`))
            .child(div().truncate().text_size(12).text_color(t.dim).child(`#${ap.channel} · ${ago(ap.at)} · ${ap.id}`))))
        .child(div().px(10).py(7).rounded(9).bg(a(t.canvas, "aa")).text_size(12).font_family("JetBrains Mono").text_color(t.foreground)
          .child(ap.command.length > 220 ? ap.command.slice(0, 220) + "…" : ap.command))
        // Decline and Approve at opposite ends of the card, so one can't be hit for the other.
        .child(h_flex().gap(8).justify_between()
          .child(div().id(`ap-no-${ap.id}`).px(14).py(6).rounded_full().cursor_pointer().bg(a(t.foreground, "0f")).hover((s) => s.bg(a(t.foreground, "18")))
            .on_click((_e, cx) => this.decide(ap, false, cx)).child(div().text_size(12.5).text_color(t.foreground).child("Decline")))
          .child(div().id(`ap-ok-${ap.id}`).px(14).py(6).rounded_full().cursor_pointer().bg(t.solid).hover((s) => s.opacity(0.88))
            .on_click((_e, cx) => this.decide(ap, true, cx)).child(div().text_size(12.5).font_medium().text_color(t.solid_foreground).child("Approve")))));
    }
    // Channels that have been "working" with an unchanged screen for a while.
    for (const [term, st] of Object.entries(stalled)) {
      const f = this.locate(`${st.bot}#${st.channel}`);
      if (!f) continue;
      list.child(h_flex().id(`stall-${term}`).items_center().gap(12).px(12).py(10).rounded(14).cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "08")))
        .on_click(() => this.go(f.space, f.tab))
        .child(mascotEl(botOf(f.space), "blocked", 36, t))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().truncate().text_size(14).font_medium().text_color(t.foreground).child(`${f.space.name} looks stuck`))
          .child(div().truncate().text_size(12).text_color(t.dim).child(`#${st.channel} · no progress since ${ago(st.since)}`))));
    }
    if (!total) {
      list.child(div().px(8).text_size(13).text_color(t.dim).child("All caught up. Finished work, questions and approvals land here."));
      return list;
    }
    // Questions first, then finished work, oldest first.
    waiting.sort((x, y) => (x.tab.status === "blocked" ? 0 : 1) - (y.tab.status === "blocked" ? 0 : 1) || (x.tab.changed_at ?? 0) - (y.tab.changed_at ?? 0));
    for (const w of waiting) {
      const on = w.space.active && w.tab.active;
      list.child(h_flex().id(`wait-${w.tab.id}`).items_center().gap(12).px(12).py(10).rounded(14).cursor_pointer()
        .when(on, (el) => el.bg(a(t.accent, "22")).border_1().border_color(a(t.accent, "33")))
        .when(!on, (el) => el.hover((s) => s.bg(a(t.foreground, "08"))))
        .on_click(() => this.go(w.space, w.tab))
        .child(mascotEl(w.bot, w.tab.status === "blocked" ? "blocked" : "done", 36, t))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().truncate().text_size(14).font_medium().text_color(t.foreground).child(w.tab.status === "blocked" ? `${w.bot.name} has a question` : `${w.bot.name} finished`))
          .child(div().truncate().text_size(12).text_color(t.dim).child(`#${channelName(w.tab)} · ${w.space.machine ?? "this computer"}`)))
        .child(div().flex_none().text_size(12).text_color(statusColor(w.tab.status, t)).child(ago(w.tab.changed_at))));
    }
    return list;
  }

  // The task board, in the Project Pals dialogs' look: an add field, then a quiet bordered list per group
  // (blocked, in progress, open, done today). Click a task for its details and a few actions.
  taskList(rows, t) {
    const tasks = this.ops.tasks;
    const list = v_flex().gap(16).px(4);
    list.child(div().h(40).px(14).flex().items_center().rounded(14)
      .bg(a(t.canvas, "aa")).border_1().border_color(a(t.foreground, "10"))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(this.taskInput).w_full().text_size(13).text_color(t.foreground)));

    const dot = { blocked: t.blocked, claimed: t.working, open: a(t.foreground, "40"), done: t.done, cancelled: t.dim };
    const act = (args, done) => (_e, cx) => cx.spawn(async (cx) => {
      try { await crewCli(args); if (done) notify({ title: done, level: "success", timeout: 2500 }); }
      catch (e) { notify({ title: "That didn't work", body: String(e.message ?? e).slice(0, 220), level: "warning" }); }
      this.refreshOps(cx);
    });
    const link = (id, label, action, color) => div().id(id).cursor_pointer().hover((s) => s.opacity(0.75)).on_click(action)
      .child(div().text_size(12).text_color(color ?? t.accent).child(label));

    const row = (task, first) => {
      const owner = task.claimed_by || task.assignee;
      const f = owner && owner !== ownerName() ? this.locate(owner) : null;
      const bot = f ? botOf(f.space) : null;
      const open = this.openTask === task.id;
      const who = owner ? owner.split("#")[0].split(" - ")[0] : "anyone";
      const waits = task.deps?.length && task.status === "open" ? ` · after ${task.deps.join(", ")}` : "";
      const face = bot ? mascotEl(bot, task.status === "claimed" ? "working" : task.status === "blocked" ? "blocked" : task.status === "done" ? "done" : "calm", 22, t)
        : div().size(22).flex_none().flex().items_center().justify_center().child(div().size(7).rounded_full().bg(dot[task.status] ?? t.dim));
      const head = h_flex().id(`task-${task.id}`).items_center().gap(10).px(12).py(9).cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "05")))
        .on_click((_e, cx) => { this.openTask = open ? null : task.id; cx.notify(); })
        .child(face)
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_size(13).text_color(task.status === "done" ? t.muted : t.foreground).child(task.title))
          .child(div().truncate().text_size(11.5).text_color(t.dim).child(`${task.id} · ${who}${waits}`)));
      const last = task.notes?.length ? task.notes[task.notes.length - 1] : null;
      const details = open ? v_flex().gap(8).pl(44).pr(12).pb(10)
        .when(Boolean(task.body), (el) => el.child(div().text_size(12).text_color(t.muted).child(task.body)))
        .when(Boolean(task.result), (el) => el.child(div().text_size(12).text_color(t.muted).child(`Result: ${task.result}`)))
        .when(Boolean(last) && !task.result, (el) => el.child(div().text_size(12).text_color(t.dim).child(`${last.by}: ${last.text}`)))
        .child(h_flex().gap(14)
          .when(Boolean(f), (el) => el.child(link(`tk-go-${task.id}`, "Open channel", () => this.go(f.space, f.tab))))
          .when(task.status !== "done", (el) => el.child(link(`tk-done-${task.id}`, "Mark done", act(["task", "done", task.id], `${task.id} done`), t.muted)))
          .when(task.status === "done" || task.status === "cancelled", (el) => el.child(link(`tk-re-${task.id}`, "Reopen", act(["task", "reopen", task.id]), t.muted)))
          .when(task.status !== "done" && task.status !== "cancelled", (el) => el.child(link(`tk-x-${task.id}`, "Cancel", act(["task", "cancel", task.id]), t.dim)))) : null;
      return v_flex().when(!first, (el) => el.child(div().h(1).mx(12).bg(a(t.foreground, "0a"))))
        .when(open, (el) => el.bg(a(t.foreground, "04"))).child(head).when(Boolean(details), (el) => el.child(details));
    };
    const group = (label, these) => v_flex()
      .child(h_flex().items_baseline().justify_between().px(4).pb(6)
        .child(div().text_size(12).text_color(t.dim).child(label))
        .child(div().text_size(11.5).text_color(t.dim).child(String(these.length))))
      .child(v_flex().rounded(14).border_1().border_color(a(t.foreground, "10")).overflow_hidden()
        .children(these.map((x, i) => row(x, i === 0))));

    let any = false;
    for (const [status, label] of [["blocked", "Blocked"], ["claimed", "In progress"], ["open", "Open"]]) {
      const these = tasks.filter((x) => x.status === status);
      if (these.length) { any = true; list.child(group(label, these)); }
    }
    const today = tasks.filter((x) => x.status === "done" && Date.now() - x.updated < 86400000);
    if (today.length) list.child(group("Done today", today));
    if (!any && !today.length) {
      list.child(div().px(6).text_size(12.5).text_color(t.dim)
        .child(`No tasks yet. Add one above, or ask ${headName()} to plan something: pals claim tasks, finish them, and unblock what's next.`));
    }
    return list;
  }

  roomList(t) {
    const shown = shownRoom();
    const list = v_flex().gap(4);
    for (const room of rooms()) {
      const members = roomMembers(room);
      const on = shown?.id === room.id;
      const busy = members.some((m) => m.status === "working");
      list.child(v_flex().id(`room-${room.id}`).gap(8).px(12).py(11).rounded(14).cursor_pointer()
        .when(on, (el) => el.bg(a(t.accent, "1f")).border_1().border_color(a(t.accent, "2e")))
        .when(!on, (el) => el.hover((s) => s.bg(a(t.foreground, "08"))))
        .on_click(() => showRoom(room.id))
        // Right-click: open or close it.
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "room", room: room.id } }); })
        .child(h_flex().items_center().justify_between()
          .child(h_flex().items_baseline().gap(3)
            .child(div().text_size(15).text_color(on ? t.accent : t.dim).child("#"))
            .child(div().text_size(15).when(on, (el) => el.font_medium()).text_color(t.foreground).child(room.name)))
          .when(busy, (el) => el.child(svg(WAVE).w(26).h(8).text_color(t.working))))
        .child(h_flex().items_center().gap(8)
          .child(h_flex().gap(3).children(members.slice(0, 6).map((m) => mascotEl(m.bot, mood(m.status, Boolean(m.terminal)), 18, t))))
          .child(div().truncate().text_size(12).text_color(t.dim).child(`${members.length} channels`)))
        .when(Boolean(room.goal), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(room.goal))));
    }
    if (!rooms().length) list.child(div().px(10).pb(6).text_size(13).text_color(t.dim).child("Rooms put channels from different pals together, so they can hand each other work."));
    list.child(h_flex().id("room-new").items_center().gap(8).px(12).py(10).cursor_pointer().hover((s) => s.opacity(0.8))
      .on_click(() => openOverlay({ mod: "crew-room-new", kind: "dialog", width: 520, modal: true }))
      .child(svg(`${ICON}/plus.svg`).size(12).text_color(t.accent))
      .child(div().text_size(12.5).text_color(t.accent).child("New room")));
    return list;
  }

  // Pro's list column (264 px, beside the pal rail): the shown pal as a banner card, its channels
  // with what each is on, and "Across pals" (who else is working or waiting on you). The same
  // Rooms / Tasks / Inbox views as Focus are one click away in the segmented control.
  proColumn(rows, waiting, t, extra = 0) {
    const d = ds(t);
    const shown = rows.find((r) => r.space.active) ?? rows[0];
    const view = this.view();
    const body = v_flex().id("pro-list").flex_1().min_h(0).overflow_y_scrollbar().gap(2);
    if (view === "you") body.child(this.inbox(waiting, t));
    else if (view === "tasks") body.child(this.taskList(rows, t));
    else if (view === "rooms") body.child(this.roomList(t));
    else if (shown) body.child(this.channelList(shown, t, d));
    else body.child(this.empty(t));

    // Across pals: everyone else who's working or needs you, most urgent first.
    const others = rows.filter((r) => !r.space.active && r.bot.awake && ["blocked", "done", "working"].includes(r.space.status))
      .sort((x, y) => (STATUS_RANK[y.space.status] ?? 0) - (STATUS_RANK[x.space.status] ?? 0));
    const nWork = rows.filter((r) => r.space.status === "working").length;
    const nStuck = rows.filter((r) => r.space.status === "blocked").length + Object.keys(this.ops.stalled).length;
    const across = v_flex().flex_none().gap(2).pt(10).border_t_1().border_color(d.line)
      .child(h_flex().items_center().justify_between().px(4).pb(4)
        .child(div().text_size(12).text_color(d.fg2).child("Across pals"))
        .child(div().text_size(11.5).text_color(d.fg3).child([nWork && `${nWork} working`, nStuck && `${nStuck} stuck`].filter(Boolean).join(" · ") || "all quiet")))
      .children(others.slice(0, 4).map(({ space, bot }) => h_flex().id(`across-${space.id}`).items_center().gap(8).px(4).h(26).rounded(d.r.sm).cursor_pointer()
        .hover((s) => s.bg(d.hover)).on_click((_e, cx) => { this.go(space); cx.notify(); })
        .child(div().size(6).flex_none().rounded_full().bg(statusColor(space.status, t)))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.fg1).child(`${bot.name}${this.preview(space, bot) ? ` · ${this.preview(space, bot).replace(/^\[[^\]]*\]\s*/, "")}` : ""}`))
        .child(div().flex_none().text_size(11.5).text_color(space.status === "blocked" ? t.blocked : d.fg3)
          .child(space.status === "blocked" ? "needs you" : space.status === "done" ? "done" : ago(space.tabs.find((x) => x.status === "working")?.changed_at)))));

    return v_flex().id("crew-roster").size_full().pt(0).px(8).pb(10).gap(10).text_color(t.foreground)
      .when(Boolean(shown), (el) => el.child(this.banner(shown, t, d)))
      .child(this.segments(t, rows.length, waiting, extra, "Channels"))
      .child(body)
      .child(across)
      .child(this.footer(t));
  }

  // The shown pal as a banner: its face on a flat inset, then its name, state and where it works.
  banner({ space, bot }, t, d) {
    const st = space.status;
    const tab = space.tabs.find((x) => x.active);
    const lead = tab ? leadPane(tab.id) : null;
    const state = bot.awake ? statusWord(tab?.status ?? st ?? "idle") : bot.starting ? "starting" : "asleep";
    const stateColor = bot.awake && ["working", "blocked", "done"].includes(tab?.status) ? statusColor(tab.status, t) : d.fg3;
    return v_flex().id(`banner-${space.id}`).flex_none().mx(-8).gap(8).pb(10).border_b_1().border_color(d.line)
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(space); })
      .child(div().h(96).flex().items_center().justify_center().bg(d.inset).border_b_1().border_color(d.lineSoft)
        .child(mascotEl(bot, mood(st, bot.awake || bot.starting), 72, t)))
      .child(h_flex().px(12).items_center().justify_between().gap(8)
        .child(div().min_w(0).truncate().text_size(15).font_semibold().text_color(d.fg1).child(bot.name))
        .child(h_flex().flex_none().h(20).px(6).gap(5).items_center().rounded(d.r.xs).border_1().border_color(a(stateColor, "55"))
          .child(div().size(6).rounded_full().bg(stateColor))
          .child(div().text_size(11).text_color(stateColor).child(state))))
      .child(h_flex().px(12).items_center().justify_between().gap(8)
        .child(div().min_w(0).truncate().text_size(12).text_color(d.fg3).child(bot.awake ? harnessName(bot) : "no brain running"))
        .when(Boolean(lead?.branch), (el) => el.child(div().flex_none().max_w(130).truncate().text_size(11).font_family(d.mono).text_color(d.fg3).child(lead.branch))));
  }

  // The shown pal's channels, each with what it's on and when it last changed.
  channelList({ space, bot }, t, d) {
    const list = v_flex().gap(2);
    list.child(h_flex().items_center().justify_between().px(4).pb(4)
      .child(div().text_size(12).text_color(d.fg2).child("Channels"))
      .child(div().id("pro-ch-add").size(20).flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer().tooltip("New channel")
        .hover((s) => s.bg(d.hover)).on_click(() => this.duplicate(bot))
        .child(svg(`${ICON}/plus.svg`).size(12).text_color(d.fg3))));
    const all = agents();
    for (const tab of space.tabs) {
      const on = tab.active;
      const ag = all.filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0];
      const title = (ag?.title ?? "").replace(/^[^\p{L}\p{N}\[(]+/u, "").trim();
      const boring = !title || /^(claude|claude code|codex|grok|gemini|opencode|bash|zsh)$/i.test(title);
      const what = !bot.awake ? "asleep" : boring ? statusWord(tab.status ?? "idle") : title;
      const live = ["working", "blocked", "done"].includes(tab.status);
      list.child(h_flex().id(`pro-ch-${tab.id}`).items_start().gap(8).px(8).py(7).rounded(d.r.md).cursor_pointer()
        .when(on, (el) => el.bg(d.sel))
        .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
        .on_click((_e, cx) => { this.go(space, tab); cx.notify(); })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "tab", space: space.id, tab: tab.id } }); })
        .child(div().flex_none().text_size(13).text_color(d.fg3).child("#"))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_size(13).when(on, (el) => el.font_medium()).text_color(on ? d.fg1 : d.fg2).child(channelName(tab)))
          .child(div().truncate().text_size(11.5).text_color(d.fg3).child(what)))
        .child(div().flex_none().pt(4)
          .child(live ? div().size(6).rounded_full().bg(statusColor(tab.status, t)) : div().text_size(11).text_color(d.fg3).child(tab.changed_at ? ago(tab.changed_at) : ""))));
    }
    return list;
  }

  empty(t) {
    return v_flex().items_center().gap(12).pt(40).px(16)
      .child(div().text_size(16).font_weight(300).text_color(t.foreground).child("No crew yet"))
      .child(div().text_size(12.5).text_color(t.dim).text_center().child("Every space is a pal. Hire one to start a project with a brain."));
  }

  footer(t) {
    const icon = (id, name, action) => div().id(id).size(28).flex().items_center().justify_center().rounded(8).cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "0f"))).on_click(action)
      .child(svg(`${ICON}/${name}.svg`).size(15).text_color(t.dim));
    return h_flex().items_center().justify_between().pt(8).px(4)
      .child(h_flex().id("crew-hire").items_center().gap(8).py(6).px(8).rounded(9).cursor_pointer()
        .hover((s) => s.bg(a(t.foreground, "0c")))
        .on_click(() => this.hire())
        .child(svg(`${ICON}/plus.svg`).size(13).text_color(t.muted))
        .child(div().text_size(13).text_color(t.muted).child("Hire a pal")))
      .child(h_flex().items_center().gap(2)
        .child(icon("crew-machines", "server", () => run("mod.open", { name: "machine-add" })))
        .child(icon("crew-routines", "clock", () => this.routines()))
        .child(div().relative()
          .child(icon("crew-about", "info", () => openOverlay({ mod: "crew-about", kind: "dialog", width: 480 })))
          .when(Boolean(this.ops.update?.available), (el) => el.child(div().absolute().top(4).right(4).size(7).rounded_full().bg(t.accent))))
        .child(icon("crew-settings", "settings", () => run("app.settings"))));
  }

}
