// Project Pals room: the center of the Project Pals layout while a room is shown (the header names it, with its
// members' faces). The room is a group chat in a centered column: your messages on the right,
// each pal's on the left in bubbles, the newest always in view. Pals post with the
// `pal-room` command; everything lands in data/crew-rooms/<room>.jsonl, which this watches.
//
// The chat is a virtual list so it can scroll to the bottom from code. Its rows need exact
// heights, so message text is wrapped here into fixed-height lines (each truncates rather than
// overflowing), which makes every row's height known before it's drawn.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, run, theme, watchFolder, appHome, shared, settings } from "herdr";
import { crew, botOf, rooms, roomMembers, readRoomLog, mascotEl, mood, statusWord, showTabs, roomMode, ROOM_DIR, a, WAVE, tone, ds, thumbFor } from "./crew.js";

const LINE = 21;      // px per text line
const PAD_Y = 8;      // bubble padding, top and bottom
const NAME = 18;      // the name row over a bot's first bubble in a run
const GAP_NEW = 14;   // space above the first message of a run
const GAP_SAME = 3;   // space between bubbles in the same run
const STAMP = 36;     // a centered time between runs far apart
const TO = 17;        // the "to Name" line under a message
const TYPING = 54;    // a "• • •" bubble while a bot is typing
const CHAR = 7.5;     // conservative average glyph width at 14px
const COLUMN = 860;   // the conversation is a centered column, not the full width

