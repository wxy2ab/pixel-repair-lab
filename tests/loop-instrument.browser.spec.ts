import { expect, test } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test('the 3D charger handles a real charging step and rewinds its readout with the program', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const lesson = levels.find(item => item.id === 'while-loop-notes')
  if (lesson?.kind !== 'lecture' || !lesson.unit) throw new Error('Missing the while-loop lesson')
  await page.goto('/')
  await page.locator(`[data-unit="${lesson.unit.id}"]`).click()
  await page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(lesson.title.zh, { exact: true }) }).click()
  const guide = page.getByTestId('while-lesson')
  const figure = guide.locator('[data-teaching-model="loop-while"]')
  const labels = figure.locator('.teaching-model-labels')
  const next = guide.getByRole('button', { name: '下一步', exact: true })
  await figure.scrollIntoViewIfNeeded()
  await expect(figure).toHaveAttribute('data-renderer', 'webgl', { timeout: 15000 })
  await next.click()
  await next.click()
  await expect(labels).toContainText('True')
  const cell = await labels.getByText('0', { exact: true }).boundingBox()
  if (!cell) throw new Error('Battery reading must be on its cell')
  await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2)
  await expect(guide).toHaveAttribute('data-while-stage', 'charge')
  await expect(labels).toContainText('1 轮')
  await expect(labels.getByText('3', { exact: true })).toBeVisible()
  await guide.getByRole('button', { name: '上一步', exact: true }).click()
  await expect(labels.getByText('0', { exact: true })).toBeVisible()
  await expect(labels).toContainText('0 轮')
  await figure.getByRole('button', { name: '俯视', exact: true }).click()
  await expect(guide).toHaveAttribute('data-while-stage', 'check')
  await expect(labels).toContainText('True')
})
