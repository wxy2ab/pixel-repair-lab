import { programSourceLines, type BatterySequenceCase, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'
import { valuesEqual } from './values'

export type BatterySequenceStep = {
  kind: 'init' | 'init-taken' | 'push' | 'pop' | 'show-popped' | 'show-remaining'
  line: number
  code: string
  remaining: string[]
  popped: string[]
  battery?: string
}

type BatterySequenceRun = {
  steps: BatterySequenceStep[]
  popped: string[]
  remaining: string[]
  output: string[]
}

type VisibleFrame = ProgramWalkthroughFrame & { line: number }

function binding(frame: ProgramWalkthroughFrame, name: string): Json | undefined {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

function stringList(value: Json | undefined): value is string[] {
  return Array.isArray(value) && value.every(name => typeof name === 'string')
}

export function runBatterySequence(source: string, sample: BatterySequenceCase, takeFrom: 'front' | 'back'): BatterySequenceRun | undefined {
  const { frames, output, issue } = runProgramWalkthrough(source, 0, { traceForLoops: true })
  if (issue || frames.length !== sample.operations.length + 6 || output.length !== 2
    || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end') return undefined

  const lines = programSourceLines(source)
  const work = frames.slice(1, -1)
  if (!work.every((frame): frame is VisibleFrame => frame.stack.length === 1 && frame.line !== undefined
    && lines[frame.line - 1] !== undefined)) return undefined
  if (work.some((frame, index) => index > 0 && frame.line <= work[index - 1].line)) return undefined

  const [makeRemaining, makeTaken] = work
  const { name: remainingName } = makeRemaining
  const { name: takenName } = makeTaken
  if (makeRemaining.kind !== 'assign' || makeTaken.kind !== 'assign' || !remainingName || !takenName || remainingName === takenName
    || !valuesEqual(makeRemaining.value ?? null, []) || !valuesEqual(makeTaken.value ?? null, [])) return undefined

  const empty = binding(makeRemaining, remainingName)
  const readyRemaining = binding(makeTaken, remainingName)
  const readyTaken = binding(makeTaken, takenName)
  if (!stringList(empty) || empty.length !== 0 || !stringList(readyRemaining) || readyRemaining.length !== 0
    || !stringList(readyTaken) || readyTaken.length !== 0) return undefined

  let remaining = readyRemaining
  let popped = readyTaken
  const steps: BatterySequenceStep[] = [
    { kind: 'init', line: makeRemaining.line, code: lines[makeRemaining.line - 1], remaining: empty, popped: [] },
    { kind: 'init-taken', line: makeTaken.line, code: lines[makeTaken.line - 1], remaining, popped },
  ]
  const batteries = new Set(sample.batteries.map(({ name }) => name))
  const takeIndex = takeFrom === 'front' ? 0 : -1
  for (const [index, operation] of sample.operations.entries()) {
    const frame = work[index + 2]
    const push = operation.kind === 'push'
    const battery = push ? operation.battery : remaining.at(takeIndex)
    if (battery === undefined || !batteries.has(battery) || frame.kind !== 'append'
      || frame.name !== (push ? remainingName : takenName) || frame.value !== battery) return undefined

    const nextRemaining = binding(frame, remainingName)
    const nextPopped = binding(frame, takenName)
    if (!stringList(nextRemaining) || !stringList(nextPopped)
      || !valuesEqual(nextRemaining, push ? [...remaining, battery] : remaining.toSpliced(takeIndex, 1))
      || !valuesEqual(nextPopped, push ? popped : [...popped, battery])) return undefined
    remaining = nextRemaining
    popped = nextPopped
    steps.push({ kind: operation.kind, line: frame.line, code: lines[frame.line - 1], remaining, popped, battery })
  }

  const [showPopped, showRemaining] = work.slice(-2)
  const displays = [
    { kind: 'show-popped', frame: showPopped, value: popped },
    { kind: 'show-remaining', frame: showRemaining, value: remaining },
  ] as const
  for (const [index, { kind, frame, value }] of displays.entries()) {
    if (frame.kind !== 'output' || frame.value !== output[index] || output[index] !== JSON.stringify(value)
      || !valuesEqual(binding(frame, remainingName) ?? null, remaining) || !valuesEqual(binding(frame, takenName) ?? null, popped)) return undefined
    steps.push({ kind, line: frame.line, code: lines[frame.line - 1], remaining, popped })
  }

  return { steps, popped, remaining, output }
}
