import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { runProgram } from '../src/engine/run'
import { cardsToPython } from '../src/shared/cards'
import { gridOffsets } from '../src/shared/gridDevices'
import type { Catalog, Direction, GridLevel } from '../src/shared/types'

async function advancedWarehouses(request: APIRequestContext) {
  const { levels, issues } = await (await request.get('/api/levels')).json() as Catalog
  expect(issues).toEqual([])
  const pack = levels.filter((level): level is GridLevel => level.kind === 'grid' && !!level.warehouse
    && level.unit?.id === 'challenge-zone' && level.difficulty === 'advanced')
  expect(pack.length).toBeGreaterThanOrEqual(90)
  return pack.sort((a, b) => a.order - b.order)
}

async function openRoute(page: Page, level: GridLevel) {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/#challenge-zone')
  await page.locator('[data-challenge-route="warehouse"]').click()
  await page.locator(`[data-route-step="${level.id}"] .challenge-route-step-open`).click()
}

test('warehouse buttons, arrows and undo restore real box positions, resume a draft and earn one route win', async ({ page, request }) => {
  test.setTimeout(90000)
  const [level] = await advancedWarehouses(request)
  const answer = runProgram(level, cardsToPython(level.cards, level.solutionCards))
  expect(answer.won).toBe(true)
  let cell = level.start
  const directions = answer.frames.filter(frame => frame.action === 'move').map(frame => {
    const dir = (Object.keys(gridOffsets) as Direction[]).find(key => {
      const offset = gridOffsets[key]
      return cell.x + offset.x === frame.state.player.x && cell.y + offset.y === frame.state.player.y
    })
    if (!dir) throw new Error('Expected one step')
    cell = frame.state.player
    return dir
  })
  const firstPush = answer.frames.findIndex(frame => level.warehouse!.boxes.some((box, index) =>
    box.x !== frame.state.boxes![index].x || box.y !== frame.state.boxes![index].y))
  expect(firstPush).toBeGreaterThanOrEqual(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await openRoute(page, level)
  const readout = page.getByTestId('warehouse-readout')
  const move = (dir: Direction) => page.locator(`[data-push-direction="${dir}"]`)
  for (const dir of directions.slice(0, firstPush + 1)) await move(dir).click()
  await expect(readout).toContainText('推箱 1')
  await page.getByRole('button', { name: '撤销一步' }).click()
  await expect(readout).toContainText('推箱 0')
  const dir = directions[firstPush]
  await move(dir).press('Arrow' + dir[0].toUpperCase() + dir.slice(1))
  await expect(readout).toContainText('推箱 1')
  await page.reload()
  await page.locator(`[data-continue-challenge="${level.id}"]`).click()
  await expect(readout).toContainText('步数 ' + (firstPush + 1))
  await expect(readout).toContainText('推箱 1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  for (const dir of directions.slice(firstPush + 1)) await move(dir).click()
  await expect(readout).toHaveAttribute('data-won', 'true')
  const receipt = page.getByTestId('warehouse-receipt')
  await expect(receipt).toContainText('整仓交付')
  await receipt.getByRole('button', { name: '看成绩' }).click()
  const summary = page.getByRole('region', { name: '通关总结' })
  await expect(summary).toBeFocused()
  await expect(summary.locator('[data-score-metric="turns"] td').first()).toHaveText(String(answer.final.turn))
  await summary.getByRole('button', { name: '再玩一次' }).click()
  await expect(readout).toContainText('步数 0')
  await expect(page.getByRole('button', { name: '撤销一步' })).toBeDisabled()
})

test('the final warehouse can be cleared with the same moves in Python and reopened in direct play', async ({ page, request }) => {
  test.setTimeout(90000)
  const level = (await advancedWarehouses(request)).at(-1)!
  await openRoute(page, level)
  await page.getByRole('button', { name: '指令卡 / Python' }).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  const source = cardsToPython(level.cards, level.solutionCards)
  await page.getByRole('textbox', { name: '编写 Python' }).fill(source)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '查看结果' }).click()
  await expect(page.getByRole('region', { name: '通关总结' })).toBeVisible()
  await expect(page.getByTestId('warehouse-receipt')).toContainText('整仓交付')
  await page.getByRole('button', { name: '直接推箱' }).click()
  await expect(page.getByTestId('warehouse-readout')).toContainText('步数 0')
  await page.getByRole('button', { name: '指令卡 / Python' }).click()
  await expect(page.getByRole('textbox', { name: '编写 Python' })).toHaveValue(source)
})

test('landing feedback follows a real forward push in both control modes and stays quiet on undo or rewind', async ({ page, request }) => {
  const [base] = await advancedWarehouses(request)
  const level: GridLevel = {
    ...base, tiles: ['#######', '#.....#', '#.....#', '#.....#', '#######'], start: { x: 1, y: 2 },
    warehouse: { boxes: [{ x: 2, y: 2 }, { x: 2, y: 3 }], targets: [{ x: 3, y: 2 }, { x: 3, y: 3 }] },
    solutionCards: ['right', 'left', 'down', 'right'].map(cardId => ({ cardId })),
  }
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: '关卡预览', exact: true }).click()
  await page.getByLabel('关卡 JSON 文件').setInputFiles({ name: 'dock.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(level)) })
  await page.getByRole('button', { name: '一键试玩', exact: true }).click()
  const seal = page.locator('.cargo-arrival[data-x="3"][data-y="2"]')
  const right = page.locator('[data-push-direction="right"]')
  const lit = page.locator('.warehouse-pads__lights [data-lit]')
  await expect(seal).toHaveCount(0)
  await right.click()
  await expect(seal).toBeVisible()
  await expect(lit).toHaveCount(1)
  await right.click()
  await expect(seal).toHaveCount(0)
  await page.getByRole('button', { name: '撤销一步' }).click()
  await expect(page.getByTestId('warehouse-readout')).toContainText('1/2')
  await expect(seal).toHaveCount(0)
  await expect(lit).toHaveCount(0)
  const sound = page.getByRole('button', { name: '推箱音效' })
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  await sound.click()
  await page.getByRole('button', { name: '指令卡 / Python' }).click()
  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill(cardsToPython(level.cards, level.solutionCards))
  const step = page.getByTestId('grid-single-step')
  await step.click()
  await expect(seal).toBeVisible()
  await step.click()
  await page.getByRole('button', { name: '回看上一步' }).click()
  await expect(seal).toHaveCount(0)
  await page.getByRole('button', { name: '查看结果' }).click()
  await expect(page.getByTestId('warehouse-receipt')).toContainText('2 箱全部就位 · 4 步 · 推箱 2 次')
  await expect(page.locator('.cargo-arrival')).toHaveCount(0)
})
