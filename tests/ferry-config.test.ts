import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ferryIssues, initialFerryLayout } from '../src/shared/ferry'
import { shortChallengeLinkIssues } from '../src/shared/shortChallenges'
import type { GridLevel } from '../src/shared/types'
import { parseChallengeDraft } from '../src/web/challengeDraft'

function readLevel(file: string): GridLevel {
  return JSON.parse(readFileSync(new URL('../levels/' + file, import.meta.url), 'utf8'))
}

const first = readLevel('1975-ferry-crossing.json')
const second = readLevel('1976-ferry-early-pulse.json')
const race = readLevel('1977-ferry-robot-race.json')

test('ferry links can bring a crossing program forward and point to the race', () => {
  const catalog = [first, second, race]
  assert.deepEqual(catalog.flatMap(level => shortChallengeLinkIssues(level, catalog)), [])
  const wrongLinks: GridLevel = { ...second, ferry: { kind: 'crossing', next: second.id, carryFrom: race.id } }
  assert.deepEqual(shortChallengeLinkIssues(wrongLinks, catalog).map(issue => issue.path), ['/ferry/next', '/ferry/carryFrom'])
})

test('a ferry race has a deadline and two usable layouts with separate pieces', () => {
  assert.deepEqual(ferryIssues(race), [])
  assert.ok(race.ferry?.kind === 'race')
  const invalid: GridLevel = { ...race, turnLimit: undefined, ferry: { ...race.ferry, wall: race.start,
    solutionLayout: { ...race.ferry.solutionLayout, wall: race.ferry.solutionLayout.batteries[0] } } }
  assert.deepEqual(ferryIssues(invalid).map(issue => issue.path), ['/turnLimit', '/ferry/wall', '/ferry/solutionLayout'])
})

test('restoring a race draft validates its current map and route without affecting ordinary grid drafts', () => {
  const layout = initialFerryLayout(race)
  const route = { layout, commands: ['up', 'pick', 'wait'] }
  const base = { kind: 'grid', mode: 'cards', cards: [] }
  const restore = (level: GridLevel, ferryRace: unknown) => parseChallengeDraft(level, JSON.stringify({ ...base, ferryRace }))
  assert.deepEqual(restore(race, route), { ...base, ferryRace: route })
  assert.deepEqual(restore(race, { layout: { ...layout, wall: { x: -1, y: 3 } }, commands: [] }), base)
  assert.deepEqual(restore(race, { ...route, commands: ['jump'] }), base)
  assert.deepEqual(restore(first, route), base)
  assert.deepEqual(parseChallengeDraft(first, JSON.stringify(base)), base)
})
