import { useState } from 'react'
import type { BreadthFirstStep } from '../engine/programBreadthFirst'
import { sameBreadthCell, type BreadthCell, type BreadthFirstMap } from '../shared/breadthFirstLesson'
import type { Locale } from '../shared/types'
import { TeachingModel } from './station3d/TeachingModel'
import type { FieldState } from './station3d/graph-field-instrument'
import { tr } from './text'
import './algorithm-field.css'

export const loadGraphField = () => import('./station3d/graph-field-instrument').then(module => module.buildGraphField)
const key = ([x, y]: BreadthCell) => x + ',' + y

export type SearchMark = { cell: BreadthCell; label: string; from?: BreadthCell; arrow?: string }

export function BreadthFirstInstrument({ map, step, order, path, locale, onCell, mark }: {
  map: BreadthFirstMap; step?: BreadthFirstStep; order?: BreadthCell[]; path?: BreadthCell[]
  locale: Locale; onCell?: (cell: BreadthCell) => void; mark?: SearchMark
}) {
  const [inspection, select] = useState<{ id: string; snapshot?: BreadthFirstStep; result?: BreadthCell[] }>()
  const selected = inspection?.snapshot === step && inspection?.result === order ? inspection?.id : undefined
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const route = step?.path ?? path ?? []
  const tiles = map.tiles.flatMap((row, z) => [...row].map((tile, x) => {
    const cell: BreadthCell = [x, z]
    const id = key(cell)
    const seen = step?.visited.find(visit => sameBreadthCell(cell, visit.cell))
    const index = order?.findIndex(entry => sameBreadthCell(entry, cell)) ?? -1
    const arrow = sameBreadthCell(cell, mark?.from) ? mark?.arrow : undefined
    const reading = mark && sameBreadthCell(cell, mark.cell) ? [arrow, mark.label].filter(Boolean).join(' ') : arrow
    return {
      id, x, z, label: id, wall: tile === '#', visited: !!seen || index >= 0,
      robot: sameBreadthCell(cell, map.start) ? 'sprout' as const : undefined, battery: sameBreadthCell(cell, map.goal),
      current: sameBreadthCell(cell, step?.current), pending: step?.queue.some(entry => sameBreadthCell(entry, cell)),
      selected: selected === id || sameBreadthCell(step?.neighbor, cell),
      reading: reading ?? (seen ? String(seen.depth) : index >= 0 ? '#' + (index + 1) : undefined),
    }
  }))
  const field: FieldState = { width: map.tiles[0].length, depth: map.tiles.length, tiles, route: route.map(key),
    links: mark?.from && !sameBreadthCell(mark.from, mark.cell) ? [[key(mark.from), key(mark.cell)]] : undefined,
    bins: step && { title: t('队头 ↓', 'Front ↓'), items: step.queue.map(key), picks: step.queue.map(key) } }
  const spot = tiles.find(cell => cell.id === selected)
  return <>
    <TeachingModel sceneKey="breadth-first-field" label={t('芽芽的搜索沙盘', 'Sprout’s search table')}
      locale={locale} state={field} load={loadGraphField} onPick={id => {
        const tile = tiles.find(entry => entry.id === id)
        if (tile) { select({ id, snapshot: step, result: order }); onCell?.([tile.x, tile.z]) }
      }} />
    {spot && <p className="bfs-map-key" aria-live="polite">{'(' + spot.id + ') · '}
      {spot.wall ? t('墙', 'Wall') : spot.pending ? t('等待出队', 'Waiting in the queue')
        : spot.current ? t('正在处理', 'Processing now') : spot.visited ? t('已访问', 'Visited')
          : spot.battery ? t('电池', 'Battery') : t('可以通行', 'Open floor')}</p>}
  </>
}
