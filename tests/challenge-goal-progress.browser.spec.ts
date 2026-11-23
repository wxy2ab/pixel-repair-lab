import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'
import type { ChallengeGoals } from '../src/web/challengeGoals'
import type { ChallengeScore, ChallengeScoreHistory } from '../src/web/challengeScore'

const salvageId = 'limited-battery-salvage'
const arenaId = 'challenge-junction-race'
const pendingGoals = '/#challenge-goals'
const summary = (page: Page) => page.getByRole('region', { name: '通关总结', exact: true })
const card = (page: Page, id: string, series: string) =>
  page.locator(`article[data-goal-level="${id}"][data-goal-series="${series}"]`)
const progress = (goal: Locator) => goal.getByRole('region', { name: '重玩进度', exact: true })
const attempt = (chart: Locator, ordinal: number) => chart.locator(`[data-goal-attempt="${ordinal}"]`)

async function catalogFor(request: APIRequestContext): Promise<Catalog> {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  return response.json()
}

async function seed(page: Page, history: ChallengeScoreHistory, goals?: ChallengeGoals) {
  await page.addInitScript(({ history, goals }) => {
    const scoresKey = 'pixel-repair-lab:challenge-scores'
    const goalsKey = 'pixel-repair-lab:challenge-goals'
    if (!localStorage.getItem(scoresKey)) localStorage.setItem(scoresKey, JSON.stringify(history))
    if (goals && !localStorage.getItem(goalsKey)) localStorage.setItem(goalsKey, JSON.stringify(goals))
    if (!localStorage.getItem('pixel-repair-lab:locale')) localStorage.setItem('pixel-repair-lab:locale', 'zh')
  }, { history, goals })
}

async function showGridResult(page: Page, source: string) {
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
}

async function expectRemaining(chart: Locator, ordinal: number, remaining: number) {
  await expect(attempt(chart, ordinal)).toHaveAttribute('data-goal-remaining', String(remaining))
}

