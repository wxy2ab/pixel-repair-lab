import { useId, useRef, useState } from 'react'
import { valuesEqual } from '../engine/values'
import type { BatterySequenceCase, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { runBatterySequence } from '../engine/programBatterySequence'
import { StructureRack } from './BatteryMemory'
import { StructureTrace } from './StructureTrace'
import './charge-prediction.css'
import './for-prediction.css'
import './battery-sequence-prediction.css'

type Answer = 'popped' | 'remaining'
type Result = NonNullable<ReturnType<typeof runBatterySequence>>

export type BatterySequenceLessonProps = {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}

export function BatterySequencePrediction({ kind, cases, source, locale, onComplete }: {
  kind: 'stack' | 'queue'; cases?: BatterySequenceCase[]; source: string;
  locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const queue = kind === 'queue'
  const title = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState(0)
  const [choices, setChoices] = useState<Partial<Record<Answer, number>>>({})
  const [verification, setVerification] = useState<Result | null>()
  const sample = cases?.[caseIndex]
  if (!cases || !sample?.predictions) return null

  const options = sample.predictions
  const guessedPopped = choices.popped === undefined ? undefined : options.popped[choices.popped]
  const guessedRemaining = choices.remaining === undefined ? undefined : options.remaining[choices.remaining]
  const poppedMatches = verification && guessedPopped ? valuesEqual(verification.popped, guessedPopped) : undefined
  const remainingMatches = verification && guessedRemaining ? valuesEqual(verification.remaining, guessedRemaining) : undefined
  const matched = verification ? poppedMatches === true && remainingMatches === true : undefined

  function clearPredictions() {
    setChoices({})
    setVerification(undefined)
  }

  function select(key: Answer, index: number) {
    if (choices[key] === index) return
    setChoices(previous => ({ ...previous, [key]: index }))
    setVerification(undefined)
  }

  function verify() {
    if (!sample || !guessedPopped || !guessedRemaining || verification) return
    const result = runBatterySequence(sample.source ?? source, sample, queue ? 'front' : 'back')
    setVerification(result ?? null)
    if (result && !completed.current && valuesEqual(result.popped, guessedPopped) && valuesEqual(result.remaining, guessedRemaining)) {
      completed.current = true
      onComplete()
    }
  }

  const fields = [
    {
      key: 'popped', question: t('电池会按什么顺序取出？', 'In what order will the batteries come out?'),
      empty: t('没有取出电池', 'None taken'), actual: t('实际取出顺序', 'Actual removal order'),
      guess: guessedPopped, matches: poppedMatches,
      hint: queue
        ? t('每次取出前都看看现在的队头，把拿到的电池依次记下来。',
          'Check the front before each removal. Write down the batteries in the order you take them.')
        : t('每次取出前都看看现在的栈顶，把拿到的电池依次记下来。',
          'Check the top before each removal. Write down the batteries in the order you take them.'),
    },
    {
      key: 'remaining', question: queue
        ? t('队里还剩哪些？从队头排到队尾。', 'What is left in the queue, from front to back?')
        : t('栈里还剩哪些？从底往上排。', 'What is left in the stack, from bottom to top?'),
      empty: queue ? t('空队列', 'Empty queue') : t('空栈', 'Empty stack'), actual: queue
        ? t('实际剩余（队头到队尾）', 'Actual queue (front to back)')
        : t('实际剩余（底到顶）', 'Actual stack (bottom to top)'),
      guess: guessedRemaining, matches: remainingMatches,
      hint: queue
        ? t('做完最后一步，从队头到队尾记下还在排队的电池。',
          'After the last move, read the batteries still in the queue from front to back.')
        : t('做完最后一步，只从底往上数还留在栈里的电池。',
          'After the last move, read the batteries that are still in the stack from bottom to top.'),
    },
  ] as const
  const waiting = queue ? t('待入队的电池', 'Batteries ready to join the queue') : t('待放入的电池', 'Batteries ready to stack')

  return <section className={`panel ${kind}-prediction`} data-testid={`${kind}-prediction`} data-match={matched} aria-labelledby={title}>
    <div className="panel-heading"><h2 id={title}>{t('换一组电池，先预测', 'Predict with a new set of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一组电池', 'Choose a set of batteries')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button key={index} type="button" className="subtle-button"
            {...{ [`data-${kind}-case`]: index }} aria-pressed={caseIndex === index} onClick={() => {
              if (caseIndex === index) return
              setCaseIndex(index)
              clearPredictions()
            }}>{label[locale]}</button>)}
        </div>
      </fieldset>
      <div className="for-prediction-input">
        <StructureTrace frames={verification?.steps} locale={locale}>{(step, index) => {
          const remaining = step?.remaining ?? []
          const pending = verification && index !== undefined
            ? verification.steps.slice(index + 1).flatMap(item => item.kind === 'push' && item.battery !== undefined ? [item.battery] : [])
            : sample.batteries.map(item => item.name)
          return <StructureRack kind={kind} locale={locale} names={remaining} capacity={sample.batteries.length}
            waiting={[...new Set(pending)].filter(name => !remaining.includes(name))} taken={step?.popped ?? []} active={step?.battery} />
        }}</StructureTrace>
        <h3>{waiting}</h3>
        <ul className="for-prediction-batteries" aria-label={waiting}>
          {sample.batteries.map(({ name, charge }) => <li key={name} data-battery-name={name} data-charge={charge}>
            <strong>{name}</strong> <small>{t(`${charge} 格`, `${charge} ${charge === 1 ? 'unit' : 'units'}`)}</small>
          </li>)}
        </ul>
        <h3 className={`${kind}-prediction-plan-title`}>{queue
          ? t('从空队列开始，按顺序操作', 'Start with an empty queue and follow these steps')
          : t('从空栈开始，按顺序操作', 'Start with an empty stack and follow these steps')}</h3>
        <ol className={`${kind}-prediction-plan`} aria-label={t('操作顺序', 'Order of operations')}>
          {sample.operations.map((operation, index) => <li key={index} {...{ [`data-${kind}-operation`]: operation.kind }}>
            {operation.kind === 'push'
              ? queue ? t(`让 ${operation.battery} 号电池排到队尾`, `Add battery ${operation.battery} to the back`)
                : t(`放入 ${operation.battery} 号电池`, `Put battery ${operation.battery} on top`)
              : queue ? t('从队头取出一块', 'Take one battery from the front')
                : t('从顶上取出一块', 'Take one battery from the top')}
          </li>)}
        </ol>
      </div>
      <div className="for-prediction-fields">
        {fields.map(({ key, question, empty, actual, guess, matches, hint }) =>
          <fieldset key={key} className="for-prediction-field" data-match={matches}>
            <legend>{question}</legend>
            <div className="charge-prediction-choices charge-prediction-options">
              {options[key].map((names, index) => <button key={index} type="button" className="subtle-button"
                ref={key === 'popped' && index === 0 ? firstChoice : undefined}
                data-popped-option={key === 'popped' ? index : undefined}
                data-remaining-option={key === 'remaining' ? index : undefined}
                aria-pressed={choices[key] === index} onClick={() => select(key, index)}>
                {names.length ? names.join(' → ') : empty}
              </button>)}
            </div>
            {verification && <>
              <dl className="for-prediction-values">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{JSON.stringify(guess)}</dd></div>
                <div><dt>{actual}</dt><dd data-testid={`${kind}-actual-${key}`}>{JSON.stringify(verification[key])}</dd></div>
              </dl>
              {!matches && <p className="for-prediction-hint">{hint}</p>}
            </>}
          </fieldset>)}
      </div>
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!guessedPopped || !guessedRemaining || !!verification}>{t('运行验证', 'Run to check')}</button>
      {verification === null && <p className="error-message" role="alert">
        {t('程序这次没有给出完整结果，可以再运行一次。', 'The program did not return a complete result. You can run it again.')}
      </p>}
      {verification && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched
          ? queue ? t('取出的顺序和队里剩下的电池都猜对了！', 'You predicted both the order taken and what stayed in the queue!')
            : t('取出的顺序和栈里的电池都猜对了！', 'You predicted both the order taken and what stayed in the stack!')
          : t('对照实际结果，再猜一次。', 'Compare your predictions with the actual results and try again.')}</p>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
