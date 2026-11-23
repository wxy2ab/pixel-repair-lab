import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import { isDispatchCharge, isDispatchName, readDispatchNames, readDispatchRecords, readDispatchResult, type DispatchResult } from '../shared/batteryDispatch'
import type { CollectionBattery } from '../shared/programWalkthrough'
import type { Json, RunIssue } from '../shared/types'
import { traceAlgorithmCase } from './algorithms'
import { ProgramError } from './python'

const MAX_DISPATCH_STEPS = 120

type DispatchState = {
  queue: string[]
  stack: CollectionBattery[]
  records: Record<string, number>
  order: string[]
}

export type DispatchStep = DispatchState & {
  line: number
  code: string
  kind: 'enqueue' | 'queueTake' | 'stackAdd' | 'stackTake' | 'update' | 'record' | 'return'
  battery?: string
}

type DispatchTrial = {
  passed: boolean
  issue?: RunIssue
  steps: DispatchStep[]
  result?: DispatchResult
}

function readBattery(value: Json | undefined): CollectionBattery | undefined {
  if (Array.isArray(value) && value.length === 2 && isDispatchName(value[0]) && isDispatchCharge(value[1])) {
    return { name: value[0], charge: value[1] }
  }
}

function readStack(value: Json | undefined): CollectionBattery[] | undefined {
  if (Array.isArray(value)) {
    const batteries = value.map(readBattery)
    if (batteries.every(battery => battery !== undefined)) return batteries
  }
}

export function runBatteryDispatchTrial(level: AlgorithmLevel, source: string, caseIndex: number,
  personal: PersonalAlgorithms = {}, course: PersonalAlgorithms = {}): DispatchTrial {
  const lines = source.split(/\r\n?|\n/u)
  const steps: DispatchStep[] = []
  const { passed, actual, issue } = traceAlgorithmCase(level, source, caseIndex, personal, course, frame => {
    if (frame.sourceName !== 'main.py' || frame.line === undefined) return
    if (steps.length >= MAX_DISPATCH_STEPS) throw new ProgramError({ code: 'limit', line: frame.line })
    const code = lines[frame.line - 1]
    if (code === undefined) return
    const location = { line: frame.line, code }
    const previous = steps.at(-1)
    if (frame.kind === 'return' && frame.name === level.functionName) {
      const result = readDispatchResult(frame.value)
      if (result && previous) steps.push({ ...previous, ...location, ...result, kind: 'return', battery: undefined })
      return
    }
    if (frame.kind !== 'append' && frame.kind !== 'assign') return
    const scope = frame.stack.at(-1)
    if (scope?.name !== level.functionName) return
    const read = (name: string) => scope.values.find(binding => binding.name === name)?.value
    const queue = readDispatchNames(read('queue'))
    const stack = readStack(read('temporary'))
    const records = readDispatchRecords(read('current'))
    const order = readDispatchNames(read('taken'))
    if (!queue || !stack || !records || !order) return
    const state = { ...location, queue, stack, records, order }
    if (frame.kind === 'append') {
      if (frame.name === 'queue' && isDispatchName(frame.value)) {
        steps.push({ ...state, kind: 'enqueue', battery: frame.value })
      } else if (frame.name === 'temporary') {
        const battery = readBattery(frame.value)
        if (battery) steps.push({ ...state, kind: 'stackAdd', battery: battery.name })
      } else if (frame.name === 'taken' && isDispatchName(frame.value)) {
        steps.push({ ...state, kind: 'record', battery: frame.value })
      }
    } else if (frame.name === 'name' && isDispatchName(frame.value) && (previous?.queue.length ?? 0) > queue.length) {
      steps.push({ ...state, kind: 'queueTake', battery: frame.value })
    } else if (frame.name === 'battery' && (previous?.stack.length ?? 0) > stack.length) {
      const battery = readBattery(frame.value)
      if (battery) steps.push({ ...state, kind: 'stackTake', battery: battery.name })
    } else if (frame.name?.startsWith('current[') && previous?.kind === 'stackTake') {
      steps.push({ ...state, kind: 'update', battery: previous.battery })
    }
  })
  return { passed, issue, steps, result: readDispatchResult(actual) }
}
