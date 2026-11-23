import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ArenaLevel } from '../src/shared/advanced'
import type { GridLevel } from '../src/shared/types'
import { compareGoalReplay, readGoalReplayDetails, type GoalReplayTurn } from '../src/web/challengeGoalReview'
import {
  adjustChallengeGoal, buildChallengeGoal, evaluateChallengeGoal, goalForScore, pendingChallengeGoals,
  readChallengeGoals, recordChallengeGoalFailure, saveChallengeGoal,
} from '../src/web/challengeGoals'
import { updateChallengeScores, type ChallengeScore } from '../src/web/challengeScore'

const salvage = JSON.parse(readFileSync(new URL('../levels/1801-limited-battery-salvage.json', import.meta.url), 'utf8')) as GridLevel
const junction = JSON.parse(readFileSync(new URL('../levels/1803-junction-race.json', import.meta.url), 'utf8')) as ArenaLevel

function grid(turns: number, passed = 1): ChallengeScore {
  return { kind: 'grid', turns, passed, total: 1 }
}

function move(turn: number, x: number, y = 0): GoalReplayTurn {
  return { turn, action: 'move', x, y }
}

function pick(turn: number, item: string, x = 0, y = 0): GoalReplayTurn {
  return { turn, action: 'pick', item, x, y }
}

test('a replay review aligns detours and uses recorded failure diagnostics', () => {
  const { id } = salvage
  const baseline = grid(9)
  const goal = buildChallengeGoal(baseline, 'turns', 4)
  assert.ok(goal)
  const history = updateChallengeScores({}, id, baseline).history
  let goals = saveChallengeGoal({}, id, baseline, goal)
  const bestTurns = [move(1, 1), move(2, 2), pick(3, 'battery-a', 2), move(4, 3), move(5, 4), move(6, 5)]
  goals = evaluateChallengeGoal(goals, id, grid(6), { turns: bestTurns }).goals

  const detour = [move(1, 1), move(2, 1, 1), move(3, 1), ...bestTurns.slice(1).map(action => ({ ...action, turn: action.turn + 2 }))]
  goals = evaluateChallengeGoal(goals, id, grid(8), { turns: detour }).goals
  const issue = { location: { zh: '第 5 行', en: 'Line 5' }, gaps: [{ zh: '还有 1 件物品未拾取。', en: 'One item remains.' }] }
  goals = recordChallengeGoalFailure(goals, id, 'grid:1', { score: grid(4, 0), evidence: { issue } })

  const revised = buildChallengeGoal(baseline, 'turns', 3)
  assert.ok(revised)
  const restored = readChallengeGoals(JSON.stringify(adjustChallengeGoal(goals, id, baseline, revised)))
  const [entry] = pendingChallengeGoals([salvage], history, restored)
  const turnReview = compareGoalReplay(entry, 2)
  assert.equal(turnReview?.selected.remaining, 2)
  assert.equal(turnReview?.best?.remaining, 0)
  assert.deepEqual(turnReview?.extraTurns, [move(2, 1, 1), move(3, 1)])
  assert.equal(turnReview?.advice, 'route')
  assert.deepEqual(turnReview?.metrics.find(metric => metric.id === 'turns'), {
    id: 'turns', selected: 8, best: 6, selectedTotal: undefined, bestTotal: undefined, preference: 'lower',
  })

  const failureReview = compareGoalReplay(entry, 3)
  assert.equal(failureReview?.selected.remaining, null)
  assert.deepEqual(failureReview?.selected.details?.evidence?.issue, issue)
  assert.equal(failureReview?.advice, 'failure')
  assert.deepEqual(failureReview?.extraTurns, [])
  assert.equal(compareGoalReplay(entry, 4), undefined)
})

