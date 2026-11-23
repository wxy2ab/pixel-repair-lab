import { expect, test, type Page } from '@playwright/test'
import type { VisionRequest, VisionResult } from '../src/shared/vision'

function mission(page: Page, name: string) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(name, { exact: true }) })
}

function runButton(page: Page) {
  return page.getByRole('button', { name: '运行实验', exact: true })
}

async function openMission(page: Page, name: string) {
  await page.goto('/#track-vision')
  await page.locator('[data-unit="yolox"]').click()
  await mission(page, name).click()
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()
}

async function runExperiment(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.url().endsWith('/api/labs/vision') && candidate.request().method() === 'POST'),
    runButton(page).click(),
  ])
  expect(response.ok()).toBe(true)
  const { result } = await response.json() as { result: VisionResult }
  return { request: response.request().postDataJSON() as VisionRequest, result }
}

test('YOLOX changes the retained box with the confidence cutoff and preserves the source image', async ({ page }) => {
  const name = '让低分候选框消失'
  await openMission(page, name)
  const detection = page.getByTestId('vision-detection')
  const picture = page.getByTestId('vision-processed')
  await expect(detection.getByRole('row', { name: /狗.*%/ })).toBeVisible()
  await expect(picture.locator('.vision-detection-box')).toHaveCount(1)

  const low = await runExperiment(page)
  expect(low.request.params).toEqual({ confidence: 50, target: 'all' })
  expect(low.result.frames[0].detections.map(item => item.label)).toEqual(['dog'])
  await expect(page.getByTestId('vision-feedback')).toContainText('结果和目标还有差异')
  await expect(mission(page, name).locator('.mission-check')).toHaveCount(0)

  await page.locator('[data-parameter="confidence"]').fill('95')
  const high = await runExperiment(page)
  expect(high.request.params).toEqual({ confidence: 95, target: 'all' })
  expect(high.result.frames[0].detections).toEqual([])
  expect(high.result.frames[0].processed).toBe(low.result.frames[0].processed)
  await expect(picture.locator('.vision-detection-box')).toHaveCount(0)
  await expect(detection).toContainText('当前设置下没有保留检测框。')
  await expect(page.getByTestId('vision-feedback')).toHaveText('当前图像通过。')
  await expect(mission(page, name).locator('.mission-check')).toBeVisible()
})

test('a mouse-drawn annotation matches a native YOLOX box and records the overlap exercise', async ({ page }) => {
  const name = '把狗的边界框缩小'
  await openMission(page, name)
  await expect(page.getByTestId('vision-iou')).toBeVisible()
  const initial = await runExperiment(page)
  const [source] = initial.result.frames
  const reference = source.detections.find(item => item.label === 'dog')
  if (!reference || !source.iou) throw new Error('The native detector returned no dog box or initial overlap')
  expect(source.iou).toBeLessThan(0.82)
  await expect(page.getByTestId('vision-feedback')).toContainText('结果和目标还有差异')
  await expect(mission(page, name).locator('.mission-check')).toHaveCount(0)

  const picture = page.getByTestId('vision-processed')
  await picture.scrollIntoViewIfNeeded()
  const bounds = await picture.boundingBox()
  if (!bounds) throw new Error('The vision workspace did not show the photo')
  const [x, y, width, height] = reference.box
  const point = (px: number, py: number) => [bounds.x + px / source.width * bounds.width, bounds.y + py / source.height * bounds.height] as const
  await page.mouse.move(...point(x, y))
  await page.mouse.down()
  await page.mouse.move(...point(x + width, y + height), { steps: 6 })
  await page.mouse.up()

  const improved = await runExperiment(page)
  expect(improved.request.params).not.toEqual(initial.request.params)
  expect(improved.result.frames[0].iou).toBeGreaterThan(0.90)
  await expect(picture.locator('.vision-drawn-box')).toBeVisible()
  await expect(page.getByTestId('vision-iou')).toContainText('%')
  await expect(page.getByTestId('vision-feedback')).toHaveText('当前图像通过。')
  await expect(mission(page, name).locator('.mission-check')).toBeVisible()
})
