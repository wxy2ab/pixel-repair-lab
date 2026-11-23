import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GridLevel } from '../shared/types'
import { parseLevel } from '../shared/validate'
import { runProgram } from './run'
import { gridObservationFrames, initialSnapshot } from './snapshot'

function map(fields: Partial<GridLevel>): GridLevel {
  const label = { zh: '机关', en: 'Devices' }
  return { kind: 'grid', version: 1, id: 'devices', order: 1, title: label, concept: label, brief: label, hints: [],
    tiles: ['....', '....', '....'], start: { x: 0, y: 0 }, allowedApi: ['move', 'wait', 'pick', 'scan', 'read_map'],
    objectives: [{ type: 'exit', x: 0, y: 0 }], cards: [{ id: 'wait', label, template: 'wait()' }], solutionCards: [{ cardId: 'wait' }], ...fields }
}

test('keys and switches persist, unlock matching doors and chests, and collect goals count actual chest pickups', () => {
  const level = map({ devices: [
    { kind: 'key', id: 'blue', x: 0, y: 1 }, { kind: 'door', id: 'gate', keyId: 'blue', x: 1, y: 0 },
    { kind: 'switch', id: 'lever', x: 1, y: 1 }, { kind: 'door', id: 'hatch', switchId: 'lever', x: 2, y: 1 },
    { kind: 'chest', id: 'cache', keyId: 'blue', x: 2, y: 0 },
  ], objectives: [{ type: 'collect', itemIds: ['cache'] }] })
  assert.equal(runProgram(level, 'move("right")').issue?.code, 'lockedDoor')
  const program = 'move("down")\nmove("right")\nmove("right")\nmove("up")\npick()'
  const result = runProgram(level, program)
  assert.ok(result.won)
  assert.equal(result.final.turn, 5)
  assert.deepEqual(result.frames.map(frame => frame.pickupKind), ['key', undefined, undefined, undefined, 'chest'])
  const visitAgain = runProgram(level, 'move("down")\nmove("up")\nmove("down")')
  assert.deepEqual(visitAgain.frames.map(frame => frame.pickupKind), ['key', undefined, undefined])
  assert.deepEqual(result.final.devices, { keys: ['blue'], switches: ['lever'], openedChests: ['cache'], hazards: [] })
  assert.deepEqual(result.frames[0].state.devices?.openedChests, [])
  assert.equal(runProgram(level, program + '\npick()').issue?.code, 'noItem')
  assert.equal(runProgram({ ...level, start: { x: 2, y: 0 } }, 'pick()').issue?.code, 'lockedChest')
})

test('a planner can read its current position and the newly unlocked passage without spending a turn', () => {
  const level = map({
    tiles: ['....', '....'], turnLimit: 3, objectives: [{ type: 'exit', x: 3, y: 0 }],
    devices: [
      { id: 'key', kind: 'key', x: 1, y: 0 }, { id: 'door', kind: 'door', keyId: 'key', x: 2, y: 0 },
      { id: 'mirror', kind: 'mirror', orientation: '/', x: 1, y: 1 },
    ],
  })
  const result = runProgram(level, 'before = read_map()\nmove("right")\nafter = read_map()\nmove("right")\nmove("right")')
  assert.equal(result.won, true)
  assert.equal(result.final.turn, 3)
  assert.deepEqual(result.frames.filter(frame => frame.action === 'read_map').map(frame => frame.value), [
    { tiles: ['..#.', '.#..'], start: [0, 0], goal: [3, 0] },
    { tiles: ['....', '.#..'], start: [1, 0], goal: [3, 0] },
  ])
})

