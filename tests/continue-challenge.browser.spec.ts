import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'

const lastChallengeKey = 'pixel-repair-lab:last-challenge'
const firstGridId = 'limited-battery-salvage'
const secondGridId = 'challenge-two-lane-dispatch'
const thirdGridId = 'challenge-six-step-detour'

async function challengeLevels(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels } = await response.json() as Catalog
  return levels.filter(level => level.unit?.id === 'challenge-zone')
}

function continueCard(page: Page) {
  return page.getByRole('region', { name: '继续闯关', exact: true })
}

function lastPlayed(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), lastChallengeKey)
}

async function goHome(page: Page) {
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
}

test('the new home entry offers route selection and free choice in both languages', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')
  const card = continueCard(page)
  await expect(card).toHaveAttribute('data-continue-status', 'new')
  await card.getByRole('button', { name: '选择路线', exact: true }).click()
  const routes = page.getByRole('region', { name: '闯关路线', exact: true })
  await expect(routes).toBeFocused()
  await routes.locator('[data-challenge-route="ai"]').click()
  expect(await lastPlayed(page)).toBeNull()

  await goHome(page)
  await card.getByRole('button', { name: '自由选关', exact: true }).click()
  await expect(page.getByRole('region', { name: '自由选关', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Learning modules', exact: true }).click()
  const english = page.getByRole('region', { name: 'Continue challenges', exact: true })
  await expect(english.getByRole('button', { name: 'Choose a route', exact: true })).toBeVisible()
  await expect(english.getByRole('button', { name: 'Browse challenges', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('a freely chosen unfinished challenge stays the home continuation after reload', async ({ page, request }) => {
  const levels = await challengeLevels(request)
  const chosen = levels.find(level => level.id === 'challenge-freight-carousel')
  if (chosen?.kind !== 'arena') throw new Error('Missing the free-choice battle fixture')
  const total = levels.filter(level => level.kind === 'arena').length

  await page.goto('/')
  const card = continueCard(page)
  await card.getByRole('button', { name: '自由选关', exact: true }).click()
  const browse = page.getByRole('region', { name: '自由选关', exact: true })
  await browse.getByRole('combobox', { name: '类型', exact: true }).selectOption('arena')
  await browse.locator(`[data-challenge-level="${chosen.id}"]`).click()
  await expect(page.getByRole('heading', { name: chosen.title.zh, level: 1, exact: true })).toBeVisible()
  await expect.poll(() => lastPlayed(page)).toEqual({ levelId: chosen.id, routeType: 'arena' })

  await goHome(page)
  await expect(card).toHaveAttribute('data-continue-status', 'resume')
  await expect(card).toContainText(chosen.title.zh)
  await expect(card).toContainText('机器人对抗')
  await expect(card.getByTestId('continue-challenge-progress')).toContainText(`0 / ${total}`)
  await card.getByRole('button', { name: '切换路线', exact: true }).click()
  const routes = page.getByRole('region', { name: '闯关路线', exact: true })
  await expect(routes).toBeFocused()
  await expect(routes.locator('[data-challenge-route="arena"]')).toHaveAttribute('aria-pressed', 'true')
  await routes.locator('[data-challenge-route="grid"]').click()

  await page.reload()
  await goHome(page)
  await expect(card).toHaveAttribute('data-continue-status', 'resume')
  await expect(card.locator(`[data-continue-challenge="${chosen.id}"]`)).toBeVisible()
  await card.locator(`[data-continue-challenge="${chosen.id}"]`).click()
  await expect(page.getByRole('heading', { name: chosen.title.zh, level: 1, exact: true })).toBeVisible()
})

test('existing challenge activity seeds the home entry before a new visit is recorded', async ({ page }) => {
  await page.addInitScript(id => {
    localStorage.setItem('pixel-repair-lab:completed', JSON.stringify([id, 'first-steps']))
    localStorage.setItem('pixel-repair-lab:learning-record', JSON.stringify({
      [id]: { passedAt: 10, pending: false },
      'first-steps': { passedAt: 20, pending: false },
    }))
  }, firstGridId)
  await page.goto('/')
  const card = continueCard(page)
  await expect(card).toHaveAttribute('data-continue-status', 'next')
  await expect(card.getByTestId('continue-challenge-progress')).toContainText('已通关 1 /')
  await expect(card.locator(`[data-continue-challenge="${secondGridId}"]`)).toBeVisible()
  expect(await lastPlayed(page)).toBeNull()
})

test('winning then skipping advances the home recommendation without counting the skip', async ({ page, request }) => {
  const levels = await challengeLevels(request)
  const first = levels.find(level => level.id === firstGridId)
  const second = levels.find(level => level.id === secondGridId)
  const third = levels.find(level => level.id === thirdGridId)
  if (first?.kind !== 'grid' || !second || !third) throw new Error('Missing the first three grid challenges')
  const total = levels.filter(level => level.kind === 'grid').length

  await page.goto('/')
  const card = continueCard(page)
  await card.getByRole('button', { name: '选择路线', exact: true }).click()
  const routes = page.getByRole('region', { name: '闯关路线', exact: true })
  await routes.locator(`[data-route-next="${first.id}"]`).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(cardsToPython(first.cards, first.solutionCards))
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(page.getByRole('region', { name: '通关总结', exact: true })).toBeVisible()

  await goHome(page)
  await expect(card).toHaveAttribute('data-continue-status', 'next')
  await expect(card).toContainText(first.title.zh)
  await expect(card).toContainText(second.title.zh)
  await expect(card.locator(`[data-continue-challenge="${second.id}"]`)).toBeVisible()
  await expect(card.getByTestId('continue-challenge-progress')).toContainText(`1 / ${total}`)

  await card.getByRole('button', { name: '切换路线', exact: true }).click()
  await routes.locator(`[data-route-skip="${second.id}"]`).click()
  await expect.poll(() => lastPlayed(page)).toEqual({ levelId: second.id, routeType: 'grid' })
  await goHome(page)
  await expect(card).toHaveAttribute('data-continue-status', 'next')
  await expect(card).toContainText(second.title.zh)
  await expect(card).toContainText(third.title.zh)
  await expect(card.getByTestId('continue-challenge-progress')).toContainText(`1 / ${total}`)
  await page.reload()
  await card.locator(`[data-continue-challenge="${third.id}"]`).click()
  await expect(page.getByRole('heading', { name: third.title.zh, level: 1, exact: true })).toBeVisible()
})
