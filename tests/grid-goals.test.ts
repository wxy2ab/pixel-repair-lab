import assert from 'node:assert/strict'
import test from 'node:test'
import type { GridSnapshot, RunFrame, Scenario } from '../src/shared/types'
import { initialSnapshot } from '../src/engine/snapshot'
import { gridGoals } from '../src/web/gridGoalList'

const scenario: Scenario = {
  tiles: ['.....'], start: { x: 0, y: 0 },
  items: [{ id: 'cell-a', x: 1, y: 0 }, { id: 'cell-b', x: 2, y: 0 }],
  devices: [{ id: 'crate', kind: 'chest', x: 3, y: 0 }],
  memory: [0, 0],
  objectives: [
    { type: 'collect', itemIds: ['cell-a', 'cell-b', 'crate'] },
    { type: 'submit', values: [3, 4] },
    { type: 'submit', values: ['done'] },
    { type: 'moves', origin: 'queue-pop' },
    { type: 'memory', address: 1, value: 21 },
    { type: 'halt' },
    { type: 'exit', x: 4, y: 0 },
  ],
}

function frame(action: RunFrame['action'], state: GridSnapshot, issue?: RunFrame['issue']): RunFrame {
  return { line: 1, action, state, issue }
}

test('goals start open and report how many pickups and submissions are still due', () => {
  const start = initialSnapshot(scenario)
  const goals = gridGoals(scenario, start, [], 'zh')
  assert.equal(goals.length, scenario.objectives.length)
  assert.deepEqual(goals.map(goal => goal.done), [false, false, false, false, false, false, false])
  assert.deepEqual(goals.map(goal => goal.progress), ['0 / 3', '0 / 2', '0 / 1', undefined, undefined, undefined, undefined])
  assert.equal(new Set(goals.map(goal => goal.key)).size, goals.length)
  assert.match(goals[3].label, /队头/)
})

test('goals follow the shown moment of a run, counting chests, ordered submissions and failed actions correctly', () => {
  const state = initialSnapshot(scenario)
  state.items = state.items.filter(item => item.id !== 'cell-a')
  state.devices!.openedChests.push('crate')
  state.memory[1] = 21
  const frames = [frame('move', state), frame('submit', state), frame('submit', state), frame('submit', state, { code: 'wrongAnswer' })]
  const midway = gridGoals(scenario, state, frames, 'en')
  assert.deepEqual(midway.map(goal => goal.done), [false, true, false, true, true, false, false])
  assert.deepEqual(midway.slice(0, 3).map(goal => goal.progress), ['2 / 3', '2 / 2', '0 / 1'])

  state.items = []
  state.halted = true
  state.player = { x: 4, y: 0 }
  const finished = gridGoals(scenario, state, [...frames, frame('submit', state)], 'en')
  assert.ok(finished.every(goal => goal.done))
})

test('a blocked move does not satisfy the required-move goal', () => {
  const state = initialSnapshot(scenario)
  const goals = gridGoals(scenario, state, [frame('move', state, { code: 'blocked' })], 'zh')
  assert.equal(goals[3].done, false)
})

test('a beam hit at the exit keeps the exit unchecked while retaining earlier objectives', () => {
  const safe = initialSnapshot(scenario)
  safe.memory[1] = 21
  const hit = { ...safe, player: { x: 4, y: 0 } }
  const goals = gridGoals(scenario, hit, [frame('store', safe), frame('move', hit, { code: 'laserHit' })], 'en')
  assert.equal(goals.find(goal => goal.key.startsWith('exit'))?.done, false)
  assert.equal(goals.find(goal => goal.key.startsWith('memory'))?.done, true)
})
