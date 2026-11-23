import type { GridMapRun, Position, Scenario } from '../shared/types'

export function gridTrailAt(scenario: Scenario, run: GridMapRun | undefined, frameIndex: number): Position[] {
  const positions = [scenario.start]
  if (!run) return positions
  for (let index = 0; index <= frameIndex && index < run.frames.length; index++) {
    const player = run.frames[index].state.player
    const last = positions[positions.length - 1]
    if (player.x !== last.x || player.y !== last.y) positions.push(player)
  }
  return positions
}
