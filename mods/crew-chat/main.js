// Project Pals chat: a channel's conversation as a chat instead of a terminal (the center's "chat-view").
// crewd keeps a small feed per channel in data/crew-chats/<terminal>.jsonl, made from Claude
// Code's session file: your messages on the right, the pal's replies on the left (lightly
// formatted), its tool work folded into chips per stretch, notes from other pals and
// Project Pals in their own bubbles. The composer still types into the terminal; the reply shows up here.
// Questions and permission prompts happen in the terminal: a card offers to open it.
//
// Rows need exact heights (a virtual list scrolls to the newest), so text is wrapped here into
// fixed-height lines, like the room view.
//
// Reading behaviour after flockbook's chat (github.com/minchenlee/flockbook, MIT, (c) 2026 Min-Chen
// Lee): it follows the newest message only until you scroll up, then a down-arrow button brings you
// back; tool calls are chips that show running, done or failed; each finished turn gets a footer
// ("3:41 PM · Worked 36s · 3 tools"); scrolling to the top reads earlier messages in place.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { spaces, panes, theme, watchFolder, appHome, readTextFile, hc, layout, notify } from "herdr";
import { botOf, mascotEl, mood, leadPane, channelName, setChatPref, a, tone } from "./crew.js";

const LINE = 21, CODE = 19, HEAD = 25, SPACER = 8;
const PAD_Y = 9, NAME = 18, GAP_NEW = 14, GAP_SAME = 4, STAMP = 36, EVENT = 32, TYPING = 54, CARD = 74;
const CHIP = 28, CHIP_GAP = 6, CALL = 24, CALL_OUT = 20, FOOTER = 24;
const CHAR = 7.5, MONO = 7.4, COLUMN = 860, KEEP = 300;

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

// Inline markdown → styled pieces: **bold**, `code`, [links](…), *italic*. Everything else is plain.
function spans(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\([^)]+\)|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])/g;
  let at = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push({ t: text.slice(at, m.index) });
    if (m[1] ?? m[2]) out.push({ t: m[1] ?? m[2], b: true });
    else if (m[3]) out.push({ t: m[3], c: true });
    else if (m[4]) out.push({ t: m[4], l: true });
    else if (m[5]) out.push({ t: m[5], i: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out;
}

// Wrap styled pieces into lines of about `max` characters, keeping each word's style.
function wrapSpans(pieces, max) {
  const words = [];
  for (const p of pieces) {
    const parts = p.t.split(/(\s+)/);
    for (const w of parts) {
      if (!w) continue;
      if (/^\s+$/.test(w)) { if (words.length) words[words.length - 1].space = true; continue; }
      words.push({ ...p, t: w, space: false });
    }
  }
  const lines = [];
  let line = [], len = 0;
  const width = (w) => w.t.length * (w.c ? 1.1 : w.b ? 1.06 : 1);
  for (let w of words) {
    while (width(w) > max) {           // a word longer than a line: split it
      if (line.length) { lines.push(line); line = []; len = 0; }
      const cut = Math.max(1, Math.floor(max / (width(w) / w.t.length)));
      lines.push([{ ...w, t: w.t.slice(0, cut), space: false }]);
      w = { ...w, t: w.t.slice(cut) };
    }
    const need = (line.length && line[line.length - 1].space ? 1 : 0) + width(w);
    if (line.length && len + need > max) { lines.push(line); line = []; len = 0; }
    len += (line.length && line[line.length - 1].space ? 1 : 0) + width(w);
    line.push(w);
  }
  if (line.length) lines.push(line);
  // Merge neighbouring words of the same style into one piece (spaces kept inside).
  return (lines.length ? lines : [[{ t: "" }]]).map((ws) => {
    const merged = [];
    const add = (t, st) => {
      const last = merged[merged.length - 1];
      if (last && last.b === st.b && last.c === st.c && last.l === st.l && last.i === st.i) last.t += t;
      else merged.push({ t, b: st.b, c: st.c, l: st.l, i: st.i });
    };
    ws.forEach((w, n) => {
      const next = ws[n + 1];
      const space = w.space && n < ws.length - 1;
      // A space between two code words stays in the code; otherwise it's plain (no code background on it).
      if (w.c && !(space && next?.c)) { add(w.t, w); if (space) add(" ", {}); }
      else add(w.t + (space ? " " : ""), w);
    });
    return merged;
  });
}

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}

