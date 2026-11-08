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
import { spaces, panes, terminals, theme, settings, shared, setShared, exec, home, watchFolder, appHome, readTextFile, hc, layout, notify, openOverlay } from "herdr";
import { botOf, mascotEl, mood, leadPane, channelName, setChatPref, tone, ds, layoutMode, owner } from "./crew.js";

const LINE = 21;
const EVENT = 32, KEEP = 300, MEASURE = 24, EDGE = 2;
// The two boards' chat. Focus ("MODE · Focus (default)"): a 720 px column, 32 px in, groups 28 px
// apart, the pet 36x28 (12 px to the text), #161617 bubbles 9/12 padded, 14/22 text, quiet centred
// stamps. Pro ("MODE · Pro"): fluid, 24 px in, groups 16 px apart, the pet 31x24 (10 px), a name
// line (13/500 name, 12 px time, "· worked 6m"), #131314 bubbles 6/10 padded, 14/21 text, hairline
// day dividers, notes from other pals as bare text, and the tool log as a card. Older than today:
// dimmer text (and in Focus a half-faded pet). Bubble A for yours in both.
const MODE = {
  focus: { col: 720, px: 32, py: 24, gap: 28, same: 3, face: 36, faceGap: 12, padX: 12, padY: 9, line: 22, name: 0 },
  pro: { col: 0, px: 24, py: 16, gap: 16, same: 2, face: 31, faceGap: 10, padX: 10, padY: 6, line: 21, name: 18 },
};

