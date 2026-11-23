import { CodingDevice } from './CodingDevice'
import { LoopInstrument } from './LoopInstrument'
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { runForLesson } from '../engine/programFor'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './for-lesson.css'

type Run = NonNullable<ReturnType<typeof runForLesson>>
type Step = Run['steps'][number]
type Translate = (zh: string, en: string) => string

function describe(step: Step | undefined, run: Run, increment: number, t: Translate) {
  if (!step) {
    return t('点「下一步」，跟着芽芽依次给电池补电。', 'Choose Next step and help Sprout charge the batteries in order.')
  }

  const { charge, calculated, index } = step
  switch (step.kind) {
    case 'load':
      return t('程序读到这一排电池的起始电量。列表里的位置就是取电池的顺序。', 'The program reads the starting charges. It will visit the batteries in list order.')
    case 'initialize':
      return t('先准备一个空列表，等每块电池补完电，再把新电量放进去。', 'Start with an empty results list. Each new charge will go into it after that battery is charged.')
    case 'take':
      return t(`取出第 ${(index ?? 0) + 1} 块电池的电量 ${charge}。这一轮，循环变量 ${run.variable} 就是 ${charge}。`,
        `Take ${charge} from battery ${(index ?? 0) + 1}. The loop variable ${run.variable} holds ${charge} this round.`)
    case 'add':
      return t(`这一轮计算 ${charge} + ${increment}，得到 ${calculated}，准备把它记下来。`,
        `This round calculates ${charge} + ${increment} and gets ${calculated}, ready to record.`)
    case 'record':
      return t(`把新电量 ${calculated} 加到结果列表末尾。这一轮完成了。`,
        `Append the new charge, ${calculated}, to the end of the results list. This round is complete.`)
    case 'stop':
      return t(`已经没有下一块电池了。循环在 ${run.rounds} 轮后结束，接着执行循环外的指令。`,
        `There is no next battery. The loop finishes after ${run.rounds} ${run.rounds === 1 ? 'round' : 'rounds'}, and the program continues outside the loop.`)
    case 'output':
      return t('这行在循环外，所以整排电池都补完后才显示结果。下面换一排电池来预测。',
        'This line is outside the loop, so it displays the results after all the batteries are charged. Predict what happens with a new row below.')
  }
}

function BatteryRow({ batteries, active, recorded, nextIndex, onTake, t }: {
  batteries: number[]; active?: number; recorded: number; nextIndex?: number; onTake: () => void; t: Translate;
}) {
  return <ol className="for-row for-batteries" aria-label={t('等待补电的电池', 'Batteries to charge')}>
    {batteries.map((value, index) => <li key={index} data-battery-index={index}
      data-active={index === active || undefined} data-complete={index < recorded || undefined}
      aria-current={index === active ? 'step' : undefined}>
      {index === nextIndex
        ? <button type="button" className="device-charge-key device-battery-trigger" onClick={onTake}
          aria-label={t(`取第 ${index + 1} 块电池的电量 ${value}`, `Read charge ${value} from battery ${index + 1}`)}>
          <span className="for-battery">{value}</span><small>{t('取电量', 'Read')}</small>
        </button>
        : <span className="for-battery">{value}</span>}
      <span className="for-battery-number">{t(`第 ${index + 1} 块`, `Battery ${index + 1}`)}</span>
    </li>)}
  </ol>
}

function ResultRow({ size, results, active, recording, onRecord, t }: {
  size: number; results: number[]; active?: number; recording?: number; onRecord: () => void; t: Translate;
}) {
  return <ol data-testid="for-results" className="for-row for-results" aria-label={t('记录的新电量', 'Recorded new charges')}>
    {Array.from({ length: size }, (_, index) => <li key={index} data-result-index={index}
      data-value={results[index]} data-active={index === active || undefined}>
      {index === results.length && recording !== undefined
        ? <button type="button" className="device-charge-key device-battery-trigger" onClick={onRecord}>
          {t(`记下 ${recording}`, `Record ${recording}`)}
        </button>
        : results[index] === undefined ? <span aria-label={t('尚未记录', 'Not recorded yet')}>—</span> : results[index]}
    </li>)}
  </ol>
}

