// The work timeline (task T78): a pal's tool calls as one calm line each, in Claude Code.
//
// Mockup DeNon approved (2026-11-09, MUSE's crew-boards/terminal-feel/work-timeline-mockup.html):
//
//   ┊ ◇ thinking it reads session state twice…
//   ┊ ▸ read     src/auth/LoginButton.tsx  84 lines
//   ┊ ▸ search   "useSession"  4 hits
//   ┊ ✎ edit     LoginButton.tsx  +3 −7
//   ┊ ✓ test     npm test -- auth.spec.ts  12 passed
//
// - Each tool call (a `ToolUse` row, and each call of a `ToolGroup` the engine would fold into
//   "Read 3 files") is one line: icon, verb, target, short result. A running call shows a blue ●
//   and "…". The standalone `ToolResult` block under a row is hidden.
// - The thinking the model did between two calls is one dim purple line: the engine already draws it
//   as a summary row (`AssistantMessage` with `isSummary`), which becomes "◇ thinking <first sentence>".
// - Press (click) a line to open its raw output in place, up to RAW_ROWS rows; ctrl+o (the
//   engine's expanded transcript) still shows the engine's own rows, untouched.
// - The agent's prose is not touched: the engine draws it as normal text between the steps.
// - Pals only (HC_TERMINAL_ID, as the rest of the mod). PALS_TIMELINE=0 turns it off. Fail open:
//   every hook here hands the row back to the engine when it throws.

import { memberOf, read, update } from 'claude-code'

// ── DS colours (docs/cli-mods/proposal.md §3, MUSE's mockup) ──
export const C = {
  gutter: '#3C3C3F', // --line-strong: the dotted rail
  fg: '#EDEDED',
  body: '#C8C8C8',
  meta: '#6A6A6C',
  work: '#2A6AFE', // running, edits
  done: '#52D09E', // passed
  add: '#3FBF78',
  del: '#D8414A',
  err: '#F06C6C',
  think: '#8A5CF0',
}

const RAW_ROWS = 12 // Crush-style cap on an opened step

export type Tone = 'look' | 'edit' | 'ok' | 'run' | 'err' | 'live' | 'stop' | 'think'
export type Step = { icon: string; verb: string; target: string; result: string; tone: Tone }
export type RawLine = { text: string; kind?: 'add' | 'del' | 'meta' }

// Tools whose own row is the point (a question, a plan, a to-do list): the engine keeps drawing them.
const ENGINE_ROWS = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'])

const isOpen = { plugin: 'pals', key: 'stepOpen' } as const

// ── turning a call into a line ──

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {})
const firstLine = (s: string) => s.split('\n').map(l => l.trim()).find(Boolean) ?? ''
const lastLine = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean).pop() ?? ''
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p

