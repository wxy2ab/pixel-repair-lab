import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'
import type { ChallengeGoals } from '../src/web/challengeGoals'
import type { ReplayFocusHistory } from '../src/web/challengeReplayFocusHistory'
import type { ChallengeScoreHistory } from '../src/web/challengeScore'

const goalsRoute = '/#challenge-goals'
const historyRoute = '/#challenge-goals/focus-history'
const salvageId = 'limited-battery-salvage'
const algorithmId = 'challenge-quiet-power-window'
const arenaId = 'challenge-junction-race'

function goalCard(page: Page, id: string, series: string) {
  return page.locator(`article[data-goal-level="${id}"][data-goal-series="${series}"]`)
}

function records(page: Page) {
  return page.getByRole('tabpanel').locator('[data-focus-history-record]')
}

function focusResult(page: Page) {
  return page.getByRole('region', { name: '重玩改进对照', exact: true })
}

async function catalogFor(request: APIRequestContext): Promise<Catalog> {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  return response.json()
}

async function seed(page: Page, scores: ChallengeScoreHistory, goals: ChallengeGoals, history: ReplayFocusHistory = []) {
  await page.addInitScript(({ scores, goals, history }) => {
    const scoresKey = 'pixel-repair-lab:challenge-scores'
    const goalsKey = 'pixel-repair-lab:challenge-goals'
    const historyKey = 'pixel-repair-lab:replay-focus-history'
    if (!localStorage.getItem(scoresKey)) localStorage.setItem(scoresKey, JSON.stringify(scores))
    if (!localStorage.getItem(goalsKey)) localStorage.setItem(goalsKey, JSON.stringify(goals))
    if (!localStorage.getItem(historyKey)) localStorage.setItem(historyKey, JSON.stringify(history))
    if (!localStorage.getItem('pixel-repair-lab:locale')) localStorage.setItem('pixel-repair-lab:locale', 'zh')
  }, { scores, goals, history })
}

async function openReview(card: Locator, number: number) {
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

test('a route improvement stays in history after clearing the goal and rebases the next replay', async ({ page, request }) => {
  const catalog = await catalogFor(request)
  const level = catalog.levels.find(candidate => candidate.id === salvageId)
  if (level?.kind !== 'grid' || level.turnLimit === undefined) throw new Error('Missing the salvage challenge')
  const target = level.turnLimit
  const baseline = target + 4
  const route = cardsToPython(level.cards, level.solutionCards)
  const detour = 'move("right")\nmove("left")\n'
  // Keep the real route and pickups while allowing both detours to finish.
  await page.route('**/api/levels', requestRoute => requestRoute.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(candidate => candidate.id === level.id ? { ...level, turnLimit: baseline } : candidate),
  } }))
  const series = 'grid:1'
  const score = { kind: 'grid', turns: baseline, passed: 1, total: 1 } as const
  await seed(page, { [level.id]: { [series]: { latest: score, best: score } } }, { [level.id]: {
    [series]: { metricId: 'turns', baseline, target, preference: 'lower', lastReplayActual: null, attempts: 0, replays: [] },
  } })

  const python = page.getByRole('tab', { name: 'Python', exact: true })
  await page.goto(goalsRoute)
  const card = goalCard(page, level.id, series)
  await card.getByRole('button', { name: '重玩这关', exact: true }).click()
  await python.click()
  await runGrid(page, detour.repeat(2) + route)
  await expect(page.getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '4')
  await page.goto(historyRoute)
  await expect(records(page)).toHaveCount(0)
  await page.goto(goalsRoute)
  const review = await openReview(card, 1)
  const choice = review.getByRole('radio', { name: /少走一次第 \d+ 回合经过的那段路/ }).first()
  await choice.check()
  await review.getByRole('button', { name: '跳过提醒，直接重玩', exact: true }).click()
  await python.click()
  await runGrid(page, detour + route)
  await expect(focusResult(page)).toHaveAttribute('data-replay-focus-status', 'improved')

  await page.goto(goalsRoute)
  await page.getByRole('tab', { name: '改进记录', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${historyRoute}$`))
  const history = records(page)
  const original = history.filter({ has: page.locator('[data-focus-history-before="3"]') })
  await expect(history).toHaveCount(1)
  await expect(original).toHaveAttribute('data-focus-history-status', 'improved')
  await expect(original).toContainText(level.title.zh)
  await expect(original.locator('[data-focus-history-after="2"]')).toHaveText('2 次')
  await page.reload()
  await expect(original).toHaveCount(1)

  await page.goto(`/#challenge-records/${level.id}`)
  const editor = page.getByRole('region', { name: '下次小目标', exact: true })
  const clear = editor.getByRole('button', { name: '清除目标', exact: true })
  await clear.click()
  await expect(clear).toHaveCount(0)
  await page.goto(historyRoute)
  await expect(original).toHaveCount(1)
  await original.getByRole('button', { name: '再试这个改进点', exact: true }).click()
  const reminder = page.getByRole('region', { name: '重玩前提醒', exact: true })
  await expect(reminder).toContainText(/少走一次第 \d+ 回合经过的那段路/)
  await reminder.getByRole('button', { name: '开始重玩', exact: true }).click()
  await python.click()
  await runGrid(page, route)
  const outcome = focusResult(page)
  await expect(outcome).toHaveAttribute('data-replay-focus-status', 'improved')
  await expect(outcome.locator('[data-replay-focus-before="2"]')).toHaveText('2 次')
  await expect(outcome.locator('[data-replay-focus-after="1"]')).toHaveText('1 次')
  await page.goto(historyRoute)
  await page.reload()
  await expect(history).toHaveCount(2)
  await expect(history.first().locator('[data-focus-history-after="1"]')).toHaveText('1 次')
  await expect(original.locator('[data-focus-history-after="2"]')).toHaveText('2 次')
})

