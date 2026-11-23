import type { AlgorithmLevel, ArenaLevel, PersonalAlgorithms } from '../shared/advanced'
import { debugAlgorithmCase, runAlgorithm } from './algorithms'
import { observeArenaMaps, runArena } from './arena'

type RunRequest = {
  type?: 'run'
  level: ArenaLevel | AlgorithmLevel
  source: string
  personal?: PersonalAlgorithms
  course?: PersonalAlgorithms
}

type DebugRequest = Omit<RunRequest, 'type' | 'level'> & { type: 'debug-algorithm'; level: AlgorithmLevel; index: number; observeRack?: boolean }

self.addEventListener('message', (event: MessageEvent<RunRequest | DebugRequest | { type: 'observe-arena'; level: ArenaLevel }>) => {
  if (event.data.type === 'debug-algorithm') {
    const { level, source, index, personal, course } = event.data
    self.postMessage(debugAlgorithmCase(level, source, index, personal, course, event.data.observeRack, true))
    return
  }
  if (event.data.type === 'observe-arena') {
    self.postMessage(observeArenaMaps(event.data.level))
    return
  }
  const { level, source, personal, course } = event.data
  self.postMessage(level.kind === 'arena' ? runArena(level, source, personal, course, { recordFlow: true })
    : runAlgorithm(level, source, personal, course))
})