export function relPath(p: string, cwd = '', home = ''): string {
  if (!p) return ''
  if (cwd && (p === cwd || p.startsWith(cwd.endsWith('/') ? cwd : `${cwd}/`))) return p.slice(cwd.length).replace(/^\//, '') || '.'
  if (home && p.startsWith(`${home}/`)) return `~${p.slice(home.length)}`
  return p
}

// The text an output carries, whatever its shape (a string, a Bash record, MCP content blocks).
export function outputText(output: unknown): string {
  if (typeof output === 'string') return output
  const o = obj(output)
  if (typeof o.stdout === 'string' || typeof o.stderr === 'string') return [o.stdout, o.stderr].filter(Boolean).join('\n')
  if (o.file && typeof o.file.content === 'string') return o.file.content
  if (typeof o.content === 'string') return o.content
  if (Array.isArray(o.content)) return o.content.map((b: any) => str(b?.text)).filter(Boolean).join('\n')
  if (Array.isArray(output)) return (output as any[]).map(b => str(b?.text)).filter(Boolean).join('\n')
  if (Array.isArray(o.filenames)) return o.filenames.join('\n')
  if (typeof o.result === 'string') return o.result
  try { return output === undefined ? '' : JSON.stringify(output, null, 1) } catch { return '' }
}

// +added −removed from a structured patch (Edit, Write) or a gitDiff.
export function diffCount(output: unknown): { add: number; del: number } | null {
  const o = obj(output)
  if (o.gitDiff && typeof o.gitDiff.additions === 'number') return { add: o.gitDiff.additions, del: o.gitDiff.deletions ?? 0 }
  if (!Array.isArray(o.structuredPatch)) return null
  let add = 0, del = 0
  for (const h of o.structuredPatch) for (const l of h?.lines ?? []) {
    if (typeof l !== 'string') continue
    if (l.startsWith('+')) add++
    else if (l.startsWith('-')) del++
  }
  return { add, del }
}

// "12 passed", "Ran 31 tests: OK"… from a test runner's output, else null.
export function testSummary(text: string): string | null {
  const t = text.replace(/\x1b\[[0-9;]*m/g, '')
  const both = (pass: string | undefined, fail: string | undefined) =>
    fail && fail !== '0' ? `${fail} failed${pass ? ` · ${pass} passed` : ''}` : pass ? `${pass} passed` : null
  let m = /^Ran (\d+) tests? in ([\d.]+)s[\s\S]*?^(OK|FAILED[^\n]*)/m.exec(t) // unittest
  if (m) return m[3].startsWith('OK') ? `${m[1]} passed · ${Number(m[2]).toFixed(1)}s` : `${m[3].toLowerCase()} · ${m[1]} ran`
  m = /^[#ℹ]\s*pass (\d+)[\s\S]*?^[#ℹ]\s*fail (\d+)/m.exec(t) // node --test (TAP or the spec reporter)
  if (m) return both(m[1], m[2])
  const tests = /^\s*Tests?:?\s+(.*)$/im.exec(t)?.[1] ?? t // vitest/jest's "Tests" line, else anywhere
  const pass = /(\d+) (?:passed|passing)/i.exec(tests)?.[1]
  const fail = /(\d+) (?:failed|failing)/i.exec(tests)?.[1]
  if (pass || fail) return both(pass, fail)
  // node's spec reporter cut short (| tail): count its ✔ / ✖ test lines
  const ok = (t.match(/^\s*✔ .*\(\d[\d.]*m?s\)\s*$/gm) ?? []).length
  const bad = (t.match(/^\s*✖ .*\(\d[\d.]*m?s\)\s*$/gm) ?? []).length
  return ok || bad ? both(ok ? String(ok) : undefined, bad ? String(bad) : undefined) : null
}

// The command as a target: its first line, without a leading `cd x &&` or a trailing `2>&1 | tail -n 40`.
export function shownCommand(cmd: string): string {
  const lines = cmd.split('\n').map(l => l.trim()).filter(Boolean)
  // A script (a heredoc, several commands): the test line when there is one, else the first and "…".
  const pick = lines.length > 1 ? lines.find(l => TEST_CMD.test(l)) ?? `${lines[0]} …` : lines[0] ?? ''
  let c = pick.replace(/^\s*cd\s+\S+\s*&&\s*/, '').trim()
  for (let k = 0; k < 3; k++) c = c.replace(/\s*\|\s*(tail|head)(\s+-n)?(\s+-?\d+)?\s*$/, '').replace(/\s*2>&1\s*$/, '').trim()
  return c
}

const TEST_CMD = /(^|[\s/;&|(])(pytest|vitest|jest|mocha|unittest|go test|cargo test|bun test|deno test|(?:npm|pnpm|yarn)(?: run)? test|plugin test|node --test|node tests?\/)/

export function bashVerb(cmd: string): string {
  if (TEST_CMD.test(cmd)) return 'test'
  const c = cmd.replace(/^\s*cd\s+\S+\s*&&\s*/, '').trim()
  const w = c.split(/\s+/)[0] ?? ''
  if (w === 'git' || w === 'gh') return w
  if (/^(pal|pal-room|crew|crew-room)$/.test(w)) return 'pal'
  if (/^(tsc|eslint|ruff|mypy|shellcheck)$/.test(w) || / plugin validate\b|py_compile|--check\b|bash -n\b/.test(c)) return 'check'
  if (/^(ls|cat|head|tail|sed|grep|rg|find|wc|stat|tree|less)$/.test(w)) return 'look'
  return 'run'
}

type Ctx = { cwd?: string; home?: string }

// One call → its line. `output` is undefined while it runs; for an errored call it's the text the
// model read.
export function describe(tool: string, input: unknown, output: unknown, flags: { isRunning?: boolean; isErrored?: boolean; isInterrupted?: boolean }, ctx: Ctx = {}): Step {
  const i = obj(input)
  const path = (p: unknown) => relPath(str(p), ctx.cwd, ctx.home)
  let icon = '▸', verb = tool.toLowerCase(), target = '', result = '', tone: Tone = 'look'
  const text = outputText(output)
  const o = obj(output)

  switch (tool) {
    case 'Read': {
      verb = 'read'; target = path(i.file_path)
      const f = obj(o.file)
      if (typeof f.numLines === 'number') result = f.totalLines && f.numLines < f.totalLines ? `lines ${f.startLine}–${f.startLine + f.numLines - 1} of ${f.totalLines}` : plural(f.numLines, 'line')
      else if (o.type === 'image') result = 'image'
      break
    }
    case 'Grep': {
      verb = 'search'; target = `"${str(i.pattern)}"${i.path ? ` in ${path(i.path)}` : ''}`
      const hits = o.mode === 'content' ? o.numLines : o.mode === 'count' ? o.numMatches : undefined
      if (typeof hits === 'number') result = plural(hits, 'hit')
      else if (typeof o.numFiles === 'number') result = plural(o.numFiles, 'file')
      else if (text) result = plural(text.split('\n').filter(Boolean).length, 'hit')
      break
    }
    case 'Glob': {
      verb = 'find'; target = str(i.pattern) + (i.path ? ` in ${path(i.path)}` : '')
      if (typeof o.numFiles === 'number') result = plural(o.numFiles, 'file')
      else if (Array.isArray(o.filenames)) result = plural(o.filenames.length, 'file')
      break
    }
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': {
      icon = '✎'; verb = 'edit'; tone = 'edit'; target = base(str(i.file_path || i.notebook_path))
      const d = diffCount(output)
      if (d) result = `+${d.add} −${d.del}`
      break
    }
    case 'Write': {
      icon = '✎'; verb = 'write'; tone = 'edit'; target = base(str(i.file_path))
      const d = diffCount(output)
      if (o.type === 'create') result = `new · ${plural(str(i.content).split('\n').length, 'line')}`
      else if (d) result = `+${d.add} −${d.del}`
      break
    }
    case 'Bash': {
      verb = bashVerb(str(i.command)); target = shownCommand(str(i.command)); tone = 'run'
      if (verb === 'test' && output !== undefined) {
        const s = testSummary(text)
        if (s && /failed/.test(s)) { result = s; icon = '✗'; tone = 'err' }
        else if (s) { result = s; icon = '✓'; tone = 'ok' }
      }
      if (!result && output !== undefined) {
        const n = text.split('\n').filter(l => l.trim()).length
        const l = lastLine(text)
        if (o.backgroundTaskId) result = 'in background'
        else if (o.interrupted) result = 'interrupted'
        else if (!n) result = 'done'
        else if (verb !== 'test' && n <= 3 && l.length <= 48) result = l
        else result = plural(n, 'line')
      }
      break
    }
    case 'WebFetch': {
      verb = 'fetch'
      try { const u = new URL(str(i.url)); target = u.host + (u.pathname === '/' ? '' : u.pathname) } catch { target = str(i.url) }
      if (typeof o.code === 'number') result = String(o.code)
      break
    }
    case 'WebSearch': {
      verb = 'web'; target = `"${str(i.query)}"`
      break
    }
    case 'Agent': case 'Task': {
      icon = '◈'; verb = 'agent'; target = str(i.description) || str(i.subagent_type)
      if (typeof o.totalToolUseCount === 'number') result = `${plural(o.totalToolUseCount, 'step')} · ${Math.round((o.totalDurationMs ?? 0) / 1000)}s`
      break
    }
    case 'Skill': {
      verb = 'skill'; target = str(i.skill) || str(i.name)
      break
    }
    default: {
      const m = /^mcp__(.+?)__(.+)$/.exec(tool)
      if (m) { verb = m[1].replace(/^plugin[_:-]/, '').replace(/[_-].*$/, '').slice(0, 8).toLowerCase(); target = m[2].replace(/_/g, ' ') }
      const arg = Object.values(i).find(v => typeof v === 'string' && v.length > 0) as string | undefined
      target = [target, arg ? firstLine(arg) : ''].filter(Boolean).join(' · ')
    }
  }

  if (flags.isInterrupted) { icon = '◌'; tone = 'stop'; result = 'interrupted' }
  else if (flags.isErrored) { icon = '✗'; tone = 'err'; result = firstLine(text).replace(/^Error:\s*/i, '').replace(/^<[^>]+>/, '').slice(0, 60) || 'failed' }
  else if (flags.isRunning || output === undefined) { icon = '●'; tone = 'live'; result = '…' }
  return { icon, verb: verb.slice(0, 8), target: firstLine(target), result, tone }
}

// The raw output an opened step shows (a diff for edits).
export function rawLines(tool: string, input: unknown, output: unknown): RawLine[] {
  const o = obj(output)
  if ((tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') && Array.isArray(o.structuredPatch) && o.structuredPatch.length) {
    const out: RawLine[] = []
    for (const h of o.structuredPatch) {
      out.push({ text: `@@ ${h.oldStart},${h.oldLines} → ${h.newStart},${h.newLines}`, kind: 'meta' })
      for (const l of h.lines ?? []) out.push({ text: l, kind: l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : undefined })
    }
    return out
  }
  if (tool === 'Write' && typeof obj(input).content === 'string') return str(obj(input).content).split('\n').map(text => ({ text: `+${text}`, kind: 'add' as const }))
  const text = outputText(output).replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+$/, '')
  return text ? text.split('\n').map(t => ({ text: t.replace(/\t/g, '  ') })) : [{ text: '(no output)', kind: 'meta' }]
}

// A thought as the narration line: plain words (no markdown ticks or stars), its first sentence.
export function gist(thought: string): string {
  const t = thought.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim()
  const m = /^(.{12,}?[.!?])(\s|$)/.exec(t)
  return (m ? m[1] : t).replace(/[.]$/, '')
}

// Word-wrap to `w` columns (an opened thought).
export function wrap(text: string, w: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > w) { out.push(line); line = word } else line = line ? `${line} ${word}` : word
    }
    out.push(line)
  }
  return out
}

