import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import type { ArenaFrame, ArenaSnapshot } from '../shared/advanced'
import { arenaShotImpactMs, arenaTurnTiming, type ArenaTurnMotion } from './arenaTurnMotion'

const reduceQuery = '(prefers-reduced-motion: reduce)'
function subscribeMotionPreference(update: () => void) {
  const media = window.matchMedia(reduceQuery)
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}
const prefersReducedMotion = () => window.matchMedia(reduceQuery).matches

type ShownTurn = { scene: number; snapshot: ArenaSnapshot; frame?: ArenaFrame; previousFrame?: ArenaFrame; animate: boolean; motion?: ArenaTurnMotion }

/** Only animate an actual advance from the board the child was looking at. */
export function useArenaTurnPresentation(scene: number, snapshot: ArenaSnapshot, frame?: ArenaFrame, allowMotion = true) {
  const reduced = useSyncExternalStore(subscribeMotionPreference, prefersReducedMotion)
  const animate = allowMotion && !reduced
  const [last, setLast] = useState<ShownTurn>({ scene, snapshot, frame, animate })
  let shown = last
  if (scene !== last.scene || frame !== last.frame || animate !== last.animate || snapshot.turn !== last.snapshot.turn) {
    shown = { scene, snapshot, frame, animate }
    if (animate && frame?.state === snapshot && scene === last.scene && snapshot.turn === last.snapshot.turn + 1) {
      const timing = arenaTurnTiming(frame.events, snapshot.actors)
      shown.previousFrame = last.frame
      if (timing.durationMs) {
        let startedAt: number | undefined
        shown.motion = {
          ...timing, turn: snapshot.turn, from: last.snapshot.actors, to: snapshot.actors, events: frame.events,
          // Both renderers first read the clock during layout, once the new board actually exists.
          get startedAt() { return startedAt ??= performance.now() },
        }
      }
    }
    setLast(shown)
  }

  const { motion } = shown
  const [mark, setMark] = useState<{ motion: ArenaTurnMotion; elapsed: number }>()
  useLayoutEffect(() => {
    if (!motion) return
    const start = motion.startedAt
    // Geometry runs in the renderers. React only updates when a hit lands or the turn settles.
    const milestones = new Set([motion.durationMs])
    for (const shot of motion.events) {
      if (shot.action === 'shoot' && shot.targetId) milestones.add(arenaShotImpactMs(motion, shot))
    }
    const timers = [...milestones].map(elapsed => window.setTimeout(() => {
      setMark({ motion, elapsed: Math.max(elapsed, performance.now() - start) })
    }, Math.max(0, start + elapsed - performance.now())))
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [motion])
  const elapsed = motion && mark?.motion === motion ? mark.elapsed : 0
  const pendingShots = motion?.events.filter(shot => shot.action === 'shoot' && shot.targetId
    && elapsed < arenaShotImpactMs(motion, shot)) ?? []
  const inFlight = !!motion && elapsed < motion.durationMs
  return { motion, pendingShots, inFlight, reportedFrame: inFlight ? shown.previousFrame : frame }
}

export type ArenaTurnPresentation = ReturnType<typeof useArenaTurnPresentation>

export function arenaHudSnapshot(snapshot: ArenaSnapshot, { pendingShots, motion }: ArenaTurnPresentation): ArenaSnapshot {
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
