import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { AlgorithmLevel, ArenaLevel, LabLevel, LectureLevel, ReplayLevel } from '../src/shared/advanced'
import type { Catalog, Level } from '../src/shared/types'

function loadLevel<T extends Level>(filename: string): T {
  return JSON.parse(readFileSync(new URL(`../levels/${filename}`, import.meta.url), 'utf8')) as T
}

const lecture = loadLevel<LectureLevel>('1221-depth-first-notes.json')
const demo = loadLevel<Extract<ReplayLevel, { mode: 'grid' }>>('102-foundation-replay.json')
const aiDemo = loadLevel<Extract<ReplayLevel, { mode: 'ai' }>>('110-ai-replay.json')
const practice = loadLevel<AlgorithmLevel>('22-shortest-step.json')
const race = loadLevel<ArenaLevel>('23-parts-race.json')
const escape = loadLevel<ArenaLevel>('24-escape-patrol.json')
const readyLabs = { available: true, recipes: { numpy: true, pandas: true, analysis: true, sql: true, opencv: true, yolox: true } }

const missionButton = (page: Page, title: string) =>
  page.locator('.mission-list').getByRole('button').filter({ hasText: title })
const moduleCard = (page: Page, unitId: string) => page.locator(`[data-unit="${unitId}"]`)

async function openModule(page: Page, unitId: string) {
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  await moduleCard(page, unitId).click()
}

async function openMission(page: Page, level: Level) {
  const mission = missionButton(page, level.title.zh)
  if (!(await mission.isVisible())) await openModule(page, level.unit?.id ?? 'other')
  await mission.click()
  await expect(page.getByRole('heading', { level: 1, name: level.title.zh, exact: true })).toBeVisible()
}

