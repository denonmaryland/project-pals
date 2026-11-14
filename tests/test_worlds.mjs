// Registry contracts: exact opt-in, packaged palettes/art, readable colors, and pet clearance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WORLDS, PIXEL_WORLD, worldForSettings } from '../lib/worlds.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const luminance = hex => {
  const [r,g,b] = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255)
    .map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*r + .7152*g + .0722*b;
};
const contrast = (a,b) => {const [hi,lo] = [luminance(a),luminance(b)].sort((a,b)=>b-a);return (hi+.05)/(lo+.05);};
assert.equal(WORLDS.length, 10);
assert.equal(new Set(WORLDS.map(w=>w.id)).size, 10);
assert.equal(new Set(WORLDS.map(w=>w.scene)).size, 10);
assert.equal(worldForSettings({theme:'pixel-village'}), PIXEL_WORLD);
for (const theme of [undefined, null, '', 'omarchy', 'graphite', 'paper', 'Pixel-Village', 'pixel-village-extra', '__proto__', 'constructor'])
  assert.equal(worldForSettings({theme}), null, String(theme));
const scenes = new Set();
for (const w of WORLDS) {
  assert.equal(worldForSettings({theme:w.id}), w);
  assert.equal(worldForSettings({theme:{dark:w.id,light:'paper'},dark:true}), w);
  assert.equal(worldForSettings({theme:{dark:'graphite',light:w.id},dark:false}), w);
  assert.equal(worldForSettings({theme:{dark:w.id,light:'paper'},dark:false}), null);
  assert.deepEqual(JSON.parse(read(`themes/${w.id}.json`)), w.theme);
  assert.equal(w.theme.ansi.length,16);
  for (const color of [...w.theme.ansi, ...Object.values(w.theme.colors), ...Object.values(w.tokens), ...Object.values(w.row)])
    assert.match(color, /^#[\da-f]{6}$/i);
  for (const color of [w.tokens.fg1,w.tokens.fg2,w.tokens.fg4,w.row.label,w.row.accent])
    assert.ok(contrast(color,w.tokens.bg1)>=4.5,`${w.id}: ${color} body/secondary contrast`);
  assert.ok(contrast(w.row.foreground,w.row.selected)>=7,`${w.id} selected name`);
  assert.ok(contrast(w.row.detail,w.row.selected)>=4.5,`${w.id} selected status`);
  assert.ok(w.ambient.period >= 1500, 'gentle native ambient motion');
  assert.equal(w.residents.length,4);
  for (const width of [179,303,439]) {
    const height=Math.round(width*200/320), pet=Math.max(34,Math.min(60,width*.195));
    for (const [x,y] of w.residents) {
      assert.ok(x>=0&&y>=0);
      assert.ok(width*x+pet+4<=width,`${w.id} resident fits width ${width}`);
      assert.ok(height*y+Math.round(pet*108/138)+4<=height,`${w.id} resident fits height ${height}`);
    }
  }
  for (const asset of [w.scene,w.ambient.asset]) {
    const svg=read(`mods/crew-roster/icons/${asset}`);
    assert.match(svg, /<svg /);
    assert.doesNotMatch(svg, /<script|<foreignObject|https?:\/\/(?!www.w3.org)|<animate/i, 'local static art only');
  }
  const svg=read(`mods/crew-roster/icons/${w.scene}`);
  assert.match(svg,/viewBox="0 0 320 200"/);
  scenes.add(createHash('sha256').update(svg).digest('hex'));
}
assert.equal(scenes.size,10,'each world has different scene geometry');
const installer=read('install.sh');
assert.ok(installer.indexOf('cp "$src/lib/worlds.js"') < installer.indexOf('cp "$src/lib/crew.js"'));
assert.ok(installer.includes("--exclude '/worlds.js'"));
console.log('worlds: 10 exact selectors, appearance maps, palette parity/contrast, scenes and resident bounds, install dependency ordering');
