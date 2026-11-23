import { CodingDevice } from './CodingDevice'
import { ComparisonInstrument, GateInstrument } from './ValueInstruments'
import { useMemo, useRef, useState } from 'react'
import { runBooleanLesson } from '../engine/programBoolean'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './boolean-lesson.css'

type Case = ProgramWalkthrough['cases'][number]
type Run = NonNullable<ReturnType<typeof runBooleanLesson>>
type Example = { input: number; doorOpen: boolean; run?: Run }
type Translate = (zh: string, en: string) => string
type CombineStage = 'charge' | 'door' | 'decision'
type Step = { stage: 'start' } | { stage: 'compare'; index: number } | { stage: CombineStage; index: number }

const combineStages = ['charge', 'door', 'decision'] as const

function collectExamples(execution: ProgramWalkthrough, activity: Case['activity']): Example[] {
  return execution.cases.flatMap(({ activity: role, input, doorOpen }) => {
    if (role !== activity || doorOpen === undefined) return []
    return [{ input, doorOpen, run: runBooleanLesson(execution.source, input, doorOpen) }]
  })
}

function BooleanValue({ value, t }: { value: boolean; t: Translate }) {
  return <span className="boolean-value" data-value={value}>
    <code>{value ? 'True' : 'False'}</code><span>{value ? t('真', 'true') : t('假', 'false')}</span>
  </span>
}

function ChargeAxis({ examples, threshold, through, t }: {
  examples: Example[]; threshold: number; through: number; t: Translate;
}) {
  return <div className="boolean-axis-panel">
    <h3>{t('补电后的电量', 'Charge after topping up')}</h3>
    <ol className="boolean-axis" aria-label={t('电量数轴', 'Charge number line')}>
      {examples.map(({ input, run }, index) => {
        const value = index <= through ? run?.comparison.value : undefined
        const relation = input < threshold ? t('低于要求', 'Below the minimum')
          : input === threshold ? t('刚好达到', 'Exactly the minimum') : t('超过要求', 'Above the minimum')
        return <li key={input} data-charge-point={input} data-threshold={input === threshold || undefined}
          data-active={index === through || undefined} data-value={value}>
          <span className="boolean-axis-dot" aria-hidden="true" />
          <strong>{input}</strong>
          <span className="boolean-axis-relation">{relation}</span>
          <span className="boolean-axis-result">{value !== undefined && <BooleanValue value={value} t={t} />}</span>
        </li>
      })}
    </ol>
  </div>
}

function ConditionFlow({ example, stage, t }: { example: Example & { run: Run }; stage: CombineStage; t: Translate }) {
  const { input, run } = example
  const door = stage === 'charge' ? undefined : run.door.value
  const decision = stage === 'decision' ? run.decision.value : undefined
  return <div className="boolean-flow">
    <article className="boolean-condition" data-boolean-part="charge" data-value={run.comparison.value}
      data-active={stage === 'charge' || undefined}>
      <h3>{t('电量够吗？', 'Enough charge?')}</h3>
      <div className="boolean-condition-reading"><span className="boolean-battery" aria-hidden="true" />
        <span>{t(`${input} 格`, `${input} units`)}</span></div>
      <BooleanValue value={run.comparison.value} t={t} />
    </article>
    <span className="boolean-connector" aria-hidden="true">{stage === 'decision' ? 'and' : null}</span>
    <article className="boolean-condition" data-boolean-part="door" data-value={door}
      data-active={stage === 'door' || undefined}>
      <h3>{t('安全门开了吗？', 'Is the safety door open?')}</h3>
      <div className="boolean-condition-reading"><span className="boolean-gate" data-open={door} aria-hidden="true" />
        <span>{door === undefined ? t('等待检查', 'Waiting to check')
          : door ? t('门开着', 'Door open') : t('门关着', 'Door closed')}</span></div>
      {door !== undefined && <BooleanValue value={door} t={t} />}
    </article>
    <span className="boolean-connector boolean-arrow" aria-hidden="true">→</span>
    <article className="boolean-condition" data-boolean-part="decision" data-value={decision}
      data-active={stage === 'decision' || undefined}>
      <h3>{t('芽芽能出发吗？', 'Can Sprout leave?')}</h3>
      <div className="boolean-condition-reading"><span className="boolean-route" data-clear={decision} aria-hidden="true" />
        <span>{decision === undefined ? t('等待判断', 'Waiting to decide')
          : decision ? t('可以出发', 'Ready to leave') : t('还要等一等', 'Wait here')}</span></div>
      {decision !== undefined && <BooleanValue value={decision} t={t} />}
    </article>
  </div>
}

