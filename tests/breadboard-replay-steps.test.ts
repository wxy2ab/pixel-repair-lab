import assert from 'node:assert/strict'
import test from 'node:test'
import type { RepairReplayAction, RepairReplayFrame } from '../src/web/breadboardRepairReplay'
import { replayStepFilters, replayStepIndices, replayStepPosition } from '../src/web/breadboardReplaySteps'

const build = { parts: [], wires: [] }
const note = { kind: 'continuity', connected: false, red: 'D1', black: 'D2', pressed: false } as const
const contacts: RepairReplayFrame['bench'] = { red: note.red, black: note.black, reading: { kind: 'continuity', connected: false } }

function frame(id: string, action: RepairReplayAction, bench: RepairReplayFrame['bench'] = {}): RepairReplayFrame {
  return { id, action, bench, build, changes: [], snapshot: false }
}

test('categories keep repeated actions and archived snapshots at their original positions', () => {
  const frames = [
    frame('start', { kind: 'start' }),
    { ...frame('old-note', { kind: 'measure', note }, contacts), snapshot: true },
    frame('guess', { kind: 'diagnosis', diagnosis: 'reversed-led' }, contacts),
    frame('resume', { kind: 'resume', build }, contacts),
    frame('change', { kind: 'edit', build }, contacts),
    frame('retest-1', { kind: 'retest', note }, contacts),
    frame('retest-2', { kind: 'retest' }),
    frame('lamp', { kind: 'test', observation: { ledOn: false, d2: 1, d13: 0 } }, contacts),
    frame('retry', { kind: 'check', passed: false }),
    frame('pass', { kind: 'check', passed: true }),
  ]
  assert.deepEqual(replayStepFilters.map(filter => replayStepIndices(frames, filter)), [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1], [2], [4], [5, 6], [7, 8, 9],
  ])
})

test('switch and power actions with a two-contact reading are measurements', () => {
  const frames = [
    frame('switch', { kind: 'button' }, contacts),
    frame('volts', { kind: 'power' }, { ...contacts, reading: { kind: 'voltage', volts: 0 } }),
    frame('floating', { kind: 'button' }, { ...contacts, reading: { kind: 'floating' } }),
    frame('unpowered', { kind: 'power' }, { ...contacts, reading: { kind: 'unpowered' } }),
    frame('one-tip', { kind: 'button' }, { ...contacts, black: undefined }),
    frame('same-hole', { kind: 'power' }, { ...contacts, black: contacts.red }),
  ]
  assert.deepEqual(replayStepIndices(frames, 'measure'), [0, 1, 2])
  assert.deepEqual(replayStepIndices(frames, 'test'), [])
})

test('switching filters keeps a matching frame, seeks forward, or wraps to the first match', () => {
  const visible = [1, 6, 9]
  assert.equal(replayStepPosition(visible, 6), 1)
  assert.equal(replayStepPosition(visible, 2), 1)
  assert.equal(replayStepPosition(visible, 11), 0)
  assert.equal(replayStepPosition([], 3), -1)
})
