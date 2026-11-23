import { expect, test, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openBench(page: Page, unit: string, title: string, scene: string) {
  await page.goto('/')
  await page.locator(`[data-unit="${unit}"]`).click()
  await page.locator('.mission-list button').filter({ has: page.getByText(title, { exact: true }) }).click()
  const model = page.locator(`[data-teaching-model="${scene}"]`)
  await model.scrollIntoViewIfNeeded()
  await expect(model).toHaveAttribute('data-renderer', 'webgl', { timeout: 15_000 })
  return model.locator('.teaching-model-labels')
}

test('the Web workstation shows the server computing before the result reaches the browser', async ({ page }) => {
  const labels = await openBench(page, 'foundations', '网页程序（Web）', 'program-web')
  const lesson = page.getByTestId('program-interfaces')
  const next = lesson.getByRole('button', { name: '下一步', exact: true })
  const output = labels.getByText('9', { exact: true })
  await expect(output).toHaveCount(0)
  await lesson.getByRole('button', { name: '发送到服务器', exact: true }).click()
  await lesson.getByRole('button', { name: '回放这次运行', exact: true }).click()
  await next.click()
  await expect(lesson.getByTestId('program-interface-replay')).toHaveAttribute('data-replay-step', 'request')
  await expect(labels.getByText('6', { exact: true })).toHaveCount(2)
  await expect(output).toHaveCount(0)
  await next.click()
  await expect(output).toHaveCount(1)
  await expect(labels.getByText('6', { exact: true })).toHaveCount(1)
  await next.click()
  await expect(output).toHaveCount(2)
  await next.click()
  await expect(labels.getByText('6', { exact: true })).toHaveCount(0)
  await expect(lesson.getByTestId('program-interface-output')).toHaveText('9')
})

test('the Python exercise bench uses the chosen case and the actual return from the child’s code', async ({ page }) => {
  const labels = await openBench(page, 'foundations', '写出电量相加函数', 'python-function-practice')
  await expect(labels.getByText('—', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '编写 Python' }).fill('def charge_total(current, added):\n    return current - added')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(labels.getByText('1', { exact: true })).toBeVisible()
  await expect(labels.getByText('5', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '用例 3', exact: true }).click()
  await expect(labels.getByText('-7', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '单步执行', exact: true }).click()
  await expect(labels.getByText('—', { exact: true })).toBeVisible()
  await expect(labels.getByText('-7', { exact: true })).toHaveCount(0)
})
