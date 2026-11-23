import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runCollectionLesson } from './programCollection'
import { runProgramWalkthrough } from './programWalkthrough'
import { MAX_COLLECTION } from './values'

const source = [
  'batteries = read_batteries()',
  'position_charge = batteries[1]',
  'records = read_named_batteries()',
  'named_charge = records["B"]',
  'records["B"] = named_charge + 3',
  'say(str(records))',
].join('\n')
const batteries = [{ name: 'A', charge: 2 }, { name: 'C', charge: 4 }, { name: 'B', charge: 6 }]

test('the collection lesson traces positional and named reads and the real dictionary update', () => {
  const run = runCollectionLesson(source, batteries)
  assert.ok(run)
  assert.equal(run.positionValue, 4)
  assert.equal(run.namedValue, 6)
  assert.deepEqual(run.records, { A: 2, C: 4, B: 9 })
  assert.equal(run.output, '{"A":2,"C":4,"B":9}')
  assert.deepEqual(run.steps.map(({ kind, value }) => [kind, value]), [
    ['load-list', undefined], ['index', 4], ['label', undefined], ['lookup', 6], ['update', 9], ['output', undefined],
  ])
  assert.deepEqual(run.steps.map(({ line }) => line), [1, 2, 3, 4, 5, 6])
  assert.equal(run.steps.map(({ code }) => code).join('\n'), source)
  assert.ok(run.steps.every(({ list }) => list.join(',') === '2,4,6'))
  assert.deepEqual(run.steps.map(({ records }) => records), [
    undefined, undefined, { A: 2, C: 4, B: 6 }, { A: 2, C: 4, B: 6 }, { A: 2, C: 4, B: 9 }, { A: 2, C: 4, B: 9 },
  ])
  assert.deepEqual(batteries.map(({ charge }) => charge), [2, 4, 6])
})

test('the same collection program reads a new arrangement without reusing the earlier records', () => {
  const practice = [{ name: 'B', charge: 0 }, { name: 'C', charge: 7 }, { name: 'A', charge: 4 }]
  const run = runCollectionLesson(source, practice)
  assert.ok(run)
  assert.equal(run.positionValue, 7)
  assert.equal(run.namedValue, 0)
  assert.deepEqual(run.records, { B: 3, C: 7, A: 4 })
  assert.equal(runCollectionLesson(source.replace(' + 3', ' + 5'), practice)?.records.B, 5)
  assert.equal(runCollectionLesson(source.replace('records["B"]', 'records["D"]'), practice), undefined)
  assert.equal(runCollectionLesson(source.replace('records["B"] =', 'records["D"] ='), practice), undefined)
  assert.equal(runCollectionLesson(source.replace('records["B"] =', 'new_charge ='), practice), undefined)
  assert.equal(runCollectionLesson(source.replace('say(str(records))', 'say(str(batteries))'), practice), undefined)
})

test('the named battery API is opt-in, takes no arguments, and rejects ambiguous inputs', () => {
  const read = 'records = read_named_batteries()'
  assert.equal(runProgramWalkthrough(read, 0).issue?.code, 'apiDisabled')
  assert.equal(runProgramWalkthrough(read.replace('()', '(1)'), 0, { batteryRecords: batteries }).issue?.code, 'wrongArguments')
  assert.equal(runProgramWalkthrough(read, 0, { batteryRecords: [...batteries, batteries[0]] }).issue?.code, 'type')
  assert.equal(runProgramWalkthrough(read, 0, { batteryRecords: [{ name: 'A', charge: 0.5 }] }).issue?.code, 'type')
  const oversized = Array.from({ length: MAX_COLLECTION + 1 }, (_, index) => ({ name: `B${index}`, charge: 0 }))
  assert.equal(runProgramWalkthrough(read, 0, { batteryRecords: oversized }).issue?.code, 'limit')
})
