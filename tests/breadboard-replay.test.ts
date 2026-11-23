import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test, type TestContext } from 'node:test'
import { breadboardFaultBuild, type BreadboardLevel } from '../src/shared/breadboard'
import { readRepairHistory, saveRepairReport, type RepairReport } from '../src/web/breadboardRepairHistory'
import { discardRepairReplay, newReplayEvent, readRepairReplay, repairReplayFrames, saveRepairReplay,
  type RepairReplayAction, type RepairReplayBench, type RepairReplayEvent } from '../src/web/breadboardRepairReplay'
import type { MeterNote } from '../src/web/breadboardRepairTicket'

const level: BreadboardLevel = JSON.parse(readFileSync(new URL('../levels/6060-dc-breadboard-meter-repair.json', import.meta.url), 'utf8'))
const original = breadboardFaultBuild(level, { kind: 'reversed-led' })
const repaired = { parts: level.board.solutionParts ?? level.board.initialParts!, wires: level.board.solutionWires }
const before: MeterNote = { kind: 'voltage', volts: -5, pressed: true, red: 'E6', black: 'E5', output: 1 }
const after: MeterNote = { ...before, volts: -2 }
const released = { d2: 1, d13: 0, ledOn: false }
const pressed = { d2: 0, d13: 1, ledOn: true }
const report: RepairReport = { id: 'replay-case', completedAt: 1234, firstDiagnosis: 'wrong-jumper', diagnosis: 'reversed-led',
  original, repaired, readings: [{ before, after }], validation: { closed: pressed, open: released } }
const off: RepairReplayBench = { pressed: false, powered: false, ledOn: false }

function stream() {
  const events: RepairReplayEvent[] = []
  return { events, add(action: RepairReplayAction, bench = off) {
    const event = newReplayEvent(action, bench, events.at(-1))
    events.push(event)
    return event
  } }
}

