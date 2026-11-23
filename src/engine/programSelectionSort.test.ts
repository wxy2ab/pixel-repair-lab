import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LectureLevel } from '../shared/advanced'
import { validateLevel } from '../shared/validate'
import { runSelectionSort } from './programSelectionSort'

const source = `def sort_batteries(batteries):
    row = []
    for battery in batteries:
        row.append(battery)
    settled = 0
    selected = []
    for start in range(len(row) - 1):
        min_index = start
        for index in range(start + 1, len(row)):
            smaller = row[index][1] < row[min_index][1]
            if smaller:
                min_index = index
        selected.append(row[min_index][0])
        if min_index != start:
            held = row[start]
            row[start] = row[min_index]
            row[min_index] = held
        settled = start + 1
    settled = len(row)
    return [selected, row]`

const demo = [{ name: 'A', charge: 6 }, { name: 'B', charge: 3 }, { name: 'C', charge: 8 }, { name: 'D', charge: 1 }]
const tied = [{ name: 'A', charge: 4 }, { name: 'B', charge: 4 }, { name: 'C', charge: 2 }, { name: 'D', charge: 4 }]

test('selection sort traces each comparison, complete swaps, and the growing fixed prefix', () => {
  const run = runSelectionSort(source, demo)
  assert.equal(run.issue, undefined)
  assert.deepEqual(run.result, { selected: ['D', 'B', 'A'], order: ['D', 'B', 'A', 'C'] })
  assert.deepEqual(run.steps.filter(step => step.kind === 'compare').map(step => [step.start, step.index, step.candidate, step.smaller]), [
    [0, 1, 0, true], [0, 2, 1, false], [0, 3, 1, true],
    [1, 2, 1, false], [1, 3, 1, false], [2, 3, 2, true],
  ])
  const swaps = run.steps.filter(step => step.kind === 'swap')
  assert.deepEqual(swaps.map(step => [step.start, step.candidate, step.row.map(battery => battery.name)]), [
    [0, 3, ['D', 'B', 'C', 'A']], [2, 3, ['D', 'B', 'A', 'C']],
  ])
  assert.equal(swaps[0].line, 15)
  assert.deepEqual(swaps[0].code.split('\n').map(line => line.trim()), [
    'held = row[start]', 'row[start] = row[min_index]', 'row[min_index] = held',
  ])
  assert.deepEqual(run.steps.filter(step => step.kind === 'fix').map(step => [step.start, step.sorted]), [
    [0, 1], [1, 2], [2, 3], [3, 4],
  ])
  assert.equal(run.steps.at(-2)?.code.trim(), 'settled = len(row)')
  assert.equal(run.steps.at(-1)?.code.trim(), 'return [selected, row]')
  assert.ok(run.steps.every(step => new Set(step.row.map(battery => battery.name)).size === demo.length))
})

test('the traced program itself decides how equal charges are handled', () => {
  const run = runSelectionSort(source, tied)
  assert.deepEqual(run.result, { selected: ['C', 'B', 'A'], order: ['C', 'B', 'A', 'D'] })
  const modified = runSelectionSort(source.replace(' < ', ' <= '), tied)
  assert.deepEqual(modified.result, { selected: ['C', 'D', 'B'], order: ['C', 'D', 'B', 'A'] })
})

test('selection sort authoring verifies minimum order and requires a fresh unsorted row', () => {
  const title = { zh: '选择排序', en: 'Selection sort' }
  const level: LectureLevel = {
    version: 1, id: 'selection-sort-test', order: 1, kind: 'lecture', stage: 'explain',
    title, brief: title, concept: title, hints: [],
    sections: [{ title, body: title }],
    question: { prompt: title, options: [{ zh: '甲', en: 'A' }, { zh: '乙', en: 'B' }], correct: 0, feedback: title },
    execution: {
      source, cases: [],
      selectionSort: {
        demo: { batteries: demo, expected: { selected: ['D', 'B', 'A'], order: ['D', 'B', 'A', 'C'] } },
        practice: { batteries: tied, expected: { selected: ['C', 'B', 'A'], order: ['C', 'B', 'A', 'D'] } },
      },
    },
  }
  assert.deepEqual(validateLevel(level).issues, [])
  const wrong = structuredClone(level)
  const { demo: sample, practice } = wrong.execution!.selectionSort!
  practice.batteries = sample.batteries
  assert.ok(validateLevel(wrong).issues.some(issue => issue.path === '/execution/selectionSort/practice'))
  assert.ok(validateLevel(wrong).issues.some(issue => issue.path === '/execution/selectionSort/practice/expected'))
  sample.batteries = [demo[3], demo[1], demo[0], demo[2]]
  assert.ok(validateLevel(wrong).issues.some(issue => issue.path === '/execution/selectionSort/demo/batteries'))
})
