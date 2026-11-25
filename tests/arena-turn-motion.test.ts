import assert from 'node:assert/strict'
import test from 'node:test'
import { ARENA_TURN_MS } from '../src/engine/realtimeProtocol'
import type { ArenaActor, ArenaEvent } from '../src/shared/advanced'
import { arenaMotionMs, arenaShotImpactMs, arenaTurnTiming } from '../src/web/arenaTurnMotion'

const actor = (id: string, hp: number): ArenaActor => ({ id, x: 0, y: 0, score: 0, hp })
const shot = (actorId: string, targetId: string, distance: number): ArenaEvent => ({
  actorId, targetId, action: 'shoot', direction: 'right', damage: 1,
  path: Array.from({ length: distance }, (_, x) => ({ x: x + 1, y: 0 })),
})

test('a shared volley gives each target time to react at its own point of impact', () => {
  const near = shot('player', 'bell', 1)
  const far = shot('rival', 'player', 5)
  const timing = arenaTurnTiming([near, far], [actor('player', 2), actor('bell', 0)])
  const first = arenaShotImpactMs(timing, near)
  const second = arenaShotImpactMs(timing, far)
  assert.ok(first < second)
  assert.equal(timing.durationMs, Math.max(first + arenaMotionMs.shutdown, second + arenaMotionMs.impact))
})

test('a long-distance knockout after a move settles before the next live turn', () => {
  const pulse = shot('rival', 'player', 20)
  const nearby = shot('other', 'player', 1)
  const timing = arenaTurnTiming([{ actorId: 'player', action: 'move', direction: 'left' }, pulse, nearby], [actor('player', 0)])
  assert.ok(timing.fireAtMs < timing.moveMs)
  assert.ok(arenaShotImpactMs(timing, nearby) > timing.moveMs)
  assert.equal(timing.durationMs, arenaShotImpactMs(timing, pulse) + arenaMotionMs.shutdown)
  assert.ok(timing.durationMs < ARENA_TURN_MS)
})