test('a still-failing case is worth another try until a later focused replay passes it', async ({ page, request }) => {
  const catalog = await catalogFor(request)
  const level = catalog.levels.find(candidate => candidate.id === algorithmId)
  if (level?.kind !== 'algorithm') throw new Error('Missing the algorithm challenge')
  const total = level.cases.length
  const series = `algorithm:${total}`
  const score = { kind: 'algorithm', checks: 5, passed: total, total } as const
  await seed(page, { [level.id]: { [series]: { latest: score, best: score } } }, { [level.id]: {
    [series]: { metricId: 'checks', baseline: 5, target: 3, preference: 'lower', lastReplayActual: null, attempts: 0, replays: [] },
  } })
  const failed = 'def quiet_stretch(draws, limit):\n    return -1'
  await page.goto(goalsRoute)
  const card = goalCard(page, level.id, series)
  await card.getByRole('button', { name: '重玩这关', exact: true }).click()
  await runPython(page, failed)
  await expect(page.getByText(`0/${total} 个用例通过`, { exact: true })).toBeVisible()
  await page.goto(goalsRoute)
  const review = await openReview(card, 1)
  await review.getByRole('radio', { name: '先检查第 1 个用例', exact: true }).check()
  await review.getByRole('button', { name: '跳过提醒，直接重玩', exact: true }).click()
  await runPython(page, failed)
  await expect(focusResult(page)).toHaveAttribute('data-replay-focus-status', 'same')

  await page.goto(historyRoute)
  const history = records(page)
  const unresolved = history.filter({ hasText: '先检查第 1 个用例' }).first()
  await expect(history).toHaveCount(1)
  await expect(unresolved).toHaveAttribute('data-focus-history-worth-retry', 'true')
  await expect(unresolved.locator('[data-focus-history-after="0"]')).toHaveText('未通过')
  await page.getByRole('button', { name: '值得再试', exact: true }).click()
  await expect(history).toHaveCount(1)
  await unresolved.getByRole('button', { name: '再试这个改进点', exact: true }).click()
  const reminder = page.getByRole('region', { name: '重玩前提醒', exact: true })
  await reminder.getByRole('button', { name: '跳过提醒，直接重玩', exact: true }).click()
  await runPython(page, 'def quiet_stretch(draws, limit):\n    if len(draws) == 7:\n        return [1, 4, 5]\n    return -1')
  await expect(page.getByText(`1/${total} 个用例通过`, { exact: true })).toBeVisible()
  await expect(focusResult(page)).toHaveAttribute('data-replay-focus-status', 'improved')
  await expect(page.getByRole('region', { name: '通关总结', exact: true })).toHaveCount(0)
  await page.goto(historyRoute)
  await expect(history).toHaveCount(2)
  await expect(history.first().locator('[data-focus-history-after="1"]')).toHaveText('通过')
  await expect(history.last().locator('[data-focus-history-after="0"]')).toHaveText('未通过')
  await page.getByRole('button', { name: '值得再试', exact: true }).click()
  await expect(history).toHaveCount(0)
})

