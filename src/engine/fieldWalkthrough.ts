import type { LectureAnimation } from '../shared/advanced'
import type { ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import { runProgramWalkthrough } from './programWalkthrough'

export type FieldWorkstation = NonNullable<LectureAnimation['workstation']>

export function fieldWalkthrough(source: string, input: number, workstation: FieldWorkstation) {
  const run = runProgramWalkthrough(source, input, { traceForLoops: true })
  const writes = new Map<number, ProgramWalkthroughFrame[]>()
  for (const frame of run.frames) {
    if (!frame.line || !['assign', 'append', 'output'].includes(frame.kind)) continue
    const hits = writes.get(frame.line) ?? []
    hits.push(frame)
    writes.set(frame.line, hits)
  }
  const snapshots = workstation.checkpoints.map(({ line, visit = 1 }) => writes.get(line)?.[visit - 1])
  return { ...run, snapshots }
}
