import { CodingDevice } from './CodingDevice'
import { GateInstrument } from './ValueInstruments'
import { useMemo, useRef, useState } from 'react'
import { runBranchLesson } from '../engine/programBranch'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { Robot } from './Board'
import { tr } from './text'
import { StepCount } from './LessonFrame'
import './branch-lesson.css'

type Lesson = NonNullable<ProgramWalkthrough['branchLesson']>
type Run = NonNullable<ReturnType<typeof runBranchLesson>>
type Example = { input: number; doorOpen: boolean; run?: Run }
type Translate = (zh: string, en: string) => string
type Path = 'if' | 'else'

const stages = ['charge', 'door', 'condition', 'choice', 'action'] as const
type Stage = 'start' | typeof stages[number]
const paths = ['if', 'else'] as const

function Truth({ value, t }: { value: boolean; t: Translate }) {
  return <span className="branch-truth" data-value={value}>
    <code>{value ? 'True' : 'False'}</code><span>{value ? t('真', 'true') : t('假', 'false')}</span>
  </span>
}

function BranchDiagram({ lesson, locale, condition, selected, action, t }: {
  lesson: Lesson; locale: Locale; condition?: boolean; selected?: Path; action?: string; t: Translate;
}) {
  return <div className="branch-diagram" role="group" aria-label={t('出发分岔图', 'Departure fork')}>
    <div className="branch-start"><span className="branch-robot">{action === undefined && <Robot />}</span>
      <span>{t('补电站', 'Charging station')}</span></div>
    <div className="branch-approach" aria-hidden="true" />
    <div className="branch-question" data-branch-part="condition" data-value={condition}>
      <strong>{t('可以出发吗？', 'Can Sprout leave?')}</strong>
      {condition !== undefined && <Truth value={condition} t={t} />}
    </div>
    <div className="branch-tracks" aria-hidden="true">
      {paths.map(path => <span key={path} className="branch-track" data-track={path}
        data-selected={selected === path || undefined} />)}
    </div>
    <div className="branch-routes">
      {paths.map(path => {
        const chosen = selected === path
        const skipped = selected !== undefined && !chosen
        return <div key={path} className="branch-route" data-branch-path={path}
          data-selected={chosen || undefined} data-skipped={skipped || undefined}>
          <div className="branch-route-heading"><code>{path}</code>
            <span>{path === 'if' ? t('条件为真', 'Condition true') : t('条件为假', 'Condition false')}</span></div>
          <strong>{lesson.actions[path][locale]}</strong>
          <div className="branch-route-status">
            {chosen && (action === undefined ? <span>{t('走这条路', 'Chosen route')}</span>
              : <span className="branch-action" data-branch-action={action}>
                <span className="branch-robot"><Robot /></span><span>{t('芽芽执行', 'Sprout acts')}</span>
              </span>)}
            {skipped && <span>{t('略过', 'Skipped')}</span>}
          </div>
        </div>
      })}
    </div>
  </div>
}

function shownLines(stage: Stage, run: Run | undefined) {
  if (!run || stage === 'start') return []
  const revealed: { line: number; code: string }[] = [run.comparison]
  if (stage === 'charge') return revealed
  revealed.push(run.door)
  if (stage === 'door') return revealed
  revealed.push(run.condition)
  if (stage === 'condition') return revealed
  revealed.push(run.guard)
  if (run.choice.line !== run.guard.line) revealed.push(run.choice)
  if (stage === 'action') revealed.push(run.action)
  return revealed
}

function caption(stage: Stage, example: Example | undefined, lesson: Lesson, t: Translate) {
  const run = example?.run
  if (!example || !run || stage === 'start') {
    return t('芽芽来到分岔口。点「下一步」，从检查电量开始。', 'Sprout reaches a fork. Choose Next step to check the charge first.')
  }
  if (stage === 'charge') return run.comparison.value
    ? t(`补电后有 ${example.input} 格，达到了 ${lesson.threshold} 格的要求。`,
      `After charging, ${example.input} units meets the minimum of ${lesson.threshold}.`)
    : t(`补电后有 ${example.input} 格，低于 ${lesson.threshold} 格的要求。`,
      `After charging, ${example.input} units is below the minimum of ${lesson.threshold}.`)
  if (stage === 'door') return run.door.value
    ? t('安全门开着，门的检查结果为真。', 'The safety door is open, so the door check is true.')
    : t('安全门关着，门的检查结果为假。', 'The safety door is closed, so the door check is false.')
  if (stage === 'condition') return run.condition.value
    ? t('电量和安全门都通过检查，and 的结果为真。', 'Both checks pass, so the and expression is true.')
    : t('有一项检查为假，and 的结果为假。', 'A check is false, so the and expression is false.')
  if (stage === 'choice') return run.choice.path === 'if'
    ? t('条件为真，程序选择 if 下面的路。', 'The condition is true, so the program chooses the if branch.')
    : t('条件为假，程序选择 else 下面的路。', 'The condition is false, so the program chooses the else branch.')
  return t('高亮的代码在选中的分支里，芽芽接着执行这一行。',
    'The highlighted line belongs to the chosen branch. Sprout runs it next.')
}

