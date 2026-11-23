import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ArenaLevel } from '../shared/advanced'
import { validateLevel } from '../shared/validate'
import { ArenaSession, observeArenaMaps, runArena } from './arena'
import { RealtimeArenaSession } from './realtimeArena'

const race = JSON.parse(readFileSync(new URL('../../levels/23-parts-race.json', import.meta.url), 'utf8')) as ArenaLevel
const shiftRace: ArenaLevel = {
  ...race,
  variants: [],
  tiles: ['#######', '#..#..#', '#.....#', '#######'],
  start: { x: 1, y: 1 },
  items: [{ id: 'claimed', x: 1, y: 1 }, { id: 'moving', x: 2, y: 2 }],
  opponents: [{
    ...race.opponents[0],
    start: { x: 5, y: 2 },
    policy: { kind: 'patrol', path: [{ x: 5, y: 2 }] },
  }],
  maxTurns: 5,
  shifts: [
    {
      turn: 1,
      open: [{ x: 3, y: 1 }],
      moveItems: [{ id: 'claimed', x: 5, y: 1 }, { id: 'moving', x: 3, y: 1 }],
      close: [{ x: 2, y: 2 }, { x: 1, y: 1 }, { x: 5, y: 2 }],
    },
    { turn: 2, open: [{ x: 2, y: 2 }] },
    { turn: 3, close: [{ x: 3, y: 1 }] },
  ],
}

test('turns resolve pickups before moving batteries and safely changing gates', () => {
  assert.deepEqual(validateLevel(shiftRace).issues, [])
  const session = new ArenaSession(shiftRace)
  assert.deepEqual(session.state.tiles, shiftRace.tiles)
  const first = session.advance('pick')!.frame
  assert.equal(first.events[0].itemId, 'claimed')
  assert.deepEqual(first.shift, {
    turn: 1,
    opened: [{ x: 3, y: 1 }],
    closed: [{ x: 2, y: 2 }],
    blocked: [{ x: 1, y: 1 }, { x: 5, y: 2 }],
    relocated: [{ id: 'moving', from: { x: 2, y: 2 }, to: { x: 3, y: 1 } }],
  })
  assert.deepEqual(first.state.items, [{ id: 'moving', x: 3, y: 1 }])
  assert.deepEqual(first.state.tiles, ['#######', '#.....#', '#.#...#', '#######'])
  session.advance('right')
  const third = session.advance('wait')!.frame
  assert.deepEqual(third.shift?.blocked, [{ x: 3, y: 1 }])
  assert.deepEqual(third.state.tiles, ['#######', '#.....#', '#.....#', '#######'])
  assert.equal(first.state.tiles?.[2], '#.#...#')
  assert.equal(shiftRace.tiles[1], '#..#..#')
  assert.deepEqual(shiftRace.items, [{ id: 'claimed', x: 1, y: 1 }, { id: 'moving', x: 2, y: 2 }])
})

test('observing waits on each map, including after a previous map would be lost', () => {
  const chaser: ArenaLevel = { ...shiftRace, start: { x: 4, y: 2 },
    objective: { kind: 'escape', exit: { x: 1, y: 1 }, itemIds: ['moving'] },
    opponents: [{ ...shiftRace.opponents[0], policy: { kind: 'pursue' } }],
    variants: [{ start: shiftRace.start, objective: { kind: 'score' }, opponents: shiftRace.opponents }],
  }
  const [caught, shifting] = observeArenaMaps(chaser)
  assert.equal(caught.length, 1)
  assert.equal(shifting.length, shiftRace.maxTurns)
  assert.deepEqual(shifting[0].shift?.opened, [{ x: 3, y: 1 }])
  assert.ok(shifting[0].shift?.relocated.some(move => move.id === 'moving'))
  assert.ok(shifting.every(frame => frame.events[0].action === 'wait' && frame.line === 0))
  assert.deepEqual(shifting.at(-1)?.state.actors[0], { ...shiftRace.start, id: 'player', score: 0 })
  assert.equal(chaser.tiles[1], '#..#..#')
})

test('manual, realtime policy and Python scan follow the same changing map', () => {
  const manual = new RealtimeArenaSession(shiftRace)
  for (const action of ['pick', 'right', 'right', 'pick'] as const) {
    manual.queueAction(action)
    const last = manual.tick()!
    if (last.result) assert.equal(last.result.won, true)
  }
  assert.equal(manual.tick(), undefined)
  const live = new RealtimeArenaSession(shiftRace)
  const policy = `def decide(state):
    if state["nextShift"] == 1:
        return "pick"
    if state["playerScore"] == 1 and state["tiles"][1][3] == "." and state["items"][0]["x"] == 3:
        if state["player"][0] == 3:
            return "pick"
        return "right"
    return "wait"`
  assert.deepEqual(live.setPolicy(policy), { active: true })
  const liveFrames = Array.from({ length: 4 }, () => live.tick()!.frame)
  assert.deepEqual(live.snapshot, manual.snapshot)
  assert.equal(live.tick(), undefined)

  const source = `if scan()["nextShift"] == 1:
    pick()
state = scan()
if state["playerScore"] == 1 and state["nextShift"] == 2 and state["tiles"][1][3] == "." and state["items"][0]["x"] == 3:
    move("right")
    move("right")
if scan()["nextShift"] == None:
    pick()`
  const scripted = runArena(shiftRace, source)
  assert.equal(scripted.won, true)
  assert.deepEqual(scripted.frames.map(frame => ({ ...frame, line: 0 })), liveFrames)
  assert.deepEqual(scripted.final, manual.snapshot)
})

