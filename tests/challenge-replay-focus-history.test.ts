import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { AlgorithmLevel, ArenaLevel } from '../src/shared/advanced'
import type { GridLevel } from '../src/shared/types'
import type { ReplayFocusPlan } from '../src/web/challengeReplayFocus'
import { readReplayFocusHistory, recordReplayFocus, replayFocusHistoryEntries, retryReplayFocus } from '../src/web/challengeReplayFocusHistory'
import { challengeScoreSignature, type ChallengeScore } from '../src/web/challengeScore'

const loadLevel = <T,>(filename: string) => JSON.parse(readFileSync(new URL(`../levels/${filename}`, import.meta.url), 'utf8')) as T
const grid = loadLevel<GridLevel>('1801-limited-battery-salvage.json')
const arena = loadLevel<ArenaLevel>('1803-junction-race.json')
const algorithm = loadLevel<AlgorithmLevel>('1809-quiet-power-window.json')
const gridScore: ChallengeScore = { kind: 'grid', turns: 17, passed: 1, total: 1 }
const route: ReplayFocusPlan = {
  kind: 'route', key: 'route/2,3/3,3', seriesId: challengeScoreSignature(gridScore), attempt: 2, before: 3,
  start: grid.start, from: { x: 2, y: 3 }, to: { x: 3, y: 3 }, sourceTurn: 1,
}

test('recorded comparisons survive reload and rebase a retry only on a known result', () => {
  const first = recordReplayFocus([], {
    levelId: grid.id, title: grid.title, score: gridScore, reference: 'replay',
    result: { plan: route, before: 3, after: 2, status: 'improved' },
  }, 100)
  const history = recordReplayFocus(first, {
    levelId: grid.id, title: grid.title, score: { ...gridScore, passed: 0 }, reference: 'entry',
    result: { plan: route, before: 3, status: 'unavailable' },
  }, 100)
  assert.deepEqual(history.map(({ id }) => id), ['100-2', '100-1'])
  const reloaded = readReplayFocusHistory(JSON.stringify(history))
  assert.deepEqual(reloaded, history)

  const [latest, improved] = replayFocusHistoryEntries(reloaded, [grid])
  assert.deepEqual(retryReplayFocus(latest), { plan: route, reference: 'entry' })
  assert.deepEqual(retryReplayFocus(improved), { plan: { ...route, before: 2 }, reference: 'history' })
  assert.deepEqual([latest, improved].map(({ canReplay, worthRetry }) => ({ canReplay, worthRetry })), [
    { canReplay: true, worthRetry: true },
    { canReplay: true, worthRetry: false },
  ])

  const [movedStart] = replayFocusHistoryEntries(reloaded, [{ ...grid, start: { x: 3, y: 3 } }])
  assert.equal(movedStart.canReplay, false)
  const [removed] = replayFocusHistoryEntries(reloaded, [])
  assert.equal(removed.canReplay, false)
  assert.deepEqual(removed.title, grid.title)
})

test('worth retrying uses the latest result per focus and keeps timed and relaxed records separate', () => {
  const timed: ChallengeScore = { kind: 'arena', mode: 'timed', goal: 'score', turns: 11, score: 3, passed: 1, total: 1 }
  const total = 1 + (arena.variants?.length ?? 0)
  const relaxed: ChallengeScore = { ...timed, mode: 'relaxed', total, passed: total, score: 5 }
  const scorePlan = (score: ChallengeScore, before: number): ReplayFocusPlan => ({
    kind: 'metric', key: 'metric/score', seriesId: challengeScoreSignature(score), attempt: 1, before,
    metricId: 'score', preference: 'higher',
  })
  const common = { levelId: arena.id, title: arena.title, reference: 'replay' as const }
  let history = recordReplayFocus([], { ...common, score: timed,
    result: { plan: scorePlan(timed, 3), before: 3, after: 3, status: 'same' } }, 100)
  history = recordReplayFocus(history, { ...common, score: relaxed,
    result: { plan: scorePlan(relaxed, 4), before: 4, after: 5, status: 'improved' } }, 101)
  history = recordReplayFocus(history, { ...common, score: timed,
    result: { plan: scorePlan(timed, 4), before: 4, after: 3, status: 'worse' } }, 102)
  const entries = replayFocusHistoryEntries(history, [arena])
  assert.deepEqual(entries.map(({ score, canReplay, worthRetry }) => [challengeScoreSignature(score), canReplay, worthRetry]), [
    [challengeScoreSignature(timed), true, true],
    [challengeScoreSignature(relaxed), true, false],
    [challengeScoreSignature(timed), true, false],
  ])

  const sameCaseScore: ChallengeScore = { kind: 'algorithm', checks: 1, passed: 1, total: algorithm.cases.length }
  const casePlan: ReplayFocusPlan = { kind: 'case', index: 1, key: 'case/1', before: 1, attempt: 1, seriesId: challengeScoreSignature(sameCaseScore) }
  const [heldPass] = replayFocusHistoryEntries(recordReplayFocus(history, {
    levelId: algorithm.id, title: algorithm.title, reference: 'history', score: sameCaseScore,
    result: { plan: casePlan, before: 1, after: 1, status: 'same' },
  }, 103), [algorithm, arena])
  assert.equal(heldPass.worthRetry, false)
  assert.equal(heldPass.canReplay, true)
})

test('storage omits damaged comparisons and ignores unrelated saved fields', () => {
  const [valid] = recordReplayFocus([], {
    levelId: grid.id, title: grid.title, score: gridScore, reference: 'history',
    result: { plan: route, before: 3, after: 2, status: 'improved' },
  }, 100)
  assert.deepEqual(readReplayFocusHistory(JSON.stringify([
    { ...valid, id: 'bad-status', result: { ...valid.result, status: 'worse' } },
    { ...valid, id: 'bad-scope', result: { ...valid.result, plan: { ...route, seriesId: 'grid:2' } } },
    { ...valid, id: 'bad-route', result: { ...valid.result, plan: { ...route, to: { x: 5, y: 3 } } } },
    { ...valid, id: 'bad-after', result: { ...valid.result, after: 100 } },
    { ...valid, transcript: 'Unrelated content' }, valid,
  ])), [valid])
  assert.deepEqual(readReplayFocusHistory('{'), [])
})
