// The command bar's search, kept pure (no Herdr imports) so node tests can cover it:
// node tests/test_command.mjs
//
// An item is { group, label, sub?, words?, ... }. A query matches an item when every word of it
// is found in the item's label (or, weaker, its sub line or extra words). Better places score
// higher: the label's start, then a word's start, then anywhere, then the letters in order
// ("rvch" finds "Review changes"). Results come back grouped, each group capped, groups in the
// order of their best hit (ties keep GROUPS' order), so Enter on the first row is the best match.

export const GROUPS = ["Pals", "Channels", "Tasks", "Vault", "Commands"];
export const CAPS = { Pals: 4, Channels: 4, Tasks: 3, Vault: 3, Commands: 4 };
// At most this many rows in all, so the list fits the popup without scrolling.
export const MAX_ROWS = 13;

const norm = (s) => String(s ?? "").toLowerCase();
const isWordStart = (text, i) => i === 0 || /[^a-z0-9]/.test(text[i - 1]);

// One query word against one text: { score, at, len } or null. Fuzzy (letters in order) only for
// the label and only for words of 2+ letters, so a single letter doesn't match everything.
function matchWord(word, text, fuzzy) {
  if (!word) return { score: 0, at: 0, len: 0 };
  const t = norm(text);
  if (t.startsWith(word)) return { score: 100, at: 0, len: word.length };
  let i = t.indexOf(word);
  let first = i;
  while (i > 0) {
    if (isWordStart(t, i)) return { score: 70, at: i, len: word.length };
    i = t.indexOf(word, i + 1);
  }
  if (first >= 0) return { score: 40, at: first, len: word.length };
  if (fuzzy && word.length >= 2) {
    let k = 0, start = -1;
    for (let j = 0; j < t.length && k < word.length; j++) if (t[j] === word[k]) { if (start < 0) start = j; k++; }
    if (k === word.length && isWordStart(t, start)) return { score: 15, at: -1, len: 0 };
  }
  return null;
}

// How well `query` matches `item`: a score (higher is better), its `base` (the same without the
// label-length nudge) and the label's matched ranges
// ([start, end) pairs, for bold), or null when it doesn't match.
export function scoreItem(query, item) {
  const words = norm(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { score: 0, base: 0, ranges: [] };
  let total = 0;
  const ranges = [];
  for (const w of words) {
    const inLabel = matchWord(w, item.label, true);
    const inSub = matchWord(w, item.sub, false);
    const inWords = matchWord(w, (item.words ?? []).join(" "), false);
    const best = [inLabel, inSub && { ...inSub, score: inSub.score * 0.5, at: -1 }, inWords && { ...inWords, score: inWords.score * 0.4, at: -1 }]
      .filter(Boolean).sort((x, y) => y.score - x.score)[0];
    if (!best) return null;
    total += best.score;
    if (best === inLabel && inLabel.at >= 0 && inLabel.len) ranges.push([inLabel.at, inLabel.at + inLabel.len]);
  }
  // Within a group, a shorter label is a closer match ("Tasks" before "Tasks for Hello Lock");
  // `base` (without that) orders the groups, so length alone never moves a whole group up.
  return { score: total - Math.min(10, norm(item.label).length / 8), base: total, ranges: mergeRanges(ranges) };
}

export function mergeRanges(rs) {
  const out = [];
  for (const [a, b] of [...rs].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

// The label cut into [text, bold] pieces along `ranges`.
export function pieces(label, ranges) {
  const out = [];
  let at = 0;
  for (const [a, b] of ranges ?? []) {
    if (a > at) out.push([label.slice(at, a), false]);
    out.push([label.slice(a, b), true]);
    at = b;
  }
  if (at < label.length) out.push([label.slice(at), false]);
  return out.filter(([s]) => s);
}

// Search: [{ group, items: [{ ...item, score, ranges }] }], best group first, capped.
export function search(query, items, { caps = CAPS, maxRows = MAX_ROWS } = {}) {
  const byGroup = new Map();
  items.forEach((item, order) => {
    const m = scoreItem(query, item);
    if (!m) return;
    const g = byGroup.get(item.group) ?? [];
    g.push({ ...item, score: m.score, base: m.base, ranges: m.ranges, order });
    byGroup.set(item.group, g);
  });
  const groups = [...byGroup.entries()].map(([group, list]) => {
    list.sort((x, y) => y.score - x.score || x.order - y.order);
    return { group, items: list.slice(0, caps[group] ?? 4), best: Math.max(...list.map((x) => x.base)) };
  });
  const rank = (g) => { const i = GROUPS.indexOf(g); return i < 0 ? GROUPS.length : i; };
  groups.sort((x, y) => y.best - x.best || rank(x.group) - rank(y.group));
  // Trim from the end so the whole list fits (a group header counts as a row).
  let rows = 0;
  const out = [];
  for (const g of groups) {
    const room = maxRows - rows - 1;
    if (room <= 0) break;
    const items = g.items.slice(0, room);
    out.push({ group: g.group, items });
    rows += 1 + items.length;
  }
  return out;
}
