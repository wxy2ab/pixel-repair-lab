import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { Catalog, Level } from '../src/shared/types'
import { finishProgramBasics } from './helpers/programGuide'

const progressKey = 'pixel-repair-lab:completed'
const lastLessonKey = 'pixel-repair-lab:last-lesson'
const route = [
  ['python', ['foundations', 'python-intermediate', 'python-advanced']],
  ['algorithms', ['structures', 'algorithm-intro', 'routing', 'algorithm-advanced']],
  ['computer', ['computer', 'architecture']],
  ['digital-circuits', ['digital-circuits']],
  ['data', ['numpy', 'pandas', 'statistics', 'database']],
  ['vision', ['opencv', 'yolox']],
  ['ai', ['ai', 'ai-review']],
] as const
const unitIds = new Set<string>(route.flatMap(([, units]) => [...units]))

async function catalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const result = await response.json() as Catalog
  expect(result.issues).toEqual([])
  return result.levels
}

function lesson(levels: Level[], id: string) {
  const result = levels.find(level => level.id === id)
  if (!result) throw new Error('Missing lesson ' + id)
  return result
}

function isCore(level: Level) {
  return unitIds.has(level.unit?.id ?? '')
    && (level.stage !== 'challenge' || ('courseFinal' in level && level.courseFinal === true))
}

function course(page: Page, id: string) {
  return page.locator(`[data-roadmap-course="${id}"]`)
}

function unit(page: Page, id: string) {
  return page.locator(`[data-roadmap-unit="${id}"]`)
}

function action(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true })
}

function heading(page: Page, level: Level) {
  return page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })
}

function mission(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
}

async function seedProgress(page: Page, completed: Level[], last?: Level) {
  await page.goto('/')
  await expect(page.getByTestId('roadmap-resume')).toBeVisible()
  await page.evaluate(({ progressKey, lastLessonKey, completedIds, lastId }) => {
    localStorage.setItem(progressKey, JSON.stringify(completedIds))
    if (lastId) localStorage.setItem(lastLessonKey, lastId)
  }, { progressKey, lastLessonKey, completedIds: completed.map(item => item.id), lastId: last?.id })
  await page.reload()
}

test('the roadmap presents all courses in order, prerequisites, and a live first recommendation', async ({ page, request }) => {
  const levels = await catalog(request)
  const first = lesson(levels, 'python-program-basics')
  const second = lesson(levels, 'python-program-interfaces')
  if (first.kind !== 'lecture') throw new Error('The first Python lesson must be a lecture')
  await page.goto('/')
  const roadmap = page.getByRole('region', { name: '总学习路线图', exact: true })
  await expect(roadmap).toBeVisible()
  await expect.poll(() => roadmap.locator('[data-roadmap-course]').evaluateAll(cards =>
    cards.map(card => card.getAttribute('data-roadmap-course')))).toEqual(route.map(([id]) => id))

  for (const [id, units] of route) {
    const card = course(page, id)
    await expect(card).toHaveAttribute('data-state', 'not-started')
    expect(await card.locator('[data-roadmap-unit]').evaluateAll(chips =>
      chips.map(chip => chip.getAttribute('data-roadmap-unit')))).toEqual([...units])
  }
  for (const [id, prerequisites] of [
    ['algorithms', ['foundations', 'python-intermediate']],
    ['data', ['foundations', 'python-intermediate']],
    ['vision', ['numpy']],
  ] as const) {
    const preparation = course(page, id).getByTestId('roadmap-prerequisites')
    expect(await preparation.locator('[data-roadmap-prerequisite]').evaluateAll(chips =>
      chips.map(chip => chip.getAttribute('data-roadmap-prerequisite')))).toEqual([...prerequisites])
    for (const prerequisite of prerequisites) {
      const source = levels.find(level => level.unit?.id === prerequisite)?.unit
      if (!source) throw new Error('Missing prerequisite unit ' + prerequisite)
      await expect(preparation).toContainText(source.title.zh)
    }
  }
  await expect(roadmap.getByRole('link', { name: '自由选课', exact: true })).toHaveAttribute('href', '#free-choices')
  await expect(page.getByTestId('roadmap-recommendation')).toContainText(first.title.zh)
  await expect(course(page, 'python')).toHaveAttribute('data-recommended')
  const resume = page.getByTestId('roadmap-resume')
  await expect(resume).toHaveAccessibleName('继续学习')
  await resume.click()
  await expect(heading(page, first)).toBeVisible()
  await finishProgramBasics(page)
  await action(page, first.question.options[first.question.correct].zh).click()
  await action(page, '学习模块').click()
  await expect(course(page, 'python')).toHaveAttribute('data-state', 'in-progress')
  await expect(unit(page, 'foundations')).toHaveAttribute('data-state', 'in-progress')
  await expect(page.getByTestId('roadmap-recommendation')).toContainText(second.title.zh)
  await resume.click()
  await expect(heading(page, second)).toBeVisible()
})

