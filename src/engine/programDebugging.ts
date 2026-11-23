import { programSourceLines, type ProgramWalkthrough, type ProgramWalkthroughFrame, type WalkthroughScope } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'

export type DebuggingStep = {
  kind: 'define' | 'load' | 'call' | 'initialize' | 'take' | 'charge' | 'finish-loop' | 'return' | 'store' | 'output'
  line: number
  code: string
  results: number[]
  batteryIndex?: number
  charge?: number
  charged?: number
}

export type DebuggingRun = { steps: DebuggingStep[]; results: number[]; output: string }

export function repairDebuggingSource(execution: ProgramWalkthrough): string | undefined {
  if (!execution.debugging) return undefined
  const { loopLine, returnLine } = execution.debugging
  const lines = programSourceLines(execution.source)
  const indentation = lines[loopLine - 1]?.match(/^([ \t]+)for\s/u)?.[1]
  const returned = lines[returnLine - 1]?.match(/^([ \t]+)(return\s.+)$/u)
  if (!indentation || !returned || loopLine >= returnLine
    || !returned[1].startsWith(indentation) || returned[1].length <= indentation.length) return undefined

  lines[returnLine - 1] = indentation + returned[2]
  return lines.join('\n')
}

type SourceFrame = ProgramWalkthroughFrame & { line: number }

function binding(scope: WalkthroughScope | undefined, name: string) {
  return scope?.values.find(value => value.name === name)?.value
}

function matches(value: Json | undefined, charges: readonly number[]): value is number[] {
  return Array.isArray(value) && value.length === charges.length && value.every((item, index) => item === charges[index])
}

export function runDebuggingLesson(source: string, batteries: readonly number[]): DebuggingRun | undefined {
  const { frames, output, issue } = runProgramWalkthrough(source, 0, { batteryCharges: batteries, traceForLoops: true })
  if (issue || frames.length < 10 || output.length !== 1 || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end') return undefined

  const lines = programSourceLines(source)
  const work = frames.slice(1, -1)
  if (!work.every((frame): frame is SourceFrame => frame.line !== undefined && lines[frame.line - 1] !== undefined)) return undefined

  const [defined, loaded, called, initialized] = work
  const [returned, stored, displayed] = work.slice(-3)
  const [caller, local] = called.stack
  const parameter = local?.values.find(value => value.parameter)
  const resultsName = initialized.name
  if (defined.kind !== 'define' || !defined.name || loaded.kind !== 'assign' || !matches(loaded.value, batteries)
    || called.kind !== 'call' || called.name !== defined.name || local?.name !== called.name || called.stack.length !== 2
    || !parameter || !matches(parameter.value, batteries) || initialized.kind !== 'assign' || !resultsName
    || initialized.stack[1]?.id !== local.id || !matches(initialized.value, [])
    || returned.kind !== 'return' || returned.name !== called.name || returned.resumeLine !== called.line
    || returned.stack.length !== 1 || returned.stack[0].id !== caller.id
    || stored.kind !== 'assign' || stored.line !== called.line || !stored.name || displayed.kind !== 'output') return undefined

  const loopFrames = work.slice(4, -3)
  const ended = loopFrames.at(-1)
  const finished = ended?.kind === 'loop-end' ? loopFrames.pop() : undefined
  const loopHeader = finished ?? loopFrames[0]
  const rounds = finished ? batteries.length : 1
  if (!loopHeader?.name || loopFrames.length !== rounds * 2) return undefined

  let results: number[] = []
  const steps: DebuggingStep[] = []
  function record(kind: DebuggingStep['kind'], frame: SourceFrame,
    detail: Pick<DebuggingStep, 'batteryIndex' | 'charge' | 'charged'> = {}) {
    steps.push({ kind, line: frame.line, code: lines[frame.line - 1], results, ...detail })
  }

  record('define', defined)
  record('load', loaded)
  record('call', called)
  record('initialize', initialized)
  for (let batteryIndex = 0; batteryIndex < rounds; batteryIndex++) {
    const taken = loopFrames[batteryIndex * 2]
    const appended = loopFrames[batteryIndex * 2 + 1]
    const charge = batteries[batteryIndex]
    const charged = appended.value
    const updated = binding(appended.stack[1], resultsName)
    if (charge === undefined || taken.kind !== 'iterate' || taken.line !== loopHeader.line || taken.name !== loopHeader.name
      || taken.value !== charge || taken.stack[1]?.id !== local.id || !matches(binding(taken.stack[1], resultsName), results)
      || appended.kind !== 'append' || appended.name !== resultsName || appended.stack[1]?.id !== local.id
      || typeof charged !== 'number' || !Number.isSafeInteger(charged) || !matches(updated, [...results, charged])) return undefined
    record('take', taken, { batteryIndex, charge })
    results = updated
    record('charge', appended, { batteryIndex, charge, charged })
  }

  if (finished) {
    if (finished.stack[1]?.id !== local.id || !matches(binding(finished.stack[1], resultsName), results)) return undefined
    record('finish-loop', finished)
  }
  if (!matches(returned.value, results) || !matches(stored.value, results)
    || !matches(binding(displayed.stack[0], stored.name), results)
    || displayed.value !== output[0] || output[0] !== JSON.stringify(results)) return undefined
  record('return', returned)
  record('store', stored)
  record('output', displayed)
  return { steps, results, output: output[0] }
}
