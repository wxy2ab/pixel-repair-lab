import { nestedRowsMatch, programSourceLines, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'

export type NestedLoopsStep = {
  kind: 'load' | 'initialize' | 'select-row' | 'initialize-row' | 'take' | 'charge' | 'finish-row' | 'record-row' | 'stop' | 'output'
  line: number
  code: string
  rounds: number
  rows: number[][]
  rowIndex?: number
  batteryIndex?: number
  charge?: number
  charged?: number
  currentRow?: number[]
}

export type NestedLoopsLessonRun = {
  steps: NestedLoopsStep[]
  rounds: number
  rows: number[][]
  output: string
}

type SourceFrame = ProgramWalkthroughFrame & { line: number }
type StepDetail = Pick<NestedLoopsStep, 'rowIndex' | 'batteryIndex' | 'charge' | 'charged' | 'currentRow'>

function binding(frame: ProgramWalkthroughFrame, name: string): Json | undefined {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

function isCharge(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isRow(value: Json | undefined): value is number[] {
  return Array.isArray(value) && value.every(isCharge)
}

function isMatrix(value: Json | undefined): value is number[][] {
  return Array.isArray(value) && value.every(isRow)
}

function sameRow(left: Json | undefined, right: readonly number[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index])
}

function sameRows(left: Json | undefined, right: readonly (readonly number[])[]): boolean {
  return isMatrix(left) && nestedRowsMatch(left, right)
}

export function runNestedLoopsLesson(source: string, batteries: readonly (readonly number[])[]): NestedLoopsLessonRun | undefined {
  const { frames, output, issue } = runProgramWalkthrough(source, 0, { batteryRows: batteries, traceForLoops: true })
  const count = batteries.reduce((total, row) => total + row.length, 0)
  // Each row adds selection, initialization, exhaustion, and recording. Each battery adds a read and an append.
  if (issue || frames.length !== 6 + 4 * batteries.length + 2 * count
    || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end' || output.length !== 1) return undefined

  const lines = programSourceLines(source)
  const work = frames.slice(1, -1)
  if (!work.every((frame): frame is SourceFrame =>
    frame.stack.length === 1 && frame.line !== undefined && lines[frame.line - 1] !== undefined)) return undefined
  const [loaded, initialized] = work
  const stopped = work[work.length - 2]
  const displayed = work[work.length - 1]
  const resultName = initialized.name
  const rowName = stopped.name
  if (loaded.kind !== 'assign' || !loaded.name || !sameRows(loaded.value, batteries)
    || initialized.kind !== 'assign' || !resultName || !sameRows(initialized.value, [])
    || stopped.kind !== 'loop-end' || !rowName || new Set([loaded.name, resultName, rowName]).size !== 3
    || displayed.kind !== 'output' || !(loaded.line < initialized.line && initialized.line < stopped.line && stopped.line < displayed.line)) {
    return undefined
  }

  const steps: NestedLoopsStep[] = []
  let rounds = 0
  let rows: number[][] = []
  let cursor = 2
  function step(kind: NestedLoopsStep['kind'], frame: SourceFrame, details: StepDetail = {}) {
    steps.push({ kind, line: frame.line, code: lines[frame.line - 1], rounds, rows, ...details })
  }
  step('load', loaded)
  step('initialize', initialized)
  for (const [rowIndex, row] of batteries.entries()) {
    const selected = work[cursor++]
    const reset = work[cursor++]
    const finish = work[cursor + 2 * row.length]
    const saved = work[cursor + 2 * row.length + 1]
    const innerName = finish.name
    const chargedRowName = reset.name
    if (selected.kind !== 'iterate' || selected.name !== rowName || selected.line !== stopped.line
      || !sameRow(selected.value, row) || !sameRow(binding(selected, rowName), row)
      || reset.kind !== 'assign' || !chargedRowName || !sameRow(reset.value, [])
      || finish.kind !== 'loop-end' || !innerName || saved.kind !== 'append' || saved.name !== resultName
      || new Set([loaded.name, resultName, rowName, chargedRowName, innerName]).size !== 5
      || !(selected.line < reset.line && reset.line < finish.line && finish.line < saved.line && saved.line < displayed.line)
      || !sameRows(binding(selected, resultName), rows) || !sameRows(binding(reset, resultName), rows)) return undefined

    const empty = binding(reset, chargedRowName)
    if (!isRow(empty) || empty.length !== 0) return undefined
    let currentRow = empty
    step('select-row', selected, { rowIndex })
    step('initialize-row', reset, { rowIndex, currentRow })
    for (const [batteryIndex, charge] of row.entries()) {
      const taken = work[cursor++]
      const chargedFrame = work[cursor++]
      const charged = chargedFrame.value
      const updated = binding(chargedFrame, chargedRowName)
      if (taken.kind !== 'iterate' || taken.name !== innerName || taken.line !== finish.line || taken.value !== charge
        || binding(taken, innerName) !== charge || !sameRow(binding(taken, chargedRowName), currentRow)
        || chargedFrame.kind !== 'append' || chargedFrame.name !== chargedRowName
        || !(finish.line < chargedFrame.line && chargedFrame.line < saved.line)
        || !isCharge(charged) || !isRow(updated) || !sameRow(updated, [...currentRow, charged])
        || !sameRows(binding(taken, resultName), rows) || !sameRows(binding(chargedFrame, resultName), rows)) return undefined
      step('take', taken, { rowIndex, batteryIndex, charge, currentRow })
      currentRow = updated
      rounds++
      step('charge', chargedFrame, { rowIndex, batteryIndex, charge, charged, currentRow })
    }
    cursor += 2
    const recorded = binding(saved, resultName)
    if (!sameRow(binding(finish, chargedRowName), currentRow) || !sameRows(binding(finish, resultName), rows)
      || !sameRow(saved.value, currentRow) || !isMatrix(recorded) || !nestedRowsMatch(recorded, [...rows, currentRow])) return undefined

    step('finish-row', finish, { rowIndex, currentRow })
    rows = recorded
    step('record-row', saved, { rowIndex, currentRow })
  }

  if (!sameRows(binding(stopped, resultName), rows) || !sameRows(binding(displayed, resultName), rows)
    || displayed.value !== output[0] || output[0] !== JSON.stringify(rows)) return undefined
  step('stop', stopped)
  step('output', displayed)
  return { steps, rounds, rows, output: output[0] }
}
