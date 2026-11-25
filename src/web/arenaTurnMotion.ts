import type { ArenaActor, ArenaEvent } from '../shared/advanced'

export type ArenaTurnMotion = {
  turn: number
  startedAt: number
  from: readonly ArenaActor[]
  to: readonly ArenaActor[]
  events: readonly ArenaEvent[]
  moveMs: number
  fireAtMs: number
  durationMs: number
}

export const arenaMotionMs = {
  move: 520,
  windup: 240,
  recoil: 290,
  impact: 330,
  shutdown: 650,
} as const

/** Pulses follow the engine's traced cells, including shots stopped by the first wall. */
export function arenaPulseFlightMs(shot: ArenaEvent) {
  return Math.min(520, 115 + (shot.path?.length ?? 0) * 51)
}

// Accelerate out of the emitter, coast, then ease into the contact glow.
export function arenaPulseTravel(fraction: number) {
  const t = Math.max(0, Math.min(1, fraction))
  const launch = .14, contact = .08
  const distance = 1 - (launch + contact) / 2
  if (t < launch) return t * t / (2 * launch * distance)
  if (t > 1 - contact) return 1 - (1 - t) ** 2 / (2 * contact * distance)
  return (t - launch / 2) / distance
}

export function arenaShotImpactMs(motion: Pick<ArenaTurnMotion, 'fireAtMs'>, shot: ArenaEvent) {
  return motion.fireAtMs + arenaPulseFlightMs(shot)
}

export function arenaTurnTiming(events: readonly ArenaEvent[], actors: readonly ArenaActor[]) {
  const moveMs = events.some(event => event.action === 'move') ? arenaMotionMs.move : 0
  const shots = events.filter(event => event.action === 'shoot')
  // A shooter can aim while a neighbour walks. Even the shortest shot lands after the feet settle.
  const fireAtMs = shots.length ? Math.max(arenaMotionMs.windup, moveMs - 40) : 0
  let durationMs = moveMs || (events.some(event => event.action === 'guard' || event.action === 'pick') ? 330 : 0)
  for (const shot of shots) {
    const knocksOut = !!shot.damage && actors.some(actor => actor.id === shot.targetId && actor.hp === 0)
    const aftermath = knocksOut ? arenaMotionMs.shutdown : arenaMotionMs.impact
    durationMs = Math.max(durationMs, arenaShotImpactMs({ fireAtMs }, shot) + aftermath)
  }
  return { moveMs, fireAtMs, durationMs }
}
