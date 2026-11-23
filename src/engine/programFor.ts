import { programSourceLines, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'

export type ForLessonStep = {
  kind: 'load' | 'initialize' | 'take' | 'add' | 'record' | 'stop' | 'output'
  line: number
  code: string
  index?: number
  charge?: number
  calculated?: number
  results: number[]
}

export type ForLessonRun = {
  steps: ForLessonStep[]
  rounds: number
  results: number[]
  output: string
  variable: string
}

type SourceFrame = ProgramWalkthroughFrame & { line: number }

function binding(frame: ProgramWalkthroughFrame, name: string): Json | undefined {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

function numbers(value: Json | undefined): number[] | undefined {
  return Array.isArray(value) && value.every((item): item is number => typeof item === 'number' && Number.isSafeInteger(item))
    ? value : undefined
}

function same(left: readonly number[] | undefined, right: readonly number[]) {
  return left?.length === right.length && left.every((value, index) => value === right[index])
}

export function runForLesson(source: string, batteries: readonly number[]): ForLessonRun | undefined {
  const { frames, output, issue } = runProgramWalkthrough(source, 0, { batteryCharges: batteries, traceForLoops: true })
  if (issue || frames.length < 6 || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end' || output.length !== 1) return undefined

  const lines = programSourceLines(source)
  const work = frames.slice(1, -1)
  if (!work.every((frame): frame is SourceFrame =>
    frame.stack.length === 1 && frame.line !== undefined && lines[frame.line - 1] !== undefined)) return undefined

  const [loaded, initialized] = work
  const stopped = work[work.length - 2]
  const displayed = work[work.length - 1]
  const resultName = initialized.name
  const variable = stopped.name
  if (loaded.kind !== 'assign' || !loaded.name || !same(numbers(loaded.value), batteries)
    || initialized.kind !== 'assign' || !resultName || resultName === loaded.name || !same(numbers(initialized.value), [])
    || stopped.kind !== 'loop-end' || !variable || variable === loaded.name || variable === resultName
    || displayed.kind !== 'output') return undefined

  const eventFrames = work.slice(2, -2)
  const rounds = eventFrames.length / 3
  if (rounds !== batteries.length) return undefined

  const step = (kind: ForLessonStep['kind'], frame: SourceFrame, results: number[],
    detail: Pick<ForLessonStep, 'index' | 'charge' | 'calculated'> = {}): ForLessonStep =>
    ({ kind, line: frame.line, code: lines[frame.line - 1], results, ...detail })
  let results: number[] = []
  const steps: ForLessonStep[] = [step('load', loaded, results), step('initialize', initialized, results)]

  for (let index = 0; index < rounds; index++) {
    const [taken, added, recorded] = eventFrames.slice(index * 3, index * 3 + 3)
    const { value: charge } = taken
    const { value: calculated } = added
    const recordedValues = numbers(binding(recorded, resultName))
    if (taken.kind !== 'iterate' || taken.name !== variable || taken.line !== stopped.line
      || typeof charge !== 'number' || charge !== batteries[index]
      || binding(taken, variable) !== charge || !same(numbers(binding(taken, resultName)), results)
      || added.kind !== 'assign' || typeof calculated !== 'number' || !Number.isSafeInteger(calculated)
      || binding(added, variable) !== charge || !same(numbers(binding(added, resultName)), results)
      || recorded.kind !== 'append' || recorded.name !== resultName || recorded.value !== calculated
      || binding(recorded, variable) !== charge || !recordedValues || !same(recordedValues, [...results, calculated])) return undefined

    steps.push(step('take', taken, results, { index, charge }))
    steps.push(step('add', added, results, { index, charge, calculated }))
    results = recordedValues
    steps.push(step('record', recorded, results, { index, charge, calculated }))
  }

  const previousCharge = binding(stopped, variable)
  const charge = typeof previousCharge === 'number' ? previousCharge : undefined
  if (charge !== batteries.at(-1) || binding(displayed, variable) !== charge
    || !same(numbers(binding(stopped, resultName)), results) || !same(numbers(binding(displayed, resultName)), results)
    || displayed.value !== output[0] || output[0] !== JSON.stringify(results)) return undefined

  steps.push(step('stop', stopped, results, { charge }))
  steps.push(step('output', displayed, results, { charge }))
  return { steps, rounds, results, output: output[0], variable }
}
