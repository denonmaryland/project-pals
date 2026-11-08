// T15: the Mission tab's Latest changes / Latest decisions rows.
// Run: node tests/test_loglines.mjs
import assert from "node:assert/strict";
import { parseLogLine as p } from "../mods/crew-profile/loglines.js";

// What `pal brain decide` writes: the name is who, the decision and its reason stay together.
assert.deepEqual(p("2026-11-04 · DeNon: Serve images as WebP. Why: the hero image was 2 MB."),
  { when: "11-04", who: "DeNon", text: "Serve images as WebP. Why: the hero image was 2 MB." });

assert.deepEqual(p("2026-11-04 · Project Pals - Herdr Mod: Retire the mascots."),
  { when: "11-04", who: "Project Pals - Herdr Mod", text: "Retire the mascots." });
// Short lowercase-led text before a colon isn't a name.
assert.deepEqual(p("2026-11-04 · Ship it: the tests pass."),
  { when: "11-04", who: "", text: "Ship it: the tests pass." });

// A hand-written decision: its own text before the colon is not a name (it was cut to "Serve produ…").
assert.deepEqual(p("2026-11-04 · Serve product images as WebP: the hero image was 2 MB."),
  { when: "11-04", who: "", text: "Serve product images as WebP: the hero image was 2 MB." });
assert.deepEqual(p("2026-11-06 · Keep the cart in one store: fewer sync bugs."),
  { when: "11-06", who: "", text: "Keep the cart in one store: fewer sync bugs." });

// A hand-written change with no colon: the date still goes in the date column.
assert.deepEqual(p("2026-11-08 · Shipping and Payment steps split out of CheckoutForm"),
  { when: "11-08", who: "", text: "Shipping and Payment steps split out of CheckoutForm" });

// What `pal brain log` writes.
assert.deepEqual(p("2026-11-08 #checkout (Juniper): Split the checkout form"),
  { when: "11-08", who: "Juniper", text: "Split the checkout form" });
assert.deepEqual(p("2026-11-08 #checkout: Split the checkout form"),
  { when: "11-08", who: "#checkout", text: "Split the checkout form" });
assert.deepEqual(p("2026-11-08 (Orca): Cart drawer reads the shared store"),
  { when: "11-08", who: "Orca", text: "Cart drawer reads the shared store" });
assert.deepEqual(p("2026-11-08: Plain entry: with a colon inside"),
  { when: "11-08", who: "", text: "Plain entry: with a colon inside" });

// Not dated: shown whole.
assert.deepEqual(p("just a note"), { when: "", who: "", text: "just a note" });
assert.deepEqual(p("2026-11-08"), { when: "11-08", who: "", text: "2026-11-08" });

console.log("test_loglines: ok");
