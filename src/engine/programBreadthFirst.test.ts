import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { LectureLevel } from '../shared/advanced'
import { breadthFirstReference } from '../shared/breadthFirstLesson'
import { validateLevel } from '../shared/validate'
import { runBreadthFirst } from './programBreadthFirst'

const level = JSON.parse(readFileSync(new URL('../../levels/107-routing-notes.json', import.meta.url), 'utf8')) as LectureLevel
const { source, breadthFirstLesson } = level.execution!
const { demo, practice } = breadthFirstLesson!

test('the Python replay marks cells at enqueue time and processes the shortest layers in order', () => {
  const { steps, result, issue } = runBreadthFirst(source, demo)
  assert.equal(issue, undefined)
  assert.deepEqual(result, {
    order: [[0, 0], [0, 1], [1, 1], [0, 2], [2, 1], [1, 2], [2, 0]],
    path: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0]],
  })
  const initial = steps[0]
  assert.equal(initial.kind, 'start')
  assert.deepEqual(initial.queue, [[0, 0]])
  assert.deepEqual(initial.visited, [{ cell: [0, 0], depth: 0 }])
  const visited = steps.filter(step => step.kind === 'visit' || step.kind === 'goal')
  assert.equal(visited.length, 7)
  assert.deepEqual(visited.map(step => step.visited.find(entry => entry.cell.join(',') === step.current?.join(','))?.depth),
    [0, 1, 2, 2, 3, 3, 4])
  assert.deepEqual(steps.filter(step => step.kind === 'skip').map(step => step.reason), ['edge', 'wall', 'visited'])
  const secondLayer = steps.find(step => step.kind === 'enqueue' && step.neighbor?.join(',') === '1,1')
  assert.deepEqual(secondLayer?.visited.at(-1), { cell: [1, 1], parent: [0, 1], depth: 2 })
  assert.match(secondLayer?.code ?? '', /distance\[key\] = .*\n\s+parent\[key\] = cell\n\s+queue\.append/u)
  assert.equal(visited.at(-1)?.kind, 'goal')
  assert.deepEqual(visited.at(-1)?.path, [[2, 0]])
  assert.deepEqual(steps.filter(step => step.kind === 'path').map(step => step.current), [[2, 1], [1, 1], [0, 1], [0, 0]])
})

test('route results distinguish equal-length paths, no path, and a battery at the starting cell', () => {
  assert.deepEqual(runBreadthFirst(source, practice).result, practice.expected)
  assert.deepEqual(breadthFirstReference(practice), practice.expected)
  assert.deepEqual(runBreadthFirst(source, { tiles: ['.#.'], start: [0, 0], goal: [2, 0] }).result,
    { order: [[0, 0]], path: [] })
  assert.deepEqual(runBreadthFirst(source, { tiles: ['.'], start: [0, 0], goal: [0, 0] }).result,
    { order: [[0, 0]], path: [[0, 0]] })

  const stack = runBreadthFirst(source.replace('queue.pop(0)', 'queue.pop()'), demo)
  assert.equal(stack.issue?.code, 'internal')
  assert.equal(stack.result, undefined)
})

test('breadth-first authoring requires rectangular traversable maps and the actual dequeue and route options', () => {
  assert.deepEqual(validateLevel(level).issues, [])

  const invalid = structuredClone(level)
  const settings = invalid.execution!.breadthFirstLesson!
  settings.demo.tiles[0] = '..'
  settings.practice.predictions.orders = settings.practice.predictions.orders.filter((_, index) => index !== 1)
  settings.practice.predictions.paths[0] = [[0, 1], [1, 1], [3, 1]]
  const paths = validateLevel(invalid).issues.map(issue => issue.path)
  assert.ok(paths.includes('/execution/breadthFirstLesson/demo/tiles'))
  assert.ok(paths.includes('/execution/breadthFirstLesson/practice/predictions/orders'))
  assert.ok(paths.includes('/execution/breadthFirstLesson/practice/predictions/paths'))
})
