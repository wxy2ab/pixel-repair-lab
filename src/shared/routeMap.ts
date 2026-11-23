import type { Direction, Json, Position } from './types'
import { gridOffsets } from './gridDevices'

export type RouteMap = { tiles: string[]; start: Position; goal: Position }

export function readRouteMap(args: Json[]): RouteMap | undefined {
  const [tiles, start, goal] = args
  if (args.length !== 3 || !Array.isArray(tiles) || typeof tiles[0] !== 'string' || tiles.length > 20) return
  const width = tiles[0].length
  if (!tiles.every((row): row is string => typeof row === 'string' && /^[.#]{1,20}$/.test(row) && row.length === width)) return
  function point(value: Json) {
    if (!Array.isArray(value) || value.length !== 2) return
    const [x, y] = value
    if (typeof x === 'number' && Number.isInteger(x) && typeof y === 'number' && Number.isInteger(y)) return { x, y }
  }
  const a = point(start), b = point(goal)
  if (a && b && tiles[a.y]?.[a.x] === '.' && tiles[b.y]?.[b.x] === '.') return { tiles, start: a, goal: b }
}

export function shortestRouteLength({ tiles, start, goal }: RouteMap): number | undefined {
  const width = tiles[0].length
  const queue = [{ ...start, distance: 0 }]
  const visited = new Set([start.y * width + start.x])
  for (let front = 0; front < queue.length; front++) {
    const cell = queue[front]
    if (cell.x === goal.x && cell.y === goal.y) return cell.distance
    for (const offset of Object.values(gridOffsets)) {
      const x = cell.x + offset.x, y = cell.y + offset.y
      const key = y * width + x
      if (tiles[y]?.[x] !== '.' || visited.has(key)) continue
      visited.add(key)
      queue.push({ x, y, distance: cell.distance + 1 })
    }
  }
}

export function walkRoute(map: RouteMap, answer: Json) {
  const positions = [map.start]
  if (!Array.isArray(answer)) return { positions, error: 'list' as const }
  for (const direction of answer) {
    if (typeof direction !== 'string' || !Object.hasOwn(gridOffsets, direction)) return { positions, error: 'direction' as const }
    const delta = gridOffsets[direction as Direction]
    const from = positions[positions.length - 1]
    const to = { x: from.x + delta.x, y: from.y + delta.y }
    if (map.tiles[to.y]?.[to.x] !== '.') return { positions, error: 'blocked' as const }
    positions.push(to)
  }
  return { positions }
}

export function isShortestRoute(map: RouteMap, answer: Json) {
  const length = shortestRouteLength(map)
  if (!Array.isArray(answer) || answer.length !== (length ?? 0)) return false
  if (length === undefined) return true
  const route = walkRoute(map, answer)
  const end = route.positions[route.positions.length - 1]
  return !route.error && end.x === map.goal.x && end.y === map.goal.y
}
