// The pal list's looks (Project Pals settings → Pal list style): the list, its fallback, and the
// facts the compact rows show (folder, task counts, progress, the Trees' live topics).
// Run: node tests/test_palstyles.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAL_LIST_STYLES, palListStyleOf, DEFAULT_PAL_LIST, petHeight, shortFolder, taskCounts, progressOf, liveTopics, chipWord, treesOn, textLeft, PAL_LIST_ALIASES } from "../lib/palstyles.js";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(root + p, "utf8");

// Large pets first (today's rows, the default), then the board's looks in its order, less Tree:
// that became the Trees option for every look (DeNon, 2026-11-08).
assert.deepEqual(PAL_LIST_STYLES.map((s) => s.name), ["Large pets", "Name + folder", "Two tight lines", "Name wraps", "Rich detail",
  "Table", "Progress", "Folder first", "Grouped", "Mini card"]);
assert.equal(DEFAULT_PAL_LIST, "large");
assert.equal(PAL_LIST_STYLES[0].id, "large");
assert.equal(new Set(PAL_LIST_STYLES.map((s) => s.id)).size, 10, "ids are unique");
PAL_LIST_STYLES.forEach((s, i) => assert.equal(s.n, i, "numbered as on the board"));
// The compact looks' pets are 22-34 px, as on the board; Large stays 75.
assert.deepEqual(PAL_LIST_STYLES.map((s) => s.pet), [75, 32, 26, 30, 28, 22, 28, 30, 24, 34]);
for (const s of PAL_LIST_STYLES) assert.ok(s.about.length > 20, `${s.id} says what it is`);
assert.equal(petHeight(32), 25);

// Unknown, missing or old values fall back to Large pets.
assert.equal(palListStyleOf(undefined).id, "large");
assert.equal(palListStyleOf("nope").id, "large");
// A saved "tree" (the look that went) shows as Two tight lines: the same 26 px pet and two lines.
assert.equal(palListStyleOf("tree").id, "tight");
assert.deepEqual(PAL_LIST_ALIASES, { tree: "tight" });

// Trees is on unless it's been turned off.
assert.equal(treesOn(undefined), true);
assert.equal(treesOn({}), true);
assert.equal(treesOn({ palTrees: true }), true);
assert.equal(treesOn({ palTrees: false }), false);
// The topic rows line up with each look's text column.
assert.equal(textLeft(palListStyleOf("large")), 8 + 75 + 12);
assert.equal(textLeft(palListStyleOf("tight")), 8 + 26 + 10);
assert.equal(textLeft(palListStyleOf("table")), 8 + 22 + 8 + 7 + 8);
assert.equal(textLeft(palListStyleOf("card")), 1 + 8 + 34 + 10);

// Folders: home as "~"; the relative form drops the usual projects folder only.
assert.equal(shortFolder("/home/denon/Projects/project-pals", "/home/denon"), "~/Projects/project-pals");
assert.equal(shortFolder("/home/denon/Projects/project-pals", "/home/denon", true), "project-pals");
assert.equal(shortFolder("/home/denon/.config/herdr-app/data/crew-god", "/home/denon", true), "~/.config/herdr-app/data/crew-god");
assert.equal(shortFolder("/home/denonx/x", "/home/denon"), "~/x", "another user's home is still shortened, not treated as ours");
assert.equal(shortFolder("/srv/app", "/home/denon"), "/srv/app");
assert.equal(shortFolder(null, "/home/denon"), "");
assert.equal(shortFolder("/home/denon/Projects/", "/home/denon", true), "~/Projects/", "the projects folder itself stays as is");

// Task counts: open = open, claimed, blocked; done = finished in the last day; others ignored.
const now = 1_000_000_000_000;
const tasks = [
  { assignee: "Softly", status: "open" }, { assignee: "Softly", status: "claimed" }, { assignee: "Softly", status: "blocked" },
  { assignee: "Softly", status: "done", updated: now - 3600_000 }, { assignee: "Softly", status: "done", updated: now - 3 * 86400_000 },
  { assignee: "Softly", status: "cancelled" }, { assignee: "Orca", status: "open" },
];
const c = taskCounts(tasks, (t) => t.assignee === "Softly", now);
assert.deepEqual(c, { open: 3, done: 1, total: 4 });
assert.deepEqual(progressOf(c), { frac: 0.25, label: "1/4 tasks" });
assert.equal(progressOf(taskCounts([], () => true, now)), null, "no bar without tasks");
assert.deepEqual(taskCounts(null, () => true, now), { open: 0, done: 0, total: 0 });

