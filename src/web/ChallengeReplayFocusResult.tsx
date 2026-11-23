import { useId } from 'react'
import type { Locale } from '../shared/types'
import { replayFocusLabel, replayFocusValue, type ReplayFocusEvaluation } from './challengeReplayFocus'
import type { ReplayFocusReference } from './challengeReplayFocusHistory'
import { replayFocusReferenceLabel, replayFocusStatusLabel } from './replayFocusPresentation'
import { tr } from './text'
import './challenge-replay-focus.css'

export function ChallengeReplayFocusResult({ result, reference, locale, inSummary = false }: {
  result: ReplayFocusEvaluation; reference: ReplayFocusReference; locale: Locale; inSummary?: boolean
}) {
  const headingId = useId()
  const Heading = inSummary ? 'h3' : 'h2'
  const { plan, before, after, status } = result
  const t = (zh: string, en: string) => tr(locale, zh, en)

  return <section className={`challenge-replay-focus${inSummary ? '' : ' panel challenge-replay-focus-standalone'}`}
    aria-labelledby={headingId} data-replay-focus-status={status}>
    <div className="challenge-replay-focus-heading">
      <Heading id={headingId}>{t('重玩改进对照', 'Replay focus result')}</Heading>
      <strong role="status">{replayFocusStatusLabel(status, locale)}</strong>
    </div>
    <p>{replayFocusLabel(plan, locale)}</p>
    <dl>
      <div><dt>{replayFocusReferenceLabel(reference, plan.attempt, locale)}</dt><dd data-replay-focus-before={before}>
        {replayFocusValue(plan, before, locale)}
      </dd></div>
      <div><dt>{t('这次重玩', 'This replay')}</dt><dd data-replay-focus-after={after}>
        {after === undefined ? t('暂无可比较的结果', 'No comparable result yet') : replayFocusValue(plan, after, locale)}
      </dd></div>
    </dl>
  </section>
}
