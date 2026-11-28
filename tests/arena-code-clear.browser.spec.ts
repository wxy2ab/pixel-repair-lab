import { expect, test, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'
import { challengeScoresKey, challengeScoreSeries, readChallengeScores } from '../src/web/challengeScore'

const bell = 'challenge-brass-bell-lane'
const bellPolicy = `def decide(state):
    turn = state["turn"]  # 已经走完的回合数，开场时是 0
    if turn == 0:
        return "right"
    if turn == 1:
        return "pick"
    if turn == 2:
        return "right"
    return "shoot-right"`

async function openBell(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/#challenge-browse')
  await page.locator(`[data-challenge-level="${bell}"]`).click()
  return page.getByTestId('arena-map-workspace')
}

async function expectBellClear(page: Page, mode: 'relaxed' | 'timed') {
  const summary = page.getByRole('region', { name: '通关总结' })
  await expect(summary).toBeVisible({ timeout: 25_000 })
  await expect(summary.locator('[data-score-metric="turns"]').getByRole('cell').first()).toHaveText('4')
  const saved = await page.evaluate(key => localStorage.getItem(key), challengeScoresKey)
  const series = challengeScoreSeries(readChallengeScores(saved), bell)
  expect(series).toHaveLength(1)
  expect(series[0].score).toMatchObject({ kind: 'arena', mode, goal: 'eliminate', turns: 4, passed: 1, total: 1 })
  expect(series[0].attempts).toHaveLength(1)
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('pixel-repair-lab:completed') ?? '[]').includes(id), bell)).toBe(true)
}

for (const mode of ['relaxed', 'timed'] as const) {
  test(`the pasted decide policy earns a four-turn ${mode} clear with the main run button`, async ({ page }) => {
    const match = await openBell(page)
    if (mode === 'timed') await page.getByRole('button', { name: '紧张', exact: true }).click()
    const editor = match.locator(mode === 'timed' ? '#realtime-python' : '#advanced-python')
    await editor.fill(bellPolicy)
    await match.getByRole('button', { name: mode === 'timed' ? '开始' : '运行', exact: true }).click()
    await expectBellClear(page, mode)
  })
}

test('Start checks the edited policy and lets the player fix a bad draft before turn one', async ({ page }) => {
  const match = await openBell(page)
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  const editor = match.locator('#realtime-python')
  await editor.fill('def decide(state):\n    return "guard"')
  await match.getByRole('button', { name: '应用策略', exact: true }).click()
  await expect(match.getByRole('button', { name: '替换策略', exact: true })).toBeEnabled()
  const start = match.getByRole('button', { name: '开始', exact: true })
  await editor.fill(bellPolicy + '\n无法过关')
  await start.click()
  await expect(match.getByRole('alert')).toBeVisible()
  await expect(start).toBeEnabled()
  await expect(match.getByTestId('arena-turn')).toHaveText('回合 0/12')
  await editor.fill(bellPolicy)
  await start.click()
  await expectBellClear(page, 'timed')
})

test('the elimination filter shows the new circuit alongside earlier pulse battles', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const battles = levels.filter(level => level.unit?.id === 'challenge-zone' && level.kind === 'arena' && level.objective.kind === 'eliminate')
  expect(battles.filter(level => level.order >= 2201 && level.order <= 2212)).toHaveLength(12)
  await page.goto('/#challenge-browse')
  const browse = page.getByRole('region', { name: '自由选关', exact: true })
  const type = browse.getByRole('combobox', { name: '类型', exact: true })
  const objective = browse.getByRole('combobox', { name: '对抗目标', exact: true })
  await type.selectOption('arena')
  await objective.selectOption('eliminate')
  await expect(browse.locator('[data-challenge-level]')).toHaveCount(battles.length)
  await expect(browse.locator('[data-challenge-level="challenge-neon-pinball-cup"]')).toBeVisible()
  await expect(browse.locator(`[data-challenge-level="${bell}"]`)).toBeVisible()
  await type.selectOption('warehouse')
  await expect(objective).toBeHidden()
  await expect(browse.locator('[data-type="warehouse"]').first()).toBeVisible()
})

test('a keyboard pulse victory is practice and a fresh Python victory earns the clear', async ({ page }) => {
  test.slow()
  const match = await openBell(page)
  await expect(match.getByRole('button', { name: '查看地图', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await match.getByRole('button', { name: '控制芽芽', exact: true }).click()
  await expect(match.getByTestId('arena-turn')).toContainText('回合 0/')
  await expect(match.getByRole('button', { name: '暂停对局' })).toHaveCount(0)
  await match.getByRole('button', { name: '开始', exact: true }).click()
  await expect(match.getByRole('button', { name: '暂停对局' })).toBeEnabled()
  const board = match.locator('.station-flat-board')
  await board.focus()
  const keys = ['d', 'e', 'ArrowRight', 'Shift+ArrowRight']
  for (const [turn, key] of keys.entries()) {
    await page.keyboard.press(key)
    await expect(match.getByTestId('arena-turn')).toContainText(`回合 ${turn + 1}/`)
  }
  await expect(match.locator('.arena-combat-goal')).toContainText('对手已停机 1/1')
  await expect(match.getByText(/练习结束/).first()).toBeVisible()
  const summary = page.getByRole('region', { name: '通关总结' })
  await expect(summary).toHaveCount(0)
  expect(await page.evaluate(id => ({
    completed: JSON.parse(localStorage.getItem('pixel-repair-lab:completed') ?? '[]').includes(id),
    score: JSON.parse(localStorage.getItem('pixel-repair-lab:challenge-scores') ?? '{}')[id] ?? null,
  }), bell)).toEqual({ completed: false, score: null })

  await match.getByRole('button', { name: '编写通关策略', exact: true }).click()
  const editor = match.locator('#realtime-python')
  await expect(editor).toBeFocused()
  await expect(match.getByRole('button', { name: '暂停对局' })).toBeHidden()
  await match.getByRole('button', { name: '保存步骤到代码' }).click()
  await expect(editor).toHaveValue(/"right",\s*"pick",\s*"right",\s*"shoot-right",/)
  await match.getByRole('button', { name: '用 Python 从头挑战', exact: true }).click()
  await expect(match.getByRole('button', { name: '暂停对局' })).toBeEnabled()
  await match.getByRole('button', { name: '查看地图', exact: true }).click()
  await board.press('ArrowLeft')
  await board.press('g')
  await expectBellClear(page, 'timed')
})
