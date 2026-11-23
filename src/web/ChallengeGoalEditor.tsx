import { useEffect, useId, useRef, useState } from 'react'
import type { Locale } from '../shared/types'
import {
  buildChallengeGoal, challengeGoalMetrics, type ChallengeGoal, type ChallengeGoalMetricId,
} from './challengeGoals'
import type { ChallengeScore } from './challengeScore'
import { metricLabel } from './challengeScoreDisplay'
import { tr } from './text'
import './challenge-goal-editor.css'

type Props = {
  score: ChallengeScore
  goal?: ChallengeGoal
  locale: Locale
  onSave: (goal: ChallengeGoal) => void
  onClear: () => void
}

type FormProps = Pick<Props, 'score' | 'locale' | 'onSave'> & {
  initialMetric?: ChallengeGoalMetricId
  initialImprovement?: number
  metricOnly?: boolean
  baselineLabel?: string
  submitLabel?: string
  autoFocus?: boolean
  onCancel?: () => void
}

function goalDirection(preference: ChallengeGoal['preference'], locale: Locale) {
  return preference === 'higher' ? tr(locale, '或更多', 'or more') : tr(locale, '或更少', 'or fewer')
}

export function ChallengeGoalForm({ score, locale, onSave, initialMetric, initialImprovement = 1, metricOnly, baselineLabel, submitLabel, autoFocus, onCancel }: FormProps) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [selectedMetric, setSelectedMetric] = useState(initialMetric)
  const [improvement, setImprovement] = useState(String(initialImprovement))
  const metricSelect = useRef<HTMLSelectElement>(null)
  const improvementId = useId()
  useEffect(() => {
    if (autoFocus) metricSelect.current?.focus()
  }, [autoFocus])
  const metrics = challengeGoalMetrics(score).filter(item => !metricOnly || item.id === initialMetric)
  const metric = metrics.find(item => item.id === selectedMetric) ?? metrics[0]
  const amount = Number(improvement)
  const draft = metric && buildChallengeGoal(score, metric.id, amount)
  if (!metric) return null

  return <form className="score-goal-form" onSubmit={event => {
    event.preventDefault()
    if (draft) onSave(draft)
  }}>
      <label className="score-goal-metric">{t('目标指标', 'Goal metric')}
        <select ref={metricSelect} value={metric.id} onChange={event => {
          setSelectedMetric(event.currentTarget.value as ChallengeGoalMetricId)
          setImprovement('1')
        }}>
          {metrics.map(item => <option key={item.id} value={item.id}>{metricLabel(item.id, score, locale)}</option>)}
        </select>
      </label>
      <div className="score-goal-amount">
        <label htmlFor={improvementId}>{t('进步量', 'Improvement')}</label>
        <div className="score-goal-stepper">
          <button type="button" className="subtle-button" aria-label={t('减少进步量', 'Decrease improvement')}
            disabled={amount <= 1} onClick={() => setImprovement(String(Math.min(metric.improvementLimit, Math.ceil(amount) - 1)))}>
            −
          </button>
          <input id={improvementId} type="number" inputMode="numeric" required
            min={1} max={metric.improvementLimit} step={1} value={improvement}
            onChange={event => setImprovement(event.currentTarget.value)} />
          <button type="button" className="subtle-button" aria-label={t('增加进步量', 'Increase improvement')}
            disabled={amount >= metric.improvementLimit} onClick={() => setImprovement(String(Math.max(1, Math.floor(amount) + 1)))}>
            +
          </button>
        </div>
      </div>
      <div className="score-goal-preview" aria-live="polite">
        <span>{baselineLabel ?? t('上次通关', 'Last win')} <b>{metric.value}</b></span>
        {draft && <span>{t('新目标', 'New target')} <b>{draft.target}</b> {goalDirection(draft.preference, locale)}</span>}
      </div>
      <div className="score-goal-actions">
        <button type="submit" className="primary-button" disabled={!draft}>{submitLabel ?? t('保存目标', 'Save goal')}</button>
        {onCancel && <button type="button" className="subtle-button" onClick={onCancel}>{t('取消', 'Cancel')}</button>}
      </div>
  </form>
}

export function ChallengeGoalEditor({ score, goal, locale, onSave, onClear }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [editing, setEditing] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  const canEdit = challengeGoalMetrics(score).length > 0
  const achieved = goal?.achieved !== undefined

  function closeEditor() {
    setEditing(false)
    heading.current?.focus({ preventScroll: true })
  }

  return <section className="panel score-goal" aria-labelledby={titleId}>
    <div className="score-goal-heading">
      <h2 id={titleId} ref={heading} tabIndex={-1}>{t('下次小目标', 'Next challenge goal')}</h2>
      {goal && <strong className="score-goal-status" data-goal-status={achieved ? 'achieved' : 'pending'}>
        {achieved ? t('已达成', 'Achieved') : t('待达成', 'In progress')}
      </strong>}
    </div>
    {goal && <div className="score-goal-saved">
      <div className="score-goal-progress">
        <strong>{metricLabel(goal.metricId, score, locale)}</strong>
        <span>{t('设定时', 'Starting value')} <b data-goal-baseline>{goal.baseline}</b></span>
        <span>{t('目标', 'Target')} <b data-goal-target>{goal.target}</b> {goalDirection(goal.preference, locale)}</span>
      </div>
      {!editing && <div className="score-goal-actions">
        {canEdit && <button type="button" className="primary-button" onClick={() => setEditing(true)}>
          {t('定新目标', 'Set a new goal')}
        </button>}
        <button type="button" className="subtle-button" onClick={() => {
          onClear()
          closeEditor()
        }}>{t('清除目标', 'Clear goal')}</button>
      </div>}
    </div>}
    {canEdit && (!goal || editing) && <ChallengeGoalForm score={score} locale={locale} initialMetric={goal?.metricId}
      autoFocus={editing} onCancel={goal ? closeEditor : undefined}
      onSave={draft => {
        onSave(draft)
        closeEditor()
      }} />}
    {!canEdit && <p>{t('这项成绩已经达到可设置的最好数值。', 'This result is already at the best value you can set.')}</p>}
  </section>
}
