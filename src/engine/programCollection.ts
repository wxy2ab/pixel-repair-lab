import { collectionRecordsMatch, programSourceLines, type CollectionBattery, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'
import { valuesEqual } from './values'

const kinds = ['load-list', 'index', 'label', 'lookup', 'update', 'output'] as const

export type CollectionStep = {
  kind: typeof kinds[number]
  line: number
  code: string
  list: number[]
  records?: Record<string, number>
  value?: number
}

export type CollectionLessonRun = {
  steps: CollectionStep[]
  positionValue: number
  namedValue: number
  records: Record<string, number>
  output: string
}

function isCharge(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function dictionary(value: Json | undefined): value is Record<string, number> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(isCharge)
}

function binding(frame: ProgramWalkthroughFrame, name: string): Json | undefined {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

export function runCollectionLesson(source: string, batteries: readonly CollectionBattery[]): CollectionLessonRun | undefined {
  const charges = batteries.map(({ charge }) => charge)
  const { frames, output, issue } = runProgramWalkthrough(source, 0, { batteryCharges: charges, batteryRecords: batteries })
  if (issue || frames.length !== kinds.length + 2 || output.length !== 1
    || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end') return undefined

  const work = frames.slice(1, -1)
  const [loaded, indexed, labeled, lookedUp, updated, displayed] = work
  const listName = loaded.name
  const recordName = labeled.name
  const positionValue = indexed.value
  const namedValue = lookedUp.value
  if (!listName || !recordName || listName === recordName || !isCharge(positionValue) || !isCharge(namedValue)
    || !indexed.name || binding(indexed, indexed.name) !== positionValue || !lookedUp.name || binding(lookedUp, lookedUp.name) !== namedValue
    || !isCharge(updated.value) || updated.name === recordName || displayed.value !== output[0]) return undefined

  const initialRecords = Object.fromEntries(batteries.map(({ name, charge }) => [name, charge]))
  const records = binding(updated, recordName)
  if (!dictionary(records) || output[0] !== JSON.stringify(records)) return undefined
  const changed = Object.keys(records).filter(name => records[name] !== initialRecords[name])
  if (Object.keys(records).length !== batteries.length || changed.length !== 1
    || !Object.hasOwn(initialRecords, changed[0]) || records[changed[0]] !== updated.value) return undefined

  const lines = programSourceLines(source)
  const steps: CollectionStep[] = []
  for (const [index, frame] of work.entries()) {
    const kind = kinds[index]
    if (frame.kind !== (kind === 'output' ? 'output' : 'assign') || frame.stack.length !== 1 || frame.line === undefined) return undefined
    const code = lines[frame.line - 1]
    const list = binding(frame, listName)
    if (code === undefined || !Array.isArray(list) || !list.every(isCharge) || !valuesEqual(list, charges)) return undefined

    const snapshot = binding(frame, recordName)
    const expected = kind === 'label' || kind === 'lookup' ? initialRecords
      : kind === 'update' || kind === 'output' ? records : undefined
    if (expected !== undefined && (!dictionary(snapshot) || !collectionRecordsMatch(snapshot, expected))) return undefined
    if (expected === undefined && snapshot !== undefined) return undefined

    steps.push({ kind, line: frame.line, code, list, records: dictionary(snapshot) ? snapshot : undefined,
      value: isCharge(frame.value) ? frame.value : undefined })
  }
  return { steps, positionValue, namedValue, records, output: output[0] }
}
