import { useMemo, useState } from 'react'
import type { ArenaFrame, ArenaProgramEvent, ArenaScan } from '../shared/advanced'
import { flowActivity, type StationActivity } from './station3d/types'
import type { ExecutionLocation } from './ExecutionSource'
import { actionViewingDelay } from './gridExecution'

export const programBeatMs = 340

// A long calculation can still be inspected one event at a time. During autoplay
// show its first four and final three events so the subsequent move stays in view.
function previewOffsets(count: number) {
  return count > 8 ? [0, 1, 2, 3, count - 3, count - 2, count - 1] : Array.from({ length: count }, (_, index) => index)
}

export function arenaViewingDelay(frame: ArenaFrame | undefined, animated: boolean) {
  if (animated) return 60
  if (!frame) return 180
  const event = frame.events.find(entry => entry.actorId === 'player')
  return actionViewingDelay(event?.action) ?? programBeatMs
}

export function arenaPlayerActivity(frame?: ArenaFrame): StationActivity | undefined {
  const event = frame?.events.find(entry => entry.actorId === 'player')
  if (!event) return
  return { token: event, action: event.action, failed: Boolean(event.blocked || (event.action === 'pick' && !event.itemId)),
    value: event.direction ?? event.itemId }
}

type Beat = { activity?: StationActivity; line?: ExecutionLocation; scan?: ArenaScan; flow?: boolean; beforeTurn?: boolean }
function programBeat(event: ArenaProgramEvent, beforeTurn: boolean): Beat {
  if (event.kind !== 'scan') return { activity: flowActivity(event), line: event, beforeTurn, flow: true }
  const scan = event.scan
  return { activity: { token: scan, action: 'scan', value: scan.value }, line: scan, scan, beforeTurn }
}

export function firstArenaLine(frame?: ArenaFrame): ExecutionLocation | undefined {
  const first = frame?.program?.[0]
  if (first) return first.kind === 'scan' ? first.scan : first
  return frame?.scan ?? (frame?.line ? frame : undefined)
}

// The main cursor counts game turns so older saves can seek to the same board.
// The beats inside a turn show the Python decisions on the board they inspected.
export function useArenaActivities(frame: ArenaFrame | undefined, trailing: ArenaProgramEvent[] | undefined,
  suppress: boolean, errorLine: ExecutionLocation | undefined, stepping: boolean, turnOnly: boolean) {
  const beats = useMemo(() => {
    const entries: Beat[] = []
    if (suppress) return entries
    if (!turnOnly) {
      if (frame?.program) for (const event of frame.program) entries.push(programBeat(event, true))
      else if (frame?.scan) entries.push(programBeat({ kind: 'scan', scan: frame.scan }, true))
    }
    const physical = arenaPlayerActivity(frame)
    if (physical) entries.push({ activity: physical, line: frame?.line ? frame : undefined })
    if (!turnOnly && trailing) for (const event of trailing) entries.push(programBeat(event, false))
    if (errorLine) entries.push({ line: errorLine })
    return entries
  }, [frame, trailing, suppress, turnOnly, errorLine?.line, errorLine?.sourceName])
  const preview = useMemo(() => {
    const indices: number[] = []
    let start = 0
    while (start < beats.length) {
      if (!beats[start].flow && !beats[start].scan) {
        indices.push(start++)
        continue
      }
      let end = start + 1
      while (end < beats.length && (beats[end].flow || beats[end].scan)) end++
      for (const offset of previewOffsets(end - start)) indices.push(start + offset)
      start = end
    }
    return indices
  }, [beats])
  const [shown, setShown] = useState<{ beats: Beat[]; index: number }>()
  const index = shown?.beats === beats ? shown.index : 0
  const hasFlow = beats.some(beat => beat.flow)
  const manual = stepping && hasFlow
  const more = index + 1 < beats.length
  const next = manual ? index + 1 : preview.find(position => position > index)
  const autoAdvance = useMemo(() => {
    if (next === undefined || manual) return
    return () => setShown({ beats, index: next })
  }, [beats, next, manual])
  return {
    beat: beats[index], nextBeat: next === undefined ? undefined : beats[next], more, autoAdvance,
    shortened: !manual && preview.length < beats.length,
    rewind() { setShown({ beats, index: 0 }) },
    advance() {
      if (!hasFlow || !more) return false
      setShown({ beats, index: index + 1 })
      return true
    },
  }
}
