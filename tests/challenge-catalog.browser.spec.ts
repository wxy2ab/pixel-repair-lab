import { expect, test, type Locator, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog, GridLevel } from '../src/shared/types'

function challengeIds(cards: Locator) {
  return cards.evaluateAll(items => items.map(card => card.getAttribute('data-challenge-level')))
}

async function finishGridExercise(page: Page, lesson: GridLevel) {
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(cardsToPython(lesson.cards, lesson.solutionCards))
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.locator('.output-panel .win-message')).toContainText('任务完成')
}

test('standalone challenges open directly without changing learning roadmap progress', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  const challenges = levels.filter(level => level.unit?.id === 'challenge-zone')
  expect(challenges.length).toBeGreaterThanOrEqual(120)
  expect(challenges.every(level => level.stage === 'challenge')).toBe(true)
  expect(challenges.every(level => level.prerequisites?.length)).toBe(true)
  expect(challenges.every(level => level.difficulty)).toBe(true)
  const cleared = challenges.find(level => level.id === 'limited-battery-salvage')
  const next = challenges.find(level => level.id === 'double-patrol-lockdown')
  if (!cleared || !next) throw new Error('Missing starter challenges')

  await page.addInitScript(id => {
    localStorage.setItem('pixel-repair-lab:locale', 'zh')
    localStorage.setItem('pixel-repair-lab:completed', JSON.stringify([id]))
  }, cleared.id)
  await page.goto('/#challenge-zone')

  const arena = page.getByRole('region', { name: '挑战场', exact: true })
  const browse = arena.getByRole('region', { name: '自由选关', exact: true })
  const cards = browse.locator('[data-challenge-level]')
  const clearedCard = browse.getByRole('button', { name: cleared.title.zh, exact: true })
  const roadmap = page.getByRole('region', { name: '总学习路线图', exact: true })
  await expect(arena.getByRole('heading', { name: '挑战场' })).toBeInViewport()
  await expect(cards).toHaveCount(challenges.length)
  await expect(browse.getByRole('status')).toHaveText(`显示 ${challenges.length} / ${challenges.length} 关`)
  await expect(cards.locator('.challenge-card-courses')).toHaveCount(challenges.length)
  const prerequisiteCount = challenges.reduce((count, challenge) => count + (challenge.prerequisites?.length ?? 0), 0)
  await expect(cards.locator('[data-prep-status="pending"]')).toHaveCount(prerequisiteCount)
  const tiers = { starter: 0, intermediate: 1, advanced: 2 }
  const gridChallengeIds = challenges.filter(level => level.kind === 'grid' && level.difficulty)
    .sort((left, right) => tiers[left.difficulty!] - tiers[right.difficulty!] || left.order - right.order)
    .map(level => level.id)
  expect(await challengeIds(browse.locator('[data-challenge-level][data-type="grid"]'))).toEqual(gridChallengeIds)
  await expect(clearedCard).toHaveAttribute('data-completed', 'true')
  await expect(clearedCard.getByLabel('已完成')).toBeVisible()
  await expect(clearedCard).toContainText('再挑战')
  await expect(page.locator('[data-unit="challenge-zone"]')).toHaveCount(0)
  await expect(roadmap.locator('[data-roadmap-unit="challenge-zone"], [data-roadmap-prerequisite="challenge-zone"]')).toHaveCount(0)
  await expect(roadmap.locator('.roadmap-total strong')).toHaveText(/^0\s*\/\s*\d+$/)

  await clearedCard.click()
  await expect(page.getByRole('heading', { level: 1, name: cleared.title.zh, exact: true })).toBeVisible()
  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await expect(arena).toBeFocused()
  await browse.getByRole('button', { name: next.title.zh, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: next.title.zh, exact: true })).toBeVisible()

  await page.setViewportSize({ width: 320, height: 720 })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Challenge Arena', exact: true }).click()
  const english = page.getByRole('region', { name: 'Challenge Arena', exact: true })
  const englishBrowse = english.getByRole('region', { name: 'Browse challenges', exact: true })
  await expect(english.getByRole('heading', { name: 'Challenge Arena' })).toBeInViewport()
  await expect(englishBrowse.getByRole('button', { name: cleared.title.en, exact: true })).toContainText('Play again')
  await expect(englishBrowse.getByRole('combobox', { name: 'Type', exact: true })).toBeVisible()
  await expect(englishBrowse.getByRole('combobox', { name: 'Difficulty', exact: true })).toBeVisible()
  await expect(englishBrowse.getByRole('combobox', { name: 'Prerequisite course or topic', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.setViewportSize({ width: 1024, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)
})

test('challenge filters intersect and distinguish preparation modules from individual topics', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  const { levels } = await response.json() as Catalog
  const challenges = levels.filter(level => level.unit?.id === 'challenge-zone')
  const idsFor = (unit: string, topic?: string, advancedArena = false) => challenges.filter(level =>
    (!advancedArena || (level.kind === 'arena' && level.difficulty === 'advanced'))
    && level.prerequisites?.some(course => course.unit === unit && (topic === undefined || course.topic === topic)))
    .map(level => level.id).sort()
  await page.goto('/#challenge-zone')

  const browse = page.getByRole('region', { name: '自由选关', exact: true })
  const cards = browse.locator('[data-challenge-level]')
  const type = browse.getByRole('combobox', { name: '类型', exact: true })
  const difficulty = browse.getByRole('combobox', { name: '难度', exact: true })
  const prerequisite = browse.getByRole('combobox', { name: '前序课程或模块', exact: true })

  const pythonIds = idsFor('python-intermediate')
  const branchIds = idsFor('python-intermediate', 'branches')
  const filteredIds = async () => (await challengeIds(cards)).sort()
  expect(pythonIds).toContain('challenge-junction-race')
  expect(branchIds).not.toContain('challenge-junction-race')
  await prerequisite.selectOption('python-intermediate')
  await expect.poll(filteredIds).toEqual(pythonIds)
  await prerequisite.selectOption('python-intermediate/branches')
  await expect.poll(filteredIds).toEqual(branchIds)

  await prerequisite.selectOption('routing/breadth-first')
  await type.selectOption('arena')
  await difficulty.selectOption('advanced')
  const advancedArenaIds = idsFor('routing', 'breadth-first', true)
  await expect.poll(filteredIds).toEqual(advancedArenaIds)
  await browse.locator('[data-challenge-level="challenge-blackout-extraction"]').click()
  await expect(browse).toHaveCount(0)
  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await expect.poll(filteredIds).toEqual(advancedArenaIds)
  await difficulty.selectOption('starter')
  await expect(cards).toHaveCount(0)
  await expect(browse.getByText('没有符合筛选条件的挑战。', { exact: true })).toBeVisible()
  await browse.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(cards).toHaveCount(challenges.length)
})

test('recommendations depend on full prerequisite completion and omit cleared challenges', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  const { levels } = await response.json() as Catalog
  const foundations = levels.filter(level => level.unit?.id === 'foundations' && level.topic?.id === 'sequence')
  const routes = levels.filter(level => level.unit?.id === 'routing' && level.topic?.id === 'breadth-first')
  const core = levels.filter(level => level.unit?.id !== 'challenge-zone').map(level => level.id)
  expect(foundations.length).toBeGreaterThan(1)
  expect(routes.length).toBeGreaterThan(1)

  await page.addInitScript(ids => {
    const key = 'pixel-repair-lab:completed'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ids))
  }, [...foundations.slice(0, -1), ...routes].map(level => level.id))
  await page.goto('/#challenge-zone')

  const ready = page.getByRole('region', { name: '适合现在挑战', exact: true })
  const recommended = ready.locator('[data-recommended-challenge]')
  async function expectTopicsToQualify(topics: string[]) {
    const tiers = ['starter', 'intermediate', 'advanced']
    const eligible = levels.filter(level => level.unit?.id === 'challenge-zone' && level.prerequisites?.length
      && level.prerequisites.every(({ unit, topic }) => topics.includes(unit + '/' + topic)))
      .sort((a, b) => tiers.indexOf(a.difficulty ?? 'intermediate') - tiers.indexOf(b.difficulty ?? 'intermediate')
        || a.order - b.order || a.id.localeCompare(b.id, 'en'))
      .slice(0, 3)
    await expect(recommended).toHaveCount(eligible.length)
    for (const [index, level] of eligible.entries()) {
      await expect(recommended.nth(index)).toHaveAttribute('data-recommended-challenge', level.id)
    }
  }
  await expect(ready).toBeVisible()
  await expectTopicsToQualify(['routing/breadth-first'])

  await page.evaluate(ids => localStorage.setItem('pixel-repair-lab:completed', JSON.stringify(ids)),
    [...foundations, ...routes].map(level => level.id))
  await page.reload()
  await expectTopicsToQualify(['routing/breadth-first', 'foundations/sequence'])

  await page.evaluate(ids => localStorage.setItem('pixel-repair-lab:completed', JSON.stringify(ids)),
    [...core, 'limited-battery-salvage'])
  await page.reload()
  await expect(recommended).toHaveCount(3)
  await expect(ready.locator('[data-recommended-challenge="limited-battery-salvage"]')).toHaveCount(0)
  const browse = page.getByRole('region', { name: '自由选关', exact: true })
  await expect(browse.locator('[data-challenge-level="limited-battery-salvage"]')).toHaveAttribute('data-completed', 'true')
  await browse.getByRole('combobox', { name: '类型', exact: true }).selectOption('ai')
  await expect(recommended).toHaveCount(3)
  await page.setViewportSize({ width: 320, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await ready.getByRole('button', { name: '开始 双线应急补给', exact: true }).click()
  await expect(page.getByRole('heading', { name: '双线应急补给', level: 1, exact: true })).toBeVisible()
})

