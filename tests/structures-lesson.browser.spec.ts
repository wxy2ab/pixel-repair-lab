import { expect, test, type Locator } from '@playwright/test'
import { structureKinds, structureLabels } from '../src/shared/programWalkthrough'
import type { Catalog } from '../src/shared/types'

const button = (panel: Locator, name: string) => panel.getByRole('button', { name, exact: true })

test('four battery operations show real reads and removals, and each new request checks the chosen structure and battery', async ({ page, request }) => {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  const lesson = levels.find(level => level.id === 'structures-notes')
  if (lesson?.kind !== 'lecture' || !lesson.execution?.structures) throw new Error('Missing the structures opener')
  const { demo, practice: tasks, sources } = lesson.execution.structures

  await page.goto('/')
  await page.getByRole('button', { name: '开始数据结构与算法课程', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: lesson.title.zh, exact: true })).toBeVisible()
  const completed = page.locator('.mission-list [aria-current="step"] .mission-check')
  const guide = page.getByTestId('structures-lesson')
  const batteries = guide.getByTestId('structures-batteries')
  const code = guide.getByTestId('structures-code')
  const selected = guide.getByTestId('structures-selected')
  const output = guide.getByTestId('structures-output')
  const practice = page.getByTestId('structures-prediction')
  const names = batteries.locator('[data-battery-name]')
  const actual = practice.getByTestId('structures-actual-battery')

  async function onBoard() {
    return names.evaluateAll(items => items.map(item => item.getAttribute('data-battery-name')))
  }

  await batteries.locator('[data-battery-name="A"] button').click()
  await expect(guide.getByRole('status')).toContainText('再试一次')
  await expect(guide).toHaveAttribute('data-structure-stage', 'start')
  await expect(guide.getByTestId('structures-kind-name')).toHaveCount(0)

  const demoNames = demo.batteries.map(battery => battery.name)
  const expectedDemo = { list: 'C', stack: 'D', queue: 'A', dictionary: 'B' }
  for (const kind of structureKinds) {
    const picked = expectedDemo[kind]
    const removes = kind === 'stack' || kind === 'queue'
    const initial = kind === 'stack' ? [...demoNames].reverse() : demoNames
    const leftover = removes ? initial.filter(name => name !== picked) : initial
    await expect(guide).toHaveAttribute('data-structure-kind', kind)
    await expect(guide).toHaveAttribute('data-structure-stage', 'start')
    await expect(code).toHaveCount(0)
    await expect(practice).toHaveCount(0)
    expect(await onBoard()).toEqual(initial)
    await batteries.locator(`[data-battery-name="${picked}"] button`).click()
    await expect(guide).toHaveAttribute('data-interaction', 'picked')
    await expect(guide.getByTestId('structures-kind-name')).toHaveText(structureLabels[kind].zh)
    await expect(selected).toHaveText(picked)
    await expect(code).toHaveCount(0)
    expect(await onBoard()).toEqual(leftover)

    const source = (kind === 'list' ? lesson.execution.source : sources[kind]).split('\n')
    const stages = source.length === 4 ? ['load', 'target', 'select', 'output'] : ['load', 'select', 'output']
    for (const [index, stage] of stages.entries()) {
      await button(guide, '下一步').click()
      await expect(guide).toHaveAttribute('data-structure-stage', stage)
      await expect(code.locator('code')).toHaveCount(index + 1)
      await expect(code.locator(`[data-line="${index + 1}"][aria-current="step"] code`)).toHaveText(source[index])
      expect(await onBoard()).toEqual(stage === 'load' || stage === 'target' ? initial : leftover)
    }
    await expect(output).toHaveText(picked)
    if (kind !== 'dictionary') await button(guide, '试下一种取法').click()
  }

  const verify = button(practice, '运行验证')
  await expect(practice.getByText(tasks.tasks[0].prompt.zh, { exact: true })).toBeVisible()
  await expect(verify).toBeDisabled()
  await practice.locator('[data-structure-option="stack"]').click()
  await expect(verify).toBeDisabled()
  await practice.locator('[data-battery-option="S"]').click()
  await expect(actual).toHaveCount(0)
  await verify.click()
  await expect(actual).toHaveText('S')
  await expect(practice).toHaveAttribute('data-match', 'false')
  await expect(practice.locator('.task-progress')).toHaveCount(0)
  await expect(practice.locator('[data-structure-task="0"]')).not.toHaveAttribute('data-passed', 'true')
  await button(practice, '再猜一次').click()
  await expect(actual).toHaveCount(0)
  await expect(verify).toBeDisabled()
  await practice.locator('[data-structure-option="queue"]').click()
  await practice.locator('[data-battery-option="R"]').click()
  await verify.click()
  await expect(actual).toHaveText('P')
  await expect(practice).toHaveAttribute('data-match', 'false')
  await button(practice, '再猜一次').click()

  const expectedPractice = { list: 'Q', stack: 'S', queue: 'P', dictionary: 'R' }
  for (const [index, task] of tasks.tasks.entries()) {
    await expect(practice.getByText(task.prompt.zh, { exact: true })).toBeVisible()
    await expect(verify).toBeDisabled()
    await practice.locator(`[data-structure-option="${task.kind}"]`).click()
    await practice.locator(`[data-battery-option="${expectedPractice[task.kind]}"]`).click()
    await verify.click()
    await expect(actual).toHaveText(expectedPractice[task.kind])
    await expect(practice).toHaveAttribute('data-match', 'true')
    await expect(practice.locator('.task-progress')).toHaveText(`已完成取件单 ${index + 1}/${tasks.tasks.length}`)
    await expect(practice.locator(`[data-structure-task="${index}"]`)).toHaveAttribute('data-passed', 'true')
    if (index < tasks.tasks.length - 1) {
      await expect(completed).toHaveCount(0)
      await button(practice, '下一张取件单').click()
    }
  }
  await expect(completed).toBeVisible()
  await expect(page.locator('.algorithm-route-nav')).toContainText('主线进度 1/')
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await page.getByRole('button', { name: '继续数据结构与算法课程', exact: true }).click()
  const next = levels.find(level => level.id === 'list-positions')!
  await expect(page.getByRole('heading', { level: 1, name: next.title.zh, exact: true })).toBeVisible()
})
