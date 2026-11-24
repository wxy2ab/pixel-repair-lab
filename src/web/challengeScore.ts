import type { GoalReplayEvidence } from './challengeGoalReview'
import type { ArenaScenario } from '../shared/advanced'
import type { Localized } from '../shared/types'

type ArenaGoalKind = ArenaScenario['objective']['kind']
export function isArenaGoalKind(value: unknown): value is ArenaGoalKind {
  return value === 'score' || value === 'escape' || value === 'eliminate' || value === 'collect'
}

export type ChallengeScore =
  | { kind: 'grid'; turns: number; passed: number; total: number }
  | { kind: 'arena'; mode: 'relaxed' | 'timed'; goal: ArenaGoalKind; turns: number; score: number; passed: number; total: number }
  | { kind: 'algorithm'; passed: number; total: number; checks: number }
  | { kind: 'machine'; passed: number; total: number; instructions: number }
  | { kind: 'data'; passed: number; total: number; checks: number }
  | { kind: 'vision'; passed: number; total: number; checks: number }
  | { kind: 'ai'; rounds: number; mode: 'offline' | 'online' | 'mixed' }

export type ChallengeRunHandlers = {
  onWin: (score: ChallengeScore, replay: () => void, evidence?: GoalReplayEvidence, outcome?: Localized) => void
  onFailure: (score: ChallengeScore, evidence?: GoalReplayEvidence) => void
  onStart: () => void
}

export type ChallengeScoreMetric = {
  id: 'turns' | 'score' | 'cases' | 'checks' | 'instructions' | 'rounds'
  value: number
  total?: number
  preference: 'higher' | 'lower'
}

export type ChallengeScoreAttempt = {
  score: ChallengeScore
  at: number | null
  legacy?: 'best' | 'latest'
}

export type ChallengeScoreSeries = {
  id: string
  score: ChallengeScore
  best: ChallengeScore
  attempts: ChallengeScoreAttempt[]
}

type ScoreRecord = { latest: ChallengeScore; best: ChallengeScore; attempts?: ChallengeScoreAttempt[] }
export type ChallengeScoreHistory = Record<string, Record<string, ScoreRecord>>

export type ChallengeScoreComparison = {
  current: ChallengeScore
  previous?: ChallengeScore
  best: ChallengeScore
  newBest: boolean
}

export const challengeScoresKey = 'pixel-repair-lab:challenge-scores'

function countMetric(id: ChallengeScoreMetric['id'], value: number): ChallengeScoreMetric {
  return { id, value, preference: 'lower' }
}

// The order is also the priority for deciding a best score.
export function scoreMetrics(score: ChallengeScore): ChallengeScoreMetric[] {
  if (score.kind === 'ai') return [countMetric('rounds', score.rounds)]

  const cases: ChallengeScoreMetric = { id: 'cases', value: score.passed, total: score.total, preference: 'higher' }
  switch (score.kind) {
    case 'grid':
      return [countMetric('turns', score.turns), cases]
    case 'arena':
      return score.goal === 'score'
        ? [{ id: 'score', value: score.score, preference: 'higher' }, countMetric('turns', score.turns), cases]
        : [countMetric('turns', score.turns), cases]
    case 'machine':
      return [cases, countMetric('instructions', score.instructions)]
    case 'algorithm':
    case 'vision':
    case 'data':
      return [cases, countMetric('checks', score.checks)]
  }
}

function signature(score: ChallengeScore) {
  switch (score.kind) {
    case 'ai': return `${score.kind}:${score.mode}`
    case 'arena': return `${score.kind}:${score.mode}:${score.goal}:${score.total}`
    default: return `${score.kind}:${score.total}`
  }
}

export { signature as challengeScoreSignature }

function compareScores(score: ChallengeScore, best: ChallengeScore): number {
  const previous = scoreMetrics(best)
  const current = scoreMetrics(score)
  for (const [index, metric] of current.entries()) {
    const other = previous[index].value
    if (metric.value === other) continue
    return metric.preference === 'higher' ? metric.value - other : other - metric.value
  }
  return 0
}

export function isBestChallengeScore(score: ChallengeScore, best: ChallengeScore): boolean {
  return signature(score) === signature(best) && compareScores(score, best) === 0
}

