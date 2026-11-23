import { expect, test, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openLesson(page: Page, id: string, model: string) {
  const { levels } = await (await page.request.get('/api/levels')).json() as Catalog
  const level = levels.find(item => item.id === id)
  if (!level?.unit) throw new Error('Missing lesson ' + id)
  await page.goto('/')
  await page.locator(`[data-unit="${level.unit.id}"]`).click()
  await page.locator('.mission-list button').filter({ has: page.getByText(level.title.zh, { exact: true }) }).click()
  const view = page.locator(`[data-teaching-model="${model}"]`)
  await view.scrollIntoViewIfNeeded()
  await expect(view).toHaveAttribute('data-renderer', 'webgl', { timeout: 20000 })
  return view
}

test('a child flips a 3D lever and sees AND, NOT and reset update the same circuit', async ({ page }) => {
  test.slow()
  const view = await openLesson(page, 'logic-switchboard-demo', 'circuit-switchboard')
  const bench = page.getByRole('region', { name: '电路实验台', exact: true })
  const b = bench.getByRole('button', { name: 'B', exact: true })
  async function tapLever(label: string) {
    const tag = view.getByText(label, { exact: true })
    await expect(tag).toBeVisible()
    await tag.scrollIntoViewIfNeeded()
    const box = await tag.boundingBox()
    if (!box) throw new Error('Missing projected lever label')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  await tapLever('B · 0')
  await expect(b).toHaveAttribute('aria-pressed', 'true')
  await expect(bench.getByTestId('gate-output')).toHaveText('1')
  await bench.getByRole('button', { name: 'NOT', exact: true }).click()
  await expect(view.getByText('NOT', { exact: true })).toBeVisible()
  await tapLever('B · 1')
  await expect(b).toHaveAttribute('aria-pressed', 'false')
  await expect(bench.getByTestId('gate-output')).toHaveText('0')
  await tapLever('A · 1')
  await expect(bench.getByTestId('gate-output')).toHaveText('1')
  await page.getByRole('button', { name: '重置开关', exact: true }).click()
  await expect(view.getByText('AND', { exact: true })).toBeVisible()
  await expect(view.getByText('A · 1', { exact: true })).toBeVisible()
  await expect(bench.getByTestId('gate-output')).toHaveText('0')
})

test('the CPU model follows reads, writes, HALT, rewind and reset from the actual trace', async ({ page }) => {
  test.slow()
  const view = await openLesson(page, 'cpu-instructions-demo', 'cpu-transfer')
  const step = page.getByRole('button', { name: '单步执行', exact: true })
  await expect(view.getByText('ACC 0', { exact: true })).toBeVisible()
  for (const [op, acc, pc] of [['LOAD [0]', 18, 1], ['ADD [1]', 14, 2], ['STORE [2]', 14, 3], ['HALT', 14, 4]]) {
    await step.click()
    await expect(view.getByText(String(op), { exact: true })).toBeVisible()
    await expect(view.getByText('ACC ' + acc, { exact: true })).toBeVisible()
    await expect(view.getByText('PC ' + pc, { exact: true })).toBeVisible()
  }
  await expect(view.getByText('14', { exact: true })).toBeVisible()
  await expect(step).toBeDisabled()
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await expect(view.getByText('STORE [2]', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重置 CPU', exact: true }).click()
  await expect(view.getByText('ACC 0', { exact: true })).toBeVisible()
  await expect(view.getByText('STORE [2]', { exact: true })).toHaveCount(0)
})

test('the combined board uses each switch weight and rebuilds its register for a longer scenario', async ({ page }) => {
  const view = await openLesson(page, 'binary-gate-challenge', 'circuit-switchboard')
  await page.getByRole('button', { name: '位 3', exact: true }).click()
  await expect(view.getByText('2×1', { exact: true })).toBeVisible()
  await expect(view.getByText('2', { exact: true })).toBeVisible()
  await expect(page.getByTestId('gate-output')).toHaveText('0')
  await page.getByRole('button', { name: /显示 25/ }).click()
  await expect(view.getByText('16×1', { exact: true })).toBeVisible()
  await expect(view.getByText('17', { exact: true })).toBeVisible()
  await expect(page.getByTestId('gate-output')).toHaveText('1')
})
