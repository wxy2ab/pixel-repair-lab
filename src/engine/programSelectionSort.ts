import { programSourceLines, type CollectionBattery, type SelectionSortResult } from '../shared/programWalkthrough'
import type { Json, RunIssue } from '../shared/types'
import { ProgramError, PythonProgram, type PythonTraceFrame } from './python'
import { plain, Values } from './values'

const MAX_BATTERIES = 7
const MAX_TRACE_STEPS = 96
const SORT_FUNCTION = 'sort_batteries'

type SwapFrame = { line: number; code: string; row: CollectionBattery[]; held: CollectionBattery }

export type SelectionSortStep = {
  kind: 'candidate' | 'compare' | 'minimum' | 'select' | 'swap' | 'fix' | 'return'
  line: number
  code: string
  row: CollectionBattery[]
  sorted: number
  start?: number
  candidate?: number
  index?: number
  smaller?: boolean
  selected: string[]
  swapFrames?: SwapFrame[]
}

type SelectionSortRun = { steps: SelectionSortStep[]; result?: SelectionSortResult; issue?: RunIssue }

function isInteger(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function runSelectionSort(source: string, batteries: readonly CollectionBattery[]): SelectionSortRun {
  const steps: SelectionSortStep[] = []
  const size = batteries.length
  if (size > MAX_BATTERIES) return { steps, issue: { code: 'limit' } }
  const charges = new Map(batteries.map(({ name, charge }) => [name, charge]))
  if (charges.size !== size || batteries.some(({ name, charge }) => !name || !Number.isSafeInteger(charge) || charge < 0)) {
    return { steps, issue: { code: 'type' } }
  }

  const lines = programSourceLines(source)
  let swapFrames: SwapFrame[] = []
  function readNames(value: Json | undefined): string[] | undefined {
    if (Array.isArray(value) && value.every(name => typeof name === 'string' && charges.has(name))
      && new Set(value).size === value.length) return value as string[]
  }
  function readSlots(value: Json | undefined): CollectionBattery[] | undefined {
    if (!Array.isArray(value) || value.length !== size) return
    const row: CollectionBattery[] = []
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string'
        || typeof entry[1] !== 'number' || charges.get(entry[0]) !== entry[1]) return
      row.push({ name: entry[0], charge: entry[1] })
    }
    return row
  }
  function readRow(value: Json | undefined): CollectionBattery[] | undefined {
    const row = readSlots(value)
    if (row && new Set(row.map(battery => battery.name)).size === size) return row
  }
  function readReturn(value: Json | undefined) {
    if (!Array.isArray(value) || value.length !== 2) return
    const [names, batteries] = value
    const selected = readNames(names)
    const row = readRow(batteries)
    if (selected?.length === Math.max(0, size - 1) && row) return { selected, row }
  }

  function trace(frame: PythonTraceFrame) {
    if (!frame.line) return
    const code = lines[frame.line - 1]
    if (code === undefined) return
    if (steps.length >= MAX_TRACE_STEPS) throw new ProgramError({ code: 'limit', line: frame.line })
    const location = { line: frame.line, code }
    const previous = steps.at(-1)
    if (frame.kind === 'return' && frame.name === SORT_FUNCTION) {
      const result = readReturn(frame.value)
      if (result) steps.push({ ...location, ...result, kind: 'return', sorted: previous?.sorted ?? 0 })
      return
    }

    if (frame.kind !== 'assign' && frame.kind !== 'append') return
    const scope = frame.stack.at(-1)
    if (scope?.name !== SORT_FUNCTION) return
    const read = (name: string) => scope.values.find(binding => binding.name === name)?.value
    const sorted = read('settled')
    const selected = readNames(read('selected'))
    if (!isInteger(sorted) || sorted < 0 || sorted > size || !selected) return

    const name = frame.name
    const storing = frame.kind === 'assign'
    if (storing && name === 'held') swapFrames = []
    if (storing && (name === 'held' || (name?.startsWith('row[') && swapFrames.length > 0))) {
      // During the first write the minimum temporarily appears in two slots.
      const cells = readSlots(read('row'))
      const held = read('held')
      if (cells && Array.isArray(held) && typeof held[0] === 'string' && typeof held[1] === 'number' && charges.get(held[0]) === held[1]) {
        swapFrames.push({ ...location, row: cells, held: { name: held[0], charge: held[1] } })
      }
    }

    const row = readRow(read('row'))
    if (!row) return
    const state = { ...location, row, sorted, selected }
    if (frame.kind === 'assign' && name === 'settled' && sorted > (previous?.sorted ?? 0)) {
      steps.push({ ...state, kind: 'fix', start: sorted - 1 })
      return
    }

    const start = read('start')
    const candidate = read('min_index')
    if (!isInteger(start) || !isInteger(candidate) || start < sorted || candidate < start || candidate >= size) return
    const round = { ...state, start, candidate }
    if (frame.kind === 'assign' && name === 'min_index') {
      if (previous?.kind === 'compare') steps.push({ ...round, kind: 'minimum', index: candidate })
      else {
        swapFrames = []
        steps.push({ ...round, kind: 'candidate' })
      }
    } else if (frame.kind === 'assign' && name === 'smaller' && typeof frame.value === 'boolean') {
      const index = read('index')
      if (isInteger(index) && index > start && index < size) {
        steps.push({ ...round, kind: 'compare', index, smaller: frame.value })
      }
    } else if (frame.kind === 'append' && name === 'selected') {
      steps.push({ ...round, kind: 'select' })
    } else if (storing && name?.startsWith('row[') && swapFrames.length === 3) {
      steps.push({ ...round, kind: 'swap', line: swapFrames[0].line, code: swapFrames.map(entry => entry.code).join('\n'), swapFrames })
      swapFrames = []
    }
  }

  try {
    const values = new Values()
    const python = new PythonProgram(lines.join('\n'), values, (name, _args, line) => {
      throw new ProgramError({ code: 'apiDisabled', line, detail: name })
    }, { stepBudget: 6_400, trace, traceForLoops: true })
    const input = values.fromJson(batteries.map(({ name, charge }) => [name, charge]))
    const result = readReturn(plain(python.runPureFunction(SORT_FUNCTION, [input])))
    const count = (kind: SelectionSortStep['kind']) => steps.filter(step => step.kind === kind).length
    if (!result || steps.at(-1)?.kind !== 'return' || steps.at(-1)?.sorted !== size
      || count('candidate') !== result.selected.length || count('select') !== result.selected.length
      || count('compare') !== size * (size - 1) / 2 || count('fix') !== size) {
      return { steps, issue: { code: 'internal' } }
    }
    return { steps, result: { selected: result.selected, order: result.row.map(battery => battery.name) } }
  } catch (error) {
    return { steps, issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
  }
}
