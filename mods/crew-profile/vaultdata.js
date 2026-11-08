// The Vault's Home note (DeNon 2026-11-08, direction A): a note that writes itself from the pal's
// files and the board. Pure functions (no herdr imports), so node tests can cover them
// (tests/test_vault.mjs). The views are in vault.js.
//
// Inputs, as the panel already loads them:
//   brain  `pal brain ls <pal> --json`     { mission: {statement, goals, focus, done_when}, decisions, changelog, notes, files }
//   nb     `pal notebook ls <pal> --json`  { days: [{ day: "YYYY-MM-DD", entries: [{ time, channel, task, took, did, hiccups, needed, lesson }] }] }
//   tasks  the shared board's tasks, already filtered to this pal

import { parseLogLine } from "./loglines.js";

// The vault's notes: Home is new; the others are the tabs it replaced (their keys stay, so every
// menu and link that opened Mission, Brain or Notebook lands on the same note in the Vault).
export const NOTES = [["home", "Home"], ["mission", "Mission"], ["notebook", "Journal"], ["brain", "Brain"]];
export const NOTE_KEYS = NOTES.map(([k]) => k);

// "2h", "40m", "1h 10m", "90m" → minutes (0 when unreadable).
export function minutesOf(took) {
  const s = String(took ?? "");
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = s.match(/(\d+)\s*m(?!s)/);
  return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseInt(m[1], 10) : 0));
}

export function fmtMinutes(min) {
  if (!min) return "0m";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? ` ${String(m).padStart(2, "0")}m` : ""}` : `${m}m`;
}

const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const lessonsOf = (e) => (Array.isArray(e.lessons) ? e.lessons : Array.isArray(e.lesson) ? e.lesson : e.lesson ? [e.lesson] : []);
const costOf = (h) => (typeof h?.cost === "number" ? h.cost : minutesOf(String(h?.text ?? "").match(/cost:\s*([^)]*)/)?.[1]));

// The board, as Now (claimed) / Next (open) / Blocked / Done today, oldest first in each.
export function taskColumns(tasks, now = Date.now()) {
  const by = (s) => (tasks ?? []).filter((t) => t.status === s).sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  const today = startOfDay(now);
  return {
    now: by("claimed"),
    next: by("open"),
    blocked: by("blocked"),
    done: by("done").filter((t) => (t.updated ?? 0) >= today).sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0)),
  };
}

// The last 7 days of the notebook, counted.
export function weekStats(nb, now = Date.now()) {
  const from = ymd(startOfDay(now) - 6 * 86400000);
  const out = { days: 0, entries: 0, minutes: 0, hiccups: 0, hiccupMinutes: 0, lessons: 0, needed: 0 };
  for (const day of nb?.days ?? []) {
    if (day.day < from) continue;
    if ((day.entries ?? []).length) out.days++;
    for (const e of day.entries ?? []) {
      out.entries++;
      out.minutes += minutesOf(e.took);
      out.hiccups += (e.hiccups ?? []).length;
      out.hiccupMinutes += (e.hiccups ?? []).reduce((n, h) => n + (costOf(h) || 0), 0);
      out.lessons += lessonsOf(e).length;
      out.needed += (e.needed ?? []).length;
    }
  }
  return out;
}

// Today's entries, newest first, each with its first hiccup and lesson for the one-line preview.
export function todayEntries(nb, now = Date.now()) {
  const day = (nb?.days ?? []).find((x) => x.day === ymd(now));
  return [...(day?.entries ?? [])].sort((a, b) => String(b.time).localeCompare(String(a.time)))
    .map((e) => ({ ...e, hiccup: e.hiccups?.[0]?.text ?? null, lessonText: lessonsOf(e)[0] ?? null }));
}

const ticked = (xs) => ({ done: (xs ?? []).filter((x) => x.done).length, total: (xs ?? []).length });

// Everything the Home note shows.
export function homeData({ brain, nb, tasks, now = Date.now() }) {
  const m = brain?.mission ?? {};
  return {
    statement: m.statement ?? "",
    focus: m.focus ?? "",
    goals: ticked(m.goals),
    doneWhen: ticked(m.done_when),
    hasMission: Boolean(m.statement || (m.goals ?? []).length || m.focus),
    columns: taskColumns(tasks, now),
    today: todayEntries(nb, now),
    week: weekStats(nb, now),
    // decisions.md is oldest first, changelog.md newest first.
    decisions: [...(brain?.decisions ?? [])].reverse().slice(0, 2).map(parseLogLine),
    changes: (brain?.changelog ?? []).slice(0, 3).map(parseLogLine),
    counts: {
      days: (nb?.days ?? []).filter((x) => (x.entries ?? []).length).length,
      decisions: (brain?.decisions ?? []).length,
      changes: (brain?.changelog ?? []).length,
      notes: (brain?.notes ?? []).length,
    },
  };
}
