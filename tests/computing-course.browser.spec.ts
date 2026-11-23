import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { Catalog, Level } from '../src/shared/types'

const units = ['computer', 'architecture'] as const
const phases = ['explain', 'demo', 'exercise', 'challenge'] as const
const progressKey = 'pixel-repair-lab:completed'

async function catalog(request: APIRequestContext) {
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const result = await response.json() as Catalog
  expect(result.issues).toEqual([])
  return result.levels
}

function orderedUnit(levels: Level[], unit: typeof units[number]) {
  return levels.filter(level => level.unit?.id === unit).sort((left, right) =>
    ((left.topic?.order ?? Infinity) - (right.topic?.order ?? Infinity)) ||
    (phases.indexOf(left.stage!) - phases.indexOf(right.stage!)) || left.order - right.order,
  )
}

function openUnit(page: Page, unit: string) {
  return page.locator(`[data-unit="${unit}"]`).click()
}

function home(page: Page) {
  return page.getByRole('button', { name: '学习模块', exact: true }).click()
}

function mission(page: Page, level: Level) {
  return page.locator('.mission-list').getByRole('button').filter({ has: page.getByText(level.title.zh, { exact: true }) })
}

async function expectLesson(page: Page, level: Level) {
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
}

test('five computing topics order an animated explanation, interactive demo, and exercises before each capstone', async ({ page, request }) => {
  const levels = await catalog(request)
  await page.goto('/')
  const cards = page.getByRole('region', { name: '计算机', exact: true }).locator('button[data-unit]')
  await expect(cards).toHaveCount(units.length)

  for (const [index, unit] of units.entries()) {
    await test.step(unit, async () => {
      const members = orderedUnit(levels, unit)
      const capstones = members.filter(level => level.stage === 'challenge')
      expect(capstones).toHaveLength(1)
      expect(capstones[0].topic).toBeUndefined()
      expect(members.at(-1)?.id).toBe(capstones[0].id)
      const core = members.slice(0, -1)
      const topics = new Map(core.map(level => [level.topic!.id, level.topic!]))
      expect([...topics.keys()]).toEqual(unit === 'computer' ? ['binary', 'logic-gates'] : ['memory', 'registers', 'instructions'])
      expect([...topics.values()].map(topic => topic.order)).toEqual(Array.from({ length: topics.size }, (_, item) => item + 1))
      for (const topic of topics.values()) {
        const [lecture, demo, ...practice] = core.filter(level => level.topic?.id === topic.id)
        expect(lecture.stage).toBe('explain')
        expect(lecture.kind === 'lecture' && lecture.animation?.frames.length).toBeGreaterThanOrEqual(2)
        expect(demo.stage).toBe('demo')
        expect(demo.kind).toBe(unit === 'computer' ? 'circuit' : 'machine')
        expect(practice.length).toBeGreaterThanOrEqual(2)
        expect(practice.every(level => level.stage === 'exercise')).toBe(true)
        expect(practice.every((level, item) => !item || practice[item - 1].order < level.order)).toBe(true)
      }

      await expect(cards.nth(index)).toHaveAttribute('data-unit', unit)
      await cards.nth(index).click()
      await expect(page.locator('.mission-list .mission-name')).toHaveText(members.map(level => level.title.zh))
      await expect(page.locator('.mission-list .course-topic-heading')).toHaveText([
        ...[...topics.values()].map(topic => topic.title.zh), '阶段综合挑战 · 选做',
      ])
      await home(page)
    })
  }
})

