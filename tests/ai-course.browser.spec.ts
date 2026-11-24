import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { AiLevel, Catalog, Level } from '../src/shared/types'

const units = ['ai', 'ai-review'] as const
const stages = ['explain', 'demo', 'exercise', 'challenge'] as const
const progressKey = 'pixel-repair-lab:completed'

async function catalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const payload = await response.json() as Catalog
  expect(payload.issues).toEqual([])
  return payload.levels
}

function finalProject(level: Level): level is AiLevel & { courseFinal: true } {
  return level.kind === 'ai' && 'courseFinal' in level && level.courseFinal === true
}

function orderedUnit(levels: Level[], unit: typeof units[number]) {
  return levels.filter(level => level.unit?.id === unit).sort((left, right) =>
    Number(finalProject(left)) - Number(finalProject(right))
    || (left.topic?.order ?? Infinity) - (right.topic?.order ?? Infinity)
    || stages.indexOf(left.stage!) - stages.indexOf(right.stage!)
    || left.order - right.order)
}

function mission(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
}

function heading(page: Page, level: Level) {
  return page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })
}

function action(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true })
}

async function openMission(page: Page, level: Level) {
  await page.goto('/#track-ai')
  await page.locator(`[data-unit="${level.unit?.id}"]`).click()
  await mission(page, level).click()
  await expect(heading(page, level)).toBeVisible()
}

test('AI collaboration orders five animated topics, two optional challenges and one final project', async ({ page, request }) => {
  const levels = await catalog(request)
  await page.goto('/#track-ai')
  await expect(page.locator('#track-ai')).toBeInViewport()
  const cards = page.locator('#track-ai').locator('..').locator('button[data-unit]')
  await expect(cards).toHaveCount(units.length)

  for (const [index, unit] of units.entries()) {
    const members = orderedUnit(levels, unit)
    const activities = members.filter(level => level.stage !== 'challenge')
    const topics = new Map(activities.map(level => [level.topic?.id, level.topic]))
    expect([...topics.values()].map(topic => topic?.order)).toEqual(unit === 'ai' ? [1, 2] : [1, 2, 3])
    for (const topic of topics.values()) {
      const [lecture, demo, easy, hard] = activities.filter(level => level.topic?.id === topic?.id)
      expect([lecture?.stage, demo?.stage, easy?.stage, hard?.stage]).toEqual(['explain', 'demo', 'exercise', 'exercise'])
      expect(lecture.kind === 'lecture' && lecture.animation?.frames.length).toBeGreaterThanOrEqual(2)
      expect(demo.kind === 'ai' || (demo.kind === 'replay' && demo.mode === 'ai')).toBe(true)
      expect([easy.kind, hard.kind]).toEqual(['ai', 'ai'])
      expect(hard.order).toBeGreaterThan(easy.order)
    }
    const [optional] = members.filter(level => level.stage === 'challenge' && !finalProject(level))
    expect(optional?.id).toBe(members.at(activities.length)?.id)
    expect(members.filter(finalProject)).toHaveLength(unit === 'ai-review' ? 1 : 0)
    await expect(cards.nth(index)).toHaveAttribute('data-unit', unit)
    await cards.nth(index).click()
    await expect(page.locator('.mission-list .mission-name')).toHaveText(members.map(level => level.title.zh))
    await expect(page.locator('.mission-list .course-topic-heading')).toHaveText([
      ...[...topics.values()].map(topic => topic!.title.zh), '阶段综合挑战 · 选做', ...(unit === 'ai-review' ? ['结课项目'] : []),
    ])
    await action(page, '学习模块').click()
  }
})

