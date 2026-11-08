// Project Pals roster: your pals (left pane of the Project Pals layout). Every space is a pal, a project with a
// brain; its tabs are its channels (the hero lists the shown pal's). Pals tab: each
// pal's mascot shows its most urgent channel, with a pill for its channel count (red when one is
// blocked). Inbox tab: every channel that needs you, across all pals and machines.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, VirtualListScrollHandle, v_virtual_list } from "gpui-base";
import { spaces, panes, agents, terminals, run, theme, settings, openOverlay, machines, shared, setShared, nextCommand, layout, notify } from "herdr";
import {
  crew, botOf, sleepers, mascotFor, mascotEl, mood, channelName, harnessName, ago, a,
  migrateChannelKeys, linkRecords, updateBot,
  STATUS_RANK, WAVE, statusColor, statusWord, rooms, roomMembers, shownRoom, showRoom, showTabs, adoptRooms, serveRequests,
  loadOps, crewCli, taskOf, findChannel, ensureLooks, syncPetState, syncSettings, owner as ownerName, marks, headName, autoColor, orderPins, pinPal, wakePal, wantsTo, tone,
  applyLayout, rememberWidths, sidebarPref, ds, leadPane,
  petOf, petReady, petEl, petState, palOrder, stamp, palPinned, taskTitle, tabHasAgent, noAgentTag, openChannels, rememberModel, channelOrder, tabPinned, palSections, palGroups, placePal, pebble } from "./crew.js";

