import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openLevel(page: Page, levelId: string, view: '2d' | '3d' = '2d') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(view => localStorage.setItem('pixel-repair-lab:board-view', view), view)
  await page.goto('/#challenge-browse')
  await page.getByRole('region', { name: '自由选关', exact: true }).locator(`[data-challenge-level="${levelId}"]`).click()
  await expect(page.getByTestId('station-minimap')).toHaveCount(0)
}

async function enterMap(page: Page) {
  await page.getByRole('button', { name: '全屏地图', exact: true }).click()
  const surface = page.getByTestId('minimap-surface')
  await expect(surface).toBeVisible()
  return surface
}

function markerAt(page: Page, kind: 'player' | 'rival' | 'target', x: number, y: number) {
  return page.getByTestId('station-minimap').locator(`[data-minimap-marker="${kind}"][data-x="${x}"][data-y="${y}"]`)
}

async function screenPointForCell(surface: Locator, x: number, y: number) {
  return surface.evaluate((node, [x, y]) => {
    const svg = node as SVGSVGElement
    const matrix = svg.getScreenCTM()
    if (!matrix) throw new Error('Minimap has no screen transform')
    const point = new DOMPoint(x + .5, y + .5).matrixTransform(matrix)
    return { x: point.x, y: point.y }
  }, [x, y])
}

async function expectFlatCenter(page: Page, x: number, y: number) {
  await expect.poll(() => page.locator(`.tile[data-x="${x}"][data-y="${y}"]`).evaluate(tile => {
    const cell = tile.getBoundingClientRect()
    const surface = tile.closest('.station-flat-board')!.getBoundingClientRect()
    return Math.max(Math.abs(cell.left + cell.width / 2 - surface.left - surface.width / 2) / cell.width,
      Math.abs(cell.top + cell.height / 2 - surface.top - surface.height / 2) / cell.height)
  })).toBeLessThan(.15)
}

test('the flat minimap shows live positions, follows a flying parcel and recenters on the current player', async ({ page }) => {
  await openLevel(page, 'challenge-kite-mail-scramble')
  const program = [...Array<string>(6).fill('move("up")'), 'pick()', ...Array<string>(3).fill('guard()')].join('\n')
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(program)
  const minimap = await enterMap(page)
  await expect(markerAt(page, 'player', 1, 9)).toHaveCount(1)
  await expect(markerAt(page, 'rival', 12, 7)).toHaveCount(1)
  await expect(markerAt(page, 'target', 1, 3)).toHaveCount(1)
  await expect(markerAt(page, 'target', 15, 2)).toHaveCount(1)
  const step = page.getByTestId('play-toolbar').getByRole('button', { name: '单步执行' })
  for (let turn = 1; turn <= 10; turn++) {
    await step.click()
    await expect(page.getByTestId('arena-turn')).toHaveText(`回合 ${turn}/48`)
  }
  await expect(markerAt(page, 'player', 1, 3)).toHaveCount(1)
  await expect(markerAt(page, 'rival', 5, 4)).toHaveCount(1)
  await expect(markerAt(page, 'target', 1, 3)).toHaveCount(0)
  await expect(markerAt(page, 'target', 14, 6)).toHaveCount(1)
  await expect(markerAt(page, 'target', 15, 2)).toHaveCount(0)

  const footprint = page.getByTestId('minimap-footprint')
  await expect(footprint).toHaveAttribute('points', /\d/)
  const fit = await footprint.getAttribute('points')
  const board = page.locator('.station-flat-board:visible')
  await board.focus()
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await expect(footprint).not.toHaveAttribute('points', fit!)
  const zoomed = await footprint.getAttribute('points')
  await page.keyboard.press('a')
  await expect(footprint).not.toHaveAttribute('points', zoomed!)
  const tileWidth = (await page.locator('.tile').first().boundingBox())!.width
  const point = await screenPointForCell(minimap, 11, 4)
  await page.mouse.click(point.x, point.y)
  await expectFlatCenter(page, 11, 4)
  const visible = await board.evaluate(surface => {
    const grid = surface.querySelector('.tilemap')!.getBoundingClientRect()
    const crop = surface.getBoundingClientRect()
    return [
      Math.max(0, (crop.left - grid.left) * 18 / grid.width),
      Math.max(0, (crop.top - grid.top) * 12 / grid.height),
      Math.min(18, (crop.right - grid.left) * 18 / grid.width),
      Math.min(12, (crop.bottom - grid.top) * 12 / grid.height),
    ]
  })
  const outline = await footprint.evaluate(node => {
    const points = Array.from((node as SVGPolygonElement).points)
    const xs = points.map(point => point.x), ys = points.map(point => point.y)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  })
  outline.forEach((edge, index) => expect(Math.abs(edge - visible[index])).toBeLessThan(.12))
  await page.getByRole('button', { name: '收起小地图' }).click()
  await expect(minimap).toBeHidden()
  await page.getByRole('button', { name: '回到芽芽', exact: true }).click()
  await expectFlatCenter(page, 1, 3)
  expect((await page.locator('.tile').first().boundingBox())!.width).toBeCloseTo(tileWidth, 1)
  await page.getByRole('button', { name: '展开小地图' }).click()
  await expect(markerAt(page, 'player', 1, 3)).toHaveCount(1)
  await expect(page.getByTestId('arena-turn')).toHaveText('回合 10/48')
})

