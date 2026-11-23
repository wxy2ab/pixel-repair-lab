import { programSourceLines } from '../shared/programWalkthrough'
import { readBooleanStep, type BooleanStep } from './programBoolean'
import { runProgramWalkthrough } from './programWalkthrough'

type SourceStep = { line: number; code: string }

export type BranchLessonRun = {
  comparison: BooleanStep
  door: BooleanStep
  condition: BooleanStep
  guard: SourceStep
  choice: SourceStep & { path: 'if' | 'else' }
  action: SourceStep & { value: string }
  output: string
}

function readSourceStep(lines: string[], line: number | undefined): SourceStep | undefined {
  if (line === undefined || lines[line - 1] === undefined) return undefined
  return { line, code: lines[line - 1] }
}

export function runBranchLesson(source: string, input: number, doorOpen: boolean): BranchLessonRun | undefined {
  const { frames, output, issue } = runProgramWalkthrough(source, input, { doorOpen, traceBranches: true })
  if (issue || frames.length !== 8 || output.length !== 1) return undefined

  const [start, read, compared, readDoor, evaluated, selected, displayed, end] = frames
  if (start.kind !== 'start' || read.kind !== 'assign' || read.value !== input || selected.kind !== 'branch'
    || displayed.kind !== 'output' || typeof displayed.value !== 'string' || end.kind !== 'end') return undefined

  const { name: path } = selected
  if (path !== 'if' && path !== 'else') return undefined

  const lines = programSourceLines(source)
  const comparison = readBooleanStep(compared, lines)
  const door = readBooleanStep(readDoor, lines)
  const condition = readBooleanStep(evaluated, lines)
  const guard = readSourceStep(lines, selected.guardLine)
  const choice = readSourceStep(lines, selected.line)
  const action = readSourceStep(lines, displayed.line)
  if (!comparison || !door || !condition || !guard || !choice || !action || action.line <= choice.line) return undefined

  return {
    comparison, door, condition, guard, choice: { ...choice, path },
    action: { ...action, value: displayed.value }, output: output[0],
  }
}
