import { expect, test, type Page } from '@playwright/test'
import type { Mesh, Scene } from 'three'

const program = 'move("right")\npick()\nmove("right")\nshoot("right")'

async function openBell(page: Page, view: '2d' | '3d', motion: 'reduce' | 'no-preference') {
  await page.emulateMedia({ reducedMotion: motion })
  await page.addInitScript(view => {
    localStorage.setItem('pixel-repair-lab:board-view', view)
    localStorage.setItem('pixel-repair-lab:locale', 'en')
  }, view)
  await page.goto('/#challenge-browse')
  await page.locator('[data-challenge-level="challenge-brass-bell-lane"]').click()
  await expect(page.getByTestId('arena-turn')).toHaveText('Turn 0/12')
}

test('the flat replay moves Sprout between cells and shows both pulses travelling before the rival powers down', async ({ page }) => {
  await openBell(page, '2d', 'no-preference')
  await page.locator('#advanced-python').fill(program)
  const run = page.getByTestId('play-toolbar').getByRole('button', { name: 'Run', exact: true })
  // Sample the actual sprite positions relative to the printed grid, including during page scroll.
  const recording = page.evaluate(() => new Promise<string[]>(resolve => {
    const seen = new Set<string>()
    const center = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return rect.x + rect.width / 2
    }
    const start = performance.now()
    let impactAt: number | undefined
    function sample() {
      const well = document.querySelector('.station-flat-board .map-well')!
      const origin = center(well.querySelector('.tile[data-x="0"][data-y="3"]')!)
      const cell = center(well.querySelector('.tile[data-x="1"][data-y="3"]')!) - origin
      const position = (selector: string) => {
        const node = well.querySelector(selector)
        if (node && Number(getComputedStyle(node).opacity) > .05) return (center(node) - origin) / cell
        return Number.NaN
      }
      const opacity = (selector: string) => {
        const node = well.querySelector(selector)
        return node ? Number(getComputedStyle(node).opacity) : 0
      }
      const x = position('.tile > .pixel-bot:not(.pixel-bot--enemy)')
      const bolt = position('.arena-shot[data-side="player"] .arena-pulse-flight')
      const rivalBolt = position('.arena-shot[data-side="rival"] .arena-pulse-flight')
      if ((x > 1.1 && x < 1.9) || (x > 2.1 && x < 2.9)) seen.add('moving')
      if (opacity('[data-shot-from="player"] .arena-pulse-charge') > .05 && !seen.has('player in flight')) seen.add('charging')
      if (opacity('[data-shot-from="player"] .arena-pulse-emitter') > .2) seen.add('muzzle flash')
      if (bolt > 3.4 && bolt < 6.6) seen.add('player in flight')
      if (rivalBolt > 3.4 && rivalBolt < 6.6) seen.add('rival in flight')
      const bell = position('[data-fallen="bell"] .arena-fallen-art, .rival-marker[data-rival-id="bell"]')
      const hp = document.querySelector<HTMLMeterElement>('[data-robot-id="bell"] meter')?.value
      if (bolt > 3.4 && bolt < 6.6 && bell > 6.7 && bell < 7.3 && hp === 2) seen.add('original hull in flight')
      if (opacity('[data-shot-hit="player"] .arena-pulse-impact') > .05 && seen.has('player in flight')) {
        impactAt ??= performance.now()
        seen.add('impact')
      }
      const fallen = opacity('[data-fallen="bell"] .arena-fallen-art')
      // Give the child time to see the hit and then the body power down.
      if (impactAt !== undefined && performance.now() - impactAt > 230 && fallen > .04 && fallen < .96) seen.add('fading wreck')
      const summary = document.querySelector('.challenge-completion')
      if (summary || performance.now() - start > 20_000) resolve([...seen])
      else requestAnimationFrame(sample)
    }
    sample()
  }))
  await run.click()
  expect(await recording).toEqual(expect.arrayContaining([
    'moving', 'charging', 'muzzle flash', 'player in flight', 'rival in flight', 'original hull in flight', 'impact', 'fading wreck',
  ]))
  await expect(page.getByRole('region', { name: 'Challenge summary' })).toBeVisible()
  await expect(page.locator('.station-flat-board .rival-marker')).toHaveCount(0)
  await expect(page.locator('.station-flat-board [data-wreck-id="bell"]')).toBeVisible()
  await expect(page.locator('.station-flat-board [data-damaged-actor="player"]')).toBeVisible()
})

