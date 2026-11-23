import type { Localized } from '../shared/types'
import type { PendingChallengeGoal } from './challengeGoals'
import { readChallengeScore, scoreMetrics, type ChallengeScore, type ChallengeScoreMetric } from './challengeScore'

const turnActions = ['move', 'pick', 'wait', 'step', 'submit'] as const
export const goalReplayTurnLimit = 64
export const goalReplayCaseLimit = 64

export type GoalReplayTurn = {
  turn: number
  action: typeof turnActions[number]
  x?: number
  y?: number
  item?: string
  blocked?: boolean
}

export type GoalReplayEvidence = {
  turns?: GoalReplayTurn[]
  truncated?: boolean
  cases?: { index: number; passed: boolean }[]
  issue?: { location: Localized; gaps: Localized[] }
}

export type GoalReplayDetails = { score: ChallengeScore; evidence?: GoalReplayEvidence }
export type GoalReplayAdvice = 'failure' | 'route' | 'score' | 'checks' | 'instructions' | 'rounds' | 'goal'

type ReplaySnapshot = PendingChallengeGoal['progress']['replays'][number]
type ReplayMetricComparison = {
  id: ChallengeScoreMetric['id']
  selected: number
  best: number
  selectedTotal?: number
  bestTotal?: number
  preference: ChallengeScoreMetric['preference']
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function coordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000
}

function localized(value: unknown): Localized | undefined {
  if (!record(value) || typeof value.zh !== 'string' || typeof value.en !== 'string' || !value.zh.trim() || !value.en.trim()) return
  return { zh: value.zh.slice(0, 300), en: value.en.slice(0, 400) }
}

function readTurn(value: unknown, index: number): GoalReplayTurn | undefined {
  if (!record(value)) return
  const { turn, action, x, y, item, blocked } = value
  if (turn !== index + 1 || !turnActions.includes(action as GoalReplayTurn['action'])) return
  return {
    turn,
    action: action as GoalReplayTurn['action'],
    ...(coordinate(x) && coordinate(y) ? { x, y } : {}),
    ...(typeof item === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(item) ? { item } : {}),
    ...(blocked === true ? { blocked: true } : {}),
  }
}

function readCases(value: unknown, score: ChallengeScore): GoalReplayEvidence['cases'] {
  if (!Array.isArray(value) || (score.kind !== 'algorithm' && score.kind !== 'machine' && score.kind !== 'vision')) return
  const cases: NonNullable<GoalReplayEvidence['cases']> = []
  const seen = new Set<number>()
  let passed = 0
  for (const outcome of value.slice(0, goalReplayCaseLimit)) {
    if (!record(outcome) || typeof outcome.index !== 'number' || !Number.isSafeInteger(outcome.index)
      || outcome.index < 1 || outcome.index > score.total || seen.has(outcome.index) || typeof outcome.passed !== 'boolean') return
    seen.add(outcome.index)
    cases.push({ index: outcome.index, passed: outcome.passed })
    if (outcome.passed) passed++
  }
  if (cases.length && passed <= score.passed && cases.length - passed <= score.total - score.passed) return cases
}

function readEvidence(value: unknown, score: ChallengeScore): GoalReplayEvidence | undefined {
  if (!record(value)) return
  const evidence: GoalReplayEvidence = {}
  if (Array.isArray(value.turns)) {
    const turns = value.turns.slice(0, goalReplayTurnLimit).map(readTurn)
    if (turns.every(turn => turn !== undefined)) {
      evidence.turns = turns
      if (value.truncated === true || value.turns.length > goalReplayTurnLimit) evidence.truncated = true
    }
  }
  if (record(value.issue) && Array.isArray(value.issue.gaps)) {
    const location = localized(value.issue.location)
    const gaps = value.issue.gaps.slice(0, 4).map(localized).filter(gap => gap !== undefined)
    if (location) evidence.issue = { location, gaps }
  }
  const cases = readCases(value.cases, score)
  if (cases) evidence.cases = cases
  return evidence.turns || evidence.cases || evidence.issue ? evidence : undefined
}

export function readGoalReplayDetails(value: unknown): GoalReplayDetails | undefined {
  if (!record(value)) return
  const score = readChallengeScore(value.score)
  if (!score) return
  const evidence = readEvidence(value.evidence, score)
  return evidence ? { score, evidence } : { score }
}

function completeTurns(details: GoalReplayDetails | undefined): GoalReplayTurn[] | undefined {
  const { evidence, score } = details ?? {}
  if (!score || !('turns' in score) || evidence?.truncated || evidence?.turns?.length !== score.turns) return
  return evidence.turns
}

