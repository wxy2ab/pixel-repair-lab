import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { DataLevel, DataParameters, DataResult } from '../src/shared/dataCourse'
import type { Catalog, Level } from '../src/shared/types'

const units = ['numpy', 'pandas', 'statistics', 'database'] as const
const stages = ['explain', 'demo', 'exercise', 'challenge'] as const
const progressKey = 'pixel-repair-lab:completed'

async function catalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const result = await response.json() as Catalog
  expect(result.issues).toEqual([])
  return result.levels
}

function courseFinal(level: Level): level is DataLevel & { courseFinal: true } {
  return level.kind === 'data' && level.courseFinal === true
}

function orderedUnit(levels: Level[], unit: typeof units[number]) {
  return levels.filter(level => level.unit?.id === unit).sort((left, right) =>
    ((left.topic?.order ?? Infinity) - (right.topic?.order ?? Infinity)) ||
    (stages.indexOf(left.stage!) - stages.indexOf(right.stage!)) || left.order - right.order,
  )
}

function mission(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
}

function heading(page: Page, level: Level) {
  return page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })
}

function home(page: Page) {
  return page.getByRole('button', { name: '学习模块', exact: true }).click()
}

async function setParameters(page: Page, parameters: DataParameters) {
  const controls = page.getByTestId('data-controls')
  for (const [name, value] of Object.entries(parameters)) {
    const control = controls.locator(`[data-parameter="${name}"]`)
    if (typeof value === 'boolean') await control.setChecked(value)
    else if (typeof value === 'number') await control.fill(String(value))
    else await control.selectOption(value)
  }
}

async function runExperiment(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.url().endsWith('/api/labs/data') && candidate.request().method() === 'POST'),
    page.getByRole('button', { name: '运行实验', exact: true }).click(),
  ])
  expect(response.ok(), await response.text()).toBe(true)
  const { result } = await response.json() as { result: DataResult }
  return result.steps.at(-1)!
}

test('eight data topics each group animation, hands-on demo and two exercises before the optional challenge', async ({ page, request }) => {
  const levels = await catalog(request)
  await page.goto('/#track-data')
  await expect(page.locator('#track-data')).toBeInViewport()
  const cards = page.getByRole('region', { name: '数据科学', exact: true }).locator('button[data-unit]')
  await expect(cards).toHaveCount(units.length)
  for (const [index, unit] of units.entries()) {
    await test.step(unit, async () => {
      const members = orderedUnit(levels, unit)
      const core = members.filter(level => level.stage !== 'challenge')
      const topics = new Map(core.map(level => [level.topic!.id, level.topic!]))
      expect([...topics.values()].map(topic => topic.order)).toEqual([1, 2])
      for (const topic of topics.values()) {
        const activities = core.filter(level => level.topic?.id === topic.id)
        expect(activities.map(level => level.stage)).toEqual(['explain', 'demo', 'exercise', 'exercise'])
        const [explain, demo, easy, hard] = activities
        expect(explain.kind === 'lecture' && explain.animation?.frames.length).toBeGreaterThanOrEqual(2)
        expect(demo.kind).toBe('data')
        expect(easy.kind).toBe('data')
        expect(hard.kind).toBe('data')
        expect(hard.order).toBeGreaterThan(easy.order)
      }
      const optional = members.filter(level => level.stage === 'challenge' && !courseFinal(level))
      expect(optional).toHaveLength(1)
      expect(optional[0].topic).toBeUndefined()
      expect(members.at(core.length)?.id).toBe(optional[0].id)
      expect(members.filter(courseFinal)).toHaveLength(unit === 'database' ? 1 : 0)
      if (unit === 'database') expect(courseFinal(members.at(-1)!)).toBe(true)
      await expect(cards.nth(index)).toHaveAttribute('data-unit', unit)
      await cards.nth(index).click()
      await expect(page.locator('.mission-list .mission-name')).toHaveText(members.map(level => level.title.zh))
      await expect(page.locator('.mission-list .course-topic-heading')).toHaveText([
        ...[...topics.values()].map(topic => topic.title.zh), '阶段综合挑战 · 选做', ...(unit === 'database' ? ['结课项目'] : []),
      ])
      await home(page)
    })
  }
})

