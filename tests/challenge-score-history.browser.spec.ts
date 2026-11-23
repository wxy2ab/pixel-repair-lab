import { expect, test, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'

const salvageId = 'limited-battery-salvage'
const nextId = 'double-patrol-lockdown'

async function openSalvage(page: Page) {
  await page.locator(`[data-challenge-level="${salvageId}"]`).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
}

async function runGridCode(page: Page, source: string) {
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
}

test('real challenge wins compare with the previous clearance and persistent personal best', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  const catalog = await response.json() as Catalog
  const salvage = catalog.levels.find(level => level.id === salvageId)
  const next = catalog.levels.find(level => level.id === nextId)
  if (salvage?.kind !== 'grid' || !next || !salvage.turnLimit) throw new Error('Missing challenge fixtures')

  // Give the real map enough room for one out-and-back detour, so both runs can win.
  const fast = cardsToPython(salvage.cards, salvage.solutionCards)
  const slow = 'move("right")\nmove("left")\n' + fast
  const fastTurns = salvage.turnLimit
  const slowTurns = fastTurns + 2
  await page.route('**/api/levels', route => route.fulfill({ json: {
    ...catalog,
    levels: catalog.levels.map(level => level.id === salvageId ? { ...salvage, turnLimit: slowTurns } : level),
  } }))

  const completedLessons = catalog.levels.filter(level =>
    (level.unit?.id === 'foundations' && level.topic?.id === 'sequence')
    || (level.unit?.id === 'routing' && level.topic?.id === 'breadth-first'),
  ).map(level => level.id)
  await page.addInitScript(completed => {
    localStorage.setItem('pixel-repair-lab:locale', 'zh')
    const key = 'pixel-repair-lab:completed'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(completed))
  }, [...completedLessons, salvageId])
  await page.goto('/#challenge-zone')
  await expect(page.locator(`[data-challenge-level="${salvageId}"] [aria-label="已完成"]`)).toBeVisible()
  await openSalvage(page)

  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  const turns = summary.locator('[data-score-metric="turns"] td')
  const draft = page.getByRole('textbox', { name: '编写 Python', exact: true })

  await draft.fill('move("up")')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByRole('region', { name: '失败复盘', exact: true })).toBeVisible()
  await expect(summary).toHaveCount(0)

  await runGridCode(page, slow)
  await expect(turns).toHaveCount(3)
  await expect(turns.nth(0)).toContainText(String(slowTurns))
  await expect(turns.nth(1)).not.toContainText(/\d/u)
  await expect(turns.nth(2)).toContainText(String(slowTurns))

  await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(draft).toHaveValue(slow)
  await runGridCode(page, fast)
  await expect(turns.nth(0)).toContainText(String(fastTurns))
  await expect(turns.nth(1)).toContainText(String(slowTurns))
  await expect(turns.nth(2)).toContainText(String(fastTurns))
  await expect(summary.getByText('新纪录', { exact: true })).toBeVisible()
  await expect(summary.getByText('回合比上次少 2', { exact: true })).toBeVisible()

  const nextButton = summary.getByRole('button', { name: /挑战下一关/u })
  await expect(nextButton).toHaveAttribute('data-next-challenge', nextId)
  await nextButton.click()
  await expect(page.getByRole('heading', { level: 1, name: next.title.zh, exact: true })).toBeVisible()
  await expect(summary).toHaveCount(0)

  await page.reload()
  await openSalvage(page)
  await runGridCode(page, slow)
  await expect(turns.nth(0)).toContainText(String(slowTurns))
  await expect(turns.nth(1)).toContainText(String(fastTurns))
  await expect(turns.nth(2)).toContainText(String(fastTurns))
  await expect(summary.getByText('新纪录', { exact: true })).toHaveCount(0)

  await summary.getByRole('button', { name: '自由选关', exact: true }).click()
  const browse = page.getByRole('region', { name: '自由选关', exact: true })
  await expect(browse.locator(`[data-challenge-level="${salvageId}"]`)).toBeVisible()
  await expect(summary).toHaveCount(0)
})
