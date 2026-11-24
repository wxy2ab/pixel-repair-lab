import { useClassroom, CommandDesk } from './Classroom'
import { ExperimentWindow } from './ExperimentWindow'
import { TeachingModel } from './station3d/TeachingModel'
import { useEffect, useId, useRef, useState } from 'react'
import stationReadings from '../../labs/fixtures/station-readings.json'
import { challengeZoneId } from '../shared/coursePrerequisites'
import { dataFields, dataMeetsGoal, parseDataRequest, type DataLevel, type DataOperation, type DataParameters, type DataResult, type DataTable } from '../shared/dataCourse'
import type { CoursePrerequisite, Locale } from '../shared/types'
import { ChallengeFailureReview, type ChallengeReviewData } from './ChallengeFailureReview'
import type { GoalReplayEvidence } from './challengeGoalReview'
import type { ChallengeRunHandlers } from './challengeScore'
import { tr } from './text'
import { HintSteps } from './HintSteps'
import { TaskProgress } from './TaskProgress'
import './data-course.css'
import './data-row-inspector.css'

const loadArrayBench = () => import('./station3d/data-instrument').then(module => module.buildArrayInstrument)
const loadGroupBench = () => import('./station3d/data-instrument').then(module => module.buildGroupInstrument)

const terms: Record<string, [string, string]> = {
  id: ['记录编号', 'Record ID'], day: ['天数', 'Day'], index: ['索引', 'Index'], zone: ['区域', 'Area'], reading: ['温度 (°C)', 'Temperature (°C)'],
  column: ['数据列', 'Column'], columns: ['保留的列', 'Columns to keep'], start: ['起点索引', 'Start index'], stop: ['终点（不含）', 'End index (excluded)'],
  comparison: ['比较条件', 'Comparison'], gte: ['大于或等于', 'At least'], lte: ['小于或等于', 'At most'], threshold: ['比较值', 'Threshold'],
  by: ['分组依据', 'Group by'], statistic: ['统计指标', 'Statistic'], value: ['数值', 'Value'], sort: ['排序方式', 'Sort by'], minimum: ['最低值', 'Minimum'],
  trim: ['统一地名大小写和空格', 'Normalize area names'], dropMissing: ['删除缺失和无效温度', 'Drop missing and invalid readings'],
  deduplicate: ['删除重复编号', 'Remove duplicate IDs'], all: ['全部', 'All'], hangar: ['机库', 'Hangar'], workshop: ['车间', 'Workshop'], storage: ['仓库', 'Storage'],
  'day-zone': ['天数和区域', 'Day and area'], 'zone-reading': ['区域和温度', 'Area and temperature'], 'id-reading': ['编号和温度', 'ID and temperature'],
  count: ['有效数', 'Valid count'], mean: ['平均值', 'Mean'], median: ['中位数', 'Median'], range: ['极差', 'Range'],
  min: ['最小值', 'Minimum'], max: ['最大值', 'Maximum'], sum: ['合计', 'Sum'], key: ['按组名升序', 'Group key ascending'],
  'reading-asc': ['温度从低到高', 'Temperature low to high'], 'reading-desc': ['温度从高到低', 'Temperature high to low'],
  'value-asc': ['结果从小到大', 'Result low to high'], 'value-desc': ['结果从大到小', 'Result high to low'],
}

function term(value: string, locale: Locale) {
  const label = Object.hasOwn(terms, value) ? terms[value] : undefined
  return label ? tr(locale, ...label) : value
}

function readingCell(value: DataTable['rows'][number][number], column: string, locale: Locale) {
  if (value === null) return <em>{tr(locale, '缺失', 'Missing')}</em>
  if (typeof value === 'number') return value
  if (column === 'reading' || value !== value.trim()) return <code className="data-raw-value">{JSON.stringify(value)}</code>
  return term(value, locale)
}