function scoreAttempts(record: ScoreRecord): ChallengeScoreAttempt[] {
  if (record.attempts) return record.attempts
  const { latest, best } = record
  const sameScore = isBestChallengeScore(latest, best)
    && (latest.kind !== 'arena' || (best.kind === 'arena' && latest.score === best.score))
  const recent: ChallengeScoreAttempt = { score: latest, at: null, legacy: 'latest' }
  return sameScore ? [recent] : [{ score: best, at: null, legacy: 'best' }, recent]
}

export function challengeScoreSeries(history: ChallengeScoreHistory, levelId: string): ChallengeScoreSeries[] {
  if (!Object.hasOwn(history, levelId)) return []
  return Object.entries(history[levelId]).map(([id, record]) => ({
    id, score: record.latest, best: record.best, attempts: scoreAttempts(record),
  }))
}

export function updateChallengeScores(
  history: ChallengeScoreHistory,
  levelId: string,
  score: ChallengeScore,
  at = Date.now(),
): { history: ChallengeScoreHistory; comparison: ChallengeScoreComparison } {
  const key = signature(score)
  const records = Object.hasOwn(history, levelId) ? history[levelId] : {}
  const previous = records[key]
  const newBest = previous !== undefined && compareScores(score, previous.best) > 0
  const best = !previous || newBest ? score : previous.best
  const attempts = [...(previous ? scoreAttempts(previous) : []), { score, at }]

  return {
    history: { ...history, [levelId]: { ...records, [key]: { latest: score, best, attempts } } },
    comparison: { current: score, previous: previous?.latest, best, newBest },
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function count(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function readScore(value: unknown): ChallengeScore | undefined {
  if (!object(value)) return
  const { kind, mode, rounds, passed, total, turns, goal, score, checks, instructions } = value
  if (kind === 'ai') {
    if (count(rounds, 1) && (mode === 'offline' || mode === 'online' || mode === 'mixed')) return { kind, rounds, mode }
    return
  }

  if (!count(passed) || !count(total, 1) || passed > total) return
  switch (kind) {
    case 'grid':
      if (count(turns)) return { kind, turns, passed, total }
      break
    case 'arena':
      if ((mode === 'relaxed' || mode === 'timed') && isArenaGoalKind(goal) && count(turns) && count(score)) {
        return { kind, mode, goal, turns, score, passed, total }
      }
      break
    case 'algorithm':
    case 'vision':
    case 'data':
      if (count(checks, 1)) return { kind, passed, total, checks }
      break
    case 'machine':
      if (count(instructions)) return { kind, passed, total, instructions }
      break
  }
}

export { readScore as readChallengeScore }

function readAttempts(value: unknown, key: string): ChallengeScoreAttempt[] {
  if (!Array.isArray(value)) return []
  const attempts: ChallengeScoreAttempt[] = []
  for (const entry of value) {
    if (!object(entry)) continue
    const score = readScore(entry.score)
    if (!score || signature(score) !== key) continue
    const { at, legacy } = entry
    if (at === null && (legacy === 'best' || legacy === 'latest')) attempts.push({ score, at, legacy })
    else if (legacy === undefined && count(at) && at <= 8_640_000_000_000_000) attempts.push({ score, at })
  }
  return attempts
}

export function readChallengeScores(raw: string | null): ChallengeScoreHistory {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!object(value)) return {}

    const entries: [string, Record<string, ScoreRecord>][] = []
    for (const [id, levelScores] of Object.entries(value)) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) || !object(levelScores)) continue
      const records: [string, ScoreRecord][] = []
      for (const [key, record] of Object.entries(levelScores)) {
        if (!object(record)) continue
        const attempts = readAttempts(record.attempts, key)
        if (attempts.length) {
          const latest = attempts[attempts.length - 1].score
          const best = attempts.reduce((best, { score }) => compareScores(score, best) > 0 ? score : best, attempts[0].score)
          records.push([key, { latest, best, attempts }])
          continue
        }
        const latest = readScore(record.latest)
        if (!latest || key !== signature(latest)) continue
        const best = readScore(record.best)
        records.push([key, {
          latest,
          best: best && key === signature(best) && compareScores(latest, best) <= 0 ? best : latest,
        }])
      }
      if (records.length) entries.push([id, Object.fromEntries(records)])
    }
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}
