// Trusted helpers (T116): what the helpers dialog and Home say about a helper and its record.
// Pure (no Herdr imports), so node can test it: tests/test_helperlog.mjs. The facts come from
// `pal helpers --json` (bin/crewhelpers.py listing()) and data/crew-helpers/log.jsonl; nothing
// here ever sees a key.

export const HELPERS_FILE = "data/crew-helpers/helpers.json";
export const HELPERS_LOG = "data/crew-helpers/log.jsonl";
export const HELPERS_ATTENTION = "data/crew-helpers/attention.json";   // helpers that aren't working (crewhelpers.check)

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
  // Relayed taps: held, went through, stopped, taken back, dropped, failed, undone, refused.
  if (e.kind === "tap") {
    return { bold: `${who} tapped ${e.choice ?? "?"}`, rest: `${clip(e.title, 90)} · you said: "${clip(e.relayed, 70)}" · held${e.run_at ? ` until ${hhmm(e.run_at)}` : ""}`,
      tone: e.item_class === "outward" ? "warn" : "sent", card: e.item ?? null };
  }
  if (typeof e.kind === "string" && e.kind.startsWith("tap-")) {
    const what = e.kind.slice(4);
    if (what === "refused") return { bold: `${who}'s tap was refused`, rest: clip(e.why, 140), tone: "warn", card: null };
    const said = { done: "went through", stopped: "stopped by you", cancelled: `taken back by ${who}`, dropped: "dropped", failed: "did not go through", undone: "undone by you" }[what] ?? what;
    return { bold: `Tap ${said}`, rest: `${who} → ${e.choice ?? "?"}: ${clip(e.title, 90)}${e.why && what !== "done" ? ` · ${clip(e.why, 80)}` : ""}`,
      tone: what === "done" ? "sent" : what === "failed" || what === "dropped" ? "warn" : "quiet", card: e.item ?? null };
  }
  if (e.kind === "notice") {
    const ok = e.reason === "ok", closed = e.reason === "off" || e.reason === "removed";
    return { bold: e.reason === "restored" ? who : ok ? `${who} is working again` : e.reason === "off" ? `${who} is off` : e.reason === "removed" ? `${who} was removed` : `${who} is not working`,
      rest: clip(ok ? "what it sends is in your name again" : closed ? "your click · its notice is closed" : e.text, 160), tone: ok || closed ? "quiet" : "warn", card: null };
  }
  return { bold: who, rest: String(e.kind ?? ""), tone: "quiet", card: null };
}

// ── relayed taps (T147, bin/crewtaps.py) ──
export const TAPS_FILE = "data/crew-taps/holds.json";   // the recent holds, written by pal (crewtaps._save_hold)
const TAP_CLASS = { home: "a question on Home", local: "an approval on this computer", outward: "an outward action" };
const hhmm = (ms) => { const t = new Date(ms); return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };

// A tap that's being held, as Home's card says it: {title, sub, outward, goes}. `goes` is a clock
// time, not a countdown: the card doesn't need a timer to stay true.
export function tapNeed(h, now = Date.now()) {
  const who = h?.helper ?? "A helper";
  const left = Math.max(0, Math.round(((h?.run_at ?? now) - now) / 1000));
  const goes = left <= 0 ? "going through now" : `goes through at ${hhmm(h.run_at)}`;
  return { outward: h?.cls === "outward", goes,
    title: `${who} tapped ${h?.choice ?? "?"}: ${clip(h?.title, 110)}`,
    sub: `${goes} unless you stop it · ${who} says you said: "${clip(h?.relayed, 90)}" · ${TAP_CLASS[h?.cls] ?? "a tap"}${h?.cls === "outward" ? " · can't be undone once it runs" : ""}` };
}

// The holds worth showing: those still held (oldest first), for Needs you; and whether a done one can be undone.
export const tapsHolding = (holds) => (holds ?? []).filter((h) => h && h.status === "holding").sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
export const tapUndoable = (holds, hold) => (holds ?? []).some((h) => h && h.id === hold && h.kind === "home" && h.status === "done");

// What each tap switch lets a helper do without the owner, in one sentence (the sheet shows it before the switch).
export const TAP_SWITCHES = [
  ["home", "Home questions", "Pick one of a question's listed choices; the asker starts on it. You can undo it."],
  ["local", "Approvals on this computer", "Accept or decline a proposal, send a draft, approve a held edit that stays local."],
  ["outward", "Push, release, land", "Approve a held push, publish, release, deploy, merge or landing. Once it runs it can't be undone."],
];

// A helper that isn't working (crewhelpers.check → data/crew-helpers/attention.json), as Home's
// "Needs you" card says it: {title, sub, fix: {label, action, does} | null, off: {label, does}}.
// `action` is the last word of `pal settings trust-helper <name> <action>` (the owner's click).
export function helperNeed(h, now = Date.now()) {
  const name = h?.name ?? "A helper";
  const text = String(h?.text ?? `${name} isn't working.`);
  const cut = text.indexOf(". ");
  const title = cut > 0 ? text.slice(0, cut + 1) : text;
  const more = cut > 0 ? text.slice(cut + 2) : "";
  const bits = [more, h?.since ? `since ${helperAgo(h.since, now)}` : null,
    h?.unverified ? `${h.unverified} message${h.unverified === 1 ? "" : "s"} since then arrived not verified` : null].filter(Boolean);
  const fix = h?.fix === "on" ? { label: `Turn ${name} on`, action: "on", does: "Makes its key; what it sends is in your name again" }
    : h?.fix === "rotate" ? { label: "Rotate key", action: "rotate", does: "A new key in the same file; the helper works again" } : null;
  const off = h?.reason === "carried-over" || h?.reason === "restored-off" ? { label: "Leave it off", does: "Keeps it off, your choice now; this notice goes" }
    : h?.reason === "limit" ? null : { label: `Switch ${name} off`, does: "Off until you turn it on again; this notice goes" };
  return { title, sub: bits.join(" · "), fix, off };
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
