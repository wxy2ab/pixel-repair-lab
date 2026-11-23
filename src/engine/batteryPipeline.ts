import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import {
  batteryPipelineHelpers, isBatteryTotal, readBatteryPair, readBatteryPipelineCase, readBatteryPipelineResult, readBatteryTotals,
  type BatteryPipelineHelper, type BatteryPipelineResult,
} from '../shared/batteryPipeline'
import { programSourceLines } from '../shared/programWalkthrough'
import type { RunIssue } from '../shared/types'
import { traceAlgorithmCase } from './algorithms'

type PipelineModule = 'algorithms' | 'my_algorithms'

export type BatteryPipelineStep = {
  kind: 'sort' | 'pairCheck' | 'move' | 'pair' | 'prefix' | 'total' | 'return'
  line: number
  code: string
  ordered?: number[]
  pair?: number[]
  prefix?: number[]
  total?: number
  left?: number
  right?: number
  move?: 'left' | 'right'
  matched?: boolean
  module?: PipelineModule
}

type BatteryPipelineRun = {
  passed: boolean
  steps: BatteryPipelineStep[]
  result?: BatteryPipelineResult
  issue?: RunIssue
}

export function runBatteryPipelineTrial(level: AlgorithmLevel, source: string, index: number,
  personal: PersonalAlgorithms = {}, course: PersonalAlgorithms = {}): BatteryPipelineRun {
  const sample = readBatteryPipelineCase(level.cases[index])
  const steps: BatteryPipelineStep[] = []
  if (!sample) return { passed: false, steps, issue: { code: 'internal' } }

  const lines = programSourceLines(source)
  const modules = new Map<BatteryPipelineHelper, PipelineModule>()
  const { actual, passed, issue } = traceAlgorithmCase(level, source, index, personal, course, frame => {
    if (frame.kind === 'return') {
      const helper = batteryPipelineHelpers.find(name => name === frame.name)
      if (helper && frame.sourceName === `algorithms.${helper}.py`) modules.set(helper, 'algorithms')
      if (helper && frame.sourceName === `my_algorithms.${helper}.py`) modules.set(helper, 'my_algorithms')
    }
    if (frame.sourceName !== 'main.py' || frame.line === undefined) return
    const code = lines[frame.line - 1]
    if (code === undefined) return
    const location = { line: frame.line, code }
    const previous = steps.at(-1)

    if (frame.kind === 'return' && frame.name === level.functionName) {
      const result = readBatteryPipelineResult(frame.value)
      if (result) steps.push({
        ...location, kind: 'return', ...result, prefix: previous?.prefix, left: sample.left, right: sample.right,
      })
      return
    }
    if (frame.kind !== 'assign') return
    const scope = frame.stack.at(-1)
    const read = (name: string) => scope?.values.find(binding => binding.name === name)?.value
    const ordered = readBatteryTotals(read('ordered'))
    if (!ordered || ordered.length !== sample.values.length) return

    const pair = readBatteryPair(read('pair'))
    const { name } = frame
    if (scope?.name === level.functionName) {
      if (name === 'ordered') {
        steps.push({ ...location, kind: 'sort', ordered, module: modules.get('sort_ascending') })
      } else if (name === 'pair' && pair) {
        steps.push({ ...location, kind: 'pair', ordered, pair, module: modules.get('sorted_has_pair') })
      } else if (name === 'prefix' || name === 'total') {
        const prefix = readBatteryTotals(read('prefix'))
        if (!prefix || prefix.length !== ordered.length + 1) return
        if (name === 'prefix') {
          steps.push({ ...location, kind: 'prefix', ordered, pair, prefix, module: modules.get('prefix_totals') })
        } else if (isBatteryTotal(frame.value)) {
          steps.push({ ...location, kind: 'total', ordered, pair, prefix, total: frame.value, left: sample.left, right: sample.right })
        }
      }
      return
    }
    if (scope?.name !== 'find_battery_pair') return

    const left = read('left')
    const right = read('right')
    if (!isBatteryTotal(left) || !isBatteryTotal(right) || left >= ordered.length || right >= ordered.length) return
    if (name === 'matched' && typeof frame.value === 'boolean' && pair?.length === 2 && left < right) {
      steps.push({
        ...location, kind: 'pairCheck', ordered, pair, left, right, matched: frame.value, module: modules.get('sorted_has_pair'),
      })
    } else if (previous?.kind === 'pairCheck' && (name === 'left' || name === 'right')) {
      steps.push({ ...location, kind: 'move', ordered, left, right, move: name })
    }
  })

  const result = readBatteryPipelineResult(actual)
  const completed = steps.filter(step => step.kind !== 'move' && step.kind !== 'pairCheck').map(step => step.kind).join(' ')
    === 'sort pair prefix total return'
    && modules.has('sort_ascending') && modules.has('prefix_totals')
    && (sample.values.length < 2 || steps.some(step => step.kind === 'pairCheck' && step.module))
  return {
    passed: passed && completed,
    steps,
    result,
    issue: issue ?? (passed && !completed ? { code: 'internal' } : undefined),
  }
}
