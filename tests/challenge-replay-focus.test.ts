import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { AlgorithmLevel } from '../src/shared/advanced'
import type { GridLevel } from '../src/shared/types'
import { readGoalReplayDetails, type GoalReplayTurn } from '../src/web/challengeGoalReview'
import { buildChallengeGoal, evaluateChallengeGoal, pendingChallengeGoals, readChallengeGoals, recordChallengeGoalFailure, saveChallengeGoal } from '../src/web/challengeGoals'
import { evaluateReplayFocus, replayFocusOptions, replayFocusValue } from '../src/web/challengeReplayFocus'
import { challengeScoreSignature, updateChallengeScores, type ChallengeScore } from '../src/web/challengeScore'

const gridLevel = {
  ...JSON.parse(readFileSync(new URL('../levels/1801-limited-battery-salvage.json', import.meta.url), 'utf8')) as GridLevel,
  start: { x: 0, y: 0 },
}
const algorithm = JSON.parse(readFileSync(new URL('../levels/1809-quiet-power-window.json', import.meta.url), 'utf8')) as AlgorithmLevel

const gridScore = (turns: number, passed = 1): ChallengeScore => ({ kind: 'grid', turns, passed, total: 1 })
const algorithmScore = (passed: number, checks = 1): ChallengeScore => ({ kind: 'algorithm', passed, total: algorithm.cases.length, checks })
const moves = (...columns: number[]): GoalReplayTurn[] => columns.map((x, index) => ({ action: 'move', turn: index + 1, x, y: 0 }))

test('a route focus counts its actual directed segment and does not credit a short failed run', () => {
  const baseline = gridScore(8)
  const goal = buildChallengeGoal(baseline, 'turns', 6)
  assert.ok(goal)
  let goals = saveChallengeGoal({}, gridLevel.id, baseline, goal)
  goals = evaluateChallengeGoal(goals, gridLevel.id, gridScore(4), { turns: moves(1, 0, 1, 2) }).goals
  const history = updateChallengeScores({}, gridLevel.id, baseline).history
  const [entry] = pendingChallengeGoals([gridLevel], history, goals)
  const options = replayFocusOptions(entry, 1)
  const route = options.find(plan => plan.kind === 'route')
  assert.ok(route)
  assert.deepEqual(route.from, { x: 0, y: 0 })
  assert.deepEqual(route.to, { x: 1, y: 0 })
  assert.equal(route.before, 2)
  assert.equal(route.sourceTurn, 1)

  assert.deepEqual(evaluateReplayFocus(route, gridScore(2), { turns: moves(1, 2) }, true),
    { plan: route, before: 2, after: 1, status: 'improved' })
  assert.equal(evaluateReplayFocus(route, gridScore(4), { turns: moves(1, 0, 1, 2) }, true).status, 'same')
  assert.equal(evaluateReplayFocus(route, gridScore(6), { turns: moves(1, 0, 1, 0, 1, 2) }, true).status, 'worse')
  assert.equal(evaluateReplayFocus(route, gridScore(1, 0), { turns: moves(1) }, false).status, 'unavailable')
  assert.equal(evaluateReplayFocus(route, gridScore(2), { turns: moves(1, 2), truncated: true }, true).status, 'unavailable')
  assert.equal(evaluateReplayFocus(route, gridScore(2), { turns: moves(1, 4) }, true).status, 'unavailable')
})

test('one failed case can improve even while other cases still fail', () => {
  const baseline = algorithmScore(algorithm.cases.length, 3)
  const goal = buildChallengeGoal(baseline, 'checks', 1)
  assert.ok(goal)
  const stored = saveChallengeGoal({}, algorithm.id, baseline, goal)
  const failed = algorithmScore(1)
  const goals = recordChallengeGoalFailure(stored, algorithm.id, challengeScoreSignature(failed), {
    score: failed,
    evidence: { cases: [{ index: 2, passed: false }, { index: 3, passed: true }] },
  })
  const history = updateChallengeScores({}, algorithm.id, baseline).history
  const [entry] = pendingChallengeGoals([algorithm], history, readChallengeGoals(JSON.stringify(goals)))
  const options = replayFocusOptions(entry, 1)
  assert.deepEqual(options.map(plan => plan.kind), ['case'])
  const [plan] = options
  assert.deepEqual(evaluateReplayFocus(plan, failed, { cases: [{ index: 2, passed: true }, { index: 3, passed: false }] }, false),
    { plan, before: 0, after: 1, status: 'improved' })
  assert.equal(evaluateReplayFocus(plan, failed, { cases: [{ index: 2, passed: false }] }, false).status, 'same')
  assert.equal(evaluateReplayFocus(plan, failed, { cases: [{ index: 3, passed: true }] }, false).status, 'unavailable')
  assert.equal(replayFocusValue(plan, 1, 'zh'), '通过')
})

test('stored case evidence rejects duplicate, invalid, and contradictory verdicts', () => {
  const score = algorithmScore(1)
  const checked = [{ index: 1, passed: true }]
  assert.deepEqual(readGoalReplayDetails({ score, evidence: { cases: checked } })?.evidence?.cases, checked)
  for (const cases of [
    [{ index: 1, passed: false }, { index: 1, passed: true }],
    [{ index: 0, passed: false }],
    [{ index: 1, passed: true }, { index: 2, passed: true }],
    [{ index: algorithm.cases.length + 1, passed: true }],
  ]) assert.equal(readGoalReplayDetails({ score, evidence: { cases } })?.evidence?.cases, undefined)
})

test('an older replay can select a recorded total without inventing route or case data', () => {
  const baseline = gridScore(8)
  const goal = buildChallengeGoal(baseline, 'turns', 4)
  assert.ok(goal)
  const saved = saveChallengeGoal({}, gridLevel.id, baseline, goal)
  const goals = evaluateChallengeGoal(saved, gridLevel.id, gridScore(6)).goals
  const history = updateChallengeScores({}, gridLevel.id, baseline).history
  const [entry] = pendingChallengeGoals([gridLevel], history, goals)
  const [plan] = replayFocusOptions(entry, 1)
  assert.equal(plan.kind, 'metric')
  assert.equal(plan.before, 6)
  assert.equal(evaluateReplayFocus(plan, gridScore(5), undefined, true).status, 'improved')
  assert.equal(evaluateReplayFocus(plan, gridScore(0, 0), undefined, false).status, 'unavailable')
  assert.equal(evaluateReplayFocus(plan, { kind: 'grid', turns: 5, passed: 2, total: 2 }, undefined, true).status, 'unavailable')
})
