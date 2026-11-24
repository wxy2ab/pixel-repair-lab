import { expect, test, type Locator } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

const button = (section: Locator, name: string) => section.getByRole('button', { name, exact: true })
const step = (section: Locator, id: string) => section.locator(`[data-visual-block="${id}"]`)

test('sequence students sort pictures, see an early display fail at its real line, and run their repaired order', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  const level = levels.find(candidate => candidate.id === 'sequence-notes')
  const execution = level?.kind === 'lecture' ? level.execution : undefined
  if (!level || !execution?.sequence || !execution.visual) throw new Error('Missing the sequence lesson')

  const visuals = execution.visual.main
  const source = execution.source.split('\n')
  const instruction = (id: string) => {
    const graphic = visuals.find(card => card.id === id)
    if (!graphic) throw new Error(`Missing ${id} graphic`)
    return source[graphic.line - 1].trim()
  }

  await page.goto('/')
  await page.locator('[data-unit="foundations"]').click()
  const mission = page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
  await mission.click()
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh })).toBeVisible()

  const sequence = page.getByTestId('sequence-lesson')
  const cards = sequence.locator('[data-visual-block]')
  const code = sequence.getByTestId('sequence-code')
  const output = sequence.getByTestId('sequence-output')
  const feedback = sequence.getByTestId('sequence-feedback')
  const next = button(sequence, '下一步')
  const previous = button(sequence, '上一步')
  const moveReadEarlier = step(sequence, 'read').locator('[data-move="earlier"]')
  const completed = mission.locator('.mission-check')

  const expectOrder = async (ids: string[]) => {
    await expect.poll(() => cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-visual-block')))).toEqual(ids)
  }

  await expect(sequence).toHaveAttribute('data-phase', 'arrange')
  await expectOrder(execution.sequence.arrange)
  await expect(sequence.getByTestId('sequence-input')).toHaveText(String(execution.cases[0].input))
  await expect(code.locator('code')).toHaveCount(0)
  await expect(completed).toHaveCount(0)
  await button(sequence, '检查顺序').click()
  await expect(feedback).toBeVisible()
  await expect(button(sequence, '把显示提前').and(sequence.locator('button:enabled'))).toHaveCount(0)
  await expect(code.locator('code')).toHaveCount(0)

  await moveReadEarlier.click()
  await expectOrder(['read', 'charge', 'display'])
  await button(sequence, '检查顺序').click()
  await expect(code.locator('code')).toHaveCount(0)
  await expect(completed).toHaveCount(0)
  await button(sequence, '把显示提前').click()
  await expect(sequence).toHaveAttribute('data-phase', 'debug')
  await expectOrder(execution.sequence.broken)
  await expect(code.locator('code')).toHaveCount(0)
  await expect(output).toHaveText('还没有输出')

  await next.click()
  await expect(sequence).toHaveAttribute('data-step', '1')
  await expect(code.locator('code')).toHaveCount(1)
  await expect(code.locator('[data-line="1"][data-card-id="read"] code')).toHaveText(instruction('read'))
  await expect(sequence.locator('[data-binding="charge"]')).toContainText(String(execution.cases[0].input))
  await expect(sequence.locator('[data-binding="result"]')).toHaveCount(0)
  await expect(output).toHaveText('还没有输出')

  await next.click()
  await expect(sequence).toHaveAttribute('data-step', '2')
  await expect(sequence).toHaveAttribute('data-blocked', 'true')
  await expect(code.locator('code')).toHaveCount(2)
  await expect(code.locator('[data-line="2"][data-card-id="display"][data-blocked] code')).toHaveText(instruction('display'))
  await expect(step(sequence, 'display').locator('.program-tile-annotation')).toHaveText('缺少 result')
  await expect(step(sequence, 'charge').locator('.program-tile-annotation')).toHaveText('未执行')
  await expect(code.locator('[data-card-id="charge"]')).toHaveCount(0)
  await expect(sequence.locator('[data-binding="result"]')).toHaveCount(0)
  await expect(feedback).toContainText('第 2 步')
  await expect(feedback).not.toHaveAttribute('data-task-success', 'true')
  await expect(feedback).toContainText('屏幕要用 result，但补电还没算出这个值')
  await expect(feedback).toContainText('后面的「补电」还没执行')
  await expect(output).toHaveText('还没有输出')
  await expect(next).toBeDisabled()
  await expect(completed).toHaveCount(0)

  await previous.click()
  await expect(sequence).toHaveAttribute('data-step', '1')
  await expect(sequence).not.toHaveAttribute('data-blocked', 'true')
  await expect(step(sequence, 'display').locator('.program-tile-annotation')).toHaveText('↓ 下一步')
  await expect(code.locator('code')).toHaveCount(1)
  await next.click()

  await button(sequence, '修复打乱的步骤').click()
  await expect(sequence).toHaveAttribute('data-phase', 'repair')
  await expectOrder(execution.sequence.repair)
  await expect(sequence.getByTestId('sequence-input')).toHaveText(String(execution.cases[1].input))
  await expect(code.locator('code')).toHaveCount(0)
  await button(sequence, '运行验证').click()
  await expect(output).toHaveText('还没有输出')
  await expect(code.locator('code')).toHaveCount(1)
  await expect(code.locator('[data-line="1"][data-card-id="charge"][data-blocked] code')).toHaveText(instruction('charge'))
  await expect(completed).toHaveCount(0)

  await moveReadEarlier.click()
  await moveReadEarlier.click()
  await expectOrder(['read', 'charge', 'display'])
  await expect(code.locator('code')).toHaveCount(0)
  await button(sequence, '运行验证').click()
  await expect(output).toHaveText(execution.cases[1].expected)
  await expect(feedback).toHaveAttribute('data-task-success', 'true')
  await expect(code.locator('code')).toHaveText(['read', 'charge', 'display'].map(instruction))
  await expect(completed).toBeVisible()
})
