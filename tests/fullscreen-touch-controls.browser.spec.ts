import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test'

test.use({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
})

async function openLevel(page: Page, levelId: string, view: '2d' | '3d') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(view => {
    localStorage.setItem('pixel-repair-lab:board-view', view)
    if (view === '2d') Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Unavailable', 'NotAllowedError'))
  }, view)
  await page.goto('/#challenge-browse')
  await page.locator(`[data-challenge-level="${levelId}"]`).tap()
  await page.getByRole('button', { name: '全屏地图', exact: true }).tap()
  return page.getByRole('dialog')
}

async function gestureOrigin(surface: Locator) {
  return surface.evaluate(node => {
    const rect = node.getBoundingClientRect()
    const x = Math.round(rect.left + rect.width * .35)
    const y = Math.round(rect.top + rect.height / 2)
    if (!node.contains(document.elementFromPoint(x, y))) throw new Error('The touch point is outside the playable surface')
    return { x, y }
  })
}

type Point = { x: number; y: number }

async function swipe(touch: CDPSession, from: Point, dx: number, dy: number, cancel = false) {
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] })
  for (const fraction of [.3, .6, 1]) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: from.x + dx * fraction, y: from.y + dy * fraction, id: 1 }] })
  }
  await touch.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
}

for (const view of ['2d', '3d'] as const) {
  test(`fullscreen ${view} switches the same finger drag from moving the map to walking and pushing`, async ({ page }) => {
    test.slow()
    const board = await openLevel(page, 'challenge-sokoban-lift-delivery', view)
    const touch = await page.context().newCDPSession(page)
    const surface = view === '2d' ? board.locator('.station-flat-board:visible') : board.getByTestId('station-3d-canvas')
    if (view === '3d') await expect(board.locator('.station-viewport')).toHaveAttribute('data-ready', 'true')
    const controls = board.getByRole('group', { name: '触控操作', exact: true })
    const map = controls.getByRole('button', { name: '操作地图', exact: true })
    const player = controls.getByRole('button', { name: '移动芽芽', exact: true })
    const readout = board.getByTestId('warehouse-readout')
    const camera = () => view === '3d' ? surface.getAttribute('data-camera-center')
      : surface.locator('.map-well').evaluate(grid => getComputedStyle(grid).transform)
    await expect(map).toHaveAttribute('aria-pressed', 'true')
    await board.getByRole('button', { name: '拉近', exact: true }).tap()
    const from = await gestureOrigin(surface)
    const initialCamera = await camera()

    await swipe(touch, from, 70, 0)
    await expect.poll(camera).not.toBe(initialCamera)
    await expect(readout).toContainText('步数 0')
    if (view === '3d') {
      const rotate = board.getByRole('button', { name: '向右旋转', exact: true })
      for (let i = 0; i < 3; i++) await rotate.tap()
    }
    await player.tap()
    await expect(player).toHaveAttribute('aria-pressed', 'true')
    const playerCamera = await camera()
    // At a quarter turn, the next cell to the east projects down the screen.
    if (view === '3d') await swipe(touch, from, 0, 70)
    else await swipe(touch, from, 70, 0)
    await expect(readout).toContainText('步数 1')
    if (view === '3d') await swipe(touch, from, 75, 0)
    else await swipe(touch, from, 0, -75)
    await expect(readout).toContainText('步数 2')
    await expect(readout).toContainText('推箱 1')
    expect(await camera()).toBe(playerCamera)

    await map.tap()
    await expect(map).toHaveAttribute('aria-pressed', 'true')
    await swipe(touch, await gestureOrigin(surface), -70, 0)
    await expect.poll(camera).not.toBe(playerCamera)
    await expect(readout).toContainText('步数 2')
    await touch.detach()
  })
}

