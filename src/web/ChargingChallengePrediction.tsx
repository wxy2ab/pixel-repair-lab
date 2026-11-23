import { useId, useRef, useState } from 'react'
import { valuesEqual } from '../engine/values'
import type { AlgorithmLevel, AlgorithmResult, PersonalAlgorithms } from '../shared/advanced'
import type { Json, Locale } from '../shared/types'
import { useLessonWorker } from './lessonTools'
import { runIssueText, tr } from './text'
import { TraceRack } from './ProgramFlowBenches'
import './charge-prediction.css'
import './for-prediction.css'
import './nested-loops-prediction.css'

function BatteryRows({ rows, locale }: { rows: number[][]; locale: Locale }) {
  return <span className="nested-prediction-rows">
    {rows.length === 0 && <span>{tr(locale, '没有电池排', 'No battery rows')}</span>}
    {rows.map((batteries, rowIndex) => <span className="nested-prediction-row" key={rowIndex}
      data-row-index={rowIndex} data-empty={batteries.length === 0 || undefined}>
      <span className="nested-prediction-row-label">{tr(locale, `第 ${rowIndex + 1} 排`, `Row ${rowIndex + 1}`)}</span>
      <span className="nested-prediction-batteries">
        {batteries.map((charge, index) => <span className="nested-prediction-battery" key={index}
          data-battery-index={index} data-charge={charge}>{charge}</span>)}
        {batteries.length === 0 && <span className="nested-prediction-empty">{tr(locale, '空排', 'Empty')}</span>}
      </span>
    </span>)}
  </span>
}

function isBatteryRows(value: Json | undefined): value is number[][] {
  return Array.isArray(value) && value.every(row =>
    Array.isArray(row) && row.every(charge => typeof charge === 'number'))
}

