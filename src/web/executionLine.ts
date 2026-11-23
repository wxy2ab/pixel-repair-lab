import type { PersonalAlgorithms } from '../shared/advanced'
import { SHORTEST_STEP_SOURCE } from '../shared/shortestStepSource'

export function executionSourceText(sourceName: string, main: string, personal: PersonalAlgorithms, course: PersonalAlgorithms) {
  if (sourceName === 'main.py') return main
  const [module, name] = sourceName.split('.')
  if (module === 'my_algorithms') return personal[name]
  if (module === 'algorithms') return course[name] ?? (name === 'shortest_step' ? SHORTEST_STEP_SOURCE : undefined)
}

export function executionLine(line: number, sourceName: string | undefined, main: string,
  personal: PersonalAlgorithms, course: PersonalAlgorithms): string | undefined {
  const source = executionSourceText(sourceName ?? 'main.py', main, personal, course)
  return source?.split('\n')[line - 1]?.trim()
}
