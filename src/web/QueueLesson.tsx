import { BatteryMemory } from './BatteryMemory'
import { CodingDevice } from './CodingDevice'
import { useId, useMemo, useRef, useState } from 'react'
import { runQueueLesson } from '../engine/programQueueLesson'
import type { CollectionBattery, ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './for-lesson.css'
import './queue-lesson.css'

type Step = NonNullable<ReturnType<typeof runQueueLesson>>['steps'][number]
type Translate = (zh: string, en: string) => string

function describe(step: Step, t: Translate) {
  const front = step.queue[0]
  switch (step.kind) {
    case 'push':
      return step.queue.length === 1
        ? t(`队里现在只有 ${step.battery} 号，队头和队尾都是它。`,
          `Battery ${step.battery} is alone in the queue, so it is both the front and the back.`)
        : t(`${step.battery} 号从队尾加入，对应列表末尾。${front} 号还排在队头。`,
          `Battery ${step.battery} joins at the back, at the end of the list. Battery ${front} stays at the front.`)
    case 'pop':
      return front === undefined
        ? t(`${step.battery} 号从队头取出，队列现在空了。`, `Battery ${step.battery} leaves from the front. The queue is empty.`)
        : t(`${step.battery} 号从队头取出，后面的电池往前补位，${front} 号成了新队头。`,
          `Battery ${step.battery} leaves from the front. The others move forward, and battery ${front} becomes the new front.`)
    case 'show-popped':
      return t('程序按实际取出的先后显示电池。越早加入的电池，越先轮到。',
        'The program shows the order the batteries came out. Earlier arrivals leave first.')
    case 'show-remaining':
      return t('程序从队头到队尾显示队里还剩哪些。换一组电池，先预测，再运行验证。',
        'The program shows what is left, from front to back. Predict the results for a new batch, then run it to check.')
    default:
      return undefined
  }
}

function BatteryFace({ battery, edge, t }: { battery: CollectionBattery; edge?: string; t: Translate }) {
  return <>
    <strong>{battery.name}</strong>
    <span className="for-battery" aria-label={t(`${battery.charge} 格电量`, `${battery.charge} units of charge`)}>{battery.charge}</span>
    {edge && <span className="queue-lesson-edge">{edge}</span>}
  </>
}

function BatteryGroup({ names, batteries, part, promptId, onChoose, t }: {
  names: string[]
  batteries: Map<string, CollectionBattery>
  part: 'waiting' | 'line' | 'taken'
  promptId: string
  onChoose?: (name: string) => void
  t: Translate
}) {
  const title = {
    waiting: t('到达顺序', 'Arrival order'),
    line: t('电池队列', 'Battery queue'),
    taken: t('取出的顺序', 'Order removed'),
  }[part]
  const empty = {
    waiting: t('没有电池等待加入', 'No more arrivals'),
    line: t('空队列', 'Empty queue'),
    taken: t('还没取出电池', 'No batteries removed yet'),
  }[part]
  return <section className={`queue-lesson-group queue-lesson-${part}`}>
    <h3>{title}</h3>
    {part === 'line' && <div className="queue-lesson-directions">
      <span>{t('← 队头取出', '← Take from front')}</span>
      <span>{t('← 从队尾加入', '← Join at back')}</span>
    </div>}
    {names.length === 0 && <p className="queue-lesson-empty">{empty}</p>}
    <ol className="queue-lesson-batteries" data-testid={`queue-${part}`} aria-label={title}>
      {names.map((name, index) => {
        const battery = batteries.get(name)
        if (!battery) return null
        const head = part === 'line' && index === 0
        const tail = part === 'line' && index === names.length - 1
        const edge = head && tail ? t('队头和队尾', 'Front and back')
          : head ? t('队头', 'Front') : tail ? t('队尾', 'Back') : undefined
        return <li key={part === 'taken' ? `${index}-${name}` : name} data-battery-name={name} data-charge={battery.charge}
          data-queue-head={head || undefined} data-queue-tail={tail || undefined}>
          {onChoose ? <button type="button" className="subtle-button queue-lesson-battery"
            aria-label={part === 'waiting' ? t(`让 ${name} 号电池入队`, `Enqueue battery ${name}`)
              : t(`取出 ${name} 号电池`, `Take battery ${name} out of the queue`)}
            aria-describedby={promptId} onClick={() => onChoose(name)}>
            <BatteryFace battery={battery} edge={edge} t={t} />
          </button> : <div className="queue-lesson-battery"><BatteryFace battery={battery} edge={edge} t={t} /></div>}
        </li>
      })}
    </ol>
  </section>
}

export function QueueLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough
  locale: Locale
  onReady: () => void
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const promptId = useId()
  const [position, setPosition] = useState(-1)
  const [mistake, setMistake] = useState(false)
  const ready = useRef(false)
  const sample = execution.queueLesson?.cases[0]
  const run = useMemo(() => sample && runQueueLesson(execution, sample), [execution, sample])
  if (!sample) return null

  const firstAction = run?.steps.findIndex(step => step.kind === 'push' || step.kind === 'pop') ?? -1
  const nextPosition = position < 0 ? firstAction : position + 1
  const step = run?.steps[position]
  const next = nextPosition >= 0 ? run?.steps[nextPosition] : undefined
  const stage = step?.kind ?? 'start'
  const queue = step?.queue ?? []
  const taken = step?.popped ?? []
  const arrivals = run?.steps.slice(nextPosition).flatMap(frame => frame.kind === 'push' && frame.battery !== undefined ? [frame.battery] : [])
    ?? sample.batteries.map(battery => battery.name)
  const waiting = [...new Set(arrivals)].filter(name => !queue.includes(name))
  const batteries = new Map(sample.batteries.map(battery => [battery.name, battery]))
  const visible = run?.steps.slice(0, position + 1) ?? []
  const title = t('让维修台上的电池排队', 'Line up batteries at the repair bench')
  const showPopped = stage === 'show-popped' || stage === 'show-remaining'
  const showRemaining = stage === 'show-remaining'
  const hasNextOutput = next?.kind === 'show-popped' || next?.kind === 'show-remaining'
  const caption = step && describe(step, t)
  const prompt = next?.kind === 'push'
    ? t(`接下来到的是 ${next.battery} 号。点它，让它从队尾加入。`,
      `Battery ${next.battery} arrives next. Select it to join at the back.`)
    : next?.kind === 'pop' && t('点左边队头的电池，把它取出来。', 'Select the battery at the front on the left to take it out.')
  const feedback = next?.kind === 'pop'
    ? t('再试一次。先到的电池排在队头，先取左边的第一块。', 'Try again. The earliest arrival is at the front. Take the first battery on the left.')
    : t('再试一次。让先到的电池先入队。', 'Try again. Let the earliest arrival join first.')

  function goTo(index: number) {
    setMistake(false)
    setPosition(index)
    if (run?.steps[index]?.kind === 'show-remaining' && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  function choose(action: 'push' | 'pop', name: string) {
    if (next?.kind !== action) return
    if (next.battery === name) goTo(nextPosition)
    else setMistake(true)
  }

  return <section className="classroom-demonstration panel queue-lesson" data-testid="queue-lesson" data-queue-stage={stage} aria-label={title}>
    <CodingDevice device="sorter" locale={locale} workbench controls={<>
      {run ? <p className="queue-lesson-status" role="status" id={promptId}>
        {caption && <span>{caption}</span>}
        {prompt && <span>{mistake ? feedback : prompt}</span>}
      </p> : <p className="error-message" id={promptId} role="alert">{t('现在无法运行电池队列的程序。', 'The battery queue program could not run.')}</p>}
      <div className="queue-lesson-board">
        <BatteryGroup names={queue} batteries={batteries} part="line" promptId={promptId}
          onChoose={next?.kind === 'pop' ? name => choose('pop', name) : undefined} t={t} />
        <BatteryGroup names={waiting} batteries={batteries} part="waiting" promptId={promptId}
          onChoose={next?.kind === 'push' ? name => choose('push', name) : undefined} t={t} />
        <BatteryGroup names={taken} batteries={batteries} part="taken" promptId={promptId} t={t} />
      </div>
      {step && <div className="queue-lesson-navigation">
        <button type="button" className="subtle-button" onClick={() => goTo(position <= firstAction ? -1 : position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        {hasNextOutput && <button type="button" className="primary-button" onClick={() => goTo(nextPosition)}>{t('下一步', 'Next step')}</button>}
      </div>}
    </>}>
      <div className="panel-heading"><h2>{title}</h2></div>
      <div className="queue-lesson-content">
        <BatteryMemory kind="queue" names={queue} active={queue[0]} locale={locale} snapshot={step?.queue}
          capacity={sample.batteries.length} waiting={waiting} taken={taken}
          onPick={next?.kind === 'push' || next?.kind === 'pop' ? name => choose(queue.includes(name) ? 'pop' : 'push', name) : undefined}
          title={t('队列里的电池', 'Batteries in the queue')} />
        {visible.length > 0 && <ol className="for-source" data-testid="queue-lesson-code" aria-label={t('Python 代码', 'Python code')}>
          {visible.map(({ line, code }) => <li key={line} data-line={line} aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{code}</code>
          </li>)}
        </ol>}
        {showPopped && <dl className="for-values queue-lesson-output">
          <div data-active={stage === 'show-popped' || undefined}>
            <dt>{t('取出的顺序', 'Order removed')}</dt>
            <dd><output data-testid="queue-popped-output">{run?.output[0]}</output></dd>
          </div>
          {showRemaining && <div data-active={stage === 'show-remaining' || undefined}>
            <dt>{t('队里剩下的电池（队头到队尾）', 'Batteries left (front to back)')}</dt>
            <dd><output data-testid="queue-remaining-output">{run?.output[1]}</output></dd>
          </div>}
        </dl>}
      </div>
    </CodingDevice>
  </section>
}
