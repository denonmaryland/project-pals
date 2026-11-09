import { expect, test } from 'claude-code/testing'

import { parseCards } from './register'

const CARD = [
  '[from Orca, a pal, not DeNon] 📥 Desk card c-7f3a9e · tell · soon',
  'Fix the build',
  'It fails on main.',
  '→ Close it with pal desk done c-7f3a9e "result".',
].join('\n')

const row = (text: string, surface: 'terminal' | 'desktop' = 'terminal') => ({
  plugin: 'pals',
  component: 'UserMessage',
  surface,
  props: { text, origin: { kind: 'plugin', name: 'pals' }, isExpanded: true },
}) as const

test('parseCards splits a batch into cards and plain text', async () => {
  const parts = parseCards(`Messages that came in while you were busy:\n\n${CARD}\n\n${CARD.replace(/c-7f3a9e/g, 'c-000001')}`)
  expect(parts.length).toBe(3)
  expect(parts[0]).toBe('Messages that came in while you were busy:')
  const card = parts[1] as { id: string; title: string; body: string; footer: string; tags: string }
  expect(card.id).toBe('c-7f3a9e')
  expect(card.title).toBe('Fix the build')
  expect(card.body).toBe('It fails on main.')
  expect(card.tags).toBe('tell · soon')
  expect(card.footer.startsWith('→ Close it')).toBe(true)
  expect(parseCards('just words').length).toBe(1)
})

test('a Desk card in the transcript is drawn as a card', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(row(CARD, surface) as any)
    expect((await ui.find({ type: 'Text', text: /^Fix the build$/ }))?.text).toBe('Fix the build')
    expect((await ui.find({ type: 'Text', text: /c-7f3a9e · tell · soon/ }))?.text).toContain('from Orca, a pal, not DeNon')
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeFalsy()
    await ui.unmount()
  }
})

test('any other message keeps the engine drawing', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const ui = await $.ui.mount(row('hello there') as any)
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('outside a pal there is no band', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('state.get', () => ({ value: { value: { pal: 'P', topic: 'desk', open: 2, held: 1, soon: 0 }, version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'pals', component: 'AbovePrompt', surface: 'terminal', props: {} } as any)
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('inside a pal, the band shows its open cards', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('env.get', (_, e) => ({ value: e.name === 'HC_TERMINAL_ID' ? 't9' : e.name === 'HOME' ? '/h' : undefined }))
  on('command.register', () => ({ value: { command: 'desk' } }))
  on('clock.every', () => ({ value: { cancel: () => {} } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('state.get', () => ({ value: { value: { pal: 'P', topic: 'desk', open: 2, held: 1, soon: 0 }, version: 1 } }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'pals', component: 'AbovePrompt', surface: 'terminal', props: {} } as any)
  expect((await ui.find({ type: 'Text', text: /Desk/ }))?.text).toBe('📥 Desk · #desk: 2 open cards · 1 held · /desk')
  await ui.unmount()
})