const clock = (ms) => { const d = new Date(ms), h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

// What a message says, without routing noise: a leading "@Name:" and a trailing "Done (from my side)."
function clean(text) {
  return (text ?? "")
    .replace(/^\s*(@[\w.-]+(?:#[\w.-]+)?[:,]?\s+)+/, "")
    .replace(/\s*(?:I'm\s+)?done(?: from my side| here)?[.!]?\s*$/i, "")
    .trim() || (text ?? "").trim();
}

// Word-wrap into lines of at most `max` characters (long words are split).
function wrap(text, max) {
  const out = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > max) { if (line) { out.push(line); line = ""; } out.push(word.slice(0, max)); word = word.slice(max); }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= max) line += " " + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

export default class CrewRoom extends View {
  init(_props, cx) {
    this.log = [];
    this.slug = null;
    this.width = 760;
    this.scroll = VirtualListScrollHandle.new();
    this.shown = false;       // was the room view on screen last render
    this.sent = shared("crew.room.sent") ?? null;
    this.reload(cx);
    // New lines arrive from pals (crew-room) and from the composer.
    cx.spawn(async (cx) => {
      for (;;) {
        try { await watchFolder(`${appHome()}/${ROOM_DIR}`); } catch { return; }
        this.reload(cx);
      }
    });
    cx.timer.every(4000, (cx) => this.reload(cx));
  }

  room() { return rooms(crew()).find((r) => r.id === shared("crew.room")) ?? null; }

  reload(cx) {
    const room = this.room();
    if (!room) { this.log = []; cx.notify(); return; }
    cx.spawn(async (cx) => {
      let log = [];
      try { log = await readRoomLog(room); } catch {}
      const switched = room.slug !== this.slug;
      const grew = log.length !== this.log.length;
      this.log = log;
      this.slug = room.slug;
      // A new room, or a new message: show the newest.
      if (switched || grew) this.toBottom(cx);
      cx.notify();
    });
  }

  // Scroll to the newest message once the list has drawn its rows: on the next render, and again
  // a moment later (a list that was hidden, or just grew, measures itself first).
  toBottom(cx) {
    this.pending = true;
    for (const ms of [40, 160, 400]) cx.timer.after(ms, (cx) => { this.scroll.scroll_to_bottom(); cx.notify(); });
  }

  open(m) {
    if (!m.space || !m.tab) return;
    showTabs();
    run("space.select", { id: m.space.id });
    run("tab.select", { id: m.tab.id });
  }

  // The chat as rows of known height: time stamps and messages.
  // Messages land at their `at` (crew-room schedules them after a typing delay); until then the
  // sender shows as typing. Re-render when the next one is due.
  split(cx) {
    const now = Date.now();
    const said = this.log.filter((e) => (e.at ?? 0) <= now);
    const typing = [...new Set(this.log.filter((e) => (e.at ?? 0) > now).map((e) => e.from))];
    const next = Math.min(...this.log.filter((e) => (e.at ?? 0) > now).map((e) => e.at));
    if (Number.isFinite(next) && next !== this.dueAt) {
      this.dueAt = next;
      cx.timer.after(Math.max(30, next - now + 30), (cx) => { this.dueAt = null; cx.notify(); });
    }
    if (said.length !== this.saidCount) { if (this.saidCount != null) this.toBottom(cx); this.saidCount = said.length; }
    return { said, typing };
  }

  rows(said, typing) {
    const width = Math.min(this.width, COLUMN);
    const bubbleMax = Math.max(220, Math.min(580, Math.round((width - 140) * 0.76)));
    const perLine = Math.max(16, Math.floor((bubbleMax - 28) / CHAR));
    const rows = [];
    let prev = null;
    for (const [i, e] of said.slice(-300).entries()) {
      // "Orchestrator added Docs Site": a quiet line in the middle, like a group chat's.
      if (e.kind === "event") { rows.push({ kind: "event", key: `e-${i}`, text: e.text ?? "", h: STAMP }); prev = { at: e.at, from: null }; continue; }
      const you = e.from === "You";
      const far = !prev || e.at - prev.at > 10 * 60 * 1000;
      if (far) rows.push({ kind: "stamp", key: `s-${i}`, at: e.at, h: STAMP });
      const first = far || prev.from !== e.from;
      const text = you ? (e.text ?? "") : clean(e.text);
      const lines = wrap(text, perLine);
      const to = e.kind === "handoff" ? `handed to ${(e.to ?? []).join(", ")}` : (!you && e.to?.length ? `to ${e.to.join(", ")}` : null);
      const h = (first ? GAP_NEW : GAP_SAME) + (first && !you ? NAME : 0) + PAD_Y * 2 + lines.length * LINE + (to ? TO : 0);
      rows.push({ kind: "msg", key: `m-${i}`, e, you, first, lines, to, h, bubbleMax });
      prev = e;
    }
    for (const who of typing) rows.push({ kind: "typing", key: `t-${who}`, who, h: TYPING });
    return rows;
  }

  row(r, byName, t) {
    if (r.kind === "typing") {
      const m = byName.get(r.who);
      return h_flex().h(r.h).w_full().items_end().gap(10).pt(GAP_NEW).px(28)
        .child(m ? mascotEl(m.bot, "working", 30, t) : div().size(30))
        .child(div().h(36).px(16).flex().items_center().rounded(8).bg(a(t.foreground, "0e"))
          .child(div().w(30).text_size(16).text_color(t.muted).font_family("JetBrains Mono")
            .frames(["•  ", "•• ", "•••", " ••", "  •", "   "], 180).child("•••")))
        .child(div().text_size(11.5).text_color(t.dim).child(`${r.who} is typing`));
    }
    if (r.kind === "event") {
      return h_flex().h(r.h).w_full().items_center().justify_center().px(28)
        .child(div().truncate().text_size(12).text_color(t.dim).child(r.text));
    }
    if (r.kind === "stamp") {
      return h_flex().h(r.h).w_full().items_center().justify_center()
        .child(div().text_size(11.5).text_color(t.dim).child(clock(r.at)));
    }
    const { e, you, first, lines, to } = r;
    const m = byName.get(e.from);
    const bubble = v_flex().max_w(r.bubbleMax).px(14).py(PAD_Y).rounded(8)
      .when(you, (el) => el.bg(t.accent))
      .when(!you, (el) => el.bg(a(t.foreground, e.kind === "handoff" ? "16" : "0e")))
      .children(lines.map((l) => div().h(LINE).truncate().text_size(14).line_height(1.45)
        .text_color(you ? t.accent_foreground : t.foreground).child(l || " ")));
    const toLine = to ? div().h(TO).pt(2).text_size(11.5).text_color(e.kind === "handoff" ? t.accent : t.dim).child(to) : null;

    if (you) {
      return v_flex().h(r.h).w_full().items_end().pt(first ? GAP_NEW : GAP_SAME).px(28).child(bubble);
    }
    const face = first && m ? mascotEl(m.bot, "calm", 30, t) : div().size(30);
    return h_flex().h(r.h).w_full().items_start().gap(10).pt(first ? GAP_NEW : GAP_SAME).px(28)
      .child(v_flex().w(30).flex_none().pt(first ? NAME : 0).child(face))
      .child(v_flex().min_w(0).items_start()
        .when(first, (el) => el.child(h_flex().h(NAME).items_center().gap(6)
          .child(div().text_size(12).text_color(t.muted).child(e.from))
          .when(Boolean(e.channel), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(`#${e.channel}`)))))
        .child(bubble)
        .when(Boolean(toLine), (el) => el.child(toLine)));
  }

  render(cx) {
    const t = tone(theme());
    const room = this.room();
    const root = v_flex().id("crew-room").size_full().text_color(t.foreground)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 4) { this.width = size.width; cx.notify(); } });
    if (!room) return root.items_center().justify_center().child(div().text_size(14).text_color(t.dim).child("Pick a room on the left, or make one."));
    if (room.slug !== this.slug) this.reload(cx);
    // Coming back to the room (from a pal's channel) shows the newest message.
    const shown = roomMode();
    if (shown && !this.shown) this.toBottom(cx);
    this.shown = shown;
    // You just sent something from the composer: load it now and follow it.
    const sent = shared("crew.room.sent") ?? null;
    if (sent !== this.sent) { this.sent = sent; this.reload(cx); this.toBottom(cx); }
    if (this.pending) { this.pending = false; this.scroll.scroll_to_bottom(); }

    const members = roomMembers(room, spaces(), panes());
    const { said, typing } = this.split(cx);
    const rows = this.rows(said, typing);
    // Faces for everyone who posts, members or not (the head pal drops into any room).
    const c = crew(), ps = panes();
    const byName = new Map(spaces().map((sp) => { const bot = botOf(sp, c, ps); return [bot.name, { bot }]; }));
    for (const m of members) byName.set(m.name, m);
    const chat = rows.length
      ? h_flex().flex_1().min_h(0).w_full().justify_center()
          .child(div().relative().h_full().w_full().max_w(COLUMN)
            .on_size_change((size, cx) => { const h = size.height / (Number(settings()?.zoom) || 1); if (Math.abs((this.chatView ?? 0) - h) > 1) { this.chatView = h; cx.notify(); } })
            .on_scroll_wheel((_e, cx) => cx.timer.after(60, (cx) => cx.notify()))
            .child(v_virtual_list("room-chat", rows.length, rows.map((r) => r.h), (i) => rows[i].key,
              (range) => { this.chatRange = [range.start, range.end]; return rows.slice(range.start, range.end).map((r) => this.row(r, byName, t)); })
              .track_scroll(this.scroll).size_full())
            // Our pill thumb, from the rows the list drew (Herdr's bar is a hard-cut rectangle).
            .map((el) => { const th = thumbFor(ds(t), "room-chat", { range: this.chatRange, count: rows.length, heights: rows.map((r) => r.h), view: this.chatView ?? 0, handle: this.scroll }); return th ? el.child(th) : el; }))
      : v_flex().flex_1().pt(40).gap(8).items_center()
          .child(div().text_size(18).font_weight(200).text_color(t.foreground).child("Nothing said yet"))
          .child(div().max_w(460).text_center().text_size(13).text_color(t.dim)
            .child("Say something below. It goes to everyone, or just the pals you @mention."));

    return root.child(chat);
  }
}
