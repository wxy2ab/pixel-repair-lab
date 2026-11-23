import type { ArenaLevel } from './advanced'
import type { GridLevel } from './types'

// Index zero is the base map. Every override inherits from that same map.
export function mapScenarioAt<T extends GridLevel | ArenaLevel>(level: T, index: number): T {
  const variant = level.variants?.[index - 1]
  return variant ? { ...level, ...variant } : level
}