async function openLabPreview(page: Page, recipe: LabLevel['recipe']) {
  const level: LabLevel = {
    version: 1, kind: 'lab', id: `lab-preview-${recipe}`, order: 1, stage: 'demo', recipe,
    title: { zh: '实验预览', en: 'Lab preview' },
    brief: { zh: '运行一次本地实验。', en: 'Run a local experiment.' },
    concept: { zh: '调整参数并查看结果。', en: 'Adjust settings and inspect the results.' },
    hints: [],
  }
  await page.getByRole('button', { name: '关卡预览', exact: true }).click()
  await page.getByLabel('关卡 JSON 文件').setInputFiles({
    name: `${recipe}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(level)),
  })
  await page.getByRole('button', { name: '一键试玩', exact: true }).click()
}

async function goToReplayEnd(page: Page) {
  const position = page.getByRole('slider', { name: '回放进度' })
  await expect(position).toBeVisible()
  await position.press('End')
}

async function runArena(page: Page, source: string, win: RegExp) {
  await page.getByRole('textbox', { name: '编写 Python' }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await goToReplayEnd(page)
  await expect(page.locator('.teaching-panel p[role="status"]')).toHaveText(win)
}

test('module navigation preserves legacy progress and confines the sidebar to the selected unit', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixel-repair-lab:completed', JSON.stringify(['first-steps', 'first-steps', 'ai-supply-box', 'retired-id']))
  })
  await page.goto('/')
  const sidebar = page.locator('.sidebar')
  await expect(page.getByRole('heading', { level: 1, name: '学习模块', exact: true })).toBeVisible()
  await expect(sidebar).toHaveCount(0)
  await expect(page.getByRole('progressbar', { name: '已完成任务' })).toHaveAttribute('aria-valuenow', '2')
  await expect(moduleCard(page, 'foundations').locator('.module-card-head > span')).toHaveText(/^1 \/ /)
  await expect(moduleCard(page, 'ai').locator('.module-card-head > span')).toHaveText(/^1 \/ /)

  await openModule(page, 'foundations')
  await expect(sidebar).toContainText('Python 基础')
  await expect(sidebar.locator('.mission-list')).toHaveCount(1)
  await expect(missionButton(page, '第一次出发').locator('.mission-check')).toBeVisible()
  await expect(missionButton(page, 'AI 补给搭档')).toHaveCount(0)

  await openModule(page, 'ai')
  await expect(missionButton(page, 'AI 补给搭档').locator('.mission-check')).toBeVisible()
  await expect(missionButton(page, '第一次出发')).toHaveCount(0)
  await openMission(page, practice)
  await expect(page.getByRole('heading', { name: '验证用例', exact: true })).toBeVisible()
  await expect(sidebar).toContainText('算法进阶')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(sidebar).toContainText('Intermediate Algorithms')
  await expect(page.getByRole('heading', { name: practice.title.en, exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Completed missions' })).toHaveAttribute('aria-valuenow', '2')
})

const requestedModules = [
  'foundations', 'python-intermediate', 'python-advanced', 'structures', 'algorithm-intro', 'routing',
  'algorithm-advanced', 'computer', 'architecture', 'numpy', 'pandas', 'statistics', 'database', 'opencv', 'yolox',
]

test('all 15 curriculum modules and AI offer animation, demo, and direct practice', async ({ page, request }) => {
  test.setTimeout(60_000)
  const response = await request.get('/api/levels')
  expect(response.ok()).toBe(true)
  const { levels, issues } = await response.json() as Catalog
  expect(issues).toEqual([])
  for (const lesson of levels.filter(level => level.kind === 'lecture')) {
    expect(Boolean(lesson.execution || (lesson.animation?.frames.length ?? 0) >= 2), lesson.id).toBe(true)
  }
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '学习模块', exact: true })).toBeVisible()

  for (const unitId of [...requestedModules, 'ai']) {
    await test.step(unitId, async () => {
      const members = levels.filter(level => level.unit?.id === unitId)
      expect(members.some(level => level.kind === 'lecture')).toBe(true)
      expect(members.some(level => level.stage === 'demo')).toBe(true)
      const exercise = members.find(level => level.stage === 'exercise' || level.stage === 'challenge')
      if (!exercise) throw new Error(`The ${unitId} module is missing a practice stage`)

      const card = moduleCard(page, unitId)
      await expect(card).toHaveCount(1)
      await expect(card.locator('.stage-explain')).toBeVisible()
      await expect(card.locator('.stage-demo')).toBeVisible()
      await expect(card.locator('.stage-exercise, .stage-challenge').first()).toBeVisible()
      await card.click()
      await expect(page.locator('.mission-list').getByRole('button')).toHaveCount(members.length)
      await openMission(page, exercise)
      await page.getByRole('button', { name: '学习模块', exact: true }).click()
    })
  }
})

test('prediction offers a retry and explains the correct answer', async ({ page }) => {
  await page.goto('/')
  await openMission(page, lecture)
  await expect(page.getByRole('heading', { name: '猜一猜' })).toBeVisible()
  const { options, correct, feedback } = lecture.question
  const incorrect = options.findIndex((_, index) => index !== correct)
  await page.getByRole('button', { name: options[incorrect].zh, exact: true }).click()
  const feedbackLine = page.locator('.teaching-panel p[role="status"]')
  await expect(feedbackLine).toContainText('再试一次')
  await page.getByRole('button', { name: options[correct].zh, exact: true }).click()
  await expect(feedbackLine).toContainText(feedback.zh)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(feedbackLine).toContainText(feedback.en)
})

test('concept animation supports manual steps, playback and seeking', async ({ page }) => {
  const frames = lecture.animation!.frames
  await page.goto('/')
  await openMission(page, lecture)
  const animation = page.getByRole('region', { name: '知识动画' })
  const caption = animation.locator('.animation-caption')
  await expect(caption).toHaveText(frames[0].caption.zh)
  const previous = animation.getByRole('button', { name: '上一步', exact: true })
  await expect(previous).toBeDisabled()
  await animation.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(caption).toHaveText(frames[1].caption.zh)
  await previous.click()
  await expect(caption).toHaveText(frames[0].caption.zh)
  await animation.getByRole('button', { name: '播放回放', exact: true }).click()
  await expect(caption).toHaveText(frames[1].caption.zh)
  await animation.getByRole('button', { name: '暂停回放', exact: true }).click()
  await animation.getByRole('slider', { name: '回放进度' }).press('End')
  await expect(caption).toHaveText(frames.at(-1)!.caption.zh)
  await expect(animation.getByRole('button', { name: '下一步', exact: true })).toBeDisabled()
})

test('a grid demo can change inputs and replay actual robot positions', async ({ page }) => {
  await page.goto('/')
  await openMission(page, demo)
  await page.getByRole('button', { name: demo.examples[1].title.zh, exact: true }).click()
  const initial = page.getByRole('img', { name: '机器人位于 2，2' })
  const finish = page.getByRole('img', { name: '机器人位于 3，2' })
  await expect(initial).toBeVisible()
  await page.getByRole('button', { name: '运行演示', exact: true }).click()
  await goToReplayEnd(page)
  const result = page.locator('.teaching-result')
  await expect(result).toContainText('演示完成')
  await expect(finish).toBeVisible()
  const position = page.getByRole('slider', { name: '回放进度' })
  await position.press('Home')
  await expect(initial).toBeVisible()
  await expect(page.locator('.station-source [data-next]')).toContainText('scan()')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.locator('.grid-readout')).toContainText('传感器读到 7')
  await expect(page.locator('.station-source [aria-current="step"]')).toContainText('scan()')
  await expect(page.locator('.station-source [data-next]')).toContainText('move("right")')
  await expect(page.locator('.station-source [data-next]')).toHaveCSS('outline-style', 'dashed')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(finish).toBeVisible()
  await expect(page.locator('.station-source [data-next]')).toHaveCount(0)
})

test('AI replay lets learners compare the wrong count with the correction', async ({ page }) => {
  await page.goto('/')
  await openMission(page, aiDemo)
  await page.getByRole('button', { name: '发送示例提示词', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('模拟错误')
  const tape = page.getByRole('row', { name: /胶带/ })
  await expect(tape.locator('.error-message')).toHaveText('2')
  await page.getByRole('button', { name: '发送修正', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('清单正确。')
  await expect(tape.locator('.win-message')).toHaveText('1')
})

test('verified code persists in the library and both algorithm imports win the escape arena', async ({ page }) => {
  await page.goto('/')
  await openMission(page, practice)
  const run = page.getByRole('button', { name: '运行', exact: true })
  const save = page.getByRole('button', { name: '保存到我的算法', exact: true })
  const draft = page.getByRole('textbox', { name: '编写 Python' })
  const library = page.getByRole('button', { name: '我的算法', exact: true })
  await expect(draft).toHaveValue(practice.starterCode)
  await run.click()
  const initiallyPassing = practice.cases.filter(({ expected }) => expected === null).length
  await expect(page.getByRole('status')).toHaveText(`${initiallyPassing}/${practice.cases.length} 个用例通过`)
  await expect(save).toHaveCount(0)

  const personal = '# 我的寻路函数\n' + practice.solutionCode
  await draft.fill(personal)
  await run.click()
  await expect(page.getByRole('status')).toHaveText(`${practice.cases.length}/${practice.cases.length} 个用例通过`)
  await save.click()
  await expect(page.getByRole('button', { name: '已保存到我的算法', exact: true })).toBeDisabled()
  await page.reload()
  await library.click()
  await expect(page.getByRole('heading', { name: '我的算法', exact: true })).toBeVisible()
  await page.locator('.algorithm-entry summary').filter({ hasText: practice.functionName }).click()
  await expect(page.locator('.algorithm-entry pre')).toContainText('# 我的寻路函数')

  await openMission(page, escape)
  const scores = page.getByRole('list', { name: '对抗比分' })
  await expect(scores.getByRole('listitem')).toHaveCount(4)
  await expect(scores).toContainText('追踪机器人')
  await expect(scores).toContainText('追踪搭档')
  await runArena(page, escape.solutionCode, /成功带着零件撤离/)
  const total = 1 + (escape.variants?.length ?? 0)
  await expect(page.getByText(`场景通过 ${total}/${total}`, { exact: true })).toBeVisible()

  const customImport = escape.solutionCode.replace('from algorithms import', 'from my_algorithms import')
  await draft.fill(escape.solutionCode.slice(escape.solutionCode.indexOf('\n') + 1))
  await draft.press('Control+Home')
  await page.getByRole('button', { name: `用我的函数 · ${practice.functionName}`, exact: true }).click()
  await expect(draft).toHaveValue(customImport)
  await run.click()
  await goToReplayEnd(page)
  await expect(page.locator('.teaching-panel p[role="status"]')).toHaveText(/成功带着零件撤离/)
  await expect(page.getByText(`场景通过 ${total}/${total}`, { exact: true })).toBeVisible()
})

test('part race reports the score and replay records each of the two rivals', async ({ page }) => {
  await page.goto('/')
  await openMission(page, race)
  await expect(page.getByRole('list', { name: '对抗比分' }).getByRole('listitem')).toHaveCount(3)
  await runArena(page, race.solutionCode, /你收集的零件最多/)
  const progress = page.getByRole('slider', { name: '回放进度' })
  await progress.press('Home')
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  const step = page.locator('.arena-events')
  for (const opponent of race.opponents) await expect(step).toContainText(opponent.title.zh)
  await expect(page.getByRole('progressbar', { name: '已完成任务' })).toHaveAttribute('aria-valuenow', '1')
})

test('an imported arena can be won without changing progress for its campaign ID', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '关卡预览', exact: true }).click()
  const imported = { ...race, title: { zh: '本地试玩赛场', en: 'Local arena playtest' } }
  await page.getByLabel('关卡 JSON 文件').setInputFiles({
    name: 'arena-example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)),
  })
  await expect(page.getByText('配置校验通过')).toBeVisible()
  await page.getByRole('button', { name: '一键试玩', exact: true }).click()
  await runArena(page, race.solutionCode, /你收集的零件最多/)
  await expect(page.getByText('试玩成功', { exact: true })).toBeVisible()
  await openMission(page, race)
  await expect(missionButton(page, race.title.zh)).toBeVisible()
  await expect(missionButton(page, race.title.zh).locator('.mission-check')).toHaveCount(0)
  await expect(page.getByRole('progressbar', { name: '已完成任务' })).toHaveAttribute('aria-valuenow', '0')
})

test('a prepared lab submits only the selected recipe parameters and shows its result', async ({ page }) => {
  await page.route('**/api/labs/status', route => route.fulfill({ json: readyLabs }))
  const query = 'SELECT item, area, stock FROM inventory WHERE stock >= ? AND area = ?'
  await page.route('**/api/labs/run', route => route.fulfill({
    json: { result: {
      recipe: 'sql', engine: 'SQLite · DuckDB', rows: [['cable', 'storage', 10]], duckRows: [['cable', 'storage', 10]],
      comparisonMatches: true, input: [], query,
    } },
  }))
  await page.goto('/')
  await openLabPreview(page, 'sql')
  const run = page.getByRole('button', { name: '运行演示', exact: true })
  await expect(run).toBeEnabled()
  await page.getByRole('combobox', { name: '区域', exact: true }).selectOption('storage')
  await page.getByRole('slider', { name: /最低库存/ }).press('End')
  const posting = page.waitForRequest(request => request.url().endsWith('/api/labs/run') && request.method() === 'POST')
  await run.click()
  expect((await posting).postDataJSON()).toEqual({ recipe: 'sql', parameters: { minimum: 10, zone: 'storage' } })
  await expect(page.getByRole('row', { name: /线缆.*仓库.*10/ })).toBeVisible()
  await expect(page.getByText('SQLite 和 DuckDB 返回了相同的结果。', { exact: true })).toBeVisible()
  await page.getByText('查看实际 SQL', { exact: true }).click()
  await expect(page.locator('.lab-more pre')).toHaveText(query)
  await page.getByRole('button', { name: '完成演示', exact: true }).click()
  await expect(page.getByText('演示已完成', { exact: true })).toBeVisible()
})

test('data analysis shows the statistics and the Python used to compute them', async ({ page }) => {
  await page.route('**/api/labs/status', route => route.fulfill({ json: readyLabs }))
  const source = 'summary = filtered.groupby("zone")["temperature"].agg(["mean", "count"])'
  await page.route('**/api/labs/run', route => route.fulfill({
    json: { result: {
      recipe: 'analysis', engine: 'NumPy · pandas', rows: [['alpha', 20, 3]], input: [[1, 'alpha', 17]],
      code: source, summary: { median: 20, spread: 6 },
    } },
  }))
  await page.goto('/')
  await openLabPreview(page, 'analysis')
  await page.getByRole('slider', { name: /统计前几天/ }).press('End')
  const posting = page.waitForRequest(request => request.url().endsWith('/api/labs/run') && request.method() === 'POST')
  await page.getByRole('button', { name: '运行演示', exact: true }).click()
  expect((await posting).postDataJSON()).toEqual({ recipe: 'analysis', parameters: { days: 5 } })
  await expect(page.getByRole('row', { name: /甲区.*20.*3/ })).toBeVisible()
  await expect(page.getByText('总体中位数（°C）', { exact: true })).toBeVisible()
  await page.getByText('查看实际 Python', { exact: true }).click()
  await expect(page.locator('.lab-more pre')).toHaveText(source)
})

test('a lab without its runtime shows setup while practice remains available', async ({ page }) => {
  await page.route('**/api/labs/status', route => route.fulfill({
    json: { available: false, recipes: { numpy: false, pandas: false, analysis: false, sql: false, opencv: false, yolox: false } },
  }))
  await page.goto('/')
  await openLabPreview(page, 'sql')
  await expect(page.getByText('npm run labs:setup', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '运行演示', exact: true })).toBeDisabled()
  await openMission(page, practice)
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeEnabled()
})