// Middle-cut a path-like target, end-cut anything else, to `n` columns.
export function fit(s: string, n: number): string {
  if (n <= 1) return ''
  if ([...s].length <= n) return s
  const cs = [...s]
  if (/^[~./\w-]+\/[\w./-]+$/.test(s)) { const tail = Math.ceil((n - 1) / 2); return cs.slice(0, n - 1 - tail).join('') + '…' + cs.slice(cs.length - tail).join('') }
  return cs.slice(0, n - 1).join('') + '…'
}

// ── drawing ──

const toneColor = (t: Tone) => ({ look: C.body, edit: C.work, ok: C.done, run: C.body, err: C.err, live: C.work, stop: C.meta, think: C.think }[t])
const VERB_W = 9
const INDENT = 2 // the rail and its space

function stepLine(el: any, key: string, step: Step, columns: number, onPress: () => void) {
  const { Button, Text } = el
  const room = Math.max(8, columns - INDENT - 2 - VERB_W - (step.result ? [...step.result].length + 2 : 0) - 2)
  const isThink = step.tone === 'think'
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={C.gutter}>┊ </Text>
      <Text color={toneColor(step.tone)}>{step.icon} </Text>
      <Text color={isThink ? C.think : C.meta}>{step.verb.padEnd(VERB_W)}</Text>
      <Text color={isThink ? C.meta : C.body} italic={isThink}>{fit(step.target, room)}</Text>
      {step.result ? <Text color={step.tone === 'err' ? C.err : C.meta}>{'  '}{step.result}</Text> : ''}
    </Button>
  )
}

