// Trusted helpers' keys are not a pal's to read (T116). A helper is one of the owner's own
// assistants; its key (~/.config/project-pals/helpers/<name>.key) lets it send normal work in the
// owner's name. A pal's Bash and edits go through the approval gate (crewguard's helper-key rule);
// the read-only tools don't, so this refuses them here, in the pal's own session, at no cost to
// other calls. A guard against a pal wandering into the folder or being talked into it, not a wall:
// `pal` also refuses a key presented from inside a Herdr terminal.

import type { Register } from 'claude-code'

// The keys' folder, however the path is written; or a key itself, wherever one turns up.
const FOLDER = /(^|\/)project-pals\/helpers(\/|$)/
const KEY = /palkey_[A-Za-z0-9_-]{20,}/
const FIELDS = ['file_path', 'notebook_path', 'path', 'pattern', 'glob'] as const

/** Why this read-only call is refused, or null. `e` is a tool.call input (the tool's own arguments). */
export function refusal(e: Record<string, unknown>, owner = 'the owner'): string | null {
  for (const k of FIELDS) {
    const v = e[k]
    if (typeof v !== 'string') continue
    if (FOLDER.test(v) || KEY.test(v)) {
      return `Project Pals: that's where ${owner}'s trusted helpers keep their keys. A helper's key isn't a pal's to read, search or use. ` +
        `If you need something from a helper, ask ${owner}.`
    }
  }
  return null
}

export function registerKeys(on: Parameters<Register>[0], live: () => boolean, owner: () => string) {
  for (const tool of ['Read', 'Grep', 'Glob'] as const) {
    on('tool.call', { tool }, ($: any, e: any, next: any) => {
      if (!live()) return next(e)
      const deny = refusal(e, owner())
      return deny ? { deny } : next(e)
    // A guard that fails refuses (reference: a hook that guards answers for itself when it throws).
    }).catch(($: any, e: any, next: any) => (next.called ? next(e) : { deny: 'Project Pals: its key guard failed; not reading that.' }))
  }
}