test('laser reflection affects the next corridor, ends at closed doors and switches off on the triggering move', () => {
  const level = map({ devices: [
    { id: 'beam', kind: 'laser', x: 0, y: 1, direction: 'right', switchId: 'red' },
    { id: 'glass', kind: 'mirror', x: 2, y: 1, orientation: '\\' }, { id: 'red', kind: 'switch', x: 1, y: 0 },
  ] })
  const cells = (state: ReturnType<typeof initialSnapshot>) => state.devices!.hazards.map(({ x, y, direction }) => [x, y, direction])
  assert.deepEqual(cells(initialSnapshot(level)), [[1, 1, 'right'], [2, 1, 'right'], [2, 2, 'down']])
  const door = { id: 'gate', kind: 'door', x: 1, y: 1, switchId: 'red' } as const
  assert.deepEqual(cells(initialSnapshot({ ...level, devices: [...level.devices!, door] })), [])
  assert.equal(runProgram({ ...level, start: { x: 1, y: 2 } }, 'move("right")').issue?.code, 'laserHit')
  assert.equal(runProgram(level, 'move("down")').issue?.code, 'fixtureBlocked')
  const switched = runProgram(level, 'move("right")\nmove("down")')
  assert.equal(switched.issue?.code, 'unfinished')
  assert.deepEqual(switched.final.devices?.switches, ['red'])
  assert.deepEqual(cells(switched.final), [])
  const alternate = map({ devices: [{ id: 'beam', kind: 'laser', x: 0, y: 1, direction: 'right' },
    { id: 'glass', kind: 'mirror', x: 2, y: 1, orientation: '/' }] })
  assert.deepEqual(cells(initialSnapshot(alternate)).at(-1), [2, 0, 'up'])
})

test('observing and waiting follow the same cannon cadence, one-turn bomb footprint and turn budget', () => {
  const level = map({ devices: [
    { kind: 'cannon', id: 'pulse', x: 0, y: 1, direction: 'right', period: 3, phase: 1 },
    { kind: 'bomb', id: 'pulse-cell', x: 2, y: 2, atTurn: 2 },
  ], tiles: ['....', '....', '...#'], turnLimit: 3 })
  const frames = gridObservationFrames(level)
  const result = runProgram(level, 'wait()\nwait()\nwait()')
  assert.ok(result.won)
  assert.deepEqual(result.frames.map(frame => frame.state), frames)
  assert.deepEqual(frames.map(frame => frame.devices!.hazards.map(hazard => [hazard.kind, hazard.x, hazard.y])), [
    [['cannon', 1, 1], ['cannon', 2, 1], ['cannon', 3, 1]], [['bomb', 2, 2], ['bomb', 2, 1], ['bomb', 1, 2]], [],
  ])
  assert.equal(runProgram(level, 'for i in range(4):\n    wait()').issue?.code, 'turnLimit')
  assert.equal(runProgram({ ...level, start: { x: 2, y: 1 } }, 'wait()').issue?.code, 'cannonHit')
  const inBlast = { ...level, start: { x: 1, y: 2 } }
  assert.equal(runProgram(inBlast, 'wait()\nwait()').issue?.code, 'bombHit')
  assert.equal(gridObservationFrames(inBlast).length, 2)
})

test('configuration validation checks device-specific fields, identity, control links and full variant layouts', () => {
  const level = map({ devices: [{ kind: 'key', id: 'blue', x: 1, y: 1 }, { kind: 'chest', id: 'cache', x: 2, y: 0, keyId: 'blue' }],
    objectives: [{ type: 'collect', itemIds: ['cache'] }] })
  const issues = (sample: unknown) => parseLevel(JSON.stringify(sample)).issues
  assert.deepEqual(issues(level), [])
  assert.ok(issues({ ...level, variants: [{ devices: [{ ...level.devices![1], x: 4 }] }] }).some(i => i.code === 'device-link'))
  assert.ok(issues({ ...level, devices: [...level.devices!, { kind: 'switch', id: 'blue', x: 1, y: 1 }] }).some(i => i.code === 'duplicate-id'))
  assert.ok(issues({ ...level, devices: [{ id: 'pulse', kind: 'cannon', x: 1, y: 1, period: 2, phase: 2, direction: 'left' }] }).some(i => i.code === 'device-phase'))
  assert.ok(issues({ ...level, devices: [{ ...level.devices![0], orientation: '/' }] }).some(i => i.code === 'schema-unevaluatedProperties'))
})
