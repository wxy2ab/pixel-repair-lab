import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ArenaLevel } from '../shared/advanced'
import { RealtimeArenaSession } from './realtimeArena'
import { ARENA_TURN_MS, validateRealtimeArenaCheckpoint } from './realtimeProtocol'

function load(name: string): ArenaLevel {
  return JSON.parse(readFileSync(new URL(`../../levels/${name}.json`, import.meta.url), 'utf8')) as ArenaLevel
}

const escape = load('24-escape-patrol')
const score = load('23-parts-race')
const winningPolicy = 'def decide(state):\n    turn = state["turn"]\n    if turn in [1, 3, 5, 7]:\n        return "pick"\n    if turn == 6:\n        return "down"\n    return "right"'

test('idle turns wait while rivals advance and catch the player', () => {
  const match = new RealtimeArenaSession(escape)
  assert.equal(match.snapshot.turn, 0)
  const first = match.tick()!
  assert.equal(first.frame.events[0].action, 'wait')
  assert.equal(first.frame.events[1].action, 'move')
  assert.equal(first.result, undefined)
  match.tick()
  const caught = match.tick()!
  assert.equal(caught.result?.reason, 'caught')
  assert.equal(caught.result?.won, false)
  assert.equal(match.tick(), undefined)
})

test('validated policies use the latest snapshot and a manual action overrides one turn', () => {
  const match = new RealtimeArenaSession(score)
  const source = `from algorithms import shortest_step
def decide(state):
    if state["player"] == [2, 2]:
        return "pick"
    return shortest_step(state["tiles"], state["player"], [2, 2])`
  assert.deepEqual(match.setPolicy(source), { active: true })
  assert.equal(match.snapshot.turn, 0)
  match.queueAction('wait')
  const manual = match.tick()!
  assert.equal(manual.frame.events[0].action, 'wait')
  assert.equal(manual.policyStep, undefined)
  const move = match.tick()!
  assert.equal(move.frame.events[0].direction, 'right')
  assert.equal(move.policyStep?.line, 5)
  assert.equal(move.policyStep?.source, source)
  const pick = match.tick()!
  assert.equal(pick.frame.events[0].itemId, 'bolt')
  assert.equal(pick.policyStep?.line, 4)
})

test('live policies may import a declared course helper', () => {
  const course = { race_direction: 'def race_direction():\n    return "right"' }
  const policy = 'from algorithms import race_direction\ndef decide(state):\n    return race_direction()'
  const match = new RealtimeArenaSession({ ...score, helpers: ['race_direction'] }, undefined, course)
  assert.deepEqual(match.setPolicy(policy), { active: true })
  assert.equal(match.tick()?.frame.events[0].direction, 'right')
  assert.equal(new RealtimeArenaSession(score, undefined, course).setPolicy(policy).issue?.code, 'unknownName')
})

test('only executing a policy captures its real function and control steps', () => {
  const personal = { choose_move: 'def choose_move():\n    while False:\n        pass\n    return "right"' }
  const match = new RealtimeArenaSession(score, personal)
  const source = 'from my_algorithms import choose_move\ndef decide(state):\n    for n in [1]:\n        if n == 1:\n            return choose_move()'
  assert.deepEqual(match.setPolicy(source), { active: true })
  assert.equal(match.latestFrame, undefined)
  const run = match.tick()!
  assert.deepEqual(run.policyStep?.flow?.map(event => event.kind), ['call', 'for', 'if', 'call', 'while', 'return', 'return'])
  assert.equal(run.policyStep?.flow?.[4].sourceName, 'my_algorithms.choose_move.py')
  assert.equal(run.frame.events[0].direction, 'right')
  assert.equal(run.frame.state.turn, 1)
  match.queueAction('wait')
  assert.equal(match.tick()!.policyStep, undefined)
})

