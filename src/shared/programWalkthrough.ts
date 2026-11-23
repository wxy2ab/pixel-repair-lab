import type { Json, Localized, RunIssue } from './types'
import type { BreadthFirstLesson } from './breadthFirstLesson'

export type ProgramInterface = 'cli' | 'gui' | 'web'

export type ForLessonCase = {
  label: Localized
  batteries: number[]
  expected: number[]
  predictions?: { rounds: number[]; results: number[][] }
}

export type DebuggingLessonCase = {
  label: Localized
  batteries: number[]
  expected: number[]
  predictions?: number[][]
}

export type NestedLoopsCase = {
  label: Localized
  rows: number[][]
  expected: { rounds: number; rows: number[][] }
  predictions?: { rounds: number[]; rows: number[][][] }
}

export function nestedRowsMatch(left: readonly (readonly number[])[], right: readonly (readonly number[])[]): boolean {
  return left.length === right.length && left.every((row, index) =>
    row.length === right[index].length && row.every((charge, column) => charge === right[index][column]))
}

export type CollectionBattery = { name: string; charge: number }

export type BatterySearchMethod = 'linear' | 'binary'
export type BatterySearchCase = {
  batteries: CollectionBattery[]
  target: number
  expected: { battery: string; linear: number; binary: number }
}
export type BatterySearchLesson = {
  binarySource: string
  demo: BatterySearchCase & { manualOrder: string[] }
  practice: BatterySearchCase & { predictions: { linear: number[]; binary: number[] } }
}

export type BatterySearchRange = [number, number]
export type FirstBatterySearchInput = { batteries: CollectionBattery[]; target: number }
export type FirstBatterySearchCase = FirstBatterySearchInput & {
  expected: { ranges: BatterySearchRange[]; index: number }
  predictions: { ranges: BatterySearchRange[][] }
}
export type FirstBatterySearchLesson = {
  firstSource: string
  demo: { unique: FirstBatterySearchInput; repeated: FirstBatterySearchInput }
  practice: FirstBatterySearchCase
}

export type SelectionSortResult = { selected: string[]; order: string[] }
export type SelectionSortCase = { batteries: CollectionBattery[]; expected: SelectionSortResult }

export type TwoPointerMove = 'left' | 'right'
export type TwoPointerResult = { moves: TwoPointerMove[]; pair: [string, string] | null }
export type TwoPointerCase = {
  batteries: CollectionBattery[]
  target: number
  expected: { moves: TwoPointerMove[]; pair: [string, string] }
}
export type PrefixTotalsCase = {
  batteries: CollectionBattery[]
  left: number
  right: number
  expected: { prefix: number[]; total: number }
  predictions: { prefix: number[][]; totals: number[] }
}

export type BatterySequenceOperation = { kind: 'push'; battery: string } | { kind: 'pop' }

export type BatterySequenceCase = {
  label: Localized
  batteries: CollectionBattery[]
  operations: BatterySequenceOperation[]
  source?: string
  expected: { popped: string[]; remaining: string[] }
  predictions?: { popped: string[][]; remaining: string[][] }
}

export type StackLessonCase = BatterySequenceCase

export type ListPositionCase = {
  label: Localized
  batteries: CollectionBattery[]
  spare: CollectionBattery
  readIndex: number
  insertIndex: number
  removeIndex: number
  pickIndex: number
  expected: { order: string[]; picked: string }
  predictions?: { orders: string[][]; picked: string[] }
}

export const structureKinds = ['list', 'stack', 'queue', 'dictionary'] as const
export type StructureKind = typeof structureKinds[number]
export const structureLabels: Record<StructureKind, Localized> = {
  list: { zh: '列表', en: 'List' },
  stack: { zh: '栈', en: 'Stack' },
  queue: { zh: '队列', en: 'Queue' },
  dictionary: { zh: '字典', en: 'Dictionary' },
}

export type StructureBatch = { batteries: CollectionBattery[]; index: number; key: string }
export type StructuresLesson = {
  sources: Record<Exclude<StructureKind, 'list'>, string>
  demo: StructureBatch
  practice: StructureBatch & { tasks: { kind: StructureKind; prompt: Localized }[] }
}

export type CollectionLessonCase = {
  label: Localized
  batteries: CollectionBattery[]
  expected: { position: number; named: number; records: Record<string, number> }
  predictions?: { position: number[]; named: number[]; records: Record<string, number>[] }
}

export type DictionaryLessonCase = {
  label: Localized
  batteries: CollectionBattery[]
  key: string
  arrival: CollectionBattery
  increment: number
  source?: string
  expected: { reading: number; records: Record<string, number> }
  predictions?: { readings: number[]; records: Record<string, number>[] }
}

