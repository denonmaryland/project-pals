// Trusted helpers (T116): what the helpers dialog and Home say about a helper and its record.
// Pure (no Herdr imports), so node can test it: tests/test_helperlog.mjs. The facts come from
// `pal helpers --json` (bin/crewhelpers.py listing()) and data/crew-helpers/log.jsonl; nothing
// here ever sees a key.

export const HELPERS_FILE = "data/crew-helpers/helpers.json";
export const HELPERS_LOG = "data/crew-helpers/log.jsonl";

const clip = (s, n) => { s = String(s ?? ""); return s.length <= n ? s : `${s.slice(0, n - 1)}…`; };

export function helperAgo(ms, now = Date.now()) {
  if (!ms) return "";
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// The line under a helper's name in the dialog.
export function helperSub(h, now = Date.now()) {
  if (h.carried_over) return "Carried over from the earlier build, switched off. Turn it on to make its key.";
  if (!h.key) return "No key yet: turn it on to make one";
  if (!h.key_there) return "Its key file is missing: Rotate key makes a new one";
  const bits = [`Key ${h.rotated ? "rotated" : "made"} ${helperAgo(h.rotated ?? h.made, now)}`];
  if (h.last_used) bits.push(`last used ${helperAgo(h.last_used, now)}`);
  bits.push(`${h.sent ?? 0} sent`);
  if (h.refused) bits.push(`${h.refused} refused`);
  if (h.on && (h.sent_hour ?? 0) >= (h.per_hour ?? Infinity)) bits.push("at this hour's limit");
  return bits.join(" · ");
}

// The line a helper is given: how it says who it is. Names with spaces are quoted for a shell.
export function helperLine(name) {
  const q = /^[A-Za-z0-9_.-]+$/.test(name) ? name : `'${String(name).replace(/'/g, "'\\''")}'`;
  return `PAL_HELPER=${q} pal tell "<Pal>" "…"`;
}

const VERB = { tell: "told", ask: "asked", task: "gave a task to" };

// One line of the record as a row: {bold, rest, tone, card}. tone: "sent" | "warn" | "quiet".
export function logRow(e, owner = "you") {
  const who = e.helper ?? "A helper";
  if (e.kind === "sent") {
    return { bold: `${who} ${VERB[e.card_kind] ?? "sent to"} ${e.to || "the Desk"}`, rest: `${clip(e.title, 120)}`, tone: "sent", card: e.card ?? null };
  }
  if (e.kind === "refused") {
    const what = String(e.command ?? "").replace(/^pal\s+/, "");
    return { bold: `${who} tried: ${clip(what, 60)}`, rest: `refused · only ${owner === "you" ? "your" : `${owner}'s`} click does that${e.verified ? "" : " · no valid key"}`, tone: "warn", card: null };
  }
  if (e.kind === "unverified") {
    return { bold: `${who}: not sent in ${owner === "you" ? "your" : `${owner}'s`} name`, rest: `${clip(e.why, 120)} · it went as not verified`, tone: "warn", card: null };
  }
  if (e.kind === "switch") {
    const a = String(e.action ?? "");
    const bold = a === "on" ? `You switched ${who} on${e.key === "made" ? " · key made" : ""}` : a === "off" ? `You switched ${who} off`
      : a === "rotate" ? `You rotated ${who}'s key` : a === "remove" ? `You removed ${who}`
      : a.startsWith("carried over") ? `${who} was carried over, switched off` : `${who}: ${a}`;
    return { bold, rest: a.startsWith("carried over") ? "from the earlier build · turn it on again in Trusted helpers" : "your click", tone: "quiet", card: null };
  }
  return { bold: who, rest: String(e.kind ?? ""), tone: "quiet", card: null };
}

// What happened since `floor`, newest first, for Home (rows carry `at`).
export function helperRows(log, floor = 0) {
  return (log ?? []).filter((e) => e && typeof e === "object" && (e.at ?? 0) > floor).sort((x, y) => (y.at ?? 0) - (x.at ?? 0));
}

// "5 sent · 1 refused today" (nothing when nothing happened).
export function helperToday(log, now = Date.now()) {
  const day = now - 24 * 3600 * 1000;
  const n = (k) => (log ?? []).filter((e) => e?.kind === k && (e.at ?? 0) >= day).length;
  const sent = n("sent"), refused = n("refused"), unv = n("unverified");
  return [sent ? `${sent} sent` : null, refused ? `${refused} refused` : null, unv ? `${unv} not verified` : null].filter(Boolean).join(" · ");
}

// A name the dialog will take (crewhelpers.check_name decides; this only keeps the button honest).
export const helperNameOk = (name) => /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,23}$/.test(String(name ?? "").trim());
