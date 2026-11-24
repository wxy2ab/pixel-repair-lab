import { ChargeInput, CodingDevice } from './CodingDevice'
import { AssignmentInstrument } from './ValueInstruments'
import { useMemo, useRef, useState } from 'react'
import { runProgramWalkthrough } from '../engine/programWalkthrough'
import { programSourceLines, type ProgramWalkthrough, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json, Locale } from '../shared/types'
import { runIssueText, tr } from './text'
import { StepCount } from './LessonFrame'
import { StepExplanation } from './LessonNotes'
import './assignment-lesson.css'

const stages = ['start', 'read', 'evaluate', 'store', 'output'] as const
type Stage = typeof stages[number]
type ComparisonStage = Extract<Stage, 'evaluate' | 'store' | 'output'>
type Translate = (zh: string, en: string) => string

function capture(source: string, input: number) {
  const { frames, issue } = runProgramWalkthrough(source, input, { traceAssignmentValues: true })
  const [read, store] = frames.filter(frame => frame.kind === 'assign')
  const evaluate = frames.find(frame => frame.kind === 'evaluate' && frame.line === store?.line)
  const output = frames.find(frame => frame.kind === 'output')
  const steps = !issue && read && store && evaluate && output
    ? { read, evaluate, store, output, source: programSourceLines(source) }
    : undefined
  return { steps, issue }
}

type AssignmentTrace = NonNullable<ReturnType<typeof capture>['steps']>

