// Factories (T66, phase 1): several crews in one Project Pals. Pure helpers, shared by the mods and
// tested by tests/test_factories.mjs; bin/crewfactories.py is the same model on the pal side, and
// the only writer of data/crew-factories.json.
//
// Today's crew is the default factory and needs no file: with no store, or one that names no other
// factory, there is one factory and nothing looks different.

export const DEFAULT_FACTORY = "default";
export const DEFAULT_FACTORY_COLOR = "#5FB8A6";
export const FACTORY_COLORS = ["#E2935A", "#8F9CF7", "#D36FA8", "#C9B458", "#5FA8E2", "#9BC35A"];
export const FACTORY_TEMPLATES = [
  { id: "project-crew", name: "Project crew", short: "Crew", about: "Many projects, one pal each. What you have today." },
  { id: "platform-lanes", name: "Platform lanes", short: "Lanes", about: "One product on several platforms, a standing lead per platform." },
];
export const templateOf = (id) => FACTORY_TEMPLATES.find((t) => t.id === id) ?? FACTORY_TEMPLATES[0];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[-_]/g, " ").trim();
const words = (s) => String(s ?? "").split(/\s+/).filter(Boolean).join(" ");

// The file as a store we can trust (crewfactories._clean): bad shapes and dangling ids are dropped.
export function cleanFactories(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const list = [], seen = new Set();
  for (const f of Array.isArray(r.factories) ? r.factories : []) {
    if (!f || typeof f !== "object") continue;
    const id = String(f.id ?? ""), name = words(f.name);
    if (!/^f-[0-9a-z]{4,16}$/.test(id) || seen.has(id) || !name) continue;
    seen.add(id);
    list.push({ id, name: name.slice(0, 40), template: templateOf(f.template).id, foreman: String(f.foreman ?? ""),
      foremanTopic: String(f.foreman_topic ?? "ops").replace(/^#+/, ""),
      color: /^#[0-9A-Fa-f]{6}$/.test(String(f.color ?? "")) ? f.color : FACTORY_COLORS[list.length % FACTORY_COLORS.length] });
  }
  const pals = {};
  if (r.pals && typeof r.pals === "object" && !Array.isArray(r.pals)) for (const [k, v] of Object.entries(r.pals)) if (seen.has(v)) pals[k] = v;
  return { current: seen.has(r.current) ? r.current : DEFAULT_FACTORY, defaultName: words(r.default_name).slice(0, 40), factories: list, pals };
}
export const NO_FACTORIES = cleanFactories(null);

// Every factory, the default first. `who`: { owner, head, headTopic } from the settings.
export function factoryList(store, who = {}) {
  const st = store ?? NO_FACTORIES;
  return [{ id: DEFAULT_FACTORY, name: st.defaultName || `${who.owner || "Your"}${who.owner ? "'s" : ""} crew`, template: "project-crew",
    foreman: who.head ?? "", foremanTopic: who.headTopic ?? "", color: DEFAULT_FACTORY_COLOR, default: true }, ...st.factories];
}
export const severalFactories = (store) => (store?.factories?.length ?? 0) > 0;
export const currentFactoryOf = (store, who = {}) => { const l = factoryList(store, who); return l.find((f) => f.id === store?.current) ?? l[0]; };

// The id of the factory a pal (by name) is in. Unknown pals and the head pal: the default one.
export function factoryOfPal(store, pal, head = "") {
  if (!pal || !severalFactories(store) || norm(pal) === norm(head)) return DEFAULT_FACTORY;
  const want = norm(pal);
  const k = Object.keys(store.pals).find((x) => norm(x) === want);
  return k ? store.pals[k] : DEFAULT_FACTORY;
}
// A Home item's factory: the one stamped on it if it still exists, else its topic's pal's, else its adder's.
export function factoryOfItem(store, item, head = "") {
  if (!severalFactories(store)) return DEFAULT_FACTORY;
  if (item?.factory === DEFAULT_FACTORY || store.factories.some((f) => f.id === item?.factory)) return item.factory;
  return factoryOfPal(store, String(item?.topic || item?.by || "").split("#")[0].trim(), head);
}
// Is this pal on the floor the app shows? With one factory: always.
export const palShown = (store, pal, head = "") => !severalFactories(store) || factoryOfPal(store, pal, head) === (store.current ?? DEFAULT_FACTORY);
export const itemShown = (store, item, head = "") => !severalFactories(store) || factoryOfItem(store, item, head) === (store.current ?? DEFAULT_FACTORY);

// What each factory needs from you: `needs` is [{ pal }] (one per thing waiting), counted by factory id.
export function needsByFactory(store, needs, head = "") {
  const out = {};
  for (const n of needs ?? []) { const id = n.factory ?? factoryOfPal(store, n.pal, head); out[id] = (out[id] ?? 0) + 1; }
  return out;
}
// The chip's count: what the factories you're NOT looking at need from you.
export function needsElsewhere(store, needs, head = "") {
  if (!severalFactories(store)) return 0;
  const by = needsByFactory(store, needs, head);
  return Object.entries(by).reduce((n, [id, c]) => n + (id === store.current ? 0 : c), 0);
}
