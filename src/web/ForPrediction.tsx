import { useId, useRef, useState } from 'react'
import { runForLesson } from '../engine/programFor'
import { LoopInstrument } from './LoopInstrument'
import { valuesEqual } from '../engine/values'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'

type Verification = NonNullable<ReturnType<typeof runForLesson>> | { failed: true }

function readingList(values: readonly number[]): string {
  return `[${values.join(', ')}]`
}

export function ForPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState<number>()
  const [roundGuess, setRoundGuess] = useState<number>()
  const [resultIndex, setResultIndex] = useState<number>()
  const [verification, setVerification] = useState<Verification>()
  const lesson = execution.forLoop
  if (!lesson) return null

  const cases = lesson.cases.slice(1)
  const sample = caseIndex === undefined ? undefined : cases[caseIndex]
  const resultGuess = resultIndex === undefined ? undefined : sample?.predictions?.results[resultIndex]
  const predicted = roundGuess !== undefined && resultGuess !== undefined
  const actual = verification && 'rounds' in verification ? verification : undefined
  const roundsMatch = actual && actual.rounds === roundGuess
  const resultsMatch = actual && resultGuess !== undefined && valuesEqual(actual.results, resultGuess)
  const matched = actual && roundsMatch && resultsMatch

  function clearPredictions() {
    setRoundGuess(undefined)
    setResultIndex(undefined)
    setVerification(undefined)
  }

  function selectCase(index: number) {
    if (index === caseIndex) return
    setCaseIndex(index)
    clearPredictions()
  }

  function predictRounds(rounds: number) {
    if (roundGuess === rounds) return
    setRoundGuess(rounds)
    setVerification(undefined)
  }

  function predictResults(index: number) {
    if (resultIndex === index) return
    setResultIndex(index)
    setVerification(undefined)
  }

  function verify() {
    if (!sample || !predicted || actual) return
    const run = runForLesson(execution.source, sample.batteries)
    if (!run) {
      setVerification({ failed: true })
      return
    }
    setVerification(run)
    if (!completed.current && run.rounds === roundGuess && valuesEqual(run.results, resultGuess)) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel for-prediction" data-testid="for-prediction" data-match={matched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换一排电池，先预测', 'Predict with a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一组起始电量', 'Choose a row of starting charges')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button type="button" className="subtle-button" key={index}
            data-for-case={index} aria-pressed={caseIndex === index} onClick={() => selectCase(index)}>{label[locale]}</button>)}
        </div>
      </fieldset>
      {sample && <>
        <LoopInstrument state={{ mode: 'for', locale, batteries: sample.batteries, increment: lesson.increment, step: actual?.steps.at(-1) }} />
        <div className="for-prediction-input">
          <h3>{t('起始电量', 'Starting charges')}</h3>
          {sample.batteries.length > 0 ? <ol className="for-prediction-batteries" aria-label={t('电池的起始电量', 'Battery charges in order')}>
            {sample.batteries.map((charge, index) => <li key={index}>{charge}</li>)}
          </ol> : <p>{t('这组没有电池。', 'This row is empty.')}</p>}
        </div>
        <div className="for-prediction-fields">
          <fieldset className="for-prediction-field" data-for-prediction-field="rounds" data-match={roundsMatch}>
            <legend>{t('循环会执行几次？', 'How many times will the loop run?')}</legend>
            <div className="charge-prediction-choices charge-prediction-options">
              {sample.predictions?.rounds.map((rounds, index) => <button type="button" className="subtle-button" key={rounds}
                ref={index === 0 ? firstChoice : undefined} data-round-option={rounds} aria-pressed={roundGuess === rounds}
                onClick={() => predictRounds(rounds)}>{rounds}</button>)}
            </div>
            {actual && <>
              <dl className="for-prediction-values">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{roundGuess}</dd></div>
                <div><dt>{t('实际次数', 'Actual count')}</dt><dd data-testid="for-actual-rounds">{actual.rounds}</dd></div>
              </dl>
              {!roundsMatch && <p className="for-prediction-hint">{t('数数这排电池。每一块都对应一轮。', 'Count the batteries. Each one gets a turn.')}</p>}
            </>}
          </fieldset>
          <fieldset className="for-prediction-field" data-for-prediction-field="results" data-match={resultsMatch}>
            <legend>{t('补电后的电量按顺序是什么？', 'What are the new charges in order?')}</legend>
            <div className="charge-prediction-choices charge-prediction-options">
              {sample.predictions?.results.map((results, index) => <button type="button" className="subtle-button" key={index}
                data-result-option={index} aria-pressed={resultIndex === index} onClick={() => predictResults(index)}>{readingList(results)}</button>)}
            </div>
            {actual && <>
              <dl className="for-prediction-values">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{resultGuess && readingList(resultGuess)}</dd></div>
                <div><dt>{t('实际结果', 'Actual results')}</dt><dd data-testid="for-actual-results">{readingList(actual.results)}</dd></div>
              </dl>
              {!resultsMatch && <p className="for-prediction-hint">{t(`按顺序核对每块电池，它会增加 ${lesson.increment} 格电量。`,
                `Check the batteries in order. Each gets ${lesson.increment} more units of charge.`)}</p>}
            </>}
          </fieldset>
        </div>
      </>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || !predicted || !!actual}>{t('运行验证', 'Run to check')}</button>
      {verification && 'failed' in verification && <p role="alert" className="error-message">
        {t('这次没有读到循环的结果。再运行一次试试。', 'The program did not give a loop result this time. Try running it again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('循环次数和补电结果都猜对了！', 'Both your count and your results are correct!')
          : t('把预测和实际结果对照一下，再试一次。', 'Compare your predictions with the actual results and try again.')}</p>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
