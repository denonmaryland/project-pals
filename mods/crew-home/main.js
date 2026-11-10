// Home: the head pal's page (RECIPE "Home"; mocks: data/crew-boards/orca-home, index.html and
// simple.html). What you come back to after working in parallel, instead of the head pal's terminal
// scroll. The center stack's fourth child (home-view, beside the topic's terminal, rooms and the
// Desk). Clicking the head pal opens it; so do its hero's Home pebble, the command bar and
// Ctrl+Shift+H (crew-roster.home), and again goes back to the topic.
//
// "Inbox zero" (DeNon's pick, 2026-11-08, from five simpler directions): the page is one list.
// - "Needs you N", and one status line built from the data: who's working (and on what), what
//   shipped today (a release, else the last install), held or stuck in amber, crewd down in amber.
// - Needs you: everything waiting on the owner, oldest first, each a 76 px card with its age and
//   one-click actions: approvals (Approve / Decline), the head pal's questions (one button per
//   option: `pal home answer`, which tells the asker as a card from the owner), logins (Copy, Open
//   the topic), topics asking you (Open), Desk cards waiting on you (Done, Open in Desk), proposals
//   (Decline, View) and stuck topics (Open). Answering removes a card; the next one takes its slot.
// - The review (DeNon's pick, mock A of review.html): while anything waits, ONE item fills the page:
//   progress dashes and "2 of 5", K Back · J Skip · L Later · Esc List; the asker (pet, Pal #topic,
//   age); the title (24/600, two lines); the context (body, the command and diff for an approval,
//   link chips, image thumbnails); the asker's Recommended banner with its why; the options as large
//   cards (label, what it does, its number; the recommended one lit); "C Chat with <asker>" (the
//   asking topic's live terminal in a window over Home; Muse when that topic is asleep). Keys: 1-9
//   pick, Enter takes the recommended (nothing without one), C, J, K, L, Esc (to the list, which has
//   "Review one at a time"). A decision slides to the next; the last ends on "All caught up".
// - Nothing waiting: a calm "All caught up" with the head pal's pet, and "Message <Head> ›".
// - The head pal's terminal is always one step away (DeNon via Orca, 2026-11-08): "Talk to <Head> T"
//   in the header, "T <Head>'s terminal" in the review's bar, the T key, Ctrl+Shift+H, and its
//   topics in the hero; each leaves Home and puts the keyboard in that terminal (openTerminal).
// - "What happened today ›" opens a 420 px drawer on the right (again, or ×, closes it) with tabs:
//   Today (installs with their build hash, tasks done, topics finished, answers, links, notes, cards
//   the head pal closed; blue while new; Mark all seen), Working (every working topic, held and
//   stuck ones, what's open on the head pal's desk: Home is its Desk), Releases (public / installed
//   + build / next, queued, deploys) and Parked (Unpark, Drop).
//
// - The welcome tour (welcome.js; RECIPE "The welcome tour"): on a first install, and from the gear
//   menu's Welcome tour, seven screens in the head pal's voice take the page until done or skipped.
//
// Nothing jumps (DeNon's fixed-height rule): every row has a fixed height, counts and ages sit in
// fixed right-aligned slots, text truncates, and lists scroll on their own (our pill thumb).
// Data is read only while Home shows: every 4 s (files) and 10 s (the desk), and at once when shown.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, spaces, agents, shared, run, notify, exec, appHome, home as homeDir, readTextFile, settings, openOverlay, closeOverlay, nextCommand } from "herdr";
import {
  ds, tone, scrollArea, pebble, channelName, botOf, crew, headName, owner as ownerName, ownerCli, crewCli,
  loadOps, loadDesk, blockedReports, wantsTo, taskTitle, petOf, petReady, petEl, petState, mascotEl, mood, showTabs, showDesk,
  openProposalPanel, workingMark, openTerminal, homeMode, homeData, jsonLines, homeAge, feedSince, findChannel, deskSlug, HOME_FILE, INSTALLS_FILE,
  severalFactories, currentFactory, inFactory, homeItemShown,
  withoutChief, welcomePending,
} from "./crew.js";
import { welcomeView, welcomeKey } from "./welcome.js";

