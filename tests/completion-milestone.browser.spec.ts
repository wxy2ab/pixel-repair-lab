import { expect, test, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

async function startWithProgress(page: Page, completed: string[]) {
  await page.addInitScript(ids => {
    if (!localStorage.getItem('pixel-repair-lab:completed')) localStorage.setItem('pixel-repair-lab:completed', JSON.stringify(ids))
    localStorage.setItem('pixel-repair-lab:board-view', '2d')
    localStorage.setItem('pixel-repair-lab:locale', 'zh')
  }, completed)
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

test('finishing a missing topic lesson celebrates once and stays quiet on later visits', async ({ page, request }) => {
  const catalog: Catalog = await (await request.get('/api/levels')).json()
  const target = catalog.levels.find(candidate => candidate.id === 'first-steps')!
  const topic = catalog.levels.filter(candidate => candidate.unit?.id === target.unit?.id && candidate.topic?.id === target.topic?.id)
  await startWithProgress(page, topic.filter(candidate => candidate !== target).map(candidate => candidate.id))
  const open = async () => {
    await page.goto('/')
    await page.locator('[data-unit="foundations"]').click()
    await page.locator('.mission-list button').filter({ has: page.getByText(target.title.zh, { exact: true }) }).click()
  }
  await open()
  const notice = page.getByTestId('completion-feedback')
  await expect(notice).toHaveCount(0)
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await editor.fill('move("right")')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.locator('.output-body .error-message')).toBeVisible()
  await expect(notice).toHaveCount(0)
  await editor.fill('for step in range(4):\n    move("right")')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(notice).toHaveAttribute('data-scope', 'topic', { timeout: 15000 })
  await expect(notice).toContainText(target.topic!.title.zh)
  await expect(notice).toContainText(topic.length + ' / ' + topic.length)
  await page.getByRole('button', { name: '关闭完成反馈' }).click()
  await expect(notice).toHaveCount(0)
  await open()
  await expect(page.getByTestId('lesson-next')).toBeVisible()
  await expect(notice).toHaveCount(0)
})

test('finishing a missing ferry challenge celebrates the series once and still scores a replay', async ({ page }) => {
  await startWithProgress(page, ['challenge-ferry-early-pulse', 'challenge-ferry-robot-race'])
  await page.goto('/#challenge-browse')
  await page.getByRole('navigation', { name: '渡口短挑战' }).getByRole('button', { name: '渡口一 · 赶船' }).click()
  const notice = page.getByTestId('completion-feedback')
  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  const run = async () => {
    const toolbar = page.getByTestId('play-toolbar')
    await toolbar.getByRole('button', { name: '运行', exact: true }).click()
    await toolbar.getByRole('button', { name: '查看结果', exact: true }).click()
  }
  await expect(notice).toHaveCount(0)
  for (const command of ['right', 'wait', 'up', 'right', 'right', 'down', 'right']) {
    await page.locator('[data-add-card="' + command + '"]').click()
  }
  await run()
  await expect(notice).toHaveAttribute('data-scope', 'series')
  await expect(notice).toContainText('3 / 3')
  await expect(summary).toBeVisible()
  await summary.getByRole('button', { name: '再玩一次' }).click()
  await expect(notice).toHaveCount(0)
  await run()
  await expect(summary.locator('[data-score-metric="turns"] td').nth(1)).toHaveText('7')
  await expect(notice).toHaveCount(0)
})
