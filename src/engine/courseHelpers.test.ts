import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCourseHelpers } from '../shared/courseHelpers'
import type { AlgorithmLevel } from '../shared/advanced'
import { runAlgorithm } from './algorithms'

const title = { zh: '测试', en: 'Test' }
const charge = 'def charge_total(current, added):\n    return current + added'
const helper: AlgorithmLevel = {
  version: 1, kind: 'algorithm', stage: 'exercise', id: 'charge-total', order: 1,
  title, concept: title, brief: title, hints: [], snippets: [],
  functionName: 'charge_total', starterCode: charge, solutionCode: charge,
  cases: [{ args: [2, 3], expected: 5 }],
}
const project: AlgorithmLevel = {
  ...helper,
  id: 'report', stage: 'challenge', functionName: 'report', helpers: ['charge_total'],
}
const source = (module: string) => 'from ' + module + ' import charge_total\ndef report(current, added):\n    return charge_total(current, added)'

test('a project imports the declared course helper and executes the selected personal version', () => {
  const course = resolveCourseHelpers(project, [helper])
  assert.equal(runAlgorithm(project, source('algorithms'), {}, course).won, true)
  assert.equal(runAlgorithm(project, source('my_algorithms'), { charge_total: charge }, course).won, true)

  const changed = { charge_total: 'def charge_total(current, added):\n    return 12' }
  assert.deepEqual(runAlgorithm(project, source('my_algorithms'), changed, course).cases,
    [{ passed: false, actual: 12 }])
  assert.equal(runAlgorithm(project, source('my_algorithms'), {}, course).won, false)
})

test('project references exclude duplicate and dependency-based definitions', () => {
  assert.equal(resolveCourseHelpers(project, [helper, { ...helper, id: 'duplicate' }]).charge_total, undefined)
  assert.equal(resolveCourseHelpers(project, [{ ...helper, helpers: ['other'] }]).charge_total, undefined)
  assert.equal(resolveCourseHelpers(project, [{ ...helper, stage: 'challenge' }]).charge_total, undefined)
  const undeclared = { ...project, helpers: undefined }
  assert.equal(runAlgorithm(undeclared, source('algorithms'), {}, { charge_total: charge }).won, false)
  assert.equal(runAlgorithm(project, source('math'), {}, { charge_total: charge }).won, false)
})
