import { expect, test, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'
import type { ChallengeGoals } from '../src/web/challengeGoals'
import type { ChallengeScore, ChallengeScoreHistory } from '../src/web/challengeScore'

const salvageId = 'limited-battery-salvage'
const arenaId = 'challenge-junction-race'
const summary = (page: Page) => page.getByRole('region', { name: '通关总结', exact: true })
const goalEditor = (page: Page) => page.getByRole('region', { name: '下次小目标', exact: true })
const achievedTab = (page: Page) => page.getByRole('tab', { name: '已达成', exact: true })
const archive = (page: Page, levelId: string, seriesId: string) =>
  page.locator(`article[data-goal-status="achieved"][data-goal-level="${levelId}"][data-goal-series="${seriesId}"]`)

async function seed(page: Page, history?: ChallengeScoreHistory, goals?: ChallengeGoals) {
  await page.addInitScript(({ history, goals }) => {
    const scoresKey = 'pixel-repair-lab:challenge-scores'
    const goalsKey = 'pixel-repair-lab:challenge-goals'
    if (history && !localStorage.getItem(scoresKey)) localStorage.setItem(scoresKey, JSON.stringify(history))
    if (goals && !localStorage.getItem(goalsKey)) localStorage.setItem(goalsKey, JSON.stringify(goals))
    if (!localStorage.getItem('pixel-repair-lab:locale')) localStorage.setItem('pixel-repair-lab:locale', 'zh')
  }, { history, goals })
}

async function openGoalList(page: Page) {
  await page.getByRole('button', { name: '我的小目标', exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的小目标', exact: true })).toBeVisible()
}

async function openSalvage(page: Page) {
  await page.locator(`[data-challenge-level="${salvageId}"]`).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
}

async function playGrid(page: Page, source: string) {
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
}

test('an achieved goal preserves its outcome and counts each judged replay, and the card can start a new goal', async ({ page, request }) => {
  test.slow()
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const catalog = await response.json() as Catalog
  const level = catalog.levels.find(item => item.id === salvageId)
  if (level?.kind !== 'grid' || level.turnLimit === undefined) throw new Error('Missing the salvage challenge')
  const fast = cardsToPython(level.cards, level.solutionCards)
  const detour = 'move("right")\nmove("left")\n'
  const baseline = level.turnLimit + 4
  const initialTarget = baseline - 1
  const achievedScore = level.turnLimit + 2
  const followupTarget = achievedScore - 1
  const slow = detour.repeat(2) + fast
  // Permit two detours for this test without changing the real level, its route or the engine.
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(item => item.id === salvageId ? { ...level, turnLimit: baseline } : item),
  } }))
  await seed(page)

  await page.goto('/#challenge-zone')
  await openSalvage(page)
  await playGrid(page, slow)
  await summary(page).getByRole('button', { name: '成绩记录', exact: true }).click()
  await goalEditor(page).getByRole('button', { name: '保存目标', exact: true }).click()
  await expect(goalEditor(page).locator('[data-goal-target]')).toHaveText(String(initialTarget))
  await page.getByRole('button', { name: '重玩这关', exact: true }).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()

  await playGrid(page, slow + '\nmove("right")')
  await expect(page.locator('.output-panel .error-message')).toContainText('回合已用完')
  await page.getByRole('region', { name: '失败复盘', exact: true }).getByRole('button', { name: '直接重试' }).click()
  await playGrid(page, slow)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '1')
  await summary(page).getByRole('button', { name: '再玩一次', exact: true }).click()
  await playGrid(page, detour + fast)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-achieved', 'true')

  await summary(page).getByRole('button', { name: '自由选关', exact: true }).click()
  await openGoalList(page)
  await achievedTab(page).click()
  const cards = archive(page, level.id, 'grid:1')
  const original = cards.filter({ has: page.locator('[data-goal-baseline]').filter({ hasText: new RegExp(`^${baseline}$`) }) })
  await expect(cards).toHaveCount(1)
  await expect(original.locator('[data-goal-target]')).toContainText(String(initialTarget))
  await expect(original.locator('[data-goal-actual]')).toHaveText(String(achievedScore))
  await expect(original.locator('[data-goal-attempts]')).toContainText('3')
  await expect(original.locator('[data-goal-improvement]')).toContainText('2 回合')

  await page.reload()
  await expect(achievedTab(page)).toHaveAttribute('aria-selected', 'true')
  await expect(original.locator('[data-goal-attempts]')).toContainText('3')
  await page.getByRole('button', { name: '自由选关', exact: true }).click()
  await openSalvage(page)
  await playGrid(page, slow)
  await expect(summary(page).locator('[data-score-metric="turns"] td').first()).toHaveText(String(baseline))
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveCount(0)
  await summary(page).getByRole('button', { name: '自由选关', exact: true }).click()
  await openGoalList(page)
  await achievedTab(page).click()
  await expect(original.locator('[data-goal-actual]')).toHaveText(String(achievedScore))
  await expect(original.locator('[data-goal-attempts]')).toContainText('3')

  await original.getByRole('button', { name: '以这次成绩定目标', exact: true }).click()
  await page.getByRole('button', { name: '保存目标', exact: true }).click()
  await expect(page.getByRole('tab', { name: '进行中', exact: true })).toHaveAttribute('aria-selected', 'true')
  const pending = page.locator(`article[data-goal-level="${level.id}"][data-goal-series="grid:1"]`)
  await expect(pending.getByText(`≤ ${followupTarget}`, { exact: true })).toBeVisible()
  await achievedTab(page).click()
  await original.getByRole('button', { name: '以这次成绩定目标', exact: true }).click()
  await expect(original.getByRole('button', { name: '替换小目标', exact: true })).toBeVisible()
  await original.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('tab', { name: '进行中', exact: true }).click()
  await expect(pending.getByText(`≤ ${followupTarget}`, { exact: true })).toBeVisible()
  await pending.getByRole('button', { name: '重玩这关', exact: true }).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await playGrid(page, fast)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-achieved', 'true')
  await summary(page).getByRole('button', { name: '成绩记录', exact: true }).click()
  await goalEditor(page).getByRole('button', { name: '清除目标', exact: true }).click()
  await page.getByRole('button', { name: '返回挑战场', exact: true }).click()
  await openGoalList(page)
  await achievedTab(page).click()
  await expect(cards).toHaveCount(2)
  const followup = cards.filter({ has: page.locator('[data-goal-baseline]').filter({ hasText: new RegExp(`^${achievedScore}$`) }) })
  await expect(followup.locator('[data-goal-actual]')).toHaveText(String(level.turnLimit))
  await expect(followup.locator('[data-goal-attempts]')).toContainText('1')
  await expect(original.locator('[data-goal-attempts]')).toContainText('3')
  await page.reload()
  await expect(cards).toHaveCount(2)
})

