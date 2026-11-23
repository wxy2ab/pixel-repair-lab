import { useId, useRef, useState } from 'react'
import type { Locale } from '../shared/types'
import { ChallengeReplayReminder } from './ChallengeReplayReminder'
import { challengeTypeLabels } from './challengeModel'
import { replayFocusLabel, replayFocusValue } from './challengeReplayFocus'
import { retryReplayFocus, type ReplayFocusHistoryEntry } from './challengeReplayFocusHistory'
import { modeOf } from './challengeScoreDisplay'
import { replayFocusReferenceLabel, replayFocusStatusLabel } from './replayFocusPresentation'
import { tr } from './text'
import './challenge-replay-focus-history.css'

function historyMode(entry: ReplayFocusHistoryEntry, locale: Locale) {
  const { score } = entry
  const key = score.kind === 'arena' || score.kind === 'ai' ? score.mode : score.kind
  const label = modeOf(score, locale) ?? challengeTypeLabels[score.kind === 'machine' ? 'systems' : score.kind][locale]
  return { key, label }
}

function FocusHistoryCard({ entry, locale, timeFormat, reminding, onOpen, onBack, onRetry }: {
  entry: ReplayFocusHistoryEntry; locale: Locale; timeFormat: Intl.DateTimeFormat; reminding: boolean
  onOpen: () => void; onBack: () => void; onRetry: () => void
}) {
  const id = useId()
  const retryButton = useRef<HTMLButtonElement>(null)
  const { result: { plan, before, after, status }, reference } = entry
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const date = new Date(entry.at)

  function back() {
    onBack()
    retryButton.current?.focus({ preventScroll: true })
  }

  return <article className="panel focus-history-card" aria-labelledby={`${id}-title ${id}-plan`}
    data-focus-history-record={entry.id} data-focus-history-level={entry.levelId} data-focus-history-series={plan.seriesId}
    data-focus-history-status={status} data-focus-history-worth-retry={entry.worthRetry || undefined}>
    <div className="focus-history-card-heading">
      <h3 id={`${id}-title`}>{entry.title[locale]}</h3>
      <time dateTime={date.toISOString()}>{timeFormat.format(date)}</time>
    </div>
    <p id={`${id}-plan`}>{replayFocusLabel(plan, locale)}</p>
    <div className="focus-history-status">
      <strong>{replayFocusStatusLabel(status, locale)}</strong>
      {entry.worthRetry && <span>{t('值得再试', 'Worth another try')}</span>}
    </div>
    <dl>
      <div>
        <dt>{replayFocusReferenceLabel(reference, plan.attempt, locale)}</dt>
        <dd data-focus-history-before={before}>{replayFocusValue(plan, before, locale)}</dd>
      </div>
      <div>
        <dt>{t('这次重玩', 'This replay')}</dt>
        <dd data-focus-history-after={after}>
          {after === undefined ? t('暂无可比较的结果', 'No comparable result yet') : replayFocusValue(plan, after, locale)}
        </dd>
      </div>
    </dl>
    {entry.canReplay ? <>
      <button className="subtle-button focus-history-retry" type="button" ref={retryButton} aria-expanded={reminding}
        aria-controls={`${id}-reminder`} onClick={reminding ? back : onOpen}>
        {t('再试这个改进点', 'Try this again')}
      </button>
      <div id={`${id}-reminder`} hidden={!reminding}>
        {reminding && <ChallengeReplayReminder plan={retryReplayFocus(entry).plan} locale={locale} heading="h4"
          onReplay={onRetry} onBack={back} backLabel={t('返回记录', 'Back to history')} />}
      </div>
    </> : <p className="focus-history-unavailable">{t('当前关卡暂不可重玩。', 'This challenge is currently unavailable for replay.')}</p>}
  </article>
}

export function ReplayFocusHistoryPanel({ entries, locale, onRetry }: {
  entries: ReplayFocusHistoryEntry[]; locale: Locale; onRetry: (entry: ReplayFocusHistoryEntry) => void
}) {
  const id = useId()
  const [retryOnly, setRetryOnly] = useState(false)
  const [reminderId, setReminderId] = useState<string>()
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const timeFormat = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  const groups = new Map<string, { label: string; entries: ReplayFocusHistoryEntry[] }>()
  for (const entry of entries) {
    if (retryOnly && !entry.worthRetry) continue
    const { key, label } = historyMode(entry, locale)
    const group = groups.get(key)
    if (group) group.entries.push(entry)
    else groups.set(key, { label, entries: [entry] })
  }

  function selectFilter(only: boolean) {
    setRetryOnly(only)
    setReminderId(undefined)
  }

  if (!entries.length) return <div className="panel goal-list-empty">
    <h2>{t('还没有改进记录。', 'No improvement records yet.')}</h2>
    <p>{t('在复盘里选一个改进点，重玩结束后就能在这里回看。', 'Choose a focus in a replay review and finish a replay to see the result here.')}</p>
  </div>

  return <div className="focus-history">
    <div className="segmented focus-history-filters" role="group" aria-label={t('筛选改进记录', 'Filter improvement history')}>
      <button type="button" aria-pressed={!retryOnly} onClick={() => selectFilter(false)}>{t('全部记录', 'All records')}</button>
      <button type="button" aria-pressed={retryOnly} onClick={() => selectFilter(true)}>{t('值得再试', 'Worth another try')}</button>
    </div>
    {groups.size > 0 ? Array.from(groups, ([mode, group]) => <section className="focus-history-mode" key={mode}
      data-focus-history-mode={mode} aria-labelledby={`${id}-${mode}`}>
      <h2 id={`${id}-${mode}`}>{group.label}</h2>
      <ul className="goal-list-entries" role="list">
        {group.entries.map(entry => <li key={entry.id}>
          <FocusHistoryCard entry={entry} locale={locale} timeFormat={timeFormat} reminding={reminderId === entry.id}
            onOpen={() => setReminderId(entry.id)} onBack={() => setReminderId(undefined)} onRetry={() => onRetry(entry)} />
        </li>)}
      </ul>
    </section>) : <p className="panel goal-list-empty" role="status">
      {t('现在没有标为「值得再试」的改进点。', 'No improvement points are marked as worth another try right now.')}
    </p>}
  </div>
}
