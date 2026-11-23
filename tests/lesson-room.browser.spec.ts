import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

test.use({ hasTouch: true, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

function disableWebGL(page: Page) {
  return page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (/webgl/.test(kind)) {
          this.dataset.webglUnavailable = 'true'
          return null
        }
        return Reflect.apply(original, this, [kind, ...args])
      },
    })
  })
}

async function expectPoster(room: Locator) {
  await expect(room).toHaveAttribute('data-renderer', 'poster')
  const image = room.locator('img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
}

type RoomTarget = 'sample' | 'setting' | 'run'

function control(room: Locator, target: RoomTarget) {
  return room.locator(`button[data-room-target="${target}"]`)
}

async function equipmentPoint(room: Locator, target: RoomTarget) {
  const button = control(room, target)
  await expect(button).toHaveAttribute('data-anchor-x', /.+/)
  const [x, y] = await button.evaluate(node =>
    [node.getAttribute('data-anchor-x'), node.getAttribute('data-anchor-y')].map(Number))
  const canvas = room.locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The workbench canvas must be visible')
  return { x: box.x + box.width * x, y: box.y + box.height * y }
}

async function clickEquipment(page: Page, room: Locator, target: RoomTarget) {
  const point = await equipmentPoint(room, target)
  await page.mouse.click(point.x, point.y)
}

test('the live workshop surrounds a working charger and survives context loss mid-lesson', async ({ page }) => {
  test.slow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: '开始 Python 课程', exact: true }).click()
  const room = page.locator('.classroom-workspace[data-family="coding"] .lesson-room-layer')
  const canvas = room.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  await expect(room).toHaveAttribute('data-renderer', 'webgl', { timeout: 20000 })
  expect(await canvas.evaluate((surface: HTMLCanvasElement) => {
    const context = surface.getContext('webgl2')
    return Boolean(context && !context.isContextLost() && context.drawingBufferWidth && context.drawingBufferHeight)
  })).toBe(true)

  const status = room.locator('[data-room-status]')
  await expect(status).toBeEmpty()
  await expect(room).not.toContainText(/[\p{L}\p{N}]/u)
  await expect(control(room, 'sample')).toHaveAccessibleName('换一块电池')
  await expect(control(room, 'setting')).toHaveAccessibleName('调整补电量')
  await expect(control(room, 'run')).toHaveAccessibleName('给电池补电')
  await expect(room.locator('[data-room-reset]')).toBeHidden()
  await clickEquipment(page, room, 'run')
  await expect(status).toContainText('2 + 3 = 5')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  // A screen reader can announce the result while the model shows it on the equipment.
  const feedbackBox = await status.boundingBox()
  expect(feedbackBox?.width).toBeLessThanOrEqual(2)
  expect(feedbackBox?.height).toBeLessThanOrEqual(2)
  await clickEquipment(page, room, 'sample')
  await expect(room).toHaveAttribute('data-sample', '1')
  await clickEquipment(page, room, 'setting')
  await expect(room).toHaveAttribute('data-setting', '1')
  const sample = await equipmentPoint(room, 'sample')
  const device = await equipmentPoint(room, 'run')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The workbench canvas must be visible')
  await page.mouse.move(sample.x, sample.y)
  await page.mouse.down()
  await page.mouse.move(box.x + 8, box.y + 8, { steps: 6 })
  await page.mouse.up()
  await expect(room).toHaveAttribute('data-sample', '1')
  await expect(room).toHaveAttribute('data-ran', 'false')
  await page.mouse.move(sample.x, sample.y)
  await page.mouse.down()
  await page.mouse.move(device.x, device.y, { steps: 12 })
  await page.mouse.up()
  await expect(status).toContainText('5 + 1 = 6')
  await expect(room).toHaveAttribute('data-ran', 'true')
  await expect(room).toHaveAttribute('data-completed', 'false')
  const reading = await status.innerText()
  const charger = page.getByRole('region', { name: '维修站补电机', exact: true })
  await charger.locator('[data-basic-case="1"]').click()
  await charger.getByRole('button', { name: '按规则处理' }).click()
  await expect(charger.getByTestId('program-basic-process')).toHaveAttribute('aria-current', 'step')
  await canvas.evaluate((surface: HTMLCanvasElement) => {
    const extension = surface.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('SwiftShader must support WebGL context loss')
    extension.loseContext()
  })
  await expectPoster(room)
  await expect(status).toHaveText(reading)
  await control(room, 'setting').press('Enter')
  await expect(room).toHaveAttribute('data-ran', 'false')
  await expect(status).not.toContainText('5 + 1 = 6')
  await room.locator('[data-room-reset]').click()
  await expect(status).toBeEmpty()
  await expect(room.locator('[data-room-reset]')).toBeHidden()
  await expect(room).toHaveAttribute('data-sample', '0')
  await expect(room).toHaveAttribute('data-setting', '0')
  await control(room, 'run').press('Space')
  await expect(status).toContainText('2 + 3 = 5')
  await charger.getByRole('button', { name: '查看输出' }).click()
  await expect(charger.getByTestId('program-basic-result')).toHaveText('4')
  await expect(page.getByRole('region', { name: /操作台.*补电记录/ })).toContainText('输入 1 → 输出 4')
})

