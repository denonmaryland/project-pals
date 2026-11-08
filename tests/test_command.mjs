// The command bar's search (T18): what matches, in which order, and how much fits.
// Run: node tests/test_command.mjs
import assert from "node:assert/strict";
import { search, scoreItem, pieces, mergeRanges, MAX_ROWS } from "../mods/crew-command/search.js";

const items = [
  { group: "Pals", label: "Theme Plugin - Omarchy", sub: "asleep" },
  { group: "Pals", label: "Orca", sub: "idle · #general" },
  { group: "Channels", label: "#theme-tokens", sub: "Theme Plugin - Omarchy" },
  { group: "Channels", label: "#review-the-diff", sub: "Project Pals" },
  { group: "Channels", label: "#general", sub: "Orca", words: ["Ship the release notes"] },
  { group: "Tasks", label: "T14 Rotate the logos on lock", sub: "Hello Lock" },
  { group: "Vault", label: "Mission", sub: "Vault", words: ["vault", "Orca"] },
  { group: "Commands", label: "Theme and look" },
  { group: "Commands", label: "Review changes", sub: "Orca" },
  { group: "Commands", label: "Check for updates" },
  { group: "Commands", label: "Project Pals settings", words: ["preferences"] },
];
const labels = (res) => res.flatMap((g) => g.items.map((x) => `${g.group}:${x.label}`));

// An empty query matches everything with no ranges (the mod shows its own empty list then).
assert.deepEqual(scoreItem("", items[0]), { score: 0, base: 0, ranges: [] });

// Prefix beats word start beats anywhere.
const pre = scoreItem("the", { label: "Theme and look" }).score;
const word = scoreItem("the", { label: "Rotate the logos" }).score;
const mid = scoreItem("the", { label: "together" }).score;
assert.ok(pre > word && word > mid, `prefix ${pre} > word ${word} > inside ${mid}`);

// Every word must match; order doesn't matter.
assert.equal(scoreItem("check zzz", items[9]), null);
assert.ok(scoreItem("updates check", items[9]));

// The best hit's group comes first: "upd" is only a command; "orca" is a pal before its Vault.
assert.equal(search("upd", items)[0].group, "Commands");
assert.equal(labels(search("upd", items))[0], "Commands:Check for updates");
assert.equal(search("orca", items)[0].group, "Pals");

// Ties keep the fixed order: Pals, Channels, Tasks, Vault, Commands.
const the = search("the", items);
assert.equal(the[0].group, "Pals");
assert.equal(the[0].items[0].label, "Theme Plugin - Omarchy");

// Letters in order find a label from a word's start ("rvch" → Review changes), not mid-word.
assert.ok(labels(search("rvch", items)).includes("Commands:Review changes"));
assert.equal(scoreItem("eme", { label: "Theme" })?.ranges[0][0], 2, "a plain substring still matches");
assert.equal(scoreItem("hm", { label: "Theme" }), null, "fuzzy needs a word start");

// Sub lines and extra words count, more weakly, and aren't bolded in the label.
const pref = scoreItem("preferences", items[10]);
assert.ok(pref && pref.ranges.length === 0);
assert.ok(labels(search("release notes", items)).includes("Channels:#general"), "a channel's task title is searchable");
assert.ok(scoreItem("lock", items[5]).score > scoreItem("hello", items[5]).score, "label beats sub");

// Ranges and pieces for bold.
assert.deepEqual(mergeRanges([[4, 6], [0, 3], [2, 5]]), [[0, 6]]);
assert.deepEqual(pieces("Theme and look", [[0, 3]]), [["The", true], ["me and look", false]]);
assert.deepEqual(pieces("abc", []), [["abc", false]]);
const two = scoreItem("look the", { label: "Theme and look" });
assert.deepEqual(two.ranges, [[0, 3], [10, 14]]);

// Caps: never more rows (group headers included) than fit the popup.
const many = Array.from({ length: 40 }, (_, i) => ({ group: ["Pals", "Channels", "Tasks", "Vault", "Commands"][i % 5], label: `item ${i}` }));
const res = search("item", many);
const rows = res.reduce((n, g) => n + 1 + g.items.length, 0);
assert.ok(rows <= MAX_ROWS, `${rows} rows fit in ${MAX_ROWS}`);
assert.equal(res.find((g) => g.group === "Pals").items.length, 4);

// No match: nothing.
assert.deepEqual(search("qqqq", items), []);
console.log("test_command: ok");
