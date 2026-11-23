import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runForLesson } from './programFor'
import { runProgramWalkthrough } from './programWalkthrough'

const source = [
  'batteries = read_batteries()',
  'charged = []',
  '',
  'for charge in batteries:',
  '    new_charge = charge + 3',
  '    charged.append(new_charge)',
  'say(str(charged))',
].join('\n')

test('the for lesson captures real bindings and records each repeated value in order', () => {
  const run = runForLesson(source, [2, 6, 2])
  assert.ok(run)
  assert.equal(run.rounds, 3)
  assert.equal(run.variable, 'charge')
  assert.deepEqual(run.results, [5, 9, 5])
  assert.equal(run.output, '[5,9,5]')
  assert.deepEqual(run.steps.map(({ kind, line, index, charge, results }) => [kind, line, index, charge, results]), [
    ['load', 1, undefined, undefined, []],
    ['initialize', 2, undefined, undefined, []],
    ['take', 4, 0, 2, []],
    ['add', 5, 0, 2, []],
    ['record', 6, 0, 2, [5]],
    ['take', 4, 1, 6, [5]],
    ['add', 5, 1, 6, [5]],
    ['record', 6, 1, 6, [5, 9]],
    ['take', 4, 2, 2, [5, 9]],
    ['add', 5, 2, 2, [5, 9]],
    ['record', 6, 2, 2, [5, 9, 5]],
    ['stop', 4, undefined, 2, [5, 9, 5]],
    ['output', 7, undefined, 2, [5, 9, 5]],
  ])
  assert.deepEqual(run.steps.filter(({ kind }) => kind === 'add').map(({ calculated }) => calculated), [5, 9, 5])
  assert.deepEqual(runForLesson(source.replace('+ 3', '+ 4'), [2, 6, 2])?.results, [6, 10, 6])
})

test('an empty list visits no item and only a naturally exhausted loop records a stop', () => {
  const empty = runForLesson(source, [])
  assert.ok(empty)
  assert.equal(empty.rounds, 0)
  assert.deepEqual(empty.results, [])
  assert.equal(empty.output, '[]')
  assert.deepEqual(empty.steps.map(({ kind }) => kind), ['load', 'initialize', 'stop', 'output'])
  assert.equal(empty.steps.at(-2)?.charge, undefined)

  const earlyExit = source.replace('say(str(charged))', '    break\nsay(str(charged))')
  const traced = runProgramWalkthrough(earlyExit, 0, { batteryCharges: [1, 2], traceForLoops: true })
  assert.deepEqual(traced.output, ['[4]'])
  assert.equal(traced.frames.some(({ kind }) => kind === 'loop-end'), false)
  assert.equal(runForLesson(earlyExit, [1, 2]), undefined)

  const untraced = runProgramWalkthrough(source, 0, { batteryCharges: [1] })
  assert.deepEqual(untraced.output, ['[4]'])
  assert.equal(untraced.frames.some(({ kind }) => kind === 'iterate' || kind === 'append' || kind === 'loop-end'), false)
  assert.equal(runProgramWalkthrough(source, 0).issue?.code, 'apiDisabled')
})
