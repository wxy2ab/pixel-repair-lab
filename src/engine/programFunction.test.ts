import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import { runFunctionLesson } from './programFunction'

const execution: ProgramWalkthrough = {
  source: [
    'def top_up(charge):',
    '    charge = charge + 3',
    '    return charge',
    '',
    'charge = scan()',
    'result = top_up(charge)',
    'say(str(result))',
  ].join('\n'),
  cases: [{ input: 6, expected: '9', label: { zh: '起始电量 6 格', en: 'Start with 6 units' } }],
  functionLesson: { functionName: 'top_up', parameter: 'charge', resultVariable: 'result' },
}

test('function predictions read the actual return and caller binding independently of the screen', () => {
  const differentDisplay = { ...execution, source: execution.source.replace('say(str(result))', 'say("done")') }
  assert.deepEqual(runFunctionLesson(execution, 6), { returned: 9, callerValue: 6, output: '9' })
  assert.deepEqual(runFunctionLesson(differentDisplay, 3), { returned: 6, callerValue: 3, output: 'done' })
  assert.deepEqual(runFunctionLesson(execution, 0), { returned: 3, callerValue: 0, output: '3' })
})

test('function validation detects an overwritten caller even when the screen is correct', () => {
  const overwritten = { ...execution, source: execution.source.replace('say(str(result))', 'charge = result\nsay(str(result))') }
  assert.equal(runFunctionLesson(overwritten, 6), undefined)
})
