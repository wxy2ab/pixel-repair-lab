import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog, GridLevel, Level } from '../src/shared/types'

async function openCatalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const catalog = await response.json() as Catalog
  expect(catalog.issues).toEqual([])
  return (id: string) => {
    const level = catalog.levels.find(candidate => candidate.id === id)
    if (!level) throw new Error(`Missing level ${id}`)
    return level
  }
}

function heading(page: Page, level: Level) {
  return page.getByRole('heading', { name: level.title.zh, level: 1, exact: true })
}

function mission(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
}

function action(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true })
}

async function submitWrongPython(page: Page) {
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill('move("right"')
  await action(page, '运行').click()
  await expect(page.locator('.output-panel .error-message')).toBeVisible()
}

test('wrong practice is grouped, links to exact materials, and a successful retry clears its home recommendation', async ({ page, request }) => {
  const get = await openCatalog(request)
  const first = get('first-steps')
  const second = get('crystal-echo')
  const animation = get('sequence-notes')
  const demo = get('sequence-replay')
  const nextStudy = get('computer-notes')
  if (first.kind !== 'grid') throw new Error('Expected a grid exercise')

  await page.goto('/')
  await page.locator('[data-unit="foundations"]').click()
  await mission(page, first).click()
  await submitWrongPython(page)
  await submitWrongPython(page)
  await mission(page, second).click()
  await submitWrongPython(page)

  await action(page, '学习模块').click()
  await page.locator('[data-unit="computer"]').click()
  await expect(heading(page, nextStudy)).toBeVisible()
  await action(page, '学习模块').click()
  const suggestions = page.getByRole('region', { name: '建议复习' })
  await expect(suggestions).toContainText('2 道练习待复习')
  await expect(page.getByTestId('roadmap-resume')).toBeVisible()
  await expect(page.getByRole('link', { name: '自由选课', exact: true })).toHaveAttribute('href', '#free-choices')
  await suggestions.getByRole('button', { name: '查看错题本' }).click()

  const topic = page.getByTestId('mistake-topic')
  await expect(topic).toHaveCount(1)
  await expect(topic.getByRole('heading', { name: first.topic!.title.zh, exact: true })).toBeVisible()
  const firstMistake = topic.locator(`[data-mistake-level="${first.id}"]`)
  await expect(firstMistake).toContainText('做错 2 次')
  await expect(topic.locator(`[data-mistake-level="${second.id}"]`)).toContainText('做错 1 次')

  await firstMistake.getByRole('button', { name: '看动画', exact: true }).click()
  await expect(heading(page, animation)).toBeVisible()
  await expect(page.getByTestId('sequence-lesson')).toHaveAttribute('data-phase', 'arrange')
  const review = page.getByRole('navigation', { name: '复习任务' })
  await review.getByRole('button', { name: '看演示', exact: true }).click()
  await expect(heading(page, demo)).toBeVisible()
  await review.getByRole('button', { name: '重做练习', exact: true }).click()
  await expect(heading(page, first)).toBeVisible()

  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill(cardsToPython(first.cards, first.solutionCards))
  await action(page, '运行').click()
  await expect(page.locator('.output-panel .win-message')).toBeVisible({ timeout: 10000 })
  await review.getByRole('button', { name: '返回学习记录', exact: true }).click()
  await expect(firstMistake).toContainText('已订正')
  await expect(firstMistake).toContainText('做错 2 次')

  await action(page, '学习模块').click()
  await page.reload()
  await expect(suggestions).toContainText(second.title.zh)
  await expect(suggestions).toContainText('1 道练习待复习')
  await expect(suggestions).not.toContainText(first.title.zh)
  await page.getByTestId('roadmap-resume').click()
  await expect(heading(page, nextStudy)).toBeVisible()
})

test('legacy completions appear in study history and instructional and preview errors stay out of the notebook', async ({ page, request }) => {
  const get = await openCatalog(request)
  const first = get('first-steps') as GridLevel
  const search = get('linear-search-notes')
  const lecture = get('sequence-notes')
  if (lecture.kind !== 'lecture' || search.kind !== 'lecture' || !search.execution?.batterySearch) throw new Error('Expected teaching lectures')
  await page.addInitScript(id => {
    if (!localStorage.getItem('pixel-repair-lab:completed')) localStorage.setItem('pixel-repair-lab:completed', JSON.stringify([id]))
  }, first.id)
  await page.goto('/#mistake-notebook')
  await expect(page.getByRole('tab', { name: '错题本' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('还没有错题。', { exact: false })).toBeVisible()
  await page.getByRole('tab', { name: '学习记录' }).press('Home')
  const history = page.locator(`[data-study-level="${first.id}"]`)
  await expect(history).toContainText(first.title.zh)
  await expect(history).toContainText('已完成')
  await expect(history.locator('time')).toHaveCount(0)

  await action(page, '学习模块').click()
  await page.locator('[data-unit="algorithm-intro"]').click()
  await mission(page, search).click()
  const { demo } = search.execution.batterySearch
  const wrong = demo.batteries.find(battery => battery.charge !== demo.target)!
  const card = page.getByTestId('battery-search-manual-card-' + wrong.name)
  await card.click()
  await expect(card).toHaveAttribute('data-charge', String(wrong.charge))
  await action(page, '学习模块').click()
  await page.locator('[data-unit="foundations"]').click()
  await mission(page, lecture).click()
  const sequence = page.getByTestId('sequence-lesson')
  await sequence.locator('[data-visual-block="read"] [data-move="earlier"]').click()
  await sequence.getByRole('button', { name: '检查顺序', exact: true }).click()
  await sequence.getByRole('button', { name: '把显示提前', exact: true }).click()
  const next = sequence.getByRole('button', { name: '下一步', exact: true })
  await next.click()
  await next.click()
  await expect(sequence).toHaveAttribute('data-blocked', 'true')

  await action(page, '关卡预览').click()
  await page.getByLabel('关卡 JSON 文件').setInputFiles({ name: 'exercise.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(first)) })
  await action(page, '一键试玩').click()
  await submitWrongPython(page)
  await action(page, '学习模块').click()
  await action(page, '查看错题本').click()
  await expect(page.getByText('还没有错题。', { exact: false })).toBeVisible()
  await expect(page.getByTestId('mistake-topic')).toHaveCount(0)
})
