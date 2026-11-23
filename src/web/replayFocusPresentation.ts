import type { Locale } from '../shared/types'
import type { ReplayFocusEvaluation } from './challengeReplayFocus'
import type { ReplayFocusReference } from './challengeReplayFocusHistory'
import { tr } from './text'

const statusLabels = {
  improved: ['有改善', 'Improved'],
  same: ['和上次一样', 'Same result'],
  worse: ['这次还没改善', 'Needs another try'],
  unavailable: ['暂无法比较', 'Not enough evidence yet'],
} satisfies Record<ReplayFocusEvaluation['status'], [string, string]>

export function replayFocusStatusLabel(status: ReplayFocusEvaluation['status'], locale: Locale) {
  return tr(locale, ...statusLabels[status])
}

export function replayFocusReferenceLabel(reference: ReplayFocusReference, attempt: number, locale: Locale) {
  if (reference === 'history') return tr(locale, '上次改进记录', 'Previous recorded result')
  if (reference === 'replay') return tr(locale, `第 ${attempt} 次重玩`, `Replay ${attempt}`)
  return tr(locale, `记录 ${attempt}`, `Entry ${attempt}`)
}
