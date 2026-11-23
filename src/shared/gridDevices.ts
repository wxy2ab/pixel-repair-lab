import type { Direction, GridDevice, GridDeviceState, GridHazard, GridSnapshot, Position, Scenario } from './types'

export const gridOffsets: Record<Direction, Position> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
}

export function isGridDoorOpen(door: Extract<GridDevice, { kind: 'door' }>, state?: GridDeviceState) {
  return Boolean(state && (door.keyId && state.keys.includes(door.keyId) || door.switchId && state.switches.includes(door.switchId)))
}

function isSolid(device: GridDevice, state?: GridDeviceState) {
  return device.kind === 'cannon' || device.kind === 'laser' || device.kind === 'mirror'
    || (device.kind === 'door' && !isGridDoorOpen(device, state))
}

export function blockingGridDevice(scenario: Scenario, state: GridDeviceState | undefined, position: Position) {
  return scenario.devices?.find(device => device.x === position.x && device.y === position.y && isSolid(device, state))
}

export function reflectGridDirection(direction: Direction, orientation: '/' | '\\'): Direction {
  const turns = orientation === '/' ? slashTurns : backslashTurns
  return turns[direction]
}
const slashTurns: Record<Direction, Direction> = { up: 'right', right: 'up', down: 'left', left: 'down' }
const backslashTurns: Record<Direction, Direction> = { up: 'left', left: 'up', down: 'right', right: 'down' }

function traceRay(source: Extract<GridDevice, { kind: 'laser' | 'cannon' }>, scenario: Scenario, state: GridDeviceState, hazards: GridHazard[]) {
  let { x, y, direction } = source
  const visited = new Set<string>()
  while (true) {
    x += gridOffsets[direction].x
    y += gridOffsets[direction].y
    if (scenario.tiles[y]?.[x] !== '.') return
    const segment = x + ',' + y + ',' + direction
    if (visited.has(segment)) return
    visited.add(segment)
    const obstruction = blockingGridDevice(scenario, state, { x, y })
    if (obstruction && (obstruction.kind !== 'mirror' || source.kind !== 'laser')) return
    hazards.push({ x, y, kind: source.kind, sourceId: source.id, direction })
    if (obstruction?.kind === 'mirror') direction = reflectGridDirection(direction, obstruction.orientation)
  }
}

export function updateGridDevices(scenario: Scenario, snapshot: GridSnapshot) {
  const state = snapshot.devices
  if (!state || !scenario.devices) return
  const floorDevice = scenario.devices.find(device => device.x === snapshot.player.x && device.y === snapshot.player.y)
  if (floorDevice?.kind === 'key' && !state.keys.includes(floorDevice.id)) state.keys.push(floorDevice.id)
  if (floorDevice?.kind === 'switch' && !state.switches.includes(floorDevice.id)) state.switches.push(floorDevice.id)
  const hazards: GridHazard[] = []
  for (const device of scenario.devices) {
    if (device.kind === 'laser' && !(device.switchId && state.switches.includes(device.switchId))) {
      traceRay(device, scenario, state, hazards)
    }
    if (device.kind === 'cannon' && snapshot.turn > 0 && snapshot.turn % device.period === (device.phase ?? 0)) {
      traceRay(device, scenario, state, hazards)
    }
    if (device.kind === 'bomb' && snapshot.turn === device.atTurn) {
      hazards.push({ x: device.x, y: device.y, kind: 'bomb', sourceId: device.id })
      for (const offset of Object.values(gridOffsets)) {
        const position = { x: device.x + offset.x, y: device.y + offset.y }
        if (scenario.tiles[position.y]?.[position.x] === '.' && !blockingGridDevice(scenario, state, position)) {
          hazards.push({ ...position, kind: 'bomb', sourceId: device.id })
        }
      }
    }
  }
  state.hazards = hazards
}
