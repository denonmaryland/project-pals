# Ten worlds

Each world is an opt-in Herdr theme. The sidebar's place, buildings, palette, wording and
ambient light change together. Pals keep their real species, accessories, eyes, colors,
saved looks and existing pet motion. Topics, menus and the terminal remain in place.

| World | Theme ID | Place |
| --- | --- | --- |
| Pixel Village | `pixel-village` | Snowy pines, copper houses and a quiet campfire. |
| Tide Harbor | `tide-harbor` | Sailboats at timber piers, teal water and a blinking lighthouse. |
| Amber Oasis | `amber-oasis` | Caravan tents, date palms and turquoise pools beneath dusk dunes. |
| Neon District | `neon-district` | Rainy elevated streets, stacked towers and electric signs. |
| Sakura Shrine | `sakura-shrine` | Tiered shrine roofs, vermilion gates and flowering mountain paths. |
| Mushroom Grove | `mushroom-grove` | Spotted mushroom homes, fern thickets and glowing spores. |
| Orbital Outpost | `orbital-outpost` | Docking modules, solar arrays and a blue planet beyond the station. |
| Cloud Kingdom | `cloud-kingdom` | Floating islands, gilded spires and bridges above a violet sky. |
| Cinder Forge | `cinder-forge` | Iron workshops and anvils on basalt islands over molten channels. |
| Harvest Hollow | `harvest-hollow` | Red barns, windmill sails and pumpkin fields under autumn trees. |

## Install and choose

Install this branch's mods with the normal `./install.sh --no-helpers` procedure when a
live reload is appropriate. That script makes backups; it does not install optional palettes
or select a theme. Copy the desired `themes/<id>.json` into `$HERDR_APP_HOME/themes/`
(normally `~/.config/herdr-app/themes/`) using **new-file-only** creation. Preserve any existing
file there. If an ID already belongs to another theme, use a new ID in both the registry and
palette rather than replacing it.

For example, after installing the palette and mods:

```sh
herdr-app do app.theme --name tide-harbor
```

Replace `tide-harbor` with any exact ID from the table. The command changes the current
layout's theme pick. To keep a default across layouts, back up `settings.json` and set its
`"theme"` key to that ID, for example `"theme": "tide-harbor"`. A layout's own theme or saved
theme pick can override this default. An appearance map also works:
`"theme": {"light": "paper", "dark": "tide-harbor"}`; only its active half enables a world.

Return to the original village:

```sh
herdr-app do app.theme --name pixel-village
```

Set `"theme": "pixel-village"` for that default. To return to the ordinary sidebar, choose
an unrelated theme, for example `herdr-app do app.theme --name omarchy`, and use
`"theme": "omarchy"` for that default. Unknown names never enable world UI. Switching
worlds does not write pal records, pet settings, groups, pins or topic selection.

## Interactions and motion

Expand the folded sidebar to see the scene. Four pals appear per page; Prev/Next wraps
through all pals, including sleeping ones. Hovering a roster row reveals that pal's page
and highlights its place. The inspection card shows its name, project, role and activity;
native tooltips retain full text. Clicking and right-clicking use existing Open/Wake and
pal-menu actions. Project labels use each world's terms: ships, caravans, blocks, shrines,
groves, modules, isles, forges or farms.

The header's **[pause] / [play]** controls that sidebar copy's ambient effect, including after
switching worlds. It is local and lasts for the life of the mod copy; it is not persisted.
Effects are native GPUI opacity loops, 1.5–4.2 seconds per cycle, with no animation timer.
The installed `herdr.d.ts` and `gpui-kit.d.ts` expose no reduced-motion preference query.
Therefore this version provides explicit pause rather than claiming to detect the system
preference. Existing pet motion stays unchanged. The separate HTML previews do honor
`prefers-reduced-motion`; that browser behavior is not evidence of native preference support.

## Implementation and verification

- `lib/worlds.js`: one definition per world, exact theme selection, palette, DS tokens,
  row colors, wording, resident positions and ambient asset/geometry/timing.
- `lib/crew.js`: reads resolved settings and selects world tokens. `pixelVillageOn()` remains
  a Pixel-only compatibility predicate; `activeWorld()` handles all ten.
- `mods/crew-roster/main.js`: the existing `villageArt`, `villageRow` and navigation pipeline
  now consume the registry. The old method names and interaction IDs remain for compatibility.
- `tools/build-world-scenes.py`: reproducible original vector art for nine worlds; never
  rewrites the two original Pixel Village assets. No pal art is embedded in the scenes.
- `tools/build-world-themes.mjs`: generates the nine repository palettes and verifies the
  original Pixel Village JSON without changing it. It never writes installed config.
- `install.sh`: stages `worlds.js` before `crew.js`, preserves it during asset synchronization,
  and writes each `main.js` last so hot reload has its dependencies.

Run the Node files individually (`mise exec -- node tests/<file>.mjs`), the full Python
unittest discovery under a memory cap, and `python3 tools/check-pixel-village.py`.
The latter now checks **all ten** worlds, with synthetic residents and isolated app homes.
It runs `herdr-app check` on the staged roster and an explicit fixture covering each
world at 180/304/440 px, empty and paused, plus selected rows. Herdr's checker supplies
graphite settings, so the fixture passes each world explicitly; the JS tests cover selection.

`tests/test_worlds.mjs` checks registry selection, theme parity, text contrast, asset packaging,
resident bounds and installer dependency order. `tests/test_palrows.mjs` exercises the actual
builders and handlers, verifies no saved-state/pet-spec changes, and compares Pixel Village's
normalized full element trees and tokens against a SHA-256 captured from commit `6aa7b46`
before refactoring. This covers three widths, an empty paused scene and a selected row.

Native checks validate loadable element descriptions, not final pixel layout or all async
behavior. Headless previews are visual studies with fictional projects and the real unchanged
pet renderer. They are not captures of the owner's app or proof of native visual acceptance.
