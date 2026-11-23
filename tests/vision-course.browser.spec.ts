import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import type { Catalog, Level } from '../src/shared/types'
import { visionFields, type VisionField, type VisionLevel, type VisionParameters, type VisionRequest, type VisionResult } from '../src/shared/vision'

const units = ['opencv', 'yolox'] as const
const stages = ['explain', 'demo', 'exercise', 'challenge'] as const
const progressKey = 'pixel-repair-lab:completed'

async function catalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const result = await response.json() as Catalog
  expect(result.issues).toEqual([])
  return result.levels
}

function finalProject(level: Level): level is VisionLevel & { courseFinal: true } {
  return level.kind === 'vision' && level.courseFinal === true
}

function orderedUnit(levels: Level[], unit: typeof units[number]) {
  return levels.filter(level => level.unit?.id === unit).sort((left, right) =>
    (left.topic?.order ?? Infinity) - (right.topic?.order ?? Infinity)
    || stages.indexOf(left.stage!) - stages.indexOf(right.stage!)
    || Number(finalProject(left)) - Number(finalProject(right))
    || left.order - right.order)
}

function heading(page: Page, level: Level) {
  return page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })
}

function mission(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
}

function home(page: Page) {
  return page.getByRole('button', { name: '学习模块', exact: true }).click()
}

async function setParameters(page: Page, mode: VisionLevel['mode'], parameters: VisionParameters) {
  const fields: Record<string, VisionField> = visionFields[mode]
  for (const [name, value] of Object.entries(parameters)) {
    const input = page.getByTestId('vision-controls').locator(`[data-parameter="${name}"]`)
    if ('min' in fields[name]) await input.fill(String(value))
    else await input.selectOption(String(value))
  }
}

async function runExperiment(page: Page, button: Locator, action: VisionRequest['action'] = 'run') {
  await expect(button).toBeEnabled()
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.url().endsWith('/api/labs/vision') && candidate.request().method() === 'POST'
      && (candidate.request().postDataJSON() as VisionRequest).action === action),
    button.click(),
  ])
  if (!response.ok()) throw new Error(`Vision request failed: ${response.status()} ${await response.text()}`)
  return (await response.json() as { result: VisionResult }).result
}

test('vision groups six animated topics before separate stage challenges and the final project', async ({ page, request }) => {
  const levels = await catalog(request)
  await page.goto('/#track-vision')
  await expect(page.locator('#track-vision')).toBeInViewport()
  const cards = page.getByRole('region', { name: '计算机视觉', exact: true }).locator('button[data-unit]')
  await expect(cards).toHaveCount(units.length)

  for (const [index, unit] of units.entries()) {
    const members = orderedUnit(levels, unit)
    const activities = members.filter(level => level.stage !== 'challenge')
    const topics = new Map(activities.map(level => [level.topic?.id, level.topic]))
    expect([...topics.values()].map(topic => topic?.order)).toEqual([1, 2, 3])
    for (const topic of topics.values()) {
      const [lecture, demo, easy, hard] = activities.filter(level => level.topic?.id === topic?.id)
      expect([lecture?.stage, demo?.stage, easy?.stage, hard?.stage]).toEqual(['explain', 'demo', 'exercise', 'exercise'])
      expect(lecture.kind === 'lecture' && lecture.animation?.frames.length).toBeGreaterThanOrEqual(2)
      expect([demo.kind, easy.kind, hard.kind]).toEqual(['vision', 'vision', 'vision'])
      expect(hard.order).toBeGreaterThan(easy.order)
    }
    const optional = members.filter(level => level.stage === 'challenge' && !finalProject(level))
    expect(optional).toHaveLength(1)
    expect(members.at(activities.length)?.id).toBe(optional[0].id)
    expect(members.filter(finalProject)).toHaveLength(unit === 'yolox' ? 1 : 0)
    await expect(cards.nth(index)).toHaveAttribute('data-unit', unit)
    await cards.nth(index).click()
    await expect(page.locator('.mission-list .mission-name')).toHaveText(members.map(level => level.title.zh))
    await expect(page.locator('.mission-list .course-topic-heading')).toHaveText([
      ...[...topics.values()].map(topic => topic!.title.zh), '阶段综合挑战 · 选做', ...(unit === 'yolox' ? ['结课项目'] : []),
    ])
    await home(page)
  }
})

