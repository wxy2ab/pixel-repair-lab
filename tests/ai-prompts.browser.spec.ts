import { expect, test, type Page } from '@playwright/test'
import type { Locale } from '../src/shared/types'

async function openPromptLesson(page: Page, title: string, locale: Locale) {
  await page.goto('/#track-ai')
  if (locale === 'en') await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.locator('[data-unit="ai"]').click()
  const mission = page.locator('.mission-list').getByRole('button').filter({ hasText: title })
  await mission.click()
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  return mission
}

test('prompt cards reveal why an unmentioned item survives a draft and let learners remove it', async ({ page }) => {
  const mission = await openPromptLesson(page, '试一试，没提到的物品还在吗？', 'zh')
  const workspace = page.locator('.ai-lesson')
  const prompt = workspace.getByRole('textbox')
  const card = (label: string) => workspace.getByRole('group', { name: '拼提示词' }).getByRole('button', { name: label, exact: true })
  const button = (name: string) => workspace.getByRole('button', { name, exact: true })
  const result = workspace.locator('.ai-result > .ai-table')
  const counts = (name: string) => result.getByRole('row', { name: new RegExp(`^${name}`) }).getByRole('cell')

  await expect(workspace.getByTestId('ai-draft').getByText('剪刀 ×1')).toBeVisible()
  await expect(button('发送给 AI')).toBeDisabled()
  await card('标签：1张。').click()
  await expect(prompt).toHaveValue('标签：1张。')
  await button('发送给 AI').click()
  await expect(counts('夹子').nth(1)).toHaveText('2')
  await expect(counts('标签').nth(1)).toHaveText('1')
  await expect(counts('剪刀').nth(1)).toHaveText('1')
  await expect(counts('剪刀').nth(2)).toContainText('待修改')
  await expect(button('确认清单')).toHaveCount(0)
  await expect(mission.locator('.mission-check')).toHaveCount(0)

  await card('去掉剪刀。').click()
  await expect(prompt).toHaveValue('标签：1张。\n去掉剪刀。')
  await button('发送修正').click()
  await expect(counts('剪刀').nth(1)).toHaveText('0')
  await expect(counts('剪刀').nth(2)).toContainText('正确')
  await button('确认清单').click()
  await expect(mission.locator('.mission-check')).toBeVisible()
})

test('students enforce several constraints and restore a dropped item using bilingual prompt cards', async ({ page }) => {
  const mission = await openPromptLesson(page, 'Revise the Toolkit Under Three Rules', 'en')
  const workspace = page.locator('.ai-lesson')
  const card = (label: string) => workspace.getByRole('group', { name: 'Build a prompt' }).getByRole('button', { name: label, exact: true })
  const button = (name: string) => workspace.getByRole('button', { name, exact: true })
  const result = workspace.locator('.ai-result > .ai-table')
  const counts = (name: string) => result.getByRole('row', { name: new RegExp(`^${name}`) }).getByRole('cell')

  await expect(workspace.getByTestId('ai-draft').getByText('Glue ×2')).toBeVisible()
  await card('Set batteries to 2 total.').click()
  await card('Remove all glue.').click()
  await button('Send to AI').click()
  await expect(counts('Wrench').nth(1)).toHaveText('1')
  await expect(counts('Battery').nth(1)).toHaveText('2')
  await expect(counts('Glue').nth(1)).toHaveText('0')
  await expect(counts('Label').nth(1)).toHaveText('0')
  await expect(counts('Label').nth(2)).toContainText('Needs a change')
  await expect(button('Confirm list')).toHaveCount(0)

  await card('Label: 1.').click()
  await button('Send correction').click()
  await expect(counts('Label').nth(1)).toHaveText('1')
  await expect(counts('Glue').nth(1)).toHaveText('0')
  await button('Confirm list').click()
  await expect(mission.locator('.mission-check')).toBeVisible()
})
