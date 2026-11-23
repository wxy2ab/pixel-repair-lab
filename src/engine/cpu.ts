import type { MachineInstruction, MachineState } from '../shared/hardware'
import type { RunIssue } from '../shared/types'

type CpuState = Omit<MachineState, 'steps'>
type CpuTransition = { state: CpuState } | { issue: RunIssue }

export function isMemoryAddress(address: unknown, memory: readonly number[]): address is number {
  return typeof address === 'number' && Number.isSafeInteger(address) && address >= 0 && address < memory.length
}

export function executeCpuInstruction(state: CpuState, instruction: MachineInstruction): CpuTransition {
  if (state.halted) return { issue: { code: 'cpuHalted' } }
  const { op } = instruction
  const next: CpuState = {
    accumulator: state.accumulator,
    pc: state.pc + 1,
    memory: [...state.memory],
    halted: op === 'HALT',
  }
  if (op === 'HALT') return { state: next }

  const { address } = instruction
  if (!isMemoryAddress(address, state.memory)) return { issue: { code: 'memoryAddress', detail: String(address) } }
  const value = state.memory[address]
  switch (op) {
    case 'LOAD':
      next.accumulator = value
      break
    case 'ADD':
      next.accumulator += value
      break
    case 'SUB':
      next.accumulator -= value
      break
    case 'STORE':
      next.memory[address] = next.accumulator
      break
  }
  if (!Number.isSafeInteger(next.accumulator)) return { issue: { code: 'limit' } }
  return { state: next }
}
