import { useId, useRef, useState } from 'react'
import { runBooleanLesson, type BooleanLessonRun } from '../engine/programBoolean'
import { runBranchLesson } from '../engine/programBranch'
import { GateInstrument } from './ValueInstruments'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-prediction.css'
import './departure-prediction.css'

type Prediction = boolean | 'if' | 'else'
type Run = BooleanLessonRun | NonNullable<ReturnType<typeof runBranchLesson>>
type Verification = { run: Run } | { failed: true }

function answerOf(run: Run): Prediction {
  return 'choice' in run ? run.choice.path : run.decision.value
}

function pythonTruth(value: boolean) {
  return value ? 'True' : 'False'
}

export function DeparturePrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const titleId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [selected, setSelected] = useState<number>()
  const [prediction, setPrediction] = useState<Prediction>()
  const [verification, setVerification] = useState<Verification>()
  const cases = execution.cases.filter(sample => sample.activity === 'predict')
  const sample = selected === undefined ? undefined : cases[selected]
  const actual = verification && 'run' in verification ? verification.run : undefined
  const matched = actual && answerOf(actual) === prediction
  const branchLesson = execution.branchLesson
  const threshold = branchLesson?.threshold ?? execution.boolean?.threshold
  const answers: Prediction[] = branchLesson ? ['if', 'else'] : [true, false]

  function resetPrediction() {
    setPrediction(undefined)
    setVerification(undefined)
  }

  function chooseCase(index: number) {
    if (selected === index) return
    setSelected(index)
    resetPrediction()
  }

  function choosePrediction(value: Prediction) {
    if (prediction === value) return
    setPrediction(value)
    setVerification(undefined)
  }

  function verify() {
    if (!sample || typeof sample.doorOpen !== 'boolean' || prediction === undefined || actual) return
    const run = branchLesson ? runBranchLesson(execution.source, sample.input, sample.doorOpen)
      : runBooleanLesson(execution.source, sample.input, sample.doorOpen)
    if (!run) {
      setVerification({ failed: true })
      return
    }
    setVerification({ run })
    if (answerOf(run) === prediction && !completed.current) {
      completed.current = true
      onComplete()
    }
  }

  const canDepart = (value: boolean) => value ? t('能出发', 'Can leave') : t('不能出发', 'Cannot leave')
  const doorLabel = (open: boolean) => open ? t('打开', 'Open') : t('关闭', 'Closed')
  let reason = ''
  if (actual) {
    if (actual.comparison.value && actual.door.value) reason = t('电量达标，安全门也打开了，两项都成立。', 'The charge meets the minimum and the safety door is open. Both conditions are true.')
    else if (actual.comparison.value) reason = t('电量达标了，安全门还关着。', 'The charge meets the minimum, but the safety door is closed.')
    else if (actual.door.value) reason = t('安全门打开了，电量还没达标。', 'The safety door is open, but the charge is below the minimum.')
    else reason = t('电量还没达标，安全门也关着。', 'The charge is below the minimum and the safety door is closed.')
  }

  return <section className="panel departure-prediction" data-testid={branchLesson ? 'branch-prediction' : 'departure-prediction'}
    data-match={matched} aria-labelledby={titleId}>
    <div className="panel-heading"><h2 id={titleId}>{branchLesson ? t('换一组条件，预测会走哪条路', 'Predict the path with new conditions')
      : t('换一组条件，预测能否出发', 'Predict departure with new conditions')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选择电量和门的状态', 'Choose a charge and door state')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button type="button" className="subtle-button" key={index}
            data-departure-case={branchLesson ? undefined : index} data-branch-case={branchLesson ? index : undefined}
            aria-pressed={selected === index} onClick={() => chooseCase(index)}>{label[locale]}</button>)}
        </div>
      </fieldset>
      {sample && <>
        {threshold !== undefined && <GateInstrument state={{ locale, threshold, fork: Boolean(branchLesson),
          charge: sample.input, enough: actual?.comparison.value, door: sample.doorOpen,
          decision: actual && ('choice' in actual ? actual.condition.value : actual.decision.value),
          selected: actual && 'choice' in actual ? actual.choice.path : undefined,
          action: actual && 'choice' in actual ? actual.action.value : undefined }} />}
        <dl className="departure-prediction-conditions">
          <div>
            <dt>{t('补电后的电量', 'Charge after topping up')}</dt>
            <dd><strong>{sample.input}</strong> {t('格', sample.input === 1 ? 'unit' : 'units')}</dd>
          </div>
          <div data-door-open={sample.doorOpen}>
            <dt>{t('安全门', 'Safety door')}</dt>
            <dd><span className="departure-prediction-door" aria-hidden="true" />{doorLabel(!!sample.doorOpen)}</dd>
          </div>
        </dl>
        <fieldset>
          <legend>{branchLesson ? t('走 if 还是 else？', 'Will it take if or else?')
            : t('芽芽能出发吗？', 'Can Sprout leave?')}</legend>
          <div className="charge-prediction-choices">
            {answers.map((answer, index) => <button type="button" className="subtle-button" key={String(answer)}
              data-prediction={String(answer)} aria-pressed={prediction === answer} ref={index === 0 ? firstChoice : undefined}
              onClick={() => choosePrediction(answer)}>{typeof answer === 'boolean' ? canDepart(answer)
                : <><code>{answer}</code> {t('分支', 'branch')}</>}</button>)}
          </div>
        </fieldset>
      </>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || prediction === undefined || !!actual}>{t('运行验证', 'Run to check')}</button>
      {verification && 'failed' in verification && <p role="alert" className="error-message">
        {t('这次没能读到程序结果。再运行一次试试。', 'The program did not give a result this time. Try running it again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={matched}>
        <div role="status">
          <dl className="departure-prediction-checks">
            <div data-condition="charge" data-truth={actual.comparison.value}>
              <dt>{t('电量达标', 'Enough charge')}</dt>
              <dd><code>{pythonTruth(actual.comparison.value)}</code></dd>
            </div>
            <div data-condition="door" data-truth={actual.door.value}>
              <dt>{t('安全门打开', 'Safety door open')}</dt>
              <dd><code>{pythonTruth(actual.door.value)}</code></dd>
            </div>
            {'choice' in actual && branchLesson ? <div data-condition="decision" data-truth={actual.condition.value}>
              <dt>{t('选中的分支', 'Selected branch')}</dt>
              <dd><code data-testid="branch-prediction-result">{actual.choice.path}</code>
                <span>{branchLesson.actions[actual.choice.path][locale]}</span></dd>
            </div> : 'decision' in actual && <div data-condition="decision" data-truth={actual.decision.value}>
              <dt>{t('出发决定', 'Departure decision')}</dt>
              <dd><code data-testid="departure-prediction-result">{actual.output}</code><span>{canDepart(actual.decision.value)}</span></dd>
            </div>}
          </dl>
          <p>{matched ? t('猜对了！', 'You got it! ') : t('再看看两个条件。', 'Look at both conditions again. ')}{reason}</p>
        </div>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          resetPrediction()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
