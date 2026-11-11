// The Desk's card format, JS side: lib/crew.js parseCard / renderCard must read and write exactly what
// bin/crewdesk.py does. Every tests/fixtures/desk/*.md parses to its sibling .json (written by the
// Python parser), or fails on the same line; render then parse gives the card back; and a card the
// Python side renders is rendered byte for byte the same here.
// Run: node tests/test_desk_parser.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "deskparse-"));
try {
  const mod = (name, src) => {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, type: "module", main: "index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  };
  mod("gpui-kit", `
    const el = () => new Proxy({}, { get: (t, k) => (k === "then" ? undefined : () => el()) });
    export const div = el, svg = el, image = el; export class View {}`);
  mod("gpui-base", `export const v_flex = () => null, h_flex = () => null;`);
  mod("herdr", `
    const nop = () => {};
    export const spaces = () => [], agents = () => [], panes = () => [], shared = () => undefined, setShared = nop;
    export const exec = async () => ({ stdout: "", stderr: "", code: 0 });
    export const theme = () => ({}), home = () => "/h", appHome = () => "/h/.config/herdr-app", layout = () => null, keys = () => [];
    export const run = nop, notify = nop, openOverlay = nop, closeOverlay = nop, hc = exec, readTextFile = async () => null, writeTextFile = async () => {}, knownAgents = async () => [];
  `);
  for (const f of ["crew.js", "pets.js", "palstyles.js", "pallook.js", "factories.js", "helperlog.js", "machines.js"]) copyFileSync(join(root, "lib", f), join(dir, f));
  const crew = await import(pathToFileURL(join(dir, "crew.js")).href);

  const fx = join(root, "tests", "fixtures", "desk");
  const mds = readdirSync(fx).filter((f) => f.endsWith(".md")).sort();
  assert.ok(mds.length >= 5, "the fixtures are there");
  for (const f of mds) {
    const text = readFileSync(join(fx, f), "utf8");
    const want = JSON.parse(readFileSync(join(fx, f.replace(/\.md$/, ".json")), "utf8"));
    if ("error_line" in want) {
      assert.throws(() => crew.parseCard(text), (e) => e.line === want.error_line, `${f}: fails on line ${want.error_line}`);
      continue;
    }
    const card = crew.parseCard(text);
    assert.deepEqual(card, want, `${f}: the same card as the Python parser`);
    assert.deepEqual(crew.parseCard(crew.renderCard(card)), card, `${f}: render then parse gives it back`);
  }

  // Byte for byte: a card rendered by Python (bin/crewdesk.py render) when python3 is here.
  const { spawnSync } = await import("node:child_process");
  const py = spawnSync("python3", ["-c", `
import json, sys, os
sys.path.insert(0, ${JSON.stringify(join(root, "bin"))})
os.environ["CREW_DATA"] = ${JSON.stringify(join(dir, "data"))}
import crewdesk
for f in sys.argv[1:]:
    c = json.load(open(f))
    if "error_line" in c: continue
    sys.stdout.write(json.dumps({"f": f, "text": crewdesk.render(c)}) + "\\n")
`, ...mds.map((f) => join(fx, f.replace(/\.md$/, ".json")))], { encoding: "utf8" });
  if (py.status === 0) {
    const lines = py.stdout.trim().split("\n").filter(Boolean);
    assert.ok(lines.length >= 3, "python rendered the readable fixtures");
    for (const l of lines) {
      const { f, text } = JSON.parse(l);
      assert.equal(crew.renderCard(JSON.parse(readFileSync(f, "utf8"))), text, `${f}: rendered the same as Python`);
    }
  } else {
    console.log("(python3 render check skipped: " + (py.stderr || "").trim().split("\n").pop() + ")");
  }

  // Bodies that look like the card's own headings stay body text.
  const tricky = { id: "c-123456", kind: "tell", status: "queued", title: "T", body: "## Receipts\n\\## Reply\nok", reply: "## Reply", receipts: [] };
  const back = crew.parseCard(crew.renderCard(tricky));
  assert.equal(back.body, tricky.body);
  assert.equal(back.reply, tricky.reply);
  assert.deepEqual(back.receipts, []);
  // JSON values and odd strings survive.
  const odd = { id: "c-654321", title: "x", attachments: ["a.png", "b.png"], note: " padded ", relaying: "[bracket" , receipts: [], body: "", reply: null };
  const o2 = crew.parseCard(crew.renderCard(odd));
  assert.deepEqual(o2.attachments, odd.attachments);
  assert.equal(o2.note, " padded ");
  assert.equal(o2.relaying, "[bracket");

  // Helpers.
  assert.equal(crew.deskSlug("Project Pals - Herdr Mod"), "project-pals-herdr-mod");
  assert.equal(crew.deskSlug("!!"), "x");
  console.log("desk parser: ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
