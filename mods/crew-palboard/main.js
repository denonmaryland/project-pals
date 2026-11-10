// A pal's board (crew-boards/pal-page/design.md, DeNon's pick G · Board; T108). The center stack's
// pal-view, shown when you click a pal (showBoard; Settings → palClick brings the terminal back),
// from the pal menu, the command bar and Ctrl+Shift+U. Before any terminal you see the pal's topics
// as cards in four columns, by what each one waits for:
//   Needs you   one card per thing it needs from you (a held approval, a Home ask, a needs-you
//               card, a prompt in its terminal), with the buttons to answer it; the longest wait first
//   Working     topics with a turn running, in the pal's own words
//   Resting     finished and idle topics (the newest finish first, "new" until you've seen it),
//               then the asleep ones
//   Up next     its open tasks no topic has claimed
// An empty Needs you or Up next folds to a thin rail. Under the columns, the message box: it says
// who it talks to, and sends to the topic you clicked (a Desk card from you, handed over between
// two of its steps; Interrupt sends it now), or adds a task that lands in Up next.
// Keys (while you aren't typing): Esc the aimed topic's terminal, R review what needs you one at a
// time (1–4 pick a button, → skip, Esc stop), / the message box.
// Data: `pal computer <pal> board --json` (bin/crewboard.py), read only while shown, every 5 s.
// Herdr's elements are single-use: every card is built whole before it goes into its column.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { theme, spaces, shared, nextCommand, notify, openOverlay, settings } from "herdr";
import {
  ds, botOf, crewCli, ownerCli, openTerminal, boardMode, boardPal, boardColumns, waited, pebble, keyCap, scrollArea,
  showComputer, hasComputer, showDesk, showTabs, popOut, owner, harnessName, shortTime, shortDate, wantsTo,
} from "./crew.js";

const ICON = "mods/crew-roster/icons";
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const tabOf = (space, topic) => space?.tabs.find((x) => x.name.replace(/^#/, "") === topic) ?? null;
const RAIL = 34, GAP = 10, PAD = 28;
const HEAD_H = 100, BOX_H = 76;   // the header's height, and the box's without its text rows
const WEIGHT = { you: 1.24, working: 1.24, resting: 0.8, next: 0.8 };
const KIND = { approval: "Approval", ask: "Ask", prompt: "Prompt", card: "Card" };
const STATE_WORD = { working: "working", blocked: "asks you", done: "finished", idle: "resting", asleep: "asleep", shell: "no pal running" };
// A time as the board shows it: today "14:02", older "Nov 6".
const when = (ms, now = Date.now()) => (!ms ? "" : now - ms < 20 * 3600000 ? shortTime(ms) : shortDate(ms));
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, String(v)); } catch { /* no storage */ } return null; };

