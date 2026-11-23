import type { PersonalAlgorithms } from '../shared/advanced'
import type { GridLevel } from '../shared/types'
import { mapScenarioAt } from '../shared/mapScenarios'
import { runProgram } from './run'

self.addEventListener('message', (event: MessageEvent<{ level: GridLevel; source: string; personal?: PersonalAlgorithms; course?: PersonalAlgorithms; inspectMap?: number; observeRack?: boolean; observeFlow?: boolean }>) => {
  const { level, source, personal, course, inspectMap, observeRack, observeFlow } = event.data
  const result = runProgram(level, source, personal, course, observeRack, observeFlow)
  // Official checks stop at the first failed map. A child debugging a later map
  // can still inspect its steps, without changing which checks count for scores.
  if (inspectMap && level.variants?.[inspectMap - 1] && !result.mapRuns?.[inspectMap]) {
    const scenario = { ...mapScenarioAt(level, inspectMap), variants: undefined }
    const { frames, final, issue, flowEvents, flowTruncated } = runProgram(scenario, source, personal, course, false, observeFlow)
    self.postMessage({ ...result, inspected: { index: inspectMap, run: { frames, final, issue, flowEvents, flowTruncated } } })
  } else {
    self.postMessage(result)
  }
})
