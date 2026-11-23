import assert from 'node:assert/strict'
import { test } from 'node:test'
import { structureKinds, type ProgramWalkthrough, type StructureBatch } from '../shared/programWalkthrough'
import { runStructureLesson } from './programStructures'
import { runProgramWalkthrough } from './programWalkthrough'
import { MAX_COLLECTION } from './values'

const demo: StructureBatch = {
  batteries: [{ name: 'A', charge: 2 }, { name: 'C', charge: 4 }, { name: 'B', charge: 6 }, { name: 'D', charge: 3 }],
  index: 1, key: 'B',
}
const practice: StructureBatch = {
  batteries: [{ name: 'P', charge: 5 }, { name: 'R', charge: 2 }, { name: 'Q', charge: 0 }, { name: 'S', charge: 4 }],
  index: 2, key: 'R',
}
const execution: ProgramWalkthrough = {
  source: 'batteries = read_battery_batch()\nposition = scan()\npicked = batteries[position]\nsay(picked["name"])',
  cases: [],
  structures: {
    sources: {
      stack: 'batteries = read_battery_batch()\npicked = batteries.pop()\nsay(picked["name"])',
      queue: 'batteries = read_battery_batch()\npicked = batteries.pop(0)\nsay(picked["name"])',
      dictionary: 'directory = read_battery_directory()\nname = read_battery_key()\npicked = directory[name]\nsay(picked["name"])',
    },
    demo, practice: { ...practice, tasks: [] },
  },
}

test('battery structures trace every actual line and distinguish reading from removal', () => {
  const expected = {
    list: { selected: 'C', remaining: 'ACBD' },
    stack: { selected: 'D', remaining: 'ACB' },
    queue: { selected: 'A', remaining: 'CBD' },
    dictionary: { selected: 'B', remaining: 'ACBD' },
  }
  for (const kind of structureKinds) {
    const run = runStructureLesson(execution, kind, demo)
    assert.ok(run, kind)
    const { selected, remaining } = expected[kind]
    assert.equal(run.output, selected, kind)
    assert.deepEqual(run.selected, demo.batteries.find(battery => battery.name === selected), kind)
    assert.equal(run.remaining.map(({ name }) => name).join(''), remaining, kind)
    const stages = kind === 'list' || kind === 'dictionary' ? ['load', 'target', 'select', 'output'] : ['load', 'select', 'output']
    const source = kind === 'list' ? execution.source : execution.structures!.sources[kind]
    assert.deepEqual(run.steps.map(({ kind: step }) => step), stages, kind)
    assert.deepEqual(run.steps.map(({ line }) => line), stages.map((_, index) => index + 1), kind)
    assert.equal(run.steps.map(({ code }) => code).join('\n'), source, kind)
    assert.equal(run.steps[0].selected, undefined, kind)
    assert.deepEqual(run.steps[0].remaining, demo.batteries, kind)
  }
  assert.deepEqual(demo.batteries.map(({ name }) => name), ['A', 'C', 'B', 'D'])
})

test('a new battery batch drives every selection and the real zero charge survives the trace', () => {
  assert.deepEqual(structureKinds.map(kind => runStructureLesson(execution, kind, practice)?.output), ['Q', 'S', 'P', 'R'])
  assert.deepEqual(runStructureLesson(execution, 'list', practice)?.selected, { name: 'Q', charge: 0 })

  const changed = { ...execution, source: execution.source.replace('batteries[position]', 'batteries[0]') }
  assert.equal(runStructureLesson(changed, 'list', practice)?.output, 'P')
  const ignored = { ...execution, source: execution.source.replace('say(picked["name"])', 'say("P")') }
  assert.equal(runStructureLesson(ignored, 'list', practice), undefined)
})

test('the structured battery readers are opt-in and reject invalid batch arguments', () => {
  const readers = ['read_battery_batch', 'read_battery_directory', 'read_battery_key']
  for (const reader of readers) {
    assert.equal(runProgramWalkthrough(`value = ${reader}()`, 0).issue?.code, 'apiDisabled')
    assert.equal(runProgramWalkthrough(`value = ${reader}(1)`, 0, { structureBatch: demo }).issue?.code, 'wrongArguments')
  }

  const source = 'value = read_battery_batch()'
  const invalid = [
    { ...demo, key: 'Missing' },
    { ...demo, index: -1 },
    { ...demo, batteries: [...demo.batteries, demo.batteries[0]] },
    { ...demo, batteries: demo.batteries.map(battery => ({ ...battery, charge: -1 })) },
  ]
  for (const batch of invalid) assert.equal(runProgramWalkthrough(source, 0, { structureBatch: batch }).issue?.code, 'type')
  const oversized = Array.from({ length: MAX_COLLECTION + 1 }, (_, index) => ({ name: `A${index}`, charge: 0 }))
  assert.equal(runProgramWalkthrough(source, 0, { structureBatch: { ...demo, batteries: oversized, key: 'A0' } }).issue?.code, 'limit')
})
