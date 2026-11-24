import type { AiLevel, ApiName, Direction, Item, Json, LevelMetadata, Localized, Position, PythonFlowEvent, RunIssue, Scenario } from './types'
import type { ProgramWalkthrough } from './programWalkthrough'
import type { BatteryDispatchConfig } from './batteryDispatch'
import type { BatteryPipelineConfig } from './batteryPipeline'
import type { CircuitLectureConfig, CpuLectureConfig } from './hardware'

export type Stage = 'explain' | 'demo' | 'exercise' | 'challenge'
export type Unit = { id: string; order: number; title: Localized }
export type CourseTopic = { id: string; order: number; title: Localized }

export type LectureAnimationItem = {
  id: string
  label: Localized
  value?: Localized
  state?: 'active' | 'done' | 'muted'
  height?: number
  swatch?: string
}
export type LectureAnimation = {
  layout: 'row' | 'stack' | 'grid' | 'bars' | 'pipeline'
  hardware?: CircuitLectureConfig | CpuLectureConfig
  workstation?: {
    kind: 'depth-first' | 'weighted-path' | 'dynamic-programming' | 'rival-detour' | 'supply-race'
    checkpoints: { line: number; visit?: number }[]
  }
  frames: { caption: Localized; items: LectureAnimationItem[] }[]
}

export type LectureLevel = LevelMetadata & {
  animation?: LectureAnimation
  overview?: true
  execution?: ProgramWalkthrough
  kind: 'lecture'
  sections: { title: Localized; body: Localized }[]
  question: { prompt: Localized; options: Localized[]; correct: number; feedback: Localized }
}

export type ReplayExample = {
  title: Localized
  source: string
  scenario: Scenario & { allowedApi: ApiName[] }
}

export type ReplayLevel = LevelMetadata & { kind: 'replay' } & (
  | { mode: 'grid'; examples: ReplayExample[] }
  | { mode: 'ai'; example: AiLevel }
)

export type LabRecipe = 'numpy' | 'pandas' | 'analysis' | 'sql' | 'opencv' | 'yolox'
export type LabLevel = LevelMetadata & { kind: 'lab'; recipe: LabRecipe; goal?: { count: number; prompt: Localized } }

export type ChargingChallengeConfig = {
  trialCase: number
  predictions: { caseIndex: number; options: number[][][] }[]
}

export type AlgorithmLevel = LevelMetadata & {
  kind: 'algorithm'
  pathGrading?: 'shortest'
  functionName: string
  helpers?: string[]
  chargingChallenge?: ChargingChallengeConfig
  batteryDispatch?: BatteryDispatchConfig
  batteryPipeline?: BatteryPipelineConfig
  starterCode: string
  solutionCode: string
  snippets: { label: Localized; code: string }[]
  cases: { args: Json[]; expected: Json }[]
}

export type AlgorithmResult = {
  won: boolean
  cases: { passed: boolean; actual?: Json; issue?: RunIssue }[]
  issue?: RunIssue
}

export type PersonalAlgorithms = Partial<Record<string, string>>
export type ArenaAction = 'move' | 'pick' | 'wait' | 'shoot' | 'guard'
export type ArenaBuff = { id: string; kind: 'power' | 'shield' }
export type ArenaCombat = { health: number; range: number; buffs: ArenaBuff[] }
export type ArenaOpponent = {
  id: string
  title: Localized
  start: Position
  policy: { kind: 'patrol'; path: Position[] } | { kind: 'pursue' } | { kind: 'collect' }
    | { kind: 'adaptive'; style: 'secure' | 'intercept' | 'flex' }
    | { kind: 'duelist'; style: 'sentry' | 'hunter' }
}
export type ArenaShift = { turn: number; open?: Position[]; close?: Position[]; moveItems?: Item[] }
export type ArenaShiftResult = {
  turn: number
  opened: Position[]
  closed: Position[]
  blocked: Position[]
  relocated: { id: string; from: Position; to: Position }[]
}
export type ArenaScenario = {
  tiles: string[]
  start: Position
  items: Item[]
  opponents: ArenaOpponent[]
  maxTurns: number
  objective: { kind: 'score' } | { kind: 'escape'; exit: Position; itemIds: string[] }
    | { kind: 'eliminate' } | { kind: 'collect'; itemIds: string[] }
  combat?: ArenaCombat
  shifts?: ArenaShift[]
}
export type ArenaLevel = LevelMetadata & ArenaScenario & {
  kind: 'arena'
  helpers?: string[]
  starterCode: string
  solutionCode: string
  snippets: { label: Localized; code: string }[]
  variants?: Partial<ArenaScenario>[]
}
export type ArenaActor = Position & { id: string; score: number; hp?: number; power?: number; shield?: number }
export type ArenaSnapshot = { actors: ArenaActor[]; items: Item[]; turn: number; tiles?: string[]; collected?: string[] }
export type ArenaEvent = {
  actorId: string; action: ArenaAction; direction?: Direction; itemId?: string; blocked?: boolean;
  tactic?: 'secure' | 'contest'; targetId?: string;
  path?: Position[]; damage?: number; absorbed?: number; buff?: ArenaBuff['kind'];
}
export type ArenaReading = {
  tiles: string[]; player: number[]; opponents: ArenaActor[]; items: Item[]; turn: number; exit: number[] | null
  playerScore?: number; nextShift?: number | null
  self?: ArenaActor; range?: number; buffs?: ArenaBuff[]; collected?: string[]
}
export type ArenaScan = { line: number; sourceName?: string; count: number; value: ArenaReading }
export type ArenaProgramEvent = PythonFlowEvent | { kind: 'scan'; scan: ArenaScan }
export type ArenaFrame = {
  line: number; sourceName?: string; state: ArenaSnapshot; events: ArenaEvent[]; shift?: ArenaShiftResult; scan?: ArenaScan
  program?: ArenaProgramEvent[]
}
export type ArenaOutcome = 'win' | 'draw' | 'loss'
export type ArenaReason = 'score' | 'escape' | 'caught' | 'timeout' | 'unfinished' | 'error' | 'eliminate' | 'collect' | 'disabled'
export type ArenaFailure = { turn: number; issue?: RunIssue } & (
  | { goal: 'score'; score: number; leaderScore: number }
  | { goal: 'escape'; remaining: number; atExit: boolean }
  | { goal: 'eliminate' | 'collect'; remaining: number }
)
export type ArenaResult = {
  won: boolean
  outcome: ArenaOutcome
  reason: ArenaReason
  frames: ArenaFrame[]
  variantFrames?: ArenaFrame[][]
  trailingScans?: (ArenaScan | undefined)[]
  trailingProgram?: ArenaProgramEvent[][]
  programTruncated?: boolean[]
  final: ArenaSnapshot
  passedCases: number
  totalCases: number
  issue?: RunIssue
  failure?: ArenaFailure
}

export type AdvancedLevel = LectureLevel | ReplayLevel | LabLevel | AlgorithmLevel | ArenaLevel