test('consecutive four-cell shots finish on screen and a speed change starts with the next shot', async ({ page }) => {
  test.slow()
  await openBell(page, '2d', 'no-preference')
  const speed = page.getByRole('combobox', { name: 'Attack speed' })
  await expect(speed).toHaveValue('system')
  await expect(speed.locator('option:checked')).toHaveText('System · 1×')
  await page.locator('#advanced-python').fill('shoot("right")\nshoot("right")\nmove("right")')
  const recording = page.evaluate(() => new Promise<{ flight: number; contact: number }[]>(resolve => {
    const rounds = [1, 2].map(() => ({ launch: 0, lastInFlight: 0, impact: 0, end: 0 }))
    const start = performance.now()
    function sample() {
      const now = performance.now()
      const board = document.querySelector('.station-flat-board .map-well')!
      const turn = Number(board.querySelector<HTMLElement>('.tilemap')?.dataset.motionTurn)
      const visible = (selector: string) => {
        const node = board.querySelector(selector)
        return node && Number(getComputedStyle(node).opacity) > .12
      }
      const round = rounds[turn - 1]
      if (round) {
        if (visible('[data-shot-from="player"] .arena-pulse-flight')) {
          round.launch ||= now
          round.lastInFlight = now
        }
        if (visible('[data-shot-hit="player"] .arena-pulse-impact')) round.impact ||= now
      }
      if (turn > 1 && rounds[turn - 2]) rounds[turn - 2].end ||= now
      if (turn === 3 || now - start > 24_000) {
        resolve(rounds.map(r => ({ flight: r.lastInFlight - r.launch, contact: r.impact && r.end - r.impact })))
      } else requestAnimationFrame(sample)
    }
    sample()
  }))
  await page.getByTestId('play-toolbar').getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForFunction(() => {
    const bolt = document.querySelector('[data-shot-from="player"] .arena-pulse-flight')
    return bolt && Number(getComputedStyle(bolt).opacity) > .2
  })
  await speed.selectOption('0.5')
  const [first, slower] = await recording
  // Actual visible frames, including the impact before the next command, in wall-clock milliseconds.
  expect(first.flight).toBeGreaterThan(1_000)
  expect(first.flight).toBeLessThan(2_200)
  expect(slower.flight).toBeGreaterThan(first.flight * 1.55)
  expect(first.contact).toBeGreaterThan(520)
  expect(slower.contact).toBeGreaterThan(1_050)
  await page.goto('/#challenge-browse')
  await page.reload()
  await page.locator('[data-challenge-level="challenge-brass-bell-lane"]').click()
  await expect(page.getByRole('combobox', { name: 'Attack speed' })).toHaveValue('0.5')
})

test('reduced motion and seeking place the board directly on the selected turn', async ({ page }) => {
  await openBell(page, '2d', 'reduce')
  await page.locator('#advanced-python').fill(program)
  await page.getByTestId('play-toolbar').getByRole('button', { name: 'Step once' }).click()
  const well = page.locator('.station-flat-board .map-well')
  const sprout = well.locator('.tile[data-x="2"][data-y="3"] > .pixel-bot')
  await expect(sprout).toBeVisible()
  expect(await sprout.evaluate(sprite => {
    const tile = sprite.parentElement!.getBoundingClientRect()
    const bot = sprite.getBoundingClientRect()
    return Math.abs(bot.x + bot.width / 2 - tile.x - tile.width / 2)
  })).toBeLessThan(1)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const replay = page.getByRole('slider', { name: 'Replay position' })
  await replay.fill('4')
  await expect(page.getByRole('region', { name: 'Challenge summary' })).toBeVisible()
  await expect(well.locator('.arena-pulse-bolt, .rival-marker')).toHaveCount(0)
  await expect(well.locator('.tile[data-x="7"][data-y="3"] [data-wreck-id="bell"]')).toBeVisible()
  await expect(well.locator('[data-damaged-actor="player"]')).toBeVisible()
  await replay.fill('0')
  await expect(well.locator('[data-wreck-id], [data-damaged-actor]')).toHaveCount(0)
  await expect(well.locator('.rival-marker[data-rival-id="bell"]')).toBeVisible()
})

test('a reduced-motion shot into the adjacent wall shows its direction at the shooter', async ({ page }) => {
  // Legacy speed settings alone did not give permission to play over reduced motion.
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:arena-attack-speed', '2'))
  await openBell(page, '2d', 'reduce')
  await expect(page.getByRole('combobox', { name: 'Attack speed' }).locator('option:checked')).toHaveText('System · Still')
  await page.locator('#advanced-python').fill('shoot("left")')
  await page.getByTestId('play-toolbar').getByRole('button', { name: 'Step once' }).click()
  const well = page.locator('.station-flat-board .map-well')
  await expect(well.locator('.tile[data-x="1"][data-y="3"] .arena-shot-marker[data-direction="left"]')).toBeVisible()
  await expect(well.locator('[data-wreck-id], [data-damaged-actor]')).toHaveCount(0)
})

