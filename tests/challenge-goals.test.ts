import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ArenaLevel } from '../src/shared/advanced'
import type { GridLevel } from '../src/shared/types'
import {
  adjustChallengeGoal, archiveChallengeGoal, buildChallengeGoal, challengeGoalMetrics, completedChallengeGoals, evaluateChallengeGoal,
  goalForScore, pendingChallengeGoals, readChallengeGoals, readChallengeGoalStore, recordChallengeGoalFailure,
  removeChallengeGoal, saveChallengeGoal, scoreAtGoalBaseline, serializeChallengeGoalStore, type ChallengeGoal, type ChallengeGoalMetricId,
} from '../src/web/challengeGoals'
import { readChallengeScores, updateChallengeScores, type ChallengeScore } from '../src/web/challengeScore'

function grid(turns: number, total = 1): ChallengeScore {
  return { kind: 'grid', turns, passed: total, total }
}

function arena(mode: 'timed' | 'relaxed', score: number,
  { goal = 'score', total = 1 }: { goal?: 'escape' | 'score'; total?: number } = {},
): Extract<ChallengeScore, { kind: 'arena' }> {
  return { kind: 'arena', mode, goal, turns: 10, score, passed: total, total }
}

function build(score: ChallengeScore, metricId: ChallengeGoalMetricId, improvement: number): ChallengeGoal {
  const goal = buildChallengeGoal(score, metricId, improvement)
  assert.ok(goal)
  return goal
}

test('a goal uses the selected win metric and rejects an improvement outside its range', () => {
  const score = arena('timed', 5)
  assert.deepEqual(challengeGoalMetrics(score), [
    { id: 'score', value: 5, preference: 'higher', improvementLimit: Number.MAX_SAFE_INTEGER - 5 },
    { id: 'turns', value: 10, preference: 'lower', improvementLimit: 10 },
  ])
  assert.deepEqual(buildChallengeGoal(score, 'score', 1), { metricId: 'score', baseline: 5, target: 6, preference: 'higher' })
  assert.deepEqual(buildChallengeGoal(score, 'turns', 2), { metricId: 'turns', baseline: 10, target: 8, preference: 'lower' })
  assert.equal(buildChallengeGoal(arena('timed', 5, { goal: 'escape' }), 'score', 1), undefined)
  assert.equal(buildChallengeGoal(score, 'checks', 1), undefined)
  for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(buildChallengeGoal(score, 'score', invalid), undefined)
  }
  assert.equal(buildChallengeGoal(grid(1), 'turns', 2), undefined)
  assert.equal(buildChallengeGoal({ kind: 'ai', mode: 'online', rounds: 1 }, 'rounds', 1), undefined)
  assert.equal(buildChallengeGoal({ kind: 'algorithm', passed: 3, total: 3, checks: 1 }, 'checks', 1), undefined)
  assert.equal(buildChallengeGoal({ kind: 'algorithm', passed: 2, total: 3, checks: 2 }, 'checks', 1), undefined)
  assert.equal(buildChallengeGoal({ kind: 'data', passed: 3, total: 3, checks: 2 }, 'checks', 1)?.target, 1)
})

