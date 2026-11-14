# Pixel Village

Pixel Village is now one of [ten opt-in worlds](worlds.md). Its original scene assets,
colors, layout and interaction behavior remain unchanged. See that guide for the registry,
the other themes, reduced-motion limitations and the expanded checker.

Pixel Village is an opt-in night palette and small village in the existing sidebar. The
terminal remains the main workspace. Every resident uses the existing `palPet` pipeline,
including the person's species, accessories, eyes and saved colors. Pet source and assets
are unchanged.

## Select it

The branch must be installed before its village UI is available. Installing this branch is
an explicit later action; adding the theme JSON alone only adds Herdr's selectable palette.
When ready to install the branch, use the normal Project Pals install procedure. From its
checkout, `./install.sh --no-helpers` installs the mods and layout with its normal backups;
it still changes live app files and must not be run during another person's capture session.
It does not automatically copy the optional theme in this directory.

Copy `themes/pixel-village.json` to `$HERDR_APP_HOME/themes/pixel-village.json`
(default `~/.config/herdr-app/themes/pixel-village.json`), only if that file does not already
exist. Do not replace an edited theme. In Herdr's theme picker, select `pixel-village`, or run:

```sh
herdr-app do app.theme --name pixel-village
```

To turn it off, pick the theme you previously used. For the Omarchy setup:

```sh
herdr-app do app.theme --name omarchy
```

Switching themes restores the existing sidebar design; it does not change pet looks, groups,
pins, topics, saved layout preferences, or terminal selection. No migration is needed.

## Interaction

- The village replaces the large hero art area, retaining the hero's topics and quick actions.
- Four residents fit in each scene. Prev/Next visits all residents, including sleeping pals.
  Hovering a roster row automatically reveals that resident's page and draws a pale rectangle.
- Hover a resident or roster name to inspect its name, project, role and status/current topic.
  A thin bordered inspection card below the scene keeps long descriptions out of the terminal;
  the native hover tooltip carries the full text when a line is truncated.
- Clicking a resident uses existing pal navigation; a sleeping resident uses existing Wake.
  Right-click uses the existing pal menu. Head-pal navigation continues to open Home.
- The campfire uses native opacity animation, with a local pause/play control. No animation
  timer or background worker is added. Existing pet motion remains unchanged.
- The narrow folded sidebar keeps its existing face rail. Expand it to see the village.

## Implementation and checks

`lib/crew.js:activeWorld` reads Herdr's resolved `settings().theme`, including appearance
maps. Only exact registered world names enable world tokens and roster treatment;
`pixelVillageOn` still identifies Pixel Village alone. Unrelated themes retain the existing
design-system tokens. `mods/crew-roster/main.js` draws the
scene and inspection card. `mods/crew-roster/icons/pixel-village.svg` is the static tile scene.
Herdr theme JSON cannot contain CSS, HTML or scripted layout; the optional palette is in
`themes/pixel-village.json`.

`tests/test_palrows.mjs` checks opt-in/out and appearance selection, paging through residents,
hover/highlight state, native motion pause, empty villages, preservation of pet specifications,
and absence of persistent writes. It uses the existing strict GPUI method and single-parent
fixture. Native `herdr-app check` remains required for packaged mods; an offscreen HTML
mockup is a visual study, not proof of a live native render.

Run the native check without installing or contacting a running app:

```sh
python3 tools/check-pixel-village.py
```

The checker now covers all ten worlds using a fresh home and synthetic residents. Herdr's `check` supplies default
graphite settings, so the fixture invokes the theme-only scene and row builders directly;
opt-in/out is covered separately by the JavaScript test. It checks 180, 304 and 440 px
sidebar scenes, an empty village and paused motion. No live pixels are captured.
