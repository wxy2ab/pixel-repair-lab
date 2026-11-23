import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ListPositionCase, ProgramWalkthrough } from '../shared/programWalkthrough'
import { runListPositionsLesson } from './programListPositions'
import { runProgramWalkthrough } from './programWalkthrough'
import { MAX_COLLECTION } from './values'

const demo: ListPositionCase = {
  label: { zh: '维修台', en: 'Repair bench' },
  batteries: [{ name: 'A', charge: 2 }, { name: 'B', charge: 4 }, { name: 'C', charge: 6 }],
  spare: { name: 'D', charge: 3 }, readIndex: 1, insertIndex: 1, removeIndex: 2, pickIndex: 1,
  expected: { order: ['A', 'D', 'C'], picked: 'D' },
}
const execution: ProgramWalkthrough = {
  cases: [],
  source: [
    'batteries = read_battery_names()',
    'first = batteries[read_index()]',
    'batteries.insert(insert_index(), spare_battery())',
    'removed = batteries.pop(remove_index())',
    'picked = batteries[pick_index()]',
    'say(picked)',
  ].join('\n'),
  listPositions: { cases: [demo] },
}

test('the list lesson reveals the actual item and position snapshots before and after each mutation', () => {
  const run = runListPositionsLesson(execution, demo)
  assert.ok(run)
  assert.deepEqual(run.steps.map(({ kind, order, battery }) => [kind, order.join(''), battery]), [
    ['load', 'ABC', undefined], ['read', 'ABC', 'B'], ['insert', 'ADBC', 'D'],
    ['remove', 'ADC', 'B'], ['select', 'ADC', 'D'], ['output', 'ADC', 'D'],
  ])
  assert.deepEqual(run.steps.map(({ line }) => line), [1, 2, 3, 4, 5, 6])
  assert.equal(run.steps.map(({ code }) => code).join('\n'), execution.source)
  assert.deepEqual(run.order, ['A', 'D', 'C'])
  assert.equal(run.picked, 'D')
  assert.equal(run.output, 'D')
  assert.deepEqual(demo.batteries.map(({ name }) => name), ['A', 'B', 'C'])
})

test('the same program reads fresh indexes and runs independently of authored answers', () => {
  const practice = {
    ...demo, batteries: [{ name: 'P', charge: 5 }, { name: 'R', charge: 2 }, { name: 'Q', charge: 0 }],
    spare: { name: 'S', charge: 4 }, readIndex: 0, insertIndex: 3, removeIndex: 0, pickIndex: 1,
  }
  const run = runListPositionsLesson(execution, practice)
  assert.equal(run?.steps[1].battery, 'P')
  assert.deepEqual(run?.steps[2].order, ['P', 'R', 'Q', 'S'])
  assert.deepEqual(run?.order, ['R', 'Q', 'S'])
  assert.equal(run?.picked, 'Q')
  assert.equal(runProgramWalkthrough('value = read_battery_names()', 0).issue?.code, 'apiDisabled')
  assert.equal(runProgramWalkthrough('value = insert_index(0)', 0, { listPositions: practice }).issue?.code, 'wrongArguments')
  assert.equal(runListPositionsLesson(execution, { ...practice, removeIndex: 4 }), undefined)
})

test('Python list.insert clamps indexes, mutates aliases and returns None without tracing other lessons', () => {
  const run = runProgramWalkthrough([
    'batteries = ["A", "B"]', 'alias = batteries', 'returned = batteries.insert(-1, "N")',
    'batteries.insert(-100, "F")', 'batteries.insert(100, "L")', 'say(str(alias))', 'say(str(returned))',
  ].join('\n'), 0)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.output, ['["F","A","N","B","L"]', 'None'])
  assert.ok(run.frames.every(({ kind }) => kind !== 'insert'))
  assert.equal(runProgramWalkthrough('items = []\nitems.insert(0, items)', 0).issue?.code, 'limit')
  assert.equal(runProgramWalkthrough('items = []\nitems.insert(1.5, "X")', 0).issue?.code, 'type')
  assert.equal(runProgramWalkthrough(`items = [${Array(MAX_COLLECTION).fill(0).join(',')}]\nitems.insert(0, 1)`, 0).issue?.code, 'limit')
})