test('shortfalls keep the original baseline and target until one win reaches it', () => {
  const goal = build(grid(12), 'turns', 3)
  const initial = saveChallengeGoal({}, 'salvage', grid(12), goal)
  const saved = { ...goal, lastReplayActual: null, attempts: 0, replays: [] }
  const missing = evaluateChallengeGoal(initial, 'salvage', grid(10))
  const updatedMiss = { ...goal, lastReplayActual: 10, attempts: 1, replays: [10] }
  assert.deepEqual(goalForScore(missing.goals, 'salvage', grid(10)), updatedMiss)
  assert.deepEqual(missing.result, { goal: saved, actual: 10, remaining: 1, achieved: false })
  assert.deepEqual(evaluateChallengeGoal(missing.goals, 'salvage', grid(14)).result, {
    goal: updatedMiss, actual: 14, remaining: 5, achieved: false,
  })
  assert.deepEqual(evaluateChallengeGoal(initial, 'salvage', { kind: 'grid', turns: 8, total: 1, passed: 0 }), { goals: initial })

  const reached = evaluateChallengeGoal(missing.goals, 'salvage', grid(9))
  assert.deepEqual(reached.result, { goal: updatedMiss, actual: 9, remaining: 0, achieved: true })
  assert.deepEqual(goalForScore(reached.goals, 'salvage', grid(9)), { ...updatedMiss, achieved: 9, lastReplayActual: 9, attempts: 2, replays: [10, 9] })
  assert.deepEqual(goalForScore(initial, 'salvage', grid(9)), saved)
  assert.deepEqual(evaluateChallengeGoal(reached.goals, 'salvage', grid(8)), { goals: reached.goals })
  assert.equal(saveChallengeGoal(reached.goals, 'salvage', grid(8), goal), reached.goals)

  const updated = saveChallengeGoal(reached.goals, 'salvage', grid(8), build(grid(8), 'turns', 8))
  const reachedZero = evaluateChallengeGoal(updated, 'salvage', grid(0))
  assert.equal(reachedZero.result?.achieved, true)
  assert.equal(goalForScore(reachedZero.goals, 'salvage', grid(0))?.achieved, 0)
  assert.equal(evaluateChallengeGoal(reachedZero.goals, 'salvage', grid(1)).result, undefined)
  assert.deepEqual(readChallengeGoals(JSON.stringify(reachedZero.goals)), reachedZero.goals)
})

test('levels, modes, score objectives and scenario counts retain separate goals', () => {
  const relaxed = arena('relaxed', 5)
  const timed = arena('timed', 8)
  const escape = arena('relaxed', 0, { goal: 'escape' })
  const variations = arena('relaxed', 5, { total: 2 })
  const relaxedGoal = { ...build(relaxed, 'score', 1), lastReplayActual: null, attempts: 0, replays: [] }
  const timedGoal = { ...build(timed, 'score', 2), lastReplayActual: null, attempts: 0, replays: [] }
  const escapeGoal = { ...build(escape, 'turns', 2), lastReplayActual: null, attempts: 0, replays: [] }
  const variationsGoal = { ...build(variations, 'turns', 1), lastReplayActual: null, attempts: 0, replays: [] }

  let goals = saveChallengeGoal({}, 'race', relaxed, relaxedGoal)
  goals = saveChallengeGoal(goals, 'race', timed, timedGoal)
  goals = saveChallengeGoal(goals, 'race', escape, escapeGoal)
  goals = saveChallengeGoal(goals, 'race', variations, variationsGoal)
  goals = saveChallengeGoal(goals, 'other-race', relaxed, build(relaxed, 'turns', 3))
  assert.deepEqual(readChallengeGoals(JSON.stringify(goals)), goals)

  const timedMiss = evaluateChallengeGoal(goals, 'race', arena('timed', 9))
  assert.deepEqual(timedMiss.result, { goal: timedGoal, actual: 9, remaining: 1, achieved: false })
  const relaxedWin = evaluateChallengeGoal(timedMiss.goals, 'race', arena('relaxed', 7))
  assert.deepEqual(relaxedWin.result, { goal: relaxedGoal, actual: 7, remaining: 0, achieved: true })
  assert.deepEqual(goalForScore(relaxedWin.goals, 'race', timed), { ...timedGoal, lastReplayActual: 9, attempts: 1, replays: [9] })
  assert.deepEqual(goalForScore(relaxedWin.goals, 'race', escape), escapeGoal)
  assert.deepEqual(goalForScore(relaxedWin.goals, 'race', variations), variationsGoal)
  assert.equal(goalForScore(relaxedWin.goals, 'other-race', relaxed)?.target, 7)

  const removed = removeChallengeGoal(relaxedWin.goals, 'race', relaxed)
  assert.equal(goalForScore(removed, 'race', relaxed), undefined)
  assert.deepEqual(goalForScore(removed, 'race', timed), { ...timedGoal, lastReplayActual: 9, attempts: 1, replays: [9] })
  assert.deepEqual(goalForScore(relaxedWin.goals, 'race', relaxed), { ...relaxedGoal, achieved: 7, lastReplayActual: 7, attempts: 1, replays: [7] })

  const offline = { kind: 'ai', mode: 'offline', rounds: 3 } satisfies ChallengeScore
  const ai = saveChallengeGoal(removed, 'supply', offline, build(offline, 'rounds', 1))
  assert.equal(goalForScore(ai, 'supply', { kind: 'ai', mode: 'online', rounds: 3 }), undefined)
  assert.deepEqual(readChallengeGoals(JSON.stringify(ai)), ai)
})