function turnKey({ action, x, y, item, blocked }: GoalReplayTurn) {
  return `${action}:${x ?? ''}:${y ?? ''}:${item ?? ''}:${blocked ? 1 : 0}`
}

function scoredPickups(turns: GoalReplayTurn[] | undefined, details: GoalReplayDetails | undefined) {
  if (!turns || details?.score.kind !== 'arena' || details.score.goal !== 'score') return
  const items = new Map<string, number>()
  for (const { action, item, turn } of turns) {
    if (action === 'pick' && item) items.set(item, turn)
  }
  if (items.size === details.score.score) return items
}

function unmatchedTurns(selected: GoalReplayTurn[], best: GoalReplayTurn[]): GoalReplayTurn[] {
  const selectedKeys = selected.map(turnKey)
  const bestKeys = best.map(turnKey)
  const matches = Array.from({ length: selected.length + 1 }, () => new Uint8Array(best.length + 1))
  // Align the common actions so an early detour doesn't mark every subsequent turn as different.
  for (let i = selected.length - 1; i >= 0; i--) {
    for (let j = best.length - 1; j >= 0; j--) {
      matches[i][j] = selectedKeys[i] === bestKeys[j]
        ? 1 + matches[i + 1][j + 1]
        : Math.max(matches[i + 1][j], matches[i][j + 1])
    }
  }
  const extraTurns: GoalReplayTurn[] = []
  let i = 0
  let j = 0
  while (i < selected.length) {
    if (selectedKeys[i] === bestKeys[j]) {
      i++
      j++
    } else if (j < best.length && matches[i][j + 1] > matches[i + 1][j]) {
      j++
    } else {
      extraTurns.push(selected[i++])
    }
  }
  return extraTurns
}

function replayMetrics(entry: PendingChallengeGoal, index: number): ChallengeScoreMetric[] {
  const details = entry.progress.replays[index].details
  if (details) return scoreMetrics(details.score)
  const actual = entry.goal.replays?.[index]
  if (actual === undefined || actual === null) return []
  const { metricId: id, preference } = entry.goal
  return [{ id, value: actual, preference }]
}

function compareMetrics(selected: ChallengeScoreMetric[], best: ChallengeScoreMetric[]): ReplayMetricComparison[] {
  return selected.flatMap(metric => {
    const previous = best.find(({ id }) => id === metric.id)
    if (!previous) return []
    return [{ id: metric.id, selected: metric.value, best: previous.value, selectedTotal: metric.total,
      bestTotal: previous.total, preference: metric.preference }]
  })
}

function adviceFor(selected: ReplaySnapshot, metrics: ReplayMetricComparison[]): GoalReplayAdvice {
  if (selected.remaining === null) return 'failure'
  if (metrics.some(metric => metric.id === 'turns' && metric.selected > metric.best)) return 'route'
  if (metrics.some(metric => metric.id === 'score' && metric.selected < metric.best)) return 'score'
  const changed = metrics.find(metric => metric.preference === 'lower' && metric.selected > metric.best)?.id
  return changed === 'checks' || changed === 'instructions' || changed === 'rounds' ? changed : 'goal'
}

export function compareGoalReplay(entry: PendingChallengeGoal, attempt: number) {
  const selectedIndex = entry.progress.replays.findIndex(replay => replay.attempt === attempt)
  if (selectedIndex === -1) return
  const bestIndex = entry.progress.replays.findIndex(replay => replay.attempt === entry.progress.closestAttempt)
  const selected = entry.progress.replays[selectedIndex]
  const best = entry.progress.replays[bestIndex]
  const metrics = best ? compareMetrics(replayMetrics(entry, selectedIndex), replayMetrics(entry, bestIndex)) : []
  const selectedTurns = completeTurns(selected.details)
  const bestTurns = completeTurns(best?.details)
  const extraTurns = selectedTurns && bestTurns && selectedTurns.length > bestTurns.length
    ? unmatchedTurns(selectedTurns, bestTurns) : []
  const selectedItems = scoredPickups(selectedTurns, selected.details)
  const bestItems = scoredPickups(bestTurns, best?.details)
  const missedItems = selectedItems && bestItems && selectedItems.size < bestItems.size
    ? [...bestItems].flatMap(([id, turn]) => selectedItems.has(id) ? [] : [{ id, turn }]) : []
  return {
    selected, best, metrics, extraTurns, missedItems,
    turnComparisonAvailable: selectedTurns !== undefined && bestTurns !== undefined,
    advice: adviceFor(selected, metrics),
  }
}
