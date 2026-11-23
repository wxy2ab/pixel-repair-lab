import type { Locale, Position } from '../shared/types'
import { readGoalReplayDetails, type GoalReplayEvidence } from './challengeGoalReview'
import type { PendingChallengeGoal } from './challengeGoals'
import { challengeScoreSignature, scoreMetrics, type ChallengeScore, type ChallengeScoreMetric } from './challengeScore'
import { goalDifference } from './challengeScoreDisplay'
import { tr } from './text'

type FocusScope = { key: string; attempt: number; before: number; seriesId: string }
type RouteSegment = { from: Position; to: Position }

export type ReplayFocusPlan = FocusScope & (
  | ({ kind: 'route'; start: Position; sourceTurn: number } & RouteSegment)
  | { kind: 'case'; index: number }
  | { kind: 'metric'; metricId: ChallengeScoreMetric['id']; preference: ChallengeScoreMetric['preference'] }
)

export type ReplayFocusEvaluation = {
  plan: ReplayFocusPlan
  before: number
  after?: number
  status: 'improved' | 'same' | 'worse' | 'unavailable'
}

const metricDirections = {
  turns: ['少用一回合', 'Use one fewer turn'],
  score: ['多拿一分', 'Score one more point'],
  cases: ['多通过一个用例', 'Pass one more case'],
  checks: ['少检查一次', 'Make one fewer check'],
  instructions: ['少执行一条指令', 'Run one fewer instruction'],
  rounds: ['少用一轮协作', 'Use one fewer round'],
} satisfies Record<ChallengeScoreMetric['id'], [string, string]>

function segmentKey({ from, to }: RouteSegment) {
  return `${from.x},${from.y}/${to.x},${to.y}`
}

function routeSegments(start: Position, score: ChallengeScore, evidence?: GoalReplayEvidence) {
  if (!('turns' in score) || evidence?.truncated || evidence?.turns?.length !== score.turns) return
  const segments = new Map<string, RouteSegment & { count: number; sourceTurn: number }>()
  let from = start
  for (const [index, { turn, action, x, y, blocked }] of evidence.turns.entries()) {
    if (turn !== index + 1 || x === undefined || y === undefined) return
    const to = { x, y }
    const distance = Math.abs(x - from.x) + Math.abs(y - from.y)
    if (action === 'move' && !blocked) {
      if (distance !== 1) return
      const key = segmentKey({ from, to })
      const existing = segments.get(key)
      if (existing) existing.count++
      else segments.set(key, { from, to, count: 1, sourceTurn: turn })
    } else if (distance !== 0) return
    from = to
  }
  return segments
}

function canImprove(metric: ChallengeScoreMetric, entry: PendingChallengeGoal, cleared: boolean) {
  if (metric.id === 'score') return entry.level.kind === 'arena'
    && metric.value < entry.level.items.length
  if (metric.id === 'cases') return (entry.level.kind === 'algorithm' || entry.level.kind === 'machine' || entry.level.kind === 'vision')
    && metric.total !== undefined && metric.value < metric.total
  const minimum = metric.id === 'checks' || metric.id === 'rounds' ? 1 : 0
  return cleared && metric.value > minimum
}

export function replayFocusOptions(entry: PendingChallengeGoal, attempt: number): ReplayFocusPlan[] {
  const index = entry.progress.replays.findIndex(replay => replay.attempt === attempt)
  const selected = entry.progress.replays[index]
  if (!selected) return []
  const { level, seriesId } = entry
  const details = selected.details
  const cleared = selected.remaining !== null
  const options: ReplayFocusPlan[] = []

  if (details && (level.kind === 'grid' || level.kind === 'arena')) {
    const segments = routeSegments(level.start, details.score, details.evidence)
    const repeated = [...(segments?.values() ?? [])].filter(segment => segment.count > 1).sort((left, right) => right.count - left.count)
    for (const { from, to, count, sourceTurn } of repeated.slice(0, 2)) {
      options.push({ kind: 'route', key: `route/${segmentKey({ from, to })}`, seriesId, attempt, before: count,
        start: level.start, from, to, sourceTurn })
    }
  }

  const failedCases = details?.evidence?.cases?.filter(result => !result.passed) ?? []
  for (const { index } of failedCases.slice(0, 3)) {
    options.push({ kind: 'case', key: `case/${index}`, seriesId, attempt, before: 0, index })
  }

  const metricId = entry.goal.metricId
  const legacyValue = entry.goal.replays?.[index]
  const metrics = details ? scoreMetrics(details.score) : legacyValue == null ? [] : [{ id: metricId, preference: entry.goal.preference, value: legacyValue }]
  const useful = metrics.filter(metric => canImprove(metric, entry, cleared) && (metric.id !== 'cases' || failedCases.length === 0))
  const metric = useful.find(({ id }) => id === metricId) ?? useful[0]
  if (metric) options.push({ kind: 'metric', key: `metric/${metric.id}`, seriesId, attempt, before: metric.value,
    metricId: metric.id, preference: metric.preference })
  return options
}

export function replayFocusLabel(plan: ReplayFocusPlan, locale: Locale): string {
  if (plan.kind === 'case') return tr(locale, `先检查第 ${plan.index} 个用例`, `Check case ${plan.index} first`)
  if (plan.kind === 'route') return tr(locale, `少走一次第 ${plan.sourceTurn} 回合经过的那段路`,
    `Take the stretch from turn ${plan.sourceTurn} fewer times`)
  return tr(locale, ...metricDirections[plan.metricId])
}

export function replayFocusValue(plan: ReplayFocusPlan, value: number, locale: Locale): string {
  if (plan.kind === 'case') return value === 1 ? tr(locale, '通过', 'Passed') : tr(locale, '未通过', 'Did not pass')
  if (plan.kind === 'route') return tr(locale, `${value} 次`, `${value} ${value === 1 ? 'time' : 'times'}`)
  if (plan.metricId === 'cases') return tr(locale, `${value} 个用例`, `${value} ${value === 1 ? 'case' : 'cases'}`)
  return goalDifference(plan.metricId, value, locale)
}

export function evaluateReplayFocus(plan: ReplayFocusPlan, score: ChallengeScore, evidence: GoalReplayEvidence | undefined, won: boolean): ReplayFocusEvaluation {
  const { before } = plan
  const unavailable: ReplayFocusEvaluation = { plan, before, status: 'unavailable' }
  if (challengeScoreSignature(score) !== plan.seriesId) return unavailable
  let after: number | undefined
  if (plan.kind === 'route') {
    const segments = won ? routeSegments(plan.start, score, evidence) : undefined
    if (segments) after = segments.get(segmentKey(plan))?.count ?? 0
  } else if (plan.kind === 'case') {
    const recorded = readGoalReplayDetails({ score, evidence })?.evidence?.cases?.find(({ index }) => index === plan.index)
    if (recorded) after = Number(recorded.passed)
  } else if (won || plan.preference === 'higher') {
    after = scoreMetrics(score).find(({ id }) => id === plan.metricId)?.value
  }
  if (after === undefined) return unavailable
  const lowerIsBetter = plan.kind === 'route' || (plan.kind === 'metric' && plan.preference === 'lower')
  const improved = lowerIsBetter ? after < before : after > before
  return { plan, before, after, status: after === before ? 'same' : improved ? 'improved' : 'worse' }
}
