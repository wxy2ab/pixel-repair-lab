import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LectureLevel } from '../shared/advanced'
import type { PrefixTotalsCase } from '../shared/programWalkthrough'
import { validateLevel } from '../shared/validate'
import { runPrefixTotals } from './programPrefixTotals'

const source = `def battery_totals(charges, left, right):
    direct = 0
    for index in range(left, right + 1):
        direct += charges[index]
    prefix = [0]
    for charge in charges:
        prefix.append(prefix[-1] + charge)
    included = prefix[right + 1]
    before = prefix[left]
    segment = included - before
    return [direct, prefix, segment]`

const row = (names: string, charges: number[]) => charges.map((charge, index) => ({ name: names[index], charge }))
const demo = { batteries: row('ABCDE', [3, 1, 4, 2, 5]) }
const practice: PrefixTotalsCase = {
  batteries: row('HJKLM', [2, 5, 0, 4, 3]),
  left: 1, right: 3,
  expected: { prefix: [0, 2, 7, 7, 11, 14], total: 9 },
  predictions: { prefix: [[0, 2, 5, 0, 4, 3], [0, 2, 7, 7, 11, 14]], totals: [4, 9, 11] },
}

test('prefix totals traces direct addition, cumulative records, and the executed subtraction', () => {
  const run = runPrefixTotals(source, demo.batteries, 1, 3)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.result, { direct: 7, prefix: [0, 3, 4, 8, 10, 15], total: 7 })
  assert.deepEqual(run.steps.map(({ kind, value }) => [kind, value]), [
    ['direct', 1], ['direct', 5], ['direct', 7], ['zero', 0],
    ['prefix', 3], ['prefix', 4], ['prefix', 8], ['prefix', 10], ['prefix', 15],
    ['included', 10], ['before', 3], ['subtract', 7], ['return', 7],
  ])
  assert.deepEqual(run.steps.filter(step => step.kind === 'direct').map(step => step.index), [1, 2, 3])
  assert.deepEqual(run.steps.filter(step => step.kind === 'prefix').map(step => step.index), [0, 1, 2, 3, 4])
  assert.deepEqual(run.steps[3].prefix, [0])
  assert.deepEqual(run.steps[6].prefix, [0, 3, 4, 8])
  assert.ok(run.steps.every(step => source.split('\n')[step.line - 1] === step.code))
})

test('prefix totals supports inclusive endpoints, a zero-charge step, and real return values', () => {
  const first = runPrefixTotals(source, demo.batteries, 0, 0)
  assert.equal(first.result?.total, 3)
  assert.equal(first.steps.find(step => step.kind === 'before')?.value, 0)
  assert.equal(runPrefixTotals(source, demo.batteries, 0, 4).result?.total, 15)
  const zero = runPrefixTotals(source, practice.batteries, 2, 2)
  assert.deepEqual(zero.result, { direct: 0, prefix: practice.expected.prefix, total: 0 })
  assert.equal(runPrefixTotals(source, demo.batteries, 3, 2).issue?.code, 'type')

  const equivalent = runPrefixTotals(source.replace('direct += charges[index]', 'direct = direct + charges[index]'), demo.batteries, 1, 3)
  assert.equal(equivalent.result?.total, 7)
  assert.equal(equivalent.steps[0].code.trim(), 'direct = direct + charges[index]')
  const altered = runPrefixTotals(source.replace('included - before', 'included + before'), demo.batteries, 1, 3)
  assert.equal(altered.issue?.code, 'internal')
  assert.equal(altered.steps.at(-1)?.kind, 'before')
  const shiftedOperands = source.replace('prefix[right + 1]', 'prefix[right + 1] + 1').replace('prefix[left]', 'prefix[left] + 1')
  assert.equal(runPrefixTotals(shiftedOperands, demo.batteries, 1, 3).issue?.code, 'internal')
})

test('prefix totals authoring checks the interval, expected cumulative values and answer options', () => {
  const title = { zh: '电池累计电量', en: 'Cumulative battery charge' }
  const level: LectureLevel = {
    version: 1, id: 'prefix-totals-test', order: 1, kind: 'lecture', stage: 'explain',
    title, brief: title, concept: title, hints: [],
    sections: [{ title, body: title }],
    question: { prompt: title, options: [title, title], correct: 0, feedback: title },
    execution: { source, cases: [], prefixTotalsLesson: { demo, practice } },
  }
  assert.deepEqual(validateLevel(level).issues, [])
  const wrong = structuredClone(level)
  const wrongPractice = wrong.execution!.prefixTotalsLesson!.practice
  wrongPractice.expected.total = 11
  wrongPractice.predictions.prefix = [[0, 2, 5, 0], [0, 2, 5, 0, 4, 3]]
  wrongPractice.predictions.totals = [4, 11]
  const paths = validateLevel(wrong).issues.map(issue => issue.path)
  assert.ok(paths.includes('/execution/prefixTotalsLesson/practice/expected'))
  assert.ok(paths.includes('/execution/prefixTotalsLesson/practice/predictions/prefix'))
  assert.ok(paths.includes('/execution/prefixTotalsLesson/practice/predictions/totals'))

  wrongPractice.right = 5
  assert.ok(validateLevel(wrong).issues.some(issue => issue.path === '/execution/prefixTotalsLesson/practice'))
})
