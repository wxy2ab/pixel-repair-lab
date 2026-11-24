import { CodingDevice } from './CodingDevice'
import { LoopInstrument } from './LoopInstrument'
import { useMemo, useRef, useState } from 'react'
import { runNestedLoopsLesson, type NestedLoopsStep } from '../engine/programNestedLoops'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { StepCount } from './LessonFrame'
import './for-lesson.css'
import './nested-loops-lesson.css'

type Translate = (zh: string, en: string) => string

function describe(step: NestedLoopsStep | undefined, increment: number, t: Translate) {
  if (!step) return t('电池上的数字是它还剩几格电。点「下一步」，跟着芽芽给它们补电。',
    'Each battery shows how much charge it has. Choose Next step to help Sprout charge them.')

  const { rowIndex, batteryIndex, charge, charged } = step
  switch (step.kind) {
    case 'load':
      return t('程序读入每排的起始电量。大列表里，每个小列表对应架子上的一排。',
        'The program reads the starting charges. Each small list inside the main list represents one row on the rack.')
    case 'initialize':
      return t('先准备一个空的总结果列表。每补完一排，就把整排的新电量放进去。',
        'Start with an empty results list. Once a whole row is charged, save its new charges here.')
    case 'select-row':
      return rowIndex === 0
        ? t('外层循环选中第一排。内层循环接下来只处理这一排。', 'The outer loop selects the first row. The inner loop will work on this row.')
        : t(`外层循环换到第 ${(rowIndex ?? 0) + 1} 排。内层循环重新从这一排找电池。`,
          `The outer loop moves on to row ${(rowIndex ?? 0) + 1}. The inner loop starts over in this row.`)
    case 'initialize-row':
      return t('给当前排准备一个新的空列表，等着记录每块电池补完后的电量。',
        'Start a fresh list for this row. It will hold each battery’s charge after it is topped up.')
    case 'take':
      return t(`内层循环取出当前排的第 ${(batteryIndex ?? 0) + 1} 块，charge 暂时是 ${charge}。`,
        `The inner loop takes battery ${(batteryIndex ?? 0) + 1} from this row. The variable charge now holds ${charge}.`)
    case 'charge':
      return t(`把 ${charge} 加 ${increment} 格，得到 ${charged}。把新电量加到当前排的记录里。`,
        `Add ${increment} to ${charge} to get ${charged}. Append the new charge to the current row’s list.`)
    case 'finish-row':
      return step.currentRow?.length === 0
        ? t('这一排是空的，内层循环没有补电，留下一个空列表。', 'This row is empty. The inner loop charges no batteries and leaves an empty list.')
        : t('当前排没有下一块了。内层循环结束，整排的新电量已经记好。',
          'There is no next battery in this row. The inner loop ends with the whole row’s new charges ready.')
    case 'record-row':
      return t('把当前排的整个列表存进总结果。接下来回到外层循环，看还有没有下一排。',
        'Save this whole row’s list. Then the outer loop checks for another row.')
    case 'stop':
      return t('没有下一排了。外层循环结束，接着执行两个循环外面的指令。',
        'There is no next row. The outer loop ends, and the program moves to the line outside both loops.')
    case 'output':
      return t('程序显示每排补完电的结果。换一组电池，先猜一共补几次、每排补完会是什么样。',
        'The program displays the finished rows. Try a new rack and predict the number of charges and the result for each row.')
  }
}

function BatteryRack({ rows, step, t }: { rows: number[][]; step?: NestedLoopsStep; t: Translate }) {
  return <ol className="nested-rack" aria-label={t('电池架', 'Battery rack')}>
    {rows.map((row, rowIndex) => {
      const active = step?.rowIndex === rowIndex
      const recorded = step?.rows[rowIndex]
      const current = recorded ?? (active ? step?.currentRow : undefined)

      return <li className="nested-rack-row" key={rowIndex} data-row-index={rowIndex}
        data-active={active || undefined} data-complete={recorded !== undefined || undefined}
        aria-current={active ? 'step' : undefined}>
        <div className="nested-row-heading">
          <strong>{t(`第 ${rowIndex + 1} 排`, `Row ${rowIndex + 1}`)}</strong>
          {recorded !== undefined ? <span>{t('已记录', 'Saved')}</span>
            : active && <span>{t('当前排', 'Current row')}</span>}
        </div>
        {row.length > 0 ? <ol className="nested-batteries" aria-label={t(`第 ${rowIndex + 1} 排的电池`, `Batteries in row ${rowIndex + 1}`)}>
          {row.map((value, batteryIndex) => {
            const focused = active && step?.batteryIndex === batteryIndex
            const charge = current?.[batteryIndex] ?? value
            return <li key={batteryIndex} data-battery-index={batteryIndex} data-charge={charge}
              data-active={focused || undefined} data-charged={current?.[batteryIndex] !== undefined || undefined}
              data-added={(focused && step?.kind === 'charge') || undefined} aria-current={focused ? 'step' : undefined}>
              <span className="for-battery">{charge}</span>
              <span className="nested-battery-label">{t(`第 ${batteryIndex + 1} 块`, `Battery ${batteryIndex + 1}`)}</span>
            </li>
          })}
        </ol> : <p className="nested-empty-row">{t('这排没有电池', 'No batteries in this row')}</p>}
      </li>
    })}
  </ol>
}

