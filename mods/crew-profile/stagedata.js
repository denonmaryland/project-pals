// The profile page's hero and its four week cards (DeNon 2026-11-08: "#1 Hero stage + #5 Mission
// control"). Pure functions (no herdr imports), so node tests can cover them (tests/test_stage.mjs).
// The views are in stage.js.

import { weekStats } from "./vaultdata.js";

const WEEK = 7 * 86400000;
const lc = (s) => String(s ?? "").trim().toLowerCase();

// The stage's light: blue working, mint done (and a PR open), amber needs you, red stuck, none at rest.
export function stageTone(state, awake = true) {
  if (!awake) return null;
  return { work: "work", done: "done", pr: "done", ask: "ask", stuck: "stuck" }[state] ?? null;
}

// The line over the pet: "Working · 12m in #profiles". `since` is already a short "12m" (or "").
export function stateLine({ word, since, channel }) {
  const t = since && since !== "now" ? `${word} · ${since}` : word;
  return channel ? `${t} in #${channel}` : t;
}

// Is this board task this pal's (assigned to it, or claimed by one of its channels)?
export const taskIsFor = (task, pal) => Boolean(lc(pal)) && [task?.assignee, task?.claimed_by].some((w) => lc(String(w ?? "").split("#")[0]) === lc(pal));
const channelOfTask = (task) => { const w = String(task?.claimed_by || task?.assignee || ""); return w.includes("#") ? lc(w.split("#")[1]) : null; };

// The four cards, from real data only.
//   pal        the pal's space name (what tasks, approvals and proposals name it by)
//   channels   [{ name, status, awake }] (awake: an agent runs in it)
//   tasks      the shared board's tasks (all; filtered here)
//   approvals  pending guarded commands ({ bot, status }), proposals ({ pal, status }), stalled { term: { bot } }
//   nb         `pal notebook ls --json` ({ days: [...] }) or null while it loads
// Shipped: tasks done in the last 7 days. In motion: channels working now, plus claimed tasks not on one
// of them. Needs you: channels asking, commands held for your OK, proposals waiting, channels that look
// stuck. Hiccups: the notebook's hiccups in the last 7 days.
export function weekCards({ pal, channels = [], tasks = [], approvals = [], proposals = [], stalled = {}, nb = null, now = Date.now() }) {
  const mine = (tasks ?? []).filter((t) => taskIsFor(t, pal));
  const shipped = mine.filter((t) => t.status === "done" && (t.updated ?? 0) >= now - WEEK).length;
  const working = channels.filter((c) => c.awake && c.status === "working");
  const workingNames = new Set(working.map((c) => lc(c.name)));
  const claimed = mine.filter((t) => t.status === "claimed" && !workingNames.has(channelOfTask(t))).length;
  const asks = channels.filter((c) => c.awake && c.status === "blocked").length;
  const held = (approvals ?? []).filter((a) => (a.status ?? "pending") === "pending" && lc(a.bot) === lc(pal)).length;
  const props = (proposals ?? []).filter((p) => (p.status ?? "pending") === "pending" && lc(p.pal) === lc(pal)).length;
  const stuck = Object.values(stalled ?? {}).filter((s) => lc(s?.bot) === lc(pal)).length;
  const wk = nb ? weekStats(nb, now) : null;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const parts = (xs) => xs.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many)).join(" · ");
  return [
    { key: "shipped", label: "Shipped", tone: "done", value: shipped, sub: "tasks done · 7 days" },
    { key: "motion", label: "In motion", tone: "work", value: working.length + claimed,
      sub: parts([[working.length, "topic"], [claimed, "task"]]) || "nothing running" },
    { key: "needs", label: "Needs you", tone: "ask", value: asks + held + props + stuck,
      sub: parts([[asks, "ask"], [held, "approval"], [props, "proposal"], [stuck, "stuck"]]) || "all clear" },
    { key: "hiccups", label: "Hiccups", tone: "stuck", value: wk ? wk.hiccups : null,
      sub: !wk ? "reading the notebook…" : wk.hiccupMinutes ? `~${wk.hiccupMinutes}m lost · 7 days` : "notebook · 7 days" },
  ];
}

// The task board for one pal, the way the old dashboard's board had it: Now (claimed, plus what each
// working channel is doing), Next (open, with what it waits on), Blocked (blocked, plus channels that
// ask you or look stuck), Done (the last 7 days, newest first). Channels: [{ id, name, status, awake, title }].
export function boardOf({ pal, tasks = [], channels = [], stalled = {}, now = Date.now() }) {
  const mine = (tasks ?? []).filter((t) => taskIsFor(t, pal));
  const doneIds = new Set((tasks ?? []).filter((t) => t.status === "done").map((t) => t.id));
  const byName = (n) => channels.find((c) => lc(c.name) === n) ?? null;
  const out = { now: [], next: [], blocked: [], done: [] };
  for (const t of mine) {
    const ch = byName(channelOfTask(t));
    if (t.status === "claimed") out.now.push({ task: t, ch });
    else if (t.status === "open") out.next.push({ task: t, ch, after: (t.deps ?? []).filter((x) => !doneIds.has(x)) });
    else if (t.status === "blocked") out.blocked.push({ task: t, ch });
    else if (t.status === "done" && now - (t.updated ?? 0) < WEEK) out.done.push({ task: t, ch });
  }
  for (const c of channels) {
    if (!c.awake) continue;
    if (c.status === "working" && !out.now.some((x) => x.ch?.id === c.id)) out.now.push({ activity: c.title ?? "working", ch: c, since: c.changed_at });
    if (c.status === "blocked") out.blocked.push({ activity: c.title ? `Asks you: ${c.title}` : "Asks you something", ch: c, since: c.changed_at, ask: true });
  }
  for (const [term, st] of Object.entries(stalled ?? {})) {
    if (lc(st?.bot) !== lc(pal)) continue;
    out.blocked.push({ activity: "Looks stuck", ch: byName(lc(st.channel)), stuck: true, since: st.since, key: term });
  }
  out.next.sort((a, b) => (a.task.created ?? 0) - (b.task.created ?? 0));
  out.done.sort((a, b) => (b.task.updated ?? 0) - (a.task.updated ?? 0));
  return out;
}
