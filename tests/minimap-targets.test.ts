import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArenaScenario } from '../src/shared/advanced'
import type { Scenario } from '../src/shared/types'
import { initialArenaSnapshot, initialSnapshot } from '../src/engine/snapshot'
import { arenaMapTargets, gridMapTargets } from '../src/web/station3d/mapTargets'

test('arena targets use the current objective, live robots and remaining supplies', () => {
  const exit = { x: 4, y: 0 }
  const level: ArenaScenario = {
    tiles: ['.....'], start: { x: 0, y: 0 }, maxTurns: 8,
    opponents: [{ id: 'guard', title: { zh: '守卫', en: 'Guard' }, start: exit, policy: { kind: 'pursue' } }],
    items: [{ x: 1, y: 0, id: 'parcel' }, { x: 2, y: 0, id: 'shield' }],
    objective: { kind: 'escape', itemIds: ['parcel'], exit },
  }
  const state = initialArenaSnapshot(level)
  assert.deepEqual(arenaMapTargets(level, state), [exit, state.items[0]])
  assert.deepEqual(arenaMapTargets({ ...level, objective: { kind: 'score' } }, state), state.items)
  const elimination = { ...level, objective: { kind: 'eliminate' } } as const
  assert.deepEqual(arenaMapTargets(elimination, state), [state.actors[1]])
  state.actors[1].hp = 0
  assert.deepEqual(arenaMapTargets(elimination, state), [])
})

test('grid targets include the exit and unopened required chests, leaving optional pickups unmarked', () => {
  const exit = { type: 'exit' as const, x: 3, y: 0 }
  const chest = { kind: 'chest' as const, id: 'parcel', x: 2, y: 0 }
  const level: Scenario = {
    tiles: ['....'], start: { x: 0, y: 0 }, devices: [chest], items: [{ id: 'spare', x: 1, y: 0 }],
    objectives: [exit, { type: 'collect', itemIds: [chest.id] }],
  }
  const state = initialSnapshot(level)
  assert.deepEqual(gridMapTargets(level, state), [exit, chest])
  state.devices!.openedChests.push(chest.id)
  assert.deepEqual(gridMapTargets(level, state), [exit])
})
