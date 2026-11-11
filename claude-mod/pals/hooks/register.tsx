// Project Pals' Claude Code mod (the Desk, design §6.3, stage 5). Loaded only in Claude Code pals:
// Project Pals starts them with --plugin-dir ~/.claude/project-pals/pals, so your other sessions
// never load it. Without HC_TERMINAL_ID (not a Herdr terminal) it does nothing.
//
// Every 2 s it writes its heartbeat (data/crew-desk/.mod/<terminal>: crewd then leaves typing to it)
// and looks at this terminal's queue (data/crew-queue/<terminal>). When something waits, it takes it
// with `crew-hook mod-take` (the same atomic claim the hooks and crewd use, so nothing goes twice;
// that writes the card's `seen` receipt) and hands it over:
// - working: $.session.append, a row the model reads at its next step (not the step it lands in: if
//   the turn ends first, a short prompt starts one; checked in a sandbox session, 2026-11-08). A
//   toast and a notice row tell the person;
// - idle: $.prompt.submit, a turn of its own, never typed into the input box: a draft in the box
//   stays exactly as it was (checked in a sandbox session).
// The engine draws a row the mod itself submitted its own way ("Prompt from the pals plugin": a mod
// can't redraw its own rows), so the card drawing below is for cards that came by a hook or typing.
// Desk cards in the transcript are drawn as cards; a band above the prompt shows this topic's open
// cards; /desk lists them.

import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { DeskCounts } from '../types'
import { registerKeys } from './keys'
import { registerTimeline, timelineStart, timelineTurnEnd, timelineTurnStart } from './timeline'

const desk = atom({ plugin: 'pals', key: 'desk' } as const, null)

// One card as crewdesk.frame writes it: "[header] 📥 Desk card c-xxxxxx · kind · …", the title, the
// body, and a closing "→ …" line.
type Card = { header: string; id: string; tags: string; title: string; body: string; footer: string }
const START = /^(\[[^\n]*?\](?: \([^\n]*?\))?) 📥 Desk card (c-[0-9a-f]{6}) · ([^\n]*)$/

export function parseCards(text: string): (Card | string)[] {
  const out: (Card | string)[] = []
  let cur: { head: RegExpExecArray; lines: string[] } | null = null
  const flush = () => {
    if (!cur) return
    const [, header, id, tags] = cur.head
    const lines = [...cur.lines]
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    const footer = lines.length && lines[lines.length - 1].startsWith('→ ') ? (lines.pop() as string) : ''
    out.push({ header, id, tags, title: lines.shift() ?? '', body: lines.join('\n').trim(), footer })
    cur = null
  }
  let plain: string[] = []
  for (const line of text.split('\n')) {
    const m = START.exec(line)
    if (m) {
      flush()
      if (plain.join('\n').trim()) out.push(plain.join('\n').trim())
      plain = []
      cur = { head: m, lines: [] }
    } else if (cur) cur.lines.push(line)
    else plain.push(line)
  }
  flush()
  if (plain.join('\n').trim()) out.push(plain.join('\n').trim())
  return out
}

const NUDGE = 'Desk cards came in as your turn ended (they are just above). Handle them now, then carry on.'

// This session's facts (module variables start over on a reload; session.start sets them again).
const S = { terminal: undefined as string | undefined, data: '', hook: '', busy: false, taking: false, lastStep: 0, lastAppend: 0, eventsSeen: -1 }

async function take($: any) {
  S.taking = true
  try {
    const via = S.busy ? 'mod:append' : 'mod:submit'
    const r = await $.process.run([S.hook, 'mod-take', via], {
      stdin: '{}', timeoutMs: 20000, env: { HC_TERMINAL_ID: S.terminal as string, CREW_HOOK_INTERACTIVE: '1' },
    })
    let text: string | null = null
    try { text = JSON.parse(r.stdout || '{}').text ?? null } catch { text = null }
    if (!text) return
    if (S.busy) {
      await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
      S.lastAppend = await $.clock.now()
      const cards = parseCards(text).filter((x): x is Card => typeof x !== 'string')
      const what = cards.length ? cards.map(c => `${c.id} ${c.title}`).join(' · ') : text.split('\n')[0].slice(0, 120)
      // For the person: a toast now, and a notice row in the transcript (the model never reads either).
      $.ui.toast(`📥 ${what}`)
      await $.session.append({ message: { type: 'system', content: [{ type: 'text', text: `📥 handed over mid-step: ${what}` }] } })
    } else {
      void $.prompt.submit({ text })
    }
  } catch {
    // crew-hook missing or failing: the hooks and crewd still deliver
  } finally {
    S.taking = false
  }
}

async function refresh($: any) {
  try {
    const r = await $.process.run([S.hook, 'mod-status'], { stdin: '{}', timeoutMs: 20000, env: { HC_TERMINAL_ID: S.terminal as string } })
    const counts = JSON.parse(r.stdout || 'null') as DeskCounts | null
    await update($, desk, () => counts)
  } catch {
    // no band this time
  }
}

