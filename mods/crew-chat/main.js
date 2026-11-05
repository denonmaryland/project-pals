// Project Pals chat: a channel's conversation as a chat instead of a terminal (the center's "chat-view").
// crewd keeps a small feed per channel in data/crew-chats/<terminal>.jsonl, made from Claude
// Code's session file: your messages on the right, the pal's replies on the left (lightly
// formatted), its tool work folded into one quiet line per stretch, notes from other pals and
// Project Pals in their own bubbles. The composer still types into the terminal; the reply shows up here.
// Questions and permission prompts happen in the terminal: a card offers to open it.
//
// Rows need exact heights (a virtual list scrolls to the newest), so text is wrapped here into
// fixed-height lines, like the room view.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { spaces, panes, theme, watchFolder, appHome, readTextFile, hc, layout, notify } from "herdr";
import { botOf, mascotEl, mood, leadPane, channelName, setChatPref, a, tone } from "./crew.js";

const LINE = 21, CODE = 19, HEAD = 25, SPACER = 8;
const PAD_Y = 9, NAME = 18, GAP_NEW = 14, GAP_SAME = 4, STAMP = 36, TOOL = 28, TOOL_ITEM = 21, EVENT = 32, TYPING = 54, CARD = 74;
const CHAR = 7.5, MONO = 7.4, COLUMN = 860, KEEP = 300;

