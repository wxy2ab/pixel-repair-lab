import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runProgramWalkthrough } from './programWalkthrough'
import { runWhileLesson } from './programWhile'

const source = 'charge = scan()\n\nwhile charge < 4:\n    charge = charge + 3\nsay(str(charge))'

test('the while lesson traces each real condition check, charge update, and final result', () => {
  const run = runWhileLesson(source, 0)
  assert.ok(run)
  assert.equal(run.variable, 'charge')
  assert.equal(run.rounds, 2)
  assert.equal(run.finalCharge, 6)
  assert.equal(run.output, '6')
  assert.deepEqual(run.steps.map(({ kind, line, charge, rounds, condition }) => [kind, line, charge, rounds, condition]), [
    ['load', 1, 0, 0, undefined],
    ['check', 3, 0, 0, true],
    ['charge', 4, 3, 1, undefined],
    ['check', 3, 3, 1, true],
    ['charge', 4, 6, 2, undefined],
    ['stop', 3, 6, 2, false],
    ['output', 5, 6, 2, undefined],
  ])
  assert.equal(run.steps[3].code, 'while charge < 4:')
  assert.equal(run.steps[4].code, '    charge = charge + 3')

  const sufficient = runWhileLesson(source, 4)
  assert.ok(sufficient)
  assert.equal(sufficient.rounds, 0)
  assert.equal(sufficient.finalCharge, 4)
  assert.deepEqual(sufficient.steps.map(({ kind }) => kind), ['load', 'stop', 'output'])
  assert.equal(sufficient.steps[1].condition, false)
  assert.equal(runWhileLesson(source.replace('< 4', '<= 4'), 4)?.rounds, 1)
})

test('optional while tracing evaluates each condition once and observes the actual exit', () => {
  const observed = [
    'def below(charge):',
    '    say("check")',
    '    return charge < 4',
    'charge = scan()',
    'while below(charge):',
    '    charge = charge + 3',
    'say(str(charge))',
  ].join('\n')
  const traced = runProgramWalkthrough(observed, 0, { traceWhileLoops: true })
  const ordinary = runProgramWalkthrough(observed, 0)
  assert.equal(traced.issue, undefined)
  assert.deepEqual(traced.output, ['check', 'check', 'check', '6'])
  const checks = traced.frames.filter(({ kind }) => kind === 'while-check')
  assert.deepEqual(checks.map(({ value }) => value), [true, true, false])
  assert.deepEqual(traced.frames.filter(({ kind }) => kind !== 'while-check'), ordinary.frames)

  const earlyExit = source.replace('say(str(charge))', '    break\nsay(str(charge))')
  assert.equal(runWhileLesson(earlyExit, 0), undefined)
  assert.deepEqual(runProgramWalkthrough(earlyExit, 0, { traceWhileLoops: true }).output, ['3'])
})
