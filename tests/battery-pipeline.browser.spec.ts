import { expect, test, type Locator } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

const button = (panel: Locator, name: string) => panel.getByRole('button', { name, exact: true })
const charges = (row: Locator) => row.locator('[data-charge]').evaluateAll(items => items.map(item => Number(item.getAttribute('data-charge'))))

test('the optional battery work order reuses saved functions and checks sorting, pairing, and the sorted range', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  const level = levels.find(item => item.id === 'ranked-shipment')
  const sort = levels.find(item => item.id === 'sort-ascending')
  const pair = levels.find(item => item.id === 'sorted-has-pair')
  const prefix = levels.find(item => item.id === 'prefix-totals')
  if (level?.kind !== 'algorithm' || !level.batteryPipeline || sort?.kind !== 'algorithm'
    || pair?.kind !== 'algorithm' || prefix?.kind !== 'algorithm') throw new Error('Missing the battery work order or its helpers')

  await page.addInitScript(sources => {
    localStorage.setItem('pixel-repair-lab:algorithms', JSON.stringify(sources))
  }, {
    sort_ascending: '# my sorting function\n' + sort.solutionCode,
    sorted_has_pair: '# my pair checker\n' + pair.solutionCode,
  })

  await page.goto('/#track-algorithms')
  const unit = page.locator('[data-unit="algorithm-intro"]')
  await unit.click()
  const mission = page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
  const nav = page.locator('.algorithm-route-nav')
  await mission.click()
  await expect(mission).toContainText('选做')
  await button(nav, '跳过选做挑战').click()
  await expect(nav).toContainText('阶段 3/4')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pixel-repair-lab:completed') ?? '[]'))).toEqual([])
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await unit.click()
  await mission.click()

  await page.getByRole('button', { name: '去写函数 · ' + prefix.title.zh, exact: true }).click()
  await expect(page.getByRole('heading', { name: prefix.title.zh, exact: true, level: 1 })).toBeVisible()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill('# my prefix function\n' + prefix.solutionCode)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '保存到我的算法', exact: true }).click()
  await mission.click()
  const coreProgress = await nav.locator('small').textContent()
  for (const name of [sort.functionName, pair.functionName, prefix.functionName]) {
    await expect(page.getByRole('button', { name: '用我的函数 · ' + name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }

  const trial = page.getByTestId('battery-pipeline-trial')
  const step = trial.getByTestId('battery-pipeline-step')
  const row = trial.getByTestId('battery-pipeline-row')
  const code = trial.getByTestId('battery-pipeline-code')
  const personalModule = trial.getByTestId('battery-pipeline-module').and(trial.locator('[data-module="my_algorithms"]'))
  const prediction = page.getByTestId('battery-pipeline-prediction')
  const next = button(trial, '下一步')
  expect(await charges(row)).toEqual([9, 2, 7, 4, 6])
  await expect(code).toHaveCount(0)
  await expect(prediction).toHaveCount(0)
  await button(trial, '试跑小例子').click()
  await expect(step).toHaveAttribute('data-kind', 'start')
  await next.click()
  await expect(step).toHaveAttribute('data-kind', 'sort')
  await expect(code).toContainText('ordered = sort_ascending(values)')
  expect(await charges(row)).toEqual([2, 4, 6, 7, 9])
  await expect(personalModule).toBeVisible()

  const personalSteps = new Set<string>(['sort'])
  const directions = new Set<string>()
  for (let index = 0; index < 25 && await next.isEnabled(); index++) {
    await next.click()
    const kind = await step.getAttribute('data-kind')
    if (kind && await personalModule.isVisible()) personalSteps.add(kind)
    if (kind === 'move') {
      const line = await code.textContent()
      if (line?.includes('left += 1')) directions.add('left')
      if (line?.includes('right -= 1')) directions.add('right')
    }
  }
  expect([...personalSteps]).toEqual(['sort', 'pairCheck', 'prefix'])
  expect([...directions]).toEqual(['right', 'left'])
  await expect(step).toHaveAttribute('data-kind', 'return')
  await expect(trial.getByTestId('battery-pipeline-pair')).toContainText('4 + 6')
  await expect(trial.getByTestId('battery-pipeline-total')).toContainText('17')
  await expect(prediction).toBeVisible()
  await button(trial, '上一步').click()
  await expect(step).toHaveAttribute('data-kind', 'total')
  await expect(prediction).toBeVisible()
  await next.click()
  await expect(prediction).toBeVisible()

  const verify = button(prediction, '运行验证')
  await expect(verify).toBeDisabled()
  await prediction.locator('[data-order-option="1"]').click()
  await prediction.locator('[data-pair-option="1"]').click()
  await expect(verify).toBeDisabled()
  await prediction.locator('[data-total-option="16"]').click()
  await expect(prediction.getByTestId('battery-pipeline-actual-total')).toHaveCount(0)
  await verify.click()
  await expect(prediction).toHaveAttribute('data-match', 'false')
  await expect(prediction.locator('[data-prediction="order"]')).toHaveAttribute('data-match', 'true')
  await expect(prediction.locator('[data-prediction="pair"]')).toHaveAttribute('data-match', 'true')
  await expect(prediction.locator('[data-prediction="total"]')).toHaveAttribute('data-match', 'false')
  await expect(prediction.getByTestId('battery-pipeline-actual-total')).toContainText('19')
  await expect(mission.locator('.mission-check')).toHaveCount(0)
  await button(prediction, '再猜一次').click()
  await prediction.locator('[data-total-option="19"]').click()
  await verify.click()
  await expect(prediction).toHaveAttribute('data-match', 'true')
  await expect(mission.locator('.mission-check')).toBeVisible()
  await expect(nav.locator('small')).toHaveText(coreProgress!)
})
