import { isBreadboardPin, type BreadboardBuild, type BreadboardMode } from '../shared/breadboard'
import type { UnoState } from './arduino'
import { breadboardConnections, readBreadboard } from './breadboard'

export type MeterMode = 'continuity' | 'voltage'
export type MeterReading =
  | { kind: 'continuity'; connected: boolean }
  | { kind: 'voltage'; volts: number }
  | { kind: 'place-probes' | 'power-off-first' | 'unpowered' | 'protected' | 'floating' }

type MeterRequest = {
  mode: MeterMode; boardMode: BreadboardMode; build: BreadboardBuild; closed: boolean
  powered: boolean; uno?: UnoState; red?: string | null; black?: string | null
}
type Branch = { a: string; b: string; ohms: number; drop: number }

// Every contact on one piece of copper gets the same net name. A probe can touch
// a component leg or an occupied socket without inserting anything in the board.
function metalNets(build: BreadboardBuild, closed: boolean) {
  const graph = breadboardConnections(build.wires, closed, build.parts)
  const nets = new Map<string, string>()
  for (const first of graph.keys()) {
    if (nets.has(first)) continue
    const queue = [first]
    nets.set(first, first)
    for (let i = 0; i < queue.length; i++) {
      for (const { pin, kind } of graph.get(queue[i]) ?? []) {
        if (kind === 'metal' && !nets.has(pin)) {
          nets.set(pin, first)
          queue.push(pin)
        }
      }
    }
  }
  return (pin: string) => nets.get(pin) ?? pin
}

function reachable(start: Iterable<string>, branches: Branch[]) {
  const reached = new Set(start)
  for (const node of reached) {
    for (const { a, b } of branches) {
      if (node === a) reached.add(b)
      if (node === b) reached.add(a)
    }
  }
  return reached
}

// Solve the small DC circuit using current balance at each net. For a branch
// from a to b, current is (Va - Vb - drop) / ohms. Sources set absolute voltages.
function solveVoltages(sources: Map<string, number>, branches: Branch[]) {
  const unknown = [...reachable(sources.keys(), branches)].filter(node => !sources.has(node))
  const n = unknown.length
  const rows: number[][] = Array.from({ length: n }, () => Array(n + 1).fill(0))
  for (const { a, b, ohms, drop } of branches) {
    if (a === b) continue
    function addCurrent(node: string, other: string, forwardDrop: number) {
      const index = unknown.indexOf(node)
      if (index < 0) return
      const row = rows[index]
      row[index] += 1 / ohms
      row[n] += forwardDrop / ohms
      const otherIndex = unknown.indexOf(other)
      if (otherIndex >= 0) row[otherIndex] -= 1 / ohms
      else row[n] += sources.get(other)! / ohms
    }
    addCurrent(a, b, drop)
    addCurrent(b, a, -drop)
  }
  // All remaining nets have a path to a source, so the conductance matrix
  // is positive definite and each diagonal pivot is nonzero.
  for (let i = 0; i < n; i++) {
    const pivot = rows[i][i]
    for (let k = i; k <= n; k++) rows[i][k] /= pivot
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const factor = rows[j][i]
      for (let k = i; k <= n; k++) rows[j][k] -= factor * rows[i][k]
    }
  }
  const volts = new Map(sources)
  unknown.forEach((node, i) => volts.set(node, rows[i][n]))
  return volts
}

export function measureBreadboardMeter(request: MeterRequest): MeterReading {
  const { mode, boardMode, build, closed, powered, uno, red, black } = request
  if (mode === 'continuity' && powered) return { kind: 'power-off-first' }
  if (!red || !black || !isBreadboardPin(boardMode, red, []) || !isBreadboardPin(boardMode, black, [])) {
    return { kind: 'place-probes' }
  }
  const net = metalNets(build, closed)
  const plus = net(red), minus = net(black)
  if (mode === 'continuity') return { kind: 'continuity', connected: plus === minus }
  if (!powered) return { kind: 'unpowered' }
  const { fault } = readBreadboard(boardMode, build.wires, closed, uno, build.parts)
  if (fault === 'short' || fault === 'unprotected') return { kind: 'protected' }
  if (plus === minus) return { kind: 'voltage', volts: 0 }

  const branches: Branch[] = []
  const sources = new Map([[net('GND'), 0]])
  if (boardMode === 'series') sources.set(net('5V'), 5)
  else {
    if (uno?.output) sources.set(net('uno-D13'), uno.led * 5)
    if (uno?.pullup) {
      sources.set('internal-5V', 5)
      branches.push({ a: 'internal-5V', b: net('uno-D2'), ohms: 30_000, drop: 0 })
    }
  }
  const resistor = build.parts.find(part => part.kind === 'resistor')
  if (resistor) branches.push({ a: net(resistor.pins[0]), b: net(resistor.pins[1]), ohms: 330, drop: 0 })

  let volts = solveVoltages(sources, branches)
  const led = build.parts.find(part => part.kind === 'led')
  if (led) {
    const a = net(led.pins[0]), b = net(led.pins[1])
    const anode = volts.get(a), cathode = volts.get(b)
    // Red LED model: blocks reverse current and conducts above about 2 V.
    if (anode !== undefined && cathode !== undefined && anode - cathode > 2) {
      branches.push({ a, b, ohms: 1, drop: 2 })
      volts = solveVoltages(sources, branches)
    }
  }

  const redVoltage = volts.get(plus), blackVoltage = volts.get(minus)
  if (redVoltage === undefined || blackVoltage === undefined) {
    // An isolated resistor carries no current, so its ends still measure 0 V
    // relative to each other. Separate floating islands have no set difference.
    if (reachable([plus], branches).has(minus)) return { kind: 'voltage', volts: 0 }
    return { kind: 'floating' }
  }
  const tenths = Math.round((redVoltage - blackVoltage) * 10)
  return { kind: 'voltage', volts: tenths === 0 ? 0 : tenths / 10 }
}
