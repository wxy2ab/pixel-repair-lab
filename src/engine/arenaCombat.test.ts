import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ArenaLevel, ArenaOpponent } from '../shared/advanced'
import { ArenaSession, runArena } from './arena'
import { RealtimeArenaSession } from './realtimeArena'
import { validateRealtimeArenaCheckpoint } from './realtimeProtocol'

const title = { zh: '试验场', en: 'Test floor' }
function rival(id: string, x: number, y = 1, style: 'sentry' | 'hunter' = 'sentry'): ArenaOpponent {
  return { id, title, start: { x, y }, policy: { kind: 'duelist', style } }
}
function floor(properties: Partial<ArenaLevel> = {}): ArenaLevel {
  return { version: 1, id: 'test-floor', kind: 'arena', order: 1, title, concept: title, brief: title, hints: [],
    tiles: ['.........', '.........', '.........'], start: { x: 1, y: 1 }, items: [],
    opponents: [rival('red', 5)], combat: { health: 4, range: 5, buffs: [] },
    maxTurns: 40, objective: { kind: 'eliminate' }, starterCode: '', solutionCode: '', snippets: [], ...properties }
}

test('pulses stop at walls, range or the first live actor and record the exact visible tiles', () => {
  const blocked = new ArenaSession(floor({ tiles: ['.........', '...#.....', '.........'] }))
  assert.deepEqual(blocked.advance('shoot-right')?.frame.events[0].path, [{ x: 2, y: 1 }])
  assert.equal(blocked.state.actors[1].hp, 4)
  const outOfRange = new ArenaSession(floor({ opponents: [rival('red', 8)] }))
  assert.equal(outOfRange.advance('shoot-right')?.frame.events[0].path?.length, 5)
  const match = new ArenaSession(floor({ opponents: [rival('red', 4), rival('blue', 5)] }))
  const events = match.advance('shoot-right')!.frame.events
  assert.equal(events[0].targetId, 'red')
  assert.equal(events[0].damage, 1)
  assert.equal(events[2].action, 'wait')
  assert.deepEqual(match.state.actors.map(actor => actor.hp), [3, 3, 4])
})

test('both sides shoot on the last turn, even when the simultaneous exchange disables both', () => {
  const level = floor({ combat: { health: 1, range: 5, buffs: [] }, maxTurns: 1 })
  const result = runArena(level, 'shoot("right")')
  assert.equal(result.outcome, 'draw')
  assert.equal(result.reason, 'disabled')
  assert.deepEqual(result.final.actors.map(actor => actor.hp), [0, 0])
})

test('a switch pickup opens its gates for the next turn once, even without a shift schedule', () => {
  const gate = { x: 3, y: 1 }
  const level = floor({ tiles: ['.........', '...#.....', '.........'], items: [{ id: 'panel', x: 1, y: 1 }],
    combat: { health: 4, range: 5, buffs: [], switches: [{ itemId: 'panel', open: [gate] }] } })
  const match = new ArenaSession(level)
  const before = match.scan()
  assert.deepEqual(before.switches, level.combat?.switches)
  assert.deepEqual(match.advance('shoot-right')!.frame.events[0].path, [{ x: 2, y: 1 }])
  const press = match.advance('pick')!.frame
  assert.deepEqual(press.events[0].opened, [gate])
  assert.equal(press.events[1].action, 'wait')
  assert.deepEqual(press.state.items, [])
  assert.equal(match.scan().tiles[1][3], '.')
  assert.equal(before.tiles[1][3], '#')
  assert.equal(level.tiles[1][3], '#')
  assert.equal(match.advance('shoot-right')!.frame.events[0].targetId, 'red')
  assert.equal(match.advance('pick')!.frame.events[0].blocked, true)
})

