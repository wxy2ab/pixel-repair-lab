import type { ArduinoSketch } from './arduino'
import type { Issue, Level, LevelMetadata } from './types'

export type BreadboardMode = 'series' | 'call-lamp'
export type BreadboardPin = string
export type BreadboardWire = [BreadboardPin, BreadboardPin]
export type BreadboardPartKind = 'button' | 'resistor' | 'led'
export type BreadboardPart = { kind: BreadboardPartKind; pins: [BreadboardPin, BreadboardPin] }
export type BreadboardBuild = { parts: BreadboardPart[]; wires: BreadboardWire[] }
export type BreadboardFault = { kind: 'wrong-jumper'; wire: BreadboardWire; wrongPin: BreadboardPin }
  | { kind: 'reversed-led' }
export type BreadboardLevel = LevelMetadata & {
  kind: 'breadboard'
  stage: 'exercise' | 'challenge'
  board: {
    mode: BreadboardMode
    initialWires: BreadboardWire[]
    solutionWires: BreadboardWire[]
    initialParts?: BreadboardPart[]
    solutionParts?: BreadboardPart[]
    programId?: string
    carryFrom?: string
    faults?: BreadboardFault[]
  }
  courseFinal?: true
}

export function legacyBreadboardParts(): BreadboardPart[] {
  return [
    { kind: 'button', pins: ['A1', 'A2'] },
    { kind: 'resistor', pins: ['A3', 'A4'] },
    { kind: 'led', pins: ['A5', 'A6'] },
  ]
}

// Each repair ticket starts with the same tested circuit and one physical change.
export function breadboardFaultBuild(level: BreadboardLevel, fault: BreadboardFault): BreadboardBuild {
  const { board } = level
  const build = structuredClone({
    parts: board.solutionParts ?? board.initialParts ?? legacyBreadboardParts(),
    wires: board.solutionWires,
  })
  if (fault.kind === 'reversed-led') {
    build.parts.find(part => part.kind === 'led')?.pins.reverse()
  } else {
    const [fixed, correct] = fault.wire
    const jumper = build.wires.find(wire => wire.includes(fixed) && wire.includes(correct))
    if (jumper) jumper[jumper.indexOf(correct)] = fault.wrongPin
  }
  return build
}

export function isBreadboardSocket(pin: string) {
  return /^[A-E][1-6]$/.test(pin)
}

export function canPlaceBreadboardPart(parts: BreadboardPart[], wires: BreadboardWire[], candidate: BreadboardPart) {
  const [first, second] = candidate.pins
  return first !== second && candidate.pins.every(pin => isBreadboardSocket(pin)
    && !parts.some(part => part.kind !== candidate.kind && part.pins.includes(pin))
    && !wires.some(wire => wire.includes(pin)))
}

export function isBreadboardPin(mode: BreadboardMode, pin: BreadboardPin, parts = legacyBreadboardParts()) {
  return (isBreadboardSocket(pin) && !parts.some(part => part.pins.includes(pin))) || pin === 'GND'
    || (mode === 'series' ? pin === '5V' : pin === 'uno-D2' || pin === 'uno-D13')
}

export function canAddBreadboardWire(mode: BreadboardMode, wires: BreadboardWire[], [from, to]: BreadboardWire, parts = legacyBreadboardParts()) {
  if (wires.length >= 24 || from === to || !isBreadboardPin(mode, from, parts) || !isBreadboardPin(mode, to, parts)) return false
  const socketOccupied = (pin: string) => isBreadboardSocket(pin) && wires.some(wire => wire.includes(pin))
  return !socketOccupied(from) && !socketOccupied(to) && !wires.some(wire => wire.includes(from) && wire.includes(to))
}

