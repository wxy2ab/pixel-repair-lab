import type { ApiName, GridHazard, Item, Json, Position, PythonFlowEvent, Scenario } from '../../shared/types'
import type { BoardDevice } from '../gridDeviceDisplay'
import type { TrailEdge } from '../boardTrail'
import type { ArenaScenario, ArenaEvent } from '../../shared/advanced'
import type { ArenaTurnMotion } from '../arenaTurnMotion'

export type ArenaCellChange = { position: Position; state: 'opened' | 'closed' | 'blocked' | 'relocated' }
// A live push stamps performance.now() here. Saved positions and backward steps have no arrival.
export type WarehouseArrival = Position & { id: number }
export const cargoArrivalDuration = 960
export type StationCamera = 'overview' | 'follow'
export type StationCommand = ApiName | 'shoot' | 'guard'
export type StationAction = StationCommand | PythonFlowEvent['kind']
export type StationActivity = { token: object; failed?: boolean; value?: Json; pickupKind?: 'chest' | 'key' } & (
  { action: StationCommand; flow?: undefined } | { action: PythonFlowEvent['kind']; flow: PythonFlowEvent }
)

export function flowActivity(flow: PythonFlowEvent): StationActivity {
  return { token: flow, action: flow.kind, value: flow.value, flow }
}

export type StationFrame = {
  activity?: StationActivity
  location?: 'workshop' | 'arena'
  tiles: readonly string[]
  exit?: Position
  ferryDock?: boolean
  gates?: readonly Position[]
  playerPosition: Position
  warehouse?: Scenario['warehouse']
  warehouseArrival?: WarehouseArrival
  mapTargets?: readonly (Position & { id?: string })[]
  playerDown?: boolean
  arenaBuffs?: NonNullable<ArenaScenario['combat']>['buffs']
  arenaSwitches?: NonNullable<ArenaScenario['combat']>['switches']
  arenaTargetIds?: readonly string[]
  arenaShots?: readonly ArenaEvent[]
  arenaMotion?: ArenaTurnMotion
  opponents: readonly (Position & { id?: string; label?: string; index?: number; name?: string })[]
  items: readonly Item[]
  cellChanges?: readonly ArenaCellChange[]
  devices?: readonly BoardDevice[]
  hazards?: readonly GridHazard[]
  trailEdges?: readonly TrailEdge[]
}
