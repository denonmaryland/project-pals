// Parses one brain log line (changelog.md / decisions.md, without the leading "- ") into
// { when, who, text } for the Mission tab's Latest changes / Latest decisions rows.
//
// What `pal brain` writes (crewbrain.py):
//   changelog:  2026-11-08 #checkout (Juniper): Split the checkout form
//   decisions:  2026-11-04 · DeNon: Serve images as WebP. Why: the hero image was 2 MB.
// People also edit these files by hand, so these must read sensibly too:
//   2026-11-08 · Shipping and Payment steps split out of CheckoutForm
//   2026-11-04 · Serve product images as WebP: the hero image was 2 MB.
// The date always goes in the date column. Only a short name counts as "who" (T15: a decision's
// own text was taken for the name and cut to "Serve produ…", leaving the reason as the row).

const WHO_MAX = 32;

// A name: short, capitalised words (DeNon, Orca, Project Pals - Herdr Mod), no sentence marks.
function isName(s) {
  const t = String(s ?? "").trim();
  return Boolean(t) && t.length <= WHO_MAX && !/[.!?,;]/.test(t)
    && t.split(/\s+/).every((w) => /^[\p{Lu}\p{N}]/u.test(w) || w === "-" || w === "·");
}

export function parseLogLine(line) {
  const l = String(line ?? "").trim();
  const m = l.match(/^(\d{4})-(\d\d)-(\d\d)\b\s*([\s\S]*)$/);
  if (!m) return { when: "", who: "", text: l };
  const when = `${m[2]}-${m[3]}`;
  let rest = m[4];
  // #channel and (by), in either order, as `pal brain log` writes them. The column is narrow, so
  // it shows who wrote it, else the channel.
  let by = "", channel = "";
  for (;;) {
    const tag = rest.match(/^(#[^\s:]+|\([^)]*\))\s*/);
    if (!tag) break;
    if (tag[1].startsWith("(")) by = by || tag[1].slice(1, -1).trim();
    else channel = channel || tag[1];
    rest = rest.slice(tag[0].length);
  }
  let who = by || channel;
  // A separator after the date: ":", "·", "-" or "—".
  const sep = rest.match(/^([:·—-])\s*/);
  if (sep) rest = rest.slice(sep[0].length);
  // "· Name: text" (pal brain decide): a name before the first colon is who decided.
  if (!who && sep?.[1] === "·") {
    const c = rest.match(/^([^:]+):\s+([\s\S]+)$/);
    if (c && isName(c[1])) { who = c[1].trim(); rest = c[2]; }
  }
  return { when, who, text: rest.trim() || l };
}