test('the history separates timed and relaxed improvement records and opens their original pace on mobile', async ({ page, request }) => {
  const { levels } = await catalogFor(request)
  const level = levels.find(candidate => candidate.id === arenaId)
  if (level?.kind !== 'arena' || level.objective.kind !== 'score') throw new Error('Missing the junction arena')
  const total = 1 + (level.variants?.length ?? 0)
  const relaxedSeries = `arena:relaxed:score:${total}`
  const timedSeries = 'arena:timed:score:1'
  await seed(page, {}, {}, [{
    id: 'seed-timed', at: Date.UTC(2025, 0, 2), levelId: level.id, title: level.title, reference: 'replay',
    score: { kind: 'arena', mode: 'timed', goal: 'score', turns: 16, score: 5, passed: 1, total: 1 },
    result: { plan: { key: 'metric/score', kind: 'metric', metricId: 'score', preference: 'higher', seriesId: timedSeries, attempt: 1, before: 4 },
      before: 4, after: 5, status: 'improved' },
  }, {
    id: 'seed-relaxed', at: Date.UTC(2025, 0, 1), levelId: level.id, title: level.title, reference: 'replay',
    score: { kind: 'arena', mode: 'relaxed', goal: 'score', turns: 16, score: 3, passed: total, total },
    result: { plan: { key: 'metric/score', kind: 'metric', metricId: 'score', preference: 'higher', seriesId: relaxedSeries, attempt: 1, before: 3 },
      before: 3, after: 3, status: 'same' },
  }])

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(historyRoute)
  const timed = page.getByRole('region', { name: '紧张', exact: true })
  const relaxed = page.getByRole('region', { name: '从容', exact: true })
  await expect(timed.locator('[data-focus-history-record]')).toHaveAttribute('data-focus-history-series', timedSeries)
  await expect(relaxed.locator('[data-focus-history-record]')).toHaveAttribute('data-focus-history-series', relaxedSeries)
  await expect(timed.locator('[data-focus-history-after="5"]')).toHaveText('5 分')
  await expect(relaxed.locator('[data-focus-history-after="3"]')).toHaveText('3 分')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Improvement history', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: 'Timed', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Relaxed', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await page.getByRole('button', { name: '中文', exact: true }).click()
  await timed.getByRole('button', { name: '再试这个改进点', exact: true }).click()
  await page.getByRole('region', { name: '重玩前提醒', exact: true }).getByRole('button', { name: '跳过提醒，直接重玩', exact: true }).click()
  await expect(page.getByRole('button', { name: '紧张', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto(historyRoute)
  await relaxed.getByRole('button', { name: '再试这个改进点', exact: true }).click()
  await page.getByRole('region', { name: '重玩前提醒', exact: true }).getByRole('button', { name: '开始重玩', exact: true }).click()
  await expect(page.getByRole('button', { name: '从容', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
