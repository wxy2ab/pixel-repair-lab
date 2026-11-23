import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { AlgorithmLevel } from '../shared/advanced'
import { validateLevel } from '../shared/validate'
import { runBatteryPipelineTrial } from './batteryPipeline'

function readLevel(file: string): AlgorithmLevel {
  return JSON.parse(readFileSync(new URL('../../levels/' + file + '.json', import.meta.url), 'utf8')) as AlgorithmLevel
}

const level = readLevel('1199-ranked-shipment')
const helpers = ['1104-sort-ascending', '1114-sorted-has-pair', '1123-prefix-totals'].map(readLevel)
const course = Object.fromEntries(helpers.map(({ functionName, solutionCode }) => [functionName, solutionCode]))

test('the battery trial traces real endpoints, the sorted-row cumulative values, and the report', () => {
  const run = runBatteryPipelineTrial(level, level.starterCode, 0, {}, course)
  assert.equal(run.passed, true)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.steps.filter(step => step.kind === 'pairCheck').map(({ pair, left, right, matched }) => [pair, left, right, matched]), [
    [[2, 9], 0, 4, false], [[2, 7], 0, 3, false], [[4, 7], 1, 3, false], [[4, 6], 1, 2, true],
  ])
  assert.deepEqual(run.steps.filter(step => step.kind === 'move').map(({ move, left, right }) => [move, left, right]), [
    ['right', 0, 3], ['left', 1, 3], ['right', 1, 2],
  ])
  assert.deepEqual(run.steps.find(step => step.kind === 'prefix')?.prefix, [0, 2, 6, 12, 19, 28])
  const total = run.steps.find(step => step.kind === 'total')
  assert.deepEqual([total?.left, total?.right, total?.total], [1, 3, 17])
  assert.deepEqual(run.result, { ordered: [2, 4, 6, 7, 9], pair: [4, 6], total: 17 })
  assert.ok(run.steps.every(step => step.code === level.starterCode.split('\n')[step.line - 1]))
})

test('saved helpers are executed for both the trial and fresh row and can change the report', () => {
  const source = level.starterCode.replaceAll('from algorithms import', 'from my_algorithms import')
  for (const index of [0, 1]) {
    const run = runBatteryPipelineTrial(level, source, index, course)
    assert.equal(run.passed, true)
    for (const kind of ['sort', 'pairCheck', 'prefix']) {
      assert.equal(run.steps.find(step => step.kind === kind)?.module, 'my_algorithms')
    }
  }
  const personal = { ...course, sorted_has_pair: 'def sorted_has_pair(values, target):\n    return False' }
  const altered = runBatteryPipelineTrial(level, source, 1, personal)
  assert.equal(altered.passed, false)
  assert.deepEqual(altered.result?.pair, [])
  assert.equal(altered.steps.find(step => step.kind === 'pairCheck')?.module, 'my_algorithms')
  assert.equal(altered.steps.some(step => step.kind === 'pairCheck' && step.matched), false)
})

test('battery pipeline authoring checks helper references and prediction choices', () => {
  assert.deepEqual(validateLevel(level).issues, [])
  const invalid = structuredClone(level)
  assert.ok(invalid.batteryPipeline)
  invalid.helpers = ['sort_ascending', 'first_index', 'prefix_totals']
  invalid.batteryPipeline.prediction.orders = [[1, 3, 4, 6, 9, 12], [1, 3, 4, 6, 9, 13]]
  invalid.batteryPipeline.prediction.pairs = [[4, 12], [1, 1]]
  invalid.batteryPipeline.prediction.totals = [16, 21]
  const paths = validateLevel(invalid).issues.map(issue => issue.path)
  for (const path of ['/helpers', '/batteryPipeline/prediction/orders', '/batteryPipeline/prediction/pairs', '/batteryPipeline/prediction/totals']) {
    assert.ok(paths.includes(path))
  }
})
