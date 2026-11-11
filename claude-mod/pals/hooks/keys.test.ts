import { expect, mock, test } from 'claude-code/testing'

import { refusal } from './keys'

const KEYS = '/home/dee/.config/project-pals/helpers'

async function start($: any, on: any, terminal: string | undefined) {
  mock.clock(on)
  on('env.get', (_: any, e: any) => ({ value: e.name === 'HC_TERMINAL_ID' ? terminal : e.name === 'HOME' ? '/home/dee' : undefined }))
  on('command.register', () => ({ value: { command: 'desk' } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
}

test('what counts as reaching for a helper key', async () => {
  expect(refusal({ file_path: `${KEYS}/pals.key` })).toContain('trusted helpers keep their keys')
  expect(refusal({ file_path: '~/.config/project-pals/helpers/pals.key' })).toBeTruthy()
  expect(refusal({ path: KEYS, pattern: 'palkey' })).toBeTruthy()
  expect(refusal({ pattern: '**/project-pals/helpers/*.key' })).toBeTruthy()
  expect(refusal({ path: '/w', glob: 'project-pals/helpers/*' })).toBeTruthy()
  expect(refusal({ pattern: 'palkey_' + 'A'.repeat(43) })).toBeTruthy()
  // Not the keys: the mod's and the tests' own source, the data folder's record, look-alike names.
  expect(refusal({ file_path: '/w/mods/crew-helpers/main.js' })).toBe(null)
  expect(refusal({ file_path: '/w/bin/crewhelpers.py' })).toBe(null)
  expect(refusal({ file_path: '/home/dee/.config/project-pals-old/helpers.txt' })).toBe(null)
  expect(refusal({ path: '/w', pattern: 'PAL_HELPER|palkey_' })).toBe(null)
  expect(refusal({ file_path: 42 as any })).toBe(null)
})

test('a pal cannot read, search or list the keys; anything else goes through', async ($, on) => {
  const ran: string[] = []
  on('tool.call', (_: any, e: any) => { ran.push(e.tool); return { result: {} } })
  await start($, on, 't9')
  const read = await $.tool.call({ tool: 'Read', file_path: `${KEYS}/pals.key` } as any)
  expect(read.deny).toContain("isn't a pal's to read")
  expect((await $.tool.call({ tool: 'Grep', pattern: 'palkey', path: KEYS } as any)).deny).toBeTruthy()
  expect((await $.tool.call({ tool: 'Glob', pattern: `${KEYS}/*` } as any)).deny).toBeTruthy()
  expect(ran).toEqual([])
  expect((await $.tool.call({ tool: 'Read', file_path: '/w/README.md' } as any)).deny).toBe(undefined)
  expect((await $.tool.call({ tool: 'Grep', pattern: 'helpers', path: '/w' } as any)).deny).toBe(undefined)
  expect(ran).toEqual(['Read', 'Grep'])
})

test('outside a pal the mod refuses nothing', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  await start($, on, undefined)
  expect((await $.tool.call({ tool: 'Read', file_path: `${KEYS}/pals.key` } as any)).deny).toBe(undefined)
})
