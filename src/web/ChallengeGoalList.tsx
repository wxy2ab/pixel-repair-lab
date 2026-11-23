import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { Locale } from '../shared/types'
import { challengeGoalMetrics, scoreAtGoalBaseline, type ChallengeGoal, type CompletedChallengeGoal, type PendingChallengeGoal } from './challengeGoals'
import type { ChallengeGoalRecommendation } from './challengeGoalRecommendations'
import { challengeTypeLabels } from './challengeModel'
import { goalDifference, metricLabel, modeOf } from './challengeScoreDisplay'
import { ChallengeGoalForm } from './ChallengeGoalEditor'
import { ChallengeGoalProgress } from './ChallengeGoalProgress'
import { ReplayFocusHistoryPanel } from './ReplayFocusHistoryPanel'
import type { ReplayFocusPlan } from './challengeReplayFocus'
import type { ReplayFocusHistoryEntry } from './challengeReplayFocusHistory'
import { tr } from './text'
import './challenge-goal-list.css'

export type ChallengeGoalTab = 'pending' | 'achieved' | 'focus-history' | 'recommended'

type Props = {
  entries: PendingChallengeGoal[]
  completed: CompletedChallengeGoal[]
  recommendations: ChallengeGoalRecommendation[]
  focusHistory: ReplayFocusHistoryEntry[]
  tab: ChallengeGoalTab
  locale: Locale
  onTab: (tab: ChallengeGoalTab) => void
  onSaveGoal: (entry: CompletedChallengeGoal, goal: ChallengeGoal) => void
  onUseRecommendation: (entry: ChallengeGoalRecommendation, goal: ChallengeGoal) => boolean
  onAdjustGoal: (entry: PendingChallengeGoal, goal: ChallengeGoal) => boolean
  onRetryFocus: (entry: ReplayFocusHistoryEntry) => void
  onReplay: (entry: PendingChallengeGoal, plan?: ReplayFocusPlan) => void
  onBrowse: () => void
  onRecords: () => void
}

function goalMode(score: PendingChallengeGoal['score'], locale: Locale) {
  return modeOf(score, locale) ?? challengeTypeLabels[score.kind === 'machine' ? 'systems' : score.kind][locale]
}

function ChallengeGoalCard({ entry, locale, onReplay, onAdjust }: {
  entry: PendingChallengeGoal; locale: Locale; onReplay: (plan?: ReplayFocusPlan) => void; onAdjust: (goal: ChallengeGoal) => boolean
}) {
  const { level, seriesId, score, goal, remaining } = entry
  const [editing, setEditing] = useState(false)
  const [status, setStatus] = useState<'saved' | 'stale'>()
  const adjustButton = useRef<HTMLButtonElement>(null)
  const titleId = `goal-${level.id}-${seriesId}`
  const modeId = `${titleId}-mode`
  const editorId = `${titleId}-editor`
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const difference = remaining === undefined ? undefined : goalDifference(goal.metricId, remaining, locale)
  const latestFailed = entry.progress.replays.at(-1)?.remaining === null

  function closeEditor() {
    setEditing(false)
    adjustButton.current?.focus({ preventScroll: true })
  }

  return <article className="panel goal-list-card goal-list-active" data-goal-level={level.id} data-goal-series={seriesId}
    aria-labelledby={`${titleId} ${modeId}`}>
    <div className="goal-list-card-heading">
      <h2 id={titleId}>{level.title[locale]}</h2>
      <span id={modeId}>{goalMode(score, locale)}</span>
    </div>
    <dl>
      <div>
        <dt>{t('目标', 'Target')} · {metricLabel(goal.metricId, score, locale)}</dt>
        <dd data-goal-target>{goal.preference === 'lower' ? '≤' : '≥'} {goal.target}</dd>
      </div>
    </dl>
    <ChallengeGoalProgress entry={entry} locale={locale} onReplay={onReplay} />
    <div className="goal-list-card-action">
      {difference !== undefined && (remaining === 0
          ? <p>{t('上次通关成绩已达到新目标，再通关一次来确认。', 'Your last win met the new target. Clear it again to confirm.')}</p>
          : <p className="goal-list-gap">{latestFailed
            ? t(`上次通关还差 ${difference}`, `${difference} short on your last win`)
            : t(`上次还差 ${difference}`, `${difference} short last time`)}</p>)}
      <div className="goal-list-actions">
        <button type="button" className="primary-button" onClick={() => onReplay()} aria-describedby={`${titleId} ${modeId}`}>
          {t('重玩这关', 'Replay challenge')}
        </button>
        <button ref={adjustButton} type="button" className="subtle-button" aria-expanded={editing} aria-controls={editorId}
          aria-describedby={`${titleId} ${modeId}`} onClick={() => { setStatus(undefined); setEditing(!editing) }}>
          {t('调整目标', 'Adjust goal')}
        </button>
      </div>
    </div>
    <div id={editorId} hidden={!editing} className="goal-list-next-editor">
      {editing && <ChallengeGoalForm score={scoreAtGoalBaseline(score, goal)} locale={locale} initialMetric={goal.metricId}
        initialImprovement={Math.abs(goal.target - goal.baseline)} metricOnly autoFocus
        baselineLabel={t('设定时', 'Starting value')} onCancel={closeEditor} onSave={draft => {
          const saved = onAdjust(draft)
          setStatus(saved ? 'saved' : 'stale')
          closeEditor()
        }} />}
    </div>
    <p className="goal-list-refresh-status" role="status">{status === 'saved'
      ? t('目标已保存，图上差距已按当前目标计算。', 'Goal saved. The chart reflects your current target.')
      : status === 'stale' ? t('目标已更新，请重新调整。', 'Your goal changed. Open the editor to adjust it.') : ''}</p>
  </article>
}

