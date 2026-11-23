import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DictionaryLessonCase, ProgramWalkthrough } from '../shared/programWalkthrough'
import { runDictionaryLesson } from './programDictionaryLesson'

const demo: DictionaryLessonCase = {
  label: { zh: '电池登记台', en: 'Battery register' },
  batteries: [{ name: 'A', charge: 2 }, { name: 'B', charge: 4 }, { name: 'C', charge: 6 }],
  key: 'B', arrival: { name: 'D', charge: 3 }, increment: 3,
  expected: { reading: 4, records: { A: 2, B: 7, C: 6, D: 3 } },
}

const execution: ProgramWalkthrough = {
  cases: [],
  source: [
    'records = read_named_batteries()', 'reading = records["B"]', 'records["D"] = 3',
    'new_charge = reading + 3', 'records["B"] = new_charge', 'say(str(records))',
  ].join('\n'),
  dictionaryLesson: { cases: [demo] },
}

test('dictionary lesson traces reading, adding a key and updating the existing key separately', () => {
  const run = runDictionaryLesson(execution, demo)
  assert.ok(run)
  assert.deepEqual(run.steps.map(({ kind, key, value, records }) => [kind, key, value, records]), [
    ['load', undefined, undefined, { A: 2, B: 4, C: 6 }],
    ['lookup', 'B', 4, { A: 2, B: 4, C: 6 }],
    ['register', 'D', 3, { A: 2, B: 4, C: 6, D: 3 }],
    ['calculate', 'B', 7, { A: 2, B: 4, C: 6, D: 3 }],
    ['update', 'B', 7, { A: 2, B: 7, C: 6, D: 3 }],
    ['output', undefined, undefined, { A: 2, B: 7, C: 6, D: 3 }],
  ])
  assert.deepEqual(run.steps.map(step => step.line), [1, 2, 3, 4, 5, 6])
  assert.equal(run.steps.map(step => step.code).join('\n'), execution.source)
  assert.equal(run.reading, 4)
  assert.equal(run.output, '{"A":2,"B":7,"C":6,"D":3}')
  assert.equal(demo.batteries[1].charge, 4)
})

test('dictionary practice reads zero and runs its own source without relying on the authored answer', () => {
  const practice: DictionaryLessonCase = {
    ...demo, batteries: [{ name: 'K', charge: 0 }, { name: 'M', charge: 1 }],
    key: 'K', arrival: { name: 'L', charge: 4 }, increment: 3,
    source: [
      'records = read_named_batteries()', "reading = records['K']", 'records["L"] = 4',
      'new_charge = reading + 3', 'records["K"] = new_charge', 'say(str(records))',
    ].join('\n'),
    expected: { reading: 8, records: { K: 5, M: 1, L: 4 } },
  }
  const run = runDictionaryLesson(execution, practice)
  assert.ok(run)
  assert.equal(run.reading, 0)
  assert.deepEqual(run.records, { K: 3, M: 1, L: 4 })
  assert.equal(run.steps[1].key, 'K')
})

test('dictionary lesson rejects a wrong key, registration, increment or display', () => {
  const equalCharge = { ...demo, batteries: [...demo.batteries, { name: 'Z', charge: 4 }] }
  assert.equal(runDictionaryLesson(execution, {
    ...equalCharge, source: execution.source.replaceAll('records["B"]', 'records["Z"]'),
  }), undefined)
  assert.equal(runDictionaryLesson(execution, {
    ...demo, source: execution.source.replace('records["D"] = 3', 'records["C"] = 3'),
  }), undefined)
  assert.equal(runDictionaryLesson(execution, {
    ...demo, source: execution.source.replace('records["D"] = 3', 'records["E"] = 3'),
  }), undefined)
  assert.equal(runDictionaryLesson(execution, {
    ...demo, source: execution.source.replace('records["D"] = 3', 'records["D"] = 8'),
  }), undefined)
  assert.equal(runDictionaryLesson(execution, {
    ...demo, source: execution.source.replace('reading + 3', 'reading + 5'),
  }), undefined)
  assert.equal(runDictionaryLesson(execution, {
    ...demo, source: execution.source.replace('say(str(records))', 'say(str(reading))'),
  }), undefined)
})
