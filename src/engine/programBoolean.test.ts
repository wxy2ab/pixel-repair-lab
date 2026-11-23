import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runBooleanLesson } from './programBoolean'
import { runProgramWalkthrough } from './programWalkthrough'

const source = [
  'result = scan()',
  '',
  'enough = result >= 4',
  'door = door_open()',
  'can_leave = enough and door',
  'say(str(can_leave))',
].join('\n')

test('the Boolean lesson traces the inclusive boundary, the door, and the resulting decision', () => {
  const examples = [
    { input: 3, doorOpen: true, comparison: false, decision: false },
    { input: 4, doorOpen: false, comparison: true, decision: false },
    { input: 4, doorOpen: true, comparison: true, decision: true },
    { input: 5, doorOpen: true, comparison: true, decision: true },
  ]
  for (const example of examples) {
    const result = runBooleanLesson(source, example.input, example.doorOpen)
    assert.deepEqual(result, {
      comparison: { value: example.comparison, line: 3, code: 'enough = result >= 4' },
      door: { value: example.doorOpen, line: 4, code: 'door = door_open()' },
      decision: { value: example.decision, line: 5, code: 'can_leave = enough and door' },
      output: example.decision ? 'True' : 'False',
    })
  }
  const strictComparison = runBooleanLesson(source.replace('>=', '>'), 4, true)
  assert.equal(strictComparison?.comparison.value, false)
  assert.equal(strictComparison?.decision.value, false)
  assert.equal(runBooleanLesson(source.replace('str(can_leave)', 'str(enough)'), 4, false), undefined)
})

test('the door reading is only available with an explicitly configured state and takes no arguments', () => {
  const readDoor = 'say(str(door_open()))'
  assert.deepEqual(runProgramWalkthrough(readDoor, 4).issue, { code: 'apiDisabled', line: 1, detail: 'door_open' })
  assert.deepEqual(runProgramWalkthrough(readDoor, 4, { doorOpen: false }).output, ['False'])
  assert.deepEqual(runProgramWalkthrough('door_open(True)', 4, { doorOpen: true }).issue,
    { code: 'wrongArguments', line: 1, detail: 'door_open' })
})
