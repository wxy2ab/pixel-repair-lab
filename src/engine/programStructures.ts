import {
  programSourceLines, type CollectionBattery, type ProgramWalkthrough, type ProgramWalkthroughFrame,
  type StructureBatch, type StructureKind,
} from '../shared/programWalkthrough'
import type { Json } from '../shared/types'
import { runProgramWalkthrough } from './programWalkthrough'
import { valuesEqual } from './values'

export type StructureStep = {
  kind: 'load' | 'target' | 'select' | 'output'
  line: number
  code: string
  remaining: CollectionBattery[]
  selected?: CollectionBattery
}

export type StructureLessonRun = {
  steps: StructureStep[]
  selected: CollectionBattery
  remaining: CollectionBattery[]
  output: string
}

function isBattery(value: Json | undefined): value is CollectionBattery {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.name === 'string' && typeof value.charge === 'number' && Number.isSafeInteger(value.charge)
}

function readBatteryBoard(value: Json | undefined, kind: StructureKind): CollectionBattery[] | undefined {
  if (kind !== 'dictionary') return Array.isArray(value) && value.every(isBattery) ? value : undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries: CollectionBattery[] = []
  for (const [name, battery] of Object.entries(value)) {
    if (!isBattery(battery) || battery.name !== name) return undefined
    entries.push(battery)
  }
  return entries
}

function binding(frame: ProgramWalkthroughFrame, name: string): Json | undefined {
  return frame.stack[0]?.values.find(value => value.name === name)?.value
}

export function runStructureLesson(execution: ProgramWalkthrough, kind: StructureKind, batch: StructureBatch): StructureLessonRun | undefined {
  if (!execution.structures) return undefined
  const source = kind === 'list' ? execution.source : execution.structures.sources[kind]
  const targeted = kind === 'list' || kind === 'dictionary'
  const stages: StructureStep['kind'][] = targeted ? ['load', 'target', 'select', 'output'] : ['load', 'select', 'output']
  const { frames, output, issue } = runProgramWalkthrough(source, batch.index, { structureBatch: batch })
  if (issue || frames.length !== stages.length + 2 || output.length !== 1
    || frames[0].kind !== 'start' || frames.at(-1)?.kind !== 'end') return undefined

  const work = frames.slice(1, -1)
  const boardName = work[0].name
  const { name: selectedName, value: selected } = work[work.length - 2]
  if (!boardName || !selectedName || boardName === selectedName || !isBattery(selected) || output[0] !== selected.name
    || !batch.batteries.some(battery => valuesEqual(battery, selected))) return undefined

  const afterSelection = targeted ? batch.batteries : batch.batteries.filter(battery => battery.name !== selected.name)
  const lines = programSourceLines(source)
  const steps: StructureStep[] = []
  for (const [index, frame] of work.entries()) {
    const step = stages[index]
    if (frame.kind !== (step === 'output' ? 'output' : 'assign') || frame.stack.length !== 1 || frame.line === undefined) return undefined
    const code = lines[frame.line - 1]
    const remaining = readBatteryBoard(binding(frame, boardName), kind)
    const hasSelection = step === 'select' || step === 'output'
    if (code === undefined || !remaining || !valuesEqual(remaining, hasSelection ? afterSelection : batch.batteries)) return undefined

    if (step === 'target') {
      const requested = kind === 'list' ? batch.index : batch.key
      if (!frame.name || frame.name === boardName || frame.name === selectedName
        || frame.value !== requested || binding(frame, frame.name) !== requested) return undefined
    }
    if (hasSelection) {
      const snapshot = binding(frame, selectedName)
      if (snapshot === undefined || !valuesEqual(snapshot, selected)) return undefined
    }
    steps.push({ kind: step, line: frame.line, code, remaining, ...(hasSelection && { selected }) })
  }
  return { steps, selected, remaining: steps[steps.length - 1].remaining, output: output[0] }
}
