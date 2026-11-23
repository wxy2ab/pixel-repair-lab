import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'

const freightId = 'challenge-freight-carousel'
const junctionId = 'challenge-junction-race'
const remainingMs = 1_250

function button(container: Locator | Page, name: string) {
  return container.getByRole('button', { name, exact: true })
}

async function seedSavedMatches(page: Page, relaxedStep = 6) {
  await page.goto('/#unfinished-matches')
  await page.evaluate(async ({ modulePath, freightId, junctionId, remainingMs, relaxedStep }) => {
    const { saveArenaMatch } = await import(modulePath) as typeof import('../src/web/arenaMatchProgress')
    const { levels } = await (await fetch('/api/levels')).json() as Catalog
    const freight = levels.find(level => level.id === freightId)
    const junction = levels.find(level => level.id === junctionId)
    if (freight?.kind !== 'arena' || junction?.kind !== 'arena') throw new Error('Missing comparison fixtures')

    saveArenaMatch(freight, 'timed', { actions: ['left', 'pick', 'wait', 'wait'], remainingMs })
    saveArenaMatch(freight, 'relaxed', { source: freight.solutionCode, personal: {}, course: {}, step: relaxedStep })
    saveArenaMatch(junction, 'relaxed', { source: junction.solutionCode, personal: {}, course: {}, step: 3 })
  }, { modulePath: '/src/web/arenaMatchProgress.ts', freightId, junctionId, remainingMs, relaxedStep })
  await page.reload()
}

async function readSavedBoard(board: Locator) {
  await expect(board).toBeVisible()
  return board.locator('[data-x][data-y]').evaluateAll(cells => cells.map(cell => ({
    x: cell.getAttribute('data-x'), y: cell.getAttribute('data-y'),
    tile: cell.getAttribute('data-tile'), gate: cell.getAttribute('data-gate'), item: cell.getAttribute('data-item-id'),
    actors: Array.from(cell.querySelectorAll('[data-actor-id]'), actor => actor.getAttribute('data-actor-id')).sort(),
  })))
}

function cell(board: Locator, [x, y]: readonly [number, number]) {
  return board.locator(`[data-x="${x}"][data-y="${y}"]`)
}

async function expectSelectedCells(boards: readonly Locator[], kind: string, positions: readonly (readonly [number, number])[]) {
  for (const board of boards) {
    await expect(board.locator('[data-selected-change]')).toHaveCount(positions.length)
    for (const position of positions) await expect(cell(board, position)).toHaveAttribute('data-selected-change', kind)
  }
}

async function expectSavedStates(detail: Locator, id: string, timedText: string, relaxedText: string) {
  const entity = detail.locator(`[data-selected-change-entity="${id}"]`)
  await expect(entity.locator('[data-mode="timed"]')).toContainText(timedText)
  await expect(entity.locator('[data-mode="relaxed"]')).toContainText(relaxedText)
}

