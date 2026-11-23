import type { Direction, Position } from '../shared/types'

export type TrailEdge = { from: Position; to: Position; direction: Direction; recent: boolean }
export type TrailArm = { direction: Direction; recent: boolean }

export function visibleTrailEdges(positions: readonly Position[] = []): TrailEdge[] {
  const edges = new Map<string, TrailEdge>()
  let latest: TrailEdge | undefined
  for (let index = 1; index < positions.length; index++) {
    const from = positions[index - 1]
    const to = positions[index]
    const dx = to.x - from.x, dy = to.y - from.y
    if (dx === 0 && dy === 0) continue
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      latest = undefined
      continue
    }
    const direction = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up'
    // Both directions of a corridor share one mark, even after a U-turn.
    const key = Math.min(from.x, to.x) + ',' + Math.min(from.y, to.y) + (dx ? 'h' : 'v')
    latest = { from, to, direction, recent: false }
    edges.set(key, latest)
  }
  if (latest) latest.recent = true
  return Array.from(edges.values())
}

const opposite: Record<Direction, Direction> = { right: 'left', left: 'right', up: 'down', down: 'up' }

export function trailArmsByCell(edges: readonly TrailEdge[], columns: number) {
  const cells = new Map<number, TrailArm[]>()
  function add(position: Position, direction: Direction, recent: boolean) {
    const key = position.y * columns + position.x
    const arm = { direction, recent }
    const previous = cells.get(key)
    if (previous) previous.push(arm)
    else cells.set(key, [arm])
  }
  for (const { from, to, direction, recent } of edges) {
    add(from, direction, recent)
    add(to, opposite[direction], recent)
  }
  return cells
}
