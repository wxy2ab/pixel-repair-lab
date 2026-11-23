import {
  programSourceLines, reorderProgramSource, type ProgramWalkthrough, type ProgramWalkthroughFrame,
} from '../shared/programWalkthrough'
import type { RunIssue } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'

export type ProgramSequenceStep = {
  cardId: string
  line: number
  code: string
  frame: ProgramWalkthroughFrame
  issue?: RunIssue
}

export type ProgramSequenceResult = {
  steps: ProgramSequenceStep[]
  output: string[]
  issue?: RunIssue
}

export function runProgramSequence(execution: ProgramWalkthrough, order: readonly string[], input: number): ProgramSequenceResult {
  const source = reorderProgramSource(execution, order)
  const lines = programSourceLines(source)
  const cards = new Map(execution.visual?.main.map(({ line }, index) => [line, order[index]]))
  const result = runProgramWalkthrough(source, input)
  const steps: ProgramSequenceStep[] = []

  function addStep(line: number | undefined, frame: ProgramWalkthroughFrame, issue?: RunIssue) {
    if (line === undefined) return
    const cardId = cards.get(line)
    if (cardId !== undefined) steps.push({ cardId, line, code: lines[line - 1], frame, issue })
  }

  for (const frame of result.frames) addStep(frame.line, frame)
  const lastFrame = result.frames.at(-1)
  if (result.issue && lastFrame) addStep(result.issue.line, lastFrame, result.issue)

  return { steps, output: result.output, issue: result.issue }
}