function AchievedGoalCard({ entry, locale, editing, replacing, onEdit, onCancel, onSave }: {
  entry: CompletedChallengeGoal
  locale: Locale
  editing: boolean
  replacing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (goal: ChallengeGoal) => void
}) {
  const { id, level, seriesId, score, goal, actual, attempts, canSetNext, metricOnly } = entry
  const titleId = useId()
  const modeId = `${titleId}-mode`
  const editorId = `${titleId}-editor`
  const editButton = useRef<HTMLButtonElement>(null)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const higher = goal.preference === 'higher'
  const improvement = higher ? actual - goal.baseline : goal.baseline - actual
  const difference = goalDifference(goal.metricId, improvement, locale)
  const canEdit = canSetNext && challengeGoalMetrics(score).some(metric => !metricOnly || metric.id === goal.metricId)

  return <article className="panel goal-list-card goal-list-achieved" data-goal-status="achieved" data-goal-id={id}
    data-goal-level={level.id} data-goal-series={seriesId} aria-labelledby={`${titleId} ${modeId}`}>
    <div className="goal-list-card-heading">
      <h2 id={titleId}>{level.title[locale]}</h2>
      <span id={modeId}>{goalMode(score, locale)}</span>
    </div>
    <dl className="goal-list-achieved-stats">
      <div><dt>{t('设定时', 'Starting value')} · {metricLabel(goal.metricId, score, locale)}</dt>
        <dd data-goal-baseline={goal.baseline}>{goal.baseline}</dd></div>
      <div><dt>{t('原目标', 'Original target')}</dt>
        <dd data-goal-target={goal.target}>{higher ? '≥' : '≤'} {goal.target}</dd></div>
      <div><dt>{t('达成成绩', 'Result when achieved')}</dt><dd data-goal-actual={actual}>{actual}</dd></div>
      <div><dt>{t('重玩次数', 'Replays')}</dt><dd data-goal-attempts={attempts}>
        {attempts === undefined ? t('未记录', 'Unrecorded') : t(`${attempts} 次`, String(attempts))}
      </dd></div>
      <div className="goal-list-improvement"><dt>{t('进步', 'Improvement')}</dt><dd data-goal-improvement={improvement}>
        {higher ? t(`多了 ${difference}`, `${difference} more`) : t(`少了 ${difference}`, `${difference} fewer`)}
      </dd></div>
    </dl>
    {canEdit && <div className="goal-list-achieved-action">
      <button ref={editButton} type="button" className="primary-button" aria-expanded={editing} aria-controls={editorId}
        aria-describedby={`${titleId} ${modeId}`} onClick={editing ? onCancel : onEdit}>
        {t('以这次成绩定目标', 'Set a goal from this result')}
      </button>
      <div id={editorId} hidden={!editing} className="goal-list-next-editor">
        {editing && <>
          {replacing && <p>{t('这关同玩法已有一个小目标。保存后会替换它。', 'Saving will replace your current goal for this challenge and mode.')}</p>}
          <ChallengeGoalForm score={score} locale={locale} initialMetric={goal.metricId} metricOnly={metricOnly}
            baselineLabel={t('本次成绩', 'Result from this run')}
            submitLabel={replacing ? t('替换小目标', 'Replace goal') : undefined} autoFocus onSave={onSave} onCancel={() => {
              onCancel()
              editButton.current?.focus()
            }} />
        </>}
      </div>
    </div>}
  </article>
}