test('earlier achievements retain separate timed and relaxed records in the bilingual mobile view', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels } = await response.json() as Catalog
  const level = levels.find(item => item.id === arenaId)
  if (level?.kind !== 'arena' || level.objective.kind !== 'score') throw new Error('Missing the junction arena')
  const total = 1 + (level.variants?.length ?? 0)
  const relaxed: ChallengeScore = { kind: 'arena', mode: 'relaxed', goal: 'score', turns: 15, score: 4, passed: total, total }
  const timed: ChallengeScore = { ...relaxed, mode: 'timed', score: 5, passed: 1, total: 1 }
  const relaxedSeries = `arena:relaxed:score:${total}`
  const timedSeries = 'arena:timed:score:1'
  await seed(page, { [level.id]: {
    [relaxedSeries]: { latest: relaxed, best: relaxed },
    [timedSeries]: { latest: timed, best: timed },
  } }, { [level.id]: {
    [relaxedSeries]: { metricId: 'score', baseline: 3, target: 4, preference: 'higher', achieved: 4 },
    [timedSeries]: { metricId: 'score', baseline: 3, target: 4, preference: 'higher', achieved: 5 },
  } })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/#challenge-goals')
  await page.getByRole('tab', { name: '进行中', exact: true }).press('ArrowRight')
  await expect(achievedTab(page)).toBeFocused()
  const relaxedCard = archive(page, level.id, relaxedSeries)
  const timedCard = archive(page, level.id, timedSeries)
  await expect(relaxedCard.getByText('从容', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('紧张', { exact: true })).toBeVisible()
  await expect(relaxedCard.locator('[data-goal-actual]')).toHaveText('4')
  await expect(timedCard.locator('[data-goal-actual]')).toHaveText('5')
  await expect(relaxedCard.getByText('未记录', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('未记录', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Achieved', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(relaxedCard.getByText('Relaxed', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('Timed', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await timedCard.getByRole('button', { name: 'Set a goal from this result', exact: true }).click()
  await expect(timedCard.getByText('Result from this run 5', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await timedCard.getByRole('button', { name: 'Save goal', exact: true }).click()
  const timedPending = page.locator(`article[data-goal-level="${level.id}"][data-goal-series="${timedSeries}"]`)
  await expect(timedPending.getByText('≥ 6', { exact: true })).toBeVisible()
  await timedPending.getByRole('button', { name: 'Replay challenge', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Timed', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
