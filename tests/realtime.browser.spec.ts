import { expect, test, type Page } from '@playwright/test'

async function openArena(page: Page, title: string) {
  await page.goto('/')
  await page.locator('[data-unit="routing"]').click()
  await page.locator('.mission-list').getByRole('button', { name: new RegExp(title) }).click()
}

test('timed escape waits for Start and rivals catch an idle player', async ({ page }) => {
  await openArena(page, '巡逻网突围')
  await expect(page.getByRole('button', { name: '从容', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  const start = page.getByRole('button', { name: '开始', exact: true })
  const turn = page.getByTestId('arena-turn')
  await expect(start).toBeEnabled()
  await page.waitForTimeout(2_000)
  await expect(turn).toContainText('0/16')
  await start.click()
  await expect(turn).toContainText('1/16')
  await expect(page.locator('.arena-events li').first()).toContainText('等待')
  await expect(page.locator('.arena-events li').nth(1)).toContainText(/向[上下左右]移动/)
  await expect(page.getByText(/被截住了/)).toBeVisible({ timeout: 6_000 })
  await page.getByRole('button', { name: '重新准备', exact: true }).click()
  await expect(start).toBeEnabled()
  await expect(turn).toContainText('0/16')
})

test('timed race applies Python before Start and records a scored win', async ({ page }) => {
  await openArena(page, '零件争夺赛')
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await page.getByLabel('编写 decide(state)').fill(`def decide(state):
    turn = state["turn"]
    if turn in [1, 3, 5, 7]:
        return "pick"
    if turn == 6:
        return "down"
    return "right"`)
  await page.getByRole('button', { name: '应用策略', exact: true }).click()
  await expect(page.getByText('策略已启用', { exact: true })).toBeVisible()
  await expect(page.getByTestId('arena-turn')).toContainText('0/12')
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(page.getByText('你收集的零件最多，获胜！', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('list', { name: '对抗比分' }).getByText('4', { exact: true })).toBeVisible()
  await expect(page.getByText('已完成', { exact: true }).first()).toBeVisible()
})
