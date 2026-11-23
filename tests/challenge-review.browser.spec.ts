import { expect, test } from '@playwright/test'
import { cardsToPython } from '../src/shared/cards'
import type { Catalog } from '../src/shared/types'

test('a failed challenge links to a real exercise and restores the same attempt on return', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const challenge = levels.find(level => level.id === 'limited-battery-salvage')
  const exercise = levels.find(level => level.id === 'first-steps')
  if (challenge?.kind !== 'grid' || exercise?.kind !== 'grid') throw new Error('Missing the review fixtures')

  await page.goto('/#challenge-zone')
  await page.locator(`[data-challenge-level="${challenge.id}"]`).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  const code = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const wrong = 'move("up")'
  await code.fill(wrong)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const review = page.getByRole('region', { name: '失败复盘', exact: true })
  const expand = review.getByRole('button', { name: '复盘这次', exact: true })
  await expand.click()
  await expect(review).toContainText('第 1 行')
  await expect(review).toContainText('离目标还差什么')
  await expect(review).toContainText('墙')
  await review.getByRole('button', { name: new RegExp(exercise.title.zh, 'u') }).click()
  await expect(page.getByRole('heading', { level: 1, name: exercise.title.zh, exact: true })).toBeVisible()
  const study = page.getByRole('region', { name: '复盘补课', exact: true })
  await expect(study).toContainText(challenge.title.zh)
  await expect(review).toHaveCount(0)

  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await code.fill(cardsToPython(exercise.cards, exercise.solutionCards))
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.locator('.output-panel .win-message')).toContainText('任务完成')
  await expect(study).toContainText('可以回到原挑战继续试。')
  await study.getByRole('button', { name: '返回原挑战', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: challenge.title.zh, exact: true })).toBeVisible()
  await expect(expand).toHaveAttribute('aria-expanded', 'true')
  await expect(code).toHaveValue(wrong)

  await review.getByRole('button', { name: '直接重试', exact: true }).click()
  await expect(code).toBeFocused()
  await expect(code).toHaveValue(wrong)
  await code.fill(cardsToPython(challenge.cards, challenge.solutionCards))
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果', exact: true }).click()
  await expect(page.locator('.output-panel .win-message')).toContainText('任务完成')
  await expect(review).toHaveCount(0)
})
