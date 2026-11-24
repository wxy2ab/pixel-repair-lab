import { expect, test } from '@playwright/test'

test.use({
  viewport: { width: 1366, height: 900 },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
})

// Wide strips of the default overview. Both exclude the old fan, scanner and all playable cells with actors.
const scenes = [
  { name: 'warehouse rear rail', level: 'challenge-sokoban-lighthouse-ring', warehouse: true,
    left: .28, top: .063, width: .53, height: .118 },
  { name: 'fullscreen arena front conveyor', level: 'challenge-neon-pinball-cup', warehouse: false,
    left: .237, top: .62, width: .21, height: .135 },
]

for (const scene of scenes) {
  test(`${scene.name} moves between turns and rests with reduced motion`, async ({ page }) => {
    test.slow()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/#challenge-zone')
    if (scene.warehouse) {
      await page.locator('[data-challenge-route="warehouse"]').click()
      await page.locator(`[data-route-step="${scene.level}"] .challenge-route-step-open`).click()
    } else {
      await page.locator(`[data-challenge-level="${scene.level}"]`).click()
      await page.getByRole('button', { name: '全屏地图', exact: true }).click()
      await expect(page.getByTestId('arena-map-workspace')).toHaveAttribute('data-map-fullscreen', 'true')
    }
    const viewport = page.locator('.station-viewport')
    await expect(viewport).toHaveAttribute('data-ready', 'true', { timeout: 20000 })
    const canvas = viewport.getByTestId('station-3d-canvas')
    await canvas.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const bounds = await canvas.boundingBox()
    if (!bounds) throw new Error('Missing 3D challenge board')
    const clip = {
      x: Math.round(bounds.x + bounds.width * scene.left),
      y: Math.round(bounds.y + bounds.height * scene.top),
      width: Math.round(bounds.width * scene.width),
      height: Math.round(bounds.height * scene.height),
    }
    const photo = () => page.screenshot({ clip })
    const board = viewport.locator('.tilemap')
    const beforeBoard = await board.innerHTML()
    const readout = page.getByTestId(scene.warehouse ? 'warehouse-readout' : 'arena-turn')
    const beforeTurn = await readout.innerText()
    const running = await photo()
    await expect.poll(async () => !(await photo()).equals(running), { timeout: 15000 }).toBe(true)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    const still = await photo()
    await page.waitForTimeout(1100)
    expect((await photo()).equals(still)).toBe(true)
    expect(await board.innerHTML()).toBe(beforeBoard)
    expect(await readout.innerText()).toBe(beforeTurn)
  })
}
