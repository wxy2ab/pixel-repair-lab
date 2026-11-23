import { expect, test, type Page } from '@playwright/test'

function challengeCard(page: Page, id: string) {
  return page.locator(`[data-challenge-level="${id}"]`)
}

async function resumeFromHome(page: Page, id: string) {
  await page.reload()
  const continuation = page.getByRole('region', { name: '继续闯关', exact: true })
  await continuation.locator(`[data-continue-challenge="${id}"]`).click()
}

test('Python and CPU challenge drafts survive reloading and can start over independently', async ({ page }) => {
  const algorithmId = 'challenge-backup-power-loadout'
  const machineId = 'challenge-cpu-memory-relay'
  const startOver = page.getByRole('button', { name: '重新开始', exact: true })
  const arena = page.getByRole('button', { name: '挑战场', exact: true })

  await page.goto('/#challenge-zone')
  await challengeCard(page, algorithmId).click()
  const python = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const pythonStarter = await python.inputValue()
  const pythonDraft = 'def plan():\n    # 未写完\n'
  await python.fill(pythonDraft)
  await resumeFromHome(page, algorithmId)
  await expect(python).toHaveValue(pythonDraft)

  await arena.click()
  await challengeCard(page, machineId).click()
  const assembly = page.getByRole('textbox', { name: '编写汇编', exact: true })
  const machineStarter = await assembly.inputValue()
  await page.getByRole('button', { name: '添加 LOAD', exact: true }).click()
  const machineDraft = await assembly.inputValue()
  expect(machineDraft).toContain('LOAD 0')
  await resumeFromHome(page, machineId)
  await expect(assembly).toHaveValue(machineDraft)
  await startOver.click()
  await expect(assembly).toHaveValue(machineStarter)
  await resumeFromHome(page, machineId)
  await expect(assembly).toHaveValue(machineStarter)

  await arena.click()
  await challengeCard(page, algorithmId).click()
  await expect(python).toHaveValue(pythonDraft)
  await python.fill('')
  await resumeFromHome(page, algorithmId)
  await expect(python).toHaveValue('')
  await startOver.click()
  await expect(python).toHaveValue(pythonStarter)
})