test('validation rejects bad replacements and a later policy error falls back to waiting', () => {
  const match = new RealtimeArenaSession(score)
  const draft = 'def decide(state):\n    if state["turn"] == 0:\n        return "right"\n    return "jump"'
  assert.deepEqual(match.setPolicy(draft), { active: true })
  assert.deepEqual(match.setPolicy('def decide(state):\n    while True:\n        pass').active, true)
  assert.equal(match.tick()?.frame.events[0].direction, 'right')
  const invalid = match.tick()!
  assert.equal(invalid.frame.events[0].action, 'wait')
  assert.equal(invalid.issue?.detail, 'decide')
  assert.equal(invalid.policyStep?.line, 4)
  const idle = match.tick()!
  assert.equal(idle.issue, undefined)
  assert.equal(idle.policyStep, undefined)
})

test('a timed score run ends with the normal race score and result', () => {
  const match = new RealtimeArenaSession(score)
  assert.deepEqual(match.setPolicy(winningPolicy), { active: true })
  for (let turn = 0; turn < 7; turn++) assert.equal(match.tick()?.result, undefined)
  const victory = match.tick()?.result
  assert.equal(victory?.won, true)
  assert.equal(victory?.reason, 'score')
  assert.deepEqual(victory?.final.actors.map(({ score }) => score), [4, 1, 2])
})

test('restoring replays actual choices and resumes the queued move and live policy', () => {
  const original = new RealtimeArenaSession(score)
  original.setPolicy(winningPolicy)
  original.tick()
  original.tick()
  original.tick()
  original.queueAction('pick')

  const checkpoint = validateRealtimeArenaCheckpoint({ ...original.progress, remainingMs: 600 }, score.maxTurns)!
  assert.deepEqual(checkpoint.actions, ['right', 'pick', 'right'])
  const restored = RealtimeArenaSession.restore(score, checkpoint)!
  assert.deepEqual(restored.snapshot, original.snapshot)
  assert.deepEqual(restored.latestFrame, original.latestFrame)
  for (let turn = 4; turn <= 8; turn++) {
    const expected = original.tick()
    const actual = restored.tick()
    assert.deepEqual(actual, expected)
    if (turn === 8) assert.deepEqual(actual?.result?.frames.map(({ state }) => state.turn), [1, 2, 3, 4, 5, 6, 7, 8])
  }
  assert.equal(restored.tick(), undefined)
})

test('a policy accepted earlier is restored even when it fails on the next turn', () => {
  const original = new RealtimeArenaSession(score)
  const source = 'def decide(state):\n    if state["turn"] == 0:\n        return "right"\n    return "jump"'
  assert.deepEqual(original.setPolicy(source), { active: true })
  original.tick()
  const restored = RealtimeArenaSession.restore(score, original.progress)!
  assert.equal(restored.progress.policy, source)
  assert.deepEqual(restored.tick(), original.tick())
  assert.equal(restored.progress.policy, undefined)
  assert.equal(restored.progress.actions.at(-1), 'wait')
})

test('a checkpoint whose history already ended the match is rejected', () => {
  const completed = { actions: ['wait', 'wait', 'wait'], remainingMs: 250 }
  const checkpoint = validateRealtimeArenaCheckpoint(completed, escape.maxTurns)!
  assert.equal(RealtimeArenaSession.restore(escape, checkpoint), undefined)
})

test('checkpoint data requires valid choices, timing and a pending turn', () => {
  const bare = { actions: [], remainingMs: 0 }
  assert.deepEqual(validateRealtimeArenaCheckpoint(bare, 3)?.actions, [])
  assert.equal(validateRealtimeArenaCheckpoint({ ...bare, queued: 'pick', remainingMs: ARENA_TURN_MS }, 3)?.queued, 'pick')
  for (const invalid of [
    { ...bare, actions: [undefined] },
    { ...bare, actions: ['wait', 'wait', 'wait'] },
    { ...bare, actions: ['jump'] },
    { ...bare, policy: ' '.repeat(10) },
    { ...bare, policy: 'a'.repeat(12_001) },
    { ...bare, queued: 'jump' },
    { ...bare, remainingMs: NaN },
    { ...bare, remainingMs: -1 },
    { ...bare, remainingMs: ARENA_TURN_MS + 1 },
  ]) {
    assert.equal(validateRealtimeArenaCheckpoint(invalid, 3), undefined)
  }
})
