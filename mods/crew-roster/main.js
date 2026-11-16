// Project Pals roster: your pals (left pane of the Project Pals layout). Every space is a pal, a project with a
// brain; its tabs are its channels (the hero lists the shown pal's). Each pal's mascot shows its most
// urgent channel. Clicking a pal, the head pal too, shows its terminal: Project Pals is terminal-focused
// (T235). What needs you is in Your call (crew-decide), not here.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, agents, terminals, run, theme, settings, openOverlay, machines, shared, setShared, nextCommand, layout, notify } from "herdr";
import { tapNeed, tapsHolding } from "./helperlog.js";
import {
  alertSound, crew, botOf, sleepers, mascotEl, mood, channelName, harnessName, ago, a, migrateChannelKeys, linkRecords, updateBot, refreshMachines, STATUS_RANK, WAVE, statusWord, rooms, roomMembers, showTabs, adoptRooms, serveRequests, loadOps, ownerCli, taskOf, findChannel, ensureLooks, syncPetState, syncSettings, owner as ownerName, marks, autoColor, orderPins, pinPal, wakePal, tone, applyLayout, rememberWidths, sidebarPref, ds, leadPane, petOf, petReady, petEl, petState, palOrder, stamp, palPinned, taskTitle, agentTabs, noAgentTag, openChannels, rememberModel, channelOrder, tabPinned, palSections, palGroups, placePal, pebble, needsOf, blockedReports, appMenuSpec, noteWindowHeight, workingMark, palListStyle, palFacts, sleeperFacts, palPet, palLookRow, palLookTree, palLeadTab, palTreesOn, topicsFolded, workingEverywhere, anyAreas, areaViews, areaChipW, AREA_CHIP_GAP, LIVE_VIEW, syncAreas, topicRenamed, sunk, raisedTile, saveUiSettings, palStatus, topicMark, severalFactories, currentFactory, inFactory, isForeman, syncFactories, countFactoryNeeds, needsOutsideFactory, openFactoryMenu, templateOf, scrollArea, scrollState, scrollTo, scrollIntoView, deskLane, deskLaneMark, deskSlug, welcomeMark, openWelcome, openDecide, ownerCount, openTerminal, CLOSE_LABEL, toggleChief, withoutChief, isChiefRec, openPalMenu, popOut
} from "./crew.js";

const ICON = "mods/crew-roster/icons";
// Focus grid (2026-11-08 audit): content (text, icons, pets) starts 16 px in; row backgrounds and
// buttons sit 8 px in from both sides.
// Focus pal rows: drawn by crew.js palLookRow in the look chosen in Project Pals settings → Pal list
// style. Large pets (the default): the pet 75 wide, bare, in a 64 px row (DeNon 2026-11-08); the ten
// compact looks use 22-34 px pets (lib/palstyles.js).
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

// A blocked channel whose question is for you, not one asking another pal (T19: the roster's
// published "crew.needs" lists those apart, so the count, the rail and Your call agree).
const askingYou = (tab) => tab.status === "blocked" && !(shared("crew.needs")?.toPalItems ?? []).some((x) => x.tab === tab.id);

