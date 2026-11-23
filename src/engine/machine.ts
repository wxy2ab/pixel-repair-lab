import type { MachineFrame, MachineInstruction, MachineLevel, MachineOp, MachineResult, MachineState } from '../shared/hardware'
import type { RunIssue } from '../shared/types'
import { executeCpuInstruction } from './cpu'

const MAX_SOURCE_LENGTH = 12_000
const MAX_INSTRUCTIONS = 32
const opcodes = new Set<MachineOp>(['LOAD', 'ADD', 'SUB', 'STORE', 'HALT'])

type SourceInstruction = { instruction: MachineInstruction; line: number }
type ParseResult = { program: SourceInstruction[] } | { issue: RunIssue }

function parseMachineSource(source: string, allowedOps: MachineOp[]): ParseResult {
  if (source.length > MAX_SOURCE_LENGTH) return { issue: { code: 'limit' } }
  const program: SourceInstruction[] = []
  for (const [index, raw] of source.split(/\r\n?|\n/).entries()) {
    const beforeComment = raw.split('#', 1)[0].trim()
    if (!beforeComment) continue
    const line = index + 1
    if (program.length >= MAX_INSTRUCTIONS) return { issue: { code: 'limit', line } }
    const [word, addressText, extra] = beforeComment.split(/\s+/)
    const op = word.toUpperCase() as MachineOp
    if (!opcodes.has(op)) return { issue: { code: 'cpuOpcode', line, detail: word.slice(0, 40) } }
    if (!allowedOps.includes(op)) return { issue: { code: 'cpuDisabled', line, detail: op } }
    if (op === 'HALT') {
      if (addressText !== undefined) return { issue: { code: 'cpuSyntax', line, detail: op } }
      program.push({ instruction: { op }, line })
      continue
    }
    const address = Number(addressText)
    if (!addressText || !/^[+-]?[0-9]+$/.test(addressText) || !Number.isSafeInteger(address) || extra !== undefined) {
      return { issue: { code: 'cpuSyntax', line, detail: op } }
    }
    program.push({ instruction: { op, address }, line })
  }
  return { program }
}

export function runMachine(level: Pick<MachineLevel, 'allowedOps' | 'cases'>, source: string, index: number): MachineResult {
  const selected = Number.isInteger(index) && index >= 0 ? level.cases[index] : undefined
  const base = selected ?? level.cases[0]
  const initial: MachineState = { memory: [...(base?.memory ?? [])], accumulator: base?.accumulator ?? 0, pc: 0, steps: 0, halted: false }
  const frames: MachineFrame[] = []
  let state = initial

  const finish = (issue?: RunIssue): MachineResult => ({
    won: !issue, initial, frames, final: { ...state, memory: [...state.memory] }, issue,
  })

  if (!selected) return finish({ code: 'cpuScenario' })
  const parsed = parseMachineSource(source, level.allowedOps)
  if ('issue' in parsed) return finish(parsed.issue)
  for (const { instruction, line } of parsed.program) {
    const transition = executeCpuInstruction(state, instruction)
    if ('issue' in transition) return finish({ ...transition.issue, line })
    state = { ...transition.state, steps: state.steps + 1 }
    frames.push({ state, line, instruction })
    if (state.halted) break
  }
  if (!state.halted) return finish({ code: 'cpuMissingHalt', line: frames.at(-1)?.line })

  const goal = selected.goal
  if (goal?.accumulator !== undefined && goal.accumulator !== state.accumulator) {
    return finish({ code: 'unfinished', detail: 'ACC' })
  }
  for (const target of goal?.memory ?? []) {
    if (state.memory[target.address] !== target.value) return finish({ code: 'unfinished', detail: String(target.address) })
  }
  return finish()
}
