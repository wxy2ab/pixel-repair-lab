import { expect, test, type Page } from '@playwright/test'

const gridId = 'challenge-two-lane-dispatch'
const arenaId = 'challenge-freight-carousel'
const defaultPolicy = 'def decide(state):\n    return "wait"\n'

function continueCard(page: Page) {
  return page.getByRole('region', { name: '继续闯关', exact: true })
}

async function openChallenge(page: Page, id: string) {
  await page.goto('/')
  await continueCard(page).getByRole('button', { name: '自由选关', exact: true }).click()
  await page.locator(`[data-challenge-level="${id}"]`).click()
}

async function continueAfterReload(page: Page, id: string) {
  await page.reload()
  await continueCard(page).locator(`[data-continue-challenge="${id}"]`).click()
}

test('continuing restores nested grid cards, their choices, and the independent Python draft', async ({ page }) => {
  await openChallenge(page, gridId)
  await page.locator('[data-add-card="read"]').click()
  await page.locator('[data-add-card="if-bay"]').click()
  const branch = page.locator('[data-card="if-bay"]')
  await branch.locator('[data-parameter="bay"]').selectOption('east')
  await branch.getByRole('button', { name: '向代码块添加指令', exact: true }).click()
  await page.locator('[data-add-card="set-headings"]').click()
  await branch.locator('[data-parameter="pair"]').selectOption('right')
  const program = 'ticket = scan()\nif ticket["bay"] == "east":\n    heading = ["right", "left"]'
  await expect(page.getByTestId('generated-code')).toHaveText(program)

  const python = page.getByRole('tab', { name: 'Python', exact: true })
  const cards = page.getByRole('tab', { name: '指令卡', exact: true })
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const incomplete = 'ticket = scan()\nif ticket["bay"] =='
  await python.click()
  await editor.fill(incomplete)
  await continueAfterReload(page, gridId)
  await expect(python).toHaveAttribute('aria-selected', 'true')
  await expect(editor).toHaveValue(incomplete)
  await cards.click()
  await expect(branch.locator('[data-parameter="bay"]')).toHaveValue('east')
  await expect(branch.locator('[data-card="set-headings"] [data-parameter="pair"]')).toHaveValue('right')
  await expect(page.getByTestId('generated-code')).toHaveText(program)

  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await continueCard(page).getByRole('button', { name: '重新开始', exact: true }).click()
  await expect(cards).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-card="if-bay"]')).toHaveCount(0)
  await python.click()
  await expect(editor).toHaveValue('')
  await continueAfterReload(page, gridId)
  await expect(editor).toHaveValue('')
})

test('arena mode and both scripts survive reload, and starting over resets the current mode', async ({ page }) => {
  await openChallenge(page, arenaId)
  const relaxed = page.getByRole('button', { name: '从容', exact: true })
  const timed = page.getByRole('button', { name: '紧张', exact: true })
  const relaxedCode = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const timedCode = page.locator('#realtime-python')
  const relaxedDraft = 'state = scan()\n# my relaxed draft'
  const timedDraft = 'def decide(state):\n    # decide after checking the route\n'
  await relaxedCode.fill(relaxedDraft)
  await timed.click()
  await timedCode.fill(timedDraft)

  await page.setViewportSize({ width: 320, height: 720 })
  await page.reload()
  const card = continueCard(page)
  await expect(card.locator('[data-continue-mode="timed"]')).toHaveText('紧张模式')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await card.locator(`[data-continue-challenge="${arenaId}"]`).click()
  await expect(timed).toHaveAttribute('aria-pressed', 'true')
  await expect(timedCode).toHaveValue(timedDraft)
  const start = page.getByRole('button', { name: '开始', exact: true })
  await expect(start).toBeEnabled()
  await expect(page.getByTestId('arena-turn')).toContainText('0/')
  await relaxed.click()
  await expect(relaxedCode).toHaveValue(relaxedDraft)
  await continueAfterReload(page, arenaId)
  await expect(relaxed).toHaveAttribute('aria-pressed', 'true')
  await expect(relaxedCode).toHaveValue(relaxedDraft)

  await timed.click()
  await start.click()
  await expect(page.getByTestId('arena-turn')).toContainText('1/')
  await page.getByRole('button', { name: '重新开始', exact: true }).click()
  await expect(timed).toHaveAttribute('aria-pressed', 'true')
  await expect(timedCode).toHaveValue(defaultPolicy)
  await expect(start).toBeEnabled()
  await expect(page.getByTestId('arena-turn')).toContainText('0/')
  await relaxed.click()
  await expect(relaxedCode).toHaveValue(relaxedDraft)
  await timed.click()
  await continueAfterReload(page, arenaId)
  await expect(timedCode).toHaveValue(defaultPolicy)
})
