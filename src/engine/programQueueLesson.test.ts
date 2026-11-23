import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BatterySequenceCase, ProgramWalkthrough } from '../shared/programWalkthrough'
import { runQueueLesson } from './programQueueLesson'

const demo: BatterySequenceCase = {
  label: { zh: '维修站队列', en: 'Repair station queue' },
  batteries: [{ name: 'A', charge: 2 }, { name: 'B', charge: 4 }, { name: 'C', charge: 6 }, { name: 'D', charge: 3 }],
  operations: [
    { kind: 'push', battery: 'A' }, { kind: 'push', battery: 'B' }, { kind: 'push', battery: 'C' },
    { kind: 'pop' }, { kind: 'push', battery: 'D' }, { kind: 'pop' },
  ],
  expected: { popped: ['A', 'B'], remaining: ['C', 'D'] },
}

const execution: ProgramWalkthrough = {
  cases: [],
  source: [
    'queue = []', 'taken = []', 'queue.append("A")', 'queue.append("B")', 'queue.append("C")',
    'taken.append(queue.pop(0))', 'queue.append("D")', 'taken.append(queue.pop(0))', 'say(str(taken))', 'say(str(queue))',
  ].join('\n'),
  queueLesson: { cases: [demo] },
}

test('queue walkthrough records each arrival at the back and departure from the front on its real Python line', () => {
  const run = runQueueLesson(execution, demo)
  assert.ok(run)
  assert.deepEqual(run.steps.map(({ kind, queue, popped, battery }) => [kind, queue.join(''), popped.join(''), battery]), [
    ['init-queue', '', '', undefined], ['init-taken', '', '', undefined],
    ['push', 'A', '', 'A'], ['push', 'AB', '', 'B'], ['push', 'ABC', '', 'C'],
    ['pop', 'BC', 'A', 'A'], ['push', 'BCD', 'A', 'D'], ['pop', 'CD', 'AB', 'B'],
    ['show-popped', 'CD', 'AB', undefined], ['show-remaining', 'CD', 'AB', undefined],
  ])
  assert.deepEqual(run.steps.map(({ line }) => line), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.equal(run.steps.map(({ code }) => code).join('\n'), execution.source)
  assert.deepEqual(run.output, ['["A","B"]', '["C","D"]'])
})

test('the configured practice script can empty the queue without reading the authored answer', () => {
  const practice: BatterySequenceCase = {
    ...demo,
    batteries: [{ name: 'K', charge: 3 }, { name: 'L', charge: 1 }, { name: 'M', charge: 0 }],
    operations: [
      { kind: 'push', battery: 'K' }, { kind: 'pop' }, { kind: 'push', battery: 'L' },
      { kind: 'push', battery: 'M' }, { kind: 'pop' }, { kind: 'pop' },
    ],
    source: [
      'queue = []', 'taken = []', 'queue.append("K")', 'taken.append(queue.pop(0))', 'queue.append("L")',
      'queue.append("M")', 'taken.append(queue.pop(0))', 'taken.append(queue.pop(0))', 'say(str(taken))', 'say(str(queue))',
    ].join('\n'),
    expected: { popped: ['M'], remaining: ['K', 'L'] },
  }
  const run = runQueueLesson(execution, practice)
  assert.ok(run)
  assert.deepEqual(run.popped, ['K', 'L', 'M'])
  assert.deepEqual(run.remaining, [])
  assert.deepEqual(run.output, ['["K","L","M"]', '[]'])
})

test('queue lesson rejects tail removal, misordered arrivals and swapped displayed lists', () => {
  assert.equal(runQueueLesson(execution, { ...demo, source: execution.source.replace('queue.pop(0)', 'queue.pop()') }), undefined)
  assert.equal(runQueueLesson(execution, { ...demo, source: execution.source.replace('queue.append("B")', 'queue.append("C")') }), undefined)
  assert.equal(runQueueLesson(execution, { ...demo, source: execution.source.replace('say(str(taken))', 'say(str(queue))') }), undefined)
})
