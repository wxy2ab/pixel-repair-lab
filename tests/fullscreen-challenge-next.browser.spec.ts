import { expect, test, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

const firstCrate = 'challenge-sokoban-first-nut-crate'
const liftDelivery = 'challenge-sokoban-lift-delivery'

async function openFirstWarehouse(page: Page, skipped: string[] = []) {
  await page.addInitScript(skipped => {
    localStorage.setItem('pixel-repair-lab:board-view', '2d')
    localStorage.setItem('pixel-repair-lab:challenge-route-skips', JSON.stringify(skipped))
  }, skipped)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#challenge-zone')
  await page.locator('[data-challenge-route="warehouse"]').click()
  await page.locator(`[data-route-step="${firstCrate}"] .challenge-route-step-open`).click()
}

test('a warehouse win opens the next playable board in native fullscreen and exits back to that challenge', async ({ page }) => {
  await openFirstWarehouse(page)
  await page.getByRole('button', { name: '全屏地图', exact: true }).click()
  const first = page.getByRole('dialog', { name: '第一箱螺母', exact: true })
  await expect(first.getByRole('button', { name: '下一关', exact: true })).toBeHidden()
  await first.locator('[data-push-direction="right"]').click()
  await expect(first.getByTestId('warehouse-receipt')).toBeVisible()
  await first.getByRole('button', { name: '下一关', exact: true }).click()

  const next = page.getByRole('dialog', { name: '升降台送件', exact: true })
  await expect(next).toBeVisible()
  expect(await next.evaluate(board => document.fullscreenElement?.contains(board))).toBe(true)
  await expect(next.getByRole('button', { name: '下一关', exact: true })).toBeHidden()
  await expect(next.getByTestId('warehouse-readout')).toContainText('步数 0')
  await next.locator('[data-push-direction="right"]').click()
  await expect(next.getByTestId('warehouse-readout')).toContainText('步数 1')
  await next.getByRole('button', { name: '退出全屏', exact: true }).click()

  await expect(next).toBeHidden()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect(page.getByRole('heading', { name: '升降台送件', level: 1, exact: true })).toBeVisible()
  await page.getByRole('button', { name: '撤销一步' }).click()
  await expect(page.getByTestId('warehouse-readout')).toContainText('步数 0')
})

test('a Python win on a phone offers the next unskipped board in English with the console closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Unavailable', 'NotAllowedError'))
  })
  await openFirstWarehouse(page, [liftDelivery])
  await page.getByRole('button', { name: '指令卡 / Python' }).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill('move("right")')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Fullscreen map', exact: true }).click()
  const first = page.getByRole('dialog', { name: 'The First Nut Crate', exact: true })
  await expect(first).toHaveAttribute('data-console', 'closed')
  await first.getByRole('button', { name: 'Run', exact: true }).click()
  const advance = first.getByRole('button', { name: 'Next level', exact: true })
  await expect(advance).toBeInViewport()
  await advance.click()

  const next = page.getByRole('dialog', { name: 'Platform Loop', exact: true })
  await expect(next).toBeVisible()
  expect(await next.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await next.getByRole('button', { name: 'Exit fullscreen', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Platform Loop', level: 1, exact: true })).toBeVisible()
})

test('finishing the last pending warehouse offers free selection and exits fullscreen', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const cleared = levels.filter(level => level.unit?.id === 'challenge-zone' && level.kind === 'grid'
    && level.warehouse && level.id !== firstCrate).map(level => level.id)
  expect(cleared).toContain(liftDelivery)
  await page.addInitScript(ids => localStorage.setItem('pixel-repair-lab:completed', JSON.stringify(ids)), cleared)
  await openFirstWarehouse(page)
  await page.getByRole('button', { name: '全屏地图', exact: true }).click()
  const board = page.getByRole('dialog', { name: '第一箱螺母', exact: true })
  await board.locator('[data-push-direction="right"]').click()
  await expect(board.getByTestId('warehouse-receipt')).toBeVisible()
  await expect(board.getByRole('button', { name: '下一关', exact: true })).toBeHidden()
  await board.getByRole('button', { name: '返回选关', exact: true }).click()
  await expect(board).toBeHidden()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await expect(page.locator(`[data-challenge-level="${firstCrate}"]`)).toBeVisible()
})

test('a freely selected arena advances from its completed replay to the following duel', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const arena = levels.find(level => level.id === 'challenge-neon-pinball-cup')
  if (arena?.kind !== 'arena') throw new Error('Missing the Neon Pinball Cup')
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/#challenge-browse')
  await page.locator(`[data-challenge-level="${arena.id}"]`).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(arena.solutionCode)
  await page.getByRole('button', { name: '全屏地图', exact: true }).click()
  const board = page.getByRole('dialog', { name: arena.title.zh, exact: true })
  await board.getByRole('button', { name: '单步执行', exact: true }).click()
  await board.getByRole('button', { name: '战况', exact: true }).click()
  await expect(board.getByRole('button', { name: '下一关', exact: true })).toBeHidden()
  await board.getByRole('button', { name: '跳到结尾', exact: true }).click()
  await board.getByRole('button', { name: '下一关', exact: true }).click()
  const next = page.getByRole('dialog', { name: '浪尖栈桥冲刺', exact: true })
  await expect(next).toBeVisible()
  await expect(next.getByTestId('arena-turn')).toContainText('回合 0/')
})

test('winning a course arena continues to the next core lesson and releases fullscreen for its classroom', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const lesson = levels.find(level => level.id === 'parts-race')
  if (lesson?.kind !== 'arena') throw new Error('Missing the Parts race lesson')
  await page.addInitScript(id => {
    localStorage.setItem('pixel-repair-lab:board-view', '2d')
    localStorage.setItem('pixel-repair-lab:completed', JSON.stringify([id]))
  }, lesson.id)
  await page.goto('/')
  await page.locator('[data-unit="routing"]').click()
  await page.locator('.mission-list').getByRole('button').filter({ hasText: lesson.title.zh }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(lesson.solutionCode)
  await page.getByRole('button', { name: '全屏地图', exact: true }).click()
  const board = page.getByRole('dialog', { name: lesson.title.zh, exact: true })
  const advance = board.getByRole('button', { name: '下一关', exact: true })
  await expect(advance).toBeHidden()
  await board.getByRole('button', { name: '单步执行', exact: true }).click()
  await board.getByRole('button', { name: '战况', exact: true }).click()
  await board.getByRole('button', { name: '跳到结尾', exact: true }).click()
  await advance.click()

  await expect(page.getByRole('heading', { name: '用旧答案做新决定', level: 1, exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await expect(page.locator('[data-unit="routing"]')).toBeVisible()
})
