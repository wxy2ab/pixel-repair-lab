import { useEffect, useId, useRef } from 'react'
import type { Locale } from '../shared/types'
import { replayFocusLabel, type ReplayFocusPlan } from './challengeReplayFocus'
import { tr } from './text'
import './challenge-replay-reminder.css'

export function ChallengeReplayReminder({ plan, locale, onReplay, onBack, backLabel, heading: Heading = 'h5' }: {
  plan: ReplayFocusPlan; locale: Locale; onReplay: () => void; onBack: () => void; backLabel: string; heading?: 'h4' | 'h5'
}) {
  const id = useId()
  const reminder = useRef<HTMLElement>(null)

  useEffect(() => {
    reminder.current?.focus({ preventScroll: true })
    reminder.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return <section className="goal-replay-reminder" data-goal-replay-reminder
    aria-labelledby={`${id}-reminder`} aria-describedby={`${id}-plan`} tabIndex={-1} ref={reminder} onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onBack()
      }
    }}>
    <Heading id={`${id}-reminder`}>{tr(locale, '重玩前提醒', 'Replay reminder')}</Heading>
    <p id={`${id}-plan`}>{replayFocusLabel(plan, locale)}</p>
    <div className="goal-replay-reminder-actions">
      <button type="button" className="primary-button" onClick={onReplay}>{tr(locale, '开始重玩', 'Start replay')}</button>
      <button type="button" className="subtle-button" onClick={onReplay}>
        {tr(locale, '跳过提醒，直接重玩', 'Skip reminder and replay')}
      </button>
      <button type="button" className="subtle-button" onClick={onBack}>{backLabel}</button>
    </div>
  </section>
}
