import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DataLevel } from '../src/shared/dataCourse'
import type { AiLevel, GridLevel, LevelMetadata } from '../src/shared/types'
import { buildChallengeCatalog, buildChallengePreparation, filterChallenges, nextChallenge, type ChallengeEntry } from '../src/web/challengeModel'

const unit = { id: 'course', order: 1, title: { zh: '课程', en: 'Course' } }
const otherUnit = { id: 'second-course', order: 2, title: { zh: '第二课程', en: 'Second course' } }
const topic = { id: 'topic', order: 1, title: { zh: '主题', en: 'Topic' } }
const otherTopic = { id: 'another-topic', order: 2, title: { zh: '另一主题', en: 'Another topic' } }
const base: LevelMetadata = { version: 1, id: 'example', order: 10, title: unit.title, brief: unit.title, concept: unit.title, hints: [] }

function grid(id: string, fields: Partial<GridLevel> = {}): GridLevel {
  return {
    ...base, kind: 'grid', id, unit, stage: 'exercise', tiles: ['..'], start: { x: 0, y: 0 },
    objectives: [{ type: 'exit', x: 1, y: 0 }], allowedApi: ['move'], cards: [], solutionCards: [], ...fields,
  }
}

function entryIds(entries: ChallengeEntry[]) {
  return entries.map(({ level }) => level.id)
}

test('challenge recommendations require all core lessons and omit cleared challenges', () => {
  const project: DataLevel = { ...base, id: 'final', kind: 'data', unit, stage: 'challenge', courseFinal: true, steps: [] }
  const course = { unit, levels: [grid('learn', { topic, stage: 'explain' }), grid('practice', { topic }),
    grid('new-topic', { topic: otherTopic }), grid('optional', { stage: 'challenge' }), project] }
  const topicChallenge = grid('topic-challenge', { prerequisites: [{ unit: unit.id, topic: topic.id }], difficulty: 'starter' })
  const moduleChallenge = grid('module-challenge', { prerequisites: [{ unit: unit.id }], difficulty: 'intermediate' })
  const unknown = grid('unknown', { prerequisites: [{ unit: unit.id, topic: topic.id }, { unit: unit.id, topic: 'missing' }] })
  const standalone = grid('standalone')
  const levels = [moduleChallenge, topicChallenge, unknown, standalone]

  assert.deepEqual(entryIds(buildChallengeCatalog(levels, [course], ['learn']).recommendations), [])
  const partial = buildChallengeCatalog(levels, [course], ['learn', 'practice', 'new-topic'])
  assert.deepEqual(entryIds(partial.recommendations), ['topic-challenge'])
  assert.equal(partial.entries.find(entry => entry.level.id === 'module-challenge')?.ready, false)
  assert.equal(partial.entries.find(entry => entry.level.id === 'unknown')?.ready, false)

  const complete = buildChallengeCatalog(levels, [course], ['learn', 'practice', 'new-topic', 'final'])
  assert.deepEqual(entryIds(complete.recommendations), ['topic-challenge', 'module-challenge'])
  assert.deepEqual(complete.recommendations[0].preparation.prerequisites[0].label, { zh: '课程 · 主题', en: 'Course · Topic' })
  assert.deepEqual(complete.courses, [{ unitId: unit.id, label: unit.title, topics: [{ topicId: topic.id, label: topic.title }] }])

  const cleared = buildChallengeCatalog(levels, [course], ['learn', 'practice', 'new-topic', 'final', topicChallenge.id])
  assert.deepEqual(entryIds(cleared.recommendations), ['module-challenge'])
  assert.equal(cleared.entries.find(entry => entry.level.id === topicChallenge.id)?.won, true)
})

test('challenge preparation counts overlapping prerequisites once and follows the configured reference order', () => {
  const final: DataLevel = { ...base, id: 'final', kind: 'data', unit, stage: 'challenge', courseFinal: true, steps: [] }
  const levels = [grid('learn-first', { topic, stage: 'explain' }), grid('practice-first', { topic }),
    grid('learn-second', { topic: otherTopic, stage: 'explain' }), grid('practice-second', { topic: otherTopic }),
    grid('optional', { stage: 'challenge' }), final]
  const challenge = grid('overlap', { prerequisites: [{ unit: unit.id, topic: otherTopic.id }, { unit: unit.id }] })
  const prep = buildChallengePreparation(challenge, [{ unit, levels }], new Set(['learn-first', 'practice-second']))

  assert.equal(prep.totalLessons, 5)
  assert.equal(prep.completedLessons, 2)
  assert.deepEqual(prep.requiredLessons.map(lesson => lesson.id), ['learn-second', 'practice-second', 'learn-first', 'practice-first', 'final'])
  assert.deepEqual(prep.missingLessons.map(lesson => lesson.id), ['learn-second', 'practice-first', 'final'])
  assert.deepEqual(prep.prerequisites.map(({ lessonId, completedLessons, totalLessons, missingLessons, complete }) => ({
    lessonId, completedLessons, totalLessons, missing: missingLessons.map(lesson => lesson.id), complete,
  })), [
    { lessonId: 'learn-second', completedLessons: 1, totalLessons: 2, missing: ['learn-second'], complete: false },
    { lessonId: 'learn-first', completedLessons: 2, totalLessons: 5, missing: ['practice-first', 'learn-second', 'final'], complete: false },
  ])
})

