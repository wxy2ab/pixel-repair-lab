import { useId, useRef, useState } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import { AssignmentInstrument } from './ValueInstruments'
import type { ProgramWalkthrough, WalkthroughBinding } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-prediction.css'
import './variable-prediction.css'

const fields = ['new-input', 'new-result', 'overwrite-input'] as const
type Field = typeof fields[number]
type Guesses = Partial<Record<Field, string>>
type Verification = { actual: Record<Field, string> } | { failed: true }

function moduleBindings(source: string, input: number) {
  const run = runProgramWalkthrough(source, input)
  const last = run.frames.at(-1)
  if (run.issue || last?.kind !== 'end') return undefined
  return last.stack.find(scope => scope.name === '<module>')?.values
}

function bindingNumber(bindings: WalkthroughBinding[] | undefined, name: string) {
  const value = bindings?.find(binding => binding.name === name)?.value
  return typeof value === 'number' ? String(value) : undefined
}

export function VariablePrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const [sampleIndex, setSampleIndex] = useState<number>()
  const [guesses, setGuesses] = useState<Guesses>({})
  const [verification, setVerification] = useState<Verification>()
  const assignment = execution.assignment
  const sample = sampleIndex === undefined ? undefined : execution.cases[sampleIndex]
  const actual = verification && 'actual' in verification ? verification.actual : undefined
  const allPredicted = fields.every(field => guesses[field] !== undefined)
  const allMatched = actual && fields.every(field => guesses[field] === actual[field])
  if (!assignment) return null

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
    if (!assignment || !sample || !allPredicted || actual) return
    const newBindings = moduleBindings(execution.source, sample.input)
    const overwriteBindings = moduleBindings(assignment.overwriteSource, sample.input)
    const newInput = bindingNumber(newBindings, assignment.inputVariable)
    const newResult = bindingNumber(newBindings, assignment.resultVariable)
    const overwriteInput = bindingNumber(overwriteBindings, assignment.inputVariable)
    if (newInput === undefined || newResult === undefined || overwriteInput === undefined) {
      setVerification({ failed: true })
      return
    }

    const values = { 'new-input': newInput, 'new-result': newResult, 'overwrite-input': overwriteInput }
    setVerification({ actual: values })
    if (fields.every(field => guesses[field] === values[field])) onComplete()
  }

  function predictionBox(field: Field, name: string) {
    return <fieldset className="variable-prediction-box" data-prediction-field={field}
      data-match={actual ? guesses[field] === actual[field] : undefined}>
      <legend><code>{name}</code></legend>
      <div className="charge-prediction-choices charge-prediction-options">
        {sample?.predictions?.map((value, index) => <button type="button" key={value} className="subtle-button"
          ref={field === 'new-input' && index === 0 ? firstChoice : undefined}
          aria-pressed={guesses[field] === value} data-prediction={value} onClick={() => predict(field, value)}>{value}</button>)}
      </div>
      {actual && <dl className="variable-prediction-values">
        <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{guesses[field]}</dd></div>
        <div><dt>{t('实际的值', 'Actual value')}</dt><dd data-actual-value={actual[field]}>{actual[field]}</dd></div>
      </dl>}
    </fieldset>
  }

  return <section className="panel variable-prediction" data-testid="variable-prediction" aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换个电量，预测格子里的值', 'Predict the boxes with a new charge')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一个新的起始电量', 'Choose a new starting charge')}</legend>
        <div className="charge-prediction-choices">
          {execution.cases.slice(1).map(({ label, input }, index) => <button type="button" className="subtle-button" key={input}
            data-charge-input={input} aria-pressed={sampleIndex === index + 1} onClick={() => selectSample(index + 1)}>
            {label[locale]}
          </button>)}
        </div>
      </fieldset>
      {sample && <p>{t('先猜程序跑完后，每个格子里会存着多少电量。', 'Predict the charge in each box after the programs finish.')}</p>}
      {sample && <AssignmentInstrument state={{ locale, input: sample.input, inputName: assignment.inputVariable,
        resultName: assignment.resultVariable, stage: actual ? 'store' : 'predict',
        lanes: [{ charge: actual?.['new-input'], result: actual?.['new-result'] }, { charge: actual?.['overwrite-input'] }] }} />}
      {sample && <div className="variable-prediction-variants">
        <section aria-labelledby={`${headingId}-new`}>
          <h3 id={`${headingId}-new`}>{t('存到新变量', 'Store in a new variable')}</h3>
          {predictionBox('new-input', assignment.inputVariable)}
          {predictionBox('new-result', assignment.resultVariable)}
        </section>
        <section aria-labelledby={`${headingId}-overwrite`}>
          <h3 id={`${headingId}-overwrite`}>{t('写回原变量', 'Store back in the same variable')}</h3>
          {predictionBox('overwrite-input', assignment.inputVariable)}
        </section>
      </div>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || !allPredicted || !!actual}>{t('运行验证', 'Run to check')}</button>
      {verification && 'failed' in verification && <p role="alert" className="error-message">
        {t('这次没能读到所有格子的值。再运行一次试试。', 'The programs could not read every box this time. Try running again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={allMatched}>
        <p role="status">{allMatched
          ? t('三个格子的值都猜对了！', 'You predicted the value in all three boxes!')
          : t('对照每个格子的名字，想想结果会存进哪一个格子。', 'Check the name on each box and think about which one receives the result.')}</p>
        {!allMatched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
