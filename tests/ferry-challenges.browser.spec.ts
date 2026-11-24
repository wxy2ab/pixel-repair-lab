import { expect, test, type Page } from '@playwright/test'

const crossing = 'challenge-ferry-crossing'
const earlyPulse = 'challenge-ferry-early-pulse'
const race = 'challenge-ferry-robot-race'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixel-repair-lab:board-view', '2d')
    localStorage.setItem('pixel-repair-lab:locale', 'zh')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#challenge-browse')
})

function card(page: Page, id: string) {
  return page.locator(`#challenge-browse [data-challenge-level="${id}"]`)
}

const summary = (page: Page) => page.getByRole('region', { name: '通关总结', exact: true })

async function runCrossing(page: Page) {
  const bar = page.getByTestId('play-toolbar')
  await bar.getByRole('button', { name: '运行', exact: true }).click()
  await bar.getByRole('button', { name: '查看结果', exact: true }).click()
}

test('a child can cross, run the same cards one beat earlier, remove one wait and continue to the race', async ({ page }) => {
  const series = page.getByRole('navigation', { name: '渡口短挑战' })
  await expect(series.getByRole('button')).toHaveCount(3)
  await series.getByRole('button', { name: '渡口一 · 赶船' }).click()
  for (const command of ['right', 'wait', 'up', 'right', 'right', 'down', 'right']) {
    await page.locator(`[data-add-card="${command}"]`).click()
  }
  const program = page.getByTestId('generated-code')
  const previous = await program.innerText()
  await runCrossing(page)
  await expect(summary(page).locator('[data-score-metric="turns"] td').first()).toHaveText('7')
  await summary(page).locator(`[data-next-challenge="${earlyPulse}"]`).click()
  await expect(program).toHaveText(previous)

  await runCrossing(page)
  await expect(page.getByTestId('ferry-crossing-result')).toContainText('5')
  await expect(summary(page)).toHaveCount(0)
  await page.locator('[data-card="wait"]').getByRole('button', { name: '移除', exact: true }).click()
  await expect(program).not.toContainText('wait()')
  await runCrossing(page)
  await expect(summary(page).locator('[data-score-metric="turns"] td').first()).toHaveText('6')
  await summary(page).locator(`[data-next-challenge="${race}"]`).click()
  await expect(page.getByTestId('ferry-race-run')).toBeVisible()
})

test('the long shore path catches both ferries and each challenge keeps its own Python draft', async ({ page }) => {
  await card(page, crossing).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const detour = '# Along the shore\n' + ['down', 'down', 'right', 'right', 'right', 'right', 'up', 'up']
    .map(direction => `move("${direction}")`).join('\n')
  await editor.fill(detour)
  await runCrossing(page)
  await expect(summary(page).locator('[data-score-metric="turns"] td').first()).toHaveText('8')
  await summary(page).locator(`[data-next-challenge="${earlyPulse}"]`).click()
  await expect(editor).toHaveValue(detour)
  await runCrossing(page)
  await expect(summary(page).locator('[data-score-metric="turns"] td').first()).toHaveText('8')

  const revised = detour + '\n# A separate second draft'
  await editor.fill(revised)
  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await card(page, crossing).click()
  await expect(editor).toHaveValue(detour)
  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await card(page, earlyPulse).click()
  await expect(editor).toHaveValue(revised)
  await page.locator('[data-ferry-restore]').click()
  await expect(editor).toHaveValue(detour)
})

test('moving the batteries and wall creates a counterexample on two synchronized race boards', async ({ page }) => {
  await card(page, race).click()
  const run = page.getByTestId('ferry-race-run')
  const result = page.getByTestId('ferry-race-result')
  const piece = (id: string) => page.locator(`[data-ferry-piece="${id}"]`)
  const cell = (position: string) => page.locator(`[data-ferry-edit-cell="${position}"]`)
  const command = (action: string) => page.locator(`[data-ferry-command="${action}"]`)
  const racer = (id: string) => page.locator(`[data-ferry-racer="${id}"]`)
  const finish = page.getByRole('button', { name: '跳到结尾', exact: true })

  await command('left').click()
  await run.click()
  await finish.click()
  await expect(result).toHaveAttribute('data-won', 'false')
  await expect(summary(page)).toHaveCount(0)
  await page.getByTestId('ferry-race-edit').click()

  await piece('a').dragTo(cell('2,1'))
  await expect(cell('2,1')).toHaveAttribute('data-ferry-piece', 'a')
  await piece('b').click()
  await cell('1,3').click()
  await expect(cell('1,3')).toHaveAttribute('data-ferry-piece', 'b')
  await piece('wall').dragTo(cell('4,2'))
  await expect(cell('4,2')).toHaveAttribute('data-ferry-piece', 'wall')

  for (const action of ['down', 'pick', 'up', 'up', 'right', 'pick', 'right', 'right', 'right', 'down']) {
    await command(action).click()
  }
  await run.click()
  await page.getByRole('slider', { name: '回放进度', exact: true }).fill('1')
  await expect(racer('player')).toHaveAttribute('data-turn', '1')
  await expect(racer('bot')).toHaveAttribute('data-turn', '1')
  await expect(racer('player')).toHaveAttribute('data-position', '1,2')
  await expect(racer('bot')).toHaveAttribute('data-position', '2,1')
  await finish.click()
  await expect(result).toHaveAttribute('data-won', 'true')
  await expect(summary(page).locator('[data-score-metric="turns"] td').first()).toHaveText('11')
})

test('the crossing console leaves both routes visible on desktop and on a phone', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('pixel-repair-lab:grid-console', 'hidden'))
  await card(page, crossing).click()
  const root = page.getByTestId('arena-map-workspace')
  const board = root.locator('.board-panel')
  const consolePanel = root.locator('.arena-console')
  await expect(consolePanel).toBeVisible()
  await expect.poll(async () => {
    const map = await board.boundingBox()
    const editor = await consolePanel.boundingBox()
    return Boolean(map && editor && map.x + map.width <= editor.x)
  }).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => {
    const map = await board.boundingBox()
    const editor = await consolePanel.boundingBox()
    return Boolean(map && editor && map.y + map.height <= editor.y)
  }).toBe(true)
  await root.getByRole('button', { name: '全屏地图', exact: true }).click()
  await expect(consolePanel).toBeHidden()
  const toggle = root.getByTestId('arena-console-toggle')
  await toggle.click()
  await root.locator('[data-add-card="right"]').click()
  await toggle.click()
  await expect(consolePanel).toBeHidden()
  await root.getByRole('button', { name: '退出全屏', exact: true }).click()
  await expect(consolePanel.locator('[data-card="right"]')).toBeVisible()
})
