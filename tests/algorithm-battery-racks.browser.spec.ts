import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openRack(page: Page, title: string, scene: string, unit = 'algorithm-intro') {
  await page.goto('/')
  await page.locator('[data-unit="' + unit + '"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(title, { exact: true }) }).click()
  const rack = page.locator('[data-teaching-model="' + scene + '"]')
  await rack.scrollIntoViewIfNeeded()
  await expect(rack).toHaveAttribute('data-renderer', 'webgl')
  return rack
}

function label(rack: Locator, name: string) {
  return rack.locator('.teaching-model-labels').getByText(name, { exact: true })
}

async function tap(rack: Locator, value: string) {
  const canvas = rack.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  const [surface, tag] = await Promise.all([canvas.boundingBox(), label(rack, value).boundingBox()])
  if (!surface || !tag) throw new Error('Missing battery rack or label ' + value)
  await canvas.click({ position: { x: tag.x + tag.width / 2 - surface.x, y: tag.y + tag.height / 2 - surface.y } })
}

test('the sorting rack exposes the three actual writes of a swap and can rewind the middle write', async ({ page }) => {
  const rack = await openRack(page, '按电量排好电池', 'selection-sort-rack')
  const lesson = page.getByTestId('selection-sort-lesson')
  const code = lesson.getByTestId('selection-sort-code')
  for (const name of ['▶', 'B · 3', '▶', 'C · 8', 'D · 1', '▶', 'D · 1', 'A · 6']) await tap(rack, name)
  await expect(lesson.getByTestId('selection-sort-step')).toHaveAttribute('data-kind', 'swap')
  await lesson.getByRole('button', { name: '逐行看这次交换' }).click()
  await expect(code).toContainText('held = row[start]')
  await expect(label(rack, 'held · A · 6')).toBeVisible()
  await tap(rack, '▶')
  await expect(code).toContainText('row[start] = row[min_index]')
  await expect(label(rack, 'D · 1')).toHaveCount(2)
  await tap(rack, '▶')
  await expect(code).toContainText('row[min_index] = held')
  await expect(label(rack, 'D · 1')).toHaveCount(1)
  await lesson.getByRole('button', { name: '上一行' }).click()
  await expect(label(rack, 'D · 1')).toHaveCount(2)
})

test('binary search narrows on a real midpoint, rewinds, and keeps an excluded midpoint from advancing', async ({ page }) => {
  const rack = await openRack(page, '找出第一块同电量的电池', 'first-match-search-rack', 'routing')
  const guide = page.getByTestId('first-battery-search-lesson')
  await tap(rack, 'A · 1')
  await expect(guide.getByTestId('first-battery-search-hint')).toBeVisible()
  await tap(rack, 'D · 7')
  await expect(guide.getByTestId('first-battery-search-code')).toContainText('middle =')
  await tap(rack, '▶')
  await tap(rack, '▶')
  await expect(guide.getByTestId('first-battery-search-range')).toHaveAttribute('data-first', '4')
  await tap(rack, 'D · 7')
  await expect(guide.getByTestId('first-battery-search-step')).toHaveAttribute('data-kind', 'narrow')
  await guide.getByRole('button', { name: '上一步' }).click()
  await expect(guide.getByTestId('first-battery-search-range')).toHaveAttribute('data-first', '0')
})

test('the pointer rack validates the chosen end and never advances on a mistaken move', async ({ page }) => {
  const rack = await openRack(page, '从两头给电池配对', 'two-pointer-rack')
  const guide = page.getByTestId('two-pointer-lesson')
  await tap(rack, '▶')
  await expect(label(rack, '1 + 14 = 15')).toBeVisible()
  await tap(rack, 'F · 14')
  await expect(guide.getByTestId('two-pointer-hint')).toBeVisible()
  await tap(rack, 'A · 1')
  await expect(guide.getByTestId('two-pointer-step')).toHaveAttribute('data-left', '1')
  await expect(guide.getByTestId('two-pointer-code')).toContainText('left += 1')
})

test('tap the same battery twice for a one-slot range, then tap the exact prefix operands', async ({ page }) => {
  const rack = await openRack(page, '算一段电池的总电量', 'prefix-totals-rack')
  const guide = page.getByTestId('prefix-totals-lesson')
  for (const name of ['A · 3', 'A · 3', 'A · 3', '▶', 'A · 3', 'B · 1', 'C · 4', 'D · 2', 'E · 5']) await tap(rack, name)
  await tap(rack, '3')
  await expect(guide.getByTestId('prefix-totals-code')).toContainText('included = prefix[right + 1]')
  await tap(rack, '0')
  await expect(guide.getByTestId('prefix-totals-code')).toContainText('before = prefix[left]')
  await tap(rack, '▶')
  await expect(label(rack, '3 − 0 = 3')).toBeVisible()
  await tap(rack, '▶')
  const prediction = page.locator('[data-teaching-model="prefix-prediction-rack"]')
  await prediction.scrollIntoViewIfNeeded()
  await expect(prediction).toHaveAttribute('data-renderer', 'webgl')
  await expect(label(prediction, '14')).toHaveCount(0)
})
