import { useId, useRef, useState } from 'react'
import { runNestedLoopsLesson } from '../engine/programNestedLoops'
import { LoopInstrument } from './LoopInstrument'
import { nestedRowsMatch, type ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './nested-loops-prediction.css'

type Verification = { rounds: number; rows: number[][] } | { failed: true }

function BatteryRows({ rows, locale }: { rows: number[][]; locale: Locale }) {
  return <span className="nested-prediction-rows">
    {rows.map((batteries, row) => <span className="nested-prediction-row" key={row}
      data-row-index={row} data-empty={batteries.length === 0 ? true : undefined}>
      <span className="nested-prediction-row-label">{tr(locale, `第 ${row + 1} 排`, `Row ${row + 1}`)}</span>
      <span className="nested-prediction-batteries">
        {batteries.map((charge, index) => <span className="nested-prediction-battery" key={index}
          data-battery-index={index} data-charge={charge}>{charge}</span>)}
        {batteries.length === 0 && <span className="nested-prediction-empty">{tr(locale, '空排', 'Empty')}</span>}
      </span>
    </span>)}
  </span>
}

export function NestedLoopsPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState<number>()
  const [roundGuess, setRoundGuess] = useState<number>()
  const [rowsIndex, setRowsIndex] = useState<number>()
  const [verification, setVerification] = useState<Verification>()
  const lesson = execution.nestedLoops
  if (!lesson) return null

  const cases = lesson.cases.slice(1)
  const sample = caseIndex === undefined ? undefined : cases[caseIndex]
  const options = sample?.predictions
  const rowsGuess = rowsIndex === undefined ? undefined : options?.rows[rowsIndex]
  const actual = verification && 'rounds' in verification ? verification : undefined
  const roundsMatch = actual && actual.rounds === roundGuess
  const rowsMatch = actual && rowsGuess !== undefined && nestedRowsMatch(actual.rows, rowsGuess)
  const matched = roundsMatch && rowsMatch

  function clearPredictions() {
    setRoundGuess(undefined)
    setRowsIndex(undefined)
    setVerification(undefined)
  }

  function selectCase(index: number) {
    if (index === caseIndex) return
    setCaseIndex(index)
    clearPredictions()
  }

  function verify() {
    if (!sample || roundGuess === undefined || rowsGuess === undefined || actual) return
    const run = runNestedLoopsLesson(execution.source, sample.rows)
    if (!run) {
      setVerification({ failed: true })
      return
    }
    setVerification({ rounds: run.rounds, rows: run.rows })
    if (!completed.current && run.rounds === roundGuess && nestedRowsMatch(run.rows, rowsGuess)) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel nested-prediction" data-testid="nested-loops-prediction" data-match={matched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换几排电池，先预测', 'Predict with new rows of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一组电池', 'Choose a set of batteries')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button type="button" className="subtle-button" key={index}
            data-nested-case={index} aria-pressed={caseIndex === index} onClick={() => selectCase(index)}>{label[locale]}</button>)}
        </div>
      </fieldset>
      {sample && <>
        <LoopInstrument state={{ mode: 'nested', locale, rows: sample.rows, saved: actual?.rows ?? [], increment: lesson.increment }} />
        <div className="for-prediction-input nested-prediction-input" data-testid="nested-starting-rows">
          <h3>{t('起始电量', 'Starting charges')}</h3>
          <BatteryRows rows={sample.rows} locale={locale} />
          <p>{t(`每块电池补 ${lesson.increment} 格。`, `Each battery gets ${lesson.increment} more units of charge.`)}</p>
        </div>
        <div className="for-prediction-fields nested-prediction-fields">
          <fieldset className="for-prediction-field" data-nested-field="rounds" data-match={roundsMatch}>
            <legend>{t('一共会补电几次？', 'How many times will the batteries be charged in total?')}</legend>
            <div className="charge-prediction-choices charge-prediction-options">
              {options?.rounds.map((rounds, index) => <button type="button" className="subtle-button" key={rounds}
                ref={index === 0 ? firstChoice : undefined} data-round-option={rounds} aria-pressed={roundGuess === rounds}
                onClick={() => {
                  if (roundGuess === rounds) return
                  setRoundGuess(rounds)
                  setVerification(undefined)
                }}>{rounds}</button>)}
            </div>
            {actual && <>
              <dl className="for-prediction-values">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{roundGuess}</dd></div>
                <div><dt>{t('实际补电次数', 'Actual charge count')}</dt><dd data-testid="nested-actual-rounds">{actual.rounds}</dd></div>
              </dl>
              {!roundsMatch && <p className="for-prediction-hint">{t('数完每一排的电池，再把它们加起来。每块补一次。',
                'Count the batteries in each row and add those counts together. Each battery gets one turn.')}</p>}
            </>}
          </fieldset>
          <fieldset className="for-prediction-field" data-nested-field="rows" data-match={rowsMatch}>
            <legend>{t('每排补完后是什么样？', 'What will each row look like after charging?')}</legend>
            <div className="charge-prediction-choices nested-prediction-options">
              {options?.rows.map((rows, index) => <button type="button" className="subtle-button" key={index}
                data-rows-option={index} aria-pressed={rowsIndex === index} onClick={() => {
                  if (rowsIndex === index) return
                  setRowsIndex(index)
                  setVerification(undefined)
                }}><BatteryRows rows={rows} locale={locale} /></button>)}
            </div>
            {actual && rowsGuess && <>
              <dl className="for-prediction-values nested-prediction-comparison">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd><BatteryRows rows={rowsGuess} locale={locale} /></dd></div>
                <div><dt>{t('实际补电结果', 'Actual charges')}</dt><dd data-testid="nested-actual-rows"><BatteryRows rows={actual.rows} locale={locale} /></dd></div>
              </dl>
              {!rowsMatch && <p className="for-prediction-hint">{t(`按原顺序逐排核对。每块加 ${lesson.increment} 格，遇到空排就留空。`,
                `Check one row at a time in the original order. Add ${lesson.increment} to each battery and leave any empty rows empty.`)}</p>}
            </>}
          </fieldset>
        </div>
      </>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || roundGuess === undefined || rowsGuess === undefined || !!actual}>{t('运行验证', 'Run to check')}</button>
      {verification && 'failed' in verification && <p role="alert" className="error-message">
        {t('这次程序没有给出补电结果。再运行一次试试。', 'The program did not give a charging result. Try running it again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('补电次数和每排的结果都猜对了！', 'Both your count and your results are correct!')
          : t('对照实际结果，再试一次。', 'Compare your predictions with the actual results and try again.')}</p>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
