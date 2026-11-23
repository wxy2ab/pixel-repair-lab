import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import type { CardInstance, GridLevel, Level, Locale } from '../src/shared/types'

const levelsDirectory = new URL('../levels/', import.meta.url)
const levels = readdirSync(levelsDirectory)
  .filter(name => /^(?:\d{2}|4\d{2})-.*\.json$/.test(name))
  .sort()
  .map(name => JSON.parse(readFileSync(new URL(name, levelsDirectory), 'utf8')) as Level)
const gridLevels = levels.filter((level): level is GridLevel => level.kind === 'grid')
const ai = levels.find(level => level.kind === 'ai')!
const firstLevel = gridLevels[0]

async function openMission(page: Page, level: Level, locale: Locale) {
  await page.goto('/')
  if (locale === 'en') await page.getByRole('button', { name: 'EN', exact: true }).click()
  await selectMission(page, level, locale)
}

async function selectMission(page: Page, level: Level, locale: Locale) {
  await page.locator(`[data-unit="${level.unit?.id ?? 'other'}"]`).click()
  await page.locator('.mission-list').getByRole('button').filter({ hasText: level.title[locale] }).click()
  await expect(page.getByRole('heading', { name: level.title[locale], level: 1 })).toBeVisible()
}

async function addCards(page: Page, list: Locator, cards: CardInstance[], insertInto?: Locator) {
  for (const [index, card] of cards.entries()) {
    if (insertInto) {
      if (await insertInto.getAttribute('aria-pressed') !== 'true') await insertInto.click()
    } else {
      const parentProgram = page.getByRole('button', { name: /回到主程序|Back to main program/ })
      if (await parentProgram.isVisible()) await parentProgram.click()
    }
    await page.locator(`[data-add-card="${card.cardId}"]`).click()
    const instruction = list.locator(':scope > li').nth(index)
    await expect(instruction).toHaveAttribute('data-card', card.cardId)
    for (const [name, option] of Object.entries(card.values ?? {})) {
      await instruction.locator(`:scope > .instruction-main [data-parameter="${name}"]`).selectOption(option)
    }
    if (card.children?.length) {
      await addCards(
        page,
        instruction.locator(':scope > .instruction-body > .instruction-list'),
        card.children,
        instruction.locator(':scope > .instruction-body > .insertion-button'),
      )
    }
  }
}

async function playByMouse(page: Page, level: GridLevel) {
  await addCards(page, page.locator('.program-section > .instruction-list'), level.solutionCards)
  const code = page.getByTestId('generated-code')
  await expect(code).not.toContainText('# 还没有指令')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const totalCases = 1 + (level.variants?.length ?? 0)
  await expect(page.locator('.win-message')).toHaveText('任务完成！' + (totalCases > 1 ? ` ${totalCases}/${totalCases}` : ''), { timeout: 10000 })
}

for (const level of gridLevels) {
  test(`mouse cards complete mission ${level.order} ${level.id}`, async ({ page }) => {
    await openMission(page, level, 'zh')
    if (level.tutorial) {
      for (const [index, guide] of level.tutorial.entries()) {
        await expect(page.locator('.guide-panel')).toContainText(guide.text.zh)
        const last = index === level.tutorial.length - 1
        await page.getByRole('button', { name: last ? '完成引导' : '下一步', exact: true }).click()
      }
      await expect(page.getByText('任务提示', { exact: true })).toBeVisible()
    }
    await playByMouse(page, level)
    await expect(page.getByRole('progressbar', { name: '已完成任务' })).toHaveAttribute('aria-valuenow', '1')
  })
}

const aiAction = {
  zh: { example: '填入示例', send: '发送给 AI', correction: '填入修正示例', resend: '发送修正', confirm: '确认清单', done: '任务完成', online: '在线 AI' },
  en: { example: 'Use an example', send: 'Send to AI', correction: 'Use an example correction', resend: 'Send correction', confirm: 'Confirm list', done: 'Assignment complete', online: 'Online AI' },
}

for (const locale of ['zh', 'en'] as const) {
  test(`AI simulator supports mistake, correction and confirmation in ${locale}`, async ({ page }) => {
    await openMission(page, ai, locale)
    const action = aiAction[locale]
    const button = (name: string) => page.getByRole('button', { name, exact: true })
    const prompt = page.getByRole('textbox')
    const mismatches = page.locator('.ai-result .ai-table .ai-mismatch')
    await expect(button(action.online)).toBeDisabled()
    await button(action.example).click()
    await expect(prompt).toHaveValue(ai.examplePrompts[locale][0])
    await button(action.send).click()
    await expect(mismatches.first()).toBeVisible()
    await expect(button(action.confirm)).toHaveCount(0)
    await button(action.correction).click()
    await expect(prompt).toHaveValue(ai.examplePrompts[locale][1])
    await button(action.resend).click()
    await button(action.confirm).click()
    await expect(page.locator('.ai-result')).toContainText(action.done)
    const progressName = locale === 'zh' ? '已完成任务' : 'Completed missions'
    await expect(page.getByRole('progressbar', { name: progressName })).toHaveAttribute('aria-valuenow', '1')
  })
}

test('online AI failure retains the prompt for a simulator retry', async ({ page }) => {
  await page.route('**/api/ai/status', route => route.fulfill({ json: { available: true } }))
  await page.route('**/api/ai/turn', route => route.fulfill({ status: 502, json: { error: 'network' } }))
  await openMission(page, ai, 'en')
  await page.getByRole('button', { name: 'Online AI', exact: true }).click()
  const prompt = page.getByRole('textbox')
  const initial = ai.examplePrompts.en[0]
  await prompt.fill(initial)
  await page.getByRole('button', { name: 'Send to AI', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your prompt is still here.')
  await expect(prompt).toHaveValue(initial)
  await page.getByRole('button', { name: 'Continue with the simulator', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Packing list 1' })).toBeVisible()
  await expect(page.locator('.ai-result')).toContainText('Practice simulator')
})

test('JSON preview explains invalid files and plays a valid level', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '关卡预览', exact: true }).click()
  const input = page.getByLabel('关卡 JSON 文件')
  await input.setInputFiles({ name: '损坏.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByText('这个文件不是有效的 JSON。')).toBeVisible()
  const sample = { ...firstLevel, title: { zh: '试玩示例', en: 'Preview example' } }
  await input.setInputFiles({ name: '试玩示例.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sample)) })
  await expect(page.getByText('配置校验通过')).toBeVisible()
  await expect(page.getByRole('heading', { name: sample.title.zh, exact: true })).toBeVisible()
  await page.getByRole('button', { name: '一键试玩', exact: true }).click()
  await playByMouse(page, sample)
  await expect(page.getByText('试玩成功', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await selectMission(page, firstLevel, 'zh')
  await expect(page.locator('.mission-list [aria-current="step"] .mission-check')).toHaveCount(0)
  await expect(page.getByRole('progressbar', { name: '已完成任务' })).toHaveAttribute('aria-valuenow', '0')
})

test('handwritten syntax errors show a line and follow the language switch', async ({ page }) => {
  await openMission(page, firstLevel, 'zh')
  await page.getByRole('tab', { name: 'Python' }).click()
  const code = 'move("right"'
  const draft = page.getByLabel('编写 Python')
  await draft.fill(code)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const message = page.locator('.error-message')
  await expect(message).toHaveText(/第 1 行.*检查括号/)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(message).toHaveText(/Line 1.*Check brackets/)
  await expect(page.getByLabel('Write Python')).toHaveValue(code)
})