function AchievedGoals({ completed, entries, locale, onSaveGoal }: Pick<Props, 'completed' | 'entries' | 'locale' | 'onSaveGoal'>) {
  const [editing, setEditing] = useState<string>()
  const pending = new Set(entries.map(({ level, seriesId }) => `${level.id}/${seriesId}`))

  if (!completed.length) return <div className="panel goal-list-empty">
    <h2>{tr(locale, '还没有已达成的小目标。', 'No goals achieved yet.')}</h2>
    <p>{tr(locale, '目标达成后，可以在这里回看进步。', 'When you achieve a goal, you can see your progress here.')}</p>
  </div>

  return <ul className="goal-list-entries" role="list">
    {completed.map(entry => <li key={entry.id}>
      <AchievedGoalCard entry={entry} locale={locale} editing={editing === entry.id}
        replacing={pending.has(`${entry.level.id}/${entry.seriesId}`)}
        onEdit={() => setEditing(entry.id)} onCancel={() => setEditing(undefined)} onSave={goal => onSaveGoal(entry, goal)} />
    </li>)}
  </ul>
}

function RecommendedGoalCard({ entry, locale, onSave }: {
  entry: ChallengeGoalRecommendation
  locale: Locale
  onSave: (goal: ChallengeGoal) => void
}) {
  const { level, seriesId, score, goal, recent, alreadyReached } = entry
  const [editing, setEditing] = useState(false)
  const titleId = useId()
  const modeId = `${titleId}-mode`
  const editorId = `${titleId}-editor`
  const customizeButton = useRef<HTMLButtonElement>(null)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const higher = goal.preference === 'higher'
  const improvement = Math.abs(goal.target - goal.baseline)
  const difference = goalDifference(goal.metricId, improvement, locale)
  const changeZh = higher ? `多拿 ${difference}` : goal.metricId === 'checks' ? `少检查 ${improvement} 次`
    : goal.metricId === 'instructions' ? `少执行 ${difference}` : `少用 ${difference}`
  const changeEn = higher ? `${difference} more` : `${difference} fewer`
  const reason = alreadyReached
    ? t(`你最近已经做到过，下次试试比上次${changeZh}。`, `You reached this target recently. Aim for ${changeEn} than your last win.`)
    : t(`最近有两次成绩很接近，下次试试比上次${changeZh}。`, `Two of your recent results are close. Aim for ${changeEn} than your last win.`)

  return <article className="panel goal-list-card goal-list-recommended" data-goal-status="recommended"
    data-goal-level={level.id} data-goal-series={seriesId} aria-labelledby={`${titleId} ${modeId}`}>
    <div className="goal-list-card-heading">
      <h2 id={titleId}>{level.title[locale]}</h2>
      <span id={modeId}>{goalMode(score, locale)}</span>
    </div>
    <dl className="goal-list-recommendation-stats">
      <div>
        <dt>{t('推荐目标', 'Suggested target')} · {metricLabel(goal.metricId, score, locale)}</dt>
        <dd data-goal-target>{higher ? '≥' : '≤'} {goal.target}</dd>
      </div>
      <div>
        <dt>{t(`最近 ${recent.length} 次通关`, `Last ${recent.length} wins`)}</dt>
        <dd data-goal-recent>{recent.join(' · ')}</dd>
      </div>
    </dl>
    <p data-goal-reason>{reason}</p>
    <div>
      <div className="goal-list-actions">
        <button type="button" className="primary-button" aria-describedby={`${titleId} ${modeId}`} onClick={() => onSave(goal)}>
          {t('采用目标', 'Use goal')}
        </button>
        <button ref={customizeButton} type="button" className="subtle-button" aria-expanded={editing} aria-controls={editorId}
          onClick={() => setEditing(!editing)}>{t('自己调整', 'Customize')}</button>
      </div>
      <div id={editorId} hidden={!editing} className="goal-list-next-editor">
        {editing && <ChallengeGoalForm score={score} locale={locale} initialMetric={goal.metricId}
          initialImprovement={improvement} autoFocus onSave={onSave} onCancel={() => {
            setEditing(false)
            customizeButton.current?.focus()
          }} />}
      </div>
    </div>
  </article>
}

function RecommendedGoals({ recommendations, locale, onUseRecommendation }: Pick<Props, 'recommendations' | 'locale' | 'onUseRecommendation'>) {
  const [refreshed, setRefreshed] = useState(false)
  const t = (zh: string, en: string) => tr(locale, zh, en)

  return <>
    <p className="goal-list-refresh-status" role="status">{refreshed && t('成绩或目标有更新，请查看现在的推荐。',
      'Your results or goals changed. Review the current suggestions.')}</p>
    {recommendations.length > 0 ? <ul className="goal-list-entries" role="list">
      {recommendations.map(entry => <li key={`${entry.level.id}/${entry.seriesId}/${entry.goal.metricId}/${entry.goal.baseline}`}>
        <RecommendedGoalCard entry={entry} locale={locale} onSave={goal => {
          if (!onUseRecommendation(entry, goal)) setRefreshed(true)
        }} />
      </li>)}
    </ul> : <div className="panel goal-list-empty">
      <h2>{t('现在没有新的目标推荐。', 'No new goal suggestions right now.')}</h2>
      <p>{t('同一关、同一玩法至少通关两次后，可以根据成绩推荐目标。',
        'Goal suggestions use at least two wins on the same challenge in the same mode.')}</p>
    </div>}
  </>
}

