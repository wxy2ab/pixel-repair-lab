import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { debugAlgorithmCase } from '../src/engine/algorithms'
import { runProgram } from '../src/engine/run'
import type { AlgorithmLevel, ReplayExample } from '../src/shared/advanced'
import type { GridLevel, RackStep } from '../src/shared/types'

const valueAt = (step: RackStep, key: string) => step.bindings?.find(binding => binding.name === key)?.value

test('the sorting demonstration captures both writes, without advancing the game board for either', () => {
  const lesson = JSON.parse(readFileSync('levels/1102-selection-sort-replay.json', 'utf8'))
  const { scenario, source } = lesson.examples[0] as ReplayExample
  const level: GridLevel = { ...lesson, ...scenario, kind: 'grid', cards: [], solutionCards: [] }
  const plain = runProgram(level, source)
  const { rackSteps, ...observed } = runProgram(level, source, undefined, undefined, true)
  assert.deepEqual(observed, plain)
  assert.ok(rackSteps)
  const i = rackSteps.findIndex(step => step.line === 8)
  assert.deepEqual(valueAt(rackSteps[i - 1], 'parts'), [6, 3, 2, 5])
  assert.deepEqual(valueAt(rackSteps[i], 'parts'), [2, 3, 2, 5])
  assert.deepEqual(valueAt(rackSteps[i + 1], 'parts'), [2, 3, 6, 5])
  assert.deepEqual(rackSteps.slice(i - 1, i + 2).map(step => step.boardActions), [1, 1, 1])
  assert.equal(rackSteps.at(-1)?.boardActions, plain.frames.length)
})

test('the workbench returns to the correct scope after a child’s imported helper and preserves zero and empty lists', () => {
  const level = { cases: [{ args: [0], expected: [1] }], functionName: 'plan', helpers: ['plus_one'] } as AlgorithmLevel
  const source = 'from my_algorithms import plus_one\ndef plan(n):\n    result = []\n    added = plus_one(n)\n    result.append(added)\n    return result'
  const run = debugAlgorithmCase(level, source, 0, { plus_one: 'def plus_one(x):\n    y = x + 1\n    return y' }, {}, true)
  assert.deepEqual(run.outcome, { actual: [1], passed: true })
  const helper = run.steps.find(step => step.sourceName === 'my_algorithms.plus_one.py' && step.line === 2)!
  assert.equal(valueAt(helper, 'x'), 0)
  assert.equal(valueAt(helper, 'y'), 1)
  const resumed = run.steps.find(step => step.line === 4 && valueAt(step, 'added') === 1)!
  assert.deepEqual(valueAt(resumed, 'result'), [])
  assert.deepEqual(valueAt(run.steps.at(-1)!, 'result'), [1])
})