test('real binary and gate readings respond to mouse controls and verify the combined challenge', async ({ page, request }) => {
  const levels = await catalog(request)
  const binary = levels.find(level => level.id === 'computer-replay')
  const logic = levels.find(level => level.id === 'logic-switchboard-demo')
  const challenge = levels.find(level => level.id === 'binary-gate-challenge')
  if (binary?.kind !== 'circuit' || logic?.kind !== 'circuit' || challenge?.kind !== 'circuit') throw new Error('Missing circuit lessons')

  await page.goto('/')
  await openUnit(page, 'computer')
  await mission(page, binary).click()
  const reading = page.getByTestId('circuit-value')
  await expect(reading).toHaveText('3')
  await page.getByRole('button', { name: '位 1', exact: true }).click()
  await expect(reading).toHaveText('7')
  await page.getByRole('button', { name: '位 3', exact: true }).click()
  await expect(reading).toHaveText('6')
  await page.getByRole('button', { name: '重置开关', exact: true }).click()
  await expect(reading).toHaveText('3')

  await mission(page, logic).click()
  const out = page.getByTestId('gate-output')
  const gate = (name: string) => page.getByRole('group', { name: '选择逻辑门' }).getByRole('button', { name, exact: true })
  const input = (name: string) => page.getByRole('group', { name: '输入开关' }).getByRole('button', { name, exact: true })
  await expect(gate('AND')).toHaveAttribute('aria-pressed', 'true')
  await expect(out).toHaveText('0')
  await gate('OR').click()
  await expect(out).toHaveText('1')
  await gate('NOT').click()
  await expect(out).toHaveText('0')
  await input('B').click()
  await expect(out).toHaveText('0')
  await input('A').click()
  await expect(out).toHaveText('1')
  await gate('XOR').click()
  await expect(out).toHaveText('1')
  await input('A').click()
  await expect(out).toHaveText('0')
  await gate('OR').click()
  await expect(out).toHaveText('1')

  await mission(page, challenge).click()
  await expectLesson(page, challenge)
  expect(challenge.cases).toHaveLength(3)
  const check = page.getByRole('button', { name: '检查设置', exact: true })
  const scenarios = page.getByRole('group', { name: '实验场景' })
  const feedback = page.getByRole('status')
  for (const [index, scenario] of challenge.cases.entries()) {
    if (!scenario.goal || !scenario.solution) throw new Error('Scored circuits need a goal and a reference')
    await scenarios.getByRole('button', { name: scenario.label.zh, exact: true }).click()
    for (const [bit, wanted] of scenario.solution.bits.entries()) {
      if (scenario.bits[bit] !== wanted) await input(`位 ${bit + 1}`).click()
    }
    await expect(reading).toHaveText(String(scenario.goal.value))
    if (index === 0) {
      await check.click()
      await expect(feedback).toContainText('还有条件没满足')
    }
    await gate(scenario.goal.gate ?? 'NOT').click()
    await expect(out).toHaveText(String(scenario.goal.output))
    await check.click()
    await expect(feedback).toContainText('这一组设置正确')
  }
  await expect(page.getByText('已完成场景 3/3', { exact: true })).toBeVisible()
  await expect(mission(page, challenge).locator('.mission-check')).toBeVisible()
  await expect(page.locator('.computer-route-nav')).toContainText('主线进度 0/')
})

