import { compareRepairBoards, type RepairChange } from './breadboardRepairChanges'
import type { RepairReport } from './breadboardRepairHistory'
import type { RepairReplayFrame } from './breadboardRepairReplay'
import { repairEvidence, sameMeterNote, sameProbeConditions, type MeterNote } from './breadboardRepairTicket'
import { replayStepCategory } from './breadboardReplaySteps'

type MeasurementStep = { index: number; frame: RepairReplayFrame; note: MeterNote }
export type ReplayRetestComparison = { before: MeasurementStep; after: MeasurementStep; changes: RepairChange[] }

function measurementAt(frame: RepairReplayFrame): MeterNote | undefined {
  if (replayStepCategory(frame) !== 'measure') return
  if (frame.action.kind === 'measure') return frame.action.note
  const { mode, red, black, pressed, reading, d13 } = frame.bench
  if (!mode || !red || !black || pressed === undefined || !reading) return
  return repairEvidence({ mode, red, black, reading }, pressed, d13 === 0 || d13 === 1 ? d13 : undefined)
}

// A wiring repair can change what D2 senses, hence what the same sketch writes to D13.
// Match the saved switch sample/setup when known, without requiring an unchanged output bit.
function compatibleProgramState(a: MeterNote, b: MeterNote) {
  if (a.kind === 'continuity') return true
  if ((a.output === undefined) !== (b.output === undefined)) return false
  if (a.pullup !== undefined && b.pullup !== undefined) return a.pullup === b.pullup && a.drivenBy === b.drivenBy
  return a.drivenBy === undefined || b.drivenBy === undefined || a.drivenBy === b.drivenBy
}

function matchesSource(measured: MeterNote, source: MeterNote, onOriginal: boolean) {
  if (!sameProbeConditions(measured, source) || !compatibleProgramState(measured, source)) return false
  if (!onOriginal) return true
  // Button/power frames and older archives have fewer sketch fields than pinned notes.
  // Compare the observed value on the same board even when those fields are unavailable.
  return sameMeterNote({ ...measured, pullup: source.pullup, drivenBy: source.drivenBy }, source)
}

export function findReplayRetest(frames: readonly RepairReplayFrame[], measurementIndex: number, report: RepairReport): ReplayRetestComparison | undefined {
  const frame = frames[measurementIndex]
  const note = frame && measurementAt(frame)
  if (!note || note.red === note.black) return
  const changes = compareRepairBoards(frame.build, report.repaired)
  if (!changes.length) return
  const onOriginal = !compareRepairBoards(frame.build, report.original).length
  const hasSavedPair = report.readings.some(pair => pair.after && matchesSource(note, pair.before, onOriginal))
  const attributed: MeasurementStep[] = []
  const unlinked: MeasurementStep[] = []
  for (let index = measurementIndex + 1; index < frames.length; index++) {
    const after = frames[index]
    const { action } = after
    if (action.kind !== 'retest' || !action.note || !sameProbeConditions(note, action.note)
      || !compatibleProgramState(note, action.note) || compareRepairBoards(after.build, report.repaired).length) continue
    const step = { index, frame: after, note: action.note }
    if (action.source) {
      if (onOriginal && frame.action.kind === 'measure' && sameMeterNote(note, action.source)) {
        return { before: { index: measurementIndex, frame, note }, after: step, changes }
      }
      if (matchesSource(note, action.source, onOriginal)) attributed.push(step)
    } else {
      const saved = report.readings.filter(pair => pair.after && sameMeterNote(pair.after, step.note))
      if (!saved.length && !hasSavedPair) unlinked.push(step)
      else if (saved.some(pair => matchesSource(note, pair.before, onOriginal))) attributed.push(step)
    }
  }

  // Old events may only record the retest's result. A saved pair identifies its source.
  // If only the conditions are known, distinct possible outcomes cannot be attributed.
  const candidates = attributed.length ? attributed : unlinked
  const after = candidates[0]
  if (!after || !candidates.every(candidate => sameMeterNote(after.note, candidate.note))) return
  return { before: { index: measurementIndex, frame, note }, after, changes }
}
