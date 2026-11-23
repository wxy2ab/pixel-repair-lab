import { expect, test, type Locator } from '@playwright/test'
import type { Catalog } from '../src/shared/types'
import { finishProgramBasics } from './helpers/programGuide'

test.use({
  viewport: { width: 1366, height: 900 },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
})

async function readyScene(hub: Locator) {
  const canvas = hub.locator('canvas')
  await canvas.scrollIntoViewIfNeeded()
  await expect(hub).toHaveAttribute('data-ready', 'true', { timeout: 20000 })
  expect(await canvas.evaluate((surface: HTMLCanvasElement) => {
    const gl = surface.getContext('webgl2')
    return Boolean(gl && !gl.isContextLost() && gl.drawingBufferWidth > 0)
  })).toBe(true)
  return canvas
}

async function tapAt(canvas: Locator, x: number, y: number) {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('The workshop canvas must be visible')
  await canvas.click({ position: { x: box.width * x, y: box.height * y } })
}

test('Sprout and the hangar are pickable in the 3D workshop and the hangar opens its displayed match', async ({ page }) => {
  test.slow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const home = page.getByTestId('workshop-hub-learning')
  const canvas = await readyScene(home)
  const original = await canvas.screenshot()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Missing hub viewport')
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .52)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .55, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => !(await canvas.screenshot()).equals(original)).toBe(true)
  await home.getByRole('button', { name: '复位场景视角' }).click()

  // Tap the visor and the illuminated charging cylinder in the restored front view.
  await tapAt(canvas, .43, .61)
  await expect(home.getByRole('status')).toContainText('芽芽：一起给电池补电吧！')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await tapAt(canvas, .78, .38)
  const hangar = page.getByTestId('workshop-hub-arena')
  await expect(hangar).toBeInViewport()
  await readyScene(hangar)
  await hangar.getByRole('button', { name: '招呼对手' }).click()
  await expect(hangar.getByRole('status')).toContainText('对手：赛道上见！')
  const advertisedMatch = await hangar.locator('.workshop-intro-next strong').innerText()
  await hangar.getByRole('button', { name: '上场挑战' }).click()
  await expect(page.getByRole('heading', { level: 1, name: advertisedMatch, exact: true })).toBeVisible()
  await expect(page.getByTestId('arena-turn')).toContainText('回合 0/')
  const follow = page.getByRole('button', { name: '跟随芽芽' })
  await follow.click()
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('arena-turn')).toContainText('回合 0/')
})

test('Sprout can walk across the room before the learning terminal resumes the recommended lesson', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const second = levels.find(level => level.id === 'python-program-interfaces')
  if (!second) throw new Error('Missing second introductory Python lesson')
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:completed', JSON.stringify(['python-program-basics'])))
  await page.goto('/')
  const home = page.getByTestId('workshop-hub-learning')
  const canvas = await readyScene(home)
  await expect(home.locator('.workshop-intro-next')).toContainText(second.title.zh)
  await expect(page.getByTestId('roadmap-recommendation')).toContainText(second.title.zh)
  // Walk onto the clear floor at the left, then greet the robot at its new location.
  const beforeWalk = await canvas.screenshot()
  await tapAt(canvas, .2494, .8804)
  await expect.poll(async () => !(await canvas.screenshot()).equals(beforeWalk)).toBe(true)
  await tapAt(canvas, .23, .58)
  await expect(home.getByRole('status')).toContainText('芽芽：一起给电池补电吧！')
  await tapAt(canvas, .31, .28)
  await expect(page.getByRole('heading', { level: 1, name: second.title.zh, exact: true })).toBeVisible()
})

test('a phone without WebGL can greet, visit the hangar, and start a lesson in English', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
        if (/webgl/.test(kind)) { this.dataset.deniedWebgl = 'true'; return null }
        return Reflect.apply(original, this, [kind, ...args])
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  const home = page.getByTestId('workshop-hub-learning')
  await home.locator('canvas').scrollIntoViewIfNeeded()
  await expect(home.locator('canvas')).toHaveAttribute('data-denied-webgl', 'true')
  await expect(home).toHaveAttribute('data-ready', 'false')
  const first = await home.locator('.workshop-intro-next strong').innerText()
  await home.getByRole('button', { name: 'Greet Sprout' }).click()
  await expect(home.getByRole('status')).toContainText('Sprout: Let’s charge some batteries!')
  await home.getByRole('button', { name: 'Visit the arena hangar' }).click()
  const hangar = page.getByTestId('workshop-hub-arena')
  await expect(hangar).toBeInViewport()
  await expect(hangar.locator('canvas')).toHaveAttribute('data-denied-webgl', 'true')
  await expect(hangar).toHaveAttribute('data-ready', 'false')
  await hangar.getByRole('button', { name: 'Visit the learning bench' }).click()
  await expect(page.getByRole('heading', { level: 1, name: first, exact: true })).toBeVisible()
})

test('the classroom terminal celebrates completion of the real lesson activity', async ({ page, request }) => {
  test.slow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const lesson = levels.find(level => level.id === 'python-program-basics')
  if (lesson?.kind !== 'lecture') throw new Error('Missing introductory program activity')
  await page.goto('/')
  await page.getByTestId('workshop-hub-learning').getByRole('button', { name: '前往学习工作台' }).click()
  const terminal = page.locator('.lesson-workbench[data-activity="coding"]')
  await readyScene(terminal)
  const scene = terminal.locator('canvas')
  const sample = terminal.getByRole('button', { name: '换一块电池', exact: true })
  await sample.focus()
  await page.keyboard.press('Tab')
  await expect(terminal.getByRole('button', { name: '调整补电量', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(terminal.getByRole('button', { name: '给电池补电', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(terminal.locator('[data-room-status]')).toContainText('2 + 3 = 5')
  await expect(terminal).toHaveAttribute('data-ran', 'true')
  await expect(terminal).toHaveAttribute('data-completed', 'false')
  const beforeCompletion = await scene.screenshot()
  await finishProgramBasics(page)
  await page.getByRole('button', { name: lesson.question.options[lesson.question.correct].zh, exact: true }).click()
  await expect(terminal).toHaveAttribute('data-completed', 'true')
  await expect(terminal).toHaveAccessibleName(/任务已完成/)
  await expect.poll(async () => !(await scene.screenshot()).equals(beforeCompletion)).toBe(true)
})
