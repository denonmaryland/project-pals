// Codex review H4: a review or edit started for pal A must never land on pal B.
// Run: node tests/test_bind.mjs
import assert from "node:assert/strict";
import { targetOf, followShown, stillTarget } from "../mods/crew-profile/bind.js";

const A = { space: { id: "spA" }, bot: { name: "Pal A", folder: "/p/a" } };
const B = { space: { id: "spB" }, bot: { name: "Pal B", folder: "/p/b" } };
const view = {};

// The panel shows A; a review starts (its diff is still being made).
followShown(view, A);
const job = { target: targetOf(A, "/p/a"), gen: view.gen };
assert.ok(stillTarget(view, job, A, "/p/a"), "same pal: still valid");

// Switch to B before the diff finishes: B's state is reset, and A's late result must be dropped.
view.review = { stale: true };
assert.equal(followShown(view, B), true);
assert.equal(view.review, null, "switching pals drops the old review");
assert.equal(stillTarget(view, job, B, "/p/b"), false, "A's review isn't valid for B");

// Even back on A, the old job belongs to an older generation: it must be made again.
followShown(view, A);
assert.equal(stillTarget(view, job, A, "/p/a"), false, "a review from before the switch stays dropped");

// Same pal, folder changed (renamed / moved): refused too.
const job2 = { target: targetOf(A, "/p/a"), gen: view.gen };
assert.equal(stillTarget(view, job2, A, "/p/elsewhere"), false);

// Both files absent (expect=none) is exactly the case the base hash alone couldn't catch.
assert.equal(stillTarget(view, { target: targetOf(A, "/p/a"), gen: view.gen }, B, "/p/b"), false);
console.log("test_bind: ok");
