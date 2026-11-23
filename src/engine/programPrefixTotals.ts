import { programSourceLines, type CollectionBattery } from '../shared/programWalkthrough'
import type { Json, RunIssue } from '../shared/types'
import { ProgramError, PythonProgram, type PythonTraceFrame } from './python'
import { bare, MAX_COLLECTION, Values, valuesEqual } from './values'

const BATTERY_TOTALS = 'battery_totals'

export type PrefixTotalsStep = {
  kind: 'direct' | 'zero' | 'prefix' | 'included' | 'before' | 'subtract' | 'return'
  line: number
  code: string
  direct: number
  prefix: number[]
  index?: number
  value?: number
}

type PrefixTotalsResult = { direct: number; prefix: number[]; total: number }
type PrefixTotalsRun = { steps: PrefixTotalsStep[]; result?: PrefixTotalsResult; issue?: RunIssue }

function isInteger(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function numberList(value: Json | undefined): number[] | undefined {
  if (Array.isArray(value) && value.every(isInteger)) return value
}

const resultAssignments = { included: 'included', before: 'before', segment: 'subtract' } as const

export function runPrefixTotals(source: string, batteries: readonly CollectionBattery[], left: number, right: number): PrefixTotalsRun {
  const steps: PrefixTotalsStep[] = []
  if (batteries.length >= MAX_COLLECTION) return { steps, issue: { code: 'limit' } }
  const charges = batteries.map(({ charge }) => charge)
  if (!isInteger(left) || !isInteger(right) || left < 0 || left > right || right >= charges.length
    || charges.some(charge => !isInteger(charge) || charge < 0)) {
    return { steps, issue: { code: 'type', detail: BATTERY_TOTALS } }
  }

  const lines = programSourceLines(source)
  const plan: PrefixTotalsStep['kind'][] = [
    ...charges.slice(left, right + 1).map(() => 'direct' as const), 'zero',
    ...charges.map(() => 'prefix' as const), 'included', 'before', 'subtract', 'return',
  ]
  let result: PrefixTotalsResult | undefined

  function add(step: PrefixTotalsStep) {
    if (step.kind !== plan[steps.length]) throw new ProgramError({ code: 'internal', line: step.line })
    steps.push(step)
  }

  function trace(frame: PythonTraceFrame) {
    if (frame.line === undefined) return
    const code = lines[frame.line - 1]
    if (code === undefined) return
    const location = { line: frame.line, code }

    if (frame.kind === 'return' && frame.name === BATTERY_TOTALS) {
      if (!Array.isArray(frame.value) || frame.value.length !== 3) return
      const [direct, table, total] = frame.value
      const prefix = numberList(table)
      const previous = steps.at(-1)
      if (!isInteger(direct) || !isInteger(total) || !prefix || previous?.kind !== 'subtract'
        || direct !== previous.direct || total !== previous.value || !valuesEqual(prefix, previous.prefix)) return
      add({ ...location, kind: 'return', direct, prefix, value: total })
      result = { direct, prefix, total }
      return
    }

    if (frame.kind !== 'assign' && frame.kind !== 'append') return
    const scope = frame.stack.at(-1)
    if (scope?.name !== BATTERY_TOTALS) return
    const read = (name: string) => scope.values.find(binding => binding.name === name)?.value
    const direct = read('direct')
    const prefix = numberList(read('prefix')) ?? []
    if (!isInteger(direct)) return
    const state = { ...location, direct, prefix }

    if (frame.kind === 'assign' && frame.name === 'direct') {
      const index = read('index')
      if (index === undefined) return
      if (index !== left + steps.length) throw new ProgramError({ code: 'internal', line: frame.line })
      add({ ...state, kind: 'direct', index, value: direct })
    } else if (frame.kind === 'assign' && frame.name === 'prefix' && prefix.length === 1 && prefix[0] === 0) {
      add({ ...state, kind: 'zero', value: 0 })
    } else if (frame.kind === 'append' && frame.name === 'prefix' && isInteger(frame.value)) {
      add({ ...state, kind: 'prefix', index: prefix.length - 2, value: frame.value })
    } else if (frame.kind === 'assign' && (frame.name === 'included' || frame.name === 'before' || frame.name === 'segment')
      && isInteger(frame.value)) {
      const throughRight = prefix[right + 1]
      const beforeLeft = prefix[left]
      const expected = frame.name === 'included' ? throughRight : frame.name === 'before' ? beforeLeft : throughRight - beforeLeft
      if (frame.value !== expected || (frame.name === 'segment' && frame.value !== direct)) {
        throw new ProgramError({ code: 'internal', line: frame.line })
      }
      add({ ...state, kind: resultAssignments[frame.name], value: frame.value })
    }
  }

  try {
    const values = new Values()
    const python = new PythonProgram(lines.join('\n'), values, (name, _args, line) => {
      throw new ProgramError({ code: 'apiDisabled', line, detail: name })
    }, { stepBudget: 6_400, trace, traceForLoops: true })
    python.runPureFunction(BATTERY_TOTALS, [values.list(charges.map(bare)), bare(left), bare(right)])
    return result ? { steps, result } : { steps, issue: { code: 'internal' } }
  } catch (error) {
    return { steps, issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
  }
}