export function ChargingChallengePrediction({ level, source, locale, personal, course, onComplete, onMistake }: {
  level: AlgorithmLevel; source: string; locale: Locale; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onComplete: () => void; onMistake?: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const titleId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [group, setGroup] = useState<number>()
  const [choice, setChoice] = useState<number>()
  const [result, setResult] = useState<AlgorithmResult>()
  const worker = useLessonWorker<AlgorithmResult>()

  const settings = level.chargingChallenge
  if (!settings) return null

  const sample = group === undefined ? undefined : settings.predictions[group]
  const [rows, added] = sample ? level.cases[sample.caseIndex]?.args ?? [] : []
  const predicted = choice === undefined ? undefined : sample?.options[choice]
  const checked = sample && result?.cases[sample.caseIndex]
  const predictionMatches = checked?.actual !== undefined && predicted !== undefined && valuesEqual(checked.actual, predicted)
  const matched = checked ? result?.won && predictionMatches : undefined
  const otherFailed = checked?.passed && result ? result.cases.findIndex(item => !item.passed) : -1
  const otherCase = otherFailed >= 0 ? level.cases[otherFailed] : undefined
  const otherIssue = otherFailed >= 0 ? result?.cases[otherFailed].issue : undefined

  function clearAnswer() {
    setChoice(undefined)
    setResult(undefined)
  }

  function verify() {
    if (!sample || !predicted || worker.pending || checked) return
    worker.run(() => new Worker(new URL('../engine/advanced.worker.ts', import.meta.url), { type: 'module' }),
      { level, source, personal, course }, outcome => {
        setResult(outcome)
        const selected = outcome.cases[sample.caseIndex]
        const correct = selected?.actual !== undefined && valuesEqual(selected.actual, predicted)
        if (outcome.won && correct) {
          if (!completed.current) {
            completed.current = true
            onComplete()
          }
        } else if ((selected?.passed && !correct) || outcome.cases.some(item => !item.passed && item.issue?.code !== 'internal')) {
          onMistake?.()
        }
      }, issue => setResult({ won: false, cases: [], issue }))
  }

  return <section className="panel nested-prediction" data-testid="charging-challenge-prediction" data-match={matched} aria-labelledby={titleId}>
    <div className="panel-heading"><h2 id={titleId}>{t('换一组电池，先预测', 'Predict with a new set of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset disabled={worker.pending}>
        <legend>{t('选一组新电池', 'Choose a new battery set')}</legend>
        <div className="charge-prediction-choices">
          {settings.predictions.map(({ caseIndex }, index) => <button type="button" className="subtle-button" key={caseIndex}
            data-charge-case={index} aria-pressed={group === index} onClick={() => {
              if (group !== index) {
                setGroup(index)
                clearAnswer()
              }
            }}>{t(`电池组 ${index + 1}`, `Battery set ${index + 1}`)}</button>)}
        </div>
      </fieldset>
      {sample && isBatteryRows(rows) && typeof added === 'number' && <>
        <TraceRack state={{ rows, saved: isBatteryRows(checked?.actual) ? checked.actual : [], locale,
          returned: isBatteryRows(checked?.actual) ? t(`交回 ${checked.actual.length} 排`, `Returned · ${checked.actual.length} rows`) : undefined }} />
        <div className="for-prediction-input nested-prediction-input" data-testid="charging-prediction-input">
          <h3>{t('起始电量', 'Starting charges')}</h3>
          <BatteryRows rows={rows} locale={locale} />
          <p>{t(`每块电池补 ${added} 格。`, `Add ${added} units to each battery.`)}</p>
        </div>
        <fieldset disabled={worker.pending}>
          <legend>{t('每排补完后是什么样？', 'What will each row look like after charging?')}</legend>
          <div className="charge-prediction-choices nested-prediction-options">
            {sample.options.map((option, index) => <button type="button" className="subtle-button" key={index}
              ref={index === 0 ? firstChoice : undefined} data-rows-option={index} aria-pressed={choice === index} onClick={() => {
                if (choice !== index) {
                  setChoice(index)
                  setResult(undefined)
                }
              }}><BatteryRows rows={option} locale={locale} /></button>)}
          </div>
        </fieldset>
      </>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={worker.pending || !sample || !predicted || !!checked}>{t('运行验证', 'Run to check')}</button>
      {worker.pending && <p role="status">{t('正在检查各组电池…', 'Checking the battery sets…')}</p>}
      {result?.issue && !checked && <p role="alert" className="error-message">{runIssueText(locale, result.issue)}</p>}
      {checked && <div className="charge-prediction-verification" data-match={matched}>
        <div role="status">
          <dl className="charge-prediction-comparison">
            <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{JSON.stringify(predicted)}</dd></div>
            <div><dt>{t('程序实际输出', 'Program output')}</dt><dd data-testid="charging-prediction-actual">
              {checked.issue ? runIssueText(locale, checked.issue) : JSON.stringify(checked.actual)}
            </dd></div>
          </dl>
          <p>{matched ? t('预测正确，程序也通过了全部用例！', 'Your prediction is correct, and the program passed every case!')
            : !checked.passed ? t('这组结果还没有通过。检查程序是否按顺序处理了每排和每块电池。',
              'This set did not pass. Check that the program processes each row and each battery in order.')
              : !predictionMatches ? t('按原顺序对照每排电池，再猜一次。', 'Compare the battery rows in order and try another prediction.')
                : t('这组预测正确。程序还有用例没通过。', 'This prediction is correct. The program still has a case to fix.')}</p>
          {otherCase && <dl className="for-prediction-values">
            <div><dt>{t('另一组未通过的起始电量', 'Starting charges in another failing case')}</dt><dd>{JSON.stringify(otherCase.args[0])}</dd></div>
            <div><dt>{t('每块要补的电量', 'Charge added per battery')}</dt><dd>{JSON.stringify(otherCase.args[1])}</dd></div>
            {otherIssue && <div><dt>{t('运行提示', 'Run feedback')}</dt><dd>{runIssueText(locale, otherIssue)}</dd></div>}
          </dl>}
        </div>
        {checked.passed && !predictionMatches && <button type="button" className="subtle-button" onClick={() => {
          clearAnswer()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
