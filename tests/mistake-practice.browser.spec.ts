import { expect, test, type Page } from '@playwright/test'
import { learningRecordKey } from '../src/web/learningRecordModel'

async function openExercise(page: Page, unit: string, title: string) {
  await page.goto('/')
  await page.locator(`[data-unit="${unit}"]`).click()
  await page.locator('.mission-list button').filter({ has: page.getByText(title, { exact: true }) }).click()
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
}

function entry(page: Page, id: string) {
  return page.evaluate(({ id, key }) => JSON.parse(localStorage.getItem(key) ?? '{}')[id], { id, key: learningRecordKey })
}

test('machine creates one mistake per new terminal evaluation and replays do not duplicate it', async ({ page }) => {
  const id = 'copy-memory'
  await openExercise(page, 'architecture', '把信号复制到另一个地址')
  const assembly = page.getByLabel('编写汇编')
  const step = page.getByRole('button', { name: '单步执行', exact: true })
  const verify = page.getByRole('button', { name: '检验全部场景', exact: true })

  await assembly.fill('LOAD 999')
  await expect(step).toBeDisabled()
  expect(await entry(page, id)).toBeUndefined()

  await assembly.fill('HALT')
  await step.click()
  await expect.poll(() => entry(page, id)).toMatchObject({ mistakes: 1, pending: true })
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await step.click()
  await verify.click()
  await expect.poll(() => entry(page, id)).toMatchObject({ mistakes: 2, pending: true })
  await verify.click()

  await assembly.fill('LOAD 0\nSTORE 2\nHALT')
  for (let instruction = 0; instruction < 3; instruction++) await step.click()
  await verify.click()
  await expect.poll(() => entry(page, id)).toMatchObject({ mistakes: 2, pending: false })
})

test('circuit switch changes are exploratory until an incorrect result is submitted', async ({ page }) => {
  const id = 'build-binary-display'
  await openExercise(page, 'computer', '在控制台拼出目标数')
  const firstBit = page.getByRole('button', { name: '位 1', exact: true })
  const submit = page.getByRole('button', { name: '检查设置', exact: true })

  await firstBit.click()
  await expect(page.getByTestId('circuit-value')).toHaveText('1')
  expect(await entry(page, id)).toBeUndefined()
  await submit.click()
  await expect.poll(() => entry(page, id)).toMatchObject({ mistakes: 1, pending: true })

  await firstBit.click()
  await expect(page.getByTestId('circuit-value')).toHaveText('9')
  await submit.click()
  await expect.poll(() => entry(page, id)).toMatchObject({ mistakes: 2, pending: true })
})
