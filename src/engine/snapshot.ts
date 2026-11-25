import type { ArenaScenario, ArenaSnapshot } from '../shared/advanced'
import type { Direction, GridSnapshot, Position, RunIssue, Scenario } from '../shared/types'
import { blockingGridDevice, gridOffsets, updateGridDevices } from '../shared/gridDevices'

export function initialSnapshot(scenario: Scenario): GridSnapshot {
  const state: GridSnapshot = {
    player: { ...scenario.start },
    enemies: (scenario.enemies ?? []).map((enemy) => ({ ...enemy.path[0] })),
    items: (scenario.items ?? []).map((item) => ({ ...item })),
    memory: [...(scenario.memory ?? [])],
    pc: 0,
    accumulator: 0,
    halted: false,
    turn: 0,
  }
  if (scenario.warehouse) state.boxes = scenario.warehouse.boxes.map(box => ({ ...box }))
  if (scenario.devices?.length) {
    state.devices = { keys: [], switches: [], openedChests: [], hazards: [] }
    updateGridDevices(scenario, state)
  }
  return state
}

const sameCell = (a: Position, b: Position) => a.x === b.x && a.y === b.y

/** A successful push moves one box and the player together in a single turn. */
export function moveGridPlayer(scenario: Scenario, state: GridSnapshot, direction: Direction): RunIssue | undefined {
  if (scenario.turnLimit !== undefined && state.turn >= scenario.turnLimit) return { code: 'turnLimit' }
  const offset = gridOffsets[direction]
  const next = { x: state.player.x + offset.x, y: state.player.y + offset.y }
  const obstruction = blockingGridDevice(scenario, state.devices, next)
  if (obstruction) return { code: obstruction.kind === 'door' ? 'lockedDoor' : 'fixtureBlocked', detail: obstruction.id }
  if (scenario.tiles[next.y]?.[next.x] !== '.') return { code: 'blocked', detail: direction }
  const boxes = state.boxes
  if (boxes) {
    const index = boxes.findIndex(box => sameCell(box, next))
    if (index !== -1) {
      const destination = { x: next.x + offset.x, y: next.y + offset.y }
      if (scenario.tiles[destination.y]?.[destination.x] !== '.' || boxes.some(box => sameCell(box, destination))
        || blockingGridDevice(scenario, state.devices, destination) || state.enemies.some(enemy => sameCell(enemy, destination))) {
        return { code: 'boxBlocked', detail: direction }
      }
      boxes[index] = destination
    }
  }
  state.player = next
  if (state.enemies.some(enemy => sameCell(enemy, next))) return { code: 'enemy' }
  return advanceGridTurn(scenario, state)
}

export function advanceGridTurn(scenario: Scenario, state: GridSnapshot): RunIssue | undefined {
  state.turn++
  state.enemies = (scenario.enemies ?? []).map(({ path }) => ({ ...path[state.turn % path.length] }))
  updateGridDevices(scenario, state)
  if (state.enemies.some(enemy => enemy.x === state.player.x && enemy.y === state.player.y)) return { code: 'enemy' }
  const hazard = state.devices?.hazards.find(cell => cell.x === state.player.x && cell.y === state.player.y)
  if (hazard) return { code: hazard.kind + 'Hit', detail: hazard.sourceId }
}

// Allow the longest moving patrol to finish one cycle within the map's turn budget.
export function gridObservationTurns(scenario: Scenario): number {
  let longest = 0
  for (const { path } of scenario.enemies ?? []) {
    if (path.some(position => position.x !== path[0].x || position.y !== path[0].y)) longest = Math.max(longest, path.length)
  }
  for (const device of scenario.devices ?? []) {
    if (device.kind === 'bomb') longest = Math.max(longest, device.atTurn + 1)
    if (device.kind === 'cannon') longest = Math.max(longest, device.period + 1)
  }
  return Math.min(longest, scenario.turnLimit ?? longest)
}

export function gridObservationFrames(scenario: Scenario): GridSnapshot[] {
  const frames: GridSnapshot[] = []
  const state = initialSnapshot(scenario)
  const turns = gridObservationTurns(scenario)
  while (state.turn < turns) {
    const caught = advanceGridTurn(scenario, state)
    frames.push(structuredClone(state))
    if (caught) break
  }
  return frames
}

export function initialArenaSnapshot(scenario: ArenaScenario): ArenaSnapshot {
  const stats = scenario.combat ? { hp: scenario.combat.health, power: 0, shield: 0 } : {}
  return {
    actors: [
      { ...scenario.start, id: 'player', score: 0, ...stats },
      ...scenario.opponents.map(({ id, start }) => ({ ...start, id, score: 0, ...stats })),
    ],
    items: scenario.items.map((item) => ({ ...item })),
    turn: 0,
    ...((scenario.combat || scenario.objective.kind === 'collect') && { collected: [] }),
    ...(scenario.shifts?.length || scenario.combat?.switches?.length ? { tiles: [...scenario.tiles] } : {}),
  }
}
