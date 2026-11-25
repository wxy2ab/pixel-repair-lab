import type { Level, Localized, Position } from '../shared/types'
import { matchesCurrentChallenge } from './challengeGoals'
import { goalReplayTurnLimit } from './challengeGoalReview'
import type { ReplayFocusEvaluation, ReplayFocusPlan } from './challengeReplayFocus'
import { challengeScoreSignature, readChallengeScore, scoreMetrics, type ChallengeScore } from './challengeScore'

export const replayFocusHistoryKey = 'pixel-repair-lab:replay-focus-history'

export type ReplayFocusReference = 'replay' | 'entry' | 'history'

export type ReplayFocusHistoryRecord = {
  id: string
  at: number
  levelId: string
  title: Localized
  score: ChallengeScore
  result: ReplayFocusEvaluation
  reference: ReplayFocusReference
}

export type ReplayFocusHistory = ReplayFocusHistoryRecord[]
export type ReplayFocusHistoryEntry = ReplayFocusHistoryRecord & { level?: Level; canReplay: boolean; worthRetry: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCount(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

function readPosition(value: unknown): Position | undefined {
  if (isRecord(value) && isCount(value.x, 0, 1000) && isCount(value.y, 0, 1000)) return { x: value.x, y: value.y }
}

function readTitle(value: unknown): Localized | undefined {
  if (!isRecord(value) || typeof value.zh !== 'string' || typeof value.en !== 'string'
    || !value.zh.trim() || !value.en.trim()) return
  return { zh: value.zh.slice(0, 1200), en: value.en.slice(0, 1200) }
}

function readPlan(value: unknown, score: ChallengeScore): ReplayFocusPlan | undefined {
  if (!isRecord(value)) return
  const { key, attempt, before, seriesId, kind } = value
  if (!isCount(attempt, 1) || !isCount(before) || typeof key !== 'string' || typeof seriesId !== 'string'
    || seriesId !== challengeScoreSignature(score)) return
  const scope = { key, attempt, before, seriesId }
  if (kind === 'route' && (score.kind === 'grid' || score.kind === 'arena')) {
    const start = readPosition(value.start)
    const from = readPosition(value.from)
    const to = readPosition(value.to)
    const { sourceTurn } = value
    if (start && from && to && Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1
      && before <= goalReplayTurnLimit && isCount(sourceTurn, 1, goalReplayTurnLimit)
      && key === `route/${from.x},${from.y}/${to.x},${to.y}`) return { ...scope, kind, start, from, to, sourceTurn }
  }
  if (kind === 'case' && (score.kind === 'algorithm' || score.kind === 'machine' || score.kind === 'vision')) {
    const { index } = value
    if (isCount(index, 1, score.total) && before <= 1 && key === `case/${index}`) return { ...scope, kind, index }
  }
  if (kind === 'metric') {
    const metric = scoreMetrics(score).find(({ id }) => id === value.metricId)
    if (metric && (metric.total === undefined || before <= metric.total) && metric.preference === value.preference
      && key === `metric/${metric.id}`) return { ...scope, kind, metricId: metric.id, preference: metric.preference }
  }
}

function validAfter(plan: ReplayFocusPlan, score: ChallengeScore, after: number) {
  switch (plan.kind) {
    case 'route': return 'turns' in score && score.passed === score.total && score.turns <= goalReplayTurnLimit && after <= score.turns
    case 'case': return 'total' in score && (after === 1 ? score.passed > 0 : after === 0 && score.passed < score.total)
    case 'metric': return scoreMetrics(score).find(({ id }) => id === plan.metricId)?.value === after
      && (plan.preference === 'higher' || score.kind === 'ai' || score.passed === score.total)
  }
}

function readResult(value: unknown, score: ChallengeScore): ReplayFocusEvaluation | undefined {
  if (!isRecord(value)) return
  const plan = readPlan(value.plan, score)
  const { before, after, status } = value
  if (!plan || before !== plan.before) return
  if (after === undefined) {
    if (status === 'unavailable') return { plan, before, status }
    return
  }
  if (!isCount(after) || !validAfter(plan, score, after)) return
  const lowerIsBetter = plan.kind === 'route' || (plan.kind === 'metric' && plan.preference === 'lower')
  const improved = lowerIsBetter ? after < before : after > before
  const expected = after === before ? 'same' : improved ? 'improved' : 'worse'
  if (status === expected) return { plan, before, after, status: expected }
}

function readRecord(value: unknown): ReplayFocusHistoryRecord | undefined {
  if (!isRecord(value)) return
  const { id, at, levelId, reference } = value
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)
    || !isCount(at, 0, 8_640_000_000_000_000)
    || typeof levelId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(levelId)
    || (reference !== 'replay' && reference !== 'entry' && reference !== 'history')) return
  const title = readTitle(value.title)
  const score = readChallengeScore(value.score)
  const result = score && readResult(value.result, score)
  if (title && score && result) return { id, at, levelId, title, score, result, reference }
}

