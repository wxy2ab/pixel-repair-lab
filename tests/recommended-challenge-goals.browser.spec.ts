import { expect, test, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'
import type { ChallengeGoals } from '../src/web/challengeGoals'
import { updateChallengeScores, type ChallengeScore, type ChallengeScoreHistory } from '../src/web/challengeScore'

const arenaId = 'challenge-junction-race'
const salvageId = 'limited-battery-salvage'
const recommendationRoute = '/#challenge-goals/recommended'
const recordedAt = Date.UTC(2025, 0, 1)

async function seed(page: Page, history: ChallengeScoreHistory, goals: ChallengeGoals = {}) {
  await page.addInitScript(({ history, goals }) => {
    const scoresKey = 'pixel-repair-lab:challenge-scores'
    const goalsKey = 'pixel-repair-lab:challenge-goals'
    if (!localStorage.getItem(scoresKey)) localStorage.setItem(scoresKey, JSON.stringify(history))
    if (!localStorage.getItem(goalsKey)) localStorage.setItem(goalsKey, JSON.stringify(goals))
    if (!localStorage.getItem('pixel-repair-lab:locale')) localStorage.setItem('pixel-repair-lab:locale', 'zh')
  }, { history, goals })
}

function addRuns(history: ChallengeScoreHistory, id: string, scores: ChallengeScore[]) {
  return scores.reduce((current, score, index) => updateChallengeScores(current, id, score, recordedAt + index).history, history)
}

function goalCard(page: Page, id: string, series: string) {
  return page.getByRole('tabpanel').locator(`article[data-goal-level="${id}"][data-goal-series="${series}"]`)
}

function recommendedTab(page: Page) {
  return page.getByRole('tab', { name: '目标推荐', exact: true })
}

test('suggestions compare the same pace, adopt once, and let the child customize another pace', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels } = await response.json() as Catalog
  const arena = levels.find(level => level.id === arenaId)
  if (arena?.kind !== 'arena' || arena.objective.kind !== 'score') throw new Error('Missing the junction arena')
  const total = 1 + (arena.variants?.length ?? 0)
  const timedKey = 'arena:timed:score:1'
  const relaxedKey = `arena:relaxed:score:${total}`
  const arenaScores = (mode: 'timed' | 'relaxed', values: number[]): ChallengeScore[] => values.map(score => ({
    kind: 'arena', mode, goal: 'score', score, turns: arena.maxTurns,
    passed: mode === 'timed' ? 1 : total, total: mode === 'timed' ? 1 : total,
  }))
  let history = addRuns({}, arena.id, arenaScores('relaxed', [7, 5, 6, 4]))
  history = addRuns(history, arena.id, arenaScores('timed', [4, 6, 5]))
  history = addRuns(history, salvageId, [17, 17].map(turns => ({ kind: 'grid', turns, passed: 1, total: 1 })))
  await seed(page, history, { [salvageId]: {
    'grid:1': { metricId: 'turns', baseline: 17, target: 15, preference: 'lower', attempts: 0, lastReplayActual: null },
  } })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/#challenge-zone')
  await page.getByRole('button', { name: '我的小目标', exact: true }).click()
  await recommendedTab(page).click()
  await expect(page).toHaveURL(/#challenge-goals\/recommended$/)
  const relaxedCard = goalCard(page, arena.id, relaxedKey)
  const timedCard = goalCard(page, arena.id, timedKey)
  await expect(relaxedCard.getByText('从容', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('紧张', { exact: true })).toBeVisible()
  await expect(relaxedCard.locator('[data-goal-recent]')).toHaveText('5 · 6 · 4')
  await expect(timedCard.locator('[data-goal-recent]')).toHaveText('4 · 6 · 5')
  await expect(relaxedCard.locator('[data-goal-target]')).toHaveText('≥ 5')
  await expect(timedCard.locator('[data-goal-target]')).toHaveText('≥ 6')
  await expect(relaxedCard.locator('[data-goal-reason]')).toContainText('你最近已经做到过')
  await expect(timedCard.locator('[data-goal-reason]')).toContainText('多拿 1 分')
  await expect(goalCard(page, salvageId, 'grid:1')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await relaxedCard.getByRole('button', { name: '采用目标', exact: true }).click()
  await expect(page.getByRole('tab', { name: '进行中', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(relaxedCard.getByText('≥ 5', { exact: true })).toBeVisible()
  await expect(goalCard(page, salvageId, 'grid:1').getByText('≤ 15', { exact: true })).toBeVisible()
  await recommendedTab(page).click()
  await expect(relaxedCard).toHaveCount(0)
  await timedCard.getByRole('button', { name: '自己调整', exact: true }).click()
  await expect(timedCard.getByRole('combobox', { name: '目标指标', exact: true })).toHaveValue('score')
  await expect(timedCard.getByRole('spinbutton', { name: '进步量', exact: true })).toHaveValue('1')
  await timedCard.getByRole('button', { name: '增加进步量', exact: true }).click()
  await expect(timedCard.getByRole('spinbutton', { name: '进步量', exact: true })).toHaveValue('2')
  await timedCard.getByRole('button', { name: '保存目标', exact: true }).click()
  await expect(timedCard.getByText('≥ 7', { exact: true })).toBeVisible()
  await page.reload()
  await expect(timedCard.getByText('≥ 7', { exact: true })).toBeVisible()
  await expect(relaxedCard.getByText('≥ 5', { exact: true })).toBeVisible()
  await expect(goalCard(page, salvageId, 'grid:1').getByText('≤ 15', { exact: true })).toBeVisible()

  await timedCard.getByRole('button', { name: '重玩这关', exact: true }).click()
  await expect(page.getByRole('button', { name: '紧张', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('an adopted turn suggestion is tracked in a real replay and the result appears in Achieved', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const catalog = await response.json() as Catalog
  const level = catalog.levels.find(candidate => candidate.id === salvageId)
  if (level?.kind !== 'grid' || level.turnLimit === undefined) throw new Error('Missing the salvage challenge')
  const fast = level.turnLimit
  const latest = fast + 2
  // A two-turn detour can also finish within this test budget.
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(candidate => candidate.id === salvageId ? { ...level, turnLimit: latest } : candidate),
  } }))
  const history = addRuns({}, level.id, [latest, fast, latest].map(turns => ({ kind: 'grid', turns, passed: 1, total: 1 })))
  await seed(page, history)

  await page.goto(recommendationRoute)
  const card = goalCard(page, level.id, 'grid:1')
  await expect(card.locator('[data-goal-target]')).toHaveText(`≤ ${latest - 1}`)
  await card.getByRole('button', { name: '采用目标', exact: true }).click()
  await card.getByRole('button', { name: '重玩这关', exact: true }).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(cardsToPython(level.cards, level.solutionCards))
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(page.getByTestId('challenge-goal-result')).toHaveAttribute('data-achieved', 'true')
  await page.goto('/#challenge-goals/achieved')
  await expect(card.locator('[data-goal-baseline]')).toHaveText(String(latest))
  await expect(card.locator('[data-goal-actual]')).toHaveText(String(fast))
  await expect(card.locator('[data-goal-attempts]')).toHaveText('1 次')
})

test('one recorded win and undated earlier records do not count as comparable histories', async ({ page }) => {
  const latest = { kind: 'grid', turns: 17, passed: 1, total: 1 } as const
  const best = { ...latest, turns: 15 }
  const legacy: ChallengeScoreHistory = { [salvageId]: { 'grid:1': { latest, best } } }
  await seed(page, addRuns(legacy, salvageId, [latest]))
  await page.goto(recommendationRoute)
  await expect(recommendedTab(page)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('同一关、同一玩法至少通关两次后')
  await expect(page.getByRole('tabpanel').getByRole('article')).toHaveCount(0)
})
