import { expect, test, type Locator } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

const button = (panel: Locator, name: string) => panel.getByRole('button', { name, exact: true })

test('the optional capstone reuses a saved helper, traces an early return, and verifies a new rack', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  const capstone = levels.find(level => level.id === 'python-advanced-repair-report')
  const helper = levels.find(level => level.id === 'charge-total')
  if (capstone?.kind !== 'algorithm' || !capstone.chargingChallenge || helper?.kind !== 'algorithm') throw new Error('Missing the charging levels')
  const mission = page.locator('.mission-list').getByRole('button')
    .filter({ has: page.getByText(capstone.title.zh, { exact: true }) })
  const heading = page.getByRole('heading', { level: 1, name: capstone.title.zh, exact: true })
  const guide = page.getByTestId('charging-challenge')
  const code = guide.getByTestId('charging-source')

  async function openChallenge() {
    await page.locator('[data-unit="python-advanced"]').click()
    await mission.click()
    await expect(heading).toBeVisible()
  }

  await page.goto('/')
  await openChallenge()
  await expect(mission).toContainText('选做')
  const progress = await page.locator('.python-route-nav small').textContent()
  await page.getByRole('button', { name: '跳过选做挑战', exact: true }).click()
  await expect(page.locator('[data-unit="python-advanced"]')).toBeVisible()
  await openChallenge()
  await expect(page.locator('.python-route-nav small')).toHaveText(progress!)
  await expect(mission.locator('.mission-check')).toHaveCount(0)
  await expect(code).toHaveValue(/^from algorithms import charge_total/u)

  await button(guide, '去写补电函数').click()
  await expect(page.getByRole('heading', { level: 1, name: helper.title.zh, exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(
    'def charge_total(current, added):\n    total_charge = current + added\n    return total_charge',
  )
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByText(`${helper.cases.length}/${helper.cases.length} 个用例通过`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '保存到我的算法', exact: true }).click()
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await openChallenge()

  const personal = button(guide, '用我的函数 · charge_total')
  await expect(personal).toHaveAttribute('aria-pressed', 'true')
  await expect(code).toHaveValue(/^from my_algorithms import charge_total/u)
  await button(guide, '用课程函数 · charge_total').click()
  await expect(code).toHaveValue(/^from algorithms import charge_total/u)
  await personal.click()
  await expect(code).toHaveValue(/^from my_algorithms import charge_total/u)

  const completed = mission.locator('.mission-check')
  const trial = button(guide, '试跑小例子')
  const trace = guide.getByTestId('charging-trace')
  const actual = guide.getByTestId('charging-trial-actual')
  const rack = guide.getByTestId('charging-starting-rows')
  const practice = page.getByTestId('charging-challenge-prediction')
  await expect(rack.locator('[data-row-index]')).toHaveCount(2)
  await expect(actual).toHaveCount(0)
  await expect(practice).toHaveCount(0)
  await trial.click()
  await expect(guide).toHaveAttribute('data-trial-pass', 'false')
  await expect(guide.getByTestId('charging-trial-expected')).toHaveText('[[4,7],[5]]')
  await expect(actual).toHaveText('[[4,7]]')
  const next = button(guide, '下一步')
  const moveReturn = button(guide, '移到循环外')
  await expect(moveReturn).toHaveCount(0)

  let usedPersonal = false
  let selectedRow = false
  let selectedBattery = false
  for (let index = 0; index < 40; index++) {
    const line = await trace.locator('[aria-current="step"] code').textContent()
    const kind = await trace.getAttribute('data-kind')
    const file = await trace.getAttribute('data-file')
    if (kind === 'return' && file === 'helper' && line?.trim() === 'return total_charge') usedPersonal = true
    if (kind === 'iterate' && line?.trim() === 'for row in rows:') selectedRow = true
    if (kind === 'iterate' && line?.trim() === 'for charge in row:') selectedBattery = true
    if (await moveReturn.isVisible()) break
    await next.click()
  }
  expect({ usedPersonal, selectedRow, selectedBattery }).toEqual({ usedPersonal: true, selectedRow: true, selectedBattery: true })
  await expect(trace).toHaveAttribute('data-kind', 'return')
  await expect(trace).toHaveAttribute('data-file', 'main')
  await expect(rack.locator('[data-row-index="0"]')).toHaveAttribute('data-complete', 'true')
  await expect(rack.locator('[data-row-index="1"] [data-battery-index="0"]')).toHaveAttribute('data-charge', '2')
  await moveReturn.click()
  await expect(code).toHaveValue(/^from my_algorithms import charge_total[\s\S]*\n {4}return results\n?$/u)
  await expect(practice).toHaveCount(0)
  await trial.click()
  await expect(guide).toHaveAttribute('data-trial-pass', 'true')
  await expect(actual).toHaveText('[[4,7],[5]]')
  await expect(completed).toHaveCount(0)

  const verify = button(practice, '运行验证')
  const verified = practice.getByTestId('charging-prediction-actual')
  await expect(verify).toBeDisabled()
  await practice.locator('[data-charge-case="0"]').click()
  await expect(practice.getByTestId('charging-prediction-input').locator('[data-row-index="2"]')).toHaveAttribute('data-empty', 'true')
  await practice.locator('[data-rows-option="0"]').click()
  await expect(verified).toHaveCount(0)
  await verify.click()
  await expect(verified).toHaveText('[[3],[7,4],[],[5,8,6]]')
  await expect(practice).toHaveAttribute('data-match', 'false')
  await expect(completed).toHaveCount(0)
  await button(practice, '再猜一次').click()
  await expect(verified).toHaveCount(0)
  await expect(verify).toBeDisabled()
  await practice.locator('[data-rows-option="1"]').click()
  await verify.click()
  await expect(practice).toHaveAttribute('data-match', 'true')
  await expect(completed).toBeVisible()
  await expect(page.locator('.python-route-nav')).toContainText('主线进度 1/')
})
