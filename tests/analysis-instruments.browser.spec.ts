import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openLesson(page: Page, id: string) {
  const { levels } = await (await page.request.get('/api/levels')).json() as Catalog
  const level = levels.find(entry => entry.id === id)
  if (!level?.unit) throw new Error('Missing lesson ' + id)
  await page.goto('/')
  await page.locator(`[data-unit="${level.unit.id}"]`).click()
  await page.locator('.mission-list button').filter({ has: page.getByText(level.title.zh, { exact: true }) }).click()
}

async function liveModel(page: Page, id: string) {
  const model = page.locator(`[data-teaching-model="${id}"]`)
  await model.scrollIntoViewIfNeeded()
  await expect(model).toHaveAttribute('data-renderer', 'webgl', { timeout: 20000 })
  return model
}

// Find the calibration tile in the pixels a learner actually sees. Its position
// in the camera changes with the viewport and the selected swatch's elevation.
async function tapRedOrigin(canvas: Locator) {
  const png = (await canvas.screenshot()).toString('base64')
  const position = await canvas.evaluate(async (element, png) => {
    const image = new Image()
    image.src = 'data:image/png;base64,' + png
    await image.decode()
    const surface = document.createElement('canvas')
    surface.width = image.width
    surface.height = image.height
    const context = surface.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    let x = 0, y = 0, count = 0
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 240) > 2 || Math.abs(data[i + 1] - 30) > 2 || Math.abs(data[i + 2] - 20) > 2) continue
      x += (i / 4) % image.width
      y += Math.floor(i / 4 / image.width)
      count++
    }
    if (!count) throw new Error('The 3D mosaic has no tile with the origin’s RGB')
    return { x: x / count * element.clientWidth / image.width, y: y / count * element.clientHeight / image.height }
  }, png)
  await canvas.click({ position })
}

test('selecting a real RGB tile in top view updates the OpenCV sample and completes the exercise', async ({ page }) => {
  test.slow()
  await openLesson(page, 'opencv-first-pixel')
  const model = await liveModel(page, 'pixel-sampler')
  await model.getByRole('button', { name: '俯视' }).click()
  await tapRedOrigin(model.locator('canvas'))
  await expect(page.getByRole('button', { name: '像素 (0, 0)', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.vision-pixels .vision-metrics dd')).toHaveText(['(0, 0)', '240', '30', '20'])
  await expect(model.locator('.teaching-model-labels span').filter({ hasText: /^[RGB] / })).toHaveText(['R 240', 'G 30', 'B 20'])
  await page.getByRole('button', { name: '运行实验', exact: true }).click()
  await expect(page.getByTestId('vision-feedback')).toContainText('当前图像通过。')
})

test('a new NumPy slice raises its new element only after rerunning the changed stop value', async ({ page }) => {
  test.slow()
  await openLesson(page, 'numpy-slicing-demo')
  const run = page.getByRole('button', { name: '运行实验', exact: true })
  await run.click()
  const model = await liveModel(page, 'numpy-array')
  await expect(page.getByTestId('data-output').locator('tbody tr')).toHaveCount(3)
  async function relativeHeight() {
    return model.evaluate(figure => {
      const labels = [...figure.querySelectorAll('.teaching-model-labels span')]
      const at = (i: number) => labels.find(label => label.textContent?.startsWith('[' + i + '] '))!.getBoundingClientRect().top
      return at(3) - at(4)
    })
  }
  const initial = await relativeHeight()
  await page.getByTestId('data-controls').locator('[data-parameter="stop"]').fill('4')
  await expect(model).toHaveCount(0)
  await expect(page.getByTestId('data-output')).toHaveCount(0)
  await run.click()
  await liveModel(page, 'numpy-array')
  await expect(page.getByTestId('data-output').locator('tbody tr').last().locator('td')).toHaveText(['3', '22'])
  await expect(model.getByText('[3] 22', { exact: true })).toBeVisible()
  await expect.poll(relativeHeight).toBeLessThan(initial - 3)
})

test('mobile can finish the pixel task with the same controls after loss of its 3D context', async ({ page }) => {
  test.slow()
  await openLesson(page, 'opencv-first-pixel')
  await page.setViewportSize({ width: 390, height: 844 })
  const model = await liveModel(page, 'pixel-sampler')
  await model.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const ext = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!ext) throw new Error('Missing WebGL context loss support')
    ext.loseContext()
  })
  await expect(model).toHaveAttribute('data-renderer', 'fallback')
  await expect(model).toBeHidden()
  await page.getByRole('button', { name: '像素 (0, 0)', exact: true }).click()
  await page.getByRole('button', { name: '运行实验', exact: true }).click()
  await expect(page.getByTestId('vision-feedback')).toContainText('当前图像通过。')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('SQL group column labels and totals match the actual output rows', async ({ page }) => {
  await openLesson(page, 'database-grouped-query-demo')
  await page.getByRole('button', { name: '运行实验', exact: true }).click()
  const model = await liveModel(page, 'group-totals')
  const table = page.getByTestId('data-output')
  const pairs = await table.locator('tbody tr').evaluateAll(rows => rows.flatMap(row => {
    const [name, value] = Array.from(row.querySelectorAll('td'), cell => cell.textContent)
    return [value, name]
  }))
  await expect(model.locator('.teaching-model-labels span')).toHaveText(pairs.map(String))
})