test('storage discards invalid series, targets and completion values independently', () => {
  for (const raw of [null, '', '???', '[]', '"text"', 'null', 'true']) assert.deepEqual(readChallengeGoals(raw), {})
  const valid = build(grid(8), 'turns', 2)
  const checks = { metricId: 'checks', baseline: 2, target: 0, preference: 'lower' }
  const raw = JSON.stringify({
    repairs: {
      'grid:1': valid,
      'grid:2': { ...valid, target: 9 },
      'grid:3': { ...valid, target: 8 },
      'grid:4': { ...valid, target: -1 },
      'grid:5': { ...valid, baseline: Number.MAX_SAFE_INTEGER + 1 },
      'grid:6': { ...valid, achieved: 7 },
      'grid:7': { ...valid, preference: 'higher' },
      'grid:8': { ...valid, achieved: '5' },
      'grid:9': { ...valid, lastReplayActual: -1 },
      'grid:10': { ...valid, lastReplayActual: 6 },
      'grid:11': { ...valid, attempts: -1 },
      'grid:0': valid,
      'grid:01': valid,
      'grid:9007199254740992': valid,
      'grid:2:1': valid,
      'ai:offline': valid,
      'algorithm:3': checks,
      'arena:timed:escape:1': { metricId: 'score', baseline: 3, target: 4, preference: 'higher' },
    },
    'invalid level': { 'grid:1': valid },
    invalid: 'text',
  })
  assert.deepEqual(readChallengeGoals(raw), { repairs: { 'grid:1': valid } })
})

const salvage = JSON.parse(readFileSync(new URL('../levels/1801-limited-battery-salvage.json', import.meta.url), 'utf8')) as GridLevel
const junction = JSON.parse(readFileSync(new URL('../levels/1803-junction-race.json', import.meta.url), 'utf8')) as ArenaLevel

test('the goal list distinguishes the baseline win from a later win with the same result and time', () => {
  const score = grid(17)
  const { id } = salvage
  let history = updateChallengeScores({}, id, score, 100).history
  let goals = saveChallengeGoal({}, id, score, build(score, 'turns', 2))
  assert.equal(pendingChallengeGoals([salvage], history, goals)[0]?.remaining, undefined)
  assert.equal(goalForScore(goals, id, score)?.lastReplayActual, null)

  history = updateChallengeScores(history, id, score, 100).history
  const replay = evaluateChallengeGoal(goals, id, score)
  goals = readChallengeGoals(JSON.stringify(replay.goals))
  history = readChallengeScores(JSON.stringify(history))
  assert.equal(pendingChallengeGoals([salvage], history, goals)[0]?.remaining, 2)

  const replacement = saveChallengeGoal(goals, id, score, build(score, 'turns', 3))
  assert.equal(pendingChallengeGoals([salvage], history, replacement)[0]?.remaining, undefined)
  const faster = grid(14)
  history = updateChallengeScores(history, id, faster, 100).history
  const reached = evaluateChallengeGoal(replacement, id, faster)
  assert.equal(reached.result?.achieved, true)
  assert.deepEqual(pendingChallengeGoals([salvage], history, reached.goals), [])
})

