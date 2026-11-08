// Binding an edit or a review to its target (Codex review H4). A target is the pal's space id, its
// name and its folder at the moment the edit or review started; `gen` bumps whenever the shown pal
// changes. A late result for an old target is dropped, and a write is refused unless that exact target
// is still the one shown. No imports: tests/test_bind.mjs runs it under node.
export function targetOf(shown, folder) {
  if (!shown) return null;
  return { space: shown.space.id, name: shown.bot.name, folder: folder ?? shown.bot.folder ?? null };
}
export function sameTarget(a, b) {
  return Boolean(a && b && a.space === b.space && a.name === b.name && (a.folder ?? null) === (b.folder ?? null));
}
// Call on every tick with the shown pal: bumps view.gen when it changed, and drops edits and reviews
// that belonged to the previous one. Returns true when it changed.
export function followShown(view, shown) {
  const key = shown ? `${shown.space.id}|${shown.bot.name}` : "";
  if (view.genKey === key) return false;
  view.genKey = key;
  view.gen = (view.gen ?? 0) + 1;
  view.edit = null;
  view.review = null;
  return true;
}
// Still the same target as when `job` (an edit or a review) started?
export function stillTarget(view, job, shown, folder) {
  return Boolean(job && job.gen === view.gen && sameTarget(job.target, targetOf(shown, folder)));
}
