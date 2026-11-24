import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ArenaLevel } from '../src/shared/advanced'
import { parseLevel } from '../src/shared/validate'
import { challengeScoreSeries, readChallengeScores, updateChallengeScores, type ChallengeScoreHistory } from '../src/web/challengeScore'

const arena: ArenaLevel = JSON.parse(readFileSync(new URL('../levels/1939-neon-pinball-cup.json', import.meta.url), 'utf8'))
const issues = (change: Partial<ArenaLevel>) => parseLevel(JSON.stringify({ ...arena, ...change })).issues

test('combat variants validate their own chip references, goal items and duelists', () => {
  assert.deepEqual(issues({}), [])
  assert.ok(issues({ combat: undefined }).some(issue => issue.code === 'arena-combat'))
  const chip = arena.combat!.buffs[0]
  assert.ok(issues({ combat: { ...arena.combat!, buffs: [chip, chip] } }).some(issue => issue.code === 'arena-buff'))
  assert.ok(issues({ variants: [{ items: [] }] }).some(issue => issue.path.startsWith('/variants/0/combat/buffs/')))
  assert.ok(issues({ objective: { kind: 'collect', itemIds: ['missing-crate'] } }).some(issue => issue.code === 'unknown-item'))
  assert.deepEqual(issues({ objective: { kind: 'escape', exit: arena.start, itemIds: [] } }), [])
})

test('collected and elimination victories keep separate timed and relaxed score histories', () => {
  let history: ChallengeScoreHistory = {}
  for (const goal of ['collect', 'eliminate'] as const) {
    for (const mode of ['timed', 'relaxed'] as const) {
      history = updateChallengeScores(history, arena.id, { kind: 'arena', mode, goal, turns: 12, score: 3, passed: 1, total: 1 }).history
    }
  }
  const restored = challengeScoreSeries(readChallengeScores(JSON.stringify(history)), arena.id)
  assert.equal(restored.length, 4)
  assert.ok(restored.every(series => series.best.kind === 'arena' && series.best.turns === 12))
})
