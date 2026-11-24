import assert from 'node:assert/strict'
import test from 'node:test'
import { runProgram } from '../src/engine/run'
import { initialSnapshot } from '../src/engine/snapshot'
import { scanLevels } from '../src/server/catalog'
import { cardsToPython } from '../src/shared/cards'
import { prerequisiteIssues } from '../src/shared/coursePrerequisites'
import type { GridLevel, Position, Warehouse } from '../src/shared/types'
import { warehouseParked, warehouseRunPushes } from '../src/shared/warehouse'
import { buildChallengeCatalog, filterChallenges } from '../src/web/challengeModel'
import { buildChallengeRoutes } from '../src/web/challengeRoutes'
import { groupLevels } from '../src/web/lessonTools'

type WarehouseLevel = GridLevel & { warehouse: Warehouse }

// Compare playable layouts independent of padding, facing and which box appears first in JSON.
function layoutKey(level: WarehouseLevel): string {
  const cell = (point: Position) => point.x + ',' + point.y
  const boxes = new Set(level.warehouse.boxes.map(cell))
  const targets = new Set(level.warehouse.targets.map(cell))
  const floor = level.tiles.flatMap((row, y) => Array.from(row, (tile, x) => {
    const key = cell({ x, y })
    return tile === '.' ? { x, y, mark: Number(boxes.has(key)) + 2 * Number(targets.has(key)) } : undefined
  }).filter(point => point !== undefined))
  const keys: string[] = []
  for (const swap of [false, true]) {
    for (const horizontal of [-1, 1]) {
      for (const vertical of [-1, 1]) {
        const rotated = floor.map(({ x, y, mark }) => ({
          x: horizontal * (swap ? y : x), y: vertical * (swap ? x : y), mark,
        }))
        const left = Math.min(...rotated.map(point => point.x))
        const top = Math.min(...rotated.map(point => point.y))
        keys.push(rotated.map(({ x, y, mark }) => [x - left, y - top, mark].join(',')).sort().join(' '))
      }
    }
  }
  return keys.sort()[0]
}

test('the warehouse route progresses from starter to advanced with distinct layouts and working mouse cards', async () => {
  const { entries } = await scanLevels()
  const catalog = entries.map(entry => entry.level)
  const pack = catalog.filter((level): level is WarehouseLevel => level.kind === 'grid' && !!level.warehouse && level.id.startsWith('challenge-sokoban-'))
  const challengeCatalog = buildChallengeCatalog(pack, groupLevels(catalog), [])
  const route = buildChallengeRoutes(challengeCatalog.entries, []).find(route => route.type === 'warehouse')
  assert.ok(route)
  const publishedOrders: number[] = []
  for (const [first, count, difficulty] of [[2161, 6, 'starter'], [2167, 6, 'intermediate'],
    [1981, 30, 'advanced'], [2101, 60, 'advanced']] as const) {
    const expected = Array.from({ length: count }, (_, i) => first + i)
    const freeChoice = filterChallenges(challengeCatalog.entries, { type: 'warehouse', difficulty })
    assert.deepEqual(freeChoice.map(entry => entry.level.order).filter(order => order >= first && order < first + count), expected)
    publishedOrders.push(...expected)
  }
  assert.deepEqual(route.entries.map(entry => entry.level.order).filter(order => publishedOrders.includes(order)), publishedOrders)
  assert.equal(new Set(pack.map(level => level.order)).size, pack.length)
  const layouts = new Map<string, string>()
  const pushesByOrder = new Map<number, number>()
  for (const level of pack) {
    const key = layoutKey(level)
    assert.ok(!layouts.has(key), level.id + ' repeats ' + layouts.get(key))
    layouts.set(key, level.id)
    assert.equal(level.unit?.id, 'challenge-zone', level.id)
    assert.equal(level.stage, 'challenge', level.id)
    assert.ok(level.difficulty, level.id)
    assert.ok(level.prerequisites?.length, level.id)
    assert.deepEqual(prerequisiteIssues(level, catalog), [], level.id)
    assert.ok(level.objectives.some(goal => goal.type === 'parkBoxes'), level.id)
    const { boxes, targets } = level.warehouse
    assert.ok(warehouseParked(boxes, targets) < targets.length, level.id)
    if (level.difficulty === 'advanced') assert.ok(boxes.length >= 3, level.id)
    if (level.order >= 2167 && level.order <= 2172) assert.ok(boxes.length >= 2, level.id)
    const result = runProgram(level, cardsToPython(level.cards, level.solutionCards))
    assert.equal(result.won, true, level.id + ' ' + JSON.stringify(result.issue))
    assert.equal(warehouseParked(result.final.boxes!, targets), targets.length, level.id)
    const pushes = warehouseRunPushes(initialSnapshot(level), result.frames)
    pushesByOrder.set(level.order, pushes)
    assert.ok(level.concept.zh.includes(`最少推 ${pushes} 次`), level.id)
    assert.match(level.concept.en, new RegExp(`\\b${boxes.length} ${boxes.length === 1 ? 'crate' : 'crates'}\\b`), level.id)
    assert.match(level.concept.en, new RegExp(`\\b${pushes} ${pushes === 1 ? 'push' : 'pushes'} minimum\\b`), level.id)
  }
  const openingPushes = Array.from({ length: 12 }, (_, i) => pushesByOrder.get(2161 + i)!)
  assert.equal(openingPushes[0], 1)
  assert.deepEqual(openingPushes, [...openingPushes].sort((a, b) => a - b))
  assert.ok(openingPushes[11] < pushesByOrder.get(1981)!)
})
