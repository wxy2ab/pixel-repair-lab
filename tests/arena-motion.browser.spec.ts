import { expect, test, type Page } from '@playwright/test'
import type { Mesh, Scene } from 'three'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

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
      if (summary || performance.now() - start > 12_000) resolve([...seen])
      else requestAnimationFrame(sample)
    }
    sample()
  }))
  await run.click()
  expect(await recording).toEqual(expect.arrayContaining([
    'moving', 'charging', 'player in flight', 'rival in flight', 'original hull in flight', 'impact', 'fading wreck',
  ]))
  await expect(page.getByRole('region', { name: 'Challenge summary' })).toBeVisible()
  await expect(page.locator('.station-flat-board .rival-marker')).toHaveCount(0)
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
  await page.getByRole('slider', { name: 'Replay position' }).fill('4')
  await expect(page.getByRole('region', { name: 'Challenge summary' })).toBeVisible()
  await expect(well.locator('.arena-pulse-bolt, .rival-marker')).toHaveCount(0)
})

test('live 3D practice draws the moving robot, incoming volley and shutdown of the same rival', async ({ page }) => {
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
      scene.onAfterRender = renderer => {
        const canvas = renderer.domElement
        if (canvas.dataset.testid !== 'station-3d-canvas') return
        const phase = canvas.dataset.arenaMotion
        const x = scene.getObjectByName('sprout')?.position.x ?? 0
        if (phase === 'movement' && ((x > 1.05 && x < 1.95) || (x > 2.05 && x < 2.95))) seen.add('moving')
        const bell = scene.getObjectByName('rival-1')
        if (!bellId) bellId = bell?.uuid
        if (phase === 'flight') {
          scene.traverseVisible(node => {
            if (node.name === 'arena-pulse-head' && node.matrixWorld.elements[12] > 3.35 && node.matrixWorld.elements[12] < 6.65) {
              seen.add('pulse between robots')
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
        if (seen.has('bell powering down') && !bell) seen.add('wreck gone')
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
  await expect(workspace.getByTestId('arena-turn-events').locator('[data-actor-id="player"]')).toContainText('right')
  await expect.poll(() => page.evaluate(() => [
    ...(window as Window & { renderedArenaMotion?: Set<string> }).renderedArenaMotion ?? [],
  ])).toEqual(expect.arrayContaining(['moving', 'pulse between robots', 'bell still on board', 'bell reacts', 'bell powering down', 'wreck gone']))
})
