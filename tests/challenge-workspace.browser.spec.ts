import { expect, test, type APIRequestContext } from '@playwright/test'
import type { AlgorithmLevel } from '../src/shared/advanced'
import type { Catalog } from '../src/shared/types'

const challengeId = 'challenge-quiet-power-window'

async function challenge(request: APIRequestContext) {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const level = catalog.levels.find(candidate => candidate.id === challengeId)
  if (level?.kind !== 'algorithm') throw new Error('Expected the patrol power window challenge')
  return level as AlgorithmLevel
}

test('the code editor indents, runs from the keyboard and lets a keyboard user leave it', async ({ page, request }) => {
  const level = await challenge(request)
  await page.goto('/')
  await page.locator(`[data-challenge-level="${challengeId}"]`).click()
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  await expect(editor).toHaveValue(level.starterCode)
  await expect(editor).toHaveAccessibleDescription(/Tab 缩进/)

  await editor.fill('')
  await editor.pressSequentially(`def ${level.functionName}(draws, limit):`)
  await editor.press('Enter')
  await editor.pressSequentially('best = []')
  await editor.press('Enter')
  await editor.pressSequentially('return best')
  await expect(editor).toHaveValue(`def ${level.functionName}(draws, limit):\n    best = []\n    return best`)
  await editor.press('Shift+Tab')
  await expect(editor).toHaveValue(`def ${level.functionName}(draws, limit):\n    best = []\nreturn best`)
  await editor.press('Home')
  await editor.press('Tab')
  await expect(editor).toHaveValue(`def ${level.functionName}(draws, limit):\n    best = []\n    return best`)
  await expect(editor).toBeFocused()
  // The whole edit sequence lands in the saved draft like any typed text.
  await page.reload()
  await page.locator(`[data-challenge-level="${challengeId}"]`).click()
  await expect(page.getByRole('textbox', { name: '编写 Python' })).toHaveValue(`def ${level.functionName}(draws, limit):\n    best = []\n    return best`)

  const fresh = page.getByRole('textbox', { name: '编写 Python' })
  await fresh.focus()
  await fresh.press('ControlOrMeta+Enter')
  const passing = level.cases.filter(test => Array.isArray(test.expected) && test.expected.length === 0).length
  await expect(page.getByText(`${passing}/${level.cases.length} 个用例通过`, { exact: true })).toBeVisible()
  await fresh.press('Escape')
  await fresh.press('Tab')
  await expect(fresh).not.toBeFocused()
})

test('each case shows named arguments, its verdict after a run, and the whole set in one table', async ({ page, request }) => {
  const level = await challenge(request)
  await page.goto('/')
  await page.locator(`[data-challenge-level="${challengeId}"]`).click()
  const cases = page.locator('.algorithm-cases')
  const chips = cases.getByRole('group', { name: '选择要查看的用例' }).getByRole('button')
  await expect(chips).toHaveCount(level.cases.length)
  await expect(cases.locator('.algorithm-cases__signature')).toHaveText(`${level.functionName}(draws, limit)`)
  const selected = cases.locator('.algorithm-case')
  await expect(selected.locator('.algorithm-case__name')).toHaveText(['draws =', 'limit ='])
  await expect(selected.locator('.algorithm-case__actual')).toHaveCount(0)
  await expect(cases.locator('.algorithm-cases__tally')).toHaveCount(0)

  await page.getByRole('textbox', { name: '编写 Python' }).fill(`def ${level.functionName}(draws, limit):\n    return []`)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const passing = level.cases.flatMap((test, index) => Array.isArray(test.expected) && test.expected.length === 0 ? [index] : [])
  await expect(cases.locator('.algorithm-cases__tally')).toHaveText(`已通过 ${passing.length} / ${level.cases.length}`)
  await expect(chips.and(page.locator('[data-outcome="passed"]'))).toHaveCount(passing.length)
  await expect(chips.and(page.locator('[data-outcome="failed"]'))).toHaveCount(level.cases.length - passing.length)
  // The mark is decoration. A chip keeps its plain name and says the outcome in its description.
  const failing = level.cases.findIndex((_, index) => !passing.includes(index))
  const failedChip = cases.getByRole('button', { name: `用例 ${failing + 1}`, exact: true })
  await expect(failedChip).toHaveAccessibleDescription('未通过')
  await failedChip.click()
  await expect(selected).toHaveAttribute('data-outcome', 'failed')
  await expect(selected.locator('.algorithm-case__actual')).toContainText('[]')
  await cases.getByRole('button', { name: `用例 ${passing[0] + 1}`, exact: true }).click()
  await expect(selected).toHaveAttribute('data-outcome', 'passed')

  await cases.getByText(`全部 ${level.cases.length} 组用例一览`, { exact: true }).click()
  await expect(cases.getByRole('row')).toHaveCount(level.cases.length + 1)
  await expect(cases.locator('tbody tr[data-outcome="passed"]')).toHaveCount(passing.length)
  const panel = await cases.boundingBox()
  const detail = await selected.boundingBox()
  if (!panel || !detail) throw new Error('The case panel must be visible')
  expect(detail.x + detail.width).toBeLessThanOrEqual(panel.x + panel.width)

  // Editing the program clears the verdicts it no longer describes.
  await page.getByRole('textbox', { name: '编写 Python' }).fill(level.starterCode)
  await expect(cases.locator('.algorithm-cases__tally')).toHaveCount(0)
  await expect(chips.and(page.locator('[data-outcome]'))).toHaveCount(0)
})

