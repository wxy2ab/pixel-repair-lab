import type { FieldWorkstation } from '../engine/fieldWalkthrough'
import type { ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json, Locale } from '../shared/types'
import type { FieldState, FieldTile } from './station3d/graph-field-instrument'

const asList = (v: Json | undefined): Json[] => Array.isArray(v) ? v : []
function coordinate(v: Json | undefined) {
  return Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isSafeInteger(n)) ? v.join(',') : undefined
}
function entries(v: Json | undefined) {
  return v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : []
}

export function algorithmFieldState(kind: FieldWorkstation['kind'], snapshot: ProgramWalkthroughFrame, locale: Locale) {
  const vars: Record<string, Json> = Object.fromEntries((snapshot.stack[0]?.values ?? []).map(v => [v.name, v.value]))
  const t = (zh: string, en: string) => locale === 'zh' ? zh : en
  const stats: string[] = []
  let field: FieldState, focus: string | undefined
  if (kind === 'depth-first') {
    const waiting = asList(vars.stack).map(String)
    const visited = asList(vars.visited).map(String)
    focus = snapshot.name === 'stack' ? waiting.at(-1) : String(vars.room)
    const tiles: FieldTile[] = entries(vars.positions).flatMap(([id, xy]) => {
      if (!coordinate(xy) || !Array.isArray(xy)) return []
      return [{ id, x: Number(xy[0]), z: Number(xy[1]), label: id, current: id === focus, visited: visited.includes(id),
        pending: waiting.includes(id), robot: id === vars.room ? 'sprout' : undefined }]
    })
    const links = entries(vars.graph).flatMap(([a, neighbors]) => asList(neighbors).map((b): [string, string] => [a, String(b)]))
    field = { width: Math.max(0, ...tiles.map(tile => tile.x)) + 1, depth: Math.max(0, ...tiles.map(tile => tile.z)) + 1, tiles, links,
      bins: { title: t('栈顶', 'Stack top'), items: waiting, picks: waiting, stack: true } }
    stats.push(t('栈（底 → 顶） ', 'Stack (base → top) ') + '[' + waiting.join(', ') + ']',
      t('访问顺序 ', 'Visit order ') + '[' + visited.join(', ') + ']')
  } else if (kind === 'dynamic-programming') {
    const values = asList(vars.values), best = asList(vars.best).slice(2)
    focus = typeof vars.i === 'number' ? String(vars.i) : undefined
    const tiles = values.map((v, i) => ({ id: String(i), x: i, z: 0, label: '[' + i + ']', battery: true,
      reading: String(v), current: String(i) === focus, visited: i < best.length,
      raised: Math.min(.48, Math.max(0, Number(v) * .043)) }))
    field = { width: Math.max(1, values.length), depth: 1, tiles,
      bins: { title: t('最优记录', 'Best so far'), items: best.map(String) } }
    if (vars.skip !== undefined && vars.take !== undefined) stats.push(t('跳过 ', 'Skip ') + vars.skip, t('收取 ', 'Take ') + vars.take)
    stats.push(t('已记下 ', 'Saved ') + '[' + best.join(', ') + ']')
  } else if (kind === 'weighted-path') {
    const terrain = asList(vars.terrain)
    const trail = asList(vars.trail).map(coordinate).filter((v): v is string => !!v)
    focus = trail.at(-1)
    const tiles = terrain.flatMap((row, z) => asList(row).map((value, x) => {
      const id = x + ',' + z
      return { id, x, z, label: id, reading: String(value), current: id === focus, robot: id === focus ? 'sprout' as const : undefined,
        battery: id === coordinate(vars.goal), raised: Math.min(.55, Math.max(0, Number(value)) * .053) }
    }))
    field = { width: Math.max(1, ...terrain.map(row => asList(row).length)), depth: terrain.length, tiles, route: trail }
    stats.push(t('这条路已耗电 ', 'Charge spent ') + vars.cost)
    if (asList(vars.totals).length) stats.push(t('走完的路线 ', 'Completed routes ') + '[' + asList(vars.totals).join(', ') + ']')
  } else {
    const floor = asList(vars.floor).map(String)
    const supplies = asList(vars.supplies).map(coordinate), rivals = asList(vars.opponents).map(coordinate)
    const leads = asList(vars.leads), player = coordinate(vars.position)
    const newTurn = kind === 'supply-race' && vars.target !== undefined && ['position', 'opponents'].includes(snapshot.name ?? '')
    focus = newTurn ? snapshot.name === 'position' ? player : rivals[0]
      : kind === 'supply-race' ? coordinate(vars.target ?? vars.supply) ?? player
      : snapshot.name === 'opponents' ? rivals[0] : coordinate(vars.target ?? vars.right) ?? player
    const tiles = floor.flatMap((row, z) => [...row].map((cell, x) => {
      const id = x + ',' + z, supply = supplies.indexOf(id)
      return { id, x, z, label: supply >= 0 && kind === 'supply-race' ? String.fromCharCode(65 + supply) : id,
        battery: supply >= 0, wall: cell === '#', current: id === focus, reading: !newTurn && supply >= 0 && leads[supply] !== undefined ? String(leads[supply]) : undefined,
        robot: id === player ? 'sprout' as const : rivals.includes(id) ? 'rival' as const : undefined }
    }))
    field = { width: Math.max(1, ...floor.map(row => row.length)), depth: floor.length, tiles }
    if (newTurn) {
      stats.push(t('芽芽 ', 'Sprout ') + '(' + player + ')', t('上一轮领先量 ', 'Previous leads ') + '[' + leads.join(', ') + ']')
    } else if (kind === 'supply-race') {
      if (vars.mine !== undefined) stats.push(t('芽芽到补给 ', 'Sprout to supply ') + vars.mine)
      if (snapshot.name === 'leads' && leads.length) stats.push(t('最近的对手 ', 'Closest rival ') + vars.nearest)
      stats.push(t('领先量 ', 'Leads ') + '[' + leads.join(', ') + ']')
    } else stats.push(t('芽芽 ', 'Sprout ') + '(' + player + ')', t('对手 ', 'Rival ') + '(' + rivals.join('), (') + ')')
  }
  return { field, stats, focus }
}
