import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { gradeCandidate, runPracticeTurn } from '../src/ai/core'
import { runMachine } from '../src/engine/machine'
import type { AlgorithmLevel } from '../src/shared/advanced'
import type { DataLevel, DataParameters } from '../src/shared/dataCourse'
import type { MachineLevel } from '../src/shared/hardware'
import type { AiLevel, Candidate } from '../src/shared/types'

function loadLevel<T>(file: string): T {
  return JSON.parse(readFileSync(new URL('../levels/' + file, import.meta.url), 'utf8')) as T
}

async function openChallenge(page: Page, id: string) {
  await page.goto('/#challenge-zone')
  await page.locator(`[data-challenge-level="${id}"]`).click()
  return page.getByRole('region', { name: '通关总结', exact: true })
}

function metric(summary: Locator, id: string, column = 0) {
  return summary.locator(`[data-score-metric="${id}"]`).getByRole('cell').nth(column)
}

test('algorithm summary compares the number of checks across successful attempts', async ({ page }) => {
  const level = loadLevel<AlgorithmLevel>('1811-backup-power-loadout.json')
  const summary = await openChallenge(page, level.id)
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  const run = page.getByRole('button', { name: '运行', exact: true })
  await editor.fill('def backup_loadout(modules, capacity):\n    return [0, 0, []]')
  await run.click()
  await expect(page.getByRole('region', { name: '失败复盘', exact: true })).toBeVisible()
  await expect(summary).toHaveCount(0)
  await editor.fill(level.solutionCode)
  await run.click()
  await expect(metric(summary, 'cases')).toContainText(new RegExp(`${level.cases.length}\\s*/\\s*${level.cases.length}`, 'u'))
  await expect(metric(summary, 'checks')).toContainText('2')

  await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(editor).toHaveValue(level.solutionCode)
  await run.click()
  await expect(metric(summary, 'checks')).toContainText('1')
  await expect(metric(summary, 'checks', 1)).toContainText('2')
  await expect(metric(summary, 'checks', 2)).toContainText('1')
})

test('CPU summary counts executed instructions across the completed cases', async ({ page }) => {
  const level = loadLevel<MachineLevel>('1812-cpu-memory-relay.json')
  const summary = await openChallenge(page, level.id)
  if (!level.solutionCode) throw new Error('Missing CPU reference')
  const draft = level.solutionCode.trimEnd() + '\n# Unreachable after HALT\nLOAD 0'
  const expected = Math.max(...level.cases.map((_, index) => runMachine(level, draft, index).final.steps))
  const editor = page.getByRole('textbox', { name: '编写汇编', exact: true })
  const step = page.getByRole('button', { name: '单步执行', exact: true })
  await editor.fill(draft)
  for (let index = 0; index < expected; index++) await step.click()
  await page.getByRole('button', { name: '检验全部场景', exact: true }).click()
  await expect(metric(summary, 'instructions')).toContainText(String(expected))
  await expect(metric(summary, 'cases')).toContainText(new RegExp(`${level.cases.length}\\s*/\\s*${level.cases.length}`, 'u'))
  await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(editor).toHaveValue(draft)
  await expect(page.locator('[data-register="pc"]')).toHaveText('0')
})

async function setDataParams(page: Page, params: DataParameters) {
  for (const [key, value] of Object.entries(params)) {
    const control = page.getByTestId('data-controls').locator(`[data-parameter="${key}"]`)
    if (typeof value === 'boolean') await control.setChecked(value)
    else if (typeof value === 'number') await control.fill(String(value))
    else await control.selectOption(value)
  }
}

test('data summaries keep settings on replay but grade every step again', async ({ page }) => {
  const level = loadLevel<DataLevel>('1813-temperature-incident-log.json')
  const summary = await openChallenge(page, level.id)
  const run = page.getByRole('button', { name: '运行实验', exact: true })
  const next = page.getByRole('button', { name: '下一步', exact: true })
  const dataReview = page.getByRole('region', { name: '失败复盘', exact: true })
  await run.click()
  await expect(dataReview).toBeVisible()
  await expect(summary).toHaveCount(0)
  for (const [index, step] of level.steps.entries()) {
    if (index) await next.click()
    if (!step.solution) throw new Error('Missing data reference')
    await setDataParams(page, step.solution)
    await run.click()
  }
  await expect(metric(summary, 'checks')).toContainText(String(level.steps.length + 1))

  await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(page.getByTestId('data-controls').locator('[data-parameter="trim"]')).toBeChecked()
  await expect(page.locator('[data-step="1"]')).toBeDisabled()
  for (const [index] of level.steps.entries()) {
    if (index) await next.click()
    await run.click()
  }
  await expect(metric(summary, 'checks')).toContainText(String(level.steps.length))
  await expect(metric(summary, 'checks', 1)).toContainText(String(level.steps.length + 1))
  await expect(metric(summary, 'checks', 2)).toContainText(String(level.steps.length))
})

test('AI summary records real simulator rounds and starts a fresh audit', async ({ page }) => {
  const level = loadLevel<AiLevel>('1814-late-dispatch-amendment.json')
  const summary = await openChallenge(page, level.id)
  const prompt = page.getByRole('textbox', { name: '给 AI 写提示词', exact: true })
  const audit = page.getByRole('button', { name: '提交核对', exact: true })
  let previous: Candidate | undefined
  for (const [index, instruction] of level.examplePrompts.zh.entries()) {
    await prompt.fill(instruction)
    await page.getByRole('button', { name: index ? '发送修正' : '发送给 AI', exact: true }).click()
    await expect(audit).toBeVisible()
    const run = runPracticeTurn(level, instruction, previous, index)
    for (const { id, actual, expected } of gradeCandidate(level, run.candidate)) {
      if (actual !== expected) await page.locator(`[data-ai-audit="${id}"]`).check()
    }
    await audit.click()
    previous = run.candidate
  }

  await page.getByRole('button', { name: '确认清单', exact: true }).click()
  await expect(metric(summary, 'rounds')).toContainText(String(level.examplePrompts.zh.length))
  await summary.getByRole('button', { name: '再玩一次', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(prompt).toHaveValue('')
  await expect(prompt).toBeFocused()
  await expect(page.getByTestId('ai-feedback')).toHaveCount(0)
})
