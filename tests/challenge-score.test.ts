import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  challengeScoreSeries, isBestChallengeScore, readChallengeScores, scoreMetrics, updateChallengeScores,
  type ChallengeScore,
} from '../src/web/challengeScore'

function grid(turns: number, total = 1): ChallengeScore {
  return { kind: 'grid', turns, passed: total, total }
}

function arena(mode: 'timed' | 'relaxed', goal: 'score' | 'escape', turns: number, score: number): ChallengeScore {
  const total = mode === 'timed' ? 1 : 3
  return { kind: 'arena', mode, goal, turns, score, passed: total, total }
}

test('the latest clearance changes on every win while only a better score replaces the record', () => {
  const id = 'salvage'
  const first = updateChallengeScores({}, id, grid(16), 1000)
  assert.deepEqual(first.comparison, { current: grid(16), previous: undefined, best: grid(16), newBest: false })

  const better = updateChallengeScores(first.history, id, grid(13))
  assert.deepEqual(better.comparison, { current: grid(13), previous: grid(16), best: grid(13), newBest: true })
  const slower = updateChallengeScores(better.history, id, grid(15))
  assert.deepEqual(slower.comparison, { current: grid(15), previous: grid(13), best: grid(13), newBest: false })

  const tie = updateChallengeScores(slower.history, id, grid(13))
  assert.deepEqual(tie.comparison, { current: grid(13), previous: grid(15), best: grid(13), newBest: false })
  assert.deepEqual(readChallengeScores(JSON.stringify(tie.history)), tie.history)
  assert.deepEqual(first.history[id]['grid:1'], {
    latest: grid(16), best: grid(16), attempts: [{ score: grid(16), at: 1000 }],
  })
})

test('history stays separate across grid scenario counts, arena rules and modes, AI modes, and levels', () => {
  const race = arena('relaxed', 'score', 15, 4)
  const timed = arena('timed', 'score', 11, 9)
  const escape = arena('relaxed', 'escape', 16, 4)
  const first = updateChallengeScores({}, 'race', race)
  const second = updateChallengeScores(first.history, 'race', timed)
  const third = updateChallengeScores(second.history, 'race', escape)
  const other = updateChallengeScores(third.history, 'other-race', race)
  const fourth = updateChallengeScores(other.history, 'race', arena('relaxed', 'score', 12, 4))
  assert.equal(second.comparison.previous, undefined)
  assert.equal(third.comparison.previous, undefined)
  assert.equal(other.comparison.previous, undefined)
  assert.deepEqual(fourth.comparison.previous, race)
  assert.equal(fourth.comparison.newBest, true)

  const gridFirst = updateChallengeScores({}, 'route', grid(8, 1))
  assert.equal(updateChallengeScores(gridFirst.history, 'route', grid(10, 3)).comparison.previous, undefined)
  const ai = updateChallengeScores({}, 'audit', { kind: 'ai', mode: 'offline', rounds: 4 })
  assert.equal(updateChallengeScores(ai.history, 'audit', { kind: 'ai', mode: 'online', rounds: 1 }).comparison.previous, undefined)
})

test('each mode ranks its own goals and displays the actual metric values', () => {
  const race = updateChallengeScores({}, 'race', arena('timed', 'score', 11, 3))
  const slowerWithMoreBatteries = arena('timed', 'score', 15, 4)
  const higher = updateChallengeScores(race.history, 'race', slowerWithMoreBatteries)
  assert.equal(higher.comparison.newBest, true)
  assert.deepEqual(higher.comparison.best, slowerWithMoreBatteries)
  assert.deepEqual(scoreMetrics(slowerWithMoreBatteries), [
    { id: 'score', value: 4, preference: 'higher' },
    { id: 'turns', value: 15, preference: 'lower' },
    { id: 'cases', value: 1, total: 1, preference: 'higher' },
  ])

  const escape = updateChallengeScores({}, 'escape', arena('timed', 'escape', 10, 5))
  const fasterWithFewerBatteries = arena('timed', 'escape', 8, 3)
  assert.equal(updateChallengeScores(escape.history, 'escape', fasterWithFewerBatteries).comparison.newBest, true)
  assert.deepEqual(scoreMetrics(fasterWithFewerBatteries).map(metric => metric.id), ['turns', 'cases'])

  for (const [before, after] of [
    [{ kind: 'algorithm', passed: 6, total: 6, checks: 3 }, { kind: 'algorithm', passed: 6, total: 6, checks: 1 }],
    [{ kind: 'data', passed: 3, total: 3, checks: 5 }, { kind: 'data', passed: 3, total: 3, checks: 4 }],
    [{ kind: 'machine', passed: 3, total: 3, instructions: 7 }, { kind: 'machine', passed: 3, total: 3, instructions: 6 }],
    [{ kind: 'ai', mode: 'offline', rounds: 5 }, { kind: 'ai', mode: 'offline', rounds: 3 }],
  ] satisfies [ChallengeScore, ChallengeScore][]) {
    const old = updateChallengeScores({}, 'challenge', before)
    assert.equal(updateChallengeScores(old.history, 'challenge', after).comparison.newBest, true)
  }
})

