import { CodingDevice } from './CodingDevice'
import { CollectionBench } from './ProgramFlowBenches'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { runCollectionLesson } from '../engine/programCollection'
import type { CollectionBattery, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './collection-lesson.css'

type Run = NonNullable<ReturnType<typeof runCollectionLesson>>
type Step = Run['steps'][number]
type Translate = (zh: string, en: string) => string

function describe(step: Step | undefined, run: Run, index: number, name: string, increment: number, t: Translate) {
  if (!step) return t('芽芽面前有一排电池。先看看怎样按位置取出一块电池的电量。',
    'Sprout has a row of batteries. Start by finding a battery’s charge by its position.')

  switch (step.kind) {
    case 'load-list':
      return t('程序按这一排的顺序把电量读进列表。Python 从 0 开始编号，所以第一块的索引是 0。',
        'The program reads the charges into a list in row order. Python numbers positions from 0, so the first battery has index 0.')
    case 'index':
      return t(`用索引 ${index} 取第 ${index + 1} 块电池的电量，得到 ${step.value} 格。`,
        `Index ${index} reads battery ${index + 1}. It has a charge of ${step.value}.`)
    case 'label':
      return t('给每块电池贴上名字，再把名字和电量配成一对，存进字典。每个名字是一个键，对应的电量是它的值。',
        'Give each battery a name, then store each name and charge together in a dictionary. The name is the key and the charge is its value.')
    case 'lookup':
      return t(`用名字 ${name} 作键，查到这块电池有 ${step.value} 格。电池挪到别的位置，也能用这个名字找到它的电量。`,
        `Use the name ${name} as the key to find its charge of ${step.value}. The same name works if the battery moves to a different position.`)
    case 'update':
      return t(`先算 ${run.namedValue} + ${increment}，再把 ${step.value} 格写回 ${name} 的记录。其他电池的记录保持原样。`,
        `First calculate ${run.namedValue} + ${increment}, then save ${step.value} back to the entry for ${name}. The other entries keep their values.`)
    case 'output':
      return t('屏幕显示补电后的字典。下面换一排电池，先预测会读到什么、字典会怎么更新，再运行验证。',
        'The screen shows the updated dictionary. Try a new row below. Predict what the program reads and records, then run it to check.')
  }
}

function BatteryRow({ batteries, step, index, name, t }: {
  batteries: CollectionBattery[]; step?: Step; index: number; name: string; t: Translate;
}) {
  return <ol className="collection-batteries" aria-label={t('一排电池的起始电量', 'Starting charges in row order')}>
    {batteries.map((battery, position) => {
      const active = step?.kind === 'index' && index === position
        || (step?.kind === 'lookup' || step?.kind === 'update') && battery.name === name
      return <li key={battery.name} data-battery-index={step ? position : undefined}
        data-battery-name={step?.records ? battery.name : undefined} data-active={active || undefined}
        aria-current={active ? 'step' : undefined}>
        {step?.records && <span className="collection-tag" aria-label={t(`电池 ${battery.name}`, `Battery ${battery.name}`)}>{battery.name}</span>}
        <strong className="collection-battery" aria-label={t(`${battery.charge} 格`, `Charge ${battery.charge}`)}>
          {step?.list[position] ?? battery.charge}
        </strong>
        {step && <span className="collection-index">{t('索引', 'Index')} <b>{position}</b></span>}
      </li>
    })}
  </ol>
}

function RecordRow({ records, active, updated, t }: {
  records: Record<string, number>; active?: string; updated?: string; t: Translate;
}) {
  return <div className="collection-record-panel">
    <h3>{t('字典里的电量记录', 'Charges in the dictionary')}</h3>
    <dl className="collection-records">
      {Object.entries(records).map(([name, charge]) => <div key={name} data-record-key={name} data-charge={charge}
        data-active={name === active || undefined} data-updated={name === updated || undefined}>
        <dt><code>{JSON.stringify(name)}</code></dt>
        <dd><span aria-hidden="true">→</span> <strong>{charge}</strong></dd>
      </div>)}
    </dl>
  </div>
}

export function CollectionLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const lesson = execution.collectionLesson
  const example = lesson?.cases[0]
  const { source } = execution
  const run = useMemo(() => example && runCollectionLesson(source, example.batteries), [example, source])
  const [position, setPosition] = useState(0)
  const ready = useRef(false)
  if (!lesson || !example) return null

  const step = run?.steps[position - 1]
  const visible = run?.steps.slice(0, position) ?? []
  const positionRead = visible.find(item => item.kind === 'index')?.value
  const namedRead = visible.find(item => item.kind === 'lookup')?.value
  const updated = visible.find(item => item.kind === 'update')?.value
  const stage = step?.kind ?? 'start'
  const next = run?.steps[position]?.kind
  const canPick = next === 'index' || next === 'lookup' || next === 'update'
  const rows = {
    '--collection-columns': example.batteries.length,
    '--collection-narrow-columns': Math.min(example.batteries.length, 3),
  } as CSSProperties
  const title = t('按位置取电量，按名字查记录', 'Find a charge by position or name')

  function goTo(next: number) {
    setPosition(next)
    if (run?.steps[next - 1]?.kind === 'output' && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  return <section className="classroom-demonstration panel collection-lesson" aria-label={title}
    data-testid="collection-lesson" data-collection-stage={stage}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="collection-navigation">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={!run || position >= run.steps.length} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
      </div>
    </>}>
      <div className="panel-heading collection-heading">
        <h2>{title}</h2>
      </div>
      <div className="collection-body">
        <CollectionBench state={{ batteries: example.batteries, records: step?.records, named: !!step?.records, locale,
          index: stage === 'index' ? lesson.index : undefined,
          key: stage === 'lookup' || stage === 'update' ? lesson.key : undefined,
          pickIndex: next === 'index' ? lesson.index : undefined,
          pickKey: next === 'lookup' || next === 'update' ? lesson.key : undefined }}
          onPick={canPick ? () => goTo(position + 1) : undefined} />
        <div className="collection-board" style={rows}>
          <h3>{step ? t('列表里的起始电量', 'Starting charges in the list') : t('一排电池', 'A row of batteries')}</h3>
          <BatteryRow batteries={example.batteries} step={step} index={lesson.index} name={lesson.key} t={t} />
          {step?.records && <RecordRow records={step.records} t={t}
            active={stage === 'lookup' || stage === 'update' ? lesson.key : undefined}
            updated={stage === 'update' ? lesson.key : undefined} />}
        </div>
        {positionRead !== undefined && <dl className="collection-values">
          <div data-active={stage === 'index' || undefined}>
            <dt>{t('按位置读到', 'Read by position')}</dt>
            <dd data-testid="collection-position-value">{positionRead}</dd>
          </div>
          {namedRead !== undefined && <div data-active={stage === 'lookup' || undefined}>
            <dt>{t('按名字读到', 'Read by name')}</dt>
            <dd data-testid="collection-named-value">{namedRead}</dd>
          </div>}
          {updated !== undefined && <div data-active={stage === 'update' || undefined}>
            <dt>{t(`${lesson.key} 的新电量`, `New charge for ${lesson.key}`)}</dt>
            <dd><span>{namedRead} + {lesson.increment} →</span> <strong>{updated}</strong></dd>
          </div>}
          {stage === 'output' && <div data-active>
            <dt>{t('屏幕输出', 'Program output')}</dt>
            <dd><output data-testid="collection-output">{run?.output}</output></dd>
          </div>}
        </dl>}
        {run ? <p className="collection-description" role="status">{describe(step, run, lesson.index, lesson.key, lesson.increment, t)}</p>
          : <p className="error-message" role="alert">{t('程序没有产生可以展示的电量记录。', 'The program did not produce a charge record to show.')}</p>}
        {visible.length > 0 && <ol className="collection-code" data-testid="collection-code" aria-label={t('Python 代码', 'Python code')}>
          {visible.map(({ line, code }) => <li key={line} data-line={line} aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{code}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
