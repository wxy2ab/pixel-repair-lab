import type { HardwareLevel } from './hardware'
import type { ArduinoLevel } from './arduino'
import type { BreadboardLevel } from './breadboard'
import type { DataLevel } from './dataCourse'
import type { VisionLevel } from './vision'
import type { AdvancedLevel, CourseTopic, Stage, Unit } from './advanced'

export type Locale = 'zh' | 'en'
export type Localized = Record<Locale, string>
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type PythonFlowEvent = {
  kind: 'call' | 'return' | 'if' | 'for' | 'while' | 'break' | 'continue'
  sourceName: string
  line: number
  depth: number
  functionName?: string
  name?: string
  targetSourceName?: string
  resumeLine?: number
  arguments?: RackBinding[]
  condition?: boolean
  iteration?: number
  loopKind?: 'for' | 'while'
  value?: Json
}
export type GridFlowEvent = PythonFlowEvent & { boardActions: number; rackIndex?: number }
export type RackBinding = { name: string; value: Json }
export type RackStep = { line: number; sourceName: string; bindings?: RackBinding[]; boardActions?: number }
export type Direction = 'up' | 'down' | 'left' | 'right'
export type Position = { x: number; y: number }
export type Warehouse = { boxes: Position[]; targets: Position[] }
export type FerryRaceLayout = { batteries: [Position, Position]; wall: Position }
export type FerryCommand = Direction | 'pick' | 'wait'
export type ChallengeCrossing = { kind: 'crossing'; next?: string; carryFrom?: string }
export type FerryChallenge =
  | ChallengeCrossing
  | { kind: 'race'; wall: Position; solutionLayout: FerryRaceLayout }
export type MirrorPlacement = Position & { orientation: '/' | '\\' }
export type LaserTrial = ChallengeCrossing | { kind: 'race'; mirrorIds: string[]; solutionMirrors: MirrorPlacement[] }
export type ApiName = 'move' | 'scan' | 'pick' | 'say' | 'submit' | 'load' | 'store' | 'step' | 'wait' | 'read_map'
export type Origin = 'list-index' | 'stack-pop' | 'queue-pop' | 'dict-index' | 'memory-load'

export type CardParameter = {
  name: string
  label: Localized
  choices: { id: string; label: Localized; code: string }[]
}

export type CardDefinition = {
  id: string
  label: Localized
  template: string
  parameters?: CardParameter[]
  block?: boolean
}

export type CardInstance = {
  cardId: string
  values?: Record<string, string>
  children?: CardInstance[]
}

export type Item = Position & { id: string }
export type Enemy = { path: Position[] }
export type GridDevice = Position & { id: string } & (
  | { kind: 'key' | 'switch' }
  | { kind: 'door'; keyId?: string; switchId?: string }
  | { kind: 'chest'; keyId?: string }
  | { kind: 'laser'; direction: Direction; switchId?: string }
  | { kind: 'mirror'; orientation: '/' | '\\' }
  | { kind: 'cannon'; direction: Direction; period: number; phase?: number }
  | { kind: 'bomb'; atTurn: number }
)
export type GridHazard = Position & { kind: 'laser' | 'cannon' | 'bomb'; sourceId: string; direction?: Direction }
export type GridDeviceState = { keys: string[]; switches: string[]; openedChests: string[]; hazards: GridHazard[] }
export type Instruction = { op: 'LOAD' | 'ADD' | 'STORE'; address: number } | { op: 'HALT' }

export type Objective =
  | ({ type: 'exit' } & Position)
  | { type: 'parkBoxes' }
  | { type: 'collect'; itemIds: string[] }
  | { type: 'moves'; origin: Origin }
  | { type: 'submit'; values: Json[]; origin?: Origin; sameContainer?: boolean }
  | { type: 'memory'; address: number; value: number }
  | { type: 'halt' }

export type Scenario = {
  tiles: string[]
  start: Position
  warehouse?: Warehouse
  turnLimit?: number
  enemies?: Enemy[]
  devices?: GridDevice[]
  items?: Item[]
  input?: Json
  memory?: number[]
  instructions?: Instruction[]
  objectives: Objective[]
}

export type CoursePrerequisite = { unit: string; topic?: string }
export type ChallengeDifficulty = 'starter' | 'intermediate' | 'advanced' | 'expert'

export type LevelMetadata = {
  unit?: Unit
  topic?: CourseTopic
  prerequisites?: CoursePrerequisite[]
  difficulty?: ChallengeDifficulty
  stage?: Stage
  version: 1
  id: string
  order: number
  title: Localized
  brief: Localized
  concept: Localized
  hints: Localized[]
}

export type GridLevel = LevelMetadata & Scenario & {
  kind: 'grid'
  ferry?: FerryChallenge
  laserTrial?: LaserTrial
  helpers?: string[]
  allowedApi: ApiName[]
  cards: CardDefinition[]
  solutionCards: CardInstance[]
  variants?: Partial<Scenario>[]
  tutorial?: { text: Localized; target: 'palette' | 'program' | 'run' | 'board' }[]
}

export type AiFault = { itemId: string; quantity: number }

export type AiLevel = LevelMetadata & {
  kind: 'ai'
  inventory: { id: string; label: Localized; aliases: string[] }[]
  required: Record<string, number>
  trainingFault?: AiFault
  workflow?: { review: 'automatic' | 'manual'; faults: AiFault[]; cards?: Localized[]; draft?: Candidate }
  courseFinal?: true
  examplePrompts: Record<Locale, string[]>
}

export type Level = GridLevel | AiLevel | AdvancedLevel | HardwareLevel | ArduinoLevel | BreadboardLevel | DataLevel | VisionLevel
export type Candidate = { items: { id: string; quantity: number }[] }
export type AiTurnInput = { levelId: string; locale: Locale; prompt: string; previousCandidate?: Candidate }
export type Issue = { path: string; message: string; code?: string }
export type Catalog = { levels: Level[]; issues: Issue[] }

export type GridSnapshot = {
  devices?: GridDeviceState
  boxes?: Position[]
  player: Position
  enemies: Position[]
  items: Item[]
  memory: number[]
  pc: number
  accumulator: number
  halted: boolean
  turn: number
}

export type RunFrame = {
  line: number
  sourceName?: string
  action: ApiName
  state: GridSnapshot
  value?: Json
  memoryAddress?: number
  pickupKind?: 'chest' | 'key'
  issue?: RunIssue
}

export type RunIssue = {
  code: string
  attemptedAction?: ApiName
  line?: number
  sourceName?: string
  detail?: string
}

export type GridGoalGap =
  | { type: 'collect'; remaining: number }
  | { type: 'parkBoxes'; remaining: number }
  | { type: 'submit'; remaining: number; origin?: Origin }
  | { type: 'moves'; origin: Origin }
  | { type: 'memory'; address: number }
  | { type: 'exit' | 'halt' }

export type GridFailure = { issue: RunIssue; turn: number; turnLimit?: number; gaps: GridGoalGap[] }

export type GridMapRun = {
  frames: RunFrame[]
  flowEvents?: GridFlowEvent[]
  flowTruncated?: boolean
  final: GridSnapshot
  issue?: RunIssue
}

export type RunResult = GridMapRun & {
  rackSteps?: RackStep[]
  won: boolean
  mapRuns?: GridMapRun[]
  passedCases: number
  totalCases: number
  failure?: GridFailure
}
