// Read: one topic's conversation, inside the pal board (T183; DeNon's pick A on h-4c9e54, the plan in
// crew-boards/chat-view/). The terminal stays the topic: Read is a page you open on purpose to read
// what a topic did, as Markdown, with each stretch of tool calls folded into one chip that opens to
// the calls. You reply through the board's own box (a Desk card from you, between two of its steps);
// to type live, Esc goes to its terminal. Read never presses a key in a terminal, never answers a
// prompt, and the session file is only read (`pal computer <pal> read --topic <t> --json`).
// Ideas from Flockbook (github.com/minchenlee/flockbook, MIT): code fences and tables drawn as their
// own boxes, chips with a check / spinner / failed mark, follow the end until you scroll up.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { scrollArea, scrollState, pebble, shortTime } from "./crew.js";

const ICON = "mods/crew-roster/icons";
export const READ_SHOWN = 60;          // rows drawn at first; "Show earlier" adds this many
const CODE_LINES = 40;                 // a code box shows this many lines, then "N more lines"
const TEXT_MAX = 20000;                // a reply is cut here (the session file keeps it whole)
const CHIP_ICON = { command: "ds-terminal", edit: "ds-file", write: "ds-file", read: "ds-file", search: "ds-search", web: "ds-search", agent: "ds-agents", tool: "ds-terminal" };
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// A reply's Markdown split into blocks Herdr can draw well: prose (TextView.markdown, which draws
// code and tables square and lets wide tables spill), fenced code and pipe tables (drawn here).
export function mdBlocks(text) {
  const lines = String(text ?? "").slice(0, TEXT_MAX).split("\n");
  const out = [];
  let prose = [];
  const flush = () => { const t = prose.join("\n").trim(); if (t) out.push({ kind: "md", text: t }); prose = []; };
  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i].match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
    if (fence) {
      flush();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++]);
      out.push({ kind: "code", lang: fence[2] || "", lines: code });
      continue;
    }
    const sepLine = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l ?? "");
    if (/^\s*\|.*\|\s*$/.test(lines[i]) && sepLine(lines[i + 1])) {
      flush();
      const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim().replace(/\*\*|`/g, ""));
      const head = cells(lines[i]);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      i--;
      out.push({ kind: "table", head, rows });
      continue;
    }
    prose.push(lines[i]);
  }
  flush();
  return out;
}

// Column widths for a table, in px, from its longest cell (7 px a character), each 48 to 320.
export function tableWidths(head, rows) {
  return head.map((h, c) => Math.max(48, Math.min(320, 20 + 7 * Math.max(h.length, ...rows.map((r) => String(r[c] ?? "").length)))));
}

function codeBox(d, id, b) {
  const shown = b.lines.slice(0, CODE_LINES);
  // A plain div drops leading spaces: keep an indent as no-break spaces.
  const keep = (l) => l.replace(/^ +/, (m) => " ".repeat(m.length)) || " ";
  return v_flex().id(id).w_full().py(8).px(12).rounded(d.r.md).bg(d.inset).border_1().border_color(d.line)
    .when(Boolean(b.lang), (el) => el.child(div().text_size(10).font_family(d.mono).text_color(d.fg4).pb(2).child(b.lang)))
    .children(shown.map((l) => div().text_size(12.5).line_height("20px").font_family(d.mono).text_color(d.body).child(keep(l))))
    .when(b.lines.length > CODE_LINES, (el) => el.child(div().pt(2).text_size(11).text_color(d.fg4).child(`${b.lines.length - CODE_LINES} more lines: read them in the terminal`)));
}

function tableBox(d, id, b) {
  const w = tableWidths(b.head, b.rows);
  const row = (cells, head, r) => h_flex().when(!head, (el) => el.border_t_1().border_color(d.line)).when(head, (el) => el.bg(d.raised))
    .children(w.map((px, c) => div().w(px).flex_none().px(10).py(5).text_size(12.5).line_height("18px").when(c > 0, (el) => el.border_l_1().border_color(d.line))
      .text_color(head ? d.body : d.fg1).when(head, (el) => el.font_weight(500)).child(String(cells[c] ?? ""))));
  return v_flex().id(id).flex_none().max_w_full().overflow_hidden().rounded(d.r.md).border_1().border_color(d.line)
    .child(row(b.head, true, -1)).children(b.rows.map((r, i) => row(r, false, i)));
}

function reply(d, id, text) {
  return v_flex().w_full().gap(8).children(mdBlocks(text).map((b, i) =>
    b.kind === "code" ? codeBox(d, `${id}-c${i}`, b)
      : b.kind === "table" ? tableBox(d, `${id}-t${i}`, b)
        : div().w_full().text_size(14).line_height("22px").text_color(d.fg1).child(TextView.markdown(`${id}-m${i}`, b.text).selectable(true))));
}

function mark(d, state) {
  return state === "failed" ? div().text_size(12).text_color(d.err).child("✗")
    : state === "running" ? div().size(7).rounded(4).bg(d.info) : div().text_size(12).text_color(d.okHi).child("✓");
}

function chip(v, d, id, r) {
  const open = v.openChips.has(id);
  const icon = CHIP_ICON[r.calls?.[0]?.verb] ?? "ds-terminal";
  const head = h_flex().id(id).flex_none().h(26).px(9).gap(7).items_center().rounded(d.r.sm).cursor_pointer()
    .bg(open ? d.raised : d.bg1).border_1().border_color(open ? d.lineStrong : d.lineMid).hover((s) => s.bg(d.hover))
    .on_click((_e, cx) => { if (open) v.openChips.delete(id); else v.openChips.add(id); cx.notify(); })
    .child(svg(`${ICON}/${icon}.svg`).size(12).text_color(d.iconOn))
    .child(div().text_size(12).text_color(d.body).child(clip(r.text, 90)))
    .child(mark(d, r.state))
    .child(svg(`${ICON}/ds-chevron-down.svg`).size(10).text_color(d.fg3));
  const box = v_flex().gap(6).items_start().child(head);
  if (open) {
    box.child(v_flex().w_full().py(6).px(10).gap(2).rounded(d.r.md).bg(d.inset).border_1().border_color(d.line)
      .children(r.calls.map((c, i) => h_flex().id(`${id}-call${i}`).gap(8).items_start().text_size(12).line_height("19px").font_family(d.mono)
        .child(div().w(64).flex_none().text_color(d.body).child(c.verb))
        .child(v_flex().flex_1().min_w(0)
          .child(div().text_color(d.fg2).child(c.what || "(no detail)"))
          .when(Boolean(c.out), (el) => el.child(div().text_color(d.fg4).child(clip(c.out, 160)))))
        .child(mark(d, c.state)))));
  }
  return box;
}

function row(v, d, r, i) {
  const id = `rd-${v.readKey}-${i}`;
  if (r.k === "sep") return div().w_full().flex().justify_center().text_size(11).font_family(d.mono).text_color(d.fg4).child(r.text);
  if (r.k === "event") return div().w_full().flex().justify_center().text_size(11.5).text_color(d.fg3).child(r.text);
  if (r.k === "footer") return div().text_size(11).font_family(d.mono).text_color(d.fg4).child(r.text);
  if (r.k === "you") {
    return h_flex().w_full().justify_end().child(v_flex().max_w(560).py(8).px(12).rounded(d.r.md).bg(d.raised).border_1().border_color(d.line)
      .child(div().text_size(13.5).line_height("21px").text_color(d.fg1).child(clip(r.text, 4000)))
      .child(div().pt(2).text_size(10.5).font_family(d.mono).text_color(d.fg4).child(`you · ${shortTime(r.at)}${r.images ? ` · ${r.images} image${r.images === 1 ? "" : "s"}` : ""}`)));
  }
  if (r.k === "note") {
    return v_flex().w_full().pl(10).py(2).border_l_2().border_color(d.lineStrong)
      .child(div().text_size(11.5).text_color(d.fg2).child(`${r.from || "A note"} · ${shortTime(r.at)}`))
      .child(div().text_size(12.5).line_height("19px").text_color(d.body).child(clip(r.text, 1200)));
  }
  if (r.k === "chip") return chip(v, d, id, r);
  return reply(d, id, r.text);
}

// The conversation: the newest `v.readShown` rows, "Show earlier" above them, and a ↓ Newest
// button while you read further up. It follows the end until you scroll up.
export function conversation(v, d, data) {
  const rows = data?.rows ?? [];
  const sid = `rd-scroll-${v.readKey}`;
  const s = scrollState(sid);
  // Follow the end until you scroll up (T194, Codex T193: the offset is always a measured end, never
  // a huge number the scroll area would draw as is). You scrolled up when the offset is above where
  // we last put it; new rows growing the content below it don't count.
  const end = Math.max(0, s.content - s.view);
  if (v.readFollow && v.readMeasured && s.y < (v.readLastY ?? 0) - 0.5) v.readFollow = false;
  else if (!v.readFollow && s.content > 0 && s.y >= end - 2) v.readFollow = true;
  if (v.readFollow) s.y = end;
  v.readLastY = s.y;
  v.readMeasured = s.content > 0;
  const shown = rows.slice(Math.max(0, rows.length - v.readShown));
  const hidden = rows.length - shown.length + (data?.earlier ?? 0);
  const list = v_flex().w_full().max_w(820).mx_auto().gap(14).px(4).pb(14);
  if (hidden > 0) {
    list.child(h_flex().w_full().justify_center().child(rows.length > shown.length
      ? pebble(d, { id: "rd-earlier", label: `Show earlier (${rows.length - shown.length})`, onClick: (cx) => { v.readShown += READ_SHOWN; v.readFollow = false; cx.notify(); } })
      : div().text_size(11.5).text_color(d.fg4).child(`${hidden} earlier rows: read them in the terminal`)));
  }
  shown.forEach((r, i) => list.child(row(v, d, r, rows.length - shown.length + i)));
  const area = div().flex_1().min_h(0).relative()
    .child(scrollArea(d, sid, list).size_full());
  if (!v.readFollow && s.content > s.view + 24) {
    area.child(h_flex().absolute().bottom(10).left(0).right(0).justify_center()
      .child(pebble(d, { id: "rd-newest", icon: "arrow-down", label: "Newest", onClick: (cx) => { v.readFollow = true; s.y = Math.max(0, s.content - s.view); v.readLastY = s.y; cx.notify(); } })));
  }
  return area;
}

// Nothing to read: no session file for this topic (a Codex pal, a shell), or none yet.
export function nothing(d, data, onTerminal, err = null) {
  const why = err ?? (!data ? "Reading its conversation…"
    : data.path ? "It hasn't said anything yet."
      : "There's no conversation file to read for this topic. Codex pals and plain shells can't be read yet: read it in its terminal.");
  return v_flex().flex_1().min_h(0).items_center().justify_center().gap(10)
    .child(div().max_w(460).text_size(13).line_height("20px").text_color(d.fg2).child(why))
    .when(Boolean(err || (data && !data.path)), (el) => el.child(pebble(d, { id: "rd-term", icon: "ds-terminal", label: "Its terminal", primary: true, onClick: onTerminal })));
}
