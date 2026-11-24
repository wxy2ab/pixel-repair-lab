import type { AiLevel, GridLevel, Level, Position } from '../shared/types'
import {
  buildChallengeGoal, challengeGoalMetrics, goalForScore, matchesCurrentChallenge, type ChallengeGoal, type ChallengeGoals,
} from './challengeGoals'
import { challengeScoreSeries, challengeScoreSignature, scoreMetrics, type ChallengeScore, type ChallengeScoreHistory } from './challengeScore'

export type ChallengeGoalRecommendation = {
  level: Level
  seriesId: string
  score: ChallengeScore
  goal: ChallengeGoal
  recent: number[]
  alreadyReached: boolean
}

const recentWinLimit = 3
const distance = (from: Position, to: Position) => Math.abs(from.x - to.x) + Math.abs(from.y - to.y)

function minimumGridTurns(level: GridLevel): number {
  const required = new Set(level.objectives.flatMap(goal => goal.type === 'collect' ? goal.itemIds : []))
  const pickups = level.items?.filter(item => required.has(item.id)) ?? []
  const exit = level.objectives.find(goal => goal.type === 'exit')
  const movement = Math.max(exit ? distance(level.start, exit) : 0,
    ...pickups.map(item => distance(level.start, item) + (exit ? distance(item, exit) : 0)),
    level.objectives.some(goal => goal.type === 'moves') ? 1 : 0)
  const haltStep = (level.instructions?.findIndex(instruction => instruction.op === 'HALT') ?? -1) + 1
  return required.size + movement + (level.objectives.some(goal => goal.type === 'halt') ? Math.max(1, haltStep) : 0)
}

function minimumAiRounds(level: AiLevel, score: Extract<ChallengeScore, { kind: 'ai' }>): number {
  if (score.mode !== 'offline') return score.mode === 'mixed' ? 2 : 1
  const faults = level.workflow?.faults ?? (level.trainingFault ? [level.trainingFault] : [])
  const firstPossible = faults.findIndex(fault =>
    fault.quantity === (Object.hasOwn(level.required, fault.itemId) ? level.required[fault.itemId] : 0))
  return (firstPossible < 0 ? faults.length : firstPossible) + 1
}

function fitsChallenge(level: Level, score: ChallengeScore, goal: ChallengeGoal): boolean {
  if (level.kind === 'grid') {
    return goal.target >= minimumGridTurns(level) && goal.target <= (level.turnLimit ?? Infinity)
  }
  if (level.kind === 'arena') {
    if (goal.metricId === 'score') return goal.target <= Math.min(level.items.length, level.maxTurns)
    const minimum = level.objective.kind === 'escape'
      ? distance(level.start, level.objective.exit) + new Set(level.objective.itemIds).size
      : level.objective.kind === 'collect' ? level.objective.itemIds.length
      : level.objective.kind === 'eliminate' ? 1
      : Math.min(level.maxTurns, Math.ceil(level.items.length / (level.opponents.length + 1)))
    return goal.target >= minimum && goal.target <= level.maxTurns
  }
  if (level.kind === 'data') return goal.target >= level.steps.length
  if (level.kind === 'vision') return goal.target >= level.cases.length
  if (level.kind === 'machine') {
    const minimum = Math.max(1, ...level.cases.map(({ memory, accumulator, goal: expected }) => {
      const writes = new Set(expected?.memory?.filter(target => target.value !== memory[target.address]).map(target => target.address))
      return 1 + writes.size + Number(expected?.accumulator !== undefined && expected.accumulator !== (accumulator ?? 0))
    }))
    return goal.target >= minimum
  }
  if (level.kind === 'ai' && score.kind === 'ai') return goal.target >= minimumAiRounds(level, score)
  return true
}

function compareRecentWins(level: Level, seriesId: string, wins: ChallengeScore[]): ChallengeGoalRecommendation | undefined {
  const score = wins.at(-1)
  if (!score || wins.length < 2) return

  let stretch: ChallengeGoalRecommendation | undefined
  for (const metric of challengeGoalMetrics(score)) {
    const goal = buildChallengeGoal(score, metric.id, 1)
    if (!goal || !fitsChallenge(level, score, goal)) continue
    const recent = wins.flatMap(win => {
      const value = scoreMetrics(win).find(candidate => candidate.id === metric.id)?.value
      return value !== undefined && Number.isSafeInteger(value) ? [value] : []
    })
    if (recent.length !== wins.length) continue
    const alreadyReached = recent.some(value => goal.preference === 'higher' ? value >= goal.target : value <= goal.target)
    const candidate = { level, seriesId, score, goal, recent, alreadyReached }
    if (alreadyReached) return candidate
    // Repeatedly finishing at a configured grid budget does not show there is a shorter route.
    if (level.kind === 'grid' && goal.baseline === level.turnLimit) continue
    if (recent.filter(value => Math.abs(value - goal.baseline) <= 1).length >= 2) stretch ??= candidate
  }
  return stretch
}

export function recommendChallengeGoals(
  levels: readonly Level[], history: ChallengeScoreHistory, goals: ChallengeGoals,
): ChallengeGoalRecommendation[] {
  const recommendations: ChallengeGoalRecommendation[] = []
  for (const level of levels) {
    for (const series of challengeScoreSeries(history, level.id)) {
      const currentGoal = goalForScore(goals, level.id, series.score)
      if ((currentGoal && currentGoal.achieved === undefined) || !matchesCurrentChallenge(level, series.score)
        || challengeScoreSignature(series.score) !== series.id) continue

      const wins = series.attempts.filter(({ at, legacy, score }) =>
        at !== null && !legacy && Number.isSafeInteger(at) && at >= 0
        && (score.kind === 'ai' || score.passed === score.total)
        && challengeScoreSignature(score) === series.id).slice(-recentWinLimit).map(({ score }) => score)
      const recommendation = compareRecentWins(level, series.id, wins)
      if (recommendation) recommendations.push(recommendation)
    }
  }
  return recommendations
}
