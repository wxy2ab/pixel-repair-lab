import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { Catalog, Level } from '../src/shared/types'
import { finishProgramBasics } from './helpers/programGuide'

const stages = ['foundations', 'python-intermediate', 'python-advanced'] as const
const lessonTypes = ['explain', 'demo', 'exercise', 'challenge'] as const
const progressKey = 'pixel-repair-lab:completed'

async function fetchCatalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const catalog = await response.json() as Catalog
  expect(catalog.issues).toEqual([])
  return catalog.levels
}

function orderedStage(levels: Level[], unitId: typeof stages[number]) {
  return levels.filter(level => level.unit?.id === unitId).sort((left, right) => {
    const overview = Number(right.kind === 'lecture' && right.overview === true) - Number(left.kind === 'lecture' && left.overview === true)
    const topic = (left.topic?.order ?? Infinity) - (right.topic?.order ?? Infinity)
    const stage = lessonTypes.indexOf(left.stage!) - lessonTypes.indexOf(right.stage!)
    return overview || topic || stage || left.order - right.order
  })
}

function required(levels: Level[]) {
  return levels.filter(level => level.stage !== 'challenge')
}

async function expectLesson(page: Page, level: Level) {
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
}

function chooseLesson(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ hasText: level.title.zh }).click()
}

function goToModules(page: Page) {
  return page.getByRole('button', { name: '学习模块', exact: true }).click()
}

function openUnit(page: Page, id: string) {
  return page.locator(`[data-unit="${id}"]`).click()
}

async function appendSnippet(page: Page, label: string) {
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  await editor.evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(field.value.length, field.value.length))
  await page.getByRole('button', { name: label, exact: true }).click()
}

test('the three Python stages order animated topics, demonstrations and practice before one optional capstone', async ({ page, request }) => {
  const levels = await fetchCatalog(request)
  await page.goto('/')
  for (const unitId of stages) {
    await test.step(unitId, async () => {
      const members = orderedStage(levels, unitId)
      const core = required(members)
      const capstones = members.filter(level => level.stage === 'challenge')
      expect(capstones).toHaveLength(1)
      expect(capstones[0].topic).toBeUndefined()
      expect(members.at(-1)?.id).toBe(capstones[0].id)
      const overviews = core.filter(level => level.kind === 'lecture' && level.overview)
      const expectedOverviews = unitId === 'foundations' ? [
        'python-program-basics', 'python-program-interfaces', 'python-program-gui', 'python-program-web', 'variable-cups', 'python-program-overview',
      ] : []
      expect(overviews.map(level => level.id)).toEqual(expectedOverviews)
      expect(core.slice(0, expectedOverviews.length).map(level => level.id)).toEqual(expectedOverviews)
      const topics = new Map(core.flatMap(level => level.topic ? [[level.topic.id, level.topic] as const] : []))
      expect(topics.size).toBeGreaterThanOrEqual(3)
      expect([...topics.values()].map(({ order }) => order)).toEqual(Array.from({ length: topics.size }, (_, index) => index + 1))

      for (const topic of topics.values()) {
        const lessons = core.filter(level => level.topic?.id === topic.id)
        const lecture = lessons[0]
        const replay = lessons[1]
        expect(lecture.stage).toBe('explain')
        expect(lecture.kind === 'lecture' && Boolean(lecture.execution || (lecture.animation?.frames.length ?? 0) >= 2)).toBe(true)
        expect(replay.stage).toBe('demo')
        expect(replay.kind === 'replay' && replay.mode === 'grid').toBe(true)
        const practices = lessons.slice(2)
        expect(practices.length).toBeGreaterThanOrEqual(2)
        expect(practices.every(level => level.stage === 'exercise')).toBe(true)
        expect(practices.every((level, index) => !index || practices[index - 1].order < level.order)).toBe(true)
      }

      await openUnit(page, unitId)
      await expect(page.locator('.mission-list .mission-name')).toHaveText(members.map(level => level.title.zh))
      await expect(page.locator('.mission-list .course-topic-heading')).toHaveText([
        ...(overviews.length ? ['课程全貌'] : []),
        ...[...topics.values()].map(topic => topic.title.zh), '阶段综合挑战 · 选做',
      ])
      await expect(page.locator('.mission-list button').last()).toContainText('选做')
      await goToModules(page)
    })
  }
})