test('the nearest challenge favors fewer unfinished lessons and excludes cleared and unresolved options', () => {
  const settled = { ...topic, id: 'settled', order: 3 }
  const course = { unit, levels: [grid('learn', { topic, stage: 'explain' }), grid('practice', { topic }),
    grid('learn-second', { topic: otherTopic, stage: 'explain' }), grid('practice-second', { topic: otherTopic }),
    grid('covered', { topic: settled })] }
  const firstTopic = { unit: unit.id, topic: topic.id }
  const advanced = grid('advanced-close', { difficulty: 'advanced', prerequisites: [firstTopic] })
  const starterFar = grid('starter-far', { difficulty: 'starter', prerequisites: [{ unit: unit.id, topic: otherTopic.id }] })
  const finished = grid('finished', { difficulty: 'starter', order: 1, prerequisites: [firstTopic] })
  const unresolved = grid('unresolved', { difficulty: 'starter', order: 2, prerequisites: [firstTopic, { unit: 'missing' }] })
  const ready = grid('ready', { difficulty: 'starter', order: 3, prerequisites: [{ unit: unit.id, topic: settled.id }] })
  const initial = [starterFar, advanced, finished, unresolved, ready, grid('unrestricted')]
  const completed = ['learn', 'covered', finished.id]

  const baseCatalog = buildChallengeCatalog(initial, [course], completed)
  assert.equal(baseCatalog.nearest?.level.id, advanced.id)
  assert.deepEqual(baseCatalog.nearest?.preparation.missingLessons.map(lesson => lesson.id), ['practice'])
  assert.deepEqual(entryIds(baseCatalog.recommendations), [ready.id])

  const earlier = grid('starter-earlier', { difficulty: 'starter', order: 20, prerequisites: [firstTopic] })
  const later = grid('starter-later', { difficulty: 'starter', order: 21, prerequisites: [firstTopic] })
  assert.equal(buildChallengeCatalog([...initial, later, earlier], [course], completed).nearest?.level.id, earlier.id)
  assert.equal(buildChallengeCatalog([finished, unresolved, ready], [course], completed).nearest, undefined)
})

test('module filters include referenced topics and compose with type and difficulty', () => {
  const courseGroups = [{ unit, levels: [grid('topic-lesson', { topic }), grid('other-lesson', { topic: otherTopic })] },
    { unit: otherUnit, levels: [grid('second-topic-lesson', { unit: otherUnit, topic })] }]
  const ai: AiLevel = { ...base, id: 'ai', kind: 'ai', order: 2, difficulty: 'starter', inventory: [], required: {},
    examplePrompts: { zh: [], en: [] }, prerequisites: [{ unit: unit.id, topic: topic.id }] }
  const levels = [ai, grid('stage-two', { order: 1, difficulty: 'advanced', prerequisites: [{ unit: unit.id, topic: otherTopic.id }] }),
    grid('whole-module', { prerequisites: [{ unit: unit.id }] }),
    grid('different-course', { difficulty: 'starter', prerequisites: [{ unit: otherUnit.id, topic: topic.id }] })]
  const { entries, recommendations } = buildChallengeCatalog(levels, courseGroups, ['topic-lesson', 'other-lesson', 'second-topic-lesson'])

  assert.deepEqual(entryIds(entries), ['different-course', 'whole-module', 'stage-two', 'ai'])
  assert.deepEqual(entryIds(recommendations), ['ai', 'different-course', 'whole-module'])
  assert.deepEqual(entryIds(filterChallenges(entries, { course: { unitId: unit.id } })), ['whole-module', 'stage-two', 'ai'])
  assert.deepEqual(entryIds(filterChallenges(entries, { course: { unitId: unit.id, topicId: topic.id } })), ['ai'])
  assert.deepEqual(entryIds(filterChallenges(entries, { type: 'grid', difficulty: 'intermediate', course: { unitId: unit.id } })), ['whole-module'])
  assert.deepEqual(entryIds(filterChallenges(entries, { type: 'arena', difficulty: 'advanced', course: { unitId: unit.id } })), [])
})

test('next challenge favors prepared, nearby challenges and omits completed levels', () => {
  const courses = [{ unit, levels: [grid('learned', { topic }), grid('pending', { topic: otherTopic })] }]
  const familiar = [{ unit: unit.id, topic: topic.id }]
  const current = grid('current', { difficulty: 'intermediate', prerequisites: familiar })
  const easier = grid('easier', { difficulty: 'starter', prerequisites: familiar })
  const harder = grid('harder', { difficulty: 'advanced', prerequisites: familiar })
  const pending = grid('pending-challenge', { difficulty: 'intermediate', prerequisites: [{ unit: unit.id, topic: otherTopic.id }] })
  const ai: AiLevel = { ...base, id: 'ai-next', kind: 'ai', difficulty: 'intermediate', inventory: [], required: {},
    examplePrompts: { zh: [], en: [] }, prerequisites: familiar }
  const levels = [current, easier, harder, pending, ai]
  function suggested(completed: string[]) {
    return nextChallenge(buildChallengeCatalog(levels, courses, completed).entries, current.id)?.level.id
  }

  assert.equal(suggested(['learned', current.id]), harder.id)
  assert.equal(suggested(['learned', current.id, harder.id, easier.id]), ai.id)
  assert.equal(suggested(['learned', current.id, easier.id, harder.id, ai.id]), pending.id)
  assert.equal(suggested(levels.map(level => level.id)), undefined)
})