export function ForLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const lesson = execution.forLoop
  const example = lesson?.cases[0]
  const source = execution.source
  const run = useMemo(() => example && runForLesson(source, example.batteries), [example, source])
  const [position, setPosition] = useState(0)
  const ready = useRef(false)
  if (!lesson || !example) return null

  const step = run?.steps[position - 1]
  const nextStep = run?.steps[position]
  const stage = step?.kind ?? 'start'
  const done = stage === 'stop' || stage === 'output'
  const result = step?.results ?? []
  const code = run ? new Map(run.steps.slice(0, position).map(({ line, code }) => [line, code])) : new Map<number, string>()
  const title = t('给一排电池补电', 'Charge a row of batteries')
  const rowStyle = { '--for-columns': Math.max(1, example.batteries.length) } as CSSProperties

  function goTo(next: number) {
    setPosition(next)
    if (run && next === run.steps.length && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  return <section className="classroom-demonstration panel for-lesson" aria-label={title} data-testid="for-lesson" data-for-stage={stage}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="for-navigation">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={!run || position >= run.steps.length} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
      </div>
    </>}>
      <div className="panel-heading for-heading">
        <h2>{title}</h2>
      </div>
      <div className="for-body">
        <LoopInstrument state={{ mode: 'for', locale, batteries: example.batteries, step, next: nextStep, increment: lesson.increment }}
          onPick={id => {
            if ((id === 'read' && nextStep?.kind === 'take') || (id === 'record' && nextStep?.kind === 'record')) goTo(position + 1)
          }} />
        <div className="for-board" style={rowStyle}>
          <h3>{t('起始电量', 'Starting charges')}</h3>
          <BatteryRow batteries={example.batteries} active={step?.index} recorded={result.length}
            nextIndex={nextStep?.kind === 'take' ? nextStep.index : undefined} onTake={() => goTo(position + 1)} t={t} />
          {run && step && stage !== 'load' && <div className="for-board-results">
            <h3>{t('记录的新电量', 'Recorded new charges')}</h3>
            <ResultRow size={example.batteries.length} results={result} active={stage === 'record' ? step.index : undefined}
              recording={nextStep?.kind === 'record' ? step.calculated : undefined} onRecord={() => goTo(position + 1)} t={t} />
          </div>}
        </div>
        {run && step && (step.charge !== undefined || done) && <dl className="for-values">
          {step.charge !== undefined && <div data-active={stage === 'take' || undefined}>
            <dt>{t('循环变量', 'Loop variable')} <code>{run.variable}</code></dt>
            <dd data-testid="for-variable">{step.charge}</dd>
          </div>}
          {step.calculated !== undefined && <div data-active={stage === 'add' || undefined}>
            <dt>{t('这轮的新电量', 'New charge this round')}</dt>
            <dd><span>{step.charge} + {lesson.increment} →</span> <strong data-testid="for-calculation">{step.calculated}</strong></dd>
          </div>}
          {done && <div data-active={stage === 'stop' || undefined}>
            <dt>{t('循环次数', 'Loop rounds')}</dt>
            <dd data-testid="for-rounds">{run.rounds}</dd>
          </div>}
          {stage === 'output' && <div data-active>
            <dt>{t('屏幕输出', 'Program output')}</dt>
            <dd><output data-testid="for-output">{run.output}</output></dd>
          </div>}
        </dl>}
        {run ? <p className="for-description" role="status">{describe(step, run, lesson.increment, t)}</p>
          : <p className="error-message" role="alert">{t('这次没有得到可以展示的循环结果。', 'This program did not produce a loop trace to show.')}</p>}
        {code.size > 0 && <ol className="for-source" data-testid="for-code" aria-label={t('Python 代码', 'Python code')}>
          {Array.from(code, ([line, content]) => <li key={line} data-line={line}
            aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{content}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
