import assert from 'node:assert/strict'
import test from 'node:test'
import type { LessonRoomFamily } from '../src/web/station3d/lessonRoom'
import { describeRoomActivity, initialRoomActivity, roomActivityReading, updateRoomActivity } from '../src/web/station3d/roomActivity'

const rooms: [LessonRoomFamily, string | undefined, number[]][] = [
  ['coding', 'foundations', [5]], ['algorithms', 'algorithm-intro', [1, 2, 3, 4]],
  ['systems', 'computer', [0]], ['electronics', 'digital-circuits', [1]], ['data', undefined, [5]],
  ['vision', 'yolox', [0, 1, 1]], ['ai', 'ai', [0, 1, 0]],
  ['algorithms', 'structures', [1, 0, 0, 0]], ['systems', 'architecture', [6]],
  ['data', 'numpy', [3, 9, 6]], ['data', 'pandas', [2, 5, 8]], ['data', 'statistics', [5]],
  ['data', 'database', [0, 1, 1]], ['vision', 'opencv', [0, 0, 1]],
]

test('every room accepts each sample and setting in either order and only reveals results after a run', () => {
  for (const [family, unit, firstOutput] of rooms) {
    const initial = initialRoomActivity(unit)
    const subject = unit ?? family
    const start = roomActivityReading(family, initial)
    assert.equal(start.output, null, subject)
    assert.deepEqual(roomActivityReading(family, updateRoomActivity(family, initial, 'run')).output, firstOutput, subject)
    let sample = initial, samples = 0
    do {
      let selected = sample, settings = 0
      do {
        const run = updateRoomActivity(family, selected, 'run')
        const repeat = updateRoomActivity(family, run, 'run')
        const reading = roomActivityReading(family, run)
        assert.equal(run.ran, true)
        assert.equal(repeat.revision, run.revision + 1)
        assert.deepEqual(reading, roomActivityReading(family, repeat))
        assert.ok(reading.output, subject)
        assert.ok(reading.output.every(Number.isFinite), subject)
        if (reading.mode === 'mask') {
          assert.equal(reading.input.length, reading.output.length)
          assert.ok(reading.output.every(value => value === 0 || value === 1))
        }
        for (const locale of ['zh', 'en'] as const) {
          const prompt = describeRoomActivity(family, selected, locale)
          const outcome = describeRoomActivity(family, run, locale)
          assert.notEqual(outcome.status, prompt.status)
          assert.notEqual(outcome.controls.run.value, prompt.controls.run.value)
          for (const field of Object.values(outcome.controls)) assert.ok(field.label && field.value)
        }
        selected = updateRoomActivity(family, run, 'setting')
        assert.equal(roomActivityReading(family, selected).output, null)
        assert.ok(++settings < 6, subject)
      } while (selected.setting !== 0)
      assert.ok(settings > 1, subject)
      sample = updateRoomActivity(family, updateRoomActivity(family, sample, 'run'), 'sample')
      assert.equal(roomActivityReading(family, sample).output, null)
      assert.ok(++samples < 6, subject)
    } while (sample.sample !== 0)
    assert.ok(samples > 1, subject)
    assert.deepEqual(roomActivityReading(family, sample), start, subject)
  }
})

test('the same threshold includes an equal-confidence box and turns an equal-brightness pixel black', () => {
  for (const [unit, input, output] of [
    ['opencv', [40, 128, 210], [0, 0, 1]],
    ['yolox', [50, 70, 90], [0, 1, 1]],
  ] as const) {
    const state = updateRoomActivity('vision', initialRoomActivity(unit), 'run')
    const reading = roomActivityReading('vision', state)
    assert.deepEqual(reading.input, input)
    assert.deepEqual(reading.output, output)
  }
})

test('a reversed diode stays dark, and a first-match order can genuinely return no battery', () => {
  const rev = updateRoomActivity('electronics', initialRoomActivity(), 'setting')
  const off = updateRoomActivity('electronics', rev, 'run')
  assert.deepEqual(roomActivityReading('electronics', off).output, [0])
  const empty = updateRoomActivity('ai', updateRoomActivity('ai', initialRoomActivity(), 'sample'), 'sample')
  const run = updateRoomActivity('ai', empty, 'run')
  assert.deepEqual(roomActivityReading('ai', run).output, [0, 0, 0])
  assert.match(describeRoomActivity('ai', run, 'en').status, /No matching battery/)
})

test('selecting stack rather than queue retrieves the last arrival and keeps the original rack', () => {
  const stack = updateRoomActivity('algorithms', initialRoomActivity('structures'), 'setting')
  const run = updateRoomActivity('algorithms', stack, 'run')
  const reading = roomActivityReading('algorithms', run)
  assert.deepEqual(reading.output, [0, 0, 0, 1])
  reading.input.reverse()
  assert.deepEqual(roomActivityReading('algorithms', run).input, [4, 1, 3, 2])
})

test('the chosen program, opcode, table sort, statistic and SQL threshold change the actual output', () => {
  const tasks: [LessonRoomFamily, string, number[]][] = [
    ['coding', 'foundations', [3]],
    ['systems', 'computer', [1]],
    ['systems', 'architecture', [2]],
    ['data', 'numpy', [4, 10, 7]],
    ['data', 'pandas', [8, 5, 2]],
    ['data', 'statistics', [6]],
    ['data', 'database', [0, 1, 0]],
  ]
  for (const [family, unit, expected] of tasks) {
    const change = updateRoomActivity(family, initialRoomActivity(unit), 'setting')
    const run = updateRoomActivity(family, change, 'run')
    assert.deepEqual(roomActivityReading(family, run).output, expected, unit)
  }
})
