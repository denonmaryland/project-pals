// A message's markdown as selectable text. TextView draws the prose (bold, links, lists, quotes,
// headings); code fences and tables are split out and drawn here as rounded boxes, because
// TextView draws them square and takes no styling.
//
// From flockbook (github.com/minchenlee/flockbook, herdr-app/mods/flockbook/mdblocks.js),
// MIT License, (c) 2026 Min-Chen Lee (LICENSE-flockbook). Changed here: our colors (also on your accent bubble),
// JetBrains Mono at 12.5 px, and smaller boxes.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { tableCells, colWidths } from "./estimate.js";
import { a } from "./crew.js";

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const alignOf = (cell) => {
  const c = cell.trim();
  return c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left";
};

// [{k:"md", text}, {k:"code", lang, text}, {k:"table", head, align, rows}] in order.
export function splitBlocks(text) {
  const lines = String(text ?? "").split("\n");
  const out = []; let md = [];
  const flush = () => { if (md.length && md.join("\n").trim()) out.push({ k: "md", text: md.join("\n") }); md = []; };
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]);
    if (f) {
      flush();
      const body = []; i++;
      while (i < lines.length && !(FENCE.exec(lines[i]) && lines[i].trim().startsWith(f[1]))) body.push(lines[i++]);
      out.push({ k: "code", lang: f[2] || "", text: body.join("\n") });
      continue;
    }
    if (/^\s*\|/.test(lines[i]) && i + 1 < lines.length && SEP.test(lines[i + 1])) {
      flush();
      const head = tableCells(lines[i]);
      const align = tableCells(lines[i + 1]).map(alignOf);
      const rows = []; i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(tableCells(lines[i++]));
      i--;
      out.push({ k: "table", head, align, rows });
      continue;
    }
    md.push(lines[i]);
  }
  flush();
  return out;
}

// A code block as one markdown paragraph, so a drag selects across its lines: every ASCII
// punctuation escaped (drawn as text, not markup), leading spaces as no-break spaces (markdown
// drops them), tabs as 4, an empty line as one no-break space, lines joined by hard breaks.
const NBSP = " ";
export function codeMarkdown(text) {
  return String(text).split("\n").map((l) => {
    const e = l.replace(/\r$/, "").replace(/\t/g, "    ").replace(/[!-/:-@[-`{-~]/g, "\\$&");
    return e.replace(/^ +/, (s) => NBSP.repeat(s.length)) || NBSP;
  }).join("\\\n");
}

function codeBox(key, b, color) {
  return v_flex().w_full().my(6).px(12).py(8).rounded(10).bg(a(color, "0c")).border_1().border_color(a(color, "16"))
    .font_family("JetBrains Mono").text_size(12.5)
    .child(TextView.markdown(key, codeMarkdown(b.text)).selectable(true));
}

// Cells get a fixed width: a TextView in a flexible cell keeps its full one-line width and spills
// out of the table. Widths follow the content (colWidths), as the height guess does.
function table(id, b, color, width) {
  const n = Math.max(b.head.length, ...b.rows.map((r) => r.length));
  const ws = colWidths(width, [b.head, ...b.rows], n);
  const cell = (key, text, c, head) => div().w(ws[c]).flex_none().overflow_hidden().px(12).py(8)
    .when(b.align[c] === "right", (el) => el.text_right()).when(b.align[c] === "center", (el) => el.text_center())
    .when(head, (el) => el.font_semibold())
    .child(TextView.markdown(key, text ?? "").selectable(true));
  const row = (cells, r, head) => h_flex().w_full().items_start()
    .when(head, (el) => el.bg(a(color, "0c")))
    .when(!head, (el) => el.border_t(1).border_color(a(color, "16")))
    .children(Array.from({ length: n }, (_v, c) => cell(`${id}-c${r}-${c}`, cells[c], c, head)));
  return v_flex().w_full().my(6).rounded(10).border_1().border_color(a(color, "16")).text_size(13.5).overflow_hidden()
    .child(row(b.head, "h", true))
    .children(b.rows.map((r, i) => row(r, i, false)));
}

// The whole text as one element, `width` px wide (tables need it). `id` keeps TextView ids unique;
// `color` is the bubble's text color.
export function markdownView(id, text, color, width) {
  const blocks = splitBlocks(text);
  if (blocks.length === 1 && blocks[0].k === "md") return TextView.markdown(`${id}-0`, blocks[0].text).selectable(true);
  return v_flex().w_full().children(blocks.map((b, i) =>
    b.k === "code" ? codeBox(`${id}-k${i}`, b, color)
      : b.k === "table" ? table(`${id}-t${i}`, b, color, width)
        : TextView.markdown(`${id}-${i}`, b.text).selectable(true)));
}

// One paragraph with no line breaks, lists, quotes, headings, code or tables: a bubble that may
// shrink to its text.
export const plain = (text) => !/\n|^\s*([-*+>#|]|\d+[.)])\s|```/.test(String(text ?? "").trim());
