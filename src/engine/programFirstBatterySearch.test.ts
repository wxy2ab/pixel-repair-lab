import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LectureLevel } from '../shared/advanced'
import type { CollectionBattery } from '../shared/programWalkthrough'
import { validateLevel } from '../shared/validate'
import { runFirstBatterySearch } from './programFirstBatterySearch'

const source = `def find_first_battery(charges, target):
    first = 0
    last = len(charges) - 1
    found = -1
    while first <= last:
        middle = (first + last) // 2
        charge = charges[middle]
        matches = charge == target
        if matches:
            found = middle
            last = middle - 1
        elif charge < target:
            first = middle + 1
        else:
            last = middle - 1
    return found`

function row(names: string, charges: number[]): CollectionBattery[] {
  return charges.map((charge, index) => ({ charge, name: names[index] }))
}

const unique = row('ABCDEFG', [1, 3, 5, 7, 9, 11, 13])
const repeated = row('ABCDEHFIG', [1, 3, 5, 7, 9, 11, 11, 11, 13])
const practice = row('JKLMNPQR', [1, 3, 5, 7, 7, 7, 9, 11])

test('finding a duplicate records its index, searches left, and replaces it with the earlier matching battery', () => {
  const { steps, result, issue } = runFirstBatterySearch(source, repeated, 11)
  assert.equal(issue, undefined)
  assert.deepEqual(result, { index: 5, ranges: [[5, 8], [5, 5], [5, 4]] })
  assert.deepEqual(steps.filter(step => step.kind === 'compare').map(step => [step.index, step.charge, step.match]), [
    [4, 9, false], [6, 11, true], [5, 11, true],
  ])
  assert.deepEqual(steps.filter(step => step.kind === 'remember').map(step => [step.index, step.saved, step.code.trim()]), [
    [6, 6, 'found = middle'], [5, 5, 'found = middle'],
  ])
  assert.deepEqual(steps.filter(step => step.kind === 'narrow').map(step => [step.first, step.last, step.saved]), [
    [5, 8, undefined], [5, 5, 6], [5, 4, 5],
  ])
  assert.equal(steps.at(-1)?.code.trim(), 'return found')
})

test('leftward search keeps a saved index through nonmatching probes and returns -1 for a missing charge', () => {
  const match = runFirstBatterySearch(source, practice, 7)
  assert.deepEqual(match.result, { index: 3, ranges: [[0, 2], [2, 2], [3, 2]] })
  assert.deepEqual(match.steps.filter(step => step.kind === 'narrow').map(step => step.saved), [3, 3, 3])
  assert.deepEqual(runFirstBatterySearch(source, practice, 8).result, { index: -1, ranges: [[4, 7], [6, 7], [6, 5]] })
  assert.deepEqual(runFirstBatterySearch(source, [], 7).result, { index: -1, ranges: [] })

  const early = runFirstBatterySearch(source.replace('found = middle', 'return middle'), repeated, 11)
  assert.equal(early.result, undefined)
  assert.equal(early.issue?.code, 'internal')

  const skipped = runFirstBatterySearch(source.replace('first = 0', 'first = 1'), repeated, 11)
  assert.deepEqual(skipped.steps, [])
  assert.equal(skipped.issue?.code, 'internal')
})

test('first-battery authoring requires additions to the demonstration and the correct predicted path', () => {
  const title = { zh: '第一块电池', en: 'The first battery' }
  const level: LectureLevel = {
    version: 1, id: 'first-battery-search-test', order: 1, kind: 'lecture', stage: 'explain', title,
    brief: title, concept: title, hints: [],
    sections: [{ title, body: title }],
    question: { prompt: title, options: [{ zh: '甲', en: 'A' }, { zh: '乙', en: 'B' }], correct: 0, feedback: title },
    execution: {
      source: 'def find_battery(charges, target):\n    return [5, 2]', cases: [],
      firstBatterySearch: {
        firstSource: source, demo: { unique: { batteries: unique, target: 11 }, repeated: { batteries: repeated, target: 11 } },
        practice: {
          batteries: practice, target: 7,
          expected: { index: 3, ranges: [[0, 2], [2, 2], [3, 2]] },
          predictions: { ranges: [[], [[0, 2], [2, 2], [3, 2]], [[4, 7], [4, 4], [4, 3]]] },
        },
      },
    },
  }
  assert.deepEqual(validateLevel(level).issues, [])
  const settings = level.execution!.firstBatterySearch!
  settings.demo.repeated.batteries = row('ABCDEHFIG', [1, 3, 5, 7, 9, 10, 11, 11, 13])
  settings.practice.predictions.ranges = [[], [[4, 7], [4, 4], [4, 3]]]
  const paths = validateLevel(level).issues.map(issue => issue.path)
  assert.ok(paths.includes('/execution/firstBatterySearch/demo/repeated'))
  assert.ok(paths.includes('/execution/firstBatterySearch/practice/predictions/ranges'))
})
