import type { CollectionBattery, ListPositionCase, ProgramWalkthroughFrame, ProgramWalkthroughResult, StructureBatch } from '../shared/programWalkthrough'
import { ProgramError, PythonProgram, type PythonModules } from './python'
import { bare, MAX_COLLECTION, MAX_STRING, Values } from './values'

const MAX_SOURCE = 2_000
const MAX_LINES = 30
const MAX_STEPS = 1_200
const MAX_FRAMES = 96

type ListPositionInput = Pick<ListPositionCase, 'batteries' | 'spare' | 'readIndex' | 'insertIndex' | 'removeIndex' | 'pickIndex'>

function listPositionInputs({ batteries, spare, readIndex, insertIndex, removeIndex, pickIndex }: ListPositionInput) {
  const size = batteries.length
  const entries = [...batteries, spare]
  if (size >= MAX_COLLECTION || entries.some(({ name, charge }) => typeof name !== 'string' || name.length === 0
    || name.length > MAX_STRING || !Number.isSafeInteger(charge) || charge < 0)) return undefined
  if (new Set(entries.map(({ name }) => name)).size !== entries.length
    || ![readIndex, insertIndex, removeIndex, pickIndex].every(index => Number.isSafeInteger(index) && index >= 0)
    || readIndex >= size || insertIndex > size || removeIndex > size || pickIndex >= size) return undefined
  return new Map<string, string[] | string | number>([
    ['read_battery_names', batteries.map(({ name }) => name)],
    ['read_index', readIndex],
    ['insert_index', insertIndex],
    ['spare_battery', spare.name],
    ['remove_index', removeIndex],
    ['pick_index', pickIndex],
  ])
}

export function runProgramWalkthrough(
  source: string, input: number,
  { traceAssignmentValues, traceBranches, traceForLoops, traceWhileLoops, traceModules, modules,
    doorOpen, batteryCharges, batteryRecords, batteryRows, structureBatch, listPositions }: {
    traceAssignmentValues?: boolean; traceBranches?: boolean; traceForLoops?: boolean; traceWhileLoops?: boolean;
    traceModules?: boolean; modules?: PythonModules;
    doorOpen?: boolean; batteryCharges?: readonly number[]; batteryRecords?: readonly CollectionBattery[];
    batteryRows?: readonly (readonly number[])[];
    structureBatch?: StructureBatch;
    listPositions?: ListPositionInput;
  } = {},
): ProgramWalkthroughResult {
  const frames: ProgramWalkthroughFrame[] = []
  const output: string[] = []
  if (source.length > MAX_SOURCE) return { frames, output, issue: { code: 'limit' } }
  const program = source.trimEnd().replace(/\r\n?/gu, '\n')
  if (program.split('\n').length > MAX_LINES) return { frames, output, issue: { code: 'limit' } }
  if (!Number.isSafeInteger(input)) return { frames, output, issue: { code: 'type', detail: 'scan' } }
  if (batteryCharges && batteryCharges.length > MAX_COLLECTION) return { frames, output, issue: { code: 'limit' } }
  if (batteryCharges && !batteryCharges.every(Number.isSafeInteger)) {
    return { frames, output, issue: { code: 'type', detail: 'read_batteries' } }
  }
  if (batteryRecords && batteryRecords.length > MAX_COLLECTION) return { frames, output, issue: { code: 'limit' } }
  if (batteryRecords && (new Set(batteryRecords.map(({ name }) => name)).size !== batteryRecords.length
    || batteryRecords.some(({ name, charge }) => typeof name !== 'string' || name.length === 0 || name.length > MAX_STRING
      || !Number.isSafeInteger(charge)))) {
    return { frames, output, issue: { code: 'type', detail: 'read_named_batteries' } }
  }
  if (batteryRows && (batteryRows.length > MAX_COLLECTION
    || batteryRows.reduce((total, row) => total + row.length, 0) > MAX_COLLECTION)) {
    return { frames, output, issue: { code: 'limit' } }
  }
  if (batteryRows && !batteryRows.every(row => row.every(Number.isSafeInteger))) {
    return { frames, output, issue: { code: 'type', detail: 'read_battery_rows' } }
  }
  if (structureBatch) {
    const { batteries, index, key } = structureBatch
    if (batteries.length > MAX_COLLECTION) return { frames, output, issue: { code: 'limit' } }
    const names = new Set(batteries.map(battery => battery.name))
    if (!Number.isSafeInteger(index) || index < 0 || index >= batteries.length || !names.has(key)
      || names.size !== batteries.length || batteries.some(({ name, charge }) => typeof name !== 'string'
        || name.length === 0 || name.length > MAX_STRING || !Number.isSafeInteger(charge) || charge < 0)) {
      return { frames, output, issue: { code: 'type', detail: 'read_battery_batch' } }
    }
  }
  const listInputs = listPositions && listPositionInputs(listPositions)
  if (listPositions && !listInputs) return { frames, output, issue: { code: 'type', detail: 'read_battery_names' } }

  try {
    const values = new Values()
    new PythonProgram(program, values, (name, args, line) => {
      if (name === 'scan') {
        if (args.length !== 0) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        return bare(input)
      }
      if (name === 'door_open' && typeof doorOpen === 'boolean') {
        if (args.length !== 0) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        return bare(doorOpen)
      }
      if (name === 'read_batteries' && batteryCharges !== undefined) {
        if (args.length !== 0) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        return values.list(batteryCharges.map(bare))
      }
      if (name === 'read_named_batteries' && batteryRecords !== undefined) {
        if (args.length !== 0) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        return values.dictionary(new Map(batteryRecords.map(({ name, charge }) => [name, bare(charge)])))
      }
      if (name === 'read_battery_rows' && batteryRows !== undefined) {
        if (args.length !== 0) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        return values.list(batteryRows.map(row => values.list(row.map(bare))))
      }
      if (structureBatch && (name === 'read_battery_batch' || name === 'read_battery_directory' || name === 'read_battery_key')) {
        if (args.length !== 0) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        if (name === 'read_battery_key') return bare(structureBatch.key)
        const entries = structureBatch.batteries.map(({ name, charge }) => [name, values.fromJson({ name, charge })] as const)
        return name === 'read_battery_directory' ? values.dictionary(new Map(entries)) : values.list(entries.map(([, value]) => value))
      }
      const listInput = listInputs?.get(name)
      if (listInput !== undefined) {
        if (args.length !== 0) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        return Array.isArray(listInput) ? values.list(listInput.map(bare)) : bare(listInput)
      }
      if (name === 'say') {
        if (args.length !== 1) throw new ProgramError({ code: 'wrongArguments', line, detail: name })
        const value = args[0].data
        if (typeof value !== 'string') throw new ProgramError({ code: 'type', line, detail: name })
        if (value.length > MAX_STRING) throw new ProgramError({ code: 'limit', line, detail: name })
        return bare(null)
      }
      throw new ProgramError({ code: 'apiDisabled', line, detail: name })
    }, {
      stepBudget: MAX_STEPS,
      traceAssignmentValues,
      traceBranches,
      traceForLoops,
      traceListEdits: !!listInputs,
      traceWhileLoops,
      traceModules,
      modules,
      trace: frame => {
        if (frames.length >= MAX_FRAMES) throw new ProgramError({ code: 'limit', line: frame.line })
        if (frame.kind === 'output' && typeof frame.value === 'string') output.push(frame.value)
        frames.push({ ...frame, output: [...output] })
      },
    }).run()
    return { frames, output }
  } catch (error) {
    return { frames, output, issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
  }
}