function storage(context: TestContext) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  const reads: string[] = []
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => { reads.push(key); return values.get(key) ?? null },
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } })
  context.after(() => {
    if (old) Object.defineProperty(globalThis, 'localStorage', old)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  return { values, reads }
}

test('real frames preserve interim edits, revised diagnoses, actual write order and immutable probe samples', () => {
  const trace = stream()
  const meter: RepairReplayBench = { ...off, powered: true, pressed: true, d13: 1, red: 'E6', black: 'E5', mode: 'voltage',
    reading: { kind: 'voltage', volts: -5 } }
  trace.add({ kind: 'measure', note: before }, meter)
  trace.add({ kind: 'diagnosis', diagnosis: 'wrong-jumper' }, meter)
  const lifted = { ...original, wires: original.wires.slice(0, -1) }
  trace.add({ kind: 'edit', build: lifted })
  trace.add({ kind: 'edit', build: original })
  trace.add({ kind: 'edit', build: repaired })
  trace.add({ kind: 'test', observation: released }, { ...off, powered: true, ...released })
  trace.add({ kind: 'test', observation: pressed }, { ...off, pressed: true, powered: true, ...pressed })
  trace.add({ kind: 'check', passed: false })
  trace.add({ kind: 'diagnosis', diagnosis: 'reversed-led' })
  trace.add({ kind: 'check', passed: true })
  const live = { ...meter, ledOn: true, reading: { kind: 'voltage' as const, volts: -2 } }
  trace.add({ kind: 'retest', note: after }, live)
  live.red = 'GND'
  const frames = repairReplayFrames({ ...report, events: trace.events })
  assert.deepEqual(frames.map(step => step.action.kind), trace.events.map(event => event.action.kind))
  assert.ok(frames.every(frame => !frame.snapshot))
  assert.deepEqual(frames.slice(2, 5).map(frame => frame.changes[0].kind), ['wire-removed', 'wire-added', 'led-flipped'])
  assert.deepEqual(frames[0].build, original)
  assert.deepEqual(frames[2].build, lifted)
  assert.deepEqual(frames.at(-1)?.build, repaired)
  assert.equal(frames.at(-1)?.bench.red, 'E6')
  assert.deepEqual(frames.at(-1)?.bench.reading, { kind: 'voltage', volts: -2 })
})

test('legacy frames distinguish saved observations from chronological events, including later retests', () => {
  const frames = repairReplayFrames(report)
  assert.ok(frames.every(frame => frame.snapshot))
  assert.equal(frames.find(frame => frame.action.kind === 'diagnosis')?.bench.pressed, undefined)
  assert.equal(frames.find(frame => frame.action.kind === 'measure')?.bench.ledOn, undefined)
  assert.deepEqual(frames[0].bench.reading, { kind: 'voltage', volts: -5 })
  assert.equal(frames.find(frame => frame.action.kind === 'edit')?.changes[0].kind, 'led-flipped')
  assert.deepEqual(frames.find(frame => frame.action.kind === 'retest')?.action, { kind: 'retest', note: after, source: before })
  const trace = stream()
  trace.add({ kind: 'resume', build: repaired, archived: true })
  trace.add({ kind: 'retest', note: after }, { ...off, powered: true, pressed: true, red: 'E6', black: 'E5' })
  const extended = repairReplayFrames({ ...report, events: trace.events })
  assert.equal(extended.filter(frame => frame.action.kind === 'retest').length, 1)
  assert.ok(extended.slice(0, -2).every(frame => frame.snapshot))
  assert.equal(extended.at(-1)?.snapshot, false)
  const partial = repairReplayFrames({ ...report, events: [newReplayEvent({ kind: 'resume', build: repaired }, off)] })
  assert.equal(partial.length, 1)
  assert.deepEqual(partial[0].build, repaired)
  const resumed = repairReplayFrames({ ...report, events: [newReplayEvent({ kind: 'resume', build: repaired,
    prior: { notes: [before], diagnosis: 'wrong-jumper' } }, off)] })
  assert.deepEqual(resumed.map(frame => frame.snapshot), [true, true, false])
  assert.deepEqual(resumed.map(frame => frame.action.kind), ['measure', 'diagnosis', 'resume'])
})

test('button and power actions keep the meter results seen without moving or filing the probes', ctx => {
  storage(ctx)
  const trace = stream()
  const bench: RepairReplayBench = { ...off, mode: 'continuity', red: 'uno-D2', black: 'GND' }
  trace.add({ kind: 'button' }, { ...bench, pressed: true, reading: { kind: 'continuity', connected: true } })
  trace.add({ kind: 'button' }, { ...bench, reading: { kind: 'continuity', connected: false } })
  trace.add({ kind: 'power' }, { ...bench, powered: true, reading: { kind: 'power-off-first' } })
  saveRepairReplay(level, report.id, trace.events)
  const frames = repairReplayFrames({ ...report, events: readRepairReplay(level, report.id) })
  assert.deepEqual(frames.map(frame => frame.bench.reading), [
    { kind: 'continuity', connected: true }, { kind: 'continuity', connected: false }, { kind: 'power-off-first' },
  ])
  assert.ok(frames.every(frame => frame.bench.red === 'uno-D2' && frame.bench.black === 'GND'))
})

test('large traces survive reload lazily, append distinct repeated measurements and never rewrite a successful path', ctx => {
  const { reads, values } = storage(ctx)
  const trace = stream()
  trace.add({ kind: 'start' })
  for (let i = 0; i < 100; i++) trace.add({ kind: 'measure', note: before })
  trace.add({ kind: 'edit', build: repaired })
  trace.add({ kind: 'check', passed: true })
  saveRepairReplay(level, report.id, trace.events)
  assert.ok(JSON.stringify(trace.events).length > 8192)
  assert.deepEqual(readRepairReplay(level, report.id), trace.events)
  saveRepairReport(level, { ...report, events: trace.events })
  discardRepairReplay(level, report.id, false, trace.events)
  assert.deepEqual(readRepairReplay(level, report.id), [])
  reads.length = 0
  const saved = readRepairHistory(level)[0]
  assert.ok(!reads.some(key => key.includes('repair-replay:archive:')))
  assert.deepEqual(saved.events, trace.events)
  const atRead = reads.length
  assert.deepEqual(saved.events, trace.events)
  assert.equal(reads.length, atRead)
  const prefix = [...trace.events]
  trace.add({ kind: 'retest', note: after, source: before })
  saveRepairReport(level, { ...saved, events: trace.events })
  trace.add({ kind: 'retest', note: after })
  saveRepairReport(level, { ...saved, events: trace.events })
  saveRepairReport(level, { ...saved, events: prefix })
  saveRepairReport(level, { ...saved, events: [newReplayEvent({ kind: 'check', passed: false }, off)] })
  assert.deepEqual(readRepairHistory(level)[0].events, trace.events)
  const junk = newReplayEvent({ kind: 'start' }, off)
  const prefixKey = [...values.keys()].find(key => key.includes('repair-replay:archive:'))!
  values.set(prefixKey.slice(0, prefixKey.lastIndexOf(':') + 1) + junk.id, JSON.stringify({ ...junk, bench: { pressed: 'bad' } }))
  assert.deepEqual(readRepairHistory(level)[0].events, trace.events)
  assert.deepEqual(readRepairHistory({ id: 'another-level' }), [])
})

test('preview and abandoned incomplete tickets keep personal archive isolated', ctx => {
  const { values } = storage(ctx)
  const trace = stream()
  const first = trace.add({ kind: 'start' })
  trace.add({ kind: 'retest' }, { ...off, powered: true, reading: { kind: 'protected' } })
  saveRepairReplay(level, report.id, trace.events, true)
  saveRepairReport(level, { ...report, events: trace.events }, true)
  assert.equal(values.size, 0)
  saveRepairReplay(level, report.id, trace.events)
  assert.deepEqual(readRepairReplay(level, report.id, true), [])
  discardRepairReplay(level, report.id, true)
  assert.equal(readRepairReplay(level, report.id).length, 2)
  discardRepairReplay(level, report.id, false, [first])
  assert.equal(readRepairReplay(level, report.id)[0].action.kind, 'retest')
  discardRepairReplay(level, report.id)
  assert.deepEqual(readRepairReplay(level, report.id), [])
})
