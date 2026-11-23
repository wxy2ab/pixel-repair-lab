import { BatteryMemory } from './BatteryMemory'
import { CodingDevice } from './CodingDevice'
import { Fragment, useId, useMemo, useRef, useState } from 'react'
import { runListPositionsLesson } from '../engine/programListPositions'
import type { CollectionBattery, ListPositionCase, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './for-lesson.css'
import './list-positions-lesson.css'

type Run = NonNullable<ReturnType<typeof runListPositionsLesson>>
type Step = Run['steps'][number]
type Translate = (zh: string, en: string) => string

function describe(step: Step | undefined, sample: ListPositionCase, t: Translate) {
  switch (step?.kind) {
    case 'read':
      return t(`位置 ${sample.readIndex} 上是 ${step.battery} 号电池。按位置读过以后，电池仍在原位。`,
        `Battery ${step.battery} is at index ${sample.readIndex}. Reading it leaves it in the row.`)
    case 'insert':
      return t(`${step.battery} 号插入位置 ${sample.insertIndex}。它后面的电池向后移了一格。`,
        `Battery ${step.battery} goes into index ${sample.insertIndex}. Batteries after it move back one slot.`)
    case 'remove':
      return t(`${step.battery} 号从位置 ${sample.removeIndex} 移走了。它后面的电池向前移了一格。`,
        `Battery ${step.battery} is removed from index ${sample.removeIndex}. The batteries after it move forward one slot.`)
    case 'select':
      return t(`现在位置 ${sample.pickIndex} 上是 ${step.battery} 号电池。`, `Index ${sample.pickIndex} now gives battery ${step.battery}.`)
    case 'output':
      return t('程序显示按新位置找到的电池。换一排电池，先猜它们的新顺序，再猜指定位置会取到哪块。',
        'The program shows which battery is at the new position. Try a new row and predict its order and the battery at the requested index.')
    default:
      return undefined
  }
}

function actionPrompt(stage: Step['kind'] | 'start', sample: ListPositionCase, t: Translate) {
  switch (stage) {
    case 'start':
    case 'load':
      return t(`从左边的 0 开始数，点位置 ${sample.readIndex} 上的电池。`,
        `Start counting at 0 on the left. Select the battery at index ${sample.readIndex}.`)
    case 'read':
      return t(`点位置 ${sample.insertIndex} 的加号，把 ${sample.spare.name} 号插进去。`,
        `Choose the plus at index ${sample.insertIndex} to insert battery ${sample.spare.name}.`)
    case 'insert':
      return t(`点位置 ${sample.removeIndex} 上的电池，把它移走。`, `Select the battery at index ${sample.removeIndex} to remove it.`)
    case 'remove':
      return t(`用新的编号再数一次，点位置 ${sample.pickIndex} 上的电池。`,
        `Count using the new indexes. Select the battery at index ${sample.pickIndex}.`)
    default:
      return undefined
  }
}

function InsertionPoint({ index, onInsert, t }: { index: number; onInsert: (index: number) => void; t: Translate }) {
  return <li className="list-position-gap">
    <button type="button" className="subtle-button" data-insert-index={index}
      aria-label={t(`插入位置 ${index}`, `Insert at index ${index}`)} onClick={() => onInsert(index)}>
      <span aria-hidden="true">+</span><small>{index}</small>
    </button>
  </li>
}

function BatteryRow({ order, sample, previousOrder, active, onPick, onInsert, promptId, t }: {
  order: string[]; sample: ListPositionCase; previousOrder?: string[]; active?: string;
  onPick?: (index: number) => void; onInsert?: (index: number) => void; promptId: string; t: Translate;
}) {
  const batteryByName = new Map([sample.spare, ...sample.batteries].map(battery => [battery.name, battery]))
  return <div className="list-position-board">
    {onInsert && <p className="list-position-spare">
      {t('待插入', 'Ready to insert')} <b>{sample.spare.name}</b>
      <span className="for-battery" aria-label={t(`${sample.spare.charge} 格`, `${sample.spare.charge} units`)}>{sample.spare.charge}</span>
    </p>}
    <div className="list-position-scroll">
      <ol className="list-position-batteries" data-testid="list-position-batteries" aria-label={t('维修台上的一排电池', 'Batteries on the repair bench')}>
        {order.map((name, index) => {
          const battery = batteryByName.get(name)
          if (!battery) return null
          const previousIndex = previousOrder?.indexOf(name) ?? -1
          const moved = previousIndex >= 0 && previousIndex !== index
          const card = <BatteryCard battery={battery} index={index} previousIndex={moved ? previousIndex : undefined} t={t} />
          return <Fragment key={name}>
            {onInsert && <InsertionPoint index={index} onInsert={onInsert} t={t} />}
            <li className="list-position-slot" data-battery-name={name} data-battery-index={index} data-charge={battery.charge}
              data-active={active === name || undefined} data-shift={moved ? (index > previousIndex ? 'back' : 'forward') : undefined}
              data-previous-index={moved ? previousIndex : undefined}>
              {onPick ? <button type="button" className="subtle-button list-position-battery" aria-describedby={promptId}
                onClick={() => onPick(index)}>{card}</button>
                : <div className="list-position-battery">{card}</div>}
            </li>
          </Fragment>
        })}
        {onInsert && <InsertionPoint index={order.length} onInsert={onInsert} t={t} />}
      </ol>
    </div>
  </div>
}

function BatteryCard({ battery, index, previousIndex, t }: { battery: CollectionBattery; index: number; previousIndex?: number; t: Translate }) {
  return <>
    <span className="list-position-number">{t(`位置 ${index}`, `Index ${index}`)}</span>
    <strong>{battery.name}</strong>
    <span className="for-battery" aria-label={t(`${battery.charge} 格`, `${battery.charge} units`)}>{battery.charge}</span>
    {previousIndex !== undefined && <span className="list-position-shift"
      aria-label={t(`位置 ${previousIndex} 变成 ${index}`, `Index ${previousIndex} changed to ${index}`)}>{previousIndex} → {index}</span>}
  </>
}

export function ListPositionsLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const promptId = useId()
  const [position, setPosition] = useState(-1)
  const [mistake, setMistake] = useState(false)
  const ready = useRef(false)
  const sample = execution.listPositions?.cases[0]
  const run = useMemo(() => sample && runListPositionsLesson(execution, sample), [execution, sample])
  if (!sample) return null

  const { readIndex, insertIndex, removeIndex, pickIndex } = sample
  const step = run?.steps[position]
  const stage = step?.kind ?? 'start'
  const editing = stage === 'insert' || stage === 'remove'
  const order = step?.order ?? sample.batteries.map(battery => battery.name)
  const previousOrder = editing ? run?.steps[position - 1]?.order : undefined
  const title = t('在一排电池里找位置', 'Find positions in a row of batteries')
  const caption = describe(step, sample, t)
  const prompt = actionPrompt(stage, sample, t)
  const visibleCode = run?.steps.slice(0, position + 1) ?? []

  function goTo(next: number) {
    setMistake(false)
    setPosition(next)
    if (run?.steps[next]?.kind === 'output' && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  function choose(index: number, target: number, next: number) {
    if (index === target) goTo(next)
    else setMistake(true)
  }

  function pick(index: number) {
    if (stage === 'start' || stage === 'load') {
      const read = run?.steps.findIndex(candidate => candidate.kind === 'read') ?? -1
      if (read >= 0) choose(index, readIndex, read)
    } else if (stage === 'insert') {
      choose(index, removeIndex, position + 1)
    } else if (stage === 'remove') {
      choose(index, pickIndex, position + 1)
    }
  }

  const canPick = stage === 'start' || stage === 'load' || editing
  return <section className="classroom-demonstration panel list-positions-lesson" aria-label={title} data-testid="list-positions-lesson" data-list-stage={stage}>
    <CodingDevice device="sorter" locale={locale} workbench controls={<>
      {run ? <p className="list-position-description" role="status" id={promptId}>
        {caption && <span>{caption}</span>}
        {prompt && <span>{mistake && t('再试一次。', 'Try again. ')}{prompt}</span>}
      </p> : <p className="error-message" id={promptId} role="alert">{t('这次没能读出电池。', 'The program could not read the batteries.')}</p>}
      <BatteryRow order={order} sample={sample} previousOrder={previousOrder} active={step?.battery}
        onPick={run && canPick ? pick : undefined} onInsert={run && stage === 'read' ? index => choose(index, insertIndex, position + 1) : undefined}
        promptId={promptId} t={t} />
      {step && <div className="list-position-navigation">
        <button type="button" className="subtle-button" onClick={() => goTo(position <= 1 ? -1 : position - 1)}>{t('上一步', 'Previous step')}</button>
        {stage === 'select' && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>{t('下一步', 'Next step')}</button>}
      </div>}
    </>}>
      <div className="panel-heading"><h2>{title}</h2></div>
      <div className="list-position-content">
        <BatteryMemory kind="list" names={order} active={step?.battery} locale={locale} snapshot={step?.order}
          capacity={sample.batteries.length + 1} onPick={run && canPick ? name => pick(order.indexOf(name)) : undefined}
          onInsert={run && stage === 'read' ? index => choose(index, insertIndex, position + 1) : undefined}
          title={t('当前位置', 'Current positions')} />
        {step?.battery && stage !== 'output' && <dl className="for-values">
          <div data-active>
            <dt>{step.kind === 'remove' ? t('移走的电池', 'Battery removed')
              : step.kind === 'insert' ? t('插入的电池', 'Battery inserted') : t('取到的电池', 'Battery found')}</dt>
            <dd data-testid="list-positions-battery">{step.battery}</dd>
          </div>
        </dl>}
        {stage === 'output' && <dl className="for-values"><div data-active>
          <dt>{t('屏幕输出', 'Program output')}</dt><dd><output data-testid="list-positions-output">{run?.output}</output></dd>
        </div></dl>}
        {visibleCode.length > 0 && <ol className="for-source" data-testid="list-positions-code" aria-label={t('Python 代码', 'Python code')}>
          {visibleCode.map(({ line, code }) => <li key={line} data-line={line} aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{code}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
