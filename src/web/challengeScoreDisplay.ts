import type { Locale } from '../shared/types'
import type { ChallengeGoalMetricId } from './challengeGoals'
import type { ChallengeScore, ChallengeScoreMetric } from './challengeScore'
import { tr } from './text'

export function metricLabel(id: ChallengeScoreMetric['id'], score: ChallengeScore, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const multipleScenes = (score.kind === 'grid' || score.kind === 'arena') && score.total > 1
  const labels: Record<ChallengeScoreMetric['id'], string> = {
    turns: multipleScenes ? t('主场景回合', 'Main map turns') : t('回合', 'Turns'),
    score: score.kind === 'arena' && score.goal !== 'score' ? t('收集物品', 'Items collected')
      : multipleScenes ? t('主场景得分', 'Main map points') : t('得分', 'Points'),
    cases: score.kind === 'data' ? t('通过步骤', 'Steps passed')
      : score.kind === 'arena' || score.kind === 'grid' ? t('通过场景', 'Maps passed')
        : t('通过用例', 'Cases passed'),
    checks: t('检查次数', 'Checks'),
    instructions: t('单场最多执行指令', 'Max instructions per case'),
    rounds: t('协作轮次', 'Rounds'),
  }
  return labels[id]
}

export function valueOf(metric?: ChallengeScoreMetric) {
  return metric === undefined ? '—' : metric.total === undefined ? String(metric.value) : `${metric.value} / ${metric.total}`
}

export function modeOf(score: ChallengeScore, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  if (score.kind === 'arena') return score.mode === 'timed' ? t('紧张', 'Timed') : t('从容', 'Relaxed')
  if (score.kind === 'ai') {
    if (score.mode === 'mixed') return t('模拟与在线', 'Simulator and online')
    return score.mode === 'online' ? t('在线 AI', 'Online AI') : t('内置模拟', 'Simulator')
  }
}

export function goalDifference(metricId: ChallengeGoalMetricId, remaining: number, locale: Locale) {
  const [zh, en] = {
    turns: ['回合', 'turn'],
    score: ['分', 'point'],
    checks: ['次检查', 'check'],
    instructions: ['条指令', 'instruction'],
    rounds: ['轮', 'round'],
  }[metricId]
  return tr(locale, `${remaining} ${zh}`, `${remaining} ${en}${remaining === 1 ? '' : 's'}`)
}
