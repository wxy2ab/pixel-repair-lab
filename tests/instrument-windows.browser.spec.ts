import { expect, test, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

async function openLesson(page: Page, id: string) {
  const { levels } = await (await page.request.get('/api/levels')).json() as Catalog
  const level = levels.find(lesson => lesson.id === id)
  if (!level?.unit) throw new Error('Unknown lesson ' + id)
  await page.goto('/')
  await page.locator(`[data-unit="${level.unit.id}"]`).click()
  await page.locator('.mission-list button').filter({ has: page.getByText(level.title.zh, { exact: true }) }).click()
}

test('the input switches, gate and output lamp operate together on the simulated circuit bench', async ({ page }) => {
  await openLesson(page, 'logic-switchboard-demo')
  const bench = page.getByRole('region', { name: '电路实验台', exact: true })
  const switches = bench.getByRole('group', { name: '输入开关' })
  await expect(bench.getByTestId('gate-output')).toHaveText('0')
  await switches.getByRole('button', { name: 'B', exact: true }).click()
  await expect(bench.getByTestId('gate-output')).toHaveText('1')
  await expect(bench.getByText('灯亮', { exact: true })).toBeVisible()
  const desk = page.getByRole('region', { name: '操作台', exact: true })
  await expect(desk.getByRole('button', { name: '记录观察' })).toBeEnabled()
})

test('the workbook shows the actual input and output for its run and clears that output when settings change', async ({ page }) => {
  await openLesson(page, 'numpy-slicing-demo')
  await page.setViewportSize({ width: 390, height: 844 })
  const book = page.getByRole('region', { name: '维修站数据工作簿', exact: true })
  await expect(book.getByTestId('data-input')).toBeVisible()
  await book.getByRole('button', { name: '运行实验', exact: true }).click()
  await expect(book.getByTestId('data-output').locator('tbody tr')).toHaveCount(3)
  await expect(book.locator('.experiment-receipt')).toContainText('送入 11 行')
  await book.getByTestId('data-controls').locator('[data-parameter="stop"]').fill('4')
  await expect(book.getByTestId('data-output')).toHaveCount(0)
  await book.getByRole('button', { name: '运行实验', exact: true }).click()
  await expect(book.getByTestId('data-output').locator('tbody tr')).toHaveCount(4)
  await expect(book.locator('.experiment-receipt')).toContainText('得到 4 行')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