test('two modes of a saved challenge can be compared without changing either checkpoint', async ({ page }) => {
  await seedSavedMatches(page)
  const list = page.getByRole('region', { name: '未完成的对局', exact: true })
  const timed = list.locator(`[data-unfinished-match="${freightId}"][data-mode="timed"]`)
  const relaxed = list.locator(`[data-unfinished-match="${freightId}"][data-mode="relaxed"]`)
  const other = list.locator(`[data-unfinished-match="${junctionId}"][data-mode="relaxed"]`)
  const pick = (card: Locator) => card.getByRole('checkbox', { name: '加入对比', exact: true })
  const compare = button(list, '对比所选')
  await expect(list).toContainText('已选 0 / 2')
  await expect(compare).toBeDisabled()

  const compactTimed = timed.getByTestId('unfinished-arena-board')
  const compactRelaxed = relaxed.getByTestId('unfinished-arena-board')
  const timedBoard = await readSavedBoard(compactTimed)
  const relaxedBoard = await readSavedBoard(compactRelaxed)
  const compactSize = await compactTimed.getByRole('img').boundingBox()
  const scoreValues = (card: Locator) => card.getByRole('list', { name: '比分', exact: true }).locator('strong').allTextContents()
  const timedScore = await scoreValues(timed)
  const relaxedScore = await scoreValues(relaxed)
  const checkpoints = () => page.evaluate(id => ['timed', 'relaxed'].map(mode =>
    localStorage.getItem(`pixel-repair-lab:arena-match:${id}:${mode}`)), freightId)
  const before = await checkpoints()
  expect(timedBoard.find(cell => cell.x === '4' && cell.y === '4')?.gate).toBe('open')
  expect(timedBoard.find(cell => cell.x === '2' && cell.y === '4')?.gate).toBe('closed')
  expect(timedBoard.find(cell => cell.item === 'shipment-1')).toMatchObject({ x: '4', y: '3' })
  expect(timedBoard.some(cell => cell.item === 'battery-5')).toBe(false)
  expect(timedScore[0]).toBe('1')
  expect(relaxedBoard).not.toEqual(timedBoard)

  await pick(timed).check()
  await expect(list).toContainText('已选 1 / 2')
  await expect(compare).toBeDisabled()
  await pick(relaxed).check()
  await expect(list).toContainText('已选 2 / 2')
  await expect(pick(other)).toBeDisabled()
  await compare.click()

  const comparison = page.getByRole('region', { name: '对比存档', exact: true })
  const timedComparison = comparison.locator(`[data-compared-match="${freightId}"][data-mode="timed"]`)
  const relaxedComparison = comparison.locator(`[data-compared-match="${freightId}"][data-mode="relaxed"]`)
  await expect(comparison.getByTestId('compared-arena-board')).toHaveCount(2)
  await expect(timedComparison).toHaveAttribute('data-match-turn', '4')
  await expect(relaxedComparison).toHaveAttribute('data-match-turn', '6')
  await expect(timedComparison).toContainText('4 / 20')
  await expect(relaxedComparison).toContainText('6 / 20')
  await expect(timedComparison).toContainText(`${(remainingMs / 1_000).toFixed(1)} 秒`)
  await expect(relaxedComparison).toContainText('不限时')
  expect(await scoreValues(timedComparison)).toEqual(timedScore)
  expect(await scoreValues(relaxedComparison)).toEqual(relaxedScore)
  const largeTimed = timedComparison.getByTestId('compared-arena-board')
  const largeRelaxed = relaxedComparison.getByTestId('compared-arena-board')
  expect(await readSavedBoard(largeTimed)).toEqual(timedBoard)
  expect(await readSavedBoard(largeRelaxed)).toEqual(relaxedBoard)

  const largeTimedSize = await largeTimed.getByRole('img').boundingBox()
  const largeRelaxedSize = await largeRelaxed.getByRole('img').boundingBox()
  if (!compactSize || !largeTimedSize || !largeRelaxedSize) throw new Error('Missing board geometry')
  expect(largeTimedSize.width).toBeGreaterThan(compactSize.width)
  expect(largeRelaxedSize.width).toBeGreaterThan(compactSize.width)
  expect(largeTimedSize.y).toBeCloseTo(largeRelaxedSize.y)
  expect(largeTimedSize.x + largeTimedSize.width <= largeRelaxedSize.x ||
    largeRelaxedSize.x + largeRelaxedSize.width <= largeTimedSize.x).toBe(true)

  const highlight = comparison.getByRole('checkbox', { name: '标出变化', exact: true })
  const changeList = comparison.getByRole('region', { name: '变化清单', exact: true })
  await highlight.check()
  await changeList.getByRole('combobox', { name: '变化分类', exact: true }).selectOption('gates')
  await expect(changeList).toContainText('这一类没有变化。')
  await expect(changeList.getByRole('status')).toHaveText('共 0 条')
  await expect(button(changeList, '上一条')).toBeDisabled()
  await expect(button(changeList, '下一条')).toBeDisabled()
  await highlight.uncheck()

  await page.setViewportSize({ width: 320, height: 760 })
  await button(page, 'EN').click()
  const english = page.getByRole('region', { name: 'Compare saved matches', exact: true })
  await expect(english).toBeVisible()
  await expect(english).toContainText('No timer')
  await expect(button(english, 'Continue this match')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await button(page, '中文').click()
  await page.setViewportSize({ width: 1366, height: 900 })

  await button(comparison, '返回列表').click()
  await expect(pick(timed)).toBeChecked()
  await expect(pick(relaxed)).toBeChecked()
  expect(await checkpoints()).toEqual(before)
  await pick(relaxed).uncheck()
  await expect(pick(other)).toBeEnabled()
  await pick(other).check()
  await compare.click()

  await button(timedComparison, '继续这局').click()
  await expect(button(page, '紧张')).toHaveAttribute('aria-pressed', 'true')
  const resume = button(page, '继续对局')
  const turn = page.getByTestId('arena-turn')
  const timer = page.getByRole('progressbar', { name: '距离下一回合', exact: true })
  await expect(resume).toBeEnabled()
  await expect(turn).toHaveText('回合 4/20')
  await expect(timer).toHaveAttribute('value', String(remainingMs))
  // Wait longer than one turn to check that only an explicit resume starts the clock.
  await page.waitForTimeout(1_950)
  await expect(turn).toHaveText('回合 4/20')
  await expect(timer).toHaveAttribute('value', String(remainingMs))
  await resume.click()
  await expect(turn).toHaveText('回合 5/20')
})

test('same-level comparisons highlight only changed cells and show score and turn differences', async ({ page }) => {
  await seedSavedMatches(page, 9)
  const list = page.getByRole('region', { name: '未完成的对局', exact: true })
  const pick = (levelId: string, mode: string) => list.locator(`[data-unfinished-match="${levelId}"][data-mode="${mode}"]`)
    .getByRole('checkbox', { name: '加入对比', exact: true })
  const compare = button(list, '对比所选')
  await pick(freightId, 'timed').check()
  await pick(freightId, 'relaxed').check()
  await compare.click()

  const comparison = page.getByRole('region', { name: '对比存档', exact: true })
  const highlight = comparison.getByRole('checkbox', { name: '标出变化', exact: true })
  const summary = comparison.getByRole('heading', { name: '比分与回合差', exact: true })
  const cards = comparison.locator('[data-compared-match]')
  const boards = comparison.getByTestId('compared-arena-board')
  const changedCells = boards.locator('[data-change-player], [data-change-rivals], [data-change-battery], [data-change-gate]')
  await expect(highlight).toBeVisible()
  await expect(highlight).not.toBeChecked()
  await expect(changedCells).toHaveCount(0)
  await highlight.check()
  await expect(summary).toBeVisible()

  const before = await readSavedBoard(boards.nth(0))
  const after = await readSavedBoard(boards.nth(1))
  const expected = before.map((cell, index) => {
    const compared = after[index]
    return {
      x: cell.x, y: cell.y,
      player: cell.actors.includes('player') !== compared.actors.includes('player'),
      rivals: cell.actors.filter(id => id !== 'player').join(',') !== compared.actors.filter(id => id !== 'player').join(','),
      battery: cell.item !== compared.item,
      gate: cell.gate !== compared.gate,
    }
  })
  for (const kind of ['player', 'rivals', 'battery', 'gate'] as const) {
    const positions = expected.filter(cell => cell[kind]).map(({ x, y }) => ({ x, y }))
    expect(positions.length).toBeGreaterThan(0)
    expect(positions.length).toBeLessThan(expected.length)
    for (const board of await boards.all()) {
      const actual = await board.locator(`[data-change-${kind}="true"]`).evaluateAll(cells => cells.map(cell => ({
        x: cell.getAttribute('data-x'), y: cell.getAttribute('data-y'),
      })))
      expect(actual).toEqual(positions)
    }
  }

  const [firstTurn, secondTurn] = await cards.evaluateAll(elements => elements.map(card => Number(card.getAttribute('data-match-turn'))))
  const signed = (difference: number) => difference > 0 ? `+${difference}` : String(difference)
  const turnDifference = comparison.locator('[data-change-metric="turn"]')
  await expect(turnDifference.locator('dd')).toHaveText(`${signed(secondTurn - firstTurn)} 回合`)
  const scores = (index: number) => cards.nth(index).getByRole('list', { name: '比分', exact: true }).locator('[data-actor-id]')
    .evaluateAll(rows => rows.map(row => ({
      id: row.getAttribute('data-actor-id'), value: Number(row.querySelector('strong')?.textContent),
    })))
  const [firstScores, secondScores] = await Promise.all([scores(0), scores(1)])
  await expect(comparison.locator('[data-change-metric="score"]')).toHaveCount(firstScores.length)
  for (const [index, score] of firstScores.entries()) {
    expect(secondScores[index].id).toBe(score.id)
    const scoreDifference = comparison.locator(`[data-change-metric="score"][data-actor-id="${score.id}"]`)
    await expect(scoreDifference.locator('dd')).toHaveText(`${signed(secondScores[index].value - score.value)} 分`)
  }

  await page.setViewportSize({ width: 320, height: 760 })
  await button(page, 'EN').click()
  await expect(page.getByRole('checkbox', { name: 'Highlight changes', exact: true })).toBeChecked()
  await expect(page.getByRole('heading', { name: 'Score and turn differences', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await button(page, '中文').click()
  await page.setViewportSize({ width: 1366, height: 900 })
  await highlight.uncheck()
  await expect(changedCells).toHaveCount(0)
  await expect(summary).toHaveCount(0)

  await button(comparison, '返回列表').click()
  await pick(freightId, 'relaxed').uncheck()
  await pick(junctionId, 'relaxed').check()
  await compare.click()
  await expect(boards).toHaveCount(2)
  await expect(highlight).toHaveCount(0)
  await expect(summary).toHaveCount(0)
  await expect(comparison.getByRole('region', { name: '变化清单', exact: true })).toHaveCount(0)
  await expect(changedCells).toHaveCount(0)
  await expect(button(comparison, '继续这局')).toHaveCount(2)
})

test('selecting board changes reveals both saved states and highlights the related cells', async ({ page }) => {
  await seedSavedMatches(page, 9)
  const list = page.getByRole('region', { name: '未完成的对局', exact: true })
  for (const mode of ['timed', 'relaxed']) {
    await list.locator(`[data-unfinished-match="${freightId}"][data-mode="${mode}"]`)
      .getByRole('checkbox', { name: '加入对比', exact: true }).check()
  }
  await button(list, '对比所选').click()

  const comparison = page.getByRole('region', { name: '对比存档', exact: true })
  const timed = comparison.locator('[data-compared-match][data-mode="timed"]')
  const relaxed = comparison.locator('[data-compared-match][data-mode="relaxed"]')
  const detail = comparison.getByRole('region', { name: '选中的变化', exact: true })
  const highlight = comparison.getByRole('checkbox', { name: '标出变化', exact: true })
  await highlight.check()
  const boards = [timed, relaxed]

  const player = cell(timed, [5, 7]).getByRole('button')
  await player.focus()
  await player.press('Enter')
  await expectSelectedCells(boards, 'player', [[5, 7], [9, 5]])
  await expectSavedStates(detail, 'player', '(5, 7)', '(9, 5)')
  await expect(player).toHaveAttribute('aria-pressed', 'true')

  await cell(relaxed, [3, 5]).locator('button[data-change-kind="rivals"]').click()
  await expectSelectedCells(boards, 'rivals', [[3, 5], [6, 6], [5, 5]])
  await expectSavedStates(detail, 'relay', '(6, 6)', '(3, 5)')
  await expectSavedStates(detail, 'compass', '(5, 5)', '(3, 5)')

  await page.setViewportSize({ width: 320, height: 760 })
  await cell(relaxed, [2, 5]).locator('button[data-change-kind="battery"]').click()
  await expectSelectedCells(boards, 'battery', [[6, 2], [2, 5]])
  await expectSavedStates(detail, 'shipment-3', '(6, 2)', '(2, 5)')
  await expect(detail).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.setViewportSize({ width: 1366, height: 900 })

  await cell(relaxed, [4, 1]).locator('button[data-change-kind="battery"]').click()
  await expectSelectedCells(boards, 'battery', [[4, 1]])
  await expectSavedStates(detail, 'battery-2', '(4, 1)', '已取走')
  await button(page, 'EN').click()
  await expect(page.getByRole('region', { name: 'Selected changes', exact: true })).toContainText('Collected')
  await button(page, '中文').click()

  await cell(timed, [4, 4]).locator('button[data-change-kind="gate"]').click()
  await expectSelectedCells(boards, 'gate', [[4, 4]])
  await expectSavedStates(detail, '4,4', '开着', '关着')
  await expect(button(timed, '继续这局')).toBeEnabled()
  await expect(button(relaxed, '继续这局')).toBeEnabled()

  await highlight.uncheck()
  await expect(detail).toHaveCount(0)
  await expect(comparison.locator('[data-selected-change], button[data-change-kind]')).toHaveCount(0)
  await highlight.check()
  await expect(comparison.locator('[data-selected-change]')).toHaveCount(0)
  await button(comparison, '返回列表').click()
  await expect(list).toBeVisible()
})

test('the grouped change list selects an individual change on both boards', async ({ page }) => {
  await seedSavedMatches(page, 9)
  const matches = page.getByRole('region', { name: '未完成的对局', exact: true })
  for (const mode of ['timed', 'relaxed']) {
    await matches.locator(`[data-unfinished-match="${freightId}"][data-mode="${mode}"]`)
      .getByRole('checkbox', { name: '加入对比', exact: true }).check()
  }
  await button(matches, '对比所选').click()

  const comparison = page.getByRole('region', { name: '对比存档', exact: true })
  const timed = comparison.locator('[data-compared-match][data-mode="timed"]')
  const relaxed = comparison.locator('[data-compared-match][data-mode="relaxed"]')
  const boards = [timed, relaxed]
  const detail = comparison.getByRole('region', { name: '选中的变化', exact: true })
  const changeList = comparison.getByRole('region', { name: '变化清单', exact: true })
  const highlight = comparison.getByRole('checkbox', { name: '标出变化', exact: true })
  const row = (kind: string, id: string) => changeList.locator(`button[data-change-list-kind="${kind}"][data-change-list-id="${id}"]`)

  await expect(changeList).toHaveCount(0)
  await highlight.check()
  for (const heading of ['芽芽和对手', '电池', '通道']) {
    await expect(changeList.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }

  await row('player', 'player').click()
  await expect(row('player', 'player')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'player', [[5, 7], [9, 5]])
  await expectSavedStates(detail, 'player', '(5, 7)', '(9, 5)')

  await row('rivals', 'relay').click()
  await expect(row('rivals', 'relay')).toHaveAttribute('aria-pressed', 'true')
  await expect(row('rivals', 'compass')).toHaveAttribute('aria-pressed', 'false')
  await expect(row('player', 'player')).toHaveAttribute('aria-pressed', 'false')
  await expectSelectedCells(boards, 'rivals', [[6, 6], [3, 5]])
  await expectSavedStates(detail, 'relay', '(6, 6)', '(3, 5)')
  await expect(detail.locator('[data-selected-change-entity="compass"]')).toHaveCount(0)

  await cell(relaxed, [3, 5]).locator('button[data-change-kind="rivals"]').click()
  await expectSelectedCells(boards, 'rivals', [[3, 5], [6, 6], [5, 5]])
  await expectSavedStates(detail, 'compass', '(5, 5)', '(3, 5)')
  await expect(row('rivals', 'relay')).toHaveAttribute('aria-pressed', 'true')
  await expect(row('rivals', 'compass')).toHaveAttribute('aria-pressed', 'true')

  await page.setViewportSize({ width: 320, height: 760 })
  await row('battery', 'shipment-3').click()
  await expect(row('battery', 'shipment-3')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'battery', [[6, 2], [2, 5]])
  await expectSavedStates(detail, 'shipment-3', '(6, 2)', '(2, 5)')
  await expect(detail).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await button(page, 'EN').click()
  const englishList = page.getByRole('region', { name: 'Change list', exact: true })
  for (const heading of ['Sprout and rivals', 'Batteries', 'Gates']) {
    await expect(englishList.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  await button(page, '中文').click()
  await page.setViewportSize({ width: 1366, height: 900 })

  await row('battery', 'battery-2').click()
  await expectSelectedCells(boards, 'battery', [[4, 1]])
  await expectSavedStates(detail, 'battery-2', '(4, 1)', '已取走')

  await row('gate', '4,4').click()
  await expect(row('gate', '4,4')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'gate', [[4, 4]])
  await expectSavedStates(detail, '4,4', '开着', '关着')
  await expect(button(timed, '继续这局')).toBeEnabled()
  await expect(button(relaxed, '继续这局')).toBeEnabled()

  await highlight.uncheck()
  await expect(changeList).toHaveCount(0)
  await expect(detail).toHaveCount(0)
  await button(comparison, '返回列表').click()
  await expect(matches).toBeVisible()
})

test('change filters and navigation keep the list, boards and details in sync', async ({ page }) => {
  await seedSavedMatches(page, 9)
  const matches = page.getByRole('region', { name: '未完成的对局', exact: true })
  for (const mode of ['timed', 'relaxed']) {
    await matches.locator(`[data-unfinished-match="${freightId}"][data-mode="${mode}"]`)
      .getByRole('checkbox', { name: '加入对比', exact: true }).check()
  }
  await button(matches, '对比所选').click()

  const comparison = page.getByRole('region', { name: '对比存档', exact: true })
  const timed = comparison.locator('[data-compared-match][data-mode="timed"]')
  const relaxed = comparison.locator('[data-compared-match][data-mode="relaxed"]')
  const boards = [timed, relaxed]
  const detail = comparison.getByRole('region', { name: '选中的变化', exact: true })
  const list = comparison.getByRole('region', { name: '变化清单', exact: true })
  const filter = list.getByRole('combobox', { name: '变化分类', exact: true })
  const rows = list.locator('button[data-change-list-id]')
  const row = (id: string) => list.locator(`button[data-change-list-id="${id}"]`)
  const status = list.getByRole('status')
  const previous = button(list, '上一条')
  const next = button(list, '下一条')
  await comparison.getByRole('checkbox', { name: '标出变化', exact: true }).check()
  await expect(filter).toHaveValue('all')
  await expect(rows).toHaveCount(16)
  const total = await rows.count()
  await expect(status).toHaveText(`共 ${total} 条`)
  await expect(previous).toBeDisabled()

  await next.click()
  await expect(status).toHaveText(`第 1 条，共 ${total} 条`)
  await expect(previous).toBeDisabled()
  await expect(row('player')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'player', [[5, 7], [9, 5]])

  await next.click()
  await expect(status).toHaveText(`第 2 条，共 ${total} 条`)
  await expect(row('compass')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'rivals', [[5, 5], [3, 5]])
  await expectSavedStates(detail, 'compass', '(5, 5)', '(3, 5)')

  await filter.selectOption('actors')
  await expect(list.getByRole('heading', { name: '电池', exact: true })).toHaveCount(0)
  await expect(list.getByRole('heading', { name: '通道', exact: true })).toHaveCount(0)
  await expect(rows).toHaveCount(5)
  const actorCount = await rows.count()
  await expect(status).toHaveText(`第 2 条，共 ${actorCount} 条`)
  await expect(row('compass')).toHaveAttribute('aria-pressed', 'true')
  await previous.click()
  await expect(status).toHaveText(`第 1 条，共 ${actorCount} 条`)
  await expectSelectedCells(boards, 'player', [[5, 7], [9, 5]])
  await expectSavedStates(detail, 'player', '(5, 7)', '(9, 5)')

  await cell(relaxed, [2, 5]).locator('button[data-change-kind="battery"]').click()
  await expect(filter).toHaveValue('batteries')
  await expect(row('player')).toHaveCount(0)
  await expect(rows).toHaveCount(7)
  const batteryIds = await rows.evaluateAll(items => items.map(item => item.getAttribute('data-change-list-id')))
  await expect(status).toHaveText(`第 ${batteryIds.indexOf('shipment-3') + 1} 条，共 ${batteryIds.length} 条`)
  await expect(row('shipment-3')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'battery', [[6, 2], [2, 5]])
  await expectSavedStates(detail, 'shipment-3', '(6, 2)', '(2, 5)')

  await filter.selectOption('gates')
  await expect(row('shipment-3')).toHaveCount(0)
  await expect(rows).toHaveCount(4)
  const gateCount = await rows.count()
  await expect(status).toHaveText(`第 1 条，共 ${gateCount} 条`)
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(previous).toBeDisabled()
  await rows.last().click()
  await expect(status).toHaveText(`第 ${gateCount} 条，共 ${gateCount} 条`)
  await expect(next).toBeDisabled()

  await cell(relaxed, [3, 5]).locator('button[data-change-kind="rivals"]').click()
  await expect(filter).toHaveValue('actors')
  await expect(status).toHaveText(`第 2 条，共 ${actorCount} 条`)
  await expect(row('compass')).toHaveAttribute('aria-pressed', 'true')
  await expect(row('relay')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'rivals', [[3, 5], [6, 6], [5, 5]])

  await page.setViewportSize({ width: 320, height: 760 })
  await button(page, 'EN').click()
  const englishComparison = page.getByRole('region', { name: 'Compare saved matches', exact: true })
  const english = englishComparison.getByRole('region', { name: 'Change list', exact: true })
  await expect(english.getByRole('combobox', { name: 'Change category', exact: true })).toHaveValue('actors')
  await button(english, 'Previous').click()
  await expect(english.getByRole('status')).toHaveText(`1 of ${actorCount}`)
  const englishBoards = englishComparison.getByTestId('compared-arena-board')
  await expectSelectedCells([englishBoards.nth(0), englishBoards.nth(1)], 'player', [[5, 7], [9, 5]])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('autoplay stays in the selected category and leaves manual navigation in control', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await seedSavedMatches(page, 9)
  const matches = page.getByRole('region', { name: '未完成的对局', exact: true })
  for (const mode of ['timed', 'relaxed']) {
    await matches.locator(`[data-unfinished-match="${freightId}"][data-mode="${mode}"]`)
      .getByRole('checkbox', { name: '加入对比', exact: true }).check()
  }
  await button(matches, '对比所选').click()

  const comparison = page.getByRole('region', { name: '对比存档', exact: true })
  const timed = comparison.locator('[data-compared-match][data-mode="timed"]')
  const relaxed = comparison.locator('[data-compared-match][data-mode="relaxed"]')
  const boards = [timed, relaxed]
  const detail = comparison.getByRole('region', { name: '选中的变化', exact: true })
  const list = comparison.getByRole('region', { name: '变化清单', exact: true })
  const highlight = comparison.getByRole('checkbox', { name: '标出变化', exact: true })
  const filter = list.getByRole('combobox', { name: '变化分类', exact: true })
  const status = list.getByRole('status')
  const row = (id: string) => list.locator(`button[data-change-list-id="${id}"]`)
  const play = button(list, '自动播放')
  const pause = button(list, '暂停播放')
  const resume = button(list, '继续播放')
  await highlight.check()
  await filter.selectOption('gates')
  await row('4,4').click()
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'))

  async function expectGate(index: number, x: number, timedState: '开着' | '关着') {
    await expect(status).toHaveText(`第 ${index} 条，共 4 条`)
    await expect(row(`${x},4`)).toHaveAttribute('aria-pressed', 'true')
    await expectSelectedCells(boards, 'gate', [[x, 4]])
    await expectSavedStates(detail, `${x},4`, timedState, timedState === '开着' ? '关着' : '开着')
  }

  await play.click()
  await expect(pause).toBeVisible()
  await page.clock.runFor(2_000)
  await expectGate(2, 4, '开着')

  await pause.click()
  await page.clock.runFor(8_000)
  await expect(resume).toBeVisible()
  await expectGate(2, 4, '开着')

  await resume.click()
  await page.clock.runFor(2_000)
  await expectGate(2, 4, '开着')
  await page.clock.runFor(600)
  await expectGate(3, 9, '开着')
  await page.clock.runFor(2_600)
  await expectGate(4, 10, '关着')
  await page.clock.runFor(8_000)
  await expect(play).toBeDisabled()
  await expectGate(4, 10, '关着')

  const previous = button(list, '上一条')
  await previous.click()
  await play.click()
  await previous.click()
  await page.clock.runFor(8_000)
  await expect(play).toBeVisible()
  await expectGate(2, 4, '开着')

  await play.click()
  await cell(relaxed, [2, 5]).locator('button[data-change-kind="battery"]').click()
  await page.clock.runFor(8_000)
  await expect(play).toBeVisible()
  await expect(filter).toHaveValue('batteries')
  await expectSelectedCells(boards, 'battery', [[6, 2], [2, 5]])
  await expectSavedStates(detail, 'shipment-3', '(6, 2)', '(2, 5)')

  await play.click()
  await row('battery-2').click()
  await page.clock.runFor(8_000)
  await expect(play).toBeVisible()
  await expect(row('battery-2')).toHaveAttribute('aria-pressed', 'true')
  await expectSelectedCells(boards, 'battery', [[4, 1]])

  await play.click()
  await filter.selectOption('gates')
  await page.clock.runFor(8_000)
  await expect(play).toBeVisible()
  await expectGate(1, 2, '关着')

  await play.click()
  await highlight.uncheck()
  await page.clock.runFor(8_000)
  await expect(list).toHaveCount(0)
  await highlight.check()
  await expect(status).toHaveText('共 16 条')
  await expect(detail).toHaveCount(0)
  await play.click()
  await expect(status).toHaveText('第 1 条，共 16 条')
  await expectSelectedCells(boards, 'player', [[5, 7], [9, 5]])
  await button(page, 'EN').click()
  const englishList = page.getByRole('region', { name: 'Change list', exact: true })
  await expect(button(englishList, 'Pause autoplay')).toBeVisible()
  await page.clock.runFor(2_600)
  await expect(englishList.getByRole('status')).toHaveText('2 of 16')
})