test('vision resumes incomplete lessons across units and counts the project in core progress', async ({ page, request }) => {
  const levels = await catalog(request)
  const required = units.flatMap(unit => orderedUnit(levels, unit).filter(level => level.stage !== 'challenge' || finalProject(level)))
  const first = required[0]
  const last = required.at(-1)
  if (first.kind !== 'lecture' || !last || !finalProject(last)) throw new Error('Missing the vision route or final project')
  await page.goto('/#track-vision')
  await page.getByRole('button', { name: '开始计算机视觉课程', exact: true }).click()
  await expect(heading(page, first)).toBeVisible()
  const animation = page.getByRole('region', { name: '知识动画', exact: true })
  await expect(animation.locator('.diagram-swatch')).toHaveCount(4)
  await expect(animation.locator('.diagram-swatch').first()).toHaveCSS('background-color', 'rgb(240, 116, 102)')
  await page.getByRole('button', { name: first.question.options[first.question.correct].zh, exact: true }).click()
  await expect(page.locator('.vision-route-nav')).toContainText(`主线进度 1/${required.length}`)

  const resume = page.getByRole('button', { name: '继续计算机视觉课程', exact: true })
  await home(page)
  await resume.click()
  await expect(heading(page, required[1])).toBeVisible()

  await page.evaluate(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), {
    key: progressKey, ids: required.filter(level => level.unit?.id === 'opencv').map(level => level.id),
  })
  await page.reload()
  await resume.click()
  await expect(heading(page, required.find(level => level.unit?.id === 'yolox')!)).toBeVisible()

  await page.evaluate(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), {
    key: progressKey, ids: required.slice(0, -1).map(level => level.id),
  })
  await page.reload()
  await resume.click()
  await expect(heading(page, last)).toBeVisible()
  await expect(page.locator('.vision-route-nav')).toContainText(`主线进度 ${required.length - 1}/${required.length}`)
  await page.getByRole('button', { name: '上一课', exact: true }).click()
  await expect(heading(page, required.at(-2)!)).toBeVisible()
  await expect(page.getByRole('button', { name: '选做综合挑战', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '进入结课项目', exact: true }).click()
  await expect(heading(page, last)).toBeVisible()
  await expect(mission(page, last).locator('.mission-check')).toHaveCount(0)
})

test('clicking the pixel grid changes coordinates and reads OpenCV’s actual RGB values', async ({ page, request }) => {
  const level = (await catalog(request)).find(item => item.id === 'opencv-offset-pixel')
  if (!level || level.kind !== 'vision') throw new Error('Missing pixel exercise')
  await page.goto('/#track-vision')
  await page.locator('[data-unit="opencv"]').click()
  await mission(page, level).click()
  await expect(page.getByTestId('vision-pixel')).toHaveCount(24)
  const run = page.getByRole('button', { name: '运行实验', exact: true })
  const initial = await runExperiment(page, run)
  expect(initial.engine).toMatch(/^OpenCV /)
  expect(initial.sample).toEqual({ x: 2, y: 1, rgb: [160, 160, 160] })
  await expect(mission(page, level).locator('.mission-check')).toHaveCount(0)
  const pixel = page.locator('[data-testid="vision-pixel"][data-x="4"][data-y="3"]')
  await pixel.click()
  await expect(pixel).toHaveAttribute('aria-pressed', 'true')
  const selected = await runExperiment(page, run)
  expect(selected.sample).toEqual({ x: 4, y: 3, rgb: [15, 115, 180] })
  await expect(page.getByTestId('vision-feedback')).toContainText('当前图像通过。')
  await expect(mission(page, level).locator('.mission-check')).toBeVisible()
})

test('the OpenCV optional challenge checks both the shape count and the white-pixel count on two masks', async ({ page, request }) => {
  const level = (await catalog(request)).find(item => item.id === 'opencv-calibration-challenge')
  if (!level || level.kind !== 'vision') throw new Error('Missing OpenCV calibration challenge')
  await page.goto('/#track-vision')
  await page.locator('[data-unit="opencv"]').click()
  await mission(page, level).click()
  const run = page.getByRole('button', { name: '运行实验', exact: true })
  const regions = page.getByTestId('vision-regions')
  await expect(regions).toHaveText('4')
  const whitePixels = [11971, 5161]
  for (const [index, scenario] of level.cases.entries()) {
    if (!scenario.goal?.whitePixelRange || !scenario.solution) throw new Error('The scenario needs an area goal and a reference')
    await page.locator(`[data-case="${index}"]`).click()
    await expect(run).toBeEnabled()
    await setParameters(page, level.mode, scenario.solution)
    const observed = await runExperiment(page, run)
    expect(observed.regions).toBe(scenario.goal.regions)
    expect(observed.whitePixels).toBe(whitePixels[index])
    await expect(regions).toHaveText(String(scenario.goal.regions))
    await expect(page.locator(`[data-case="${index}"]`)).toContainText('✓')
    if (!index) await expect(mission(page, level).locator('.mission-check')).toHaveCount(0)
  }
  await expect(mission(page, level).locator('.mission-check')).toBeVisible()
})