test('data course resumes in order, skips optional work, and counts the final project as required', async ({ page, request }) => {
  const levels = await catalog(request)
  const core = units.flatMap(unit => orderedUnit(levels, unit).filter(level => level.stage !== 'challenge' || courseFinal(level)))
  const first = core[0]
  const final = core.at(-1)
  if (first.kind !== 'lecture' || !final || !courseFinal(final)) throw new Error('Missing data course start or final project')
  await page.goto('/#track-data')
  await page.getByRole('button', { name: '开始数据科学课程', exact: true }).click()
  await expect(heading(page, first)).toBeVisible()
  await expect(page.getByRole('region', { name: '知识动画', exact: true })).toBeVisible()
  await page.getByRole('button', { name: first.question.options[first.question.correct].zh, exact: true }).click()
  await expect(page.locator('.data-route-nav')).toContainText(`主线进度 1/${core.length}`)
  await home(page)
  const resume = page.getByRole('button', { name: '继续数据科学课程', exact: true })
  await resume.click()
  await expect(heading(page, core[1])).toBeVisible()

  await page.evaluate(({ key, completed }) => localStorage.setItem(key, JSON.stringify(completed)), {
    key: progressKey, completed: core.slice(0, -1).map(level => level.id),
  })
  await page.reload()
  await resume.click()
  await expect(heading(page, final)).toBeVisible()
  await expect(page.locator('.data-route-nav')).toContainText(`主线进度 ${core.length - 1}/${core.length}`)
  await page.getByRole('button', { name: '上一课', exact: true }).click()
  await expect(heading(page, core.at(-2)!)).toBeVisible()
  await expect(page.getByRole('button', { name: '选做综合挑战', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '进入结课项目', exact: true }).click()
  await expect(heading(page, final)).toBeVisible()
})

test('NumPy runs a changed slice and shows its real input and output', async ({ page, request }) => {
  const levels = await catalog(request)
  const demo = levels.find(level => level.id === 'numpy-slicing-demo')
  if (!demo || demo.kind !== 'data') throw new Error('Missing NumPy slice demo')
  await page.goto('/#track-data')
  await page.locator('[data-unit="numpy"]').click()
  await mission(page, demo).click()
  await expect(heading(page, demo)).toBeVisible()

  const first = await runExperiment(page)
  expect(first.engine).toMatch(/^NumPy /)
  expect(first.output).toEqual({ columns: ['index', 'reading'], rows: [[0, 18], [1, 24], [2, 20]] })
  await setParameters(page, { stop: 4 })
  const second = await runExperiment(page)
  expect(second.input).toEqual(first.input)
  expect(second.output).toEqual({ columns: ['index', 'reading'], rows: [[0, 18], [1, 24], [2, 20], [3, 22]] })
  await expect(page.getByTestId('data-input').locator('tbody tr')).toHaveCount(11)
  await expect(page.getByTestId('data-output').locator('tbody tr').last().locator('td')).toHaveText(['3', '22'])
  await expect(mission(page, demo).locator('.mission-check')).toBeVisible()
})

test('the final report processes the same data, rejects wrong parameters, and invalidates later results after editing', async ({ page, request }) => {
  const levels = await catalog(request)
  const final = levels.find(courseFinal)
  if (!final) throw new Error('Missing required data project')
  await page.goto('/#track-data')
  await page.locator('[data-unit="database"]').click()
  await mission(page, final).click()
  await expect(heading(page, final)).toBeVisible()
  const feedback = page.getByTestId('data-feedback')
  const next = page.getByRole('button', { name: '下一步', exact: true })
  const tab = (index: number) => page.locator(`[data-step="${index}"]`)
  await expect(tab(1)).toBeDisabled()

  const wrong = await runExperiment(page)
  expect(wrong.output).not.toEqual(final.steps[0].goal)
  await expect(feedback).toBeVisible()
  await expect(feedback).not.toContainText('当前步骤通过。')
  await expect(tab(1)).toBeDisabled()
  await expect(mission(page, final).locator('.mission-check')).toHaveCount(0)

  async function completeStep(index: number, previous?: DataResult['steps'][number]) {
    const { goal, solution, input } = final!.steps[index]
    if (!goal || !solution) throw new Error(`Missing target data for step ${index + 1}`)
    await setParameters(page, solution)
    const result = await runExperiment(page)
    expect(result.output).toEqual(goal)
    if (input === 'previous') expect(result.input).toEqual(previous?.output)
    await expect(page.getByTestId('data-output').locator('tbody tr')).toHaveCount(goal.rows.length)
    return result
  }

  let previous = await completeStep(0)
  await expect(feedback).toContainText('当前步骤通过。')
  await expect(next).toBeEnabled()
  await next.click()
  await completeStep(1, previous)
  await expect(next).toBeEnabled()
  await tab(0).click()
  await setParameters(page, final.steps[0].initial)
  await expect(tab(1)).toBeDisabled()

  previous = await completeStep(0)
  expect(previous.input.rows).toHaveLength(14)
  expect(previous.output.rows).toHaveLength(11)
  for (let index = 1; index < final.steps.length; index++) {
    await next.click()
    previous = await completeStep(index, previous)
    if (final.steps[index].operation === 'clean') {
      const repeat = previous.removedRows?.find(row => row.reason === 'repeated-id')
      if (!repeat || !previous.sourceRows) throw new Error('Expected the cleaning step to trace the duplicate')
      const inspector = page.getByRole('region', { name: '逐行对照' })
      await inspector.getByRole('button', { name: `查看输入第 ${repeat.index + 1} 行`, exact: true }).click()
      await inspector.getByRole('button', { name: new RegExp('看保留的第 ' + (repeat.keptRow + 1) + ' 行') }).click()
      await expect(inspector.locator('[data-source-row="' + repeat.keptRow + '"]'))
        .toHaveAttribute('data-output-row', String(previous.sourceRows.indexOf(repeat.keptRow)))
    }
  }
  expect(previous.engine).toMatch(/^SQLite /)
  expect(previous.code).toContain('FROM grouped_readings')
  expect(previous.output.rows).toEqual([['workshop', 32], ['hangar', 26]])
  await expect(feedback).toContainText('分析报告已完成。')
  await expect(mission(page, final).locator('.mission-check')).toBeVisible()
})
