import type { ArenaActor, ArenaEvent } from '../shared/advanced'

export type ArenaAttackSpeed = 0.5 | 1 | 2

/** Browser frame time shared by the WebGL scene, flat sprites and combat HUD. */
export class ArenaVolleyClock {
  private lastFrame?: number
  private readonly animations = new Set<Animation>()
  elapsed: number

  constructor(offset: number, private readonly duration: number) {
    this.elapsed = offset
  }

  draw(now: number) {
    // One expensive paint or a suspended main thread must not consume an entire flight.
    const delta = Math.min(125, Math.max(0, now - (this.lastFrame ?? now)))
    this.lastFrame = now
    this.elapsed = Math.min(this.duration, this.elapsed + delta)
    for (const animation of this.animations) animation.currentTime = this.elapsed
  }

  bind(animation: Animation) {
    animation.pause()
    animation.currentTime = this.elapsed
    this.animations.add(animation)
    return () => {
      this.animations.delete(animation)
      animation.cancel()
    }
  }
}

export type ArenaTurnMotion = {
  turn: number
  startedAt: number
  clock?: ArenaVolleyClock
  /** Elapsed time frozen while the battlefield is unavailable. */
  heldAt?: number
  from: readonly ArenaActor[]
  to: readonly ArenaActor[]
  events: readonly ArenaEvent[]
  attackSpeed: ArenaAttackSpeed
  moveMs: number
  windupMs: number
  recoilMs: number
  impactMs: number
  shutdownMs: number
  fireAtMs: number
  durationMs: number
}

export const arenaMotionMs = {
  move: 520,
  windup: 750,
  recoil: 585,
  impact: 800,
  shutdown: 1300,
} as const

export function arenaElapsed(motion: ArenaTurnMotion, now: number) {
  return motion.heldAt ?? motion.clock?.elapsed ?? Math.max(0, now - motion.startedAt)
}

export function syncArenaAnimation(animation: Animation, motion: ArenaTurnMotion) {
  if (motion.clock) return motion.clock.bind(animation)
  if (motion.heldAt === undefined) animation.startTime = motion.startedAt
  else {
    animation.pause()
    animation.currentTime = motion.heldAt
  }
  return () => animation.cancel()
}

/** Pulses follow the engine's traced cells, including shots stopped by the first wall. */
export function arenaPulseFlightMs(shot: ArenaEvent, speed: ArenaAttackSpeed = 1) {
  return Math.min(2000, 900 + (shot.path?.length ?? 0) * 150) / speed
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

export function arenaShotImpactMs(motion: Pick<ArenaTurnMotion, 'fireAtMs' | 'attackSpeed'>, shot: ArenaEvent) {
  return motion.fireAtMs + arenaPulseFlightMs(shot, motion.attackSpeed)
}

export function arenaTurnTiming(events: readonly ArenaEvent[], actors: readonly ArenaActor[], attackSpeed: ArenaAttackSpeed = 1) {
  const moveMs = events.some(event => event.action === 'move') ? arenaMotionMs.move : 0
  const shots = events.filter(event => event.action === 'shoot')
  const windupMs = arenaMotionMs.windup / attackSpeed
  const recoilMs = arenaMotionMs.recoil / attackSpeed
  const impactMs = arenaMotionMs.impact / attackSpeed
  const shutdownMs = arenaMotionMs.shutdown / attackSpeed
  // A shooter can aim while a neighbour walks. Even the shortest shot lands after the feet settle.
  const fireAtMs = shots.length ? Math.max(windupMs, moveMs - 40) : 0
  let durationMs = moveMs || (events.some(event => event.action === 'guard' || event.action === 'pick') ? 330 : 0)
  for (const shot of shots) {
    const knocksOut = !!shot.damage && actors.some(actor => actor.id === shot.targetId && actor.hp === 0)
    const aftermath = knocksOut ? shutdownMs : impactMs
    durationMs = Math.max(durationMs, arenaShotImpactMs({ fireAtMs, attackSpeed }, shot) + aftermath)
  }
  return { attackSpeed, moveMs, windupMs, recoilMs, impactMs, shutdownMs, fireAtMs, durationMs }
}