test('a rival on a switch can open a gate after the scheduled shift closes it', () => {
  const gate = { x: 3, y: 1 }
  const level = floor({ tiles: ['.........', '...#.....', '.........'], items: [{ id: 'panel', x: 1, y: 2 }],
    combat: { health: 4, range: 5, buffs: [], switches: [{ itemId: 'panel', open: [gate] }] },
    shifts: [{ turn: 1, open: [gate], moveItems: [{ id: 'panel', x: 5, y: 1 }] }, { turn: 2, close: [gate] }] })
  const match = new ArenaSession(level)
  assert.deepEqual(match.advance('wait')!.frame.shift?.opened, [gate])
  const second = match.advance('wait')!.frame
  assert.deepEqual(second.shift?.closed, [gate])
  assert.equal(second.events[1].actorId, 'red')
  assert.equal(second.events[1].itemId, 'panel')
  assert.deepEqual(second.events[1].opened, [gate])
  assert.equal(second.state.tiles![1][3], '.')
})

test('stacked chip benefits cap at three and start on the actual pickup turn', () => {
  const items = [1, 2, 3, 4].map(x => ({ id: 'boost-' + x, x, y: 1 }))
  const level = floor({ start: { x: 0, y: 1 }, items, opponents: [rival('red', 8)],
    combat: { health: 4, range: 4, buffs: items.map(({ id }) => ({ id, kind: 'power' })) } })
  const match = new ArenaSession(level)
  for (let i = 1; i <= 4; i++) {
    match.advance('right')
    assert.equal(match.advance('pick')?.frame.events[0].buff, 'power')
    assert.equal(match.state.actors[0].power, Math.min(3, i))
  }
  assert.deepEqual(match.scan().collected, items.map(item => item.id))
  match.advance('guard')
  const finish = match.advance('shoot-right')!
  assert.deepEqual(finish.decision, { outcome: 'win', reason: 'eliminate' })
  assert.equal(finish.frame.events[0].damage, 4)
  assert.equal(finish.frame.state.actors[1].hp, 0)
})

test('guard reduces each incoming shot before stored shields, and defense expires on the next turn', () => {
  const level = floor({ items: [{ id: 'bubble', x: 1, y: 1 }], opponents: [rival('red', 4), rival('gold', 1, 0)],
    combat: { health: 5, range: 5, buffs: [{ id: 'bubble', kind: 'shield' }] } })
  const match = new ArenaSession(level)
  const first = match.advance('pick')!.frame
  assert.equal(first.state.actors[0].hp, 4)
  assert.equal(first.state.actors[0].shield, 0)
  const guarded = match.advance('guard')!.frame
  assert.deepEqual(guarded.events.slice(1).map(event => [event.damage, event.absorbed]), [[0, 1], [0, 1]])
  const third = match.advance('shoot-right')!.frame
  assert.deepEqual(third.events.slice(1).map(event => event.action), ['guard', 'guard'])
  assert.equal(third.events[0].damage, 0)
  assert.equal(match.advance('wait')?.frame.state.actors[0].hp, 2)
})

test('hunters close in, shots can be dodged, and two combatants cannot enter the same cell', () => {
  const match = new ArenaSession(floor({ start: { x: 1, y: 0 }, opponents: [rival('red', 3, 2, 'hunter')] }))
  assert.equal(match.advance('wait')?.frame.events[1].action, 'move')
  const crossing = new ArenaSession(floor({ opponents: [rival('red', 1, 0)] }))
  const dodged = crossing.advance('right')!.frame
  assert.equal(dodged.events[1].action, 'shoot')
  assert.equal(dodged.events[1].targetId, undefined)
  assert.equal(dodged.state.actors[0].hp, 4)
  const patrol = { ...rival('red', 3), policy: { kind: 'patrol' as const, path: [{ x: 3, y: 1 }, { x: 2, y: 1 }] } }
  const tie = new ArenaSession(floor({ opponents: [patrol] })).advance('right')!.frame
  assert.deepEqual(tie.events.map(event => event.blocked), [true, true])
  assert.deepEqual(tie.state.actors.map(actor => actor.x), [1, 3])
})

