import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { LectureLevel } from '../src/shared/advanced'
import { validateLevel } from '../src/shared/validate'

test('imported lecture boxes fit the plot, including the final row and column', () => {
  const lecture: LectureLevel = JSON.parse(readFileSync(new URL('../levels/551-yolox-explain.json', import.meta.url), 'utf8'))
  const animation = lecture.animation!
  animation.plot = { columns: 8, rows: 6 }
  const item = animation.frames[0].items[0]
  animation.frames = [0, 1].map(() => ({ caption: lecture.brief, items: [item] }))
  item.box = [6, 3, 2, 3]
  assert.deepEqual(validateLevel(lecture).issues, [])
  item.box = [6, 4, 2, 3]
  assert.ok(validateLevel(lecture).issues.some(issue => issue.path === '/animation/frames/0/items/0/box'))
  delete animation.plot
  assert.ok(validateLevel(lecture).issues.some(issue => issue.code === 'animation-box'))
})