test('short, cancelled and multi-finger gestures in character mode leave the warehouse untouched', async ({ page }) => {
  const board = await openLevel(page, 'challenge-sokoban-lift-delivery', '2d')
  const controls = board.getByRole('group', { name: '触控操作', exact: true })
  await controls.getByRole('button', { name: '移动芽芽', exact: true }).tap()
  const from = await gestureOrigin(board.locator('.station-flat-board:visible'))
  const touch = await page.context().newCDPSession(page)
  await swipe(touch, from, 3, 0)
  await swipe(touch, from, 70, 0, true)
  const first = { ...from, id: 1 }
  const second = { x: from.x + 20, y: from.y + 25, id: 2 }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove',
    touchPoints: [{ ...first, x: first.x + 65 }, { ...second, x: second.x + 65 }] })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(board.getByTestId('warehouse-readout')).toContainText('步数 0')
  await swipe(touch, from, 70, 0)
  await expect(board.getByTestId('warehouse-readout')).toContainText('步数 1')
  await page.setViewportSize({ width: 844, height: 390 })
  for (const button of [controls.getByRole('button', { name: '操作地图' }), controls.getByRole('button', { name: '移动芽芽' }),
    board.locator('[data-push-direction="up"]'), board.getByRole('button', { name: '退出全屏' })]) {
    await expect(button).toBeInViewport({ ratio: 1 })
    await button.tap({ trial: true })
  }
  await touch.detach()
})

test('swipes can inspect another arena map without taking a turn', async ({ page }) => {
  const board = await openLevel(page, 'challenge-freight-carousel', '2d')
  const controls = board.getByRole('group', { name: '触控操作', exact: true })
  await controls.getByRole('button', { name: '移动芽芽' }).tap()
  await board.getByRole('button', { name: '退出全屏', exact: true }).tap()
  const workspace = page.getByTestId('arena-map-workspace')
  await workspace.getByRole('button', { name: '地图 2', exact: true }).tap()
  await workspace.getByRole('button', { name: '全屏地图', exact: true }).tap()
  await expect(controls.getByRole('button', { name: '操作地图' })).toHaveAttribute('aria-pressed', 'true')
  await expect(controls.getByRole('button', { name: '移动芽芽' })).toBeDisabled()
  const touch = await page.context().newCDPSession(page)
  const surface = board.locator('.station-flat-board:visible')
  const position = await board.locator('.tilemap').getAttribute('aria-label')
  await swipe(touch, await gestureOrigin(surface), 70, 0)
  await expect(board.locator('.tilemap')).toHaveAttribute('aria-label', position!)
  await expect(board.getByTestId('arena-turn')).toContainText('回合 0/')
  await touch.detach()
})

test('swipes can play a practice duel without resuming a paused match or earning a Python clear', async ({ page }) => {
  const level = 'challenge-brass-bell-lane'
  const board = await openLevel(page, level, '2d')
  const controls = board.getByRole('group', { name: '触控操作', exact: true })
  const player = controls.getByRole('button', { name: '移动芽芽', exact: true })
  await player.tap()
  await expect(player).toHaveAttribute('aria-pressed', 'true')
  const touch = await page.context().newCDPSession(page)
  const from = await gestureOrigin(board.locator('.station-flat-board:visible'))
  const turn = board.getByTestId('arena-turn')
  const toolbar = board.getByTestId('play-toolbar')
  await swipe(touch, from, 70, 0)
  await expect(board.locator('.tilemap')).toHaveAttribute('aria-label', '机器人位于 2，3')
  await toolbar.getByRole('button', { name: '暂停对局', exact: true }).tap()
  const resume = toolbar.getByRole('button', { name: '继续对局', exact: true })
  await expect(resume).toBeEnabled()
  const pausedTurn = await turn.innerText()
  await swipe(touch, from, -70, 0)
  await expect(resume).toBeEnabled()
  await expect(turn).toHaveText(pausedTurn)
  await resume.tap()
  await toolbar.locator('[data-arena-action="pick"]').tap()
  await expect(board.locator('[data-robot-id="player"]')).toContainText('强化 +1')
  await swipe(touch, from, 70, 0)
  await expect(board.locator('.tilemap')).toHaveAttribute('aria-label', '机器人位于 3，3')
  await toolbar.locator('[data-arena-action="shoot-right"]').tap()
  await expect(board.getByText(/练习结束/).first()).toBeAttached()
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('pixel-repair-lab:completed') ?? '[]').includes(id), level)).toBe(false)
  await touch.detach()
})