const ICONS = "mods/crew-chat/icons", ROSTER = "mods/crew-roster/icons";
const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const dayWord = (ms) => {
  const d = new Date(ms), today = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(today) - day(d)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
};
// Focus stamps read "Today 21:48"; Pro dividers say the day where the day changes, else the time;
// an older group's name line says "Yesterday 23:46".
function stampLabel(ms, mode) {
  if (mode === "focus" || mode === "pro-old") return `${dayWord(ms)} ${clock(ms)}`;
  return clock(ms);
}
// Claude Code stores pasted text inside <pasted_content id="…">…</pasted_content id="…"> in its
// session file; the chat shows just the text.
// on_size_change reports window pixels (after Herdr's zoom); heights and widths given to elements
// are design pixels (zoom scales them). Measured sizes are turned back into design pixels, so the
// rows fit at any zoom. (Inferred from rows overlapping at zoom 0.68 and not at 1; check live.)
const zoom = () => Number(settings().zoom) || 1;
// A message relayed from another pal ("[pal] Orca #general finished …", "[from Orca, a pal, not
// DeNon] …") is a note from that pal, not something you wrote: its sender, or null.
function relayFrom(text) {
  let m = /^\[pal\]\s+(.+?#[\w.-]+)/.exec(text);
  if (m) return m[1];
  m = /^\[from ([^,\]]+?)(?:,[^\]]*)?\]/.exec(text);
  if (m && !/^you$/i.test(m[1])) return m[1].trim();
  m = /^\[pal\]\s+(\S+)/.exec(text);
  return m ? m[1] : null;
}
// One line of a note for its folded chip: the first line with words, without the "[pal] Orca" lead.
const firstLine = (text) => (String(text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "")
  .replace(/^\[pal\]\s+\S+(\s+#[\w.-]+)?\s*/, "").replace(/^\[from [^\]]*\]\s*/, "").replace(/[`*_]/g, "");
const PAL = `${home()}/.local/bin/pal`;
const unwrap = (text) => text.replace(/<\/?pasted_content(?:\s+id="[^"]*")?\s*>\n?/g, "").trim();
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const worked = (ms) => { const s = Math.round(ms / 1000); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}

// A stretch of tool calls as the tool log's rows: one per tool, in the order first used, with how
// many times it ran, what the last call was on, and its state (running if any still runs, failed
// if any failed, else done).
const VERB = { command: "Bash", edit: "Edit", write: "Write", read: "Read", search: "Search", web: "Web", agent: "Agent" };
function toolRows(items) {
  const by = new Map();
  for (const x of items) {
    const name = (x.name || VERB[x.verb] || "Tool").replace(/^mcp__(.*?)__/, "$1.");
    if (!by.has(name)) by.set(name, []);
    by.get(name).push(x);
  }
  return [...by].map(([name, xs]) => {
    const last = xs[xs.length - 1];
    const failed = xs.filter((x) => x.state === "failed").length;
    return { name, n: xs.length, what: last.what && last.what !== last.name ? last.what : null, failed,
      state: xs.some((x) => x.state === "running") ? "running" : failed ? "failed" : xs.every((x) => x.state === "done") ? "done" : "unknown" };
  });
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
    // What the agent asks on screen (a permission or a question), read while it's blocked, as a card
    // over the composer that answers it here instead of in the terminal (bin/crewprompt.py).
    this.prompt = null;        // the parsed prompt, for this.promptFor
    this.promptNote = null;    // { text, error } under the card after an answer
    this.openNotes = new Set();
    cx.timer.every(1200, (cx) => this.pollPrompt(cx));
  }

  target() {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    const lead = tab ? leadPane(tab.id, panes()) : null;
    return { space, tab, terminal: lead?.terminal ?? null };
  }

  pollPrompt(cx) {
    const { tab, terminal } = this.target();
    const blocked = tab?.status === "blocked" && terminal;
    if (!blocked) {
      if (this.prompt || this.promptNote) { this.prompt = null; this.promptNote = null; this.publishPrompt(null); cx.notify(); }
      return;
    }
    if (this.promptBusy) return;
    this.promptBusy = true;
    cx.spawn(async (cx) => {
      let p = null;
      try { const r = await exec(PAL, ["prompt", terminal]); p = JSON.parse(r.stdout || "null"); } catch { p = null; }
      this.promptBusy = false;
      if (p && p.terminal !== this.target().terminal) return;
      const before = this.prompt?.request ?? null;
      if ((p?.request ?? null) !== before) { this.promptNote = null; }
      if (JSON.stringify(p) !== JSON.stringify(this.prompt)) { this.prompt = p; this.publishPrompt(p); cx.notify(); }
    });
  }

  // The composer types into a question's "Type something." option while one shows.
  publishPrompt(p) {
    const type = p?.kind === "question" ? p.options.find((o) => o.type) : null;
    const v = p ? { terminal: p.terminal, request: p.request, kind: p.kind, type: type?.n ?? null } : null;
    if (JSON.stringify(shared("crew.prompt") ?? null) !== JSON.stringify(v)) setShared("crew.prompt", v);
  }

  answer(n, cx) {
    const p = this.prompt;
    if (!p || this.answering) return;
    this.answering = true;
    this.promptNote = { text: "Sending…" };
    cx.notify();
    cx.spawn(async (cx) => {
      let out = null;
      try { const r = await exec(PAL, ["prompt", p.terminal, "--answer", String(n), "--request", p.request]); out = JSON.parse(r.stdout || "null"); }
      catch (e) { out = { result: "failed", message: String(e?.message ?? e) }; }
      this.answering = false;
      if (out?.result === "sent") this.promptNote = { text: "Answer sent. Waiting for the agent." };
      else if (out?.result === "changed") { this.promptNote = { text: out.message, error: true }; this.prompt = null; }
      else this.promptNote = { text: out?.message || "That didn't go through. Try again, or answer in the terminal.", error: true };
      cx.notify();
      this.pollPrompt(cx);
    });
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
        if (!e) { try { e = JSON.parse(all[n]); e._n = n; if (typeof e.text === "string") e.text = unwrap(e.text);
          if (e.kind === "you") {
            // herdr-core's own note for another terminal: <hc from="t2 name">…</hc>.
            const hcm = /^<hc from="([^"]*)">([\s\S]*)<\/hc>\s*$/.exec(e.text ?? "");
            if (hcm) { const who = hcm[1].split(/\s+/); e.kind = "note"; e.from = who.slice(1).join(" ") || who[0] || "a terminal"; e.text = hcm[2].trim(); }
            else { const from = relayFrom(e.text ?? ""); if (from && from !== owner()) { e.kind = "note"; e.from = from; } }
          } } catch { e = null; } }
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
    const o = shared("crew.outbox");
    const key = `${this.version}|${this.mver}|${Math.round(this.width)}|${status}|${layoutMode()}|${settings().zoom ?? 1}|${new Date().toDateString()}|${o ? `${o.at}:${o.state}` : ""}`;
    if (key === this.rowsKey) return this.rowsVal;
    const look = `${layoutMode()}|${settings().zoom ?? 1}`;
    if (look !== this.look) { this.look = look; this.natural.clear(); }
    this.rowsKey = key;
    this.rowsVal = this.layout(status);
    return this.rowsVal;
  }

  // Rows for the virtual list, with exact heights. A group is a run of messages from one speaker
  // with no gap of 10+ minutes; its first row carries the pet (and, in Pro, the name line).
  layout(status) {
    const M = MODE[layoutMode()];
    const width = Math.max(320, (M.col ? Math.min(this.width, M.col + 2 * M.px) : this.width) - 2 * M.px);
    const inner = width - M.face - M.faceGap;
    const botMax = Math.max(220, inner - 2 * M.padX);
    const youMax = Math.max(200, Math.min(560, Math.round(width * 0.72)) - 2 * M.padX - EDGE);
    const unmeasured = [];
    const busy = status === "working" || status === "blocked";
    const today = new Date().toDateString();
    const rows = [{ kind: "space", key: "top", h: M.py }];
    if (this.older) rows.push({ kind: "event", key: "older", text: this.loadingOlder ? "Loading earlier messages…" : "Scroll up for earlier messages", h: EVENT });
    let prev = null;
    // A turn: from your message (or a note to the pal) to the next. Its first reply row learns how
    // long the pal worked once the turn ends ("21:48 · worked 6m" in Pro).
    let turn = null;
    const endTurn = (last) => {
      if (turn?.first && last && last.at - turn.at >= 1000) turn.first.worked = last.at - turn.at;
      turn = null;
    };
    const es = this.entries;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.kind === "you" || e.kind === "note") { endTurn(prev); turn = { at: e.at, first: null }; }
      const dayChange = prev && !sameDay(e.at, prev.at);
      const far = !prev || e.at - prev.at > 10 * 60 * 1000 || dayChange;
      if (far && prev) rows.push({ kind: "stamp", key: `s-${e._n}`, at: e.at, day: dayChange, h: M.gap + 14 });
      const old = new Date(e.at).toDateString() !== today;
      if (e.kind === "tool") {
        const items = [];
        while (i < es.length && es[i].kind === "tool") {
          const x = es[i++];
          const r = x.id ? this.results.get(x.id) : null;
          items.push({ ...x, state: r ? (r.error ? "failed" : "done") : x.id && busy ? "running" : x.id ? "stopped" : "unknown", out: r?.out ?? "" });
        }
        i--;
        const groups = toolRows(items);
        const h = M.name ? 4 + groups.length * 26 + 2 : 4 + 22;
        rows.push({ kind: "tools", key: `t-${items[0]._n}`, items, groups, h: M.same + h });
        prev = { ...es[i], kind: "bot" };
        continue;
      }
      if (e.kind === "event") { rows.push({ kind: "event", key: `e-${e._n}`, text: e.text, h: EVENT }); prev = e; continue; }
      const you = e.kind === "you";
      const note = e.kind === "note";
      const first = far || !prev || prev.kind !== e.kind || (note && prev.from !== e.from);
      // A note from another pal folds to one line ("↳ Orca: …"); a click opens it.
      const noteKey = `m-${e._n}`;
      if (note && !this.openNotes.has(noteKey)) {
        rows.push({ kind: "note", key: noteKey, e, folded: true, h: (first ? M.gap : M.same) + 28 });
        prev = e;
        continue;
      }
      const max = you ? youMax : botMax;
      const text = e.text ?? "";
      let tw = max;
      if (plain(text)) {
        const nat = this.natural.get(e._n);
        if (nat == null) unmeasured.push({ key: `${e._n}`, text, you, natural: true });
        const w = nat ?? Math.ceil(lineWidth(text.trim()) * 1.06 + 12);
        if (w < tw) tw = Math.max(16, Math.ceil(w) + 1);
      }
      // Heights are per width, mode (line height) and zoom, so a switch never reuses a wrong one.
      const mkey = `${e._n}|${tw}|${layoutMode()}|${settings().zoom ?? 1}`;
      let th = this.measured.get(mkey);
      if (th == null) {
        if (!e._est || e._est.w !== tw) e._est = { w: tw, h: markdownHeight(text, tw) };
        th = e._est.h;
        unmeasured.push({ key: mkey, text, tw, you });
      }
      // Pro: a note from another pal is plain text under its name, no bubble.
      const bare = note && Boolean(M.name);
      const nameLine = !you && !note && first && M.name ? M.name : 0;
      const h = (first ? M.gap : M.same) + nameLine + (note ? 28 + 4 : 0) + (bare ? 0 : M.padY * 2) + th + (e.images ? LINE : 0);
      const row = { kind: e.kind, key: `m-${e._n}`, e, you, first, tw, h, old, bare, label: note ? e.from : null };
      if (!you && !note && turn && !turn.first && first) turn.first = row;
      rows.push(row);
      prev = e;
    }
    if (!busy) endTurn(prev);
    this.unmeasured = unmeasured;
    // Your message the moment you send it (crew-composer's "crew.outbox"), until the feed has it.
    const out = this.outbox(es);
    if (out) {
      const text = out.text, tw0 = Math.min(youMax, Math.ceil(lineWidth(text.split("\n")[0]) * 1.06 + 13));
      const th = markdownHeight(text, Math.max(16, tw0));
      rows.push({ kind: "you", key: `out-${out.at}`, e: { text, at: out.at, _n: `out-${out.at}` }, you: true, first: true, tw: Math.max(16, tw0),
        pending: out, h: M.gap + M.padY * 2 + th + 18 });
    }
    if (status === "working") rows.push({ kind: "typing", key: "typing", h: M.same + 4 + 16 });
    rows.push({ kind: "space", key: "bottom", h: M.py });
    return rows;
  }

  // The message just sent, while the feed doesn't have it yet (and for a minute at most).
  outbox(es) {
    const o = shared("crew.outbox");
    if (!o || o.terminal !== this.terminal || Date.now() - o.at > 60000) return null;
    const head = String(o.text).trim().slice(0, 40);
    const seen = es.some((x) => x.kind === "you" && x.at >= o.at - 5000 && String(x.text ?? "").trim().startsWith(head));
    return seen ? null : o;
  }

  row(r, t, bot, mood_) {
    const d = ds(t);
    const mode = layoutMode(), M = MODE[mode];
    const IN = M.face + M.faceGap;
    const wrap = (el) => el.w_full().px(M.px);
    if (r.kind === "space") return div().h(r.h).w_full();
    if (r.kind === "stamp") {
      // Focus: a quiet centred time. Pro: a hairline divider with the day (or time) in it.
      const label = mode === "focus" ? stampLabel(r.at, "focus") : r.day ? dayWord(r.at) : clock(r.at);
      if (!M.name) return wrap(h_flex().h(r.h).items_end().justify_center())
        .child(div().h(14).text_size(11).line_height("14px").text_color(d.fg4).child(label));
      return wrap(h_flex().h(r.h).items_end())
        .child(h_flex().h(14).w_full().items_center().gap(12)
          .child(div().flex_1().h(1).bg(d.line))
          .child(div().text_size(11).line_height("14px").when(Boolean(r.day), (el) => el.font_weight(500)).text_color(r.day ? d.fg3 : d.fg4).child(label))
          .child(div().flex_1().h(1).bg(d.line)));
    }
    if (r.kind === "event") return wrap(h_flex().h(r.h).items_center().justify_center()).child(div().truncate().text_size(12).text_color(d.fg3).child(r.text));
    if (r.kind === "tools") {
      const mark = (state, size) => state === "failed" ? svg(`${ROSTER}/x.svg`).size(size).flex_none().text_color(d.err)
        : state === "done" ? svg(`${ROSTER}/ds-check.svg`).size(size).flex_none().text_color(d.ok)
        : div().size(size).flex_none().rounded(size / 2).bg(d.lineStrong);
      const ring = (size) => svg(`${ROSTER}/spinner.svg`).size(size).flex_none().text_color(d.info).spin(900);
      if (!M.name) {
        // Focus: the stretch as one chip: its last call, "+N" for the rest.
        const g = r.groups[r.groups.length - 1];
        const more = r.items.length - 1;
        return wrap(h_flex().h(r.h).items_end().pl(M.px + IN))
          .child(h_flex().h(22).min_w(0).items_center().gap(6).px(6).rounded(d.r.xs).border_1().border_color(d.line)
            .child(g.state === "running" ? ring(10) : mark(g.state, 10))
            .child(div().min_w(0).truncate().text_size(11).font_family(d.mono).text_color(d.fg2)
              .child(`${g.name}${g.what ? ` · ${g.what}` : ""}${more > 0 ? `  +${more}` : ""}`)));
      }
      // Pro: the tool log, one 26 px row per tool: ✓ / spinner / ✕, its name, what, and a count.
      return wrap(v_flex().h(r.h).justify_end().pl(M.px + IN))
        .child(v_flex().w_full().mt(4).rounded(d.r.sm).border_1().border_color(d.line).overflow_hidden()
          .children(r.groups.map((g, i) => h_flex().h(26).flex_none().items_center().gap(8).px(8)
            .when(i < r.groups.length - 1, (el) => el.border_b_1().border_color(d.lineSoft))
            .child(g.state === "running" ? ring(11) : mark(g.state, 11))
            .child(div().flex_none().max_w(260).truncate().text_size(11).font_family(d.mono).text_color(d.body).child(g.name))
            .child(div().flex_1().min_w(0).truncate().text_size(11).font_family(d.mono).text_color(d.fg4).child(g.what ?? ""))
            .child(div().flex_none().text_size(11).line_height("14px")
              .text_color(g.state === "failed" ? d.err : d.fg4)
              .child(g.state === "running" ? "running" : g.state === "failed" ? `${g.failed} failed` : g.n > 1 ? `${g.n}×` : "")))));
    }
    if (r.kind === "typing") {
      const sq = (o) => div().size(4).flex_none().bg(d.info).opacity(o);
      return wrap(h_flex().h(r.h).items_end().pl(M.px + IN))
        .child(h_flex().h(16).items_center().gap(8).px(2)
          .child(h_flex().gap(3).loop("opacity", { from: 0.45, to: 1, period: 900 }).child(sq(1)).child(sq(0.6)).child(sq(0.3)))
          .child(div().min_w(0).truncate().text_size(12).line_height("16px").text_color(d.fg3).child(this.doing(bot, M))));
    }
    if (r.kind === "blocked") {
      return wrap(h_flex().h(r.h).items_end().gap(M.faceGap))
        .child(mascotEl(bot, "blocked", M.face, t))
        .child(h_flex().h(40).items_center().gap(10).px(12).rounded(d.r.sm).bg(d.warn + "1F").border_1().border_color(d.warn + "47")
          .child(div().text_size(13).text_color(d.body).child("It's asking you something in the terminal"))
          .child(div().id("chat-open-term").h(24).px(8).flex().items_center().rounded(d.r.xs).bg(d.ctl).cursor_pointer()
            .hover((s) => s.bg(d.lineStrong)).on_click(() => setChatPref(this.tabId, false))
            .child(div().text_size(12).font_weight(500).text_color(d.fg1).child("Open terminal"))));
    }
    if (r.folded) return wrap(h_flex().h(r.h).items_end().pl(M.px + IN)).child(this.noteChip(r, d, false));
    const { e, you, first, tw, old, bare } = r;
    const textColor = you ? (old ? d.body : d.fg1) : old ? d.fg2 : d.body;
    const content = v_flex().text_size(14).line_height(`${M.line}px`).text_color(textColor)
      .child(markdownView(`md-${r.key}`, e.text ?? "", textColor, tw))
      .when(Boolean(e.images), (el) => el.child(div().h(LINE).text_size(12.5).text_color(d.fg3).child(`${e.images} image${e.images > 1 ? "s" : ""}`)));
    // Bubble A: yours an r4 slab in your colour with a 2 px edge of it; the pal's replies r4 rectangles.
    const bubble = bare ? content.w(tw) : content.w(tw + 2 * M.padX + (you ? EDGE : 0)).flex_none().px(M.padX).py(M.padY).rounded(d.r.sm)
      .when(you, (el) => el.bg(old ? d.meOld : d.me).border_r(EDGE).border_color(d.meEdge))
      .when(!you, (el) => el.bg(old || M.name ? d.bubbleOld : d.bubble));
    if (you && r.pending) {
      const o = r.pending;
      const word = o.state === "failed" ? `Didn't send: ${o.message || "the terminal didn't take it"}` : o.state === "sent" ? "Sent · waiting for it to show" : "Sending…";
      return wrap(v_flex().h(r.h).items_end().pt(M.gap))
        .child(bubble.opacity(o.state === "failed" ? 1 : 0.6))
        .child(div().h(18).pt(4).text_size(11).line_height("14px").text_color(o.state === "failed" ? d.err : d.fg4).child(word));
    }
    if (you) return wrap(v_flex().h(r.h).items_end().pt(first ? M.gap : M.same)).child(bubble);
    const face = first ? div().flex_none().when(old && !M.name, (el) => el.opacity(0.5)).child(mascotEl(bot, mood_, M.face, t)) : div().w(M.face).flex_none();
    const who = r.label ?? bot.name;
    const meta = [clock(e.at), r.worked ? `worked ${worked(r.worked)}` : null].filter(Boolean).join(" · ");
    if (r.label) return wrap(v_flex().h(r.h).pt(first ? M.gap : M.same).pl(IN).gap(4))
      .child(this.noteChip(r, d, true))
      .child(bubble);
    return wrap(h_flex().h(r.h).items_start().gap(M.faceGap).pt(first ? M.gap : M.same))
      .child(face)
      .child(v_flex().flex_1().min_w(0).items_start()
        .when(first && Boolean(M.name), (el) => el.child(h_flex().h(M.name).items_start().gap(8)
          .child(div().text_size(13).line_height("16px").font_weight(500).text_color(d.fg1).child(who))
          .child(div().text_size(12).line_height("16px").text_color(d.fg4).child(old ? stampLabel(e.at, "pro-old") : meta))))
        .child(bubble));
  }

  // A note from another pal, folded: one 28 px line, "↳ Orca #general: first line ▾".
  noteChip(r, d, open) {
    return h_flex().h(28).max_w_full().min_w(0).items_center().gap(6).px(10).rounded(d.r.sm).bg(d.raised).border_1().border_color(d.line)
      .child(div().flex_none().text_size(12).text_color(d.fg3).child("↳"))
      .child(div().flex_none().max_w(220).truncate().text_size(12.5).font_weight(500).text_color(d.body).child(r.e.from ?? "a pal"))
      .child(div().min_w(0).truncate().text_size(12.5).text_color(d.fg2).child(open ? "" : firstLine(r.e.text)))
      .child(div().flex_none().text_size(11).text_color(d.fg4).child(open ? "▴" : "▾"));
  }

  // What the agent is doing right now, from its own status report ("Running npm test…").
  doing(bot, M) {
    const term = terminals().find((x) => x.address === this.terminal);
    const msg = String(term?.report?.msg ?? term?.status?.msg ?? "").trim();
    if (msg) return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
    return M.name ? "working" : `${bot.name} is working`;
  }

  // The card over the composer: what the agent asks, answered with a click. A permission shows its
  // command and every option Claude offers (Yes, Yes and don't ask again, No…); a question its
  // options with their descriptions, and "type your own answer in the box below" when it takes one.
  // Unparsed (the trust question, a multi-select): one line and Open terminal.
  card(tab, d, M) {
    if (tab?.status !== "blocked") return null;
    const p = this.prompt;
    const width = M.col ? (el) => el.w_full().max_w(M.col) : (el) => el.w_full();
    const box = width(v_flex().id("prompt-card").gap(10).p(12).rounded(d.r.md).bg(d.raised).border_1().border_color(d.lineStrong))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const head = (title, label) => h_flex().items_center().gap(8)
      .child(div().size(8).flex_none().rounded(4).bg(d.warn))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_weight(600).text_color(d.fg1).child(title))
      .child(div().flex_none().text_size(11).text_color(d.fg3).child(label));
    const openTerm = () => div().id("prompt-term").h(26).px(8).flex().items_center().rounded(d.r.sm).bg(d.ctl).cursor_pointer()
      .hover((s) => s.bg(d.lineStrong)).on_click(() => setChatPref(this.tabId, false))
      .child(div().text_size(12).font_weight(500).text_color(d.fg1).child("Open terminal"));
    if (!p || p.multi) {
      return box.child(head("It's asking you something in the terminal", p?.multi ? "pick several" : ""))
        .child(h_flex().justify_end().child(openTerm()));
    }
    const note = this.promptNote;
    if (p.kind === "approval") {
      box.child(head(p.title, "Permission"));
      p.detail.forEach((x) => box.child(div().text_size(12).text_color(d.fg2).child(x)));
      if (p.command) box.child(div().id("prompt-cmd").max_h(140).overflow_y_scrollbar().px(10).py(8).rounded(d.r.sm).bg(d.inset).border_1().border_color(d.line)
        .child(div().text_size(12).line_height("18px").font_family(d.mono).text_color(d.body).child(p.command)));
      box.child(div().text_size(13).text_color(d.body).child(p.question));
      box.child(h_flex().flex_wrap().gap(6).children(p.options.map((o, i) => h_flex().id(`prompt-opt-${o.n}`).h(28).min_w(0).max_w(340).px(10).gap(6)
        .items_center().rounded(d.r.sm).cursor_pointer().bg(i === 0 ? d.act : d.ctl).hover((s) => s.opacity(0.85))
        .when(this.answering, (el) => el.opacity(0.5))
        .on_click((_e, cx) => this.answer(o.n, cx))
        .child(div().flex_none().text_size(11).font_family(d.mono).text_color(i === 0 ? d.actFg : d.fg3).child(String(o.n)))
        .child(div().min_w(0).truncate().text_size(13).font_weight(500).text_color(i === 0 ? d.actFg : /^no\b/i.test(o.label) ? d.err : d.fg1).child(o.label)))));
    } else {
      box.child(head(p.title, p.steps > 1 ? `Question · ${p.steps} parts` : "Question"));
      if (p.question) box.child(div().text_size(14).line_height("20px").text_color(d.fg1).child(p.question));
      const picks = p.options.filter((o) => !o.type && !o.chat);
      box.child(v_flex().gap(4).children(picks.map((o) => h_flex().id(`prompt-opt-${o.n}`).min_h(32).py(6).px(10).gap(10).items_start()
        .rounded(d.r.sm).cursor_pointer().bg(d.inset).border_1().border_color(d.line).hover((s) => s.bg(d.sel))
        .when(this.answering, (el) => el.opacity(0.5))
        .on_click((_e, cx) => this.answer(o.n, cx))
        .child(div().flex_none().pt(1).text_size(11).font_family(d.mono).text_color(d.fg3).child(String(o.n)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().text_size(13).font_weight(500).text_color(d.fg1).child(o.label))
          .when(Boolean(o.detail), (el) => el.child(div().text_size(12).text_color(d.fg2).child(o.detail)))))));
      if (p.options.some((o) => o.type)) box.child(div().text_size(11.5).text_color(d.fg3).child("Or type your own answer in the box below."));
    }
    if (note) box.child(div().text_size(12).text_color(note.error ? d.err : d.fg3).child(note.text));
    return box;
  }

  // Messages not measured yet, drawn off-screen exactly as their bubble draws them (newest first, a
  // few at a time); each reports its real height and the list uses that from then on. TextView's
  // height can't be computed ahead, and a wrong guess cuts a message or leaves a gap.
  measuring(t) {
    const todo = (this.unmeasured ?? []).slice(-MEASURE);
    if (!todo.length) return null;
    return v_flex().absolute().top(0).left(-30000).w(1400).items_start().opacity(0).children(todo.map((m) => {
      const color = t.foreground;
      // Its width on one line: drawn without a width, in a row that doesn't wrap.
      if (m.natural) return h_flex().id(`measure-w-${m.key}`).flex_none().whitespace_nowrap().text_size(14).line_height(`${MODE[layoutMode()].line}px`)
        .child(markdownView(`mw-${m.key}`, m.text, color, 1400))
        .on_size_change((size, cx) => {
          const w = Math.ceil(size.width / zoom());
          if (!(size.width > 0) || this.natural.get(Number(m.key)) === w) return;
          this.natural.set(Number(m.key), w);
          this.mver++;
          if (this.follow) this.pending = true;
          cx.notify();
        });
      return v_flex().id(`measure-${m.key}`).w(m.tw).flex_none().text_size(14).line_height(`${MODE[layoutMode()].line}px`).text_color(color)
        .child(markdownView(`mm-${m.key}`, m.text, color, m.tw))
        .on_size_change((size, cx) => {
          const h = Math.ceil(size.height / zoom());
          if (!(size.height > 0) || this.measured.get(m.key) === h) return;
          this.measured.set(m.key, h);
          this.mver++;
          if (this.follow) this.pending = true;
          cx.notify();
        });
    }));
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    const M = MODE[layoutMode()];
    const { space, tab, terminal } = this.target();
    this.tabId = tab?.id ?? null;
    const root = v_flex().id("crew-chat").size_full().bg(d.bg0).text_color(d.fg1)
      .on_size_change((size, cx) => { const w = size.width / zoom(); if (Math.abs(w - this.width) > 4) { this.width = w; cx.notify(); } });
    if (terminal !== this.terminal) this.reload(cx);
    // Coming to this view shows the newest message.
    const shown = findNode(layout(), "center")?.active === "chat-view";
    if (shown && !this.shown) { this.follow = true; this.toBottom(cx); }
    this.shown = shown;
    if (this.pending) { this.pending = false; if (this.follow) this.scroll.scroll_to_bottom(); }
    if (!space || !tab) return root;
    const bot = botOf(space);
    const faceMood = mood(tab.status, bot.awake || bot.starting);

    const rows = this.rows(tab.status);
    // Earlier messages just went on top: put the message that was first back where it was.
    if (this.anchor && !this.loadingOlder) {
      const i = rows.findIndex((r) => r.key === this.anchor);
      if (i > 0) this.scroll.scroll_to_item(i, "top");
      this.anchor = null;
    }
    if (!rows.length) {
      return root.items_center().justify_center().gap(8)
        .child(div().text_size(14).text_color(d.fg2).child(`Nothing in #${channelName(tab)} yet`))
        .child(div().max_w(420).text_center().text_size(12).text_color(d.fg3)
          .child("Its conversation shows here once it's linked: when the agent starts, or after /clear."));
    }
    const card = this.card(tab, d, M);
    return root.child(h_flex().flex_1().min_h(0).w_full().justify_center()
      .child(div().id("chat-box").relative().h_full().w_full().when(Boolean(M.col), (el) => el.max_w(M.col + 2 * M.px))
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
            return rows.slice(range.start, range.end).map((r) => this.row(r, t, bot, faceMood));
          })
          .track_scroll(this.scroll).size_full()
          // Rows can't hold their own click handlers; the list reports which row was clicked: a note
          // from another pal opens and folds.
          .on_item_click((key, cx) => {
            const r = this.rowsVal?.find((x) => x.key === key);
            if (r?.kind !== "note") return;
            this.openNotes.has(key) ? this.openNotes.delete(key) : this.openNotes.add(key);
            this.rowsKey = null; cx.notify();
          })
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
          .child(div().id("chat-jump").size(28).flex().items_center().justify_center().rounded(d.r.sm)
            .bg(d.raised).border_1().border_color(d.lineStrong).text_color(d.fg1)
            .opacity(this.follow ? 0 : 1).transition("opacity", { duration: 160 })
            .when(!this.follow, (el) => el.cursor_pointer().hover((s) => s.bg(d.sel)))
            .on_click((_e, cx) => { if (this.follow) return; this.follow = true; this.toBottom(cx); cx.notify(); })
            .child(svg(`${ICONS}/arrow-down.svg`).size(15))))))
      .when(Boolean(card), (el) => el.child(h_flex().w_full().flex_none().justify_center().px(M.px).pb(8).child(card)));
  }
}
