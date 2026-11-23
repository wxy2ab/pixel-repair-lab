import { useEffect, useId, useRef } from 'react'
import type { Level, Locale } from '../shared/types'
import type { PendingChallengeGoal } from './challengeGoals'
import type { compareGoalReplay, GoalReplayTurn } from './challengeGoalReview'
import { ChallengeReplayPlanner } from './ChallengeReplayPlanner'
import { replayFocusOptions, type ReplayFocusPlan } from './challengeReplayFocus'
import { scoreMetrics, type ChallengeScoreMetric } from './challengeScore'
import { goalDifference, metricLabel, valueOf } from './challengeScoreDisplay'
import { tr } from './text'
import './challenge-goal-replay-review.css'

type Comparison = NonNullable<ReturnType<typeof compareGoalReplay>>

const advice = {
  failure: ['先单独检查卡住的那一步，再运行整关。', 'Check the step where you got stuck before running the whole challenge.'],
  route: ['先挑一小段走过两次的路，试试看能不能少走一步。', 'Try changing one short stretch you walked twice and see if it saves a step.'],
  score: ['下次先观察一件补给什么时候被拿走，再决定要不要改路线。', 'Watch when one supply is collected before deciding whether to change your route.'],
  checks: ['先手算一组小输入，再用它检查自己的想法。', 'Work through one small input by hand to check your idea.'],
  instructions: ['选一条看起来重复的指令，单步看看它改变了什么。', 'Step through one instruction that looks repetitive and see what it changes.'],
  rounds: ['下次发出提示词前，逐条核对数量和限制。', 'Check each quantity and constraint before you send your next prompt.'],
  goal: ['下次只改一处，再看看成绩怎么变。', 'Try one small change next time and see how the result changes.'],
} satisfies Record<Comparison['advice'], [string, string]>

function metricChange({ id, selected, best }: Comparison['metrics'][number], level: Level, locale: Locale) {
  const count = Math.abs(selected - best)
  if (!count) return
  const more = selected > best
  const amount = id === 'cases' ? '' : goalDifference(id, count, 'zh')
  const englishAmount = (unit: string) => `${count} ${more ? 'more' : 'fewer'} ${unit}${count === 1 ? '' : 's'}`
  const t = (zh: string, en: string) => tr(locale, zh, en)
  switch (id) {
    case 'turns': return t(`${more ? '多' : '少'}用了 ${amount}`, `Used ${englishAmount('turn')}`)
    case 'score': return t(`${more ? '多' : '少'}拿了 ${amount}`, `Scored ${englishAmount('point')}`)
    case 'checks': return t(`${more ? '多' : '少'}检查了 ${count} 次`, `Ran ${englishAmount('check')}`)
    case 'instructions': return t(`${more ? '多' : '少'}执行了 ${amount}`, `Executed ${englishAmount('instruction')}`)
    case 'rounds': return t(`${more ? '多' : '少'}用了 ${amount}`, `Used ${englishAmount('round')}`)
    case 'cases': {
      const [zh, en] = level.kind === 'data' ? ['步', 'step']
        : level.kind === 'grid' || level.kind === 'arena' ? ['个场景', 'scenario'] : ['个用例', 'test case']
      return t(`${more ? '多' : '少'}通过了 ${count} ${zh}`, `Passed ${englishAmount(en)}`)
    }
  }
}

function supplyLabel(id: string, locale: Locale) {
  const match = /^(battery|part)-(\d+)$/u.exec(id)
  if (match?.[1] === 'battery') return tr(locale, `电池 ${match[2]}`, `Battery ${match[2]}`)
  if (match?.[1] === 'part') return tr(locale, `零件 ${match[2]}`, `Part ${match[2]}`)
  return tr(locale, `补给 ${id}`, `Supply ${id}`)
}

function turnAction({ action, x, y, item, blocked }: GoalReplayTurn, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  switch (action) {
    case 'move':
      if (blocked) return t('移动受阻', 'Move blocked')
      return x === undefined || y === undefined ? t('移动', 'Moved') : t(`移到（${x}, ${y}）`, `Moved to (${x}, ${y})`)
    case 'pick':
      if (item) return t(`拾取${supplyLabel(item, 'zh')}`, `Picked up ${supplyLabel(item, 'en')}`)
      return t('尝试拾取', 'Tried to pick up a supply')
    case 'step': return t('执行一步指令', 'Executed an instruction')
    case 'submit': return t('提交结果', 'Submitted a result')
    case 'wait': return t('等待', 'Waited')
  }
}

function ReviewScore({ metrics, entry, locale }: { metrics: ChallengeScoreMetric[]; entry: PendingChallengeGoal; locale: Locale }) {
  if (metrics.length === 0) return null
  return <dl className="goal-replay-review-score">
    {metrics.map(metric => <div key={metric.id}><dt>{metricLabel(metric.id, entry.score, locale)}</dt><dd>{valueOf(metric)}</dd></div>)}
  </dl>
}