const ICON = "mods/crew-roster/icons";
const CARD = 76, ROW = 36, PROW = 48, AGE_W = 52, DRAWER_W = 420;
const TABS = [["today", "Today"], ["working", "Working"], ["releases", "Releases"], ["parked", "Parked"]];
const hhmm = (ms) => { const t = new Date(ms); return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };
const midnight = (now = Date.now()) => { const t = new Date(now); t.setHours(0, 0, 0, 0); return t.getTime(); };
const short = (name) => String(name ?? "").split(" - ")[0];
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export default class CrewHome extends View {
  init(_props, cx) {
    this.home = homeData(null);
    this.installs = [];
    this.install = {};
    this.update = {};
    this.feed = [];
    this.ops = { approvals: [], proposals: [], tasks: [], routines: [], stalled: {}, daemon: true };
    this.reports = {};
    this.cards = [];
    this.done = [];
    this.busy = {};
    this.loaded = false;
    this.shown = false;
    this.loading = false;
    this.deskAt = 0;
    this.drawer = null;   // null, or a TABS key
    // The review (DeNon's pick, mock A of crew-boards/orca-home/review.html): one item at a time.
    this.mode = "review";   // "review" or "list" (Esc)
    this.at = 0;            // which item the review shows
    this.atKey = null;      // …by key, so a refresh keeps it
    this.handle = cx.focus_handle();
    // mod.json "focusable": pane.go and a popup closing give Home the keyboard back.
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "focus") this.handle.focus(); cx.notify(); } });
    try { this.lastTab = localStorage.getItem("drawer-tab") || "today"; } catch { this.lastTab = "today"; }
    cx.timer.every(4000, (cx) => { if (homeMode()) this.reload(cx); });
    // Ages ("12m") stay true while it shows.
    cx.timer.every(60000, (cx) => { if (homeMode()) cx.notify(); });
  }

  reload(cx, desk = false) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      const data = `${appHome()}/data`;
      const read = async (f) => { try { return await readTextFile(`${appHome()}/${f}`); } catch { return null; } };
      try { this.all = homeData(await read(HOME_FILE)); this.home = this.floorOf(this.all); } catch {}
      try { this.installs = jsonLines(await read(INSTALLS_FILE)).reverse(); } catch {}
      try { this.install = JSON.parse((await read("data/crew-install.json")) ?? "{}") ?? {}; } catch { this.install = {}; }
      try { this.update = JSON.parse((await read("data/crew-update.json")) ?? "{}") ?? {}; } catch { this.update = {}; }
      try { this.feed = jsonLines((await exec("tail", ["-n", "1600", `${data}/crew-feed.jsonl`], { timeout: 5000 })).stdout); } catch {}
      try { this.ops = await loadOps(); } catch {}
      try { this.reports = await blockedReports(this.reports); } catch {}
      if (desk || Date.now() - this.deskAt > 10000) {
        try { const all = await loadDesk(true); this.cards = all.cards; this.deskAt = Date.now(); } catch {}
      }
      // The first full read (on showing Home) starts the review at the oldest item.
      if (this.fresh) { this.fresh = false; this.at = 0; this.atKey = null; }
      this.loaded = true;
      this.loading = false;
      cx.notify();
    });
  }

  // A click that runs a pal command (ownerCli: as the owner, with a click token; crewCli: plain).
  act(key, args, what, cx, asOwner = true) {
    if (this.busy[key]) return;
    this.busy[key] = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const out = await (asOwner ? ownerCli(args) : crewCli(args));
        if (what) notify({ title: what, body: clip(out.trim().split("\n").slice(-1)[0], 200), level: "success", timeout: 2500 });
      } catch (e) { notify({ title: "That didn't work", body: clip(e.message ?? e, 220), level: "warning", timeout: 6000 }); }
      delete this.busy[key];
      this.loading = false;
      this.reload(cx, true);
    });
  }

  // A pal's topic, from "Pal#topic" (or a pal): its space and tab, when it's open.
  locate(spec) { const f = findChannel(spec ?? ""); return f.error ? null : f; }
  openTopic(spec) {
    const f = this.locate(spec);
    if (!f) return notify({ title: `${short(spec) || "That pal"} isn't open`, body: "Wake it from the sidebar first.", level: "info", timeout: 2500 });
    run("space.select", { id: f.space.id });
    if (f.tab) run("tab.select", { id: f.tab.id });
    showTabs();
  }
  copy(text) {
    exec("wl-copy", [text], { timeout: 3000 })
      .then((r) => notify(r.code === 0 ? { title: "Copied", body: text, level: "success", timeout: 2000 } : { title: "Couldn't copy", body: "wl-copy isn't working here; select the command instead.", level: "warning", timeout: 4000 }))
      .catch(() => notify({ title: "Couldn't copy", body: "wl-copy isn't installed.", level: "warning", timeout: 4000 }));
  }

  // ── what's where ─────────────────────────────────────────────────────────────────────────────
  // With several factories Home is the shown factory's (design: crew-boards/chief, Part 2): its
  // items, its pals' questions and work, its foreman's desk. The release track is the default
  // factory's. With one factory nothing is filtered.
  floorOf(h) {
    if (!severalFactories()) return h;
    const mine = currentFactory().default;
    return { ...h, items: h.items.filter((x) => homeItemShown(x)), release: mine ? h.release : { next: null, note: null, queued: [] } };
  }
  onFloor(pal) { return !severalFactories() || inFactory(String(pal ?? "").split("#")[0]); }

  // Whose desk Home is: the head pal's; with several factories the shown one's foreman (none yet: nobody's).
  foreman() { return severalFactories() ? currentFactory().foreman : headName(); }
  who() { return this.foreman() || "the foreman"; }
  headSlug() { const f = this.foreman(); return f ? deskSlug(f) : "\u0000"; }

  needs() {
    const out = [];
    const all = withoutChief();
    for (const ap of this.ops.approvals ?? []) out.push({ key: `ap-${ap.id}`, kind: "approval", at: ap.at, pal: ap.bot, ap });
    for (const x of this.home.items) if (x.status === "open" && (x.kind === "ask" || x.kind === "login")) out.push({ key: `h-${x.id}`, kind: x.kind, at: x.at, pal: (x.by ?? "").split("#")[0], x });
    // Topics asking you (the roster's crew.needs: a pal asking another pal isn't counted, T19).
    const qs = (shared("crew.needs")?.items ?? []).filter((n) => n.why === "question");
    for (const q of qs) {
      for (const s of all) {
        const tab = s.tabs.find((t) => t.id === q.tab);
        if (!tab) continue;
        const ag = agents().find((a) => a.tab === tab.id && a.status === "blocked");
        out.push({ key: `q-${tab.id}`, kind: "question", at: tab.changed_at, pal: s.name, space: s, tab, msg: ag ? this.reports[ag.address]?.msg ?? "" : "" });
      }
    }
    for (const c of this.cards) {
      if (["done", "cancelled", "expired"].includes(c.status)) continue;
      if (c.status === "needs you" || c.tray === "_owner") out.push({ key: `c-${c.id}`, kind: "desk", at: Date.parse(c.created ?? "") || 0, pal: (c.from ?? "").split("#")[0], c });
    }
    for (const p of this.ops.proposals ?? []) out.push({ key: `p-${p.id}`, kind: "proposal", at: p.at, pal: p.pal ?? p.by, p });
    for (const [term, st] of Object.entries(this.ops.stalled ?? {})) out.push({ key: `s-${term}`, kind: "stuck", at: st.since, pal: st.bot, st });
    // Home items were filtered on load; everything else goes by its pal.
    return out.filter((n) => n.kind === "ask" || n.kind === "login" || this.onFloor(n.pal)).sort((x, y) => (x.at || 0) - (y.at || 0));
  }

  since() {
    // What happened today (since local midnight); what's newer than "Mark all seen" is blue.
    const now = Date.now();
    const floor = midnight(now);
    const out = [];
    // Installs are Project Pals' own: the default factory's news.
    if (!severalFactories() || currentFactory().default) for (const i of this.installs) if (i.at > floor) out.push({ kind: "install", at: i.at, i });
    for (const x of this.home.items) {
      if ((x.kind === "link" || x.kind === "note") && x.at > floor) out.push({ kind: x.kind, at: x.at, x });
      else if (x.status === "answered" && (x.answered_at ?? 0) > floor) out.push({ kind: "answered", at: x.answered_at, x });
      else if (x.status === "done" && (x.closed_at ?? 0) > floor && x.kind !== "link" && x.kind !== "note") out.push({ kind: "closed", at: x.closed_at, x });
    }
    for (const f of feedSince(this.feed, floor, now)) if (this.onFloor(f.bot ?? f.by)) out.push(f);
    // Cards the head pal closed (Home is its Desk).
    const hs = this.headSlug();
    for (const c of this.cards) {
      const at = Date.parse(c.updated ?? "") || 0;
      if (c.tray === hs && c.status === "done" && at > floor) out.push({ kind: "card", at, c });
    }
    return out.sort((x, y) => y.at - x.at).slice(0, 60);
  }

  progress() {
    const all = withoutChief();
    const c = crew();
    const rows = [];
    const held = {};
    for (const k of this.cards) if (k.status === "held") (held[(k.to ?? "").toLowerCase()] ??= []).push(k);
    const stalled = Object.values(this.ops.stalled ?? {});
    for (const ag of agents().filter((a) => a.status === "working")) {
      const s = all.find((x) => x.id === ag.space);
      if (!s || !this.onFloor(s.name)) continue;
      const tab = s.tabs.find((t) => t.id === ag.tab);
      const ch = tab ? channelName(tab) : channelName({ name: ag.tab_name ?? "" });
      const bot = botOf(s, c);
      const h = held[`${s.name}#${ch}`.toLowerCase()] ?? [];
      const stuck = stalled.some((x) => x.bot === s.name && x.channel === ch);
      rows.push({ key: `w-${ag.address}`, s, bot, ch, tab, since: tab?.changed_at, line: taskTitle(ag.title, bot.name, s.name, ch) ?? ag.title ?? "", held: h.length ? h[0].held ?? "held" : null, nHeld: h.length, stuck });
      delete held[`${s.name}#${ch}`.toLowerCase()];
    }
    // Held topics that aren't working (a draft in the box, a prompt, asleep): they show here too.
    for (const [to, list] of Object.entries(held)) {
      const f = this.locate(list[0].to);
      if (!f || !this.onFloor(f.space.name)) continue;
      rows.push({ key: `h-${to}`, s: f.space, bot: botOf(f.space, c), ch: f.tab ? channelName(f.tab) : "", tab: f.tab, since: Date.parse(list[0].held_since ?? "") || 0,
        line: `${list.length} card${list.length === 1 ? "" : "s"} wait: ${list[0].held ?? "held"}`, held: list[0].held ?? "held", nHeld: list.length, stuck: false, idle: true });
    }
    // What's open on the head pal's desk (not waiting on you: those are in Needs you).
    const hs = this.headSlug();
    const desk = this.cards.filter((k) => k.tray === hs && ["queued", "seen", "working", "blocked", "later"].includes(k.status))
      .sort((x, y) => (Date.parse(x.created ?? "") || 0) - (Date.parse(y.created ?? "") || 0));
    return { rows: rows.sort((x, y) => (x.since || 0) - (y.since || 0)), desk };
  }

  // ── pieces ───────────────────────────────────────────────────────────────────────────────────
  face(name, status, w, t) {
    const f = this.locate(name);
    const bot = f ? botOf(f.space) : { name: name ?? "?", harness: null, awake: true };
    const h = Math.round(w * 108 / 138);
    const p = petOf(bot);
    const m = mood(status, true);
    return div().relative().w(w).h(h).flex_none()
      .child(div().absolute().left(-8).top(-6).w(w + 16).h(h + 12).child(image(`${ICON}/pet-aura-row.svg`).w(w + 16).h(h + 12)))
      .child(div().absolute().left(0).top(0).child(p && petReady(p) ? petEl(p, petState(bot, m), w, h, { open: true })
        : div().w(w).h(h).flex().items_center().justify_center().child(mascotEl(bot, m, Math.min(h, 32), t))));
  }

  tag(d, word, color) {
    return div().flex_none().h(16).px(5).flex().items_center().rounded(3).border_1().border_color(color + "66")
      .text_size(9.5).line_height("14px").font_weight(600).text_color(color).child(word.toUpperCase());
  }

  age(d, at, old = false) {
    return div().w(AGE_W).flex_none().text_right().text_size(11.5).line_height("16px").font_weight(500).text_color(old ? d.warnText : d.fg2).child(homeAge(at));
  }

  // One Needs-you card: 76 px, four columns (pet · text · actions · age).
  needCard(d, t, n, first) {
    const B = (id, label, onClick, more = {}) => pebble(d, { id: `${n.key}-${id}`, label, onClick, disabled: Boolean(this.busy[n.key]), ...more });
    let tag, title, sub, mono = true, acts = [];
    const own = ownerName();
    if (n.kind === "approval") {
      const ap = n.ap;
      tag = this.tag(d, "Approval", d.err);
      title = `${short(ap.bot)} wants to ${wantsTo(ap.why || ap.rule)}`;
      sub = `${clip(ap.command, 140)} · #${ap.channel ?? "?"} · ${ap.id}`;
      // Decline and Approve apart, Approve last (as in the Inbox), so one isn't hit for the other.
      acts = [B("no", "Decline", (cx) => this.act(n.key, ["deny", ap.id, "--inbox"], `Declined for ${short(ap.bot)}`, cx)), div().w(10).flex_none(),
        B("ok", "Approve", (cx) => this.act(n.key, ["approve", ap.id, "--inbox"], `Approved for ${short(ap.bot)}`, cx), { primary: true })];
    } else if (n.kind === "ask") {
      const x = n.x;
      tag = this.tag(d, "Decision", d.warnText);
      title = x.title;
      sub = x.body ? x.body.split("\n")[0] : `${x.id} · from ${x.by ?? "?"}`;
      mono = !x.body;
      const opts = x.options ?? [];
      acts = opts.map((o, i) => B(`o${i}`, clip(o, 22), (cx) => this.act(n.key, ["home", "answer", x.id, o], `You picked: ${o}`, cx), { primary: i === 0 }));
      if (!opts.length && x.by) acts.push(B("go", `Answer in #${clip((x.by.split("#")[1] ?? "topic"), 16)}`, () => this.openTopic(x.by), { primary: true }));
      acts.push(B("park", "Park", (cx) => this.act(n.key, ["home", "park", x.id], null, cx)));
    } else if (n.kind === "login") {
      const x = n.x;
      tag = this.tag(d, "Login", d.infoText);
      title = x.title;
      sub = null;
      const topic = (x.topic ?? "").split("#")[1];
      acts = [B("copy", "Copy", () => this.copy(x.command)),
        B("go", topic ? `Open #${clip(topic, 18)}` : "Open", () => this.openTopic(x.topic ?? x.by), { primary: true })];
      return this.cardFrame(d, t, n, first, tag, title,
        h_flex().gap(8).items_center().min_w(0)
          .child(div().flex_none().h(20).px(7).flex().items_center().rounded(4).bg(d.inset).border_1().border_color(d.lineMid)
            .text_size(11.5).font_family(d.mono).text_color(d.fg1).child(clip(x.command, 60)))
          .child(div().min_w(0).truncate().text_size(11).font_family(d.mono).text_color(d.fg4).child(topic ? `in #${topic} · type it in that topic's box` : "")),
        acts);
    } else if (n.kind === "question") {
      tag = this.tag(d, "Question", d.warnText);
      title = `${short(n.space.name)} asks you in #${channelName(n.tab)}`;
      sub = n.msg ? `“${clip(n.msg.replace(/\s+/g, " "), 160)}”` : "a prompt is waiting in its terminal";
      acts = [B("go", `Open #${clip(channelName(n.tab), 18)}`, () => this.openTopic(`${n.space.name}#${channelName(n.tab)}`), { primary: true })];
    } else if (n.kind === "desk") {
      const c = n.c;
      tag = this.tag(d, "Desk", d.warnText);
      title = c.title || "(no title)";
      sub = `${c.id} · ${c.kind ?? "card"} · from ${c.from_kind === "owner" ? own : c.from ?? "?"}${c.result ? ` · ${clip(c.result, 80)}` : ""}`;
      acts = [B("desk", "Open in Desk", () => showDesk("needs")),
        B("done", "Done", (cx) => this.act(n.key, ["desk", "done", c.id, "closed on Home"], "Closed", cx), { primary: true })];
    } else if (n.kind === "proposal") {
      const p = n.p;
      tag = this.tag(d, "Proposal", "#B79CF7");
      title = `${short(p.by)} proposes a change to ${p.kind === "mission" ? "its mission" : p.file ?? "a file"}`;
      sub = `${p.id}${p.note ? ` · ${clip(p.note, 120)}` : ""}`;
      acts = [B("no", "Decline", (cx) => this.act(n.key, ["proposal", "decline", p.id], "Declined", cx)), div().w(10).flex_none(),
        B("view", "View", () => { const f = this.locate(p.pal); if (f) { run("space.select", { id: f.space.id }); showTabs(); } openProposalPanel(p); }, { primary: true })];
    } else {
      const st = n.st;
      tag = this.tag(d, "Stuck", d.warnText);
      title = `${short(st.bot)} looks stuck in #${st.channel}`;
      sub = `working, its screen unchanged since ${homeAge(st.since)} ago`;
      acts = [B("go", `Open #${clip(st.channel, 18)}`, () => this.openTopic(`${st.bot}#${st.channel}`), { primary: true })];
    }
    const line = sub == null ? div() : div().min_w(0).when(mono, (el) => el.truncate()).text_size(mono ? 11 : 12).line_height("16px").when(mono, (el) => el.font_family(d.mono)).text_color(mono ? d.fg4 : d.fg2).child(sub);
    return this.cardFrame(d, t, n, first, tag, title, line, acts);
  }

  cardFrame(d, t, n, first, tag, title, line, acts) {
    const status = n.kind === "approval" || n.kind === "question" || n.kind === "stuck" ? "blocked" : "idle";
    return h_flex().id(`need-${n.key}`).min_h(CARD).py(8).flex_none().items_center().gap(12).pl(10).pr(12)
      .when(!first, (el) => el.border_t_1().border_color(d.line))
      .child(this.face(n.pal, status, 44, t))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(8).items_center().min_w(0).child(tag)
          .child(div().min_w(0).truncate().text_size(13).line_height("18px").font_weight(500).text_color(d.fg1).child(title)))
        .child(line))
      .child(h_flex().flex_none().gap(6).items_center().children(acts))
      .child(this.age(d, n.at, Date.now() - (n.at || Date.now()) > 3600000));
  }

  // The page's list: every card, in a box that takes the rest of the page and scrolls.
  needsList(d, t, list) {
    const body = v_flex().children(list.map((n, i) => this.needCard(d, t, n, i === 0)));
    return v_flex().id("needs-box").flex_1().min_h(0).overflow_hidden().rounded(8).border_1().border_color(d.line).bg(d.bg1)
      .child(scrollArea(d, "home-needs", body).flex_1().min_h(0));
  }

  // Nothing waiting: the head pal's pet, "All caught up", one quiet line.
  caughtUp(d, t) {
    const answered = this.home.items.filter((x) => x.status === "answered" && (x.answered_at ?? 0) >= midnight()).length;
    const head = this.who();
    return v_flex().id("caught-up").flex_1().min_h(0).items_center().justify_center().gap(10)
      .child(this.face(head, "idle", 120, t))
      .child(div().pt(6).text_size(18).line_height("24px").font_weight(600).text_color(d.fg1).child("All caught up"))
      .child(div().text_size(12.5).line_height("18px").text_color(d.fg2)
        .child(answered ? `${answered} decision${answered === 1 ? "" : "s"} answered today. ${head} puts new ones here first.` : `Nothing needs you. ${head} puts new decisions here first.`))
      // A quiet way to say something: the head pal's terminal with the keyboard in it.
      .child(div().id("message-head").mt(4).h(24).px(8).flex().items_center().rounded(d.r.xs).cursor_pointer()
        .hover((s) => s.bg(d.hover)).on_click((_e, cx) => { openTerminal(); cx.notify(); })
        .child(div().text_size(12.5).text_color(d.infoText).child(`Message ${head} ›`)));
  }

  // The one status line, from the data: who's working (and on what), what shipped today, held or
  // stuck, crewd down. Fixed 20 px; it truncates.
  statusLine(d, prog) {
    const now = Date.now(), today = midnight(now);
    const parts = [];
    const working = prog.rows.filter((r) => !r.idle);
    const dot = (c) => div().size(6).flex_none().rounded(3).bg(c);
    const sep = () => div().flex_none().text_color(d.fg4).child("·");
    const line = h_flex().id("status-line").h(20).flex_none().items_center().gap(8).min_w(0).overflow_hidden().text_size(12).line_height("16px").text_color(d.fg2);
    if (working.length) {
      const byPal = new Map();
      for (const r of working) (byPal.get(short(r.s.name)) ?? byPal.set(short(r.s.name), []).get(short(r.s.name))).push(`#${r.ch}`);
      const who = [...byPal.entries()].map(([p, chs]) => `${p} on ${chs.length > 2 ? `${chs.length} topics` : chs.join(" and ")}`).join(", ");
      parts.push(h_flex().flex_none().gap(6).items_center().child(div().flex_none().child(workingMark(d)))
        .child(div().flex_none().font_weight(500).text_color(d.body).child(`${working.length} working`)));
      parts.push(div().min_w(0).truncate().child(who));
    } else parts.push(div().flex_none().child("Nobody's working"));
    const pub = this.update.published ? Date.parse(this.update.published) : 0;
    const inst = this.installs.find((i) => i.at >= today && i.build);
    if (pub >= today && this.update.latest) parts.push(h_flex().flex_none().gap(6).items_center().child(dot(d.ok))
      .child(div().font_weight(500).text_color(d.body).child(`${this.update.latest} shipped`)).child(div().child(hhmm(pub))));
    else if (inst) parts.push(h_flex().flex_none().gap(6).items_center().child(dot("#8A5CF0"))
      .child(div().font_weight(500).text_color(d.body).child(`Installed ${inst.build.hash}`)).child(div().child(hhmm(inst.at))));
    const held = prog.rows.filter((r) => r.held).length, stuck = prog.rows.filter((r) => r.stuck).length;
    if (held || stuck) parts.push(div().flex_none().text_color(d.warnText).child([held ? `${held} held` : null, stuck ? `${stuck} stuck` : null].filter(Boolean).join(" · ")));
    if (!this.ops.daemon) parts.push(div().flex_none().text_color(d.warnText).child("crewd isn't running: messages wait"));
    parts.forEach((p, i) => { if (i > 1 || (i === 1 && !working.length)) line.child(sep()); line.child(p); });
    return line;
  }

  // The drawer: what happened today and the rest, 420 px on the right, over the page.
  drawerEl(d, t, since, prog) {
    const tab = this.drawer;
    const seen = this.home.seen || 0;
    const nNew = since.filter((r) => r.at > seen).length;
    const nPark = this.home.items.filter((x) => x.status === "parked").length;
    const count = { today: nNew || null, working: prog.rows.length || null, releases: null, parked: nPark || null };
    const tabs = h_flex().h(40).flex_none().items_end().gap(2).px(10).border_b_1().border_color(d.line)
      .children(TABS.map(([k, label]) => {
        const on = tab === k;
        return h_flex().id(`drawer-tab-${k}`).h(32).flex_none().items_center().gap(6).px(10).cursor_pointer()
          .border_b_2().border_color(on ? d.fg1 : "#00000000")
          .on_click((_e, cx) => { this.openDrawer(k); cx.notify(); })
          .child(div().text_size(12.5).font_weight(on ? 600 : 500).text_color(on ? d.fg1 : d.fg2).child(label))
          .child(div().w(18).flex_none().text_size(11).text_color(k === "today" && nNew ? d.infoText : d.fg3).child(count[k] ? String(count[k]) : ""));
      }))
      .child(div().flex_1())
      .child(div().id("drawer-x").size(26).mb(7).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
        .tooltip("Close").hover((s) => s.bg(d.hover)).on_click((_e, cx) => { this.drawer = null; cx.notify(); })
        .child(svg(`${ICON}/x.svg`).size(11).text_color(d.fg3)));
    let body;
    if (tab === "today") {
      const markAll = h_flex().id("mark-seen").h(22).px(6).flex_none().items_center().rounded(d.r.xs)
        .when(!this.busy.seen && nNew > 0, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => this.act("seen", ["home", "seen"], null, cx)))
        .child(div().text_size(11.5).text_color(nNew && !this.busy.seen ? d.body : d.fg4).child("Mark all seen"));
      body = v_flex().flex_1().min_h(0)
        .child(h_flex().h(32).flex_none().items_center().pl(14).pr(8).border_b_1().border_color(d.lineSoft)
          .child(div().flex_1().text_size(11.5).text_color(d.fg2).child(nNew ? `${nNew} new since you last looked` : "Nothing new since you last looked"))
          .child(markAll))
        .child(since.length ? scrollArea(d, "home-since", v_flex().children(since.map((r, i) => this.sinceRow(d, r, i)))).flex_1().min_h(0)
          : div().px(14).py(10).text_size(12).text_color(d.fg4).child("Nothing happened yet today."));
    } else if (tab === "working") {
      const pb = v_flex().children(prog.rows.map((r, i) => this.progressRow(d, t, r, i)));
      if (prog.desk.length) {
        pb.child(h_flex().h(28).flex_none().items_center().px(14).border_t_1().border_color(d.line)
          .child(div().text_size(11).font_weight(500).text_color(d.fg3).child(`On ${this.who()}'s desk · ${prog.desk.length}`)));
        pb.children(prog.desk.map((c, i) => this.deskRow(d, c, i)));
      }
      body = prog.rows.length || prog.desk.length ? scrollArea(d, "home-prog", pb).flex_1().min_h(0)
        : div().px(14).py(10).text_size(12).text_color(d.fg4).child("Nobody's working right now.");
    } else if (tab === "releases") body = this.releaseBody(d);
    else body = this.parkedBody(d);
    return v_flex().id("home-drawer").absolute().top(0).right(0).bottom(0).w(DRAWER_W).bg(d.bg1).border_l_1().border_color(d.lineStrong).shadow_lg()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(tabs).child(body);
  }

  openDrawer(k) {
    this.drawer = k;
    this.lastTab = k;
    try { localStorage.setItem("drawer-tab", k); } catch {}
  }

  sinceRow(d, r, i) {
    const dot = (c) => div().size(6).rounded(3).bg(c);
    let icon, bold, rest, right, onClick = null, link = false;
    if (r.kind === "install") {
      const b = r.i.build;
      icon = dot("#8A5CF0"); bold = "Installed";
      rest = b ? `${b.hash}${b.dirty ? "+" : ""}  ${b.subject ?? ""}` : `${r.i.version ?? ""} (${r.i.source ?? "?"})`;
      right = b?.branch ?? r.i.source ?? "";
    } else if (r.kind === "task") {
      icon = svg(`${ICON}/ds-check-thin.svg`).size(11).text_color(d.ok); bold = r.id ?? "Task"; rest = r.title; right = short(r.by);
    } else if (r.kind === "finished") {
      icon = svg(`${ICON}/ds-check-thin.svg`).size(11).text_color(d.ok); bold = `#${r.channel}`; rest = `finished${r.turns > 1 ? ` · ${r.turns} turns` : ""}`; right = short(r.bot);
      onClick = () => this.openTopic(`${r.bot}#${r.channel}`);
    } else if (r.kind === "link") {
      icon = dot(d.info); bold = "Link"; rest = r.x.title === r.x.url ? r.x.url : `${r.x.title} · ${r.x.url}`; right = r.x.topic ? `#${r.x.topic.split("#")[1] ?? ""}` : short(r.x.by);
      link = true;
      onClick = () => { const u = r.x.url.startsWith("~/") ? `${(appHome() ?? "").replace(/\/\.config\/herdr-app$/, "")}/${r.x.url.slice(2)}` : r.x.url; exec("xdg-open", [u]).catch(() => {}); };
    } else if (r.kind === "note") {
      icon = svg(`${ICON}/ds-notebook.svg`).size(11).text_color(d.fg2); bold = short(r.x.by); rest = r.x.title; right = "note";
    } else if (r.kind === "answered") {
      icon = svg(`${ICON}/ds-check-thin.svg`).size(11).text_color(d.ok); bold = "You answered"; rest = `${r.x.title} → ${r.x.answer}`; right = short(r.x.by);
    } else if (r.kind === "closed") {
      icon = svg(`${ICON}/ds-check-thin.svg`).size(11).text_color(d.ok); bold = "Done"; rest = `${r.x.title}${r.x.result ? ` · ${r.x.result}` : ""}`; right = short(r.x.closed_by ?? r.x.by);
    } else {
      icon = svg(`${ICON}/ds-inbox.svg`).size(11).text_color(d.fg2); bold = `${this.who()} closed`; rest = `${r.c.title}${r.c.result ? ` · ${r.c.result}` : ""}`; right = r.c.id;
    }
    const isNew = r.at > (this.home.seen || 0);
    return h_flex().id(`since-${i}`).h(ROW).flex_none().items_center().gap(10).pl(14).pr(12)
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .when(Boolean(onClick), (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click(() => onClick()))
      .child(div().w(14).flex_none().flex().items_center().justify_center().child(icon))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().flex_none().text_size(12.5).font_weight(500).text_color(d.fg1).child(clip(bold, 28)))
        .child(div().min_w(0).truncate().text_size(12.5).text_color(link ? d.infoText : d.body).child(rest)))
      .child(div().flex_none().max_w(140).truncate().text_size(11).text_color(d.fg2).child(right))
      .child(div().w(40).flex_none().text_right().text_size(11).text_color(isNew ? d.infoText : d.fg4).child(homeAge(r.at)));
  }

  progressRow(d, t, r, i) {
    const amber = r.held || r.stuck;
    return h_flex().id(`prog-${r.key}`).h(PROW).flex_none().items_center().gap(10).pl(10).pr(12).cursor_pointer()
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .hover((s) => s.bg(d.hover))
      .on_click(() => this.openTopic(`${r.s.name}#${r.ch}`))
      .child(this.face(r.s.name, r.idle ? "idle" : "working", 36, t))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(7).items_center().min_w(0)
          .child(r.idle ? div().size(6).flex_none().rounded(3).bg(d.warn) : div().flex_none().child(workingMark(d)))
          .child(div().flex_none().max_w(180).truncate().text_size(12.5).font_weight(500).text_color(d.fg1).child(short(r.s.name)))
          .child(div().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(d.fg2).child(`#${r.ch}`))
          .when(Boolean(r.held), (el) => el.child(this.tag(d, `held · ${r.held}`, d.warnText)))
          .when(r.stuck, (el) => el.child(this.tag(d, "stuck", d.warnText))))
        .child(div().min_w(0).truncate().text_size(11).line_height("14px").font_family(d.mono).text_color(d.fg2).child(r.line || " ")))
      .child(div().w(AGE_W).flex_none().text_right().text_size(11.5).font_weight(500).text_color(amber ? d.warnText : d.infoText).child(homeAge(r.since)));
  }

  deskRow(d, c, i) {
    return h_flex().id(`hdesk-${c.id}`).h(ROW).flex_none().items_center().gap(10).pl(14).pr(12)
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(div().w(14).flex_none().flex().items_center().justify_center().child(svg(`${ICON}/ds-inbox.svg`).size(11).text_color(c.status === "working" ? d.info : d.fg3)))
      .child(div().min_w(0).flex_1().truncate().text_size(12.5).text_color(d.body).child(c.title || "(no title)"))
      .child(div().flex_none().max_w(160).truncate().text_size(11).text_color(d.fg2).child(`${c.status} · from ${short(c.from_kind === "owner" ? ownerName() : c.from)}`))
      .child(div().w(40).flex_none().text_right().text_size(11).text_color(d.fg4).child(homeAge(Date.parse(c.created ?? "") || 0)));
  }

  releaseBody(d) {
    const ins = this.install ?? {};
    const b = ins.build ?? null;
    const rel = this.home.release;
    const pub = this.update.latest ?? null;
    const next = rel.next ?? null;
    const ahead = b?.ahead;
    const cell = (id, label, value, mono, sub, first) => v_flex().id(id).flex_1().min_w(0).h(64).px(14).py(10).gap(2)
      .when(!first, (el) => el.border_l_1().border_color(d.line))
      .child(div().text_size(11).text_color(d.fg2).child(label))
      .child(h_flex().gap(8).items_baseline().min_w(0)
        .child(div().flex_none().text_size(15).line_height("20px").font_weight(600).text_color(d.fg1).child(value ?? "—"))
        .when(Boolean(mono), (el) => el.child(div().min_w(0).truncate().text_size(11.5).font_family(d.mono).text_color(d.fg2).child(mono))))
      .child(div().min_w(0).truncate().text_size(11).text_color(d.fg4).child(sub ?? ""));
    const when = (s) => (s ? new Date(s * 1000) : null);
    const hm = (dt) => (dt ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : "");
    const strip = h_flex().flex_none().border_b_1().border_color(d.line)
      .child(cell("rel-pub", "Public · GitHub", pub, null, this.update.published ? `${String(this.update.published).slice(0, 10)} · ${this.update.repo ?? ""}` : "not checked yet", true))
      .child(cell("rel-ins", "Installed here", ins.version ?? null, b ? `${b.hash}${b.dirty ? "+" : ""}` : null,
        [b?.branch ?? ins.source, ins.installed ? hm(when(ins.installed)) : null].filter(Boolean).join(" · ")))
      .child(cell("rel-next", "Next", next ?? (ahead ? "unreleased" : null), ahead ? `+${ahead}` : null,
        rel.note ?? (ahead ? `${ahead} commit${ahead === 1 ? "" : "s"} past ${b.tag}` : rel.queued.length ? `${rel.queued.length} queued` : "nothing queued")));
    const rows = [];
    for (const q of rel.queued) rows.push({ id: q.id, icon: "›", bold: "Queued", text: q.text, right: next ?? "", at: q.at });
    for (const x of this.home.items) if (x.kind === "deploy" && x.status === "open") rows.push({ id: x.id, dot: d.warn, bold: "Deploy", text: x.title, right: short(x.by), at: x.at, topic: x.topic ?? x.by });
    const list = v_flex().children(rows.map((r, i) => h_flex().id(`rel-${r.id}`).h(ROW).flex_none().items_center().gap(10).pl(14).pr(12)
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .when(Boolean(r.topic), (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click(() => this.openTopic(r.topic)))
      .child(div().w(14).flex_none().flex().items_center().justify_center()
        .child(r.dot ? div().size(6).rounded(3).bg(r.dot) : div().text_size(12).text_color(d.fg2).child(r.icon)))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().flex_none().text_size(12.5).font_weight(500).text_color(d.fg1).child(r.bold))
        .child(div().min_w(0).truncate().text_size(12.5).text_color(d.body).child(r.text)))
      .child(div().flex_none().max_w(120).truncate().text_size(11).text_color(d.fg2).child(r.right))
      .child(div().w(40).flex_none().text_right().text_size(11).text_color(d.fg4).child(r.dot ? homeAge(r.at) : ""))));
    const checked = this.update.checked ? `GitHub checked ${hm(when(this.update.checked))}` : "";
    return v_flex().flex_1().min_h(0)
      .child(strip)
      .child(rows.length ? scrollArea(d, "home-rel", list).flex_1().min_h(0)
        : div().px(14).py(10).text_size(12).text_color(d.fg4).child(`Nothing queued. ${this.who()} adds to it with pal home queue.`))
      .child(div().h(28).flex_none().px(14).flex().items_center().border_t_1().border_color(d.line).text_size(11).text_color(d.fg4).child(checked));
  }

  parkedBody(d) {
    const list = this.home.items.filter((x) => x.status === "parked").sort((x, y) => (y.parked_at ?? y.at) - (x.parked_at ?? x.at));
    const link = (id, label, onClick, disabled) => div().id(id).flex_none().text_size(11.5).text_color(disabled ? d.fg4 : d.fg2)
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => onClick(cx))).child(label);
    const body = v_flex().children(list.map((x, i) => h_flex().id(`park-${x.id}`).h(ROW).flex_none().items_center().gap(10).pl(14).pr(12)
      .when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(div().w(14).flex_none().text_size(11).text_color(d.fg3).child("‖"))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(d.body).child(x.title))
      .child(link(`park-up-${x.id}`, "Unpark", (cx) => this.act(`park-${x.id}`, ["home", "unpark", x.id], null, cx), this.busy[`park-${x.id}`]))
      .child(div().text_size(11.5).text_color(d.fg4).child("·"))
      .child(link(`park-drop-${x.id}`, "Drop", (cx) => this.act(`park-${x.id}`, ["home", "drop", x.id], null, cx), this.busy[`park-${x.id}`]))
      .child(div().w(40).flex_none().text_right().text_size(11).text_color(d.fg4).child(homeAge(x.parked_at ?? x.at)))));
    return v_flex().flex_1().min_h(0)
      .child(list.length ? scrollArea(d, "home-park", body).flex_1().min_h(0)
        : div().px(14).py(10).text_size(12).text_color(d.fg4).child("Nothing parked. Park a decision to take it off Needs you."));
  }

  // ── The review: one item at a time ─────────────────────────────────────────────────────────

  // What one item shows and does: who asks, the words, the options (each { label, does, run, rec }).
  spec(n) {
    const recs = this.home.recs ?? {};
    const topicOf = (spec) => (spec && spec.includes("#") ? spec : null);
    const o = (label, does, run, extra = {}) => ({ label, does, run, ...extra });
    const owner = (args, what) => (cx) => this.act(n.key, args, what, cx);
    if (n.kind === "approval") {
      const ap = n.ap, r = recs[ap.id];
      return { tag: ["Approval", this.d.err], who: ap.bot, topic: `${ap.bot}#${ap.channel ?? ""}`, sub: `held ${homeAge(n.at)} ago · rule ${ap.rule ?? "?"} · ${ap.id}`,
        title: `${short(ap.bot)} wants to ${wantsTo(ap.why || ap.rule)}`, mono: ap.command, diff: ap.diff ?? null,
        rec: r ? { option: r.option === "approve" ? "Approve" : "Decline", why: r.why, by: r.by } : null,
        options: [o("Decline", "The command is refused; the pal is told", owner(["deny", ap.id, "--inbox"], `Declined for ${short(ap.bot)}`)),
          o("Approve", ap.diff ? "Lets exactly this edit through, once" : "Lets exactly this command run, once", owner(["approve", ap.id, "--inbox"], `Approved for ${short(ap.bot)}`), { gapBefore: true })] };
    }
    if (n.kind === "ask") {
      const x = n.x;
      const opts = (x.options ?? []).map((label, i) => o(label, x.does?.[i] || "", owner(["home", "answer", x.id, label], `You picked: ${label}`)));
      if (!opts.length && x.by) opts.push(o(`Answer in #${(x.by.split("#")[1] ?? "topic")}`, "Shows the topic so you can reply there", () => this.openTopic(x.by)));
      const later = (cx) => this.act(n.key, ["home", "park", x.id], null, cx);
      opts.push(o("Park", "Decide later; it waits in Parked", later, { cap: "L" }));
      return { tag: ["Decision", this.d.warnText], who: x.by, topic: topicOf(x.by) ?? x.topic, sub: `asked ${homeAge(n.at)} ago`, title: x.title, body: x.body,
        links: x.links, images: x.images, rec: x.recommend ? { option: x.recommend, why: x.why, by: x.by } : null, options: opts, later };
    }
    if (n.kind === "login") {
      const x = n.x, topic = x.topic ?? x.by, ch = (topic ?? "").split("#")[1];
      return { tag: ["Login", this.d.infoText], who: x.by, topic, sub: `asked ${homeAge(n.at)} ago`, title: x.title, mono: x.command,
        body: ch ? `Type it in #${ch}'s box: the ! runs it in that topic's terminal.` : null,
        options: [o("Copy", "Copies the command", () => this.copy(x.command)), o(ch ? `Open #${ch}` : "Open the topic", "Shows the topic to type it", () => this.openTopic(topic))],
        later: (cx) => this.act(n.key, ["home", "park", x.id], null, cx) };
    }
    if (n.kind === "question") {
      const spec = `${n.space.name}#${channelName(n.tab)}`;
      return { tag: ["Question", this.d.warnText], who: n.space.name, topic: spec, sub: `waiting ${homeAge(n.at)}`, title: `${short(n.space.name)} asks you in #${channelName(n.tab)}`,
        body: n.msg ? n.msg : "A prompt is waiting in its terminal.", options: [o(`Open #${channelName(n.tab)}`, "Answer it in its terminal", () => this.openTopic(spec))] };
    }
    if (n.kind === "desk") {
      const c = n.c, r = recs[c.id];
      return { tag: ["Desk", this.d.warnText], who: c.from_kind === "owner" ? null : c.from, topic: topicOf(c.from), sub: `${c.id} · ${c.kind ?? "card"} · ${homeAge(n.at)} ago`,
        title: c.title || "(no title)", body: [c.body, c.result ? `Result: ${c.result}` : null].filter(Boolean).join("\n\n"), images: c.attachments,
        rec: r ? { option: r.option === "done" ? "Done" : "Open in Desk", why: r.why, by: r.by } : null,
        options: [o("Done", "Closes the card; the sender sees it", owner(["desk", "done", c.id, "closed on Home"], "Closed")), o("Open in Desk", "Shows it with its receipts", () => showDesk("needs"))] };
    }
    if (n.kind === "proposal") {
      const p = n.p;
      return { tag: ["Proposal", "#B79CF7"], who: p.by, topic: topicOf(p.by), sub: `${p.id} · ${homeAge(n.at)} ago`,
        title: `${short(p.by)} proposes a change to ${p.kind === "mission" ? "its mission" : p.file ?? "a file"}`, body: p.note,
        options: [o("Decline", "The pal is told", owner(["proposal", "decline", p.id], "Declined")),
          o("View", "Opens the change in the profile panel", () => { const f = this.locate(p.pal); if (f) { run("space.select", { id: f.space.id }); showTabs(); } openProposalPanel(p); }, { gapBefore: true })] };
    }
    const st = n.st;
    return { tag: ["Stuck", this.d.warnText], who: st.bot, topic: `${st.bot}#${st.channel}`, sub: `no progress for ${homeAge(st.since)}`,
      title: `${short(st.bot)} looks stuck in #${st.channel}`, body: "It's working, but its screen hasn't changed.",
      options: [o(`Open #${st.channel}`, "Look at its terminal", () => this.openTopic(`${st.bot}#${st.channel}`))] };
  }

  // Which item shows: the one we were on, by key; else the same position (the next one slid in).
  current(list) {
    if (!list.length) return null;
    let i = this.atKey ? list.findIndex((n) => n.key === this.atKey) : -1;
    if (i < 0) i = Math.min(this.at, list.length - 1);
    this.at = i; this.atKey = list[i].key;
    return list[i];
  }
  move(list, by) {
    if (!list.length) return;
    this.at = (this.at + by + list.length) % list.length;
    this.atKey = list[this.at].key;
  }

  // Chat about it: the asking topic's live terminal in a window over Home (a bar to drag it by, Open
  // topic, ×); Muse, the idea partner, when that topic has no live agent.
  chat(sp) {
    const live = (spec) => {
      const f = spec ? this.locate(spec) : null;
      if (!f?.tab) return null;
      const ag = agents().find((a) => a.tab === f.tab.id) ?? null;
      return ag ? { f, address: ag.address } : null;
    };
    let target = live(sp.topic) ?? live(sp.who);
    let muse = false;
    if (!target) {
      const rec = crew().bots.find((b) => b.partner || String(b.role ?? "").trim().toLowerCase() === "idea partner");
      const s = rec ? spaces().find((x) => x.id === rec.space) : null;
      const tab = s?.tabs.find((t) => agents().some((a) => a.tab === t.id));
      if (tab) { target = live(`${s.name}#${channelName(tab)}`); muse = true; }
    }
    if (!target) return notify({ title: "Nobody to chat with", body: "That topic is asleep and there's no idea partner awake. Open the topic to wake it.", level: "info", timeout: 4000 });
    const { f, address } = target;
    this.chatId = openOverlay({ kind: "window", key: "home-chat", width: 560, height: 520,
      layout: { type: "column", children: [
        { type: "block", size: { px: 34 }, content: { mod: "crew-home-chat", props: { space: f.space.id, tab: f.tab.id, muse, about: sp.title } } },
        { type: "block", content: { terminal: address } }] } });
    if (muse) notify({ title: `Chatting with ${short(f.space.name)}`, body: `${short(sp.who ?? "The asker")} is asleep, so this is the idea partner. Paste the question in to talk it through.`, level: "info", timeout: 5000 });
  }

  key(e, list, cx) {
    // The welcome tour has the page, and its own keys.
    if (welcomePending()) { if (welcomeKey(this, e, cx)) { cx.stop_propagation(); cx.notify(); } return; }
    const k = e.keystroke;
    const n = this.mode === "review" ? this.current(list) : null;
    // Esc: the chat window first (Home keeps its id), then the drawer, then review ↔ list.
    if (k === "escape") {
      if (this.chatId) { try { closeOverlay(this.chatId); } catch {} this.chatId = null; }
      else if (this.drawer) this.drawer = null;
      else this.mode = this.mode === "review" ? "list" : "review";
    }
    else if (k === "t") openTerminal();
    else if (!n) return;
    else if (k === "j") this.move(list, 1);
    else if (k === "k") this.move(list, -1);
    else {
      const sp = this.spec(n);
      if (/^[1-9]$/.test(k)) { const o = sp.options.filter((x) => !x.cap)[Number(k) - 1]; if (o && !this.busy[n.key]) o.run(cx); }
      else if (k === "enter") { const o = sp.rec && sp.options.find((x) => x.label.toLowerCase() === sp.rec.option.toLowerCase()); if (o && !this.busy[n.key]) o.run(cx); }
      else if (k === "c") this.chat(sp);
      else if (k === "l") { if (sp.later) sp.later(cx); else this.move(list, 1); }
      else return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  review(d, t, list) {
    const n = this.current(list);
    const sp = this.spec(n);
    const i = this.at, total = list.length;
    const keyCap = (k) => div().flex_none().h(16).px(4).flex().items_center().rounded(3).border_1().border_color(d.lineStrong)
      .text_size(10.5).font_family(d.mono).text_color(d.fg2).child(k);
    // Narrow (under 900 px, e.g. a half-width window): key caps only, the words in tooltips.
    const compact = (this.w ?? 1200) < 900;
    const navBtn = (id, k, label, onClick, disabled = false) => h_flex().id(id).h(26).px(compact ? 5 : 8).flex_none().items_center().gap(6).rounded(d.r.sm)
      .tooltip(`${label} (${k})`)
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => { onClick(cx); cx.notify(); }))
      .child(keyCap(k)).when(!compact, (el) => el.child(div().text_size(12).text_color(disabled ? d.fg4 : d.fg2).child(label)));
    const PIPS = Math.min(total, 12);
    const pips = h_flex().flex_none().gap(4).children(Array.from({ length: PIPS }, (_, j) => {
      const at = total > 12 ? Math.round(i * (PIPS - 1) / (total - 1)) : i;
      return div().w(22).h(3).rounded(2).bg(j === at ? d.warnText : j < at ? d.fg3 : d.lineMid);
    }));
    const top = h_flex().h(32).flex_none().items_center().gap(12)
      .when(!compact, (el) => el.child(div().flex_none().text_size(13).font_weight(600).text_color(d.fg2).child("Needs you")))
      .child(pips)
      .child(div().w(64).flex_none().text_size(12).font_weight(500).text_color(d.body).child(`${i + 1} of ${total}`))
      .child(div().flex_1())
      .child(navBtn("rv-back", "K", "Back", () => this.move(list, -1), total < 2))
      .child(navBtn("rv-skip", "J", "Skip", () => this.move(list, 1), total < 2))
      .child(navBtn("rv-later", "L", "Later", (cx) => { if (sp.later) sp.later(cx); else this.move(list, 1); }, !sp.later && total < 2))
      .child(navBtn("rv-list", "Esc", "List", () => { this.mode = "list"; }))
      .child(div().w(1).h(16).mx(4).flex_none().bg(d.lineMid))
      .child(navBtn("rv-term", "T", "Terminal", () => openTerminal()));
    const whoName = sp.who ? short(sp.who.split("#")[0]) : ownerName();
    const whoTopic = sp.topic && sp.topic.includes("#") ? `#${sp.topic.split("#")[1]}` : "";
    const who = h_flex().min_h(56).mt(18).flex_none().items_center().gap(12)
      .child(this.face(sp.who ? sp.who.split("#")[0] : this.who(), n.kind === "approval" || n.kind === "question" || n.kind === "stuck" ? "blocked" : "idle", 56, t))
      .child(v_flex().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().text_size(13).font_weight(600).text_color(d.fg1).child(whoName))
          .child(div().min_w(0).truncate().text_size(13).text_color(d.fg2).child(whoTopic))
          .child(div().w(4).flex_none())
          .child(this.tag(d, sp.tag[0], sp.tag[1])))
        .child(div().text_size(12).text_color(d.fg2).child(sp.sub ?? "")));
    const title = div().id("rv-title").h(64).mt(10).flex_none().max_w(880).overflow_hidden()
      .text_size(24).line_height("32px").font_weight(600).text_color(d.fg1).child(sp.title ?? "");
    // The context: the body, the command and its diff, links, images. It scrolls inside its space.
    const ctx = v_flex().gap(12).pr(12).max_w(900);
    if (sp.body) ctx.child(v_flex().gap(6).children(String(sp.body).split("\n").map((l, j) => div().id(`rv-b-${j}`).text_size(14).line_height("22px").text_color(d.body).child(l || " "))));
    if (sp.mono) ctx.child(div().px(12).py(9).rounded(6).bg(d.inset).border_1().border_color(d.lineMid).text_size(12).line_height("19px").font_family(d.mono).text_color(d.fg1).child(sp.mono));
    if (sp.diff) ctx.child(v_flex().px(12).py(8).rounded(6).bg(d.inset).border_1().border_color(d.lineMid)
      .children(String(sp.diff).split("\n").map((l, j) => div().id(`rv-d-${j}`).text_size(12).line_height("19px").font_family(d.mono)
        .text_color(l.startsWith("+") && !l.startsWith("+++") ? d.ok : l.startsWith("-") && !l.startsWith("---") ? d.err : d.fg2).child(l || " "))));
    if (sp.links?.length) ctx.child(h_flex().flex_wrap().gap(8).children(sp.links.map((u, j) => h_flex().id(`rv-l-${j}`).h(26).px(9).flex_none().items_center().gap(6).rounded(5)
      .bg(d.raised).border_1().border_color(d.line).cursor_pointer().hover((s) => s.border_color(d.lineMid))
      .on_click(() => exec("xdg-open", [u.startsWith("~/") ? `${homeDir()}/${u.slice(2)}` : u]).catch(() => {}))
      .child(div().text_size(12).text_color(d.infoText).child(clip(u.replace(/^https?:\/\//, "").replace(homeDir(), "~"), 60))))));
    if (sp.images?.length) ctx.child(h_flex().gap(8).children(sp.images.slice(0, 4).map((a, j) => div().id(`rv-i-${j}`).w(150).h(94).flex_none().rounded(5).overflow_hidden()
      .border_1().border_color(d.line).cursor_pointer().tooltip(a)
      .on_click(() => exec("xdg-open", [`${appHome()}/data/${a.replace(/^data\//, "")}`]).catch(() => {}))
      .child(image(`data/${a.replace(/^data\//, "")}`).w(150).h(94)))));
    const rec = sp.rec;
    const recBar = h_flex().id("rv-rec").min_h(52).py(8).mt(14).flex_none().max_w(900).items_center().gap(10).px(14).rounded(6).border_1()
      .border_color(rec ? "#4CA1F255" : d.line).bg(rec ? "#4CA1F20D" : "#00000000")
      .child(div().flex_none().text_size(11.5).font_weight(600).text_color(rec ? d.infoText : d.fg4).child(rec ? "RECOMMENDED" : "NO RECOMMENDATION"))
      .child(rec ? h_flex().flex_1().min_w(0).gap(6).items_center()
          .child(div().flex_none().text_size(13).font_weight(600).text_color(d.fg1).child(rec.option))
          .when(Boolean(rec.why), (el) => el.child(div().flex_1().min_w(0).text_size(13).text_color(d.body).child(`· ${short((rec.by ?? "").split("#")[0]) || "The asker"}: ${rec.why}`)))
        : div().flex_1().min_w(0).text_size(12.5).text_color(d.fg4).child("The asker didn't pick one. Chat about it if you're unsure."));
    // The options: large cards, numbered; the recommended one lit. Approve sits apart from Decline.
    const busy = Boolean(this.busy[n.key]);
    // Narrow with more than three options: full-width 40 px rows instead of cards side by side, so
    // no label is cut to "I…" (live test, a 400 px review area with five options).
    const asRows = compact && sp.options.length > 3;
    const optRow = asRows ? v_flex().id("rv-opts").mt(14).flex_none().max_w(900).gap(4)
      : h_flex().id("rv-opts").min_h(72).mt(14).flex_none().max_w(900).gap(10).items_stretch();
    let num = 0;
    sp.options.forEach((op, j) => {
      const on = rec && op.label.toLowerCase() === rec.option.toLowerCase();
      const cap = op.cap ?? (++num <= 9 ? String(num) : null);
      if (asRows) {
        optRow.child(h_flex().id(`rv-o-${j}`).min_h(40).py(6).flex_none().px(10).gap(8).items_center().rounded(6)
          .bg(on ? "#26364A" : "#1C1C1E").border_1().border_color(on ? "#4CA1F288" : "#00000080")
          .when(!busy, (el) => el.cursor_pointer().hover((s) => s.border_color(on ? "#4CA1F2" : d.lineStrong)).on_click((_e, cx) => { op.run(cx); cx.notify(); }))
          .when(busy, (el) => el.opacity(0.5))
          .child(cap ? keyCap(cap) : div().w(16))
          .child(div().flex_none().max_w(160).truncate().text_size(13.5).font_weight(600).text_color(d.fg1).child(op.label))
          .when(Boolean(on), (el) => el.child(this.tag(d, "Recommended", d.infoText)))
          .child(div().flex_1().min_w(0).text_size(12).text_color(on ? "#C9DCEF" : d.fg2).child(op.does || "")));
        return;
      }
      // Narrow: the key goes before the label ("1 Ink") instead of a cap at the right, so short
      // labels aren't cut to "I…" when four cards share a half-width window (live test).
      if (op.gapBefore) optRow.child(div().w(30).flex_none());
      optRow.child(v_flex().id(`rv-o-${j}`).flex_1().min_w(0).min_h(72).px(compact ? 10 : 14).py(10).gap(3).rounded(7)
        .bg(on ? "#26364A" : "#1C1C1E").border_1().border_color(on ? "#4CA1F288" : "#00000080").shadow_xs()
        .when(!busy, (el) => el.cursor_pointer().hover((s) => s.border_color(on ? "#4CA1F2" : d.lineStrong)).on_click((_e, cx) => { op.run(cx); cx.notify(); }))
        .when(busy, (el) => el.opacity(0.5))
        // The label keeps the first line (with its key cap); the Recommended tag leads the second, so a
        // narrow card never squeezes the label to "Blur…" (live test, 2026-11-08).
        .child(h_flex().gap(8).items_center().min_w(0)
          .when(compact && Boolean(cap), (el) => el.child(div().flex_none().text_size(12).font_family(d.mono).text_color(d.fg3).child(cap)))
          .child(div().flex_1().min_w(0).truncate().text_size(14).line_height("20px").font_weight(600).text_color(d.fg1).child(op.label))
          .when(!compact && Boolean(cap), (el) => el.child(keyCap(cap))))
        .child(h_flex().gap(6).items_center().min_w(0)
          .when(Boolean(on), (el) => el.child(this.tag(d, "Recommended", d.infoText)))
          .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(on ? "#C9DCEF" : d.fg2).child(op.does || " "))));
    });
    const chatWho = sp.topic ? `${short(sp.topic.split("#")[0])}${sp.topic.includes("#") ? ` #${sp.topic.split("#")[1]}` : ""}` : "the idea partner";
    const foot = h_flex().h(52).mt(10).flex_none().items_center().gap(8).border_t_1().border_color(d.lineSoft)
      .child(h_flex().id("rv-chat").h(30).px(11).flex_none().items_center().gap(7).rounded(5).bg("#1C1C1E").border_1().border_color("#00000080")
        .cursor_pointer().hover((s) => s.border_color(d.lineStrong)).on_click((_e, cx) => { this.chat(sp); cx.notify(); })
        .child(keyCap("C")).child(div().text_size(12).font_weight(500).text_color(d.body).child(`Chat with ${chatWho}`)))
      .child(div().flex_1())
      .when(!compact, (el) => el.child(h_flex().flex_none().gap(12).items_center().text_size(11.5).text_color(d.fg3)
        .child(h_flex().gap(4).items_center().child(keyCap("1")).child(div().child("–")).child(keyCap(String(Math.min(9, Math.max(1, sp.options.filter((x) => !x.cap).length))))).child(div().child("pick")))
        .child(h_flex().gap(4).items_center().child(keyCap("Enter")).child(div().child(rec ? "recommended" : "—")))
        .child(h_flex().gap(4).items_center().child(keyCap("J")).child(div().child("/")).child(keyCap("K")).child(div().child("next / back")))));
    return v_flex().id(`review-${n.key}`).size_full().px(40).pt(16)
      .child(top).child(who).child(title)
      .child(scrollArea(d, `rv-ctx-${n.key}`, ctx).flex_1().min_h(0).mt(12))
      .child(recBar).child(optRow).child(foot);
  }

  // Give Home the keyboard after this render, never during one: Herdr refuses focus() in render or
  // layout (DeNon's first live test fell back to the old view). cx.spawn runs its body at once (up to
  // its first await), so a one-shot timer on the foreground executor does it after the frame.
  focusSoon(cx) { cx.timer.after(0, () => { try { this.handle.focus(); } catch {} }); }

  render(cx) {
    // The shown factory can change between reads (the switcher): Home follows at once.
    if (this.all) this.home = this.floorOf(this.all);
    const t = tone(theme());
    const d = ds(t);
    this.d = d;
    const shown = homeMode();
    // Shown: read everything, start the review at the oldest, and take the keyboard. Herdr refuses
    // focus() during render (the view falls back to its last good version), so it's done in a task.
    // A new showing: the first render while shown, or showHome's stamp changed (a hidden view doesn't
    // render, so after a trip to the terminal Home can't tell it was hidden; the stamp tells it).
    const stamp = shared("crew.home.shown") ?? 0;
    if (shown && (!this.shown || stamp !== this.shownAt)) {
      this.shownAt = stamp;
      this.loading = false; this.fresh = true; this.reload(cx, true); this.mode = "review"; this.at = 0; this.atKey = null; this.drawer = null; this.focusSoon(cx);
    }
    if (!shown && this.shown) this.drawer = null;   // left Home: the drawer is closed next time
    this.shown = shown;
    const needs = this.needs(), prog = this.progress();
    const since = this.drawer === "today" ? this.since() : [];
    const open = Boolean(this.drawer);
    const root = v_flex().id("crew-home").relative().size_full().bg(d.bg0).text_color(d.fg1)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, needs, cx))
      // Its width, in design pixels: narrow, the review's top bar shows only the key caps.
      .on_size_change((size, cx) => { const w = size.width / (Number(settings().zoom) || 1); if (Math.abs((this.w ?? 0) - w) > 1) { this.w = w; cx.notify(); } })
      .on_mouse_down("left", () => this.handle.focus());
    // The welcome tour (a first install, or replayed from the gear menu) has the whole page.
    if (welcomePending()) return root.child(welcomeView(this, d, t, cx));
    if (needs.length && this.mode === "review") {
      return root.child(this.review(d, t, needs)).when(open, (el) => el.child(this.drawerEl(d, t, since, prog)));
    }
    const narrow = (this.w ?? 1200) < 900;   // half a screen: shorter words, the Talk pebble's icon only
    const link = h_flex().id("what-happened").h(22).px(6).mb(2).flex_none().items_center().gap(4).rounded(d.r.xs).cursor_pointer()
      .when(open, (el) => el.bg(d.sel)).hover((s) => s.bg(d.hover))
      .on_click((_e, cx) => { if (open) this.drawer = null; else this.openDrawer(this.lastTab || "today"); cx.notify(); })
      .child(div().text_size(12).text_color(d.infoText).child(open ? "Close ×" : narrow ? "Today ›" : "What happened today ›"));
    const reviewBtn = needs.length ? h_flex().id("review-all").h(22).px(6).mb(2).flex_none().items_center().rounded(d.r.xs).cursor_pointer()
      .hover((s) => s.bg(d.hover)).on_click((_e, cx) => { this.mode = "review"; this.handle.focus(); cx.notify(); })
      .child(div().text_size(12).text_color(d.infoText).child(narrow ? "Review ›" : "Review one at a time ›")) : null;
    // Orca's terminal, one click (or T) away, next to What happened today.
    const termBtn = h_flex().id("open-terminal").h(26).px(9).mb(0).flex_none().items_center().gap(7).rounded(5).cursor_pointer()
      .bg("#1C1C1E").border_1().border_color("#00000080").hover((s) => s.border_color(d.lineStrong))
      .tooltip(`${this.who()}'s terminal (T, or Ctrl+Shift+H)`)
      .on_click((_e, cx) => { openTerminal(); cx.notify(); })
      .child(svg(`${ICON}/ds-terminal.svg`).size(12).flex_none().text_color(d.iconOn))
      .when(!narrow, (el) => el.child(div().text_size(12).font_weight(500).text_color(d.body).child(`Talk to ${this.who()}`)))
      .child(div().flex_none().h(16).px(4).flex().items_center().rounded(3).border_1().border_color(d.lineStrong)
        .text_size(10.5).font_family(d.mono).text_color(d.fg2).child("T"));
    const page = v_flex().id("home-page").size_full().px(28).pt(20).pb(24).gap(12)
      .child(h_flex().h(28).flex_none().items_end().gap(12)
        .child(div().flex_none().text_size(20).line_height("26px").font_weight(600).text_color(d.fg1).child("Needs you"))
        .child(div().w(40).flex_none().text_size(20).line_height("26px").font_weight(600).text_color(needs.length ? d.warnText : d.fg3).child(String(needs.length)))
        // Whose Home this is, once there are several factories.
        .when(severalFactories(), (el) => el.child(h_flex().id("home-factory").h(22).mb(2).px(7).flex_none().items_center().gap(6).rounded(d.r.xs).border_1().border_color(d.lineMid)
          .child(div().size(8).flex_none().rounded(2).bg(currentFactory().color))
          .child(div().text_size(12).font_weight(500).text_color(d.body).child(currentFactory().name))))
        .child(div().flex_1())
        .when(Boolean(reviewBtn), (el) => el.child(reviewBtn))
        .child(link)
        .child(termBtn))
      .child(this.statusLine(d, prog))
      .child(needs.length ? this.needsList(d, t, needs) : this.caughtUp(d, t));
    if (!this.loaded) page.child(div().absolute().top(12).right(28).text_size(11).text_color(d.fg4).child("reading…"));
    return root.child(page).when(open, (el) => el.child(this.drawerEl(d, t, since, prog)));
  }
}