test('explicit 1× plays a visible shot with reduced motion and returning to System restores static attacks', async ({ page }) => {
  await openBell(page, '2d', 'reduce')
  const speed = page.getByRole('combobox', { name: 'Attack speed' })
  await speed.selectOption('1')
  await page.goto('/#challenge-browse')
  await page.reload()
  await page.locator('[data-challenge-level="challenge-brass-bell-lane"]').click()
  await expect(speed).toHaveValue('1')
  await page.locator('#advanced-python').fill('move("right")\nshoot("right")\nshoot("left")')
  const step = page.getByTestId('play-toolbar').getByRole('button', { name: 'Step once' })
  const well = page.locator('.station-flat-board .map-well')
  await step.click()
  await expect(page.getByTestId('arena-turn')).toHaveText('Turn 1/12')
  await expect(well.locator('[data-motion-turn]')).toHaveCount(0)
  await step.click()
  await well.scrollIntoViewIfNeeded()
  const bolt = well.locator('[data-shot-from="player"] .arena-pulse-flight')
  await expect.poll(() => bolt.evaluate(node => {
    const tile = document.querySelector('.station-flat-board .tile[data-x="3"][data-y="3"]')!
    return Number(getComputedStyle(node).opacity) > .4 && node.getBoundingClientRect().x > tile.getBoundingClientRect().x
  })).toBe(true)
  await speed.selectOption('system')
  await expect(well.locator('[data-motion-turn="2"]')).toBeVisible()
  await step.click()
  await expect(well.locator('.arena-shot-marker[data-direction="left"]')).toBeVisible()
  await expect(well.locator('.arena-motion-layer')).toHaveCount(0)
})

test('both damaged robots can keep firing and leave separate wrecks on a mutual knockout', async ({ page }) => {
  await openBell(page, '2d', 'reduce')
  await page.locator('#advanced-python').fill('move("right")\nmove("right")\nshoot("right")\nshoot("right")\nshoot("right")')
  await page.getByTestId('play-toolbar').getByRole('button', { name: 'Step once' }).click()
  const replay = page.getByRole('slider', { name: 'Replay position' })
  const well = page.locator('.station-flat-board .map-well')
  await replay.fill('3')
  // Brass Bell guards against the first shot, so neither chassis should look damaged yet.
  await expect(well.locator('[data-damaged-actor], [data-wreck-id]')).toHaveCount(0)
  await replay.fill('4')
  await expect(well.locator('[data-damaged-actor]')).toHaveCount(2)
  await expect(well.locator('[data-wreck-id]')).toHaveCount(0)
  await replay.fill('5')
  await expect(well.locator('.tile[data-x="3"][data-y="3"] [data-wreck-id="player"]')).toBeVisible()
  await expect(well.locator('.tile[data-x="7"][data-y="3"] [data-wreck-id="bell"]')).toBeVisible()
  await replay.fill('4')
  await expect(well.locator('[data-wreck-id]')).toHaveCount(0)
  await expect(well.locator('[data-damaged-actor]')).toHaveCount(2)
})

const webglTest = test.extend({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

webglTest('a reduced-motion player can explicitly play a 3D attack', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 640 })
  await page.addInitScript(() => {
    const devtools = new EventTarget()
    const cells = new Set<number>()
    Object.assign(window, { __THREE_DEVTOOLS__: devtools, flightCells: cells })
    devtools.addEventListener('observe', event => {
      const scene = (event as CustomEvent<Scene>).detail
      if (!scene.isScene) return
      scene.onAfterRender = renderer => {
        if (renderer.domElement.dataset.arenaMotion !== 'flight') return
        scene.traverseVisible(node => {
          if (node.name === 'arena-pulse-head') cells.add(Math.floor(node.matrixWorld.elements[12]))
        })
      }
    })
  })
  await openBell(page, '3d', 'reduce')
  await expect(page.locator('.station-viewport')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('combobox', { name: 'Attack speed' }).selectOption('0.5')
  await page.locator('#advanced-python').fill('shoot("right")')
  await page.getByTestId('play-toolbar').getByRole('button', { name: 'Step once' }).click()
  await page.getByTestId('station-3d-canvas').scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => (window as Window & { flightCells?: Set<number> }).flightCells?.size),
    { timeout: 12_000 }).toBeGreaterThanOrEqual(3)
})

