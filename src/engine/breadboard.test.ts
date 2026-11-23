import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ArduinoSketch } from '../shared/arduino'
import type { BreadboardPart, BreadboardWire } from '../shared/breadboard'
import { buildUnoProgram, powerOnUno } from './arduino'
import { breadboardWorks, readBreadboard, stepBreadboardUno } from './breadboard'

const series: BreadboardWire[] = [['5V', 'B1'], ['C2', 'D3'], ['B4', 'B5'], ['B6', 'GND']]
const call: BreadboardWire[] = [['uno-D2', 'B1'], ['C2', 'GND'], ['uno-D13', 'C3'], ['B4', 'B5'], ['B6', 'GND']]
const completedSketch: ArduinoSketch = { mode: 'button', lightWhen: 'pressed' }
const movedParts: BreadboardPart[] = [
  { kind: 'button', pins: ['E2', 'E1'] },
  { kind: 'resistor', pins: ['E4', 'E3'] },
  { kind: 'led', pins: ['C5', 'C6'] },
]

test('LED polarity and the occupied strips determine the readings after moving, flipping or pulling a part', () => {
  const [button, resistor, led] = movedParts
  const trial = (parts: BreadboardPart[]) => readBreadboard('series', series, true, undefined, parts)
  const placed = trial(movedParts)
  assert.equal(placed.ledOn, true)
  for (const [a, b] of [['E1', 'E2'], ['E3', 'E4'], ['C5', 'C6']]) {
    const start = placed.currentPath.indexOf(a)
    assert.equal(placed.currentPath[start + 1], b)
  }
  assert.equal(breadboardWorks('series', series, undefined, movedParts), true)
  assert.equal(trial([button, resistor, { ...led, pins: ['E5', 'E6'] }]).ledOn, true)
  assert.equal(trial([button, resistor, { ...led, pins: ['C5', 'C1'] }]).fault, 'open')
  const flipped: BreadboardPart[] = [button, resistor, { ...led, pins: ['C6', 'C5'] }]
  assert.equal(trial(flipped).fault, 'reversed')
  assert.equal(trial(flipped).ledOn, false)
  assert.deepEqual(trial(flipped).currentPath, [])
  for (const absent of movedParts) {
    const partial = movedParts.filter(part => part.kind !== absent.kind)
    assert.equal(trial(partial).ledOn, false)
    assert.equal(breadboardWorks('series', series, undefined, partial), false)
  }
  assert.equal(trial([]).fault, 'open')
  const sameStrip: BreadboardPart[] = [button, resistor, { kind: 'led', pins: ['C5', 'D5'] }]
  const bypassed = readBreadboard('series', [...series, ['E5', 'E6']], true, undefined, sameStrip)
  assert.equal(bypassed.ledOn, false)
  assert.ok(bypassed.currentPath.length > 0) // Current still flows through the resistor.
})

test('Uno runs the same program against the moved button and external LED', () => {
  assert.equal(breadboardWorks('call-lamp', call, completedSketch, movedParts), true)
  const reversed: BreadboardPart[] = [...movedParts.slice(0, 2), { kind: 'led', pins: ['C6', 'C5'] }]
  assert.equal(breadboardWorks('call-lamp', call, completedSketch, reversed), false)
  const sketch = buildUnoProgram(completedSketch)
  let state = powerOnUno()
  do { state = stepBreadboardUno(sketch, state, call, true, reversed) } while (state.loops === 0)
  assert.equal(state.sample, 0)
  assert.equal(state.led, 1)
  const reading = readBreadboard('call-lamp', call, true, state, reversed)
  assert.equal(reading.ledOn, false)
  assert.equal(reading.fault, 'reversed')
  assert.ok(reading.inputPath.includes('E1') && reading.inputPath.includes('E2'))
  assert.equal(breadboardWorks('call-lamp', call, completedSketch, []), false)
})

test('a full build can use different numbered strips and travel from the battery to the Uno', () => {
  const parts: BreadboardPart[] = [
    { kind: 'button', pins: ['B6', 'D3'] },
    { kind: 'resistor', pins: ['D1', 'B4'] },
    { kind: 'led', pins: ['C2', 'E5'] },
  ]
  const internal: BreadboardWire[] = [['A4', 'A2']]
  const supply: BreadboardWire[] = [...internal, ['5V', 'A6'], ['A3', 'A1'], ['A5', 'GND']]
  assert.equal(breadboardWorks('series', supply, undefined, parts), true)
  assert.equal(breadboardWorks('series', supply), false)
  const usb: BreadboardWire[] = [...internal, ['uno-D2', 'A6'], ['GND', 'A3'], ['uno-D13', 'A1'], ['A5', 'C3']]
  assert.equal(breadboardWorks('call-lamp', usb, completedSketch, parts), true)
  const reversed: BreadboardPart[] = [...parts.slice(0, 2), { kind: 'led', pins: ['E5', 'C2'] }]
  assert.equal(breadboardWorks('call-lamp', usb, completedSketch, reversed), false)
})

test('the current trace crosses the actual jumpers, strips, switch, resistor and LED in order', () => {
  const closed = readBreadboard('series', series, true)
  assert.deepEqual(closed.currentPath, ['5V', 'B1', 'A1', 'A2', 'B2', 'C2', 'D3', 'C3', 'B3', 'A3', 'A4', 'B4', 'B5', 'A5', 'A6', 'B6', 'GND'])
  assert.equal(closed.ledOn, true)
  assert.equal(closed.fault, null)
  const open = readBreadboard('series', series, false)
  assert.equal(open.ledOn, false)
  assert.deepEqual(open.currentPath, [])
  assert.equal(open.fault, 'open')
  assert.equal(breadboardWorks('series', series), true)
  const afterLed: BreadboardWire[] = [['E5', '5V'], ['B6', 'D4'], ['B3', 'D2'], ['D1', 'GND']]
  assert.equal(breadboardWorks('series', afterLed), true)
})