function explain(step: Step, compare: Example[], combine: Example[], threshold: number, t: Translate) {
  if (step.stage === 'start') return t('点「下一步」，看看数轴上的电量是否达到出发要求。',
    'Choose Next step to check whether each charge on the number line reaches the minimum.')
  if (step.stage === 'compare') {
    const { input, run } = compare[step.index]
    const value = run?.comparison.value ? t('比较得到 True（真）。', ' The comparison is True.')
      : t('比较得到 False（假）。', ' The comparison is False.')
    if (input < threshold) return t(`${input} 在 ${threshold} 的左边，电量低于要求。`,
      `${input} is to the left of ${threshold}, below the minimum.`) + value
    if (input === threshold) return t(`刚好 ${threshold} 格也达到要求。`,
      `Exactly ${threshold} units meets the minimum.`) + value
    return t(`${input} 在 ${threshold} 的右边，电量超过要求。`,
      `${input} is to the right of ${threshold}, above the minimum.`) + value
  }
  const { input, run } = combine[step.index]
  if (step.stage === 'charge') return run?.comparison.value
    ? t(`先检查电量。${input} 格达到要求，所以第一项是 True（真）。`,
      `Check the charge first. ${input} units meets the minimum, so the first condition is True.`)
    : t(`先检查电量。${input} 格低于要求，所以第一项是 False（假）。`,
      `Check the charge first. ${input} units is below the minimum, so the first condition is False.`)
  if (step.stage === 'door') return run?.door.value
    ? t('接着检查安全门。门开着，所以第二项是 True（真）。',
      'Next check the safety door. The door is open, so the second condition is True.')
    : t('接着检查安全门。门关着，所以第二项是 False（假）。',
      'Next check the safety door. The door is closed, so the second condition is False.')
  if (run?.decision.value) return t('两项都是 True（真）。and 得到 True，芽芽可以出发。',
    'Both conditions are True. The and expression is True, so Sprout can leave.')
  return t('至少一项是 False（假）。and 得到 False，芽芽要等一等。',
    'At least one condition is False. The and expression is False, so Sprout waits.')
}

export function BooleanLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const { compare, combine } = useMemo(() => ({
    compare: collectExamples(execution, 'compare').sort((left, right) => left.input - right.input),
    combine: collectExamples(execution, 'combine'),
  }), [execution])
  const [position, setPosition] = useState(0)
  const ready = useRef(false)
  const threshold = execution.boolean?.threshold
  if (threshold === undefined) return null

  const steps: Step[] = [{ stage: 'start' }, ...compare.map((_, index) => ({ stage: 'compare' as const, index })),
    ...combine.flatMap((_, index) => combineStages.map(stage => ({ stage, index })))]
  const step = steps[position]
  const onAxis = step.stage === 'start' || step.stage === 'compare'
  const example = onAxis ? undefined : combine[step.index]
  const error = !compare.length || !combine.length || [...compare, ...combine].some(item => !item.run)
  const heading = onAxis ? t(`电量达到 ${threshold} 格了吗？`, `Is the charge at least ${threshold}?`)
    : t('电量和安全门', 'Charge and the safety door')

  function goTo(next: number) {
    setPosition(next)
    if (next === steps.length - 1 && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  const lines = step.stage === 'compare' ? [compare[step.index].run?.comparison] : []
  if (example?.run && step.stage !== 'start' && step.stage !== 'compare') {
    const { comparison, door, decision } = example.run
    lines.push(comparison)
    if (step.stage !== 'charge') lines.push(door)
    if (step.stage === 'decision') lines.push(decision)
  }

  return <section className="classroom-demonstration panel boolean-lesson" aria-label={heading} data-testid="boolean-lesson"
    data-boolean-stage={step.stage} data-door-open={example?.doorOpen}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="boolean-navigation">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={error || position === steps.length - 1} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
      </div>
    </>}>
      <div className="panel-heading boolean-heading">
        <h2>{heading}</h2>
      </div>
      <div className="boolean-body">
        {!error && onAxis && <ComparisonInstrument state={{ locale, threshold, through: step.stage === 'compare' ? step.index : -1,
          samples: compare.map((item, i) => ({ input: item.input, value: step.stage === 'compare' && i <= step.index ? item.run?.comparison.value : undefined })) }}
          onPick={position < compare.length ? () => goTo(position + 1) : undefined} />}
        {!error && example?.run && !onAxis && <GateInstrument state={{ locale, threshold, fork: false, charge: example.input,
          enough: example.run.comparison.value, door: step.stage === 'charge' ? undefined : example.run.door.value,
          decision: step.stage === 'decision' ? example.run.decision.value : undefined,
          nextPick: step.stage === 'charge' ? 'door' : step.stage === 'door' ? 'and' : undefined }}
          onPick={() => goTo(position + 1)} />}
        {onAxis && <ChargeAxis examples={compare} threshold={threshold} through={step.stage === 'compare' ? step.index : -1} t={t} />}
        {example?.run && !onAxis && <ConditionFlow example={{ ...example, run: example.run }} stage={step.stage} t={t} />}
        {error ? <p className="error-message" role="alert">{t('这次没有得到可以展示的比较结果。', 'These examples did not produce results to compare.')}</p>
          : <p className="boolean-description" role="status">
            {explain(step, compare, combine, threshold, t)}
            {position === steps.length - 1 && t('在下面换一组电量和门的状态，试试预测芽芽能不能出发。',
              ' Try predicting whether Sprout can leave with a different charge and door state below.')}
          </p>}
        {lines.length > 0 && <ol className="boolean-source" data-testid="boolean-code" aria-label={t('Python 代码', 'Python code')}>
          {lines.map((line, index) => line && <li key={line.line} data-line={line.line}
            aria-current={index === lines.length - 1 ? 'step' : undefined}>
            <span aria-hidden="true">{line.line}</span>
            <code>{line.code.split(/(>=|\band\b)/u).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
