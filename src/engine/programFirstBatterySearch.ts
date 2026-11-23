import { programSourceLines, type BatterySearchRange, type CollectionBattery } from '../shared/programWalkthrough'
import type { Json, RunIssue } from '../shared/types'
import { ProgramError, PythonProgram, type PythonTraceFrame } from './python'
import { bare, MAX_COLLECTION, Values } from './values'

const FIRST_SEARCH_FUNCTION = 'find_first_battery'

export type FirstBatterySearchStep = {
  kind: 'select' | 'compare' | 'remember' | 'narrow' | 'return'
  line: number
  code: string
  index?: number
  charge?: number
  first: number
  last: number
  match?: boolean
  saved?: number
}

type FirstBatterySearchResult = { index: number; ranges: BatterySearchRange[] }
type FirstBatterySearchRun = { steps: FirstBatterySearchStep[]; result?: FirstBatterySearchResult; issue?: RunIssue }

function isInteger(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function runFirstBatterySearch(source: string, batteries: readonly CollectionBattery[], target: number): FirstBatterySearchRun {
  const steps: FirstBatterySearchStep[] = []
  if (batteries.length > MAX_COLLECTION) return { steps, issue: { code: 'limit' } }
  const charges = batteries.map(battery => battery.charge)
  if (!isInteger(target) || target < 0 || charges.some((charge, index) =>
    !isInteger(charge) || charge < 0 || (index > 0 && charge < charges[index - 1]))) {
    return { steps, issue: { code: 'type', detail: FIRST_SEARCH_FUNCTION } }
  }

  const lines = programSourceLines(source)
  const ranges: BatterySearchRange[] = []
  let result: FirstBatterySearchResult | undefined

  function trace(frame: PythonTraceFrame) {
    if (frame.line === undefined) return
    const code = lines[frame.line - 1]
    if (code === undefined) return
    const location = { line: frame.line, code }
    const previous = steps.at(-1)

    if (frame.kind === 'return' && frame.name === FIRST_SEARCH_FUNCTION) {
      const first = previous?.first ?? 0
      const last = previous?.last ?? charges.length - 1
      const saved = previous?.saved
      const index = frame.value
      if (first > last && isInteger(index) && index === (saved ?? -1)) {
        const match = index >= 0
        steps.push({ ...location, kind: 'return', first, last, saved, match,
          index: match ? index : undefined, charge: match ? charges[index] : undefined })
        result = { index, ranges }
      }
      return
    }

    if (frame.kind !== 'assign') return
    const scope = frame.stack.at(-1)
    if (scope?.name !== FIRST_SEARCH_FUNCTION) return
    const read = (name: string) => scope.values.find(binding => binding.name === name)?.value
    const first = read('first')
    const last = read('last')
    const index = read('middle')
    const found = read('found')
    if (!isInteger(first) || !isInteger(last) || !isInteger(index) || !isInteger(found)) return
    const saved = found >= 0 ? found : undefined
    const charge = charges[index]
    const state = { ...location, first, last, index, saved, charge }
    const invalidTrace = () => new ProgramError({ code: 'internal', line: frame.line })

    switch (frame.name) {
      case 'middle':
        if ((previous && previous.kind !== 'narrow') || first > last || charge === undefined
          || first !== (previous?.first ?? 0) || last !== (previous?.last ?? charges.length - 1)
          || index !== Math.floor((first + last) / 2) || saved !== previous?.saved) throw invalidTrace()
        steps.push({ ...state, kind: 'select' })
        break
      case 'matches':
        if (previous?.kind !== 'select' || previous.index !== index || read('charge') !== charge
          || frame.value !== (charge === target)) throw invalidTrace()
        steps.push({ ...state, kind: 'compare', match: frame.value })
        break
      case 'found':
        if (previous?.kind !== 'compare' || !previous.match || saved !== index) throw invalidTrace()
        steps.push({ ...state, kind: 'remember', match: true })
        break
      case 'first':
      case 'last': {
        const moveRight = charge < target
        if (previous?.kind !== (charge === target ? 'remember' : 'compare') || previous.index !== index
          || (moveRight
            ? frame.name !== 'first' || first !== index + 1 || last !== previous.last
            : frame.name !== 'last' || last !== index - 1 || first !== previous.first)) throw invalidTrace()
        ranges.push([first, last])
        steps.push({ ...state, kind: 'narrow', match: charge === target })
        break
      }
    }
  }

  try {
    const values = new Values()
    const python = new PythonProgram(lines.join('\n'), values, (name, _args, line) => {
      throw new ProgramError({ code: 'apiDisabled', line, detail: name })
    }, { stepBudget: 6_400, trace })
    python.runPureFunction(FIRST_SEARCH_FUNCTION, [values.list(charges.map(bare)), bare(target)])
    return result ? { steps, result } : { steps, issue: { code: 'internal' } }
  } catch (error) {
    return { steps, issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
  }
}
