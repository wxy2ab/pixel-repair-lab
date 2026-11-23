import type { ArenaResult } from '../shared/advanced'
import type { GridLevel, GridSnapshot, RunResult } from '../shared/types'
import type { ChallengeReviewData } from './ChallengeFailureReview'
import { arenaFailureReview, gridFailureReview } from './challengeGameReview'
import { goalReplayTurnLimit, type GoalReplayEvidence } from './challengeGoalReview'

export function goalReplayIssue(review?: ChallengeReviewData): GoalReplayEvidence | undefined {
  if (!review) return undefined
  return { issue: { location: review.location, gaps: review.gaps } }
}

export function gridGoalReplayEvidence(level: GridLevel, result: RunResult): GoalReplayEvidence {
  const turns: NonNullable<GoalReplayEvidence['turns']> = []
  let previous: Pick<GridSnapshot, 'turn' | 'items' | 'devices'> = { turn: 0, items: level.items ?? [] }
  for (const { action, state } of result.frames) {
    if (state.turn > previous.turn && (action === 'move' || action === 'pick' || action === 'step' || action === 'wait')) {
      const { x, y } = state.player
      const item = action === 'pick' ? (previous.items.find(before => !state.items.some(after => before.id === after.id))?.id
        ?? state.devices?.openedChests.find(id => !previous.devices?.openedChests.includes(id))) : undefined
      turns.push({ turn: state.turn, action, x, y, ...(item === undefined ? {} : { item }) })
    }
    previous = state
    if (turns.length === goalReplayTurnLimit) break
  }
  return {
    turns,
    ...(result.final.turn > goalReplayTurnLimit ? { truncated: true } : {}),
    ...(!result.won ? goalReplayIssue(gridFailureReview(result)) : undefined),
  }
}

export function arenaGoalReplayEvidence(result: ArenaResult): GoalReplayEvidence {
  const turns: NonNullable<GoalReplayEvidence['turns']> = []
  for (const { state, events } of result.frames.slice(0, goalReplayTurnLimit)) {
    const player = state.actors[0]
    const event = events.find(candidate => candidate.actorId === player?.id)
    if (!player || !event) continue
    const { x, y } = player
    const { action, itemId, blocked } = event
    turns.push({ turn: state.turn, action, x, y, ...(itemId === undefined ? {} : { item: itemId }), ...(blocked ? { blocked } : {}) })
  }
  return {
    turns,
    ...(result.frames.length > goalReplayTurnLimit ? { truncated: true } : {}),
    ...(!result.won ? goalReplayIssue(arenaFailureReview(result)) : undefined),
  }
}