export default class CrewRoster extends View {
  init(_props, cx) {
    // Relative times ("4m") stay true.
    cx.timer.every(60000, (cx) => cx.notify());
    // Channel data follows tab ids, so renames keep categories and briefs.
    migrateChannelKeys();
    cx.timer.every(5000, () => { migrateChannelKeys(); linkRecords(); });
    // The machines (hc machine ls) and this computer, for every mod: shared "crew.machines".
    cx.spawn(async () => { await refreshMachines(); });
    cx.timer.every(20000, (cx) => cx.spawn(async () => { await refreshMachines(); }));
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
      try { await syncFactories(); } catch {}
      try { await syncAreas(); } catch {}
      this.followRenames();
      // Laid out: the topic's terminal shows (an older install's clicks may have left Home's
      // home-view selected in the center stack, T235).
      if (!this.laidOut && applyLayout()) { this.laidOut = true; showTabs(); cx.notify(); }
      // A first install: the welcome tour opens by itself, once per window (it resumes at the screen
      // it was left on). A replay from the gear menu opens it itself.
      if (this.laidOut && !this.welcomed && welcomeMark()?.state === "new") { this.welcomed = true; openWelcome(); cx.notify(); }
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
    this.ops = { approvals: [], proposals: [], tasks: [], routines: [], stalled: {}, daemon: true };
    const ops = (cx) => cx.spawn(async (cx) => {
      try { this.ops = await loadOps(); } catch {}
      // A relayed tap just started its hold (T147): say so once, wherever you are in the app. An outward
      // one (a push, a release, a landing) also plays the "needs you" sound: it goes through by itself.
      for (const h of tapsHolding(this.ops.taps)) {
        if ((this.tapsSaid ??= new Set()).has(h.id)) continue;
        this.tapsSaid.add(h.id);
        const tn = tapNeed(h);
        notify({ title: tn.title, body: `${tn.goes} unless you stop it. Stop is in Your call.`, level: tn.outward ? "warning" : "info", timeout: tn.outward ? 20000 : 8000,
          action: { name: "crew-header.decide" } });
        if (tn.outward) alertSound("blocked");
      }
      // What blocked agents said (only they're asked), so a pal asking another pal isn't counted (T19).
      try { this.reports = await blockedReports(this.reports ?? {}); } catch {}
      // What needs DeNon, for the header's pill and Your call, with why each counts (published only
      // when it changes, reasons included).
      const n = needsOf(withoutChief(), this.ops, this.reports ?? {}, shared("crew.desk")?.needs ?? []), was = shared("crew.needs");
      if (JSON.stringify(was ?? null) !== JSON.stringify(n)) setShared("crew.needs", n);
      this.publishFactoryNeeds();
      cx.notify();
    });
    ops(cx);
    cx.timer.every(2500, (cx) => ops(cx));
    this.refreshOps = ops;
    // Pocket-pet states beyond Herdr's: stuck (crewd's health file) and each branch's PR (gh).
    // On its own timer so a slow gh never holds up the rest; one pass at a time.
    const pets = (cx) => { if (this.petBusy) return; this.petBusy = true;
      cx.spawn(async () => { try { await syncPetState(this.ops.stalled); } catch {} this.petBusy = false; }); };
    cx.timer.after(1500, (cx) => pets(cx));
    cx.timer.every(10000, (cx) => pets(cx));
    // The hero's channel search (its header's magnifier): filters as you type, Esc clears.
    this.chSearch = InputState.new({ placeholder: "Search topics" });
    this.chSearch.on("change", (_e, cx) => cx.notify());
    this.chSearchOpen = false;
    this.chShownKey = null;
    // keys.json / herdr-app do: crew-roster.hire, crew-roster.channel (add one to the shown pal), crew-roster.home.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "hire") this.hire();
        else if (c === "look") { const sp = spaces().find((x) => x.active); if (sp) this.look(sp); }
        else if (c === "topic" || c === "channel" || c === "duplicate") { const s = spaces().find((x) => x.active); if (s) this.duplicate(botOf(s)); }
        // Ctrl+Shift+I: the shown pal's profile panel (again: closes it).
        // Ctrl+Shift+H: the head pal's terminal, with the keyboard in it.
        else if (c === "home") openTerminal();
        // Ctrl+Shift+J: the Chief's pop-up (again: closes it).
        else if (c === "chief") toggleChief();
        // Ctrl+Shift+G: the factory switcher.
        else if (c === "factory" || c === "factories") openFactoryMenu();
        cx.notify();
      }
    });
  }

  // With several factories: what each one needs from you (the switcher's counts, the chip's count
  // of the others'). Everything Your call lists counts, Desk cards and proposals too.
  publishFactoryNeeds() {
    const fn = countFactoryNeeds(this.waitingNow(), this.ops, shared("crew.factory.asks") ?? [], shared("crew.desk")?.needs ?? []);
    if (JSON.stringify(shared("crew.factory.needs") ?? {}) !== JSON.stringify(fn)) setShared("crew.factory.needs", fn);
  }

  // Topics that wait on you (a question for you), in every factory.
  waitingNow() {
    return withoutChief().flatMap((space) => space.tabs.filter((tb) => askingYou(tb)).map((tab) => ({ space, tab })));
  }

  // A pal by name (as tasks and approvals name them) → its space and a channel to show.
  locate(spec) {
    const f = findChannel(spec ?? "");
    return f.error ? null : f;
  }

  // A topic: its terminal, with the keyboard (from Home, a room or the Desk too).
  go(space, tab) { openTerminal(space, tab); }

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
        if (rec?.god) await ownerCli(["settings", "head", name]);   // the owner renamed it in Herdr: the app's token (Grok review H1)
        else { await ownerCli(["renamed", old, name]); if (rec) updateBot(rec, (b) => ({ ...b, name })); }
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
  hire() { openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true }); }
  duplicate(bot) { openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: bot.space } }); }

  render() {
    const t = tone(theme());
    const c = crew();
    const all = withoutChief(spaces(), c);   // the Chief lives in its pop-up, not the sidebar
    const ps = panes();
    const only = shared("crew.demo");
    const rows = (only ? all.filter((s) => only.includes(s.name)) : all).map((space) => ({ space, bot: botOf(space, c, ps) }))
      // The head pal sits above everyone; then whoever needs you most.
      .sort((x, y) => (y.bot.god ? 1 : 0) - (x.bot.god ? 1 : 0) || (STATUS_RANK[y.space.status] ?? 0) - (STATUS_RANK[x.space.status] ?? 0) || x.space.index - y.space.index);
    // With several factories the list is the shown factory's floor, its foreman on top. Your call
    // stays everyone's: what waits on you is never hidden by a switch.
    const several = severalFactories();
    const floor = several ? rows.filter((r) => inFactory(r.space.name)).sort((x, y) => (isForeman(y.space, y.bot) ? 1 : 0) - (isForeman(x.space, x.bot) ? 1 : 0)) : rows;
    const asleep = sleepers(spaces(), c).filter((b) => !isChiefRec(b)).filter((rec) => !several || inFactory(rec.name));
    // For the rail's count: channels that finished while you weren't looking ("done") or ask ("blocked").
    const waiting = rows.flatMap((r) => r.space.tabs.filter((tb) => tb.status === "blocked" || tb.status === "done").map((tab) => ({ ...r, tab })));
    // Also waiting on you: commands held for approval, and channels that look stuck.
    const extra = this.ops.approvals.length + Object.keys(this.ops.stalled).length + (this.ops.proposals?.length ?? 0)
      + (shared("crew.desk")?.needs?.length ?? 0);
    if (narrow()) return this.rail(floor, waiting, t, extra);
    return this.focusColumn(floor, asleep, waiting, t, extra);
  }

  // Folded: just the pals' faces, the active one lit, a red count for what needs you.
  rail(rows, waiting, t, extra = 0) {
    // What waits on you, as Your call counts it (the header's pill); a click opens Your call.
    const total = waiting.length + extra;
    const urgent = waiting.some((w) => askingYou(w.tab)) || this.ops.approvals.length > 0;
    // Pinned pals first here too (after the head pal).
    const pins = marks().pals ?? {};
    const rank = (r) => (r.bot.god ? 0 : pins[r.bot.id]?.pin ? 1 : 2);
    rows = [...rows].sort((x, y) => rank(x) - rank(y) || (rank(x) === 1 ? pins[x.bot.id].pin - pins[y.bot.id].pin : 0));
    const icon = (id, name, action, color = t.muted) => div().id(id).size(36).flex().items_center().justify_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg(a(t.foreground, "10"))).on_click(action).child(svg(`${ICON}/${name}.svg`).size(16).text_color(color));
    return v_flex().id("crew-rail").size_full().items_center().pt(16).pb(12).gap(10).text_color(t.foreground)
      .child(icon("rail-open", "panel-left", () => toggleRail()))
      .when(total > 0, (el) => el.child(div().id("rail-you").relative().cursor_pointer().tooltip("Your call (Ctrl+Shift+A)").on_click((_e, cx) => { openDecide(); cx.notify(); })
        .child(div().size(36).flex().items_center().justify_center().rounded(6).hover((s) => s.bg(a(t.foreground, "10")))
          .child(div().text_size(15).font_weight(300).text_color(urgent ? t.blocked : t.done).child(String(total))))))
      .child(div().w(28).h(1).bg(a(t.foreground, "14")))
      .child(scrollArea(ds(t), "rail-list", v_flex().items_center().gap(6)
        // Faces only here, so each one names its pal on hover.
        .children(rows.map(({ space, bot }) => div().id(`rail-${space.id}`).tooltip(bot.name).relative().size(44).flex().items_center().justify_center().rounded(6).cursor_pointer()
          .when(space.active, (el) => el.bg(a(t.accent, "26")))
          .when(!space.active, (el) => el.hover((s) => s.bg(a(t.foreground, "0c"))))
          .on_click(() => this.open(space))
          .child(mascotEl(bot, mood(palStatus(space), bot.awake), 32, t))
          .when(space.status === "blocked", (el) => el.child(div().absolute().top(4).right(4).size(8).rounded_full().bg(t.blocked)))))).flex_1().min_h(0).w_full())
      .child(icon("rail-hire", "plus", () => this.hire()))
      .child(icon("rail-settings", "settings", () => openOverlay({ mod: "crew-appmenu", kind: "popup", ...appMenuSpec() })));
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
      .child(blocked ? `${blocked} blocked` : `${n} topic${n === 1 ? "" : "s"}`);
  }

  // ── Drawn to the Paper board "MODE · Focus (default)", then reworked with DeNon ─────────────

  // The channel a pal's row stands for, and opens (crew.js palLeadTab): one that needs you, else
  // one that finished, else one working, else the most recently active.
  leadTab(space) { return palLeadTab(space); }
  // Clicking a pal shows its terminal, the head pal's too (T235: Home is gone; terminal-focused).
  open(space) {
    this.go(space, this.leadTab(space));
  }

  // Focus: the shown pal as the hero card, then the pals.
  focusColumn(rows, asleep, waiting, t, extra) {
    const d = ds(t);
    const w = this.width ?? 304;
    const shown = rows.find((r) => r.space.active) ?? rows.find((r) => isForeman(r.space, r.bot)) ?? rows[0];
    const ordered = palOrder(rows);
    const live = ordered.filter((r) => r.bot.awake || r.space.active || r.bot.starting);
    const dozing = ordered.filter((r) => !(r.bot.awake || r.space.active || r.bot.starting));
    const nHidden = dozing.length + asleep.length;
    const showHidden = localStorage.getItem("asleep-open") === "1";
    // The pal list's look (Project Pals settings → Pal list style; Large pets by default).
    const look = palListStyle();
    const root = v_flex().id("crew-roster").size_full().bg(d.bg1).border_r_1().border_color(d.line)
      // Window pixels → design pixels (Herdr's zoom scales what we draw).
      .on_size_change((size, cx) => { const k = Number(settings().zoom) || 1, w = size.width / k; noteWindowHeight(size.height / k); if (Math.abs((this.width ?? 0) - w) > 1) { this.width = w; cx.notify(); } });
    // The factory chip: only once there's a second factory.
    if (severalFactories()) root.child(this.factoryChip(d));
    if (shown) root.child(this.heroCard(shown, t, d, w));
    // The list scrolls in our own area (scrollArea: the pill thumb sits in its 8 px right padding).
    const list = v_flex().px(8).pt(8).pb(24).gap(2)
      // A pal drag ends on release anywhere in the list, and is dropped if the pointer leaves it.
      .on_mouse_up("left", (_e, cx) => this.drop(cx))
      .on_hover((h, cx) => { if (!h && this.drag) { this.drag = null; cx.notify(); } });
    const scroller = (inner) => scrollArea(d, "crew-list", inner, { fade: "side" }).flex_1().min_h(0);
    list.child(h_flex().h(28).flex_none().items_center().pl(8).pr(2)
      .child(div().flex_none().text_size(12).font_weight(500).text_color(d.fg3).child("Pals"))
      // How many agents are working, everywhere (T98: it moved here from the status strip, and now
      // counts every pal, machine and factory, not just what this list shows). Hover: who.
      .child(this.workingChip(d))
      // Trees: fold or unfold every pal's topics at once (DeNon, 2026-11-08). It's the same "palTrees"
      // as the switch in Pal list style, so it's remembered and both always agree. Fixed 20 px, like
      // the search button beside it, so nothing moves when it flips.
      .child(this.treesToggle(d))
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
      // In the compact looks it's a quieter, shorter line, its icon centred over the pets' column.
      // No count on the right (2026-11-10: DeNon's red line through the pal rows' numbers ran
      // through it too, as Orca read it); the tooltip says how many.
      const big = look.id === "large";
      list.child(h_flex().id("asleep-toggle").h(big ? 40 : 30).flex_none().items_center().gap(big ? 12 : 10).pl(8).pr(8).rounded(d.r.md).cursor_pointer()
        .when(!big, (el) => el.mt(4))
        .hover((s) => s.bg(d.hover)).tooltip(`${nHidden} hidden pal${nHidden === 1 ? "" : "s"}: click to ${showHidden ? "fold" : "show"}`)
        .on_click((_e, cx) => { localStorage.setItem("asleep-open", showHidden ? "0" : "1"); cx.notify(); })
        .child(div().w(look.pet).flex_none().flex().justify_center().child(svg(`${ICON}/ds-eye-off.svg`).size(big ? 15 : 13).text_color(d.icon)))
        .child(div().flex_1().text_size(big ? 13 : 12).text_color(d.fg2).child("Hidden pals")));
      if (showHidden) list.children(dozing.map((r) => this.palRow(r, t, d))).children(asleep.map((rec) => this.sleeperRow(rec, t, d)));
    }
    return root.child(scroller(list));
  }

  // Which factory this is, and the way to the others (design F-A, DeNon's pick 2026-11-09): a colour
  // square, its name, its template, and an amber count of what the OTHER factories need from you.
  factoryChip(d) {
    const f = currentFactory();
    const n = needsOutsideFactory();
    return div().flex_none().px(8).pt(8).child(h_flex().id("factory-chip").h(32).items_center().gap(8).pl(10).pr(8).rounded(d.r.sm).cursor_pointer()
      .bg(d.raised).border_1().border_color(d.lineMid)
      .hover((s) => s.bg(d.hover)).tooltip("Switch factory")
      .on_click(() => openFactoryMenu())
      .child(div().size(9).flex_none().rounded(2).bg(f.color))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_weight(600).text_color(d.fg1).child(f.name))
      .child(div().flex_none().text_size(11).text_color(d.fg3).child(templateOf(f.template).short))
      .when(n > 0, (el) => el.child(div().id("factory-chip-n").flex_none().h(16).px(5).flex().items_center().rounded(3).bg(d.warn).text_size(11).font_weight(600).text_color("#1A1203")
        .tooltip(`${n} waiting on you in other factories`).child(String(n))))
      .child(svg(`${ICON}/chevron-down.svg`).size(11).flex_none().text_color(d.fg3)));
  }

  // The Focus hero (hero v2, DeNon 2026-11-08: "2 · Floor", then the name up top and the channels
  // full width). No box: the shown pal's pet and its laptop at the sidebar's full width, standing
  // on a floor (a pool of the state's colour under the pet, no line: working blue, done
  // mint, asks you amber and breathing, PR green, merged purple, closing red, stuck amber; none at
  // rest; no saber here: DeNon found one moving along the floor annoying). The name sits in a
  // 36 px band at the top, just over the sprite (16/600, the full width, never cut; a state dot before
  // it; no state word). Under the floor: the pal's channels, full width,
  // up to six rows then scrolling, with a search in their header; then the quick actions as
  // pebbles: Inbox (the needs-you count), Tasks (its count), Profile (icon: the right-side panel), Sleep (icon). The
  // name opens the profile panel too. Its task text is in its pal row below.
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
    const NB = 36;      // the name's band over the sprite (what a pal wears reaches the sprite's top edge)
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
    // Its glow reaches zero by the image's bottom edge (the SVG's ellipse ends a pixel inside it),
    // and the image ends exactly at the art's bottom edge: nothing lit is cut off in a line above
    // "Topics" (T103; the glow used to be 15% blue where its image ended, 8 px below the art).
    if (lit) art.child(div().id("hero-pool").absolute().left(0).top(FY + 6 - 72).w(W).h(72)
      .when(state === "ask", (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1100 }))
      .child(image(`${ICON}/pet-floor-${state}.svg`).w(W).h(72)));
    art.child(div().absolute().left(SX).top(NB - 4).child(ready ? petEl(p, state, SW, H, { open: true })
      : div().w(SW).h(H).flex().items_center().justify_center().child(mascotEl(bot, m, 96, t))));
    // The name, in its own band at the top: the sprite starts just under it (bun ears, antennas and
    // crowns reach the sprite's top edge, so text over the sprite would sit on dots).
    art.child(h_flex().absolute().left(16).top(10).w(W - 32).items_center().gap(7)
      .when(Boolean(dot), (el) => el.child(div().size(7).flex_none().rounded(4).bg(dot)))
      // The name opens the pal menu (Pals Lite, T217: the profile panel is gone); the rest of the art shows the pal.
      .child(div().flex_1().min_w(0).child(div().id("hero-name").text_size(16).line_height("20px").font_weight(600).text_color(d.fg1)
        .cursor_pointer().hover((s) => s.underline())
        .on_click((_e, cx) => { cx.stop_propagation(); openPalMenu(space.id); cx.notify(); })
        .child(bot.name)))
      // No state word (DeNon took it out): the dot, the pose and the floor say it; the tooltip names it.
      .tooltip(`${bot.name} · ${label} · click the name for its menu`));
    // The tools are raised "pebbles" (DeNon, after the Omarchy Recess plugin's Raised look, T109), all
    // the same size: they share the row equally (flex-basis 0), 6 px apart. T235 took out Inbox, Tasks
    // and the head pal's Home (Project Pals is terminal-focused): Pop out, then Close pal. The head
    // pal never sleeps, so its last slot is Your call (the same two widths for every pal), with what
    // waits on you as an amber count.
    const tool = (id, icon, action, tip, more = {}) => pebble(d, { id, icon, even: true, onClick: action, tooltip: tip, ...more });
    const waits = bot.god ? ownerCount(shared("crew.needs"), [], []) : 0;
    return v_flex().id(`hero-${space.id}`).flex_none().pb(14).border_b_1().border_color(d.line)
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(space); })
      .child(art)
      .child(this.heroChannels(space, bot, d))
      .child(h_flex().id("hero-tools").px(8).pt(12).gap(6)
        // Pop out (Pals Lite, T217): the shown topic's terminal in its own window.
        .child(tool("hero-popout", "ds-expand", () => { const tab = space.tabs.find((x) => x.active); if (tab) popOut(space, tab); }, "Pop out this topic's terminal"))
        .child(bot.god
          ? tool("hero-decide", "ds-check", () => openDecide(), `Your call (Ctrl+Shift+A)${waits ? `: ${waits} waiting` : ""}`,
            { extra: waits ? (waits > 99 ? "99+" : waits) : null, extraColor: waits ? d.warnText : null })
          : tool("hero-sleep", "ds-moon", (cx) => this.sleep(space, bot, cx), CLOSE_LABEL)));
  }

  // The hero's channels, full width: a header ("Channels", the count, and a magnifier that opens a
  // search: it filters as you type, Esc or × clears and closes it), then one 28 px row per channel
  // (pinned first, then your order or the smart one): "#", the name, a pin mark, and a blue/amber dot while it works or needs you, a green
  // check when it finished, else when it last changed. The shown one is highlighted. Up to four rows
  // show; more scroll. Click switches, right-click is the channel menu.
  heroChannels(space, bot, d) {
    // Pinned first, then your arrangement or the smart order (channelOrder).
    // One panes() read for the whole list (see agentTabs).
    const ps = panes(), withAgent = agentTabs(ps), hasAgent = (x) => withAgent.has(x.id);
    const ordered = channelOrder(space, bot, ps);
    const q = this.chSearchOpen ? this.chSearch.value().trim().toLowerCase() : "";
    // Areas (T105, DeNon's pick B): once anyone has filed a topic, the list shows one view at a
    // time, chosen from a row of chips: Live (the default), one of this pal's areas, Unsorted, or
    // All. A search looks through every topic whatever the view. No areas anywhere: no chips, and
    // the list is every topic, as it always was.
    const views = anyAreas() ? areaViews(space.name, ordered, hasAgent) : null;
    const viewId = views ? (views.some((v) => v.id === this.areaView?.[space.id]) ? this.areaView[space.id] : LIVE_VIEW) : null;
    // (Never trust the chosen id to be there: a view that isn't must fall back to Live, not fail the
    // whole sidebar's render. A sandbox run with a forced id showed exactly that failure.)
    const inView = views ? (views.find((v) => v.id === viewId) ?? views[0]).tabs : ordered;
    const list = q ? ordered.filter((x) => channelName(x).toLowerCase().includes(q)) : inView;
    const close = (cx) => { this.chSearch.set_value(""); this.chSearchOpen = false; cx.notify(); };
    const head = h_flex().id("hero-ch-head").h(32).pl(16).pr(10).items_center().gap(6);
    // No "+N more" in the header (DeNon, 2026-11-08: "Topics 18" says it; the cut fifth row, the
    // pill and the fixed box show there's more).
    // The rows sit in a recessed well (sunk "deep": T75): 1 px of edge and PAD px above the first row.
    const ROWS = 4, ROW = 30, PAD = 4, SID = "hero-ch-list";
    const BOX = ROWS * ROW + 12, INNER = BOX - 2;
    const sc = scrollState(SID);
    // Folded (the chevron, DeNon 2026-11-08): just this header, with what's working or asks you in
    // words. One remembered state for every pal ("heroTopicsFolded" in crew-settings.json), so the
    // hero is still the same height whichever pal you switch to. Searching unfolds it.
    const folded = topicsFolded() && !this.chSearchOpen;
    const setFolded = (f, cx) => { saveUiSettings({ heroTopicsFolded: f }); cx.notify(); };
    if (this.chSearchOpen) {
      head.child(h_flex().flex_1().h(24).px(8).gap(6).items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color(d.lineMid)
          .on_key_down((e, cx) => { if (e.key === "escape") { cx.stop_propagation(); close(cx); } })
          .child(svg(`${ICON}/ds-search.svg`).size(11).flex_none().text_color(d.fg4))
          .child(Input.new(this.chSearch).flex_1().text_size(12).text_color(d.fg1)))
        .child(div().id("hero-ch-x").size(22).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
          .hover((s) => s.bg(d.hover)).tooltip("Clear (Esc)").on_click((_e, cx) => close(cx))
          .child(svg(`${ICON}/x.svg`).size(10).text_color(d.fg3)));
    } else {
      const live = bot.awake ? ordered.filter(hasAgent) : [];
      const working = live.filter((x) => x.status === "working").length, asks = live.filter((x) => x.status === "blocked").length;
      const summary = [String(ordered.length), working && `${working} working`, asks && `${asks} need${asks === 1 ? "s" : ""} you`].filter(Boolean).join(" · ");
      head.child(div().text_size(11).line_height("14px").font_weight(500).text_color(d.fg3).child("Topics"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).line_height("14px").text_color(d.fg4).child(folded ? summary : String(ordered.length)))
        .child(div().id("hero-ch-search").size(22).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
          .hover((s) => s.bg(d.hover)).tooltip("Search topics")
          .on_click((_e, cx) => { if (topicsFolded()) saveUiSettings({ heroTopicsFolded: false }); this.chSearchOpen = true; this.chSearch.focus(); cx.notify(); })
          .child(svg(`${ICON}/ds-search.svg`).size(12).text_color(d.fg3)))
        // Fixed 22 px, like the magnifier, so nothing moves when it flips.
        .child(div().id("hero-ch-fold").size(22).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
          .hover((s) => s.bg(d.hover)).tooltip(folded ? "Show topics" : "Fold topics")
          .on_click((_e, cx) => setFolded(!folded, cx))
          .child(svg(`${ICON}/${folded ? "chevron-right" : "chevron-down"}.svg`).size(12).text_color(d.fg3)));
    }
    if (folded) return v_flex().pt(4).child(head);
    const chips = views ? this.areaChips(space, views, viewId, d) : null;
    // Up to four rows show (DeNon: "at most 4"); more scroll, in our own scroll area (scrollArea: a
    // pill thumb in the 11 px the rows leave at the right, so it never covers a time, pin or dot).
    // The shown topic is scrolled into view when it changes (not on every render, so a scroll you
    // made stays put). The box is always four rows + the peek (BOX). Plain rows, so each takes its
    // own click (open) and right-click (the topic menu).
    const row = (tab) => {
      const on = tab.active;
      const st = bot.awake ? tab.status : null;
      const dot = st === "working" ? d.info : st === "blocked" ? d.warn : null;
      const lane = deskLane(space.name, channelName(tab));
      // The shown topic is a raised tile in the well (raisedTile).
      return div().h(ROW).flex_none().pb(2).pr(13).child(h_flex().id(`hero-ch-${tab.id}`).relative().h(28).pl(6).pr(8).gap(8).items_center().rounded(5).cursor_pointer()
        .when(on, (el) => raisedTile(d, el)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
        .on_click((_e, cx) => { this.go(space, tab); cx.notify(); })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "tab", space: space.id, tab: tab.id } }); })
        .child(topicMark(tab))
        .child(div().flex_none().text_size(12).line_height("16px").font_family(d.mono).text_color(on ? d.fg2 : d.fg4).child("#"))
        .child(div().flex_1().min_w(0).truncate().text_size(13).line_height("16px").when(on, (el) => el.font_weight(500))
          .text_color(on ? d.fg1 : hasAgent(tab) ? d.body : d.fg3).child(channelName(tab)))
        .when(tabPinned(tab), (el) => el.child(svg(`${ICON}/pin.svg`).size(10).flex_none().text_color(d.fg4)))
        // The Desk: "N waiting" or "held 12m" when cards wait for this topic (crew.desk, from the header).
        .when(Boolean(lane?.open), (el) => el.child(deskLaneMark(d, lane)))
        .child(!hasAgent(tab) ? noAgentTag(d)
          : st === "working" ? workingMark(d)
          : dot ? div().size(6).flex_none().rounded(3).bg(dot)
          : st === "done" ? svg(`${ICON}/ds-check-thin.svg`).size(11).flex_none().text_color(d.ok)
          : div().flex_none().text_size(11).line_height("14px").text_color(d.fg4).child(stamp(tab.changed_at))));
    };
    // The box is always four rows plus the peek (BOX), whatever the pal has, so switching pals never
    // moves the quick actions or the Pals list under it (DeNon, 2026-11-08). Fewer rows leave the
    // rest blank, with a faint "+ New channel" row after the last when there's room (not while
    // searching).
    const box = sunk(d, "deep").flex().flex_col().h(BOX).mx(8).flex_none();
    const newRow = (first = false) => div().h(ROW + (first ? PAD : 0)).flex_none().pb(2).pr(13).pl(4).when(first, (el) => el.pt(PAD)).child(h_flex().id("hero-ch-new").h(28).pl(6).pr(8).gap(8).items_center().rounded(d.r.sm).cursor_pointer()
      .hover((s) => s.bg(d.hover)).on_click(() => this.duplicate(bot))
      .child(svg(`${ICON}/ds-plus.svg`).size(11).flex_none().text_color(d.fg4))
      .child(div().flex_1().min_w(0).truncate().text_size(12).line_height("16px").text_color(d.fg4).child("New topic")));
    if (!list.length) {
      if (q) box.child(div().h(28).mx(8).px(8).flex().items_center().text_size(12).text_color(d.fg4).child(`No topic matches "${this.chSearch.value().trim()}"`));
      else box.child(newRow(true));
      return v_flex().pt(4).child(head).when(Boolean(chips), (el) => el.child(chips)).child(box);
    }
    const n = list.length, h = n > ROWS ? INNER : PAD + n * ROW;
    const act = list.findIndex((x) => x.active);
    const key = `${space.id}|${list[act]?.id ?? ""}|${q}`;
    // A new pal or search starts at the top; then the shown topic is brought into view.
    const listKey = `${space.id}|${q}|${viewId ?? ""}`;
    if (this.chListKey !== listKey) { this.chListKey = listKey; scrollTo(SID, 0); }
    sc.view = h;
    if (this.chShownKey !== key) { this.chShownKey = key; if (act >= 0) scrollIntoView(SID, act ? PAD + act * ROW : 0, act ? ROW : PAD + ROW); }
    // Past four, the well shows four rows and the top of the fifth, cut at its edge: the cut row says
    // there's more, and the pill thumb shows where you are.
    box.child(scrollArea(d, SID, v_flex().pl(4).pt(PAD).children(list.map(row)), { fade: "well" }).h(h).flex_none().w_full());
    if (n < ROWS && !q) box.child(newRow());
    return v_flex().pt(4).child(head).when(Boolean(chips), (el) => el.child(chips)).child(box);
  }

  // The area chips (T105): ONE 26 px row whatever the pal has (DeNon: "one row of chips"), so the
  // hero is the same height for every pal. More chips than fit scroll sideways with the wheel (or a
  // trackpad's sideways swipe); the chosen chip is brought into view when it changes. A chip: the
  // view's name, how many topics, and a dot while one in it works (blue) or asks you (amber). The
  // chosen one is filled. Widths are estimated (areaChipW) for the scroll's limits only.
  areaChips(space, views, viewId, d) {
    const GAP = AREA_CHIP_GAP, PADX = 8;
    const widths = views.map(areaChipW);
    const total = widths.reduce((a, w) => a + w, 0) + GAP * (views.length - 1);
    const room = Math.max(120, (this.width ?? 304) - 2 * PADX);
    const max = Math.max(0, total + 12 - room);
    const xs = this.areaX ??= {};
    let x = Math.max(0, Math.min(max, xs[space.id] ?? 0));
    // Bring the chosen chip into view when the choice (or the pal) changes.
    const at = views.findIndex((v) => v.id === viewId);
    const key = `${space.id}|${viewId}`;
    if (this.areaShownKey !== key) {
      this.areaShownKey = key;
      const left = widths.slice(0, at).reduce((a, w) => a + w + GAP, 0), right = left + widths[at];
      if (left < x) x = left; else if (right > x + room) x = right - room;
      x = Math.max(0, Math.min(max, x));
    }
    xs[space.id] = x;
    const chip = (v) => {
      const on = v.id === viewId;
      const dot = v.asks ? d.warn : v.working ? d.info : null;
      const what = [`${v.tabs.length} topic${v.tabs.length === 1 ? "" : "s"}`, v.working && `${v.working} working`, v.asks && `${v.asks} need${v.asks === 1 ? "s" : ""} you`].filter(Boolean).join(", ");
      return h_flex().id(`hero-area-${v.id}`).h(22).flex_none().items_center().gap(5).px(8).rounded(11).cursor_pointer()
        .bg(on ? d.me : d.raised).border_1().border_color(on ? d.meEdge + "66" : d.line)
        .when(!on, (el) => el.hover((s) => s.bg(d.hover)))
        .tooltip(`${v.name}: ${what}`)
        .on_click((_e, cx) => { (this.areaView ??= {})[space.id] = v.id; cx.notify(); })
        .child(div().flex_none().text_size(11).line_height("14px").font_weight(500).text_color(on ? d.actFg : d.fg2).child(v.name))
        .child(div().flex_none().text_size(11).line_height("14px").text_color(on ? d.infoText : d.fg4).child(String(v.tabs.length)))
        .when(Boolean(dot), (el) => el.child(div().size(6).flex_none().rounded(3).bg(dot)));
    };
    return div().id("hero-areas").h(26).flex_none().px(PADX).pb(4)
      .child(div().id("hero-areas-track").relative().h(22).overflow_hidden()
        .on_scroll_wheel((e, cx) => {
          const dx = (e.delta?.x || e.delta?.y || 0) / (Number(settings().zoom) || 1);
          const next = Math.max(0, Math.min(max, (xs[space.id] ?? 0) - dx));
          if (next !== xs[space.id]) { xs[space.id] = next; cx.stop_propagation(); cx.notify(); }
        })
        .child(h_flex().absolute().left(-Math.round(x)).top(0).h(22).gap(GAP).children(views.map(chip))));
  }

  // Topics filed under areas are filed by name (crewareas), so a rename has to be followed: the
  // roster remembers each tab's name and, when one changes, says so (only for a topic that is filed).
  followRenames() {
    const names = this.tabNames ??= new Map();
    const live = new Set();
    for (const sp of spaces()) for (const tab of sp.tabs) {
      live.add(tab.id);
      const now = channelName(tab), was = names.get(tab.id);
      if (was !== undefined && was !== now) topicRenamed(sp.name, was, now).catch(() => {});
      names.set(tab.id, now);
    }
    for (const id of [...names.keys()]) if (!live.has(id)) names.delete(id);
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
      const rows = withoutChief().map((sp) => ({ space: sp, bot: botOf(sp) }));
      // The head pal has a section of its own (group undefined) that comes first; skip it, or a drop
      // among ungrouped pals is looked up there, isn't found, and the pal always lands last (T104).
      const sec = palSections(rows).find((x) => x.group !== undefined && (x.group?.id ?? null) === (o.gid ?? null));
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

  // A pal row in the chosen look (crew.js palLookRow; the dialog's preview draws the same). This
  // element carries what the row does: a click opens its lead channel, right-click its menu, and
  // (pals in the groups, not the head pal or hidden ones) a drag: press, move 5 px, and a 2 px line
  // shows where it will land (above or below the row under the pointer); release drops it. The
  // Trees option (any look) adds a working pal's live topics under it, each opening its own topic.
  // "● 5 working" beside "Pals": a blue dot and the count (grey at zero), who in the tooltip.
  workingChip(d) {
    const w = workingEverywhere();
    return h_flex().id("pals-working").flex_1().min_w(0).h(20).items_center().gap(6).pl(10).tooltip(w.tip)
      .child(div().size(6).flex_none().rounded(3).bg(w.count ? d.info : d.lineStrong))
      .child(div().truncate().text_size(11).line_height("14px").text_color(w.count ? d.fg2 : d.fg4).child(`${w.count} working`));
  }
  // The Pals header's fold-all / unfold-all button: unfolded shows the tree, folded a plain list.
  treesToggle(d) {
    const on = palTreesOn();
    return div().id("pals-trees").size(20).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
      .tooltip(on ? "Fold all topics" : "Unfold all topics")
      .hover((s) => s.bg(d.hover))
      .on_click((_e, cx) => { saveUiSettings({ palTrees: !on }); cx.notify(); })
      .child(svg(`${ICON}/${on ? "ds-tree" : "ds-tree-folded"}.svg`).size(13).text_color(d.iconDim));
  }
  palRow({ space, bot }, t, d, gid = undefined) {
    const look = palListStyle();
    const awake = bot.awake || bot.starting;
    const f = palFacts(space, bot, d, this.ops.tasks);
    const draggable = gid !== undefined && !bot.god;
    const dg = this.drag?.active ? this.drag : null;
    const over = dg?.over && dg.over.id === bot.id ? dg.over : null;
    const el = div().id(`bot-${space.id}`)
      .when(Boolean(dg) && dg.id === bot.id, (x) => x.opacity(0.45))
      .when(draggable, (x) => x
        .on_mouse_down("left", (e) => { this.drag = { id: bot.id, gid, y0: e.position.y, active: false, over: null }; })
        .on_mouse_move((e, cx) => this.dragOver(e, cx, { id: bot.id, gid, after: e.local_position.y > e.bounds.height / 2 })))
      .when(!draggable && gid === undefined && bot.god, (x) => x.on_mouse_move((e, cx) => this.dragOver(e, cx, null)))
      .when(Boolean(over), (x) => x.child(div().absolute().left(6).right(6).h(2).rounded(1).bg(d.info).when(over.after, (y) => y.bottom(0)).when(!over.after, (y) => y.top(0))))
      .on_click((_e, cx) => { if (this.drag?.active) return; this.open(space); cx.notify(); })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.menu(space); });
    const row = palLookRow(d, look, f, palPet(bot, mood(palStatus(space), awake), look.pet, t), el);
    // Trees (on unless turned off): its live topics under it; a click opens that topic, right-click its menu.
    const tree = palLookTree(d, look, f, `bot-${space.id}`, (tab, cx) => { this.go(space, tab); cx.notify(); },
      (tab) => openOverlay({ mod: "crew-menu", kind: "popup", width: 236, props: { what: "tab", space: space.id, tab: tab.id } }));
    return tree ? v_flex().flex_none().child(row).child(tree) : row;
  }

  // A pal whose space is closed: the same look, dimmed; a click wakes it.
  sleeperRow(rec, t, d) {
    const look = palListStyle();
    const bot = { ...rec, awake: false };
    const el = div().id(`sleep-${rec.id}`)
      .on_click(() => this.wake(rec))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "crew-menu", kind: "popup", width: 260, props: { what: "sleeper", rec: rec.id } }); });
    return palLookRow(d, look, sleeperFacts(rec, d, this.ops.tasks), palPet(bot, "asleep", look.pet, t), el);
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
        .child(div().relative()
          .child(icon("crew-about", "info", () => openOverlay({ mod: "crew-about", kind: "dialog", width: 480 })))
          .when(Boolean(this.ops.update?.available), (el) => el.child(div().absolute().top(4).right(4).size(7).rounded_full().bg(t.accent))))
        .child(icon("crew-settings", "settings", () => run("app.settings"))));
  }

}
