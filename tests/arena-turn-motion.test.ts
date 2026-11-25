import assert from 'node:assert/strict'
import test from 'node:test'
import type { ArenaActor, ArenaEvent } from '../src/shared/advanced'
import { arenaMotionMs, arenaPulseFlightMs, arenaShotImpactMs, arenaTurnTiming } from '../src/web/arenaTurnMotion'

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

test('the moving target settles before impact, and the round includes the complete shutdown at every speed', () => {
  const pulse = shot('rival', 'player', 20)
  const nearby = shot('other', 'player', 1)
  for (const speed of [0.5, 1, 2] as const) {
    const timing = arenaTurnTiming([{ actorId: 'player', action: 'move', direction: 'left' }, pulse, nearby], [actor('player', 0)], speed)
    assert.equal(timing.moveMs, arenaMotionMs.move)
    assert.ok(arenaShotImpactMs(timing, nearby) > timing.moveMs)
    assert.equal(timing.durationMs, arenaShotImpactMs(timing, pulse) + arenaMotionMs.shutdown / speed)
  }
})

test('a four-square attack has time to aim, track the pulse and see the hit even without a knockout', () => {
  const pulse = shot('player', 'bell', 4)
  const roster = [actor('player', 2), actor('bell', 1)]
  const normal = arenaTurnTiming([pulse], roster)
  assert.ok(normal.fireAtMs >= 750)
  assert.ok(arenaPulseFlightMs(pulse) >= 1500)
  assert.ok(normal.durationMs - arenaShotImpactMs(normal, pulse) >= 800)
  assert.ok(normal.durationMs <= 3100)
  for (const speed of [0.5, 2] as const) {
    const timing = arenaTurnTiming([pulse], roster, speed)
    assert.equal(arenaShotImpactMs(timing, pulse), arenaShotImpactMs(normal, pulse) / speed)
    assert.equal(timing.durationMs, normal.durationMs / speed)
  }
})
