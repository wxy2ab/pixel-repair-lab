import { CodingDevice } from './CodingDevice'
import { TraceRack } from './ProgramFlowBenches'
import { useId, useRef, useState } from 'react'
import type { AlgorithmLevel, PersonalAlgorithms } from '../shared/advanced'
import type { Json, Locale } from '../shared/types'
import { repairChargingReturn, runChargingTrial, type ChargingStep } from '../engine/chargingChallenge'
import { CourseHelperPicker, setHelperImport } from './CourseHelperPicker'
import { runIssueText, tr } from './text'
import './for-lesson.css'
import './charging-challenge.css'

type Translate = (zh: string, en: string) => string
type Trial = ReturnType<typeof runChargingTrial>

function batteryRow(values: Json | undefined): values is number[] {
  return Array.isArray(values) && values.every(value => typeof value === 'number')
}

function traceProgress(steps: readonly ChargingStep[]) {
  const completed: number[][] = []
  let rowIndex = -1
  let batteryIndex = -1
  let current: number[] = []
  for (const { file, kind, value } of steps) {
    if (file !== 'main') continue
    if (kind === 'iterate' && batteryRow(value)) {
      rowIndex++
      batteryIndex = -1
      current = []
    } else if (kind === 'iterate' && typeof value === 'number') {
      batteryIndex++
    } else if (kind === 'append' && typeof value === 'number') {
      current.push(value)
    } else if (kind === 'append' && batteryRow(value)) {
      completed.push(value)
    }
  }
  return { completed, rowIndex, batteryIndex, current }
}

function ChargeRack({ rows, steps, locale, t }: { rows: number[][]; steps: readonly ChargingStep[]; locale: Locale; t: Translate }) {
  const { completed, rowIndex, batteryIndex, current } = traceProgress(steps)
  const step = steps.at(-1)
  const returned = step?.kind === 'return' && step.file === 'main' && step.stack.length === 1
  const returnedRows = returned && Array.isArray(step.value) && step.value.every(batteryRow) ? step.value : undefined
  let helper: string | undefined
  if (step?.file === 'helper') {
    helper = step.kind === 'return' ? `return ${JSON.stringify(step.value ?? null)}` : step.stack.at(-1)?.name
  }
  return <>
    <TraceRack state={{ rows, saved: completed, rowIndex, batteryIndex, current, helper, locale,
      returned: returnedRows ? t(`交回 ${returnedRows.length} 排`, `Returned · ${returnedRows.length} rows`)
        : returned ? t('已返回', 'Returned') : undefined }} />
    <ol className="charging-rack" data-testid="charging-starting-rows" aria-label={t('试跑的电池', 'Batteries for the trial')}>
      {rows.map((row, index) => {
        const active = rowIndex === index
        const charged = completed[index] ?? (active ? current : undefined)
        return <li className="charging-rack-row" key={index} data-row-index={index}
          data-active={active || undefined} data-complete={completed[index] !== undefined || undefined}>
          <strong>{t(`第 ${index + 1} 排`, `Row ${index + 1}`)}</strong>
          {row.length > 0 ? <ol className="charging-batteries" aria-label={t(`第 ${index + 1} 排的电池`, `Batteries in row ${index + 1}`)}>
            {row.map((start, index) => {
              const selected = active && index === batteryIndex
              return <li key={index} data-battery-index={index} data-charge={charged?.[index] ?? start}
                data-active={selected || undefined} data-charged={charged?.[index] !== undefined || undefined}
                aria-current={selected ? 'step' : undefined}>
                <span className="for-battery">{charged?.[index] ?? start}</span>
              </li>
            })}
          </ol> : <span>{t('空排', 'Empty row')}</span>}
        </li>
      })}
    </ol>
  </>
}

