import { CodingDevice } from './CodingDevice'
import { LoopInstrument } from './LoopInstrument'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { runWhileLesson } from '../engine/programWhile'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { StepCount } from './LessonFrame'
import './while-lesson.css'

type Run = NonNullable<ReturnType<typeof runWhileLesson>>
type Step = Run['steps'][number]
type Stage = Step['kind'] | 'start'
type Translate = (zh: string, en: string) => string

function BatteryMeter({ current, target, limit, t }: {
  current: number; target: number; limit: number; t: Translate;
}) {
  const style = { '--while-fill': `${100 * current / limit}%`, '--while-target': `${100 * target / limit}%` } as CSSProperties
  return <section className="while-meter-panel" data-ready={current >= target}>
    <div className="while-meter-labels">
      <span>{t('当前电量', 'Current charge')} <strong data-testid="while-charge">{current}</strong> {t('格', current === 1 ? 'unit' : 'units')}</span>
      <span className="while-target-label">{t('目标', 'Target')} {target} {t('格', target === 1 ? 'unit' : 'units')}</span>
    </div>
    <div className="while-meter" style={style} role="meter" aria-label={t('电池电量', 'Battery charge')}
      aria-valuenow={current} aria-valuemin={0} aria-valuemax={limit}
      aria-valuetext={t(`${current} 格，目标 ${target} 格`, `${current} units, target ${target}`)}>
      <span className="while-meter-fill" />
      <span className="while-meter-target" />
    </div>
    <div className="while-meter-scale" aria-hidden="true"><span>0</span><span>{limit}</span></div>
  </section>
}

function LoopPath({ stage, condition, rounds, increment, canCharge, onCharge, t }: {
  stage: Stage; condition?: boolean; rounds: number; increment: number; canCharge: boolean; onCharge: () => void; t: Translate;
}) {
  return <section className="while-route" aria-label={t('循环路线', 'Loop path')}>
    <div className="while-check-node" data-active={stage === 'check' || stage === 'stop' || undefined}>
      <strong>{t('还需要补电吗？', 'Does it need more charge?')}</strong>
      {condition !== undefined && stage !== 'charge' && <span className="while-predicate" data-truth={condition}>
        {condition ? t('True · 真', 'True') : t('False · 假', 'False')}
      </span>}
    </div>
    <div className="while-branches" aria-hidden="true">
      <span data-active={condition === true || undefined}>{t('为真', 'True')}</span>
      <span data-active={condition === false || undefined}>{t('为假', 'False')}</span>
    </div>
    <div className="while-nodes">
      <div className="while-route-node" data-while-path="charge" data-active={condition === true || undefined}
        data-current={stage === 'charge' || undefined}>
        {canCharge
          ? <button type="button" className="device-charge-key device-battery-trigger" onClick={onCharge}>
            {t(`补 ${increment} 格`, `Add ${increment} ${increment === 1 ? 'unit' : 'units'}`)}
          </button>
          : <strong>{t(`补 ${increment} 格`, `Add ${increment} ${increment === 1 ? 'unit' : 'units'}`)}</strong>}
        <span className="while-return" data-active={stage === 'charge' || (stage === 'check' || stage === 'stop') && rounds > 0 || undefined}>
          <span aria-hidden="true">↶</span>{t('回到判断', 'Check again')}
        </span>
      </div>
      <div className="while-route-node" data-while-path="exit" data-active={condition === false || undefined}
        data-current={stage === 'output' || undefined}>
        <strong>{t('结束循环', 'Exit the loop')}</strong>
        <span>{t('继续执行循环外的代码', 'Continue outside the loop')}</span>
      </div>
    </div>
  </section>
}

