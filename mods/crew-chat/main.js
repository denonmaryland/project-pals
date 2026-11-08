// Project Pals chat: a channel's conversation as a chat instead of a terminal (the center's "chat-view").
// crewd keeps a small feed per channel in data/crew-chats/<terminal>.jsonl, made from Claude
// Code's session file: your messages on the right, the pal's replies on the left (markdown,
// selectable), its tool work folded into chips per stretch, notes from other pals and
// Project Pals in their own bubbles. The composer still types into the terminal; the reply shows up here.
// Questions and permission prompts happen in the terminal: a card offers to open it.
//
// Rows need exact heights (a virtual list scrolls to the newest). Messages are TextView markdown
// (markdown.js), whose height can't be computed ahead: each is drawn once off-screen to measure
// it (measuring()), and estimate.js guesses until then. Right-click a message to copy it or a
// code block (crew-menu).
//
// Reading behaviour after flockbook's chat (github.com/minchenlee/flockbook, MIT, (c) 2026 Min-Chen
// Lee): it follows the newest message only until you scroll up, then a down-arrow button brings you
// back; tool calls are chips that show running, done or failed; each finished turn gets a footer
// ("3:41 PM · Worked 36s · 3 tools"); scrolling to the top reads earlier messages in place.
// Selectable markdown with rounded code boxes and tables, and its height guesses, are adapted
// from flockbook's mdblocks.js and estimate.js (see those files' headers).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { markdownView, plain, splitBlocks } from "./markdown.js";
import { markdownHeight, lineWidth } from "./estimate.js";
import { spaces, panes, theme, watchFolder, appHome, readTextFile, hc, layout, notify, openOverlay } from "herdr";
import { botOf, mascotEl, mood, leadPane, channelName, setChatPref, a, tone } from "./crew.js";

const LINE = 21;
const PAD_Y = 9, NAME = 18, GAP_NEW = 14, GAP_SAME = 4, STAMP = 36, EVENT = 32, TYPING = 54, CARD = 74;
const CHIP = 28, CHIP_GAP = 6, CALL = 24, CALL_OUT = 20, FOOTER = 24;
const COLUMN = 860, KEEP = 300, MEASURE = 24;

const ICONS = "mods/crew-chat/icons", ROSTER = "mods/crew-roster/icons";
const clock = (ms) => { const d = new Date(ms), h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
// A time separator: the clock today, "Yesterday 9:12 AM", else "Mon, Nov 2 · 6:30 PM".
function when(ms) {
  const d = new Date(ms), today = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(today) - day(d)) / 86400000);
  if (days === 0) return clock(ms);
  if (days === 1) return `Yesterday ${clock(ms)}`;
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
  return `${date} · ${clock(ms)}`;
}
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const worked = (ms) => { const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}

