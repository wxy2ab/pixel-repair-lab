import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import type { Level } from '../src/shared/types'
import { lessonFlow } from '../src/web/lessonFlow'

const directory = new URL('../levels/', import.meta.url)
const lectures = readdirSync(directory).filter(file => file.endsWith('.json'))
  .map(file => JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as Level)
  .flatMap(level => level.kind === 'lecture' ? [level] : [])
const flowOf = (id: string) => lessonFlow(lectures.find(level => level.id === id)?.execution)

test('every hands-on lecture names at least two phases in both languages', () => {
  // These lectures run their own activity and keep their notes for the end.
  const handsOn = lectures.filter(({ execution }) => execution && !execution.intro
    && Object.keys(execution).some(key => !['source', 'cases', 'visual'].includes(key)))
  assert.ok(handsOn.length >= 24, 'expected the interactive lectures to be found')
  for (const level of handsOn) {
    const flow = lessonFlow(level.execution)
    assert.ok(flow && flow.length >= 2, level.id + ' has no phases')
    for (const phase of flow) assert.ok(phase.zh.trim() && phase.en.trim(), level.id + ' has an empty phase name')
    assert.equal(new Set(flow.map(phase => phase.zh)).size, flow.length, level.id + ' repeats a phase name')
  }
})

test('lectures that show their notes beside an animation or a replay have no phase strip', () => {
  assert.equal(lessonFlow(undefined), undefined)
  for (const id of ['python-program-basics', 'python-program-interfaces', 'function-notes', 'depth-first-notes', 'computer-notes']) {
    assert.equal(flowOf(id), undefined, id)
  }
})

test('a lesson takes the phases of its most specific activity', () => {
  // Both lessons are guided walkthroughs. Only one of them is about a function call.
  assert.match(flowOf('foundation-functions-notes')?.[0].zh ?? '', /函数/)
  assert.match(flowOf('python-program-overview')?.[0].zh ?? '', /跟着数字/)
  assert.equal(flowOf('sequence-notes')?.length, 3)
  assert.match(flowOf('python-debugging-notes')?.[0].zh ?? '', /修好/)
  assert.notEqual(flowOf('stack-notes')?.[0].zh, flowOf('queue-notes')?.[0].zh)
})
