import type { ArenaFrame, ArenaLevel, ArenaResult, ArenaSnapshot, PersonalAlgorithms } from '../shared/advanced'
import type { Direction, Position, PythonFlowEvent, RunIssue } from '../shared/types'

export const ARENA_TURN_MS = 1_800
export type ArenaChoice = Direction | 'pick' | 'wait' | 'guard' | `shoot-${Direction}`
export type RealtimeArenaProgress = { actions: ArenaChoice[]; policy?: string; queued?: ArenaChoice }
export type RealtimeArenaCheckpoint = RealtimeArenaProgress & { remainingMs: number }
export type RealtimePolicyStep = { source: string; line: number; sourceName?: string; flow?: PythonFlowEvent[]; truncated?: boolean }

const choices = new Set<unknown>(['up', 'right', 'down', 'left', 'pick', 'wait'])
const combatChoices = new Set<unknown>(['guard', 'shoot-up', 'shoot-right', 'shoot-down', 'shoot-left'])
const maxPolicyLength = 12_000

export function isArenaChoice(value: unknown, combat = true): value is ArenaChoice {
  return choices.has(value) || (combat && combatChoices.has(value))
}

export function validateRealtimeArenaCheckpoint(value: unknown, maxTurns: number, combat = false): RealtimeArenaCheckpoint | undefined {
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const { actions, policy, queued, remainingMs } = value as Record<string, unknown>
  if (!Array.isArray(actions) || actions.length >= maxTurns) return
  const history: unknown[] = [...actions]
  if (!history.every(action => isArenaChoice(action, combat))) return
  if (policy !== undefined && (typeof policy !== 'string' || !policy.trim() || policy.length > maxPolicyLength)) return
  if (queued !== undefined && !isArenaChoice(queued, combat)) return
  if (typeof remainingMs !== 'number' || !Number.isFinite(remainingMs) || remainingMs < 0 || remainingMs > ARENA_TURN_MS) return
  return { actions: history, policy, queued, remainingMs }
}

export type RealtimeArenaRequest =
  | { type: 'prepare'; level: ArenaLevel; personal?: PersonalAlgorithms; course?: PersonalAlgorithms; checkpoint?: RealtimeArenaCheckpoint }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'policy'; source: string; requestId: number }
  | { type: 'action'; action: ArenaChoice; turn: number }

export type RealtimeArenaResponse =
  | { type: 'ready'; snapshot: ArenaSnapshot; restored?: {
    checkpoint: RealtimeArenaCheckpoint; frame?: ArenaFrame; latestShift?: ArenaFrame['shift']; playerPositions: Position[]
  } }
  | { type: 'started'; nextAt: number; progress: RealtimeArenaProgress }
  | { type: 'paused'; checkpoint: RealtimeArenaCheckpoint }
  | { type: 'policy'; requestId: number; active: boolean; issue?: RunIssue; progress: RealtimeArenaProgress }
  | { type: 'action'; turn: number; progress: RealtimeArenaProgress }
  | { type: 'turn'; frame: ArenaFrame; nextAt?: number; result?: ArenaResult; issue?: RunIssue; policyStep?: RealtimePolicyStep; progress: RealtimeArenaProgress }