test('pending progress tracks judged replays, shows advice after a plateau, and keeps the series when the target changes', async ({ page, request }) => {
  test.slow()
  const catalog = await catalogFor(request)
  const level = catalog.levels.find(candidate => candidate.id === salvageId)
  if (level?.kind !== 'grid' || level.turnLimit === undefined) throw new Error('Missing the salvage challenge')
  const target = level.turnLimit
  const baseline = target + 4
  const fast = cardsToPython(level.cards, level.solutionCards)
  const detour = 'move("right")\nmove("left")\n'
  const closer = detour + fast
  const slower = detour.repeat(2) + fast
  // Allow real valid runs at 17, 19, or 21 turns and a genuine over-budget failure.
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(candidate => candidate.id === level.id ? { ...level, turnLimit: baseline } : candidate),
  } }))
  const initialScore: ChallengeScore = { kind: 'grid', turns: baseline, passed: 1, total: 1 }
  await seed(page, { [level.id]: { 'grid:1': { latest: initialScore, best: initialScore } } })

  await page.goto(`/#challenge-records/${level.id}`)
  const editor = page.getByRole('region', { name: '下次小目标', exact: true })
  await editor.getByRole('spinbutton', { name: '进步量', exact: true }).fill('4')
  await editor.getByRole('button', { name: '保存目标', exact: true }).click()
  await expect(editor.locator('[data-goal-target]')).toHaveText(String(target))

  await page.goto(pendingGoals)
  const goal = card(page, level.id, 'grid:1')
  const chart = progress(goal)
  const replay = goal.getByRole('button', { name: '重玩这关', exact: true })
  await expect(goal.locator('[data-goal-attempt]')).toHaveCount(0)
  await replay.click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await showGridResult(page, `${slower}\nmove("right")`)
  await expect(page.locator('.output-panel .error-message')).toContainText('回合已用完')
  await page.getByRole('region', { name: '失败复盘', exact: true }).getByRole('button', { name: '直接重试' }).click()
  await showGridResult(page, closer)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '2')
  for (let count = 0; count < 2; count++) {
    await summary(page).getByRole('button', { name: '再玩一次', exact: true }).click()
    await showGridResult(page, slower)
    await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '4')
  }

  await page.goto(pendingGoals)
  await expect(chart.locator('[data-goal-attempt]')).toHaveCount(4)
  await expect(attempt(chart, 1)).toContainText('未通关')
  await expect(attempt(chart, 1)).toHaveAttribute('data-goal-failed', 'true')
  await expect(attempt(chart, 1)).not.toHaveAttribute('data-goal-remaining', /.+/)
  await expectRemaining(chart, 2, 2)
  await expectRemaining(chart, 3, 4)
  await expectRemaining(chart, 4, 4)
  await expect(chart.locator('[data-goal-closest]')).toHaveAttribute('data-goal-attempt', '2')
  await expect(goal.locator('[data-goal-progress-tip]')).toHaveCount(0)

  await replay.click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await showGridResult(page, slower)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '4')
  await page.goto(pendingGoals)
  await expectRemaining(chart, 5, 4)
  await expect(goal.locator('[data-goal-progress-tip]')).toContainText('3 次')
  await expect(goal.locator('[data-goal-progress-tip]')).toContainText('少走一步')
  await page.reload()
  await expect(chart.locator('[data-goal-attempt]')).toHaveCount(5)
  await expect(chart.locator('[data-goal-closest]')).toHaveAttribute('data-goal-attempt', '2')

  await attempt(chart, 3).getByRole('button', { name: /复盘第 3 次重玩/ }).click()
  const comparison = goal.getByRole('region', { name: '重玩对比', exact: true })
  await expect(comparison).toContainText('第 3 次')
  await expect(comparison).toContainText('第 2 次')
  await expect(comparison.locator('[data-goal-extra-turn]')).toHaveCount(2)
  await expect(comparison.locator('[data-goal-review-advice]')).toBeVisible()
  await attempt(chart, 1).getByRole('button', { name: /复盘第 1 次重玩/ }).click()
  await expect(comparison.locator('[data-goal-replay-failure]')).toContainText('回合')
  await expect(comparison.getByRole('button', { name: '按原玩法重玩', exact: true })).toBeVisible()
  await comparison.getByRole('button', { name: '关闭复盘', exact: true }).click()
  await expect(comparison).toHaveCount(0)

  await goal.getByRole('button', { name: '调整目标', exact: true }).click()
  const amount = goal.getByRole('spinbutton', { name: '进步量', exact: true })
  await expect(amount).toHaveValue('4')
  await amount.fill('2')
  await goal.getByRole('button', { name: '保存目标', exact: true }).click()
  await expect(goal.getByText(`≤ ${target + 2}`, { exact: true })).toBeVisible()
  await expect(chart.locator('[data-goal-attempt]')).toHaveCount(5)
  await expectRemaining(chart, 2, 0)
  await expectRemaining(chart, 5, 2)
  await expect(chart.locator('[data-goal-closest]')).toHaveAttribute('data-goal-attempt', '2')
  await expect(goal.locator('[data-goal-progress-tip]')).toHaveCount(0)
  await page.reload()
  await expectRemaining(chart, 2, 0)
  await expectRemaining(chart, 5, 2)

  await replay.click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await showGridResult(page, closer)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-achieved', 'true')
})

