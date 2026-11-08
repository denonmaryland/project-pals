// The pal list's looks (Project Pals settings → Pal list style, DeNon 2026-11-08), kept pure (no
// Herdr imports) so node tests can cover it: node tests/test_palstyles.mjs. install.sh copies this
// file into every mod next to crew.js, which draws the rows (crew.js palLookRow).
//
// "Large pets" is today's 75 px pet row and stays the default. The other ten are DeNon's compact
// board (crew-boards/compact-pals): smaller pets (22-34 px), so the full name, the project folder,
// the branch, the brain, channel and task counts fit. Saved as "palList" in crew-settings.json.

// id, name, the pet's width (its height is 78% of that), and what the dialog says about it.
export const PAL_LIST_STYLES = [
  ["large", "Large pets", 75, "Today's rows: a big pet, the name, then the state and #channel."],
  ["folder", "Name + folder", 32, "The full name on its own line, then state · #channel, then the project folder."],
  ["tight", "Two tight lines", 26, "The name and time, then folder · branch. The state is a dot on the pet."],
  ["wrap", "Name wraps", 30, "Long names wrap to two lines instead of cutting off. The state under them."],
  ["rich", "Rich detail", 28, "Name; folder · branch; then the brain's logo, the state, channel and task counts."],
  ["table", "Table", 22, "One line each: dot, name, channels, open tasks, time. Like a file list."],
  ["tree", "Tree", 26, "Compact rows; a working pal unfolds its live channels underneath."],
  ["progress", "Progress", 28, "A hairline bar of the pal's tasks (done of all) under the name."],
  ["project", "Folder first", 30, "The project folder is the headline in mono; the pal's name small above it."],
  ["grouped", "Grouped", 24, "Tight rows under folder headers, so twice as many pals fit."],
  ["card", "Mini card", 34, "Each pal a quiet card: the full name, the folder, a state chip on the right."],
].map(([id, name, pet, about], i) => ({ id, n: i, name, pet, about }));

export const DEFAULT_PAL_LIST = "large";
export const palListStyleOf = (id) => PAL_LIST_STYLES.find((x) => x.id === id) ?? PAL_LIST_STYLES[0];
export const petHeight = (w) => Math.round(w * 0.78);

// A folder as the rows show it: the home folder as "~". `rel`: also drop the usual projects folder
// ("~/Projects/softly" → "softly"), as the Tree and Folder first looks do.
const PROJECT_ROOTS = ["~/Projects/", "~/projects/", "~/Code/", "~/code/", "~/src/", "~/dev/"];
export function shortFolder(path, home = "", rel = false) {
  if (!path) return "";
  let p = String(path);
  if (home && (p === home || p.startsWith(home.endsWith("/") ? home : home + "/"))) p = "~" + p.slice(home.replace(/\/$/, "").length);
  else p = p.replace(/^\/home\/[^/]+(?=\/|$)/, "~").replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
  if (rel) for (const r of PROJECT_ROOTS) if (p.startsWith(r) && p.length > r.length) return p.slice(r.length);
  return p;
}

// A pal's tasks for the counts and the progress bar: `open` = open, claimed or blocked; `done` =
// finished in the last day (the Tasks view's "Done today"). `mine(task)` says whether it's this pal's.
const ACTIVE = new Set(["open", "claimed", "blocked"]);
export function taskCounts(tasks, mine, now = Date.now()) {
  let open = 0, done = 0;
  for (const t of tasks ?? []) {
    if (!mine(t)) continue;
    if (ACTIVE.has(t.status)) open++;
    else if (t.status === "done" && now - (t.updated ?? 0) < 86400000) done++;
  }
  return { open, done, total: open + done };
}
// The Progress look's bar and words: null without any tasks.
export function progressOf(c) {
  if (!c || !c.total) return null;
  return { frac: c.done / c.total, label: `${c.done}/${c.total} tasks` };
}

// The Tree look's live channels: the ones working, asking or just finished, most urgent first
// (asks you, working, done), then the latest; at most `max`, and how many more there are. Only
// for a pal with something working or asking (a pal that's merely done stays one row).
const LIVE_RANK = { blocked: 3, working: 2, done: 1 };
export function liveChannels(tabs, max = 4) {
  const live = (tabs ?? []).filter((t) => LIVE_RANK[t.status]);
  if (!live.some((t) => t.status === "working" || t.status === "blocked")) return { list: [], more: 0 };
  live.sort((x, y) => LIVE_RANK[y.status] - LIVE_RANK[x.status] || (y.changed_at ?? 0) - (x.changed_at ?? 0));
  return { list: live.slice(0, max), more: Math.max(0, live.length - max) };
}

// The Mini card's chip: the state word without its time ("Working · 7m" → "Working").
export const chipWord = (word) => String(word ?? "").split(" ·")[0];
