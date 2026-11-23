import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

async function openBench(page: Page, title: string) {
  await page.goto('/')
  await page.locator('[data-unit="architecture"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(title, { exact: true }) }).click()
  const bench = page.locator('.machine-lesson .cpu-datapath')
  const model = bench.locator('[data-teaching-model="cpu-transfer"]')
  await model.scrollIntoViewIfNeeded()
  await expect(model).toHaveAttribute('data-renderer', 'webgl', { timeout: 20000 })
  return bench
}

async function tapPart(page: Page, bench: Locator, label: string) {
  const part = bench.locator('.teaching-model-labels').getByText(label, { exact: true })
  await part.scrollIntoViewIfNeeded()
  const box = await part.boundingBox()
  if (!box) throw new Error('Could not see the CPU part ' + label)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

test('the model clock and a pinned RAM probe follow the ALU, a writeback and its rewind', async ({ page }) => {
  const bench = await openBench(page, '读到 HALT 就停下来')
  const probe = bench.getByTestId('cpu-probe-reading')
  await tapPart(page, bench, '[2]')
  await expect(probe).toHaveText('RAM[2] = 0')
  await tapPart(page, bench, '时钟')
  await expect(bench.getByTestId('cpu-current-instruction')).toContainText('第 2 行')
  await expect(bench.locator('[data-action="write"]')).toContainText('ACC 0 → 18')
  await tapPart(page, bench, '时钟')
  await expect(bench.locator('[data-action="alu"]')).toContainText('18 + (-4) = 14')
  await expect(probe).toHaveText('RAM[2] = 0')
  await tapPart(page, bench, '时钟')
  await expect(bench.locator('[data-action="write"]')).toHaveAttribute('data-changed', 'true')
  await expect(probe).toHaveText('RAM[2] = 14')
  await expect(page.locator('.machine-instructions [data-current] code')).toHaveText('STORE 2')
  await expect(page.locator('.machine-instructions [data-next] code')).toHaveText('HALT')
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await expect(bench.locator('[data-action="alu"]')).toContainText('18 + (-4) = 14')
  await expect(probe).toHaveText('RAM[2] = 0')
  await page.getByRole('button', { name: '重置 CPU', exact: true }).click()
  await expect(bench.locator('.cpu-signal-flow')).toHaveCount(0)
  await expect(bench.getByText('PC 0', { exact: true })).toBeVisible()
})

test('a RAM socket chooses the address for a new instruction; a same-value write is still shown', async ({ page }) => {
  const bench = await openBench(page, '编写维修站电量报告')
  await page.setViewportSize({ width: 390, height: 844 })
  await bench.getByRole('button', { name: '俯视', exact: true }).click()
  await tapPart(page, bench, '[1]')
  await expect(page.locator('.machine-palette select')).toHaveValue('1')
  await page.getByRole('button', { name: '添加 LOAD', exact: true }).click()
  await page.getByRole('button', { name: '添加 STORE', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '编写汇编' })).toHaveValue(/LOAD 1\nSTORE 1\nHALT/)
  await tapPart(page, bench, '时钟')
  await tapPart(page, bench, '时钟')
  await expect(bench.locator('[data-action="write"]')).toHaveAttribute('data-changed', 'false')
  const accessed = page.locator('.machine-memory [data-address="1"]')
  await expect(accessed).toHaveAttribute('data-changed', 'false')
  await expect(accessed).toContainText('写入')
  await tapPart(page, bench, '时钟')
  await expect(bench.locator('[data-action="halt"]')).toBeVisible()
  await expect(page.getByRole('button', { name: '单步执行', exact: true })).toBeDisabled()
})
