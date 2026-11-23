import type { ArduinoSketch } from '../shared/arduino'
import { legacyBreadboardParts, type BreadboardMode, type BreadboardPart, type BreadboardWire } from '../shared/breadboard'
import type { Bit } from '../shared/hardware'
import { buildUnoProgram, powerOnUno, stepUno, type UnoProgram, type UnoState } from './arduino'

export type BreadboardReading = {
  ledOn: boolean
  fault: 'short' | 'unprotected' | 'reversed' | 'open' | null
  currentPath: string[]
  inputPath: string[]
  d2: Bit | null
}

const buttonPin = 'uno-D2'
const lampPin = 'uno-D13'
const ground = 'GND'

type EdgeKind = 'metal' | 'resistor' | 'forward' | 'reverse'
type Connections = Map<string, { pin: string; kind: EdgeKind }[]>

export function breadboardConnections(wires: BreadboardWire[], closed: boolean, parts: BreadboardPart[]): Connections {
  const graph: Connections = new Map()
  function join(a: string, b: string, kind: EdgeKind = 'metal', back = kind) {
    const left = graph.get(a) ?? []
    left.push({ pin: b, kind })
    graph.set(a, left)
    const right = graph.get(b) ?? []
    right.push({ pin: a, kind: back })
    graph.set(b, right)
  }
  // Each numbered strip is one piece of metal, independently of the other strips.
  for (let row = 1; row <= 6; row++) {
    for (const [a, b] of ['AB', 'BC', 'CD', 'DE']) join(a + row, b + row)
  }
  for (const [a, b] of wires) join(a, b)
  for (const { kind, pins: [a, b] } of parts) {
    // Two legs on the same strip have the same potential; current follows the copper.
    if (a[1] === b[1]) continue
    switch (kind) {
      case 'button': if (closed) join(a, b); break
      case 'resistor': join(a, b, 'resistor'); break
      case 'led': join(a, b, 'forward', 'reverse'); break
    }
  }
  return graph
}

// Trace one continuous route, preserving the actual jumper endpoints and strip contacts.
function trace(graph: Connections, from: string, to: string, resistor = false, diode?: 'forward' | 'reverse'): string[] {
  const previous = new Map<string, string>([[from, from]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i]
    if (here === to) {
      const path = [to]
      while (path[0] !== from) path.unshift(previous.get(path[0])!)
      return path
    }
    for (const { pin, kind } of graph.get(here) ?? []) {
      if (previous.has(pin) || (kind !== 'metal' && !(resistor && kind === 'resistor') && kind !== diode)) continue
      previous.set(pin, here)
      queue.push(pin)
    }
  }
  return []
}

function crosses(path: string[], from: string, to: string) {
  return path.some((pin, index) => pin === from && path[index + 1] === to)
}

function readLoad(graph: Connections, source: string, high: boolean, ledPins?: BreadboardWire): Pick<BreadboardReading, 'ledOn' | 'currentPath' | 'fault'> {
  // A floating or LOW D13 supplies no load current, even if a jumper connects it to ground.
  if (!high) return { ledOn: false, currentPath: [], fault: null }
  // A jumper across the supply or a forward LED without series resistance trips the bench.
  if (trace(graph, source, ground).length) return { ledOn: false, currentPath: [], fault: 'short' }
  if (!ledPins || trace(graph, ledPins[0], ledPins[1]).length) {
    return { ledOn: false, currentPath: trace(graph, source, ground, true), fault: 'open' }
  }
  const [anode, cathode] = ledPins
  if (trace(graph, source, ground, false, 'forward').length) return { ledOn: false, currentPath: [], fault: 'unprotected' }

  const currentPath = trace(graph, source, ground, true, 'forward')
  if (crosses(currentPath, anode, cathode)) return { ledOn: true, currentPath, fault: null }
  // A bypassed LED can stay dark while a parallel path still carries current through the resistor.
  const backward = trace(graph, source, ground, false, 'reverse')
  const reversed = crosses(backward.length ? backward : trace(graph, source, ground, true, 'reverse'), cathode, anode)
  return { ledOn: false, currentPath, fault: reversed ? 'reversed' : 'open' }
}

export function readBreadboard(mode: BreadboardMode, wires: BreadboardWire[], closed: boolean, uno?: UnoState, parts = legacyBreadboardParts()): BreadboardReading {
  const graph = breadboardConnections(wires, closed, parts)
  const ledPins = parts.find(part => part.kind === 'led')?.pins
  if (mode === 'series') {
    return { ...readLoad(graph, '5V', true, ledPins), d2: null, inputPath: [] }
  }
  const load = readLoad(graph, lampPin, Boolean(uno?.output && uno.led), ledPins)
  // Directly driven nets take priority over the 330 Ω resistor, then the weak internal pull-up.
  let toGround = trace(graph, buttonPin, ground)
  let toOutput = uno?.output ? trace(graph, buttonPin, lampPin) : []
  if (!toGround.length && !toOutput.length) {
    toGround = trace(graph, buttonPin, ground, true)
    toOutput = uno?.output ? trace(graph, buttonPin, lampPin, true) : []
  }
  const d2 = toGround.length ? 0 : toOutput.length && uno ? uno.led : uno?.pullup ? 1 : null
  const safe = load.fault !== 'short' && load.fault !== 'unprotected'
  const inputPath = safe && uno?.pullup && d2 === 0 ? (toGround.length ? toGround : toOutput) : []
  return { ...load, d2, inputPath }
}

export function stepBreadboardUno(program: UnoProgram, state: UnoState, wires: BreadboardWire[], pressed: boolean, parts = legacyBreadboardParts()): UnoState {
  const { d2 } = readBreadboard('call-lamp', wires, pressed, state, parts)
  return stepUno(program, { ...state, pressed }, d2)
}

export function breadboardWorks(mode: BreadboardMode, wires: BreadboardWire[], sketch?: ArduinoSketch, parts = legacyBreadboardParts()): boolean {
  const button = parts.find(part => part.kind === 'button')
  if (!button) return false
  if (mode === 'series') {
    const on = readBreadboard(mode, wires, true, undefined, parts)
    const off = readBreadboard(mode, wires, false, undefined, parts)
    return on.ledOn && !off.ledOn && off.currentPath.length === 0
  }
  if (sketch?.mode !== 'button') return false
  const program = buildUnoProgram({ ...sketch, lightWhen: sketch.goal?.lightWhen ?? sketch.lightWhen })
  let state = powerOnUno()
  // Exercise the same processor instructions on release, press and release again.
  for (const pressed of [false, true, false]) {
    const startLoop = state.loops
    while (state.loops === startLoop) state = stepBreadboardUno(program, state, wires, pressed, parts)
    const reading = readBreadboard(mode, wires, pressed, state, parts)
    if (reading.fault || reading.d2 !== Number(!pressed) || state.sample !== reading.d2
      || state.led !== Number(pressed) || reading.ledOn !== pressed) return false
    const [a, b] = button.pins
    if (pressed && !crosses(reading.inputPath, a, b) && !crosses(reading.inputPath, b, a)) return false
  }
  return true
}
