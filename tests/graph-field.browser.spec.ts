import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { LectureLevel } from '../src/shared/advanced'
import { runBreadthFirst } from '../src/engine/programBreadthFirst'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openField(page: Page, unit: string, title: string) {
  await page.goto('/#track-algorithms')
  await page.locator('[data-unit="' + unit + '"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(title, { exact: true }) }).click()
  const field = page.locator('[data-teaching-model]').first()
  await field.scrollIntoViewIfNeeded()
  await expect(field).toHaveAttribute('data-renderer', 'webgl', { timeout: 15_000 })
  await field.getByRole('button', { name: '俯视' }).click()
  return field
}

async function touchTile(model: Locator, name: string) {
  const canvas = model.locator('canvas')
  const tag = model.locator('.teaching-model-labels').getByText(name, { exact: true }).first()
  await expect(tag).toBeVisible()
  await tag.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
  const [box, rect] = await Promise.all([canvas.boundingBox(), tag.boundingBox()])
  if (!box || !rect) throw new Error('Tile label must be visible')
  await canvas.click({ position: { x: rect.x + rect.width / 2 - box.x, y: rect.y + rect.height / 2 - box.y } })
}

test('selecting BFS floor tiles starts, visits and enqueues the actual neighbor, then rewinds it', async ({ page }) => {
  const field = await openField(page, 'routing', '一层层找电池')
  const guide = page.getByTestId('breadth-first-lesson')
  const step = guide.getByTestId('breadth-first-step')
  const code = guide.getByTestId('breadth-first-code')
  await touchTile(field, '0,0')
  await expect(step).toHaveAttribute('data-kind', 'start')
  await touchTile(field, '0,0')
  await expect(code).toContainText('queue.pop(0)')
  while (await step.getAttribute('data-next-kind') === 'skip') {
    await guide.getByRole('button', { name: '检查邻格' }).click()
  }
  await touchTile(field, '1,0')
  await expect(guide.getByTestId('breadth-first-hint')).toContainText('墙')
  await touchTile(field, '0,1')
  await expect(code).toContainText('queue.append')
  await expect(guide.getByTestId('breadth-first-queue').locator('li')).toHaveCount(1)
  await guide.getByRole('button', { name: '上一步' }).click()
  await expect(guide.getByTestId('breadth-first-queue').locator('li')).toHaveCount(0)
  const level = JSON.parse(readFileSync(new URL('../levels/107-routing-notes.json', import.meta.url), 'utf8')) as LectureLevel
  const execution = level.execution!, map = execution.breadthFirstLesson!.demo
  const run = runBreadthFirst(execution.source, map)
  for (const next of run.steps.slice(run.steps.findIndex(s => s.kind === 'enqueue'))) {
    const tile = next.kind === 'skip' && next.reason === 'edge' ? next.current : next.neighbor ?? next.current
    await touchTile(field, (tile ?? map.start).join(','))
    await expect(step).toHaveAttribute('data-kind', next.kind)
  }
  await expect(guide.getByTestId('breadth-first-result')).toContainText('4 步')
  await expect(page.getByTestId('breadth-first-prediction').locator('[data-teaching-model]')).toBeAttached()
})

test('picking DFS rooms reflects the live stack and the Python statements that visited them', async ({ page }) => {
  const field = await openField(page, 'routing', '沿一条路走到底')
  const trace = page.locator('.algorithm-field-line')
  const stats = page.locator('.algorithm-field-stats')
  await touchTile(field, 'A')
  await expect(trace).toContainText('room = stack.pop()')
  await expect(trace.locator('[aria-current="step"]')).toContainText('visited.append(room)')
  await touchTile(field, 'B')
  await touchTile(field, 'C')
  await expect(stats).toContainText('[B, C]')
  await touchTile(field, 'C')
  await expect(stats).toContainText('访问顺序 [A, C]')
  await page.getByRole('button', { name: '跳到结尾' }).click()
  await expect(stats).toContainText('访问顺序 [A, C, D, B]')
})

for (const testCase of [
  { name: '多走几步也能少耗电', unit: 'algorithm-advanced', tile: '1,0', code: 'cost = cost + terrain', final: '[9, 4]' },
  { name: '用旧答案做新决定', unit: 'algorithm-advanced', tile: '[0]', code: 'best.append(take)', final: '[2, 2, 6, 11]' },
  { name: '让策略跟着赛场变', unit: 'routing', tile: '1,0', code: 'right =', final: '对手 (2,1)' },
  { name: '补给最近，还要看对手', unit: 'algorithm-advanced', tile: 'A', code: 'mine = distance', final: '[-1, 2]' },
]) {
  test('the station runs and rewinds ' + testCase.name, async ({ page }) => {
    const field = await openField(page, testCase.unit, testCase.name)
    await touchTile(field, testCase.tile)
    await expect(page.locator('.algorithm-field-line [aria-current="step"]')).toContainText(testCase.code)
    await page.getByRole('button', { name: '上一步' }).click()
    await expect(page.locator('.algorithm-field')).toHaveAttribute('data-step', '0')
    await page.getByRole('button', { name: '跳到结尾' }).click()
    await expect(page.locator('.algorithm-field-stats')).toContainText(testCase.final)
  })
}