export function collectionRecordsMatch(left: Record<string, number>, right: Record<string, number>): boolean {
  const entries = Object.entries(left)
  return entries.length === Object.keys(right).length && entries.every(([name, charge]) => right[name] === charge)
}

export type ModuleLesson = {
  moduleName: 'algorithms' | 'my_algorithms'
  source: string
  functionName: string
  parameter: string
  resultVariable: string
  increment: number
}

export type ProgramWalkthrough = {
  source: string
  cases: {
    label: Localized; input: number; expected: string; predictions?: string[]; roundPredictions?: number[]
    doorOpen?: boolean; activity?: 'compare' | 'combine' | 'branch' | 'predict'
  }[]
  guided?: true
  sequence?: { arrange: string[]; broken: string[]; repair: string[] }
  assignment?: { overwriteSource: string; inputVariable: string; resultVariable: string }
  variableCups?: { addresses: number[]; variable: string; snapshot: string }
  boolean?: { threshold: number }
  functionLesson?: { functionName: string; parameter: string; resultVariable: string }
  branchLesson?: { threshold: number; actions: { if: Localized; else: Localized } }
  forLoop?: { increment: number; cases: ForLessonCase[] }
  nestedLoops?: { increment: number; cases: NestedLoopsCase[] }
  whileLoop?: { threshold: number; increment: number }
  collectionLesson?: { index: number; key: string; increment: number; cases: CollectionLessonCase[] }
  dictionaryLesson?: { cases: DictionaryLessonCase[] }
  structures?: StructuresLesson
  listPositions?: { cases: ListPositionCase[] }
  stackLesson?: { cases: StackLessonCase[] }
  queueLesson?: { cases: BatterySequenceCase[] }
  batterySearch?: BatterySearchLesson
  firstBatterySearch?: FirstBatterySearchLesson
  breadthFirstLesson?: BreadthFirstLesson
  selectionSort?: { demo: SelectionSortCase; practice: SelectionSortCase }
  twoPointerLesson?: { demo: TwoPointerCase; practice: TwoPointerCase }
  prefixTotalsLesson?: { demo: { batteries: CollectionBattery[] }; practice: PrefixTotalsCase }
  moduleLesson?: ModuleLesson
  debugging?: { increment: number; loopLine: number; returnLine: number; cases: DebuggingLessonCase[] }
  intro?: { mode: 'basics' | 'interfaces'; rule: Localized; interface?: ProgramInterface; command?: string }
  visual?: ProgramVisual
}

export type ProgramGraphic = {
  id: string
  line: number
  label: Localized
  note: Localized
  icon: 'battery' | 'store' | 'call' | 'compute' | 'return' | 'display' | 'function'
  calls?: string
}

export type ProgramVisual = {
  title: Localized
  main: ProgramGraphic[]
  functions: { id: string; title: Localized; header: ProgramGraphic; steps: ProgramGraphic[] }[]
  practice: { title: Localized; prompt: Localized; order: string[] }[]
}

export function programSourceLines(source: string): string[] {
  return source.trimEnd().split(/\r\n?|\n/u)
}

export function programGraphics(visual: ProgramVisual): ProgramGraphic[] {
  return [...visual.main, ...visual.functions.flatMap(({ header, steps }) => [header, ...steps])]
}

export function isProgramOrder(main: ProgramGraphic[], order: readonly string[]): boolean {
  return order.length === main.length && new Set(order).size === main.length && main.every(block => order.includes(block.id))
}

export function reorderProgramSource(execution: ProgramWalkthrough, order: readonly string[]): string {
  const main = execution.visual?.main
  if (!main || !isProgramOrder(main, order)) throw new Error('Invalid main program order')
  const source = programSourceLines(execution.source)
  const originalLines = new Map(main.map(block => [block.id, source[block.line - 1]]))
  main.forEach((block, index) => { source[block.line - 1] = originalLines.get(order[index])! })
  return source.join('\n')
}

export type WalkthroughBinding = { name: string; value: Json; parameter?: true }
export type WalkthroughScope = { id: number; name: string; values: WalkthroughBinding[]; callLine?: number }

export type ProgramWalkthroughFrame = {
  kind: 'start' | 'define' | 'import' | 'evaluate' | 'assign' | 'branch' | 'iterate' | 'append' | 'insert' | 'loop-end' | 'while-check' | 'call' | 'return' | 'output' | 'end'
  line?: number
  resumeLine?: number
  sourceName?: string
  resumeSourceName?: string
  moduleName?: string
  guardLine?: number
  name?: string
  value?: Json
  stack: WalkthroughScope[]
  output: string[]
}

export type ProgramWalkthroughResult = { frames: ProgramWalkthroughFrame[]; output: string[]; issue?: RunIssue }
