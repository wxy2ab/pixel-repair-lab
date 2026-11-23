import { expect, test } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

test('a child clicks together a route planner, replays its chosen path and reuses it in all three depots after a refresh', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels } = await response.json() as Catalog
  const practice = levels.find(level => level.id === 'design-shortest-route')
  const dispatch = levels.find(level => level.id === 'challenge-three-depot-dispatch')
  if (practice?.kind !== 'algorithm' || dispatch?.kind !== 'grid') throw new Error('Missing the route practice or depot challenge')

  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/')
  await page.locator('button[data-unit="routing"]').click()
  await page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(practice.title.zh, { exact: true }) }).click()

  const editor = page.getByRole('textbox', { name: '编写 Python' })
  await expect(editor).toHaveValue(practice.starterCode)
  const snippets = practice.snippets.filter(snippet => snippet.label.zh !== '起点入队，先查上方')
  for (const snippet of snippets) await page.getByRole('button', { name: snippet.label.zh, exact: true }).click()
  const personal = [practice.starterCode, ...snippets.map(snippet => snippet.code)].join('\n')
  expect(personal).not.toBe(practice.solutionCode)
  await expect(editor).toHaveValue(personal + '\n')
  const run = page.getByRole('button', { name: '运行', exact: true })
  await run.click()
  await expect(page.getByText('6/6 个用例通过', { exact: true })).toBeVisible()

  const inputs = page.getByRole('group', { name: '选择要观察的输入' })
  const replay = page.getByTestId('route-case-board')
  await inputs.getByRole('button', { name: '用例 3', exact: true }).click()
  await expect(page.getByTestId('function-return')).toContainText(/right.*up/)
  await expect(replay.locator('.tilemap')).toHaveAccessibleName('机器人位于 1，1')
  const next = replay.getByRole('button', { name: '下一步', exact: true })
  await next.click()
  await expect(replay.locator('.tilemap')).toHaveAccessibleName('机器人位于 2，1')
  await next.click()
  await expect(replay.locator('.tilemap')).toHaveAccessibleName('机器人位于 2，0')
  await expect(next).toBeDisabled()
  await inputs.getByRole('button', { name: '用例 4', exact: true }).click()
  await expect(replay).toContainText('终点不可达')
  await expect(page.getByTestId('function-return')).toHaveText('[]')

  await page.getByRole('button', { name: '保存到我的算法', exact: true }).click()
  await expect(page.getByRole('button', { name: '已保存到我的算法', exact: true })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: '我的算法', exact: true }).click()
  await page.locator('.algorithm-entry summary').filter({ hasText: practice.functionName }).click()
  await expect(page.locator('.algorithm-entry pre')).toHaveText(personal)

  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  const free = page.getByRole('region', { name: '自由选关', exact: true })
  await free.locator(`[data-challenge-level="${dispatch.id}"]`).click()
  for (const id of ['import-mine', 'read', 'plan', 'each']) await page.locator(`[data-add-card="${id}"]`).click()
  await page.getByRole('button', { name: '向代码块添加指令', exact: true }).click()
  await page.locator('[data-add-card="follow"]').click()
  await page.getByRole('button', { name: '回到主程序', exact: true }).click()
  await page.locator('[data-add-card="open"]').click()
  await expect(page.getByTestId('generated-code')).toContainText('from my_algorithms import plan_route')
  await run.click()
  const summary = page.getByRole('region', { name: '通关总结' })
  await expect(summary.locator('[data-score-metric="cases"] td').first()).toHaveText('3 / 3')
  const scenarios = [dispatch, ...dispatch.variants!.map(variant => ({ ...dispatch, ...variant }))]
  for (const [index, scenario] of scenarios.entries()) {
    await page.getByTestId('map-scenario-' + index).click()
    const exit = scenario.objectives.find(objective => objective.type === 'exit')!
    await expect(page.locator('.tilemap')).toHaveAccessibleName(`机器人位于 ${exit.x}，${exit.y}`)
    await expect(page.getByTestId('grid-turn-budget')).toContainText(`${scenario.turnLimit} / ${scenario.turnLimit}`)
  }
})
