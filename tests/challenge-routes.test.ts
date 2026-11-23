import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DataLevel } from '../src/shared/dataCourse'
import type { ChallengeDifficulty, GridLevel, LevelMetadata } from '../src/shared/types'
import { buildChallengeCatalog } from '../src/web/challengeModel'
import { buildChallengeRoutes, loadChallengeRouteSkips, loadLastChallenge, resumeChallengeRoute } from '../src/web/challengeRoutes'

const title = { zh: '挑战', en: 'Challenge' }
const base: LevelMetadata = { version: 1, id: 'sample', order: 1, title, concept: title, brief: title, stage: 'challenge', hints: [] }

function grid(id: string, difficulty: ChallengeDifficulty, order: number): GridLevel {
  return {
    ...base, kind: 'grid', id, difficulty, order, tiles: ['..'], start: { x: 0, y: 0 },
    objectives: [{ type: 'exit', x: 1, y: 0 }], allowedApi: ['move'], cards: [], solutionCards: [],
  }
}

test('challenge routes contain nonempty gameplay groups and order their levels by difficulty, order and ID', () => {
  const data: DataLevel = { ...base, id: 'data', kind: 'data', stage: 'challenge', steps: [] }
  const levels = [
    data, grid('beta', 'advanced', 4), grid('alpha', 'advanced', 4),
    grid('middle', 'intermediate', 2), grid('first', 'starter', 9),
    grid('late-advanced', 'advanced', 6),
  ]
  const entries = buildChallengeCatalog(levels, [], []).entries.reverse()
  const originalOrder = entries.map(entry => entry.level.id)
  const routes = buildChallengeRoutes(entries, [])

  assert.deepEqual(routes.map(route => route.type), ['grid', 'data'])
  assert.deepEqual(routes[0].entries.map(entry => entry.level.id), ['first', 'middle', 'alpha', 'beta', 'late-advanced'])
  assert.equal(routes[0].next?.level.id, 'first')
  assert.equal(routes[1].next?.level.id, 'data')
  assert.deepEqual(entries.map(entry => entry.level.id), originalOrder)
})

test('skips move the recommendation forward independently of route completion', () => {
  const levels = [
    grid('first', 'starter', 1), grid('second', 'starter', 2),
    grid('third', 'intermediate', 3), grid('last', 'advanced', 4),
  ]
  const entries = buildChallengeCatalog(levels, [], ['first', 'last']).entries
  const [open] = buildChallengeRoutes(entries, ['first', 'second', 'stale-level'])
  assert.equal(open.completed, 2)
  assert.equal(open.skipped, 1)
  assert.equal(open.next?.level.id, 'third')

  const [exhausted] = buildChallengeRoutes(entries, ['first', 'second', 'third'])
  assert.equal(exhausted.completed, 2)
  assert.equal(exhausted.skipped, 2)
  assert.equal(exhausted.next, undefined)
  assert.equal(buildChallengeRoutes(entries, ['third'])[0].next?.level.id, 'second')
})

test('stored route skips tolerate invalid values and keep unique valid level IDs', () => {
  assert.deepEqual(loadChallengeRouteSkips(null), [])
  assert.deepEqual(loadChallengeRouteSkips('bad json'), [])
  assert.deepEqual(loadChallengeRouteSkips('{"skipped":[]}'), [])
  assert.deepEqual(loadChallengeRouteSkips(JSON.stringify([
    'valid-1', 'valid-1', 'Alpha_2', 3, null, '', '-bad', 'with spaces', 'a'.repeat(65),
  ])), ['valid-1', 'Alpha_2'])
})

test('stored last challenge requires a valid level ID and a known route type', () => {
  const last = { levelId: 'Arena_2', routeType: 'arena' }
  assert.deepEqual(loadLastChallenge(JSON.stringify(last)), last)
  for (const value of [undefined, null, 'bad json', '[]', '{}', '{"levelId":"sample"}',
    '{"levelId":" a","routeType":"grid"}', '{"levelId":"sample","routeType":"unknown"}',
    '{"levelId":4,"routeType":"grid"}']) {
    assert.equal(loadLastChallenge(value), undefined)
  }
})

test('continue resumes an unfinished challenge, then recommends the same route after a win or skip', () => {
  const levels = [grid('first', 'starter', 1), grid('last-played', 'intermediate', 2), grid('next', 'advanced', 3)]
  const last = { levelId: 'last-played', routeType: 'grid' } as const
  const routes = buildChallengeRoutes(buildChallengeCatalog(levels, [], ['first']).entries, [])
  const resumed = resumeChallengeRoute(routes, last, [])
  assert.equal(resumed?.status, 'resume')
  assert.equal(resumed?.target?.level.id, last.levelId)
  assert.equal(resumed?.route.completed, 1)

  const skips = [last.levelId]
  const afterSkip = resumeChallengeRoute(buildChallengeRoutes(buildChallengeCatalog(levels, [], ['first']).entries, skips), last, skips)
  assert.equal(afterSkip?.status, 'next')
  assert.equal(afterSkip?.target?.level.id, 'next')
  assert.equal(afterSkip?.route.completed, 1)
  assert.equal(afterSkip?.last?.level.id, last.levelId)

  const afterWin = resumeChallengeRoute(buildChallengeRoutes(buildChallengeCatalog(levels, [], ['first', last.levelId]).entries, skips), last, skips)
  assert.equal(afterWin?.status, 'next')
  assert.equal(afterWin?.target?.level.id, 'next')
  assert.equal(afterWin?.route.completed, 2)
  assert.equal(afterWin?.route.skipped, 0)
})

test('continuation handles stale history and keeps route exhaustion local', () => {
  const data: DataLevel = { ...base, id: 'data', kind: 'data', stage: 'challenge', steps: [] }
  const levels = [grid('first', 'starter', 1), data]
  const catalog = buildChallengeCatalog(levels, [], [])
  const routes = buildChallengeRoutes(catalog.entries, [])
  assert.equal(resumeChallengeRoute(routes, undefined, []), undefined)
  assert.equal(resumeChallengeRoute(routes, { levelId: 'gone', routeType: 'arena' }, []), undefined)
  const removed = resumeChallengeRoute(routes, { levelId: 'gone', routeType: 'grid' }, [])
  assert.equal(removed?.status, 'next')
  assert.equal(removed?.target?.level.id, 'first')
  assert.equal(removed?.last, undefined)
  assert.equal(resumeChallengeRoute(routes, { levelId: 'data', routeType: 'grid' }, [])?.route.type, 'data')

  const last = { levelId: 'first', routeType: 'grid' } as const
  const skipped = resumeChallengeRoute(buildChallengeRoutes(catalog.entries, ['first']), last, ['first'])
  assert.equal(skipped?.status, 'skipped')
  assert.equal(skipped?.target, undefined)
  const cleared = resumeChallengeRoute(buildChallengeRoutes(buildChallengeCatalog(levels, [], ['first']).entries, ['first']), last, ['first'])
  assert.equal(cleared?.status, 'cleared')
  assert.equal(cleared?.target, undefined)
})
