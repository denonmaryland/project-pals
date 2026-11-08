// The Vault's Home note: what it computes from the brain, the notebook and the board.
// Run: node tests/test_vault.mjs
import assert from "node:assert/strict";
import { minutesOf, fmtMinutes, taskColumns, weekStats, todayEntries, homeData, NOTE_KEYS, localDay } from "../mods/crew-profile/vaultdata.js";

// West of Greenwich, so an evening's UTC date is already tomorrow (the dates below are local).
process.env.TZ = "America/Los_Angeles";

// The Journal's "today" is the local day, as the notebook names its files (it was UTC: after 16:00
// here the current day lost its "Today · live" label).
const evening = new Date(2026, 10, 8, 17, 0);
assert.equal(evening.toISOString().slice(0, 10), "2026-11-09", "the test needs a UTC date that's tomorrow");
assert.equal(localDay(evening), "2026-11-08");
assert.equal(localDay(new Date(2026, 0, 5, 0, 30)), "2026-01-05");

// The old tabs' keys stay as notes, so menus that open Mission, Brain or Notebook still land.
assert.deepEqual(NOTE_KEYS, ["home", "mission", "notebook", "brain"]);

assert.equal(minutesOf("2h"), 120);
assert.equal(minutesOf("40m"), 40);
assert.equal(minutesOf("1h 10m"), 70);
assert.equal(minutesOf("1.5h"), 90);
assert.equal(minutesOf(null), 0);
assert.equal(fmtMinutes(185), "3h 05m");
assert.equal(fmtMinutes(45), "45m");
assert.equal(fmtMinutes(120), "2h");

const now = new Date(2026, 10, 8, 14, 0).getTime();          // Sat Nov 8, 14:00 local
const today = new Date(2026, 10, 8, 9, 0).getTime();
const yesterday = new Date(2026, 10, 7, 18, 0).getTime();

const tasks = [
  { id: "T12", title: "Shipping step", status: "claimed", created: 2 },
  { id: "T14", title: "Orders API tests", status: "claimed", created: 1 },
  { id: "T15", title: "Review step", status: "open", created: 3 },
  { id: "T16", title: "Payment step", status: "blocked", created: 4 },
  { id: "T11", title: "Cart drawer", status: "done", updated: today },
  { id: "T9", title: "Old", status: "done", updated: yesterday },
  { id: "T8", title: "Dropped", status: "cancelled" },
];
const cols = taskColumns(tasks, now);
assert.deepEqual(cols.now.map((t) => t.id), ["T14", "T12"], "Now: claimed, oldest first");
assert.deepEqual(cols.next.map((t) => t.id), ["T15"]);
assert.deepEqual(cols.blocked.map((t) => t.id), ["T16"]);
assert.deepEqual(cols.done.map((t) => t.id), ["T11"], "Done: today only");

const nb = { days: [
  { day: "2026-11-08", entries: [
    { time: "10:05", channel: "#perf", took: "1h 10m", did: "WebP images", hiccups: [{ text: "waited on approval (cost: ~15m)", cost: 15 }], lesson: "measure on a phone" },
    { time: "13:20", channel: "#checkout", took: "40m", did: "Split the form", hiccups: [{ text: "stale port (cost: ~10m)" }], needed: [{ kind: "skill", text: "free the port" }] },
  ] },
  { day: "2026-11-06", entries: [{ time: "09:00", took: "30m", did: "x", lessons: ["a", "b"] }] },
  { day: "2026-10-20", entries: [{ time: "09:00", took: "5h", did: "too old for the week" }] },
] };
const wk = weekStats(nb, now);
assert.deepEqual(wk, { days: 2, entries: 3, minutes: 140, hiccups: 2, hiccupMinutes: 25, lessons: 3, needed: 1 },
  "a hiccup without a numeric cost reads it from its (cost: ~Nm) text");

const td = todayEntries(nb, now);
assert.deepEqual(td.map((e) => e.time), ["13:20", "10:05"], "newest first");
assert.equal(td[0].hiccup, "stale port (cost: ~10m)");
assert.equal(td[1].lessonText, "measure on a phone");
assert.deepEqual(todayEntries({ days: [{ day: "2026-11-07", entries: [{ time: "1" }] }] }, now), [], "no entries today");

const brain = {
  mission: { statement: "Ship checkout.", focus: "Splitting the form", goals: [{ text: "a", done: true }, { text: "b", done: false }], done_when: [{ text: "c", done: false }] },
  decisions: ["2026-11-02 · Sam: Old one.", "2026-11-04 · Sam: WebP. Why: 2 MB.", "2026-11-06 · Sam: One store. Why: sync."],
  changelog: ["2026-11-08 #checkout: Split", "2026-11-07 #checkout: Drawer", "2026-11-05 #api-tests: Docs", "2026-11-03 #perf: WebP"],
  notes: [{ name: "notes/a.md" }],
};
const h = homeData({ brain, nb, tasks, now });
assert.equal(h.statement, "Ship checkout.");
assert.deepEqual(h.goals, { done: 1, total: 2 });
assert.deepEqual(h.doneWhen, { done: 0, total: 1 });
assert.equal(h.hasMission, true);
assert.deepEqual(h.decisions.map((x) => x.when), ["11-06", "11-04"], "newest decisions first");
assert.equal(h.decisions[0].who, "Sam");
assert.deepEqual(h.changes.map((x) => x.text), ["Split", "Drawer", "Docs"]);
assert.deepEqual(h.counts, { days: 3, decisions: 3, changes: 4, notes: 1 });

// A pal with nothing yet: Home still renders, empty.
const empty = homeData({ brain: null, nb: null, tasks: null, now });
assert.equal(empty.hasMission, false);
assert.deepEqual(empty.columns, { now: [], next: [], blocked: [], done: [] });
assert.equal(empty.week.entries, 0);
assert.deepEqual(empty.decisions, []);

console.log("test_vault: ok");