function describeStep(step: ChargingStep, rowCount: number, t: Translate) {
  const { kind, value, name, file } = step
  switch (kind) {
    case 'define': return t('读入函数定义，准备稍后调用。', 'Read the function definition so it can be called later.')
    case 'import': return t(`导入 ${name}，接下来可以调用它。`, `Import ${name} so the program can call it.`)
    case 'call': return file === 'main' && step.stack.length > 2
      ? t(`把电量和补电格数传给 ${name}。`, `Pass the charge and the amount to add to ${name}.`)
      : t(`进入函数 ${name}。`, `Enter the function ${name}.`)
    case 'iterate': return batteryRow(value)
      ? t('外层循环选中一排电池。', 'The outer loop selects a row of batteries.')
      : t(`内层循环读到一块电池，电量为 ${value} 格。`, `The inner loop reads a battery with ${value} units of charge.`)
    case 'append': return batteryRow(value)
      ? t('把这一排补完后的电量记到总结果里。', 'Save the charges for this row in the full result.')
      : t(`把补完后的 ${value} 格记到这一排。`, `Record the new charge of ${value} in this row.`)
    case 'loop-end': return t('当前循环已经没有下一项。', 'This loop has no more items.')
    case 'return':
      if (file === 'helper') return t(`补电函数交回 ${value}。`, `The charging function returns ${value}.`)
      if (Array.isArray(value) && value.length < rowCount) return t(
        `架子上有 ${rowCount} 排，函数只交回了 ${value.length} 排。return 一执行，整个函数就结束了。`,
        `The rack has ${rowCount} rows, but the function returns ${value.length}. When return runs, the whole function ends.`)
      return t('函数把处理过的各排交回去。', 'The function returns the rows it processed.')
    case 'assign': return t(`把这一步的值存进 ${name}。`, `Save this step’s value in ${name}.`)
    default: return t('看这一行执行后，电量记录怎样变化。', 'See how this line changes the charging records.')
  }
}

function ChargingTrace({ visible, step, rowCount, t }: {
  visible: readonly ChargingStep[]; step: ChargingStep; rowCount: number; t: Translate;
}) {
  const lines = new Map<number, string>()
  for (const frame of visible) {
    if (frame.file === step.file && frame.sourceName === step.sourceName) lines.set(frame.line, frame.code)
  }
  const filename = step.file === 'main' ? 'main.py' : `${step.sourceName.split('.')[0]}.py`
  const bindings = step.stack.at(-1)?.values ?? []
  return <section className="charging-trace" data-testid="charging-trace" data-kind={step.kind} data-file={step.file} data-line={step.line}
    data-source={step.sourceName}
    aria-label={t('当前执行步骤', 'Current execution step')}>
    <div className="charging-trace-heading">
      <h3><code>{filename}</code></h3>
    </div>
    <ol className="for-source" aria-label={t('已执行的代码', 'Code visited so far')}>
      {[...lines.entries()].sort(([left], [right]) => left - right).map(([line, code]) => <li key={line} data-line={line}
        aria-current={line === step.line ? 'step' : undefined}>
        <span aria-hidden="true">{line}</span><code>{code}</code>
      </li>)}
    </ol>
    <p role="status">{describeStep(step, rowCount, t)}</p>
    {bindings.length > 0 && <dl className="for-values" aria-label={t('当前变量', 'Current variables')}>
      {bindings.map(({ name, value }) => <div key={name} data-active={name === step.name || undefined}>
        <dt><code>{name}</code></dt><dd>{JSON.stringify(value)}</dd>
      </div>)}
    </dl>}
  </section>
}

