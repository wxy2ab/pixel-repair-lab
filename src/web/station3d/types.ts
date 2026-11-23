import type { ApiName, GridHazard, Item, Json, Position, PythonFlowEvent } from '../../shared/types'
import type { BoardDevice } from '../gridDeviceDisplay'
import type { TrailEdge } from '../boardTrail'

export type ArenaCellChange = { position: Position; state: 'opened' | 'closed' | 'blocked' | 'relocated' }
export type StationCamera = 'overview' | 'follow'
export type StationAction = ApiName | PythonFlowEvent['kind']
export type StationActivity = { token: object; failed?: boolean; value?: Json; pickupKind?: 'chest' | 'key' } & (
  { action: ApiName; flow?: undefined } | { action: PythonFlowEvent['kind']; flow: PythonFlowEvent }
)

export function flowActivity(flow: PythonFlowEvent): StationActivity {
  return { token: flow, action: flow.kind, value: flow.value, flow }
}

export type StationFrame = {
  activity?: StationActivity
  location?: 'workshop' | 'arena'
  tiles: readonly string[]
  exit?: Position
  gates?: readonly Position[]
  playerPosition: Position
  opponents: readonly (Position & { id?: string; label?: string; index?: number; name?: string })[]
  items: readonly Item[]
  cellChanges?: readonly ArenaCellChange[]
  devices?: readonly BoardDevice[]
  hazards?: readonly GridHazard[]
  trailEdges?: readonly TrailEdge[]
}
