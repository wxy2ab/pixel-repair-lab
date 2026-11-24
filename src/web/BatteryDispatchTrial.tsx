import { CodingDevice } from './CodingDevice'
import { DispatchInstrument } from './DispatchInstrument'
import { useEffect, useId, useRef, useState } from 'react'
import { runBatteryDispatchTrial, type DispatchStep } from '../engine/batteryDispatch'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import { readDispatchCase, type DispatchCase } from '../shared/batteryDispatch'
import { structureKinds, structureLabels, type StructureKind } from '../shared/programWalkthrough'
import type { Locale, Localized } from '../shared/types'
import { runIssueText, tr } from './text'
import './batteryDispatchTrial.css'

type Translate = (zh: string, en: string) => string
type DispatchRole = 'queue' | 'stack' | 'records' | 'results'

const workstations: { id: DispatchRole; answer: StructureKind; name: Localized; task: Localized; hint: Localized }[] = [
  {
    id: 'queue', answer: 'queue', name: { zh: '等待补电', en: 'Waiting for charging' },
    task: { zh: '先到的电池先补电。', en: 'Charge the earliest arrival first.' },
    hint: { zh: '想想哪种结构从一端放入、从另一端取出。', en: 'Which structure adds at one end and takes from the other?' },
  },
  {
    id: 'stack', answer: 'stack', name: { zh: '临时叠放', en: 'Temporary pile' },
    task: { zh: '补好的电池叠到上面，取件也从上面拿。', en: 'Put charged batteries on top and take them from the top.' },
    hint: { zh: '想想哪种结构最后放上去的最先取出。', en: 'Which structure takes out the last item put in?' },
  },
  {
    id: 'records', answer: 'dictionary', name: { zh: '电量登记', en: 'Charge register' },
    task: { zh: '根据电池名字更新对应的电量。', en: 'Use each battery’s name to update its charge.' },
    hint: { zh: '想想哪种结构用名字当键来找对应的值。', en: 'Which structure uses a name as a key to find a value?' },
  },
  {
    id: 'results', answer: 'list', name: { zh: '取件清单', en: 'Pickup list' },
    task: { zh: '每取一块就记到末尾，便于按位置查看。', en: 'Add each pickup to the end and read it back by position.' },
    hint: { zh: '想想哪种结构能追加名字，再按位置读出。', en: 'Which structure lets you append names and read them by position?' },
  },
]

function BatteryFace({ name, charge, t }: { name: string; charge: number; t: Translate }) {
  return <>
    <strong>{name}</strong>
    <span className="dispatch-charge" role="img" aria-label={t(`${charge} 格电量`, `${charge} units of charge`)}>{charge}</span>
  </>
}