export function ChargingChallenge({ level, locale, personal, course, onReady, onOpenHelper }: {
  level: AlgorithmLevel; locale: Locale; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  onReady: (source: string | undefined) => void; onOpenHelper?: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const sourceId = useId()
  const runButton = useRef<HTMLButtonElement>(null)
  const helperName = level.helpers?.[0]
  const hasSavedHelper = !!helperName && Object.hasOwn(personal, helperName) && typeof personal[helperName] === 'string'
  const initial = hasSavedHelper && helperName ? setHelperImport(level.starterCode, helperName, 'my_algorithms') : level.starterCode
  const [source, setSource] = useState(initial)
  const [trial, setTrial] = useState<Trial>()
  const [position, setPosition] = useState(0)
  const [moved, setMoved] = useState(false)
  const caseIndex = level.chargingChallenge?.trialCase
  if (caseIndex === undefined) return null

  const sample = level.cases[caseIndex]
  const [rows, increment] = sample?.args ?? []
  if (!Array.isArray(rows) || !rows.every(batteryRow) || typeof increment !== 'number') return null

  const visible = trial?.steps.slice(0, position + 1) ?? []
  const step = visible.at(-1)
  const reachedReturn = visible.some(frame => frame.kind === 'return' && frame.file === 'main')
  const repaired = trial && !trial.passed && reachedReturn ? repairChargingReturn(source, level.functionName) : undefined

  function updateSource(value: string) {
    if (source === value) return
    setSource(value)
    setTrial(undefined)
    setPosition(0)
    setMoved(false)
    onReady(undefined)
  }

  function run() {
    if (caseIndex === undefined) return
    const next = runChargingTrial(level, source, caseIndex, personal, course)
    setTrial(next)
    setPosition(0)
    setMoved(false)
    onReady(next.passed ? source : undefined)
  }

  return <section className="classroom-demonstration charging-challenge" data-testid="charging-challenge" data-trial-pass={trial?.passed}>
    <CodingDevice device="debugger" locale={locale} workbench controls={<>
      <div className="charging-editor">
        <label htmlFor={sourceId}>{t('补电代码', 'Charging code')}</label>
        <textarea id={sourceId} className="python-input" data-testid="charging-source" spellCheck={false}
          autoCapitalize="off" autoComplete="off" wrap="off" maxLength={12000} value={source} onChange={event => updateSource(event.target.value)} />
        <CourseHelperPicker names={level.helpers} course={course} personal={personal} code={source} onChange={updateSource} locale={locale} />
        {!hasSavedHelper && <div className="charging-helper-note">
          <p>{t('可以先用课程函数。基础练习通过后，把自己的补电函数保存到「我的算法」，就能在这里导入。',
            'You can start with the course function. Once your function passes the earlier exercise, save it to My algorithms and import it here.')}</p>
          {onOpenHelper && <button type="button" className="subtle-button" onClick={onOpenHelper}>
            {t('去写补电函数', 'Write the charge function')}
          </button>}
        </div>}
      </div>
      <div className="charging-actions">
        <button type="button" className="primary-button" ref={runButton} disabled={!source.trim()} onClick={run}>
          {t('试跑小例子', 'Run the small example')}
        </button>
      </div>
      {step && <div className="charging-actions">
        <button type="button" className="subtle-button" disabled={position === 0} onClick={() => setPosition(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        <button type="button" className="subtle-button" disabled={position + 1 >= (trial?.steps.length ?? 0)} onClick={() => setPosition(position + 1)}>
          {t('下一步', 'Next step')}
        </button>
        {repaired && <button type="button" className="primary-button" onClick={() => {
          updateSource(repaired)
          setMoved(true)
          runButton.current?.focus()
        }}>{t('移到循环外', 'Move outside the loop')}</button>}
      </div>}
    </>}>
      <div className="charging-inputs">
        <div className="for-board">
          <h3>{t(`给小例子里的每块电池补 ${increment} 格`, `Add ${increment} units to each battery in the trial`)}</h3>
          <ChargeRack rows={rows} steps={visible} locale={locale} t={t} />
          <dl className="charging-comparison">
            <div><dt>{t('预期结果', 'Expected result')}</dt>
              <dd><code data-testid="charging-trial-expected">{JSON.stringify(sample.expected)}</code></dd></div>
            <div data-match={trial?.actual !== undefined ? trial.passed : undefined}>
              <dt>{t('实际结果', 'Actual result')}</dt>
              <dd>{trial?.actual !== undefined ? <output data-testid="charging-trial-actual">{JSON.stringify(trial.actual)}</output>
                : trial?.issue ? t('没有结果', 'No result') : t('等待运行', 'Waiting to run')}</dd>
            </div>
          </dl>
        </div>
        {trial?.issue ? <p className="error-message" role="alert">{runIssueText(locale, trial.issue)}</p>
          : trial ? <p role="status" data-task-success={trial.passed || undefined} className={trial.passed ? 'win-message' : ''}>{trial.passed
            ? t('小例子通过了。可以换一架电池来预测。', 'The small example passed. Try predicting a different rack.')
            : t('结果和预期不同。逐步查看程序在哪儿交回了结果。', 'The results differ. Step through the program to see where it returns.')}</p>
          : moved && <p role="status">{t('return 已经与外层 for 对齐。再试跑一次。', 'return now lines up with the outer for. Run the example again.')}</p>}
      </div>
      {step && <ChargingTrace visible={visible} step={step} rowCount={rows.length} t={t} />}
    </CodingDevice>
  </section>
}