test('the 3D minimap reflects the lens and rotation and aims at the selected map cell', async ({ page }) => {
  test.slow()
  await openLevel(page, 'challenge-tidal-boardwalk-sprint', '3d')
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill('move("right")\nguard()')
  const minimap = await enterMap(page)
  const canvas = page.getByTestId('station-3d-canvas')
  await expect(page.locator('.station-viewport')).toHaveAttribute('data-ready', 'true', { timeout: 20000 })
  await expect(markerAt(page, 'target', 16, 2)).toHaveCount(1)
  const footprint = page.getByTestId('minimap-footprint')
  await expect(footprint).toHaveAttribute('points', /\d/)
  const fit = await footprint.getAttribute('points')
  await page.getByRole('button', { name: '跟随芽芽', exact: true }).click()
  await expect(footprint).not.toHaveAttribute('points', fit!)
  const point = await screenPointForCell(minimap, 11, 6)
  await page.mouse.click(point.x, point.y)
  await expect(canvas).toHaveAttribute('data-camera-center', '11.00,6.00')
  const centered = await footprint.getAttribute('points')
  await page.getByRole('button', { name: '向右旋转', exact: true }).click()
  await expect(footprint).not.toHaveAttribute('points', centered!)
  const rotated = await footprint.getAttribute('points')
  await page.getByRole('button', { name: '拉近', exact: true }).click()
  await expect(footprint).not.toHaveAttribute('points', rotated!)
  const zoom = await canvas.getAttribute('data-camera-zoom')
  await page.getByTestId('play-toolbar').getByRole('button', { name: '单步执行' }).click()
  await expect(markerAt(page, 'player', 3, 8)).toHaveCount(1)
  await expect(canvas).toHaveAttribute('data-camera-center', '11.00,6.00')
  await page.getByRole('button', { name: '回到芽芽', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-center', '3.00,8.00')
  await expect(canvas).toHaveAttribute('data-camera-zoom', zoom!)
  await expect(page.getByTestId('arena-turn')).toHaveText('回合 1/33')
})

test.describe('touch minimap', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test('fits the full-window fallback and can navigate a grid challenge by touch', async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Unavailable', 'NotAllowedError'))
    })
    await openLevel(page, 'challenge-six-step-detour')
    const minimap = await enterMap(page)
    await expect(minimap).toBeInViewport({ ratio: 1 })
    await expect(markerAt(page, 'target', 3, 1)).toHaveCount(1)
    await page.getByRole('button', { name: '拉近', exact: true }).tap()
    const point = await screenPointForCell(minimap, 5, 2)
    await page.touchscreen.tap(point.x, point.y)
    await expectFlatCenter(page, 5, 2)
    await page.getByRole('button', { name: '收起小地图' }).tap()
    await page.getByRole('button', { name: '回到芽芽', exact: true }).tap()
    await expectFlatCenter(page, 3, 3)
    await expect(page.getByTestId('grid-turn-budget')).toContainText('0 / 6')
    await page.getByRole('button', { name: '退出全屏', exact: true }).tap()
    await expect(page.getByTestId('station-minimap')).toHaveCount(0)
  })

  test('the minimap controls stay reachable beside the live gamepad and floating editor on short screens', async ({ page }) => {
    await openLevel(page, 'challenge-tidal-boardwalk-sprint')
    await page.getByRole('button', { name: '紧张', exact: true }).click()
    await enterMap(page)
    await page.getByRole('button', { name: '开始', exact: true }).tap()
    await expect(page.locator('[data-arena-action="shoot-right"]')).toBeVisible()
    await page.getByTestId('arena-console-toggle').tap()
    const back = page.getByRole('button', { name: '回到芽芽', exact: true })
    for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport)
      await expect(back).toBeInViewport({ ratio: 1 })
      await back.tap({ trial: true })
    }
  })
})