// Trees: only a pal with something working or asking unfolds; asks you first, then working,
// then done, latest first; capped with a count of the rest.
assert.deepEqual(liveTopics([{ status: "done" }, { status: "idle" }]), { list: [], more: 0 }, "merely done stays one row");
const tabs = [
  { id: "a", status: "working", changed_at: 5 }, { id: "b", status: "done", changed_at: 9 }, { id: "c", status: "blocked", changed_at: 1 },
  { id: "d", status: "idle", changed_at: 99 }, { id: "e", status: "working", changed_at: 7 }, { id: "f", status: "done", changed_at: 2 },
];
const live = liveTopics(tabs, 4);
assert.deepEqual(live.list.map((t) => t.id), ["c", "e", "a", "b"]);
assert.equal(live.more, 1);
assert.deepEqual(liveTopics(undefined), { list: [], more: 0 });

assert.equal(chipWord("Working · 7m"), "Working");
assert.equal(chipWord("Done"), "Done");

// Wiring: the installer copies palstyles.js next to crew.js in every mod (crew.js imports it); the
// sidebar draws every pal row through the shared renderer, the setting is "palList", and Project
// Pals settings opens the dialog.
assert.match(read("install.sh"), /cp "\$src\/lib\/palstyles\.js" "\$dest\/palstyles\.js"/);
// main.js goes into each mod last, after the shared JS: a hot reload between the two kept the old
// crew.js live (2026-11-08, Trees didn't show). The mirror leaves main.js and the shared JS alone.
{
  const ins = read("install.sh");
  const loop = ins.slice(ins.indexOf('for dir in "$src"/mods/crew-*; do'), ins.indexOf("done", ins.indexOf('for dir in "$src"/mods/crew-*; do')));
  const at = (x) => { const i = loop.indexOf(x); assert.ok(i >= 0, `install loop has ${x}`); return i; };
  const main = at('cp "$dir/main.js"');
  for (const lib of ["crew.js", "pets.js", "palstyles.js"]) assert.ok(at(`cp "$src/lib/${lib}"`) < main, `${lib} is copied before main.js`);
  // By content since T90 (the Live channel): a file that's the same isn't rewritten, so only the mods
  // that changed reload. The order is the same.
  assert.ok(at("rsync -rlpD --checksum -i --delete") < main, "the mod's other files before main.js");
  assert.match(loop, /--exclude '\/main\.js'/);
  assert.match(loop, /--exclude '\/crew\.js'/);
}
const crew = read("lib/crew.js");
assert.match(crew, /from "\.\/palstyles\.js"/);
assert.match(crew, /palListStyleOf\(shared\("crew\.settings"\)\?\.palList\)/);
const roster = read("mods/crew-roster/main.js");
assert.ok((roster.match(/palLookRow\(/g) ?? []).length >= 2, "pal rows and sleeper rows use the shared renderer");
assert.match(roster, /this\.dragOver\(e, cx, \{ id: bot\.id, gid/, "rows keep dragging");
assert.match(roster, /on_mouse_down\("right"[^\n]*this\.menu\(space\)/, "rows keep their right-click menu");
assert.match(roster, /palLookTree\([^\n]*this\.go\(space, tab\)/, "the Trees' topics open their own topic");
assert.match(roster, /palLookTree\([\s\S]{0,300}what: "tab", space: space\.id, tab: tab\.id/, "right-click on a topic is its menu");
assert.match(read("mods/crew-about/main.js"), /"Pal list style"[\s\S]{0,400}openPalStyle\(\)/);
const dlg = read("mods/crew-palstyle/main.js");
assert.match(dlg, /saveUiSettings\(\{ palList: id \}\)/, "a click saves the look");
assert.match(dlg, /if \(!keep\) \{ this\.pick\(this\.was\); this\.setTrees\(this\.wasTrees\); \}/, "Cancel and Esc put the old look and Trees back");
assert.match(dlg, /saveUiSettings\(\{ palTrees: on \}\)/, "the Trees toggle saves palTrees");
assert.match(dlg, /palLookRow\(/, "the preview uses the sidebar's renderer");
assert.equal(JSON.parse(read("mods/crew-palstyle/mod.json")).place, "none");

// Every style has a branch in the renderer (else it would silently draw Large pets).
const body = crew.slice(crew.indexOf("export function palLookRow("), crew.indexOf("export function palLookTree("));
for (const s of PAL_LIST_STYLES.slice(1)) assert.ok(body.includes(`case "${s.id}":`), `palLookRow draws ${s.id}`);

console.log("palstyles: ok");