async function tick($: any) {
  if (!S.terminal || S.taking) return
  try { await $.fs.write(`${S.data}/crew-desk/.mod/${S.terminal}`, String(await $.clock.now())) } catch { /* no desk folder yet */ }
  let waiting = false
  try { waiting = (await $.fs.list(`${S.data}/crew-queue/${S.terminal}`)).some((f: { name: string }) => f.name.endsWith('.json')) } catch { waiting = false }
  if (waiting) await take($)
  // The band: only when the Desk changed (every receipt touches events.jsonl).
  try {
    const ev = (await $.fs.list(`${S.data}/crew-desk`)).find((f: { name: string }) => f.name === 'events.jsonl')
    if (ev && ev.mtimeMs !== S.eventsSeen) { S.eventsSeen = ev.mtimeMs; await refresh($) }
  } catch { /* no desk yet */ }
}

export const register: Register = on => {
  // The work timeline (T78): tool calls as one line each, thinking as dim narration.
  registerTimeline(on, () => !!S.terminal)
  // Trusted helpers' keys aren't a pal's to read (T116): Read, Grep and Glob into their folder are refused.
  registerKeys(on, () => !!S.terminal, () => 'the owner')

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    S.terminal = await $.env.get('HC_TERMINAL_ID')
    if (!S.terminal) return r
    await timelineStart($, r?.cwd ?? e.cwd)
    const home = (await $.env.get('HOME')) ?? ''
    const crewData = await $.env.get('CREW_DATA')
    const app = (await $.env.get('HERDR_APP_HOME')) ?? `${home}/.config/herdr-app`
    S.data = crewData || `${app}/data`
    // CREW_HOOK_BIN: another crew-hook (a sandbox or a checkout); else the installed one.
    S.hook = (await $.env.get('CREW_HOOK_BIN')) || `${home}/.local/bin/crew-hook`
    await $.command.register({ name: 'desk', description: "This topic's Desk cards (pal desk)" })
    $.clock.every(2000, () => tick($))
    return r
  })

  // Busy or idle: the main loop's turns (a subagent's carry an agentId).
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) { S.busy = true; S.lastStep = await $.clock.now(); if (S.terminal) await timelineTurnStart($) }
    return next(e)
  })
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) S.lastStep = await $.clock.now()
    return yield* next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) {
      S.busy = false
      if (S.terminal) await timelineTurnEnd($)
      // Appended after the turn's last step: the model never read it. Start a turn that will.
      if (S.lastAppend > S.lastStep) { S.lastAppend = 0; void $.prompt.submit({ text: NUDGE }) }
    }
    return r
  })

  on('command.run', { command: 'desk' }, async $ => {
    if (!S.terminal) return { text: "This session isn't a Project Pals pal." }
    try {
      const r = await $.process.run([S.hook.replace(/crew-hook$/, S.hook.includes('/.local/bin/') ? 'pal' : 'crew'), 'desk'], { timeoutMs: 20000, env: { HC_TERMINAL_ID: S.terminal } })
      return { text: (r.stdout || r.stderr).trim() || '(your desk is empty)' }
    } catch {
      return { text: "Couldn't read the Desk (is Project Pals installed?)" }
    }
  })

  // Desk cards in the transcript: a card each (the model still reads the plain text).
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const text: string = e.props.text ?? ''
    if (!text.includes('📥 Desk card c-')) return next(e)
    const parts = parseCards(text)
    if (!parts.some(p => typeof p !== 'string')) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {parts.map((p, i) =>
          typeof p === 'string' ? (
            <Text key={`t${i}`} dimColor>{p}</Text>
          ) : (
            <Box key={p.id} flexDirection="column" borderStyle="round" paddingX={1}>
              <Text dimColor>📥 {p.id} · {p.tags} · {p.header.replace(/^\[|\]$/g, '')}</Text>
              <Text bold>{p.title}</Text>
              {p.body ? <Text>{p.body.split('\n').slice(0, 8).join('\n')}{p.body.split('\n').length > 8 ? '\n…' : ''}</Text> : null}
              {p.footer ? <Text dimColor>{p.footer}</Text> : null}
            </Box>
          ),
        )}
      </Box>
    )
  })

  // Above the prompt: this topic's open cards, when there are any.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const d = await read($, desk)
    if (!S.terminal || !d || !d.open) return next(e)
    const { Text } = $.ui.resolve(e)
    const bits = [`${d.open} open card${d.open === 1 ? '' : 's'}`, d.soon ? `${d.soon} soon` : '', d.held ? `${d.held} held` : ''].filter(Boolean)
    return <Text dimColor>📥 Desk · #{d.topic}: {bits.join(' · ')} · /desk</Text>
  })
}
