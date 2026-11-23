import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LectureLevel } from '../shared/advanced'
import type { TwoPointerCase } from '../shared/programWalkthrough'
import { validateLevel } from '../shared/validate'
import { runTwoPointer } from './programTwoPointer'

const source = `def find_pair(charges, target):
    left = 0
    right = len(charges) - 1
    while left < right:
        total = charges[left] + charges[right]
        if total == target:
            return [left, right]
        if total < target:
            left += 1
        else:
            right -= 1
    return []`

const demo: TwoPointerCase = {
  batteries: [1, 4, 6, 9, 11, 14].map((charge, index) => ({ name: String.fromCharCode(65 + index), charge })),
  target: 17, expected: { moves: ['left', 'right', 'left'], pair: ['C', 'E'] },
}

const practice: TwoPointerCase = {
  batteries: [2, 5, 7, 9, 12, 14, 18].map((charge, index) => ({ name: 'GHJKLMN'[index], charge })),
  target: 17, expected: { moves: ['right', 'left', 'right'], pair: ['H', 'L'] },
}

test('two pointers traces each executed sum before a single inward move or return', () => {
  const run = runTwoPointer(source, demo.batteries, demo.target)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.result, demo.expected)
  assert.deepEqual(run.steps.map(({ kind, left, right, total, move }) => [kind, left, right, total, move]), [
    ['sum', 0, 5, 15, undefined],
    ['move', 1, 5, 15, 'left'],
    ['sum', 1, 5, 18, undefined],
    ['move', 1, 4, 18, 'right'],
    ['sum', 1, 4, 15, undefined],
    ['move', 2, 4, 15, 'left'],
    ['sum', 2, 4, 17, undefined],
    ['return', 2, 4, 17, undefined],
  ])
  assert.deepEqual(run.steps.map(({ code }) => code.split('\n').map(line => line.trim())), [
    ['total = charges[left] + charges[right]'], ['if total < target:', 'left += 1'],
    ['total = charges[left] + charges[right]'], ['else:', 'right -= 1'],
    ['total = charges[left] + charges[right]'], ['if total < target:', 'left += 1'],
    ['total = charges[left] + charges[right]'], ['if total == target:', 'return [left, right]'],
  ])
})

test('the Python branch determines the motion and the search cannot reuse one index', () => {
  const reversed = runTwoPointer(source.replace('total < target', 'total > target'), demo.batteries, demo.target)
  assert.deepEqual(reversed.result, { moves: ['right', 'right', 'right', 'right', 'right'], pair: null })
  assert.equal(reversed.steps.at(-1)?.code.trim(), 'return []')
  assert.equal(reversed.steps.at(-1)?.left, reversed.steps.at(-1)?.right)

  const one = runTwoPointer(source, [{ name: 'A', charge: 4 }], 8)
  assert.deepEqual(one.result, { moves: [], pair: null })
  assert.deepEqual(one.steps.map(step => step.kind), ['return'])
  assert.deepEqual(runTwoPointer(source, [{ name: 'A', charge: 4 }, { name: 'B', charge: 4 }], 8).result,
    { moves: [], pair: ['A', 'B'] })
})

test('two-pointer authoring requires sorted named batteries and an accurate fresh movement sequence', () => {
  const title = { zh: '电池配对', en: 'Pair the batteries' }
  const level: LectureLevel = {
    version: 1, id: 'two-pointer-test', order: 1, kind: 'lecture', stage: 'explain',
    title, brief: title, concept: title, hints: [],
    sections: [{ title, body: title }],
    question: { prompt: title, options: [{ zh: '左', en: 'Left' }, { zh: '右', en: 'Right' }], correct: 0, feedback: title },
    execution: { source, cases: [], twoPointerLesson: { demo, practice } },
  }
  assert.deepEqual(validateLevel(level).issues, [])
  const wrong = structuredClone(level)
  const cases = wrong.execution!.twoPointerLesson!
  cases.demo.batteries.reverse()
  cases.practice.expected.moves = ['right', 'right']
  const paths = validateLevel(wrong).issues.map(issue => issue.path)
  assert.ok(paths.includes('/execution/twoPointerLesson/demo/batteries'))
  assert.ok(paths.includes('/execution/twoPointerLesson/practice/expected'))

  cases.demo = structuredClone(demo)
  cases.practice = structuredClone(demo)
  assert.ok(validateLevel(wrong).issues.some(issue => issue.path === '/execution/twoPointerLesson/practice'))
  cases.practice = structuredClone(practice)
  cases.practice.target = 4
  assert.ok(validateLevel(wrong).issues.some(issue => issue.path === '/execution/twoPointerLesson/practice/target'))
})
