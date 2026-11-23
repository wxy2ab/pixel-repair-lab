import { useId, useRef, useState } from 'react'
import { runDebuggingLesson } from '../engine/programDebugging'
import { valuesEqual } from '../engine/values'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { TraceRack } from './ProgramFlowBenches'
import './charge-prediction.css'
import './for-prediction.css'

export function DebuggingPrediction({ execution, source, locale, onComplete }: {
  execution: ProgramWalkthrough; source: string; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState<number>()
  const [choice, setChoice] = useState<number>()
  const [actual, setActual] = useState<number[] | null>()
  const lesson = execution.debugging
  if (!lesson) return null

  const cases = lesson.cases.slice(2)
  const sample = caseIndex === undefined ? undefined : cases[caseIndex]
  const predicted = choice === undefined ? undefined : sample?.predictions?.[choice]
  const matched = actual && predicted ? valuesEqual(actual, predicted) : undefined

  function resetPrediction() {
    setChoice(undefined)
    setActual(undefined)
  }

  function verify() {
    if (!sample || !predicted || actual) return
    const run = runDebuggingLesson(source, sample.batteries)
    setActual(run?.results ?? null)
    if (run && !completed.current && valuesEqual(run.results, predicted)) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel charge-prediction" data-testid="debugging-prediction" data-match={matched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换一排电池，先预测', 'Predict with a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一排电池', 'Choose a row of batteries')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button type="button" className="subtle-button" key={index}
            data-debug-case={index} aria-pressed={caseIndex === index} onClick={() => {
              if (caseIndex === index) return
              setCaseIndex(index)
              resetPrediction()
            }}>{label[locale]}</button>)}
        </div>
      </fieldset>
      {sample && <>
        <TraceRack state={{ rows: [sample.batteries], saved: actual ? [actual] : [], locale,
          returned: actual ? t(`交回 ${actual.length} 块`, `Returned · ${actual.length}`) : undefined }} />
        <div className="for-prediction-input">
          <h3>{t('起始电量', 'Starting charges')}</h3>
          <ol className="for-prediction-batteries" aria-label={t('电池的起始电量', 'Battery charges in order')}>
            {sample.batteries.map((charge, index) => <li key={index} data-battery-index={index} data-charge={charge}>{charge}</li>)}
          </ol>
        </div>
        <fieldset>
          <legend>{t('修好后，程序会按顺序显示哪些电量？', 'What charges will the fixed program display, in order?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {sample.predictions?.map((option, index) => <button type="button" className="subtle-button" key={index}
              ref={index === 0 ? firstChoice : undefined} data-results-option={index} aria-pressed={choice === index} onClick={() => {
                if (choice === index) return
                setChoice(index)
                setActual(undefined)
              }}>{JSON.stringify(option)}</button>)}
          </div>
        </fieldset>
      </>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || !predicted || !!actual}>{t('运行验证', 'Run to check')}</button>
      {actual === null && <p role="alert" className="error-message">
        {t('程序这次没有显示补电结果。再试一次。', 'The program did not display the new charges this time. Try again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={matched}>
        <div role="status">
          <dl className="charge-prediction-comparison">
            <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{JSON.stringify(predicted)}</dd></div>
            <div><dt>{t('程序实际输出', 'Program output')}</dt><dd data-testid="debugging-actual-results">{JSON.stringify(actual)}</dd></div>
          </dl>
          <p>{matched ? t('猜对了！修好的程序给每块电池都补了电。', 'You got it! The fixed program charged every battery.')
            : t('按顺序核对每块电池的补电结果，再试一次。', 'Check the new charge for each battery in order, then try again.')}</p>
        </div>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          resetPrediction()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
