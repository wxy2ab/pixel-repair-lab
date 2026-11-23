import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { challengeDifficultyLabels, challengeTypeLabels, type ChallengeEntry } from './challengeModel'
import { scoreMetrics, type ChallengeScore, type ChallengeScoreComparison } from './challengeScore'
import { goalDifference, metricLabel, modeOf, valueOf } from './challengeScoreDisplay'
import type { ChallengeGoalEvaluation } from './challengeGoals'
import { tr } from './text'
import './challenge-completion.css'

function GoalResult({ result, score, locale }: { result: ChallengeGoalEvaluation; score: ChallengeScore; locale: Locale }) {
  const { goal, actual, remaining, achieved } = result
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const label = metricLabel(goal.metricId, score, locale)
  const difference = goalDifference(goal.metricId, remaining, locale)
  const lower = goal.preference === 'lower'

  return <section className="challenge-goal-result" aria-labelledby="challenge-goal-title"
    data-testid="challenge-goal-result" data-achieved={achieved} data-remaining={remaining}>
    <div className="challenge-goal-heading">
      <h3 id="challenge-goal-title">{t('下次小目标', 'Next challenge goal')}</h3>
      <strong>{achieved ? t('目标已达成', 'Goal reached') : t('目标未达成', 'Goal still open')}</strong>
    </div>
    <dl>
      <div><dt>{t('目标', 'Target')} · {label}</dt><dd>{lower ? '≤' : '≥'} {goal.target}</dd></div>
      <div><dt>{t('本次', 'This run')} · {label}</dt><dd>{actual}</dd></div>
    </dl>
    {!achieved && <p>{t(`还差 ${difference}。`, `${difference} remaining.`)}</p>}
  </section>
}

export function ChallengeCompletion({ comparison, goalResult, replayFocusResult, locale, next, onReplay, onBrowse, onRoutes, onNext, onRecords }: {
  comparison: ChallengeScoreComparison; locale: Locale; next?: ChallengeEntry
  goalResult?: ChallengeGoalEvaluation
  replayFocusResult?: ReactNode
  onReplay: () => void; onBrowse: () => void; onRoutes?: () => void; onNext: (id: string) => void; onRecords: () => void
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const heading = useRef<HTMLElement>(null)
  const { current, previous, best, newBest } = comparison
  const metrics = scoreMetrics(current)
  const older = previous ? scoreMetrics(previous) : []
  const record = best ? scoreMetrics(best) : []
  const mode = modeOf(current, locale)
  const changes = metrics.flatMap(metric => {
    const prior = older.find(previousMetric => previousMetric.id === metric.id)
    if (!prior || prior.value === metric.value) return []
    const change = metric.value - prior.value
    const improvement = metric.preference === 'higher' ? change > 0 : change < 0
    const label = metricLabel(metric.id, current, locale)
    const amount = Math.abs(change)
    return [{
      id: metric.id, improvement,
      text: change > 0 ? t(`${label}比上次多 ${amount}`, `${label} up by ${amount}`)
        : t(`${label}比上次少 ${amount}`, `${label} down by ${amount}`),
    }]
  })
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'start' })
  }, [comparison])
  const remaining = next?.preparation.missingLessons.length ?? 0

  return <section className="panel challenge-completion" aria-labelledby="challenge-completion-title" tabIndex={-1} ref={heading}>
    <div className="challenge-completion-heading">
      <h2 id="challenge-completion-title">{t('通关总结', 'Challenge summary')}</h2>
      {mode && <span>{mode}</span>}
      {newBest && <strong className="challenge-new-best">{t('新纪录', 'New personal best')}</strong>}
    </div>
    <table className="challenge-score-table">
      <thead><tr>
        <th scope="col">{t('成绩', 'Result')}</th><th scope="col">{t('本次', 'This run')}</th>
        <th scope="col">{t('上次通关', 'Last win')}</th><th scope="col">{t('最好成绩', 'Best')}</th>
      </tr></thead>
      <tbody>{metrics.map(metric => <tr key={metric.id} data-score-metric={metric.id}>
        <th scope="row">{metricLabel(metric.id, current, locale)}</th>
        <td>{valueOf(metric)}</td>
        <td>{valueOf(older.find(value => value.id === metric.id))}</td>
        <td>{valueOf(record.find(value => value.id === metric.id))}</td>
      </tr>)}</tbody>
    </table>
    {changes.length > 0 ? <ul className="challenge-score-changes">
      {changes.map(change => <li key={change.id} data-improvement={change.improvement}>{change.text}</li>)}
    </ul> : <p className="challenge-score-note">{previous ? t('和上次通关成绩一样。', 'Same result as your last win.')
      : t('已记录这组挑战成绩，下次通关就能比较。', 'Score recorded. Compare it the next time you win.')}</p>}
    {goalResult && <GoalResult result={goalResult} score={current} locale={locale} />}
    {replayFocusResult}
    {next && <div className="challenge-completion-next">
      <div>
        <h3>{t('下一关推荐', 'Suggested next challenge')}</h3>
        <p><strong>{next.level.title[locale]}</strong> <span>{challengeTypeLabels[next.type][locale]} · {challengeDifficultyLabels[next.difficulty][locale]}</span></p>
        {remaining > 0 && <small>{t(`前序课程还差 ${remaining} 节`, `${remaining} prerequisite ${remaining === 1 ? 'lesson' : 'lessons'} left`)}</small>}
      </div>
      <button type="button" className="primary-button" data-next-challenge={next.level.id} onClick={() => onNext(next.level.id)}>
        {t('挑战下一关', 'Play next challenge')}
      </button>
    </div>}
    <div className="challenge-completion-actions">
      <button type="button" className="subtle-button" onClick={onReplay}>{t('再玩一次', 'Play again')}</button>
      {onRoutes && <button type="button" className="subtle-button" onClick={onRoutes}>{t('返回闯关路线', 'Back to challenge routes')}</button>}
      <button type="button" className="subtle-button" onClick={onBrowse}>{t('自由选关', 'Browse challenges')}</button>
      <button type="button" className="subtle-button" onClick={onRecords}>{t('成绩记录', 'Challenge records')}</button>
    </div>
  </section>
}