test('arena details reveal recorded pickups only within a complete trace in the same mode', () => {
  const { id } = junction
  const timed = (score: number): ChallengeScore => ({ kind: 'arena', mode: 'timed', goal: 'score', turns: 3, score, total: 1, passed: 1 })
  const relaxedTotal = 1 + (junction.variants?.length ?? 0)
  const relaxed: ChallengeScore = { kind: 'arena', mode: 'relaxed', goal: 'score', turns: 3, score: 1, total: relaxedTotal, passed: relaxedTotal }
  const desiredTimed = buildChallengeGoal(timed(1), 'score', 3)
  const desiredRelaxed = buildChallengeGoal(relaxed, 'score', 3)
  assert.ok(desiredTimed && desiredRelaxed)
  let goals = saveChallengeGoal({}, id, timed(1), desiredTimed)
  goals = saveChallengeGoal(goals, id, relaxed, desiredRelaxed)
  goals = evaluateChallengeGoal(goals, id, timed(3), { turns: [pick(1, 'a'), pick(2, 'b'), pick(3, 'c')] }).goals
  const turns = [pick(1, 'a'), move(2, 1), pick(3, 'b', 1)]
  goals = evaluateChallengeGoal(goals, id, timed(2), { turns }).goals
  goals = evaluateChallengeGoal(goals, id, timed(2), { turns: turns.slice(0, 2), truncated: true }).goals
  goals = evaluateChallengeGoal(goals, id, timed(2), { turns: [pick(1, 'a'), move(2, 1), { turn: 3, action: 'pick' }] }).goals
  goals = evaluateChallengeGoal(goals, id, { ...relaxed, score: 3 }, { turns: [pick(1, 'd'), pick(2, 'e'), pick(3, 'f')] }).goals
  let history = updateChallengeScores({}, id, timed(1)).history
  history = updateChallengeScores(history, id, relaxed).history
  const [timedEntry, relaxedEntry] = pendingChallengeGoals([junction], history, readChallengeGoals(JSON.stringify(goals)))
  assert.deepEqual(compareGoalReplay(timedEntry, 2)?.missedItems, [{ id: 'c', turn: 3 }])
  assert.equal(compareGoalReplay(timedEntry, 2)?.advice, 'score')
  assert.deepEqual(compareGoalReplay(timedEntry, 3)?.missedItems, [])
  assert.deepEqual(compareGoalReplay(timedEntry, 4)?.missedItems, [])
  assert.equal(compareGoalReplay(relaxedEntry, 2), undefined)
  assert.equal(compareGoalReplay(relaxedEntry, 1)?.best?.details?.score.kind, 'arena')
})

test('older attempts and trimmed evidence retain numeric comparisons without inventing turns', () => {
  const { id } = salvage
  const baseline = grid(18)
  const desired = buildChallengeGoal(baseline, 'turns', 4)
  assert.ok(desired)
  let goals = saveChallengeGoal({}, id, baseline, desired)
  goals = evaluateChallengeGoal(goals, id, grid(17)).goals
  goals = evaluateChallengeGoal(goals, id, grid(15), {}).goals
  for (let replay = 0; replay < 25; replay++) goals = evaluateChallengeGoal(goals, id, grid(16), {}).goals
  const restored = readChallengeGoals(JSON.stringify(goals))
  const score = goalForScore(restored, id, baseline)
  assert.ok(score?.replayDetails)
  assert.equal(Object.keys(score.replayDetails).length, 21)
  const history = updateChallengeScores({}, id, baseline).history
  const [entry] = pendingChallengeGoals([salvage], history, restored)
  const legacy = compareGoalReplay(entry, 1)
  assert.equal(legacy?.selected.details, undefined)
  assert.equal(legacy?.metrics[0]?.selected, 17)
  assert.equal(legacy?.best?.attempt, 2)
  assert.deepEqual(legacy?.extraTurns, [])
  assert.equal(compareGoalReplay(entry, 3)?.selected.details, undefined)
})

test('stored evidence strips arbitrary fields and ignores a trace with missing turn numbers', () => {
  const score = grid(4)
  const evidence = { program: 'private source', turns: [move(1, 1), move(3, 3)], wholeBoard: {} }
  assert.deepEqual(readGoalReplayDetails({ score, evidence }), { score })
  const issue = { location: { zh: '第 1 次重玩', en: 'Replay 1' }, gaps: [{ zh: '未通关。', en: 'Did not clear.' }], prompts: ['private prompt'] }
  assert.deepEqual(readGoalReplayDetails({ score, evidence: { issue } }), {
    score,
    evidence: { issue: { location: issue.location, gaps: issue.gaps } },
  })
})
