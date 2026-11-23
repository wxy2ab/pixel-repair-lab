import assert from 'node:assert/strict'
import test from 'node:test'
import { debugAlgorithmCase } from '../src/engine/algorithms'
import type { AlgorithmLevel } from '../src/shared/advanced'

const title = { zh: '调试', en: 'Debug' }
const level: AlgorithmLevel = { version: 1, kind: 'algorithm', stage: 'exercise', id: 'debug', order: 1,
  title, brief: title, concept: title, hints: [], functionName: 'count', starterCode: '', solutionCode: '',
  snippets: [], cases: [{ args: [2], expected: 2 }, { args: [0], expected: 0 }] }

test('debugging follows the chosen input, repeats guards and stops on the actual failing line', () => {
  const source = 'def count(n):\n    value = 0\n    while value < n:\n        value += 1\n    if value == 0:\n        return missing\n    return value'
  const success = debugAlgorithmCase(level, source, 0)
  assert.equal(success.outcome.passed, true)
  assert.deepEqual(success.steps.map(step => step.line), [1, 2, 3, 4, 3, 4, 3, 5, 7])
  const failure = debugAlgorithmCase(level, source, 1)
  assert.deepEqual(failure.steps.map(step => step.line), [1, 2, 3, 5, 6])
  assert.equal(failure.outcome.issue?.code, 'unknownName')
  assert.equal(failure.outcome.issue?.line, 6)
  const syntax = debugAlgorithmCase(level, 'def count(n):\n    return (', 0)
  assert.equal(syntax.steps.at(-1)?.line, syntax.outcome.issue?.line)
})

test('a personal helper reports lines from the saved file as well as the main program', () => {
  const code = 'from my_algorithms import helper\ndef count(n):\n    return helper(n)'
  const run = debugAlgorithmCase({ ...level, helpers: ['helper'] }, code, 0, { helper: 'def helper(n):\n    return unknown' })
  assert.deepEqual(run.steps.at(-1), { sourceName: 'my_algorithms.helper.py', line: 2 })
  assert.equal(run.outcome.issue?.line, 2)
  assert.ok(run.steps.some(step => step.sourceName === 'main.py' && step.line === 3))
})

test('the function workbench follows the active call and arguments across nested returns', () => {
  const code = 'from my_algorithms import helper\ndef count(n):\n    return helper(n + 1) - 1'
  const personal = { helper: 'def helper(x):\n    if x:\n        return x\n    return 0' }
  for (const observeRack of [false, true]) {
    const run = debugAlgorithmCase({ ...level, helpers: ['helper'] }, code, 0, personal, {}, observeRack, true)
    assert.equal(run.outcome.passed, true)
    const flow = run.steps.filter(step => step.flow)
    assert.deepEqual(flow.map(step => step.flow!.kind), ['call', 'call', 'if', 'return', 'return'])
    assert.deepEqual(flow.map(step => step.invocation?.name), ['count', 'helper', 'helper', 'helper', 'count'])
    assert.deepEqual(flow[2].invocation?.arguments, [{ name: 'x', value: 3 }])
    assert.deepEqual(flow.slice(-2).map(step => step.flow?.value), [3, 2])
  }
})
