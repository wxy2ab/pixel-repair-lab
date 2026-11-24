import type { ChallengeCrossing, Issue, Level } from './types'

export type ShortChallengeSeries = 'ferry' | 'laserTrial'

export function shortSeries(level?: Level): ShortChallengeSeries | undefined {
  if (level?.kind !== 'grid') return
  if (level.ferry) return 'ferry'
  if (level.laserTrial) return 'laserTrial'
}

export function shortCrossing(level?: Level): ChallengeCrossing | undefined {
  if (level?.kind !== 'grid') return
  const config = level.ferry ?? level.laserTrial
  if (config?.kind === 'crossing') return config
}

export function shortChallengeLinkIssues(level: Level, catalog: readonly Level[]): Issue[] {
  const config = shortCrossing(level)
  const series = shortSeries(level)
  if (!config || !series) return []
  const issues: Issue[] = []
  for (const field of ['next', 'carryFrom'] as const) {
    const id = config[field]
    if (!id) continue
    const link = catalog.find(entry => entry.id === id)
    if (!link || shortSeries(link) !== series || link.id === level.id || link.unit?.id !== level.unit?.id
      || (field === 'carryFrom' && !shortCrossing(link))) {
      issues.push({ path: '/' + series + '/' + field, code: 'short-challenge-link', message: 'Choose a challenge from the same series and unit.' })
    }
  }
  return issues
}