test('storage discards malformed runs and keeps valid records without inventing an old score', () => {
  for (const raw of [null, '???', '[]', '"text"', 'null', 'true']) assert.deepEqual(readChallengeScores(raw), {})
  const current = grid(12)
  const loaded = readChallengeScores(JSON.stringify({
    valid: { 'grid:1': { latest: current, best: grid(16) } },
    invalid: { 'grid:1': { latest: { ...current, turns: -1 }, best: current } },
    wrongMode: { 'arena:timed:score:1': { latest: arena('timed', 'escape', 3, 6) } },
    tooManyCases: { 'grid:1': { latest: { ...current, passed: 2 } } },
    'not a level ID!': { 'grid:1': { latest: current, best: current } },
  }))
  assert.deepEqual(loaded, { valid: { 'grid:1': { latest: current, best: current } } })
})

test('legacy best and latest appear as distinct undated scores only when their values differ', () => {
  const legacy = readChallengeScores(JSON.stringify({
    route: { 'grid:1': { latest: grid(15), best: grid(11) } },
    match: { 'grid:1': { latest: grid(11), best: grid(11) } },
  }))
  const [route] = challengeScoreSeries(legacy, 'route')
  assert.deepEqual(route, {
    id: 'grid:1', score: grid(15), best: grid(11), attempts: [
      { score: grid(11), at: null, legacy: 'best' },
      { score: grid(15), at: null, legacy: 'latest' },
    ],
  })
  assert.deepEqual(challengeScoreSeries(legacy, 'match')[0].attempts, [
    { score: grid(11), at: null, legacy: 'latest' },
  ])
  assert.deepEqual(challengeScoreSeries(legacy, 'missing'), [])

  const next = updateChallengeScores(legacy, 'route', grid(12), 1_760_000_000_123)
  assert.deepEqual(next.comparison.previous, grid(15))
  assert.deepEqual(next.comparison.best, grid(11))
  assert.deepEqual(challengeScoreSeries(readChallengeScores(JSON.stringify(next.history)), 'route')[0].attempts, [
    ...route.attempts,
    { score: grid(12), at: 1_760_000_000_123 },
  ])
  assert.deepEqual(challengeScoreSeries(legacy, 'route')[0].attempts, route.attempts)
})

test('separate modes keep every timestamped win and tied record in recorded order', () => {
  const timed = arena('timed', 'score', 12, 5)
  const relaxed = arena('relaxed', 'score', 12, 5)
  const first = updateChallengeScores({}, 'race', timed, 3000)
  const second = updateChallengeScores(first.history, 'race', relaxed, 3100)
  const slower = arena('timed', 'score', 12, 4)
  const third = updateChallengeScores(second.history, 'race', slower, 2000)
  const fourth = updateChallengeScores(third.history, 'race', timed, 3000)
  const attempts = challengeScoreSeries(readChallengeScores(JSON.stringify(fourth.history)), 'race')
  assert.equal(attempts.length, 2)
  assert.deepEqual(attempts[0].attempts, [
    { score: timed, at: 3000 },
    { score: slower, at: 2000 },
    { score: timed, at: 3000 },
  ])
  assert.deepEqual(attempts[1].attempts, [{ score: relaxed, at: 3100 }])
  assert.deepEqual(attempts[0].attempts.map(({ score }) => isBestChallengeScore(score, attempts[0].best)), [true, false, true])
  assert.equal(isBestChallengeScore(relaxed, timed), false)
})

test('scores with wrong signatures or invalid timestamps cannot appear in the trend', () => {
  const start = grid(14)
  const end = grid(10)
  const raw = JSON.stringify({
    route: {
      'grid:1': {
        latest: start,
        best: grid(1),
        attempts: [
          { score: start, at: 100 },
          { score: grid(3, 2), at: 110 },
          { score: grid(11), at: -1 },
          { score: grid(11), at: 0.5 },
          { score: grid(11), at: 8_640_000_000_000_001 },
          { score: grid(11), at: null },
          { score: grid(11), at: 120, legacy: 'best' },
          { score: end, at: 130 },
        ],
      },
    },
  })
  const [series] = challengeScoreSeries(readChallengeScores(raw), 'route')
  assert.deepEqual(series, {
    id: 'grid:1', score: end, best: end, attempts: [
      { score: start, at: 100 },
      { score: end, at: 130 },
    ],
  })
})
