import assert from 'node:assert/strict'
import { test } from 'node:test'
import { legacyBreadboardParts, type BreadboardBuild } from '../shared/breadboard'
import { buildUnoProgram, powerOnUno } from './arduino'
import { breadboardWorks, stepBreadboardUno } from './breadboard'
import { measureBreadboardMeter } from './breadboardMeter'

const series: BreadboardBuild = {
  parts: legacyBreadboardParts(),
  wires: [['5V', 'B1'], ['C2', 'D3'], ['B4', 'B5'], ['B6', 'GND']],
}
const healthy: BreadboardBuild = {
  parts: legacyBreadboardParts(),
  wires: [['uno-D2', 'B1'], ['B2', 'GND'], ['uno-D13', 'B3'], ['B4', 'B5'], ['B6', 'C2']],
}
const powered = { boardMode: 'series', mode: 'voltage', powered: true, closed: true, build: series } as const
const continuity = { ...powered, mode: 'continuity', powered: false } as const
const voltage = (volts: number) => ({ kind: 'voltage', volts })
const sketch = { mode: 'button', lightWhen: 'pressed' } as const

test('continuity follows metal, jumpers and the actual switch, including occupied holes and external contacts', () => {
  for (const [red, black, closed, connected] of [
    ['A4', 'E4', false, true], ['E4', 'A5', false, true], ['A1', 'A2', false, false],
    ['A1', 'A2', true, true], ['5V', 'E3', true, true], ['A3', 'A4', true, false],
    ['A5', 'A6', true, false], ['A6', 'A5', true, false],
  ] as const) {
    assert.deepEqual(measureBreadboardMeter({ ...continuity, closed, red, black }), { kind: 'continuity', connected })
  }
  assert.deepEqual(measureBreadboardMeter({ ...continuity, red: 'A5' }), { kind: 'place-probes' })
  assert.deepEqual(measureBreadboardMeter({ ...continuity, red: 'A5', black: 'Z9' }), { kind: 'place-probes' })
  assert.deepEqual(measureBreadboardMeter({ ...continuity, powered: true, red: 'A5', black: 'A6' }), { kind: 'power-off-first' })
  assert.deepEqual(measureBreadboardMeter({ ...powered, powered: false, red: 'A5', black: 'A6' }), { kind: 'unpowered' })
})

test('signed DC voltage accounts for the placement of both probes and components', () => {
  for (const [red, black, volts] of [
    ['5V', 'GND', 5], ['A5', 'A6', 2], ['A6', 'E5', -2],
    ['A3', 'A4', 3], ['A1', 'A2', 0], ['GND', 'B4', -2],
  ] as const) {
    assert.deepEqual(measureBreadboardMeter({ ...powered, red, black }), voltage(volts))
  }
  // Swap resistor and LED along the supply path: the LED now sits above the resistor.
  const build: BreadboardBuild = { ...series, wires: [['5V', 'B1'], ['B2', 'B5'], ['B6', 'C3'], ['D4', 'GND']] }
  assert.deepEqual(measureBreadboardMeter({ ...powered, build, red: 'A6', black: 'GND' }), voltage(3))
  assert.deepEqual(measureBreadboardMeter({ ...powered, build, red: 'A5', black: 'A6' }), voltage(2))
})

test('independent floating contacts and tripped protection do not produce an invented voltage', () => {
  const build = { parts: series.parts, wires: [] }
  assert.deepEqual(measureBreadboardMeter({ ...powered, build, red: 'A4', black: 'GND' }), { kind: 'floating' })
  assert.deepEqual(measureBreadboardMeter({ ...powered, build, red: 'E5', black: 'A6' }), { kind: 'floating' })
  assert.deepEqual(measureBreadboardMeter({ ...powered, build, red: 'E3', black: 'D4' }), voltage(0))
  assert.deepEqual(measureBreadboardMeter({ ...powered, build, red: 'A4', black: 'C4' }), voltage(0))
  for (const bypass of [['E1', 'GND'], ['C3', 'C4']] as [string, string][]) {
    const fault: BreadboardBuild = { ...series, wires: [...series.wires, bypass] }
    assert.deepEqual(measureBreadboardMeter({ ...powered, build: fault, red: '5V', black: 'GND' }), { kind: 'protected' })
  }
})

test('two dark pressed call lights give different evidence and the repaired build measures a forward drop', () => {
  const bypass: BreadboardBuild = { ...healthy, wires: [...healthy.wires.slice(0, -1), ['B6', 'C5']] }
  const reversed: BreadboardBuild = { ...healthy, parts: [...healthy.parts.slice(0, 2), { kind: 'led', pins: ['A6', 'A5'] }] }
  const program = buildUnoProgram(sketch)
  for (const [build, volts, connected, works] of [
    [bypass, 0, true, false], [reversed, -5, false, false], [healthy, 2, false, true],
  ] as const) {
    let uno = powerOnUno()
    do { uno = stepBreadboardUno(program, uno, build.wires, true, build.parts) } while (uno.loops < 1)
    const [red, black] = build.parts.find(part => part.kind === 'led')!.pins
    const probes = { boardMode: 'call-lamp', closed: true, uno, build, red, black } as const
    assert.equal(uno.led, 1)
    assert.deepEqual(measureBreadboardMeter({ ...continuity, ...probes }), { kind: 'continuity', connected })
    assert.deepEqual(measureBreadboardMeter({ ...powered, ...probes }), voltage(volts))
    assert.equal(breadboardWorks('call-lamp', build.wires, sketch, build.parts), works)
  }
})

test('voltage follows live Uno pin modes, button contacts, and the level written by the last instruction', () => {
  const program = buildUnoProgram(sketch)
  const meter = { ...powered, boardMode: 'call-lamp', build: healthy, black: 'GND' } as const
  let uno = powerOnUno()
  assert.deepEqual(measureBreadboardMeter({ ...meter, closed: false, uno, red: 'uno-D2' }), { kind: 'floating' })
  assert.deepEqual(measureBreadboardMeter({ ...meter, uno, red: 'uno-D13' }), { kind: 'floating' })
  uno = stepBreadboardUno(program, uno, healthy.wires, false, healthy.parts)
  assert.deepEqual(measureBreadboardMeter({ ...meter, closed: false, uno, red: 'uno-D2' }), voltage(5))
  assert.deepEqual(measureBreadboardMeter({ ...meter, closed: true, uno, red: 'uno-D2' }), voltage(0))
  uno = stepBreadboardUno(program, uno, healthy.wires, true, healthy.parts)
  assert.deepEqual(measureBreadboardMeter({ ...meter, uno, red: 'uno-D13' }), voltage(0))
  do { uno = stepBreadboardUno(program, uno, healthy.wires, true, healthy.parts) } while (uno.loops < 1)
  assert.deepEqual(measureBreadboardMeter({ ...meter, closed: false, uno, red: 'uno-D13' }), voltage(5))
  do { uno = stepBreadboardUno(program, uno, healthy.wires, false, healthy.parts) } while (uno.loops < 2)
  assert.deepEqual(measureBreadboardMeter({ ...meter, closed: false, uno, red: 'uno-D13' }), voltage(0))
})
