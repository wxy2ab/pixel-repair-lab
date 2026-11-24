import { expect, test, type Locator, type Page } from '@playwright/test'
import type { LectureLevel } from '../src/shared/advanced'
import type { Catalog } from '../src/shared/types'

function lecture(catalog: Catalog, id: string): LectureLevel {
  const level = catalog.levels.find(candidate => candidate.id === id)
  if (level?.kind !== 'lecture' || !level.unit) throw new Error('Missing interactive lecture ' + id)
  return level
}

async function open(page: Page, level: LectureLevel) {
  await page.locator(`[data-unit="${level.unit?.id}"]`).click()
  await page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(level.title.zh)
}

const phases = (page: Page) => page.getByTestId('lesson-phases').getByRole('listitem')
const top = async (locator: Locator) => (await locator.boundingBox())?.y ?? Number.NaN

test('a walkthrough names its phases, counts its steps, and ends with its key points and an optional self-check', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const lesson = lecture(catalog, 'for-loop-notes')
  const forLoop = lesson.execution?.forLoop
  if (!forLoop) throw new Error('Expected the for-loop lesson')
  const practice = forLoop.cases[2]
  if (!practice.predictions) throw new Error('Expected a prediction case')

  await page.goto('/')
  await open(page, lesson)
  await expect(phases(page)).toHaveText([/逐块补电并记录/, /预测次数和结果/, /要点小结/])
  await expect(phases(page).nth(0)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('lesson-recap')).toHaveCount(0)

  const guide = page.getByTestId('for-lesson')
  const count = guide.getByTestId('lesson-step-count')
  const next = guide.getByRole('button', { name: '下一步', exact: true })
  const steps = 2 + 3 * practice.batteries.length
  await expect(count).toHaveText(/^共 \d+ 步$/)
  await next.click()
  await expect(count).toHaveText(/^第 1 \/ \d+ 步$/)
  // What the step did reads above the instrument, next to the buttons that advance it.
  expect(await top(guide.locator('.for-description'))).toBeLessThan(await top(guide.locator('.for-board')))
  while (await next.isEnabled()) await next.click()
  const total = Number((await count.innerText()).match(/\/ (\d+)/)?.[1])
  await expect(count).toHaveText(`第 ${total} / ${total} 步`)
  expect(total).toBeGreaterThan(steps)

  await expect(phases(page).nth(0)).toHaveAttribute('data-state', 'done')
  await expect(phases(page).nth(1)).toHaveAttribute('aria-current', 'step')
  const prediction = page.getByTestId('for-prediction')
  const hint = () => prediction.locator('.charge-prediction-body').evaluate(node => getComputedStyle(node, '::after').content)
  expect(await hint()).toContain('先选好')
  await prediction.locator('[data-for-case="1"]').click()
  await prediction.locator(`[data-round-option="${practice.batteries.length}"]`).click()
  const answer = practice.predictions.results.findIndex(option => option.join() === practice.expected.join())
  await prediction.locator(`[data-result-option="${answer}"]`).click()
  expect(await hint()).toBe('none')
  await prediction.getByRole('button', { name: '运行验证', exact: true }).click()
  await expect(prediction).toHaveAttribute('data-match', 'true')
  expect(await hint()).toBe('none')

  // The lesson's own key points and question appear once it is passed.
  const recap = page.getByTestId('lesson-recap')
  await expect(recap.getByRole('heading', { level: 3 })).toHaveText(lesson.sections.map(section => section.title.zh))
  await expect(recap).toContainText(lesson.sections[0].body.zh)
  await expect(phases(page).nth(1)).toHaveAttribute('data-state', 'done')
  await expect(phases(page).nth(2)).toHaveAttribute('data-state', 'open')
  await expect(recap).toContainText(lesson.question.prompt.zh)
  const choice = (index: number) => recap.getByRole('button', { name: lesson.question.options[index].zh, exact: true })
  const wrong = lesson.question.options.findIndex((_, index) => index !== lesson.question.correct)
  await choice(wrong).click()
  await expect(choice(wrong)).toHaveAttribute('data-result', 'wrong')
  await expect(recap.getByRole('status')).toContainText('再想想上面的要点')
  await choice(lesson.question.correct).click()
  await expect(recap.getByRole('status')).toContainText(lesson.question.feedback.zh)

  // On a later visit the key points are there from the start, one tap away from the phase strip.
  await page.reload()
  await open(page, lesson)
  await expect(page.getByTestId('lesson-recap')).toBeVisible()
  await expect(phases(page).nth(0)).toHaveAttribute('aria-current', 'step')
  await phases(page).nth(2).getByRole('button').click()
  await expect(page.getByTestId('lesson-recap')).toBeInViewport()
})

