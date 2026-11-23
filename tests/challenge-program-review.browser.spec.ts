import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { AlgorithmLevel } from '../src/shared/advanced'

const algorithm = JSON.parse(readFileSync(new URL('../levels/1811-backup-power-loadout.json', import.meta.url), 'utf8')) as AlgorithmLevel

async function openChallenge(page: Page, id: string) {
  await page.goto('/#challenge-zone')
  await page.locator(`[data-challenge-level="${id}"]`).click()
}

test('Python challenge review identifies failed cases and returns to the same draft', async ({ page }) => {
  await openChallenge(page, algorithm.id)
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const run = page.getByRole('button', { name: '运行', exact: true })
  const review = page.getByRole('region', { name: '失败复盘', exact: true })
  const expand = review.getByRole('button', { name: '复盘这次', exact: true })
  const draft = 'def backup_loadout(modules, capacity):\n    return [0, 0, []]'
  await expect(review).toHaveCount(0)
  await editor.fill(draft)
  await run.click()
  await expand.click()
  await expect(review).toContainText('第 1、2、3、5、8 组用例未通过')
  await expect(review).toContainText('已通过 3/8 组用例，还差 5 组。')
  await expect(review).toContainText('返回值的格式不符')
  await expect(review).not.toContainText(JSON.stringify(algorithm.cases[0].expected))
  await review.getByRole('button', { name: '直接重试', exact: true }).click()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue(draft)
  await expect(review).toHaveCount(0)

  await editor.fill('def backup_loadout(modules, capacity):\n    return 1 // 0')
  await run.click()
  await expand.click()
  await expect(review).toContainText('第 2 行')
  await expect(review).toContainText('除数不能是 0')

  await editor.fill(algorithm.solutionCode)
  await run.click()
  await expect(page.getByText('8/8 个用例通过', { exact: true })).toBeVisible()
  await expect(review).toHaveCount(0)
})

test('CPU challenge review identifies failed scenarios, registers, and memory addresses', async ({ page }) => {
  await openChallenge(page, 'challenge-cpu-memory-relay')
  const editor = page.getByRole('textbox', { name: '编写汇编', exact: true })
  const step = page.getByRole('button', { name: '单步执行', exact: true })
  const review = page.getByRole('region', { name: '失败复盘', exact: true })
  const expand = review.getByRole('button', { name: '复盘这次', exact: true })
  const draft = 'LOAD 0\nSTORE 4\nHALT'
  await expect(review).toHaveCount(0)
  await editor.fill(draft)
  for (let index = 0; index < 3; index++) await step.click()
  await expand.click()
  await expect(review).toContainText('早班记录')
  await expect(review).toContainText('还差 4 个')
  await expect(review).toContainText('ACC 的值还不符合目标。')
  await expect(review).toContainText('内存地址 0、1、2、3、4 的值还不符合目标。')
  await expect(review).not.toContainText('81')

  await page.getByRole('button', { name: '检验全部场景', exact: true }).click()
  await expect(review).toContainText('同量入库')
  await review.getByRole('button', { name: '直接重试', exact: true }).click()
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue(draft)
  await expect(page.locator('[data-register="pc"]')).toHaveText('0')
  await expect(review).toHaveCount(0)

  await editor.fill('LOAD 0')
  await step.click()
  await expand.click()
  await expect(review).toContainText('第 1 行执行后，程序结束但 CPU 未停机。')
})