test('arena vision inspections count graded checks, show failures, and reset on replay', async ({ page, request }) => {
  const level = (await catalog(request)).find(item => item.id === 'challenge-three-mask-inspection')
  if (level?.kind !== 'vision') throw new Error('Missing mask inspection')
  await page.goto('/#challenge-zone')
  await page.locator(`[data-challenge-level="${level.id}"]`).click()
  const run = page.getByRole('button', { name: '运行实验', exact: true })
  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  await runExperiment(page, run)
  const review = page.getByRole('region', { name: '失败复盘', exact: true })
  await review.getByRole('button', { name: '复盘这次' }).click()
  await expect(review).toContainText(level.cases[0].label.zh)
  await expect(review).toContainText('白色像素')
  for (const [index, scenario] of level.cases.entries()) {
    await page.locator(`[data-case="${index}"]`).click()
    await setParameters(page, level.mode, scenario.solution!)
    await runExperiment(page, run)
  }
  await expect(summary.locator('[data-score-metric="checks"]').getByRole('cell').first()).toHaveText(String(level.cases.length + 1))
  await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(page.locator('[data-case="0"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-case]').filter({ hasText: '✓' })).toHaveCount(0)
})

test('the final project detects the same two preprocessed images and invalidates a preview after preprocessing edits', async ({ page, request }) => {
  const level = (await catalog(request)).find(finalProject)
  if (!level) throw new Error('Missing final vision project')
  const { solution, goal } = level.cases[0]
  if (!solution || !goal?.labelsByImage) throw new Error('Missing reference project settings')
  await page.goto('/#track-vision')
  await page.locator('[data-unit="yolox"]').click()
  await mission(page, level).click()
  const prepare = page.getByRole('button', { name: /预处理两张图片/ })
  const detect = page.getByRole('button', { name: /运行 YOLOX/ })
  const images = page.locator('[data-image-choice]')
  await expect(detect).toBeDisabled()

  const initial = await runExperiment(page, prepare, 'prepare')
  expect(initial.engine).toMatch(/^OpenCV /)
  expect(initial.frames.map(frame => frame.id)).toEqual(['labrador', 'astronaut'])
  expect(initial.frames.every(frame => frame.detections.length === 0)).toBe(true)
  await expect(images).toHaveCount(2)
  await expect(detect).toBeEnabled()
  await expect(mission(page, level).locator('.mission-check')).toHaveCount(0)

  await setParameters(page, level.mode, solution)
  await expect(detect).toBeDisabled()
  const prepared = await runExperiment(page, prepare, 'prepare')
  expect(prepared.preprocessing).toEqual({ maxSide: goal.maxSide, tone: goal.tone })
  expect(prepared.frames.every(frame => frame.original !== frame.processed)).toBe(true)
  await expect(page.getByTestId('vision-processed')).toBeVisible()
  const detected = await runExperiment(page, detect)
  expect(detected.engine).toMatch(/^YOLOX-S/)
  expect(detected.frames.map(frame => frame.processed)).toEqual(prepared.frames.map(frame => frame.processed))
  for (const [id, labels] of Object.entries(goal.labelsByImage)) {
    const frame = detected.frames.find(item => item.id === id)
    expect(frame?.detections.map(item => item.label).toSorted()).toEqual(labels.toSorted())
    expect(frame?.detections.every(({ score, box }) => score > 0 && box[2] > 0 && box[3] > 0)).toBe(true)
    await page.locator(`[data-image-choice="${id}"]`).click()
    const visibleFrame = page.locator(`[data-testid="vision-frame"][data-image="${id}"]`)
    await expect(visibleFrame.getByTestId('vision-detection').locator('tbody tr')).toHaveCount(labels.length)
  }
  await expect(page.getByTestId('vision-feedback')).toContainText('视觉巡查报告已完成。')
  await expect(mission(page, level).locator('.mission-check')).toBeVisible()
})