function ReadingTable({ table, locale, kind }: { table: DataTable; locale: Locale; kind: 'input' | 'output' }) {
  return <div className="data-table-wrap" data-testid={'data-' + kind}>
    <table className="data-table">
      <thead><tr>{table.columns.map(column => <th scope="col" key={column}><span>{term(column, locale)}</span><code>{column}</code></th>)}</tr></thead>
      <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>
        {readingCell(value, table.columns[column], locale)}
      </td>)}</tr>)}</tbody>
    </table>
    {table.rows.length === 0 && <p>{tr(locale, '没有符合条件的记录。', 'No records match these settings.')}</p>}
  </div>
}

function RowInspector({ run, sourceRows, locale }: { run: DataResult['steps'][number]; sourceRows: number[]; locale: Locale }) {
  const { input, output } = run
  const destinations = new Map(sourceRows.map((source, index) => [source, index]))
  const [picked, setPicked] = useState<number>()
  if (!input.rows.length) return null
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const altered = (row: number) => {
    const end = destinations.get(row)
    return end === undefined || output.columns.some((col, i) => {
      const start = input.columns.indexOf(col)
      return start >= 0 && input.rows[row][start] !== output.rows[end][i]
    })
  }
  const source = picked ?? Math.max(0, input.rows.findIndex((_, i) => altered(i)))
  const end = destinations.get(source)
  const kept = end !== undefined
  const removed = run.removedRows?.find(row => row.index === source)
  const fields = [...input.columns, ...output.columns.filter(column => !input.columns.includes(column))]
  return <section className="data-row-inspector" aria-label={t('逐行对照', 'Follow a row')}>
    <h3>{t('跟着一行数据走', 'Follow a row')}</h3>
    <div className="data-row-inspector__picker" role="group" aria-label={t('选择输入行', 'Select an input row')}>
      {input.rows.map((_, i) => <button type="button" key={i} aria-pressed={i === source}
        aria-label={t(`查看输入第 ${i + 1} 行`, `Inspect input row ${i + 1}`)}
        data-removed={!destinations.has(i) || undefined} onClick={() => setPicked(i)}>{i + 1}</button>)}
    </div>
    <div key={source} className="data-row-inspector__trace" data-source-row={source} data-output-row={end} aria-live="polite">
      <div className="data-row-inspector__head"><span>{t(`输入 · 第 ${source + 1} 行`, `Input · Row ${source + 1}`)}</span>
        <i aria-hidden="true">→</i><span>{kept ? t(`输出 · 第 ${end + 1} 行`, `Output · Row ${end + 1}`) : t('× 已移出', '× Filtered out')}</span></div>
      {fields.map(col => {
        const from = input.columns.indexOf(col), to = output.columns.indexOf(col)
        const before = from < 0 ? undefined : input.rows[source][from]
        const after = end === undefined || to < 0 ? undefined : output.rows[end][to]
        return <div className="data-row-inspector__field" key={col} data-changed={kept && before !== after || undefined}>
          <div><small>{term(col, locale)}</small>{before === undefined ? '—' : readingCell(before, col, locale)}</div>
          <i aria-hidden="true">{after === undefined ? '×' : '→'}</i>
          <div>{after === undefined ? '—' : readingCell(after, col, locale)}</div>
        </div>
      })}
      {removed && <div className="data-row-inspector__reason">{removed.reason === 'invalid-reading'
        ? t('× 温度缺失或无效', '× Missing or invalid temperature')
        : <button type="button" onClick={() => setPicked(removed.keptRow)}>
          {t(`编号重复 · 看保留的第 ${removed.keptRow + 1} 行`, `Duplicate ID · See kept input row ${removed.keptRow + 1}`)} →
        </button>}</div>}
    </div>
  </section>
}

