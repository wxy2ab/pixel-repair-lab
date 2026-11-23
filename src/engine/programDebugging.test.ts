import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import { repairDebuggingSource, runDebuggingLesson } from './programDebugging'

const source = [
  'def top_up_all(batteries):',
  '    results = []',
  '    for charge in batteries:',
  '        results.append(charge + 3)',
  '        return results',
  'batteries = read_batteries()',
  'result = top_up_all(batteries)',
  'say(str(result))',
].join('\n')

const execution: ProgramWalkthrough = {
  source,
  cases: [],
  debugging: { increment: 3, loopLine: 3, returnLine: 5, cases: [] },
}

test('one battery masks the early return, and the trace locates the missing iterations for a row', () => {
  assert.deepEqual(runDebuggingLesson(source, [2])?.results, [5])
  const run = runDebuggingLesson(source, [2, 4, 1])
  assert.ok(run)
  assert.deepEqual(run.steps.map(({ kind, line, results }) => [kind, line, results]), [
    ['define', 1, []], ['load', 6, []], ['call', 7, []], ['initialize', 2, []],
    ['take', 3, []], ['charge', 4, [5]], ['return', 5, [5]], ['store', 7, [5]], ['output', 8, [5]],
  ])
  assert.equal(run.steps.find(step => step.kind === 'return')?.code, '        return results')
  assert.equal(run.output, '[5]')
})

test('moving only the return out of the loop charges all batteries on the retest and new input', () => {
  const repaired = repairDebuggingSource(execution)
  assert.equal(repaired, source.replace('\n        return results', '\n    return results'))
  assert.ok(repaired)
  const run = runDebuggingLesson(repaired, [2, 4, 1])
  assert.ok(run)
  assert.deepEqual(run.results, [5, 7, 4])
  assert.deepEqual(run.steps.filter(step => step.kind === 'charge')
    .map(({ batteryIndex, charge, charged }) => [batteryIndex, charge, charged]), [[0, 2, 5], [1, 4, 7], [2, 1, 4]])
  assert.deepEqual(run.steps.slice(-4).map(({ kind, line }) => [kind, line]), [
    ['finish-loop', 3], ['return', 5], ['store', 7], ['output', 8],
  ])
  assert.equal(run.steps.find(step => step.kind === 'return')?.code, '    return results')
  assert.equal(runDebuggingLesson(repaired, [0, 5, 2])?.output, '[3,8,5]')
  assert.deepEqual(runDebuggingLesson(repaired, [])?.results, [])
})

test('repair requires the configured return and ignores printed values that differ from the trace', () => {
  assert.equal(repairDebuggingSource({ ...execution, source: source.replace('return results', 'break') }), undefined)
  assert.equal(runDebuggingLesson(source.replace('str(result)', 'str(batteries)'), [2, 4, 1]), undefined)
  const shifted = {
    ...execution,
    source: '# Charging routine\n' + source.replaceAll('\n', '\r\n').replace('+ 3', '+ 5'),
    debugging: { ...execution.debugging!, loopLine: 4, returnLine: 6 },
  }
  const repaired = repairDebuggingSource(shifted)
  assert.ok(repaired)
  const run = runDebuggingLesson(repaired, [0, 2])
  assert.deepEqual(run?.results, [5, 7])
  assert.equal(run?.steps.find(step => step.kind === 'return')?.line, 6)
})