export function ChallengeGoalList({ entries, completed, recommendations, focusHistory, tab, locale, onTab, onSaveGoal, onUseRecommendation, onAdjustGoal,
  onRetryFocus, onReplay, onBrowse, onRecords }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  const pendingTab = useRef<HTMLButtonElement>(null)
  const recommendedTab = useRef<HTMLButtonElement>(null)
  const id = useId()
  const tabs: [ChallengeGoalTab, string][] = [
    ['pending', tr(locale, '进行中', 'In progress')], ['achieved', tr(locale, '已达成', 'Achieved')],
    ['focus-history', tr(locale, '改进记录', 'Improvement history')],
    ['recommended', tr(locale, '目标推荐', 'Suggested goals')],
  ]
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  function switchTab(event: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex(([key]) => key === tab)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length
        : event.key === 'ArrowRight' ? (current + 1) % tabs.length : undefined
    if (nextIndex === undefined) return
    event.preventDefault()
    const [next] = tabs[nextIndex]
    onTab(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-goal-tab="${next}"]`)?.focus()
  }

  const seeRecommendations = recommendations.length > 0 && <button type="button" className="subtle-button" onClick={() => {
    onTab('recommended')
    recommendedTab.current?.focus()
  }}>{tr(locale, '查看目标推荐', 'See suggested goals')}</button>

  return <section className="challenge-goal-list" aria-labelledby="challenge-goal-list-title">
    <div className="goal-list-heading">
      <h1 id="challenge-goal-list-title" ref={heading} tabIndex={-1}>{tr(locale, '我的小目标', 'My challenge goals')}</h1>
      <div className="goal-list-actions">
        <button className="subtle-button" type="button" onClick={onBrowse}>{tr(locale, '自由选关', 'Browse challenges')}</button>
        <button className="subtle-button" type="button" onClick={onRecords}>{tr(locale, '成绩记录', 'Challenge records')}</button>
      </div>
    </div>
    <div className="segmented goal-list-tabs" role="tablist" aria-label={tr(locale, '小目标状态', 'Goal status')} onKeyDown={switchTab}>
      {tabs.map(([key, label]) => <button type="button" role="tab" key={key}
        ref={key === 'pending' ? pendingTab : key === 'recommended' ? recommendedTab : undefined}
        data-goal-tab={key} id={`${id}-${key}`} aria-selected={tab === key} aria-controls={`${id}-panel`}
        tabIndex={tab === key ? 0 : -1} onClick={() => onTab(key)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
      {tab === 'achieved' && <AchievedGoals completed={completed} entries={entries} locale={locale} onSaveGoal={(entry, goal) => {
        pendingTab.current?.focus()
        onSaveGoal(entry, goal)
      }} />}
      {tab === 'focus-history' && <ReplayFocusHistoryPanel entries={focusHistory} locale={locale} onRetry={onRetryFocus} />}
      {tab === 'recommended' && <RecommendedGoals recommendations={recommendations} locale={locale} onUseRecommendation={(entry, goal) => {
        const saved = onUseRecommendation(entry, goal)
        const nextTab = saved ? pendingTab : recommendedTab
        nextTab.current?.focus({ preventScroll: true })
        return saved
      }} />}
      {tab === 'pending' && (entries.length > 0 ? <div className="goal-list-pending-content">
        {seeRecommendations}
        <ul className="goal-list-entries" role="list">
          {entries.map(entry => <li key={entry.level.id + '/' + entry.seriesId}>
            <ChallengeGoalCard entry={entry} locale={locale} onReplay={plan => onReplay(entry, plan)}
              onAdjust={goal => onAdjustGoal(entry, goal)} />
          </li>)}
        </ul>
      </div> : <div className="panel goal-list-empty">
        <h2>{tr(locale, '现在没有待达成的小目标。', 'You have no goals in progress.')}</h2>
        {seeRecommendations || <p>{tr(locale, '可以在成绩记录里为通关过的挑战设个新目标。', 'Set a new goal in your records for a challenge you have completed.')}</p>}
      </div>)}
    </div>
  </section>
}
