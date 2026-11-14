// Opt-in sidebar worlds. Pure data: no host calls, persisted state, or pet overrides.
// install.sh copies this before crew.js into every mod. The theme generator and previews
// consume this same registry; scenes are editable pixel SVGs under crew-roster/icons/.
const seats = [[.12, .29], [.68, .29], [.12, .72], [.68, .72]];

function world(id, name, description, words, palette, ambient, residents = seats) {
  const [bg, surface, raised, hover, selected, border, muted, dim, fg, accent, label, blue, green, cyan, red, pale] = palette;
  const theme = {
    background: bg, foreground: fg, selection: selected, cursor: accent,
    ansi: [raised, red, green, accent, blue, label, cyan, fg, dim, red, green, accent, blue, label, cyan, pale],
    colors: { canvas: bg, chrome: bg, surface, popover: surface, raised, hover, selected,
      border, input: dim, muted, dim, accent, accent_foreground: bg, solid: accent,
      solid_foreground: bg, working: blue, blocked: accent, done: green, idle: muted, unknown: dim },
  };
  return {
    id, name, description, words, scene: `${id}.svg`, residents,
    ambient: { asset: `${id}-ambient.svg`, x: 0, y: 0, width: 320, height: 200,
      scale: true, from: .25, to: .85, period: 2800, ...ambient },
    theme,
    tokens: { bg0: bg, bg1: bg, inset: surface, raised, composer: surface, bubble: raised,
      bubbleOld: surface, sel: selected, ctl: selected, hover, line: border, lineSoft: raised,
      lineMid: dim, lineStrong: muted, fg1: fg, body: fg, fg2: muted, fg3: muted, fg4: dim,
      icon: muted, iconOn: accent, iconDim: dim, info: blue, infoText: cyan, ok: green,
      okHi: green, warn: accent, warnText: accent, err: red, me: selected, meOld: raised,
      meEdge: label, act: selected, actFg: pale },
    row: { selected: pale, foreground: bg, detail: selected, outline: pale, label, accent, cardBorder: muted },
  };
}

export const PIXEL_WORLD = world("pixel-village", "Pixel Village",
  "Snowy pines, copper houses and a quiet campfire.",
  { pals: "Pals", projects: "Projects", place: "house", relation: "of", prefix: "",
    empty: "A quiet village.", invite: "Hire a pal to light the first house." },
  ["#08121e", "#0b1727", "#17263b", "#1c2f47", "#263b56", "#38465a", "#9daabd", "#8a9bb2",
    "#dbe2f0", "#e6ad72", "#d48cad", "#88c6df", "#a5c18a", "#a4e1e3", "#ed9a91", "#e8edf6"],
  { asset: "pixel-village-embers.svg", label: "campfire", x: .48, y: .43, width: 12, height: 20,
    scale: false, from: .2, to: .8, period: 1700 });
// Preserve the original palette/tokens/row exactly, including its quieter body and bright ANSI.
Object.assign(PIXEL_WORLD.tokens, {
  lineSoft: "#253447", lineMid: "#5a6070", lineStrong: "#8a8f9a", body: "#cbd4e3", fg2: "#a5b1c4",
  okHi: "#c0d89c", warnText: "#f4ca91", act: "#345068",
});
Object.assign(PIXEL_WORLD.row, { selected: "#cbd6ef", detail: "#283c55", cardBorder: "#8a8f9a" });
PIXEL_WORLD.theme.ansi = ["#182536", "#d77b7b", "#a5c18a", "#e6ad72", "#88a9db", "#d48cad", "#83cbd0", "#cbd4e3",
  "#69798d", "#ed9a91", "#c0d89c", "#f4ca91", "#b0c6ef", "#e9afd0", "#a4e1e3", "#e8edf6"];
PIXEL_WORLD.theme.colors.input = "#5a6070";
PIXEL_WORLD.theme.selection = "#34445d";

