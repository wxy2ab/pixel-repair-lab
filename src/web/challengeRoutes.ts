import { challengeTypes, compareDifficulty, type ChallengeEntry, type ChallengeType } from './challengeModel'

export type ChallengeRoute = {
  type: ChallengeType
  entries: ChallengeEntry[]
  completed: number
  skipped: number
  next?: ChallengeEntry
}

export type LastChallenge = { levelId: string; routeType: ChallengeType }

export type ChallengeContinuation = {
  route: ChallengeRoute
  last?: ChallengeEntry
  target?: ChallengeEntry
  status: 'resume' | 'next' | 'cleared' | 'skipped'
}

export const challengeRouteSkipsKey = 'pixel-repair-lab:challenge-route-skips'
export const lastChallengeKey = 'pixel-repair-lab:last-challenge'
const levelIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

export function loadChallengeRouteSkips(raw: string | null | undefined): string[] {
  try {
    const stored: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(stored)) return []
    return [...new Set(stored.filter((id): id is string => typeof id === 'string' && levelIdPattern.test(id)))]
  } catch {
    return []
  }
}

export function loadLastChallenge(raw: string | null | undefined): LastChallenge | undefined {
  try {
    const stored: unknown = JSON.parse(raw ?? 'null')
    if (!stored || typeof stored !== 'object' || !('levelId' in stored) || !('routeType' in stored)) return undefined
    const { levelId, routeType } = stored
    const type = challengeTypes.find(candidate => candidate === routeType)
    if (type && typeof levelId === 'string' && levelIdPattern.test(levelId)) return { levelId, routeType: type }
  } catch {
    return undefined
  }
}

export function buildChallengeRoutes(entries: readonly ChallengeEntry[], skippedIds: readonly string[]): ChallengeRoute[] {
  const skippedIdsSet = new Set(skippedIds)
  return challengeTypes.flatMap(type => {
    const ordered = entries.filter(entry => entry.type === type).sort(compareDifficulty)
    if (!ordered.length) return []
    const unfinished = ordered.filter(entry => !entry.won)
    const pending = unfinished.filter(entry => !skippedIdsSet.has(entry.level.id))
    return [{
      type, entries: ordered,
      completed: ordered.length - unfinished.length,
      skipped: unfinished.length - pending.length,
      next: pending[0],
    }]
  })
}

export function resumeChallengeRoute(routes: readonly ChallengeRoute[], saved: LastChallenge | undefined,
  skippedIds: readonly string[]): ChallengeContinuation | undefined {
  if (!saved) return undefined
  const matchesLast = (entry: ChallengeEntry) => entry.level.id === saved.levelId
  const route = routes.find(candidate => candidate.entries.some(matchesLast))
    ?? routes.find(candidate => candidate.type === saved.routeType)
  if (!route) return undefined

  const last = route.entries.find(matchesLast)
  if (last && !last.won && !skippedIds.includes(last.level.id)) return { route, last, target: last, status: 'resume' }
  const context = { route, ...(last && { last }) }
  if (route.next) return { ...context, target: route.next, status: 'next' }
  return { ...context, status: route.completed === route.entries.length ? 'cleared' : 'skipped' }
}
