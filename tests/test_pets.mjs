// The pocket pets' art (lib/pets.js): every file a pet needs, well-formed, and nothing drawn past
// the bare crop's left edge (tails and raised arms were cut there before 2026-11-09).
// Run: node tests/test_pets.mjs
import assert from "node:assert/strict";
import { petSpec, petFiles, petPath, pal, tileSvg, idScheme, PET_STATES, PET_SPECIES, BARE_VIEW, SMALL_VIEW, SMALL_BELOW } from "../lib/pets.js";

const p = petSpec({ name: "Orca", accessory: "claude", color: "#4fa8ff" });
const files = petFiles(p);
// Eight states and working's paw frame, boxed and open; eight heads, boxed and open.
assert.equal(files.length, 34);
assert.equal(new Set(files.map(([path]) => path)).size, 34, "paths are unique");
// The Look dialog picks open tiles by "-o.svg": the small heads must not match it.
assert.equal(files.filter(([path]) => path.endsWith("-o.svg")).length, 9);
assert.equal(files.filter(([path]) => path.endsWith("-s.svg")).length, 16);
assert.ok(petPath(p, "rest", 0, true, true).endsWith("-rest-o-s.svg"));
assert.equal(petPath(p, "work", 1), petPath(p, "work", 1, false, false));
// The head has the scene's shape, so it sits in the same box.
assert.ok(Math.abs(SMALL_VIEW[2] / SMALL_VIEW[3] - BARE_VIEW[2] / BARE_VIEW[3]) < 0.01);
assert.ok(SMALL_BELOW > 36 && SMALL_BELOW < 60, "compact rows (22-34 px) are heads, Large (75) the scene");

const ACC = ["phones", "glasses", "beanie", "cap", "scarf", "bow", "crown", "antenna", "flower", "hood"];
const EYES = ["dot", "big", "hollow", "sleepy", "visor", "cyclops", "wink", "angry", "dots"];
const wellFormed = (svg, what) => {
  assert.ok(svg.startsWith("<svg ") && svg.endsWith("</svg>"), what);
  assert.ok(!/NaN|undefined|null|Infinity/.test(svg), `${what}: no bad numbers`);
  const refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  for (const id of refs) assert.ok(svg.includes(`id="${id}"`), `${what}: #${id} is defined`);
  assert.equal((svg.match(/<g[ >]/g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length, `${what}: groups close`);
};
// Every x of the pal's own shapes (the absolute "x,y" pairs; relative arcs don't carry positions).
const minX = (L) => Math.min(...L.filter((l) => !l.back).flatMap((l) => [...l.d.matchAll(/[ML](-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map((m) => +m[1])));
for (const species of PET_SPECIES) for (const pose of PET_STATES) {
  const spec = { species, acc: [], eyes: "dot", pose, scheme: idScheme("#ff9e72", pose) };
  wellFormed(tileSvg(spec, { bare: true, back: "#131316" }), `${species} ${pose}`);
  wellFormed(tileSvg(spec, { small: true, back: "#131316" }), `${species} ${pose} head`);
  assert.ok(minX(pal(spec)) >= BARE_VIEW[0], `${species} ${pose}: nothing left of the crop (${minX(pal(spec))})`);
}
for (const a of ACC) wellFormed(tileSvg({ species: "kit", acc: [a], eyes: "dot", pose: "work", tap: true, scheme: idScheme("#a77bff", "work") }, { bare: true }), a);
for (const e of EYES) for (const pose of ["work", "rest", "done", "stuck"]) wellFormed(tileSvg({ species: "owl", acc: ["glasses"], eyes: e, pose, scheme: idScheme("#4fd6a0", pose) }, { bare: true }), `${e} ${pose}`);
// The working frames differ (the paw and the screen), the laptop is shut asleep, and the head has none.
assert.notEqual(tileSvg({ species: "kit", pose: "work", scheme: idScheme("#ff9e72", "work") }, { bare: true }).replace(/t\d+/g, "t"),
  tileSvg({ species: "kit", pose: "work", tap: true, scheme: idScheme("#ff9e72", "work") }, { bare: true }).replace(/t\d+/g, "t"));
const has = (spec, fill) => pal(spec).some((l) => l.fill === fill);
assert.ok(has({ species: "kit", pose: "work" }, "screen"));
assert.ok(!has({ species: "kit", pose: "rest" }, "screen"), "asleep: lid shut");
assert.ok(!has({ species: "kit", pose: "work", avatar: true }, "metal"), "head: no laptop");
console.log("pets ok");
