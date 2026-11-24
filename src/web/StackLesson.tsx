import { BatteryMemory } from './BatteryMemory'
import { useBatteryMotion } from './useBatteryMotion'
import { StepExplanation } from './LessonNotes'
import { CodingDevice } from './CodingDevice'
import { useId, useMemo, useRef, useState } from 'react'
import { runStackLesson } from '../engine/programStackLesson'
import type { CollectionBattery, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './for-lesson.css'
import './stack-lesson.css'

type Step = NonNullable<ReturnType<typeof runStackLesson>>['steps'][number]
type Action = 'push' | 'pop'
type Translate = (zh: string, en: string) => string

function describe(step: Step, t: Translate) {
  const top = step.stack.at(-1)
  switch (step.kind) {
    case 'push':
      return t(`${step.battery} 号现在是栈顶，对应列表的最后一项。`,
        `Battery ${step.battery} is now on top, at the end of the list.`)
    case 'pop':
      return top === undefined
        ? t(`拿走了 ${step.battery} 号。栈里空了。`, `Battery ${step.battery} came out. The stack is empty.`)
        : t(`拿走了 ${step.battery} 号，下面的 ${top} 号成了新的栈顶。`,
          `Battery ${step.battery} came out. Battery ${top} underneath is now on top.`)
    case 'show-popped':
      return t('程序先显示拿出电池的顺序。', 'The program shows the batteries in the order they came out.')
    case 'show-remaining':
      return t('程序再从栈底到栈顶显示剩下的电池。换一组电池，先预测，再运行验证。',
        'The program shows what is left from bottom to top. Predict the results for a new batch, then run the program to check.')
    default:
      return undefined
  }
}

function BatteryFace({ battery, top, t }: { battery: CollectionBattery; top: boolean; t: Translate }) {
  return <>
    <strong>{battery.name}</strong>
    <span className="for-battery" aria-label={t(`${battery.charge} 格电量`, `${battery.charge} units of charge`)}>{battery.charge}</span>
    {top && <span className="stack-lesson-top-label">{t('栈顶', 'Top')}</span>}
  </>
}

function BatteryGroup({ names, batteries, part, promptId, nextBattery, onChoose, t }: {
  names: string[]
  batteries: Map<string, CollectionBattery>
  part: 'waiting' | 'pile' | 'taken'
  promptId: string
  nextBattery?: string
  onChoose?: (name: string) => void
  t: Translate
}) {
  const title = {
    waiting: t('待放入', 'Ready to stack'),
    pile: t('电池栈', 'Battery stack'),
    taken: t('拿出的顺序', 'Order removed'),
  }[part]
  const empty = {
    waiting: t('待放入的电池都放过了', 'All batteries have been stacked'),
    pile: t('空栈', 'Empty stack'),
    taken: t('还没拿出电池', 'No batteries removed yet'),
  }[part]
  return <section className={`stack-lesson-group stack-lesson-${part}`}>
    <h3>{title}</h3>
    {names.length === 0 && <p className="stack-lesson-empty">{empty}</p>}
    <ol className="stack-lesson-batteries" data-testid={`stack-${part}`} aria-label={title}>
      {names.map((name, index) => {
        const battery = batteries.get(name)
        if (!battery) return null
        const top = part === 'pile' && index === 0
        return <li key={part === 'taken' ? `${index}-${name}` : name} data-battery-name={name} data-charge={battery.charge}
          data-stack-top={top || undefined}>
          {onChoose ? <button type="button" className="subtle-button stack-lesson-battery"
            aria-label={part === 'waiting' ? t(`放入 ${name} 号电池`, `Push battery ${name}`)
              : t(`拿出 ${name} 号电池`, `Pop battery ${name}`)}
            aria-describedby={promptId} onClick={() => onChoose(name)}>
            <BatteryFace battery={battery} top={top} t={t} />
            {name === nextBattery && <small className="battery-action-tag" aria-hidden="true">{
              part === 'waiting' ? t('↓ 入栈', '↓ Push') : t('↑ 出栈', '↑ Pop')
            }</small>}
          </button> : <div className="stack-lesson-battery"><BatteryFace battery={battery} top={top} t={t} /></div>}
        </li>
      })}
    </ol>
    {part === 'pile' && names.length > 0 && <p className="stack-lesson-bottom">{t('栈底', 'Bottom')}</p>}
  </section>
}

export function StackLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough
  locale: Locale
  onReady: () => void
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const promptId = useId()
  const [position, setPosition] = useState(-1)
  const motion = useBatteryMotion(position)
  const [mistake, setMistake] = useState(false)
  const ready = useRef(false)
  const sample = execution.stackLesson?.cases[0]
  const run = useMemo(() => sample && runStackLesson(execution, sample), [execution, sample])
  if (!sample) return null

  const firstAction = run?.steps.findIndex(step => step.kind === 'push' || step.kind === 'pop') ?? -1
  const nextPosition = position < 0 ? firstAction : position + 1
  const step = run?.steps[position]
  const next = nextPosition >= 0 ? run?.steps[nextPosition] : undefined
  const stage = step?.kind ?? 'start'
  const stack = step?.stack ?? []
  const taken = step?.popped ?? []
  const waiting = sample.batteries.map(({ name }) => name).filter(name =>
    !stack.includes(name) && (!taken.includes(name) || (next?.kind === 'push' && next.battery === name)))
  const batteries = new Map(sample.batteries.map(battery => [battery.name, battery]))
  const visible = run?.steps.slice(0, position + 1) ?? []
  const title = t('在维修台上叠电池', 'Stack batteries on the repair bench')
  const showPopped = stage === 'show-popped' || stage === 'show-remaining'
  const showRemaining = stage === 'show-remaining'
  const hasNextOutput = next?.kind === 'show-popped' || next?.kind === 'show-remaining'
  const caption = step && describe(step, t)
  const prompt = next?.kind === 'push'
    ? t(`点 ${next.battery} 号电池，把它放到最上面。`, `Select battery ${next.battery} to put it on top.`)
    : next?.kind === 'pop' && t('点栈顶的电池，把它拿出来。', 'Select the battery at the top to take it out.')
  const feedback = next?.kind === 'pop'
    ? t('再试一次。先拿现在露在最上面的电池。', 'Try again. Take the exposed battery at the top first.')
    : t('再试一次。', 'Try again. ')

  function goTo(index: number) {
    motion.capture()
    setMistake(false)
    setPosition(index)
    if (run?.steps[index]?.kind === 'show-remaining' && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  function choose(action: Action, name: string) {
    if (next?.kind !== action) return
    if (next.battery === name) goTo(nextPosition)
    else setMistake(true)
  }

  return <section className="classroom-demonstration panel stack-lesson" data-testid="stack-lesson" data-stack-stage={stage} aria-label={title}>
    <CodingDevice device="sorter" locale={locale} workbench controls={<>
      {run ? <p className={mistake ? 'stack-lesson-status' : 'sr-only'} role="status" id={promptId}>
        {mistake ? feedback : prompt ?? caption}
      </p> : <p className="error-message" id={promptId} role="alert">{t('现在无法运行电池栈的程序。', 'The battery stack program could not run.')}</p>}
      <div className="stack-lesson-board" ref={motion.board}>
        <BatteryGroup names={waiting} batteries={batteries} part="waiting" promptId={promptId} nextBattery={next?.battery}
          onChoose={next?.kind === 'push' ? name => choose('push', name) : undefined} t={t} />
        <BatteryGroup names={stack.toReversed()} batteries={batteries} part="pile" promptId={promptId} nextBattery={next?.battery}
          onChoose={next?.kind === 'pop' ? name => choose('pop', name) : undefined} t={t} />
        <BatteryGroup names={taken} batteries={batteries} part="taken" promptId={promptId} t={t} />
      </div>
      {step && <div className="stack-lesson-navigation">
        <button type="button" className="subtle-button" onClick={() => goTo(position <= firstAction ? -1 : position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        {hasNextOutput && <button type="button" className="primary-button" onClick={() => goTo(nextPosition)}>{t('下一步', 'Next step')}</button>}
      </div>}
      {caption && <StepExplanation locale={locale}>{caption}</StepExplanation>}
    </>}>
      <div className="panel-heading"><h2>{title}</h2></div>
      <div className="stack-lesson-content">
        <BatteryMemory kind="stack" names={stack} active={stack.at(-1)} locale={locale} snapshot={step?.stack}
          capacity={sample.batteries.length} waiting={waiting} taken={taken}
          onPick={next?.kind === 'push' || next?.kind === 'pop' ? name => choose(stack.includes(name) ? 'pop' : 'push', name) : undefined}
          title={t('栈里的电池', 'Batteries in the stack')} />
        {visible.length > 0 && <ol className="for-source" data-testid="stack-lesson-code" aria-label={t('Python 代码', 'Python code')}>
          {visible.map(({ line, code }) => <li key={line} data-line={line} aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{code}</code>
          </li>)}
        </ol>}
        {showPopped && <dl className="for-values stack-lesson-output">
          <div data-active={stage === 'show-popped' || undefined}>
            <dt>{t('拿出的顺序', 'Order removed')}</dt>
            <dd><output data-testid="stack-popped-output">{run?.output[0]}</output></dd>
          </div>
          {showRemaining && <div data-active>
            <dt>{t('栈里剩下的电池（栈底到栈顶）', 'Batteries left (bottom to top)')}</dt>
            <dd><output data-testid="stack-remaining-output">{run?.output[1]}</output></dd>
          </div>}
        </dl>}
      </div>
    </CodingDevice>
  </section>
}
