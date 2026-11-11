// Pal look (lib/pallook.js): the colour presets for the pets and their laptop screens, and what
// they hand to the renderer (lib/pets.js). Run: node tests/test_pallook.mjs
import assert from "node:assert/strict";
import { crewLook, palLookOf, splitSizes, splitPart, projectOf, steadyColors, themeColors, contrastOf, pairFit, isDefaultLook,
  PET_LOOKS, SCREEN_LOOKS, SPLIT_PALETTES, BRAIN_COLORS, STATE_COLORS, GROUP_COLORS, DEFAULT_PAL_LOOK, NEUTRAL_SCREEN } from "../lib/pallook.js";
import { petSpec, petKey, petFiles, petPath, PET_STATES, STATE_LIGHT } from "../lib/pets.js";

const HEX = /^#[0-9a-f]{6}$/;
const crew = (n) => Array.from({ length: n }, (_, i) => ({ name: `${["Lumen", "Harbor", "Kite", "Orbit"][i % 4]} - ${i}`, own: ["#e0866a", "#6f9cf0", "#f0b245"][i % 3],
  brain: ["claude", "codex", "gemini", "hermes"][i % 4], factory: i < n / 2 ? "Studio" : "Platform" }));

// The saved choice: anything unknown or broken is today's look.
assert.deepEqual(palLookOf(undefined), DEFAULT_PAL_LOOK);
assert.deepEqual(palLookOf({ pets: "nope", screen: 7, color: "red", count: 9, palette: "x", group: "x", screenColor: "#12" }), DEFAULT_PAL_LOOK);
assert.equal(palLookOf({ pets: "split", count: 4, palette: "dusk", color: "#AABBCC" }).color, "#aabbcc");
assert.ok(isDefaultLook(palLookOf(null)) && !isDefaultLook(palLookOf({ pets: "one" })));

// Today's look changes nothing: every pal its own colour, no tones, no screen, so the same files.
{ const pals = crew(8), looks = crewLook(null, pals);
  looks.forEach((l, i) => assert.deepEqual(l, { color: pals[i].own }));
  const before = petSpec({ name: "Lumen - 0", accessory: "claude", color: "#e0866a" });
  const after = petSpec({ name: "Lumen - 0", accessory: "claude", ...looks[0] });
  assert.equal(petKey(after), petKey(before), "a pet without a look keeps its key"); }

// All one colour.
assert.ok(crewLook({ pets: "one", color: "#4fa8ff" }, crew(5)).every((l) => l.color === "#4fa8ff"));

// Split by count: 8 pals are 4+4, 3+3+2, 2+2+2+2, down the list; fewer pals than colours still works.
assert.deepEqual(splitSizes(8, 2), [4, 4]);
assert.deepEqual(splitSizes(8, 3), [3, 3, 2]);
assert.deepEqual(splitSizes(8, 4), [2, 2, 2, 2]);
assert.deepEqual(splitSizes(12, 3), [4, 4, 4]);
assert.deepEqual(splitSizes(1, 4), [1]);
assert.deepEqual(splitSizes(0, 2), [0]);
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => splitPart(i, 8, 3)), [0, 0, 0, 1, 1, 1, 2, 2]);
for (const sp of SPLIT_PALETTES) for (const k of [2, 3, 4]) {
  const looks = crewLook({ pets: "split", count: k, palette: sp.id }, crew(8));
  assert.equal(new Set(looks.map((l) => l.color)).size, k, `${sp.id} ${k}`);
  assert.equal(looks[0].color, sp.colors[0]);
  assert.equal(looks[7].color, sp.colors[k - 1]);
}
assert.equal(crewLook({ pets: "split", count: 4 }, crew(1))[0].color, SPLIT_PALETTES[0].colors[0]);
assert.deepEqual(crewLook({ pets: "split" }, []), []);

