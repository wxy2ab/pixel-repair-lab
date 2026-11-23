import { expect, test, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'
import { learningRecordKey, type LearningLog } from '../src/web/learningRecordModel'

function action(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true })
}

async function openExercise(page: Page, id: string) {
  const response = await page.request.get('/api/levels')
  const { levels } = await response.json() as Catalog
  const level = levels.find(item => item.id === id)
  if (!level?.unit) throw new Error(`Missing exercise ${id}`)
  await page.goto('/')
  await page.locator(`[data-unit="${level.unit.id}"]`).click()
  await page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) }).click()
  await expect(page.getByRole('heading', { name: level.title.zh, level: 1, exact: true })).toBeVisible()
  return level
}

function storedAttempt(page: Page, id: string) {
  return page.evaluate(({ key, id }) => {
    const log = JSON.parse(localStorage.getItem(key) ?? '{}') as LearningLog
    return log[id]
  }, { key: learningRecordKey, id })
}

test('the AI prompt exercise records a learner mistake after an API failure and a scripted mistake', async ({ page }) => {
  await page.route('**/api/ai/status', route => route.fulfill({ json: { available: true } }))
  await page.route('**/api/ai/turn', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }))
  const level = await openExercise(page, 'ai-supply-box')
  await action(page, '在线 AI').click()
  await action(page, '填入示例').click()
  await action(page, '发送给 AI').click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await storedAttempt(page, level.id)).toBeUndefined()

  await action(page, '用练习模拟继续').click()
  await expect(page.locator('.ai-result')).toContainText('模拟了一次 AI 出错')
  expect(await storedAttempt(page, level.id)).toBeUndefined()

  await page.getByRole('textbox', { name: '给 AI 写提示词' }).fill('把电池改为 4 节。')
  await action(page, '发送修正').click()
  await expect.poll(() => storedAttempt(page, level.id)).toMatchObject({ mistakes: 1, pending: true })

  await action(page, '填入修正示例').click()
  await action(page, '发送修正').click()
  await action(page, '确认清单').click()
  await expect.poll(() => storedAttempt(page, level.id)).toMatchObject({ mistakes: 1, pending: false })
})

test('an incorrect online AI result only enters the notebook when the learner audits it incorrectly', async ({ page }) => {
  await page.route('**/api/ai/status', route => route.fulfill({ json: { available: true } }))
  const incomplete = [{ id: 'wheel', quantity: 2 }, { id: 'tie', quantity: 3 }]
  let requests = 0
  await page.route('**/api/ai/turn', route => route.fulfill({ json: {
    candidate: { items: ++requests === 1 ? incomplete : [...incomplete, { id: 'tape', quantity: 1 }] },
  } }))
  const level = await openExercise(page, 'ai-review-two-differences')
  await action(page, '在线 AI').click()
  await action(page, '填入示例').click()
  await action(page, '发送给 AI').click()
  await expect(action(page, '提交核对')).toBeVisible()
  expect(await storedAttempt(page, level.id)).toBeUndefined()

  await action(page, '提交核对').click()
  await expect.poll(() => storedAttempt(page, level.id)).toMatchObject({ mistakes: 1, pending: true })
  await page.locator('[data-ai-audit="tape"]').check()
  await action(page, '提交核对').click()
  await action(page, '填入修正示例').click()
  await action(page, '发送修正').click()
  await action(page, '提交核对').click()
  await action(page, '确认清单').click()
  await expect.poll(() => storedAttempt(page, level.id)).toMatchObject({ mistakes: 1, pending: false })
})

test('native NumPy records a wrong answer and its retry without counting a lab outage', async ({ page }) => {
  const level = await openExercise(page, 'numpy-slicing-practice')
  if (level.kind !== 'data') throw new Error('Expected a NumPy exercise')
  const path = '**/api/labs/data'
  await page.route(path, route => route.fulfill({ status: 503, json: { error: 'lab-unavailable' } }))
  const run = action(page, '运行实验')
  await run.click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await storedAttempt(page, level.id)).toBeUndefined()

  await page.unroute(path)
  await run.click()
  await expect.poll(() => storedAttempt(page, level.id)).toMatchObject({ mistakes: 1, pending: true })

  for (const [name, value] of Object.entries(level.steps[0].solution ?? {})) {
    const control = page.getByTestId('data-controls').locator(`[data-parameter="${name}"]`)
    if (typeof value === 'number') await control.fill(String(value))
    else if (typeof value === 'boolean') await control.setChecked(value)
    else await control.selectOption(value)
  }
  await run.click()
  await expect.poll(() => storedAttempt(page, level.id)).toMatchObject({ mistakes: 1, pending: false })
})
