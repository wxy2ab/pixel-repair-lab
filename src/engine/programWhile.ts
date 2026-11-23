import { programSourceLines, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import { runProgramWalkthrough } from './programWalkthrough'

export type WhileLessonStep = {
  kind: 'load' | 'check' | 'charge' | 'stop' | 'output'
  line: number
  code: string
  charge: number
  rounds: number
  condition?: boolean
}

export type WhileLessonRun = {
  steps: WhileLessonStep[]
  rounds: number
  finalCharge: number
  output: string
  variable: string
}

type SourceFrame = ProgramWalkthroughFrame & { line: number }

export function runWhileLesson(source: string, input: number): WhileLessonRun | undefined {
  const { frames, output, issue } = runProgramWalkthrough(source, input, { traceWhileLoops: true })
  if (issue || frames.length < 5 || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end' || output.length !== 1) return undefined

  const lines = programSourceLines(source)
  const work = frames.slice(1, -1)
  if (!work.every((frame): frame is SourceFrame =>
    frame.stack.length === 1 && frame.line !== undefined && lines[frame.line - 1] !== undefined)) return undefined

  const [loaded] = work
  const stopped = work[work.length - 2]
  const displayed = work[work.length - 1]
  const variable = loaded.name
  if (loaded.kind !== 'assign' || !variable || loaded.value !== input
    || stopped.kind !== 'while-check' || stopped.value !== false || displayed.kind !== 'output') return undefined

  const reading = (frame: SourceFrame) => frame.stack[0].values.find(binding => binding.name === variable)?.value
  if (reading(loaded) !== input) return undefined
  const events = work.slice(1, -2)
  if (events.length % 2 !== 0) return undefined

  const steps: WhileLessonStep[] = []
  let charge = input
  let rounds = 0
  function record(kind: WhileLessonStep['kind'], frame: SourceFrame, condition?: boolean) {
    steps.push({
      kind, line: frame.line, code: lines[frame.line - 1], charge, rounds,
      ...(condition !== undefined && { condition }),
    })
  }
  record('load', loaded)

  for (let index = 0; index < events.length; index += 2) {
    const [checked, updated] = events.slice(index, index + 2)
    if (checked.kind !== 'while-check' || checked.line !== stopped.line || checked.value !== true || reading(checked) !== charge
      || updated.kind !== 'assign' || updated.name !== variable || typeof updated.value !== 'number'
      || !Number.isSafeInteger(updated.value) || reading(updated) !== updated.value) return undefined
    record('check', checked, true)
    charge = updated.value
    rounds++
    record('charge', updated)
  }

  if (reading(stopped) !== charge || reading(displayed) !== charge || displayed.value !== output[0]
    || output[0] !== String(charge)) return undefined
  record('stop', stopped, false)
  record('output', displayed)
  return { steps, rounds, finalCharge: charge, output: output[0], variable }
}
