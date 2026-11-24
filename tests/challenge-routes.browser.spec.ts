import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'

const progressKey = 'pixel-repair-lab:completed'
const skipsKey = 'pixel-repair-lab:challenge-route-skips'
const firstGridId = 'limited-battery-salvage'
const secondGridId = 'challenge-two-lane-dispatch'
const thirdGridId = 'challenge-six-step-detour'
const tiers = { starter: 0, intermediate: 1, advanced: 2 }
const routeKinds = [
  ['grid', 'grid'], ['warehouse', 'grid'], ['arena', 'arena'], ['algorithm', 'algorithm'],
  ['systems', 'machine'], ['data', 'data'], ['vision', 'vision'], ['ai', 'ai'],
] as const

async function challengeLevels(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels } = await response.json() as Catalog
  return levels.filter(level => level.unit?.id === 'challenge-zone')
}

async function openWithProgress(page: Page, completed: string[] = [], skipped: string[] = []) {
  await page.addInitScript(({ completed, skipped, progressKey, skipsKey }) => {
    if (!localStorage.getItem(progressKey)) localStorage.setItem(progressKey, JSON.stringify(completed))
    if (!localStorage.getItem(skipsKey)) localStorage.setItem(skipsKey, JSON.stringify(skipped))
  }, { completed, skipped, progressKey, skipsKey })
  await page.goto('/#challenge-zone')
  return page.getByRole('region', { name: '闯关路线', exact: true })
}

test('all gameplay routes include every challenge in difficulty order and fit a bilingual phone layout', async ({ page, request }) => {
  const challenges = await challengeLevels(request)
  expect(challenges.length).toBeGreaterThanOrEqual(120)
  await page.setViewportSize({ width: 320, height: 720 })
  const routes = await openWithProgress(page, [firstGridId])
  await expect(routes.locator('[data-challenge-route]')).toHaveCount(routeKinds.length)
  await expect(routes.locator(`[data-route-step="${firstGridId}"]`)).toHaveAttribute('data-route-status', 'cleared')
  await expect(routes.locator(`[data-route-next="${secondGridId}"]`)).toBeVisible()
  const covered: string[] = []

  for (const [type, kind] of routeKinds) {
    const select = routes.locator(`[data-challenge-route="${type}"]`)
    await select.click()
    await expect(select).toHaveAttribute('aria-pressed', 'true')
    const expected = challenges.filter(level => level.kind === kind
      && (level.kind !== 'grid' || Boolean(level.warehouse) === (type === 'warehouse')))
      .sort((left, right) => tiers[left.difficulty ?? 'intermediate'] - tiers[right.difficulty ?? 'intermediate']
        || left.order - right.order || left.id.localeCompare(right.id, 'en'))
      .map(level => level.id)
    await expect.poll(() => routes.locator('[data-route-step]').evaluateAll(
      steps => steps.map(step => step.getAttribute('data-route-step')),
    )).toEqual(expected)
    covered.push(...expected)
  }

  expect(covered.sort()).toEqual(challenges.map(level => level.id).sort())
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  const english = page.getByRole('region', { name: 'Challenge routes', exact: true })
  await expect(english.getByRole('button', { name: /Robot battles/u })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  const ai = english.locator('[data-challenge-route="ai"]')
  await expect(ai).toHaveAttribute('aria-pressed', 'true')
  await english.locator('[data-route-next]').click()
  await page.getByRole('button', { name: 'Back to challenge routes', exact: true }).click()
  await expect(ai).toHaveAttribute('aria-pressed', 'true')
})

test('skipping persists without counting as a win and still allows free play and restoration', async ({ page, request }) => {
  const skipped = (await challengeLevels(request)).find(level => level.id === secondGridId)
  if (!skipped) throw new Error('Missing the second grid challenge')
  const routes = await openWithProgress(page, [firstGridId])
  const step = routes.locator(`[data-route-step="${skipped.id}"]`)
  await expect(step).toHaveAttribute('data-route-status', 'next')
  await routes.locator(`[data-route-skip="${skipped.id}"]`).click()
  await expect(step).toHaveAttribute('data-route-status', 'skipped')
  await expect(routes.locator(`[data-route-next="${thirdGridId}"]`)).toBeVisible()
  await expect(routes.locator('[data-route-status="cleared"]')).toHaveCount(1)

  await page.reload()
  await expect(step).toHaveAttribute('data-route-status', 'skipped')
  await expect(routes.locator(`[data-route-next="${thirdGridId}"]`)).toBeVisible()
  const browse = page.getByRole('region', { name: '自由选关', exact: true })
  await browse.getByRole('combobox', { name: '类型', exact: true }).selectOption('grid')
  await browse.getByRole('combobox', { name: '难度', exact: true }).selectOption('starter')
  const freeCard = browse.locator(`[data-challenge-level="${skipped.id}"]`)
  await expect(freeCard).toBeVisible()
  await expect(freeCard.locator('[aria-label="已完成"]')).toHaveCount(0)
  await freeCard.click()
  await expect(page.getByRole('heading', { name: skipped.title.zh, level: 1, exact: true })).toBeVisible()

  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await expect(step).toHaveAttribute('data-route-status', 'skipped')
  await routes.locator(`[data-route-unskip="${skipped.id}"]`).click()
  await expect(step).toHaveAttribute('data-route-status', 'next')
  await page.reload()
  await expect(routes.locator(`[data-route-next="${skipped.id}"]`)).toBeVisible()
})

test('a route win recommends the next unskipped challenge in that route and updates its progress', async ({ page, request }) => {
  const challenges = await challengeLevels(request)
  const first = challenges.find(level => level.id === firstGridId)
  const next = challenges.find(level => level.id === thirdGridId)
  if (first?.kind !== 'grid' || !next) throw new Error('Missing route challenges')
  const routes = await openWithProgress(page, [], [secondGridId])
  await routes.locator(`[data-route-next="${first.id}"]`).click()
  await expect(page.getByRole('heading', { name: first.title.zh, level: 1, exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(cardsToPython(first.cards, first.solutionCards))
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()

  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  await expect(summary.getByRole('button', { name: '返回闯关路线', exact: true })).toBeVisible()
  await summary.locator(`[data-next-challenge="${next.id}"]`).click()
  await expect(page.getByRole('heading', { name: next.title.zh, level: 1, exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回闯关路线', exact: true }).click()
  await expect(routes.locator(`[data-route-step="${first.id}"]`)).toHaveAttribute('data-route-status', 'cleared')
  await expect(routes.locator(`[data-route-step="${secondGridId}"]`)).toHaveAttribute('data-route-status', 'skipped')
  await expect(routes.locator(`[data-route-next="${next.id}"]`)).toBeVisible()
})
