import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProgramWalkthrough, StackLessonCase } from '../shared/programWalkthrough'
import { runStackLesson } from './programStackLesson'

const demo: StackLessonCase = {
  label: { zh: '维修台', en: 'Repair bench' },
  batteries: [{ name: 'A', charge: 2 }, { name: 'B', charge: 4 }, { name: 'C', charge: 6 }],
  operations: [
    { kind: 'push', battery: 'A' }, { kind: 'push', battery: 'B' }, { kind: 'push', battery: 'C' },
    { kind: 'pop' }, { kind: 'pop' },
  ],
  expected: { popped: ['C', 'B'], remaining: ['A'] },
}

const execution: ProgramWalkthrough = {
  cases: [],
  source: [
    'stack = []', 'taken = []', 'stack.append("A")', 'stack.append("B")', 'stack.append("C")',
    'taken.append(stack.pop())', 'taken.append(stack.pop())', 'say(str(taken))', 'say(str(stack))',
  ].join('\n'),
  stackLesson: { cases: [demo] },
}

test('stack walkthrough records each real top, pop, and output on its Python line', () => {
  const run = runStackLesson(execution, demo)
  assert.ok(run)
  assert.deepEqual(run.steps.map(({ kind, stack, popped, battery }) => [kind, stack.join(''), popped.join(''), battery]), [
    ['init-stack', '', '', undefined], ['init-taken', '', '', undefined],
    ['push', 'A', '', 'A'], ['push', 'AB', '', 'B'], ['push', 'ABC', '', 'C'],
    ['pop', 'AB', 'C', 'C'], ['pop', 'A', 'CB', 'B'],
    ['show-popped', 'A', 'CB', undefined], ['show-remaining', 'A', 'CB', undefined],
  ])
  assert.deepEqual(run.steps.map(({ line }) => line), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(run.steps.map(({ code }) => code).join('\n'), execution.source)
  assert.deepEqual(run.popped, ['C', 'B'])
  assert.deepEqual(run.remaining, ['A'])
  assert.deepEqual(run.output, ['["C","B"]', '["A"]'])
})

test('a fresh script can interleave operations and empty the stack without reading the authored answer', () => {
  const practice: StackLessonCase = {
    ...demo,
    batteries: [{ name: 'K', charge: 3 }, { name: 'L', charge: 1 }, { name: 'M', charge: 0 }],
    operations: [
      { kind: 'push', battery: 'K' }, { kind: 'push', battery: 'L' }, { kind: 'pop' },
      { kind: 'pop' }, { kind: 'push', battery: 'M' }, { kind: 'pop' },
    ],
    source: [
      'stack = []', 'taken = []', 'stack.append("K")', 'stack.append("L")',
      'taken.append(stack.pop())', 'taken.append(stack.pop())', 'stack.append("M")',
      'taken.append(stack.pop())', 'say(str(taken))', 'say(str(stack))',
    ].join('\n'),
    expected: { popped: ['M'], remaining: ['K', 'L'] },
  }
  const run = runStackLesson(execution, practice)
  assert.ok(run)
  assert.deepEqual(run.popped, ['L', 'K', 'M'])
  assert.deepEqual(run.remaining, [])
  assert.deepEqual(run.output, ['["L","K","M"]', '[]'])
})

test('stack lesson rejects traces with bottom removal, different push order, or output that does not match the state', () => {
  assert.equal(runStackLesson(execution, { ...demo, source: execution.source.replace('stack.pop()', 'stack.pop(0)') }), undefined)
  assert.equal(runStackLesson(execution, { ...demo, source: execution.source.replace('stack.append("B")', 'stack.append("C")') }), undefined)
  assert.equal(runStackLesson(execution, { ...demo, source: execution.source.replace('say(str(taken))', 'say(str(stack))') }), undefined)
})
