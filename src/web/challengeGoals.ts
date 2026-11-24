import type { Level } from '../shared/types'
import { readGoalReplayDetails, type GoalReplayDetails, type GoalReplayEvidence } from './challengeGoalReview'
import { challengeScoreSeries, challengeScoreSignature, isArenaGoalKind, readChallengeScore, scoreMetrics, type ChallengeScore, type ChallengeScoreHistory, type ChallengeScoreMetric } from './challengeScore'

export type ChallengeGoalMetricId = Exclude<ChallengeScoreMetric['id'], 'cases'>

export type ChallengeGoal = {
  metricId: ChallengeGoalMetricId
  baseline: number
  target: number
  preference: ChallengeScoreMetric['preference']
  lastReplayActual?: number | null
  achieved?: number
  attempts?: number
  replays?: (number | null)[]
  replayDetails?: Record<number, GoalReplayDetails>
}

export type ChallengeGoals = Record<string, Record<string, ChallengeGoal>>

export type ChallengeGoalEvaluation = {
  goal: ChallengeGoal
  actual: number
  remaining: number
  achieved: boolean
}

type ChallengeGoalProgress = {
  replays: { attempt: number; remaining: number | null; details?: GoalReplayDetails }[]
  closestAttempt?: number
  stalled: boolean
  startsMidGoal: boolean
}

export type PendingChallengeGoal = {
  level: Level
  seriesId: string
  score: ChallengeScore
  goal: ChallengeGoal
  remaining?: number
  progress: ChallengeGoalProgress
}

type GoalAchievement = {
  levelId: string
  seriesId: string
  score: ChallengeScore
  goal: ChallengeGoal
  actual: number
  attempts?: number
  metricOnly?: boolean
}

type ArchivedGoal = GoalAchievement & { id: string }
export type ChallengeGoalHistory = ArchivedGoal[]
export type ChallengeGoalStore = { goals: ChallengeGoals; history: ChallengeGoalHistory }
export type CompletedChallengeGoal = Omit<ArchivedGoal, 'levelId'> & { level: Level; canSetNext: boolean }

type ChallengeGoalMetric = ChallengeScoreMetric & { id: ChallengeGoalMetricId; improvementLimit: number }

export const challengeGoalsKey = 'pixel-repair-lab:challenge-goals'

const levelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
const metricMinimum = { turns: 0, score: 0, checks: 1, instructions: 0, rounds: 1 } satisfies Record<ChallengeGoalMetricId, number>
const recentReplayDetailsLimit = 20

function validCount(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}

function completeScore(score: ChallengeScore): boolean {
  return score.kind === 'ai' || (validCount(score.total, 1) && score.passed === score.total)
}

export function challengeGoalMetrics(score: ChallengeScore): ChallengeGoalMetric[] {
  if (!completeScore(score)) return []
  const available: ChallengeGoalMetric[] = []
  for (const metric of scoreMetrics(score)) {
    const { id, value, preference } = metric
    if (id === 'cases' || !validCount(value, metricMinimum[id])) continue
    const improvementLimit = preference === 'higher' ? Number.MAX_SAFE_INTEGER - value : value - metricMinimum[id]
    if (improvementLimit > 0) available.push({ id, value, preference, improvementLimit })
  }
  return available
}

export function buildChallengeGoal(score: ChallengeScore, metricId: ChallengeGoalMetricId, improvement: number): ChallengeGoal | undefined {
  const metric = challengeGoalMetrics(score).find(({ id }) => id === metricId)
  if (!metric || !validCount(improvement, 1) || improvement > metric.improvementLimit) return
  const { value: baseline, preference } = metric
  const target = preference === 'higher' ? baseline + improvement : baseline - improvement
  return { metricId, baseline, target, preference }
}

export function goalForScore(goals: ChallengeGoals, levelId: string, score: ChallengeScore): ChallengeGoal | undefined {
  return Object.hasOwn(goals, levelId) ? goals[levelId][challengeScoreSignature(score)] : undefined
}

