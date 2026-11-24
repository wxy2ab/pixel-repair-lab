import { expect, test, type Locator, type Page } from '@playwright/test'
import type { LectureLevel } from '../src/shared/advanced'
import type { Catalog } from '../src/shared/types'
import { finishProgramBasics } from './helpers/programGuide'

const button = (container: Page | Locator, name: string) => container.getByRole('button', { name, exact: true })

function lecture(catalog: Catalog, id: string): LectureLevel {
  const level = catalog.levels.find(candidate => candidate.id === id)
  if (level?.kind !== 'lecture') throw new Error('Missing introductory lesson ' + id)
  return level
}

async function answerAndContinue(page: Page, level: LectureLevel) {
  await button(page, level.question.options[level.question.correct].zh).click()
  await expect(page.locator('.mission-list [aria-current="step"] .mission-check')).toBeVisible()
  await button(page, '下一课').click()
}

type ReplayStep = { id: string; value: string; route?: string }

async function followReplay(program: Locator, quiz: Locator, steps: ReplayStep[]) {
  const replay = program.getByTestId('program-interface-replay')
  await expect(replay).toHaveCount(0)
  await expect(quiz).toHaveCount(0)
  await button(program, '回放这次运行').click()
  for (const { id, value, route } of steps) {
    await expect(replay).toHaveAttribute('data-replay-step', id)
    const active = replay.locator(`[data-step="${id}"][data-active]`)
    await expect(active).toBeVisible()
    await expect(active.locator('code')).toHaveText(value)
    if (route) await expect(active).toContainText(route)
    if (id !== steps.at(-1)?.id) {
      await expect(quiz).toHaveCount(0)
      await button(replay, '下一步').click()
    }
  }
  await expect(quiz).toBeVisible()
}

test('the Python introduction teaches input, predefined steps and output before the command-line lesson', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const basics = lecture(catalog, 'python-program-basics')
  const cli = lecture(catalog, 'python-program-interfaces')

  await page.goto('/')
  await button(page, '开始 Python 课程').click()
  await expect(page.getByRole('heading', { level: 1, name: basics.title.zh })).toBeVisible()
  const first = page.getByTestId('program-basics')
  const result = first.getByTestId('program-basic-result')
  const quiz = page.getByRole('heading', { name: '猜一猜', exact: true })
  await expect(first).toHaveAttribute('data-program-step', 'input')
  await expect(first.locator('code')).toHaveCount(0)
  await expect(quiz).toHaveCount(0)
  await first.getByRole('button', { name: '按规则处理', exact: true }).click()
  await expect(first).toHaveAttribute('data-program-step', 'process')
  await expect(first.getByTestId('program-basic-process')).toContainText('在原电量上加 3 格')
  await expect(first.getByRole('img', { name: '电量从 6 变为 9', exact: true })).toBeVisible()
  await expect(first.locator('.charge-change__meter i[data-state="added"]')).toHaveCount(3)
  await expect(result).toHaveCount(0)
  await first.getByRole('button', { name: '查看输出', exact: true }).click()
  await expect(result).toHaveText('9')
  await first.locator('[data-basic-case="1"]').click()
  await finishProgramBasics(page)
  await expect(result).toHaveText('4')
  await expect(first.getByRole('listitem').filter({ hasText: '输入 6' })).toContainText('输出 9')
  await expect(first.getByRole('listitem').filter({ hasText: '输入 1' })).toContainText('输出 4')
  await answerAndContinue(page, basics)
  await expect(page.getByRole('heading', { level: 1, name: cli.title.zh })).toBeVisible()
})

test('the charging animation pauses on the current value and can be stepped backward without losing the log', async ({ page }) => {
  await page.goto('/')
  await button(page, '开始 Python 课程').click()
  const charger = page.getByTestId('program-basics')
  await charger.locator('[data-basic-case="0"]').click()
  await page.clock.install()
  await button(charger, '自动播放').click()
  await page.clock.runFor(1510)
  await expect(charger).toHaveAttribute('data-program-step', 'process')
  await button(charger, '暂停').click()
  await page.clock.runFor(2000)
  await expect(charger.getByTestId('program-basic-result')).toHaveCount(0)
  await expect(charger.getByRole('img', { name: '电量从 0 变为 3' })).toBeVisible()
  await button(charger, '查看输出').click()
  await expect(charger.getByTestId('program-basic-result')).toHaveText('3')
  await button(charger, '上一步').click()
  await expect(charger.getByTestId('program-basic-result')).toHaveCount(0)
  await expect(charger.getByRole('listitem').filter({ hasText: '输入 0' })).toContainText('输出 3')
})

