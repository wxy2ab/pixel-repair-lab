import type { Bit, CircuitCase, CircuitInput, CircuitLevel, ComponentCircuitMode, Gate } from '../shared/hardware'

export function binaryValue(bits: Bit[]): number {
  return bits.reduce<number>((value, bit) => value * 2 + bit, 0)
}

export function gateOutput(gate: Gate, a: Bit, b: Bit): Bit {
  switch (gate) {
    case 'AND': return a === 1 && b === 1 ? 1 : 0
    case 'OR': return a === 1 || b === 1 ? 1 : 0
    case 'NOT': return a === 0 ? 1 : 0
    case 'XOR': return a !== b ? 1 : 0
  }
}

export function isComponentCircuit(mode: CircuitLevel['mode']): mode is ComponentCircuitMode {
  return mode === 'diode' || mode === 'transistor'
}

export function componentReading(mode: ComponentCircuitMode, bits: Bit[]) {
  const [switchClosed, control] = bits
  const output: Bit = switchClosed === 1 && control === 1 ? 1 : 0
  return {
    switchClosed, output,
    diodeForward: mode === 'diode' ? control : undefined,
    baseHigh: mode === 'transistor' ? control : undefined,
  }
}

export function circuitMeetsGoal(scenario: CircuitCase, input: CircuitInput, mode?: CircuitLevel['mode']): boolean {
  const { goal } = scenario
  if (!goal || input.bits.length !== scenario.bits.length) return false
  if (mode && isComponentCircuit(mode)) {
    const reading = componentReading(mode, input.bits)
    return goal.output === reading.output
      && (goal.switchClosed === undefined || goal.switchClosed === reading.switchClosed)
      && (goal.diodeForward === undefined || goal.diodeForward === reading.diodeForward)
      && (goal.baseHigh === undefined || goal.baseHigh === reading.baseHigh)
  }
  const value = binaryValue(input.bits)
  const output = input.gate === undefined ? undefined : gateOutput(input.gate, input.bits[0], input.bits[1])
  return (goal.value === undefined || goal.value === value)
    && (goal.output === undefined || goal.output === output)
    && (goal.gate === undefined || goal.gate === input.gate)
}
