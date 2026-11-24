import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import type { Level } from '../src/shared/types'
import { completionMilestone } from '../src/web/completionMilestone'
import { isOptionalChallenge } from '../src/web/lessonTools'

const directory = new URL('../levels/', import.meta.url)
const catalog: Level[] = readdirSync(directory).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(readFileSync(new URL(name, directory), 'utf8')))
const level = (id: string) => catalog.find(candidate => candidate.id === id)!

test('a first pass advances the current topic and closing a topic uses the actual required set', () => {
  const target = level('foundation-notes')
  const topic = catalog.filter(candidate => candidate.unit?.id === target.unit?.id && candidate.topic?.id === target.topic?.id)
  const first = completionMilestone(target, catalog, ['unknown-id'])
  assert.equal(first?.scope, 'lesson')
  assert.deepEqual(first?.progress, { label: target.topic!.title, done: 1, total: topic.length })
  const remaining = topic.filter(candidate => candidate !== target).map(candidate => candidate.id)
  const finish = completionMilestone(target, catalog, remaining)
  assert.equal(finish?.scope, 'topic')
  assert.deepEqual(finish?.progress, { label: target.topic!.title, done: topic.length, total: topic.length })
  assert.equal(completionMilestone(target, catalog, [...remaining, target.id]), undefined)
})

test('a module outranks its topic, excludes optional missions, and a whole course counts the required final project', () => {
  const target = level('foundation-notes')
  const foundations = catalog.filter(candidate => candidate.unit?.id === 'foundations' && !isOptionalChallenge(candidate))
  const stage = completionMilestone(target, catalog, foundations.filter(candidate => candidate !== target).map(candidate => candidate.id))
  assert.equal(stage?.scope, 'unit')
  assert.equal(stage?.tier, 'stage')
  assert.equal(stage?.progress?.total, foundations.length)
  const optional = completionMilestone(level('plan-charge'), catalog, foundations.map(candidate => candidate.id))
  assert.equal(optional?.scope, 'optional')
  assert.equal(optional?.progress, undefined)

  const project = level('data-station-heat-report')
  const required = catalog.filter(candidate => ['numpy', 'pandas', 'statistics', 'database'].includes(candidate.unit?.id ?? '')
    && !isOptionalChallenge(candidate))
  const other = required.find(candidate => candidate.unit?.id === 'database' && candidate !== project)!
  const beforeProject = required.filter(candidate => candidate !== project && candidate !== other).map(candidate => candidate.id)
  const earlier = completionMilestone(other, catalog, beforeProject)
  assert.notEqual(earlier?.scope, 'unit')
  assert.notEqual(earlier?.scope, 'course')
  const graduation = completionMilestone(project, catalog, [...beforeProject, other.id])
  assert.equal(graduation?.scope, 'course')
  assert.equal(graduation?.progress?.total, required.length)
})

test('a short series closes only after every member wins, including when the missing level is played last', () => {
  const first = level('challenge-laser-shortcut')
  const second = level('challenge-laser-turned-mirror')
  const last = level('challenge-laser-mirror-race')
  assert.equal(completionMilestone(last, catalog, [first.id]), undefined)
  const finish = completionMilestone(second, catalog, [first.id, last.id])
  assert.equal(finish?.scope, 'series')
  assert.equal(finish?.progress?.done, 3)
  assert.equal(finish?.progress?.total, 3)
  assert.equal(completionMilestone(second, catalog, [first.id, last.id, second.id]), undefined)
  assert.equal(completionMilestone(level('challenge-ferry-crossing'), catalog, [second.id, last.id]), undefined)
})