function storeGoal(goals: ChallengeGoals, levelId: string, score: ChallengeScore, goal: ChallengeGoal): ChallengeGoals {
  return storeGoalSeries(goals, levelId, challengeScoreSignature(score), goal)
}

function storeGoalSeries(goals: ChallengeGoals, levelId: string, seriesId: string, goal: ChallengeGoal): ChallengeGoals {
  const series = Object.hasOwn(goals, levelId) ? goals[levelId] : {}
  return { ...goals, [levelId]: { ...series, [seriesId]: goal } }
}

export function saveChallengeGoal(goals: ChallengeGoals, levelId: string, score: ChallengeScore, goal: ChallengeGoal): ChallengeGoals {
  const improvement = goal.preference === 'higher' ? goal.target - goal.baseline : goal.baseline - goal.target
  const rebuilt = buildChallengeGoal(score, goal.metricId, improvement)
  if (!rebuilt || !levelIdPattern.test(levelId) || rebuilt.baseline !== goal.baseline
    || rebuilt.target !== goal.target || rebuilt.preference !== goal.preference) return goals
  return storeGoal(goals, levelId, score, { ...rebuilt, lastReplayActual: null, attempts: 0, replays: [] })
}

export function scoreAtGoalBaseline(score: ChallengeScore, goal: ChallengeGoal): ChallengeScore {
  return { ...score, [goal.metricId]: goal.baseline }
}

export function adjustChallengeGoal(goals: ChallengeGoals, levelId: string, score: ChallengeScore, nextGoal: ChallengeGoal): ChallengeGoals {
  const goal = goalForScore(goals, levelId, score)
  if (!goal || goal.achieved !== undefined || goal.metricId !== nextGoal.metricId
    || goal.baseline !== nextGoal.baseline || goal.preference !== nextGoal.preference || goal.target === nextGoal.target) return goals
  const improvement = gap(goal.preference, nextGoal.target, goal.baseline)
  const rebuilt = buildChallengeGoal(scoreAtGoalBaseline(score, goal), goal.metricId, improvement)
  if (!rebuilt || rebuilt.target !== nextGoal.target) return goals
  return storeGoal(goals, levelId, score, { ...goal, target: rebuilt.target, replays: goal.replays ?? [] })
}

export function removeChallengeGoal(goals: ChallengeGoals, levelId: string, score: ChallengeScore): ChallengeGoals {
  if (!goalForScore(goals, levelId, score)) return goals
  const next = { ...goals }
  const series = { ...goals[levelId] }
  delete series[challengeScoreSignature(score)]
  if (Object.keys(series).length) next[levelId] = series
  else delete next[levelId]
  return next
}

function gap(preference: ChallengeGoal['preference'], target: number, actual: number): number {
  return preference === 'higher' ? target - actual : actual - target
}

function goalResult(goal: ChallengeGoal, score: ChallengeScore): ChallengeGoalEvaluation | undefined {
  if (!completeScore(score)) return
  const metric = scoreMetrics(score).find(({ id }) => id === goal.metricId)
  if (!metric || !validCount(metric.value, metricMinimum[goal.metricId])) return
  const actual = metric.value
  const remaining = Math.max(0, gap(goal.preference, goal.target, actual))
  return { goal, actual, remaining, achieved: remaining === 0 }
}

function retainReplayDetails(goal: ChallengeGoal, replays: (number | null)[], details: Record<number, GoalReplayDetails>) {
  const retained = Object.entries(details).slice(-recentReplayDetailsLimit)
  let closest = -1
  let bestGap = Infinity
  for (const [index, actual] of replays.entries()) {
    if (actual === null) continue
    const remaining = Math.max(0, gap(goal.preference, goal.target, actual))
    if (remaining < bestGap) {
      closest = index
      bestGap = remaining
    }
  }
  if (Object.hasOwn(details, closest)) retained.push([String(closest), details[closest]])
  return Object.fromEntries(retained)
}

