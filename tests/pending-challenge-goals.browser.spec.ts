import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'
import type { ChallengeGoals } from '../src/web/challengeGoals'
import type { ChallengeScore, ChallengeScoreHistory } from '../src/web/challengeScore'

const salvageId = 'limited-battery-salvage'
const arenaId = 'challenge-junction-race'

async function catalogFor(request: APIRequestContext): Promise<Catalog> {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  return response.json()
}

async function seed(page: Page, history?: ChallengeScoreHistory, goals?: ChallengeGoals) {
  await page.addInitScript(({ history, goals }) => {
    const scoresKey = 'pixel-repair-lab:challenge-scores'
    const goalsKey = 'pixel-repair-lab:challenge-goals'
    if (history && !localStorage.getItem(scoresKey)) localStorage.setItem(scoresKey, JSON.stringify(history))
    if (goals && !localStorage.getItem(goalsKey)) localStorage.setItem(goalsKey, JSON.stringify(goals))
    if (!localStorage.getItem('pixel-repair-lab:locale')) localStorage.setItem('pixel-repair-lab:locale', 'zh')
  }, { history, goals })
}

const goalCard = (page: Page, levelId: string, seriesId: string) =>
  page.locator(`article[data-goal-level="${levelId}"][data-goal-series="${seriesId}"]`)
const summary = (page: Page) => page.getByRole('region', { name: '通关总结', exact: true })
const editor = (page: Page) => page.getByRole('region', { name: '下次小目标', exact: true })
const goalListHeading = (page: Page) => page.getByRole('heading', { level: 1, name: '我的小目标', exact: true })

async function openGoals(page: Page) {
  await page.getByRole('button', { name: '我的小目标', exact: true }).click()
  await expect(goalListHeading(page)).toBeVisible()
  await expect(page).toHaveURL(/#challenge-goals$/)
}

async function runGridCode(page: Page, source: string) {
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(summary(page)).toBeVisible()
}

test('the goal list reports the last completed replay and removes a goal once reached', async ({ page, request }) => {
  const catalog = await catalogFor(request)
  const level = catalog.levels.find(candidate => candidate.id === salvageId)
  if (level?.kind !== 'grid' || level.turnLimit === undefined) throw new Error('Missing the salvage challenge')
  const fast = cardsToPython(level.cards, level.solutionCards)
  const slow = 'move("right")\nmove("left")\n' + fast
  const target = level.turnLimit
  // Keep the original board and objective while allowing a detour to finish.
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(candidate => candidate.id === salvageId ? { ...level, turnLimit: target + 2 } : candidate),
  } }))
  await seed(page)

  await page.goto('/#challenge-zone')
  await page.locator(`[data-challenge-level="${salvageId}"]`).click()
  await runGridCode(page, slow)
  await summary(page).getByRole('button', { name: '成绩记录', exact: true }).click()
  await editor(page).getByRole('button', { name: '增加进步量', exact: true }).click()
  await editor(page).getByRole('button', { name: '保存目标', exact: true }).click()
  await page.getByRole('button', { name: '返回挑战场', exact: true }).click()
  await openGoals(page)

  const card = goalCard(page, level.id, 'grid:1')
  const replay = card.getByRole('button', { name: '重玩这关', exact: true })
  await expect(card.getByRole('heading', { name: level.title.zh, exact: true })).toBeVisible()
  await expect(card.getByText(`≤ ${target}`, { exact: true })).toBeVisible()
  await expect(card.getByText('重玩通关后会显示差距', { exact: true })).toBeVisible()
  await replay.click()
  // A repeat with the same value as the baseline is still a measured shortfall.
  await runGridCode(page, slow)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-remaining', '2')
  await summary(page).getByRole('button', { name: '自由选关', exact: true }).click()
  await openGoals(page)
  await expect(card.getByText('上次还差 2 回合', { exact: true })).toBeVisible()

  await page.reload()
  await expect(card.getByText('上次还差 2 回合', { exact: true })).toBeVisible()

  // Earlier versions kept the goal and scores but no record of the last goal replay.
  await page.evaluate(id => {
    const key = 'pixel-repair-lab:challenge-goals'
    const goals = JSON.parse(localStorage.getItem(key) ?? '{}')
    delete goals[id]['grid:1'].lastReplayActual
    delete goals[id]['grid:1'].replays
    localStorage.setItem(key, JSON.stringify(goals))
  }, level.id)
  await page.reload()
  await expect(card.getByText('重玩通关后会显示差距', { exact: true })).toBeVisible()
  await replay.click()
  await runGridCode(page, slow)
  await summary(page).getByRole('button', { name: '自由选关', exact: true }).click()
  await openGoals(page)
  await expect(card.getByText('上次还差 2 回合', { exact: true })).toBeVisible()

  await replay.click()
  await runGridCode(page, fast)
  await expect(summary(page).getByTestId('challenge-goal-result')).toHaveAttribute('data-achieved', 'true')
  await summary(page).getByRole('button', { name: '自由选关', exact: true }).click()
  await openGoals(page)
  await expect(card).toHaveCount(0)
  await expect(page.getByText('现在没有待达成的小目标。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '成绩记录', exact: true }).click()
  await expect(editor(page).locator('[data-goal-status]')).toHaveAttribute('data-goal-status', 'achieved')
})

