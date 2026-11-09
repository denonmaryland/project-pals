// Home: the head pal's page (RECIPE "Home"; mock: data/crew-boards/orca-home; DeNon via Orca,
// 2026-11-08). What you come back to after working in parallel, instead of the head pal's terminal
// scroll. The center stack's fourth child (home-view, beside the topic's terminal, rooms and the
// Desk). Clicking the head pal opens it; so do the hero's Home pebble, the command bar and
// Ctrl+Shift+H (crew-roster.home), and again goes back to the topic.
//
// Five boxes, most important first:
// - Needs you: everything waiting on the owner, oldest first, each a 76 px card with its age and
//   one-click actions: approvals (Approve / Decline), the head pal's questions (one button per
//   option: `pal home answer`, which tells the asker as a card from the owner), logins (Copy, Open
//   the topic), topics asking you (Open), Desk cards waiting on you (Done, Open in Desk), proposals
//   (Decline, View) and stuck topics (Open). Up to four show, then "+N more" and it scrolls.
// - Since you last looked (home.json `seen`; Mark all seen): installs with their build hash, tasks
//   done, topics that finished (24 h at most, Orca's call), answers, links (boards, previews),
//   notes, and cards the head pal closed.
// - In progress: every working topic (how long, its terminal title), held and stuck ones, and what's
//   open on the head pal's desk (Home is its Desk: Orca's call, 2026-11-08).
// - Releases & shipping: public (GitHub) vs installed (with the build) vs next, what's queued for it,
//   pending deploys.
// - Parked: things put off; Unpark puts one back, Drop closes it.
//
// Nothing jumps (DeNon's fixed-height rule): every row has a fixed height, counts and ages sit in
// fixed right-aligned slots, text truncates, and each box scrolls on its own (our pill thumb).
// Data is read only while Home shows: every 4 s (files) and 10 s (the desk), and at once when shown.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, spaces, agents, shared, run, notify, exec, appHome, readTextFile, settings } from "herdr";
import {
  ds, tone, scrollArea, scrollState, scrollTo, pebble, channelName, botOf, crew, headName, owner as ownerName, ownerCli, crewCli,
  loadOps, loadDesk, blockedReports, wantsTo, taskTitle, petOf, petReady, petEl, petState, mascotEl, mood, showTabs, showDesk,
  openProposalPanel, workingMark, homeMode, homeData, jsonLines, homeAge, feedSince, findChannel, deskSlug, HOME_FILE, INSTALLS_FILE,
} from "./crew.js";

