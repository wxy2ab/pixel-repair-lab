import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { cardsToPython } from '../src/shared/cards'
import type { ArenaLevel } from '../src/shared/advanced'
import type { GridLevel } from '../src/shared/types'
import { challengeScoresKey, type ChallengeScoreHistory } from '../src/web/challengeScore'

function levelFromFile<T extends GridLevel | ArenaLevel>(name: string): T {
  return JSON.parse(readFileSync(new URL('../levels/' + name, import.meta.url), 'utf8'))
}

const detour = levelFromFile<GridLevel>('1815-six-step-detour.json')
const telegram = levelFromFile<GridLevel>('1821-compressed-route-telegram.json')
const junction = levelFromFile<ArenaLevel>('1803-junction-race.json')
const map = (page: Page, index: number) => page.getByTestId('map-scenario-' + index)
const cell = (page: Page, x: number, y: number) => page.locator(`.tile[data-x="${x}"][data-y="${y}"]`)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
})

async function openChallenge(page: Page, id: string) {
  await page.goto('/#challenge-zone')
  await page.getByRole('region', { name: '自由选关', exact: true }).locator(`[data-challenge-level="${id}"]`).click()
}

test('six-step detour switches both closure layouts, preserves the program, and scores both maps once', async ({ page }) => {
  await openChallenge(page, detour.id)
  await expect(page.getByTestId('map-scenario-picker').getByRole('button')).toHaveCount(2)
  await expect(cell(page, 2, 3)).toHaveClass(/tile--wall/)
  await expect(cell(page, 4, 3)).toHaveClass(/tile--floor/)
  await page.locator('[data-add-card="scan"]').click()
  await map(page, 1).click()
  await expect(map(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await expect(cell(page, 2, 3)).toHaveClass(/tile--floor/)
  await expect(cell(page, 4, 3)).toHaveClass(/tile--wall/)
  await expect(page.getByTestId('generated-code')).toHaveText('nearby = scan()')

  await page.getByRole('tab', { name: 'Python' }).click()
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  const oneRoute = ['right', 'right', 'up', 'up', 'left', 'left'].map(direction => `move("${direction}")`).join('\n')
  await editor.fill(oneRoute)
  await map(page, 0).click()
  await expect(editor).toHaveValue(oneRoute)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const review = page.getByRole('region', { name: '失败复盘' })
  await review.getByRole('button', { name: '复盘这次' }).click()
  await expect(review).toContainText('场景 2 / 2')
  await expect(page.getByRole('region', { name: '通关总结' })).toHaveCount(0)

  const solution = cardsToPython(detour.cards, detour.solutionCards)
  await editor.fill(solution)
  await map(page, 1).click()
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const summary = page.getByRole('region', { name: '通关总结' })
  await expect(summary.locator('[data-score-metric="cases"] td').first()).toHaveText('2 / 2')
  await expect(summary.locator('[data-score-metric="turns"] td').first()).toHaveText('6')
  await expect(page.locator('.run-log')).toContainText('"left":"floor"')
  await expect(page.locator('.tilemap')).toHaveAccessibleName('机器人位于 3，1')
  await map(page, 0).click()
  await expect(page.locator('.run-log')).toContainText('"left":"wall"')
  await expect(editor).toHaveValue(solution)
  const attempts = await page.evaluate(({ key, id }) => {
    const scores: ChallengeScoreHistory = JSON.parse(localStorage.getItem(key) ?? '{}')
    return scores[id]?.['grid:2']?.attempts?.length
  }, { key: challengeScoresKey, id: detour.id })
  expect(attempts).toBe(1)
})

test('every configured telegram map shows its own input, parts, exit, start and turn budget on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openChallenge(page, telegram.id)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  const scenarios = [telegram, ...telegram.variants!.map(variant => ({ ...telegram, ...variant }))]
  const picker = page.getByTestId('map-scenario-picker')
  await expect(picker.getByRole('button')).toHaveCount(scenarios.length)
  for (const index of [2, 0, 1]) {
    const scenario = scenarios[index]
    await map(page, index).click()
    await expect(map(page, index)).toHaveAccessibleName('Map ' + (index + 1))
    await expect(page.locator('.tilemap')).toHaveAccessibleName(`Robot at ${scenario.start.x}, ${scenario.start.y}`)
    await expect(page.locator('.hardware-panel code')).toHaveText(JSON.stringify(scenario.input))
    await expect(page.getByTestId('grid-turn-budget')).toContainText('0 / ' + scenario.turnLimit)
    for (const item of scenario.items!) await expect(cell(page, item.x, item.y)).toHaveAttribute('data-item-id', item.id)
    const exit = scenario.objectives.find(goal => goal.type === 'exit')!
    await expect(cell(page, exit.x, exit.y)).toHaveClass(/tile--exit/)
  }
  const bounds = await picker.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
})

test('each relaxed arena map replays its own moves while the challenge scores the complete run', async ({ page }) => {
  await openChallenge(page, junction.id)
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  const before = await editor.inputValue()
  await editor.fill(before + '\n# next turn')
  for (const index of [1, 2, 0]) {
    const scenario = index ? { ...junction, ...junction.variants![index - 1] } : junction
    await map(page, index).click()
    await expect(page.locator('.tilemap')).toHaveAccessibleName(`机器人位于 ${scenario.start.x}，${scenario.start.y}`)
    for (const item of scenario.items) await expect(cell(page, item.x, item.y)).toHaveAttribute('data-item-id', item.id)
  }
  await expect(editor).toHaveValue(before + '\n# next turn')
  await map(page, 2).click()
  await editor.fill(junction.solutionCode)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const slider = page.getByRole('slider', { name: '回放进度' })
  await slider.press('End')
  const summary = page.getByRole('region', { name: '通关总结' })
  await expect(summary.locator('[data-score-metric="cases"] td').first()).toHaveText('3 / 3')
  await expect(page.locator('.tilemap')).toHaveAccessibleName('机器人位于 2，5')
  for (const [index, destination, move] of [
    [2, '6，2', '向上移动'], [1, '3，5', '向左移动'], [0, '1，3', '向左移动'],
  ] as const) {
    await map(page, index).click()
    await slider.press('Home')
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    await expect(page.locator('.tilemap')).toHaveAccessibleName('机器人位于 ' + destination)
    await expect(page.getByTestId('arena-turn-events').locator('[data-actor-id="player"]')).toContainText(move)
  }
})

test('a timed arena previews another layout and returns to the same paused match', async ({ page }) => {
  await openChallenge(page, junction.id)
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await page.getByRole('button', { name: '开始', exact: true }).click()
  const turn = page.getByTestId('arena-turn')
  await expect(turn).not.toContainText(' 0/')
  await map(page, 2).click()
  await expect(turn).toContainText(' 0/')
  await map(page, 0).click()
  await expect(page.getByRole('button', { name: '继续对局', exact: true })).toBeVisible()
  await expect(turn).not.toContainText(' 0/')
})

test('single-map challenges omit the picker and an imported multi-map grid exposes every layout', async ({ page }) => {
  await openChallenge(page, 'limited-battery-salvage')
  await expect(page.locator('.tilemap')).toBeVisible()
  await expect(page.getByTestId('map-scenario-picker')).toHaveCount(0)
  await page.getByRole('button', { name: '关卡预览', exact: true }).click()
  await page.getByLabel('关卡 JSON 文件').setInputFiles({
    name: 'telegram.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(telegram)),
  })
  await expect(page.getByText('配置校验通过')).toBeVisible()
  await map(page, 2).click()
  const start = telegram.variants![1].start!
  await expect(page.locator('.tilemap')).toHaveAccessibleName(`机器人位于 ${start.x}，${start.y}`)
})
