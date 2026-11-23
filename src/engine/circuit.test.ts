import assert from 'node:assert/strict'
import test from 'node:test'
import { binaryValue, circuitMeetsGoal, componentReading, gateOutput } from './circuit'
import type { Bit, CircuitCase, Gate } from '../shared/hardware'

test('bits are read from highest to lowest weight', () => {
  assert.equal(binaryValue([1, 0, 1, 0]), 10)
  assert.equal(binaryValue([0, 0, 1, 1]), 3)
  assert.equal(binaryValue([1, 1, 1, 1, 1, 1, 1, 1]), 255)
})

test('the LED needs a complete load path and a conducting component', () => {
  const rows: Bit[][] = [[0, 0], [0, 1], [1, 0], [1, 1]]
  for (const mode of ['diode', 'transistor'] as const) {
    assert.deepEqual(rows.map(bits => componentReading(mode, bits).output), [0, 0, 0, 1])
  }
  assert.equal(componentReading('transistor', [0, 1]).baseHigh, 1)
  assert.equal(componentReading('diode', [0, 1]).diodeForward, 1)
})

test('a dark LED alone does not prove a closed switch and a blocking device', () => {
  const scenario: CircuitCase = {
    label: { zh: '断流', en: 'Block current' }, bits: [0, 0],
    goal: { output: 0, switchClosed: 1, diodeForward: 0 },
  }
  assert.equal(circuitMeetsGoal(scenario, { bits: [0, 1] }, 'diode'), false)
  assert.equal(circuitMeetsGoal(scenario, { bits: [1, 1] }, 'diode'), false)
  assert.equal(circuitMeetsGoal(scenario, { bits: [1, 0] }, 'diode'), true)
  scenario.goal = { output: 0, baseHigh: 1 }
  assert.equal(circuitMeetsGoal(scenario, { bits: [0, 0] }, 'transistor'), false)
  assert.equal(circuitMeetsGoal(scenario, { bits: [0, 1] }, 'transistor'), true)
})

test('every gate produces its truth table, including NOT ignoring input B', () => {
  const rows: [Bit, Bit][] = [[0, 0], [0, 1], [1, 0], [1, 1]]
  const expected: Record<Gate, Bit[]> = {
    AND: [0, 0, 0, 1], OR: [0, 1, 1, 1], NOT: [1, 1, 0, 0], XOR: [0, 1, 1, 0],
  }
  for (const gate of Object.keys(expected) as Gate[]) {
    assert.deepEqual(rows.map(([a, b]) => gateOutput(gate, a, b)), expected[gate])
  }
})

test('combined goals check the number and gate output independently and accept equivalent wiring', () => {
  const scenario: CircuitCase = { label: { zh: '测试', en: 'Test' }, bits: [0, 0, 0, 0], gate: 'AND', goal: { value: 5, output: 1 } }
  assert.equal(circuitMeetsGoal(scenario, { bits: [0, 1, 0, 1], gate: 'XOR' }), true)
  assert.equal(circuitMeetsGoal(scenario, { bits: [0, 1, 0, 1], gate: 'NOT' }), true)
  assert.equal(circuitMeetsGoal(scenario, { bits: [0, 1, 0, 1], gate: 'AND' }), false)
  assert.equal(circuitMeetsGoal(scenario, { bits: [0, 1, 0, 0], gate: 'XOR' }), false)
  assert.equal(circuitMeetsGoal(scenario, { bits: [1, 0, 1], gate: 'XOR' }), false)
})
