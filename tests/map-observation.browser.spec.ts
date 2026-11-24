import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { cardsToPython } from '../src/shared/cards'
import type { ArenaLevel } from '../src/shared/advanced'
import type { GridLevel } from '../src/shared/types'

const detour: GridLevel = JSON.parse(readFileSync(new URL('../levels/1815-six-step-detour.json', import.meta.url), 'utf8'))
const shifting: ArenaLevel = JSON.parse(readFileSync(new URL('../levels/1805-shifting-grounds.json', import.meta.url), 'utf8'))
const control = (page: Page, name: string) => page.getByTestId('map-observe-' + name)
const cell = (page: Page, x: number, y: number) => page.locator(`.tile[data-x="${x}"][data-y="${y}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const savedWork = (page: Page) => page.evaluate(() => ({ ...localStorage }))

function savedBoard(board: Locator) {
  return board.evaluate(node => {
    const copy = node.cloneNode(true) as Element
    // Sprout's square belongs to the checkpoint. A momentary pick or movement animation can finish.
    copy.querySelectorAll('.pixel-bot:not(.pixel-bot--enemy)').forEach(robot => robot.replaceWith('Sprout'))
    return copy.outerHTML
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
})

async function openChallenge(page: Page, id: string) {
  await page.goto('/#challenge-zone')
  await page.getByRole('region', { name: '自由选关', exact: true }).locator(`[data-challenge-level="${id}"]`).click()
}

async function observeAndPause(page: Page) {
  await control(page, 'start').click()
  await control(page, 'play').click()
  await expect(control(page, 'play')).toHaveAttribute('aria-pressed', 'false')
}

test('empty cards tour both detour boards without spending turns or recording an attempt', async ({ page }) => {
  await openChallenge(page, detour.id)
  const saved = await savedWork(page)
  await observeAndPause(page)
  const controls = control(page, 'controls')
  await expect(controls).toHaveAttribute('data-map-index', '0')
  await expect(cell(page, 2, 3)).toHaveClass(/tile--wall/)
  await control(page, 'play').click()
  await expect(controls).toHaveAttribute('data-map-index', '1')
  await expect(control(page, 'play')).toHaveAttribute('aria-pressed', 'false')
  await expect(cell(page, 4, 3)).toHaveClass(/tile--wall/)
  await expect(page.getByTestId('grid-turn-budget')).toContainText('0 / 6')
  await control(page, 'prev').click()
  await expect(controls).toHaveAttribute('data-map-index', '0')
  await page.getByTestId('map-scenario-1').click()
  await expect(controls).toHaveAttribute('data-map-index', '1')
  await control(page, 'exit').click()
  expect(await savedWork(page)).toEqual(saved)
  await expect(page.getByRole('region', { name: '失败复盘' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Python' }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill(cardsToPython(detour.cards, detour.solutionCards))
  await button(page, '运行').click()
  await expect(page.getByRole('region', { name: '通关总结' })).toBeVisible()
})

test('patrols advance around stationary Sprout from a comment-only draft', async ({ page }) => {
  await openChallenge(page, 'double-patrol-lockdown')
  await page.getByRole('tab', { name: 'Python' }).click()
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  const note = '# 看看谁会经过起点\n   # 保留我的计划'
  await editor.fill(note)
  const saved = await savedWork(page)
  await observeAndPause(page)
  await control(page, 'next').click()
  await expect(page.getByTestId('grid-turn-budget')).toContainText('1 / 16')
  await expect(page.locator('.tilemap')).toHaveAccessibleName('机器人位于 2，1')
  await expect(cell(page, 2, 2).locator('.pixel-bot--enemy')).toHaveCount(1)
  await expect(cell(page, 3, 3).locator('.pixel-bot--enemy')).toHaveCount(1)
  await control(page, 'next').click()
  await expect(cell(page, 2, 1).locator('.pixel-bot--enemy')).toHaveCount(1)
  await expect(page.getByRole('region', { name: '失败复盘' })).toHaveCount(0)
  await control(page, 'exit').click()
  await expect(page.getByTestId('grid-turn-budget')).toContainText('0 / 16')
  await expect(editor).toHaveValue(note)
  expect(await savedWork(page)).toEqual(saved)
})

test('a tour starts on the selected map and preserves instructions on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openChallenge(page, 'challenge-compressed-route-telegram')
  await button(page, 'EN').click()
  await page.getByTestId('map-scenario-2').click()
  await page.getByRole('tab', { name: 'Python' }).click()
  const editor = page.getByRole('textbox', { name: 'Write Python' })
  await editor.fill('message = scan()')
  await expect(button(page, 'Run')).toBeEnabled()
  await expect(control(page, 'start')).toHaveAccessibleName('Observe map')
  await observeAndPause(page)
  const controls = control(page, 'controls')
  await expect(controls).toHaveAttribute('data-map-index', '2')
  for (const index of [0, 1]) {
    await control(page, 'next').click()
    await expect(controls).toHaveAttribute('data-map-index', String(index))
  }
  await expect(control(page, 'next')).toBeDisabled()
  await control(page, 'exit').click()
  await expect(page.getByTestId('map-scenario-2')).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toHaveValue('message = scan()')
})

test('observation shows actual arena shifts and restores a paused official replay and its checkpoint', async ({ page }) => {
  await openChallenge(page, shifting.id)
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  await editor.fill(shifting.solutionCode)
  await button(page, '运行').click()
  const replay = page.getByRole('slider', { name: '回放进度' })
  await replay.fill('2')
  const board = page.locator('.tilemap')
  const originalBoard = await savedBoard(board)
  await editor.fill('')
  const saved = await savedWork(page)
  expect(saved[`pixel-repair-lab:arena-match:${shifting.id}:relaxed`]).toBeTruthy()
  await observeAndPause(page)
  const firstShift = shifting.shifts![0]
  const gate = firstShift.open![0]
  await expect(cell(page, gate.x, gate.y)).toHaveClass(/tile--wall/)
  for (let step = 0; step < firstShift.turn; step++) await control(page, 'next').click()
  await expect(page.getByTestId('arena-turn')).toContainText(`${firstShift.turn}/${shifting.maxTurns}`)
  await expect(board).toHaveAccessibleName(`机器人位于 ${shifting.start.x}，${shifting.start.y}`)
  await expect(cell(page, gate.x, gate.y)).toHaveClass(/tile--floor/)
  await expect(page.getByTestId('arena-shift-result').locator('[data-change="relocated"]').first()).toBeVisible()
  await expect(page.getByTestId('arena-turn-events').locator('[data-tactic]')).toHaveCount(3)
  await control(page, 'exit').click()
  await expect(replay).toHaveValue('2')
  expect(await savedBoard(board)).toBe(originalBoard)
  expect(await savedWork(page)).toEqual(saved)
  await expect(editor).toHaveValue('')
})

test('timed observation leaves an existing match paused with its saved board and remaining time', async ({ page }) => {
  await openChallenge(page, shifting.id)
  await button(page, '紧张').click()
  await button(page, '开始').click()
  await expect(page.getByTestId('arena-turn')).toContainText('1/' + shifting.maxTurns)
  await page.reload()
  const resume = button(page, '继续对局')
  await expect(resume).toBeEnabled()
  const timer = page.getByRole('progressbar', { name: '距离下一回合' })
  const remaining = await timer.getAttribute('value')
  const saved = await savedWork(page)
  const board = page.locator('.tilemap')
  const originalBoard = await savedBoard(board)
  await observeAndPause(page)
  await control(page, 'next').click()
  await control(page, 'next').click()
  await control(page, 'exit').click()
  await expect(resume).toBeEnabled()
  await expect(timer).toHaveAttribute('value', remaining!)
  expect(await savedBoard(board)).toBe(originalBoard)
  expect(await savedWork(page)).toEqual(saved)
  await resume.click()
  await expect(page.getByTestId('arena-turn')).toContainText('2/' + shifting.maxTurns)
})