export function NestedLoopsLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const lesson = execution.nestedLoops
  const example = lesson?.cases[0]
  const { source } = execution
  const run = useMemo(() => example && runNestedLoopsLesson(source, example.rows), [example, source])
  const [position, setPosition] = useState(0)
  const ready = useRef(false)
  if (!lesson || !example) return null

  const step = run?.steps[position - 1]
  const next = run?.steps[position]
  const stage = step?.kind ?? 'start'
  const revealed = [...new Map(run?.steps.slice(0, position).map(({ line, code }) => [line, code]))]
    .sort(([first], [second]) => first - second)
  const title = t('给几排电池补电', 'Charge several rows of batteries')

  function goTo(next: number) {
    setPosition(next)
    if (run?.steps[next - 1]?.kind === 'output' && !ready.current) {
      ready.current = true
      onReady()
    }
  }

  return <section className="classroom-demonstration panel nested-loops-lesson" aria-label={title}
    data-testid="nested-loops-lesson" data-nested-stage={stage}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <div className="nested-navigation">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="primary-button" disabled={!run || position >= run.steps.length} onClick={() => goTo(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
        <StepCount position={position} total={run?.steps.length ?? 0} locale={locale} />
      </div>
    </>}>
      <div className="panel-heading nested-loop-heading">
        <h2>{title}</h2>
      </div>
      <div className="nested-loop-body">
        <LoopInstrument state={{ mode: 'nested', locale, rows: example.rows, saved: step?.rows ?? [], step, next, increment: lesson.increment }}
          onPick={id => { if (next && (id === 'select-row' || id === 'take') && id === next.kind) goTo(position + 1) }} />
        <BatteryRack rows={example.rows} step={step} t={t} />
        {run ? <>
          <dl className="for-values nested-loop-values">
            <div data-active={stage === 'charge' || undefined}>
              <dt>{t('补电次数', 'Charges so far')}</dt>
              <dd data-testid="nested-loops-rounds">{step?.rounds ?? 0}</dd>
            </div>
            {stage === 'charge' && <div data-active>
              <dt>{t('这块电池', 'This battery')}</dt>
              <dd><span>{step?.charge} + {lesson.increment} →</span> <strong>{step?.charged}</strong></dd>
            </div>}
            {step && stage !== 'load' && stage !== 'output' && <div data-active={stage === 'record-row' || undefined}>
              <dt>{t('已记录的各排电量', 'Saved rows')}</dt>
              <dd data-testid="nested-loops-saved">{JSON.stringify(step.rows)}</dd>
            </div>}
            {stage === 'output' && <div data-active>
              <dt>{t('屏幕输出', 'Program output')}</dt>
              <dd><output data-testid="nested-loops-output">{run.output}</output></dd>
            </div>}
          </dl>
          <p className="nested-description" role="status">{describe(step, lesson.increment, t)}</p>
        </> : <p className="error-message" role="alert">{t('这次没有得到可以展示的补电结果。', 'The program did not produce a charging trace to show.')}</p>}
        {revealed.length > 0 && <ol className="for-source" data-testid="nested-loops-code" aria-label={t('Python 代码', 'Python code')}>
          {revealed.map(([line, code]) => <li key={line} data-line={line} aria-current={line === step?.line ? 'step' : undefined}>
            <span aria-hidden="true">{line}</span><code>{code}</code>
          </li>)}
        </ol>}
      </div>
    </CodingDevice>
  </section>
}