export default class CrewPalBoard extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.data = null;
    this.err = null;
    this.loading = false;
    this.shownAt = null;
    this.size = { width: 1100, height: 760 };
    this.aim = null;         // the topic the box points at
    this.target = "topic";   // "topic", or "task": the message becomes a task in Up next
    this.picking = false;    // the "To" list is open
    this.typing = false;
    this.busy = {};
    this.sent = {};          // topic → { text, at, what }: your last message from here, shown on its card
    this.review = null;      // which need the review is on (null: not reviewing)
    this.seen = 0;           // when you last had this pal's board up (before this showing)
    this.urgent = false;
    this.input = TextareaState.new({ placeholder: "Tell it something…", rows: 2 });
    this.input.set_auto_grow?.(2, 8);
    this.input.on("change", (_e, cx) => cx.notify());
    // After this tick, so a Ctrl+Enter seen by the box's key handler can mark it urgent first.
    this.input.on("submit", (e, cx) => { if (!e?.shift) cx.timer.after(0, (cx) => this.send(cx)); });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    cx.timer.every(5000, (cx) => { if (boardMode()) this.reload(cx); });
    cx.timer.every(30000, (cx) => { if (boardMode()) cx.notify(); });   // the ages
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "focus") this.handle.focus(); cx.notify(); } });
  }

  pal() { return boardPal(); }
  space() { const p = this.pal(); return spaces().find((s) => s.name === p) ?? null; }

  reload(cx) {
    const pal = this.pal();
    if (!pal || this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const x = JSON.parse(await crewCli(["computer", pal, "board", "--json"]));
        if (x.pal === this.pal()) { this.data = x; this.err = null; }
      } catch (e) { this.err = String(e?.message ?? e); }
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
      } catch (e) { notify({ title: "That didn't work", body: clip(e?.message ?? e, 220), level: "warning", timeout: 6000 }); }
      delete this.busy[key];
      this.loading = false;
      this.reload(cx);
    });
  }

  columns() {
    return boardColumns(this.data, { seen: this.seen, who: owner(), pals: spaces().map((s) => s.name) });
  }

  // The topic the box points at: the one you clicked, else the one you last aimed at here, else
  // the pal's shown topic, else its first.
  aimed(space) {
    const names = (this.data?.topics ?? []).map((t) => t.topic);
    const has = (n) => Boolean(n) && names.includes(n);
    if (has(this.aim)) return this.aim;
    const last = store(`board-aim-${space.name}`);
    if (has(last)) return last;
    const shown = space.tabs.find((x) => x.active)?.name.replace(/^#/, "");
    return has(shown) ? shown : names[0] ?? null;
  }
  setAim(space, topic, cx) {
    this.aim = topic; this.target = "topic"; this.picking = false;
    store(`board-aim-${space.name}`, topic);
    cx?.notify();
  }

  // Send what's in the box: to the aimed topic (a Desk card from you; `urgent`: now, not between
  // steps), or as a task for the pal. The text comes back if it didn't go.
  send(cx, urgent = false) {
    const space = this.space();
    const text = this.input.value().replace(/\n+$/, "").trim();
    urgent = urgent || this.urgent;
    this.urgent = false;
    if (!space || !text || this.busy.send) return;
    const topic = this.aimed(space);
    const task = this.target === "task";
    if (!task && !topic) return;
    const [first, ...more] = text.split("\n");
    const args = task ? ["task", "add", first, "--for", space.name, ...(more.join("\n").trim() ? ["--body", more.join("\n").trim()] : [])]
      : ["desk", "send", `${space.name}#${topic}`, text, "--urgency", urgent ? "now" : "normal", "--json"];
    this.input.set_value("");
    this.busy.send = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const out = await ownerCli(args);
        if (task) notify({ title: `Added for ${space.name}`, body: clip(first, 160), level: "success", timeout: 2500 });
        else {
          let res = {};
          try { res = JSON.parse(out); } catch { try { res = JSON.parse(out.trim().split("\n").pop()); } catch { /* plain text */ } }
          const what = String(res.what ?? "queued");
          this.sent[topic] = { text, at: Date.now(), what: what.startsWith("held") ? "held" : urgent ? "sent now" : what.split(/[:(]/)[0].trim() || "queued", id: res.card?.id ?? "" };
          if (what.startsWith("held")) notify({ title: `Held · ${res.card?.id ?? ""}`, body: what.replace(/^held:\s*/, ""), level: "warning", timeout: 5000 });
        }
      } catch (e) {
        notify({ title: task ? "Couldn't add the task" : "Couldn't send it", body: clip(e?.message ?? e, 220), level: "warning", timeout: 6000 });
        if (!this.input.value()) this.input.set_value(text);
      }
      delete this.busy.send;
      this.loading = false;
      this.reload(cx);
    });
  }

  // The buttons of one need, in key order (the review's 1–4 press them).
  needActs(space, n) {
    const key = `need-${n.id}`;
    const tab = tabOf(space, n.topic);
    const term = { label: "Terminal", go: () => openTerminal(space, tab) };
    if (n.kind === "approval") return [
      { label: "Approve", primary: true, go: (cx) => this.act(key, ["approve", n.id, "--inbox"], `Approved for ${space.name}`, cx) },
      { label: "Decline", go: (cx) => this.act(key, ["deny", n.id, "--inbox"], `Declined for ${space.name}`, cx) }, term];
    if (n.kind === "ask") {
      const opts = (n.options ?? []).slice(0, 4);
      const rec = opts.includes(n.recommend) ? n.recommend : opts[0];
      const acts = opts.map((o) => ({ label: clip(o, 26), full: o, primary: o === rec, go: (cx) => this.act(key, ["home", "answer", n.id, o], `You picked: ${o}`, cx) }));
      return opts.length ? acts : [{ ...term, label: "Answer in the terminal", primary: true }];
    }
    if (n.kind === "card") return [
      { label: "Done", primary: true, go: (cx) => this.act(key, ["desk", "done", n.id, "closed on the board"], "Closed", cx) },
      { label: "Open in Desk", go: () => showDesk("needs") }];
    return [{ ...term, label: "Answer in the terminal", primary: true }];   // a prompt: the board never presses Yes for you
  }

  key(e, cx) {
    const k = e.keystroke ?? e.key;
    const space = this.space();
    if (!space) { if (k === "escape") openTerminal(); return; }
    if (this.typing) {
      if (k === "escape") { this.picking = false; try { this.handle.focus(); } catch { /* not ready */ } this.typing = false; cx.notify(); }
      return;
    }
    const needs = this.columns().you;
    if (this.review != null) {
      const c = needs[Math.min(this.review, needs.length - 1)];
      if (k === "escape" || !c) { this.review = null; cx.notify(); return; }
      if (k === "right" || k === "down" || k === "j" || k === "tab") { this.review = this.review + 1 >= needs.length ? null : this.review + 1; cx.notify(); return; }
      if (k === "left" || k === "up" || k === "k") { this.review = Math.max(0, this.review - 1); cx.notify(); return; }
      if (/^[1-4]$/.test(k)) { const a = this.needActs(space, c.need)[Number(k) - 1]; if (a && !this.busy[`need-${c.need.id}`]) a.go(cx); cx.notify(); }
      return;
    }
    if (k === "escape") { openTerminal(space, tabOf(space, this.aimed(space))); return; }
    if (k === "r" && needs.length) { this.review = 0; cx.notify(); return; }
    if (k === "/" || k === "enter") { this.input.focus(); cx.notify(); }
  }

  render(cx) {
    const t = theme(), d = ds(t);
    const shown = boardMode();
    const stamp = shared("crew.board")?.shown ?? 0;
    const pal = this.pal();
    // A new showing: read now, remember when you last looked, take the keyboard (in a task: Herdr
    // refuses focus() during render).
    if (shown && stamp !== this.shownAt) {
      this.shownAt = stamp;
      this.shownTime = Date.now();
      if (this.data?.pal !== pal) { this.data = null; this.aim = null; this.sent = {}; }
      this.review = null; this.picking = false; this.target = "topic";
      this.seen = Number(store(`board-seen-${pal}`)) || 0;
      store(`board-seen-${pal}`, Date.now());
      this.reload(cx);
      cx.timer.after(0, () => { try { this.handle.focus(); } catch { /* not ready */ } });
    }
    const space = this.space();
    // Keys never land on a board: when another pal is shown by a key or the picker while this one's
    // board is up, the center goes back to the terminal. (Not in the first half second of a showing:
    // showBoard selects the pal and this view in one go, and spaces() may still say the old pal.)
    if (shown && space && !space.active && Date.now() - (this.shownTime ?? 0) > 500 && !this.leaving) {
      this.leaving = true;
      cx.timer.after(0, (cx) => { this.leaving = false; if (boardMode() && !this.space()?.active) showTabs(); cx.notify(); });
    }
    const k = Number(settings()?.zoom) || 1;
    const root = v_flex().id("crew-palboard").size_full().overflow_hidden().bg(d.bg0).text_color(d.fg1)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      // A click outside the box takes the keyboard back from it (the box stops its own clicks).
      .on_mouse_down("left", (_e, cx) => { this.picking = false; try { this.handle.focus(); } catch { /* not ready */ } cx.notify(); })
      .on_size_change((size, cx) => { const w = size.width / k, h = size.height / k; if (Math.abs(w - this.size.width) > 1 || Math.abs(h - this.size.height) > 1) { this.size = { width: w, height: h }; cx.notify(); } });
    if (!space) {
      return root.child(v_flex().size_full().items_center().justify_center().gap(8).text_color(d.fg2).text_size(13)
        .child(div().child(pal ? `${pal} isn't here any more.` : "No pal chosen."))
        .child(div().id("pb-back").cursor_pointer().text_color(d.info).child("Back to the topic").on_click(() => openTerminal())));
    }
    const bot = botOf(space);
    const x = this.data;
    const cols = this.columns();
    const aim = this.aimed(space);
    return root
      .child(this.head(d, space, bot, x, cols))
      .child(x ? this.board(d, space, cols, aim) : this.waiting(d))
      .child(this.box(d, space, x, aim));
  }

  waiting(d) {
    return v_flex().flex_1().min_h(0).items_center().justify_center().text_size(12.5).text_color(d.fg2)
      .child(div().max_w(520).child(this.err ? `Couldn't read the board: ${clip(this.err, 200)}` : "Reading the board…"));
  }

  // The header: whose board, one line of counts, and the ways out.
  head(d, space, bot, x, cols) {
    const n = cols.you.length, w = cols.working.length;
    const fresh = cols.resting.filter((t) => t.fresh).length;
    const dot = (color) => div().size(7).rounded(4).bg(color).flex_none();
    const sep = () => div().text_color(d.fg4).child("·");
    const stat = h_flex().flex_wrap().items_center().gap(7).mt(6).text_size(12.5).line_height("18px").text_color(d.fg2);
    if (x) {
      stat.child(dot(n ? d.warn : d.fg4)).child(div().text_color(n ? d.warnText : d.body).font_weight(500).child(n ? `${n} need${n === 1 ? "s" : ""} you` : "Nothing needs you"));
      stat.child(sep()).child(dot(w ? d.info : d.fg4)).child(div().text_color(d.body).font_weight(500).child(`${w} working`));
      if (fresh) stat.child(sep()).child(dot(d.ok)).child(div().child(`${fresh} finished since you last looked${this.seen ? ` at ${when(this.seen)}` : ""}`));
      if (x.focus) stat.child(sep()).child(div().min_w(0).child(`Focus: ${clip(x.focus, 110)}`));
    }
    return h_flex().flex_none().items_start().justify_between().gap(16).px(PAD).pt(20)
      .child(v_flex().min_w(0)
        .child(h_flex().gap(7).text_size(10.5).font_family(d.mono).text_color(d.fg3)
          .child(div().text_color(d.claude).child(space.name.toUpperCase()))
          .child(div().child(`· ${clip(harnessName(bot), 28).toUpperCase()}`)))
        .child(div().mt(2).text_size(21).line_height("28px").font_weight(600).child(`${space.name}'s board`))
        .child(stat))
      .child(h_flex().flex_none().gap(8).pt(4)
        .when(hasComputer(), (el) => el.child(pebble(d, { id: "pb-computer", icon: "ds-desktop", label: "Computer", onClick: () => showComputer(space), tooltip: "Its Computer (Ctrl+Shift+Y)" })))
        .child(pebble(d, { id: "pb-terminal", icon: "ds-terminal", label: "Terminal", extra: "Esc", primary: true, onClick: () => openTerminal(space, tabOf(space, this.aimed(space))), tooltip: "The aimed topic's terminal (Esc)" })));
  }

  // The four columns. Their widths come from the view's width: Needs you and Working are wider
  // (their cards carry the words you read); an empty Needs you or Up next is a rail.
  board(d, space, cols, aim) {
    const W = Math.max(480, this.size.width - 2 * PAD);
    const railYou = cols.you.length === 0, railNext = cols.next.length === 0;
    const shares = { you: railYou ? 0 : WEIGHT.you, working: WEIGHT.working, resting: WEIGHT.resting, next: railNext ? 0 : WEIGHT.next };
    const free = W - 3 * GAP - (railYou ? RAIL : 0) - (railNext ? RAIL : 0);
    const sum = shares.you + shares.working + shares.resting + shares.next;
    const px = (key) => Math.floor(free * shares[key] / sum);
    // How tall a column may get before it scrolls: the view less the header and the box under it.
    const rows = Math.max(2, Math.min(8, this.input.value().split("\n").length));
    this.colMax = Math.max(160, Math.floor(this.size.height - HEAD_H - (rows * 20 + BOX_H) - 18));
    const reviewing = this.review != null ? Math.min(this.review, cols.you.length - 1) : null;
    const you = railYou ? this.rail(d, "you", "Needs you", "Nothing needs you")
      : this.column(d, "you", `Needs you · ${cols.you.length}`, px("you"), cols.you.map((c, i) => this.needCard(d, space, c, i === reviewing)), {
        warm: true,
        right: pebble(d, { id: "pb-review", label: reviewing != null ? "Reviewing" : `Review ${cols.you.length}`, extra: reviewing != null ? "Esc" : "R",
          onClick: (cx) => { this.review = this.review != null ? null : 0; try { this.handle.focus(); } catch { /* not ready */ } cx.notify(); },
          tooltip: "Step through what needs you, one at a time: 1–4 press a button, → skips" }),
      });
    const working = this.column(d, "working", `Working · ${cols.working.length}`, px("working"),
      cols.working.length ? cols.working.map((tp) => this.topicCard(d, space, tp, aim)) : [this.note(d, "Nothing is running right now.")]);
    const awake = cols.resting.filter((tp) => tp.state !== "asleep"), asleep = cols.resting.filter((tp) => tp.state === "asleep");
    // With many topics resting, each shrinks to one line so the column stays readable.
    const compact = cols.resting.length > 4;
    const resting = this.column(d, "resting", `Resting · ${cols.resting.length}`, px("resting"), [
      ...(cols.resting.length ? [] : [this.note(d, "A finished topic rests here once nothing waits on you.")]),
      ...awake.map((tp) => this.topicCard(d, space, tp, aim, { compact })),
      ...(asleep.length ? [div().px(4).pt(2).text_size(10).font_family(d.mono).text_color(d.fg4).child("ASLEEP")] : []),
      ...asleep.map((tp) => this.topicCard(d, space, tp, aim, { compact })),
    ]);
    const more = cols.nextTotal - cols.next.length;
    const next = railNext ? this.rail(d, "next", "Up next", "No task is waiting for a topic")
      : this.column(d, "next", `Up next · ${cols.nextTotal}`, px("next"), cols.next.map((r) => this.taskCard(d, space, r)), {
        right: div().id("pb-all-tasks").cursor_pointer().text_size(11).text_color(d.fg3).hover((s) => s.text_color(d.fg1))
          .child(more > 0 ? `${more} more` : "all tasks")
          .on_click(() => openOverlay({ mod: "crew-tasks", kind: "dialog", width: 520, props: { space: space.id } })),
      });
    return h_flex().flex_1().min_h(0).items_start().gap(GAP).px(PAD).pt(14).pb(4)
      .child(you).child(working).child(resting).child(next);
  }

  column(d, key, title, w, cards, { warm = false, right = null } = {}) {
    const list = v_flex().gap(8).p(8).pr(11).children(cards);
    return v_flex().id(`pb-col-${key}`).w(w).flex_none().max_h(this.colMax ?? 480).min_h(0).rounded(d.r.lg).border_1()
      .border_color(warm ? d.warn + "55" : d.line).bg(d.bg1).overflow_hidden()
      .child(h_flex().flex_none().h(32).pl(12).pr(8).items_center().justify_between().gap(8)
        .child(div().text_size(10.5).font_family(d.mono).font_weight(500).text_color(warm ? d.warnText : d.fg3).child(title.toUpperCase()))
        .when(Boolean(right), (el) => el.child(right)))
      .child(scrollArea(d, `pb-scroll-${key}`, list).flex_1().min_h(0));
  }

  rail(d, key, title, why) {
    return v_flex().id(`pb-rail-${key}`).w(RAIL).h(96).flex_none().items_center().gap(6).pt(10).rounded(d.r.lg).border_1().border_color(d.line).bg(d.bg1)
      .tooltip(why)
      .child(svg(`${ICON}/${key === "you" ? "ds-check" : "ds-tasks"}.svg`).size(13).text_color(d.fg4))
      .child(div().text_size(10.5).font_family(d.mono).text_color(d.fg4).child("0"));
  }

  note(d, text) {
    return div().px(4).py(4).text_size(12).line_height("17px").text_color(d.fg4).child(text);
  }

  chip(d, word, color) {
    return div().flex_none().h(16).px(5).flex().items_center().rounded(3).border_1().border_color(color + "66")
      .text_size(9.5).line_height("14px").font_weight(600).text_color(color).child(word.toUpperCase());
  }

  stateColor(d, state) {
    return { working: d.info, blocked: d.warn, done: d.ok }[state] ?? d.fg4;
  }

  // "T41 · crew/checkout +22 −7": the task and the branch, when it has them.
  meta(d, tp) {
    const b = tp?.branch;
    if (!tp?.task && !b) return null;
    const row = h_flex().flex_wrap().items_center().gap(6).text_size(10.5).line_height("15px").font_family(d.mono).text_color(d.fg3);
    if (tp.task) row.child(div().text_color(d.fg2).child(tp.task.id));
    if (tp.task && b) row.child(div().child("·"));
    if (b) {
      row.child(div().min_w(0).truncate().child(clip(b.name, 28)));
      if (b.added || b.removed) row.child(div().text_color(d.okHi).child(`+${b.added}`)).child(div().text_color(d.err).child(`−${b.removed}`));
      else if (b.ahead) row.child(div().child(`${b.ahead} ahead`));
    }
    return row;
  }

  // One thing the pal needs from you: what it is, how long it has waited, the pal's pick when it
  // gave one, and the buttons. While reviewing, the one in turn is ringed and its buttons show keys.
  needCard(d, space, c, reviewing) {
    const n = c.need, tp = c.topic;
    const busy = Boolean(this.busy[`need-${n.id}`]);
    const acts = this.needActs(space, n);
    const head = h_flex().items_center().gap(7).min_w(0)
      .child(div().size(7).rounded(4).flex_none().bg(tp ? this.stateColor(d, tp.state) : d.warn))
      .child(div().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(d.fg1).child(n.topic ? `#${n.topic}` : space.name))
      .child(this.chip(d, KIND[n.kind] ?? n.kind, d.warnText))
      .child(div().flex_1())
      .when(Boolean(n.since), (el) => el.child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(d.warnText).child(`waiting ${waited(n.since)}`)));
    const body = v_flex().gap(4).min_w(0);
    if (n.kind === "approval") {
      body.child(div().px(6).py(3).rounded(4).bg(d.inset).border_1().border_color(d.lineMid).text_size(11.5).line_height("17px").font_family(d.mono).text_color(d.fg1).child(clip(n.title, 200)));
      body.child(div().text_size(12).line_height("17px").text_color(d.fg2)
        .child(`It wants to ${wantsTo(n.detail || n.rule)}.${tp?.state === "done" && tp.finished_at ? ` Finished ${when(tp.finished_at)}.` : ""}${tp?.line?.text ? ` ${tp.line.text}` : ""}`));
    } else {
      body.child(div().text_size(13).line_height("19px").font_weight(500).text_color(d.fg1).child(n.title || "(no title)"));
      if (n.kind === "ask" && n.recommend) {
        body.child(div().text_size(12).line_height("17px").text_color(d.fg2).child(`Its pick: ${n.recommend}.${n.why ? ` ${n.why}` : ""}`));
      } else if (n.detail) body.child(div().text_size(12).line_height("17px").text_color(d.fg2).child(n.detail));
    }
    const meta = this.meta(d, tp);
    const buttons = h_flex().flex_wrap().gap(6).pt(2)
      .children(acts.map((a, i) => pebble(d, { id: `pb-${n.id}-${i}`, label: a.label, primary: Boolean(a.primary), disabled: busy,
        extra: reviewing ? String(i + 1) : null, tooltip: a.full && a.full !== a.label ? a.full : null, onClick: (cx) => a.go(cx) })));
    return v_flex().id(`pb-need-${n.id}`).gap(7).p(10).rounded(d.r.md).bg(d.raised).border_1().border_color(reviewing ? d.warn : d.line)
      .child(head).child(body)
      .when(Boolean(meta), (el) => el.child(meta))
      .child(buttons);
  }

  // A topic: its state and how long, one or two sentences in its own words and where they came
  // from, its task and branch. Click it to aim the message box at it; the aimed one shows the
  // ways into it.
  topicCard(d, space, tp, aim, { compact = false } = {}) {
    const on = tp.topic === aim && this.target === "topic";
    const tab = tabOf(space, tp.topic);
    const asleep = tp.state === "asleep", working = tp.state === "working";
    const right = working ? waited(tp.since).replace(/^just now$/, "now") : asleep ? "asleep" : when(tp.finished_at) || STATE_WORD[tp.state] || tp.state;
    const head = h_flex().items_center().gap(7).min_w(0)
      .child(div().size(7).rounded(4).flex_none().bg(this.stateColor(d, tp.state)))
      .child(div().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(asleep ? d.fg2 : d.fg1).child(`#${tp.topic}`))
      .when(tp.fresh, (el) => el.child(this.chip(d, "New", d.okHi)))
      .when(tp.stuck > 0, (el) => el.child(this.chip(d, `Stuck ${tp.stuck} min`, d.warnText)))
      .when(Boolean(tp.blocked), (el) => el.child(this.chip(d, "Blocked", d.fg2)))
      .when(tp.asksPal, (el) => el.child(this.chip(d, "Asks a pal", d.fg2)))
      .child(div().flex_1())
      .child(div().flex_none().text_size(11).text_color(d.fg3).child(right));
    const words = tp.line?.text || (tp.blocked ? `${tp.blocked.id} ${tp.blocked.title}` : tp.task ? `${tp.task.id} ${tp.task.title}` : tp.state === "shell" ? "A shell, with no pal running in it." : "Nothing to read from it yet.");
    const said = div().text_size(compact ? 12 : 13).line_height(compact ? "17px" : "19px").text_color(tp.line?.text && !asleep ? (working ? d.fg1 : d.body) : d.fg2)
      .when(compact, (el) => el.truncate())
      .child(compact ? clip(words, 120) : words);
    const card = v_flex().id(`pb-topic-${tp.topic}`).gap(6).p(10).rounded(d.r.md).cursor_pointer()
      .bg(on ? d.composer : d.raised).border_1().border_color(on ? d.claude + "88" : d.line)
      .on_click((_e, cx) => this.setAim(space, tp.topic, cx))
      .child(head).child(said);
    if (compact && !on) return card;
    if (tp.blocked?.why) card.child(div().text_size(12).line_height("17px").text_color(d.fg2).child(`Blocked: ${tp.blocked.why}`));
    const meta = this.meta(d, tp);
    if (meta) card.child(meta);
    if (tp.line?.text && !compact) {
      const from = { turn: "its words this turn", reply: "the lead of its last reply", asked: "what it was asked" }[tp.line.from] ?? "its words";
      const by = tp.line.asked?.by ? ` · asked by ${tp.line.asked.by}` : "";
      card.child(div().text_size(10.5).line_height("15px").font_family(d.mono).text_color(d.fg4).child(`${from} · ${when(tp.line.at)}${working ? by : ""}`));
    }
    const mine = this.sent[tp.topic];
    if (mine) {
      card.child(h_flex().items_start().gap(6).pt(1).text_size(11.5).line_height("16px")
        .child(div().flex_none().font_weight(500).text_color(d.claude).child(`You, ${shortTime(mine.at)}`))
        .child(div().flex_1().min_w(0).text_color(d.fg2).child(clip(mine.text.replace(/\s+/g, " "), 90)))
        .child(this.chip(d, mine.what, mine.what === "held" ? d.warnText : d.fg2)));
    }
    if (on) {
      const tools = h_flex().gap(6).pt(2);
      if (asleep) tools.child(pebble(d, { id: `pb-wake-${tp.topic}`, icon: "ds-moon", label: "Wake", disabled: Boolean(this.busy[`wake-${tp.topic}`]),
        onClick: (cx) => this.act(`wake-${tp.topic}`, ["wake", `${space.name}#${tp.topic}`], `Waking #${tp.topic}`, cx, false) }));
      tools.child(pebble(d, { id: `pb-term-${tp.topic}`, icon: "ds-terminal", label: "Terminal", onClick: () => openTerminal(space, tab) }));
      if (!asleep && tab) tools.child(pebble(d, { id: `pb-pop-${tp.topic}`, icon: "ds-expand", label: "Pop out", onClick: () => { popOut(space, tab); } }));
      card.child(tools);
    }
    return card;
  }

  // A task no topic has claimed. Start a topic opens the new-topic dialog with it as the brief.
  taskCard(d, space, r) {
    const late = String(r.due_label ?? "").startsWith("overdue");
    return v_flex().id(`pb-task-${r.id}`).gap(6).p(10).rounded(d.r.md).border_1().border_dashed().border_color(d.lineMid)
      .child(h_flex().items_center().justify_between().gap(6)
        .child(div().text_size(11.5).font_family(d.mono).text_color(d.fg3).child(r.id))
        .when(Boolean(r.due_label), (el) => el.child(div().flex_none().text_size(10.5).font_family(d.mono).text_color(late ? d.err : d.warnText).child(r.due_label))))
      .child(div().text_size(12.5).line_height("18px").text_color(d.body).child(r.title))
      .child(h_flex().pt(1).child(pebble(d, { id: `pb-start-${r.id}`, label: "Start a topic",
        onClick: () => openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id, brief: `${r.id}: ${r.title}. Claim it with pal task claim ${r.id}.` } }),
        tooltip: "Opens a new topic with this task as its brief" })));
  }

  // The message box: who it goes to (a topic, or a new task), what sending does there, and Send.
  box(d, space, x, aim) {
    const tp = (x?.topics ?? []).find((y) => y.topic === aim) ?? null;
    const task = this.target === "task";
    const state = tp?.state;
    const hint = task ? "It lands in Up next, and the pal picks it up when a topic is free."
      : !tp ? "Pick a topic above, or add a task."
      : state === "working" ? "Working: it gets this between two of its steps."
      : state === "blocked" ? "It's waiting at a question. This reaches it after you've answered in its terminal."
      : state === "asleep" ? "Asleep: this waits on its desk until you wake it."
      : "Resting: it gets this now.";
    const empty = !this.input.value().trim();
    const to = h_flex().id("pb-to").flex_none().h(26).px(8).gap(6).items_center().rounded(d.r.md).cursor_pointer()
      .bg(d.claude + "22").border_1().border_color(d.claude + "66")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { this.picking = !this.picking; cx.notify(); })
      .child(div().text_size(12).font_family(d.mono).text_color(d.claude).child(task ? `A task for ${space.name}` : aim ? `To #${aim}` : "To…"))
      .child(svg(`${ICON}/ds-chevron-down.svg`).size(10).text_color(d.claude));
    const field = v_flex().id("pb-box").rounded(d.r.lg).bg(d.composer).border_1().border_color(this.typing ? d.lineStrong : d.lineMid)
      .on_key_down((e, cx) => {
        const key = e.keystroke ?? e.key, mods = e.modifiers ?? {};
        if ((key === "enter" || key === "ctrl-enter") && (mods.control || mods.platform || key === "ctrl-enter")) {
          this.urgent = true;
          cx.timer.after(0, (cx) => this.send(cx));
        }
      })
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(div().px(6).pt(4).child(Textarea.new(this.input).w_full().px(6).py(4).text_size(13.5).line_height("20px").text_color(d.fg1)))
      .child(h_flex().items_center().gap(8).px(10).pb(8).pt(2)
        .child(to)
        .child(div().flex_1().min_w(0).text_size(11.5).line_height("16px").text_color(d.fg3).child(hint))
        .when(!task && state === "working", (el) => el.child(pebble(d, { id: "pb-now", label: "Interrupt", extra: "Ctrl+↵", disabled: empty || Boolean(this.busy.send),
          onClick: (cx) => this.send(cx, true), tooltip: "Send it now, in the middle of its turn" })))
        .child(pebble(d, { id: "pb-send", icon: "ds-send", label: task ? "Add" : "Send", extra: "↵", primary: true, disabled: empty || Boolean(this.busy.send) || (!task && !tp),
          onClick: (cx) => this.send(cx) })));
    // The list is added after the field, so it draws over it.
    return v_flex().flex_none().relative().px(PAD).pt(8).pb(16).child(field)
      .when(this.picking, (el) => el.child(this.picker(d, space, x, aim)));
  }

  // The "To" list, above the box: every topic with what sending does there, then a task.
  picker(d, space, x, aim) {
    const how = { working: "working · between steps", blocked: "waiting for you", asleep: "asleep · waits on its desk", done: "resting · now", idle: "resting · now", shell: "no pal running" };
    const row = (id, on, left, name, right, go) => h_flex().id(id).h(28).px(8).gap(8).items_center().rounded(4).cursor_pointer()
      .when(on, (el) => el.bg(d.sel)).hover((s) => s.bg(d.hover))
      .on_click((_e, cx) => go(cx))
      .child(left)
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(on ? d.fg1 : d.body).child(name))
      .child(div().flex_none().text_size(11).text_color(d.fg3).child(right));
    const rows = (x?.topics ?? []).filter((tp) => tp.state !== "shell").map((tp) => row(`pb-pick-${tp.topic}`, this.target === "topic" && tp.topic === aim,
      div().size(7).rounded(4).flex_none().bg(this.stateColor(d, tp.state)), `#${tp.topic}`, how[tp.state] ?? tp.state, (cx) => this.setAim(space, tp.topic, cx)));
    return v_flex().id("pb-picker").absolute().left(PAD + 10).bottom(64).w(340).p(5).gap(1).rounded(d.r.lg).bg(d.raised).border_1().border_color(d.lineMid).shadow_lg()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .children(rows)
      .child(div().h(1).my(4).bg(d.line))
      .child(row("pb-pick-task", this.target === "task", svg(`${ICON}/ds-plus.svg`).size(10).text_color(d.fg2), `A task for ${space.name}`, "lands in Up next",
        (cx) => { this.target = "task"; this.picking = false; cx.notify(); }))
      .child(row("pb-pick-new", false, svg(`${ICON}/ds-plus.svg`).size(10).text_color(d.fg2), "New topic…", "opens the new-topic dialog",
        (cx) => { this.picking = false; openOverlay({ mod: "crew-duplicate", kind: "dialog", width: 500, props: { space: space.id, brief: this.input.value().trim() } }); cx.notify(); }));
  }
}