test('the home path starts and resumes the first pending lesson, and skips optional stage challenges', async ({ page, request }) => {
  const levels = await fetchCatalog(request)
  const [foundations, intermediate, advanced] = stages.map(id => required(orderedStage(levels, id)))
  const first = foundations[0]
  const lastFoundations = foundations.at(-1)!
  const lastIntermediate = intermediate.at(-1)!
  if (first.kind !== 'lecture') throw new Error('The Python course must begin with an animated explanation')

  await page.goto('/')
  await page.getByRole('button', { name: '开始 Python 课程', exact: true }).click()
  await expectLesson(page, first)
  await finishProgramBasics(page)
  await page.getByRole('button', { name: first.question.options[first.question.correct].zh, exact: true }).click()
  await expect(page.locator('.python-route-nav')).toContainText('主线进度 1/')
  await goToModules(page)
  await page.getByRole('button', { name: '继续 Python 课程', exact: true }).click()
  await expectLesson(page, foundations[1])

  const lastLessons = foundations.concat(intermediate)
  await page.evaluate(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), {
    key: progressKey, ids: lastLessons.map(level => level.id),
  })
  await page.reload()
  await page.getByRole('button', { name: '继续 Python 课程', exact: true }).click()
  await expectLesson(page, advanced[0])
  await page.getByRole('button', { name: '上一课', exact: true }).click()
  await expectLesson(page, lastIntermediate)
  await expect(page.getByRole('button', { name: '选做综合挑战', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '进入 Python 高级', exact: true }).click()
  await expectLesson(page, advanced[0])

  await goToModules(page)
  await openUnit(page, 'foundations')
  await chooseLesson(page, lastFoundations)
  await expect(page.getByRole('button', { name: '选做综合挑战', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '进入 Python 进阶', exact: true }).click()
  await expectLesson(page, intermediate[0])
  await expect(page.locator('.python-route-nav')).toContainText('阶段 2/3')
})

test('a saved charge helper survives reload and can be combined with a course helper', async ({ page, request }) => {
  const levels = await fetchCatalog(request)
  const practice = levels.find(level => level.id === 'charge-total')
  const challenge = levels.find(level => level.id === 'plan-charge')
  if (practice?.kind !== 'algorithm' || challenge?.kind !== 'algorithm') throw new Error('Missing the foundation algorithm levels')

  await page.goto('/')
  await openUnit(page, 'foundations')
  await chooseLesson(page, practice)
  await expectLesson(page, practice)
  await appendSnippet(page, practice.snippets[0].label.zh)
  const run = page.getByRole('button', { name: '运行', exact: true })
  await run.click()
  await expect(page.getByRole('status')).toHaveText(`${practice.cases.length}/${practice.cases.length} 个用例通过`)
  await page.getByRole('button', { name: '保存到我的算法', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: '我的算法', exact: true }).click()
  await page.locator('.algorithm-entry summary').filter({ hasText: 'charge_total' }).click()
  await expect(page.locator('.algorithm-entry pre')).toContainText('return current + added')

  await goToModules(page)
  await openUnit(page, 'foundations')
  await chooseLesson(page, challenge)
  await expectLesson(page, challenge)
  const helpers = page.getByRole('region', { name: '复用已学函数' })
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  await helpers.getByRole('button', { name: '用我的函数 · charge_total', exact: true }).click()
  await helpers.getByRole('button', { name: '用课程函数 · charge_needed', exact: true }).click()
  await expect(helpers.getByRole('button', { name: '用我的函数 · charge_needed', exact: true })).toHaveCount(0)
  await expect(editor).toHaveValue(/^from algorithms import charge_needed\nfrom my_algorithms import charge_total\n/)
  await appendSnippet(page, '先计算新充入的电量')
  await appendSnippet(page, '返回充电后的电量')
  await expect(editor).toHaveValue(/added = charge_needed\(minutes, per_minute\)\n    return charge_total\(current, added\)/)
  await run.click()
  await expect(page.getByRole('status')).toHaveText(`${challenge.cases.length}/${challenge.cases.length} 个用例通过`)
  await expect(page.locator('.mission-list [aria-current="step"] .mission-check')).toBeVisible()
  await expect(page.locator('.python-route-nav')).toContainText('主线进度 1/')
})
