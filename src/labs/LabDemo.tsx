import { useClassroom, CommandDesk } from '../web/Classroom'
import { ExperimentWindow } from '../web/ExperimentWindow'
import { useEffect, useId, useRef, useState } from 'react'
import type { LabLevel } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { defaultRequest, groupings, observedLabCount, zones, type DemoRequest, type DemoResult, type DemoStatus, type TableResult } from './contracts'
import './lab.css'

const chineseTerms: Record<string, string> = {
  all: '所有区域', hangar: '机库', workshop: '车间', storage: '仓库', zone: '区域', item: '物品',
  alpha: '甲区', beta: '乙区', gamma: '丙区', battery: '电池', water: '水', wheel: '轮子',
  magnet: '磁铁', sensor: '传感器', cable: '线缆', glove: '手套',
  dog: '狗', cat: '猫', person: '人', bird: '鸟',
}

function term(value: string | number, locale: Locale): string | number {
  if (typeof value === 'number') return value
  if (locale === 'zh' && Object.hasOwn(chineseTerms, value)) return chineseTerms[value]
  if (value === 'all') return 'All areas'
  if (value === 'zone') return 'Area'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function DataTable({ headings, rows, locale }: { headings: string[]; rows: TableResult['rows']; locale: Locale }) {
  return <div className="lab-table-wrap"><table className="lab-table">
    <thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>
      {row.map((value, column) => <td key={column}>{term(value, locale)}</td>)}
    </tr>)}</tbody>
  </table></div>
}

function Source({ label, code }: { label: string; code: string }) {
  return <details className="lab-more"><summary>{label}</summary><pre>{code}</pre></details>
}