function DataControls({ step, params, locale, pending, update }: {
  step: DataLevel['steps'][number]; params: DataParameters; locale: Locale; pending: boolean;
  update: (key: string, value: DataParameters[string]) => void;
}) {
  const prefix = useId()
  return <fieldset data-testid="data-controls" className="data-fields" disabled={pending}>
    <legend>{tr(locale, '调整参数', 'Choose settings')}</legend>
    {Object.entries(dataFields[step.operation]).map(([key, choices]) => {
      const id = prefix + key
      const label = term(key, locale)
      const value = params[key]
      if (choices === 'boolean') return <label className="data-toggle" key={key}>
        <input data-parameter={key} type="checkbox" checked={value === true} onChange={event => update(key, event.target.checked)} />
        {label}
      </label>
      if ('min' in choices) {
        const number = Number(value)
        return <div className="data-field" key={key}>
          <label htmlFor={id}>{label} <output htmlFor={id}>{number}</output></label>
          <div className="data-range">
            <button type="button" className="subtle-button" aria-label={tr(locale, `减小${label}`, `Decrease ${label}`)} disabled={number <= choices.min} onClick={() => update(key, number - 1)}>−</button>
            <input id={id} data-parameter={key} type="range" min={choices.min} max={choices.max} value={number} onChange={event => update(key, event.target.valueAsNumber)} />
            <button type="button" className="subtle-button" aria-label={tr(locale, `增大${label}`, `Increase ${label}`)} disabled={number >= choices.max} onClick={() => update(key, number + 1)}>+</button>
          </div>
        </div>
      }
      return <div className="data-field" key={key}>
        <label htmlFor={id}>{label}</label>
        <select id={id} data-parameter={key} value={String(value)} onChange={event => update(key, event.target.value)}>
          {choices.map((option: string) => <option key={option} value={option}>{key === 'sort' && option === 'id' ? tr(locale, '按编号升序', 'Record ID ascending') : term(option, locale)}</option>)}
        </select>
      </div>
    })}
  </fieldset>
}

function ArrayResult({ run, operation, column, locale }: {
  run: DataResult['steps'][number]; operation: 'array' | 'mask'; column: string; locale: Locale
}) {
  const index = run.input.columns.indexOf(column)
  if (index < 0 || !run.input.rows.length) return null
  const selected = new Set<number>(run.sourceRows)
  if (!run.sourceRows && operation === 'array') {
    for (const [sourceIndex] of run.output.rows) {
      if (typeof sourceIndex === 'number') selected.add(sourceIndex)
    }
  } else if (!run.sourceRows) {
    // A mask preserves input order, including duplicate records. Match the returned
    // rows instead of reimplementing NumPy's numeric conversion or predicate.
    let next = 0
    run.input.rows.forEach((row, i) => {
      const output = run.output.rows[next]
      if (output && row.every((cell, c) => cell === output[c])) {
        selected.add(i)
        next++
      }
    })
  }
  const cells = run.input.rows.map((row, i) => ({
    reading: row[index] === null ? tr(locale, '缺失', 'Missing') : String(row[index]),
    selected: selected.has(i),
  }))
  return <TeachingModel sceneKey="numpy-array" locale={locale} load={loadArrayBench} state={cells}
    label={tr(locale, '数组取样台 · 抬起的元素进入了结果', 'Array sampler · raised cells are in the result')} />
}

function GroupChart({ table, locale }: { table: DataTable; locale: Locale }) {
  const points = table.rows.flatMap(([group, value]) => group !== null && typeof value === 'number'
    ? [{ group: term(String(group), locale), value }] : [])
  const largest = Math.max(1, ...points.map(point => point.value))
  const smallest = Math.min(0, ...points.map(point => point.value))
  return <>
    <TeachingModel sceneKey="group-totals" locale={locale} state={points} load={loadGroupBench}
      label={tr(locale, '分组比较台', 'Group comparison bench') + ' · ' + term(table.columns[1], locale)} />
    {points.length >= 2 && <figure className="data-chart">
      <figcaption>{tr(locale, '比较各组', 'Compare groups')} · {term(table.columns[1], locale)}</figcaption>
      <ul>{points.map(({ group, value }) => <li key={group}>
        <span>{group}</span><meter min={smallest} max={largest} value={value} aria-label={group} /><strong>{value}</strong>
      </li>)}</ul>
    </figure>}
  </>
}

const reviewTopics: Partial<Record<DataOperation, CoursePrerequisite>> = {
  clean: { unit: 'pandas', topic: 'cleaning' },
  mask: { unit: 'numpy', topic: 'masks' },
  group: { unit: 'database', topic: 'sql-groups' },
  'sql-group': { unit: 'database', topic: 'sql-groups' },
  report: { unit: 'database', topic: 'sql-groups' },
}