function recordReplay(goal: ChallengeGoal, actual: number | null, details?: GoalReplayDetails): ChallengeGoal {
  if (goal.attempts === Number.MAX_SAFE_INTEGER) {
    return actual === null || actual === goal.lastReplayActual ? goal : { ...goal, lastReplayActual: actual, replays: goal.replays ?? [] }
  }
  const replays = [...(goal.replays ?? []), actual]
  const replayDetails = details && retainReplayDetails(goal, replays, { ...goal.replayDetails, [replays.length - 1]: details })
  return {
    ...goal,
    ...(goal.attempts === undefined ? {} : { attempts: goal.attempts + 1 }),
    ...(actual === null ? {} : { lastReplayActual: actual }),
    replays,
    ...(replayDetails ? { replayDetails } : {}),
  }
}

export function recordChallengeGoalFailure(goals: ChallengeGoals, levelId: string, seriesId: string, details?: GoalReplayDetails): ChallengeGoals {
  const series = Object.hasOwn(goals, levelId) ? goals[levelId] : undefined
  if (!series || !Object.hasOwn(series, seriesId)) return goals
  const goal = series[seriesId]
  if (goal.achieved !== undefined) return goals
  const updated = recordReplay(goal, null, details && readReplayDetails(goal, seriesId, null, details))
  return updated === goal ? goals : storeGoalSeries(goals, levelId, seriesId, updated)
}

function originalGoal({ metricId, baseline, target, preference }: ChallengeGoal): ChallengeGoal {
  return { metricId, baseline, target, preference }
}

export function evaluateChallengeGoal(
  goals: ChallengeGoals,
  levelId: string,
  score: ChallengeScore,
  evidence?: GoalReplayEvidence,
): { goals: ChallengeGoals; result?: ChallengeGoalEvaluation; achievement?: GoalAchievement } {
  const goal = goalForScore(goals, levelId, score)
  if (!goal || goal.achieved !== undefined) return { goals }
  const result = goalResult(goal, score)
  if (!result) return { goals }
  const details = evidence === undefined ? undefined : readGoalReplayDetails({ score, evidence })
  const replayed = recordReplay(goal, result.actual, details)
  if (result.achieved) return {
    goals: storeGoal(goals, levelId, score, { ...replayed, achieved: result.actual }),
    result,
    achievement: {
      levelId, seriesId: challengeScoreSignature(score), score, goal: originalGoal(goal), actual: result.actual,
      ...(replayed.attempts === undefined ? {} : { attempts: replayed.attempts }),
    },
  }
  if (replayed === goal) return { goals, result }
  return { goals: storeGoal(goals, levelId, score, replayed), result }
}

export function archiveChallengeGoal(history: ChallengeGoalHistory, achievement: GoalAchievement): ChallengeGoalHistory {
  const { levelId, seriesId } = achievement
  const prefix = `${levelId}/${seriesId}/`
  const previous = history.find(record => record.id.startsWith(prefix))
  const sequence = previous ? Number(previous.id.slice(prefix.length)) + 1 : 1
  return [{ ...achievement, id: `${prefix}${sequence}` }, ...history]
}

export function matchesCurrentChallenge(level: Level, score: ChallengeScore): boolean {
  switch (score.kind) {
    case 'grid': return level.kind === 'grid' && score.total === 1 + (level.variants?.length ?? 0)
    case 'arena':
      return level.kind === 'arena' && score.goal === level.objective.kind
        && score.total === (score.mode === 'timed' ? 1 : 1 + (level.variants?.length ?? 0))
    case 'algorithm': return level.kind === 'algorithm' && score.total === level.cases.length
    case 'vision': return level.kind === 'vision' && score.total === level.cases.length
    case 'machine': return level.kind === 'machine' && score.total === level.cases.length
    case 'data': return level.kind === 'data' && score.total === level.steps.length
    case 'ai': return level.kind === 'ai'
  }
}