function DemoOutput({ result, locale }: { result: DemoResult; locale: Locale }) {
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en
  const pythonLabel = t('查看实际 Python', 'View executed Python')
  if ('rows' in result) {
    const inventoryHeadings = [t('物品', 'Item'), t('区域', 'Area'), t('库存', 'Stock')]
    const batteryHeadings = [t('电池编号', 'Battery number'), t('电量（%）', 'Charge (%)')]
    const deliveryHeadings = [t('区域', 'Area'), t('物品', 'Item'), t('数量', 'Quantity')]
    const table = {
      numpy: { headings: batteryHeadings, input: batteryHeadings },
      pandas: {
        headings: [result.recipe === 'pandas' ? String(term(result.groupBy, locale)) : '', t('数量合计', 'Total quantity'), t('入库记录数', 'Delivery records')],
        input: deliveryHeadings,
      },
      analysis: {
        headings: [t('区域', 'Sector'), t('平均温度（°C）', 'Average (°C)'), t('样本数', 'Samples')],
        input: [t('第几天', 'Day'), t('区域', 'Sector'), t('温度（°C）', 'Temperature (°C)')],
      },
      sql: { headings: inventoryHeadings, input: inventoryHeadings },
    }[result.recipe]
    return <>
      <DataTable locale={locale} rows={result.rows} headings={table.headings} />
      {result.recipe === 'analysis' && result.summary && <dl className="lab-metrics">
        <div><dt>{t('总体中位数（°C）', 'Overall median (°C)')}</dt><dd>{result.summary.median}</dd></div>
        <div><dt>{t('总体极差（°C）', 'Overall range (°C)')}</dt><dd>{result.summary.spread}</dd></div>
      </dl>}
      {result.recipe === 'sql' && (result.comparisonMatches
        ? <p className="lab-agreement">{t('SQLite 和 DuckDB 返回了相同的结果。', 'SQLite and DuckDB returned identical results.')}</p>
        : <><h3 className="lab-agreement">DuckDB</h3><DataTable locale={locale} rows={result.duckRows} headings={inventoryHeadings} /></>)}
      {result.rows.length === 0 && <p className="lab-empty-result">{t('没有记录符合筛选条件。', 'No records match your filters.')}</p>}
      <details className="lab-more">
        <summary>{t('查看输入数据', 'View input data')}</summary>
        <DataTable locale={locale} rows={result.input} headings={table.input} />
      </details>
      {result.recipe === 'sql' ? <Source label={t('查看实际 SQL', 'View executed SQL')} code={result.query} />
        : <Source label={pythonLabel} code={result.code} />}
    </>
  }
  if (result.recipe === 'opencv') {
    return <>
      <div className="lab-compare">
        <figure><img src={result.source} alt={t('含有四个不同亮度圆点的校准板', 'Calibration board with four dots of different brightness')} />
          <figcaption>{t('原始校准板', 'Calibration board')}</figcaption></figure>
        <figure><img src={result.image} alt={t('按亮度分离得到的黑白图', 'Black and white image produced by thresholding')} />
          <figcaption>{t('处理结果', 'Threshold result')}</figcaption></figure>
      </div>
      <dl className="lab-metrics">
        <div><dt>{t('保留区域', 'Regions kept')}</dt><dd>{result.regions}</dd></div>
        <div><dt>{t('白色像素', 'White pixels')}</dt><dd>{result.pixels.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</dd></div>
      </dl>
      <Source label={pythonLabel} code={result.code} />
    </>
  }
  if (result.recipe !== 'yolox') return null
  return <>
    <figure className="lab-detect-figure">
      <div className="lab-detect-picture" style={{ aspectRatio: `${result.width} / ${result.height}` }}>
        <img src={result.image} alt={t('站在草地上的拉布拉多犬', 'A Labrador Retriever standing on grass')} />
        {result.detections.map(({ label, score, box: [x, y, width, height] }, index) => (<div key={index} aria-hidden="true"
          className="lab-detect-box" style={{
            left: `${100 * x / result.width}%`, top: `${100 * y / result.height}%`,
            width: `${100 * width / result.width}%`, height: `${100 * height / result.height}%`,
          }}>
          <span>{term(label, locale)} {Math.round(score * 100)}%</span>
        </div>))}
      </div>
      <figcaption><a href="https://commons.wikimedia.org/wiki/File:YellowLabradorLooking_new.jpg" target="_blank" rel="noreferrer">
        {t('照片：Elf，Djmirko 和 FT2 修图', 'Photo by Elf, retouched by Djmirko and FT2')}
      </a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a>
        {' · '}{t('演示中已缩放', 'Resized for this demo')}</figcaption>
    </figure>
    <DataTable locale={locale} headings={[t('类别', 'Class'), t('置信度', 'Confidence')]}
      rows={result.detections.map(({ label, score }) => [label, `${Math.round(score * 100)}%`])} />
    {result.detections.length === 0 && <p className="lab-empty-result">{t('没有检测结果达到这个置信度。', 'No detections reached this confidence threshold.')}</p>}
    <Source label={pythonLabel} code={result.code} />
  </>
}

type DemoSlider = { label: string; value: number; min: number; max: number; suffix?: string; update: (value: number) => DemoRequest }

function slider(request: DemoRequest, locale: Locale): DemoSlider | null {
  const { recipe } = request
  switch (recipe) {
    case 'numpy': return { label: locale === 'zh' ? '最低电量' : 'Minimum charge', value: request.parameters.minimumCharge,
      min: 0, max: 100, suffix: '%', update: (minimumCharge) => ({ recipe, parameters: { minimumCharge } }) }
    case 'pandas': return null
    case 'analysis': return { label: locale === 'zh' ? '统计前几天' : 'Days included', value: request.parameters.days,
      min: 1, max: 5, update: (days) => ({ recipe, parameters: { days } }) }
    case 'sql': return { label: locale === 'zh' ? '最低库存' : 'Minimum stock', value: request.parameters.minimum,
      min: 0, max: 10, update: (minimum) => ({ recipe, parameters: { ...request.parameters, minimum } }) }
    case 'opencv': return { label: locale === 'zh' ? '亮度阈值' : 'Brightness threshold', value: request.parameters.threshold,
      min: 40, max: 240, update: (threshold) => ({ recipe, parameters: { threshold } }) }
    case 'yolox': return { label: locale === 'zh' ? '最低置信度' : 'Minimum confidence', value: request.parameters.confidence,
      min: 10, max: 95, suffix: '%', update: (confidence) => ({ recipe, parameters: { confidence } }) }
  }
}

type LabDemoProps = { level: LabLevel; locale: Locale; onComplete: () => void; onMistake?: () => void }

function DemoSession({ level, locale, onComplete, onMistake }: LabDemoProps) {
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en
  const [request, setRequest] = useState(() => defaultRequest(level.recipe))
  const [available, setAvailable] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [latest, setLatest] = useState<{ request: DemoRequest; result: DemoResult } | null>(null)
  const active = useRef<AbortController | null>(null)
  const control = slider(request, locale)
  const rangeId = useId()
  const areaId = useId()

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/labs/status', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('status')
        return response.json() as Promise<DemoStatus>
      })
      .then((status) => { if (!controller.signal.aborted) setAvailable(status.recipes[level.recipe] === true) })
      .catch(() => { if (!controller.signal.aborted) setAvailable(false) })
    return () => {
      controller.abort()
      active.current?.abort()
    }
  }, [level.recipe])

  async function run() {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/labs/run', { body: JSON.stringify(request), method: 'POST',
        headers: { 'Content-Type': 'application/json' }, signal: controller.signal })
      const payload = await response.json() as { result?: DemoResult; error?: string }
      if (controller.signal.aborted) return
      if (!response.ok || payload.result?.recipe !== level.recipe) {
        setError(payload.error ?? 'lab-failed')
      } else {
        setLatest({ request, result: payload.result })
        if (level.goal) {
          const count = observedLabCount(payload.result)
          if (count !== null && count !== level.goal.count) {
            setFinished(false)
            onMistake?.()
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) setError('lab-failed')
    } finally {
      active.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  const classroom = useClassroom()
  const changed = latest && Object.entries(latest.request.parameters).some(([key, value]) => Reflect.get(request.parameters, key) !== value)
  const lastControl = latest && slider(latest.request, locale)
  const observed = latest && level.goal ? observedLabCount(latest.result) : undefined
  const goalMet = !level.goal || observed === level.goal.count
  const settings = <>
    {control && <><label className="lab-range-label" htmlFor={rangeId}>{control.label}
      <output htmlFor={rangeId}>{control.value}{control.suffix}</output>
    </label>
    <input id={rangeId} type="range" min={control.min} max={control.max} value={control.value} disabled={pending}
      onChange={(event) => setRequest(control.update(event.currentTarget.valueAsNumber))} /></>}
    {request.recipe === 'pandas' && <div className="lab-area lab-grouping">
      <label htmlFor={areaId}>{t('分组依据', 'Group by')}</label>
      <select id={areaId} disabled={pending} value={request.parameters.groupBy} onChange={(event) => {
        const groupBy = groupings.find((value) => value === event.currentTarget.value)
        if (groupBy) setRequest({ recipe: 'pandas', parameters: { groupBy } })
      }}>{groupings.map((grouping) => <option key={grouping} value={grouping}>{term(grouping, locale)}</option>)}</select>
    </div>}
    {request.recipe === 'sql' && <div className="lab-area">
      <label htmlFor={areaId}>{t('区域', 'Area')}</label>
      <select id={areaId} disabled={pending} value={request.parameters.zone} onChange={(event) => {
        const zone = zones.find((value) => value === event.currentTarget.value)
        if (zone) setRequest({ recipe: 'sql', parameters: { ...request.parameters, zone } })
      }}>{zones.map((zone) => <option key={zone} value={zone}>{term(zone, locale)}</option>)}</select>
    </div>}
    <button type="button" className="primary-button lab-run" disabled={pending || available !== true} onClick={() => void run()}>
      {pending ? t('正在运行…', 'Running…') : level.goal ? t('运行练习', 'Run exercise') : t('运行演示', 'Run demo')}
    </button>
  </>

  return <div className="lab-demo classroom-split" aria-label={level.title[locale]}>
    <ExperimentWindow locale={locale} kind="instrument" title={level.title[locale]}>
      <section className="lab-panel lab-output" aria-busy={pending} aria-labelledby={rangeId + '-result'}>
        {classroom && <div className="lab-sim-parameters">{settings}</div>}
        <div className="lab-result-heading">
          <h2 id={rangeId + '-result'}>{t('实验结果', 'Demo results')}</h2>
          {latest && <span>{latest.result.engine}</span>}
        </div>
        {error && <p className="lab-feedback" role="alert">{error === 'lab-busy'
          ? t('本地实验正在忙，稍等一下再运行。', 'The local demo runner is busy. Try again in a moment.')
          : t('这次演示没有完成。请再试一次。', 'The demo did not finish. Try running it again.')}</p>}
        {!latest && <p className="lab-empty" role="status">{available === null
          ? t('正在检查本地实验…', 'Checking the local demos…')
          : t('选择参数并运行，结果会显示在这里。', 'Choose settings and run to see the results here.')}</p>}
        {latest && <>
          {classroom && changed && <p className="experiment-receipt">{t('参数改了。下面还是刚才的结果，再运行一次就能看到变化。', 'You changed the settings. Run again to update the result below.')}</p>}
          {lastControl && <p className="lab-applied">{lastControl.label} · <strong>{lastControl.value}{lastControl.suffix}</strong>
            {latest.request.recipe === 'sql' && <> · {term(latest.request.parameters.zone, locale)}</>}</p>}
          {latest.request.recipe === 'pandas' && <p className="lab-applied">{t('分组依据', 'Group by')} · <strong>{term(latest.request.parameters.groupBy, locale)}</strong></p>}
          <DemoOutput locale={locale} result={latest.result} />
          {level.goal && typeof observed === 'number' && <p className={goalMet ? 'lab-agreement' : 'lab-feedback'} role="status">
            {goalMet ? t(`达成目标，实际结果为 ${observed}。`, `Target met. The observed count is ${observed}.`)
              : t(`实际结果为 ${observed}，目标是 ${level.goal.count}。调整参数再试一次。`,
                `The observed count is ${observed}. Aim for ${level.goal.count} and try again.`)}
          </p>}
          {finished && <p className="lab-complete" role="status">{level.goal ? t('练习已完成', 'Exercise complete') : t('演示已完成', 'Demo complete')}</p>}
        </>}
      </section>
    </ExperimentWindow>
    <CommandDesk locale={locale}>
      <section className="lab-panel lab-control" aria-labelledby={rangeId + '-heading'}>
        <h2 id={rangeId + '-heading'}>{classroom ? t('实验任务', 'Experiment task') : t('实验参数', 'Demo settings')}</h2>
        {level.goal && <p className="lab-goal">{level.goal.prompt[locale]}</p>}
        {!classroom && settings}
        {latest && !finished && <button type="button" className="primary-button lab-complete" disabled={pending || !goalMet || Boolean(classroom && changed)} onClick={() => {
          setFinished(true)
          onComplete()
        }}>{level.goal ? t('完成练习', 'Complete exercise') : t('完成演示', 'Complete demo')}</button>}
        {available === false && <p className="lab-feedback" role="status">
          {t('本地实验还没准备好。请在项目目录运行', 'Local demos need setup. Run this from the project folder and reload:')}
          {' '}<code>npm run labs:setup</code>{t('，然后刷新。', '')}
        </p>}
        {level.hints.length > 0 && <details className="lab-more"><summary>{t('试试看', 'Try this')}</summary>
          <ul>{level.hints.map((hint, index) => <li key={index}>{hint[locale]}</li>)}</ul></details>}
      </section>

    </CommandDesk>
  </div>
}

export function LabDemo(props: LabDemoProps) {
  return <DemoSession key={props.level.id} {...props} />
}

export default LabDemo
