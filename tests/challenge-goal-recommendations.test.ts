import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ArenaLevel } from '../src/shared/advanced'
import type { DataLevel } from '../src/shared/dataCourse'
import type { AiLevel, GridLevel } from '../src/shared/types'
import { buildChallengeGoal, evaluateChallengeGoal, pendingChallengeGoals, saveChallengeGoal } from '../src/web/challengeGoals'
import { recommendChallengeGoals } from '../src/web/challengeGoalRecommendations'
import { updateChallengeScores, type ChallengeScore, type ChallengeScoreHistory } from '../src/web/challengeScore'

function loadLevel<T>(filename: string): T {
  return JSON.parse(readFileSync(new URL(`../levels/${filename}`, import.meta.url), 'utf8')) as T
}

const salvage = loadLevel<GridLevel>('1801-limited-battery-salvage.json')
const junction = loadLevel<ArenaLevel>('1803-junction-race.json')

function grid(turns: number): ChallengeScore {
  return { kind: 'grid', turns, passed: 1, total: 1 }
}

function arena(mode: 'timed' | 'relaxed', points: number, total = 1): ChallengeScore {
  return { kind: 'arena', mode, goal: 'score', turns: 12, score: points, passed: total, total }
}

function record(levelId: string, wins: ChallengeScore[], history: ChallengeScoreHistory = {}): ChallengeScoreHistory {
  return wins.reduce((entries, score, index) => updateChallengeScores(entries, levelId, score, index + 1).history, history)
}

test('a recommendation uses the latest win and the most recent three wins as evidence', () => {
  const level = { ...salvage, turnLimit: 25 }
  const history = record(level.id, [grid(17), grid(23), grid(20), grid(22)])
  const [result] = recommendChallengeGoals([level], history, {})
  assert.deepEqual(result.goal, { metricId: 'turns', baseline: 22, target: 21, preference: 'lower' })
  assert.deepEqual(result.recent, [23, 20, 22])
  assert.equal(result.alreadyReached, true)
  assert.deepEqual(result.score, grid(22))

  const goingFaster = record(level.id, [grid(17), grid(21), grid(20), grid(19)])
  const [stretch] = recommendChallengeGoals([level], goingFaster, {})
  assert.equal(stretch.goal.target, 18)
  assert.deepEqual(stretch.recent, [21, 20, 19])
  assert.equal(stretch.alreadyReached, false)

  assert.deepEqual(recommendChallengeGoals([level], record(level.id, [grid(25), grid(22), grid(19)]), {}), [])
})

test('arena modes and currently playable maps are matched independently', () => {
  const total = 1 + (junction.variants?.length ?? 0)
  const timed = [arena('timed', 4), arena('timed', 3)]
  const relaxed = [arena('relaxed', 6, total), arena('relaxed', 4, total)]
  const staleScope = [arena('relaxed', 9, total + 1), arena('relaxed', 8, total + 1)]
  const history = record(junction.id, [...timed, ...relaxed, ...staleScope])
  const summarize = (goals: Parameters<typeof recommendChallengeGoals>[2]) =>
    recommendChallengeGoals([junction], history, goals).map(({ seriesId, goal, recent }) => [seriesId, goal.target, recent])

  assert.deepEqual(summarize({}), [
    ['arena:timed:score:1', 4, [4, 3]],
    [`arena:relaxed:score:${total}`, 5, [6, 4]],
  ])

  const goal = buildChallengeGoal(timed[1], 'score', 1)
  assert.ok(goal)
  const pending = saveChallengeGoal({}, junction.id, timed[1], goal)
  assert.deepEqual(summarize(pending), [[`arena:relaxed:score:${total}`, 5, [6, 4]]])
  assert.equal(summarize(evaluateChallengeGoal(pending, junction.id, timed[0]).goals).length, 2)
})

test('a recommendation requires two dated wins and skips incomplete and undated results', () => {
  const level = { ...salvage, turnLimit: 25 }
  const legacy: ChallengeScoreHistory = { [level.id]: { 'grid:1': { latest: grid(21), best: grid(19) } } }
  assert.deepEqual(recommendChallengeGoals([level], legacy, {}), [])
  const loss: ChallengeScore = { kind: 'grid', turns: 18, passed: 0, total: 1 }
  const first = record(level.id, [loss, grid(21)], legacy)
  assert.deepEqual(recommendChallengeGoals([level], first, {}), [])
  const second = record(level.id, [grid(21), loss], first)
  const [result] = recommendChallengeGoals([level], second, {})
  assert.deepEqual(result.recent, [21, 21])
  assert.equal(result.goal.target, 20)
  assert.equal(result.alreadyReached, false)
  const adopted = saveChallengeGoal({}, level.id, result.score, result.goal)
  assert.equal(pendingChallengeGoals([level], second, adopted)[0]?.goal.target, 20)
})

test('known scoring limits and a grid budget prevent unsupported stretch targets', () => {
  assert.deepEqual(recommendChallengeGoals([salvage], record(salvage.id, [grid(17), grid(17)]), {}), [])
  const shortRace = { ...junction, maxTurns: 1, items: junction.items.slice(0, 1) }
  const raceWin: ChallengeScore = { kind: 'arena', mode: 'timed', goal: 'score', score: 1, turns: 1, passed: 1, total: 1 }
  assert.deepEqual(recommendChallengeGoals([shortRace], record(shortRace.id, [raceWin, raceWin]), {}), [])

  const report = loadLevel<DataLevel>('1813-temperature-incident-log.json')
  const total = report.steps.length
  const dataWin: ChallengeScore = { kind: 'data', checks: total, passed: total, total }
  assert.deepEqual(recommendChallengeGoals([report], record(report.id, [dataWin, dataWin]), {}), [])

  const dispatch = loadLevel<AiLevel>('1814-late-dispatch-amendment.json')
  const offline: ChallengeScore = { kind: 'ai', rounds: 4, mode: 'offline' }
  const mixed: ChallengeScore = { kind: 'ai', rounds: 2, mode: 'mixed' }
  assert.deepEqual(recommendChallengeGoals([dispatch], record(dispatch.id, [offline, offline, mixed, mixed]), {}), [])
})
