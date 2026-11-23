import { useState } from 'react'
import type { Json, Locale, RackBinding } from '../shared/types'
import { TeachingModel } from './station3d/TeachingModel'
import type { FieldState } from './station3d/graph-field-instrument'
import { tr } from './text'

const load = () => import('./station3d/graph-field-instrument').then(module => module.buildGraphField)
type Grid = (number | string)[][]

export function rackGrid(value: Json | undefined, costs: boolean): Grid | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 20) return
  if (value.every((row): row is string => typeof row === 'string' && /^[.#]{1,20}$/.test(row) && row.length === (value[0] as string).length)) {
    return value.map(row => [...row])
  }
  const width = Array.isArray(value[0]) ? value[0].length : 0
  if (costs && width > 0 && width <= 20 && value.every((row): row is number[] =>
    Array.isArray(row) && row.length === width && row.every(cell => typeof cell === 'number'))) return value
}

// Only mark coordinates the child explicitly chooses. A list of visits need not
// be a connected path (two consecutive visits can be in different branches).
function position(value: Json | undefined, grid: Grid): string | undefined {
  if (!Array.isArray(value) || value.length !== 2) return
  const [x, y] = value
  if (typeof x === 'number' && typeof y === 'number' && Number.isInteger(x) && Number.isInteger(y)
    && grid[y]?.[x] !== undefined) return x + ',' + y
}

function positions(value: Json, grid: Grid): string[] | undefined {
  const one = position(value, grid)
  if (one) return [one]
  if (!Array.isArray(value)) return
  const cells: string[] = []
  for (const entry of value) {
    const id = position(entry, grid) ?? (Array.isArray(entry) && Array.isArray(entry[0]) ? position(entry[0], grid) : undefined)
    if (!id) return
    cells.push(id)
  }
  return cells
}

export function AlgorithmGridReading({ name, grid, bindings, inputs, locale }: {
  name: string; grid: Grid; bindings: RackBinding[]; inputs: RackBinding[]; locale: Locale
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [marker, setMarker] = useState('')
  const [selected, select] = useState('0,0')
  const layers = bindings.filter(item => item.name !== name).flatMap(({ name, value }) => {
    const ids = positions(value, grid)
    return ids ? [{ name, ids }] : []
  })
  const layer = layers.find(item => item.name === marker)
  const start = position(inputs[1]?.value, grid), goal = position(inputs[2]?.value, grid)
  const tiles = grid.flatMap((row, z) => row.map((value, x) => {
    const id = x + ',' + z
    return { x, z, id, label: id, wall: value === '#', selected: selected === id,
      pending: layer?.ids.includes(id), battery: id === goal, robot: id === start ? 'sprout' as const : undefined,
      reading: typeof value === 'number' ? String(value) : undefined }
  }))
  const tile = tiles.find(tile => tile.id === selected) ?? tiles[0]
  const field: FieldState = { width: grid[0].length, depth: grid.length, tiles }
  return <>
    <TeachingModel sceneKey="algorithm-case-field" label={t('维修站地图', 'Repair station map')} locale={locale}
      load={load} state={field} onPick={select} />
    <div className="algorithm-rack-controls">
      {layers.length > 0 && <label>{t('标记坐标', 'Mark coordinates')} <select value={layer?.name ?? ''} onChange={e => setMarker(e.target.value)}>
        <option value="">{t('选择变量', 'Choose a variable')}</option>
        {layers.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
      </select></label>}
      <label>{t('地图格', 'Map cell')} <select value={tile.id} onChange={e => select(e.target.value)}>
        {tiles.map(entry => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
      </select></label>
      <code data-testid="rack-reading">{name}[{tile.z}][{tile.x}] = {tile.reading ?? JSON.stringify(grid[tile.z][tile.x])}</code>
      {layer && <span>{layer.name} · {layer.ids.length ? layer.ids.map(id => '(' + id + ')').join(' · ') : '[]'}</span>}
    </div>
  </>
}