test('a phone without WebGL can operate the charger and read its log in English', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await disableWebGL(page)
  await page.goto('/')
  await page.getByRole('button', { name: '开始 Python 课程', exact: true }).click()
  const room = page.locator('.lesson-room-layer')
  await room.scrollIntoViewIfNeeded()
  await expect(room.locator('canvas')).toHaveAttribute('data-webgl-unavailable', 'true')
  await expectPoster(room)
  await expect(room).not.toContainText(/[\p{L}\p{N}]/u)
  const initial = await control(room, 'run').screenshot()
  await control(room, 'sample').tap()
  await control(room, 'setting').tap()
  await control(room, 'run').tap()
  await expect(room.locator('[data-room-status]')).toContainText('5 + 1 = 6')
  await expect.poll(async () => !(await control(room, 'run').screenshot()).equals(initial)).toBe(true)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(control(room, 'sample')).toHaveAccessibleName('Change battery')
  await expect(control(room, 'setting')).toHaveAccessibleName('Change charge amount')
  await expect(control(room, 'run')).toHaveAccessibleName('Charge battery')
  await expect(control(room, 'run')).toHaveAccessibleDescription('6 bars')
  await expect(room.locator('[data-room-status]')).toContainText('5 + 1 = 6')
  await expect(room.locator('[data-room-status]')).not.toHaveText(/[\u3400-\u9fff]/)
  await room.locator('[data-room-reset]').tap()
  await expect(room).toHaveAttribute('data-ran', 'false')
  const charger = page.getByRole('region', { name: 'Workshop battery charger', exact: true })
  await charger.getByRole('button', { name: 'Apply the rule' }).click()
  await charger.getByRole('button', { name: 'Show the output' }).click()
  await expect(page.getByRole('region', { name: /Control desk.*Charge log/ })).toContainText('Input 6 → Output 9')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('a child can tap the LED, polarity selector and switch directly on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.locator('[data-unit="digital-circuits"]').tap()
  const room = page.locator('.lesson-room-layer')
  const status = room.locator('[data-room-status]')
  const tapModel = async (target: RoomTarget) => {
    await room.locator('canvas').scrollIntoViewIfNeeded()
    const point = await equipmentPoint(room, target)
    await page.touchscreen.tap(point.x, point.y)
  }
  await room.locator('canvas').scrollIntoViewIfNeeded()
  await expect(room).toHaveAttribute('data-renderer', 'webgl', { timeout: 20000 })
  await tapModel('run')
  await expect(control(room, 'run')).toHaveAccessibleDescription('亮')
  await tapModel('setting')
  await expect(room).toHaveAttribute('data-ran', 'false')
  await tapModel('run')
  await expect(control(room, 'run')).toHaveAccessibleDescription('灭')
  await expect(status).toContainText('接反')
  await tapModel('sample')
  await tapModel('run')
  await expect(status).toContainText('开关断开')
})

test('subjects use their own workshop across lesson stages and leave the standalone arena available', async ({ page, request }) => {
  test.slow()
  await disableWebGL(page)
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  await page.goto('/')
  for (const [id, family] of [
    ['selection-sort-notes', 'algorithms'],
    ['cpu-registers-demo', 'systems'],
    ['dc-binary-address', 'electronics'],
    ['database-warm-area-query-challenge', 'data'],
    ['opencv-first-pixel', 'vision'],
    ['ai-review-demo', 'ai'],
  ]) {
    await test.step(id, async () => {
      const level = levels.find(candidate => candidate.id === id)
      if (!level?.unit) throw new Error('Missing lesson ' + id)
      await page.locator('[data-unit="' + level.unit.id + '"]').click()
      await page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) }).click()
      await expect(page.getByRole('heading', { name: level.title.zh, exact: true, level: 1 })).toBeVisible()
      const room = page.locator('.classroom-workspace[data-family="' + family + '"] .lesson-room-layer')
      await expect(room).toBeVisible()
      await expectPoster(room)
      const status = room.locator('[data-room-status]')
      const initial = await status.innerText()
      await control(room, 'sample').click()
      await expect(room).toHaveAttribute('data-sample', '1')
      await control(room, 'setting').click()
      await expect(room).toHaveAttribute('data-setting', '1')
      await control(room, 'run').click()
      await expect(room).toHaveAttribute('data-ran', 'true')
      await expect(status).not.toHaveText(initial)
      await expect(room).toHaveAttribute('data-completed', 'false')
      await room.locator('[data-room-reset]').click()
      await expect(status).toHaveText(initial)
      await page.getByRole('button', { name: '学习模块', exact: true }).click()
    })
  }
  await page.locator('[data-challenge-level="limited-battery-salvage"]').click()
  await expect(page.getByTestId('grid-turn-budget')).toBeVisible()
  await expect(page.locator('.lesson-room-layer')).toHaveCount(0)
})

test('opening related modules loads the correct experiment for their shared 3D room', async ({ page }) => {
  await disableWebGL(page)
  await page.goto('/')
  for (const [unit, operation, result] of [
    ['numpy', '逐个相加', '[2, 8, 5] + 1 → [3, 9, 6]'],
    ['database', '查询电池', 'B=8 · C=5'],
    ['opencv', '生成黑白图', '变成白色的格子 · C'],
    ['yolox', '筛选检测框', '保留的检测框 · B · C'],
  ]) {
    await page.locator(`[data-unit="${unit}"]`).click()
    const room = page.locator('.lesson-room-layer')
    await expect(room).toHaveAttribute('data-ran', 'false')
    const run = control(room, 'run')
    await expect(run).toHaveAccessibleName(operation)
    await run.click()
    await expect(room.locator('[data-room-status]')).toContainText(result)
    await page.getByRole('button', { name: '学习模块', exact: true }).click()
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pixel-repair-lab:completed') ?? '[]'))).toEqual([])
})
