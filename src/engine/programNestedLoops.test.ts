import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runNestedLoopsLesson } from './programNestedLoops'
import { runProgramWalkthrough } from './programWalkthrough'
import { MAX_COLLECTION } from './values'

const source = [
  'rows = read_battery_rows()',
  'results = []',
  'for row in rows:',
  '    charged_row = []',
  '    for charge in row:',
  '        charged_row.append(charge + 3)',
  '    results.append(charged_row)',
  'say(str(results))',
].join('\n')

test('the nested for lesson observes each row selection, charge, and recorded row', () => {
  const input = [[1, 4], [2, 0]]
  const run = runNestedLoopsLesson(source, input)
  assert.ok(run)
  assert.equal(run.rounds, 4)
  assert.deepEqual(run.rows, [[4, 7], [5, 3]])
  assert.equal(run.output, '[[4,7],[5,3]]')
  assert.deepEqual(run.steps.map(({ kind, line, rowIndex, batteryIndex, rounds }) => [kind, line, rowIndex, batteryIndex, rounds]), [
    ['load', 1, undefined, undefined, 0],
    ['initialize', 2, undefined, undefined, 0],
    ['select-row', 3, 0, undefined, 0],
    ['initialize-row', 4, 0, undefined, 0],
    ['take', 5, 0, 0, 0],
    ['charge', 6, 0, 0, 1],
    ['take', 5, 0, 1, 1],
    ['charge', 6, 0, 1, 2],
    ['finish-row', 5, 0, undefined, 2],
    ['record-row', 7, 0, undefined, 2],
    ['select-row', 3, 1, undefined, 2],
    ['initialize-row', 4, 1, undefined, 2],
    ['take', 5, 1, 0, 2],
    ['charge', 6, 1, 0, 3],
    ['take', 5, 1, 1, 3],
    ['charge', 6, 1, 1, 4],
    ['finish-row', 5, 1, undefined, 4],
    ['record-row', 7, 1, undefined, 4],
    ['stop', 3, undefined, undefined, 4],
    ['output', 8, undefined, undefined, 4],
  ])
  assert.deepEqual(run.steps.filter(step => step.kind === 'record-row').map(step => step.rows), [[[4, 7]], [[4, 7], [5, 3]]])
  assert.deepEqual(run.steps.filter(step => step.kind === 'initialize-row').map(step => step.currentRow), [[], []])
  assert.deepEqual(run.steps.filter(step => step.kind === 'charge').map(step => [step.charge, step.charged]), [[1, 4], [4, 7], [2, 5], [0, 3]])
  assert.ok(run.steps.every(({ code, line }) => code === source.split('\n')[line - 1]))
  assert.deepEqual(input, [[1, 4], [2, 0]])
})

test('ragged and empty rows preserve their positions without counting extra charges', () => {
  const rows = [[0], [], [4, 2]]
  const run = runNestedLoopsLesson(source, rows)
  assert.ok(run)
  assert.equal(run.rounds, 3)
  assert.deepEqual(run.rows, [[3], [], [7, 5]])
  assert.deepEqual(run.steps.filter(step => step.rowIndex === 1).map(step => [step.kind, step.rounds, step.currentRow]), [
    ['select-row', 1, undefined], ['initialize-row', 1, []], ['finish-row', 1, []], ['record-row', 1, []],
  ])
  assert.deepEqual(runNestedLoopsLesson(source, [[], []])?.rows, [[], []])
  assert.equal(runNestedLoopsLesson(source, [[], []])?.rounds, 0)
  assert.deepEqual(runNestedLoopsLesson(source.replace('+ 3', '+ 5'), rows)?.rows, [[5], [], [9, 7]])
  assert.equal(runNestedLoopsLesson(source.replace('say(str(results))', 'say(str(rows))'), rows), undefined)
  assert.equal(runNestedLoopsLesson(source.replace('        charged_row.append(charge + 3)', '        break'), rows), undefined)
})

test('the battery rows API is opt-in, bounded, and returns independent nested lists', () => {
  const read = 'rows = read_battery_rows()'
  assert.equal(runProgramWalkthrough(read, 0).issue?.code, 'apiDisabled')
  assert.equal(runProgramWalkthrough(read.replace('()', '(1)'), 0, { batteryRows: [[1]] }).issue?.code, 'wrongArguments')
  assert.equal(runProgramWalkthrough(read, 0, { batteryRows: [[0.5]] }).issue?.code, 'type')
  const oversized = Array.from({ length: MAX_COLLECTION + 1 }, () => 0)
  assert.equal(runProgramWalkthrough(read, 0, { batteryRows: [oversized] }).issue?.code, 'limit')
  const input = [[1], [2]]
  const result = runProgramWalkthrough([read, 'rows[0][0] = 9', 'say(str(rows))', 'say(str(read_battery_rows()))'].join('\n'), 0,
    { batteryRows: input })
  assert.deepEqual(result.output, ['[[9],[2]]', '[[1],[2]]'])
  assert.deepEqual(input, [[1], [2]])
})
