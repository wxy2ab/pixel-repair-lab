import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AlgorithmLevel } from '../shared/advanced'
import { runAlgorithm } from './algorithms'
import { repairChargingReturn, runChargingTrial } from './chargingChallenge'

const starter = `from my_algorithms import charge_total

def charge_rows(rows, added):
    results = []
    for row in rows:
        charged_row = []
        for charge in row:
            charged_row.append(charge_total(charge, added))
        results.append(charged_row)
        return results
`
const helper = { charge_total: 'def charge_total(current, added):\n    topped_up = current + added\n    return topped_up' }
const level: AlgorithmLevel = {
  version: 1, id: 'charge-trial', order: 1, stage: 'challenge', kind: 'algorithm', functionName: 'charge_rows',
  title: { zh: '补电', en: 'Charge' }, brief: { zh: '补电', en: 'Charge' }, concept: { zh: '循环', en: 'Loops' },
  hints: [], snippets: [], helpers: ['charge_total'], starterCode: starter, solutionCode: starter,
  cases: [
    { args: [[[1, 4], [2]], 3], expected: [[4, 7], [5]] },
    { args: [[[0], [], [1, 4]], 2], expected: [[2], [], [3, 6]] },
    { args: [[], 3], expected: [] },
  ],
}

test('the charging trial traces the saved helper, nested steps and actual early return', () => {
  const trial = runChargingTrial(level, starter, 0, helper, {})
  assert.equal(trial.passed, false)
  assert.deepEqual(trial.actual, [[4, 7]])
  assert.equal(trial.issue, undefined)

  const main = trial.steps.filter(step => step.file === 'main')
  assert.deepEqual(main.filter(step => step.kind === 'iterate').map(step => [step.line, step.value]), [
    [5, [1, 4]], [7, 1], [7, 4],
  ])
  const savedReturn = trial.steps.find(step => step.file === 'helper' && step.kind === 'return')
  assert.equal(savedReturn?.sourceName, 'my_algorithms.charge_total.py')
  assert.equal(savedReturn?.line, 3)
  assert.equal(savedReturn?.code, '    return topped_up')
  assert.equal(savedReturn?.value, 4)
  assert.deepEqual(main.at(-1)?.value, [[4, 7]])
  assert.equal(main.at(-1)?.code, '        return results')
})

test('repair moves only the outer loop return and grades new inputs with the same rules', () => {
  const fixed = repairChargingReturn(starter, level.functionName)
  assert.equal(fixed, starter.replace('        return results', '    return results'))
  assert.ok(fixed)
  assert.equal(repairChargingReturn(fixed, level.functionName), undefined)
  assert.equal(repairChargingReturn(starter.replace('return results', 'return (results'), level.functionName), undefined)
  assert.equal(repairChargingReturn(starter, 'other'), undefined)

  const graded = runAlgorithm(level, fixed, helper, {})
  assert.equal(graded.won, true)
  for (const [index, sample] of level.cases.entries()) {
    const run = runChargingTrial(level, fixed, index, helper, {})
    assert.deepEqual(run.actual, sample.expected)
    assert.deepEqual(run.actual, graded.cases[index].actual)
    assert.equal(run.passed, true)
  }
})

test('choosing a saved helper never falls back to the course version when grading the trial', () => {
  const fixed = repairChargingReturn(starter, level.functionName)
  assert.ok(fixed)

  const replacement = { charge_total: 'def charge_total(current, added):\n    return current + added + 1' }
  const replaced = runChargingTrial(level, fixed, 0, replacement, helper)
  assert.deepEqual(replaced.actual, [[5, 8], [6]])
  assert.equal(replaced.passed, false)

  const missing = runChargingTrial(level, fixed, 0, {}, helper)
  assert.equal(missing.issue?.code, 'unknownName')
  assert.equal(missing.passed, false)
  assert.equal(missing.actual, undefined)
})