webglTest('live 3D practice draws the moving robot, incoming volley and shutdown of the same rival', async ({ page }) => {
  test.slow()
  await page.setViewportSize({ width: 800, height: 640 })
  // Three's scene observer lets us sample the transforms actually submitted to WebGL.
  // A change of turn number or a CSS label alone cannot satisfy these checks.
  await page.addInitScript(() => {
    const devtools = new EventTarget()
    const seen = new Set<string>()
    Object.assign(window, { __THREE_DEVTOOLS__: devtools, renderedArenaMotion: seen })
    devtools.addEventListener('observe', event => {
      const scene = (event as CustomEvent<Scene>).detail
      if (!scene.isScene) return
      let bellId: string | undefined
      let firstFlight: number | undefined
      scene.onAfterRender = renderer => {
        const canvas = renderer.domElement
        if (canvas.dataset.testid !== 'station-3d-canvas') return
        const phase = canvas.dataset.arenaMotion
        const sprout = scene.getObjectByName('sprout')
        const x = sprout?.position.x ?? 0
        if (phase === 'movement' && ((x > 1.05 && x < 1.95) || (x > 2.05 && x < 2.95))) seen.add('moving')
        const bell = scene.getObjectByName('rival-1')
        if (!bellId) bellId = bell?.uuid
        if (phase === 'flight') {
          scene.traverseVisible(node => {
            if (node.name === 'arena-muzzle-flash' && node.scale.x > .12) seen.add('muzzle flash')
            if (node.name === 'arena-pulse-wake' && node.scale.z > .30) seen.add('directional trail')
            if (node.name === 'arena-pulse-head' && node.matrixWorld.elements[12] > 3.35 && node.matrixWorld.elements[12] < 6.65) {
              seen.add('pulse between robots')
              firstFlight ??= performance.now()
              if (performance.now() - firstFlight > 720) seen.add('sustained flight')
              if (bell && bell.uuid === bellId && bell.visible) seen.add('bell still on board')
            }
          })
        }
        if (bell && bell.uuid === bellId && (phase === 'impact' || phase === 'shutdown')) {
          const chassis = bell.getObjectByName('rival-1-chassis')
          if (chassis && Math.abs(chassis.rotation.x) + Math.abs(chassis.rotation.z) > .12) seen.add('bell reacts')
          if (phase === 'shutdown') bell.traverseVisible(node => {
            const material = (node as Mesh).material
            if (material && !Array.isArray(material) && material.opacity > .02 && material.opacity < .98) seen.add('bell powering down')
          })
        }
        const wreck = scene.getObjectByName('arena-wreck')
        if (seen.has('bell powering down') && !bell && wreck?.visible && wreck.userData.actorId === 'bell'
            && wreck.position.x === 7 && wreck.scale.x > .9) seen.add('bell wreck on board')
        if (sprout?.getObjectByName('arena-damaged-helmet')?.visible) seen.add('damaged Sprout')
      }
    })
  })
  await openBell(page, '3d', 'no-preference')
  const workspace = page.getByTestId('arena-map-workspace')
  await workspace.getByRole('button', { name: 'Control Sprout', exact: true }).click()
  await expect(workspace.locator('.station-viewport')).toHaveAttribute('data-ready', 'true')
  const canvas = workspace.getByTestId('station-3d-canvas')
  await canvas.scrollIntoViewIfNeeded()
  await canvas.press('ArrowRight')
  await expect(page.getByTestId('arena-turn')).toHaveText('Turn 1/12')
  await canvas.press('e')
  await expect(page.getByTestId('arena-turn')).toHaveText('Turn 2/12')
  await canvas.press('ArrowRight')
  await expect(page.getByTestId('arena-turn')).toHaveText('Turn 3/12')
  await canvas.press('Shift+ArrowRight')
  await expect(workspace.getByTestId('arena-turn-events').locator('[data-actor-id="player"]')).toContainText('right', { timeout: 12_000 })
  await expect.poll(() => page.evaluate(() => [
    ...(window as Window & { renderedArenaMotion?: Set<string> }).renderedArenaMotion ?? [],
  ]), { timeout: 12_000 }).toEqual(expect.arrayContaining(['moving', 'muzzle flash', 'directional trail', 'pulse between robots', 'sustained flight', 'bell still on board',
    'bell reacts', 'bell powering down', 'bell wreck on board', 'damaged Sprout']))
})
