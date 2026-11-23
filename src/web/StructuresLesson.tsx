import { BatteryMemory } from './BatteryMemory'
import { CodingDevice } from './CodingDevice'
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { runStructureLesson } from '../engine/programStructures'
import {
  structureKinds, structureLabels, type CollectionBattery, type ProgramWalkthrough, type StructureBatch, type StructureKind,
} from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './for-lesson.css'
import './structures-lesson.css'

type Translate = (zh: string, en: string) => string
type Run = NonNullable<ReturnType<typeof runStructureLesson>>
type Step = Run['steps'][number]

function actionTitle(kind: StructureKind, t: Translate) {
  return {
    list: t('按位置取', 'Pick by position'),
    stack: t('从顶上拿', 'Take from the top'),
    queue: t('按到达顺序取', 'Take in arrival order'),
    dictionary: t('按名字查', 'Look up by name'),
  }[kind]
}

function prompt(kind: StructureKind, batch: StructureBatch, t: Translate) {
  switch (kind) {
    case 'list': return t(`从左到右从 0 编号。点位置 ${batch.index} 上的电池。`,
      `Number the row from 0 on the left. Select the battery at index ${batch.index}.`)
    case 'stack': return t('电池一块块往上放。点最顶上那块电池。',
      'The batteries were placed one on top of another. Select the battery at the top.')
    case 'queue': return t('电池按到达顺序排成一列。点最早到达的那块。',
      'The batteries are lined up in arrival order. Select the battery that arrived first.')
    case 'dictionary': return t(`维修单写着 ${batch.key}。点名牌写着 ${batch.key} 的电池。`,
      `The repair ticket says ${batch.key}. Select the battery with that name tag.`)
  }
}

function describeSelection(kind: StructureKind, battery: CollectionBattery, t: Translate) {
  const { name } = battery
  switch (kind) {
    case 'list': return t(`按位置读到了 ${name} 号电池。它仍留在原位。`,
      `The position gives us battery ${name}. It stays in its slot.`)
    case 'stack': return t(`拿走最顶上的 ${name} 号电池，下一块就露出来了。`,
      `Take battery ${name} off the top. The next battery is now uncovered.`)
    case 'queue': return t(`最早到的 ${name} 号电池先离开，后面的往前补位。`,
      `Battery ${name} arrived first and leaves first. The rest move forward.`)
    case 'dictionary': return t(`用名字查到了 ${name} 号电池，它的记录仍留在册子里。`,
      `The name gives us battery ${name}. Its record stays in the directory.`)
  }
}

function describeStep(kind: StructureKind, step: Step, good: CollectionBattery, batch: StructureBatch, t: Translate) {
  if (step.kind === 'load') {
    return kind === 'dictionary'
      ? t('程序先按名字登记同一批电池，让每个名字对应一块电池的记录。',
        'The program registers the same batteries by name. Each name points to one battery record.')
      : t('程序先读入原来的一批电池，顺序和它们到达时一样。',
        'The program reads the original batch in arrival order.')
  }
  if (step.kind === 'target') {
    return kind === 'list'
      ? t(`程序记下要读的位置 ${batch.index}。`, `The program stores the requested index ${batch.index}.`)
      : t(`程序记下维修单上的名字 ${batch.key}。`, `The program stores the name ${batch.key} from the repair ticket.`)
  }
  if (step.kind === 'select') return describeSelection(kind, good, t)
  return t(`程序显示取到的电池名字 ${good.name}。`, `The program displays the selected battery’s name, ${good.name}.`)
}

function BatteryBoard({ kind, batch, remaining, selected, onPick, t, promptId }: {
  kind: StructureKind; batch: StructureBatch; remaining: CollectionBattery[]; selected?: CollectionBattery;
  onPick?: (name: string) => void; t: Translate; promptId: string;
}) {
  const ordered = kind === 'stack' ? remaining.toReversed() : remaining
  const columns = { '--structures-count': Math.min(4, batch.batteries.length) } as CSSProperties
  return <div className="structures-board">
    {kind === 'stack' && <p className="structures-edges"><span>{t('最顶上', 'Top')}</span></p>}
    {kind === 'queue' && <p className="structures-edges">
      <span>{t('先到的在前', 'Earliest at the front')}</span>
      <span>{t('后来者在后', 'New arrivals at the back')}</span>
    </p>}
    <ol className="structures-batteries" style={columns} data-testid="structures-batteries"
      aria-label={t('这一批电池', 'This batch of batteries')}>
      {ordered.map(({ name, charge }) => {
        const position = batch.batteries.findIndex(battery => battery.name === name)
        const content = <>
          <span className="structures-location">{kind === 'list' ? t(`位置 ${position}`, `Index ${position}`)
            : kind === 'dictionary' ? t('名字', 'Name') : t(`第 ${position + 1} 个到达`, `Arrival ${position + 1}`)}</span>
          <strong className="structures-battery-name">{name}</strong>
          <span className="for-battery" aria-label={t(`${charge} 格`, `${charge} units of charge`)}>{charge}</span>
        </>
        return <li key={name} data-battery-name={name} data-charge={charge} data-battery-index={position}
          data-selected={selected?.name === name || undefined}>
          {onPick ? <button type="button" className="subtle-button structures-battery-card" onClick={() => onPick(name)}
            aria-describedby={promptId}>{content}</button> : <div className="structures-battery-card">{content}</div>}
        </li>
      })}
    </ol>
    {kind === 'stack' && <p className="structures-edges"><span>{t('最底下', 'Bottom')}</span></p>}
  </div>
}