test('command line, GUI and Web each require an operation, its replay, and a small exercise', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const cli = lecture(catalog, 'python-program-interfaces')
  const gui = lecture(catalog, 'python-program-gui')
  const web = lecture(catalog, 'python-program-web')
  const variables = lecture(catalog, 'variable-cups')
  const program = page.getByTestId('program-interfaces')
  const output = program.getByTestId('program-interface-output')
  const quiz = page.getByRole('heading', { name: '小练习', exact: true })
  const heading = page.getByRole('heading', { level: 1 })

  await page.goto('/')
  await page.locator('[data-unit="foundations"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(cli.title.zh, { exact: true }) }).click()
  await expect(heading).toHaveText(cli.title.zh)
  await expect(program).toHaveAttribute('data-program-interface', 'cli')
  await expect(button(program, '回放这次运行')).toHaveCount(0)
  await expect(quiz).toHaveCount(0)
  await expect(program.locator('code')).toContainText('charge 6')
  await button(program, '提交命令').click()
  await expect(output).toHaveText('9')
  await followReplay(program, quiz, [
    { id: 'command', value: 'charge 6' },
    { id: 'input', value: '6', route: '命令行 → 补电程序' },
    { id: 'process', value: '9' },
    { id: 'output', value: '9', route: '补电程序 → 终端' },
  ])
  const wrong = cli.question.options.find((_, index) => index !== cli.question.correct)!
  await button(page, wrong.zh).click()
  await expect(page.locator('.mission-list [aria-current="step"] .mission-check')).toHaveCount(0)
  await answerAndContinue(page, cli)

  await expect(heading).toHaveText(gui.title.zh)
  await expect(program).toHaveAttribute('data-program-interface', 'gui')
  await expect(button(program, '回放这次运行')).toHaveCount(0)
  await button(program, '计算新电量').click()
  await expect(output).toHaveText('9')
  await button(program, '起始电量 1 格').click()
  await expect(button(program, '回放这次运行')).toHaveCount(0)
  await button(program, '计算新电量').click()
  await expect(output).toHaveText('4')
  await followReplay(program, quiz, [
    { id: 'input', value: '1' },
    { id: 'submit', value: '1', route: '桌面窗口 → 补电程序' },
    { id: 'process', value: '4' },
    { id: 'output', value: '4', route: '补电程序 → 桌面窗口' },
  ])
  await answerAndContinue(page, gui)

  await expect(heading).toHaveText(web.title.zh)
  await expect(program).toHaveAttribute('data-program-interface', 'web')
  await expect(button(program, '回放这次运行')).toHaveCount(0)
  await button(program, '起始电量 0 格').click()
  const pending = page.waitForResponse(response => response.url().endsWith('/api/program/run')
    && response.request().method() === 'POST')
  await button(program, '发送到服务器').click()
  const response = await pending
  expect(response.request().postDataJSON()).toEqual({ levelId: web.id, input: 0 })
  expect(await response.json()).toEqual({ input: 0, output: '3' })
  await expect(output).toHaveText('3')
  await followReplay(program, quiz, [
    { id: 'input', value: '0', route: '浏览器' },
    { id: 'request', value: '0', route: '浏览器 → 服务器' },
    { id: 'process', value: '3', route: '服务器' },
    { id: 'response', value: '3', route: '服务器 → 浏览器' },
    { id: 'output', value: '3', route: '浏览器' },
  ])
  await answerAndContinue(page, web)
  await expect(heading).toHaveText(variables.title.zh)
  await expect(page.getByTestId('variable-cups')).toBeVisible()
})

test('the program endpoint runs Web lesson samples without accepting code or unlisted inputs', async ({ request }) => {
  const data = { levelId: 'python-program-web', input: 0 }
  const run = (sample: object) => request.post('/api/program/run', { data: sample })
  const valid = await run(data)
  expect(valid.ok()).toBe(true)
  expect(await valid.json()).toEqual({ input: 0, output: '3' })
  expect((await run({ ...data, input: 2 })).status()).toBe(400)
  expect((await run({ ...data, source: 'say("wrong")' })).status()).toBe(400)
  expect((await run({ ...data, levelId: 'python-program-basics' })).status()).toBe(404)
  expect((await run({ ...data, levelId: 'python-program-interfaces' })).status()).toBe(404)
  expect((await run({ ...data, levelId: 'python-program-gui' })).status()).toBe(404)
})
