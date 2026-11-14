#!/usr/bin/env python3
"""Check native village builders without a running app, user state or installation."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
APP = shutil.which('herdr-app')
if not APP:
    raise SystemExit('herdr-app must already be installed; this check installs nothing')

with tempfile.TemporaryDirectory(prefix='pixel-village-check-') as tmp:
    home = Path(tmp)
    app_home = home / 'app'
    roster = app_home / 'mods/crew-roster'
    fixture = app_home / 'mods/pixel-village-fixture'
    shutil.copytree(ROOT / 'mods/crew-roster', roster)
    fixture.mkdir(parents=True)
    for path in (ROOT / 'lib').glob('*.js'):
        shutil.copy2(path, roster / path.name)
        shutil.copy2(path, fixture / path.name)
    shutil.copy2(roster / 'main.js', fixture / 'roster.js')
    (fixture / 'mod.json').write_text(json.dumps({'title': 'Pixel Village check', 'place': 'none'}))
    (fixture / 'main.js').write_text('''
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme } from "herdr";
import Roster from "./roster.js";
import { ds, palFacts, palListStyle } from "./crew.js";
export default class Fixture extends View {
  render() {
    const roster = Object.create(Roster.prototype);
    roster.ops = { tasks: [], approvals: [], proposals: [], stalled: {} };
    const rows = Array.from({length: 7}, (_, i) => ({
      space: {id: `s${i}`, name: `Demo ${i}`, folder: `/demo/project-${i}`, active: i===0, status: "idle", tabs: []},
      bot: {id: `b${i}`, name: `Demo ${i}`, folder: `/demo/project-${i}`, awake: false, harness: "codex"},
    }));
    // check supplies graphite defaults, ignoring on-disk settings. Selection is covered by
    // test_palrows; call the exact theme-only builders here to validate their native elements.
    const t = theme(), d = ds(t);
    roster.villageHovered = "s6";
    const root = v_flex();
    for (const width of [180, 304, 440])
      root.child(roster.villageArt(rows, t, d, width));
    roster.villageStill = true;
    root.child(roster.villageArt([], t, d, 304));
    root.child(roster.villageRow(rows[0].space, rows[0].bot, t, d,
      palFacts(rows[0].space, rows[0].bot, d, []), div().id("fixture-row"), palListStyle()));
    return root;
  }
}
''')
    env = {'HOME': str(home), 'HERDR_APP_HOME': str(app_home), 'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}
    for mod in (roster, fixture):
        subprocess.run([APP, 'check', str(mod)], env=env, check=True)