const ICON = "mods/crew-roster/icons";
const CARD = 76, ROW = 36, PROW = 48, BOXHEAD = 36, NEED_SHOWN = 4, AGE_W = 52, COUNT_W = 28;
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
      try { this.home = homeData(await read(HOME_FILE)); } catch {}
      try { this.installs = jsonLines(await read(INSTALLS_FILE)).reverse(); } catch {}
      try { this.install = JSON.parse((await read("data/crew-install.json")) ?? "{}") ?? {}; } catch { this.install = {}; }
      try { this.update = JSON.parse((await read("data/crew-update.json")) ?? "{}") ?? {}; } catch { this.update = {}; }
      try { this.feed = jsonLines((await exec("tail", ["-n", "800", `${data}/crew-feed.jsonl`], { timeout: 5000 })).stdout); } catch {}
      try { this.ops = await loadOps(); } catch {}
      try { this.reports = await blockedReports(this.reports); } catch {}
      if (desk || Date.now() - this.deskAt > 10000) {
        try { const all = await loadDesk(true); this.cards = all.cards; this.deskAt = Date.now(); } catch {}
      }
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
  headSlug() { return deskSlug(headName()); }

  needs() {
    const out = [];
    const all = spaces();
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
    return out.sort((x, y) => (x.at || 0) - (y.at || 0));
  }

  since() {
    const seen = this.home.seen || 0;
    const now = Date.now();
    const floor = Math.max(seen, now - 7 * 86400000);
    const out = [];
    for (const i of this.installs) if (i.at > floor) out.push({ kind: "install", at: i.at, i });
    for (const x of this.home.items) {
      if ((x.kind === "link" || x.kind === "note") && x.at > floor) out.push({ kind: x.kind, at: x.at, x });
      else if (x.status === "answered" && (x.answered_at ?? 0) > floor) out.push({ kind: "answered", at: x.answered_at, x });
      else if (x.status === "done" && (x.closed_at ?? 0) > floor && x.kind !== "link" && x.kind !== "note") out.push({ kind: "closed", at: x.closed_at, x });
    }
    for (const f of feedSince(this.feed, seen, now)) out.push(f);
    // Cards the head pal closed (Home is its Desk).
    const hs = this.headSlug();
    for (const c of this.cards) {
      const at = Date.parse(c.updated ?? "") || 0;
      if (c.tray === hs && c.status === "done" && at > floor) out.push({ kind: "card", at, c });
    }
    return out.sort((x, y) => y.at - x.at).slice(0, 60);
  }

  progress() {
    const all = spaces();
    const c = crew();
    const rows = [];
    const held = {};
    for (const k of this.cards) if (k.status === "held") (held[(k.to ?? "").toLowerCase()] ??= []).push(k);
    const stalled = Object.values(this.ops.stalled ?? {});
    for (const ag of agents().filter((a) => a.status === "working")) {
      const s = all.find((x) => x.id === ag.space);
      if (!s) continue;
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
      if (!f) continue;
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

  box(d, id, title, count, { right = null, warn = false } = {}) {
    return h_flex().id(`${id}-head`).h(BOXHEAD).flex_none().items_center().gap(8).pl(14).pr(12).border_b_1().border_color(d.line)
      .child(div().flex_none().text_size(12).line_height("16px").font_weight(600).text_color(d.fg1).child(title))
      .child(div().w(COUNT_W).flex_none().text_size(11).line_height("14px").font_weight(500).text_color(warn && count ? d.warnText : d.fg2).child(count == null ? "" : String(count)))
      .child(div().flex_1())
      .when(Boolean(right), (el) => el.child(right));
  }

  frame(d, id) { return v_flex().id(id).min_h(0).overflow_hidden().rounded(8).border_1().border_color(d.line).bg(d.bg1); }

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
    const line = sub == null ? div() : div().min_w(0).truncate().text_size(mono ? 11 : 12).line_height("16px").when(mono, (el) => el.font_family(d.mono)).text_color(mono ? d.fg4 : d.fg2).child(sub);
    return this.cardFrame(d, t, n, first, tag, title, line, acts);
  }

  cardFrame(d, t, n, first, tag, title, line, acts) {
    const status = n.kind === "approval" || n.kind === "question" || n.kind === "stuck" ? "blocked" : "idle";
    return h_flex().id(`need-${n.key}`).h(CARD).flex_none().items_center().gap(12).pl(10).pr(12)
      .when(!first, (el) => el.border_t_1().border_color(d.line))
      .child(this.face(n.pal, status, 44, t))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(8).items_center().min_w(0).child(tag)
          .child(div().min_w(0).truncate().text_size(13).line_height("18px").font_weight(500).text_color(d.fg1).child(title)))
        .child(line))
      .child(h_flex().flex_none().gap(6).items_center().children(acts))
      .child(this.age(d, n.at, Date.now() - (n.at || Date.now()) > 3600000));
  }

  needsBox(d, t, list) {
    if (!list.length) {
      return h_flex().id("needs-clear").h(52).flex_none().items_center().gap(12).px(14).rounded(8).border_1().border_color(d.line).bg(d.bg1)
        .child(this.tag(d, "All clear", d.okHi))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(d.body).child(`Nothing needs you. Approvals, questions and ${headName()}'s decisions land here first.`));
    }
    const SID = "home-needs";
    const shown = Math.min(list.length, NEED_SHOWN);
    const sc = scrollState(SID);
    const below = list.length > NEED_SHOWN ? Math.max(0, list.length - Math.floor((sc.y + shown * CARD + 1) / CARD)) : 0;
    const more = list.length > NEED_SHOWN;
    const kinds = {};
    for (const n of list.slice(NEED_SHOWN)) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
    const body = v_flex().children(list.map((n, i) => this.needCard(d, t, n, i === 0)));
    return this.frame(d, "needs-box").flex_none()
      .child(this.box(d, "needs", "Needs you", list.length, { warn: true, right: div().text_size(11.5).text_color(d.fg2).child("oldest first") }))
      .child(more ? scrollArea(d, SID, body).h(shown * CARD).flex_none() : body)
      .when(more, (el) => el.child(h_flex().id("needs-more").h(30).flex_none().items_center().justify_center().border_t_1().border_color(d.line).cursor_pointer()
        .hover((s) => s.bg(d.hover)).on_click((_e, cx) => { scrollTo(SID, below ? Infinity : 0); cx.notify(); })
        .child(div().text_size(11.5).text_color(d.fg2).child(below ? `+${below} more · ${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ")} · scroll` : "back to the top"))));
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
      icon = svg(`${ICON}/ds-inbox.svg`).size(11).text_color(d.fg2); bold = `${headName()} closed`; rest = `${r.c.title}${r.c.result ? ` · ${r.c.result}` : ""}`; right = r.c.id;
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

  releaseBox(d) {
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
    const checked = this.update.checked ? `checked ${hm(when(this.update.checked))}` : "";
    return this.frame(d, "rel-box").flex_1()
      .child(this.box(d, "rel", "Releases & shipping", null, { right: div().text_size(11.5).text_color(d.fg2).child(checked) }))
      .child(strip)
      .child(rows.length ? scrollArea(d, "home-rel", list).flex_1().min_h(0)
        : div().px(14).py(10).text_size(12).text_color(d.fg4).child(`Nothing queued. ${headName()} adds to it with pal home queue.`));
  }

  parkedBox(d) {
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
    return this.frame(d, "park-box").flex_1()
      .child(this.box(d, "park", "Parked", list.length, { right: div().text_size(11.5).text_color(d.fg2).child("later") }))
      .child(list.length ? scrollArea(d, "home-park", body).flex_1().min_h(0)
        : div().px(14).py(10).text_size(12).text_color(d.fg4).child("Nothing parked. Park a decision to take it off Needs you."));
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    const shown = homeMode();
    if (shown && !this.shown) { this.loading = false; this.reload(cx, true); }
    this.shown = shown;
    const head = headName(), own = ownerName();
    const needs = this.needs(), since = this.since(), prog = this.progress();
    const seen = this.home.seen || 0;
    const nNew = since.filter((r) => r.at > seen).length;
    const tile = (id, value, label, color) => v_flex().id(id).h(44).w(112).flex_none().justify_center().px(10).rounded(6).border_1().border_color(d.line).bg(d.bg1)
      .child(div().text_size(15).line_height("18px").font_weight(600).text_color(color).child(String(value)))
      .child(div().truncate().text_size(11).line_height("14px").text_color(d.fg2).child(label));
    const nextRel = this.home.release.next ?? this.install.version ?? "—";
    const sub = [seen ? `You last looked ${homeAge(seen)} ago` : "First look", this.ops.daemon ? "crewd running" : "crewd isn't running: messages aren't delivered"].join(" · ");
    const page = v_flex().id("home-page").size_full().px(24).pt(8).pb(20).gap(16)
      .child(h_flex().h(48).flex_none().items_end().gap(16)
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().truncate().text_size(18).line_height("24px").font_weight(600).text_color(d.fg1).child(`Welcome back, ${own}`))
          .child(div().truncate().text_size(12).line_height("16px").text_color(this.ops.daemon ? d.fg2 : d.warnText).child(sub)))
        .child(h_flex().flex_none().gap(6)
          .child(tile("t-needs", needs.length, "need you", needs.length ? d.warnText : d.fg2))
          .child(tile("t-since", nNew, "since you looked", nNew ? d.okHi : d.fg2))
          .child(tile("t-prog", prog.rows.length, "in progress", prog.rows.length ? d.infoText : d.fg2))
          .child(tile("t-next", nextRel, this.home.release.next ? "next release" : "installed", d.fg1))))
      .child(this.needsBox(d, t, needs));
    // Since you last looked
    const markAll = div().id("mark-seen").flex_none().h(22).px(6).flex().items_center().rounded(d.r.xs)
      .when(!this.busy.seen, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => this.act("seen", ["home", "seen"], null, cx)))
      .child(div().text_size(11.5).text_color(nNew && !this.busy.seen ? d.body : d.fg4).child("Mark all seen"));
    const sinceBox = this.frame(d, "since-box").flex_1()
      .child(this.box(d, "since", "Since you last looked", nNew, { right: markAll }))
      .child(since.length ? scrollArea(d, "home-since", v_flex().children(since.map((r, i) => this.sinceRow(d, r, i)))).flex_1().min_h(0)
        : div().px(14).py(10).text_size(12).text_color(d.fg4).child("Nothing new since you last looked."));
    // In progress
    const nHeld = prog.rows.filter((r) => r.held).length, nStuck = prog.rows.filter((r) => r.stuck).length;
    const progBody = v_flex().children(prog.rows.map((r, i) => this.progressRow(d, t, r, i)));
    if (prog.desk.length) {
      progBody.child(h_flex().h(28).flex_none().items_center().px(14).border_t_1().border_color(d.line)
        .child(div().text_size(11).font_weight(500).text_color(d.fg3).child(`On ${head}'s desk · ${prog.desk.length}`)));
      progBody.children(prog.desk.map((c, i) => this.deskRow(d, c, i)));
    }
    const progBox = this.frame(d, "prog-box").flex_1()
      .child(this.box(d, "prog", "In progress", prog.rows.length, { right: div().text_size(11.5).text_color(nHeld || nStuck ? d.warnText : d.fg2).child(`${nHeld} held · ${nStuck} stuck`) }))
      .child(prog.rows.length || prog.desk.length ? scrollArea(d, "home-prog", progBody).flex_1().min_h(0)
        : div().px(14).py(10).text_size(12).text_color(d.fg4).child("Nobody's working right now."));
    page.child(h_flex().flex_1().min_h(0).gap(16)
      .child(v_flex().flex_1().min_w(0).h_full().gap(16).child(sinceBox).child(this.releaseBox(d)))
      .child(v_flex().flex_1().min_w(0).h_full().gap(16).child(progBox).child(this.parkedBox(d))));
    if (!this.loaded) page.child(div().absolute().top(12).right(24).text_size(11).text_color(d.fg4).child("reading…"));
    return v_flex().id("crew-home").relative().size_full().bg(d.bg0).text_color(d.fg1).child(page);
  }
}
