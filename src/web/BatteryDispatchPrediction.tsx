import { useId, useRef, useState } from 'react'
import { runBatteryDispatchTrial } from '../engine/batteryDispatch'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import { dispatchOrdersMatch, readDispatchCase } from '../shared/batteryDispatch'
import { collectionRecordsMatch } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { DispatchCaseInstructions } from './BatteryDispatchTrial'
import { DispatchInstrument } from './DispatchInstrument'
import { StructureTrace } from './StructureTrace'
import { runIssueText, tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './collection-prediction.css'

type DispatchPrediction = NonNullable<AlgorithmLevel['batteryDispatch']>['predictions'][number]

function RecordEntries({ records, measured = false }: { records: Record<string, number>; measured?: boolean }) {
  return <span className="collection-prediction-entries">
    {Object.entries(records).map(([name, charge]) => <span key={name}
      data-record-key={measured ? name : undefined} data-charge={measured ? charge : undefined}>{name} → {charge}</span>)}
  </span>
}

function BatteryDispatchPredictionCase({ level, source, prediction, locale, personal, course, batch, total, onNext, onComplete, onMistake }: {
  level: AlgorithmLevel; source: string; prediction: DispatchPrediction; locale: Locale; batch: number; total: number;
  personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onNext: () => void; onComplete: () => void; onMistake?: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const headingId = useId()
  const firstOrder = useRef<HTMLButtonElement>(null)
  const [orderIndex, setOrderIndex] = useState<number>()
  const [recordIndex, setRecordIndex] = useState<number>()
  const [verification, setVerification] = useState<ReturnType<typeof runBatteryDispatchTrial>>()
  const sample = readDispatchCase(level.cases[prediction.caseIndex])
  const guessedOrder = orderIndex === undefined ? undefined : prediction.orders[orderIndex]
  const guessedRecords = recordIndex === undefined ? undefined : prediction.records[recordIndex]
  const actual = verification?.result
  const orderMatches = actual && guessedOrder ? dispatchOrdersMatch(actual.order, guessedOrder) : undefined
  const recordsMatch = actual && guessedRecords ? collectionRecordsMatch(actual.records, guessedRecords) : undefined
  const checked = verification?.passed === true && actual !== undefined
  const matched = checked ? orderMatches === true && recordsMatch === true : undefined
  const lastBatch = batch === total - 1

  function verify() {
    if (!sample || !guessedOrder || !guessedRecords || checked) return
    const run = runBatteryDispatchTrial(level, source, prediction.caseIndex, personal, course)
    setVerification(run)
    if (!run.passed || !run.result) return
    const { order, records } = run.result
    if (dispatchOrdersMatch(order, guessedOrder) && collectionRecordsMatch(records, guessedRecords)) {
      if (lastBatch) onComplete()
    } else {
      onMistake?.()
    }
  }

  return <section className="panel collection-prediction" data-testid="dispatch-prediction" data-match={matched} aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('换一批电池，先预测', 'Predict with a new batch of batteries')}</h2></div>
    <div className="charge-prediction-body">
      {total > 1 && <p>{t(`第 ${batch + 1} 批，共 ${total} 批`, `Batch ${batch + 1} of ${total}`)}</p>}
      {sample && <StructureTrace frames={verification?.steps} locale={locale}>{(_step, index) =>
        <DispatchInstrument batch={sample} steps={verification?.steps} index={index} locale={locale} />}</StructureTrace>}
      {sample ? <div data-testid="dispatch-prediction-ticket"><DispatchCaseInstructions sample={sample} locale={locale} /></div>
        : <p className="error-message" role="alert">{t('这批电池的工单无法读取。', 'This batch’s work order could not be read.')}</p>}
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field" data-dispatch-field="order" data-match={orderMatches} disabled={matched}>
          <legend>{t('电池会按什么顺序取出？', 'In what order will the batteries be picked up?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {prediction.orders.map((order, index) => <button type="button" className="subtle-button" key={index}
              ref={index === 0 ? firstOrder : undefined} data-order-option={index} aria-pressed={orderIndex === index}
              onClick={() => {
                if (orderIndex !== index) {
                  setOrderIndex(index)
                  setVerification(undefined)
                }
              }}>{order.join(' → ')}</button>)}
          </div>
          {actual && <dl className="for-prediction-values">
            <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{guessedOrder?.join(' → ')}</dd></div>
            <div><dt>{t('实际取出顺序', 'Actual pickup order')}</dt><dd data-testid="dispatch-actual-order">{actual.order.join(' → ')}</dd></div>
          </dl>}
          {actual && !orderMatches && <p className="for-prediction-hint">{t('每遇到一次取件，就看看暂放区最上面是哪块电池。',
            'At each pickup, check which battery is on top of the stack.')}</p>}
        </fieldset>
        <fieldset className="for-prediction-field" data-dispatch-field="records" data-match={recordsMatch} disabled={matched}>
          <legend>{t('最后会留下哪些电量记录？', 'What charge records will be saved at the end?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {prediction.records.map((records, index) => <button type="button" className="subtle-button" key={index}
              data-record-option={index} aria-pressed={recordIndex === index}
              onClick={() => {
                if (recordIndex !== index) {
                  setRecordIndex(index)
                  setVerification(undefined)
                }
              }}><RecordEntries records={records} /></button>)}
          </div>
          {actual && <dl className="for-prediction-values">
            <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{guessedRecords && <RecordEntries records={guessedRecords} />}</dd></div>
            <div><dt>{t('实际电量记录', 'Actual charge records')}</dt><dd data-testid="dispatch-actual-records"><RecordEntries records={actual.records} measured /></dd></div>
          </dl>}
          {actual && !recordsMatch && <p className="for-prediction-hint">{t('取到哪块电池，就把补完电的数值写在它的名字下面。',
            'At each pickup, save the charged value under that battery’s own name.')}</p>}
        </fieldset>
      </div>
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!sample || !guessedOrder || !guessedRecords || checked}>{t('运行验证', 'Run to check')}</button>
      {verification && !checked && <p className="error-message" role="alert">
        {verification.issue ? runIssueText(locale, verification.issue)
          : t('程序给出的结果与工单不符。回到试跑，看看电池从哪里取出、记录写在哪里。',
            'The program’s result did not match the work order. Revisit the trial to see where batteries come from and where charges are saved.')}
      </p>}
      {matched !== undefined && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('取出顺序和最后的电量记录都预测对了！', 'You predicted both the pickup order and the final charge records!')
          : t('对照程序跑出的结果，再试一次。', 'Compare your predictions with the program’s results and try again.')}</p>
        {matched && !lastBatch && <button type="button" className="primary-button" onClick={onNext}>
          {t('预测下一批', 'Predict the next batch')}
        </button>}
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          setOrderIndex(undefined)
          setRecordIndex(undefined)
          setVerification(undefined)
          firstOrder.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}

export function BatteryDispatchPrediction({ level, source, locale, personal, course, onComplete, onMistake }: {
  level: AlgorithmLevel; source: string; locale: Locale; onComplete: () => void; onMistake?: () => void;
  personal: PersonalAlgorithms; course: PersonalAlgorithms;
}) {
  const [batch, setBatch] = useState(0)
  const predictions = level.batteryDispatch?.predictions
  const prediction = predictions?.[batch]
  if (!prediction || !predictions) return null

  return <BatteryDispatchPredictionCase key={prediction.caseIndex} level={level} source={source} prediction={prediction}
    locale={locale} personal={personal} course={course} batch={batch} total={predictions.length} onNext={() => setBatch(current => current + 1)}
    onComplete={onComplete} onMistake={onMistake} />
}
