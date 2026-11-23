import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'
import type { ChallengeGoals } from '../src/web/challengeGoals'
import type { ChallengeScoreHistory } from '../src/web/challengeScore'

const goalsRoute = '/#challenge-goals'
const salvageId = 'limited-battery-salvage'
const algorithmId = 'challenge-quiet-power-window'
const arenaId = 'challenge-junction-race'

function goalCard(page: Page, id: string, series: string) {
  return page.locator(`article[data-goal-level="${id}"][data-goal-series="${series}"]`)
}

function focusResult(page: Page) {
  return page.getByRole('region', { name: '重玩改进对照', exact: true })
}

async function catalogFor(request: APIRequestContext): Promise<Catalog> {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  return response.json()
}

async function seed(page: Page, history: ChallengeScoreHistory, goals: ChallengeGoals) {
  await page.addInitScript(({ history, goals }) => {
    const scoresKey = 'pixel-repair-lab:challenge-scores'
    const goalsKey = 'pixel-repair-lab:challenge-goals'
    if (!localStorage.getItem(scoresKey)) localStorage.setItem(scoresKey, JSON.stringify(history))
    if (!localStorage.getItem(goalsKey)) localStorage.setItem(goalsKey, JSON.stringify(goals))
    if (!localStorage.getItem('pixel-repair-lab:locale')) localStorage.setItem('pixel-repair-lab:locale', 'zh')
  }, { history, goals })
}

async function openReplayReview(card: Locator, number: number) {
  await card.locator(`[data-goal-attempt="${number}"]`).getByRole('button', { name: new RegExp(`复盘第 ${number} 次重玩`) }).click()
  const review = card.getByRole('region', { name: '重玩对比', exact: true })
  await expect(review).toBeVisible()
  return review
}

async function runPython(page: Page, source: string) {
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
}

async function runGrid(page: Page, source: string) {
  await runPython(page, source)
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
}

test('a route focus compares the chosen repeated segment after a real replay', async ({ page, request }) => {
  const catalog = await catalogFor(request)
  const level = catalog.levels.find(candidate => candidate.id === salvageId)
  if (level?.kind !== 'grid' || level.turnLimit === undefined) throw new Error('Missing the salvage challenge')
  const target = level.turnLimit
  const baseline = target + 4
  const reference = cardsToPython(level.cards, level.solutionCards)
  const detour = 'move("right")\nmove("left")\n'
  const closer = detour + reference
  const slower = detour.repeat(2) + reference
  // Both detours must be valid, while their real routes still differ.
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(candidate => candidate.id === level.id ? { ...level, turnLimit: baseline } : candidate),
  } }))
  const series = 'grid:1'
  const score = { kind: 'grid', turns: baseline, passed: 1, total: 1 } as const
  await seed(page, { [level.id]: { [series]: { latest: score, best: score } } }, { [level.id]: {
    [series]: { metricId: 'turns', baseline, target, preference: 'lower', lastReplayActual: null, attempts: 0, replays: [] },
  } })

  await page.goto(goalsRoute)
  const card = goalCard(page, level.id, series)
  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  const replayAgain = summary.getByRole('button', { name: '再玩一次', exact: true })
  const pythonTab = page.getByRole('tab', { name: 'Python', exact: true })
  await card.getByRole('button', { name: '重玩这关', exact: true }).click()
  await pythonTab.click()
  await runGrid(page, closer)
  await expect(summary.getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '2')
  await replayAgain.click()
  await runGrid(page, slower)
  await expect(summary.getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '4')

  await page.goto(goalsRoute)
  const review = await openReplayReview(card, 2)
  const options = review.getByRole('group', { name: '下次想改进什么', exact: true })
  const segmentLabel = /少走一次第 \d+ 回合经过的那段路/
  const routeOption = options.getByRole('radio', { name: segmentLabel }).first()
  await routeOption.check()
  await review.getByRole('button', { name: '按原玩法重玩', exact: true }).click()
  const reminder = review.getByRole('region', { name: '重玩前提醒', exact: true })
  await expect(reminder).toContainText(segmentLabel)
  await reminder.getByRole('button', { name: '开始重玩', exact: true }).click()
  await pythonTab.click()
  await expect(focusResult(page)).toHaveCount(0)
  await runGrid(page, closer)

  const result = focusResult(page)
  await expect(result).toBeVisible()
  await expect(result).toContainText(segmentLabel)
  await expect(result).toContainText('第 2 次')
  await expect(result).toHaveAttribute('data-replay-focus-status', 'improved')
  await expect(result.locator('[data-replay-focus-before="3"]')).toHaveText('3 次')
  await expect(result.locator('[data-replay-focus-after="2"]')).toHaveText('2 次')
  await expect(summary.getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '2')

  await replayAgain.click()
  await runGrid(page, closer)
  await expect(summary.getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '2')
  await expect(result).toHaveCount(0)
})

