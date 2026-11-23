import { useId, useRef, useState } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import { VerifiedNumbers } from './PythonRuntimeInstrument'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-prediction.css'

type Verification = { status: 'checked'; output: string } | { status: 'failed' }

function runChargeExample(source: string, input: number): string | undefined {
  const { issue, output } = runProgramWalkthrough(source, input)
  if (!issue && output.length === 1) return output[0]
}

export function ChargePrediction({ execution, locale, onComplete, runExample, description }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
  runExample?: (input: number) => string | undefined;
  description?: string;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const titleId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const [selected, setSelected] = useState<number>()
  const [prediction, setPrediction] = useState<string>()
  const [verification, setVerification] = useState<Verification>()
  const sample = selected === undefined ? undefined : execution.cases[selected]
  const checked = verification?.status === 'checked'
  const matched = checked && verification.output === prediction

  function resetPrediction() {
    setPrediction(undefined)
    setVerification(undefined)
  }

  function chooseInput(index: number) {
    if (index === selected) return
    setSelected(index)
    resetPrediction()
  }

  function choosePrediction(value: string) {
    if (value === prediction) return
    setPrediction(value)
    setVerification(undefined)
  }

  function verify() {
    if (!sample || prediction === undefined || checked) return
    const output = runExample ? runExample(sample.input) : runChargeExample(execution.source, sample.input)
    if (output === undefined) {
      setVerification({ status: 'failed' })
      return
    }
    setVerification({ status: 'checked', output })
    if (output === prediction) onComplete()
  }

  return <section className="panel charge-prediction" data-testid="charge-prediction" aria-labelledby={titleId}>
    <div className="panel-heading"><h2 id={titleId}>{t('换一个电量试试', 'Try a different charge')}</h2></div>
    <div className="charge-prediction-body">
      {description && <p>{description}</p>}
      <fieldset>
        <legend>{t('选一个新的起始电量', 'Choose a new starting charge')}</legend>
        <div className="charge-prediction-choices">
          {execution.cases.slice(1).map(({ label, input }, index) => <button type="button" className="subtle-button" key={input}
            data-charge-input={input} aria-pressed={selected === index + 1} onClick={() => chooseInput(index + 1)}>
            {label[locale]}
          </button>)}
        </div>
      </fieldset>
      {sample && <VerifiedNumbers input={sample.input} output={checked ? verification.output : undefined} locale={locale} />}
      {sample && <fieldset>
        <legend>{t('先猜猜程序会显示几格电', 'Predict the charge the program will display')}</legend>
        <div className="charge-prediction-choices charge-prediction-options">
          {sample.predictions?.map((value, index) => <button type="button" className="subtle-button" key={value}
            ref={index === 0 ? firstChoice : undefined} data-prediction={value} aria-pressed={prediction === value}
            onClick={() => choosePrediction(value)}>{value}</button>)}
        </div>
      </fieldset>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || prediction === undefined || checked}>{t('运行验证', 'Run to check')}</button>
      {verification?.status === 'failed' && <p role="alert" className="error-message">
        {t('程序这次没有显示结果。再运行一次试试。', 'The program did not show a result. Try running it again.')}
      </p>}
      {sample && checked && <div className="charge-prediction-verification" data-match={matched}>
        <div role="status">
          <dl className="charge-prediction-comparison">
            <div><dt>{t('起始电量', 'Starting charge')}</dt><dd>{sample.input}</dd></div>
            <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{prediction}</dd></div>
            <div><dt>{t('程序实际输出', 'Program output')}</dt><dd data-testid="charge-prediction-result">{verification.output}</dd></div>
          </dl>
          <p>{matched
            ? t('猜对了！程序显示的结果和你的预测一样。', 'You got it! The program displayed the result you predicted.')
            : t('想想程序在哪一步加了电量，再猜一次。', 'Think about which step added to the charge, then try another prediction.')}</p>
        </div>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          resetPrediction()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