test('the computing path starts, resumes, and enters architecture without requiring the first capstone', async ({ page, request }) => {
  const levels = await catalog(request)
  const principles = orderedUnit(levels, 'computer').filter(level => level.stage !== 'challenge')
  const architecture = orderedUnit(levels, 'architecture')
  const first = principles[0]
  if (first.kind !== 'lecture') throw new Error('The computing path must start with an explanation')

  await page.goto('/#track-computer')
  await expect(page.locator('#track-computer')).toBeInViewport()
  await page.getByRole('button', { name: '开始计算机课程', exact: true }).click()
  await expectLesson(page, first)
  await page.getByRole('button', { name: first.question.options[first.question.correct].zh, exact: true }).click()
  await expect(page.locator('.computer-route-nav')).toContainText('主线进度 1/')
  await home(page)
  const resume = page.getByRole('button', { name: '继续计算机课程', exact: true })
  await resume.click()
  await expectLesson(page, principles[1])

  await page.evaluate(({ key, ids }) => localStorage.setItem(key, JSON.stringify(ids)), {
    key: progressKey, ids: principles.map(level => level.id),
  })
  await page.reload()
  await resume.click()
  await expectLesson(page, architecture[0])
  await page.getByRole('button', { name: '上一课', exact: true }).click()
  await expectLesson(page, principles.at(-1)!)
  await expect(page.getByRole('button', { name: '选做综合挑战', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '进入 计算机结构', exact: true }).click()
  await expectLesson(page, architecture[0])
  await expect(page.locator('.computer-route-nav')).toContainText('阶段 2/2')
})

test('real CPU instructions advance registers and memory, flag a bad address, and pass all architecture cases', async ({ page, request }) => {
  const levels = await catalog(request)
  const challenge = orderedUnit(levels, 'architecture').find(level => level.stage === 'challenge')
  if (challenge?.kind !== 'machine') throw new Error('The architecture capstone must be a CPU program')
  const scenario = challenge.cases[0]
  const [first, second, expense, initialTotal, initialNet, protectedValue] = scenario.memory
  const total = first + second
  const net = total - expense
  const manual = '# 写出合计和净值\nload 1\nadd 0\nstore 3\nsub 2\nstore 4\nhalt'
  expect(manual.trim()).not.toBe(challenge.solutionCode?.trim())

  await page.goto('/')
  await openUnit(page, 'architecture')
  await mission(page, challenge).click()
  await expectLesson(page, challenge)
  const editor = page.getByLabel('编写汇编', { exact: true })
  const step = page.getByRole('button', { name: '单步执行', exact: true })
  const pc = page.locator('[data-register="pc"]')
  const accumulator = page.locator('[data-register="accumulator"]')
  const memory = (address: number) => page.locator(`.machine-memory [data-address="${address}"] dd`)
  const next = page.locator('.machine-instructions [aria-current="step"] code')

  const badAddress = scenario.memory.length
  await editor.fill(`LOAD 1\nSTORE ${badAddress}\nHALT`)
  await expect(next).toHaveText('LOAD 1')
  await step.click()
  await expect(pc).toHaveText('1')
  await expect(accumulator).toHaveText(String(second))
  await expect(page.getByRole('alert')).toContainText('第 2 行 · 这个地址没有对应的内存格')
  await expect(page.locator('.machine-line-error code')).toHaveText(`STORE ${badAddress}`)
  await expect(step).toBeDisabled()

  await editor.fill(manual)
  await expect(pc).toHaveText('0')
  await expect(accumulator).toHaveText(String(scenario.accumulator ?? 0))
  await expect(memory(3)).toHaveText(String(initialTotal))
  await expect(memory(4)).toHaveText(String(initialNet))
  await expect(page.getByRole('alert')).toHaveCount(0)
  const expectedSteps = [
    { op: 'load 1', acc: second, sum: initialTotal, difference: initialNet },
    { op: 'add 0', acc: total, sum: initialTotal, difference: initialNet },
    { op: 'store 3', acc: total, sum: total, difference: initialNet },
    { op: 'sub 2', acc: net, sum: total, difference: initialNet },
    { op: 'store 4', acc: net, sum: total, difference: net },
    { op: 'halt', acc: net, sum: total, difference: net },
  ]
  for (const [index, expected] of expectedSteps.entries()) {
    await expect(next).toHaveText(expected.op)
    await step.click()
    await expect(pc).toHaveText(String(index + 1))
    await expect(accumulator).toHaveText(String(expected.acc))
    await expect(memory(3)).toHaveText(String(expected.sum))
    await expect(memory(4)).toHaveText(String(expected.difference))
  }
  await expect(step).toBeDisabled()
  await expect(memory(0)).toHaveText(String(first))
  await expect(memory(1)).toHaveText(String(second))
  await expect(memory(2)).toHaveText(String(expense))
  await expect(memory(5)).toHaveText(String(protectedValue))
  await expect(page.getByText('当前场景通过。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '检验全部场景', exact: true }).click()
  await expect(page.locator('.machine-feedback[role="status"]')).toHaveText('同一份程序通过了所有场景。')
  await expect(page.locator('.machine-verification')).toContainText(`已通过 ${challenge.cases.length}/${challenge.cases.length}`)
  await expect(mission(page, challenge).locator('.mission-check')).toBeVisible()
})