test('the goal list keeps independent replay modes and skips unavailable test sets and challenges', () => {
  const { id } = junction
  const timed = arena('timed', 5)
  const relaxed = arena('relaxed', 4, { total: (junction.variants?.length ?? 0) + 1 })
  const outdated = arena('relaxed', 3, { total: (junction.variants?.length ?? 0) + 3 })
  const wrongKind = grid(17)
  let history = updateChallengeScores({}, id, timed, 100).history
  history = updateChallengeScores(history, id, relaxed, 100).history
  history = updateChallengeScores(history, id, outdated, 100).history
  history = updateChallengeScores(history, id, wrongKind, 100).history
  history = updateChallengeScores(history, salvage.id, wrongKind, 100).history
  let goals = saveChallengeGoal({}, id, timed, build(timed, 'score', 2))
  goals = saveChallengeGoal(goals, id, relaxed, build(relaxed, 'score', 1))
  goals = saveChallengeGoal(goals, id, outdated, build(outdated, 'score', 1))
  goals = saveChallengeGoal(goals, id, wrongKind, build(wrongKind, 'turns', 2))
  goals = saveChallengeGoal(goals, salvage.id, wrongKind, build(wrongKind, 'turns', 2))
  const latestTimed = arena('timed', 6)
  history = updateChallengeScores(history, id, latestTimed, 200).history
  goals = evaluateChallengeGoal(goals, id, latestTimed).goals
  const entries = pendingChallengeGoals([junction], history, goals)
  assert.deepEqual(entries.map(entry => [entry.level.id, entry.score, entry.goal.target, entry.remaining]), [
    [id, latestTimed, 7, 1],
    [id, relaxed, 5, undefined],
  ])
  goals = removeChallengeGoal(goals, id, timed)
  assert.deepEqual(pendingChallengeGoals([junction], history, goals).map(entry => entry.score), [relaxed])
})

test('older goals retain documented shortfalls without counting a legacy baseline as a new win', () => {
  const score = grid(17)
  const { id } = salvage
  const oldGoal = { [id]: { 'grid:1': build(score, 'turns', 2) } }
  const oldScore = { [id]: { 'grid:1': { latest: score, best: score } } }
  assert.equal(pendingChallengeGoals([salvage], oldScore, oldGoal)[0]?.remaining, undefined)
  const { history } = updateChallengeScores(oldScore, id, grid(16), 100)
  assert.equal(pendingChallengeGoals([salvage], history, oldGoal)[0]?.remaining, 1)

  const tied = updateChallengeScores(history, id, score, 100).history
  const reviewed = evaluateChallengeGoal(oldGoal, id, score).goals
  assert.equal(pendingChallengeGoals([salvage], tied, reviewed)[0]?.remaining, 2)
  assert.equal(goalForScore(readChallengeGoals(JSON.stringify(reviewed)), id, score)?.lastReplayActual, 17)
})

test('goal progress keeps separate replay sequences, earliest closest and a three-attempt stall', () => {
  const { id } = junction
  const timed = arena('timed', 4)
  const relaxed = arena('relaxed', 4, { total: (junction.variants?.length ?? 0) + 1 })
  let history = updateChallengeScores({}, id, timed, 100).history
  history = updateChallengeScores(history, id, relaxed, 100).history
  let goals = saveChallengeGoal({}, id, timed, build(timed, 'score', 4))
  goals = saveChallengeGoal(goals, id, relaxed, build(relaxed, 'score', 2))
  goals = evaluateChallengeGoal(goals, id, arena('timed', 6)).goals
  goals = recordChallengeGoalFailure(goals, id, 'arena:timed:score:1')
  goals = evaluateChallengeGoal(goals, id, arena('timed', 6)).goals
  goals = evaluateChallengeGoal(goals, id, arena('relaxed', 5, { total: relaxed.total })).goals
  const progress = (current: typeof goals) => pendingChallengeGoals([junction], history, current).map(entry => entry.progress)
  assert.equal(progress(goals)[0].stalled, false)

  goals = evaluateChallengeGoal(goals, id, arena('timed', 5)).goals
  const restored = readChallengeGoals(JSON.stringify(goals))
  assert.deepEqual(progress(restored), [
    {
      replays: [2, null, 2, 3].map((remaining, index) => ({ attempt: index + 1, remaining })),
      closestAttempt: 1, stalled: true, startsMidGoal: false,
    },
    { replays: [{ attempt: 1, remaining: 1 }], closestAttempt: 1, stalled: false, startsMidGoal: false },
  ])
  const faster = evaluateChallengeGoal(restored, id, arena('timed', 7)).goals
  assert.equal(progress(faster)[0].closestAttempt, 5)
  assert.equal(progress(faster)[0].stalled, false)
})