export function ChallengeGoalReplayReview({ id, comparison, entry, locale, attemptLabel, onClose, onReplay }: {
  id: string
  comparison: Comparison
  entry: PendingChallengeGoal
  locale: Locale
  attemptLabel: (attempt: number) => string
  onClose: () => void
  onReplay: (plan?: ReplayFocusPlan) => void
}) {
  const { selected, best, metrics, extraTurns, missedItems, turnComparisonAvailable } = comparison
  const headingId = useId()
  const review = useRef<HTMLElement>(null)
  const selectedAttempt = selected.attempt
  const sameReplay = selectedAttempt === best?.attempt
  const issue = selected.details?.evidence?.issue
  const hasTurns = entry.score.kind === 'grid' || entry.score.kind === 'arena'
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const showMetrics = Boolean(best && !sameReplay && metrics.length)
  const gapText = (remaining: number | null) => {
    if (remaining === null) return t('未通关', 'Not cleared')
    if (remaining === 0) return t('达到目标数值', 'Met the target value')
    return t(`还差 ${goalDifference(entry.goal.metricId, remaining, 'zh')}`, `${goalDifference(entry.goal.metricId, remaining, 'en')} short`)
  }
  const turnLine = (turn: GoalReplayTurn) => <li key={turn.turn} data-goal-extra-turn={turn.turn}>
    <strong>{t(`第 ${turn.turn} 回合`, `Turn ${turn.turn}`)}</strong> {turnAction(turn, locale)}
  </li>
  const itemLine = ({ id, turn }: Comparison['missedItems'][number]) => <li key={id} data-goal-missed-item={id}>
    <strong>{supplyLabel(id, locale)}</strong> {t(`最接近的那次在第 ${turn} 回合拾取`, `Picked up on turn ${turn} in the closest replay`)}
  </li>

  useEffect(() => {
    review.current?.focus({ preventScroll: true })
    review.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedAttempt])

  return <section id={id} className="goal-replay-review" aria-labelledby={headingId} tabIndex={-1} ref={review}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }}>
    <div className="goal-replay-review-heading">
      <h4 id={headingId}>{t('重玩对比', 'Compare replays')}</h4>
      <button type="button" className="subtle-button" onClick={onClose}>{t('关闭复盘', 'Close review')}</button>
    </div>
    <dl className="goal-replay-review-runs">
      <div>
        <dt>{attemptLabel(selectedAttempt)} {sameReplay && <small>{t('最接近目标', 'Closest to target')}</small>}</dt>
        <dd>{gapText(selected.remaining)}</dd>
      </div>
      {best && !sameReplay && <div>
        <dt>{attemptLabel(best.attempt)} <small>{t('最接近目标', 'Closest to target')}</small></dt>
        <dd>{gapText(best.remaining)}</dd>
      </div>}
    </dl>
    {sameReplay && <p>{t('这是最接近目标的那次。点另一次重玩来对比。', 'This replay was closest. Choose another replay to compare.')}</p>}
    {!best && <p>{t('通关后就有可对照的重玩。', 'Clear the challenge to have a replay to compare against.')}</p>}
    {showMetrics ? <table className="goal-replay-review-table">
      <thead><tr><th scope="col">{t('成绩', 'Result')}</th><th scope="col">{t('这次', 'This replay')}</th>
        <th scope="col">{t('最接近那次', 'Closest replay')}</th></tr></thead>
      <tbody>{metrics.map(metric => {
        const change = metricChange(metric, entry.level, locale)
        return <tr key={metric.id} data-goal-review-metric={metric.id}>
          <th scope="row">{metricLabel(metric.id, entry.score, locale)}{change && <small>{change}</small>}</th>
          <td>{valueOf({ ...metric, value: metric.selected, total: metric.selectedTotal })}</td>
          <td>{valueOf({ ...metric, value: metric.best, total: metric.bestTotal })}</td>
        </tr>
      })}</tbody>
    </table> : selected.details && <ReviewScore metrics={scoreMetrics(selected.details.score)} entry={entry} locale={locale} />}
    {issue && <div data-goal-replay-failure>
      <h5>{selected.remaining === null ? t('卡在哪儿', 'Where it stopped')
        : t('中途需要修正的地方', 'What needed a correction')}</h5>
      <p>{issue.location[locale]}</p>
      {issue.gaps.length > 0 && <ul>{issue.gaps.map((gap, index) => <li key={index}>{gap[locale]}</li>)}</ul>}
    </div>}
    {hasTurns && 'total' in entry.score && entry.score.total > 1 && (extraTurns.length > 0 || missedItems.length > 0) && <p>
      {t('下方动作和补给来自主场景。', 'The turns and supplies below are from the main map.')}
    </p>}
    {extraTurns.length > 0 && <div>
      <h5>{t('这次路线里不同的动作', 'Where this route differed')}</h5>
      <ul>{extraTurns.slice(0, 5).map(turnLine)}</ul>
      {extraTurns.length > 5 && <details><summary>{t('查看其余动作', 'See remaining actions')}</summary>
        <ul>{extraTurns.slice(5).map(turnLine)}</ul></details>}
    </div>}
    {missedItems.length > 0 && <div>
      <h5>{t('这次没拿到的补给', 'Supplies missed this replay')}</h5>
      <ul>{missedItems.slice(0, 5).map(itemLine)}</ul>
      {missedItems.length > 5 && <details><summary>{t('查看其余补给', 'See remaining supplies')}</summary>
        <ul>{missedItems.slice(5).map(itemLine)}</ul></details>}
    </div>}
    {hasTurns && best && !sameReplay && !turnComparisonAvailable
      ? <p>{t('这两次的逐回合记录不完整，可以先对照上方成绩。', 'Turn details are incomplete. Compare the saved scores above.')}</p>
      : !selected.details && <p>{t('这次只保存了重玩结果。', 'Only the result was saved for this replay.')}</p>}
    <p className="goal-replay-review-advice" data-goal-review-advice>
      <strong>{t('下次可以试试', 'For your next try')}</strong> {t(...advice[comparison.advice])}
    </p>
    <ChallengeReplayPlanner key={selectedAttempt} options={replayFocusOptions(entry, selectedAttempt)} locale={locale} onReplay={onReplay} />
  </section>
}