test('the debugging lesson tracks its method, and sequence and overview lessons name their own steps', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const debugging = lecture(catalog, 'python-debugging-notes')
  await page.goto('/')
  await open(page, debugging)
  const guide = page.getByTestId('debugging-lesson')
  const method = guide.getByTestId('debug-method').getByRole('listitem')
  const current = guide.getByTestId('debug-method').locator('[aria-current="step"]')
  const advance = async () => {
    const next = guide.getByRole('button', { name: '下一步', exact: true })
    while (await next.isVisible() && await next.isEnabled()) await next.click()
  }
  await expect(method).toHaveCount(5)
  await expect(current).toHaveText(/用一块电池试跑/)
  await guide.getByRole('button', { name: '试跑一块', exact: true }).click()
  await advance()
  await guide.getByRole('button', { name: '换一排电池', exact: true }).click()
  await expect(current).toHaveText(/换一排，对照预期和实际/)
  await expect(method.first()).toHaveAttribute('data-state', 'done')
  await advance()
  await expect(current).toHaveText(/找出提前结束的那一行/)
  // The caption that asks for a line sits above the code it asks about.
  const code = guide.getByTestId('debugging-code')
  expect(await top(guide.locator('.debug-description'))).toBeLessThan(await top(code))
  await code.getByRole('button').filter({ hasText: 'return' }).click()
  await expect(current).toHaveText(/把 return 移出循环/)
  await guide.getByRole('button', { name: '移到循环外', exact: true }).click()
  await expect(current).toHaveText(/重新试跑确认/)
  await guide.getByRole('button', { name: '重新试跑', exact: true }).click()
  await expect(guide.getByTestId('debug-method').locator('[data-state="done"]')).toHaveCount(5)
  await expect(phases(page).nth(1)).toHaveAttribute('aria-current', 'step')

  const sequence = lecture(catalog, 'sequence-notes')
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await open(page, sequence)
  await expect(phases(page)).toHaveText([/排好补电步骤/, /看提前显示会怎样/, /修好打乱的步骤/, /要点小结/])
  await expect(phases(page).nth(0)).toHaveAttribute('aria-current', 'step')

  // A course overview is a run of lectures, so its path shows their titles.
  const overview = catalog.levels.filter(level => level.unit?.id === 'foundations' && level.kind === 'lecture' && level.overview)
  const cups = lecture(catalog, 'variable-cups')
  await page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(cups.title.zh, { exact: true }) }).click()
  const path = page.getByTestId('topic-steps')
  await expect(path).toHaveAttribute('data-titled', 'true')
  await expect(path.getByRole('listitem')).toHaveCount(overview.length)
  await expect(path.locator('[data-current] .topic-steps__text')).toHaveText(cups.title.zh)
  await expect(phases(page)).toHaveText([/贴名字、存数、读数/, /换块电池预测/, /要点小结/])
})

test('search lessons keep the task and the step explanation beside the batteries the learner taps', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const binary = lecture(catalog, 'binary-search-notes')
  await page.goto('/')
  await open(page, binary)
  const controls = page.locator('.coding-device-controls')
  await expect(controls.locator('.first-search-task')).toBeVisible()
  await expect(controls.getByTestId('first-battery-search-step')).toBeVisible()
  await expect(controls.getByTestId('first-battery-search-range')).toBeVisible()

  const pairs = lecture(catalog, 'two-pointer-notes')
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await open(page, pairs)
  const lesson = page.locator('.two-pointer-lesson')
  expect(await top(lesson.locator('.two-pointer-task'))).toBeLessThan(await top(lesson.getByTestId('two-pointer-step')))
  expect(await top(lesson.getByTestId('two-pointer-step'))).toBeLessThan(await top(lesson.getByTestId('two-pointer-row')))
  await expect(phases(page)).toHaveText([/从两头向中间配对/, /预测移动和配对/, /要点小结/])
})
