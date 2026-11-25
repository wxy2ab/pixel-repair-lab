import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { runArena } from '../src/engine/arena'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'

async function catalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  return levels
}

async function openChallenge(page: Page, id: string) {
  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await page.locator(`[data-challenge-level="${id}"]`).click()
}

test('long algorithm challenge results stay within a phone viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const levels = await catalog(request)
  const level = levels.find(item => item.id === 'challenge-security-rescue-route')
  if (level?.kind !== 'algorithm') throw new Error('Missing the rescue route challenge')

  await page.goto('/#challenge-zone')
  await openChallenge(page, level.id)
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(level.solutionCode)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByText(`${level.cases.length}/${level.cases.length} 个用例通过`, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('a standalone salvage challenge enforces its turn budget and can be won with mouse cards', async ({ page, request }) => {
  const levels = await catalog(request)
  const level = levels.find(item => item.id === 'limited-battery-salvage')
  if (level?.kind !== 'grid' || level.turnLimit === undefined) throw new Error('Missing the salvage challenge')

  await page.goto('/#challenge-zone')
  await openChallenge(page, level.id)
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
  await expect(page.getByText('操作引导', { exact: true })).toHaveCount(0)
  await expect(page.getByText('任务提示', { exact: true })).toHaveCount(0)
  const budget = page.getByTestId('grid-turn-budget')
  await expect(budget).toContainText(`0 / ${level.turnLimit}`)
  const program = cardsToPython(level.cards, level.solutionCards)
  const run = page.getByRole('button', { name: '运行', exact: true })

  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(program + '\nmove("right")')
  await run.click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(page.locator('.output-panel .error-message')).toContainText('回合已用完')
  await expect(budget).toContainText(`${level.turnLimit} / ${level.turnLimit}`)

  const review = page.getByRole('region', { name: '失败复盘', exact: true })
  await review.getByRole('button', { name: '复盘这次' }).click()
  await expect(review).toContainText(`第 ${program.split('\n').length + 1} 行`)
  await expect(review).toContainText(`本场景用了 ${level.turnLimit} / ${level.turnLimit} 回合`)
  await review.getByRole('button', { name: '直接重试' }).click()
  const draft = page.getByRole('textbox', { name: '编写 Python', exact: true })
  await expect(draft).toBeFocused()
  await expect(draft).toHaveValue(program + '\nmove("right")')
  await expect(budget).toContainText(`0 / ${level.turnLimit}`)

  await page.getByRole('tab', { name: '指令卡', exact: true }).click()
  for (const card of level.solutionCards) await page.locator(`[data-add-card="${card.cardId}"]`).click()
  await expect(page.getByTestId('generated-code')).toHaveText(program)
  await run.click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(page.locator('.output-panel .win-message')).toContainText('任务完成')
  await expect(budget).toContainText(`${level.turnLimit} / ${level.turnLimit}`)
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await expect(page.locator(`[data-challenge-level="${level.id}"] [aria-label="已完成"]`)).toBeVisible()
})

test('both arena modes offer actual failure feedback and preserve drafts on retry', async ({ page }) => {
  await page.goto('/#challenge-zone')
  await openChallenge(page, 'challenge-junction-race')
  const draft = page.getByRole('textbox', { name: '编写 Python', exact: true })
  await draft.fill('wait()')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('slider', { name: '回放进度' }).press('End')
  const review = page.getByRole('region', { name: '失败复盘', exact: true })
  await review.getByRole('button', { name: '复盘这次' }).click()
  await expect(review).toContainText('场景 1 / 3')
  await expect(review).toContainText(/你的得分是 0，得分最高的对手有 \d+ 分/)
  await expect(review).toContainText(/还需要 \d+ 分/)
  await review.getByRole('button', { name: '直接重试' }).click()
  await expect(draft).toHaveValue('wait()')
  await expect(draft).toBeFocused()

  await openChallenge(page, 'challenge-blackout-extraction')
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  const policy = page.locator('#realtime-python')
  const customPolicy = 'def decide(state):\n    return "wait"\n# my draft'
  await policy.fill(customPolicy)
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await review.getByRole('button', { name: '复盘这次' }).click({ timeout: 20_000 })
  await expect(review).toContainText(/已用 \d+ 回合/)
  await expect(review).toContainText('被对手拦住了')
  await expect(review).toContainText('还差 2 件撤离所需的物品')
  await review.getByRole('button', { name: '直接重试' }).click()
  await expect(page.getByRole('button', { name: '开始', exact: true })).toBeEnabled()
  await expect(policy).toHaveValue(customPolicy)
})

test('both arena modes record their actual turns and score once, each with its own history', async ({ page, request }) => {
  test.slow()
  const levels = await catalog(request)
  const level = levels.find(item => item.id === 'challenge-junction-race')
  if (level?.kind !== 'arena') throw new Error('Missing the junction arena')

  const reference = runArena(level, level.solutionCode)
  expect(reference.won).toBe(true)
  const actions = reference.frames.map(({ events }) => {
    const player = events.find(event => event.actorId === 'player')
    if (!player) throw new Error('The reference did not generate a player action')
    return player.direction ?? player.action
  })
  const policySource = `def decide(state):\n    return ${JSON.stringify(actions)}[state["turn"]]`

  await page.goto('/#challenge-zone')
  await openChallenge(page, level.id)
  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  const turns = summary.locator('[data-score-metric="turns"]').getByRole('cell')
  const points = summary.locator('[data-score-metric="score"]').getByRole('cell')
  const slider = page.getByRole('slider', { name: '回放进度' })
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(level.solutionCode)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await slider.press('End')
  await expect(summary).toBeVisible()
  await expect(turns.first()).toContainText(String(reference.final.turn))
  await expect(points.first()).toContainText(String(reference.final.actors[0].score))
  await expect(turns.nth(1)).not.toContainText(/\d/)
  await slider.press('Home')
  await slider.press('End')
  await expect(turns.nth(1)).not.toContainText(/\d/)

  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await expect(summary).toHaveCount(0)
  const policy = page.locator('#realtime-python')
  await policy.fill(policySource)
  await page.getByRole('button', { name: '应用策略', exact: true }).click()
  await expect(page.getByText('策略已启用', { exact: true })).toBeVisible()
  const start = page.getByRole('button', { name: '开始', exact: true })
  await start.click()
  await expect(summary).toBeVisible({ timeout: 40_000 })
  await expect(turns.first()).toContainText(String(reference.final.turn))
  await expect(points.first()).toContainText(String(reference.final.actors[0].score))
  await expect(turns.nth(1)).not.toContainText(/\d/)
  await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(start).toBeEnabled()
  await expect(policy).toHaveValue(policySource)
})

test('noncombat robot races run on their alternate layouts and expose live mouse controls', async ({ page, request }) => {
  test.slow()
  const levels = await catalog(request)
  const matches = levels.filter(level => level.kind === 'arena' && level.unit?.id === 'challenge-zone' && !level.combat && !level.shifts?.length)
  expect(matches.length).toBeGreaterThanOrEqual(2)

  await page.goto('/#challenge-zone')
  for (const level of matches) {
    if (level.kind !== 'arena') continue
    await openChallenge(page, level.id)
    await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
    await expect(page.getByText('任务提示', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('list', { name: '对抗比分' }).getByRole('listitem')).toHaveCount(1 + level.opponents.length)
    await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(level.solutionCode)
    await page.getByRole('button', { name: '运行', exact: true }).click()
    const slider = page.getByRole('slider', { name: '回放进度' })
    await expect(slider).toBeVisible()
    await slider.press('End')
    await expect(page.locator('.teaching-panel .win-message')).toBeVisible()
    const cases = 1 + (level.variants?.length ?? 0)
    if (cases > 1) await expect(page.getByText(`场景通过 ${cases}/${cases}`, { exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByRole('group', { name: '下一回合动作' }).getByRole('button', { name: '向左', exact: true })).toBeVisible()
})

test('a shifting arena updates gates, batteries and rival tactics in both Python replay and live mouse play', async ({ page, request }) => {
  const levels = await catalog(request)
  const level = levels.find(item => item.id === 'challenge-shifting-grid')
  if (level?.kind !== 'arena' || !level.shifts?.length) throw new Error('Missing the shifting arena')
  expect(level.opponents.filter(opponent => opponent.policy.kind === 'adaptive')).toHaveLength(3)
  expect(level.shifts.length).toBeGreaterThanOrEqual(2)
  const first = level.shifts[0]
  const gate = first.open?.[0]
  if (!gate) throw new Error('The first shift must open a visible gate')

  await page.goto('/#challenge-zone')
  await openChallenge(page, level.id)
  await expect(page.getByRole('heading', { name: level.title.zh, level: 1, exact: true })).toBeVisible()
  await expect(page.getByText('任务提示', { exact: true })).toHaveCount(0)
  const board = page.getByTestId('arena-dynamic-board')
  const target = board.locator(`.tile[data-x="${gate.x}"][data-y="${gate.y}"]`)
  const countdown = page.getByTestId('arena-shift-countdown')
  const report = page.getByTestId('arena-shift-result')
  const turn = page.getByTestId('arena-turn')

  await expect(target).toHaveClass(/tile--wall/)
  await expect(countdown).toHaveAttribute('data-next-turn', String(first.turn))
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(level.solutionCode)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const slider = page.getByRole('slider', { name: '回放进度' })
  await expect(slider).toBeVisible()
  await page.getByRole('button', { name: '暂停回放', exact: true }).click()
  await slider.press('Home')
  for (let round = 0; round < first.turn; round++) await slider.press('ArrowRight')
  await expect(turn).toContainText(`${first.turn}/${level.maxTurns}`)
  await expect(target).toHaveClass(/tile--floor/)
  await expect(report).toHaveAttribute('data-shift-turn', String(first.turn))
  await expect(report.locator(`[data-change="opened"][data-x="${gate.x}"][data-y="${gate.y}"]`)).toBeVisible()
  await expect(report.locator('[data-change="relocated"]').first()).toBeVisible()
  const tactics = page.getByTestId('arena-turn-events').locator('[data-tactic]')
  await expect(tactics).toHaveCount(3)
  await slider.press('End')
  await expect(page.locator('.teaching-panel .win-message')).toBeVisible()
  const cases = 1 + (level.variants?.length ?? 0)
  if (cases > 1) await expect(page.getByText(`场景通过 ${cases}/${cases}`, { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await expect(target).toHaveClass(/tile--wall/)
  await page.getByRole('button', { name: '开始', exact: true }).click()
  const move = [
    { name: '向上', x: level.start.x, y: level.start.y - 1 },
    { name: '向右', x: level.start.x + 1, y: level.start.y },
    { name: '向下', x: level.start.x, y: level.start.y + 1 },
    { name: '向左', x: level.start.x - 1, y: level.start.y },
  ].find(({ x, y }) => level.tiles[y]?.[x] === '.')
  if (!move) throw new Error('The starting tile must have a walkable neighbor')
  await page.getByRole('group', { name: '下一回合动作' }).getByRole('button', { name: move.name, exact: true }).click()
  await expect(board.getByRole('img', { name: `机器人位于 ${move.x}，${move.y}`, exact: true })).toBeVisible()
  await expect(target).toHaveClass(/tile--floor/, { timeout: 15_000 })
  await expect(report).toHaveAttribute('data-shift-turn', String(first.turn))
  await expect(report.locator('[data-change="opened"]').first()).toBeVisible()
  await expect(tactics).toHaveCount(3)
})