test('the mission brief lists its rules, pins to the top, and the mission panel folds away and comes back', async ({ page, request }) => {
  const level = await challenge(request)
  await page.goto('/')
  await page.locator(`[data-challenge-level="${challengeId}"]`).click()
  const brief = page.getByRole('region', { name: '任务简报', exact: true })
  await expect(brief.getByRole('list', { name: '规则速览' })).toContainText(`${level.cases.length} 组用例全部通过`)
  await expect(brief.locator('.mission-brief__rules li').first()).toBeVisible()
  expect((await brief.locator('.mission-brief__body').innerText()).replace(/\s/g, '')).toBe(level.brief.zh.replace(/\s/g, ''))
  await expect(brief.locator('code').filter({ hasText: /^draws$/ })).toHaveCount(1)

  await brief.getByRole('button', { name: '固定简报', exact: true }).click()
  await page.mouse.wheel(0, 600)
  await expect.poll(async () => (await brief.boundingBox())?.y).toBeLessThan(20)
  await expect(brief).toBeInViewport()
  await page.reload()
  await page.locator(`[data-challenge-level="${challengeId}"]`).click()
  const pinned = page.getByRole('region', { name: '任务简报', exact: true })
  await expect(pinned.getByRole('button', { name: '取消固定', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await pinned.getByRole('button', { name: '取消固定', exact: true }).click()
  await pinned.getByRole('button', { name: '收起', exact: true }).click()
  await expect(pinned.locator('.mission-brief__body')).toHaveCount(0)
  await pinned.getByRole('button', { name: '展开', exact: true }).click()
  await expect(pinned.locator('.mission-brief__body')).toBeVisible()

  // The mission list groups challenges by kind, shows the open one, and folds into a slim rail.
  const list = page.locator('.mission-list')
  await expect(list.locator('.course-topic-heading').first()).toContainText('网格解谜')
  await expect(list.locator('[aria-current="step"]')).toBeInViewport()
  await expect(list.locator('[aria-current="step"] .mission-stage')).toHaveText('进阶')
  const wide = (await page.locator('.content').boundingBox())?.width ?? 0
  await page.getByRole('button', { name: '收起任务列表栏', exact: true }).click()
  await expect(list).toBeHidden()
  expect((await page.locator('.content').boundingBox())?.width ?? 0).toBeGreaterThan(wide + 150)
  await page.reload()
  await page.locator(`[data-challenge-level="${challengeId}"]`).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(level.title.zh)
  await expect(page.locator('.mission-list')).toBeHidden()
  await page.getByRole('button', { name: '展开任务列表栏', exact: true }).click()
  await expect(page.locator('.mission-list [aria-current="step"]')).toBeInViewport()
})