export function breadboardIssues(level: BreadboardLevel): Issue[] {
  const issues: Issue[] = []
  const { board } = level
  for (const field of ['initialParts', 'solutionParts'] as const) {
    const parts = board[field] ?? []
    parts.forEach((part, index) => {
      const earlier = parts.slice(0, index)
      if (earlier.some(item => item.kind === part.kind) || !canPlaceBreadboardPart(earlier, [], part)) {
        issues.push({ path: '/board/' + field + '/' + index, code: 'breadboard-part', message: 'Use one of each component and two free board holes for its legs.' })
      }
    })
  }
  for (const field of ['initialWires', 'solutionWires'] as const) {
    const wires = board[field]
    const parts = (field === 'solutionWires' ? board.solutionParts : undefined) ?? board.initialParts ?? legacyBreadboardParts()
    wires.forEach((wire, index) => {
      if (!canAddBreadboardWire(board.mode, wires.slice(0, index), wire, parts)) {
        issues.push({ path: '/board/' + field + '/' + index, code: 'breadboard-wire', message: 'Connect two different available sockets using a single jumper.' })
      }
    })
  }
  if ((board.mode === 'call-lamp') !== Boolean(board.programId)) {
    issues.push({ path: '/board/programId', code: 'breadboard-program', message: 'The Arduino board needs a call-lamp lesson as its program source.' })
  }
  if (board.carryFrom && board.mode !== 'call-lamp') {
    issues.push({ path: '/board/carryFrom', code: 'breadboard-carry', message: 'Only an Arduino board can reuse a series build.' })
  }
  if (board.faults) {
    if (board.mode !== 'call-lamp' || level.stage !== 'challenge' || board.carryFrom) {
      issues.push({ path: '/board/faults', code: 'breadboard-fault', message: 'Use repair tickets on a call-lamp challenge with its own board.' })
    }
    board.faults.forEach((fault, index) => {
      const { parts, wires } = breadboardFaultBuild(level, fault)
      const valid = fault.kind === 'reversed-led' ? parts.some(part => part.kind === 'led')
        : board.solutionWires.some(wire => fault.wire.every(pin => wire.includes(pin)))
          && isBreadboardSocket(fault.wire[1]) && isBreadboardSocket(fault.wrongPin)
          && fault.wire[1][1] !== fault.wrongPin[1]
          && wires.every((wire, i) => canAddBreadboardWire(board.mode, wires.slice(0, i), wire, parts))
      if (!valid) issues.push({ path: '/board/faults/' + index, code: 'breadboard-fault',
        message: 'Reverse an installed LED, or move one end of a reference jumper to a free hole on a different strip.' })
    })
  }
  if (level.courseFinal && level.stage !== 'challenge') {
    issues.push({ path: '/courseFinal', code: 'breadboard-final', message: 'Use a challenge for the final project.' })
  }
  return issues
}

// The preceding project config describes both the starting setting and the working program.
// A new learner opening the board directly can run the same, completed sketch.
export function breadboardProgram(level: BreadboardLevel, catalog: readonly Level[]): ArduinoSketch | undefined {
  const source = catalog.find(candidate => candidate.id === level.board.programId)
  if (source?.kind !== 'arduino' || source.sketch.mode !== 'button' || source.sketch.goal?.lightWhen !== 'pressed') return
  return { ...source.sketch, lightWhen: source.sketch.goal.lightWhen }
}

export function breadboardProgramIssues(level: Level, catalog: readonly Level[]): Issue[] {
  if (level.kind !== 'breadboard' || level.board.mode !== 'call-lamp') return []
  const issues: Issue[] = []
  if (!breadboardProgram(level, catalog)) {
    issues.push({ path: '/board/programId', code: 'breadboard-program', message: 'Choose an Arduino button lesson with a press-to-light goal.' })
  }
  if (level.board.carryFrom) {
    const source = catalog.find(candidate => candidate.id === level.board.carryFrom)
    if (source?.kind !== 'breadboard' || source.board.mode !== 'series' || source.id === level.id) {
      issues.push({ path: '/board/carryFrom', code: 'breadboard-carry', message: 'Choose the series breadboard lesson that supplies this board.' })
    }
  }
  return issues
}