test('combat can be won by collecting the requested item or simply reaching the exit', () => {
  const level = floor({ items: [{ id: 'parcel', x: 1, y: 1 }], objective: { kind: 'collect', itemIds: ['parcel'] } })
  const match = runArena(level, 'pick()')
  assert.equal(match.reason, 'collect')
  assert.equal(match.won, true)
  assert.equal(match.final.actors[1].hp, 4)
  const escape = runArena({ ...level, maxTurns: 1, objective: { kind: 'escape', exit: { x: 2, y: 1 }, itemIds: [] } }, 'move("right")')
  assert.equal(escape.reason, 'escape')
  assert.equal(escape.won, true)
})

test('final-turn goals use the post-pulse state and earlier scans stay intact', () => {
  const item = { id: 'parcel', x: 1, y: 1 }
  const collect = floor({ items: [item], objective: { kind: 'collect', itemIds: ['parcel'] }, maxTurns: 1,
    combat: { health: 1, range: 5, buffs: [] } })
  const match = new ArenaSession(collect)
  const before = match.scan()
  assert.equal(match.advance('pick')?.decision?.reason, 'disabled')
  assert.deepEqual(match.scan().collected, ['parcel'])
  assert.deepEqual(before.collected, [])
  assert.deepEqual(before.items, [item])
  assert.equal(before.self?.hp, 1)
  assert.equal(runArena({ ...collect, objective: { kind: 'escape', exit: { x: 1, y: 1 }, itemIds: ['parcel'] } }, 'pick()').won, false)
  const score = floor({ items: [item], objective: { kind: 'score' }, maxTurns: 1 })
  const victory = runArena(score, 'pick()')
  assert.equal(victory.won, true)
  assert.equal(victory.final.actors[0].hp, 3)
})

test('a deactivated rival no longer acts, occupies a square or intercepts a pulse', () => {
  const red: ArenaOpponent = { ...rival('red', 2), policy: { kind: 'patrol', path: [{ x: 2, y: 1 }] } }
  const match = new ArenaSession(floor({ opponents: [red, rival('blue', 5)],
    items: [{ id: 'chip', x: 1, y: 1 }], combat: { health: 2, range: 5, buffs: [{ id: 'chip', kind: 'power' }] } }))
  match.advance('pick')
  const finishRed = match.advance('shoot-right')!
  assert.equal(finishRed.frame.state.actors[1].hp, 0)
  assert.equal(finishRed.frame.events[0].targetId, 'red')
  const through = match.advance('shoot-right')!.frame
  assert.equal(through.events[0].targetId, 'blue')
  assert.ok(through.events.every(event => event.actorId !== 'red'))
  assert.equal(match.advance('right')?.frame.state.actors[0].x, 2)
})

test('manual actions, live policy, saved matches and Python produce the same combat state', () => {
  const level = floor()
  const live = new RealtimeArenaSession(level)
  live.queueAction('shoot-right')
  live.tick()
  assert.equal(live.setPolicy('def decide(state):\n    if state["self"]["hp"] < 4:\n        return "guard"\n    return "shoot-right"').active, true)
  const checkpoint = validateRealtimeArenaCheckpoint({ ...live.progress, remainingMs: 500 }, level.maxTurns, true)!
  assert.ok(checkpoint)
  assert.equal(validateRealtimeArenaCheckpoint(checkpoint, level.maxTurns), undefined)
  const restored = RealtimeArenaSession.restore(level, checkpoint)!
  assert.deepEqual(restored.tick(), live.tick())
  const run = runArena(level, 'shoot("right")\nguard()')
  assert.deepEqual(restored.snapshot, run.final)
  const classic = new RealtimeArenaSession(floor({ combat: undefined, objective: { kind: 'score' } }))
  assert.equal(classic.queueAction('shoot-right'), false)
  assert.equal(classic.setPolicy('def decide(state):\n    return "guard"').active, false)
})