export function completedChallengeGoals(levels: readonly Level[], history: ChallengeGoalHistory): CompletedChallengeGoal[] {
  const byId = new Map(levels.map(level => [level.id, level]))
  return history.flatMap(({ levelId, ...record }) => {
    const level = byId.get(levelId)
    return level ? [{ ...record, level, canSetNext: matchesCurrentChallenge(level, record.score) }] : []
  })
}

function goalProgress(goal: ChallengeGoal, lastKnownGap?: number): ChallengeGoalProgress {
  const actuals = goal.replays ?? []
  const unrecorded = (goal.attempts ?? actuals.length) - actuals.length
  let best = gap(goal.preference, goal.target, goal.baseline)
  let closestGap = Infinity
  let closestAttempt: number | undefined
  let noProgress = 0
  const replays = actuals.map((actual, index) => {
    const attempt = unrecorded + index + 1
    const remaining = actual === null ? null : Math.max(0, gap(goal.preference, goal.target, actual))
    if (remaining !== null && remaining < closestGap) {
      closestAttempt = attempt
      closestGap = remaining
    }
    if (remaining !== null && remaining < best) {
      best = remaining
      noProgress = 0
    } else noProgress++
    const details = goal.replayDetails?.[index]
    return { attempt, remaining, ...(details ? { details } : {}) }
  })
  return {
    replays,
    ...(closestAttempt === undefined ? {} : { closestAttempt }),
    stalled: noProgress >= 3 && best > 0 && lastKnownGap !== 0,
    startsMidGoal: goal.attempts === undefined || unrecorded > 0,
  }
}