const clock = (ms) => { const d = new Date(ms), h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
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

// What a stretch of tool calls did, in a few words.
function summary(items) {
  const by = {};
  for (const x of items) (by[x.verb] ??= []).push(x.what);
  const names = (xs) => { const u = [...new Set(xs)]; return u.slice(0, 2).join(", ") + (u.length > 2 ? ` +${u.length - 2}` : ""); };
  const n = (k, one, many) => (by[k]?.length === 1 ? one : `${by[k].length} ${many}`);
  const parts = [];
  if (by.command) parts.push(`ran ${n("command", "a command", "commands")}`);
  if (by.edit) parts.push(`edited ${names(by.edit)}`);
  if (by.write) parts.push(`wrote ${names(by.write)}`);
  if (by.read) parts.push(`read ${n("read", "a file", "files")}`);
  if (by.search) parts.push(`searched ${n("search", "once", "times")}`);
  if (by.web) parts.push("looked online");
  if (by.agent) parts.push(`ran ${n("agent", "a helper", "helpers")}`);
  if (by.tool) parts.push(`used ${names(by.tool)}`);
  const s = parts.join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default class CrewChat extends View {
  init(_props, cx) {
    this.entries = [];
    this.terminal = null;
    this.size = -1;
    this.width = 760;
    this.open = new Set();     // expanded tool stretches
    this.scroll = VirtualListScrollHandle.new();
    this.shown = false;
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
      if (!switched && text.length === this.size) return;
      const all = text.split("\n").filter(Boolean);
      // The feed only grows: keep the messages already read (and their layout), parse just the new ones.
      const start = Math.max(0, all.length - KEEP);
      const prev = switched || text.length < this.size ? new Map() : this.byLine ?? new Map();   // shrank: a new session
      const byLine = new Map();
      const entries = [];
      for (let n = start; n < all.length; n++) {
        let e = prev.get(n);
        if (!e) { try { e = JSON.parse(all[n]); } catch { e = null; } }
        if (e) { byLine.set(n, e); entries.push(e); }
      }
      this.byLine = byLine;
      this.entries = entries;
      this.version = (this.version ?? 0) + 1;
      this.older = Math.max(0, all.length - KEEP);
      this.terminal = terminal;
      this.size = text.length;
      if (switched) this.open.clear();
      this.toBottom(cx);
      cx.notify();
    });
  }

  toBottom(cx) {
    this.pending = true;
    for (const ms of [40, 160, 400]) cx.timer.after(ms, (cx) => { this.scroll.scroll_to_bottom(); cx.notify(); });
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
    const rows = [];
    if (this.older) rows.push({ kind: "event", key: "older", text: `${this.older} earlier messages are in the terminal`, h: EVENT });
    let prev = null;
    const es = this.entries;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const far = !prev || e.at - prev.at > 10 * 60 * 1000;
      if (far && e.kind !== "tool") rows.push({ kind: "stamp", key: `s-${i}`, at: e.at, h: STAMP });
      if (e.kind === "tool") {
        // Fold the whole stretch of tool calls into one line.
        const items = [];
        while (i < es.length && es[i].kind === "tool") items.push(es[i++]);
        i--;
        const key = `t-${items[0].at}-${items[0].what}`;
        const open = this.open.has(key);
        rows.push({ kind: "tools", key, items, open, h: GAP_SAME + TOOL + (open ? items.length * TOOL_ITEM + 6 : 0) });
        prev = { ...items[items.length - 1], kind: "bot" };
        continue;
      }
      if (e.kind === "event") { rows.push({ kind: "event", key: `e-${i}`, text: e.text, h: EVENT }); prev = e; continue; }
      const you = e.kind === "you";
      const first = far || !prev || prev.kind !== e.kind || (e.kind === "note" && prev.from !== e.from);
      const max = you ? youMax : botMax;
      // Each message is laid out once per width (entries keep it until the feed is re-read).
      if (!e._ls || e._lw !== max) {
        e._ls = you || e.kind === "note" ? lines(e.text, per(max), perCode).map((l) => (l.k === "head" ? { ...l, k: "text", indent: 0 } : l)) : lines(e.text, per(max), perCode);
        e._lw = max;
      }
      const ls = e._ls;
      const label = e.kind === "note" ? e.from : null;
      const h = (first ? GAP_NEW : GAP_SAME) + (label && first ? NAME : 0) + PAD_Y * 2 + height(ls) + (e.images ? LINE : 0);
      rows.push({ kind: e.kind, key: `m-${i}`, e, you, first, label, ls, max, h });
      prev = e;
    }
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
    if (r.kind === "stamp") return h_flex().h(r.h).w_full().items_center().justify_center().child(div().text_size(11.5).text_color(t.dim).child(clock(r.at)));
    if (r.kind === "event") return h_flex().h(r.h).w_full().items_center().justify_center().px(28).child(div().truncate().text_size(12).text_color(t.dim).child(r.text));
    if (r.kind === "tools") {
      return v_flex().h(r.h).w_full().pt(GAP_SAME).pl(68).pr(28).cursor_pointer()
        .child(h_flex().h(TOOL).items_center().gap(7)
          .child(svg(`mods/crew-roster/icons/${r.open ? "chevron-down" : "chevron-right"}.svg`).size(10).text_color(t.dim))
          .child(div().truncate().text_size(12.5).text_color(t.dim).child(summary(r.items))))
        .when(r.open, (el) => el.child(v_flex().pl(17).pt(2).children(r.items.map((x) =>
          div().h(TOOL_ITEM).truncate().text_size(12).font_family("JetBrains Mono").text_color(t.dim).child(`${x.verb} ${x.what}`)))));
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
    if (shown && !this.shown) this.toBottom(cx);
    this.shown = shown;
    if (this.pending) { this.pending = false; this.scroll.scroll_to_bottom(); }
    if (!space || !tab) return root;
    const bot = botOf(space);

    const rows = this.rows(tab.status);
    if (!rows.length) {
      return root.items_center().justify_center().gap(8)
        .child(div().text_size(15).text_color(t.muted).child(`Nothing in #${channelName(tab)} yet`))
        .child(div().max_w(420).text_center().text_size(12.5).text_color(t.dim)
          .child("Its conversation shows here once it's linked: when the agent starts, or after /clear."));
    }
    return root.child(h_flex().flex_1().min_h(0).w_full().justify_center()
      .child(div().relative().h_full().w_full().max_w(COLUMN)
        .child(v_virtual_list("chat-list", rows.length, rows.map((r) => r.h), (i) => rows[i].key,
          (range) => rows.slice(range.start, range.end).map((r) => this.row(r, t, bot)))
          .track_scroll(this.scroll).size_full()
          // Rows can't hold their own click handlers; the list reports which row was clicked.
          .on_item_click((key, cx) => { if (key.startsWith("t-")) { this.open.has(key) ? this.open.delete(key) : this.open.add(key); cx.notify(); } }))
        .child(Scrollbar.vertical("chat-list").absolute().inset_0())))
      .child(h_flex().w_full().justify_center().child(this.strip(tab, terminal, t)));
  }
}