test('catch-up starts with the nearest challenge, survives a refresh, and returns after the remaining lessons', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const challenge = levels.find(level => level.id === 'limited-battery-salvage')
  const first = levels.find(level => level.id === 'first-steps')
  const second = levels.find(level => level.id === 'crystal-echo')
  if (!challenge || first?.kind !== 'grid' || second?.kind !== 'grid') throw new Error('Missing catch-up exercise fixtures')
  const studied = levels.filter(level => level.stage !== 'challenge' && level.id !== first.id && level.id !== second.id && (
    (level.unit?.id === 'routing' && level.topic?.id === 'breadth-first') ||
    (level.unit?.id === 'foundations' && level.topic?.id === 'sequence')))
  const sequenceLessonCount = studied.filter(level => level.topic?.id === 'sequence').length + 2
  await page.addInitScript(ids => {
    const key = 'pixel-repair-lab:completed'
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ids))
  }, [...studied.map(level => level.id), 'challenge-marked-cargo-run'])
  await page.goto('/#challenge-zone')

  const nearest = page.getByTestId('nearest-challenge')
  await expect(nearest).toHaveAttribute('data-challenge-id', challenge.id)
  await expect(nearest).toContainText(challenge.title.zh)
  await expect(nearest).toContainText('还差 2 节课')
  await expect(nearest).toContainText(first.title.zh)

  const doublePatrol = page.locator('[data-challenge-level="double-patrol-lockdown"]')
  const progress = doublePatrol.getByRole('progressbar', { name: '准备进度', exact: true })
  await expect(progress).toHaveAttribute('value', String(studied.length))
  await expect(progress).toHaveAttribute('max', String(studied.length + 2))
  await expect(doublePatrol.locator('[data-prep-status="pending"]')).toContainText('指令与顺序')
  await expect(doublePatrol.locator('[data-prep-status="complete"]')).toContainText('广度优先搜索')
  await expect(doublePatrol.locator('[data-prep-status="pending"]')).toContainText('待补')
  await expect(doublePatrol.locator('[data-prep-status="complete"]')).toContainText('已学完')

  await nearest.getByRole('button', { name: '直接挑战', exact: true }).click()
  const challengeHeading = page.getByRole('heading', { name: challenge.title.zh, level: 1, exact: true })
  await expect(challengeHeading).toBeVisible()
  const preparation = page.getByRole('region', { name: '建议先学', exact: true })
  await expect(preparation.locator('[data-prep-status="pending"]')).toContainText('指令与顺序')
  await preparation.getByText('查看待补课节', { exact: true }).click()
  await expect(preparation.locator('details').getByRole('listitem')).toHaveText([first.title.zh, second.title.zh])
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill('move("right")')
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeEnabled()

  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await nearest.getByRole('button', { name: '去补课', exact: true }).click()
  const firstHeading = page.getByRole('heading', { name: first.title.zh, level: 1, exact: true })
  const route = page.getByRole('region', { name: '补课路线', exact: true })
  await expect(firstHeading).toBeVisible()
  await expect(route).toContainText(challenge.title.zh)
  await page.reload()
  await expect(firstHeading).toBeVisible()
  await expect(route).toContainText('还差 2 节课')

  await finishGridExercise(page, first)
  await expect(route).toContainText('还差 1 节课')
  await route.getByRole('button', { name: '补下一课', exact: true }).click()
  await expect(page.getByRole('heading', { name: second.title.zh, level: 1, exact: true })).toBeVisible()
  await finishGridExercise(page, second)
  await expect(route).toContainText('前序课程已学完。')
  await route.getByRole('button', { name: '返回原挑战', exact: true }).click()
  await expect(challengeHeading).toBeVisible()
  await expect(route).toHaveCount(0)
  await expect(preparation.locator('[data-prep-status="complete"]')).toContainText('指令与顺序')
  await expect(preparation.locator('[data-prep-status="pending"]')).toHaveCount(0)
  await expect(preparation.getByText('查看待补课节', { exact: true })).toHaveCount(0)
  const completed = preparation.getByRole('progressbar', { name: '准备进度', exact: true })
  await expect(completed).toHaveAttribute('value', String(sequenceLessonCount))
  await expect(completed).toHaveAttribute('max', String(sequenceLessonCount))

  await page.getByRole('button', { name: '挑战场', exact: true }).click()
  await expect(nearest).toHaveCount(0)
  await expect(page.locator(`[data-recommended-challenge="${challenge.id}"]`)).toBeVisible()
})

