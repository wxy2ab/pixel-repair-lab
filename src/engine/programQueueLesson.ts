import type { BatterySequenceCase, ProgramWalkthrough } from '../shared/programWalkthrough'
import { runBatterySequence, type BatterySequenceStep } from './programBatterySequence'

export type QueueLessonStep = Omit<BatterySequenceStep, 'kind' | 'remaining'> & {
  kind: Exclude<BatterySequenceStep['kind'], 'init'> | 'init-queue'
  queue: string[]
}

export type QueueLessonRun = {
  steps: QueueLessonStep[]
  popped: string[]
  remaining: string[]
  output: string[]
}

export function runQueueLesson(execution: ProgramWalkthrough, sample: BatterySequenceCase): QueueLessonRun | undefined {
  if (!execution.queueLesson) return undefined
  const run = runBatterySequence(sample.source ?? execution.source, sample, 'front')
  if (!run) return undefined
  return {
    ...run,
    steps: run.steps.map(({ kind, remaining: queue, ...step }) => ({ ...step, kind: kind === 'init' ? 'init-queue' : kind, queue })),
  }
}