export function pendingChallengeGoals(
  levels: readonly Level[], history: ChallengeScoreHistory, goals: ChallengeGoals,
): PendingChallengeGoal[] {
  const pending: PendingChallengeGoal[] = []
  for (const level of levels) {
    if (!Object.hasOwn(goals, level.id)) continue
    for (const { id: seriesId, score: latest, attempts } of challengeScoreSeries(history, level.id)) {
      const lastWin = attempts.findLast(({ score }) => completeScore(score))
      const score = completeScore(latest) ? latest : lastWin?.score
      if (!score) continue
      const goal = goalForScore(goals, level.id, score)
      if (!goal || goal.achieved !== undefined || !matchesCurrentChallenge(level, score)) continue
      const result = goalResult(goal, score)
      if (!result) continue
      const recordedActual = goal.lastReplayActual ?? goal.replays?.findLast(actual => actual !== null)
      const inferredLegacyReplay = recordedActual === undefined && goal.lastReplayActual !== null
        && lastWin?.at != null && result.actual !== goal.baseline
      const actual = inferredLegacyReplay ? result.actual : recordedActual
      const remaining = actual === undefined ? undefined : Math.max(0, gap(goal.preference, goal.target, actual))
      if (inferredLegacyReplay && goal.replays === undefined && remaining === 0) continue
      pending.push({ level, seriesId, score, goal, remaining, progress: goalProgress(goal, remaining) })
    }
  }
  return pending
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function metricFitsSeries(metricId: ChallengeGoalMetricId, series: string): boolean {
  if (metricId === 'rounds') return /^ai:(offline|online|mixed)$/.test(series)
  const parts = series.split(':')
  const total = parts[parts.length - 1]
  if (!/^[1-9]\d*$/.test(total) || !validCount(Number(total), 1)) return false
  const [kind, mode, objective] = parts
  if (kind === 'arena') {
    return parts.length === 4 && (mode === 'relaxed' || mode === 'timed')
      && isArenaGoalKind(objective)
      && (metricId === 'turns' || (objective === 'score' && metricId === 'score'))
  }
  if (parts.length !== 2) return false
  return (kind === 'grid' && metricId === 'turns')
    || (kind === 'machine' && metricId === 'instructions')
    || ((kind === 'algorithm' || kind === 'data' || kind === 'vision') && metricId === 'checks')
}

function readReplayDetails(goal: ChallengeGoal, series: string, actual: number | null, value: unknown) {
  const details = readGoalReplayDetails(value)
  if (!details || challengeScoreSignature(details.score) !== series) return
  if (actual !== null && (goalResult(goal, details.score)?.actual !== actual)) return
  return details
}

function readGoal(value: unknown, series: string): ChallengeGoal | undefined {
  if (!isObject(value)) return
  const { metricId, baseline, target, preference, lastReplayActual, achieved, attempts, replays, replayDetails } = value
  if (typeof metricId !== 'string' || !Object.hasOwn(metricMinimum, metricId)) return
  const id = metricId as ChallengeGoalMetricId
  const minimum = metricMinimum[id]
  const requiredPreference = id === 'score' ? 'higher' : 'lower'
  if (preference !== requiredPreference || !metricFitsSeries(id, series)
    || !validCount(baseline, minimum) || !validCount(target, minimum)
    || gap(requiredPreference, target, baseline) <= 0) return
  const goal: ChallengeGoal = { metricId: id, baseline, target, preference: requiredPreference }
  if (attempts !== undefined) {
    if (!validCount(attempts, 0)) return
    goal.attempts = attempts
  }
  if (Array.isArray(replays) && (goal.attempts === undefined || replays.length <= goal.attempts)
    && replays.every(replay => replay === null || validCount(replay, minimum))) goal.replays = replays
  if (goal.replays && isObject(replayDetails)) {
    const entries = Object.entries(replayDetails).flatMap(([index, value]) => {
      const ordinal = Number(index)
      const actual = goal.replays?.[ordinal]
      if (index !== String(ordinal) || actual === undefined) return []
      const details = readReplayDetails(goal, series, actual, value)
      return details ? [[index, details] as const] : []
    })
    if (entries.length) goal.replayDetails = retainReplayDetails(goal, goal.replays, Object.fromEntries(entries))
  }
  if (lastReplayActual !== undefined) {
    if (lastReplayActual !== null
      && (!validCount(lastReplayActual, minimum) || (goal.replays === undefined && gap(requiredPreference, target, lastReplayActual) <= 0))) return
    goal.lastReplayActual = lastReplayActual
  }
  if (achieved === undefined) return goal
  if (validCount(achieved, minimum) && gap(requiredPreference, target, achieved) <= 0) return { ...goal, achieved }
}

function parseStore(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    return isObject(value) ? value : {}
  } catch {
    return {}
  }
}

function readGoals(value: Record<string, unknown>): ChallengeGoals {
  const entries: [string, Record<string, ChallengeGoal>][] = []
  for (const [id, levelGoals] of Object.entries(value)) {
    if (!levelIdPattern.test(id) || !isObject(levelGoals)) continue
    const records: [string, ChallengeGoal][] = []
    for (const [series, entry] of Object.entries(levelGoals)) {
      const goal = readGoal(entry, series)
      if (goal) records.push([series, goal])
    }
    if (records.length) entries.push([id, Object.fromEntries(records)])
  }
  return Object.fromEntries(entries)
}

export function readChallengeGoals(raw: string | null): ChallengeGoals {
  return readGoals(parseStore(raw))
}