test('adjusting a pending target rebases recorded gaps without counting or completing a replay', () => {
  const { id } = salvage
  const start = grid(17)
  const replay = grid(16)
  let history = updateChallengeScores({}, id, start).history
  history = updateChallengeScores(history, id, replay).history
  const first = build(start, 'turns', 3)
  const recorded = evaluateChallengeGoal(saveChallengeGoal({}, id, start, first), id, replay).goals
  assert.deepEqual(scoreAtGoalBaseline(replay, first), start)
  assert.equal(adjustChallengeGoal(recorded, id, replay, build(replay, 'turns', 1)), recorded)
  const relaxed = build(start, 'turns', 1)
  const edited = adjustChallengeGoal(recorded, id, replay, relaxed)
  assert.notEqual(edited, recorded)
  assert.equal(adjustChallengeGoal(edited, id, replay, relaxed), edited)
  let restored = readChallengeGoals(JSON.stringify(edited))
  for (let count = 0; count < 3; count++) restored = recordChallengeGoalFailure(restored, id, 'grid:1')
  const [pending] = pendingChallengeGoals([salvage], history, restored)
  assert.equal(pending.goal.target, 16)
  assert.equal(pending.goal.attempts, 4)
  assert.equal(pending.remaining, 0)
  assert.deepEqual(pending.progress, {
    replays: [0, null, null, null].map((remaining, index) => ({ attempt: index + 1, remaining })),
    closestAttempt: 1, stalled: false, startsMidGoal: false,
  })
  const reached = evaluateChallengeGoal(restored, id, replay)
  assert.equal(reached.achievement?.attempts, 5)
  assert.deepEqual(pendingChallengeGoals([salvage], history, reached.goals), [])
})

test('older goals keep their latest known gap without inventing a replay point or resetting prior counts', () => {
  const { id } = salvage
  const start = grid(17)
  const replay = grid(16)
  let history = updateChallengeScores({}, id, start, 100).history
  history = updateChallengeScores(history, id, replay, 200).history
  const goal = build(start, 'turns', 2)
  const old = { [id]: { 'grid:1': { ...goal, attempts: 4 } } }
  let goals = recordChallengeGoalFailure(old, id, 'grid:1')
  const [pending] = pendingChallengeGoals([salvage], history, goals)
  assert.equal(pending.remaining, 1)
  assert.deepEqual(pending.progress, { replays: [{ attempt: 5, remaining: null }], stalled: false, startsMidGoal: true })

  goals = adjustChallengeGoal(goals, id, replay, build(start, 'turns', 1))
  const [edited] = pendingChallengeGoals([salvage], history, readChallengeGoals(JSON.stringify(goals)))
  assert.equal(edited.remaining, 0)
  assert.equal(edited.progress.closestAttempt, undefined)
  assert.equal(edited.goal.attempts, 5)
})

