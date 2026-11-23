import { expect, test, type Locator } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

const button = (panel: Locator, name: string) => panel.getByRole('button', { name, exact: true })
const route = (panel: Locator, name: string) => panel.locator(`[data-branch-path="${name}"]`)
const part = (panel: Locator, name: string) => panel.locator(`[data-branch-part="${name}"]`)

test('the fork reveals the executed branch and action before asking for a new prediction', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  const lesson = levels.find(level => level.id === 'control-flow-notes')
  if (lesson?.kind !== 'lecture' || !lesson.execution?.branchLesson) throw new Error('Missing branch lesson')
  const { actions } = lesson.execution.branchLesson

  await page.goto('/')
  await page.locator('[data-unit="python-intermediate"]').click()
  const mission = page.locator('.mission-list').getByRole('button')
    .filter({ has: page.getByText(lesson.title.zh, { exact: true }) })
  await mission.click()
  await expect(page.getByRole('heading', { level: 1, name: lesson.title.zh, exact: true })).toBeVisible()
  const completed = mission.locator('.mission-check')
  const guide = page.getByTestId('branch-lesson')
  const code = guide.getByTestId('branch-code')
  const practice = page.getByTestId('branch-prediction')
  const next = button(guide, '下一步')
  const previous = button(guide, '上一步')

  await expect(guide).toHaveAttribute('data-branch-stage', 'start')
  await expect(route(guide, 'if')).toBeVisible()
  await expect(route(guide, 'else')).toBeVisible()
  await expect(guide.locator('[data-selected="true"]')).toHaveCount(0)
  await expect(code.locator('code')).toHaveCount(0)
  await expect(previous).toBeDisabled()
  await expect(practice).toHaveCount(0)

  for (const path of ['if', 'else'] as const) {
    const open = path === 'if'
    const other = open ? 'else' : 'if'
    await next.click()
    await expect(guide).toHaveAttribute('data-branch-stage', 'charge')
    await expect(guide).toHaveAttribute('data-door-open', String(open))
    await expect(part(guide, 'charge')).toHaveAttribute('data-value', 'true')
    await expect(code).toContainText('result >= 4')
    await expect(code).not.toContainText('door_open()')

    await next.click()
    await expect(guide).toHaveAttribute('data-branch-stage', 'door')
    await expect(part(guide, 'door')).toHaveAttribute('data-value', String(open))
    await expect(code).toContainText('door_open()')
    await expect(code).not.toContainText('enough and door')

    await next.click()
    await expect(guide).toHaveAttribute('data-branch-stage', 'condition')
    await expect(part(guide, 'condition')).toHaveAttribute('data-value', String(open))
    await expect(code).toContainText('enough and door')
    await expect(guide.locator('[data-selected="true"]')).toHaveCount(0)

    await next.click()
    await expect(guide).toHaveAttribute('data-branch-stage', 'choice')
    await expect(route(guide, path)).toHaveAttribute('data-selected', 'true')
    await expect(route(guide, other)).not.toHaveAttribute('data-selected', 'true')
    await expect(code).toContainText('if can_leave:')
    if (open) await expect(code).not.toContainText('else:')
    else await expect(code).toContainText('else:')
    await expect(code).not.toContainText('say(')

    if (!open) {
      await previous.click()
      await expect(guide.locator('[data-selected="true"]')).toHaveCount(0)
      await next.click()
    }
    await next.click()
    await expect(guide).toHaveAttribute('data-branch-stage', 'action')
    await expect(route(guide, path)).toHaveAttribute('data-selected', 'true')
    await expect(guide.locator('[data-branch-action]')).toBeVisible()
    await expect(route(guide, path)).toContainText(actions[path].zh)
    await expect(code).toContainText(open ? 'say("leave")' : 'say("wait")')
    await expect(code).not.toContainText(open ? 'say("wait")' : 'say("leave")')
    if (open) await expect(practice).toHaveCount(0)
  }

  await expect(practice).toBeVisible()
  await expect(completed).toHaveCount(0)
  const verify = button(practice, '运行验证')
  const prediction = practice.getByTestId('branch-prediction-result')
  const guessIf = practice.locator('[data-prediction="if"]')
  await expect(verify).toBeDisabled()
  await practice.locator('[data-branch-case="0"]').click()
  await expect(verify).toBeDisabled()
  await guessIf.click()
  await expect(prediction).toHaveCount(0)
  await verify.click()
  await expect(prediction).toHaveText('else')
  await expect(practice).toContainText(actions.else.zh)
  await expect(practice).toHaveAttribute('data-match', 'false')
  await expect(completed).toHaveCount(0)
  await button(practice, '再猜一次').click()
  await expect(prediction).toHaveCount(0)
  await expect(verify).toBeDisabled()

  await practice.locator('[data-branch-case="2"]').click()
  await guessIf.click()
  await expect(prediction).toHaveCount(0)
  await expect(completed).toHaveCount(0)
  await verify.click()
  await expect(prediction).toHaveText('if')
  await expect(practice).toContainText(actions.if.zh)
  await expect(practice).toHaveAttribute('data-match', 'true')
  await expect(completed).toBeVisible()
})
