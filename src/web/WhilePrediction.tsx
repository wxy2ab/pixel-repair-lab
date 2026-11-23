import { useId, useRef, useState } from 'react'
import { runWhileLesson } from '../engine/programWhile'
import { LoopInstrument } from './LoopInstrument'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'

type Verification = NonNullable<ReturnType<typeof runWhileLesson>> | { failed: true }

export function WhilePrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState<number>()
  const [roundGuess, setRoundGuess] = useState<number>()
  const [chargeGuess, setChargeGuess] = useState<string>()
  const [verification, setVerification] = useState<Verification>()
  const lesson = execution.whileLoop
  if (!lesson) return null

  const cases = execution.cases.slice(2)
  const sample = caseIndex === undefined ? undefined : cases[caseIndex]
  const predicted = roundGuess !== undefined && chargeGuess !== undefined
  const actual = verification && 'rounds' in verification ? verification : undefined
  const roundsMatch = actual && actual.rounds === roundGuess
  const chargeMatches = actual && String(actual.finalCharge) === chargeGuess
  const matched = roundsMatch && chargeMatches

  function clearPredictions() {
    setRoundGuess(undefined)
    setChargeGuess(undefined)
    setVerification(undefined)
  }

  function selectCase(index: number) {
    if (index === caseIndex) return
    setCaseIndex(index)
    clearPredictions()
  }

  function predictRounds(value: number) {
    if (roundGuess === value) return
    setRoundGuess(value)
    setVerification(undefined)
  }

  function predictCharge(value: string) {
    if (chargeGuess === value) return
    setChargeGuess(value)
    setVerification(undefined)
  }

  function verify() {
    if (!sample || !predicted || actual) return
    const run = runWhileLesson(execution.source, sample.input)
    if (!run) {
      setVerification({ failed: true })
      return
    }
    setVerification(run)
    if (!completed.current && run.rounds === roundGuess && String(run.finalCharge) === chargeGuess) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel while-prediction" data-testid="while-prediction" data-match={matched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换一个起始电量，先预测', 'Predict with a new starting charge')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一个起始电量', 'Choose a starting charge')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label, input }, index) => <button type="button" className="subtle-button" key={input}
            data-while-case={index} aria-pressed={caseIndex === index} onClick={() => selectCase(index)}>{label[locale]}</button>)}
        </div>
      </fieldset>
      {sample && <>
        <LoopInstrument state={{ mode: 'while', locale, current: actual?.finalCharge ?? sample.input, target: lesson.threshold,
          limit: Math.max(lesson.threshold + lesson.increment, sample.input, actual?.finalCharge ?? 0), step: actual?.steps.at(-1), canCharge: false }} />
        <dl className="charge-prediction-comparison">
          <div><dt>{t('起始电量', 'Starting charge')}</dt><dd>{t(`${sample.input} 格`, `${sample.input} units`)}</dd></div>
          <div><dt>{t('目标电量', 'Target charge')}</dt><dd>{t(`${lesson.threshold} 格`, `${lesson.threshold} units`)}</dd></div>
          <div><dt>{t('每轮补电', 'Charge added per round')}</dt><dd>{t(`${lesson.increment} 格`, `${lesson.increment} units`)}</dd></div>
        </dl>
        <div className="for-prediction-fields">
          <fieldset className="for-prediction-field" data-while-prediction-field="rounds" data-match={roundsMatch}>
            <legend>{t('循环会执行几次？', 'How many times will the loop run?')}</legend>
            <div className="charge-prediction-choices charge-prediction-options">
              {sample.roundPredictions?.map((value, index) => <button type="button" className="subtle-button" key={value}
                ref={index === 0 ? firstChoice : undefined} data-round-option={value} aria-pressed={roundGuess === value}
                onClick={() => predictRounds(value)}>{value}</button>)}
            </div>
            {actual && <>
              <dl className="for-prediction-values">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{roundGuess}</dd></div>
                <div><dt>{t('实际次数', 'Actual count')}</dt><dd data-testid="while-actual-rounds">{actual.rounds}</dd></div>
              </dl>
              {!roundsMatch && <p className="for-prediction-hint">{t('每补一次才算一轮。电量达标时直接结束循环。', 'Count one round each time the battery is charged. The loop stops as soon as the charge meets the target.')}</p>}
            </>}
          </fieldset>
          <fieldset className="for-prediction-field" data-while-prediction-field="charge" data-match={chargeMatches}>
            <legend>{t('循环结束后有几格电？', 'What is the charge when the loop ends?')}</legend>
            <div className="charge-prediction-choices charge-prediction-options">
              {sample.predictions?.map(value => <button type="button" className="subtle-button" key={value}
                data-charge-option={value} aria-pressed={chargeGuess === value} onClick={() => predictCharge(value)}>{value}</button>)}
            </div>
            {actual && <>
              <dl className="for-prediction-values">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{chargeGuess}</dd></div>
                <div><dt>{t('实际电量', 'Actual charge')}</dt><dd data-testid="while-actual-charge">{actual.finalCharge}</dd></div>
              </dl>
              {!chargeMatches && <p className="for-prediction-hint">{t(`从起始电量算起，每补一次就加 ${lesson.increment} 格。`,
                `Start with the initial charge and add ${lesson.increment} each time the battery is charged.`)}</p>}
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
        <p role="status">{matched ? t('循环次数和最终电量都猜对了！', 'Both your count and your final charge are correct!')
          : t('把预测和实际结果对照一下，再试一次。', 'Compare your predictions with the actual results and try again.')}</p>
        {actual.rounds === 0 && <p>{t('第一次检查就达标，程序直接输出起始电量。', 'The charge meets the target at the first check. The program displays the starting charge.')}</p>}
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
