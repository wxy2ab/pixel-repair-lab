import { useId, useRef, useState } from 'react'
import type { Locale } from '../shared/types'
import type { ChallengeGoalMetricId, PendingChallengeGoal } from './challengeGoals'
import { compareGoalReplay } from './challengeGoalReview'
import { ChallengeGoalReplayReview } from './ChallengeGoalReplayReview'
import type { ReplayFocusPlan } from './challengeReplayFocus'
import { goalDifference } from './challengeScoreDisplay'
import { tr } from './text'

const nextTryIdea = {
  turns: ['先找一段走过两次的路，看看能不能少走一步。', 'Look for a path you walked twice and try saving a step.'],
  score: ['下次先盯住一个容易拿到的补给。', 'Pick one supply you can reach early on your next run.'],
  checks: ['先手算一组输入，再检查答案。', 'Work through one input by hand before checking your answer.'],
  instructions: ['看看哪两条指令在做同一件事。', 'Look for two instructions that do the same job.'],
  rounds: ['把数量和限制一次写清楚，再发出提示词。', 'Put the quantities and constraints in your prompt before you send it.'],
} satisfies Record<ChallengeGoalMetricId, [string, string]>

export function ChallengeGoalProgress({ entry, locale, onReplay }: {
  entry: PendingChallengeGoal; locale: Locale; onReplay: (plan?: ReplayFocusPlan) => void
}) {
  const { replays, closestAttempt, stalled, startsMidGoal } = entry.progress
  const { metricId, attempts } = entry.goal
  const heading = useId()
  const reviewId = useId()
  const [selected, setSelected] = useState<number>()
  const selectedButton = useRef<HTMLButtonElement>(null)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const attemptLabel = (attempt: number) => attempts === undefined
    ? t(`记录 ${attempt}`, `Entry ${attempt}`) : t(`第 ${attempt} 次`, `Replay ${attempt}`)
  const maxGap = replays.reduce((max, replay) => Math.max(max, replay.remaining ?? 0), 1)
  const closest = replays.find(replay => replay.attempt === closestAttempt)
  const latest = replays.at(-1)
  const recentReplays = replays.slice(-3)
  const recentAllFailed = recentReplays.length === 3 && recentReplays.every(replay => replay.remaining === null)
  const comparison = selected === undefined ? undefined : compareGoalReplay(entry, selected)

  function closeReview() {
    setSelected(undefined)
    selectedButton.current?.focus()
  }

  return <section className="goal-replay-progress" aria-labelledby={heading}>
    <div className="goal-replay-heading">
      <h3 id={heading}>{t('重玩进度', 'Replay progress')}</h3>
      {replays.length > 0 && <span>{t('离当前目标的差距', 'Gap to current target')}</span>}
    </div>
    {replays.length > 0 && <>
      <p className="goal-replay-open-hint">{t('点一次重玩查看对比。', 'Choose a replay to compare it.')}</p>
      <div className="goal-replay-scroll" role="group" tabIndex={0} aria-label={t('按重玩次序查看差距', 'Gaps in replay order')}>
        <ol className="goal-replay-bars" role="list">
          {replays.map(({ attempt, remaining }) => {
            const failed = remaining === null
            const best = attempt === closestAttempt
            const opened = attempt === selected && comparison !== undefined
            const gapLabel = failed ? t('未通关', 'Not cleared') : goalDifference(metricId, remaining, locale)
            const reviewLabel = attempts === undefined ? t(`复盘记录 ${attempt}`, `Review entry ${attempt}`)
              : t(`复盘第 ${attempt} 次重玩`, `Review replay ${attempt}`)
            return <li key={attempt} data-goal-attempt={attempt} data-goal-remaining={remaining ?? undefined}
              data-goal-failed={failed || undefined} data-goal-closest={best || undefined}>
              <button className="goal-replay-select" type="button" aria-expanded={opened} aria-controls={opened ? reviewId : undefined}
                aria-label={`${reviewLabel} · ${gapLabel}${best ? t(' · 最接近目标', ' · Closest to target') : ''}`}
                onClick={event => {
                  if (opened) {
                    closeReview()
                    return
                  }
                  selectedButton.current = event.currentTarget
                  setSelected(attempt)
                }}>
                <span className="goal-replay-bar-track" aria-hidden="true">
                  {failed ? <span className="goal-replay-miss">×</span> : <span className="goal-replay-bar"
                    style={{ height: `${remaining / maxGap * 100}%` }} />}
                </span>
                <strong>{gapLabel}</strong>
                <span>{attemptLabel(attempt)}</span>
              </button>
            </li>
          })}
        </ol>
      </div>
    </>}
    {closest && closest.remaining !== null && <p className="goal-replay-closest">
      <strong>{t(`${attemptLabel(closest.attempt)}最接近目标`, `${attemptLabel(closest.attempt)} was closest`)} </strong>
      {t(`· 差距 ${goalDifference(metricId, closest.remaining, locale)}`, `· ${goalDifference(metricId, closest.remaining, locale)} short`)}
    </p>}
    {entry.remaining === undefined && replays.every(replay => replay.remaining === null) && <p>
      {t('重玩通关后会显示差距', 'Finish another run to see the gap')}
    </p>}
    {startsMidGoal && <p>{t('较早的重玩缺少逐次记录。', 'Earlier replays lack individual records.')}</p>}
    {stalled && !comparison && <p className="goal-replay-tip" data-goal-progress-tip>
      <strong>{recentAllFailed ? t('最近 3 次还没通关。', 'Your last three replays did not clear the challenge.')
        : t('连续 3 次重玩还没刷新最小差距。', 'Your last three replays did not beat your closest result.')}</strong>{' '}
      {latest?.remaining === null ? t('下次先从失败复盘里挑一处来改。', 'Start with one step to fix in the failure review.')
        : t(...nextTryIdea[metricId])}
    </p>}
    {comparison && <ChallengeGoalReplayReview id={reviewId} comparison={comparison} entry={entry} locale={locale}
      attemptLabel={attemptLabel} onClose={closeReview} onReplay={onReplay} />}
  </section>
}