function rawBlock(el: any, key: string, lines: RawLine[], columns: number) {
  const { Box, Text } = el
  const shown = lines.slice(0, RAW_ROWS)
  const more = lines.length - shown.length
  const w = Math.max(10, columns - 8)
  return (
    <Box key={key} flexDirection="column">
      {shown.map((l, n) => (
        <Text key={`${key}-${n}`}><Text color={C.gutter}>┊   │ </Text><Text color={l.kind === 'add' ? C.add : l.kind === 'del' ? C.del : C.meta}>{fit(l.text, w)}</Text></Text>
      ))}
      {more > 0 ? <Text><Text color={C.gutter}>┊   │ </Text><Text color={C.meta} italic>… {plural(more, 'more line')} · ctrl+o shows all</Text></Text> : ''}
    </Box>
  )
}

// ── wiring ──

// A render hook that throws hands the row back to the engine.
function passOnError($: any, e: any, next: any) { return next(e) }

type Gate = () => boolean

// This session's facts, set by the mod's session.start (module variables start over on a reload,
// and session.start runs again then).
let ctx: Ctx = {}
let off = false

export async function timelineStart($: any, cwd: string | undefined) {
  try {
    off = (await $.env.get('PALS_TIMELINE')) === '0'
    ctx = { cwd: cwd ?? '', home: (await $.env.get('HOME')) ?? '' }
  } catch { /* defaults */ }
}

