import { createContext, useContext, useLayoutEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { ArenaFrame, ArenaSnapshot } from '../shared/advanced'
import { arenaElapsed, arenaShotImpactMs, arenaTurnTiming, ArenaVolleyClock, type ArenaTurnMotion } from './arenaTurnMotion'
import { readArenaAttackPlayback, useSystemReducedMotion } from './ArenaAttackSpeed'

type ShownTurn = {
  scene: number; snapshot: ArenaSnapshot; frame?: ArenaFrame; previousFrame?: ArenaFrame; allowMotion: boolean; motion?: ArenaTurnMotion
  explicitAttack?: boolean
  resumeOffset?: number
}

function timedMotion(fields: Omit<ArenaTurnMotion, 'startedAt'>, offset = 0, held = false): ArenaTurnMotion {
  let origin: number | undefined
  const clock = fields.fireAtMs && !held ? new ArenaVolleyClock(offset, fields.durationMs) : undefined
  return { ...fields, clock, heldAt: held ? offset : undefined, get startedAt() { return origin ??= performance.now() - offset } }
}

/** Only animate an actual advance from the board the child was looking at. */
export function useArenaTurnPresentation(scene: number, snapshot: ArenaSnapshot, frame?: ArenaFrame, allowMotion = true) {
  const reduced = useSystemReducedMotion()
  const [surfaceVisible, setSurfaceVisible] = useState(false)
  const [last, setLast] = useState<ShownTurn>({ scene, snapshot, frame, allowMotion })
  let shown = last
  if (scene !== last.scene || frame !== last.frame || allowMotion !== last.allowMotion || snapshot.turn !== last.snapshot.turn
    || (reduced && last.motion && !last.explicitAttack)) {
    shown = { scene, snapshot, frame, allowMotion }
    if (allowMotion && frame?.state === snapshot && scene === last.scene && snapshot.turn === last.snapshot.turn + 1) {
      const { speed, explicit } = readArenaAttackPlayback()
      const timing = arenaTurnTiming(frame.events, snapshot.actors, speed)
      shown.previousFrame = last.frame
      shown.explicitAttack = explicit && timing.fireAtMs > 0
      if (timing.durationMs && (!reduced || shown.explicitAttack)) {
        const hold = timing.fireAtMs > 0 && !surfaceVisible
        shown.motion = timedMotion({
          ...timing, turn: snapshot.turn, from: last.snapshot.actors, to: snapshot.actors, events: frame.events,
        }, 0, hold)
      }
    }
  } else if (last.motion?.fireAtMs) {
    // Count the volley only while the board can display it. Rebase both renderers and
    // the HP milestones onto the same elapsed time when the child returns.
    if (!surfaceVisible && last.motion.heldAt === undefined) {
      const elapsed = arenaElapsed(last.motion, performance.now())
      if (elapsed < last.motion.durationMs) shown = { ...last, motion: timedMotion(last.motion, elapsed, true) }
    } else if (surfaceVisible && last.motion.heldAt !== undefined) {
      shown = { ...last, motion: timedMotion(last.motion, last.motion.heldAt), resumeOffset: last.motion.heldAt }
    }
  }
  if (shown !== last) setLast(shown)

  const { motion, resumeOffset = 0 } = shown
  const heldAt = motion?.heldAt
  const [mark, setMark] = useState<{ motion: ArenaTurnMotion; elapsed: number }>()
  useLayoutEffect(() => {
    if (!motion || heldAt !== undefined) return
    const { clock } = motion
    if (clock) {
      const milestones = [motion.durationMs, ...motion.events
        .filter(shot => shot.action === 'shoot' && shot.targetId)
        .map(shot => arenaShotImpactMs(motion, shot))]
      const draw = (now: number) => {
        const previous = clock.elapsed
        clock.draw(now)
        // React only updates when a hit is visible or the turn settles.
        if (milestones.some(time => previous < time && clock.elapsed >= time)) {
          setMark({ motion, elapsed: clock.elapsed })
        }
        if (clock.elapsed < motion.durationMs) request = requestAnimationFrame(draw)
      }
      let request = requestAnimationFrame(draw)
      return () => cancelAnimationFrame(request)
    }
    const timer = window.setTimeout(() => setMark({ motion, elapsed: motion.durationMs }),
      Math.max(0, motion.durationMs - arenaElapsed(motion, performance.now())))
    return () => window.clearTimeout(timer)
  }, [motion, heldAt])
  const elapsed = heldAt ?? (motion && mark?.motion === motion ? mark.elapsed : resumeOffset)
  const pendingShots = useMemo(() => motion?.events.filter(shot => shot.action === 'shoot' && shot.targetId
    && elapsed < arenaShotImpactMs(motion, shot)) ?? [], [motion, elapsed])
  const inFlight = !!motion && elapsed < motion.durationMs
  return { motion, pendingShots, inFlight, setSurfaceVisible, reportedFrame: inFlight ? shown.previousFrame : frame }
}

export type ArenaTurnPresentation = ReturnType<typeof useArenaTurnPresentation>

export function arenaHudSnapshot(snapshot: ArenaSnapshot, { pendingShots, motion }: Pick<ArenaTurnPresentation, 'pendingShots' | 'motion'>): ArenaSnapshot {
  if (!pendingShots.length) return snapshot
  const actors = snapshot.actors.map(actor => {
    const incoming = pendingShots.filter(shot => shot.targetId === actor.id)
    if (!incoming.length || actor.hp === undefined) return actor
    const guarding = motion?.events.some(event => event.actorId === actor.id && event.action === 'guard')
    // The engine records guard and shield absorption together. Guard absorbs the first point of each pulse.
    const shield = incoming.reduce((value, shot) => value + Math.max(0, (shot.absorbed ?? 0) - Number(!!guarding)), actor.shield ?? 0)
    return { ...actor, hp: incoming.reduce((hp, shot) => hp + (shot.damage ?? 0), actor.hp), shield }
  })
  return { ...snapshot, actors }
}

// Scores are committed as soon as a match ends. Only the victory UI waits for the final impact.
export const ArenaFinishContext = createContext<Dispatch<SetStateAction<string | undefined>> | null>(null)
export function useArenaFinishPresentation(levelId: string, pending: boolean) {
  const report = useContext(ArenaFinishContext)
  useLayoutEffect(() => {
    if (!pending || !report) return
    report(levelId)
    return () => report(current => current === levelId ? undefined : current)
  }, [levelId, pending, report])
}
