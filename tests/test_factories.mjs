// Factories (T66): the app's side of the model (lib/factories.js), which must agree with
// bin/crewfactories.py. Run: node tests/test_factories.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanFactories, NO_FACTORIES, factoryList, severalFactories, currentFactoryOf, factoryOfPal, factoryOfItem, palShown, itemShown,
  needsByFactory, needsElsewhere, DEFAULT_FACTORY, FACTORY_TEMPLATES, templateOf } from "../lib/factories.js";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(root + p, "utf8");
const who = { owner: "Dee", head: "Boss", headTopic: "ops" };

// No file, a broken one, junk: one factory, the default, named after the owner, the head pal its foreman.
for (const raw of [null, undefined, "x", [], {}, { factories: "no" }, { current: "f-gone1", factories: [{ id: "bad id", name: "x" }, 7, { id: "f-abcd" }], pals: { W: "f-gone1" } }]) {
  const st = cleanFactories(raw);
  assert.equal(severalFactories(st), false);
  assert.equal(st.current, DEFAULT_FACTORY);
  assert.deepEqual(st.pals, {});
  const l = factoryList(st, who);
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].id, l[0].name, l[0].foreman, l[0].foremanTopic, l[0].template, l[0].default], ["default", "Dee's crew", "Boss", "ops", "project-crew", true]);
  // With one factory everything is shown, whoever it is.
  assert.equal(palShown(st, "Anyone", "Boss"), true);
  assert.equal(itemShown(st, { factory: "f-other1", by: "X#y" }, "Boss"), true);
  assert.equal(needsElsewhere(st, [{ pal: "A" }, { pal: "B" }], "Boss"), 0);
}
assert.equal(factoryList(NO_FACTORIES, {})[0].name, "Your crew");

const st = cleanFactories({ current: "f-app001", default_name: "  Omarchy   mods ", factories: [
  { id: "f-app001", name: "Example app", template: "platform-lanes", foreman: "Mac", foreman_topic: "#lead", color: "#112233" },
  { id: "f-app001", name: "A duplicate id" }, { id: "f-two002", name: "Two", template: "nope", color: "red" }],
  pals: { Mac: "f-app001", "Web-Core": "f-app001", Ghost: "f-none00" } });
assert.equal(severalFactories(st), true);
assert.deepEqual(factoryList(st, who).map((f) => f.name), ["Omarchy mods", "Example app", "Two"]);
assert.deepEqual(st.factories[0], { id: "f-app001", name: "Example app", template: "platform-lanes", foreman: "Mac", foremanTopic: "lead", color: "#112233" });
assert.equal(st.factories[1].template, "project-crew", "an unknown template is Project crew");
assert.match(st.factories[1].color, /^#[0-9A-F]{6}$/i);
assert.deepEqual(Object.keys(st.pals), ["Mac", "Web-Core"], "a pal in a factory that's gone is back in the default one");
assert.equal(currentFactoryOf(st, who).name, "Example app");

// Who is where: by name, case and dashes aside; the head pal never leaves the default factory.
assert.equal(factoryOfPal(st, "mac", "Boss"), "f-app001");
assert.equal(factoryOfPal(st, "web core", "Boss"), "f-app001");
assert.equal(factoryOfPal(st, "Worker", "Boss"), "default");
assert.equal(factoryOfPal({ ...st, pals: { Boss: "f-app001" } }, "Boss", "Boss"), "default");
assert.equal(palShown(st, "Mac", "Boss"), true);
assert.equal(palShown(st, "Worker", "Boss"), false);
assert.equal(palShown({ ...st, current: "default" }, "Worker", "Boss"), true);

// A Home item: its stamp while that factory exists, else the pal it's about, else who added it.
assert.equal(factoryOfItem(st, { factory: "default", by: "Mac#lead" }, "Boss"), "default");
assert.equal(factoryOfItem(st, { factory: "f-two002", by: "Worker#x" }, "Boss"), "f-two002");
assert.equal(factoryOfItem(st, { factory: "f-gone00", topic: "Mac#lead", by: "Boss#ops" }, "Boss"), "f-app001");
assert.equal(factoryOfItem(st, { topic: "Mac#lead", by: "Boss#ops" }, "Boss"), "f-app001");
assert.equal(factoryOfItem(st, { by: "Worker#x" }, "Boss"), "default");
assert.equal(factoryOfItem(st, {}, "Boss"), "default");
assert.equal(itemShown(st, { by: "Mac#lead" }, "Boss"), true);
assert.equal(itemShown(st, { by: "Worker#x" }, "Boss"), false);

// The chip counts what the OTHER factories need.
const needs = [{ pal: "Mac" }, { pal: "Worker" }, { pal: "Boss" }, { pal: "Nobody" }, { pal: "x", factory: "f-two002" }];
assert.deepEqual(needsByFactory(st, needs, "Boss"), { "f-app001": 1, default: 3, "f-two002": 1 });
assert.equal(needsElsewhere(st, needs, "Boss"), 4);
assert.equal(needsElsewhere({ ...st, current: "default" }, needs, "Boss"), 2);

assert.deepEqual(FACTORY_TEMPLATES.map((t) => t.id), ["project-crew", "platform-lanes"]);
assert.equal(templateOf("nope").id, "project-crew");

// Both sides name the same templates and the same file, and the installer ships this file to every mod.
const py = read("bin/crewfactories.py");
for (const t of FACTORY_TEMPLATES) assert.ok(py.includes(`"${t.id}": {"name": "${t.name}"`), `${t.id} is in crewfactories.TEMPLATES`);
assert.ok(py.includes('DATA / "crew-factories.json"'));
const ins = read("install.sh");
assert.ok(ins.includes('cp "$src/lib/factories.js" "$dest/factories.js"'), "install.sh copies factories.js into each mod");
assert.ok(ins.includes("--exclude '/factories.js'"), "and keeps it through the rsync");

console.log("factories: ok");
