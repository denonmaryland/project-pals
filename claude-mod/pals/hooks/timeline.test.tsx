import { expect, mock, test } from 'claude-code/testing'

import { bashVerb, describe as step, diffCount, fit, gist, relPath, shownCommand, testSummary, wrap } from './timeline'

// ── the line each call becomes ──

test('read, edit, search, test: icon, verb, target, short result', async () => {
  const read = step('Read', { file_path: '/w/src/auth/LoginButton.tsx' }, { type: 'text', file: { filePath: '', content: '', numLines: 84, startLine: 1, totalLines: 84 } }, {}, { cwd: '/w' })
  expect(read).toEqual({ icon: '▸', verb: 'read', target: 'src/auth/LoginButton.tsx', result: '84 lines', tone: 'look' })

  const edit = step('Edit', { file_path: '/w/src/auth/LoginButton.tsx' }, { structuredPatch: [{ oldStart: 12, oldLines: 7, newStart: 12, newLines: 3, lines: [' a', '-b', '-c', '+d'] }] }, {})
  expect(edit).toEqual({ icon: '✎', verb: 'edit', target: 'LoginButton.tsx', result: '+1 −2', tone: 'edit' })

  const t = step('Bash', { command: 'cd /w && npm test -- auth.spec.ts' }, { stdout: ' ✓ auth.spec.ts (12 tests)\n      Tests  12 passed (12)\n', stderr: '', interrupted: false }, {})
  expect(t).toEqual({ icon: '✓', verb: 'test', target: 'npm test -- auth.spec.ts', result: '12 passed', tone: 'ok' })

  const run = step('Bash', { command: 'pal-room say x "hi"' }, { stdout: 'posted to #x\n', stderr: '', interrupted: false }, {})
  expect(run.verb).toBe('pal')
  expect(run.result).toBe('posted to #x')
})

test('running, errored and interrupted calls', async () => {
  expect(step('Read', { file_path: '/a/b' }, undefined, { isRunning: true })).toMatchObject({ icon: '●', result: '…', tone: 'live' })
  expect(step('Bash', { command: 'make' }, 'Error: Exit code 2\nmake: *** No rule', { isErrored: true })).toMatchObject({ icon: '✗', result: 'Exit code 2', tone: 'err' })
  expect(step('Bash', { command: 'sleep 9' }, 'Interrupted', { isInterrupted: true })).toMatchObject({ icon: '◌', result: 'interrupted' })
})

test('other tools still get a line', async () => {
  expect(step('mcp__paper__get_screenshot', { nodeId: 'n1' }, 'ok', {})).toMatchObject({ verb: 'paper', target: 'get screenshot · n1' })
  expect(step('WebFetch', { url: 'https://herdr.dev/docs' }, {}, {})).toMatchObject({ verb: 'fetch', target: 'herdr.dev/docs' })
  expect(step('Agent', { description: 'Find the bug' }, { totalToolUseCount: 7, totalDurationMs: 12400 }, {})).toMatchObject({ icon: '◈', verb: 'agent', result: '7 steps · 12s' })
})

test('helpers', async () => {
  expect(relPath('/home/d/x/y', '/home/d/x', '/home/d')).toBe('y')
  expect(relPath('/home/d/other', '/home/d/x', '/home/d')).toBe('~/other')
  expect(testSummary('Ran 31 tests in 4.20s\n\nOK\n')).toBe('31 passed · 4.2s')
  expect(testSummary('3 failed, 9 passed in 1.1s')).toBe('3 failed · 9 passed')
  expect(testSummary('✔ a\nℹ tests 3\nℹ pass 2\nℹ fail 1\nℹ duration_ms 60')).toBe('1 failed · 2 passed')
  expect(testSummary('✔ a (0.4ms)\n✖ b (0.2ms)\n  TypeError: x\n✖ c (1ms)')).toBe('2 failed · 1 passed')
  expect(shownCommand('cd /w && npm test 2>&1 | tail -40')).toBe('npm test')
  expect(shownCommand("cat >> t.js <<'EOF'\ntest('x')\nEOF\nnpm test 2>&1 | tail -20")).toBe('npm test')
  expect(shownCommand('make a\nmake b')).toBe('make a …')
  expect(step('Grep', { pattern: 'x' }, { mode: 'content', numFiles: 0, numLines: 6 }, {}).result).toBe('6 hits')
  expect(bashVerb('git status --short')).toBe('git')
  expect(bashVerb('python3 -m unittest discover -s tests')).toBe('test')
  expect(diffCount({ gitDiff: { additions: 3, deletions: 7 } })).toEqual({ add: 3, del: 7 })
  expect(gist('It reads session state twice. Then it renders.')).toBe('It reads session state twice')
  expect(fit('src/auth/components/LoginButton.tsx', 20)).toBe('src/auth/…Button.tsx')
  expect(fit('a fairly long sentence here', 10)).toBe('a fairly …')
  expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four'])
})

// ── drawing ──

const engine = (on: any) =>
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })

