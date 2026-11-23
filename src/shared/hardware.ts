import type { LevelMetadata, Localized, RunIssue } from './types'

export type Bit = 0 | 1
export type Gate = 'AND' | 'OR' | 'NOT' | 'XOR'
export type ComponentCircuitMode = 'diode' | 'transistor'
export type CircuitInput = { bits: Bit[]; gate?: Gate }
export type CircuitLectureConfig = {
  kind: 'circuit'
  mode: 'binary' | 'logic'
  frames: (CircuitInput & { bitIndex?: number })[]
}
export type CpuLectureConfig = {
  kind: 'cpu'
  source: string
  memory: number[]
  accumulator?: number
  checkpoints: { pc: number; phase: 'fetch' | 'decode' | 'execute' }[]
}
export type CircuitGoal = {
  value?: number; output?: Bit; gate?: Gate
  switchClosed?: Bit; diodeForward?: Bit; baseHigh?: Bit
}
export type CircuitCase = CircuitInput & {
  label: Localized
  goal?: CircuitGoal
  solution?: CircuitInput
}
export type CircuitLevel = LevelMetadata & {
  kind: 'circuit'
  mode: 'binary' | 'logic' | 'combined' | ComponentCircuitMode
  gateChoices?: Gate[]
  cases: CircuitCase[]
}

export type MachineOp = 'LOAD' | 'ADD' | 'SUB' | 'STORE' | 'HALT'
export type MachineInstruction = { op: Exclude<MachineOp, 'HALT'>; address: number } | { op: 'HALT' }
export type MachineGoal = { accumulator?: number; memory?: { address: number; value: number }[] }
export type MachineCase = {
  label: Localized
  memory: number[]
  accumulator?: number
  goal?: MachineGoal
}
export type MachineLevel = LevelMetadata & {
  kind: 'machine'
  allowedOps: MachineOp[]
  starterCode: string
  solutionCode?: string
  cases: MachineCase[]
}
export type MachineState = {
  memory: number[]
  accumulator: number
  pc: number
  halted: boolean
  steps: number
}
export type MachineFrame = {
  state: MachineState
  line: number
  instruction: MachineInstruction
}
export type MachineResult = {
  won: boolean
  initial: MachineState
  frames: MachineFrame[]
  final: MachineState
  issue?: RunIssue
}

export type HardwareLevel = CircuitLevel | MachineLevel
