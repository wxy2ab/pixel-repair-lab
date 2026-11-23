import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { Catalog, Level } from '../src/shared/types'

const units = ['structures', 'algorithm-intro', 'routing', 'algorithm-advanced'] as const
const phases = ['explain', 'demo', 'exercise', 'challenge'] as const
const progressKey = 'pixel-repair-lab:completed'
const overview = (level: Level) => level.kind === 'lecture' && level.overview === true
const legacyIds = [
  'pocket-route', 'stacked-cargo', 'arrival-queue', 'robot-directory', 'structures-notes', 'structures-replay',
  'linear-search-notes', 'linear-scan-demo', 'first-index', 'count-matches', 'binary-search-index',
  'routing-notes', 'routing-replay', 'shortest-step', 'parts-race', 'escape-patrol',
  'dynamic-programming-notes', 'rolling-scores-demo', 'max-supply-score', 'count-stair-routes',
]

async function catalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const result = await response.json() as Catalog
  expect(result.issues).toEqual([])
  return result.levels
}

function orderedUnit(levels: Level[], unitId: typeof units[number]) {
  return levels.filter(level => level.unit?.id === unitId).sort((left, right) =>
    Number(overview(right)) - Number(overview(left)) ||
    ((left.topic?.order ?? Infinity) - (right.topic?.order ?? Infinity)) ||
    (phases.indexOf(left.stage!) - phases.indexOf(right.stage!)) || left.order - right.order,
  )
}

function openUnit(page: Page, id: string) {
  return page.locator(`[data-unit="${id}"]`).click()
}

function home(page: Page) {
  return page.getByRole('button', { name: '学习模块', exact: true }).click()
}

function mission(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
}

async function expectLesson(page: Page, level: Level) {
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
}

test('the four algorithm units preserve old progress and show each topic before the optional challenge', async ({ page, request }) => {
  const levels = await catalog(request)
  await page.addInitScript(({ key, ids }) => localStorage.setItem(key, JSON.stringify([...ids, ids[0], 'retired'])), {
    key: progressKey, ids: legacyIds,
  })
  await page.goto('/')
  const cards = page.getByRole('region', { name: '数据结构与算法', exact: true }).locator('button[data-unit]')
  await expect(cards).toHaveCount(units.length)
  await expect(page.getByRole('progressbar', { name: '已完成任务' })).toHaveAttribute('aria-valuenow', String(legacyIds.length))

  for (const [index, unit] of units.entries()) {
    await test.step(unit, async () => {
      const members = orderedUnit(levels, unit)
      const challenges = members.filter(level => level.stage === 'challenge')
      expect(challenges).toHaveLength(1)
      expect(challenges[0].topic).toBeUndefined()
      expect(members.at(-1)?.id).toBe(challenges[0].id)
      const core = members.slice(0, -1)
      const overviews = core.filter(overview)
      expect(overviews.map(level => level.id)).toEqual(unit === 'structures' ? ['structures-notes'] : [])
      const topics = new Map(core.flatMap(level => level.topic ? [[level.topic.id, level.topic] as const] : []))
      expect(topics.size).toBeGreaterThanOrEqual(3)
      expect([...topics.values()].map(({ order }) => order)).toEqual(Array.from({ length: topics.size }, (_, step) => step + 1))
      for (const topic of topics.values()) {
        const [lecture, demo, ...practice] = core.filter(level => level.topic?.id === topic.id)
        expect(lecture.stage).toBe('explain')
        expect(lecture.kind === 'lecture' && Boolean(lecture.execution || (lecture.animation?.frames.length ?? 0) >= 2)).toBe(true)
        expect(demo.stage).toBe('demo')
        expect(demo.kind === 'replay' && demo.mode === 'grid').toBe(true)
        expect(practice.length).toBeGreaterThanOrEqual(2)
        expect(practice.every(level => level.stage === 'exercise')).toBe(true)
        expect(practice.every((level, position) => !position || practice[position - 1].order < level.order)).toBe(true)
      }

      await expect(cards.nth(index)).toHaveAttribute('data-unit', unit)
      await cards.nth(index).click()
      await expect(page.locator('.mission-list .mission-name')).toHaveText(members.map(level => level.title.zh))
      await expect(page.locator('.mission-list .course-topic-heading')).toHaveText([
        ...(overviews.length ? ['课程全貌'] : []),
        ...[...topics.values()].map(topic => topic.title.zh), '阶段综合挑战 · 选做',
      ])
      for (const level of members.filter(level => legacyIds.includes(level.id))) {
        await expect(mission(page, level).locator('.mission-check')).toBeVisible()
      }
      await home(page)
    })
  }
})