// A stretch of tool calls as chips, one per kind ("Ran 3 commands", "Edited main.js"), in the order
// they first happened. Each call is running (no result yet, while the pal works), done, failed, or
// unknown (feeds written before results were recorded).
const KINDS = {
  command: { icon: `${ICONS}/terminal.svg`, one: () => "Ran a command", many: (n) => `Ran ${n} commands` },
  edit: { icon: `${ICONS}/pencil.svg`, one: (w) => `Edited ${w}`, many: (n) => `Edited ${n} files`, files: true },
  write: { icon: `${ICONS}/pencil.svg`, one: (w) => `Wrote ${w}`, many: (n) => `Wrote ${n} files`, files: true },
  read: { icon: `${ROSTER}/file.svg`, one: () => "Read a file", many: (n) => `Read ${n} files` },
  search: { icon: `${ROSTER}/search.svg`, one: () => "Searched the code", many: (n) => `Searched ${n} times` },
  web: { icon: `${ICONS}/globe.svg`, one: () => "Looked online", many: (n) => `Looked online ${n} times` },
  agent: { icon: `${ROSTER}/users.svg`, one: () => "Ran a helper", many: (n) => `Ran ${n} helpers` },
  tool: { icon: `${ICONS}/wrench.svg`, one: (w) => `Used ${w}`, many: (n) => `Used ${n} tools`, files: true },
};
function chips(items) {
  const by = new Map();
  for (const x of items) { const k = KINDS[x.verb] ? x.verb : "tool"; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
  return [...by].map(([k, xs]) => {
    const K = KINDS[k], names = new Set(xs.map((x) => x.what));
    const label = K.files ? (names.size === 1 ? K.one(xs[0].what) : K.many(names.size)) : xs.length === 1 ? K.one() : K.many(xs.length);
    return { kind: k, icon: K.icon, label, running: xs.some((x) => x.state === "running"), failed: xs.filter((x) => x.state === "failed").length };
  });
}
// How wide a chip draws (px), to know how many rows of chips a stretch takes.
const chipW = (c) => 20 + 13 + 6 + c.label.length * 7 + 16 + (c.running ? 17 : 0) + (c.failed ? 56 : 0);
function chipRows(cs, width) {
  let rows = 1, x = 0;
  for (const c of cs) { const w = chipW(c); if (x && x + CHIP_GAP + w > width) { rows++; x = w; } else x += (x ? CHIP_GAP : 0) + w; }
  return rows;
}

export default class CrewChat extends View {
  init(_props, cx) {
    this.entries = [];
    this.results = new Map(); // tool call id → its result ({error, out})
    this.terminal = null;
    this.size = -1;
    this.width = 760;
    this.open = new Set();     // expanded tool stretches
    this.scroll = VirtualListScrollHandle.new();
    this.shown = false;
    this.follow = true;        // keep the newest message on screen; scrolling up stops it
    this.keep = KEEP;          // how many feed lines are read; scrolling to the top reads more
    this.measured = new Map(); // "<feed line>|<text width>" → the message's drawn text height
    this.natural = new Map();  // feed line → a one-paragraph message's width on one line
    this.mver = 0;
    this.reload(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        try { await watchFolder(`${appHome()}/data/crew-chats`); } catch { return; }
        this.reload(cx);
      }
    });
    cx.timer.every(1500, (cx) => this.reload(cx));
  }

  target() {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    const lead = tab ? leadPane(tab.id, panes()) : null;
    return { space, tab, terminal: lead?.terminal ?? null };
  }

  reload(cx) {
    const { terminal } = this.target();
    cx.spawn(async (cx) => {
      let text = "";
      if (terminal) { try { text = (await readTextFile(`${appHome()}/data/crew-chats/${terminal}.jsonl`)) ?? ""; } catch { text = ""; } }
      // Model, effort, context, usage: what Claude Code last told its status line (crew-statusline).
      let meta = null;
      if (terminal) { try { meta = JSON.parse((await readTextFile(`${appHome()}/data/crew-status/${terminal}.json`)) ?? "null"); } catch { meta = null; } }
      if (JSON.stringify(meta) !== JSON.stringify(this.meta)) { this.meta = meta; cx.notify(); }
      const switched = terminal !== this.terminal;
      if (switched) { this.keep = KEEP; this.follow = true; }
      if (switched || text.length < this.size) { this.measured.clear(); this.natural.clear(); }   // sizes are per feed line
      if (!switched && text.length === this.size && this.keep === this.kept) return;
      const all = text.split("\n").filter(Boolean);
      // The feed only grows: keep the messages already read (and their layout), parse just the new ones.
      const start = Math.max(0, all.length - this.keep);
      const prev = switched || text.length < this.size ? new Map() : this.byLine ?? new Map();   // shrank: a new session
      const byLine = new Map();
      const entries = [];
      const results = new Map();
      for (let n = start; n < all.length; n++) {
        let e = prev.get(n);
        if (!e) { try { e = JSON.parse(all[n]); e._n = n; } catch { e = null; } }
        if (!e) continue;
        byLine.set(n, e);
        if (e.kind === "result") results.set(e.id, e);
        else if (["you", "bot", "note", "tool", "event"].includes(e.kind)) entries.push(e);
      }
      this.byLine = byLine;
      this.entries = entries;
      this.results = results;
      this.version = (this.version ?? 0) + 1;
      this.older = start;
      this.terminal = terminal;
      this.size = text.length;
      this.kept = this.keep;
      this.loadingOlder = false;
      if (switched) this.open.clear();
      if (this.follow) this.toBottom(cx);
      cx.notify();
    });
  }

  // Scrolled to the top with more above: read the next KEEP lines too, and keep the same message in view.
  loadOlder(cx) {
    if (this.loadingOlder || !this.older) return;
    this.loadingOlder = true;
    this.anchor = this.rowsVal?.find((r) => r.kind !== "event" || r.key !== "older")?.key ?? null;
    this.keep += KEEP;
    cx.notify();
    this.reload(cx);
  }

  toBottom(cx) {
    this.pending = true;
    for (const ms of [40, 160, 400]) cx.timer.after(ms, (cx) => { if (this.follow) { this.scroll.scroll_to_bottom(); cx.notify(); } });
  }

  // Laying out hundreds of messages every frame is too slow for Herdr's render budget, so the
  // rows are kept until the feed, the width, the status or what's unfolded changes.
  rows(status) {
    const key = `${this.version}|${this.mver}|${Math.round(Math.min(this.width, COLUMN))}|${status}|${[...this.open].join(",")}`;
    if (key === this.rowsKey) return this.rowsVal;
    this.rowsKey = key;
    this.rowsVal = this.layout(status);
    return this.rowsVal;
  }

  layout(status) {
    const width = Math.min(this.width, COLUMN);
    const botMax = Math.max(260, Math.min(680, Math.round(width - 120)));
    const youMax = Math.max(220, Math.min(540, Math.round((width - 120) * 0.72)));
    const unmeasured = [];
    const busy = status === "working" || status === "blocked";
    const rows = [];
    if (this.older) rows.push({ kind: "event", key: "older", text: this.loadingOlder ? "Loading earlier messages…" : "Scroll up for earlier messages", h: EVENT });
    let prev = null;
    // A turn: from your message (or a note to the pal) to the next. A finished one that got a reply
    // ends with a footer: when it ended, how long it worked, how many tools it used.
    let turn = null;
    const endTurn = (last) => {
      if (turn?.reply && last) {
        const parts = [clock(last.at)];
        if (last.at - turn.at >= 1000) parts.push(`Worked ${worked(last.at - turn.at)}`);
        if (turn.tools) parts.push(`${turn.tools} tool${turn.tools === 1 ? "" : "s"}`);
        rows.push({ kind: "footer", key: `f-${last._n}`, text: parts.join(" · "), h: FOOTER });
      }
      turn = null;
    };
    const es = this.entries;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.kind === "you" || e.kind === "note") { endTurn(prev); turn = { at: e.at, tools: 0, reply: false }; }
      const far = !prev || e.at - prev.at > 10 * 60 * 1000 || !sameDay(e.at, prev.at);
      if (far) rows.push({ kind: "stamp", key: `s-${e._n}`, at: e.at, h: STAMP });
      if (e.kind === "tool") {
        // The whole stretch of tool calls: chips, and (unfolded) one line per call.
        const items = [];
        while (i < es.length && es[i].kind === "tool") {
          const x = es[i++];
          const r = x.id ? this.results.get(x.id) : null;
          items.push({ ...x, state: r ? (r.error ? "failed" : "done") : x.id && busy ? "running" : x.id ? "stopped" : "unknown", out: r?.out ?? "" });
        }
        i--;
        if (turn) turn.tools += items.length;
        const key = `t-${items[0]._n}`;
        const open = this.open.has(key);
        const cs = chips(items);
        const lines = open ? items.reduce((n, x) => n + CALL + (x.state === "failed" && x.out ? CALL_OUT : 0), 0) + 6 : 0;
        const nrows = chipRows(cs, botMax);
        rows.push({ kind: "tools", key, items, chips: cs, open, h: GAP_SAME + 2 + nrows * CHIP + (nrows - 1) * CHIP_GAP + 4 + lines });
        prev = { ...es[i], kind: "bot" };
        continue;
      }
      if (e.kind === "event") { rows.push({ kind: "event", key: `e-${e._n}`, text: e.text, h: EVENT }); prev = e; continue; }
      if (e.kind === "bot" && turn) turn.reply = true;
      const you = e.kind === "you";
      const first = far || !prev || prev.kind !== e.kind || (e.kind === "note" && prev.from !== e.from);
      const max = you ? youMax : botMax;
      // The text's width: the bubble's at most, or (one short paragraph) about the text's own.
      const text = e.text ?? "";
      let tw = max - 28;
      if (plain(text)) {
        // One short paragraph: its natural one-line width, measured (guessed until then).
        const nat = this.natural.get(e._n);
        if (nat == null) unmeasured.push({ key: `${e._n}`, text, you, natural: true });
        const w = nat ?? Math.ceil(lineWidth(text.trim()) * 1.06 + 12);
        if (w < tw) tw = Math.max(16, Math.ceil(w) + 1);
      }
      // Its height: measured off-screen once per width (see measuring() in render), guessed until then.
      const mkey = `${e._n}|${tw}`;
      let th = this.measured.get(mkey);
      if (th == null) {
        if (!e._est || e._est.w !== tw) e._est = { w: tw, h: markdownHeight(text, tw) };
        th = e._est.h;
        unmeasured.push({ key: mkey, text, tw, you });
      }
      const label = e.kind === "note" ? e.from : null;
      const h = (first ? GAP_NEW : GAP_SAME) + (label && first ? NAME : 0) + PAD_Y * 2 + th + (e.images ? LINE : 0);
      rows.push({ kind: e.kind, key: `m-${e._n}`, e, you, first, label, tw, h });
      prev = e;
    }
    // The last turn gets its footer once the pal is done with it.
    if (!busy) endTurn(prev);
    this.unmeasured = unmeasured;
    if (status === "working") rows.push({ kind: "typing", key: "typing", h: TYPING });
    if (status === "blocked") rows.push({ kind: "blocked", key: "blocked", h: CARD });
    return rows;
  }

  row(r, t, bot) {
    if (r.kind === "stamp") return h_flex().h(r.h).w_full().items_center().justify_center().child(div().text_size(11.5).text_color(t.dim).child(when(r.at)));
    if (r.kind === "event") return h_flex().h(r.h).w_full().items_center().justify_center().px(28).child(div().truncate().text_size(12).text_color(t.dim).child(r.text));
    if (r.kind === "footer") return h_flex().h(r.h).w_full().items_start().pl(68).pr(28).child(div().truncate().text_size(11.5).text_color(t.dim).child(r.text));
    if (r.kind === "tools") {
      const chip = (c) => h_flex().flex_none().h(CHIP).px(10).gap(6).items_center().rounded(CHIP / 2)
        .bg(a(t.foreground, "08")).border_1().border_color(c.failed ? a(t.blocked, "66") : a(t.foreground, "12"))
        .child(svg(c.icon).size(13).flex_none().text_color(t.muted))
        .child(div().text_size(12.5).text_color(t.muted).child(c.label))
        .when(c.running, (el) => el.child(svg(`${ROSTER}/spinner.svg`).size(11).text_color(t.working).spin(900)))
        .when(c.failed > 0, (el) => el.child(div().text_size(12).text_color(t.blocked).child(`${c.failed} failed`)))
        .child(svg(`${ROSTER}/${r.open ? "chevron-down" : "chevron-right"}.svg`).size(10).text_color(t.dim));
      const mark = (x) => x.state === "done" ? svg(`${ROSTER}/check.svg`).size(12).flex_none().text_color(t.done)
        : x.state === "running" ? svg(`${ROSTER}/spinner.svg`).size(11).flex_none().text_color(t.working).spin(900)
        : x.state === "failed" ? div().flex_none().text_size(12).text_color(t.blocked).child("failed")
        : x.state === "stopped" ? div().flex_none().text_size(12).text_color(t.dim).child("no result")
        : div().flex_none();
      const VERB = { command: "Bash", edit: "Edit", write: "Write", read: "Read", search: "Search", web: "Web", agent: "Agent" };
      const call = (x) => v_flex().w_full()
        .child(h_flex().h(CALL).w_full().gap(8).items_center().overflow_hidden()
          .child(div().flex_none().text_size(12).font_medium().text_color(t.foreground).child(VERB[x.verb] ?? (x.name || "Tool").replace(/^mcp__.*__/, "")))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.muted).child(x.what && x.what !== x.name ? x.what : ""))
          .child(mark(x)))
        .when(x.state === "failed" && Boolean(x.out), (el) => el.child(div().h(CALL_OUT).w_full().truncate().pl(2)
          .text_size(11.5).font_family("JetBrains Mono").text_color(a(t.blocked, "cc")).child(x.out.split("\n").join("  ·  "))));
      return v_flex().h(r.h).w_full().pt(GAP_SAME + 2).pl(68).pr(28).cursor_pointer()
        .child(h_flex().w_full().flex_wrap().gap(CHIP_GAP).children(r.chips.map(chip)))
        .when(r.open, (el) => el.child(v_flex().w_full().pl(12).pt(4).children(r.items.map(call))));
    }
    if (r.kind === "typing") {
      return h_flex().h(r.h).w_full().items_end().gap(10).pt(GAP_NEW).px(28)
        .child(mascotEl(bot, "working", 30, t))
        .child(div().h(36).px(16).flex().items_center().rounded(18).bg(a(t.foreground, "0e"))
          .child(div().w(30).text_size(16).text_color(t.muted).font_family("JetBrains Mono").frames(["•  ", "•• ", "•••", " ••", "  •", "   "], 180).child("•••")));
    }
    if (r.kind === "blocked") {
      return h_flex().h(r.h).w_full().items_end().pt(GAP_NEW).px(28).gap(10)
        .child(mascotEl(bot, "blocked", 30, t))
        .child(h_flex().items_center().px(16).py(10).rounded(16).bg(a(t.blocked, "14")).border_1().border_color(a(t.blocked, "30"))
          .child(div().text_size(13.5).text_color(t.foreground).child("It's asking you something in the terminal")));
    }
    const { e, you, first, label, tw } = r;
    const note = r.kind === "note";
    const color = you ? t.accent_foreground : t.foreground;
    const bubble = v_flex().w(tw + 28).flex_none().px(14).py(PAD_Y).rounded(18).text_size(14).text_color(color)
      .when(you, (el) => el.bg(t.accent))
      .when(note, (el) => el.bg(a(t.foreground, "07")).border_1().border_color(a(t.foreground, "12")))
      .when(!you && !note, (el) => el.bg(a(t.foreground, "0e")))
      .child(markdownView(`md-${r.key}`, e.text ?? "", color, tw))
      .when(Boolean(e.images), (el) => el.child(div().h(LINE).text_size(12.5).text_color(you ? t.accent_foreground : t.dim).child(`${e.images} image${e.images > 1 ? "s" : ""}`)));
    if (you) return v_flex().h(r.h).w_full().items_end().pt(first ? GAP_NEW : GAP_SAME).px(28).child(bubble);
    const face = first && !note ? mascotEl(bot, "calm", 30, t) : div().size(30);
    return h_flex().h(r.h).w_full().items_start().gap(10).pt(first ? GAP_NEW : GAP_SAME).px(28)
      .child(v_flex().w(30).flex_none().pt(label && first ? NAME : 0).child(face))
      .child(v_flex().min_w(0).items_start()
        .when(Boolean(label) && first, (el) => el.child(h_flex().h(NAME).items_center().child(div().text_size(12).text_color(t.dim).child(`from ${label}`))))
        .child(bubble));
  }

  // Messages not measured yet, drawn off-screen exactly as their bubble draws them (newest first, a
  // few at a time); each reports its real height and the list uses that from then on. TextView's
  // height can't be computed ahead, and a wrong guess cuts a message or leaves a gap.
  measuring(t) {
    const todo = (this.unmeasured ?? []).slice(-MEASURE);
    if (!todo.length) return null;
    return v_flex().absolute().top(0).left(-30000).w(1400).items_start().opacity(0).children(todo.map((m) => {
      const color = m.you ? t.accent_foreground : t.foreground;
      // Its width on one line: drawn without a width, in a row that doesn't wrap.
      if (m.natural) return h_flex().id(`measure-w-${m.key}`).flex_none().whitespace_nowrap().text_size(14)
        .child(markdownView(`mw-${m.key}`, m.text, color, 1400))
        .on_size_change((size, cx) => {
          if (!(size.width > 0) || this.natural.get(Number(m.key)) === Math.ceil(size.width)) return;
          this.natural.set(Number(m.key), Math.ceil(size.width));
          this.mver++;
          if (this.follow) this.pending = true;
          cx.notify();
        });
      return v_flex().id(`measure-${m.key}`).w(m.tw).flex_none().text_size(14).text_color(color)
        .child(markdownView(`mm-${m.key}`, m.text, color, m.tw))
        .on_size_change((size, cx) => {
          if (!(size.height > 0) || this.measured.get(m.key) === size.height) return;
          this.measured.set(m.key, Math.ceil(size.height));
          this.mver++;
          if (this.follow) this.pending = true;
          cx.notify();
        });
    }));
  }

  // The strip under the chat: which model and effort, how full the context is, how much of your
  // usage is gone, and (while it works) Stop, or (when it asks) Open terminal.
  strip(tab, terminal, t) {
    const m = this.meta;
    const dot = () => div().text_size(12).text_color(a(t.dim, "88")).child("·");
    const fact = (text, color) => div().flex_none().text_size(12).text_color(color ?? t.dim).child(text);
    const facts = [];
    if (m?.model?.display_name) facts.push(fact(m.model.display_name + (m.fast_mode ? " fast" : ""), t.muted));
    if (m?.effort?.level) facts.push(fact(`${m.effort.level} effort`));
    const cw = m?.context_window;
    if (cw && Number.isFinite(cw.used_percentage)) {
      const pct = Math.max(0, Math.min(100, cw.used_percentage));
      const color = pct >= 85 ? t.blocked : pct >= 65 ? t.working : t.muted;
      const k = (n) => (n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
      facts.push(h_flex().flex_none().items_center().gap(6)
        .child(div().w(42).h(4).rounded_full().bg(a(t.foreground, "14")).child(div().h_full().w(42 * pct / 100).rounded_full().bg(color)))
        .child(fact(`context ${pct}%${cw.context_window_size ? ` of ${k(cw.context_window_size)}` : ""}`)));
    }
    const rl = m?.rate_limits ?? {};
    const reset = (at) => {
      if (!at) return "";
      const d = new Date((at > 1e12 ? at : at * 1000)), h = d.getHours();
      return ` · resets ${d.toDateString() === new Date().toDateString() ? "" : d.toLocaleDateString(undefined, { weekday: "short" }) + " "}${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    };
    if (Number.isFinite(rl.five_hour?.used_percentage)) facts.push(fact(`5-hour ${Math.round(rl.five_hour.used_percentage)}%${reset(rl.five_hour.resets_at)}`, rl.five_hour.used_percentage >= 80 ? t.blocked : t.dim));
    if (Number.isFinite(rl.seven_day?.used_percentage)) facts.push(fact(`week ${Math.round(rl.seven_day.used_percentage)}%`, rl.seven_day.used_percentage >= 80 ? t.blocked : t.dim));

    const row = h_flex().flex_1().min_w(0).items_center().gap(8).overflow_hidden();
    facts.forEach((f, i) => { if (i) row.child(dot()); row.child(f); });

    const busy = tab.status === "working" || tab.status === "blocked";
    const blocked = tab.status === "blocked";
    return h_flex().w_full().max_w(COLUMN).h(34).flex_none().items_center().gap(12).px(28)
      .child(row)
      .when(busy, (el) => el.child(h_flex().flex_none().items_center().gap(8)
        .child(div().text_size(12).text_color(blocked ? t.blocked : t.dim).child(blocked ? "asking you in the terminal" : "working"))
        .child(div().id("chat-action").px(11).py(3).rounded_full().cursor_pointer()
          .bg(blocked ? t.solid : a(t.foreground, "10")).hover((s) => s.opacity(0.85))
          .on_click(() => {
            if (blocked) setChatPref(tab.id, false);
            else if (terminal) hc(["interrupt", terminal]).catch(() => {});
          })
          .child(div().text_size(12).font_medium().text_color(blocked ? t.solid_foreground : t.foreground).child(blocked ? "Open terminal" : "Stop")))));
  }

  render(cx) {
    const t = tone(theme());
    const { space, tab, terminal } = this.target();
    const root = v_flex().id("crew-chat").size_full().text_color(t.foreground)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 4) { this.width = size.width; cx.notify(); } });
    if (terminal !== this.terminal) this.reload(cx);
    // Coming to this view shows the newest message.
    const shown = findNode(layout(), "center")?.active === "chat-view";
    if (shown && !this.shown) { this.follow = true; this.toBottom(cx); }
    this.shown = shown;
    if (this.pending) { this.pending = false; if (this.follow) this.scroll.scroll_to_bottom(); }
    if (!space || !tab) return root;
    const bot = botOf(space);

    const rows = this.rows(tab.status);
    // Earlier messages just went on top: put the message that was first back where it was.
    if (this.anchor && !this.loadingOlder) {
      const i = rows.findIndex((r) => r.key === this.anchor);
      if (i > 0) this.scroll.scroll_to_item(i, "top");
      this.anchor = null;
    }
    if (!rows.length) {
      return root.items_center().justify_center().gap(8)
        .child(div().text_size(15).text_color(t.muted).child(`Nothing in #${channelName(tab)} yet`))
        .child(div().max_w(420).text_center().text_size(12.5).text_color(t.dim)
          .child("Its conversation shows here once it's linked: when the agent starts, or after /clear."));
    }
    return root.child(h_flex().flex_1().min_h(0).w_full().justify_center()
      .child(div().id("chat-box").relative().h_full().w_full().max_w(COLUMN)
        // Scrolling up stops following the newest message (the ↓ button fades in); at the top, earlier
        // messages load. Reaching the end again follows again (in the list's range below).
        .on_scroll_wheel((e, cx) => {
          if (!(e?.delta?.y > 0)) { if (!this.follow) cx.timer.after(60, (cx) => cx.notify()); return; }
          if (this.follow) { this.follow = false; cx.notify(); }
          if (this.topSeen && this.older) this.loadOlder(cx);
        })
        .child(v_virtual_list("chat-list", rows.length, rows.map((r) => r.h), (i) => rows[i].key,
          (range) => {
            this.topSeen = range.start === 0;
            if (range.end >= rows.length) this.follow = true;
            return rows.slice(range.start, range.end).map((r) => this.row(r, t, bot));
          })
          .track_scroll(this.scroll).size_full()
          // Rows can't hold their own click handlers; the list reports which row was clicked.
          .on_item_click((key, cx) => { if (key.startsWith("t-")) { this.open.has(key) ? this.open.delete(key) : this.open.add(key); cx.notify(); } })
          // Right-click a message: copy it, or a code block in it (crew-menu).
          .on_item_secondary_click((key) => {
            const e = key.startsWith("m-") ? this.rowsVal?.find((r) => r.key === key)?.e : null;
            if (!e?.text) return;
            const codes = splitBlocks(e.text).filter((b) => b.k === "code").map((b) => b.text);
            openOverlay({ mod: "crew-menu", kind: "popup", width: 260, props: { what: "message", text: e.text, codes } });
          }))
        .child(Scrollbar.vertical("chat-list").absolute().inset_0())
        .when(Boolean(this.unmeasured?.length), (el) => el.child(this.measuring(t)))
        // A round ↓ while you read older messages: back to the newest, following again.
        .child(h_flex().absolute().bottom(12).left(0).right(0).justify_center()
          .child(div().id("chat-jump").size(34).flex().items_center().justify_center().rounded(17)
            .bg(t.background).border_1().border_color(a(t.foreground, "30")).shadow_md().text_color(t.foreground)
            .opacity(this.follow ? 0 : 1).transition("opacity", { duration: 160 })
            .when(!this.follow, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)))
            .on_click((_e, cx) => { if (this.follow) return; this.follow = true; this.toBottom(cx); cx.notify(); })
            .child(svg(`${ICONS}/arrow-down.svg`).size(15))))))
      .child(h_flex().w_full().justify_center().child(this.strip(tab, terminal, t)));
  }
}
