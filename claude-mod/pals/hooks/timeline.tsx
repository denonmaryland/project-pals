// The work timeline (task T78): a pal's tool calls as one calm line each, in Claude Code.
//
// Mockup DeNon approved (2026-11-09, MUSE's crew-boards/terminal-feel/work-timeline-mockup.html):
//
//   ┊ ◇ thinking it reads session state twice…
//   ┊ ▸ read     src/auth/LoginButton.tsx  84 lines
//   ┊ ▸ search   "useSession"  4 hits
//   ┊ ∆ edit     LoginButton.tsx  +3 −7
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

import { atom, memberOf, read, update } from 'claude-code'

import type { TurnSteps } from '../types'

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
const SMALL_DIFF = 4 // DeNon (2026-11-09): edits of this many changed lines or fewer show their diff inline

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
const TEST_FILE = /(\.(test|spec)\.\w+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$)/

// ── what a shell command touched ──

type Seg = { words: string[]; raw: string; redirect?: string }

// A command line → its simple commands: quote-aware, heredoc bodies dropped, only the first command
// of a pipeline (the rest are filters: `| tail -40`, `| grep x`).
export function segments(cmd: string): Seg[] {
  const kept: string[] = []
  let end: string | null = null
  for (const l of cmd.split('\n')) {
    if (end !== null) { if (l.trim() === end) end = null; continue }
    kept.push(l)
    const m = /<<-?\s*['"]?([\w-]+)['"]?/.exec(l)
    if (m) end = m[1]
  }
  const text = kept.join('\n')
  const parts: string[] = []
  let cur = '', q = '', piped = false
  for (let k = 0; k < text.length; k++) {
    const ch = text[k], nx = text[k + 1]
    if (q) { if (ch === q) q = ''; if (!piped) cur += ch; continue }
    if (ch === "'" || ch === '"') { q = ch; if (!piped) cur += ch; continue }
    if (ch === '\n' || ch === ';' || (ch === '&' && nx === '&') || (ch === '|' && nx === '|')) {
      parts.push(cur); cur = ''; piped = false
      if (ch !== '\n' && ch !== ';') k++
      continue
    }
    if (ch === '|' ) { piped = true; continue }
    if (!piped) cur += ch
  }
  parts.push(cur)
  const out: Seg[] = []
  for (const part of parts) {
    let raw = part.trim()
    if (!raw) continue
    const redirect = /(?:^|\s)\d?>>?\s*([^\s&|;<>]+)/.exec(raw)?.[1]
    raw = raw.replace(/\d?>>?\s*&?[^\s&|;<>]+/g, '').replace(/<<-?\s*['"]?[\w-]+['"]?/g, '').replace(/\s+/g, ' ').trim()
    const words = (raw.match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map(w => w.replace(/^(['"])(.*)\1$/, '$2'))
    while (words.length && (/^\w+=/.test(words[0]) || ['sudo', 'time', 'exec', 'do', 'then', 'else', 'nice', 'command'].includes(words[0]))) words.shift()
    if (!words.length || ['done', 'fi', 'esac', '{', '}', '(', ')'].includes(words[0])) continue
    out.push({ words, raw, redirect: redirect && redirect !== '/dev/null' ? redirect : undefined })
  }
  return out
}

type Kind = 'test' | 'edit' | 'run' | 'search' | 'read'
type Touch = { kind: Kind; files: string[]; pattern?: string; shown: string }

const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat', 'nl', 'wc', 'stat', 'file', 'xxd', 'od', 'jq', 'diff', 'cmp'])
const NOISE = new Set(['cd', 'echo', 'printf', 'export', 'set', 'true', 'false', ':', 'sleep', 'unset', 'local', 'read', 'shift', 'source', '.', 'exit', 'return', 'pwd', 'clear'])

function argsOf(words: string[], valueFlags: string[] = []): string[] {
  const out: string[] = []
  for (let k = 1; k < words.length; k++) {
    const w = words[k]
    if (valueFlags.includes(w)) { k++; continue }
    if (w.startsWith('-') && w !== '-') continue
    out.push(w)
  }
  return out
}

function touchOf(seg: Seg, loop: string[]): Touch | null {
  const w = seg.words, cmd = (w[0] ?? '').split('/').pop() ?? ''
  const files = (xs: string[]) => xs.flatMap(x => (x.includes('$') ? loop : [x])).filter(x => x && !/^\d+$/.test(x))
  if (TEST_CMD.test(seg.raw)) return { kind: 'test', files: files(w.slice(1)).filter(f => TEST_FILE.test(f)), shown: shownCommand(seg.raw) }
  if (cmd === 'for') { const k = w.indexOf('in'); if (k > 0) loop.push(...w.slice(k + 1).filter(x => x !== 'do')); return null }
  if (seg.redirect && (cmd === 'cat' || NOISE.has(cmd))) return { kind: 'edit', files: [seg.redirect], shown: seg.raw }
  if (NOISE.has(cmd) || ['if', 'while', 'until', 'case', 'wait', 'test', '['].includes(cmd)) return null
  if (cmd === 'tee') return { kind: 'edit', files: files(argsOf(w)), shown: seg.raw }
  if (cmd === 'sed' || cmd === 'perl') {
    const inPlace = w.some(x => /^-[a-zA-Z]*i/.test(x) || x === '--in-place' || /^-pi/.test(x))
    const hasE = w.includes('-e')
    const args = argsOf(w, ['-e', '-f'])
    const rest = hasE ? args : args.slice(1) // the first plain argument is the script
    return { kind: inPlace ? 'edit' : 'read', files: files(rest), shown: seg.raw }
  }
  if (cmd === 'awk') return { kind: 'read', files: files(argsOf(w, ['-F', '-v', '-f']).slice(1)), shown: seg.raw }
  if (READERS.has(cmd)) return { kind: 'read', files: files(argsOf(w)), shown: seg.raw }
  if (cmd === 'ls' || cmd === 'tree' || cmd === 'du') { const f = files(argsOf(w, ['-L', '-I'])); return { kind: 'read', files: f.length ? f : ['.'], shown: seg.raw } }
  if (['grep', 'rg', 'ag', 'ack', 'egrep', 'fgrep'].includes(cmd) || (cmd === 'git' && w[1] === 'grep')) {
    const ws = cmd === 'git' ? w.slice(1) : w
    const e = ws.indexOf('-e')
    const args = argsOf(ws, ['-e', '-f', '-m', '-A', '-B', '-C', '--max-count', '--glob', '-g', '-t', '--type', '--include', '--exclude'])
    const pattern = e > 0 ? ws[e + 1] : args[0]
    return { kind: 'search', files: files(e > 0 ? args : args.slice(1)), pattern, shown: seg.raw }
  }
  if (cmd === 'find' || cmd === 'fd') {
    const n = Math.max(w.indexOf('-name'), w.indexOf('-iname'), w.indexOf('-path'))
    return { kind: 'search', files: [], pattern: n > 0 ? w[n + 1] : argsOf(w)[0], shown: seg.raw }
  }
  return { kind: 'run', files: [], shown: shownCommand(seg.raw) }
}

export type ShellStep = { kind: Kind; verb: string; target: string; withTest: boolean }

// A Bash call → one verb and what it touched: an edit and a test in one command is the edit (its
// result the test's); a test outranks reads; an unknown command outranks reads and searches.
export function shellStep(cmd: string, ctx: Ctx = {}): ShellStep {
  const loop: string[] = []
  const touches = segments(cmd).map(sg => touchOf(sg, loop)).filter((t): t is Touch => t !== null)
  const of = (k: Kind) => touches.filter(t => t.kind === k)
  const tests = of('test'), edits = of('edit'), runs = of('run'), searches = of('search'), reads = of('read')
  const rel = (f: string) => relPath(f, ctx.cwd, ctx.home)
  const list = (fs: string[], name: (f: string) => string) => {
    const u = [...new Set(fs.map(name))]
    return u.length ? u[0] + (u.length > 1 ? ` +${u.length - 1}` : '') : ''
  }
  if (edits.length) return { kind: 'edit', verb: 'edit', target: list(edits.flatMap(t => t.files), rel) || edits[0].shown, withTest: tests.length > 0 }
  if (tests.length) return { kind: 'test', verb: 'test', target: list(tests.flatMap(t => t.files), rel) || tests[0].shown, withTest: true }
  if (runs.length) return { kind: 'run', verb: 'run', target: runs[0].shown + (runs.length > 1 ? ' …' : ''), withTest: false }
  if (searches.length) {
    const s = searches[0]
    const where = list(s.files, rel)
    return { kind: 'search', verb: 'search', target: `${s.pattern ? `"${s.pattern}"` : ''}${where ? ` in ${where}` : ''}`.trim(), withTest: false }
  }
  if (reads.length) return { kind: 'read', verb: 'read', target: list(reads.flatMap(t => t.files), rel) || '.', withTest: false }
  return { kind: 'run', verb: 'run', target: shownCommand(cmd), withTest: false }
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
      verb = 'search'; target = str(i.pattern) + (i.path ? ` in ${path(i.path)}` : '')
      if (typeof o.numFiles === 'number') result = plural(o.numFiles, 'file')
      else if (Array.isArray(o.filenames)) result = plural(o.filenames.length, 'file')
      break
    }
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': {
      icon = '∆'; verb = 'edit'; tone = 'edit'; target = path(i.file_path || i.notebook_path)
      const d = diffCount(output)
      if (d) result = `+${d.add} −${d.del}`
      break
    }
    case 'Write': {
      icon = '∆'; verb = 'edit'; tone = 'edit'; target = path(i.file_path)
      const d = diffCount(output)
      if (o.type === 'create') result = `new · ${plural(str(i.content).split('\n').length, 'line')}`
      else if (d) result = `+${d.add} −${d.del}`
      break
    }
    case 'Bash': {
      const sh = shellStep(str(i.command), ctx)
      verb = sh.verb; target = sh.target
      tone = sh.kind === 'edit' ? 'edit' : sh.kind === 'run' ? 'run' : 'look'
      if (sh.kind === 'edit') icon = '∆'
      const n = text.split('\n').filter(l => l.trim()).length
      if (output !== undefined) {
        const t = sh.withTest ? testSummary(text) : null
        if (t) { result = t; icon = /failed/.test(t) ? '✗' : '✓'; tone = /failed/.test(t) ? 'err' : 'ok' }
        else if (o.backgroundTaskId) result = 'in background'
        else if (o.interrupted) result = 'interrupted'
        else if (sh.kind === 'read') result = n ? plural(n, 'line') : ''
        else if (sh.kind === 'search') result = plural(n, 'hit')
        else if (sh.kind === 'run') { const l = lastLine(text); result = !n ? 'done' : n <= 3 && l.length <= 40 ? l : plural(n, 'line') }
        else if (sh.kind === 'test') result = n ? plural(n, 'line') : 'done'
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
// A small edit's changed lines (− and +, no context), shown under its line without a click; null
// for a bigger edit (one click away, as any step), a write of a new file, or a call that isn't an edit.
export function smallDiff(tool: string, output: unknown): RawLine[] | null {
  const o = obj(output)
  if (!['Edit', 'MultiEdit', 'Write'].includes(tool) || o.type === 'create' || !Array.isArray(o.structuredPatch)) return null
  const lines: RawLine[] = []
  for (const h of o.structuredPatch) for (const l of h?.lines ?? []) {
    if (typeof l !== 'string') continue
    if (l.startsWith('-')) lines.push({ text: `−${l.slice(1)}`, kind: 'del' })
    else if (l.startsWith('+')) lines.push({ text: l, kind: 'add' })
  }
  return lines.length && lines.length <= SMALL_DIFF ? lines : null
}

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
  if (tool === 'Bash') {
    const cmd = str(obj(input).command).split('\n').map((t, n) => ({ text: `${n ? '  ' : '$ '}${t}`, kind: 'meta' as const }))
    const body = outputText(output).replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+$/, '')
    return [...cmd, ...(body ? body.split('\n').map(t => ({ text: t.replace(/\t/g, '  ') })) : [])]
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

const TARGET_W = 40 // the target column; results line up after it (MUSE's review 1)

// The target column's width at this terminal width.
export function targetWidth(columns: number): number {
  return Math.max(12, Math.min(TARGET_W, columns - INDENT - 2 - VERB_W - 18))
}

// Up to `lines` lines of `w` columns, cut at a word, "…" when there's more.
export function clampWords(text: string, w: number, lines: number): string[] {
  const all = wrap(text.replace(/\s+/g, ' ').trim(), w)
  if (all.length <= lines) return all
  const out = all.slice(0, lines)
  let last = out[lines - 1]
  while ([...last].length + 1 > w && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '))
  out[lines - 1] = `${last.replace(/[\s,;:.]+$/, '')}…`
  return out
}

// "+3 −7" → its two halves, for green and red.
export function diffParts(result: string): [string, string] | null {
  const m = /^(\+\d+) (−\d+)$/.exec(result)
  return m ? [m[1], m[2]] : null
}

function stepLine(el: any, key: string, step: Step, columns: number, onPress: () => void) {
  const { Button, Text } = el
  const isThink = step.tone === 'think'
  const lead = INDENT + 2 + VERB_W
  if (isThink) {
    // Thinking: the summary's words, up to two lines, cut at a word.
    const [one, two] = clampWords(step.target, Math.max(12, columns - lead - 1), 2)
    return (
      <Button key={key} plain onPress={onPress}>
        <Text color={C.gutter}>┊ </Text>
        <Text color={C.think}>{step.icon} </Text>
        <Text color={C.think}>{step.verb.padEnd(VERB_W)}</Text>
        <Text color={C.meta} italic>{one}</Text>
        {two ? <Text color={C.gutter}>{'\n┊ '}</Text> : ''}
        {two ? <Text color={C.meta} italic>{' '.repeat(lead - INDENT)}{two}</Text> : ''}
      </Button>
    )
  }
  const tw = targetWidth(columns)
  const target = step.result ? fit(step.target, tw).padEnd(tw) : fit(step.target, columns - lead - 1)
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={C.gutter}>┊ </Text>
      <Text color={toneColor(step.tone)}>{step.icon} </Text>
      <Text color={C.meta}>{step.verb.padEnd(VERB_W)}</Text>
      <Text color={C.body}>{target}</Text>
      {diffParts(step.result) ? (
        <Text>{'  '}<Text color={C.add}>{diffParts(step.result)![0]}</Text> <Text color={C.del}>{diffParts(step.result)![1]}</Text></Text>
      ) : step.result ? <Text color={step.tone === 'err' ? C.err : step.tone === 'ok' ? C.done : C.meta}>{'  '}{fit(step.result, Math.max(6, columns - lead - tw - 3))}</Text> : ''}
    </Button>
  )
}

function rawBlock(el: any, key: string, lines: RawLine[], columns: number, dim = false) {
  const { Box, Text } = el
  const shown = lines.slice(0, RAW_ROWS)
  const more = lines.length - shown.length
  const w = Math.max(10, columns - 8)
  return (
    <Box key={key} flexDirection="column">
      {shown.map((l, n) => (
        <Text key={`${key}-${n}`}><Text color={C.gutter}>┊   │ </Text><Text color={l.kind === 'add' ? C.add : l.kind === 'del' ? C.del : C.meta} dimColor={dim}>{fit(l.text, w)}</Text></Text>
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
  // A resumed session draws its history before this ran: draw those rows again, as lines.
  try { if (!off) $.ui.invalidate('ui.render') } catch { /* they redraw on the next resize */ }
}

// ── the closing line: "Cooked for 26s · 9 steps" ──

const turns = atom({ plugin: 'pals', key: 'turns' } as const, [], { shape: 'turns-1' })
const T = { startedAt: 0, steps: 0, inTurn: false }

export async function timelineTurnStart($: any) {
  T.startedAt = await $.clock.now(); T.steps = 0; T.inTurn = true
}

export async function timelineTurnEnd($: any) {
  if (!T.inTurn) return
  const now = await $.clock.now()
  const done = { ms: now - T.startedAt, steps: T.steps, at: now }
  T.inTurn = false
  await update($, turns, (list: TurnSteps[]) => [...(list ?? []), done].slice(-60))
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function clock(at: number): string {
  try { return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
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
    else if (!c.isErrored && !c.isInterrupted) {
      const small = smallDiff(c.tool, c.output)
      if (small) out.push(rawBlock(el, `${c.id}-diff`, small, columns, true)) // dimmed: the line above is the step
    }
  }
  return out
}

// The engine's summary of the model's thinking between two calls → the dim "◇ thinking" line;
// pressed, the whole summary.
async function thoughtRow($: any, e: any, el: any) {
  const columns = e.viewport?.columns ?? 100
  const text = String(e.props.text ?? '').trim()
  const open = await read($, memberOf(isOpen, e))
  const rows = [stepLine(el, 'thought', { icon: '◇', verb: 'thinking', target: text.replace(/[`*_]/g, ''), result: '', tone: 'think' }, columns,
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

  // Count the main loop's calls, for the closing line.
  on('tool.call', ($: any, e: any, next: any) => {
    if (e.agentId === undefined && T.inTurn) T.steps++
    return next(e)
  }).catch(passOnError)

  // The turn's closing line, with its steps: "✻ Cooked for 26s · 9 steps · done 6:11 PM".
  on('ui.render', { component: 'TurnDuration' }, async ($: any, e: any, next: any) => {
    const p = e.props
    if (!live() || p.isExpanded || p.waitingFor) return next(e)
    const list: TurnSteps[] = (await read($, turns)) ?? []
    let best: TurnSteps | undefined
    for (const t of list) if (Math.abs(t.ms - p.durationMs) < 3000 && (!best || Math.abs(t.ms - p.durationMs) < Math.abs(best.ms - p.durationMs))) best = t
    if (!best || !best.steps) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const at = clock(best.at)
    return <Box marginTop={1}><Text color={C.meta}>✻ {p.word} for {duration(p.durationMs)} · {plural(best.steps, 'step')}{at ? ` · done ${at}` : ''}</Text></Box>
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
