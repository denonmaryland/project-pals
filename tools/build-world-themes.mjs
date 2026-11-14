// Generate repository palettes only. Installing them is an explicit, exclusive-copy step.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { WORLDS } from '../lib/worlds.js';
for (const world of WORLDS) {
  const path = new URL(`../themes/${world.id}.json`, import.meta.url);
  if (world.id === 'pixel-village') {
    assert.deepEqual(world.theme, JSON.parse(readFileSync(path, 'utf8')), 'preserve original Pixel Village palette');
  } else writeFileSync(path, JSON.stringify(world.theme, null, 2) + '\n');
}
console.log('Nine world palettes generated; Pixel Village verified without writing.');