export function readReplayFocusHistory(raw: string | null): ReplayFocusHistory {
  if (!raw) return []
  try {
    const stored: unknown = JSON.parse(raw)
    if (!Array.isArray(stored)) return []
    const ids = new Set<string>()
    const history: ReplayFocusHistory = []
    for (const value of stored) {
      const entry = readRecord(value)
      if (entry && !ids.has(entry.id)) {
        ids.add(entry.id)
        history.push(entry)
      }
    }
    return history
  } catch {
    return []
  }
}

export function recordReplayFocus(
  history: ReplayFocusHistory, replay: Omit<ReplayFocusHistoryRecord, 'id' | 'at'>, at = Date.now(),
): ReplayFocusHistory {
  const ids = new Set(history.map(({ id }) => id))
  let suffix = 1
  while (ids.has(`${at}-${suffix}`)) suffix++
  const entry = readRecord({ ...replay, at, id: `${at}-${suffix}` })
  return entry ? [entry, ...history] : history
}

function routeAvailable(level: Level, plan: Extract<ReplayFocusPlan, { kind: 'route' }>) {
  if ((level.kind !== 'grid' && level.kind !== 'arena') || level.start.x !== plan.start.x || level.start.y !== plan.start.y) return false
  return [plan.from, plan.to].every(({ x, y }) => {
    if (level.tiles[y]?.[x] === '.') return true
    return level.kind === 'arena' && level.tiles[y]?.[x] === '#'
      && (level.shifts?.some(shift => shift.open?.some(cell => cell.x === x && cell.y === y))
        || level.combat?.switches?.some(control => control.open.some(cell => cell.x === x && cell.y === y)))
  })
}

function worthRetrying({ plan, before, after, status }: ReplayFocusEvaluation, level: Level, score: ChallengeScore) {
  if (status === 'improved') return false
  const value = after ?? before
  if (plan.kind === 'case') return value === 0
  if (plan.kind === 'route') return value > 0
  if (plan.metricId === 'cases') return 'total' in score && value < score.total
  if (plan.metricId === 'score') return level.kind === 'arena' && value < level.items.length
  const minimum = plan.metricId === 'rounds' && score.kind === 'ai' && score.mode === 'mixed' ? 2
    : plan.metricId === 'checks' || plan.metricId === 'rounds' ? 1 : 0
  return value > minimum
}

export function replayFocusHistoryEntries(history: ReplayFocusHistory, levels: readonly Level[]): ReplayFocusHistoryEntry[] {
  const byId = new Map(levels.map(level => [level.id, level]))
  const seen = new Set<string>()
  return history.map(entry => {
    const { levelId, score, result } = entry
    const { plan } = result
    const level = byId.get(levelId)
    const key = `${levelId}/${plan.seriesId}/${plan.key}`
    const canReplay = Boolean(level && matchesCurrentChallenge(level, score) && (plan.kind !== 'route' || routeAvailable(level, plan)))
    const worthRetry = Boolean(level && canReplay && !seen.has(key) && worthRetrying(result, level, score))
    seen.add(key)
    return { ...entry, level, canReplay, worthRetry }
  })
}

export function retryReplayFocus({ result, reference }: ReplayFocusHistoryEntry): { plan: ReplayFocusPlan; reference: ReplayFocusReference } {
  return result.after === undefined ? { plan: result.plan, reference }
    : { plan: { ...result.plan, before: result.after }, reference: 'history' }
}
