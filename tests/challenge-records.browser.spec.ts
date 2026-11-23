import { expect, test, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'

const salvageId = 'limited-battery-salvage'
const arenaId = 'challenge-junction-race'
const historyKey = 'pixel-repair-lab:challenge-scores'

async function recordLocale(page: Page, history?: unknown) {
  await page.addInitScript(({ key, history }) => {
    localStorage.setItem('pixel-repair-lab:locale', 'zh')
    if (history !== undefined && localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify(history))
    }
  }, { key: historyKey, history })
}

const recordsTable = (page: Page) => page.getByRole('table', { name: '通关成绩', exact: true })
const trend = (page: Page) => page.getByRole('img', { name: '通关趋势', exact: true })
const rows = (page: Page) => recordsTable(page).locator('[data-score-attempt]')
const points = (page: Page) => trend(page).locator('[data-score-point]')

test('challenge records keep each actual clearance and its best result after reload', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const salvage = catalog.levels.find(level => level.id === salvageId)
  if (salvage?.kind !== 'grid' || salvage.turnLimit === undefined) throw new Error('Missing the salvage level')

  const fast = cardsToPython(salvage.cards, salvage.solutionCards)
  const slow = 'move("right")\nmove("left")\n' + fast
  const fastTurns = salvage.turnLimit
  const slowTurns = fastTurns + 2
  // Keep the actual board and goals while allowing a successful route with a detour.
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(level => level.id === salvageId ? { ...salvage, turnLimit: slowTurns } : level),
  } }))
  await recordLocale(page)
  await page.goto('/#challenge-zone')
  await page.locator(`[data-challenge-level="${salvageId}"]`).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()

  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  const draft = page.getByRole('textbox', { name: '编写 Python', exact: true })
  for (const [index, source] of [slow, fast, slow].entries()) {
    if (index) await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
    await draft.fill(source)
    await page.getByRole('button', { name: '运行', exact: true }).click()
    await page.getByRole('button', { name: '查看结果', exact: true }).click()
    await expect(summary).toBeVisible()
  }

  await summary.getByRole('button', { name: '成绩记录', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '成绩记录', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '关卡', exact: true })).toHaveValue(salvageId)
  await expect(rows(page)).toHaveCount(3)
  await expect(points(page)).toHaveCount(3)
  await expect(rows(page).nth(0).getByRole('cell', { name: String(slowTurns), exact: true })).toBeVisible()
  await expect(rows(page).nth(1).getByRole('cell', { name: String(fastTurns), exact: true })).toBeVisible()
  await expect(rows(page).nth(2).getByRole('cell', { name: String(slowTurns), exact: true })).toBeVisible()
  await expect(rows(page).nth(1)).toHaveAttribute('data-personal-best', 'true')
  await expect(trend(page).locator('[data-metric-best="true"]')).toHaveCount(1)

  await page.reload()
  await expect(page.getByRole('combobox', { name: '关卡', exact: true })).toHaveValue(salvageId)
  await expect(rows(page)).toHaveCount(3)
  await expect(rows(page).nth(1)).toHaveAttribute('data-personal-best', 'true')
  await page.getByRole('button', { name: '重玩这关', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: salvage.title.zh, exact: true })).toBeVisible()
  await expect(summary).toHaveCount(0)
})

test('arena records and trends separate modes and replay opens the chosen pace', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const arena = levels.find(level => level.id === arenaId)
  if (arena?.kind !== 'arena') throw new Error('Missing the arena level')
  const relaxed = { kind: 'arena', mode: 'relaxed', goal: 'score', turns: 14, score: 4, passed: 3, total: 3 }
  const timedBest = { kind: 'arena', mode: 'timed', goal: 'score', turns: 13, score: 7, passed: 1, total: 1 }
  const timedFast = { ...timedBest, turns: 9, score: 5 }
  await recordLocale(page, {
    [arenaId]: {
      'arena:relaxed:score:3': { latest: relaxed, best: relaxed, attempts: [{ score: relaxed, at: Date.UTC(2025, 2, 3) }] },
      'arena:timed:score:1': {
        latest: timedFast, best: timedBest,
        attempts: [{ score: timedBest, at: Date.UTC(2025, 2, 4) }, { score: timedFast, at: Date.UTC(2025, 2, 5) }],
      },
    },
  })
  await page.goto('/#challenge-records')
  await page.getByRole('combobox', { name: '关卡', exact: true }).selectOption(arenaId)
  const mode = page.getByRole('combobox', { name: '玩法', exact: true })
  const metric = page.getByRole('combobox', { name: '指标', exact: true })
  await mode.selectOption('relaxed')
  await metric.selectOption('score')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).getByRole('cell', { name: '4', exact: true })).toBeVisible()
  await expect(points(page)).toHaveCount(1)

  await mode.selectOption('timed')
  await expect(rows(page)).toHaveCount(2)
  await expect(rows(page).getByRole('cell', { name: '4', exact: true })).toHaveCount(0)
  await expect(rows(page).nth(1).getByRole('cell', { name: '7', exact: true })).toBeVisible()
  await expect(rows(page).nth(1)).toHaveAttribute('data-personal-best', 'true')
  await expect(trend(page).locator('[data-score-point="1"][data-metric-best="true"]')).toHaveCount(1)
  await metric.selectOption('turns')
  await expect(trend(page).locator('[data-score-point="2"][data-metric-best="true"]')).toHaveCount(1)
  await expect(rows(page).nth(1)).toHaveAttribute('data-personal-best', 'true')

  await page.reload()
  await expect(mode).toHaveValue('timed')
  await expect(rows(page)).toHaveCount(2)
  await page.getByRole('button', { name: '重玩这关', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: arena.title.zh, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '紧张', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '开始', exact: true })).toBeEnabled()
  await page.goBack()
  await expect(mode).toHaveValue('timed')
  await expect(rows(page)).toHaveCount(2)
})

test('earlier saved latest and best remain visible without fabricated dates', async ({ page }) => {
  const savedLatest = { kind: 'grid', turns: 19, passed: 1, total: 1 }
  const savedBest = { ...savedLatest, turns: 17 }
  await recordLocale(page, {
    [salvageId]: { 'grid:1': { latest: savedLatest, best: savedBest } },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/#challenge-records')
  await expect(page.getByRole('combobox', { name: '关卡', exact: true })).toHaveValue(salvageId)
  await expect(rows(page)).toHaveCount(2)
  await expect(recordsTable(page).getByText('旧记录', { exact: true })).toHaveCount(2)
  await expect(recordsTable(page).getByText('日期未知', { exact: true })).toHaveCount(2)
  await expect(rows(page).nth(1)).toHaveAttribute('data-personal-best', 'true')
  await expect(points(page)).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('Python challenge trends open on the checks metric', async ({ page }) => {
  const id = 'challenge-quiet-power-window'
  const first = { kind: 'algorithm', passed: 7, total: 7, checks: 3 }
  const best = { ...first, checks: 1 }
  await recordLocale(page, {
    [id]: { 'algorithm:7': { latest: best, best,
      attempts: [{ score: first, at: Date.UTC(2026, 10, 20) }, { score: best, at: Date.UTC(2026, 10, 21) }] } },
  })
  await page.goto('/#challenge-records/' + id)
  await expect(page.getByRole('combobox', { name: '指标', exact: true })).toHaveValue('checks')
  await expect(points(page)).toHaveCount(2)
  await expect(trend(page).locator('[data-score-point="2"][data-metric-best="true"]')).toHaveCount(1)
  await expect(rows(page).first().getByRole('cell', { name: '1', exact: true })).toBeVisible()
})
