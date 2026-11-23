import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runAlgorithm, traceAlgorithmCase } from '../src/engine/algorithms'
import type { AlgorithmLevel } from '../src/shared/advanced'
import { isShortestRoute, readRouteMap, walkRoute } from '../src/shared/routeMap'

const exercise: AlgorithmLevel = JSON.parse(readFileSync(new URL('../levels/1214-design-shortest-route.json', import.meta.url), 'utf8'))

test('checking and tracing a design accept either shortest path on a tied map', () => {
  const level = { ...exercise, cases: [{ args: [['..', '..'], [0, 0], [1, 1]], expected: ['right', 'down'] }] }
  for (const [directions, passed] of [
    [['right', 'down'], true], [['down', 'right'], true], [['down', 'up'], false],
    [['left', 'down'], false], [['down', 'up', 'right', 'down'], false], [['jump', 'down'], false],
  ] as const) {
    const source = exercise.starterCode + '\n    return ' + JSON.stringify(directions)
    assert.equal(runAlgorithm(level, source).won, passed)
    assert.equal(traceAlgorithmCase(level, source, 0, {}, {}, () => {}).passed, passed)
  }
})

test('route playback stops at the first blocked step and handles empty routes', () => {
  const start = [0, 0], goal = [2, 0], tiles = ['.#.']
  const unreachable = readRouteMap([tiles, start, goal])!
  assert.deepEqual(walkRoute(unreachable, ['right']), { positions: [unreachable.start], error: 'blocked' })
  assert.equal(isShortestRoute(unreachable, []), true)
  assert.equal(isShortestRoute(unreachable, ['right']), false)
  assert.equal(isShortestRoute(unreachable, null), false)
  const atGoal = readRouteMap([tiles, start, start])!
  assert.equal(isShortestRoute(atGoal, []), true)
  assert.deepEqual(walkRoute(atGoal, 'up'), { positions: [atGoal.start], error: 'list' })
  assert.equal(readRouteMap([tiles, start, [1, 0]]), undefined)
  assert.equal(readRouteMap([['..', '.'], start, start]), undefined)
})
