import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { runArena } from '../src/engine/arena'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog, Locale } from '../src/shared/types'
import type { ChallengeScoreHistory } from '../src/web/challengeScore'

const salvageId = 'limited-battery-salvage'
const arenaId = 'challenge-junction-race'
const algorithmId = 'challenge-quiet-power-window'

async function loadCatalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  return await response.json() as Catalog
}

async function initializeRecords(page: Page, locale: Locale, history?: ChallengeScoreHistory) {
  await page.addInitScript(({ locale, history }) => {
    localStorage.setItem('pixel-repair-lab:locale', locale)
    const key = 'pixel-repair-lab:challenge-scores'
    if (history && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(history))
  }, { locale, history })
}

const summary = (page: Page) => page.getByRole('region', { name: '通关总结', exact: true })
const goal = (page: Page) => page.getByRole('region', { name: '下次小目标', exact: true })

async function runGridCode(page: Page, source: string) {
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(summary(page)).toBeVisible()
}

test('a turn goal keeps its baseline through a shortfall and reload, then recognizes a faster win', async ({ page, request }) => {
  const catalog = await loadCatalog(request)
  const salvage = catalog.levels.find(level => level.id === salvageId)
  if (salvage?.kind !== 'grid' || salvage.turnLimit === undefined) throw new Error('Missing the salvage challenge')
  const fast = cardsToPython(salvage.cards, salvage.solutionCards)
  const detour = 'move("right")\nmove("left")\n'
  const target = salvage.turnLimit
  const baseline = target + 2
  const slower = target + 4
  // Keep the real map and objective while allowing two detours to finish.
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(level => level.id === salvageId ? { ...salvage, turnLimit: slower } : level),
  } }))
  await initializeRecords(page, 'zh')

  await page.goto(`/#challenge-records/${salvageId}`)
  const replay = page.getByRole('button', { name: '重玩这关', exact: true })
  await expect(page.getByText('通关一次后，就能定下次的小目标。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存目标', exact: true })).toHaveCount(0)
  await replay.click()
  await runGridCode(page, detour + fast)

  const records = summary(page).getByRole('button', { name: '成绩记录', exact: true })
  const outcome = summary(page).getByTestId('challenge-goal-result')
  await expect(outcome).toHaveCount(0)
  await expect(summary(page).locator('[data-score-metric="turns"] td').first()).toHaveText(String(baseline))
  await records.click()
  const editor = goal(page)
  const storedTarget = editor.locator('[data-goal-target]')
  const storedBaseline = editor.locator('[data-goal-baseline]')
  const status = editor.locator('[data-goal-status]')
  await editor.getByRole('button', { name: '增加进步量', exact: true }).click()
  await expect(editor.getByRole('spinbutton', { name: '进步量', exact: true })).toHaveValue('2')
  await editor.getByRole('button', { name: '保存目标', exact: true }).click()
  await expect(storedTarget).toHaveText(String(target))
  await expect(storedBaseline).toHaveText(String(baseline))
  await expect(status).toHaveAttribute('data-goal-status', 'pending')
  await replay.click()
  await runGridCode(page, detour.repeat(2) + fast)
  await expect(outcome).toHaveAttribute('data-achieved', 'false')
  await expect(outcome.getByText(`≤ ${target}`, { exact: true })).toBeVisible()
  await expect(outcome.getByText(String(slower), { exact: true })).toBeVisible()
  await expect(outcome.getByText('还差 4 回合。', { exact: true })).toBeVisible()

  await records.click()
  await page.reload()
  await expect(storedBaseline).toHaveText(String(baseline))
  await expect(storedTarget).toHaveText(String(target))
  await expect(status).toHaveAttribute('data-goal-status', 'pending')
  await replay.click()
  await runGridCode(page, fast)
  await expect(outcome).toHaveAttribute('data-achieved', 'true')
  await expect(outcome).toHaveAttribute('data-remaining', '0')
  await expect(outcome.getByText(`≤ ${target}`, { exact: true })).toBeVisible()
  await expect(outcome.getByText(String(target), { exact: true })).toBeVisible()
  await expect(outcome.getByText('目标已达成', { exact: true })).toBeVisible()

  await records.click()
  await page.reload()
  await expect(status).toHaveAttribute('data-goal-status', 'achieved')
  await editor.getByRole('button', { name: '清除目标', exact: true }).click()
  await page.reload()
  await expect(status).toHaveCount(0)
  await expect(editor.getByRole('button', { name: '保存目标', exact: true })).toBeEnabled()
})