test('AI collaboration resumes unfinished lessons across stages and counts its final project in core progress', async ({ page, request }) => {
  const levels = await catalog(request)
  const required = units.flatMap(unit => orderedUnit(levels, unit).filter(level => level.stage !== 'challenge' || finalProject(level)))
  const first = required[0]
  const final = required.at(-1)
  if (first.kind !== 'lecture' || !final || !finalProject(final)) throw new Error('Missing the first AI lesson or final project')
  await page.goto('/#track-ai')
  await action(page, '开始 AI 协作课程').click()
  await expect(heading(page, first)).toBeVisible()
  await expect(page.getByRole('region', { name: '知识动画', exact: true })).toBeVisible()
  await action(page, first.question.options[first.question.correct].zh).click()
  await expect(page.locator('.ai-route-nav')).toContainText(`主线进度 1/${required.length}`)
  await action(page, '学习模块').click()
  const resume = action(page, '继续 AI 协作课程')
  await resume.click()
  await expect(heading(page, required[1])).toBeVisible()

  for (const next of [required.find(level => level.unit?.id === 'ai-review')!, final]) {
    await page.evaluate(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), {
      key: progressKey, ids: required.slice(0, required.indexOf(next)).map(level => level.id),
    })
    await page.reload()
    await resume.click()
    await expect(heading(page, next)).toBeVisible()
  }

  await expect(page.locator('.ai-route-nav')).toContainText(`主线进度 ${required.length - 1}/${required.length}`)
  await action(page, '上一课').click()
  await expect(heading(page, required.at(-2)!)).toBeVisible()
  await expect(action(page, '选做综合挑战')).toBeVisible()
  await action(page, '进入结课项目').click()
  await expect(heading(page, final)).toBeVisible()
  await expect(mission(page, final).locator('.mission-check')).toHaveCount(0)
})

test('manual review requires marking both a missing item and a forbidden extra before revising', async ({ page, request }) => {
  const exercise = (await catalog(request)).find(level => level.id === 'ai-review-two-differences')
  if (exercise?.kind !== 'ai') throw new Error('Missing the two-difference review exercise')
  await openMission(page, exercise)
  await action(page, '填入示例').click()
  await action(page, '发送给 AI').click()
  const tape = page.locator('[data-ai-audit="tape"]')
  const magnet = page.locator('[data-ai-audit="magnet"]')
  await expect(tape).toBeVisible()
  const bench = page.getByRole('table', { name: '装箱核对台' })
  await expect(bench.locator('[data-supply="tape"]').getByRole('checkbox')).toBeVisible()
  await expect(bench.locator('[data-check]')).toHaveCount(0)
  await expect(page.locator('.ai-result .ai-mismatch')).toHaveCount(0)
  await tape.check()
  await action(page, '提交核对').click()
  await expect(magnet).toBeEnabled()
  await expect(action(page, '发送修正')).toBeDisabled()

  await magnet.check()
  await action(page, '提交核对').click()
  await expect(bench.locator('[data-supply="tape"]')).toHaveAttribute('data-check', 'revise')
  await action(page, '填入修正示例').click()
  await action(page, '发送修正').click()
  await expect(page.getByRole('heading', { name: '第 2 次清单', exact: true })).toBeVisible()
  await expect(action(page, '确认清单')).not.toBeVisible()
  await action(page, '提交核对').click()
  await action(page, '确认清单').click()
  await expect(mission(page, exercise).locator('.mission-check')).toBeVisible()
})

test('AI inspection project composes a request with cards, audits three rounds and saves the approved report', async ({ page, request }) => {
  const project = (await catalog(request)).find(finalProject)
  if (!project) throw new Error('Missing the AI inspection project')
  await openMission(page, project)

  const cards = page.locator('[data-ai-card]')
  await expect(cards).toHaveCount(7)
  for (let index = 0; index < await cards.count(); index++) await cards.nth(index).click()
  const prompt = page.getByRole('textbox', { name: '给 AI 写提示词' })
  await expect(prompt).toHaveValue(/滤网改为 3 块/u)
  await expect(prompt).toHaveValue(/不要放备用线圈/u)
  await action(page, '发送给 AI').click()
  const filter = page.locator('[data-ai-audit="filter"]')
  const magnet = page.locator('[data-ai-audit="magnet"]')
  await filter.check()
  await action(page, '提交核对').click()
  await prompt.fill('滤网改为 3 块。保留其他项目。')
  await action(page, '发送修正').click()

  await expect(page.getByRole('heading', { name: '第 2 次清单', exact: true })).toBeVisible()
  await expect(filter).not.toBeChecked()
  await expect(action(page, '确认清单')).not.toBeVisible()
  await magnet.check()
  await action(page, '提交核对').click()
  await prompt.fill('去掉磁铁。保留其他项目。')
  await action(page, '发送修正').click()

  await expect(page.getByRole('heading', { name: '第 3 次清单', exact: true })).toBeVisible()
  await expect(action(page, '确认清单')).not.toBeVisible()
  await action(page, '提交核对').click()
  await action(page, '确认清单').click()
  await expect(page.locator('.ai-result')).toContainText('结课项目已完成')
  await expect(mission(page, project).locator('.mission-check')).toBeVisible()
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]') as string[], progressKey)).toContain(project.id)
})
