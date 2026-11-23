import type { ArenaLevel, ArenaResult, PersonalAlgorithms } from '../shared/advanced'

export function arenaReplayCase(result: ArenaResult | undefined, index: number) {
  const frames = index === 0 ? result?.frames : result?.variantFrames?.[index - 1]
  // A Python exception between actions has an instruction to inspect but consumes no arena turn.
  const issue = index === result?.passedCases ? result.failure?.issue : undefined
  return { frames, issue, count: (frames?.length ?? 0) + Number(!!issue) }
}

// A turn with line zero is an automatic wait. An exception has its own stop after the final action.
export function arenaReplayLine(replay: ReturnType<typeof arenaReplayCase>, step: number) {
  if (!replay.frames || step < 1 || step > replay.count) return
  if (step > replay.frames.length) {
    const issue = replay.issue
    if (issue?.line) return { line: issue.line, sourceName: issue.sourceName }
    return
  }
  const { line, sourceName } = replay.frames[step - 1]
  if (line > 0) return { line, sourceName }
}

export type ArenaReplayInput = {
  source: string
  personal: PersonalAlgorithms
  course: PersonalAlgorithms
}

export type ArenaReplayProgress = ArenaReplayInput & { step: number }

const maxSourceLength = 12_000
const algorithmName = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validSource(source: unknown): source is string {
  return typeof source === 'string' && source.length <= maxSourceLength && Boolean(source.trim())
}

function readModules(value: unknown): PersonalAlgorithms | undefined {
  if (!record(value)) return
  const modules: [string, string][] = []
  for (const [name, source] of Object.entries(value)) {
    if (!algorithmName.test(name) || !validSource(source)) return
    modules.push([name, source])
  }
  return Object.fromEntries(modules)
}

export function parseArenaReplayProgress(value: unknown, level: ArenaLevel): ArenaReplayProgress | undefined {
  if (!record(value)) return
  const { source, step } = value
  if (!validSource(source) || typeof step !== 'number' || !Number.isSafeInteger(step) || step < 0 || step >= level.maxTurns) return
  const personal = readModules(value.personal)
  const course = readModules(value.course)
  if (personal && course) return { source, personal, course, step }
}

export function captureArenaReplayInput(source: string, personal: PersonalAlgorithms, course: PersonalAlgorithms): ArenaReplayInput {
  // The interpreter only imports helpers named in the arena program itself.
  const referenced = (modules: PersonalAlgorithms) => Object.fromEntries(Object.entries(modules)
    .filter(([name, code]) => source.includes(name) && validSource(code)))
  return { source, personal: referenced(personal), course: referenced(course) }
}