function describe(step: Step | undefined, previous: Step | undefined, run: Run, threshold: number,
  increment: number, demo: number, t: Translate) {
  if (!step) return demo === 0
    ? t('点「下一步」，先读出电池的起始电量。', 'Choose Next step to read the starting charge.')
    : t('这次的起始电量已经达标。往下看第一次检查会怎么做。', 'This time the starting charge meets the target. See what happens at the first check.')

  const { charge, rounds } = step
  switch (step.kind) {
    case 'load':
      return t(`程序把起始电量 ${charge} 存入 ${run.variable}，接下来检查要不要补电。`,
        `The program stores the starting charge of ${charge} in ${run.variable}. Next it checks whether to charge.`)
    case 'check':
      return t(`${charge} 格低于目标 ${threshold} 格。条件为 True，进入第 ${rounds + 1} 轮。`,
        `The charge of ${charge} is below the target of ${threshold}. The condition is True, so round ${rounds + 1} starts.`)
    case 'charge':
      return t(`第 ${rounds} 轮补 ${increment} 格，电量从 ${previous?.charge ?? charge} 变成 ${charge}。接下来回到条件判断。`,
        `Round ${rounds} adds ${increment} to bring the charge from ${previous?.charge ?? charge} to ${charge}. The program goes back to check again.`)
    case 'stop':
      return rounds === 0
        ? t(`第一次检查时，${charge} 格已经达到目标 ${threshold} 格。条件为 False，循环体执行 0 轮。`,
          `At the first check, the charge of ${charge} already meets the target of ${threshold}. The condition is False, so the loop runs 0 times.`)
        : t(`${charge} 格已经达到目标 ${threshold} 格。条件为 False，循环在 ${rounds} 轮后结束。`,
          `The charge of ${charge} meets the target of ${threshold}. The condition is False, so the loop exits after ${rounds} ${rounds === 1 ? 'round' : 'rounds'}.`)
    case 'output':
      return demo === 0
        ? t(`循环外的代码显示最终电量 ${charge} 格。点「下一步」，试试起始就达标的情况。`,
          `The line outside the loop shows a final charge of ${charge}. Choose Next step to try starting with enough charge.`)
        : t('循环外的代码显示最终电量。下面换个起始电量，预测循环次数和最终电量。',
          'The line outside the loop shows the final charge. Choose a new starting charge below, then predict the count and final charge.')
  }
}

export function WhileLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const lesson = execution.whileLoop
  const { cases, source } = execution
  const demos = useMemo(() => cases.slice(0, 2).map(({ input }) => ({
    input, run: runWhileLesson(source, input),
  })), [cases, source])
  const [position, setPosition] = useState(0)
  const ready = useRef(false)
  if (!lesson || !demos.length) return null

  const scenes = demos.flatMap(({ run }, demoIndex) => [
    { demoIndex, stepIndex: -1 },
    ...(run?.steps.map((_, stepIndex) => ({ demoIndex, stepIndex })) ?? []),
  ])
  const scene = scenes[position] ?? scenes[0]
  const { input, run } = demos[scene.demoIndex]
  const step = run?.steps[scene.stepIndex]
  const previous = run?.steps[scene.stepIndex - 1]
  const stage = step?.kind ?? 'start'
  const current = step?.charge ?? input
  const rounds = step?.rounds ?? 0
  const visited = run?.steps.slice(0, scene.stepIndex + 1) ?? []
  const condition = visited.findLast(item => item.condition !== undefined)?.condition
  const code = new Map(visited.map(({ line, code }) => [line, code]))
  const limit = Math.max(lesson.threshold + lesson.increment, ...demos.map(demo => demo.run?.finalCharge ?? demo.input))
  const valid = demos.length === 2 && demos.every(demo => demo.run)
  const title = t('补电到达标为止', 'Charge until the battery meets the target')
  const canCharge = run?.steps[scene.stepIndex + 1]?.kind === 'charge'

  function goTo(next: number) {
    setPosition(next)
    if (next === scenes.length - 1 && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  return <section className="classroom-demonstration panel while-lesson" aria-label={title} data-testid="while-lesson"
    data-while-stage={stage} data-demo-index={scene.demoIndex} data-condition={step?.condition}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="while-navigation">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={!valid || position >= scenes.length - 1} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
        <StepCount position={position} total={scenes.length - 1} locale={locale} />
      </div>
    </>}>
      <div className="panel-heading while-heading">
        <h2>{title}</h2>
      </div>
      <div className="while-body">
        <LoopInstrument state={{ mode: 'while', locale, current, limit, target: lesson.threshold, step, canCharge }}
          onPick={id => { if (canCharge && id === 'charge') goTo(position + 1) }} />
        <BatteryMeter current={current} target={lesson.threshold} limit={limit} t={t} />
        <LoopPath stage={stage} condition={condition} rounds={rounds} increment={lesson.increment}
          canCharge={canCharge} onCharge={() => goTo(position + 1)} t={t} />
        {step && <dl className="while-values">
          <div data-active={stage === 'stop' || undefined}>
            <dt>{t('已完成的轮数', 'Completed rounds')}</dt>
            <dd data-testid="while-rounds">{rounds}</dd>
          </div>
          {stage === 'output' && <div data-active>
            <dt>{t('屏幕输出', 'Program output')}</dt>
            <dd><output data-testid="while-output">{run?.output}</output></dd>
          </div>}
        </dl>}
        {valid && run
          ? <p className="while-description" role="status">{describe(step, previous, run, lesson.threshold, lesson.increment, scene.demoIndex, t)}</p>
          : <p className="error-message" role="alert">{t('这次没有得到可以展示的循环结果。', 'This program did not produce a loop trace to show.')}</p>}
        {code.size > 0 && <ol className="while-source" data-testid="while-code" aria-label={t('Python 代码', 'Python code')}>
          {Array.from(code, ([line, content]) => <li key={line} data-line={line}
            aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{content}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