// By brain.
{ const looks = crewLook({ pets: "brain" }, crew(4));
  assert.deepEqual(looks.map((l) => l.color), [BRAIN_COLORS.claude, BRAIN_COLORS.codex, BRAIN_COLORS.gemini, BRAIN_COLORS.hermes]);
  assert.equal(crewLook({ pets: "brain" }, [{ name: "x", brain: "something-new" }])[0].color, BRAIN_COLORS.other); }

// By state: the pal carries a colour per state, the same ones the tiles' screens use.
{ const [l] = crewLook({ pets: "state" }, crew(1));
  assert.deepEqual(Object.keys(l.tones).sort(), [...PET_STATES].sort());
  for (const st of PET_STATES) assert.equal(l.tones[st], STATE_LIGHT[st].toLowerCase(), st);
  assert.deepEqual(STATE_COLORS, Object.fromEntries(Object.entries(STATE_LIGHT).map(([k, v]) => [k, v.toLowerCase()]))); }

// By project or factory: one colour per group, different groups never share while colours last.
assert.equal(projectOf({ name: "Lumen - Web" }), "Lumen");
assert.equal(projectOf({ name: "Solo", folder: "/home/x/Projects/solo/" }), "solo");
assert.equal(projectOf({ name: "Solo" }), "Solo");
assert.equal(projectOf({ name: "Lumen - Web", project: "Other" }), "Other");
{ const pals = crew(8), looks = crewLook({ pets: "group", group: "project" }, pals);
  const by = {}; pals.forEach((p, i) => (by[projectOf(p)] ??= new Set()).add(looks[i].color));
  assert.ok(Object.values(by).every((s) => s.size === 1), "a project has one colour");
  assert.equal(new Set(looks.map((l) => l.color)).size, 4, "four projects, four colours");
  const fac = crewLook({ pets: "group", group: "factory" }, pals);
  assert.equal(new Set(fac.map((l) => l.color)).size, 2);
  assert.equal(fac[0].color, fac[3].color); assert.notEqual(fac[0].color, fac[7].color); }
// Steady: adding a group never moves one it doesn't collide with, and order doesn't matter.
{ const a = steadyColors(["Kite", "Lumen", "Harbor"], GROUP_COLORS), b = steadyColors(["Harbor", "Kite", "Lumen"], GROUP_COLORS);
  assert.deepEqual(a, b);
  assert.equal(new Set(Object.values(steadyColors(Array.from({ length: GROUP_COLORS.length }, (_, i) => `g${i}`), GROUP_COLORS))).size, GROUP_COLORS.length, "no repeats until the palette is used up");
  assert.equal(Object.keys(steadyColors(Array.from({ length: 30 }, (_, i) => `g${i}`), GROUP_COLORS)).length, 30, "more groups than colours still get one each"); }

