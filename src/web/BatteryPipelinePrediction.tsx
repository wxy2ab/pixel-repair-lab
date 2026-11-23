import { useId, useState } from 'react'
import { runBatteryPipelineTrial } from '../engine/batteryPipeline'
import { valuesEqual } from '../engine/values'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import { readBatteryPipelineCase } from '../shared/batteryPipeline'
import type { Locale } from '../shared/types'
import { runIssueText, tr } from './text'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import './charge-prediction.css'
import './for-prediction.css'
import './battery-pipeline-prediction.css'

type Picks = { order?: number; pair?: number; total?: number }

function ActualAnswer({ label, children, field, match, locale }: {
  label: string; children: string | number; field: keyof Picks; match?: boolean; locale: Locale;
}) {
  return <dl className="for-prediction-values">
    <div><dt>{label}</dt><dd data-testid={'battery-pipeline-actual-' + field}>{children}</dd></div>
    {match !== undefined && <div>
      <dt>{tr(locale, '预测', 'Prediction')}</dt>
      <dd className="battery-pipeline-prediction-mark">{match ? tr(locale, '答对了', 'Correct') : tr(locale, '再想一想', 'Try again')}</dd>
    </div>}
  </dl>
}

export function BatteryPipelinePrediction({ level, source, locale, personal, course, onComplete, onMistake }: {
  level: AlgorithmLevel; source: string; locale: Locale; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onComplete: () => void; onMistake?: () => void;
}) {
  const heading = useId()
  const [picks, setPicks] = useState<Picks>({})
  const [verification, setVerification] = useState<ReturnType<typeof runBatteryPipelineTrial>>()
  const settings = level.batteryPipeline?.prediction
  const input = settings && readBatteryPipelineCase(level.cases[settings.caseIndex])
  if (!settings || !input) return null

  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { values, target, left, right } = input
  const guessedOrder = picks.order === undefined ? undefined : settings.orders[picks.order]
  const guessedPair = picks.pair === undefined ? undefined : settings.pairs[picks.pair]
  const actual = verification?.result
  const checked = verification?.passed === true && actual !== undefined
  const orderMatches = checked && guessedOrder !== undefined ? valuesEqual(guessedOrder, actual.ordered) : undefined
  const pairMatches = checked && guessedPair !== undefined ? valuesEqual(guessedPair, actual.pair) : undefined
  const totalMatches = checked ? picks.total === actual.total : undefined
  const matched = checked ? orderMatches === true && pairMatches === true && totalMatches === true : undefined
  const table = checked ? verification?.steps.find(step => step.kind === 'prefix')?.prefix : undefined
  const throughRight = table?.[right + 1]
  const beforeLeft = table?.[left]

  function choose(next: Picks) {
    setPicks(next)
    setVerification(undefined)
  }

  function verify() {
    if (!settings || !guessedOrder || !guessedPair || picks.total === undefined || checked) return
    const run = runBatteryPipelineTrial(level, source, settings.caseIndex, personal, course)
    setVerification(run)
    if (!run.passed || !run.result) return
    if (valuesEqual(guessedOrder, run.result.ordered) && valuesEqual(guessedPair, run.result.pair) && picks.total === run.result.total) {
      onComplete()
    } else {
      onMistake?.()
    }
  }

  const pairText = (pair: number[]) => pair.length ? pair.join(' + ') : t('找不到配对', 'No pair')

  return <section className="panel battery-pipeline-prediction" data-testid="battery-pipeline-prediction"
    data-match={matched} aria-labelledby={heading}>
    <div className="panel-heading"><h2 id={heading}>{t('换一排电池，先预测', 'Predict for a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <AlgorithmBatteryRack scene="shipment-prediction-rack" locale={locale}
        label={actual ? t('工单返回的电池', 'The row returned by the work order') : t('新工单的电池', 'Batteries for the new work order')}
        batteries={(actual?.ordered ?? values).map(charge => ({ charge }))} range={actual ? [left, right] : undefined}
        prefix={table} operands={table ? [left, right + 1] : undefined}
        readout={actual && table ? throughRight + ' − ' + beforeLeft + ' = ' + actual.total : undefined} inspect />
      <p>{t('先排好这排电池，再用排好的顺序配对和查区间。', 'Sort these batteries first. Use the sorted row to find a pair and a range total.')}</p>
      <ol className="for-prediction-batteries battery-pipeline-practice-row" data-testid="battery-pipeline-practice-row"
        aria-label={t('电池的原来顺序', 'Batteries in their original order')}>
        {values.map((charge, index) => <li key={index} data-charge={charge}>{charge}</li>)}
      </ol>
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field battery-pipeline-pick" disabled={matched} data-prediction="order" data-match={orderMatches}>
          <legend>{t('电量从小到大怎么排？', 'What is the order from lowest to highest charge?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {settings.orders.map((order, index) => <button key={index} type="button" className="subtle-button"
              aria-pressed={picks.order === index} data-order-option={index}
              onClick={() => choose({ ...picks, order: index })}>{order.join(' → ')}</button>)}
          </div>
          {actual && <ActualAnswer label={t('实际顺序', 'Actual sorted order')} field="order" match={orderMatches} locale={locale}>
            {actual.ordered.join(' → ')}
          </ActualAnswer>}
          {orderMatches === false && <p className="for-prediction-hint">
            {t('从最小电量开始，依次往后放。', 'Start with the smallest charge and work your way up.')}
          </p>}
        </fieldset>
        <fieldset className="for-prediction-field battery-pipeline-pick" disabled={matched} data-prediction="pair" data-match={pairMatches}>
          <legend>{t('程序会先找到哪一对，正好凑够 ' + target + ' 格？', 'Which pair will the program find first for ' + target + ' units?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {settings.pairs.map((pair, index) => <button key={index} type="button" className="subtle-button"
              aria-pressed={picks.pair === index} data-pair-option={index}
              onClick={() => choose({ ...picks, pair: index })}>{pairText(pair)}</button>)}
          </div>
          {actual && <ActualAnswer label={t('实际配对', 'Actual pair')} field="pair" match={pairMatches} locale={locale}>
            {pairText(actual.pair)}
          </ActualAnswer>}
          {pairMatches === false && <p className="for-prediction-hint">
            {t('从排好后的一左一右开始。两头加起来太小就移动左端，太大就移动右端。',
              'Start at both ends of the sorted row. Move the left end if the sum is too small, or the right end if it is too large.')}
          </p>}
        </fieldset>
        <fieldset className="for-prediction-field battery-pipeline-pick" disabled={matched} data-prediction="total" data-match={totalMatches}>
          <legend>{t('指定区间的总电量是多少？', 'What is the total charge in the range?')}</legend>
          <p className="battery-pipeline-range-note">{left === right ? t(
            '在排好的电池里只算位置 ' + left + '。位置从 0 开始数。',
            'Count only position ' + left + ' in the sorted row. Positions start at 0.',
          ) : t(
            '在排好的电池里算位置 ' + left + ' 到 ' + right + '，两端都算。位置从 0 开始数。',
            'Count positions ' + left + ' through ' + right + ' in the sorted row, including both ends. Positions start at 0.',
          )}</p>
          <div className="charge-prediction-choices charge-prediction-options">
            {settings.totals.map(total => <button key={total} type="button" className="subtle-button"
              aria-pressed={picks.total === total} data-total-option={total}
              onClick={() => choose({ ...picks, total })}>{t(total + ' 格', total + (total === 1 ? ' unit' : ' units'))}</button>)}
          </div>
          {actual && <ActualAnswer label={t('实际总电量', 'Actual range total')} field="total" match={totalMatches} locale={locale}>
            {actual.total}
          </ActualAnswer>}
          {totalMatches === false && <p className="for-prediction-hint">
            {t('从右端的累计值里，只减掉左端前面的累计值。',
              'From the running total through the right end, subtract only the total before the left end.')}
          </p>}
        </fieldset>
      </div>
      <button className="primary-button charge-prediction-verify" type="button" onClick={verify}
        disabled={!guessedOrder || !guessedPair || picks.total === undefined || checked}>{t('运行验证', 'Run to check')}</button>
      {verification && !checked && <div className="error-message battery-pipeline-prediction-problem" role="alert">
        <p>{verification.issue ? runIssueText(locale, verification.issue)
          : t('程序算出的结果和工单对不上。', 'The program’s result did not match the work order.')}</p>
        <p>{t('可以换回课程函数，或回练习检查自己的函数，再试跑一次。',
          'Try a course function, or revisit the practice to check your own function. Then run the trial again.')}</p>
      </div>}
      {matched !== undefined && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('排序、配对和区间总电量都猜对了！', 'You predicted the order, the pair, and the range total!')
          : t('对照程序的结果，再试一次。', 'Compare your predictions with the program’s results and try again.')}</p>
        {checked && throughRight !== undefined && beforeLeft !== undefined && <p>
          {t('区间用这两个累计值相减', 'Subtract these two running totals for the range')}
          {' '}<code data-testid="battery-pipeline-actual-equation">{throughRight} − {beforeLeft} = {actual.total}</code>
        </p>}
        {!matched && <button className="subtle-button" type="button" onClick={() => choose({
          order: orderMatches ? picks.order : undefined,
          pair: pairMatches ? picks.pair : undefined,
          total: totalMatches ? picks.total : undefined,
        })}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
