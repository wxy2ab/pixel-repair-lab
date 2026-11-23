import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildUnoProgram, powerOnUno, type UnoState } from '../src/engine/arduino'
import { stepBreadboardUno } from '../src/engine/breadboard'
import { measureBreadboardMeter, type MeterMode } from '../src/engine/breadboardMeter'
import type { ArduinoLevel } from '../src/shared/arduino'
import { breadboardFaultBuild, breadboardProgram, type BreadboardBuild, type BreadboardLevel } from '../src/shared/breadboard'
import { retestRepairNote } from '../src/web/breadboardRepairRetest'
import { repairEvidence } from '../src/web/breadboardRepairTicket'

const lesson = JSON.parse(readFileSync(new URL('../levels/6060-dc-breadboard-meter-repair.json', import.meta.url), 'utf8')) as BreadboardLevel
const beacon = JSON.parse(readFileSync(new URL('../levels/6049-dc-arduino-beacon.json', import.meta.url), 'utf8')) as ArduinoLevel
const sketch = buildUnoProgram(breadboardProgram(lesson, [beacon])!)
const repaired: BreadboardBuild = { parts: lesson.board.solutionParts ?? lesson.board.initialParts!, wires: lesson.board.solutionWires }

function firstWrite(build: BreadboardBuild, pressed: boolean) {
  let uno = powerOnUno()
  for (const step of sketch.steps) {
    uno = stepBreadboardUno(sketch, uno, build.wires, pressed, build.parts)
    if (step.instruction.op === 'writeCondition') return uno
  }
  throw new Error('Expected a digitalWrite in the call light sketch')
}

function capture(build: BreadboardBuild, mode: MeterMode, red: string, black: string, pressed: boolean, uno: UnoState, drivenBy?: boolean) {
  const reading = measureBreadboardMeter({ boardMode: 'call-lamp', build, mode, red, black, closed: pressed, powered: mode === 'voltage', uno })
  const note = repairEvidence({ mode, red, black, reading }, pressed, uno.output ? uno.led : undefined, uno.pullup, drivenBy)
  assert.ok(note)
  return note
}

test('retest puts red and black on the two saved physical holes after an LED is flipped', () => {
  const reversed = breadboardFaultBuild(lesson, { kind: 'reversed-led' })
  const note = capture(reversed, 'voltage', 'D6', 'E5', true, firstWrite(reversed, true), true)
  assert.equal(note.kind === 'voltage' && note.volts, -5)
  const { after, mode, powered } = retestRepairNote(note, repaired, sketch)
  assert.equal(mode, 'voltage')
  assert.equal(powered, true)
  // The red probe is still at D6, now on the cathode side of the repaired LED.
  assert.deepEqual(after, { ...note, volts: -2 })
})

test('continuity retests leave power off and restore the saved button position', () => {
  const fault = lesson.board.faults!.find(item => item.kind === 'wrong-jumper')!
  const broken = breadboardFaultBuild(lesson, fault)
  const before = capture(broken, 'continuity', 'D5', 'D6', true, powerOnUno())
  assert.equal(before.kind === 'continuity' && before.connected, true)
  const retest = retestRepairNote(before, repaired, sketch)
  assert.equal(retest.mode, 'continuity')
  assert.equal(retest.powered, false)
  assert.equal(retest.uno.pressed, true)
  assert.equal(retest.uno.line, null)
  assert.deepEqual(retest.after, { ...before, connected: false })
  for (const pressed of [false, true]) {
    const contact = capture(broken, 'continuity', 'uno-D2', 'GND', pressed, powerOnUno())
    assert.equal(contact.kind === 'continuity' && contact.connected, pressed)
    assert.deepEqual(retestRepairNote(contact, repaired, sketch).after, contact)
  }
})

test('D2 can be measured before and after INPUT_PULLUP while D13 is still high impedance', () => {
  const broken = breadboardFaultBuild(lesson, { kind: 'reversed-led' })
  const off = powerOnUno()
  const configured = stepBreadboardUno(sketch, off, broken.wires, false, broken.parts)
  const early = capture(broken, 'voltage', 'uno-D2', 'GND', false, off)
  const late = capture(broken, 'voltage', 'uno-D2', 'GND', false, configured)
  assert.equal(early.kind, 'floating')
  assert.equal(late.kind === 'voltage' && late.volts, 5)
  // The original board distinguishes old saved readings taken before and after the pull-up instruction.
  for (const note of [early, late]) {
    const legacy = { ...note }
    delete legacy.pullup
    delete legacy.drivenBy
    assert.deepEqual(retestRepairNote(legacy, repaired, sketch, broken).after, note)
  }
  for (const note of [early, late]) {
    const { after, uno } = retestRepairNote(note, repaired, sketch)
    assert.equal(uno.output, false)
    assert.equal(uno.pullup, note.pullup)
    assert.deepEqual(after, note)
  }
  const setup = stepBreadboardUno(sketch, configured, broken.wires, true, broken.parts)
  const beforeWrite = capture(broken, 'voltage', 'uno-D13', 'GND', true, setup)
  const retest = retestRepairNote(beforeWrite, repaired, sketch)
  assert.deepEqual(retest.after, beforeWrite)
  assert.equal(retest.uno.sample, null)
  assert.equal(retest.uno.output, true)
  assert.equal(retest.uno.led, 0)
})

test('a release after digitalWrite preserves the driving input time but reads the repaired wiring', () => {
  const missingInput: BreadboardBuild = { ...repaired, wires: repaired.wires.filter(wire => !wire.includes('uno-D2')) }
  const beforeWrite = firstWrite(missingInput, true)
  const before = capture(missingInput, 'voltage', 'uno-D13', 'GND', false, beforeWrite, true)
  assert.equal(before.kind === 'voltage' && before.volts, 0)
  assert.equal(before.output, 0)
  const retest = retestRepairNote(before, repaired, sketch)
  assert.equal(retest.uno.pressed, false)
  assert.equal(retest.drivenBy, true)
  assert.equal(retest.uno.sample, 0)
  assert.equal(retest.uno.led, 1)
  assert.deepEqual(retest.after, { ...before, volts: 5, output: 1 })
})

test('a protected retest does not reuse the old voltage, and a floating contact stays identifiable', () => {
  const before = capture(repaired, 'voltage', 'D5', 'D6', true, firstWrite(repaired, true), true)
  const short: BreadboardBuild = { ...repaired, wires: [...repaired.wires, ['uno-D13', 'GND']] }
  assert.equal(retestRepairNote(before, short, sketch).after, undefined)
  const unplugged = { ...repaired, wires: repaired.wires.filter(wire => !wire.includes('B4')) }
  const after = retestRepairNote(before, unplugged, sketch).after
  assert.equal(after?.kind, 'floating')
  assert.equal(after?.red, before.red)
  assert.equal(after?.black, before.black)
})
