import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test, type TestContext } from 'node:test'
import { previewArenaMatch } from '../src/engine/arenaMatchPreview'
import type { ArenaLevel } from '../src/shared/advanced'
import { readArenaMatch, readArenaMatchRecord, saveArenaMatch } from '../src/web/arenaMatchProgress'
import { readUnfinishedArenaMatches } from '../src/web/unfinishedArenaMatches'

const junction = JSON.parse(readFileSync(new URL('../levels/1803-junction-race.json', import.meta.url), 'utf8')) as ArenaLevel
const freight = JSON.parse(readFileSync(new URL('../levels/1817-freight-carousel.json', import.meta.url), 'utf8')) as ArenaLevel

function mockStorage(context: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    },
  })
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  return values
}

test('publishing an unchanged checkpoint preserves both dated and legacy saves', context => {
  const values = mockStorage(context)
  let now = 1_000
  context.mock.method(Date, 'now', () => now)
  const checkpoint = { actions: [], remainingMs: 750 }
  assert.equal(saveArenaMatch(junction, 'timed', checkpoint), true)
  assert.equal(readArenaMatchRecord(junction, 'timed')?.savedAt, 1_000)
  assert.equal(readArenaMatch(junction, 'timed')?.remainingMs, 750)

  now = 2_000
  assert.equal(saveArenaMatch(junction, 'timed', { remainingMs: 750, actions: [] }), true)
  assert.equal(readArenaMatchRecord(junction, 'timed')?.savedAt, 1_000)

  const key = `pixel-repair-lab:arena-match:${junction.id}:timed`
  const { scenario, progress } = JSON.parse(values.get(key)!)
  values.set(key, JSON.stringify({ scenario, progress }))
  assert.equal(saveArenaMatch(junction, 'timed', checkpoint), true)
  assert.equal(readArenaMatchRecord(junction, 'timed')?.savedAt, undefined)

  assert.equal(saveArenaMatch(junction, 'timed', { ...checkpoint, remainingMs: 600 }), true)
  assert.equal(readArenaMatchRecord(junction, 'timed')?.savedAt, 2_000)
})

test('saved matches sort globally by time, putting undated saves last and keeping their previews', context => {
  const values = mockStorage(context)
  let now = 1_000
  context.mock.method(Date, 'now', () => now)
  saveArenaMatch(junction, 'timed', { actions: [], remainingMs: 800 })
  saveArenaMatch(freight, 'timed', { actions: [], remainingMs: 650 })
  now = 2_000
  saveArenaMatch(freight, 'relaxed', { source: freight.solutionCode, step: 1, personal: {}, course: {} })
  now = 3_000
  saveArenaMatch(junction, 'relaxed', { source: junction.solutionCode, step: 1, personal: {}, course: {} })
  const key = `pixel-repair-lab:arena-match:${junction.id}:timed`
  const { scenario, progress } = JSON.parse(values.get(key)!)
  values.set(key, JSON.stringify({ scenario, progress, savedAt: Number.MAX_SAFE_INTEGER }))

  const matches = readUnfinishedArenaMatches([freight, junction])
  assert.deepEqual(matches.map(({ level, mode, savedAt }) => [level.id, mode, savedAt]), [
    [junction.id, 'relaxed', 3_000],
    [freight.id, 'relaxed', 2_000],
    [freight.id, 'timed', 1_000],
    [junction.id, 'timed', undefined],
  ])
  assert.equal(previewArenaMatch(matches[0])?.savedAt, 3_000)
  assert.equal(previewArenaMatch(matches[3])?.savedAt, undefined)
  assert.equal(readArenaMatch(junction, 'timed')?.remainingMs, 800)
})
