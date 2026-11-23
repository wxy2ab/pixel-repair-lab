import type { RepairReplayFrame } from './breadboardRepairReplay'

export const replayStepFilters = ['all', 'measure', 'diagnosis', 'edit', 'retest', 'test'] as const
export type ReplayStepFilter = typeof replayStepFilters[number]

export function replayStepCategory({ action, bench }: RepairReplayFrame): Exclude<ReplayStepFilter, 'all'> | undefined {
  const { kind } = action
  if (kind === 'start' || kind === 'resume') return
  if (kind === 'check') return 'test'
  if (kind === 'button' || kind === 'power') {
    // A child can leave the probe tips in place and operate the switch to take a reading.
    const reading = bench.reading?.kind
    if (bench.red && bench.black && bench.red !== bench.black
      && (reading === 'continuity' || reading === 'voltage' || reading === 'floating')) return 'measure'
    return
  }
  return kind
}

export function replayStepIndices(frames: readonly RepairReplayFrame[], filter: ReplayStepFilter): number[] {
  const indices: number[] = []
  frames.forEach((frame, index) => {
    if (filter === 'all' || replayStepCategory(frame) === filter) indices.push(index)
  })
  return indices
}

// Keep the same full-process step, otherwise pick the next match and wrap at the end.
export function replayStepPosition(indices: readonly number[], anchor: number): number {
  if (!indices.length) return -1
  const next = indices.findIndex(index => index >= anchor)
  return Math.max(0, next)
}
