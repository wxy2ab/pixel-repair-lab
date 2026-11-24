import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { initialMirrors, isMirrorLayout, laserTrialIssues, mirrorGrid } from '../src/shared/laserTrial'
import { shortChallengeLinkIssues } from '../src/shared/shortChallenges'
import type { GridLevel } from '../src/shared/types'
import { parseChallengeDraft } from '../src/web/challengeDraft'

const read = (name: string): GridLevel => JSON.parse(readFileSync(new URL('../levels/' + name, import.meta.url), 'utf8'))
const race = read('1980-laser-mirror-race.json')
const first = read('1978-laser-shortcut.json')
const second = read('1979-laser-turned-mirror.json')

test('the two series only share winning programs with their own crossing levels', () => {
  const ferry = read('1975-ferry-crossing.json')
  const catalog = [first, second, race, ferry]
  assert.deepEqual(shortChallengeLinkIssues(second, catalog), [])
  const mixed: GridLevel = { ...second, laserTrial: { kind: 'crossing', next: ferry.id, carryFrom: race.id } }
  assert.deepEqual(shortChallengeLinkIssues(mixed, catalog).map(issue => issue.path), ['/laserTrial/next', '/laserTrial/carryFrom'])
})

test('movable mirror order follows the configured identifiers and a race draft restores only playable pieces', () => {
  const trial = race.laserTrial
  assert.ok(trial?.kind === 'race')
  const layout = initialMirrors(race)
  assert.equal(isMirrorLayout(race, layout), true)
  const reference = mirrorGrid(race, trial.solutionMirrors)
  assert.deepEqual(initialMirrors(reference), trial.solutionMirrors)
  assert.deepEqual(initialMirrors(race), layout)
  const reversed: GridLevel = { ...race, laserTrial: { ...trial, mirrorIds: [...trial.mirrorIds].reverse() } }
  assert.deepEqual(initialMirrors(reversed), [...layout].reverse())

  const base = { kind: 'grid', mode: 'cards', cards: [] }
  const restore = (mirrors: unknown, commands: unknown) => parseChallengeDraft(race, JSON.stringify({ ...base, laserRace: { mirrors, commands } }))
  const valid = { mirrors: trial.solutionMirrors, commands: ['up', 'right'] }
  assert.deepEqual(restore(valid.mirrors, valid.commands), { ...base, laserRace: valid })
  assert.deepEqual(restore(layout, ['not-a-direction']), base)
  const emitter = race.devices!.find(device => device.kind === 'laser')!
  const exit = race.objectives.find(goal => goal.type === 'exit')!
  for (const invalid of [race.start, exit, emitter, { x: -1, y: 0 }, layout[1], { orientation: '?' }]) {
    assert.deepEqual(restore([{ ...layout[0], ...invalid }, layout[1]], []), base)
  }
  assert.deepEqual(laserTrialIssues(race), [])
  const unknown: GridLevel = { ...race, laserTrial: { ...trial, mirrorIds: ['missing', trial.mirrorIds[1]] } }
  assert.ok(laserTrialIssues(unknown).some(issue => issue.path === '/laserTrial/mirrorIds'))
})
