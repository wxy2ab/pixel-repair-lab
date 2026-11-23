import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test, type TestContext } from 'node:test'
import { breadboardFaultBuild, type BreadboardBuild, type BreadboardLevel } from '../src/shared/breadboard'
import { compareRepairBoards, readRepairHistory, saveRepairReport, type RepairReport } from '../src/web/breadboardRepairHistory'
import type { MeterNote } from '../src/web/breadboardRepairTicket'

const level: BreadboardLevel = JSON.parse(readFileSync(new URL('../levels/6060-dc-breadboard-meter-repair.json', import.meta.url), 'utf8'))
const original = breadboardFaultBuild(level, level.board.faults!.find(fault => fault.kind === 'wrong-jumper')!)
const repaired = { parts: level.board.solutionParts ?? level.board.initialParts!, wires: level.board.solutionWires }
const beforeContinuity: MeterNote = { red: 'D6', black: 'D5', kind: 'continuity', connected: true, pressed: false }
const beforeVoltage: MeterNote = { red: 'D5', black: 'D6', kind: 'voltage', volts: 0, pressed: true, output: 1 }
const afterContinuity: MeterNote = { ...beforeContinuity, connected: false }
const afterVoltage: MeterNote = { ...beforeVoltage, volts: 2 }

function report(id = 'first-ticket', completedAt = 1000): RepairReport {
  return { id, completedAt, diagnosis: 'wrong-jumper', firstDiagnosis: 'reversed-led', original, repaired,
    readings: [{ before: beforeContinuity }, { before: beforeVoltage }],
    validation: { open: { ledOn: false, d13: 0, d2: 1 }, closed: { ledOn: true, d13: 1, d2: 0 } } }
}

function storage(context: TestContext) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  } })
  context.after(() => {
    if (originalDescriptor) Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  return values
}

test('reports name the changed end of a jumper and the A/K flip even when the player chooses a different free hole', () => {
  const custom = structuredClone(repaired)
  custom.wires.at(-1)![1] = 'E2'
  assert.deepEqual(compareRepairBoards(original, custom), [{ kind: 'wire-moved', fixed: 'B6', from: 'C5', to: 'E2' }])
  const reversed = breadboardFaultBuild(level, { kind: 'reversed-led' })
  assert.deepEqual(compareRepairBoards(reversed, repaired), [{ kind: 'led-flipped', part: 'led', from: ['A6', 'A5'], to: ['A5', 'A6'] }])
  const reordered = structuredClone(repaired)
  reordered.wires.reverse().forEach(wire => wire.reverse())
  reordered.parts.reverse()
  assert.deepEqual(compareRepairBoards(repaired, reordered), [])
})

test('ambiguous shared ground contacts stay listed as removed and added jumpers', () => {
  const old: BreadboardBuild = { parts: [], wires: [['GND', 'A1'], ['GND', 'A2']] }
  const next: BreadboardBuild = { parts: [], wires: [['GND', 'E3'], ['GND', 'D4']] }
  assert.deepEqual(compareRepairBoards(old, next).map(change => change.kind), ['wire-removed', 'wire-removed', 'wire-added', 'wire-added'])
})

test('repeated acceptance and later probe pairs keep the first judgment, measurements and completed board together', context => {
  storage(context)
  const first = report()
  saveRepairReport(level, first)
  saveRepairReport(level, { ...first, readings: [{ before: beforeContinuity, after: afterContinuity }] })
  const updated = saveRepairReport(level, { ...first, completedAt: 9000, firstDiagnosis: 'wrong-jumper',
    readings: [{ before: beforeVoltage, after: afterVoltage }] })
  assert.equal(updated.completedAt, 1000)
  assert.equal(updated.firstDiagnosis, 'reversed-led')
  assert.deepEqual(updated.readings.map(pair => pair.after), [afterContinuity, afterVoltage])
  assert.deepEqual(updated.validation, first.validation)
  assert.deepEqual(readRepairHistory(level), [updated])
  const alternate = structuredClone(repaired)
  alternate.wires.at(-1)![1] = 'E2'
  assert.deepEqual(saveRepairReport(level, { ...first, repaired: alternate }), updated)
  assert.deepEqual(readRepairHistory(level), [updated])
})

test('reports compare like probe positions and buttons, preserving real voltage-to-floating or D13 changes', context => {
  storage(context)
  const base = report()
  saveRepairReport(level, base)
  const retests: MeterNote[] = [
    { ...afterVoltage, red: afterVoltage.black, black: afterVoltage.red },
    { ...afterVoltage, pressed: !afterVoltage.pressed },
    { ...beforeContinuity, red: afterVoltage.red, black: afterVoltage.black, pressed: true },
  ]
  for (const after of retests) {
    const result = saveRepairReport(level, { ...base, readings: [{ before: beforeVoltage, after }] })
    assert.equal(result.readings[1].after, undefined)
  }
  const floating: MeterNote = { red: beforeVoltage.red, black: beforeVoltage.black, pressed: true, kind: 'floating', output: 0 }
  saveRepairReport(level, { ...base, readings: [{ before: beforeVoltage, after: floating }] })
  assert.deepEqual(readRepairHistory(level)[0].readings[1].after, floating)
})

test('two samples on the same holes keep their own Arduino program state and retest', context => {
  storage(context)
  const base = report()
  const settled = { ...beforeVoltage, pullup: true, drivenBy: true }
  const previousWrite = { ...beforeVoltage, pullup: true, drivenBy: false }
  const accepted = { ...base, readings: [{ before: previousWrite }, { before: settled }] }
  saveRepairReport(level, accepted)
  const after = { ...afterVoltage, pullup: true, drivenBy: true }
  saveRepairReport(level, { ...accepted, readings: [{ before: settled, after }] })
  assert.deepEqual(readRepairHistory(level)[0].readings, [{ before: previousWrite }, { before: settled, after }])
})

test('per-level archive survives many tickets, a damaged neighboring record, and preview visits', context => {
  const data = storage(context)
  for (let n = 1; n <= 50; n++) saveRepairReport(level, report('ticket-' + n, n))
  assert.ok([...data.values()].join('').length > 8192)
  const brokenKey = [...data.keys()].find(key => key.endsWith(':ticket-4'))!
  data.set(brokenKey, 'invalid')
  const history = readRepairHistory(level)
  assert.equal(history.length, 49)
  assert.equal(history[0].completedAt, 50)
  assert.equal(history.at(-1)?.completedAt, 1)
  assert.deepEqual(readRepairHistory({ id: 'other-unit' }), [])
  assert.deepEqual(readRepairHistory(level, true), [])
  saveRepairReport(level, report('preview-only', 5555), true)
  assert.deepEqual(readRepairHistory(level), history)
})