export function StructuresLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const promptId = useId()
  const [modeIndex, setModeIndex] = useState(0)
  const [position, setPosition] = useState(-1)
  const [picked, setPicked] = useState(false)
  const [mistake, setMistake] = useState(false)
  const finished = useRef(false)
  const kind = structureKinds[modeIndex]
  const batch = execution.structures?.demo
  const run = useMemo(() => batch && runStructureLesson(execution, kind, batch), [execution, kind, batch])
  if (!batch) return null

  const step = run?.steps[position]
  const selected = step ? step.selected : picked ? run?.selected : undefined
  const remaining = step?.remaining ?? (picked ? run?.remaining : undefined) ?? batch.batteries
  const title = actionTitle(kind, t)
  const lastKind = modeIndex === structureKinds.length - 1
  const output = step?.kind === 'output'
  const practicePrompt = output && lastKind ? t(' 换一批电池，试试先选结构，再猜会取到哪一块。',
    ' Try a new batch. First choose a structure, then predict which battery it will give you.') : ''
  const caption = step && run ? describeStep(kind, step, run.selected, batch, t)
    : picked && run ? describeSelection(kind, run.selected, t) : prompt(kind, batch, t)

  function pick(name: string) {
    if (!run || picked) return
    if (name !== run.selected.name) {
      setMistake(true)
      return
    }
    setMistake(false)
    setPicked(true)
  }

  function advance() {
    if (!run) return
    const next = position + 1
    setPosition(next)
    if (lastKind && run.steps[next]?.kind === 'output' && !finished.current) {
      finished.current = true
      onReady()
    }
  }

  function switchMethod() {
    setModeIndex(modeIndex + 1)
    setPosition(-1)
    setPicked(false)
    setMistake(false)
  }

  return <section className="classroom-demonstration panel structures-lesson" data-testid="structures-lesson" data-structure-kind={kind}
    data-structure-stage={step?.kind ?? 'start'} data-interaction={picked ? 'picked' : undefined} aria-label={title}>
    <CodingDevice device="sorter" locale={locale} workbench controls={<>
      {run ? <p className="structures-prompt" id={promptId} role="status">
        {mistake && t('再试一次。', 'Try again. ')}{caption}{practicePrompt}
      </p> : <p className="error-message" id={promptId} role="alert">{t('这次没能读出电池。', 'The program could not read the batteries.')}</p>}
      <BatteryBoard kind={kind} batch={batch} remaining={remaining} selected={selected} onPick={run && !picked ? pick : undefined}
        t={t} promptId={promptId} />
      {picked && <div className="structures-navigation">
        <button type="button" className="subtle-button" disabled={position < 0} onClick={() => setPosition(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        {output && !lastKind ? <button type="button" className="primary-button" onClick={switchMethod}>
          {t('试下一种取法', 'Try the next way')}
        </button> : <button type="button" className="primary-button" disabled={output} onClick={advance}>
          {t('下一步', 'Next step')}
        </button>}
      </div>}
    </>}>
      <div className="panel-heading"><h2>{title}</h2></div>
      <div className="structures-content">
        <BatteryMemory kind={kind} names={remaining.map(battery => battery.name)} active={selected?.name} locale={locale}
          capacity={batch.batteries.length} onPick={!picked && run ? pick : undefined}
          values={kind === 'dictionary' ? Object.fromEntries(remaining.map(({ name, charge }) => [name, charge])) : undefined}
          title={t('维修站的电池', 'Batteries at the station')} />
        {(picked || selected) && <dl className="for-values structures-values">
          {picked && <div><dt>{t('数据结构', 'Data structure')}</dt><dd data-testid="structures-kind-name">{structureLabels[kind][locale]}</dd></div>}
          {selected && <div data-active><dt>{t('取到的电池', 'Selected battery')}</dt><dd data-testid="structures-selected">{selected.name}</dd></div>}
          {output && <div><dt>{t('屏幕输出', 'Program output')}</dt><dd><output data-testid="structures-output">{run?.output}</output></dd></div>}
        </dl>}
        {step && <ol className="for-source" data-testid="structures-code" aria-label={t('Python 代码', 'Python code')}>
          {run?.steps.slice(0, position + 1).map(({ line, code }) => <li key={line} data-line={line}
            aria-current={line === step.line ? 'step' : undefined}><span aria-hidden="true">{line}</span><code>{code}</code></li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