test('the goal list keeps both arena paces separate and starts the selected pace', async ({ page, request }) => {
  const { levels } = await catalogFor(request)
  const level = levels.find(candidate => candidate.id === arenaId)
  if (level?.kind !== 'arena' || level.objective.kind !== 'score') throw new Error('Missing the junction arena')
  const total = 1 + (level.variants?.length ?? 0)
  const relaxed: ChallengeScore = { kind: 'arena', mode: 'relaxed', goal: 'score', turns: 15, score: 4, passed: total, total }
  const timed: ChallengeScore = { ...relaxed, mode: 'timed', passed: 1, total: 1 }
  const timedBest: ChallengeScore = { ...timed, score: 5 }
  const timedSeries = 'arena:timed:score:1'
  const relaxedSeries = `arena:relaxed:score:${total}`
  await seed(page, {
    [level.id]: {
      [relaxedSeries]: { latest: relaxed, best: relaxed },
      [timedSeries]: { latest: timed, best: timedBest, attempts: [
        { score: timedBest, at: Date.UTC(2026, 10, 20) },
        { score: timed, at: Date.UTC(2026, 10, 21) },
      ] },
    },
  }, { [level.id]: { [timedSeries]: { metricId: 'score', baseline: 5, target: 6, preference: 'higher' } } })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(`/#challenge-records/${level.id}/relaxed`)
  await editor(page).getByRole('combobox', { name: '目标指标', exact: true }).selectOption('score')
  await editor(page).getByRole('button', { name: '保存目标', exact: true }).click()
  await page.getByRole('button', { name: '返回挑战场', exact: true }).click()
  await openGoals(page)

  const timedCard = goalCard(page, level.id, timedSeries)
  const relaxedCard = goalCard(page, level.id, relaxedSeries)
  await expect(timedCard.getByRole('heading', { name: level.title.zh, exact: true })).toBeVisible()
  await expect(timedCard.getByText('紧张', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('≥ 6', { exact: true })).toBeVisible()
  await expect(timedCard.getByText('上次还差 2 分', { exact: true })).toBeVisible()
  await expect(relaxedCard.getByRole('heading', { name: level.title.zh, exact: true })).toBeVisible()
  await expect(relaxedCard.getByText('从容', { exact: true })).toBeVisible()
  await expect(relaxedCard.getByText('≥ 5', { exact: true })).toBeVisible()
  await expect(relaxedCard.getByText('重玩通关后会显示差距', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  await timedCard.getByRole('button', { name: '重玩这关', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '紧张', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(goalListHeading(page)).toBeVisible()
  await relaxedCard.getByRole('button', { name: '重玩这关', exact: true }).click()
  await expect(page.getByRole('button', { name: '从容', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(goalListHeading(page)).toBeVisible()

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My challenge goals', exact: true })).toBeVisible()
  await expect(timedCard.getByRole('heading', { name: level.title.en, exact: true })).toBeVisible()
  await expect(timedCard.getByText('Timed', { exact: true })).toBeVisible()
  await expect(relaxedCard.getByText('Relaxed', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.getByRole('button', { name: 'Browse challenges', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Browse challenges', exact: true })).toBeVisible()
  await expect(page.locator(`[data-challenge-level="${salvageId}"]`)).toBeVisible()
})

test('replaying an online AI goal selects that provider and waits for a prompt', async ({ page, request }) => {
  const { levels } = await catalogFor(request)
  const level = levels.find(candidate => candidate.id === 'challenge-late-dispatch-amendment')
  if (level?.kind !== 'ai') throw new Error('Missing the dispatch amendment challenge')
  const online = { kind: 'ai', mode: 'online', rounds: 4 } as const
  await seed(page, { [level.id]: { 'ai:online': { latest: online, best: online } } }, {
    [level.id]: { 'ai:online': { metricId: 'rounds', baseline: 4, target: 3, preference: 'lower' } },
  })
  let prompts = 0
  await page.route('**/api/ai/status', route => route.fulfill({ json: { available: true } }))
  await page.route('**/api/ai/turn', route => {
    prompts++
    return route.fulfill({ status: 503, json: { error: 'unavailable' } })
  })

  await page.goto('/#challenge-goals')
  await expect(goalListHeading(page)).toBeVisible()
  const card = goalCard(page, level.id, 'ai:online')
  await expect(card.getByText('在线 AI', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: '重玩这关', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
  const provider = page.getByRole('button', { name: '在线 AI', exact: true })
  await expect(provider).toBeEnabled()
  await expect(provider).toHaveAttribute('aria-pressed', 'true')
  expect(prompts).toBe(0)
})
