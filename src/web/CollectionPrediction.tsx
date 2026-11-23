import { useId, useRef, useState, type ReactNode } from 'react'
import { runCollectionLesson, type CollectionLessonRun } from '../engine/programCollection'
import { collectionRecordsMatch, type ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { CollectionBench } from './ProgramFlowBenches'
import './charge-prediction.css'
import './for-prediction.css'
import './collection-prediction.css'

type FieldName = 'position' | 'named' | 'records'
type Predictions = Partial<Record<FieldName, number>>
type Verification = CollectionLessonRun | { failed: true }

function RecordEntries({ records, measured = false }: { records: Record<string, number>; measured?: boolean }) {
  return <span className="collection-prediction-entries">
    {Object.entries(records).map(([name, charge]) => <span key={name}
      data-record-key={measured ? name : undefined} data-charge={measured ? charge : undefined}>{name} → {charge}</span>)}
  </span>
}

export function CollectionPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState<number>()
  const [guesses, setGuesses] = useState<Predictions>({})
  const [verification, setVerification] = useState<Verification>()
  const lesson = execution.collectionLesson
  if (!lesson) return null

  const cases = lesson.cases.slice(1)
  const sample = caseIndex === undefined ? undefined : cases[caseIndex]
  const options = sample?.predictions
  const recordGuess = guesses.records === undefined ? undefined : options?.records[guesses.records]
  const predicted = guesses.position !== undefined && guesses.named !== undefined && recordGuess !== undefined
  const actual = verification && !('failed' in verification) ? verification : undefined

  function compare(run: CollectionLessonRun) {
    return {
      position: run.positionValue === guesses.position,
      named: run.namedValue === guesses.named,
      records: recordGuess !== undefined && collectionRecordsMatch(run.records, recordGuess),
    }
  }

  const matches = actual && compare(actual)
  const matched = matches && matches.position && matches.named && matches.records

  function clearPredictions() {
    setGuesses({})
    setVerification(undefined)
  }

  function selectCase(index: number) {
    if (index === caseIndex) return
    setCaseIndex(index)
    clearPredictions()
  }

  function predict(field: FieldName, value: number) {
    if (guesses[field] === value) return
    setGuesses(previous => ({ ...previous, [field]: value }))
    setVerification(undefined)
  }

  function verify() {
    if (!sample || !predicted || actual) return
    const run = runCollectionLesson(execution.source, sample.batteries)
    setVerification(run ?? { failed: true })
    if (run && !completed.current && Object.values(compare(run)).every(Boolean)) {
      completed.current = true
      onComplete()
    }
  }

  const fields: {
    id: FieldName; question: string; choices: number[]; hint: string; expectedView?: ReactNode; actualView?: ReactNode;
  }[] = options ? [
    { id: 'position', choices: options.position, expectedView: guesses.position, actualView: actual?.positionValue,
      question: t(`按位置 ${lesson.index} 会读到几格？`, `What is the charge at index ${lesson.index}?`),
      hint: t(`从 0 开始数，找到位置 ${lesson.index}。`, `Count from 0 to find index ${lesson.index}.`) },
    { id: 'named', choices: options.named, expectedView: guesses.named, actualView: actual?.namedValue,
      question: t(`查找 ${lesson.key} 号电池会读到几格？`, `What is the charge of battery ${lesson.key}?`),
      hint: t(`找到贴着 ${lesson.key} 名牌的电池。`, `Find the battery labeled ${lesson.key}.`) },
    { id: 'records', choices: options.records.map((_, index) => index),
      expectedView: recordGuess && <RecordEntries records={recordGuess} />,
      actualView: actual && <RecordEntries records={actual.records} measured />,
      question: t('补电之后，各个名字对应多少电量？', 'What are the charges by name after charging?'),
      hint: t(`给 ${lesson.key} 号电池加 ${lesson.increment} 格，其他名字的记录保持原来的电量。`,
        `Add ${lesson.increment} to battery ${lesson.key}. Keep the other charges the same.`) },
  ] : []

  return <section className="panel collection-prediction" data-testid="collection-prediction" data-match={matched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换一排电池，先预测', 'Predict with a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一排电池', 'Choose a row of batteries')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button type="button" className="subtle-button" key={index}
            data-collection-case={index} aria-pressed={caseIndex === index} onClick={() => selectCase(index)}>{label[locale]}</button>)}
        </div>
      </fieldset>
      {sample && <>
        <CollectionBench state={{ batteries: sample.batteries, named: true, records: actual?.records, locale }} />
        <div className="for-prediction-input">
          <h3>{t('起始电量', 'Starting charges')}</h3>
          <ol className="for-prediction-batteries collection-prediction-batteries" aria-label={t('电池的起始电量', 'Starting battery charges')}>
            {sample.batteries.map(({ name, charge }, index) => <li key={name} data-battery-index={index} data-battery-name={name}>
              <span>{t(`位置 ${index}`, `Index ${index}`)}</span>
              <span>{t(`${name} 号`, name)}</span>
              <strong>{t(`${charge} 格`, `${charge} units`)}</strong>
            </li>)}
          </ol>
          <p>{t(`位置从 0 开始。给 ${lesson.key} 号电池补 ${lesson.increment} 格。`,
            `Positions start at 0. Add ${lesson.increment} units to battery ${lesson.key}.`)}</p>
        </div>
        <div className="for-prediction-fields collection-prediction-fields">
          {fields.map(({ id, question, choices, hint, expectedView, actualView }) => <fieldset key={id}
            className="for-prediction-field" data-collection-field={id} data-match={matches?.[id]}>
            <legend>{question}</legend>
            <div className="charge-prediction-choices charge-prediction-options">
              {choices.map((value, index) => <button type="button" className="subtle-button" key={value}
                ref={id === 'position' && index === 0 ? firstChoice : undefined}
                data-position-option={id === 'position' ? value : undefined}
                data-named-option={id === 'named' ? value : undefined}
                data-record-option={id === 'records' ? value : undefined}
                aria-pressed={guesses[id] === value} onClick={() => predict(id, value)}>
                {id === 'records' && options ? <RecordEntries records={options.records[value]} /> : value}
              </button>)}
            </div>
            {actual && <>
              <dl className="for-prediction-values">
                <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{expectedView}</dd></div>
                <div><dt>{t('实际结果', 'Actual result')}</dt><dd data-testid={`collection-actual-${id}`}>{actualView}</dd></div>
              </dl>
              {!matches?.[id] && <p className="for-prediction-hint">{hint}</p>}
            </>}
          </fieldset>)}
        </div>
      </>}
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || !predicted || !!actual}>{t('运行验证', 'Run to check')}</button>
      {verification && 'failed' in verification && <p role="alert" className="error-message">
        {t('这次没有得到完整结果。再运行一次试试。', 'The program did not give a complete result. Try running it again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('三项预测都对了！', 'All three predictions are correct!')
          : t('对照实际结果，再试一次。', 'Compare your predictions with the actual results and try again.')}</p>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