test('skipping the reminder still compares the chosen case when other cases fail', async ({ page, request }) => {
  const catalog = await catalogFor(request)
  const level = catalog.levels.find(candidate => candidate.id === algorithmId)
  if (level?.kind !== 'algorithm') throw new Error('Missing the algorithm challenge')
  const total = level.cases.length
  const series = `algorithm:${total}`
  const score = { kind: 'algorithm', checks: 5, passed: total, total } as const
  await seed(page, { [level.id]: { [series]: { latest: score, best: score } } }, { [level.id]: {
    [series]: { metricId: 'checks', baseline: 5, target: 3, preference: 'lower', lastReplayActual: null, attempts: 0, replays: [] },
  } })

  await page.goto(goalsRoute)
  const card = goalCard(page, level.id, series)
  await card.getByRole('button', { name: '重玩这关', exact: true }).click()
  await runPython(page, 'def quiet_stretch(draws, limit):\n    return -1')
  await expect(page.getByText(`0/${total} 个用例通过`, { exact: true })).toBeVisible()
  await page.goto(goalsRoute)
  const review = await openReplayReview(card, 1)
  await review.getByRole('radio', { name: '先检查第 1 个用例', exact: true }).check()
  await review.getByRole('button', { name: '跳过提醒，直接重玩', exact: true }).click()
  await expect(page.getByRole('region', { name: '重玩前提醒', exact: true })).toHaveCount(0)
  await runPython(page, 'def quiet_stretch(draws, limit):\n    if len(draws) == 7:\n        return [1, 4, 5]\n    return -1')
  await expect(page.getByText(`1/${total} 个用例通过`, { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '通关总结', exact: true })).toHaveCount(0)
  const result = focusResult(page)
  await expect(result).toContainText('第 1 个用例')
  await expect(result).toHaveAttribute('data-replay-focus-status', 'improved')
  await expect(result.locator('[data-replay-focus-before="0"]')).toHaveText('未通过')
  await expect(result.locator('[data-replay-focus-after="1"]')).toHaveText('通过')
})

test('a timed replay can leave review without choosing an improvement point', async ({ page, request }) => {
  const { levels } = await catalogFor(request)
  const level = levels.find(candidate => candidate.id === arenaId)
  if (level?.kind !== 'arena' || level.objective.kind !== 'score') throw new Error('Missing the junction arena')
  const series = 'arena:timed:score:1'
  const score = { kind: 'arena', mode: 'timed', goal: 'score', score: 4, turns: 16, passed: 1, total: 1 } as const
  await seed(page, { [level.id]: { [series]: { latest: score, best: score } } }, { [level.id]: {
    [series]: { metricId: 'score', baseline: 4, target: 6, preference: 'higher', lastReplayActual: 4, attempts: 1, replays: [4] },
  } })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(goalsRoute)
  const review = await openReplayReview(goalCard(page, level.id, series), 1)
  await expect(review.getByRole('radio').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await expect(review.getByRole('radio', { name: '这次先不选', exact: true })).toBeChecked()
  await review.getByRole('button', { name: '按原玩法重玩', exact: true }).click()
  await expect(page.getByRole('button', { name: '紧张', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: '重玩前提醒', exact: true })).toHaveCount(0)
  await expect(focusResult(page)).toHaveCount(0)
})
