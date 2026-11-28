import { breadthFirstReference } from './breadthFirstLesson'
import type { Direction, GridSnapshot, Position, RunFrame } from './types'

function stepDirection(dx: number, dy: number): Direction {
  if (dx !== 0) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

export function warehouseTapRoute(tiles: string[], { player, boxes }: Pick<GridSnapshot, 'player' | 'boxes'>, target: Position): Direction[] {
  const dx = target.x - player.x, dy = target.y - player.y
  if (tiles[target.y]?.[target.x] !== '.' || (dx === 0 && dy === 0)) return []
  if (Math.abs(dx) + Math.abs(dy) === 1) return [stepDirection(dx, dy)]

  // Walking to a distant cell keeps every crate in its current place.
  const walkable = tiles.slice()
  for (const { x, y } of boxes ?? []) {
    if (x === target.x && y === target.y) return []
    const row = walkable[y]
    walkable[y] = row.slice(0, x) + '#' + row.slice(x + 1)
  }
  const { path } = breadthFirstReference({ tiles: walkable, start: [player.x, player.y], goal: [target.x, target.y] })
  return path.slice(1).map(([x, y], i) => stepDirection(x - path[i][0], y - path[i][1]))
}

export function warehouseParked(boxes: readonly Position[], targets: readonly Position[]): number {
  return targets.filter(target => boxes.some(box => box.x === target.x && box.y === target.y)).length
}

/** Box order in a snapshot is stable, including when another box later occupies the same pad. */
export function warehousePushDestination(before: GridSnapshot, after: GridSnapshot): Position | undefined {
  if (after.turn !== before.turn + 1 || !before.boxes || before.boxes.length !== after.boxes?.length) return
  const dx = after.player.x - before.player.x, dy = after.player.y - before.player.y
  if (Math.abs(dx) + Math.abs(dy) !== 1) return
  const index = before.boxes.findIndex(box => box.x === after.player.x && box.y === after.player.y)
  const destination = after.boxes[index]
  if (destination?.x === after.player.x + dx && destination.y === after.player.y + dy) return destination
}

export function warehouseRunPushes(start: GridSnapshot, frames: readonly RunFrame[]) {
  let pushes = 0, before = start
  for (const frame of frames) {
    if (frame.action === 'move' && !frame.issue && warehousePushDestination(before, frame.state)) pushes++
    before = frame.state
  }
  return pushes
}