type Call = { id: string; tool: string; input: unknown; output: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean }

// The lines for some calls: each call, and its raw output when opened.
async function stepRows($: any, e: any, el: any, calls: Call[]) {
  const columns = e.viewport?.columns ?? 100
  const out: any[] = []
  for (const c of calls) {
    const step = describe(c.tool, c.input, c.output, c, ctx)
    const open = await read($, memberOf(isOpen, { requestId: c.id }))
    out.push(stepLine(el, c.id, step, columns, () => void update($, memberOf(isOpen, { requestId: c.id }), (v: boolean | undefined) => !v)))
    if (open && c.output !== undefined) out.push(rawBlock(el, `${c.id}-raw`, rawLines(c.tool, c.input, c.output), columns))
  }
  return out
}

// The engine's summary of the model's thinking between two calls → the dim "◇ thinking" line;
// pressed, the whole summary.
async function thoughtRow($: any, e: any, el: any) {
  const columns = e.viewport?.columns ?? 100
  const text = String(e.props.text ?? '').trim()
  const open = await read($, memberOf(isOpen, e))
  const rows = [stepLine(el, 'thought', { icon: '◇', verb: 'thinking', target: gist(text), result: '', tone: 'think' }, columns,
    () => void update($, memberOf(isOpen, e), (v: boolean | undefined) => !v))]
  if (open) rows.push(rawBlock(el, 'thought-raw', wrap(text, Math.max(20, columns - 8)).map(t => ({ text: t, kind: 'meta' as const })), columns))
  return rows
}

export function registerTimeline(on: any, isPal: Gate) {
  const live = () => isPal() && !off

  // One call's row → its line (and its thought, and its raw output when opened).
  on('ui.render', { component: 'ToolUse' }, async ($: any, e: any, next: any) => {
    const p = e.props
    if (!live() || p.isExpanded || ENGINE_ROWS.has(String(p.tool))) return next(e)
    const el = $.ui.resolve(e)
    const rows = await stepRows($, e, el, [{ id: p.tool_use_id, tool: String(p.tool), input: p.input, output: p.output, isRunning: p.isRunning, isErrored: p.isErrored, isInterrupted: p.isInterrupted }])
    return <el.Box flexDirection="column">{rows}</el.Box>
  }).catch(passOnError)

  // The block under a standalone row: the line already says it (opened, the line shows it raw).
  on('ui.render', { component: 'ToolResult' }, async ($: any, e: any, next: any) => {
    const p = e.props
    if (!live() || p.isExpanded || ENGINE_ROWS.has(String(p.tool))) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  }).catch(passOnError)

  // Thinking, as the engine summarised it between two calls.
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any, next: any) => {
    if (!live() || e.props.isSummary !== true || !String(e.props.text ?? '').trim()) return next(e)
    const el = $.ui.resolve(e)
    return <el.Box flexDirection="column">{await thoughtRow($, e, el)}</el.Box>
  }).catch(passOnError)

  // "Read 3 files, searched 2 patterns" → a line per call.
  on('ui.render', { component: 'ToolGroup' }, async ($: any, e: any, next: any) => {
    const p = e.props
    if (!live() || p.isExpanded || p.isCallsOnly !== true) return next(e)
    const calls = (p.calls ?? []).filter((c: any) => c.tool_use_id)
    if (!calls.length || calls.length !== p.calls.length) return next(e)
    const el = $.ui.resolve(e)
    const rows = await stepRows($, e, el, calls.map((c: any) => ({ id: c.tool_use_id, tool: String(c.tool), input: c.input, output: c.output, isRunning: c.isRunning, isErrored: c.isErrored, isInterrupted: c.isInterrupted })))
    return <el.Box flexDirection="column">{rows}</el.Box>
  }).catch(passOnError)
}