// Match the theme: its ANSI hues, without near-repeats; a bare theme is topped up.
{ const tokyo = { accent: "#7aa2f7", ansi: ["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6", "#414868", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5"] };
  const cols = themeColors(tokyo);
  assert.deepEqual(cols, ["#7aa2f7", "#9ece6a", "#e0af68", "#bb9af7", "#7dcfff", "#f7768e"], "brights that repeat are dropped");
  assert.ok(themeColors(null).length >= 3 && themeColors({ ansi: ["#000000"] }).every((c) => HEX.test(c)));
  const looks = crewLook({ pets: "theme", screen: "one" }, crew(6), { theme: tokyo });
  assert.ok(looks.every((l) => cols.includes(l.color)));
  assert.equal(new Set(looks.map((l) => l.color)).size, 6);
  assert.ok(looks.every((l) => l.screen === "#7aa2f7"), "screens take the accent until you pick one");
  assert.ok(crewLook({ pets: "theme", screen: "one", screenColor: "#ff0000" }, crew(2), { theme: tokyo }).every((l) => l.screen === "#ff0000")); }

// Screens.
assert.ok(crewLook({ screen: "state" }, crew(3)).every((l) => !("screen" in l)));
{ const pals = crew(3);
  crewLook({ screen: "match" }, pals).forEach((l, i) => assert.equal(l.screen, pals[i].own));
  crewLook({ screen: "contrast" }, pals).forEach((l, i) => assert.equal(l.screen, contrastOf(pals[i].own)));
  assert.ok(crewLook({ screen: "one", screenColor: "#abcdef" }, pals).every((l) => l.screen === "#abcdef"));
  const st = crewLook({ pets: "state", screen: "match" }, pals)[0];
  assert.deepEqual(st.screen, st.tones, "by state + match: the screen follows the pal through its states");
  assert.equal(crewLook({ pets: "state", screen: "contrast" }, pals)[0].screen.work, contrastOf(STATE_COLORS.work)); }
// The contrast colour is across the wheel, bright, and a grey pal gets the cool white.
for (const c of ["#e0866a", "#4fa8ff", "#a77bff", "#4fd6a0", "#ffb238", "#1b3a8a"]) {
  const o = contrastOf(c); assert.match(o, HEX); assert.notEqual(o, c);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(o.slice(i, i + 2), 16)); assert.ok(Math.max(r, g, b) > 200, `${c} → ${o} is bright`);
}
for (const c of ["#e8e6f0", "#8f96b3".replace("b3", "9a"), "#ffffff", "#000000", "nope", undefined]) assert.equal(contrastOf(c), NEUTRAL_SCREEN);

// Every pair has a verdict and a reason.
for (const p of PET_LOOKS) for (const s of SCREEN_LOOKS) { const f = pairFit(p.id, s.id); assert.ok(["best", "good", "weak"].includes(f.fit) && f.why.length > 10, `${p.id}+${s.id}`); }
assert.equal(pairFit("own", "state").fit, "best");
for (const p of PET_LOOKS) assert.ok(SCREEN_LOOKS.some((s) => pairFit(p.id, s.id).fit === "best"), `${p.id} has a best screen`);

// What it hands the renderer: a look makes its own files, drawn in its colours.
{ const [l] = crewLook({ pets: "state", screen: "one", screenColor: "#abcdef" }, crew(1));
  const p = petSpec({ name: "Lumen - 0", accessory: "claude", ...l }), plain = petSpec({ name: "Lumen - 0", accessory: "claude", color: l.color });
  assert.notEqual(petKey(p), petKey(plain));
  const files = Object.fromEntries(petFiles(p));
  assert.equal(Object.keys(files).length, 34);
  const work = files[petPath(p, "work")], ask = files[petPath(p, "ask")];
  assert.ok(work.includes(`fill="${STATE_COLORS.work}"`) && ask.includes(`fill="${STATE_COLORS.ask}"`), "the pal glows in the state's colour");
  assert.ok(work.includes('fill="#abcdef"') && ask.includes('fill="#abcdef"'), "the screen is the picked colour");
  assert.ok(!/NaN|undefined|null/.test(work + ask)); }
{ // A screen colour alone: the pal is unchanged, only the screen and its light.
  const a = petSpec({ name: "x", accessory: "codex", color: "#e0866a" }), b = petSpec({ name: "x", accessory: "codex", color: "#e0866a", screen: "#ff00aa" });
  assert.notEqual(petKey(a), petKey(b));
  const fa = Object.fromEntries(petFiles(a)), fb = Object.fromEntries(petFiles(b));
  assert.ok(fb[petPath(b, "work")].includes("#ff00aa") && !fa[petPath(a, "work")].includes("#ff00aa"));
  const drawn = (svg) => svg.replace(/<defs>.*<\/defs>/, "").replace(/t\d+/g, "t");   // what's painted (the unused screen-light gradient aside)
  assert.ok(drawn(fa[petPath(a, "rest")]) === drawn(fb[petPath(b, "rest")]), "asleep: the lid is shut, no screen to colour");
  assert.ok(drawn(fa[petPath(a, "work")]) !== drawn(fb[petPath(b, "work")]));
  // Bad values are dropped, not drawn.
  assert.equal(petKey(petSpec({ name: "x", accessory: "codex", color: "#e0866a", screen: "red", tones: { work: "blue" } })), petKey(a)); }
console.log("pallook ok");
