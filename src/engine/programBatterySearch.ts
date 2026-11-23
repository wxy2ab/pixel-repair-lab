import type { BatterySearchMethod, CollectionBattery } from '../shared/programWalkthrough'
import { programSourceLines } from '../shared/programWalkthrough'
import type { Json, RunIssue } from '../shared/types'
import { ProgramError, PythonProgram, type PythonTraceFrame } from './python'
import { bare, MAX_COLLECTION, plain, Values } from './values'

const MAX_TRACE_STEPS = MAX_COLLECTION * 3 + 1
const SEARCH_FUNCTION = 'find_battery'

type SearchResult = { index: number; comparisons: number }

export type BatterySearchStep = {
  kind: 'select' | 'compare' | 'narrow' | 'return'
  line: number
  code: string
  index?: number
  charge?: number
  comparisons: number
  first: number
  last: number
  match?: boolean
}

type SearchRun = { steps: BatterySearchStep[]; result?: SearchResult; issue?: RunIssue }

function isInteger(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function searchResult(value: Json | undefined, size: number): SearchResult | undefined {
  if (!Array.isArray(value) || value.length !== 2) return
  const [index, comparisons] = value
  if (isInteger(index) && index >= -1 && index < size && isInteger(comparisons) && comparisons >= 0 && comparisons <= size) {
    return { index, comparisons }
  }
}

export function runBatterySearch(method: BatterySearchMethod, source: string, batteries: readonly CollectionBattery[], target: number): SearchRun {
  const steps: BatterySearchStep[] = []
  if (batteries.length > MAX_COLLECTION) return { steps, issue: { code: 'limit' } }
  const charges = batteries.map(battery => battery.charge)
  if (!isInteger(target) || !charges.every(isInteger)) return { steps, issue: { code: 'type' } }

  const lines = programSourceLines(source)
  const binary = method === 'binary'
  const size = charges.length

  function trace(frame: PythonTraceFrame) {
    if (!frame.line) return
    const code = lines[frame.line - 1]
    if (code === undefined) return
    if (steps.length >= MAX_TRACE_STEPS) throw new ProgramError({ code: 'limit', line: frame.line })
    const location = { line: frame.line, code }
    const previous = steps.at(-1)
    if (frame.kind === 'return' && frame.name === SEARCH_FUNCTION) {
      const result = searchResult(frame.value, size)
      if (!result) return
      const index = result.index < 0 ? undefined : result.index
      steps.push({ ...location, kind: 'return', index, charge: index === undefined ? undefined : charges[index],
        comparisons: result.comparisons, first: previous?.first ?? 0, last: previous?.last ?? size - 1 })
      return
    }

    if (frame.kind !== 'assign' && frame.kind !== 'iterate') return
    const scope = frame.stack.at(-1)
    if (scope?.name !== SEARCH_FUNCTION) return
    const read = (name: string) => scope.values.find(binding => binding.name === name)?.value
    const comparisons = read('comparisons')
    const index = read(binary ? 'middle' : 'index')
    const first = binary ? read('first') : index
    const last = binary ? read('last') : size - 1
    if (!isInteger(comparisons) || !isInteger(index) || index < 0 || index >= size || !isInteger(first) || !isInteger(last)) return
    const position = { ...location, index, comparisons, first, last }

    const selecting = binary ? frame.kind === 'assign' && frame.name === 'middle' : frame.kind === 'iterate' && frame.name === 'index'
    if (selecting) {
      steps.push({ ...position, kind: 'select', charge: charges[index] })
    } else if (frame.kind === 'assign' && frame.name === 'matches' && typeof frame.value === 'boolean' && previous?.kind === 'select') {
      const charge = read('charge')
      if (!isInteger(charge)) return
      steps.push({ ...position, kind: 'compare', charge, match: frame.value,
        first: !binary && !frame.value ? index + 1 : first })
    } else if (binary && frame.kind === 'assign' && (frame.name === 'first' || frame.name === 'last') && previous?.kind === 'compare') {
      steps.push({ ...position, kind: 'narrow', charge: previous.charge, match: previous.match })
    }
  }

  try {
    const values = new Values()
    const python = new PythonProgram(lines.join('\n'), values, (name, _args, line) => {
      throw new ProgramError({ code: 'apiDisabled', line, detail: name })
    }, { stepBudget: 6400, trace, traceForLoops: !binary })
    const result = searchResult(plain(python.runPureFunction(SEARCH_FUNCTION, [values.list(charges.map(bare)), bare(target)])), size)
    if (!result || steps.at(-1)?.kind !== 'return' || steps.filter(step => step.kind === 'compare').length !== result.comparisons) {
      return { steps, issue: { code: 'internal' } }
    }
    return { steps, result }
  } catch (error) {
    return { steps, issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
  }
}
