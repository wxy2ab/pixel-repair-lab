import { useId, useState } from 'react'
import { runPrefixTotals } from '../engine/programPrefixTotals'
import { valuesEqual } from '../engine/values'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale, RunIssue } from '../shared/types'
import { SearchBatteryFace } from './BatterySearchLesson'
import { AlgorithmBatteryRack } from './AlgorithmBatteryRack'
import { runIssueText, tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './prefix-totals-prediction.css'

type Prediction = { prefixIndex?: number; total?: number }
type Attempt = { prefix: number[]; total: number; throughRight: number; beforeLeft: number }

function showPrefix(values: readonly number[]) {
  return '[' + values.join(', ') + ']'
}

export function PrefixTotalsPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const heading = useId()
  const [prediction, setPrediction] = useState<Prediction>({})
  const [attempt, setAttempt] = useState<Attempt>()
  const [problem, setProblem] = useState<RunIssue | true>()
  const sample = execution.prefixTotalsLesson?.practice
  if (!sample) return null

  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { batteries, left, right, predictions } = sample
  const leftName = batteries[left].name
  const rightName = batteries[right].name
  const pickedPrefix = prediction.prefixIndex === undefined ? undefined : predictions.prefix[prediction.prefixIndex]
  const prefixMatch = attempt && pickedPrefix && valuesEqual(pickedPrefix, attempt.prefix)
  const totalMatch = attempt && prediction.total === attempt.total
  const matched = attempt && prefixMatch === true && totalMatch === true
  const ready = pickedPrefix !== undefined && prediction.total !== undefined

  function change(next: Prediction) {
    setPrediction(next)
    setAttempt(undefined)
    setProblem(undefined)
  }

  function verify() {
    if (!pickedPrefix || !ready || attempt) return
    const { result, issue, steps } = runPrefixTotals(execution.source, batteries, left, right)
    const throughRight = steps.find(step => step.kind === 'included')?.value
    const beforeLeft = steps.find(step => step.kind === 'before')?.value
    if (issue || !result || throughRight === undefined || beforeLeft === undefined) {
      setProblem(issue ?? true)
      return
    }
    setProblem(undefined)
    setAttempt({ prefix: result.prefix, total: result.total, throughRight, beforeLeft })
    if (valuesEqual(pickedPrefix, result.prefix) && prediction.total === result.total) onComplete()
  }

  return <section className="panel prefix-totals-prediction" aria-labelledby={heading}
    data-testid="prefix-totals-prediction" data-match={matched}>
    <div className="panel-heading"><h2 id={heading}>{t('换一排电池，先预测', 'Predict for a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <AlgorithmBatteryRack scene="prefix-prediction-rack" locale={locale} label={t('这次要查的电池区间', 'The battery range for this run')}
        batteries={batteries} range={[left, right]} prefix={attempt?.prefix} operands={attempt ? [left, right + 1] : undefined}
        readout={attempt ? attempt.throughRight + ' − ' + attempt.beforeLeft + ' = ' + attempt.total : undefined} inspect />
      <p>{left === right
        ? t(`这次只求 ${leftName} 号这一格的电量。先选出整排的累计表，再选电量。`,
          `This time the range contains only battery ${leftName}. Choose the row’s running totals, then its charge.`)
        : t(`这次求 ${leftName} 到 ${rightName} 号这一段的电量，首尾都算。先选出整排的累计表，再选区间总电量。`,
          `This time, find the charge from ${leftName} through ${rightName}, including both ends. Choose the row’s running totals, then the range total.`)}</p>
      <ol className="search-battery-row prefix-totals-practice-row" aria-label={t('练习用电池', 'Practice batteries')}
        data-testid="prefix-totals-practice-row">
        {batteries.map(({ name, charge }, index) => {
          const inRange = index >= left && index <= right
          const bound = index === left && index === right ? 'both' : index === left ? 'left' : index === right ? 'right' : undefined
          return <li key={name} className="search-battery-tile" data-battery-name={name}
            data-in-range={inRange || undefined} data-bound={bound}>
            <SearchBatteryFace name={name} charge={charge} locale={locale} />
            {bound === 'both' && <small>{t('单格', 'Only slot')}</small>}
            {bound === 'left' && <small>{t('起点', 'Start')}</small>}
            {bound === 'right' && <small>{t('终点', 'End')}</small>}
          </li>
        })}
      </ol>
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field prefix-totals-pick" disabled={matched} data-prediction="prefix" data-match={prefixMatch}>
          <legend>{t('累计电量按顺序是什么？', 'What are the running totals in order?')}</legend>
          <p className="prefix-totals-prediction-note">{t('先写 0，再从左到右记下加完每块电池后的累计值。',
            'Start at 0, then record the total after adding each battery from left to right.')}</p>
          <div className="charge-prediction-choices charge-prediction-options">
            {predictions.prefix.map((values, index) => <button key={index} type="button" className="subtle-button"
              aria-pressed={prediction.prefixIndex === index} data-prefix-option={index}
              onClick={() => change({ ...prediction, prefixIndex: index })}>{showPrefix(values)}</button>)}
          </div>
          {attempt && <dl className="for-prediction-values">
            <div>
              <dt>{t('实际累计表', 'Actual running totals')}</dt>
              <dd data-testid="prefix-totals-actual-prefix">{showPrefix(attempt.prefix)}</dd>
            </div>
          </dl>}
          {prefixMatch === false && <p className="for-prediction-hint">
            {t('用上一格的累计值加当前电量。碰到 0 格电量时，累计值保持不变。',
              'Add each battery’s charge to the preceding total. A battery with 0 charge leaves the total unchanged.')}
          </p>}
        </fieldset>
        <fieldset className="for-prediction-field prefix-totals-pick" disabled={matched} data-prediction="total" data-match={totalMatch}>
          <legend>{t('指定区间的总电量是多少？', 'What is the total charge in the marked range?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {predictions.totals.map(total => <button key={total} type="button" className="subtle-button"
              aria-pressed={prediction.total === total} data-total-option={total}
              onClick={() => change({ ...prediction, total })}>{t(`${total} 格`, `${total} ${total === 1 ? 'unit' : 'units'}`)}</button>)}
          </div>
          {attempt && <dl className="for-prediction-values">
            <div>
              <dt>{t('实际总电量', 'Actual range total')}</dt>
              <dd data-testid="prefix-totals-actual-total">{attempt.total}</dd>
            </div>
          </dl>}
          {totalMatch === false && <p className="for-prediction-hint">
            {t('减掉的是左端前面的电量，左端这块也要算进区间。',
              'Subtract only the charge before the left end. The left-end battery still belongs to the range.')}
          </p>}
        </fieldset>
      </div>
      <button className="primary-button charge-prediction-verify" type="button" onClick={verify} disabled={!ready || !!attempt}>
        {t('运行验证', 'Run to check')}
      </button>
      {problem && <p className="error-message" role="alert">{problem === true
        ? t('程序没有给出可核对的累计表和总电量。请再运行一次。', 'The program did not return totals to check. Run it again.')
        : runIssueText(locale, problem)}</p>}
      {attempt && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('累计电量和区间总电量都猜对了！', 'You predicted both the running totals and the range total!')
          : t('对照程序算出的累计表和减法，再试一次。', 'Check the program’s running totals and subtraction, then try again.')}</p>
        <dl className="charge-prediction-comparison">
          <div>
            <dt>{t(`到 ${rightName} 号为止（含这块）`, `Through ${rightName} (included)`)}</dt><dd>{attempt.throughRight}</dd>
          </div>
          <div>
            <dt>{left === 0 ? t('第一块之前', 'Before the first battery')
              : t(`${leftName} 号之前（到 ${batteries[left - 1].name} 号为止）`, `Before ${leftName} (through ${batteries[left - 1].name})`)}</dt>
            <dd>{attempt.beforeLeft}</dd>
          </div>
          <div>
            <dt>{t('区间总电量', 'Range total')}</dt>
            <dd data-testid="prefix-totals-actual-equation">{attempt.throughRight} − {attempt.beforeLeft} = {attempt.total}</dd>
          </div>
        </dl>
        {!matched && <button className="subtle-button" type="button" onClick={() => change({
          prefixIndex: prefixMatch ? prediction.prefixIndex : undefined,
          total: totalMatch ? prediction.total : undefined,
        })}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