test('the algorithm course starts, resumes, and lets learners skip each optional stage challenge', async ({ page, request }) => {
  const levels = await catalog(request)
  const coreByUnit = units.map(unit => orderedUnit(levels, unit).filter(level => level.stage !== 'challenge'))
  const initial = coreByUnit[0][0]
  if (initial.kind !== 'lecture') throw new Error('The algorithms course must start with a lecture')

  await page.goto('/')
  await page.getByRole('button', { name: '开始数据结构与算法课程', exact: true }).click()
  await expectLesson(page, initial)
  await page.evaluate(({ key, id }) => localStorage.setItem(key, JSON.stringify([id])), { key: progressKey, id: initial.id })
  await page.reload()
  const resume = page.getByRole('button', { name: '继续数据结构与算法课程', exact: true })
  await resume.click()
  await expectLesson(page, coreByUnit[0][1])
  await expect(page.locator('.algorithm-route-nav')).toContainText('主线进度 1/')

  for (let boundary = 0; boundary < units.length - 1; boundary++) {
    const completed = coreByUnit.slice(0, boundary + 1).flat().map(level => level.id)
    const last = coreByUnit[boundary].at(-1)!
    const next = coreByUnit[boundary + 1][0]
    await page.evaluate(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), { key: progressKey, ids: completed })
    await page.reload()
    await resume.click()
    await expectLesson(page, next)
    await page.getByRole('button', { name: '上一课', exact: true }).click()
    await expectLesson(page, last)
    await expect(page.getByRole('button', { name: '选做综合挑战', exact: true })).toBeVisible()
    await page.getByRole('button', { name: `进入 ${next.unit!.title.zh}`, exact: true }).click()
    await expectLesson(page, next)
    await expect(page.locator('.algorithm-route-nav')).toContainText(`阶段 ${boundary + 2}/4`)
  }
})

test('saved choose_supply wins the advanced race on all three boards against three opponents', async ({ page, request }) => {
  const levels = orderedUnit(await catalog(request), 'algorithm-advanced')
  const practice = levels.find(level => level.kind === 'algorithm' && level.functionName === 'choose_supply')
  const arena = levels.find(level => level.kind === 'arena' && level.stage === 'challenge')
  if (practice?.kind !== 'algorithm' || arena?.kind !== 'arena') throw new Error('Missing the advanced strategy practice or arena')
  expect(arena.variants).toHaveLength(2)
  expect(arena.opponents).toHaveLength(3)

  await page.goto('/')
  await openUnit(page, 'algorithm-advanced')
  await mission(page, practice).click()
  await expectLesson(page, practice)
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const run = page.getByRole('button', { name: '运行', exact: true })
  const personal = '# 我保存的补给策略\n' + practice.solutionCode
  await editor.fill(personal)
  await run.click()
  await expect(page.getByRole('status')).toHaveText(`${practice.cases.length}/${practice.cases.length} 个用例通过`)
  await page.getByRole('button', { name: '保存到我的算法', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: '我的算法', exact: true }).click()
  await page.locator('.algorithm-entry summary').filter({ hasText: 'choose_supply' }).click()
  await expect(page.locator('.algorithm-entry pre')).toContainText('# 我保存的补给策略')

  await home(page)
  await openUnit(page, 'algorithm-advanced')
  await mission(page, arena).click()
  await expectLesson(page, arena)
  const scores = page.getByRole('list', { name: '对抗比分' })
  await expect(scores.getByRole('listitem')).toHaveCount(4)
  for (const opponent of arena.opponents) await expect(scores).toContainText(opponent.title.zh)
  await editor.fill(arena.solutionCode)
  const useMine = page.getByRole('button', { name: '用我的函数 · choose_supply', exact: true })
  await useMine.click()
  await expect(useMine).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toHaveValue(/^from my_algorithms import choose_supply\n/)
  await run.click()
  const slider = page.getByRole('slider', { name: '回放进度' })
  await slider.press('End')
  await expect(page.locator('.teaching-panel p[role="status"]')).toHaveText('你收集的零件最多，获胜！')
  await expect(page.getByText('场景通过 3/3', { exact: true })).toBeVisible()
  await expect(mission(page, arena).locator('.mission-check')).toBeVisible()
  await expect(page.locator('.algorithm-route-nav')).toContainText('主线进度 1/')
})
