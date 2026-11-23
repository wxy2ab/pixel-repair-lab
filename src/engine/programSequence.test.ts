import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import { runProgramSequence } from './programSequence'

const title = { zh: '补电', en: 'Charge' }
const execution: ProgramWalkthrough = {
  source: 'charge = scan()\nresult = charge + 3\nsay(str(result))',
  cases: [{ label: { zh: '起始电量 6 格', en: 'Start with 6 units' }, input: 6, expected: '9' }],
  visual: {
    title, functions: [], practice: [],
    main: [
      { id: 'read', line: 1, label: title, note: title, icon: 'battery' },
      { id: 'compute', line: 2, label: title, note: title, icon: 'compute' },
      { id: 'display', line: 3, label: title, note: title, icon: 'display' },
    ],
  },
}

test('an early display reveals the attempted reordered line without executing the calculation', () => {
  const run = runProgramSequence(execution, ['read', 'display', 'compute'], 6)
  assert.deepEqual(run.steps.map(({ cardId, line, code }) => [cardId, line, code]), [
    ['read', 1, 'charge = scan()'], ['display', 2, 'say(str(result))'],
  ])
  assert.deepEqual(run.steps[1].issue, { code: 'unknownName', line: 2, detail: 'result' })
  assert.deepEqual(run.steps[1].frame.stack[0].values, [{ name: 'charge', value: 6 }])
  assert.deepEqual(run.steps[1].frame.output, [])
  assert.deepEqual(run.output, [])
})

test('repaired cards run in order and display the result for the new input', () => {
  const run = runProgramSequence(execution, ['read', 'compute', 'display'], 1)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.steps.map(({ cardId, frame }) => [cardId, frame.kind, frame.value]), [
    ['read', 'assign', 1], ['compute', 'assign', 4], ['display', 'output', '4'],
  ])
  assert.deepEqual(run.output, ['4'])
})