export function DispatchCaseInstructions({ sample, locale, activeAction }: {
  sample: DispatchCase; locale: Locale; activeAction?: number;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  return <section className="dispatch-ticket" aria-label={t('本批电池的工单', 'Work order for this batch')}>
    <div>
      <h3>{t('电池到达顺序', 'Battery arrivals')}</h3>
      <ol className="dispatch-batteries dispatch-arrivals" aria-label={t('电池到达顺序', 'Battery arrivals')}>
        {sample.arrivals.map(name => <li key={name} className="dispatch-battery" data-battery-name={name} data-charge={sample.records[name]}>
          <BatteryFace name={name} charge={sample.records[name]} t={t} />
        </li>)}
      </ol>
    </div>
    <div>
      <h3>{t('工单上的操作', 'Work order steps')}</h3>
      <p>{t(`电池到齐后按工单操作。每次补 ${sample.increment} 格，取件时更新登记。`,
        `Follow the work order once all batteries arrive. Add ${sample.increment} units at a time and update the register at pickup.`)}</p>
      <ol className="dispatch-actions">
        {sample.actions.map((action, index) => <li key={index} data-action={action}
          aria-current={activeAction === index ? 'step' : undefined}>
          <span className="dispatch-action-number" aria-hidden="true">{index + 1}</span>
          {action === 'stage' ? t('补电并叠放', 'Charge and stack') : t('取件并登记', 'Take and record')}
        </li>)}
      </ol>
    </div>
  </section>
}

function DispatchBoard({ sample, step, t }: { sample: DispatchCase; step?: DispatchStep; t: Translate }) {
  const queue = step?.queue ?? []
  const stack = step?.stack ?? []
  const records = step?.records ?? sample.records
  const order = step?.order ?? []
  const highlights = {
    queue: step?.kind === 'enqueue' || step?.kind === 'queueTake',
    stack: step?.kind === 'stackAdd' || step?.kind === 'stackTake',
    records: step?.kind === 'update',
    results: step?.kind === 'record',
  }
  return <div className="dispatch-board">
    <section data-active={highlights.queue || undefined}>
      <h4>{t('等待补电的队列', 'Charging queue')}</h4>
      {queue.length === 0 && <p className="dispatch-empty">{t('队列空着', 'Queue is empty')}</p>}
      <ol className="dispatch-batteries" data-testid="dispatch-queue" aria-label={t('从队头到队尾', 'From the front to the back')}>
        {queue.map((name, index) => {
          const head = index === 0
          const tail = index === queue.length - 1
          return <li key={name} className="dispatch-battery" data-battery-name={name} data-charge={records[name]} data-active={highlights.queue && step?.battery === name || undefined}
            data-queue-head={head || undefined} data-queue-tail={tail || undefined}>
            <BatteryFace name={name} charge={records[name]} t={t} />
            {(head || tail) && <small>{head && tail ? t('队头和队尾', 'Front and back') : head ? t('队头', 'Front') : t('队尾', 'Back')}</small>}
          </li>
        })}
      </ol>
    </section>
    <section data-active={highlights.stack || undefined}>
      <h4>{t('临时叠放的栈', 'Temporary stack')}</h4>
      {stack.length === 0 && <p className="dispatch-empty">{t('栈空着', 'Stack is empty')}</p>}
      <ol className="dispatch-batteries dispatch-stack" data-testid="dispatch-stack" aria-label={t('从栈顶到栈底', 'From the top to the bottom')}>
        {[...stack].reverse().map(({ name, charge }, index) => <li key={name} className="dispatch-battery" data-battery-name={name} data-charge={charge}
          data-active={highlights.stack && step?.battery === name || undefined} data-stack-top={index === 0 || undefined}>
          <BatteryFace name={name} charge={charge} t={t} />
          {index === 0 && <small>{t('栈顶', 'Top')}</small>}
        </li>)}
      </ol>
    </section>
    <section data-active={highlights.records || undefined}>
      <h4>{t('电量字典', 'Charge dictionary')}</h4>
      <dl className="dispatch-records" data-testid="dispatch-records">
        {sample.arrivals.map(name => <div key={name} data-battery-name={name} data-charge={records[name]} data-active={highlights.records && step?.battery === name || undefined}>
          <dt>{name}</dt><dd>{t(`${records[name]} 格`, `${records[name]} units`)}</dd>
        </div>)}
      </dl>
    </section>
    <section data-active={highlights.results || undefined}>
      <h4>{t('取件结果列表', 'Pickup results list')}</h4>
      {order.length === 0 && <p className="dispatch-empty">{t('还没有取件记录', 'No pickups recorded yet')}</p>}
      <ol className="dispatch-batteries dispatch-results" data-testid="dispatch-retrieval" aria-label={t('取件顺序', 'Pickup order')}>
        {order.map((name, index) => <li key={name} className="dispatch-battery" data-battery-name={name}
          data-active={highlights.results && step?.battery === name || undefined}>
          <small>{t(`位置 ${index}`, `Index ${index}`)}</small><strong>{name}</strong>
        </li>)}
      </ol>
    </section>
  </div>
}

function describeStep(step: DispatchStep, t: Translate): string {
  const name = step.battery ?? ''
  switch (step.kind) {
    case 'enqueue': return t(`${name} 号到达，从队尾加入，等着补电。`, `Battery ${name} arrives and joins the back of the charging queue.`)
    case 'queueTake': return t(`轮到队头的 ${name} 号，先把它移到补电台。`, `Battery ${name} is at the front. Move it to the charging bench.`)
    case 'stackAdd': return t(`${name} 号补完电，放到临时堆的最上面。它的名字和新电量一起放进去。`,
      `Battery ${name} is charged and goes on top of the pile. Its name and new charge stay together.`)
    case 'stackTake': return t(`从最上面拿出 ${name} 号，接下来登记电量。`, `Take battery ${name} from the top. Its charge is ready to record.`)
    case 'update': return t(`用第 0 项的名字 ${name} 找到登记，把第 1 项的新电量写回去。`,
      `Use the name ${name} at index 0 to find the record. Write back the new charge at index 1.`)
    case 'record': return t(`把 ${name} 号记到结果列表末尾，保留取出的顺序。`, `Append battery ${name} to the results to keep the pickup order.`)
    case 'return': return t('程序交回取件顺序和最终的电量记录。', 'The program returns the pickup order and final charge records.')
  }
}

export function BatteryDispatchTrial({ level, locale, source, personal, course, onReady, onMistake }: {
  level: AlgorithmLevel; locale: Locale; source: string; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onReady: (source: string | undefined) => void; onMistake?: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const headingId = useId()
  const [selected, setSelected] = useState<Partial<Record<DispatchRole, StructureKind>>>({})
  const [checked, setChecked] = useState(false)
  const [trial, setTrial] = useState<ReturnType<typeof runBatteryDispatchTrial>>()
  const [position, setPosition] = useState(-1)
  const nextButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (trial?.steps.length) nextButton.current?.focus()
  }, [trial])
  const trialCase = level.batteryDispatch?.trialCase
  const sample = readDispatchCase(level.cases[trialCase ?? -1])
  if (trialCase === undefined || !sample) return null

  const wrong = workstations.filter(workstation => selected[workstation.id] !== workstation.answer)
  const incomplete = workstations.some(workstation => !selected[workstation.id])
  const step = trial?.steps[position]
  const last = (trial?.steps.length ?? 0) - 1
  const finished = step?.kind === 'return' && position === last && trial?.passed
  const moving = step?.kind === 'queueTake' && step.battery !== undefined
    ? { name: step.battery, charge: step.records[step.battery] }
    : step?.kind === 'stackTake' && trial?.steps[position - 1]?.stack.find(battery => battery.name === step.battery)
  const activeAction = trial?.steps.slice(0, position + 1)
    .filter(current => current.kind === 'queueTake' || current.kind === 'stackTake').length

  function choose(role: DispatchRole, kind: StructureKind) {
    if (selected[role] === kind) return
    setSelected({ ...selected, [role]: kind })
    if (trial) {
      setChecked(false)
      setTrial(undefined)
      setPosition(-1)
      onReady(undefined)
    }
  }

  function start() {
    setChecked(true)
    if (trialCase === undefined || incomplete) return
    if (wrong.length > 0) {
      onMistake?.()
      return
    }
    setTrial(runBatteryDispatchTrial(level, source, trialCase, personal, course))
    setPosition(-1)
    onReady(undefined)
  }

  function goTo(index: number) {
    setPosition(index)
    onReady(index === last && trial?.passed && trial.steps[index]?.kind === 'return' ? source : undefined)
  }

  return <section className="panel battery-dispatch-trial" data-testid="battery-dispatch-trial" aria-labelledby={headingId}>
    <div className="panel-heading"><h2 id={headingId}>{t('给维修台选结构', 'Choose structures for the repair bench')}</h2></div>
    <CodingDevice device="sorter" locale={locale} workbench controls={<>
      <div className="dispatch-roles">
        {workstations.map(({ id, answer, name, task, hint }) => {
          const needsChange = checked && selected[id] !== answer
          return <fieldset key={id} className="dispatch-role" data-testid={`dispatch-role-${id}`} data-needs-change={needsChange || undefined}>
            <legend>{name[locale]}</legend>
            <p>{task[locale]}</p>
            <div className="dispatch-choices">
              {structureKinds.map(kind => <button key={kind} type="button" className="subtle-button"
                data-testid={`dispatch-choice-${id}-${kind}`} aria-pressed={selected[id] === kind} onClick={() => choose(id, kind)}>
                {structureLabels[kind][locale]}
              </button>)}
            </div>
            {needsChange && <p className="dispatch-hint">{hint[locale]}</p>}
          </fieldset>
        })}
      </div>
      <div className="dispatch-controls">
        <button type="button" className={trial ? 'subtle-button' : 'primary-button'} onClick={start}>
          {trial ? t('重新试跑', 'Restart the trial') : t('试跑小例子', 'Run the small example')}
        </button>
        {checked && wrong.length > 0 && <p className="dispatch-hint" role="status">
          {incomplete
            ? t('先为每个工位选一种结构。', 'Choose one structure for each station first.')
            : t('看看标出的工位，再想想电池要怎么放、怎么取。', 'Review the marked stations. Think about how a battery goes in or comes out.')}
        </p>}
      </div>
      {trial && <div className="dispatch-controls">
        <button type="button" className="subtle-button" disabled={position < 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button ref={nextButton} type="button" className="primary-button" disabled={position >= last} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
        <span className="dispatch-progress">{t(`步骤 ${position + 1} / ${last + 1}`, `Step ${position + 1} / ${last + 1}`)}</span>
      </div>}
    </>}>
      <div className="dispatch-trial-content">
        <div className="dispatch-instrument" data-running={Boolean(trial)}>
          <DispatchInstrument batch={sample} steps={trial?.steps} index={position} locale={locale} advance={() => goTo(position + 1)} />
          {step && <div className="dispatch-source" data-testid="dispatch-current-code" aria-current="step" data-line={step.line}>
            <span aria-hidden="true">{step.line}</span><code>{step.code}</code>
          </div>}
        </div>
        <DispatchCaseInstructions sample={sample} locale={locale} activeAction={activeAction ? activeAction - 1 : undefined} />
        {trial && <section className="dispatch-run" aria-label={t('逐步试跑', 'Step through the trial')}>
          {trial.issue && <p className="error-message" role="alert">{runIssueText(locale, trial.issue)}</p>}
          {last >= 0 && <div className="dispatch-step" data-testid="dispatch-step" data-kind={step?.kind ?? 'start'} data-line={step?.line}>
            <div className="dispatch-step-caption">
              <p role="status">{step ? describeStep(step, t) : t('电池的起始电量已经登记。点「下一步」，让第一块电池入队。',
                'The starting charges are on the register. Select Next step to put the first battery in the queue.')}</p>
              {moving && <span className="dispatch-battery dispatch-moving" data-testid="dispatch-moving-battery"
                data-battery-name={moving.name} data-charge={moving.charge}>
                <BatteryFace name={moving.name} charge={moving.charge} t={t} />
              </span>}
            </div>
          </div>}
          <DispatchBoard sample={sample} step={step} t={t} />
          {finished && <p className="win-message" role="status" data-task-success="true">{t('小例子试跑完成。', 'The small trial is complete.')}</p>}
          {step?.kind === 'return' && !trial.passed && <p className="error-message" role="status">
            {t('取件顺序或电量登记和工单对不上。', 'The pickup order or charge register does not match the work order.')}
          </p>}
        </section>}
      </div>
    </CodingDevice>
  </section>
}
