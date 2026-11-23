import type { AlgorithmLevel, ArenaLevel, PersonalAlgorithms } from './advanced'
import type { GridLevel, Level } from './types'

export function resolveCourseHelpers(level: AlgorithmLevel | ArenaLevel | GridLevel, catalog: Level[]): PersonalAlgorithms {
  const sources = new Map<string, string | undefined>()
  const requested = new Set(level.helpers ?? [])
  if (!requested.size) return {}
  for (const candidate of catalog) {
    if (candidate.kind !== 'algorithm' || candidate.stage === 'challenge' || candidate.helpers?.length || !requested.has(candidate.functionName)) continue
    const name = candidate.functionName
    sources.set(name, sources.has(name) ? undefined : candidate.solutionCode)
  }
  return Object.fromEntries(sources)
}

export function selectHelpers(names: string[], sources: PersonalAlgorithms = {}): PersonalAlgorithms {
  return Object.fromEntries(names.flatMap(name => {
    const source = Object.hasOwn(sources, name) ? sources[name] : undefined
    return typeof source === 'string' ? [[name, source]] : []
  }))
}