export const WORLDS = [
  PIXEL_WORLD,
  world("tide-harbor", "Tide Harbor", "Sailboats at timber piers, teal water and a blinking lighthouse.",
    { pals: "Crew", projects: "Ships", place: "ship", relation: "aboard", prefix: "Ship · ",
      empty: "The harbor is still.", invite: "Hire a pal to crew the first ship." },
    ["#07191f", "#0b2229", "#17343c", "#204650", "#28515d", "#36545c", "#a2bec3", "#83a5ae",
      "#dcece7", "#efc38a", "#81d3be", "#83bfdc", "#b7ce8f", "#9ce0d9", "#ef9b88", "#cce9e3"],
    { label: "harbor lights", period: 3100 }),
  world("amber-oasis", "Amber Oasis", "Caravan tents, date palms and turquoise pools beneath dusk dunes.",
    { pals: "Travelers", projects: "Caravans", place: "tent", relation: "with", prefix: "Caravan · ",
      empty: "A peaceful oasis.", invite: "Hire a pal to pitch the first tent." },
    ["#211522", "#2c1c2b", "#402a37", "#523344", "#633e4c", "#70525d", "#c9afa9", "#b899a0",
      "#f1e0cc", "#f2bc78", "#eaa391", "#9fbcdb", "#c7cd91", "#87cfc5", "#f29f93", "#f3d9b4"],
    { label: "oasis lanterns", period: 2300 }, [[.10,.31],[.69,.31],[.12,.72],[.67,.72]]),
  world("neon-district", "Neon District", "Rainy elevated streets, stacked towers and electric signs.",
    { pals: "Runners", projects: "Blocks", place: "tower", relation: "at", prefix: "Block · ",
      empty: "The district is waiting.", invite: "Hire a pal to light the first tower." },
    ["#100f21", "#19162d", "#28223f", "#352e51", "#433966", "#534b70", "#b4accb", "#958ead",
      "#e9e4f7", "#78e4e8", "#f09acb", "#a8b9ff", "#a6dba3", "#78e4e8", "#f29ca8", "#d4cdf8"],
    { label: "neon signs", period: 1900 }, [[.10,.29],[.68,.29],[.12,.72],[.68,.72]]),
  world("sakura-shrine", "Sakura Shrine", "Tiered shrine roofs, vermilion gates and flowering mountain paths.",
    { pals: "Keepers", projects: "Shrines", place: "shrine", relation: "tending", prefix: "Shrine · ",
      empty: "A quiet mountain.", invite: "Hire a pal to tend the first shrine." },
    ["#1d1725", "#281f30", "#392c42", "#493750", "#59445f", "#67536e", "#c0afc5", "#aa94b2",
      "#f1e2ee", "#f0b5a4", "#e9a5c7", "#a6badc", "#b5c99a", "#9ed2c9", "#f19d9c", "#efd2e5"],
    { label: "shrine lanterns", period: 3400 }),
  world("mushroom-grove", "Mushroom Grove", "Spotted mushroom homes, fern thickets and glowing spores.",
    { pals: "Foragers", projects: "Groves", place: "cap", relation: "in", prefix: "Grove · ",
      empty: "A sleepy grove.", invite: "Hire a pal to open the first cap." },
    ["#101c19", "#172922", "#253b30", "#304b3a", "#3a5743", "#49644e", "#adc0a6", "#90aa91",
      "#e2ead1", "#e5c58d", "#d4a6c0", "#9dbdcf", "#bbd592", "#95d8bb", "#edaa96", "#d8e9bb"],
    { label: "glowing spores", period: 3800 }, [[.11,.30],[.68,.30],[.12,.72],[.68,.72]]),
  world("orbital-outpost", "Orbital Outpost", "Docking modules, solar arrays and a blue planet beyond the station.",
    { pals: "Crew", projects: "Modules", place: "module", relation: "in", prefix: "Module · ",
      empty: "Station on standby.", invite: "Hire a pal to open the first module." },
    ["#0c1324", "#121f34", "#21314a", "#2c405d", "#385374", "#4c627e", "#abbdd4", "#8a9fbe",
      "#e0e9f6", "#a6dce8", "#bdaef1", "#9bbdf4", "#a6d6bb", "#a6dce8", "#efa3aa", "#d4e4f6"],
    { label: "docking beacons", period: 2600 }, [[.12,.28],[.68,.28],[.12,.72],[.68,.72]]),
  world("cloud-kingdom", "Cloud Kingdom", "Floating islands, gilded spires and bridges above a violet sky.",
    { pals: "Dreamers", projects: "Isles", place: "isle", relation: "on", prefix: "Isle · ",
      empty: "The sky is quiet.", invite: "Hire a pal to settle the first isle." },
    ["#242139", "#2e2b45", "#3c3856", "#4b4667", "#5a537b", "#73698e", "#c1bbd6", "#aba1c6",
      "#f2eafa", "#efd6a1", "#c9b3ed", "#b7ceef", "#c5d9b2", "#b3dfe1", "#efb3bd", "#eee2f7"],
    { label: "sky stars", period: 4200 }, [[.11,.29],[.68,.29],[.12,.72],[.68,.72]]),
  world("cinder-forge", "Cinder Forge", "Iron workshops and anvils on basalt islands over molten channels.",
    { pals: "Smiths", projects: "Forges", place: "forge", relation: "at", prefix: "Forge · ",
      empty: "The furnaces are quiet.", invite: "Hire a pal to stoke the first forge." },
    ["#211519", "#2d1e23", "#422c31", "#52363b", "#62434a", "#785159", "#cbb1a9", "#b69893",
      "#f0e0d2", "#f3ad75", "#e4a098", "#abbcd3", "#c4cb9c", "#aaccc5", "#f09e8d", "#f2d8bd"],
    { label: "forge embers", period: 1500 }),
  world("harvest-hollow", "Harvest Hollow", "Red barns, windmill sails and pumpkin fields under autumn trees.",
    { pals: "Growers", projects: "Farms", place: "farm", relation: "at", prefix: "Farm · ",
      empty: "The fields are resting.", invite: "Hire a pal to plant the first farm." },
    ["#211d16", "#2b271d", "#3c3527", "#4d4430", "#5c5039", "#736247", "#c7b99e", "#ab9c80",
      "#efe5cd", "#e9bd76", "#dba38a", "#a6bec9", "#b8cc95", "#a8ceba", "#e8a08c", "#eadbbb"],
    { label: "harvest fireflies", period: 3200 }),
];

// Exact lookup also rejects inherited object keys ("constructor", "__proto__", etc.).
export function worldForSettings(settings = {}) {
  const pick = typeof settings.theme === "string" ? settings.theme : settings.theme?.[settings.dark === false ? "light" : "dark"];
  return WORLDS.find((entry) => entry.id === pick) ?? null;
}
