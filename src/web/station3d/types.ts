import type { ApiName, GridHazard, Item, Json, Position, PythonFlowEvent } from '../../shared/types'
import type { BoardDevice } from '../gridDeviceDisplay'
import type { TrailEdge } from '../boardTrail'
import type { ArenaScenario, ArenaEvent } from '../../shared/advanced'

export type ArenaCellChange = { position: Position; state: 'opened' | 'closed' | 'blocked' | 'relocated' }
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
  mapTargets?: readonly (Position & { id?: string })[]
  playerDown?: boolean
  arenaBuffs?: NonNullable<ArenaScenario['combat']>['buffs']
  arenaTargetIds?: readonly string[]
  arenaShots?: readonly ArenaEvent[]
  opponents: readonly (Position & { id?: string; label?: string; index?: number; name?: string })[]
  items: readonly Item[]
  cellChanges?: readonly ArenaCellChange[]
  devices?: readonly BoardDevice[]
  hazards?: readonly GridHazard[]
  trailEdges?: readonly TrailEdge[]
}