test('achievements count graded retries and retain the exact winning score after a follow-up and clear', () => {
  const { id } = junction
  const timed = arena('timed', 4)
  const relaxed = arena('relaxed', 4, { total: (junction.variants?.length ?? 0) + 1 })
  const desired = build(timed, 'score', 2)
  let goals = saveChallengeGoal({}, id, timed, desired)
  goals = saveChallengeGoal(goals, id, relaxed, build(relaxed, 'score', 1))
  assert.equal(recordChallengeGoalFailure(goals, id, 'arena:timed:escape:1'), goals)
  goals = recordChallengeGoalFailure(goals, id, 'arena:timed:score:1')
  goals = evaluateChallengeGoal(goals, id, arena('timed', 5)).goals
  goals = evaluateChallengeGoal(goals, id, arena('timed', 5)).goals
  const winning = arena('timed', 7)
  const completed = evaluateChallengeGoal(goals, id, winning)
  assert.ok(completed.achievement)
  assert.deepEqual(completed.achievement, {
    levelId: id, seriesId: 'arena:timed:score:1', score: winning, goal: desired, actual: 7, attempts: 4,
  })
  assert.equal(goalForScore(completed.goals, id, relaxed)?.attempts, 0)
  assert.equal(recordChallengeGoalFailure(completed.goals, id, 'arena:timed:score:1'), completed.goals)
  assert.equal(evaluateChallengeGoal(completed.goals, id, winning).achievement, undefined)
  const firstArchive = archiveChallengeGoal([], completed.achievement)
  const latest = arena('timed', 8)
  const scoreHistory = updateChallengeScores({}, id, latest).history
  const restored = readChallengeGoalStore(serializeChallengeGoalStore({ goals: completed.goals, history: firstArchive }), scoreHistory)
  assert.deepEqual(restored, { goals: completed.goals, history: firstArchive })
  assert.deepEqual(completedChallengeGoals([junction], restored.history).map(entry => [entry.score, entry.canSetNext]), [[winning, true]])
  goals = saveChallengeGoal(restored.goals, id, winning, build(winning, 'score', 2))
  assert.equal(goalForScore(goals, id, latest)?.baseline, 7)
  const second = evaluateChallengeGoal(goals, id, arena('timed', 9))
  assert.ok(second.achievement)
  const history = archiveChallengeGoal(restored.history, second.achievement)
  const cleared = removeChallengeGoal(second.goals, id, latest)
  const archived = readChallengeGoalStore(serializeChallengeGoalStore({ goals: cleared, history }), scoreHistory)
  assert.deepEqual(archived.history.map(entry => [entry.id, entry.goal.target, entry.attempts]), [
    [`${id}/arena:timed:score:1/2`, 9, 1], [`${id}/arena:timed:score:1/1`, 6, 4],
  ])
  assert.equal(goalForScore(archived.goals, id, latest), undefined)
})

test('legacy completed goals migrate once, with attempts unknown and unclear metrics unavailable', () => {
  const { id } = junction
  const start = arena('timed', 4)
  const first = arena('timed', 6)
  const legacy = { [id]: { 'arena:timed:score:1': { ...build(start, 'score', 1), achieved: 6 } } }
  let scores = updateChallengeScores({}, id, first, 10).history
  const exact = readChallengeGoalStore(JSON.stringify(legacy), scores)
  assert.equal(exact.history[0]?.attempts, undefined)
  assert.equal(exact.history[0]?.metricOnly, undefined)
  assert.deepEqual(exact.history[0]?.score, first)
  scores = updateChallengeScores(scores, id, { ...first, turns: 13 }, 20).history
  const ambiguous = readChallengeGoalStore(JSON.stringify(legacy), scores)
  assert.equal(ambiguous.history[0]?.metricOnly, true)
  assert.equal(ambiguous.history[0]?.actual, 6)
  const encoded = serializeChallengeGoalStore(ambiguous)
  assert.deepEqual(readChallengeGoalStore(encoded, scores), ambiguous)
  assert.equal(readChallengeGoals(encoded)[id]['arena:timed:score:1'].achieved, 6)
  const nextGoal = build(ambiguous.history[0].score, 'score', 1)
  const goals = saveChallengeGoal(ambiguous.goals, id, ambiguous.history[0].score, nextGoal)
  assert.equal(goalForScore(goals, id, start)?.baseline, 6)
  assert.equal(readChallengeGoalStore(serializeChallengeGoalStore({ goals, history: ambiguous.history }), scores).history.length, 1)
})
