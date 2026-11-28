import assert from 'node:assert/strict'
import test from 'node:test'
import type { GridLevel } from '../shared/types'
import { validateLevel } from '../shared/validate'
import { warehouseTapRoute } from '../shared/warehouse'
import { runProgram } from './run'
import { initialSnapshot, moveGridPlayer } from './snapshot'

const label = { zh: '仓库', en: 'Warehouse' }
const at = (x: number, y = 1) => ({ x, y })
const level: GridLevel = {
  version: 1, id: 'warehouse', order: 1, kind: 'grid', title: label, brief: label, concept: label, hints: [],
  tiles: ['######', '#....#', '#....#', '######'], start: at(1),
  warehouse: { boxes: [at(2), at(3, 2)], targets: [at(3, 2), at(3)] },
  objectives: [{ type: 'parkBoxes' }], allowedApi: ['move', 'scan', 'read_map'],
  cards: [{ id: 'right', label, template: 'move("right")' }], solutionCards: [{ cardId: 'right' }],
}

test('tapping a neighbor walks or pushes one square and uses the current box positions', () => {
  const state = initialSnapshot(level)
  const tap = (cell: typeof state.player) => warehouseTapRoute(level.tiles, state, cell)
  assert.deepEqual(tap(at(1, 2)), ['down'])
  assert.deepEqual(tap(at(2)), ['right'])
  assert.equal(moveGridPlayer(level, state, 'right'), undefined)
  assert.deepEqual(tap(at(1)), ['left'])
  assert.deepEqual(tap(at(3)), ['right'])
  assert.deepEqual(tap(at(3, 2)), [])
  assert.deepEqual(tap(at(2)), [])
  assert.deepEqual(tap(at(2, 0)), [])
  assert.deepEqual(tap(at(-1)), [])
  assert.equal(moveGridPlayer(level, state, 'left'), undefined)
  assert.deepEqual(tap(at(3)), [])
  assert.deepEqual(tap(at(2)), ['right'])
})

test('tapping distant floor finds a shortest walk around walls and crates, or spends no turns', () => {
  const board = { ...level, tiles: ['#######', '#.....#', '#.#.#.#', '#.....#', '#######'],
    warehouse: { boxes: [at(3)], targets: [at(5)] } }
  const state = initialSnapshot(board)
  const route = warehouseTapRoute(board.tiles, state, at(5))
  assert.equal(route.length, 8)
  for (const direction of route) assert.equal(moveGridPlayer(board, state, direction), undefined)
  assert.deepEqual(state.player, at(5))
  assert.deepEqual(state.boxes, [at(3)])
  assert.equal(state.turn, 8)

  const corridor = { ...board, tiles: ['#######', '#.....#', '#######'] }
  const blocked = initialSnapshot(corridor)
  assert.deepEqual(warehouseTapRoute(corridor.tiles, blocked, at(5)), [])
  assert.deepEqual(warehouseTapRoute(corridor.tiles, blocked, at(3)), [])
  assert.equal(blocked.turn, 0)
})

test('either box may occupy either target, and clearing a target reopens its objective', () => {
  const start = initialSnapshot(level)
  const run = runProgram(level, 'scan()\nmove("right")\nread_map()')
  assert.ok(run.won)
  assert.deepEqual(run.frames[0].value, { up: 'wall', down: 'floor', left: 'wall', right: 'box' })
  assert.deepEqual(run.final.boxes, [at(3), at(3, 2)])
  assert.deepEqual(run.frames[2].value, { tiles: level.tiles, start: [2, 1], goal: null, boxes: [[3, 1], [3, 2]], targets: [[3, 2], [3, 1]] })
  assert.equal(run.final.turn, 1)
  assert.deepEqual(run.frames[0].state.boxes, level.warehouse!.boxes)
  assert.deepEqual(start.boxes, level.warehouse!.boxes)
  const cleared = runProgram(level, 'move("right")\nmove("right")\nmove("left")\nscan()')
  assert.equal(cleared.won, false)
  assert.deepEqual(cleared.final.boxes, [at(4), at(3, 2)])
  assert.deepEqual(cleared.failure?.gaps, [{ type: 'parkBoxes', remaining: 1 }])
  assert.equal((cleared.frames.at(-1)!.value as Record<string, string>).right, 'target')
})

test('walls, the map boundary and a second box reject the entire push without spending a turn', () => {
  for (const board of [
    { ...level, start: at(3), warehouse: { boxes: [at(4)], targets: [at(1)] } },
    { ...level, tiles: ['...'], start: at(1, 0), warehouse: { boxes: [at(2, 0)], targets: [at(0, 0)] } },
    { ...level, warehouse: { boxes: [at(2), at(3)], targets: [at(4), at(4, 2)] } },
    { ...level, devices: [{ id: 'glass', kind: 'mirror' as const, x: 3, y: 1, orientation: '/' as const }] },
  ]) {
    const state = initialSnapshot(board)
    const blocked = runProgram(board, 'move("right")')
    assert.equal(blocked.issue?.code, 'boxBlocked')
    assert.deepEqual(blocked.final, state)
    assert.equal(moveGridPlayer(board, state, 'right')?.code, 'boxBlocked')
    assert.deepEqual(state, initialSnapshot(board))
  }
})

test('a variant starts from its own box layout and reports its own remaining targets', () => {
  const board: GridLevel = { ...level, variants: [{ warehouse: { boxes: [at(3)], targets: [at(4)] } }] }
  const run = runProgram(board, 'move("right")')
  assert.equal(run.passedCases, 1)
  assert.equal(run.totalCases, 2)
  assert.deepEqual(run.mapRuns?.map(map => map.final.boxes), [[at(3), at(3, 2)], [at(3)]])
  assert.deepEqual(run.failure?.gaps, [{ type: 'parkBoxes', remaining: 1 }])
})

test('warehouse validation accepts occupied targets and rejects malformed base or variant boards', () => {
  assert.deepEqual(validateLevel(level).issues, [])
  const invalid = (sample: unknown, path: string) => assert.ok(validateLevel(sample).issues.some(issue => issue.path.startsWith(path)))
  invalid({ ...level, warehouse: undefined }, '/objectives')
  invalid({ ...level, warehouse: { ...level.warehouse, targets: [at(4)] } }, '/warehouse/targets')
  invalid({ ...level, warehouse: { ...level.warehouse, boxes: [at(2), at(2)] } }, '/warehouse/boxes')
  invalid({ ...level, warehouse: { ...level.warehouse, targets: [at(0), at(4)] } }, '/warehouse/targets/0')
  invalid({ ...level, variants: [{ start: at(2) }] }, '/variants/0/warehouse/boxes/0')
})
