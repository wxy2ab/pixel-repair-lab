import { useId, useRef, useState } from 'react'
import { runFunctionLesson } from '../engine/programFunction'
import { VerifiedNumbers } from './PythonRuntimeInstrument'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-prediction.css'
import './function-prediction.css'

const fields = ['return', 'caller'] as const
type Field = typeof fields[number]
type Guesses = Partial<Record<Field, string>>
type Verification = { actual: Record<Field, string> } | { failed: true }

export function FunctionPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [sampleIndex, setSampleIndex] = useState<number>()
  const [guesses, setGuesses] = useState<Guesses>({})
  const [verification, setVerification] = useState<Verification>()
  const lesson = execution.functionLesson
  const sample = sampleIndex === undefined ? undefined : execution.cases[sampleIndex]
  const actual = verification && 'actual' in verification ? verification.actual : undefined
  const allPredicted = fields.every(field => guesses[field] !== undefined)
  const allMatched = actual && fields.every(field => guesses[field] === actual[field])
  if (!lesson) return null

  function clearPredictions() {
    setGuesses({})
    setVerification(undefined)
  }

  function selectSample(index: number) {
    if (index === sampleIndex) return
    setSampleIndex(index)
    clearPredictions()
  }

  function predict(field: Field, value: string) {
    if (guesses[field] === value) return
    setGuesses(previous => ({ ...previous, [field]: value }))
    setVerification(undefined)
  }

  function verify() {
    if (!sample || !allPredicted || actual) return
    const run = runFunctionLesson(execution, sample.input)
    if (!run) {
      setVerification({ failed: true })
      return
    }

    const values = { return: String(run.returned), caller: String(run.callerValue) }
    setVerification({ actual: values })
    if (!completed.current && fields.every(field => guesses[field] === values[field])) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel function-prediction" data-testid="function-prediction" data-match={allMatched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换个电量，预测两个值', 'Predict both values with a new charge')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一个新的起始电量', 'Choose a new starting charge')}</legend>
        <div className="charge-prediction-choices">
          {execution.cases.slice(1).map(({ label, input }, index) => <button type="button" className="subtle-button" key={input}
            data-charge-input={input} aria-pressed={sampleIndex === index + 1} onClick={() => selectSample(index + 1)}>{label[locale]}</button>)}
        </div>
      </fieldset>
      {sample && <VerifiedNumbers input={sample.input} output={actual?.return}
        caller={{ name: lesson.parameter, value: actual?.caller }} locale={locale} />}
      {sample && <div className="function-prediction-fields">
        {fields.map(field => <fieldset className="function-prediction-field" key={field} data-prediction-field={field}
          data-match={actual ? guesses[field] === actual[field] : undefined}>
          <legend>{field === 'return' ? t('函数的返回值', 'Function return value')
            : <>{t('主程序里的', 'Main program’s')} <code>{lesson.parameter}</code></>}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {sample.predictions?.map((value, index) => <button type="button" className="subtle-button" key={value}
              ref={field === 'return' && index === 0 ? firstChoice : undefined}
              aria-pressed={guesses[field] === value} data-prediction={value} onClick={() => predict(field, value)}>{value}</button>)}
          </div>
          {actual && <dl className="function-prediction-values">
            <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{guesses[field]}</dd></div>
            <div><dt>{t('实际的值', 'Actual value')}</dt><dd data-actual-value={actual[field]}>{actual[field]}</dd></div>
          </dl>}
        </fieldset>)}
      </div>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || !allPredicted || !!actual}>{t('运行验证', 'Run to check')}</button>
      {verification && 'failed' in verification && <p role="alert" className="error-message">
        {t('这次没能读到两个值。再运行一次试试。', 'The program did not give both values this time. Try running it again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={allMatched}>
        <p role="status">{allMatched ? t('两个预测都对了！', 'Both predictions are correct!')
          : t('看看 return 交回了哪个数，再对照主程序自己的格子。', 'Check the number that return sends back and the number in the main program’s own box.')}</p>
        {!allMatched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
