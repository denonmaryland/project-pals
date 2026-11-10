// The welcome tour's words and small decisions (T76; mods/crew-home/welcome-text.js).
// Run: node tests/test_welcome.mjs
import assert from "node:assert/strict";
import { BEATS, beat, beatAt, pending, pickBrain, gated, palName, when } from "../mods/crew-home/welcome-text.js";

// Seven screens, each with something to say and one main button.
assert.equal(BEATS.length, 7);
for (const id of BEATS) {
  const b = beat(id, { head: "Orchestrator", owner: "Sam", brains: ["Claude Code"], folders: 2, pal: "Weather App", palBrain: "claude" });
  assert.ok(b.say && b.more && b.go, `${id} has words and a button`);
}

// Hello is the owner's own sentence, with the names filled in.
const hello = beat("hello", { head: "Orchestrator", owner: "Sam", brain: "Claude Code" });
assert.equal(hello.say, "Hello, I'm the Orchestrator.");
assert.match(hello.more, /oversees every other pal.*bird's-eye view.*talk to any pal for you/);
assert.equal(hello.fine, "I'll call you Sam · running on Claude Code");
assert.equal(beat("hello", { head: "Maestro", owner: "Sam" }).say, "Hello, I'm Maestro.");
assert.equal(beat("hello", { owner: "Sam" }).fine, "I'll call you Sam", "no brain yet: nothing is claimed");

// Nothing shipped names a real person or project.
for (const id of BEATS) for (const v of Object.values(beat(id, {}))) assert.doesNotMatch(JSON.stringify(v), /DeNon|Orca\b|project-pals/i);

// Screen 3: no brain → install one; folders → pick one; none → choose; hired → carry on; a replay counts pals.
assert.equal(beat("hire", { brains: [] }).check, true);
assert.equal(beat("hire", { brains: [] }).go, "Check again");
assert.equal(beat("hire", { brains: ["Codex"], folders: 3, pal: "Weather App" }).go, "Hire Weather App");
assert.equal(beat("hire", { brains: ["Codex"], folders: 0 }).go, "Choose a folder…");
assert.equal(beat("hire", { brains: ["Codex"], folders: 3, pal: "Weather App", hired: true }).go, "Next");
assert.equal(beat("hire", { brains: ["Codex"], folders: 3, pal: "Weather App", hired: true }).list, undefined, "a second click can't hire twice");
assert.match(beat("hire", { brains: ["Codex"], folders: 1, pals: 4, pal: "Docs Site" }).say, /You have 4 pals\. Hire another\?/);
assert.match(beat("hire", { brains: ["Codex"], folders: 1, pals: 1 }).say, /You have 1 pal\./);

// Screen 6 only promises the gate where it holds.
assert.ok(gated("claude") && gated("antigravity") && gated("agy"));
assert.ok(!gated("codex") && !gated("claude", false) && !gated(null));
assert.match(beat("charge", { palBrain: "claude", helpers: true }).more, /Only your click lets it through/);
assert.match(beat("charge", { palBrain: "codex", helpers: true }).more, /aren't covered by that gate yet/);
assert.match(beat("charge", { palBrain: "claude", helpers: false }).more, /isn't installed here/);

// Done: with a pal, go to it; without, say where to hire.
assert.equal(beat("done", { pal: "Weather App", hired: true }).go, "Go to Weather App");
assert.equal(beat("done", { pal: "Weather App", hired: false }).go, "Done");
assert.match(beat("done", {}).more, /the \+ at the bottom of the sidebar.*gear menu.*Welcome tour/);
assert.match(beat("talk", { pal: "Weather App" }).chips[2], /ask Weather App/);

// The head pal's brain: Claude Code, Antigravity, Codex, then whatever is installed.
const ag = (key, installed = true) => ({ key, name: key, installed });
assert.equal(pickBrain([ag("codex"), ag("claude")]).key, "claude");
assert.equal(pickBrain([ag("opencode"), ag("codex"), ag("claude", false)]).key, "codex");
assert.equal(pickBrain([ag("opencode")]).key, "opencode");
assert.equal(pickBrain([ag("claude", false)]), null);
assert.equal(pickBrain(undefined), null);

// Names and dates.
assert.equal(palName("/home/sam/Projects/weather-app"), "Weather App");
assert.equal(palName("~/code/my_cool.site/"), "My Cool Site");
assert.equal(palName(""), "My Project");
const now = Date.UTC(2026, 10, 9, 12);
assert.equal(when(now - 2 * 3600e3, now), "changed 2 hours ago");
assert.equal(when(now - 3600e3, now), "changed 1 hour ago");
assert.equal(when(now - 30 * 3600e3, now), "yesterday");
assert.equal(when(now - 3 * 86400e3, now), "3 days ago");

// The mark: "new" and "open" show the tour; none, done and skipped don't.
assert.ok(pending({ state: "new" }) && pending({ state: "open", beat: 3 }));
assert.ok(!pending(null) && !pending({}) && !pending({ state: "done" }) && !pending({ state: "skipped" }));
assert.equal(beatAt({ beat: 3 }), 3);
assert.equal(beatAt({ beat: 99 }), 6);
assert.equal(beatAt({ beat: -2 }), 0);
assert.equal(beatAt(null), 0);

console.log("welcome: ok");