function sameSequence(left: string[], right: string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

function dataReview(step: DataLevel['steps'][number], index: number, output: DataTable, goal: DataTable): ChallengeReviewData {
  const gaps: ChallengeReviewData['gaps'] = []
  const matchingColumns = sameSequence(output.columns, goal.columns)
  const sameColumns = matchingColumns || sameSequence([...output.columns].sort(), [...goal.columns].sort())
  if (!matchingColumns) gaps.push(sameColumns
    ? { zh: '表格的列顺序与任务要求不同。', en: 'The columns are in a different order from the assignment.' }
    : { zh: '结果中的列与任务要求不同。', en: 'The result has a different set of columns.' })

  const rowDifference = output.rows.length - goal.rows.length
  if (rowDifference) {
    const count = Math.abs(rowDifference)
    const rows = `${count} ${count === 1 ? 'record' : 'records'}`
    gaps.push(rowDifference > 0
      ? { zh: `结果多出 ${count} 条记录。`, en: `The result has ${rows} too many.` }
      : { zh: `结果还少 ${count} 条记录。`, en: `The result is missing ${rows}.` })
  } else if (sameColumns) {
    const columnIndexes = goal.columns.map(column => output.columns.indexOf(column))
    const actualRows = output.rows.map(row => JSON.stringify(matchingColumns ? row : columnIndexes.map(column => row[column])))
    const expectedRows = goal.rows.map(row => JSON.stringify(row))
    if (!sameSequence(actualRows, expectedRows)) gaps.push(sameSequence([...actualRows].sort(), [...expectedRows].sort())
      ? { zh: '记录和数值都吻合，行的排列顺序还需调整。', en: 'The records and values match, but the rows are in a different order.' }
      : { zh: '行数吻合，选出的记录或计算后的数值仍有差异。', en: 'The row count matches, but some records or calculated values still differ.' })
  }

  const topic = reviewTopics[step.operation]
  return {
    location: { zh: `第 ${index + 1} 步 · ${step.label.zh}`, en: `Step ${index + 1} · ${step.label.en}` },
    gaps,
    topics: topic ? [topic] : undefined,
  }
}

export default function DataLesson({ level, locale, onComplete, onMistake, challenge }: {
  level: DataLevel; locale: Locale; onComplete: () => void; onMistake?: () => void; challenge?: ChallengeRunHandlers;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [params, setParams] = useState(() => level.steps.map(step => step.initial))
  const [cursor, setCursor] = useState(0)
  const [runs, setRuns] = useState<DataResult['steps']>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const active = useRef<AbortController | null>(null)
  const classroom = useClassroom()
  const settings = useRef<HTMLElement>(null)
  const gradedChecks = useRef(0)
  const replayIssue = useRef<GoalReplayEvidence['issue']>(undefined)
  useEffect(() => () => active.current?.abort(), [])

  const step = level.steps[cursor]
  const current = runs[cursor]
  const input = current?.input ?? (step.input === 'previous' ? runs[cursor - 1]?.output : stationReadings)
  const checks = runs.map(({ output }, index) => {
    const goal = level.steps[index].goal
    return !goal || dataMeetsGoal(output, goal)
  })
  const firstUnfinished = checks.includes(false) ? checks.indexOf(false) : runs.length
  const passed = checks[cursor]
  const finished = firstUnfinished === level.steps.length
  const review = level.unit?.id === challengeZoneId && !pending && current && passed === false && step.goal
    ? dataReview(step, cursor, current.output, step.goal) : undefined

  function navigate(index: number) {
    setError(undefined)
    setCursor(index)
  }

  function startAttempt() {
    challenge?.onStart()
    gradedChecks.current = 0
    replayIssue.current = undefined
    setCursor(0)
    setRuns([])
    setError(undefined)
  }

  function replay() {
    startAttempt()
    window.requestAnimationFrame(() => settings.current?.querySelector<HTMLElement>('[data-parameter]')?.focus())
  }

  function update(key: string, value: DataParameters[string]) {
    if (params[cursor][key] === value) return
    setParams(previous => previous.map((entry, index) => index === cursor ? { ...entry, [key]: value } : entry))
    if (challenge && finished) startAttempt()
    else {
      setRuns(previous => previous.slice(0, cursor))
      setError(undefined)
    }
  }

  async function run() {
    if (active.current) return
    const rawRequest = { steps: level.steps.slice(0, cursor + 1).map(({ operation, input }, index) => ({ operation, input, params: params[index] })) }
    const request = parseDataRequest(rawRequest)
    if (!request) {
      setError(step.operation === 'array' ? 'slice' : 'invalid-input')
      return
    }
    const controller = new AbortController()
    active.current = controller
    if (!finished) challenge?.onStart()
    setPending(true)
    setError(undefined)
    try {
      const response = await fetch('/api/labs/data', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal, body: JSON.stringify(request) })
      const payload = await response.json() as { result?: DataResult; error?: string }
      if (controller.signal.aborted) return
      if (!response.ok || payload.result?.steps.length !== request.steps.length) {
        setError(payload.error ?? 'lab-failed')
        return
      }
      const steps = payload.result.steps
      if (challenge && !finished) gradedChecks.current++
      setRuns(previous => [...steps, ...previous.slice(steps.length)])
      if (step.goal && !dataMeetsGoal(steps[cursor].output, step.goal)) {
        if (challenge && !finished && !replayIssue.current) {
          const { location, gaps } = dataReview(step, cursor, steps[cursor].output, step.goal)
          replayIssue.current = { location, gaps }
        }
        onMistake?.()
      }
      else if (steps.length === level.steps.length && steps.every(({ output }, index) => {
        const goal = level.steps[index].goal
        return !goal || dataMeetsGoal(output, goal)
      })) {
        if (!challenge || !finished) onComplete()
        if (challenge && !finished) {
          const total = level.steps.length
          challenge.onWin({ kind: 'data', passed: total, total, checks: gradedChecks.current }, replay,
            replayIssue.current ? { issue: replayIssue.current } : undefined)
        }
      }
    } catch {
      if (!controller.signal.aborted) setError('lab-failed')
    } finally {
      if (active.current === controller) active.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  const inputSheet = input && <details className="data-details data-source" open={!current}>
    <summary>{!current && step.input === 'clean' ? t('查看原始传感器记录', 'View the original sensor log')
      : step.input === 'previous' ? t('查看上一步传来的数据', 'View the previous step’s output') : t('查看本步输入', 'View step input')}</summary>
    {!current && step.input === 'clean' && <p>{t('本步使用统一了地名、去掉缺失值和重复编号的记录。', 'This step uses normalized area names and drops missing readings and duplicate IDs.')}</p>}
    <ReadingTable table={input} locale={locale} kind="input" />
  </details>
  const parameters = <DataControls step={step} params={params[cursor]} locale={locale} pending={pending} update={update} />
  const runButton = <button type="button" className="primary-button" disabled={pending} onClick={() => void run()}>
    {pending ? t('正在运行…', 'Running…') : t('运行实验', 'Run experiment')}
  </button>

  return <div className="data-workbench">
    <div className="data-workspace classroom-split">
      <ExperimentWindow locale={locale} title={t('维修站数据工作簿', 'Station data workbook')}>
        <section className="panel data-panel data-results" aria-busy={pending}>
          {classroom && <>
            {inputSheet}
            <div className="experiment-inputs">{parameters}<div className="data-actions">{runButton}</div></div>
            {current && <p className="experiment-receipt">
              {t(`送入 ${current.input.rows.length} 行 → ${step.label[locale]} → 得到 ${current.output.rows.length} 行`,
                `${current.input.rows.length} rows in → ${step.label[locale]} → ${current.output.rows.length} rows out`)}
            </p>}
          </>}
          <div className="data-result-heading"><h2>{t('实验结果', 'Experiment results')}</h2>{current && <span>{current.engine}</span>}</div>
          {classroom && !current && <p>{pending ? t('正在处理这张输入表…', 'Processing the input table…')
            : t('运行后，输出表会出现在这里。', 'Run the experiment to see the output table here.')}</p>}
          {current && <>
            {classroom && (step.operation === 'array' || step.operation === 'mask') &&
              <ArrayResult run={current} operation={step.operation} column={String(params[cursor].column)} locale={locale} />}
            {classroom && current.sourceRows && <RowInspector key={cursor} run={current} sourceRows={current.sourceRows} locale={locale} />}
            <ReadingTable table={current.output} locale={locale} kind="output" />
            {(step.operation === 'group' || step.operation === 'sql-group' || step.operation === 'report') &&
              <GroupChart table={current.output} locale={locale} />}
            <p data-testid="data-feedback" role="status" data-task-success={passed || undefined} className={passed ? 'win-message' : 'error-message'}>
              {finished ? level.courseFinal ? t('分析报告已完成。', 'Analysis report complete.') : t('实验已完成。', 'Experiment complete.')
                : passed ? t('当前步骤通过。', 'This step passed.')
                : current.output.rows.length !== step.goal?.rows.length ? t('结果的行数和目标不同。对照任务检查筛选或清洗条件。', 'The row count differs from the target. Check the filter or cleanup settings.')
                : t('结果和目标还有差异。检查列、数值或排序。', 'The result still differs from the target. Check the columns, values, or order.')}
            </p>
            <TaskProgress label={t('已完成步骤', 'Steps complete')} done={firstUnfinished} total={level.steps.length} />
            {finished && level.courseFinal && cursor === level.steps.length - 1 && <dl className="data-report-counts">
              {runs.map((entry, index) => <div key={index}>
                <dt>{level.steps[index].label[locale]}</dt><dd>{t(`${entry.input.rows.length} → ${entry.output.rows.length} 行`, `${entry.input.rows.length} → ${entry.output.rows.length} rows`)}</dd>
              </div>)}
            </dl>}
            <details className="data-details"><summary>{t('查看执行代码', 'View executed code')}</summary><pre>{current.code}</pre></details>
          </>}
          {!classroom && inputSheet}
        </section>
      </ExperimentWindow>
      <CommandDesk locale={locale}>
        <section className="panel data-panel" ref={settings}>
          {level.steps.length > 1 && <nav className="data-steps" aria-label={t('分析步骤', 'Analysis steps')}>
            {level.steps.map((item, index) => <button type="button" className="subtle-button" data-step={index} key={index}
              aria-current={cursor === index ? 'step' : undefined} disabled={pending || index > firstUnfinished} onClick={() => navigate(index)}>
              <span aria-hidden="true">{checks[index] ? '✓' : index + 1}</span> {item.label[locale]}
            </button>)}
          </nav>}
          <h2>{step.label[locale]}</h2>
          <p>{step.prompt[locale]}</p>
          {!classroom && parameters}
          <div className="data-actions">
            {!classroom && runButton}
            {passed && cursor + 1 < level.steps.length && <button type="button" className="subtle-button" disabled={pending}
              onClick={() => navigate(cursor + 1)}>{t('下一步', 'Next step')}</button>}
          </div>
          {error && <p className="error-message" role="alert">{error === 'slice' ? t('终点索引要比起点大。', 'Choose an end index after the start.')
            : error === 'lab-unavailable' ? t('本地实验环境还没准备好。请运行 npm run labs:setup 后刷新。', 'Set up the local labs with npm run labs:setup and reload.')
            : error === 'lab-busy' ? t('实验台正在忙，请稍后再试。', 'The workbench is busy. Try again in a moment.')
            : t('这一步没有运行成功。检查参数后再试。', 'This step could not run. Check the settings and try again.')}</p>}
          {review && <ChallengeFailureReview review={review} onRetry={() => settings.current?.querySelector<HTMLElement>('[data-parameter]')?.focus()} />}
          {level.hints.length > 0 && <details className="data-details"><summary>{t('提示', 'Hints')}</summary>
            <HintSteps hints={level.hints} locale={locale} />
          </details>}
        </section>
      </CommandDesk>
    </div>
  </div>
}