test('restoring a live match keeps earlier claims and dynamic gates in the final replay', () => {
  const original = new RealtimeArenaSession(shiftRace)
  original.queueAction('pick')
  const first = original.tick()!
  original.queueAction('right')
  const second = original.tick()!
  const restored = RealtimeArenaSession.restore(shiftRace, original.progress)!

  assert.deepEqual(restored.snapshot, second.frame.state)
  assert.deepEqual(restored.latestShift, second.frame.shift)
  assert.equal(restored.snapshot.actors[0].score, 1)
  assert.deepEqual(restored.snapshot.items, [{ id: 'moving', x: 3, y: 1 }])
  restored.queueAction('right')
  restored.tick()
  restored.queueAction('pick')
  const result = restored.tick()!.result!
  assert.equal(result.won, true)
  assert.deepEqual(result.frames.slice(0, 2), [first.frame, second.frame])
  assert.deepEqual(result.frames.slice(2).map(frame => frame.state.turn), [3, 4])
})

test('arena diagnosis reports the failing variant without replacing the primary replay', () => {
  const variant = { start: { x: 2, y: 1 }, maxTurns: 1 }
  const scripted = runArena({ ...shiftRace, variants: [variant, { start: { x: 1, y: 2 } }] }, 'pick()')
  assert.equal(scripted.passedCases, 1)
  assert.equal(scripted.issue?.code, 'variant')
  assert.equal(scripted.final.actors[0].score, 1)
  assert.deepEqual(scripted.failure, { turn: 1, issue: undefined, goal: 'score', score: 0, leaderScore: 0 })
  assert.equal(scripted.totalCases, 3)
  assert.equal(scripted.variantFrames?.length, 1)
  assert.deepEqual(scripted.variantFrames?.[0][0].state.actors[0], { ...variant.start, id: 'player', score: 0 })

  const live = new RealtimeArenaSession({ ...shiftRace, ...variant })
  assert.deepEqual(live.tick()?.result?.failure, scripted.failure)
})

test('adaptive rivals change their target and direction when the score changes', () => {
  const level: ArenaLevel = {
    ...shiftRace,
    shifts: undefined,
    tiles: ['#######', '#.....#', '#.....#', '#.....#', '#######'],
    start: { x: 1, y: 3 },
    items: [{ id: 'safe', x: 3, y: 1 }, { id: 'contested', x: 2, y: 3 }, { id: 'player-battery', x: 1, y: 3 }],
    opponents: [{ ...race.opponents[0], start: { x: 3, y: 3 }, policy: { kind: 'adaptive', style: 'secure' } }],
  }
  const tied = new ArenaSession(level)
  const trailing = new ArenaSession(level)
  const tiedFirst = tied.advance('wait')!.frame
  const trailingFirst = trailing.advance('pick')!.frame
  assert.deepEqual(tiedFirst.events[1], trailingFirst.events[1])
  assert.equal(trailingFirst.state.actors[0].score, 1)
  for (const [session, tactic, targetId, direction] of [
    [tied, 'secure', 'safe', 'up'],
    [trailing, 'contest', 'contested', 'down'],
  ] as const) {
    assert.deepEqual(session.advance('wait')!.frame.events[1], {
      actorId: race.opponents[0].id, action: 'move', direction, tactic, targetId,
    })
  }

  const indirect = new ArenaSession({ ...level, tiles: ['#######', '#.....#', '#..#..#', '#.....#', '#######'] })
  assert.deepEqual(indirect.advance('wait')!.frame.events[1], {
    actorId: race.opponents[0].id, action: 'move', direction: 'left', tactic: 'secure', targetId: 'contested',
  })
})

test('arena validation rejects incompatible terrain and battery shifts in variants', () => {
  const { issues } = validateLevel({
    ...shiftRace,
    variants: [{
      shifts: [
        {
          turn: 1,
          open: [{ x: 6, y: 4 }, { x: 3, y: 1 }],
          close: [{ x: 3, y: 1 }],
          moveItems: [
            { id: 'missing-battery', x: 3, y: 1 },
            { id: 'moving', x: 1, y: 1 },
            { id: 'claimed', x: 0, y: 1 },
          ],
        },
        { turn: 1, open: [{ x: 3, y: 1 }] },
        { turn: 5, open: [{ x: 3, y: 1 }] },
      ],
    }],
  })
  assert.deepEqual(
    issues.map(({ path, code }) => [path, code]),
    [
      ['/variants/0/shifts/0/open/0', 'arena-shift'],
      ['/variants/0/shifts/0/moveItems/0/id', 'arena-shift'],
      ['/variants/0/shifts/0/moveItems/1', 'arena-shift'],
      ['/variants/0/shifts/0/moveItems/2', 'arena-shift'],
      ['/variants/0/shifts/0/close/0', 'arena-shift'],
      ['/variants/0/shifts/1/turn', 'arena-shift'],
      ['/variants/0/shifts/2/turn', 'arena-shift'],
    ],
  )
})