test('challenge prerequisites name and link to the source course even with no progress', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const challenge = levels.find(level => level.id === 'challenge-junction-race')
  const topic = levels.find(level => level.unit?.id === 'routing' && level.topic?.id === 'breadth-first' && level.stage === 'explain')
  if (!challenge || !topic) throw new Error('Missing a challenge or its course')

  await page.goto('/#challenge-zone')
  const card = page.getByRole('button', { name: challenge.title.zh, exact: true })
  await expect(card).toContainText('建议先学')
  await expect(card).toContainText('Python 进阶')
  await expect(card).toContainText('算法进阶 · 广度优先搜索')
  await card.click()
  await expect(page.getByRole('heading', { name: challenge.title.zh, level: 1 })).toBeVisible()
  const preparation = page.getByRole('region', { name: '建议先学' })
  await expect(preparation.getByRole('button', { name: 'Python 进阶', exact: true })).toBeVisible()
  await preparation.getByRole('button', { name: '算法进阶 · 广度优先搜索', exact: true }).click()
  await expect(page.getByRole('heading', { name: topic.title.zh, level: 1 })).toBeVisible()
  const route = page.getByRole('region', { name: '补课路线', exact: true })
  await route.getByRole('button', { name: '返回原挑战', exact: true }).click()
  await expect(page.getByRole('heading', { name: challenge.title.zh, level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Challenge Arena', exact: true }).click()
  const englishCard = page.getByRole('button', { name: challenge.title.en, exact: true })
  await expect(englishCard).toContainText('Recommended before playing')
  await englishCard.click()
  const englishCourses = page.getByRole('region', { name: 'Recommended before playing' })
  await expect(englishCourses).toContainText(topic.topic!.title.en)
  await expect(englishCourses.locator('[data-prep-status="pending"]').first()).toContainText('To study')
  await expect(englishCourses.getByRole('progressbar', { name: 'Preparation progress', exact: true })).toHaveAttribute('value', '0')
  await page.setViewportSize({ width: 320, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})