test('a reversed LED, an open strip, an unprotected LED and a short produce different readings', () => {
  assert.equal(readBreadboard('series', [...series.slice(0, 2), ['B4', 'B6'], ['B5', 'GND']], true).fault, 'reversed')
  assert.equal(readBreadboard('series', series.slice(0, -1), true).fault, 'open')
  const bypassResistance = readBreadboard('series', [...series, ['C3', 'C4']], true)
  assert.equal(bypassResistance.fault, 'unprotected')
  assert.equal(bypassResistance.ledOn, false)
  assert.deepEqual(bypassResistance.currentPath, [])
  const short = readBreadboard('series', [...series, ['5V', 'D6']], true)
  assert.equal(short.fault, 'short')
  assert.deepEqual(short.currentPath, [])
})

test('a bypassed LED can remain dark on a live resistor loop; a bypassed switch cannot pass', () => {
  const ledBypassed = readBreadboard('series', [...series, ['D5', 'D6']], true)
  assert.equal(ledBypassed.ledOn, false)
  assert.ok(ledBypassed.currentPath.includes('A3'))
  assert.ok(ledBypassed.currentPath.includes('D5'))
  assert.ok(!ledBypassed.currentPath.includes('A5'))
  const uncontrolled: BreadboardWire[] = [...series, ['C1', 'D2']]
  assert.equal(readBreadboard('series', uncontrolled, false).ledOn, true)
  assert.equal(breadboardWorks('series', uncontrolled), false)
})

test('a wired D2 changes immediately, the sketch samples later, and the external LED follows D13', () => {
  const program = buildUnoProgram(completedSketch)
  let state = powerOnUno()
  assert.equal(readBreadboard('call-lamp', call, false, state).d2, null)
  state = stepBreadboardUno(program, state, call, false) // INPUT_PULLUP
  assert.equal(readBreadboard('call-lamp', call, false, state).d2, 1)
  state = stepBreadboardUno(program, state, call, false) // OUTPUT
  state = stepBreadboardUno(program, state, call, false) // read released
  const pressed = readBreadboard('call-lamp', call, true, state)
  assert.equal(pressed.d2, 0)
  assert.deepEqual(pressed.inputPath, ['uno-D2', 'B1', 'A1', 'A2', 'B2', 'C2', 'GND'])
  assert.equal(state.sample, 1)
  for (let i = 0; i < 3; i++) state = stepBreadboardUno(program, state, call, true)
  assert.equal(readBreadboard('call-lamp', call, true, state).ledOn, false)
  for (let i = 0; i < 3; i++) state = stepBreadboardUno(program, state, call, true)
  const observed = readBreadboard('call-lamp', call, true, state)
  assert.equal(state.sample, 0)
  assert.equal(observed.ledOn, true)
  assert.equal(observed.currentPath[0], 'uno-D13')
  assert.equal(observed.currentPath.at(-1), 'GND')
  const loadDisconnected = readBreadboard('call-lamp', call.slice(0, -1), true, state)
  assert.equal(state.led, 1)
  assert.equal(loadDisconnected.ledOn, false)
})

test('the call project verifies both external signals and the actual return to idle', () => {
  assert.equal(breadboardWorks('call-lamp', call, completedSketch), true)
  assert.equal(breadboardWorks('call-lamp', call, { mode: 'button', lightWhen: 'released', goal: { lightWhen: 'pressed' } }), true)
  assert.equal(breadboardWorks('call-lamp', call, { mode: 'button', lightWhen: 'released' }), false)
  assert.equal(breadboardWorks('call-lamp', call.slice(1), completedSketch), false)
  assert.equal(breadboardWorks('call-lamp', call.slice(0, -1), completedSketch), false)
  assert.equal(breadboardWorks('call-lamp', [...call, ['uno-D2', 'GND']], completedSketch), false)
  assert.equal(breadboardWorks('call-lamp', [...call, ['E3', 'E4']], completedSketch), false)
})

test('load protection tracks D13 drive, including the transition back to LOW', () => {
  const short: BreadboardWire[] = [...call, ['uno-D13', 'GND']]
  const noResistor: BreadboardWire[] = [...call, ['D3', 'D4']]
  for (const [wires, expectedFault] of [[short, 'short'], [noResistor, 'unprotected']] as const) {
    const startup = powerOnUno()
    const low = { ...startup, output: true, pullup: true }
    const high = { ...low, led: 1 as const }
    for (const state of [startup, low, high, low]) {
      const reading = readBreadboard('call-lamp', wires, true, state)
      assert.equal(reading.fault, state === high ? expectedFault : null)
      assert.equal(reading.ledOn, false)
      assert.deepEqual(reading.currentPath, [])
      assert.equal(reading.inputPath.length > 0, state === low)
    }
    assert.equal(breadboardWorks('call-lamp', wires, completedSketch), false)
  }
  const tiedPins: BreadboardWire[] = [['uno-D2', 'uno-D13']]
  const initial = powerOnUno()
  assert.equal(readBreadboard('call-lamp', tiedPins, false, initial).d2, null)
  const pulled = { ...initial, pullup: true }
  assert.equal(readBreadboard('call-lamp', tiedPins, false, pulled).d2, 1)
  const driven = readBreadboard('call-lamp', tiedPins, false, { ...pulled, output: true })
  assert.equal(driven.d2, 0)
  assert.deepEqual(driven.inputPath, ['uno-D2', 'uno-D13'])
})
