import { parser } from '@lezer/python'
import { collectionRecordsMatch, programSourceLines, type DictionaryLessonCase, type ProgramWalkthrough, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'

const kinds = ['load', 'lookup', 'register', 'calculate', 'update', 'output'] as const

export type DictionaryLessonStep = {
  kind: typeof kinds[number]
  line: number
  code: string
  records: Record<string, number>
  key?: string
  value?: number
}

export type DictionaryLessonRun = {
  steps: DictionaryLessonStep[]
  reading: number
  records: Record<string, number>
  output: string
}

type VisibleFrame = ProgramWalkthroughFrame & { line: number }

function binding(frame: ProgramWalkthroughFrame, name: string): Json | undefined {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

function isCharge(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isChargeRecord(value: Json | undefined): value is Record<string, number> {
  return value !== undefined && value !== null && typeof value === 'object'
    && !Array.isArray(value) && Object.values(value).every(isCharge)
}

function lookupKey(code: string, recordsName: string): string | undefined {
  const assignment = parser.parse(code).topNode.getChild('AssignStatement')
  const lookup = assignment?.getChild('MemberExpression')
  const owner = lookup?.getChild('VariableName')
  const key = lookup?.getChild('String')
  if (!owner || code.slice(owner.from, owner.to) !== recordsName || !key) return undefined
  return /^(['"])([A-Za-z][A-Za-z0-9_-]{0,15})\1$/u.exec(code.slice(key.from, key.to))?.[2]
}

export function runDictionaryLesson(execution: ProgramWalkthrough, sample: DictionaryLessonCase): DictionaryLessonRun | undefined {
  if (!execution.dictionaryLesson) return undefined
  const source = sample.source ?? execution.source
  const { frames, output, issue } = runProgramWalkthrough(source, 0, { batteryRecords: sample.batteries })
  if (issue || output.length !== 1 || frames.length !== kinds.length + 2
    || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end') return undefined

  const lines = programSourceLines(source)
  const work = frames.slice(1, -1)
  if (!work.every((frame, index): frame is VisibleFrame => frame.stack.length === 1 && frame.line !== undefined
    && lines[frame.line - 1] !== undefined && frame.kind === (kinds[index] === 'output' ? 'output' : 'assign'))) return undefined
  if (work.some((frame, index) => index > 0 && frame.line <= work[index - 1].line)) return undefined

  const [loaded, lookedUp, added, calculated, updated, displayed] = work
  const recordsName = loaded.name
  const readingName = lookedUp.name
  const calculationName = calculated.name
  if (!recordsName || !readingName || !calculationName || new Set([recordsName, readingName, calculationName]).size !== 3) return undefined

  const initialRecords = Object.fromEntries(sample.batteries.map(({ name, charge }) => [name, charge]))
  const snapshots = work.map(frame => binding(frame, recordsName))
  if (!snapshots.every(isChargeRecord)) return undefined
  const [initial, lookup, registered, duringCalculation, records, printed] = snapshots
  if (!collectionRecordsMatch(initial, initialRecords) || !collectionRecordsMatch(lookup, initial)) return undefined

  const key = lookupKey(lines[lookedUp.line - 1], recordsName)
  const reading = lookedUp.value
  if (key !== sample.key || !Object.hasOwn(initial, key) || !isCharge(reading)
    || reading !== initial[key] || binding(lookedUp, readingName) !== reading) return undefined

  const { name: arrival, charge: arrivalCharge } = sample.arrival
  if (Object.hasOwn(initial, arrival) || added.value !== arrivalCharge
    || !collectionRecordsMatch(registered, { ...initial, [arrival]: arrivalCharge })
    || !collectionRecordsMatch(duringCalculation, registered)) return undefined

  const newCharge = calculated.value
  if (!isCharge(newCharge) || newCharge === reading || newCharge !== reading + sample.increment
    || binding(calculated, calculationName) !== newCharge
    || updated.value !== newCharge || !collectionRecordsMatch(records, { ...registered, [key]: newCharge })
    || !collectionRecordsMatch(printed, records) || displayed.value !== output[0]
    || output[0] !== JSON.stringify(records)) return undefined

  const details = [
    {}, { key, value: reading }, { key: arrival, value: arrivalCharge }, { key, value: newCharge }, { key, value: newCharge }, {},
  ]
  const steps = work.map(({ line }, index) => ({
    kind: kinds[index], line, code: lines[line - 1], records: snapshots[index], ...details[index],
  }))
  return { steps, reading, records, output: output[0] }
}
