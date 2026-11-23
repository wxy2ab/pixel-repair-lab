import { BatteryMemory } from './BatteryMemory'
import { CodingDevice } from './CodingDevice'
import { useId, useMemo, useRef, useState } from 'react'
import { runDictionaryLesson } from '../engine/programDictionaryLesson'
import type { DictionaryLessonCase, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './collection-lesson.css'
import './dictionary-lesson.css'

type Step = NonNullable<ReturnType<typeof runDictionaryLesson>>['steps'][number]
type Stage = Step['kind'] | 'start'
type Translate = (zh: string, en: string) => string

function describe(step: Step | undefined, sample: DictionaryLessonCase, t: Translate) {
  switch (step?.kind) {
    case 'lookup':
      return t(`用 ${sample.key} 号的名字查到 ${step.value} 格电。`,
        `Look up battery ${sample.key} by name to find ${step.value} units of charge.`)
    case 'register':
      return t(`${sample.arrival.name} 号第一次登记。新的一行把它的名字和电量配在一起。`,
        `Battery ${sample.arrival.name} is new. A new row pairs its name with its charge.`)
    case 'calculate':
      return t(`算出了 ${sample.key} 号补电后的电量。登记表还保留着原来的值。`,
        `The program calculates the new charge for ${sample.key}. The table still holds its original value.`)
    case 'update':
      return t(`把 ${step.value} 格写回 ${sample.key} 号的原记录。键还是 ${sample.key}，这一行的值变了。`,
        `Save ${step.value} units to the existing record for ${sample.key}. Its key stays the same and its value changes.`)
    case 'output':
      return t('程序显示更新后的字典。换一组电池，先预测会查到的电量和留下的记录。',
        'The program shows the updated dictionary. For a new batch, predict the lookup result and the final records.')
    default:
      return t('电池名字是键，电量是值。每个名字对应一条记录。',
        'The battery name is the key, and its charge is the value. Each name has one record.')
  }
}

function nextAction(stage: Stage, sample: DictionaryLessonCase, t: Translate) {
  switch (stage) {
    case 'start':
    case 'load':
      return t(`点 ${sample.key} 号的名字查电量。`, `Select battery ${sample.key} by name to look up its charge.`)
    case 'lookup':
      return t(`点新来的 ${sample.arrival.name} 号电池，把它登记进字典。`,
        `Select the new battery ${sample.arrival.name} to register it in the dictionary.`)
    case 'register':
      return t(`点 ${sample.key} 号的键，给它补 ${sample.increment} 格电。`,
        `Select the key for battery ${sample.key} to add ${sample.increment} units of charge.`)
    case 'calculate':
      return t('点「下一步」，把新电量写回原记录。', 'Select Next step to save the new charge in the existing record.')
    default:
      return undefined
  }
}

function BatteryRecords({ records, active, added, updated, onChoose, promptId, t }: {
  records: Record<string, number>; active?: string; added?: string; updated?: string;
  onChoose?: (name: string) => void; promptId: string; t: Translate;
}) {
  return <table className="dictionary-lesson-records" data-testid="dictionary-records"
    aria-label={t('电池登记表', 'Battery records')}>
    <thead><tr><th scope="col">{t('键（电池名）', 'Key (battery name)')}</th>
      <th scope="col">{t('值（电量）', 'Value (charge)')}</th></tr></thead>
    <tbody>
      {Object.entries(records).map(([name, charge]) => <tr key={name} data-record-key={name} data-charge={charge}
        data-active={name === active || undefined} data-added={name === added || undefined} data-updated={name === updated || undefined}>
        <th scope="row">
          {onChoose ? <button type="button" className="subtle-button dictionary-lesson-key"
            aria-describedby={promptId} onClick={() => onChoose(name)}><code>{JSON.stringify(name)}</code></button>
            : <code className="dictionary-lesson-key">{JSON.stringify(name)}</code>}
        </th>
        <td><strong>{charge}</strong> <small>{t('格', 'units')}</small></td>
      </tr>)}
    </tbody>
  </table>
}

export function DictionaryLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const promptId = useId()
  const [position, setPosition] = useState(-1)
  const [mistake, setMistake] = useState(false)
  const ready = useRef(false)
  const sample = execution.dictionaryLesson?.cases[0]
  const run = useMemo(() => sample && runDictionaryLesson(execution, sample), [execution, sample])
  if (!sample) return null

  const step = run?.steps[position]
  const stage = step?.kind ?? 'start'
  const records = step?.records ?? Object.fromEntries(sample.batteries.map(({ name, charge }) => [name, charge]))
  const visible = run?.steps.slice(0, position + 1) ?? []
  const lookupPosition = run?.steps.findIndex(frame => frame.kind === 'lookup') ?? -1
  const reading = visible.find(frame => frame.kind === 'lookup')?.value
  const calculation = visible.find(frame => frame.kind === 'calculate')?.value
  const canChooseKey = stage === 'start' || stage === 'load' || stage === 'register'
  const caption = describe(step, sample, t)
  const prompt = nextAction(stage, sample, t)
  const active = stage === 'register' ? sample.arrival.name
    : stage === 'lookup' || stage === 'calculate' || stage === 'update' ? sample.key : undefined
  const title = t('给维修站的电池记电量', 'Record the repair station’s battery charges')

  function goTo(index: number) {
    setPosition(index)
    setMistake(false)
    if (run?.steps[index]?.kind === 'output' && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  function selectKey(name: string) {
    if (name !== sample?.key) {
      setMistake(true)
      return
    }
    goTo(stage === 'register' ? position + 1 : lookupPosition)
  }

  return <section className="classroom-demonstration panel dictionary-lesson" aria-label={title} data-testid="dictionary-lesson" data-dictionary-stage={stage}>
    <CodingDevice device="sorter" locale={locale} workbench controls={<>
      {run ? <p className="dictionary-lesson-status" role="status" id={promptId}>
        <span>{caption}</span>
        {prompt && <span>{mistake && t('再看一次电池的名字。', 'Check the battery name again. ')}{prompt}</span>}
      </p> : <p className="error-message" id={promptId} role="alert">
        {t('现在无法运行电池登记程序。', 'The battery record program could not run.')}
      </p>}
      <div className="dictionary-lesson-bench">
        <BatteryRecords records={records} active={active} added={stage === 'register' ? active : undefined}
          updated={stage === 'update' ? active : undefined} onChoose={run && canChooseKey ? selectKey : undefined} promptId={promptId} t={t} />
        {stage === 'lookup' && <button type="button" className="subtle-button dictionary-lesson-arrival" data-testid="dictionary-arrival"
          aria-describedby={promptId} onClick={() => goTo(position + 1)}>
          <span>{t('登记新电池', 'Register the new battery')}</span>
          <strong>{sample.arrival.name}</strong><span className="collection-battery" aria-label={t(`${sample.arrival.charge} 格`,
            `${sample.arrival.charge} units`)}>{sample.arrival.charge}</span>
        </button>}
      </div>
      {step && <div className="collection-navigation">
        <button type="button" className="subtle-button" onClick={() => goTo(position <= lookupPosition ? -1 : position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        {(stage === 'calculate' || stage === 'update') && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>}
      </div>}
    </>}>
      <div className="panel-heading"><h2>{title}</h2></div>
      <div className="dictionary-lesson-content">
        <BatteryMemory kind="dictionary" names={Object.keys(records)} values={records} active={active} locale={locale} snapshot={step?.records}
          capacity={sample.batteries.length + 1} arrival={stage === 'lookup' ? sample.arrival : undefined}
          onPick={!run ? undefined : stage === 'lookup' ? name => {
            if (name === sample.arrival.name) goTo(position + 1)
          } : canChooseKey ? selectKey : undefined}
          title={t('登记的电量', 'Registered charges')} />
        {reading !== undefined && <dl className="collection-values dictionary-lesson-values">
          <div data-active={stage === 'lookup' || undefined}>
            <dt>{t(`查到的 ${sample.key} 号电量`, `Charge read for ${sample.key}`)}</dt>
            <dd data-testid="dictionary-reading">{reading}</dd>
          </div>
          {calculation !== undefined && <div data-active={stage === 'calculate' || stage === 'update' || undefined}>
            <dt>{t(`补电后 ${sample.key} 号的新电量`, `New charge for ${sample.key}`)}</dt>
            <dd><span>{reading} + {sample.increment} = </span><strong data-testid="dictionary-calculation-result">{calculation}</strong></dd>
          </div>}
        </dl>}
        {stage === 'output' && <dl className="collection-values dictionary-lesson-values">
          <div data-active>
            <dt>{t('屏幕输出', 'Program output')}</dt>
            <dd><output data-testid="dictionary-output">{run?.output}</output></dd>
          </div>
        </dl>}
        {visible.length > 0 && <ol className="collection-code" data-testid="dictionary-lesson-code" aria-label={t('Python 代码', 'Python code')}>
          {visible.map(({ line, code }) => <li key={line} data-line={line} aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{code}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
