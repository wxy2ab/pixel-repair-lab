import { useId, useRef, useState } from 'react'
import { runDictionaryLesson } from '../engine/programDictionaryLesson'
import { collectionRecordsMatch, type ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { StructureRack } from './BatteryMemory'
import { StructureTrace } from './StructureTrace'
import './charge-prediction.css'
import './for-prediction.css'
import './collection-prediction.css'
import './dictionary-prediction.css'

type Verification = ReturnType<typeof runDictionaryLesson> | null

function Entries({ records, measured = false }: { records: Record<string, number>; measured?: boolean }) {
  return <span className="collection-prediction-entries">
    {Object.entries(records).map(([key, charge]) => <span key={key}
      data-record-key={measured ? key : undefined} data-charge={measured ? charge : undefined}>{key} → {charge}</span>)}
  </span>
}

export function DictionaryPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstReading = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState(0)
  const [readingGuess, setReadingGuess] = useState<number>()
  const [recordIndex, setRecordIndex] = useState<number>()
  const [actual, setActual] = useState<Verification>()
  const cases = execution.dictionaryLesson?.cases.slice(1)
  const sample = cases?.[caseIndex]
  if (!cases || !sample?.predictions) return null

  const options = sample.predictions
  const recordGuess = recordIndex === undefined ? undefined : options.records[recordIndex]
  const readingMatch = actual ? actual.reading === readingGuess : undefined
  const recordMatch = actual && recordGuess ? collectionRecordsMatch(actual.records, recordGuess) : undefined
  const matched = actual ? readingMatch && recordMatch : undefined
  const { key, arrival, increment } = sample

  function clearPredictions() {
    setReadingGuess(undefined)
    setRecordIndex(undefined)
    setActual(undefined)
  }

  function verify() {
    if (!sample || readingGuess === undefined || !recordGuess || actual) return
    const run = runDictionaryLesson(execution, sample)
    setActual(run ?? null)
    if (run && run.reading === readingGuess && collectionRecordsMatch(run.records, recordGuess) && !completed.current) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel collection-prediction dictionary-prediction" data-testid="dictionary-prediction"
    data-match={matched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换一组电池，先预测', 'Predict with a new set of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一组电池', 'Choose a set of batteries')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button type="button" className="subtle-button" key={index}
            data-dictionary-case={index} aria-pressed={caseIndex === index} onClick={() => {
              if (caseIndex !== index) {
                setCaseIndex(index)
                clearPredictions()
              }
            }}>{label[locale]}</button>)}
        </div>
      </fieldset>
      <div className="for-prediction-input">
        <StructureTrace frames={actual?.steps} locale={locale}>{step => {
          const records = step?.records ?? Object.fromEntries(sample.batteries.map(battery => [battery.name, battery.charge]))
          return <StructureRack kind="dictionary" locale={locale} names={Object.keys(records)} values={records}
            capacity={sample.batteries.length + 1} active={step?.key} arrival={Object.hasOwn(records, arrival.name) ? undefined : arrival} />
        }}</StructureTrace>
        <h3>{t('起始记录', 'Starting records')}</h3>
        <table className="dictionary-prediction-table" aria-label={t('起始记录', 'Starting records')}>
          <thead><tr>
            <th scope="col">{t('键（名字）', 'Key (name)')}</th>
            <th scope="col">{t('值（电量）', 'Value (charge)')}</th>
          </tr></thead>
          <tbody>{sample.batteries.map(({ name, charge }) => <tr key={name}>
            <th scope="row">{name}</th><td>{charge}</td>
          </tr>)}</tbody>
        </table>
        <ol className="dictionary-prediction-steps" aria-label={t('操作顺序', 'Order of operations')}>
          <li>{t(`先查询 ${key} 号电池的电量。`, `Look up the starting charge of battery ${key}.`)}</li>
          <li>{t(`登记新电池 ${arrival.name} 号，电量是 ${arrival.charge} 格。`, `Register new battery ${arrival.name} with a charge of ${arrival.charge}.`)}</li>
          <li>{t(`给 ${key} 号电池补 ${increment} 格，再更新它的记录。`, `Add ${increment} to battery ${key} and update its record.`)}</li>
        </ol>
      </div>
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field" data-dictionary-field="reading" data-match={readingMatch}>
          <legend>{t(`一开始查到 ${key} 号有几格电？`, `What charge does the first lookup find for battery ${key}?`)}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {options.readings.map((value, index) => <button type="button" className="subtle-button" key={value}
              ref={index === 0 ? firstReading : undefined} data-reading-option={value} aria-pressed={readingGuess === value}
              onClick={() => {
                if (readingGuess === value) return
                setReadingGuess(value)
                setActual(undefined)
              }}>{value}</button>)}
          </div>
          {actual && <>
            <dl className="for-prediction-values">
              <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{readingGuess}</dd></div>
              <div><dt>{t('实际读数', 'Actual reading')}</dt><dd data-testid="dictionary-actual-reading">{actual.reading}</dd></div>
            </dl>
            {!readingMatch && <p className="for-prediction-hint">{t(`先看 ${key} 号在起始记录里的电量。`, `Find ${key} in the starting records to read its charge.`)}</p>}
          </>}
        </fieldset>
        <fieldset className="for-prediction-field" data-dictionary-field="records" data-match={recordMatch}>
          <legend>{t('最后留下哪些电量记录？', 'Which charge records are in the dictionary at the end?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {options.records.map((records, index) => <button type="button" className="subtle-button" key={index}
              data-record-option={index} aria-pressed={recordIndex === index} onClick={() => {
                if (recordIndex === index) return
                setRecordIndex(index)
                setActual(undefined)
              }}><Entries records={records} /></button>)}
          </div>
          {actual && <>
            <dl className="for-prediction-values">
              <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{recordGuess && <Entries records={recordGuess} />}</dd></div>
              <div><dt>{t('实际记录', 'Actual records')}</dt><dd data-testid="dictionary-actual-records"><Entries records={actual.records} measured /></dd></div>
            </dl>
            {!recordMatch && <p className="for-prediction-hint">{t(`先登记 ${arrival.name} 号，再只更新 ${key} 号的电量。`,
              `Add the record for ${arrival.name}, then change the charge for ${key}.`)}</p>}
          </>}
        </fieldset>
      </div>
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={readingGuess === undefined || !recordGuess || !!actual}>{t('运行验证', 'Run to check')}</button>
      {actual === null && <p role="alert" className="error-message">
        {t('这次没有得到完整结果。可以再运行一次。', 'The program did not return a complete result. You can run it again.')}
      </p>}
      {actual && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('读数和最后的记录都猜对了！', 'You predicted both the reading and the final records!')
          : t('对照实际结果，再试一次。', 'Compare your predictions with the actual results and try again.')}</p>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstReading.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
