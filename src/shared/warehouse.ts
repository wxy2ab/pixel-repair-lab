import type { GridSnapshot, Position, RunFrame } from './types'

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
