import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { breadboardFaultBuild, type BreadboardBuild, type BreadboardLevel } from '../src/shared/breadboard'
import type { RepairReport } from '../src/web/breadboardRepairHistory'
import { repairReplayFrames, type RepairReplayAction, type RepairReplayFrame } from '../src/web/breadboardRepairReplay'
import type { MeterNote } from '../src/web/breadboardRepairTicket'
import { findReplayRetest } from '../src/web/breadboardReplayComparison'

const level: BreadboardLevel = JSON.parse(readFileSync(new URL('../levels/6060-dc-breadboard-meter-repair.json', import.meta.url), 'utf8'))
const repaired = { parts: level.board.initialParts!, wires: level.board.solutionWires }
const original = breadboardFaultBuild(level, { kind: 'reversed-led' })
const voltage: MeterNote = { kind: 'voltage', red: 'E6', black: 'E5', pressed: true, volts: -5, output: 1, pullup: true, drivenBy: true }
const lampVoltage: MeterNote = { ...voltage, volts: -2 }
const report: RepairReport = {
  id: 'comparison', completedAt: 100, firstDiagnosis: 'reversed-led', diagnosis: 'reversed-led', original, repaired,
  readings: [{ before: voltage, after: lampVoltage }],
  validation: { open: { d2: 1, d13: 0, ledOn: false }, closed: { d2: 0, d13: 1, ledOn: true } },
}

function frame(action: RepairReplayAction, build: BreadboardBuild, bench: RepairReplayFrame['bench'] = {}): RepairReplayFrame {
  return { action, build, bench, changes: [], snapshot: false, id: 'frame' }
}

test('finds the first explicit retest on the accepted board after the measurement, preserving the two actual frames', () => {
  const retest = (note: MeterNote, board = repaired) => frame({ kind: 'retest', note }, board)
  const swapped = { ...lampVoltage, red: lampVoltage.black, black: lampVoltage.red }
  const continuity: MeterNote = { ...voltage, kind: 'continuity', connected: false }
  const frames = [retest(lampVoltage), frame({ kind: 'measure', note: voltage }, original),
    retest(lampVoltage, original), retest(swapped), retest({ ...lampVoltage, pressed: false }), retest(continuity),
    frame({ kind: 'retest' }, repaired), frame({ kind: 'measure', note: lampVoltage }, repaired),
    retest(lampVoltage), retest(lampVoltage)]
  const pair = findReplayRetest(frames, 1, report)!
  assert.deepEqual(pair.before, { index: 1, frame: frames[1], note: voltage })
  assert.deepEqual(pair.after, { index: 8, frame: frames[8], note: lampVoltage })
  assert.deepEqual(pair.changes, [{ kind: 'led-flipped', part: 'led', from: ['A6', 'A5'], to: ['A5', 'A6'] }])
  for (const index of [0, 7, 12, -1]) assert.equal(findReplayRetest(frames, index, report), undefined)
})

test('old snapshots compare a continuity change on the repaired jumper and omit a missing retest', () => {
  const before: MeterNote = { red: 'D5', black: 'D6', pressed: true, kind: 'continuity', connected: true }
  const after = { ...before, connected: false }
  const old: RepairReport = { ...report, original: breadboardFaultBuild(level, level.board.faults![0]),
    firstDiagnosis: 'wrong-jumper', diagnosis: 'wrong-jumper', readings: [{ before, after }, { before: { ...before, red: 'E5' } }] }
  const frames = repairReplayFrames(old)
  const pair = findReplayRetest(frames, 0, old)!
  assert.ok(pair.before.frame.snapshot && pair.after.frame.snapshot)
  assert.deepEqual(pair.after.note, after)
  assert.deepEqual(pair.changes, [{ kind: 'wire-moved', fixed: 'B6', from: 'C5', to: 'C2' }])
  assert.equal(findReplayRetest(frames, 1, old), undefined)
})

test('a measurement during wiring compares its own board with the fixed board', () => {
  const withLooseLead = { ...original, wires: original.wires.slice(0, -1) }
  const unplugged: MeterNote = { ...voltage, kind: 'floating' }
  const frames = [frame({ kind: 'measure', note: unplugged }, withLooseLead),
    frame({ kind: 'retest', note: lampVoltage, source: voltage }, repaired)]
  const pair = findReplayRetest(frames, 0, report)!
  assert.equal(pair.before.frame.build, withLooseLead)
  assert.deepEqual(pair.changes.map(change => change.kind), ['led-flipped', 'wire-added'])
})

test('source provenance distinguishes voltage retests at the same holes and button without assuming D13 stays the same', () => {
  const from: MeterNote = { ...voltage, volts: 0, output: 0 }
  const earlierWrite: MeterNote = { ...from, drivenBy: false }
  const correct: MeterNote = { ...from, volts: 5, output: 1 }
  const frames = [frame({ kind: 'measure', note: from }, original),
    frame({ kind: 'retest', note: earlierWrite, source: earlierWrite }, repaired),
    frame({ kind: 'retest', note: { ...correct, volts: 0 }, source: { ...from, volts: -5 } }, repaired),
    frame({ kind: 'retest', note: correct, source: from }, repaired),
    frame({ kind: 'retest', note: correct, source: from }, repaired)]
  assert.equal(findReplayRetest(frames, 0, { ...report, readings: [] })?.after.index, 3)
})

test('archived before/after pairs identify older retests, while ambiguous unlinked readings do not acquire a made-up partner', () => {
  const from: MeterNote = { ...voltage, pullup: undefined, drivenBy: undefined }
  const other: MeterNote = { ...from, volts: 0 }
  const good: MeterNote = { ...from, volts: -2 }
  const wrong = { ...other, volts: 0 }
  const frames = [frame({ kind: 'measure', note: from }, original), frame({ kind: 'retest', note: wrong }, repaired),
    frame({ kind: 'retest', note: good }, repaired)]
  const stored = { ...report, readings: [{ before: from, after: good }, { before: other, after: wrong }] }
  assert.equal(findReplayRetest(frames, 0, stored)?.after.index, 2)
  assert.equal(findReplayRetest(frames, 0, { ...report, readings: [] }), undefined)
  assert.equal(findReplayRetest(frames.slice(0, 2), 0, stored), undefined)
  assert.equal(findReplayRetest(frames.slice(0, 2), 0, { ...report, readings: [{ before: from, after: good }] }), undefined)
})

test('a power or button step with probes in place can match a recorded retest even when voltage was floating', () => {
  const before: MeterNote = { kind: 'floating', red: 'uno-D2', black: 'GND', pressed: false, pullup: false }
  const after: MeterNote = { ...before, kind: 'voltage', volts: 0 }
  const bench = { mode: 'voltage', red: before.red, black: before.black, pressed: false, d13: null, reading: { kind: 'floating' } } as const
  for (const kind of ['power', 'button'] as const) {
    const frames: RepairReplayFrame[] = [frame({ kind }, original, bench), frame({ kind: 'retest', note: after, source: before }, repaired)]
    const pair = findReplayRetest(frames, 0, { ...report, readings: [] })
    assert.equal(pair?.before.note.kind, 'floating')
    assert.equal(pair?.after.note.kind, 'voltage')
    assert.equal(findReplayRetest([frame({ kind }, original, { ...bench, reading: { kind: 'unpowered' } }), frames[1]], 0, report), undefined)
  }
})
