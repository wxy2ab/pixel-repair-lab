import { programSourceLines, type ListPositionCase, type ProgramWalkthrough, type ProgramWalkthroughFrame } from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'
import { valuesEqual } from './values'

export type ListPositionStep = {
  kind: 'load' | 'read' | 'insert' | 'remove' | 'select' | 'output'
  line: number
  code: string
  order: string[]
  battery?: string
}

export type ListPositionsRun = { steps: ListPositionStep[]; order: string[]; picked: string; output: string }

const stages = [
  { kind: 'load', event: 'assign' },
  { kind: 'read', event: 'assign' },
  { kind: 'insert', event: 'insert' },
  { kind: 'remove', event: 'assign' },
  { kind: 'select', event: 'assign' },
  { kind: 'output', event: 'output' },
] as const

function binding(frame: ProgramWalkthroughFrame, name: string): Json | undefined {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

function isBatteryOrder(value: Json | undefined): value is string[] {
  return Array.isArray(value) && value.every(name => typeof name === 'string')
}

export function runListPositionsLesson(execution: ProgramWalkthrough, sample: ListPositionCase): ListPositionsRun | undefined {
  if (!execution.listPositions) return undefined
  const { frames, output, issue } = runProgramWalkthrough(execution.source, 0, { listPositions: sample })
  if (issue || output.length !== 1 || frames.length !== stages.length + 2
    || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end') return undefined

  const work = frames.slice(1, -1)
  const board = work[0].name
  const picked = work[4].value
  if (!board || typeof picked !== 'string' || output[0] !== picked) return undefined

  const lines = programSourceLines(execution.source)
  const steps: ListPositionStep[] = []
  for (const [index, { kind, event }] of stages.entries()) {
    const frame = work[index]
    if (frame.kind !== event || frame.stack.length !== 1 || frame.line === undefined) return undefined
    const code = lines[frame.line - 1]
    const order = binding(frame, board)
    const battery = kind === 'load' ? undefined : frame.value
    if (code === undefined || !isBatteryOrder(order) || (kind !== 'load' && typeof battery !== 'string')
      || (kind === 'insert' && frame.name !== board)) return undefined
    steps.push({ kind, line: frame.line, code, order, ...(typeof battery === 'string' && { battery }) })
  }

  const [loaded, read, inserted, removed, selected, displayed] = steps
  if (!valuesEqual(loaded.order, sample.batteries.map(({ name }) => name)) || !valuesEqual(read.order, loaded.order)
    || inserted.order.length !== loaded.order.length + 1 || removed.order.length !== loaded.order.length
    || !valuesEqual(selected.order, removed.order) || !valuesEqual(displayed.order, selected.order)) return undefined
  return { steps, order: displayed.order, picked, output: output[0] }
}
