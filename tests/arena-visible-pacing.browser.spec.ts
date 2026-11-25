import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 680 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    localStorage.setItem('pixel-repair-lab:board-view', '2d')
    localStorage.setItem('pixel-repair-lab:locale', 'en')
  })
  await page.goto('/#challenge-browse')
})

test('a timed volley scrolled out of view resumes mid-flight before the next decision starts', async ({ page }) => {
  await page.locator('[data-challenge-level="challenge-brass-bell-lane"]').click()
  await page.getByRole('button', { name: 'Timed', exact: true }).click()
  await page.locator('#realtime-python').fill('def decide(state):\n    return "shoot-right"')
  const toolbar = page.getByTestId('play-toolbar')
  await toolbar.getByRole('button', { name: 'Start', exact: true }).click()
  const board = page.locator('.station-flat-board .map-well')
  await board.scrollIntoViewIfNeeded()
  const turn = page.getByTestId('arena-turn')
  await expect(turn).toHaveText('Turn 1/12')
  // Measure the moving sprite in grid squares. Leave midway through the flight.
  const flightPosition = () => {
    const well = document.querySelector('.station-flat-board .map-well')!
    const bolt = well.querySelector('[data-shot-from="player"] .arena-pulse-flight')
    if (!bolt || Number(getComputedStyle(bolt).opacity) < .15) return -1
    const center = (element: Element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.x + bounds.width / 2
    }
    const start = center(well.querySelector('.tile[data-x="1"][data-y="3"]')!)
    const step = center(well.querySelector('.tile[data-x="2"][data-y="3"]')!) - start
    return (center(bolt) - start) / step
  }
  await expect.poll(() => page.evaluate(flightPosition), { intervals: [30] }).toBeGreaterThan(1.2)
  const before = await page.evaluate(flightPosition)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(board).not.toBeInViewport()
  // Longer than a full four-cell volley plus the 1.8-second decision window.
  await page.waitForTimeout(5500)
  await expect(turn).toHaveText('Turn 1/12')
  await expect(toolbar.locator('.arena-clock')).toContainText('Volley')
  await board.scrollIntoViewIfNeeded()
  // A resumed pulse is already in flight. Restarting from the muzzle would put it near zero.
  await expect.poll(() => page.evaluate(flightPosition), { intervals: [25], timeout: 800 }).toBeGreaterThan(before - .25)
  await expect.poll(() => page.evaluate(() => {
    const impact = document.querySelector('[data-shot-hit="player"] .arena-pulse-impact')
    return impact && Number(getComputedStyle(impact).opacity) > .1
  }), { intervals: [50] }).toBeTruthy()
  await expect(toolbar.locator('.arena-clock')).toHaveAttribute('data-paused', 'false')
  await expect(turn).toHaveText('Turn 1/12')
  await expect(turn).toHaveText('Turn 2/12')
})

test('automatic map observation waits for the visible rival shot before advancing', async ({ page }) => {
  await page.locator('[data-challenge-level="challenge-neon-pinball-cup"]').click()
  await page.getByTestId('map-observe-start').click()
  const board = page.locator('.station-flat-board .map-well')
  await board.scrollIntoViewIfNeeded()
  const observation = page.getByTestId('map-observe-controls')
  // At step ten the pinball robot fires five squares toward Sprout.
  await expect(observation).toHaveAttribute('data-step', '10', { timeout: 16000 })
  await page.waitForFunction(() => {
    const bolt = document.querySelector('[data-shot-from="pinball"] .arena-pulse-flight')
    return bolt && Number(getComputedStyle(bolt).opacity) > .15
  })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(board).not.toBeInViewport()
  await page.waitForTimeout(4000)
  await expect(observation).toHaveAttribute('data-step', '10')
  await board.scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => {
    const impact = document.querySelector('[data-shot-hit="pinball"] .arena-pulse-impact')
    return impact && Number(getComputedStyle(impact).opacity) > .1
  }), { intervals: [50] }).toBeTruthy()
  await expect(observation).toHaveAttribute('data-step', '11')
})

test('a visible Python volley still plays after the browser misses several seconds of frames', async ({ page }) => {
  await page.locator('[data-challenge-level="challenge-brass-bell-lane"]').click()
  await page.locator('#advanced-python').fill('move("right")\npick()\nmove("right")\nshoot("right")')
  // Stop the page after the final volley is mounted, before the browser can paint it.
  // The debugger lets wall time pass without consuming CPU or changing the game's clocks.
  const devtools = await page.context().newCDPSession(page)
  await devtools.send('Debugger.enable')
  await page.evaluate(() => {
    const watch = new MutationObserver(() => {
      if (!document.querySelector('[data-shot-from="player"] .arena-pulse-flight')) return
      watch.disconnect()
      debugger
    })
    watch.observe(document.querySelector('.tilemap')!.parentElement!, { subtree: true, childList: true })
  })
  const paused = new Promise<void>(resolve => devtools.once('Debugger.paused', () => resolve()))
  await page.getByTestId('play-toolbar').getByRole('button', { name: 'Run', exact: true }).click()
  await paused
  await page.waitForTimeout(4500)
  await devtools.send('Debugger.resume')
  await devtools.detach()
  await expect.poll(() => page.evaluate(() => {
    const projectile = document.querySelector('[data-shot-from="player"] .arena-pulse-flight')
    const hull = document.querySelector<HTMLMeterElement>('[data-robot-id="bell"] meter')
    return projectile && Number(getComputedStyle(projectile).opacity) > .5 && hull?.value === 2
  }), { intervals: [40], timeout: 3500 }).toBeTruthy()
  await expect(page.getByRole('region', { name: 'Challenge summary' })).toBeVisible()
})