test('timed and relaxed arena replays use separate points goals and report their own outcome', async ({ page, request }) => {
  test.slow()
  const { levels } = await loadCatalog(request)
  const arena = levels.find(level => level.id === arenaId)
  if (arena?.kind !== 'arena' || arena.objective.kind !== 'score') throw new Error('Missing the junction arena')
  const reference = runArena(arena, arena.solutionCode)
  expect(reference.won).toBe(true)
  const points = reference.final.actors[0].score
  const relaxed = { kind: 'arena', mode: 'relaxed', goal: 'score', turns: reference.final.turn,
    score: points - 1, passed: reference.totalCases, total: reference.totalCases } as const
  const timed = { ...relaxed, mode: 'timed', score: points, passed: 1, total: 1 } as const
  await initializeRecords(page, 'zh', {
    [arenaId]: {
      [`arena:relaxed:score:${relaxed.total}`]: { latest: relaxed, best: relaxed },
      'arena:timed:score:1': { latest: timed, best: timed },
    },
  })

  await page.goto(`/#challenge-records/${arenaId}/timed`)
  const mode = page.getByRole('combobox', { name: '玩法', exact: true })
  const replay = page.getByRole('button', { name: '重玩这关', exact: true })
  const editor = goal(page)
  const target = editor.locator('[data-goal-target]')
  const status = editor.locator('[data-goal-status]')
  const save = editor.getByRole('button', { name: '保存目标', exact: true })
  const metric = editor.getByRole('combobox', { name: '目标指标', exact: true })
  await expect(mode).toHaveValue('timed')
  await metric.selectOption('score')
  await save.click()
  await expect(target).toHaveText(String(points + 1))

  await mode.selectOption('relaxed')
  await expect(status).toHaveCount(0)
  await metric.selectOption('score')
  await save.click()
  await expect(target).toHaveText(String(points))
  await page.reload()
  await expect(mode).toHaveValue('relaxed')
  await expect(target).toHaveText(String(points))
  await replay.click()
  await expect(page.getByRole('button', { name: '从容', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(arena.solutionCode)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('slider', { name: '回放进度' }).press('End')
  const outcome = summary(page).getByTestId('challenge-goal-result')
  await expect(outcome).toHaveAttribute('data-achieved', 'true')
  await expect(outcome.getByText(`≥ ${points}`, { exact: true })).toBeVisible()

  const records = summary(page).getByRole('button', { name: '成绩记录', exact: true })
  await records.click()
  await expect(status).toHaveAttribute('data-goal-status', 'achieved')
  await mode.selectOption('timed')
  await expect(target).toHaveText(String(points + 1))
  await expect(status).toHaveAttribute('data-goal-status', 'pending')
  await replay.click()
  await expect(page.getByRole('button', { name: '紧张', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const actions = reference.frames.map(({ events }) => {
    const event = events.find(candidate => candidate.actorId === 'player')
    if (!event) throw new Error('The reference did not generate a player action')
    return event.direction ?? event.action
  })
  await page.locator('#realtime-python').fill(`def decide(state):\n    return ${JSON.stringify(actions)}[state["turn"]]`)
  await page.getByRole('button', { name: '应用策略', exact: true }).click()
  await expect(page.getByText('策略已启用', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(outcome).toBeVisible({ timeout: 40_000 })
  await expect(outcome).toHaveAttribute('data-achieved', 'false')
  await expect(outcome.getByText(`≥ ${points + 1}`, { exact: true })).toBeVisible()
  await expect(outcome.getByText(String(points), { exact: true })).toBeVisible()
  await expect(outcome.getByText('还差 1 分。', { exact: true })).toBeVisible()
})

test('the English editor can save a goal for one fewer check in a Python challenge', async ({ page, request }) => {
  const { levels } = await loadCatalog(request)
  const level = levels.find(candidate => candidate.id === algorithmId)
  if (level?.kind !== 'algorithm') throw new Error('Missing the quiet power challenge')
  const previous = { kind: 'algorithm', checks: 2, passed: level.cases.length, total: level.cases.length } as const
  await initializeRecords(page, 'en', { [level.id]: { [`algorithm:${previous.total}`]: { latest: previous, best: previous } } })

  await page.goto(`/#challenge-records/${level.id}`)
  const editor = page.getByRole('region', { name: 'Next challenge goal', exact: true })
  await expect(editor.getByRole('combobox', { name: 'Goal metric', exact: true })).toHaveValue('checks')
  await editor.getByRole('button', { name: 'Save goal', exact: true }).click()
  await expect(editor.locator('[data-goal-target]')).toHaveText('1')
  await page.getByRole('button', { name: 'Replay challenge', exact: true }).click()
  await page.getByRole('textbox', { name: 'Write Python', exact: true }).fill(level.solutionCode)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const result = page.getByRole('region', { name: 'Challenge summary', exact: true }).getByTestId('challenge-goal-result')
  await expect(result).toHaveAttribute('data-achieved', 'true')
  await expect(result.getByText('Target · Checks', { exact: true })).toBeVisible()
  await expect(result.getByText('≤ 1', { exact: true })).toBeVisible()
  await expect(result.getByText('Goal reached', { exact: true })).toBeVisible()
})
