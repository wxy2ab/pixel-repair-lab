import type { ProgramWalkthrough, StackLessonCase } from '../shared/programWalkthrough'
import { runBatterySequence, type BatterySequenceStep } from './programBatterySequence'

export type StackLessonStep = Omit<BatterySequenceStep, 'kind' | 'remaining'> & {
  kind: Exclude<BatterySequenceStep['kind'], 'init'> | 'init-stack'
  stack: string[]
}

export type StackLessonRun = {
  steps: StackLessonStep[]
  popped: string[]
  remaining: string[]
  output: string[]
}

export function runStackLesson(execution: ProgramWalkthrough, sample: StackLessonCase): StackLessonRun | undefined {
  if (!execution.stackLesson) return undefined
  const run = runBatterySequence(sample.source ?? execution.source, sample, 'back')
  if (!run) return undefined
  return {
    ...run,
    steps: run.steps.map(({ kind, remaining: stack, ...step }) => ({ ...step, kind: kind === 'init' ? 'init-stack' : kind, stack })),
  }
}
