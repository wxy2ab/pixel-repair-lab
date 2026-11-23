import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LectureLevel } from '../shared/advanced'
import { validateLevel } from '../shared/validate'
import { runBatterySearch } from './programBatterySearch'

const linearSource = `def find_battery(charges, target):
    comparisons = 0
    for index in range(len(charges)):
        charge = charges[index]
        comparisons += 1
        matches = charge == target
        if matches:
            return [index, comparisons]
    return [-1, comparisons]`

const binarySource = `def find_battery(charges, target):
    first = 0
    last = len(charges) - 1
    comparisons = 0
    while first <= last:
        middle = (first + last) // 2
        charge = charges[middle]
        comparisons += 1
        matches = charge == target
        if matches:
            return [middle, comparisons]
        if charge < target:
            first = middle + 1
        else:
            last = middle - 1
    return [-1, comparisons]`

const batteries = [2, 4, 6, 8, 10, 12, 14].map((charge, index) => ({ name: String.fromCharCode(65 + index), charge }))

test('linear search steps use executed code and stop at the first matching battery', () => {
  const run = runBatterySearch('linear', linearSource, batteries, 10)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.result, { index: 4, comparisons: 5 })
  const comparisons = run.steps.filter(step => step.kind === 'compare')
  assert.deepEqual(comparisons.map(step => [step.index, step.charge, step.comparisons, step.first, step.match]), [
    [0, 2, 1, 1, false], [1, 4, 2, 2, false], [2, 6, 3, 3, false], [3, 8, 4, 4, false], [4, 10, 5, 4, true],
  ])
  assert.ok(comparisons.every(step => step.line === 6 && step.code.trim() === 'matches = charge == target'))
  assert.equal(run.steps.at(-1)?.code.trim(), 'return [index, comparisons]')

  const changed = runBatterySearch('linear', linearSource.replace('charge == target', 'charge == target + 2'), batteries, 10)
  assert.deepEqual(changed.result, { index: 5, comparisons: 6 })
})

test('binary search uses the actual midpoint and discards the correct side after each mismatch', () => {
  const run = runBatterySearch('binary', binarySource, batteries, 10)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.result, { index: 4, comparisons: 3 })
  assert.deepEqual(run.steps.filter(step => step.kind === 'compare').map(step => [step.index, step.charge, step.match]), [
    [3, 8, false], [5, 12, false], [4, 10, true],
  ])
  assert.deepEqual(run.steps.filter(step => step.kind === 'narrow').map(step => [step.index, step.first, step.last, step.code.trim()]), [
    [3, 4, 6, 'first = middle + 1'], [5, 4, 4, 'last = middle - 1'],
  ])
  assert.equal(run.steps.at(-1)?.code.trim(), 'return [middle, comparisons]')

  const missing = runBatterySearch('binary', binarySource, batteries, 13)
  assert.deepEqual(missing.result, { index: -1, comparisons: 3 })
  assert.equal(missing.steps.at(-1)?.first, 6)
  assert.equal(missing.steps.at(-1)?.last, 5)
})

test('search authoring requires a sorted row, a valid shuffled row, and options including both correct counts', () => {
  const title = { zh: '找电池', en: 'Find a battery' }
  const level: LectureLevel = {
    version: 1, id: 'battery-search-test', order: 1, kind: 'lecture', stage: 'explain',
    title, brief: title, concept: title, hints: [],
    sections: [{ title, body: title }],
    question: { prompt: title, options: [{ zh: '甲', en: 'A' }, { zh: '乙', en: 'B' }], correct: 0, feedback: title },
    execution: {
      source: linearSource, cases: [],
      batterySearch: {
        binarySource,
        demo: {
          batteries, manualOrder: ['A', 'C', 'B', 'E', 'D', 'F', 'G'], target: 10,
          expected: { battery: 'E', linear: 5, binary: 3 },
        },
        practice: {
          batteries: batteries.map(({ name, charge }) => ({ name, charge: charge + 1 })), target: 13,
          expected: { battery: 'F', linear: 6, binary: 2 },
          predictions: { linear: [3, 6], binary: [1, 2] },
        },
      },
    },
  }
  assert.deepEqual(validateLevel(level).issues, [])

  const bad = structuredClone(level)
  const { demo, practice } = bad.execution!.batterySearch!
  demo.batteries.reverse()
  demo.manualOrder[0] = 'X'
  practice.predictions.binary = [1, 4]
  const paths = validateLevel(bad).issues.map(issue => issue.path)
  assert.ok(paths.includes('/execution/batterySearch/demo/batteries'))
  assert.ok(paths.includes('/execution/batterySearch/demo/manualOrder'))
  assert.ok(paths.includes('/execution/batterySearch/practice/predictions/binary'))
})