const ICON = "mods/crew-roster/icons";
// Focus grid (2026-11-08 audit): content (text, icons, pets) starts 16 px in; row backgrounds and
// buttons sit 8 px in from both sides.
// Focus pal rows: the pet 75 wide, bare (no box), in a 68 px row (DeNon 2026-11-08: twice the old
// 46, then 15% back down).
const ROW_PET = 75, ROW_H = 68;
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
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("crew.sidebar.width") ?? sidebarPref()) : RAIL });
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
    // Then lay the window out once the layout is there (before that, applyLayout does nothing).
    const sync = () => cx.spawn(async (cx) => {
      try { await syncSettings(); } catch {}
      if (!this.laidOut && applyLayout()) { this.laidOut = true; cx.notify(); }
    });
    sync();
    cx.timer.every(3000, () => sync());
    // A dragged sidebar width is remembered.
    cx.timer.every(2000, () => { if (this.laidOut) rememberWidths(); });
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
    // Pocket-pet states beyond Herdr's: stuck (crewd's health file) and each branch's PR (gh).
    // On its own timer so a slow gh never holds up the rest; one pass at a time.
    const pets = (cx) => { if (this.petBusy) return; this.petBusy = true;
      cx.spawn(async () => { try { await syncPetState(this.ops.stalled); } catch {} this.petBusy = false; }); };
    cx.timer.after(1500, (cx) => pets(cx));
    cx.timer.every(10000, (cx) => pets(cx));
    // Add a task from the Tasks view: "title" or "@Pal title".
    this.taskInput = InputState.new({ placeholder: "Add a task, @Pal to assign it" });
    this.taskInput.on("submit", (_e, cx) => this.addTask(cx));
    // The hero's channel search (its header's magnifier): filters as you type, Esc clears.
    this.chSearch = InputState.new({ placeholder: "Search channels" });
    this.chSearch.on("change", (_e, cx) => cx.notify());
    this.chSearchOpen = false;
    this.chScroll = VirtualListScrollHandle.new();
    this.chShownKey = null;
    // keys.json / herdr-app do: crew-roster.hire, crew-roster.routines, crew-roster.channel (add one to the shown pal), crew-roster.you / .pals.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "hire") this.hire();
        else if (c === "routines") this.routines();
        else if (c === "look") { const sp = spaces().find((x) => x.active); if (sp) this.look(sp); }
        else if (c === "channel" || c === "duplicate") { const s = spaces().find((x) => x.active); if (s) this.duplicate(botOf(s)); }
        else if (c === "you" || c === "bots") setShared("crew.view", c);
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
    return this.focusColumn(rows, asleep, waiting, t, extra);
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
    const icon = (id, name, action, color = t.muted) => div().id(id).size(36).flex().items_center().justify_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "10"))).on_click(action).child(svg(`${ICON}/${name}.svg`).size(16).text_color(color));
    return v_flex().id("crew-rail").size_full().items_center().pt(16).pb(12).gap(10).text_color(t.foreground)
      .child(icon("rail-open", "panel-left", () => toggleRail()))
      .when(total > 0, (el) => el.child(div().id("rail-you").relative().cursor_pointer().on_click((_e, cx) => { setShared("crew.view", "you"); toggleRail(); cx.notify(); })
        .child(div().size(36).flex().items_center().justify_center().rounded(6).hover((s) => s.bg(a(t.foreground, "10")))
          .child(div().text_size(15).font_weight(300).text_color(urgent ? t.blocked : t.done).child(String(total))))))
      .child(div().w(28).h(1).bg(a(t.foreground, "14")))
      .child(v_flex().id("rail-list").flex_1().min_h(0).overflow_y_scrollbar().items_center().gap(6)
        // Faces only here, so each one names its pal on hover.
        .children(rows.map(({ space, bot }) => div().id(`rail-${space.id}`).tooltip(bot.name).relative().size(44).flex().items_center().justify_center().rounded(6).cursor_pointer()
          .when(space.active, (el) => el.bg(a(t.accent, "26")))
          .when(!space.active, (el) => el.hover((s) => s.bg(a(t.foreground, "0c"))))
          .on_click(() => this.open(space))
          .child(mascotEl(bot, mood(space.status, bot.awake), 32, t))
          .when(space.status === "blocked", (el) => el.child(div().absolute().top(4).right(4).size(8).rounded_full().bg(t.blocked))))))
      .child(icon("rail-hire", "plus", () => this.hire()))
      .child(icon("rail-settings", "settings", () => openOverlay({ mod: "crew-appmenu", kind: "popup", width: 252, height: 424 })));
  }

  brand(t) {
    const icon = (id, name, action) => div().id(id).size(30).flex().items_center().justify_center().rounded(4).cursor_pointer()
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
    const ch = channelName({ name: ag.tab_name });
    const what = taskTitle(ag.title, bot.name, space.name, ch) ?? statusWord(ag.status ?? "idle");
    return space.tabs.length > 1 ? `[${ch}] ${what}` : what;
  }

  // How many channels a pal has, as a quiet pill; a red one when any of them needs you.
  countPill(space, t) {
    const blocked = space.tabs.filter((tb) => tb.status === "blocked").length;
    const n = space.tabs.length;
    if (!blocked && n < 2) return null;
    return div().flex_none().px(7).py(2).rounded(4).text_size(11.5)
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

  inbox(waiting, t) {
    const list = v_flex().gap(4);
    const { approvals, stalled } = this.ops;
    const total = waiting.length + approvals.length + Object.keys(stalled).length;
    list.child(h_flex().items_baseline().gap(8).px(8).pb(10)
      .child(div().text_size(44).font_weight(200).text_color(t.foreground).child(String(total)))
      .child(div().text_size(14).text_color(t.muted).child("ready for you")));
    if (!this.ops.daemon) {
      list.child(div().mx(8).mb(8).px(12).py(9).rounded(6).bg(a(t.blocked, "18")).text_size(12).text_color(t.muted)
        .child("crewd isn't running, so messages aren't queued and routines won't fire. systemctl --user start herdr-crew"));
    }
    // Commands a pal wants to run that need you: push, publish, deploy…
    for (const ap of approvals) {
      const f = this.locate(ap.bot);
      const bot = f ? botOf(f.space) : { name: ap.bot, harness: null };
      list.child(v_flex().id(`ap-${ap.id}`).gap(9).px(12).py(11).rounded(8).bg(a(t.blocked, "12")).border_1().border_color(a(t.blocked, "30"))
        .child(h_flex().items_center().gap(11)
          .child(mascotEl(bot, "blocked", 32, t))
          .child(v_flex().flex_1().min_w(0).gap(2)
            .child(div().text_size(14).font_medium().text_color(t.foreground).child(`${ap.bot.split(" - ")[0]} wants to ${wantsTo(ap.why || ap.rule)}`))
            .child(div().truncate().text_size(12).text_color(t.dim).child(`#${ap.channel} · ${ago(ap.at)} · ${ap.id}`))))
        .child(div().px(10).py(7).rounded(6).bg(a(t.canvas, "aa")).text_size(12).font_family("JetBrains Mono").text_color(t.foreground)
          .child(ap.command.length > 220 ? ap.command.slice(0, 220) + "…" : ap.command))
        // Decline and Approve at opposite ends of the card, so one can't be hit for the other.
        .child(h_flex().gap(8).justify_between()
          .child(div().id(`ap-no-${ap.id}`).px(14).py(6).rounded(4).cursor_pointer().bg(a(t.foreground, "0f")).hover((s) => s.bg(a(t.foreground, "18")))
            .on_click((_e, cx) => this.decide(ap, false, cx)).child(div().text_size(12.5).text_color(t.foreground).child("Decline")))
          .child(div().id(`ap-ok-${ap.id}`).px(14).py(6).rounded(4).cursor_pointer().bg(t.solid).hover((s) => s.opacity(0.88))
            .on_click((_e, cx) => this.decide(ap, true, cx)).child(div().text_size(12.5).font_medium().text_color(t.solid_foreground).child("Approve")))));
    }
    // Channels that have been "working" with an unchanged screen for a while.
    for (const [term, st] of Object.entries(stalled)) {
      const f = this.locate(`${st.bot}#${st.channel}`);
      if (!f) continue;
      list.child(h_flex().id(`stall-${term}`).items_center().gap(12).px(12).py(10).rounded(8).cursor_pointer()
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
      list.child(h_flex().id(`wait-${w.tab.id}`).items_center().gap(12).px(12).py(10).rounded(8).cursor_pointer()
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
    list.child(div().h(40).px(14).flex().items_center().rounded(8)
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
      .child(v_flex().rounded(8).border_1().border_color(a(t.foreground, "10")).overflow_hidden()
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
      list.child(v_flex().id(`room-${room.id}`).gap(8).px(12).py(11).rounded(8).cursor_pointer()
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

  // ── Drawn to the Paper board "MODE · Focus (default)", then reworked with DeNon ─────────────

  // What a pal is on, split for the rows: [channel tag, words]. The most recently active channel's
  // terminal title (agents set it to the task), else its state.
  // The channel a pal's row stands for, and opens: one that needs you, else one that finished,
  // else one working, else the most recently active; a pal with no agent anywhere, its shown tab.
  leadTab(space) {
    const rank = { blocked: 3, done: 2, working: 1 };
    const best = agents().filter((x) => x.space === space.id)
      .sort((x, y) => (rank[y.status] ?? 0) - (rank[x.status] ?? 0) || y.seq - x.seq)[0];
    return (best && space.tabs.find((x) => x.id === best.tab)) ?? space.tabs.find((x) => x.active) ?? space.tabs[0] ?? null;
  }
  open(space) { this.go(space, this.leadTab(space)); }

  doing(space, bot) {
    const tab = this.leadTab(space);
    const ag = tab ? agents().filter((x) => x.tab === tab.id).sort((x, y) => y.seq - x.seq)[0] : null;
    const tag = tab ? channelName(tab) : "";
    if (bot.starting) return [tag, "starting · it may be asking you something"];
    if (!bot.awake) return [tag, "asleep"];
    return [tag, taskTitle(ag?.title, bot.name, space.name, tag) ?? statusWord(ag?.status ?? "idle")];
  }
  lastChange(space) { return Math.max(0, ...space.tabs.map((x) => x.changed_at ?? 0)) || null; }
  liveDot(status, d) { return status === "working" ? d.info : status === "blocked" ? d.warn : status === "done" ? d.ok : null; }

  // Focus: the shown pal as the hero card, then the pals.
  focusColumn(rows, asleep, waiting, t, extra) {
    const d = ds(t);
    const w = this.width ?? 304;
    const shown = rows.find((r) => r.space.active) ?? rows.find((r) => r.bot.god) ?? rows[0];
    const ordered = palOrder(rows);
    const live = ordered.filter((r) => r.bot.awake || r.space.active || r.bot.starting);
    const dozing = ordered.filter((r) => !(r.bot.awake || r.space.active || r.bot.starting));
    const nHidden = dozing.length + asleep.length;
    const showHidden = localStorage.getItem("asleep-open") === "1";
    const root = v_flex().id("crew-roster").size_full().bg(d.bg1).border_r_1().border_color(d.line)
      // Window pixels → design pixels (Herdr's zoom scales what we draw).
      .on_size_change((size, cx) => { const w = size.width / (Number(settings().zoom) || 1); if (Math.abs((this.width ?? 0) - w) > 1) { this.width = w; cx.notify(); } });
    if (shown) root.child(this.heroCard(shown, t, d, w));
    const list = v_flex().id("crew-list").flex_1().min_h(0).overflow_y_scrollbar().px(8).pt(8).pb(24).gap(2)
      // A pal drag ends on release anywhere in the list, and is dropped if the pointer leaves it.
      .on_mouse_up("left", (_e, cx) => this.drop(cx))
      .on_hover((h, cx) => { if (!h && this.drag) { this.drag = null; cx.notify(); } });
    if (this.view() !== "bots") return root.child(this.otherView(list, rows, waiting, t, d));
    list.child(h_flex().h(28).flex_none().items_center().pl(8).pr(2)
      .child(div().flex_1().text_size(12).font_weight(500).text_color(d.fg3).child("Pals"))
      .child(div().id("pals-search").size(20).flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer().tooltip("Search")
        .hover((s) => s.bg(d.hover)).on_click(() => run("app.palette"))
        .child(svg(`${ICON}/ds-search.svg`).size(13).text_color(d.iconDim))));
    if (!rows.length && !asleep.length) list.child(this.empty(t));
    // The head pal, then each group under a small grey header (only once you've made a group), then
    // Unassigned. Empty groups still show, as somewhere to drop a pal.
    const grouped = palGroups().length > 0;
    for (const sec of palSections(live)) {
      const gid = sec.group === undefined ? undefined : sec.group?.id ?? null;
      const folded = grouped && sec.group !== undefined && Boolean((marks().collapsed ?? {})[gid ?? "_"]);
      if (grouped && sec.group !== undefined) list.child(this.groupHeader(sec.group, sec.rows.length, d, folded));
      if (folded) continue;
      list.children(sec.rows.map((r) => this.palRow(r, t, d, gid)));
      if (grouped && sec.group && !sec.rows.length) list.child(this.groupDrop(sec.group.id, d));
    }
    if (nHidden) {
      list.child(h_flex().id("asleep-toggle").h(40).flex_none().items_center().gap(12).pl(8).pr(8).rounded(d.r.md).cursor_pointer()
        .hover((s) => s.bg(d.hover))
        .on_click((_e, cx) => { localStorage.setItem("asleep-open", showHidden ? "0" : "1"); cx.notify(); })
        .child(div().w(ROW_PET).flex_none().flex().justify_center().child(svg(`${ICON}/ds-eye-off.svg`).size(15).text_color(d.icon)))
        .child(div().flex_1().text_size(13).text_color(d.fg2).child("Hidden pals"))
        .child(div().text_size(12).text_color(d.fg2).child(String(nHidden))));
      if (showHidden) list.children(dozing.map((r) => this.palRow(r, t, d))).children(asleep.map((rec) => this.sleeperRow(rec, t, d)));
    }
    this.extras(list, waiting, extra, d);
    return root.child(list);
  }

  // Not on the boards, and only there while they have something: the Inbox (approvals wait for
  // your click there; channels that look stuck), and your rooms.
  extras(list, waiting, extra, d) {
    if (extra > 0) {
      list.child(h_flex().id("inbox-row").h(40).flex_none().items_center().gap(12).pl(8).pr(8).rounded(d.r.md).cursor_pointer()
        .hover((s) => s.bg(d.hover))
        .on_click((_e, cx) => { setShared("crew.view", "you"); cx.notify(); })
        .child(div().w(ROW_PET).flex_none().flex().justify_center().child(div().size(6).rounded(3).bg(d.warn)))
        .child(div().flex_1().text_size(13).text_color(d.body).child(this.ops.approvals.length ? "Inbox · waiting for your OK" : "Inbox"))
        .child(div().text_size(12).text_color(d.warnText).child(String(waiting.length + extra))));
    }
    const rs = rooms();
    if (rs.length) {
      list.child(h_flex().h(28).mt(8).flex_none().items_center().px(8).child(div().text_size(12).font_weight(500).text_color(d.fg3).child("Rooms")));
      list.children(rs.map((room) => h_flex().id(`room-${room.id}`).h(32).flex_none().items_center().gap(6).px(8).rounded(d.r.md).cursor_pointer()
        .when(shownRoom()?.id === room.id, (el) => el.bg(d.sel))
        .hover((s) => s.bg(d.hover))
        .on_click((_e, cx) => { showRoom(room.id); cx.notify(); })
        .child(div().flex_none().text_size(12).font_family(d.mono).text_color(d.fg4).child("#"))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(d.body).child(room.name))
        .child(div().text_size(11).text_color(d.fg4).child(String(roomMembers(room).length)))));
    }
  }

  // Inbox, Tasks or Rooms (from crew-roster.you / .tasks keys and the Inbox row), with a way back.
  otherView(list, rows, waiting, t, d) {
    const view = this.view();
    list.child(h_flex().id("back-to-pals").h(28).flex_none().items_center().gap(6).px(6).cursor_pointer()
      .on_click((_e, cx) => { setShared("crew.view", "bots"); cx.notify(); })
      .child(svg(`${ICON}/chevron-right.svg`).size(11).text_color(d.fg3))
      .child(div().text_size(12).font_weight(500).text_color(d.fg3).child({ you: "Inbox", tasks: "Tasks", rooms: "Rooms" }[view] ?? "Pals"))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(d.fg4).child("back to pals")));
    if (view === "you") list.child(this.inbox(waiting, t));
    else if (view === "tasks") list.child(this.taskList(rows, t));
    else if (view === "rooms") list.child(this.roomList(t));
    return list;
  }

  // The Focus hero (hero v2, DeNon 2026-11-08: "2 · Floor", then the name up top and the channels
  // full width). No box: the shown pal's pet and its laptop at the sidebar's full width, standing
  // on a floor (a hairline with a pool of the state's colour under the pet: working blue, done
  // mint, asks you amber and breathing, PR green, merged purple, closing red, stuck amber; none at
  // rest; no saber here: DeNon found one moving along the floor annoying). The name sits in a
  // 30 px band at the top, just over the sprite (16/600, the full width, never cut; a state dot before
  // it; no state word). Under the floor: the pal's channels, full width,
  // up to six rows then scrolling, with a search in their header; then four quick actions:
  // + Channel, Tell, Tasks (its count), Sleep. Its task text is in its pal row below.
  heroCard({ space, bot }, t, d, w) {
    const tab = space.tabs.find((x) => x.active);
    const m = mood(tab?.status ?? space.status, bot.awake || bot.starting);
    const p = petOf(bot);
    const state = petState(bot, m);
    const W = Math.max(160, Math.round(w - 1));
    // The sprite 16 px in from both sides (the grid's left edge, and the laptop clear of the edge).
    const SX = 16, SW = W - 32;
    const H = Math.round(SW * 108 / 138);
    const light = d.bg1 !== "#0E0E0F";
    const ready = p && petReady(p);
    const lit = bot.awake && ["work", "done", "ask", "pr", "merged", "closing", "stuck"].includes(state);
    const NB = 36;      // the name's band over the sprite (room for the bits that rise off it)
    const FY = NB + H + 2;   // the floor's line
    const word = !bot.awake ? "Asleep" : ({ work: "Working", ask: "Asks you", done: "Done", stuck: "Stuck", pr: "PR open", merged: "Merged", closing: "PR closed" })[state] ?? "Resting";
    const since = state === "work" || state === "ask" ? ago(tab?.changed_at) : "";
    const label = since && since !== "now" ? `${word} · ${since}` : word;
    const [dot] = state === "work" ? [d.info, d.infoText] : state === "ask" || state === "stuck" ? [d.warn, d.warnText]
      : state === "done" || state === "pr" ? [d.ok, d.okHi] : [null, d.fg2];
    const art = div().id("hero-art").relative().w(W).h(FY + 6).flex_none().cursor_pointer().when(light, (el) => el.bg("#0E0E0F"))
      .on_click((_e, cx) => { this.open(space); cx.notify(); });
    // Depth without an edge: a soft radial aura behind the sprite, fading out to nothing.
    art.child(div().absolute().left(SX - 14).top(NB - 14).w(SW + 28).h(H + 24).child(image(`${ICON}/pet-aura.svg`).w(SW + 28).h(H + 24)));
    // The pool, drawn as an image so it sits behind the pet (Herdr draws svg() elements over images).
    if (lit) art.child(div().absolute().left(0).top(FY - 58).w(W).h(72)
      .when(state === "ask", (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1100 }))
      .child(image(`${ICON}/pet-floor-${state}.svg`).w(W).h(72)));
    art.child(div().absolute().left(SX).top(NB - 4).child(ready ? petEl(p, state, SW, H, { open: true })
      : div().w(SW).h(H).flex().items_center().justify_center().child(mascotEl(bot, m, 96, t))));
    // The name, in its own band at the top: the sprite starts just under it (bun ears, antennas and
    // crowns reach the sprite's top edge, so text over the sprite would sit on dots).
    art.child(h_flex().absolute().left(16).top(10).w(W - 32).items_center().gap(7)
      .when(Boolean(dot), (el) => el.child(div().size(7).flex_none().rounded(4).bg(dot)))
      .child(div().flex_1().min_w(0).text_size(16).line_height("20px").font_weight(600).text_color(d.fg1).child(bot.name))
      // No state word (DeNon took it out): the dot, the pose and the floor say it; the tooltip names it.
      .tooltip(`${bot.name} · ${label}`));
    // The quick actions are raised "pebbles" (DeNon, after the Omarchy Recess plugin's Raised look).
    const btn = (id, icon, text, action, extra) => pebble(d, { id, icon, label: text, extra, onClick: action, grow: Boolean(text) });
    const mine = this.ops.tasks.filter((x) => ["open", "claimed", "blocked"].includes(x.status)
      && String(x.claimed_by || x.assignee || "").split("#")[0].split(" - ")[0] === bot.name).length;
    return v_flex().id(`hero-${space.id}`).flex_none().pb(14).border_b_1().border_color(d.line)
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(space); })
      .child(art)
      .child(this.heroChannels(space, bot, d))
      .child(h_flex().px(8).pt(12).gap(6)
        .child(btn("hero-channel", "ds-plus", "Channel", () => this.duplicate(bot)))
        .child(btn("hero-tell", "ds-tell", "Tell", () => openOverlay({ mod: "crew-tell", kind: "dialog", width: 460, props: { space: space.id, tab: (this.leadTab(space) ?? tab)?.id } })))
        .child(btn("hero-tasks", "ds-tasks", "Tasks", () => setShared("crew.view", "tasks"), mine || null))
        .child(pebble(d, { id: "hero-sleep", icon: "ds-moon", onClick: (cx) => this.sleep(space, bot, cx), tooltip: "Put to sleep" })));
  }

  // The hero's channels, full width: a header ("Channels", the count, and a magnifier that opens a
  // search: it filters as you type, Esc or × clears and closes it), then one 28 px row per channel
  // (pinned first, then your order or the smart one): "#", the name, a pin mark, and a blue/amber dot while it works or needs you, a green
  // check when it finished, else when it last changed. The shown one is highlighted. Up to six rows
  // show; more scroll. Click switches, right-click is the channel menu.
  heroChannels(space, bot, d) {
    // Pinned first, then your arrangement or the smart order (channelOrder).
    const ordered = channelOrder(space, bot);
    const q = this.chSearchOpen ? this.chSearch.value().trim().toLowerCase() : "";
    const list = q ? ordered.filter((x) => channelName(x).toLowerCase().includes(q)) : ordered;
    const close = (cx) => { this.chSearch.set_value(""); this.chSearchOpen = false; cx.notify(); };
    const head = h_flex().id("hero-ch-head").h(32).pl(16).pr(10).items_center().gap(6);
    // Past four rows, how many are below the box (DeNon: say the list scrolls). The list's renderer
    // records the last row it drew (this.chEnd, keyed by what's listed); a scroll re-renders shortly
    // after, so the count follows it, and it's gone at the end.
    const ROWS = 4, ROW = 30;
    const listKey = `${space.id}|${q}|${list.length}`;
    // The renderer's range runs a row past what's on screen, so count from its first row: four full
    // rows are seen (five once the end is in view, where the peek row is the last one).
    const [start, end] = this.chEndKey === listKey ? this.chRange : [0, ROWS + 2];
    const below = list.length > ROWS ? Math.max(0, list.length - (start + (end >= list.length ? ROWS + 1 : ROWS))) : 0;
    if (this.chSearchOpen) {
      head.child(h_flex().flex_1().h(24).px(8).gap(6).items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color(d.lineMid)
          .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); close(cx); } })
          .child(svg(`${ICON}/ds-search.svg`).size(11).flex_none().text_color(d.fg4))
          .child(Input.new(this.chSearch).flex_1().text_size(12).text_color(d.fg1)))
        .child(div().id("hero-ch-x").size(22).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
          .hover((s) => s.bg(d.hover)).tooltip("Clear (Esc)").on_click((_e, cx) => close(cx))
          .child(svg(`${ICON}/x.svg`).size(10).text_color(d.fg3)));
    } else {
      head.child(div().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child("Channels"))
        .child(div().flex_1().text_size(11).line_height("14px").text_color(d.fg4).child(String(ordered.length)))
        .when(below > 0, (el) => el.child(div().id("hero-ch-more").flex_none().h(22).px(4).flex().items_center().rounded(d.r.xs).cursor_pointer()
          .hover((s) => s.bg(d.hover)).tooltip("Show the rest")
          .on_click((_e, cx) => { this.chScroll.scroll_to_item(list.length - 1); cx.timer.after(80, (cx) => cx.notify()); })
          .child(div().text_size(11).line_height("14px").text_color(d.fg2).child(`+${below} more`))))
        .child(div().id("hero-ch-search").size(22).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
          .hover((s) => s.bg(d.hover)).tooltip("Search channels")
          .on_click((_e, cx) => { this.chSearchOpen = true; this.chSearch.focus(); cx.notify(); })
          .child(svg(`${ICON}/ds-search.svg`).size(12).text_color(d.fg3)));
    }
    // Up to four rows show (DeNon: "at most 4"); more scroll. A virtual list with a scroll handle, so
    // the shown channel is scrolled into view when it changes (not on every render, so a scroll you
    // made stays put). With four or fewer the box hugs its rows. Its rows can't carry handlers (Herdr
    // refuses them inside a virtual list's renderer): clicks are the list's on_item_click /
    // on_item_secondary_click, by the channel's tab id.
    // ROW: a 28 px row and its 2 px gap.
    // The scroll area runs to the sidebar's edge and Herdr draws its thumb about 8-16 px in from that
    // edge whatever box the Scrollbar is given (seen on DeNon's screen), so the rows end 11 px in (a
    // short list: the same right edge as everything else) or 18 px in while the list overflows (a
    // gutter: the thumb never covers a time, pin or dot).
    const over = list.length > ROWS;
    const row = (tab) => {
      const on = tab.active;
      const st = bot.awake ? tab.status : null;
      const dot = st === "working" ? d.info : st === "blocked" ? d.warn : null;
      return div().h(ROW).pb(2).pr(over ? 18 : 11).child(h_flex().id(`hero-ch-${tab.id}`).h(28).px(8).gap(8).items_center().rounded(d.r.sm).cursor_pointer()
        .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
        .child(div().flex_none().text_size(12).line_height("16px").font_family(d.mono).text_color(on ? d.fg2 : d.fg4).child("#"))
        .child(div().flex_1().min_w(0).truncate().text_size(13).line_height("16px").when(on, (el) => el.font_weight(500))
          .text_color(on ? d.fg1 : tabHasAgent(tab) ? d.body : d.fg3).child(channelName(tab)))
        .when(tabPinned(tab), (el) => el.child(svg(`${ICON}/pin.svg`).size(10).flex_none().text_color(d.fg4)))
        .child(!tabHasAgent(tab) ? noAgentTag(d)
          : dot ? div().size(6).flex_none().rounded(3).bg(dot)
          : st === "done" ? svg(`${ICON}/ds-check-thin.svg`).size(11).flex_none().text_color(d.ok)
          : div().flex_none().text_size(11).line_height("14px").text_color(d.fg4).child(stamp(tab.changed_at))));
    };
    const box = v_flex();
    if (!list.length) {
      if (q) box.child(div().h(28).mx(8).px(8).flex().items_center().text_size(12).text_color(d.fg4).child(`No channel matches "${this.chSearch.value().trim()}"`));
      return v_flex().pt(4).child(head).child(box);
    }
    const act = list.findIndex((x) => x.active);
    const key = `${space.id}|${list[act]?.id ?? ""}|${q}`;
    if (this.chShownKey !== key) { this.chShownKey = key; if (act >= 0) this.chScroll.scroll_to_item(act); }
    // Past four, the box is four rows plus 40% of the fifth (12 px), cut at its edge: the cut row says
    // there's more. The scrollbar stays drawn while the list overflows, in the rows' gutter.
    const n = list.length, h = n > ROWS ? ROWS * ROW + 12 : n * ROW;
    box.child(div().relative().h(h).w_full()
      .on_scroll_wheel((_e, cx) => cx.timer.after(80, (cx) => cx.notify()))
      .child(div().pl(8).h(h).w_full().child(v_virtual_list("hero-ch-list", n, ROW, (i) => list[i].id, (range) => {
        this.chRange = [range.start, range.end]; this.chEndKey = listKey;
        const out = [];
        for (let i = range.start; i < range.end; i++) out.push(row(list[i]));
        return out;
      }).track_scroll(this.chScroll)
        .on_item_click((id, cx) => { const tab = space.tabs.find((x) => x.id === id); if (tab) { this.go(space, tab); cx.notify(); } })
        .on_item_secondary_click((id, _e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "tab", space: space.id, tab: id } }); })
        .h(h).w_full()))
      .when(n > ROWS, (el) => el.child(Scrollbar.vertical("hero-ch-list").mode("always").absolute().top(0).right(0).w(16).h(h))));
    return v_flex().pt(4).child(head).child(box);
  }

  // Put a pal to sleep (the hero's moon; the same as its menu's): keep its record (folder, brain,
  // model) so it wakes the same, then close its space (Herdr asks first).
  sleep(space, bot, cx) {
    updateBot(bot.record ?? bot, (b) => ({ ...b, folder: b.folder ?? space.folder ?? null, harness: b.harness ?? bot.harness ?? null }));
    cx.spawn(async () => { try { await rememberModel(space); } catch {} run("space.close", { id: space.id }); });
  }

  // ── Dragging pals and groups ────────────────────────────────────────────────────────────────
  // The pointer moved over a row or a group header while the button is down (this.drag is set by
  // the row's press): past 5 px it's a drag; `target` is where it would land (null: nowhere).
  dragOver(e, cx, target) {
    const dg = this.drag;
    if (!dg) return;
    if (!dg.active) { if (Math.abs(e.position.y - dg.y0) < 5) return; dg.active = true; }
    if (JSON.stringify(target) !== JSON.stringify(dg.over)) { dg.over = target; cx.notify(); }
  }
  // Released: put the pal where the line was (before the row under it, or after; a header: first in
  // that group), in that group.
  drop(cx) {
    const dg = this.drag;
    this.drag = null;
    if (!dg?.active || !dg.over) { if (dg) cx.notify(); return; }
    const bot = spaces().map((sp) => botOf(sp)).find((b) => b.id === dg.id);
    const o = dg.over;
    if (bot && o.id !== bot.id) {
      const rows = spaces().map((sp) => ({ space: sp, bot: botOf(sp) }));
      const sec = palSections(rows).find((x) => (x.group?.id ?? null) === (o.gid ?? null));
      const ids = (sec?.rows ?? []).map((r) => r.bot.id).filter((id) => id !== bot.id);
      let before = null;
      if (o.header) before = ids[0] ?? null;
      else { const k = ids.indexOf(o.id); before = k < 0 ? null : (o.after ? ids[k + 1] ?? null : ids[k]); }
      placePal(bot, o.gid ?? null, before);
    }
    cx.notify();
  }
  // A group's header, like a folder (DeNon, after Grok Bot): its name (Unassigned for pals with
  // none) and count, small and grey, 14 px of air above it. Hovering shows an r4 pill and a chevron
  // on the right; a click folds the group away or opens it (remembered in crew.marks.collapsed; a
  // folded group keeps its chevron). A drop target (first in the group); right-click for Rename /
  // Move / Delete / New group.
  groupHeader(g, n, d, folded = false) {
    const gid = g?.id ?? null;
    const key = gid ?? "_";
    const over = this.drag?.active && this.drag.over?.header && (this.drag.over.gid ?? null) === gid;
    const hot = this.hoverGroup === key;
    return h_flex().id(`grp-${gid ?? "none"}`).h(28).mt(14).flex_none().items_center().gap(6).pl(8).pr(8).rounded(d.r.sm).cursor_pointer()
      .when(Boolean(over) || hot, (el) => el.bg(d.hover))
      .on_hover((h, cx) => { const next = h ? key : (this.hoverGroup === key ? null : this.hoverGroup); if (next !== this.hoverGroup) { this.hoverGroup = next; cx.notify(); } })
      .on_mouse_move((e, cx) => this.dragOver(e, cx, { header: true, gid }))
      .on_click((_e, cx) => {
        if (this.drag?.active) return;
        const m = marks();
        setShared("crew.marks", { ...m, collapsed: { ...(m.collapsed ?? {}), [key]: !folded } });
        cx.notify();
      })
      .when(Boolean(g), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "group", group: gid } }); }))
      .child(div().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child(g ? g.name : "Unassigned"))
      .child(div().flex_1().text_size(11).line_height("14px").text_color(d.fg4).child(String(n)))
      .when(hot || folded, (el) => el.child(svg(`${ICON}/${folded ? "chevron-right" : "chevron-down"}.svg`).size(11).flex_none().text_color(d.fg3)));
  }
  // An empty group: somewhere to drop.
  groupDrop(gid, d) {
    const over = this.drag?.active && this.drag.over?.header && this.drag.over.gid === gid;
    return h_flex().id(`grp-drop-${gid}`).h(32).flex_none().items_center().pl(8).rounded(d.r.sm)
      .when(Boolean(over), (el) => el.bg(d.hover))
      .on_mouse_move((e, cx) => this.dragOver(e, cx, { header: true, gid }))
      .child(div().text_size(12).line_height("16px").text_color(d.fg4).child("Drag a pal here, or right-click one → Group"));
  }

  // A pal row's pet: bare on the sidebar (its open tiles, no box or hairline) over a soft aura, with a small still
  // pool of the state's colour under it, as the hero's floor has (asks you breathes). No edge loader:
  // the paw taps and the bits rise while it works, and the row's dot says so too.
  rowPet(bot, m, t) {
    const p = petOf(bot);
    if (!p || !petReady(p)) return mascotEl(bot, m, ROW_PET, t);
    const state = petState(bot, m);
    const h = Math.round(ROW_PET * 108 / 138);
    const lit = bot.awake && ["work", "done", "ask", "pr", "merged", "closing", "stuck"].includes(state);
    return div().relative().w(ROW_PET).h(h).flex_none()
      // Depth without an edge (DeNon: the old box's depth, not its line): a soft radial aura behind
      // the pet that fades out to nothing. An image, so it stays behind (svg() would draw over).
      .child(div().absolute().left(-12).top(-9).w(ROW_PET + 24).h(h + 18).child(image(`${ICON}/pet-aura-row.svg`).w(ROW_PET + 24).h(h + 18)))
      .when(lit, (el) => el.child(div().absolute().left(-6).top(h - 17).w(ROW_PET + 12).h(24)
        .when(state === "ask", (x) => x.loop("opacity", { from: 0.35, to: 1, period: 1100 }))
        .child(image(`${ICON}/pet-floor-${state}.svg`).w(ROW_PET + 12).h(24))))
      .child(div().absolute().left(0).top(0).child(petEl(p, state, ROW_PET, h, { open: true })));
  }

  // A Focus pal row: 68 px, r6, the pet bare at 75x59 (DeNon 2026-11-08; dimmed while it's closed), name + time + dot, "[channel] what it's on".
  palRow({ space, bot }, t, d, gid = undefined) {
    const st = space.status;
    const on = space.active;
    const awake = bot.awake || bot.starting;
    const dot = awake ? this.liveDot(st, d) : null;
    const news = awake && ["working", "blocked", "done"].includes(st);
    const [tag, what] = this.doing(space, bot);
    // Hierarchy: name #EDEDED, what it's on #C8C8C8, [channel] #808082 mono; a closed pal's text
    // never drops below #808082 (its pet dims instead).
    const nameColor = awake ? d.fg1 : d.fg2;
    const whatColor = awake ? d.body : d.fg2;
    // Dragging (pals in the groups, not the head pal or hidden ones): press, move 5 px, and a 2 px
    // line shows where it will land (above or below the row under the pointer); release drops it.
    const draggable = gid !== undefined && !bot.god;
    const dg = this.drag?.active ? this.drag : null;
    const over = dg?.over && dg.over.id === bot.id ? dg.over : null;
    return h_flex().id(`bot-${space.id}`).relative().h(ROW_H).flex_none().items_center().gap(12).pl(8).pr(8).rounded(d.r.md).cursor_pointer()
      .when(on, (el) => el.bg(d.sel))
      .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .when(Boolean(dg) && dg.id === bot.id, (el) => el.opacity(0.45))
      .when(draggable, (el) => el
        .on_mouse_down("left", (e) => { this.drag = { id: bot.id, gid, y0: e.position.y, active: false, over: null }; })
        .on_mouse_move((e, cx) => this.dragOver(e, cx, { id: bot.id, gid, after: e.local_position.y > e.bounds.height / 2 })))
      .when(!draggable && gid === undefined && bot.god, (el) => el.on_mouse_move((e, cx) => this.dragOver(e, cx, null)))
      .when(Boolean(over), (el) => el.child(div().absolute().left(6).right(6).h(2).rounded(1).bg(d.info).when(over.after, (x) => x.bottom(0)).when(!over.after, (x) => x.top(0))))
      .on_click((_e, cx) => { if (this.drag?.active) return; this.open(space); cx.notify(); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(space); })
      .child(div().flex_none().when(!awake, (el) => el.opacity(0.5)).child(this.rowPet(bot, mood(st, awake), t)))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().items_center().gap(6)
          .child(div().flex_1().min_w(0).truncate().text_size(14).line_height("18px").when(on || news, (el) => el.font_weight(500)).text_color(nameColor).child(bot.name))
          .when(palPinned(bot), (el) => el.child(svg(`${ICON}/pin.svg`).size(10).flex_none().text_color(d.fg4)))
          .child(div().flex_none().text_size(11).line_height("18px").text_color(d.fg3).child(stamp(this.lastChange(space))))
          .when(Boolean(dot), (el) => el.child(div().size(6).flex_none().rounded(3).bg(dot))))
        // [channel], then what it's on, each on its own full-width line (side by side, a long
        // channel name squeezed the preview into a narrow column).
        .when(Boolean(tag), (el) => el.child(div().min_w(0).truncate().text_size(11).line_height("15px").font_family(d.mono).text_color(d.fg2).child(`[${tag}]`)))
        .child(div().min_w(0).truncate().text_size(12).line_height("16px").text_color(whatColor).child(what)));
  }

  sleeperRow(rec, t, d) {
    const bot = { ...rec, awake: false };
    return h_flex().id(`sleep-${rec.id}`).h(ROW_H).flex_none().items_center().gap(12).pl(8).pr(8).rounded(d.r.md).cursor_pointer()
      .hover((s) => s.bg(d.hover))
      .on_click(() => this.wake(rec))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 260, props: { what: "sleeper", rec: rec.id } }); })
      .child(div().flex_none().opacity(0.5).child(this.rowPet(bot, "asleep", t)))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(div().truncate().text_size(14).line_height("18px").text_color(d.fg2).child(rec.name))
        .child(div().truncate().text_size(12).line_height("16px").text_color(d.fg2).child("closed · click to wake")));
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
      .child(h_flex().id("crew-hire").items_center().gap(8).py(6).px(8).rounded(6).cursor_pointer()
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
