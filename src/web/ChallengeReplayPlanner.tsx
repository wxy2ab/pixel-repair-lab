import { useEffect, useId, useRef, useState } from 'react'
import type { Locale } from '../shared/types'
import { ChallengeReplayReminder } from './ChallengeReplayReminder'
import { replayFocusLabel, type ReplayFocusPlan } from './challengeReplayFocus'
import { tr } from './text'

export function ChallengeReplayPlanner({ options, locale, onReplay }: {
  options: ReplayFocusPlan[]
  locale: Locale
  onReplay: (plan?: ReplayFocusPlan) => void
}) {
  const id = useId()
  const replay = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const [selectedKey, setSelectedKey] = useState<string>()
  const [reminderKey, setReminderKey] = useState<string>()
  const plan = options.find(option => option.key === selectedKey)
  const reminding = plan !== undefined && reminderKey === plan.key
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const skipLabel = t('跳过提醒，直接重玩', 'Skip reminder and replay')

  useEffect(() => {
    if (!reminding && returnFocus.current) {
      returnFocus.current = false
      replay.current?.focus()
    }
  }, [reminding])

  function back() {
    returnFocus.current = true
    setReminderKey(undefined)
  }

  function choose(key?: string) {
    setSelectedKey(key)
    setReminderKey(undefined)
  }

  if (reminding) return <ChallengeReplayReminder plan={plan} locale={locale} onReplay={() => onReplay(plan)}
    onBack={back} backLabel={t('返回选择', 'Back to choices')} />

  return <>
    {options.length > 0 && <fieldset className="goal-replay-plans">
      <legend>{t('下次想改进什么', 'What to improve next')}</legend>
      {options.map(option => <label className="goal-replay-plan-option" key={option.key}>
        <input type="radio" name={id} checked={plan?.key === option.key} onChange={() => choose(option.key)} />
        <span>{replayFocusLabel(option, locale)}</span>
      </label>)}
      <label className="goal-replay-plan-option">
        <input type="radio" name={id} checked={!plan} onChange={() => choose()} />
        <span>{t('这次先不选', 'Nothing this time')}</span>
      </label>
    </fieldset>}
    <div className="goal-replay-review-actions">
      <button type="button" className="primary-button" ref={replay} onClick={() => plan ? setReminderKey(plan.key) : onReplay()}>
        {t('按原玩法重玩', 'Replay in the same mode')}
      </button>
      {plan && <button type="button" className="subtle-button" onClick={() => onReplay(plan)}>{skipLabel}</button>}
    </div>
  </>
}
