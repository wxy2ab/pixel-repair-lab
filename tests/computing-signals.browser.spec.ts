import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openSignals(page: Page, id: string) {
  const { levels } = await (await page.request.get('/api/levels')).json() as Catalog
  const lesson = levels.find(item => item.id === id)!
  await page.goto('/')
  await page.locator('[data-unit="computer"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(lesson.title.zh, { exact: true }) }).click()
  const model = page.locator('[data-teaching-model="circuit-switchboard"]')
  await model.scrollIntoViewIfNeeded()
  await expect(model).toHaveAttribute('data-renderer', 'webgl', { timeout: 20000 })
  return model
}

async function tap(model: Locator, label: string) {
  const canvas = model.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  const tag = model.locator('.teaching-model-labels').getByText(label, { exact: true })
  const [a, b] = await Promise.all([tag.boundingBox(), canvas.boundingBox()])
  if (!a || !b) throw new Error('Missing switch or gate chip')
  await canvas.click({ position: { x: a.x + a.width / 2 - b.x, y: a.y + a.height / 2 - b.y } })
}

test('the binary lecture follows the child’s own switch pattern one place value at a time', async ({ page }) => {
  const model = await openSignals(page, 'computer-notes')
  const formula = page.getByTestId('binary-formula')
  const lesson = page.getByRole('region', { name: '知识动画' })
  const next = lesson.getByRole('button', { name: '下一步', exact: true })
  await expect(formula.locator('code')).toHaveText('4 × 1 = 4')
  await tap(model, '2×0')
  await expect(lesson.locator('.animation-caption')).toContainText('111')
  await next.click()
  await expect(formula.locator('code')).toHaveText('4 × 1 + 2 × 1 = 6')
  await expect(formula.locator('[data-focus]')).toHaveText('2 × 1')
  await next.click()
  await expect(formula.locator('code')).toHaveText('4 × 1 + 2 × 1 + 1 × 1 = 7')
  await lesson.getByRole('button', { name: '上一步', exact: true }).click()
  await expect(formula.locator('code')).toHaveText('4 × 1 + 2 × 1 = 6')
  await lesson.getByRole('button', { name: '撤销上次操作', exact: true }).click()
  await expect(formula.locator('code')).toHaveText('4 × 1 + 2 × 0 = 4')
})

test('the logic lecture changes gate chips and keeps the NOT output independent of B', async ({ page }) => {
  const model = await openSignals(page, 'logic-gates-notes')
  const lesson = page.getByRole('region', { name: '知识动画' })
  const formula = page.getByTestId('gate-formula').locator('code')
  await expect(formula).toHaveText('1 AND 0 = 0')
  await tap(model, 'AND')
  await expect(formula).toHaveText('1 OR 0 = 1')
  await expect(lesson.getByTestId('signal-changes')).toContainText('0 → 1')
  await tap(model, 'OR')
  await expect(formula).toHaveText('NOT 1 = 0')
  await tap(model, 'B · 0')
  const change = page.getByTestId('signal-changes')
  await expect(change).toContainText('B · 0 → 1')
  await expect(change.locator('[data-changed]')).toHaveCount(1)
  await expect(formula).toHaveText('NOT 1 = 0')
  await lesson.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(formula).toHaveText('1 OR 0 = 1')
})

test('combined challenges keep each case’s switches and undo history separate on a narrow screen', async ({ page }) => {
  const model = await openSignals(page, 'binary-gate-challenge')
  await page.setViewportSize({ width: 390, height: 844 })
  await model.getByRole('button', { name: '俯视', exact: true }).click()
  await tap(model, '8×0')
  await expect(page.getByTestId('circuit-value')).toHaveText('8')
  await tap(model, 'OR')
  await expect(page.getByTestId('gate-formula')).toContainText('NOT 1 = 0')
  await page.getByRole('button', { name: /显示 25/ }).click()
  await expect(page.getByRole('button', { name: '撤销上次操作' })).toBeDisabled()
  await expect(page.getByTestId('circuit-value')).toHaveText('17')
  await page.getByRole('button', { name: /显示 10/ }).click()
  await page.getByRole('button', { name: '撤销上次操作' }).click()
  await expect(page.getByTestId('gate-formula')).toContainText('1 OR 0 = 1')
  await expect(page.getByTestId('circuit-value')).toHaveText('8')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
