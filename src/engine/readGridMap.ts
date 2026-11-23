import { blockingGridDevice } from '../shared/gridDevices'
import type { GridSnapshot, Json, Scenario } from '../shared/types'

export function readGridMap(scenario: Scenario, state: GridSnapshot): Json {
  const exit = scenario.objectives.find(goal => goal.type === 'exit')
  const tiles = scenario.tiles.map((row, y) => [...row].map((tile, x) =>
    blockingGridDevice(scenario, state.devices, { x, y }) ? '#' : tile).join(''))
  return { tiles, start: [state.player.x, state.player.y], goal: exit ? [exit.x, exit.y] : null }
}
