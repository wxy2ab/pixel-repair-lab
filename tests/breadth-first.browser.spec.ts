import { expect, test, type Locator } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

const button = (panel: Locator, name: string) => panel.getByRole('button', { name, exact: true })
const positions = (tiles: Locator) => tiles.evaluateAll(items => items.map(item =>
  [Number(item.getAttribute('data-x')), Number(item.getAttribute('data-y'))]))

test('breadth-first search lays out its queue and layers, then verifies the order and route on a new map', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  const lesson = levels.find(level => level.id === 'routing-notes')
  if (lesson?.kind !== 'lecture' || !lesson.execution?.breadthFirstLesson) throw new Error('Missing the breadth-first search lesson')

  await page.goto('/#track-algorithms')
  await page.locator('[data-unit="routing"]').click()
  const mission = page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(lesson.title.zh, { exact: true }) })
  await mission.click()
  await expect(page.getByRole('heading', { level: 1, name: lesson.title.zh, exact: true })).toBeVisible()

  const guide = page.getByTestId('breadth-first-lesson')
  const step = guide.getByTestId('breadth-first-step')
  const code = guide.getByTestId('breadth-first-code')
  const queue = guide.getByTestId('breadth-first-queue')
  const map = guide.getByTestId('breadth-first-map')
  const cell = (x: number, y: number) => guide.getByTestId(`bfs-cell-${x}-${y}`)
  const prediction = page.getByTestId('breadth-first-prediction')
  const click = (label: string) => button(guide, label).click()

  await expect(code).toHaveCount(0)
  await expect(prediction).toHaveCount(0)
  await click('开始搜索')
  await expect(step).toHaveAttribute('data-kind', 'start')
  await expect(code).toContainText('queue = [start]')
  await expect(cell(0, 0)).toHaveAttribute('data-visited', 'true')
  expect(await positions(queue.locator('[data-x][data-y]'))).toEqual([[0, 0]])

  const enqueueOrder = [[0, 1], [1, 1], [0, 2], [2, 1], [1, 2], [2, 0]]
  const visitedDepths: number[] = []
  const skips = new Set<string>()
  let enqueued = 0
  for (let count = 0; count < 55 && await step.getAttribute('data-kind') !== 'return'; count++) {
    const next = await step.getAttribute('data-next-kind')
    if (next === 'enqueue') {
      const [x, y] = enqueueOrder[enqueued++]
      if (enqueued === 1) {
        await cell(1, 0).click()
        await expect(guide.getByTestId('breadth-first-hint')).toContainText('墙')
        await expect(step).toHaveAttribute('data-next-kind', 'enqueue')
      }
      await cell(x, y).click()
      await expect(step).toHaveAttribute('data-kind', 'enqueue')
      await expect(code).toContainText('queue.append([x, y])')
      await expect(cell(x, y)).toHaveAttribute('data-visited', 'true')
      await expect(cell(x, y)).toHaveAttribute('data-queued', 'true')
      if (enqueued === 1) await expect(cell(x, y)).toHaveAttribute('data-depth', '1')
    } else if (next === 'visit') {
      await click('取出队头')
      await expect(code).toContainText('queue.pop(0)')
      visitedDepths.push(Number(await step.getAttribute('data-depth')))
      if (visitedDepths.length === 1) {
        await click('上一步')
        await expect(step).toHaveAttribute('data-kind', 'start')
        expect(await positions(queue.locator('[data-x][data-y]'))).toEqual([[0, 0]])
        await click('取出队头')
      }
    } else if (next === 'skip') {
      await click('检查邻格')
      const reason = await step.getAttribute('data-reason')
      if (reason) skips.add(reason)
    } else if (next === 'goal') {
      await click('取出队头')
      await expect(step).toHaveAttribute('data-kind', 'goal')
      visitedDepths.push(Number(await step.getAttribute('data-depth')))
    } else if (next === 'path') {
      await click('沿记录回溯')
      await expect(code).toContainText('parent[')
    } else if (next === 'return') {
      await expect(prediction).toHaveCount(0)
      await click('查看最短路线')
    } else {
      throw new Error('Unexpected next search step: ' + next)
    }
  }
  expect(enqueued).toBe(6)
  expect(visitedDepths).toEqual([0, 1, 2, 2, 3, 3, 4])
  expect([...skips]).toEqual(expect.arrayContaining(['wall', 'visited']))
  await expect(step).toHaveAttribute('data-kind', 'return')
  await expect(guide.getByTestId('breadth-first-result')).toContainText('4')
  expect(await positions(map.locator('[data-on-path="true"]'))).toEqual([[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]])

  const verify = button(prediction, '运行验证')
  await expect(verify).toBeDisabled()
  await prediction.locator('[data-order-option="1"]').click()
  await expect(verify).toBeDisabled()
  await prediction.locator('[data-path-option="0"]').click()
  await expect(prediction.getByTestId('breadth-first-actual-map')).toHaveCount(0)
  await verify.click()
  await expect(prediction).toHaveAttribute('data-match', 'false')
  await expect(prediction.locator('[data-prediction="order"]')).toHaveAttribute('data-match', 'true')
  await expect(prediction.locator('[data-prediction="path"]')).toHaveAttribute('data-match', 'false')
  await expect(prediction.getByTestId('breadth-first-actual-distance')).toHaveText('5 步')
  const actualMap = prediction.getByTestId('breadth-first-actual-map')
  expect(await positions(actualMap.locator('[data-on-path="true"]'))).toEqual([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [3, 1]])
  await expect(mission.locator('.mission-check')).toHaveCount(0)
  await button(prediction, '再猜一次').click()
  await prediction.locator('[data-path-option="1"]').click()
  await verify.click()
  await expect(prediction).toHaveAttribute('data-match', 'true')
  await expect(mission.locator('.mission-check')).toBeVisible()
})