test('timed and relaxed progress stay independent and fit the bilingual mobile view', async ({ page, request }) => {
  const { levels } = await catalogFor(request)
  const level = levels.find(candidate => candidate.id === arenaId)
  if (level?.kind !== 'arena' || level.objective.kind !== 'score') throw new Error('Missing the junction arena')
  const total = 1 + (level.variants?.length ?? 0)
  const relaxedSeries = `arena:relaxed:score:${total}`
  const timedSeries = 'arena:timed:score:1'
  const relaxed: ChallengeScore = { kind: 'arena', mode: 'relaxed', goal: 'score', turns: 15, score: 4, passed: total, total }
  const timed: ChallengeScore = { ...relaxed, mode: 'timed', score: 6, passed: 1, total: 1 }
  await seed(page, { [level.id]: {
    [relaxedSeries]: { latest: relaxed, best: { ...relaxed, score: 5 } },
    [timedSeries]: { latest: timed, best: timed },
  } }, { [level.id]: {
    [relaxedSeries]: { metricId: 'score', baseline: 4, target: 7, preference: 'higher', lastReplayActual: 4,
      attempts: 3, replays: [5, 4, null] },
    [timedSeries]: { metricId: 'score', baseline: 4, target: 7, preference: 'higher', lastReplayActual: 6,
      attempts: 6, replays: [null, 5, 6, 6] },
  } })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(pendingGoals)
  const relaxedCard = card(page, level.id, relaxedSeries)
  const timedCard = card(page, level.id, timedSeries)
  const relaxedChart = progress(relaxedCard)
  const timedChart = progress(timedCard)
  await expect(relaxedCard.getByText('从容', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('紧张', { exact: true })).toBeVisible()
  await expect(relaxedChart.locator('[data-goal-attempt]')).toHaveCount(3)
  await expect(timedChart.locator('[data-goal-attempt]')).toHaveCount(4)
  await expectRemaining(relaxedChart, 1, 2)
  await expect(attempt(relaxedChart, 3)).toContainText('未通关')
  await expect(attempt(timedChart, 1)).toHaveCount(0)
  await expect(attempt(timedChart, 3)).toContainText('未通关')
  await expect(timedChart).toContainText('较早的重玩缺少逐次记录')
  await expectRemaining(timedChart, 5, 1)
  await expectRemaining(timedChart, 6, 1)
  await expect(timedChart.locator('[data-goal-closest]')).toHaveAttribute('data-goal-attempt', '5')
  await expect(relaxedChart.locator('[data-goal-closest]')).toHaveAttribute('data-goal-attempt', '1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  const englishChart = timedCard.getByRole('region', { name: 'Replay progress', exact: true })
  await expect(englishChart).toBeVisible()
  await expect(relaxedCard.getByText('Relaxed', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('Timed', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await attempt(englishChart, 4).getByRole('button', { name: /Review replay 4/ }).click()
  const comparison = timedCard.getByRole('region', { name: 'Compare replays', exact: true })
  await expect(comparison).toContainText('Replay 4')
  await expect(comparison).toContainText('Replay 5')
  await expect(comparison.locator('[data-goal-review-advice]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await comparison.getByRole('button', { name: 'Replay in the same mode', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Timed', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto(pendingGoals)
  await relaxedCard.getByRole('button', { name: 'Replay challenge', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Relaxed', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('score review identifies pickups recorded in the closer round and replays the same pace', async ({ page, request }) => {
  const catalog = await catalogFor(request)
  const level = catalog.levels.find(candidate => candidate.id === arenaId)
  if (level?.kind !== 'arena' || level.objective.kind !== 'score') throw new Error('Missing the junction arena')
  // Compact scoring map with stationary rivals so both real runs win with different pickups.
  const scoringMap = {
    ...level, start: { x: 1, y: 1 }, variants: [], maxTurns: 8,
    tiles: ['#########', '#.......#', '#.......#', '#########'],
    opponents: level.opponents.map((opponent, index) => {
      const start = { x: index + 5, y: 2 }
      return { ...opponent, start, policy: { kind: 'patrol', path: [start] } }
    }),
    items: [1, 2, 3, 7].map((x, index) => ({ id: `review-part-${index + 1}`, x, y: 1 })),
  }
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog, levels: catalog.levels.map(candidate => candidate.id === level.id ? scoringMap : candidate),
  } }))
  const series = 'arena:relaxed:score:1'
  const initial: ChallengeScore = { kind: 'arena', mode: 'relaxed', goal: 'score', score: 1, turns: 8, passed: 1, total: 1 }
  await seed(page, { [level.id]: { [series]: { latest: initial, best: initial } } }, { [level.id]: {
    [series]: { metricId: 'score', baseline: 1, target: 4, preference: 'higher', attempts: 0, lastReplayActual: null, replays: [] },
  } })

  await page.goto(pendingGoals)
  const goal = card(page, level.id, series)
  await goal.getByRole('button', { name: '重玩这关', exact: true }).click()
  const code = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const run = page.getByRole('button', { name: '运行', exact: true })
  const replay = page.getByRole('slider', { name: '回放进度' })
  await code.fill('# own-review-code\npick()\nwhile True:\n    wait()')
  await run.click()
  await replay.press('End')
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '3')
  await summary(page).getByRole('button', { name: '再玩一次', exact: true }).click()
  await code.fill('pick()\nmove("right")\npick()\nmove("right")\npick()\nwhile True:\n    wait()')
  await run.click()
  await replay.press('End')
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '1')

  await page.goto(pendingGoals)
  await attempt(progress(goal), 1).getByRole('button', { name: /复盘第 1 次重玩/ }).click()
  const comparison = goal.getByRole('region', { name: '重玩对比', exact: true })
  await expect(comparison.locator('[data-goal-missed-item]')).toHaveCount(2)
  await expect(comparison.locator('[data-goal-review-advice]')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('pixel-repair-lab:challenge-goals'))).not.toContain('own-review-code')
  await comparison.getByRole('button', { name: '按原玩法重玩', exact: true }).click()
  await expect(page.getByRole('button', { name: '从容', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
