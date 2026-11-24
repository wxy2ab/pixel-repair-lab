import { CodingDevice } from './CodingDevice'
import { TraceRack } from './ProgramFlowBenches'
import { useState, type CSSProperties } from 'react'
import { repairDebuggingSource, runDebuggingLesson } from '../engine/programDebugging'
import { programSourceLines, type ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { StepCount } from './LessonFrame'
import './for-lesson.css'
import './debugging-lesson.css'

type Run = NonNullable<ReturnType<typeof runDebuggingLesson>>
type Step = Run['steps'][number]
type Phase = 'single' | 'row' | 'repair'
type Translate = (zh: string, en: string) => string

function describe(step: Step | undefined, phase: Phase, increment: number, t: Translate) {
  if (!step) return phase === 'single'
    ? t(`每块电池补 ${increment} 格。先用一块试跑，看看屏幕会显示什么。`,
      `Add ${increment} units to each battery. Try one battery first and see what the program displays.`)
    : t('现在换成一排电池。逐步运行刚才的程序，看看每块电池会怎样变化。',
      'Try a whole row of batteries. Step through the same program and watch each battery.')

  switch (step.kind) {
    case 'define': return t('程序先记下补电函数的定义。调用时再执行函数里的指令。',
      'The program saves the charging function. Its instructions will run when it is called.')
    case 'load': return t('程序读入起始电量，按摆放顺序存成一个列表。',
      'The program reads the starting charges into a list in battery order.')
    case 'call': return t('把这组起始电量交给补电函数。', 'Pass these starting charges to the charging function.')
    case 'initialize': return t('先准备一个空列表，用来记录补完后的电量。',
      'The function starts with an empty list for the new charges.')
    case 'take': return t(`循环取出第 ${(step.batteryIndex ?? 0) + 1} 块电池的电量 ${step.charge}。`,
      `The loop takes the charge ${step.charge} from battery ${(step.batteryIndex ?? 0) + 1}.`)
    case 'charge': return t(`${step.charge} 加 ${increment} 格得到 ${step.charged}，把它记下来。`,
      `Add ${increment} to ${step.charge} to get ${step.charged}, and record that charge.`)
    case 'return': return phase === 'single'
      ? t('函数把已经记下的电量交回主程序。', 'The function hands the recorded charge back to the main program.')
      : t('函数在第一轮就交回了结果。看看其余电池的电量有没有变化。',
        'The function sends its result back during the first turn. Look at the charges of the remaining batteries.')
    case 'store': return t('主程序把拿到的补电记录存起来。', 'The main program saves the list it received.')
    case 'finish-loop': return t('循环已经处理完整排电池。', 'The loop has processed every battery in the row.')
    case 'output': return phase === 'single'
      ? t('只有一块电池时，实际结果和预期一样。换一排看看。',
        'With one battery, the result matches what we expected. Try a whole row next.')
      : t('实际结果只有第一块。点选让函数提前结束的那行代码。',
        'Only the first battery appears in the result. Select the line that ended the function early.')
  }
}

function BatteryRow({ batteries, step, recorded, t }: {
  batteries: number[]; step?: Step; recorded: number[]; t: Translate;
}) {
  const columns = { '--debug-columns': Math.max(1, Math.min(3, batteries.length)) } as CSSProperties
  return <ol className="for-row for-batteries debug-batteries" data-testid="debug-batteries" style={columns}
    aria-label={t('电池电量', 'Battery charges')}>
    {batteries.map((starting, index) => {
      const charged = recorded[index] !== undefined
      const active = index === step?.batteryIndex
      const charge = recorded[index] ?? starting
      return <li key={index} data-battery-index={index} data-charge={charge} data-charged={charged || undefined}
        data-active={active || undefined} aria-current={active ? 'step' : undefined}>
        <span className="for-battery">{charge}</span>
        <span className="for-battery-number">{t(`第 ${index + 1} 块`, `Battery ${index + 1}`)}</span>
        {charged && <span className="debug-battery-status">{t('已补电', 'Charged')}</span>}
      </li>
    })}
  </ol>
}

function TraceSource({ code, active, chooseLine, selectedLine, loopLine, returnLine, moved, editing, t }: {
  code: [number, string][]; active?: number; chooseLine?: (line: number) => void; selectedLine?: number;
  loopLine: number; returnLine: number; moved: boolean; editing: boolean; t: Translate;
}) {
  if (code.length === 0) return null

  return <ol className="for-source debug-source" data-testid="debugging-code" aria-label={t('Python 代码', 'Python code')}>
    {code.map(([line, content]) => {
      const canChoose = chooseLine && line >= loopLine && line <= returnLine
      const editingReturn = editing && line === returnLine

      return <li key={line} data-line={line} aria-current={active === line ? 'step' : undefined}
        data-loop-body={(line > loopLine && (line < returnLine || line === returnLine && !moved)) || undefined}
        data-testid={editingReturn ? 'debug-return-location' : undefined}
        data-location={editingReturn ? moved ? 'after' : 'inside' : undefined}>
        <span aria-hidden="true">{line}</span>
        {canChoose ? <button type="button" className="debug-code-choice" data-debug-line-choice={line}
          aria-pressed={line === selectedLine} onClick={() => chooseLine(line)}><code>{content}</code></button>
          : <code>{content}</code>}
      </li>
    })}
  </ol>
}

export function DebuggingLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: (repairedSource: string | undefined) => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const [phase, setPhase] = useState<Phase>('single')
  const [position, setPosition] = useState(0)
  const [trace, setTrace] = useState<Run | null>()
  const [selectedLine, setSelectedLine] = useState<number>()
  const [movedSource, setMovedSource] = useState<string>()
  const [repairRun, setRepairRun] = useState<Run | null>()
  const { debugging, source } = execution
  const sample = debugging?.cases[phase === 'single' ? 0 : 1]
  if (!debugging || !sample) return null

  const { batteries } = sample
  const { loopLine, returnLine, increment } = debugging
  const step = trace?.steps[position - 1]
  const stage = step?.kind ?? 'start'
  const editing = phase === 'repair'
  const moved = movedSource !== undefined
  const output = repairRun?.output ?? (stage === 'output' ? trace?.output : undefined)
  const expected = JSON.stringify(sample.expected)
  const fixed = repairRun?.output === expected
  const match = output === undefined ? undefined : output === expected
  const recorded = repairRun?.results ?? step?.results ?? []
  const hasReturned = !!repairRun || stage === 'return' || stage === 'store' || stage === 'output'
  const choice = phase === 'row' && stage === 'output'
  const revealed = new Map(trace?.steps.slice(0, position).map(({ line, code }) => [line, code]))
  if (movedSource) revealed.set(returnLine, programSourceLines(movedSource)[returnLine - 1])
  const code = Array.from(revealed).sort(([first], [second]) => first - second)
  const title = t('用电池测试补电程序', 'Test the battery charging program')
  // The method this lesson teaches: start small, widen the test, locate the line, change it, test again.
  const method = [
    t('用一块电池试跑', 'Test one battery'),
    t('换一排，对照预期和实际', 'Test a row and compare'),
    t('找出提前结束的那一行', 'Find the line that exits early'),
    t('把 return 移出循环', 'Move return out of the loop'),
    t('重新试跑确认', 'Run again to confirm'),
  ]
  const methodStep = fixed ? method.length : moved ? 4 : editing ? 3 : choice ? 2 : phase === 'row' ? 1 : 0

  function advance() {
    if (trace) {
      setPosition(position + 1)
      return
    }
    const run = runDebuggingLesson(source, batteries)
    setTrace(run ?? null)
    if (run) setPosition(1)
  }

  function showRow() {
    setPhase('row')
    setPosition(0)
    setTrace(undefined)
  }

  function chooseLine(line: number) {
    setSelectedLine(line)
    if (line === returnLine) setPhase('repair')
  }

  function moveReturn() {
    const repaired = repairDebuggingSource(execution)
    if (repaired === undefined) setRepairRun(null)
    else setMovedSource(repaired)
  }

  function retest() {
    if (!movedSource) return
    const run = runDebuggingLesson(movedSource, batteries)
    setRepairRun(run ?? null)
    if (run?.output === expected) onReady(movedSource)
  }

  let caption = describe(step, phase, increment, t)
  if (choice && selectedLine === loopLine) {
    caption = t('这行开始处理当前电池。再找找哪行会让函数直接结束。',
      'This line starts work on the current battery. Find the line that exits the function.')
  } else if (choice && selectedLine !== undefined) {
    caption = t('这行记录补完后的电量。再找找哪行会让函数直接结束。',
      'This line records the new charge. Find the line that exits the function.')
  } else if (editing) {
    caption = fixed ? t('这次每块电池都补到了。换一组电量，先预测再运行。',
      'This time every battery charged. Try another row and predict the result before running it.')
      : moved ? t('现在 return 和 for 对齐。重新试跑同一排电池，看看实际结果。',
        'Now return lines up with for. Run the same row again and check the result.')
      : t('return 缩进在循环里，所以第一轮就执行了。把它移到循环外，等整排补完再返回。',
        'return is indented inside the loop, so it runs in the first turn. Move it outside to return after the whole row is charged.')
  }

  return <section className="classroom-demonstration panel debugging-lesson" aria-label={title} data-testid="debugging-lesson"
    data-debug-phase={phase} data-debug-stage={stage}>
    <CodingDevice device="debugger" locale={locale} controls={<>
      <ol className="debug-method" data-testid="debug-method" aria-label={t('排查步骤', 'Debugging steps')}>
        {method.map((label, index) => <li key={index} aria-current={index === methodStep ? 'step' : undefined}
          data-state={index < methodStep ? 'done' : index === methodStep ? 'current' : 'upcoming'}>
          <i aria-hidden="true">{index < methodStep ? '✓' : index + 1}</i>{label}
        </li>)}
      </ol>
      {!editing && <div className="debugging-navigation">
        {phase === 'single' && stage === 'start'
          ? <button type="button" className="primary-button" onClick={advance}>{t('试跑一块', 'Test one battery')}</button>
          : <>
            <button type="button" className="subtle-button" disabled={position === 0} onClick={() => {
              setSelectedLine(undefined)
              setPosition(position - 1)
            }}>{t('上一步', 'Previous step')}</button>
            {phase === 'single' && stage === 'output'
              ? <button type="button" className="primary-button" onClick={showRow}>{t('换一排电池', 'Try a row of batteries')}</button>
              : <button type="button" className="primary-button" disabled={stage === 'output'} onClick={advance}>
                {t('下一步', 'Next step')}
              </button>}
            {trace && <StepCount position={position} total={trace.steps.length} locale={locale} />}
          </>}
      </div>}
      {/* The caption stays above the code, because some steps ask the learner to pick a line in it. */}
      {trace === null || repairRun === null ? <p className="error-message" role="alert">
        {t('这次没能运行补电程序。再试一次。', 'The charging program did not run this time. Try again.')}
      </p> : <p className="debug-description" role="status">{caption}</p>}
      {choice && <TraceSource code={code} active={editing ? returnLine : step?.line} chooseLine={chooseLine}
        selectedLine={selectedLine} loopLine={loopLine} returnLine={returnLine} moved={moved} editing={editing} t={t} />}
      {editing && <div className="debugging-navigation">
        {!moved ? <button type="button" className="primary-button" onClick={moveReturn}>
          {t('移到循环外', 'Move outside the loop')}
        </button> : <button type="button" className="primary-button" onClick={retest} disabled={fixed}>
          {t('重新试跑', 'Run again')}
        </button>}
      </div>}
    </>}>
      <div className="panel-heading debugging-heading">
        <h2>{title}</h2>
      </div>
      <div className="debugging-body">
        <TraceRack state={{ rows: [batteries], saved: [recorded], locale, rowIndex: step ? 0 : undefined,
          batteryIndex: editing ? undefined : step?.batteryIndex,
          returned: hasReturned ? t(`交回 ${recorded.length} 块`, `Returned · ${recorded.length}`) : undefined }} />
        <div className="for-board">
          <BatteryRow batteries={batteries} recorded={recorded} step={editing ? undefined : step} t={t} />
          <dl className="debug-comparison">
            <div><dt>{t('预期结果', 'Expected result')}</dt><dd data-testid="debug-expected"><code>{expected}</code></dd></div>
            <div data-match={match}><dt>{t('实际结果', 'Actual result')}</dt>
              <dd data-testid="debug-actual">{output === undefined ? t('等待运行', 'Waiting to run')
                : <output data-testid={repairRun ? 'debug-repaired-output' : undefined}>{output}</output>}</dd>
            </div>
          </dl>
        </div>
        {!choice && <TraceSource code={code} active={editing ? returnLine : step?.line}
          selectedLine={selectedLine} loopLine={loopLine} returnLine={returnLine} moved={moved} editing={editing} t={t} />}
      </div>
    </CodingDevice>
  </section>
}
