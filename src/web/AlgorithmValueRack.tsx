import { useState } from 'react'
import type { Json, Locale, RackBinding, RackStep } from '../shared/types'
import { pythonValue } from './pythonValue'
import { TeachingModel } from './station3d/TeachingModel'
import { tr } from './text'
import { AlgorithmGridReading, rackGrid } from './AlgorithmGridReading'
import './algorithm-value-rack.css'

const load = () => import('./station3d/algorithm-rack').then(module => module.buildAlgorithmRack)
const pageSize = 8

function entries(value: Json): [string, Json][] {
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item])
  if (value !== null && typeof value === 'object') return Object.entries(value)
  return [['', value]]
}

export function AlgorithmValueRack({ inputs, step, previous, actual, locale, costs = false, hasRouteMap = false }: {
  inputs: RackBinding[]; step?: RackStep; previous?: RackStep; actual?: Json; locale: Locale; costs?: boolean; hasRouteMap?: boolean
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [variable, setVariable] = useState<string>()
  const [cell, setCell] = useState<string>()
  const [offset, setOffset] = useState(0)
  const locals = step?.bindings?.length ? step.bindings : inputs
  const bindings = actual === undefined ? locals : [{ name: 'return', value: actual }, ...locals]
  const priorScope = step?.sourceName === previous?.sourceName ? previous?.bindings : undefined
  const firstArray = locals.find(entry => Array.isArray(entry.value))
  const active = bindings.find(entry => entry.name === variable) ??
    (actual !== undefined ? bindings[0] : firstArray ?? locals[0])
  const all = active ? entries(active.value) : []
  const isCostGrid = costs && JSON.stringify(active?.value) === JSON.stringify(inputs[0]?.value)
  const grid = hasRouteMap ? undefined : rackGrid(active?.value, isCostGrid)
  const prior = priorScope?.find(entry => entry.name === active?.name)
  const before = new Map(prior ? entries(prior.value) : [])
  const start = Math.min(offset, Math.floor(Math.max(0, all.length - 1) / pageSize) * pageSize)
  const items = all.slice(start, start + pageSize)
  const selected = items.find(([key]) => key === cell) ?? items[0]
  const label = active?.name ?? t('工作架', 'Workbench')
  const collection = active?.value !== null && typeof active?.value === 'object'
  const address = selected && collection ? label + '[' + (Array.isArray(active?.value) ? selected[0] : JSON.stringify(selected[0])) + ']' : label
  const gauges = (step?.bindings ?? []).filter(entry => entry !== active && (typeof entry.value === 'number' || typeof entry.value === 'boolean')).slice(-4)
  function selectVariable(name: string) { setVariable(name); setCell(undefined); setOffset(0) }
  return <section className="algorithm-value-rack" aria-label={t('算法观察台', 'Algorithm inspector')}>
    <div className="algorithm-rack-controls">
      {bindings.length > 0 && <label>{t('观察', 'Inspect')} <select value={active?.name} onChange={e => selectVariable(e.target.value)}>
        {bindings.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
      </select></label>}
      {!grid && all.length > pageSize && <>
        <button type="button" className="subtle-button" disabled={start === 0} onClick={() => setOffset(start - pageSize)}>{t('上一排', 'Previous row')}</button>
        <span>{start + 1}–{Math.min(start + pageSize, all.length)} / {all.length}</span>
        <button type="button" className="subtle-button" disabled={start + pageSize >= all.length} onClick={() => setOffset(start + pageSize)}>{t('下一排', 'Next row')}</button>
      </>}
    </div>
    {grid ? <AlgorithmGridReading name={label} grid={grid} bindings={bindings} inputs={inputs} locale={locale} />
      : <TeachingModel sceneKey="algorithm-value-rack" label={t('维修站数据架', 'Repair station data rack')} locale={locale} load={load}
      onPick={items.length ? setCell : undefined} state={{ title: label, selected: cell, locale,
        cells: items.map(([key, value]) => {
          const text = pythonValue(value)
          return { key, label: text.length > 14 ? text.slice(0, 13) + '…' : text, charge: typeof value === 'number' ? value : undefined,
            changed: Boolean(prior) && JSON.stringify(before.get(key)) !== JSON.stringify(value) }
        }), gauges: gauges.map(entry => entry.name + ' = ' + pythonValue(entry.value)) }} />}
    {!grid && selected && <div className="algorithm-rack-controls">
      {all.length > 1 && <label>{t('格位', 'Slot')} <select value={selected[0]} onChange={e => setCell(e.target.value)}>
        {items.map(([key]) => <option key={key} value={key}>{key}</option>)}
      </select></label>}
      <code data-testid="rack-reading">{address} = {pythonValue(selected[1])}</code>
    </div>}
    {active && !all.length && <code data-testid="rack-reading">{label} = {pythonValue(active.value)}</code>}
    {step && !step.bindings && <small>{t('这一步的变量太大，工作架显示初始输入。', 'The variables at this step exceed the display limit. The rack shows the original input.')}</small>}
  </section>
}
