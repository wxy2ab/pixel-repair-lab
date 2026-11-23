import { useId, useRef, useState } from 'react'
import { runListPositionsLesson } from '../engine/programListPositions'
import { valuesEqual } from '../engine/values'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { StructureRack } from './BatteryMemory'
import { StructureTrace } from './StructureTrace'
import './charge-prediction.css'
import './for-prediction.css'
import './list-positions-prediction.css'

export function ListPositionsPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const title = useId()
  const firstOrder = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [caseIndex, setCaseIndex] = useState(0)
  const [orderIndex, setOrderIndex] = useState<number>()
  const [picked, setPicked] = useState<string>()
  const [verification, setVerification] = useState<ReturnType<typeof runListPositionsLesson> | null>()
  const cases = execution.listPositions?.cases.slice(1)
  const sample = cases?.[caseIndex]
  if (!cases || !sample?.predictions) return null

  const options = sample.predictions
  const order = orderIndex === undefined ? undefined : options.orders[orderIndex]
  const orderMatches = verification && order ? valuesEqual(verification.order, order) : undefined
  const pickedMatches = verification ? verification.picked === picked : undefined
  const matched = verification ? orderMatches === true && pickedMatches === true : undefined

  function clearPredictions() {
    setOrderIndex(undefined)
    setPicked(undefined)
    setVerification(undefined)
  }

  function verify() {
    if (!sample || !order || picked === undefined || verification) return
    const run = runListPositionsLesson(execution, sample)
    setVerification(run ?? null)
    if (run && !completed.current && run.picked === picked && valuesEqual(run.order, order)) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel list-positions-prediction" data-testid="list-positions-prediction"
    data-match={matched} aria-labelledby={title}>
    <div className="panel-heading"><h2 id={title}>{t('换一排电池，先预测', 'Predict for a new row of batteries')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('选一排电池', 'Choose a battery row')}</legend>
        <div className="charge-prediction-choices">
          {cases.map(({ label }, index) => <button key={index} type="button" className="subtle-button"
            data-list-case={index} aria-pressed={caseIndex === index} onClick={() => {
              if (caseIndex !== index) {
                setCaseIndex(index)
                clearPredictions()
              }
            }}>{label[locale]}</button>)}
        </div>
      </fieldset>
      <div className="for-prediction-input list-prediction-start">
        <StructureTrace frames={verification?.steps} locale={locale}>{step => <StructureRack kind="list" locale={locale}
          names={step?.order ?? sample.batteries.map(item => item.name)} capacity={sample.batteries.length + 1} active={step?.battery ?? picked}
          onPick={verification ? undefined : name => { if (options.picked.includes(name)) setPicked(name) }} />}</StructureTrace>
        <h3>{t('起始顺序', 'Starting order')}</h3>
        <ol className="for-prediction-batteries" aria-label={t('从位置 0 开始的电池', 'Batteries starting at index 0')}>
          {sample.batteries.map(({ name, charge }, index) => <li key={name} data-battery-name={name} data-battery-index={index} data-charge={charge}>
            <small>{t(`位置 ${index}`, `Index ${index}`)}</small>
            <strong>{name}</strong>
            <small>{t(`${charge} 格`, `${charge} units`)}</small>
          </li>)}
        </ol>
        <ol className="list-prediction-plan" aria-label={t('程序将执行的步骤', 'Steps the program will run')}>
          <li>{t(`读一下位置 ${sample.readIndex}，电池留在原位。`, `Read index ${sample.readIndex}. The battery stays in place.`)}</li>
          <li>{t(`把备用电池 ${sample.spare.name}（${sample.spare.charge} 格）插到位置 ${sample.insertIndex}。`,
            `Insert spare battery ${sample.spare.name} (${sample.spare.charge} units) at index ${sample.insertIndex}.`)}</li>
          <li>{t(`从插入后的列表移走位置 ${sample.removeIndex} 的电池。`, `Remove the battery at index ${sample.removeIndex} after inserting.`)}</li>
          <li>{t(`最后读取位置 ${sample.pickIndex}。`, `Finally, read index ${sample.pickIndex}.`)}</li>
        </ol>
      </div>
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field" data-match={orderMatches}>
          <legend>{t('操作后，电池从左到右怎么排？', 'What is the order after the changes?')}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {options.orders.map((names, index) => <button key={index} type="button" className="subtle-button"
              ref={index === 0 ? firstOrder : undefined} data-order-option={index} aria-pressed={orderIndex === index} onClick={() => {
                if (orderIndex !== index) {
                  setOrderIndex(index)
                  setVerification(undefined)
                }
              }}>{names.join(' → ')}</button>)}
          </div>
          {verification && <>
            <dl className="for-prediction-values">
              <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{JSON.stringify(order)}</dd></div>
              <div><dt>{t('实际顺序', 'Actual order')}</dt><dd data-testid="list-actual-order">{JSON.stringify(verification.order)}</dd></div>
            </dl>
            {!orderMatches && <p className="for-prediction-hint">{t('先重新排好插入后的电池，再按新的位置移走一块。',
              'Put the inserted battery in place first. Then remove a battery using the new positions.')}</p>}
          </>}
        </fieldset>
        <fieldset className="for-prediction-field" data-match={pickedMatches}>
          <legend>{t(`最后从位置 ${sample.pickIndex} 取到哪块？`, `Which battery ends up at index ${sample.pickIndex}?`)}</legend>
          <div className="charge-prediction-choices charge-prediction-options">
            {options.picked.map(name => <button key={name} type="button" className="subtle-button"
              data-picked-option={name} aria-pressed={picked === name} onClick={() => {
                if (picked !== name) {
                  setPicked(name)
                  setVerification(undefined)
                }
              }}>{name}</button>)}
          </div>
          {verification && <>
            <dl className="for-prediction-values">
              <div><dt>{t('你的预测', 'Your prediction')}</dt><dd>{picked}</dd></div>
              <div><dt>{t('实际取到', 'Battery picked')}</dt><dd data-testid="list-actual-picked">{verification.picked}</dd></div>
            </dl>
            {!pickedMatches && <p className="for-prediction-hint">{t('在操作后的列表里从 0 数起，再读一次指定位置。',
              'Count from 0 in the final row and check the requested index again.')}</p>}
          </>}
        </fieldset>
      </div>
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!order || picked === undefined || !!verification}>{t('运行验证', 'Run to check')}</button>
      {verification === null && <p className="error-message" role="alert">
        {t('程序这次没有给出完整结果，可以再运行一次。', 'The program did not return a complete result. You can run it again.')}
      </p>}
      {verification && <div className="charge-prediction-verification" data-match={matched}>
        <p role="status">{matched ? t('顺序和电池都猜对了！', 'You predicted the order and the battery correctly!')
          : t('对照实际结果，再猜一次。', 'Compare your predictions with the actual results and try again.')}</p>
        {!matched && <button type="button" className="subtle-button" onClick={() => {
          clearPredictions()
          firstOrder.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
