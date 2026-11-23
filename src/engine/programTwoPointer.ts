import { programSourceLines, type CollectionBattery, type TwoPointerMove, type TwoPointerResult } from '../shared/programWalkthrough'
import type { Json, RunIssue } from '../shared/types'
import { ProgramError, PythonProgram, type PythonTraceFrame } from './python'
import { bare, MAX_COLLECTION, Values } from './values'

const FIND_PAIR = 'find_pair'

export type TwoPointerStep = {
  kind: 'sum' | 'move' | 'return'
  line: number
  code: string
  left: number
  right: number
  total?: number
  move?: TwoPointerMove
}

type TwoPointerRun = { steps: TwoPointerStep[]; result?: TwoPointerResult; issue?: RunIssue }

function isInteger(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function runTwoPointer(source: string, batteries: readonly CollectionBattery[], target: number): TwoPointerRun {
  const steps: TwoPointerStep[] = []
  if (batteries.length > MAX_COLLECTION) return { steps, issue: { code: 'limit' } }
  const charges = batteries.map(({ charge }) => charge)
  if (!isInteger(target) || target < 0 || new Set(batteries.map(({ name }) => name)).size !== batteries.length
    || batteries.some(({ name }) => !name) || charges.some((charge, index) =>
      !isInteger(charge) || charge < 0 || (index > 0 && charge < charges[index - 1]))) {
    return { steps, issue: { code: 'type', detail: FIND_PAIR } }
  }

  const lines = programSourceLines(source)
  const moves: TwoPointerMove[] = []
  let left = 0
  let right = charges.length - 1
  let result: TwoPointerResult | undefined
  let branchHeader: string | undefined

  function withinBranch(code: string) {
    return branchHeader === undefined ? code : branchHeader + '\n' + code
  }

  function trace(frame: PythonTraceFrame) {
    if (frame.line === undefined) return
    const code = lines[frame.line - 1]
    if (code === undefined) return
    const location = { line: frame.line, code }
    const previous = steps.at(-1)
    const total = previous?.total

    if (frame.kind === 'return' && frame.name === FIND_PAIR) {
      const indexes = frame.value
      if (!Array.isArray(indexes)) return
      if (indexes.length === 0 && left >= right) {
        result = { moves, pair: null }
      } else if (indexes.length === 2 && indexes[0] === left && indexes[1] === right
        && previous?.kind === 'sum' && total === target) {
        result = { moves, pair: [batteries[left].name, batteries[right].name] }
      }
      if (result) steps.push({ ...location, code: withinBranch(code), kind: 'return', left, right, total })
      return
    }

    const scope = frame.stack.at(-1)
    if (scope?.name !== FIND_PAIR) return
    if (frame.kind === 'branch' && previous?.kind === 'sum') {
      branchHeader = code
      return
    }
    if (frame.kind !== 'assign') return
    const read = (name: string) => scope.values.find(binding => binding.name === name)?.value
    const actualLeft = read('left')
    const actualRight = read('right')
    const invalidTrace = () => new ProgramError({ code: 'internal', line: location.line })

    if (frame.name === 'total') {
      if (previous?.kind === 'sum' || left >= right || actualLeft !== left || actualRight !== right
        || !isInteger(frame.value) || frame.value !== charges[left] + charges[right]) throw invalidTrace()
      steps.push({ ...location, kind: 'sum', left, right, total: frame.value })
    } else if (previous?.kind === 'sum' && (frame.name === 'left' || frame.name === 'right')) {
      const move = frame.name
      const nextLeft = left + (move === 'left' ? 1 : 0)
      const nextRight = right - (move === 'right' ? 1 : 0)
      if (total === target || actualLeft !== nextLeft || actualRight !== nextRight) throw invalidTrace()
      left = nextLeft
      right = nextRight
      moves.push(move)
      steps.push({ ...location, code: withinBranch(code), kind: 'move', left, right, total, move })
      branchHeader = undefined
    }
  }

  try {
    const values = new Values()
    const python = new PythonProgram(lines.join('\n'), values, (name, _args, line) => {
      throw new ProgramError({ code: 'apiDisabled', line, detail: name })
    }, { stepBudget: 6_400, traceBranches: true, trace })
    python.runPureFunction(FIND_PAIR, [values.list(charges.map(bare)), bare(target)])
    return result ? { steps, result } : { steps, issue: { code: 'internal' } }
  } catch (error) {
    return { steps, issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
  }
}
