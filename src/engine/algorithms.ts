import type { AlgorithmLevel, AlgorithmResult, PersonalAlgorithms } from '../shared/advanced'
import { selectHelpers } from '../shared/courseHelpers'
import { isShortestRoute, readRouteMap } from '../shared/routeMap'
import { SHORTEST_STEP_SOURCE } from '../shared/shortestStepSource'
import { ProgramError, PythonProgram, type PythonModules, type PythonTraceFrame } from './python'
import { plain, Values, valuesEqual } from './values'
import { RackRecorder } from './rackRecorder'
import type { PythonFlowEvent, RackStep } from '../shared/types'

export { SHORTEST_STEP_SOURCE }

export function algorithmModules(personal?: PersonalAlgorithms, names: string[] = [], course?: PersonalAlgorithms): PythonModules {
  return { algorithms: { shortest_step: SHORTEST_STEP_SOURCE, ...selectHelpers(names, course) }, my_algorithms: personal }
}

function courseModules(helpers: string[], personal?: PersonalAlgorithms, course?: PersonalAlgorithms): PythonModules {
  return {
    algorithms: selectHelpers(helpers, course),
    my_algorithms: selectHelpers(helpers, personal),
  }
}

type AlgorithmCase = AlgorithmLevel['cases'][number]
type CheckedCase = AlgorithmResult['cases'][number]
export type AlgorithmDebugStep = RackStep & { flow?: PythonFlowEvent; invocation?: PythonFlowEvent }
export type AlgorithmDebugRun = { steps: AlgorithmDebugStep[]; outcome: CheckedCase; flowTruncated?: boolean }

function checkCase(level: AlgorithmLevel, source: string, { args, expected }: AlgorithmCase,
  modules: PythonModules, allowImports: boolean, trace?: (frame: PythonTraceFrame) => void,
  onLine?: (line: number, sourceName: string) => void, rack?: RackRecorder,
  observer?: { onFlow: (event: PythonFlowEvent) => void; onFlowTruncated: () => void }): CheckedCase {
  const values = new Values()
  try {
    const prepared = args.map(argument => values.fromJson(argument))
    const runner = new PythonProgram(source, values, (name, _args, line) => {
      throw new ProgramError({ code: 'unknownName', detail: name, line })
    }, { stepBudget: 36_000, modules, ...observer, ...(rack && { rack, traceModules: true }), ...(onLine && { onLine, traceModules: true }), ...(trace && {
      trace, traceModules: true, traceForLoops: true, traceWhileLoops: true, traceBranches: true,
    }) })
    const actual = plain(runner.runPureFunction(level.functionName, prepared, allowImports))
    if (level.pathGrading === 'shortest') {
      const map = readRouteMap(args)
      return { passed: !!map && isShortestRoute(map, actual), actual }
    }
    return { passed: valuesEqual(actual, expected), actual }
  } catch (error) {
    const issue = error instanceof ProgramError ? error.issue : { code: error instanceof RangeError ? 'limit' : 'internal' }
    return { passed: false, issue }
  }
}

export function traceAlgorithmCase(level: AlgorithmLevel, source: string, index: number,
  personal: PersonalAlgorithms, course: PersonalAlgorithms, trace: (frame: PythonTraceFrame) => void): CheckedCase {
  const sample = level.cases[index]
  if (!sample) return { passed: false, issue: { code: 'internal' } }
  const helpers = level.helpers ?? []
  return checkCase(level, source, sample, courseModules(helpers, personal, course), helpers.length > 0, trace)
}

export function runAlgorithm(level: AlgorithmLevel, source: string, personal?: PersonalAlgorithms, course?: PersonalAlgorithms): AlgorithmResult {
  const helpers = level.helpers ?? []
  const modules = courseModules(helpers, personal, course)
  const cases = level.cases.map(sample => checkCase(level, source, sample, modules, helpers.length > 0))
  const won = cases.every((result) => result.passed)
  return { won, cases, issue: cases.find((result) => result.issue)?.issue }
}

export function debugAlgorithmCase(level: AlgorithmLevel, source: string, index: number,
  personal?: PersonalAlgorithms, course?: PersonalAlgorithms, observeRack = false, observeFlow = false): AlgorithmDebugRun {
  const sample = level.cases[index]
  const rack = observeRack ? new RackRecorder() : undefined
  const steps: AlgorithmDebugStep[] = rack?.steps ?? []
  if (!sample) return { steps, outcome: { passed: false, issue: { code: 'internal' } } }
  const helpers = level.helpers ?? []
  let truncated = false
  const events = new Map<number, PythonFlowEvent[]>()
  const outcome = checkCase(level, source, sample, courseModules(helpers, personal, course), helpers.length > 0,
    undefined, rack ? undefined : (line, sourceName) => steps.push({ line, sourceName }), rack, observeFlow ? {
      onFlow(flow) {
        // The rack flushes a row after execution; the lightweight line cursor adds it on entry.
        const index = rack ? rack.steps.length : Math.max(0, steps.length - 1)
        const row = events.get(index)
        if (row) row.push(flow)
        else events.set(index, [flow])
      },
      onFlowTruncated() { truncated = true },
    } : undefined)
  rack?.finishLine()
  const last = steps.at(-1)
  if (outcome.issue?.line) {
    const { line, sourceName = last?.sourceName ?? 'main.py' } = outcome.issue
    if (last?.line !== line || last.sourceName !== sourceName) steps.push({ line, sourceName })
  }
  if (!events.size) return { steps, outcome }
  const playback = steps.flatMap((row, index) => {
    const pending = events.get(index)
    if (!pending) return [row]
    const corresponding = pending.some(event => event.line === row.line && event.sourceName === row.sourceName)
    const additions: AlgorithmDebugStep[] = pending.map(flow => ({
      ...row, line: flow.line, sourceName: flow.sourceName, flow,
    }))
    return corresponding ? additions : [row, ...additions]
  })
  const calls: PythonFlowEvent[] = []
  const lastFlow = playback.findLastIndex(step => step.flow)
  for (const [index, step] of playback.entries()) {
    if (truncated && index > lastFlow) break
    const flow = step.flow
    if (flow?.kind === 'call') calls.push(flow)
    if (calls.length) step.invocation = calls.at(-1)
    if (flow?.kind === 'return') calls.pop()
  }
  return { steps: playback, outcome, ...(truncated ? { flowTruncated: true } : {}) }
}