function binding(frame: ProgramWalkthroughFrame, name: string) {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

function format(value: Json | undefined) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function substitutedSum(trace: AssignmentTrace, variable: string) {
  const reading = binding(trace.evaluate, variable)
  const expression = trace.source[(trace.evaluate.line ?? 1) - 1]?.split('=').at(1)?.trim()
  const addition = expression?.match(/^([a-z_]\w*)\s*\+\s*(\d+)$/iu)
  return reading !== undefined && addition?.[1] === variable ? format(reading) + ' + ' + addition[2] : undefined
}

function VariableBox({ name, value, active, before, t }: { name: string; value?: Json; active?: boolean; before?: Json; t: Translate }) {
  return <div className="assignment-variable" data-binding={name} data-filled={value !== undefined || undefined}
    data-active={active || undefined}>
    <dt>{name}</dt>
    <dd>{active && <span className="assignment-before"><span className="sr-only">{t('写入前', 'Before writing')} </span>
      {before === undefined ? t('空', 'Empty') : format(before)} <span aria-hidden="true">→</span>
      <span className="sr-only"> {t('写入后', 'After writing')} </span></span>}
      <span>{value === undefined ? t('待存入', 'Empty') : format(value)}</span></dd>
  </div>
}

function CodeLine({ frame, source, current = false, highlight }: {
  frame: ProgramWalkthroughFrame; source: string[]; current?: boolean; highlight?: 'left' | 'right';
}) {
  const lineNumber = frame.line ?? 0
  const line = source[lineNumber - 1] ?? ''
  const equals = line.indexOf('=')
  const left = line.slice(0, equals)
  const right = line.slice(equals + 1)
  return <li data-line={lineNumber} aria-current={current ? 'step' : undefined}>
    <span aria-hidden="true">{lineNumber}</span>
    <code>{equals < 0 || !highlight ? line : <>
      {highlight === 'left' ? <mark data-highlight="left">{left}</mark> : left}
      {'='}
      {highlight === 'right' ? <mark data-highlight="right">{right}</mark> : right}
    </>}</code>
  </li>
}

function CompareLane({ variant, trace, stage, inputVariable, resultVariable, t }: {
  variant: 'new' | 'overwrite'; trace: AssignmentTrace; stage: ComparisonStage;
  inputVariable: string; resultVariable: string; t: Translate;
}) {
  const createsVariable = variant === 'new'
  const target = createsVariable ? resultVariable : inputVariable
  const current = trace[stage]
  const substituted = substitutedSum(trace, inputVariable)
  return <article className="assignment-lane" data-assignment-lane={variant}>
    <h3>{createsVariable ? t('存到新变量', 'Store in a new variable') : t('写回原变量', 'Write back to the original variable')}</h3>
    <dl className="assignment-boxes">
      <VariableBox name={inputVariable} value={binding(current, inputVariable)} before={binding(trace.evaluate, inputVariable)}
        active={stage === 'store' && !createsVariable} t={t} />
      {createsVariable && <VariableBox name={resultVariable} value={binding(current, resultVariable)}
        before={binding(trace.evaluate, resultVariable)} active={stage === 'store'} t={t} />}
    </dl>
    {stage === 'evaluate' && <div className="assignment-operations" data-evaluating>
      <span>{t('右边算出的值', 'Value from the right side')}</span>
      {substituted && <span className="assignment-expression">{substituted} <span aria-hidden="true">→</span></span>}
      <strong data-testid="assignment-rhs-value">{format(trace.evaluate.value)}</strong>
    </div>}
    {stage === 'store' && <p className="assignment-operations">
      {t('存入左边的', 'Store in')} <strong>{target}</strong>
    </p>}
    {stage === 'output' && <div className="assignment-operations">
      <span>{t('屏幕输出', 'Screen output')}</span><output data-testid="assignment-output">{trace.output.output.join(', ')}</output>
    </div>}
    <ol className="assignment-source" aria-label={t('Python 代码', 'Python code')}>
      <CodeLine frame={trace.read} source={trace.source} />
      <CodeLine frame={trace.store} source={trace.source} current={stage !== 'output'}
        highlight={stage === 'evaluate' ? 'right' : stage === 'store' ? 'left' : undefined} />
      {stage === 'output' && <CodeLine frame={trace.output} source={trace.source} current />}
    </ol>
  </article>
}

export function AssignmentLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const { assignment, source } = execution
  const input = execution.cases[0]?.input
  const overwriteSource = assignment?.overwriteSource
  const runs = useMemo(() => input === undefined || overwriteSource === undefined ? undefined : {
    new: capture(source, input),
    overwrite: capture(overwriteSource, input),
  }, [input, source, overwriteSource])
  const [index, setIndex] = useState(0)
  const ready = useRef(false)
  if (!assignment || input === undefined || !runs) return null

  const stage = stages[index]
  const left = runs.new.steps
  const right = runs.overwrite.steps
  const issue = runs.new.issue ?? runs.overwrite.issue
  const showComparison = stage === 'evaluate' || stage === 'store' || stage === 'output'
  const { inputVariable, resultVariable } = assignment
  const heading = t('给芽芽补电', 'Top up Sprout’s battery')
  const description = {
    start: t('点电池，看看起始电量会存进哪个带名字的格子。', 'Select the battery and see which named box receives its charge.'),
    read: t('程序把读到的 ' + input + ' 存在 ' + inputVariable + ' 格子里。用这个名字就能取到里面的数。',
      'The program stores the reading ' + input + ' in the box named ' + inputVariable + '. Use the name to get the number inside.'),
    evaluate: t('先算等号右边。两种写法都从原来的格子取数，算出的新电量这时还没存入变量。',
      'First calculate the right side of the equals sign. Both lines take the number from the original box. The new value is waiting to be stored.'),
    store: t('再把新电量存进等号左边的格子。存到 ' + resultVariable + ' 时，' + inputVariable + ' 里还是原电量。写回 ' + inputVariable + ' 时，同一个格子里现在是新电量。',
      'Next store the new value in the box on the left of the equals sign. Storing in ' + resultVariable + ' keeps the starting value in ' + inputVariable + '. Storing in ' + inputVariable + ' updates the same box.'),
    output: t('屏幕显示了新电量。下面换个起始电量，先猜猜每个格子里的数，再运行验证。',
      'The screen shows the new charge. Try another starting charge below. Predict what each box will hold and run the code to check.'),
  }[stage]

  function goTo(next: number) {
    setIndex(next)
    if (stages[next] === 'output' && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  function modelLane(trace: AssignmentTrace) {
    if (stage === 'start') return {}
    const frame = trace[stage]
    return {
      charge: format(binding(frame, inputVariable)),
      result: format(binding(frame, resultVariable)),
      pending: stage === 'evaluate' ? format(frame.value) : undefined,
      sum: stage === 'evaluate' ? substitutedSum(trace, inputVariable) : undefined,
      output: stage === 'output' ? frame.output.join(', ') : undefined,
    }
  }

  return <section className="classroom-demonstration panel assignment-lesson" aria-label={heading} data-testid="assignment-lesson" data-assignment-stage={stage}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="assignment-navigation">
        <button type="button" className="subtle-button" disabled={index === 0} onClick={() => goTo(index - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={!left || !right || index === stages.length - 1} onClick={() => goTo(index + 1)}>
          {t('下一步', 'Next step')}
        </button>
        <StepCount position={index} total={stages.length - 1} locale={locale} />
      </div>
    </>}>
      <div className="panel-heading assignment-heading">
        <h2>{heading}</h2>
      </div>
      <div className="assignment-body">
        {left && right && <AssignmentInstrument state={{ locale, input, inputName: inputVariable, resultName: resultVariable, stage,
          lanes: [modelLane(left), modelLane(right)] }}
          onPick={stage === 'start' || stage === 'evaluate' ? () => goTo(index + 1) : undefined} />}
        <div className="assignment-input-flow">
          <div className="assignment-input">
            <span>{t('起始电量', 'Starting charge')}</span>
            {left && right ? <ChargeInput value={input} locale={locale} onRead={() => goTo(1)} started={index > 0}
              className="assignment-battery" testId="assignment-input" /> : <strong data-testid="assignment-input">{input}</strong>}
          </div>
          {!showComparison && <>
            <span className="assignment-arrow" aria-hidden="true">→</span>
            <dl className="assignment-boxes">
              <VariableBox name={inputVariable} value={stage === 'read' && left ? binding(left.read, inputVariable) : undefined} active={stage === 'read'} t={t} />
            </dl>
          </>}
        </div>
        {stage === 'read' && left && <ol className="assignment-source" data-testid="assignment-code" aria-label={t('Python 代码', 'Python code')}>
          <CodeLine frame={left.read} source={left.source} current />
        </ol>}
        {showComparison && left && right && <div className="assignment-comparison" data-testid="assignment-code">
          <CompareLane variant="new" trace={left} stage={stage} inputVariable={inputVariable} resultVariable={resultVariable} t={t} />
          <CompareLane variant="overwrite" trace={right} stage={stage} inputVariable={inputVariable} resultVariable={resultVariable} t={t} />
          {stage === 'evaluate' && <button type="button" className="device-charge-key device-battery-trigger assignment-store"
            onClick={() => goTo(index + 1)}>{t('把两个结果分别写入左边的变量', 'Store each result in its left-hand variable')}</button>}
        </div>}
        <span className="sr-only" role="status">{description}</span>
        <StepExplanation locale={locale}>{description}</StepExplanation>
        {(!left || !right) && <p className="error-message" role="alert">{issue ? runIssueText(locale, issue)
          : t('这两段程序没有产生可以比较的结果。', 'These programs did not produce results to compare.')}</p>}
      </div>
    </CodingDevice>
  </section>
}