export function BranchLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const examples = useMemo(() => execution.cases.flatMap(({ input, doorOpen, activity }): Example[] =>
    activity === 'branch' && doorOpen !== undefined
      ? [{ input, doorOpen, run: runBranchLesson(execution.source, input, doorOpen) }] : []), [execution])
  const [position, setPosition] = useState(0)
  const ready = useRef(false)
  const lesson = execution.branchLesson
  if (!lesson) return null

  const finalPosition = examples.length * stages.length
  const atEnd = position === finalPosition
  const stage: Stage = position === 0 ? 'start' : stages[(position - 1) % stages.length]
  const example = position === 0 ? undefined : examples[Math.floor((position - 1) / stages.length)]
  const run = example?.run
  const selected = stage === 'choice' || stage === 'action' ? run?.choice.path : undefined
  const condition = stage === 'condition' || selected !== undefined ? run?.condition.value : undefined
  const charge = run?.comparison.value
  const door = stage === 'charge' ? undefined : run?.door.value
  const action = stage === 'action' ? run?.action.value : undefined
  const code = shownLines(stage, run)
  const error = !examples.length || examples.some(item => !item.run)
  const title = t('芽芽该走哪条路？', 'Which path should Sprout take?')

  function goTo(next: number) {
    setPosition(next)
    if (next === finalPosition && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  return <section className="classroom-demonstration panel branch-lesson" aria-label={title} data-testid="branch-lesson"
    data-branch-stage={stage} data-door-open={example?.doorOpen}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="branch-navigation">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={error || atEnd} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
        <StepCount position={position} total={finalPosition} locale={locale} />
      </div>
    </>}>
      <div className="panel-heading branch-heading">
        <h2>{title}</h2>
      </div>
      <div className="branch-body">
        {!error && <GateInstrument state={{ locale, threshold: lesson.threshold, fork: true, charge: example?.input,
          enough: charge, door, decision: condition, selected, action,
          nextPick: stage === 'start' ? 'charge' : stage === 'charge' ? 'door' : stage === 'door' || stage === 'condition' ? 'and'
            : stage === 'choice' ? 'route' : undefined }} onPick={() => goTo(position + 1)} />}
        <BranchDiagram lesson={lesson} locale={locale} condition={condition} selected={selected} action={action} t={t} />
        {example && <div className="branch-checks">
          <div className="branch-check" data-branch-part="charge" data-value={charge} data-active={stage === 'charge' || undefined}>
            <span>{t('补电后', 'After charging')} <strong>{t(`${example.input} 格`, `${example.input} units`)}</strong></span>
            {charge !== undefined && <Truth value={charge} t={t} />}
          </div>
          <div className="branch-check" data-branch-part="door" data-value={door} data-active={stage === 'door' || undefined}>
            <span>{t('安全门', 'Safety door')} <strong>{door === undefined ? t('等待检查', 'Waiting to check')
              : door ? t('开着', 'Open') : t('关着', 'Closed')}</strong></span>
            {door !== undefined && <Truth value={door} t={t} />}
          </div>
        </div>}
        {error ? <p className="error-message" role="alert">{t('这次没有得到可以展示的分支结果。', 'These examples did not produce a branch to show.')}</p>
          : <p className="branch-description" role="status">
            {caption(stage, example, lesson, t)}
            {atEnd && t('在下面换一组电量和安全门状态，再预测会走哪条分支。',
              ' Try predicting the branch with a new charge and door state below.')}
          </p>}
        {code.length > 0 && <ol className="branch-source" data-testid="branch-code" aria-label={t('Python 代码', 'Python code')}>
          {code.map(({ line, code: source }, index) => <li key={line} data-line={line}
            aria-current={index === code.length - 1 ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span>
            <code>{source.split(/(>=|\band\b|\bif\b|\belse\b)/u).map((word, part) =>
              part % 2 ? <mark key={part}>{word}</mark> : word)}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