const BULLET_W = 16, INDENT = 16;

// A message's markdown → display lines: text (styled, wrapped, with hanging indents for list
// items), headings, quotes, code (one line each), and gaps between paragraphs.
function lines(text, per, perCode) {
  const out = [];
  let code = false;
  for (const raw of text.split("\n")) {
    if (/^\s*```/.test(raw)) { code = !code; continue; }
    if (code) { out.push({ k: "code", s: raw.replace(/\t/g, "  ").slice(0, perCode) || " " }); continue; }
    const l = raw.replace(/\t/g, "  ").trimEnd();
    if (/^\s*\|?\s*:?-{3,}[-:|\s]*$/.test(l)) continue;      // a table's divider line
    if (!l.trim()) { if (out.length && out[out.length - 1].k !== "gap") out.push({ k: "gap" }); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push({ k: "gap" }); continue; }
    const h = l.match(/^#{1,6}\s+(.*)/);
    if (h) {
      if (out.length && out[out.length - 1].k !== "gap") out.push({ k: "gap" });
      for (const segs of wrapSpans(spans(h[1]), Math.floor(per * 0.9))) out.push({ k: "head", segs });
      continue;
    }
    const q = l.match(/^\s*>\s?(.*)/);
    if (q) { for (const segs of wrapSpans(spans(q[1]), per - 3)) out.push({ k: "quote", segs }); continue; }
    const item = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)/);
    if (item) {
      const level = Math.min(3, Math.floor(item[1].length / 2));
      const mark = /\d/.test(item[2]) ? item[2].replace(")", ".") : "•";
      const indent = level * INDENT;
      const room = per - Math.ceil((indent + BULLET_W + (mark.length > 1 ? 6 : 0)) / CHAR);
      wrapSpans(spans(item[3]), room).forEach((segs, n) => out.push({ k: "text", segs, indent, mark: n === 0 ? mark : null, hang: true, wide: mark.length > 1 }));
      continue;
    }
    for (const segs of wrapSpans(spans(l.trim()), per)) out.push({ k: "text", segs, indent: 0 });
  }
  while (out.length && out[out.length - 1].k === "gap") out.pop();
  while (out.length && out[0].k === "gap") out.shift();
  return out.length ? out : [{ k: "text", segs: [{ t: "" }], indent: 0 }];
}
const height = (ls) => ls.reduce((n, l) => n + (l.k === "code" ? CODE : l.k === "head" ? HEAD : l.k === "gap" ? SPACER : LINE), 0);

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
    const key = `${this.version}|${Math.round(Math.min(this.width, COLUMN))}|${status}|${[...this.open].join(",")}`;
    if (key === this.rowsKey) return this.rowsVal;
    this.rowsKey = key;
    this.rowsVal = this.layout(status);
    return this.rowsVal;
  }

  layout(status) {
    const width = Math.min(this.width, COLUMN);
    const botMax = Math.max(260, Math.min(680, Math.round(width - 120)));
    const youMax = Math.max(220, Math.min(540, Math.round((width - 120) * 0.72)));
    const per = (max) => Math.max(16, Math.floor((max - 28) / CHAR));
    const perCode = Math.max(20, Math.floor((botMax - 40) / MONO));
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
      // Each message is laid out once per width (entries keep it until the feed is re-read).
      if (!e._ls || e._lw !== max) {
        e._ls = you || e.kind === "note" ? lines(e.text ?? "", per(max), perCode).map((l) => (l.k === "head" ? { ...l, k: "text", indent: 0 } : l)) : lines(e.text ?? "", per(max), perCode);
        e._lw = max;
      }
      const ls = e._ls;
      const label = e.kind === "note" ? e.from : null;
      const h = (first ? GAP_NEW : GAP_SAME) + (label && first ? NAME : 0) + PAD_Y * 2 + height(ls) + (e.images ? LINE : 0);
      rows.push({ kind: e.kind, key: `m-${e._n}`, e, you, first, label, ls, max, h });
      prev = e;
    }
    // The last turn gets its footer once the pal is done with it.
    if (!busy) endTurn(prev);
    if (status === "working") rows.push({ kind: "typing", key: "typing", h: TYPING });
    if (status === "blocked") rows.push({ kind: "blocked", key: "blocked", h: CARD });
    return rows;
  }

  // One display line: styled pieces in a row, with a bullet column for list items.
  line(l, t, you) {
    const color = you ? t.accent_foreground : t.foreground;
    if (l.k === "gap") return div().h(SPACER);
    if (l.k === "code") return div().h(CODE).px(10).truncate().bg(a(you ? t.accent_foreground : t.foreground, "0c"))
      .text_size(12.5).font_family("JetBrains Mono").text_color(color).child(l.s || " ");
    const piece = (sg, size) => {
      let el = div().flex_none().text_size(size).text_color(sg.l ? (you ? color : t.accent) : color).child(sg.t);
      if (sg.b) el = el.font_medium();
      if (sg.i) el = el.italic();
      if (sg.c) el = el.font_family("JetBrains Mono").text_size(size - 1.5).px(4).rounded(5).bg(a(you ? t.accent_foreground : t.foreground, "14"));
      return el;
    };
    if (l.k === "head") {
      return h_flex().h(HEAD).items_end().pb(3).overflow_hidden().children(l.segs.map((sg) => piece({ ...sg, b: true }, 15)));
    }
    const row = h_flex().h(LINE).items_center().overflow_hidden();
    if (l.k === "quote") return row.child(div().w(3).h(16).mr(9).rounded_full().bg(a(color, "44")))
      .children(l.segs.map((sg) => piece(sg, 14).text_color(you ? color : t.muted)));
    if (l.hang) {
      const w = BULLET_W + (l.wide ? 6 : 0);
      row.pl(l.indent).child(div().w(w).flex_none().text_size(14).text_color(you ? color : t.dim).child(l.mark ?? ""));
    }
    return row.children(l.segs.map((sg) => piece(sg, 14)));
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
    const { e, you, first, label, ls, max } = r;
    const note = r.kind === "note";
    const bubble = v_flex().max_w(max).px(14).py(PAD_Y).rounded(18)
      .when(you, (el) => el.bg(t.accent))
      .when(note, (el) => el.bg(a(t.foreground, "07")).border_1().border_color(a(t.foreground, "12")))
      .when(!you && !note, (el) => el.bg(a(t.foreground, "0e")))
      .children(ls.map((l) => this.line(l, t, you)))
      .when(Boolean(e.images), (el) => el.child(div().h(LINE).text_size(12.5).text_color(you ? t.accent_foreground : t.dim).child(`${e.images} image${e.images > 1 ? "s" : ""}`)));
    if (you) return v_flex().h(r.h).w_full().items_end().pt(first ? GAP_NEW : GAP_SAME).px(28).child(bubble);
    const face = first && !note ? mascotEl(bot, "calm", 30, t) : div().size(30);
    return h_flex().h(r.h).w_full().items_start().gap(10).pt(first ? GAP_NEW : GAP_SAME).px(28)
      .child(v_flex().w(30).flex_none().pt(label && first ? NAME : 0).child(face))
      .child(v_flex().min_w(0).items_start()
        .when(Boolean(label) && first, (el) => el.child(h_flex().h(NAME).items_center().child(div().text_size(12).text_color(t.dim).child(`from ${label}`))))
        .child(bubble));
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
          .on_item_click((key, cx) => { if (key.startsWith("t-")) { this.open.has(key) ? this.open.delete(key) : this.open.add(key); cx.notify(); } }))
        .child(Scrollbar.vertical("chat-list").absolute().inset_0())
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