async function asPal($: any, on: any) {
  mock.clock(on)
  on('env.get', (_: any, e: any) => ({ value: e.name === 'HC_TERMINAL_ID' ? 't9' : e.name === 'HOME' ? '/h' : undefined }))
  on('command.register', () => ({ value: { command: 'desk' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
}

const toolUse = (surface: 'terminal' | 'desktop', props: Record<string, unknown>) => ({
  plugin: 'pals', component: 'ToolUse', surface, requestId: 'tu1',
  props: { tool_use_id: 'tu1', tool: 'Read', input: { file_path: '/w/src/a.ts' }, isRunning: false, isErrored: false, isInterrupted: false, output: { type: 'text', file: { filePath: '/w/src/a.ts', content: 'one\ntwo', numLines: 2, startLine: 1, totalLines: 2 } }, ...props },
}) as any

test('outside a pal, the engine draws its own rows', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(toolUse('terminal', {}))
  expect((await ui.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
  await ui.unmount()
})

test('in a pal, a call is one line, and pressing it opens the raw output', async ($, on) => {
  engine(on)
  await asPal($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(toolUse(surface, {}))
    expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeFalsy()
    const line = await ui.find({ type: 'Button', key: 'tu1' })
    expect(line?.text).toContain('read')
    expect(line?.text).toContain('src/a.ts')
    expect(line?.text).toContain('2 lines')
    expect(await ui.find({ type: 'Text', text: /^two$/ })).toBeFalsy()
    await ui.press({ key: 'tu1' })
    expect((await ui.find({ type: 'Text', text: /^two$/ }))?.text).toBe('two')
    await ui.press({ key: 'tu1' })
    expect(await ui.find({ type: 'Text', text: /^two$/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('ctrl+o (expanded) and question rows keep the engine drawing', async ($, on) => {
  engine(on)
  await asPal($, on)
  let ui = await $.ui.mount(toolUse('terminal', { isExpanded: true }))
  expect((await ui.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
  await ui.unmount()
  ui = await $.ui.mount(toolUse('terminal', { tool: 'AskUserQuestion', input: { questions: [] } }))
  expect((await ui.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
  await ui.unmount()
})

test('the result block under a row is folded into the line', async ($, on) => {
  engine(on)
  await asPal($, on)
  const ui = await $.ui.mount({ plugin: 'pals', component: 'ToolResult', surface: 'terminal', requestId: 'tu1', props: { tool_use_id: 'tu1', tool: 'Bash', output: { stdout: 'x', stderr: '' }, isErrored: false } } as any)
  expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeFalsy()
  await ui.unmount()
})

test('a folded group becomes a line per call; a mixed group stays the engine\'s', async ($, on) => {
  engine(on)
  await asPal($, on)
  const calls = [
    { tool_use_id: 'g1', tool: 'Read', input: { file_path: '/w/a.ts' }, isRunning: false, isErrored: false, isInterrupted: false, output: { type: 'text', file: { numLines: 9, startLine: 1, totalLines: 9 } } },
    { tool_use_id: 'g2', tool: 'Grep', input: { pattern: 'useSession' }, isRunning: true, isErrored: false, isInterrupted: false },
  ]
  let ui = await $.ui.mount({ plugin: 'pals', component: 'ToolGroup', surface: 'terminal', requestId: 'grp', props: { calls, isActive: true, isExpanded: false, isCallsOnly: true } } as any)
  expect((await ui.find({ type: 'Button', key: 'g1' }))?.text).toContain('9 lines')
  expect((await ui.find({ type: 'Button', key: 'g2' }))?.text).toContain('"useSession"')
  await ui.unmount()
  ui = await $.ui.mount({ plugin: 'pals', component: 'ToolGroup', surface: 'terminal', requestId: 'grp2', props: { calls, isActive: false, isExpanded: false, isCallsOnly: false } } as any)
  expect((await ui.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
  await ui.unmount()
})

test('the engine\'s thinking summary becomes the dim thinking line; prose stays the engine\'s', async ($, on) => {
  engine(on)
  await asPal($, on)
  const row = (props: Record<string, unknown>) => ({ plugin: 'pals', component: 'AssistantMessage', surface: 'terminal', requestId: 'm1', props: { isFirstOfReply: true, ...props } }) as any
  let ui = await $.ui.mount(row({ text: 'All three tests crash at `cart.js:5`. I suspect an off-by-one.', isSummary: true }))
  const line = await ui.find({ type: 'Button', key: 'thought' })
  expect(line?.text).toContain('thinking')
  expect(line?.text).toContain('All three tests crash at cart.js:5')
  expect(line?.text).not.toContain('off-by-one')
  await ui.press({ key: 'thought' })
  expect((await ui.find({ type: 'Text', text: /off-by-one/ }))?.text).toContain('off-by-one')
  await ui.unmount()
  ui = await $.ui.mount(row({ text: 'Fixed. It subscribed twice.' }))
  expect((await ui.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
  await ui.unmount()
})