test('the English mobile roadmap inherits existing progress and fits a narrow screen', async ({ page, request }) => {
  const levels = await catalog(request)
  const first = lesson(levels, 'python-program-basics')
  const legacyCompletion = lesson(levels, 'yolox-object-detection-notes')
  const next = lesson(levels, 'vision-yolox')
  await page.setViewportSize({ width: 390, height: 844 })
  await seedProgress(page, [legacyCompletion])
  await action(page, 'EN').click()
  const roadmap = page.getByRole('region', { name: 'Learning roadmap', exact: true })
  await expect(roadmap).toBeVisible()
  await expect(page.getByTestId('roadmap-recommendation')).toContainText(first.title.en)
  await expect(unit(page, 'yolox')).toHaveAttribute('data-state', 'in-progress')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const resume = page.getByTestId('roadmap-resume')
  await expect(resume).toHaveAccessibleName('Continue learning')
  await resume.click()
  await expect(page.getByRole('heading', { level: 1, name: next.title.en, exact: true })).toBeVisible()
})

test('freely chosen lessons are available and continue in the chosen course after reload', async ({ page, request }) => {
  const levels = await catalog(request)
  const first = lesson(levels, 'python-program-basics')
  const visionStart = lesson(levels, 'yolox-object-detection-notes')
  const chosen = lesson(levels, 'yolox-boxes-lesson')
  const visionNext = lesson(levels, 'yolox-bounding-box-demo')
  if (chosen.kind !== 'lecture') throw new Error('Expected the bounding-box lecture')
  await page.goto('/')
  await unit(page, 'yolox').click()
  await expect(heading(page, visionStart)).toBeVisible()
  await action(page, '学习模块').click()
  await page.getByRole('link', { name: '自由选课', exact: true }).click()
  await expect(page).toHaveURL(/#free-choices$/)
  await page.locator('[data-unit="yolox"]').click()
  await mission(page, chosen).click()
  await expect(heading(page, chosen)).toBeVisible()
  await action(page, '学习模块').click()
  await page.reload()
  await expect(page.getByTestId('roadmap-recommendation')).toContainText(first.title.zh)
  const resume = page.getByTestId('roadmap-resume')
  await resume.click()
  await expect(heading(page, chosen)).toBeVisible()
  await action(page, chosen.question.options[chosen.question.correct].zh).click()
  await action(page, '学习模块').click()
  await expect(course(page, 'vision')).toHaveAttribute('data-state', 'in-progress')
  await resume.click()
  await expect(heading(page, visionNext)).toBeVisible()
})

test('visiting an optional challenge does not change the next mainline lesson or undo unit completion', async ({ page, request }) => {
  const levels = await catalog(request)
  const next = lesson(levels, 'control-flow-notes')
  const beforeChallenge = lesson(levels, 'charge-needed')
  const optional = lesson(levels, 'plan-charge')
  await seedProgress(page, levels.filter(level => level.unit?.id === 'foundations' && isCore(level)), beforeChallenge)
  await expect(unit(page, 'foundations')).toHaveAttribute('data-state', 'completed')
  await expect(page.getByTestId('roadmap-recommendation')).toContainText(next.title.zh)

  await unit(page, 'foundations').click()
  await mission(page, beforeChallenge).click()
  await action(page, '选做综合挑战').click()
  await expect(heading(page, optional)).toBeVisible()
  await expect(mission(page, optional).locator('.mission-check')).toHaveCount(0)
  await action(page, '学习模块').click()
  await page.reload()
  await expect(unit(page, 'foundations')).toHaveAttribute('data-state', 'completed')
  await page.getByTestId('roadmap-resume').click()
  await expect(heading(page, next)).toBeVisible()
})

test('required final projects count toward completion while all optional challenges can be left open', async ({ page, request }) => {
  const levels = await catalog(request)
  const project = lesson(levels, 'ai-inspection-project')
  const allCore = levels.filter(isCore)
  const allButProject = allCore.filter(level => level.id !== project.id)
  await seedProgress(page, allButProject)
  await expect(course(page, 'python')).toHaveAttribute('data-state', 'completed')
  await expect(course(page, 'ai')).toHaveAttribute('data-state', 'in-progress')
  await expect(unit(page, 'ai-review')).toHaveAttribute('data-state', 'in-progress')
  await expect(page.getByTestId('roadmap-recommendation')).toContainText(project.title.zh)
  const resume = page.getByTestId('roadmap-resume')
  await resume.click()
  await expect(heading(page, project)).toBeVisible()

  await action(page, '学习模块').click()
  await seedProgress(page, allCore, project)
  await expect(page.locator('[data-roadmap-course][data-state="completed"]')).toHaveCount(route.length)
  await expect(unit(page, 'ai-review')).toHaveAttribute('data-state', 'completed')
  await expect(resume).toHaveAccessibleName('复习路线')
  await resume.click()
  await expect(heading(page, lesson(levels, 'python-program-basics'))).toBeVisible()
})
