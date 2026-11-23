import { programSourceLines, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import { runProgramWalkthrough } from './programWalkthrough'

export type BooleanStep = { value: boolean; line: number; code: string }
export type BooleanLessonRun = {
  comparison: BooleanStep
  door: BooleanStep
  decision: BooleanStep
  output: string
}

export function readBooleanStep(frame: ProgramWalkthroughFrame, lines: string[]): BooleanStep | undefined {
  if (frame.kind !== 'assign' || typeof frame.value !== 'boolean' || frame.line === undefined) return undefined
  const code = lines[frame.line - 1]
  if (code === undefined) return undefined
  return { value: frame.value, line: frame.line, code }
}

export function runBooleanLesson(source: string, input: number, doorOpen: boolean): BooleanLessonRun | undefined {
  const { frames, output, issue } = runProgramWalkthrough(source, input, { doorOpen })
  if (issue || frames.length !== 7 || output.length !== 1) return undefined
  const [start, read, compared, readDoor, combined, displayed, end] = frames
  if (start.kind !== 'start' || read.kind !== 'assign' || read.value !== input
    || displayed.kind !== 'output' || end.kind !== 'end') return undefined

  const lines = programSourceLines(source)
  const comparison = readBooleanStep(compared, lines)
  const door = readBooleanStep(readDoor, lines)
  const decision = readBooleanStep(combined, lines)
  if (!comparison || !door || !decision || output[0] !== (decision.value ? 'True' : 'False')) return undefined
  return { comparison, door, decision, output: output[0] }
}