function readArchive(value: unknown): ChallengeGoalHistory {
  if (!Array.isArray(value)) return []
  const records: ChallengeGoalHistory = []
  const known = new Set<string>()
  for (const entry of value) {
    if (!isObject(entry)) continue
    const { id, levelId, seriesId, actual, attempts, metricOnly } = entry
    const score = readChallengeScore(entry.score)
    if (!score || typeof id !== 'string' || known.has(id) || typeof levelId !== 'string' || !levelIdPattern.test(levelId)
      || challengeScoreSignature(score) !== seriesId || (attempts !== undefined && !validCount(attempts, 1))
      || (metricOnly !== undefined && metricOnly !== true)) continue
    const prefix = `${levelId}/${seriesId}/`
    const sequence = id.startsWith(prefix) ? id.slice(prefix.length) : ''
    if (id !== `legacy/${levelId}/${seriesId}` && (!/^[1-9]\d*$/.test(sequence) || !validCount(Number(sequence), 1))) continue
    const goal = readGoal(entry.goal, seriesId)
    const result = goal && goalResult(goal, score)
    if (!goal || !result?.achieved || result.actual !== actual) continue
    known.add(id)
    records.push({ id, levelId, seriesId, goal: originalGoal(goal), score, actual,
      ...(attempts === undefined ? {} : { attempts }), ...(metricOnly ? { metricOnly } : {}) })
  }
  return records
}

function legacyScore(seriesId: string, goal: ChallengeGoal, actual: number): ChallengeScore | undefined {
  const [kind, variant, objective, maps] = seriesId.split(':')
  if (kind === 'ai') {
    if (variant === 'offline' || variant === 'online' || variant === 'mixed') return { kind, mode: variant, rounds: actual }
    return
  }
  if (kind === 'arena') {
    if ((variant !== 'relaxed' && variant !== 'timed') || !isArenaGoalKind(objective)) return
    const total = Number(maps)
    return { kind, mode: variant, goal: objective, total, passed: total,
      turns: goal.metricId === 'turns' ? actual : 0, score: goal.metricId === 'score' ? actual : 0 }
  }
  const total = Number(variant)
  switch (kind) {
    case 'grid': return { kind, total, passed: total, turns: actual }
    case 'algorithm':
    case 'vision':
    case 'data': return { kind, total, passed: total, checks: actual }
    case 'machine': return { kind, total, passed: total, instructions: actual }
  }
}

function recoverLegacyGoal(levelId: string, seriesId: string, goal: ChallengeGoal, actual: number, scores: ChallengeScoreHistory): ArchivedGoal | undefined {
  const fallback = legacyScore(seriesId, goal, actual)
  if (!fallback) return
  const candidates = challengeScoreSeries(scores, levelId).find(series => series.id === seriesId)?.attempts
    .map(attempt => attempt.score).filter(score => goalResult(goal, score)?.actual === actual) ?? []
  const first = candidates[0]
  const exact = first && (first.kind !== 'arena' || candidates.every(score =>
    score.kind === 'arena' && score.turns === first.turns && score.score === first.score))
  return { id: `legacy/${levelId}/${seriesId}`, levelId, seriesId, goal: originalGoal(goal), actual,
    score: exact ? first : fallback, ...(!exact && fallback.kind === 'arena' ? { metricOnly: true } : {}) }
}

export function readChallengeGoalStore(raw: string | null, scores: ChallengeScoreHistory): ChallengeGoalStore {
  const parsed = parseStore(raw)
  const goals = readGoals(parsed)
  const history = readArchive(parsed._achieved)
  for (const [levelId, series] of Object.entries(goals)) {
    for (const [seriesId, goal] of Object.entries(series)) {
      const actual = goal.achieved
      if (actual === undefined || history.some(entry => entry.levelId === levelId && entry.seriesId === seriesId
        && entry.actual === actual && entry.goal.baseline === goal.baseline && entry.goal.target === goal.target
        && entry.goal.metricId === goal.metricId)) continue
      const recovered = recoverLegacyGoal(levelId, seriesId, goal, actual, scores)
      if (recovered) history.push(recovered)
    }
  }
  return { goals, history }
}

export function serializeChallengeGoalStore({ goals, history }: ChallengeGoalStore): string {
  return JSON.stringify(history.length ? { ...goals, _achieved: history } : goals)
}
