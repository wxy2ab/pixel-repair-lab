import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ArenaLevel } from '../src/shared/advanced'
import type { Catalog } from '../src/shared/types'

const recentArenaId = 'challenge-freight-carousel'
const earlierArenaId = 'challenge-junction-race'
const gridId = 'limited-battery-salvage'

function button(container: Page | Locator, name: string) {
  return container.getByRole('button', { name, exact: true })
}

function recentMatch(page: Page) {
  return page.getByRole('region', { name: '最近保存的对局', exact: true })
}

async function openChallenge(page: Page, id: string) {
  await button(page, '挑战场').click()
  await page.locator(`[data-challenge-level="${id}"]`).click()
}

async function checkSavedScores(card: Locator, level: ArenaLevel, expected: string[]) {
  const scores = card.getByRole('list', { name: '比分', exact: true })
  const actors = [{ id: 'player', name: '芽芽' }, ...level.opponents.map(bot => ({ id: bot.id, name: bot.title.zh }))]
  await expect(scores.getByRole('listitem')).toHaveCount(actors.length)
  for (const [index, { id, name }] of actors.entries()) {
    const score = scores.locator(`[data-actor-id="${id}"]`)
    await expect(score).toContainText(name)
    await expect(score.locator('strong')).toHaveText(expected[index])
  }
}

async function readLiveBoard(page: Page, level: ArenaLevel) {
  const opponents = level.opponents.map(actor => actor.id)
  const gates = (level.shifts ?? []).flatMap(shift => [
    ...(shift.open ?? []), ...(shift.close ?? []),
  ]).map(({ x, y }) => `${x},${y}`)
  return page.locator('.tilemap [data-x][data-y]').evaluateAll((cells, { opponents, gates }) => cells.map(cell => {
    const x = cell.getAttribute('data-x')
    const y = cell.getAttribute('data-y')
    const wall = cell.classList.contains('tile--wall')
    const actors = Array.from(cell.querySelectorAll('.rival-marker small'),
      marker => opponents[Number(marker.textContent) - 1])
    if (cell.querySelector(':scope > .pixel-bot')) actors.push('player')
    return {
      x, y, tile: wall ? 'wall' : 'floor', gate: gates.includes(`${x},${y}`) ? (wall ? 'closed' : 'open') : null,
      item: cell.getAttribute('data-item-id'), actors: actors.sort(),
    }
  }), { opponents, gates })
}

async function checkSavedBoard(card: Locator, expected: Awaited<ReturnType<typeof readLiveBoard>>) {
  const board = card.getByTestId('recent-arena-board')
  await expect(board).toBeVisible()
  const cells = await board.locator('[data-x][data-y]').evaluateAll(elements => elements.map(cell => ({
    x: cell.getAttribute('data-x'), y: cell.getAttribute('data-y'),
    tile: cell.getAttribute('data-tile'), gate: cell.getAttribute('data-gate'), item: cell.getAttribute('data-item-id'),
    actors: Array.from(cell.querySelectorAll('[data-actor-id]'), actor => actor.getAttribute('data-actor-id')).sort(),
  })))
  expect(cells).toEqual(expected)
}

test('home shows the newest saved match separately from the last challenge and resumes it paused', async ({ page, request }) => {
  test.slow()
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const older = levels.find(level => level.id === earlierArenaId)
  const newer = levels.find(level => level.id === recentArenaId)
  const grid = levels.find(level => level.id === gridId)
  if (older?.kind !== 'arena' || newer?.kind !== 'arena' || grid?.kind !== 'grid') {
    throw new Error('Missing recent-match fixtures')
  }

  await page.goto('/')
  await openChallenge(page, older.id)
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(older.solutionCode)
  await button(page, '运行').click()
  await page.getByRole('slider', { name: '回放进度', exact: true }).fill('3')
  await expect(page.getByTestId('arena-turn')).toHaveText(`回合 3/${older.maxTurns}`)
  const relaxedScores = await page.locator('.scoreboard li strong').allTextContents()
  const relaxedBoard = await readLiveBoard(page, older)

  await openChallenge(page, newer.id)
  await button(page, '紧张').click()
  await button(page, '开始').click()
  const turn = page.getByTestId('arena-turn')
  const actions = page.getByRole('group', { name: '下一回合动作', exact: true })
  await button(actions, '向左').click()
  await expect(turn).toHaveText(`回合 1/${newer.maxTurns}`)
  await button(actions, '拾取').click()
  await expect(turn).toHaveText(`回合 2/${newer.maxTurns}`)
  await expect(turn).toHaveText(`回合 4/${newer.maxTurns}`)
  const timedScores = await page.locator('.scoreboard li strong').allTextContents()
  expect(timedScores[0]).toBe('1')
  const timedBoard = await readLiveBoard(page, newer)
  expect(timedBoard.find(cell => cell.x === '4' && cell.y === '4')?.gate).toBe('open')
  expect(timedBoard.find(cell => cell.x === '2' && cell.y === '4')?.gate).toBe('closed')
  expect(timedBoard.some(cell => cell.item === 'battery-5')).toBe(false)
  expect(timedBoard.find(cell => cell.item === 'shipment-1')).toMatchObject({ x: '4', y: '3' })
  await openChallenge(page, grid.id)
  await button(page, '学习模块').click()

  const savedRemaining = await page.evaluate(id => {
    const raw = localStorage.getItem(`pixel-repair-lab:arena-match:${id}:timed`)
    return raw ? (JSON.parse(raw) as { progress: { remainingMs: number } }).progress.remainingMs : 0
  }, newer.id)
  expect(savedRemaining).toBeGreaterThan(0)
  const recent = recentMatch(page)
  const continueCard = page.getByRole('region', { name: '继续闯关', exact: true })
  await expect(continueCard).toContainText(grid.title.zh)
  await expect(recent.locator(`[data-recent-match="${newer.id}"][data-mode="timed"]`)).toHaveAttribute('data-match-turn', '4')
  await expect(recent).toContainText(newer.title.zh)
  await expect(recent).toContainText('紧张模式')
  await expect(recent).toContainText(new RegExp(`4\\s*/\\s*${newer.maxTurns}`, 'u'))
  await checkSavedScores(recent, newer, timedScores)
  await checkSavedBoard(recent, timedBoard)
  const savedTime = recent.locator('[data-remaining-ms]')
  await expect(savedTime).toHaveAttribute('data-remaining-ms', String(savedRemaining))
  await expect(savedTime).toContainText(`${(savedRemaining / 1_000).toFixed(1)} 秒`)
  await expect(recent).toContainText('剩余时间')

  await page.setViewportSize({ width: 320, height: 760 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await expect(recent.getByRole('list', { name: '比分', exact: true })).toBeVisible()
  await expect(recent.getByTestId('recent-arena-board')).toBeVisible()
  await page.setViewportSize({ width: 1366, height: 900 })

  await button(recent, '打开这局').click()
  await expect(page.getByRole('heading', { name: newer.title.zh, level: 1, exact: true })).toBeVisible()
  await expect(button(page, '紧张')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, '继续对局')).toBeEnabled()
  await expect(turn).toHaveText(`回合 4/${newer.maxTurns}`)
  const countdown = page.getByRole('progressbar', { name: '距离下一回合', exact: true })
  await expect(countdown).toHaveAttribute('value', String(savedRemaining))
  await page.waitForTimeout(1_950)
  await expect(turn).toHaveText(`回合 4/${newer.maxTurns}`)
  await expect(countdown).toHaveAttribute('value', String(savedRemaining))

  await button(page, '学习模块').click()
  await button(recent, '查看全部未完成的对局').click()
  await expect(page).toHaveURL(/#unfinished-matches$/u)
  const list = page.getByRole('region', { name: '未完成的对局', exact: true })
  const timed = list.locator(`[data-unfinished-match="${newer.id}"][data-mode="timed"]`)
  await button(timed, '放弃对局').click()
  const modal = page.getByRole('dialog', { name: '放弃这局？', exact: true })
  await button(modal, '确认放弃').click()
  await expect(timed).toHaveCount(0)

  await button(page, '学习模块').click()
  await expect(recent.locator(`[data-recent-match="${older.id}"][data-mode="relaxed"]`)).toHaveAttribute('data-match-turn', '3')
  await expect(recent).toContainText(older.title.zh)
  await expect(recent).toContainText('从容模式')
  await expect(recent).toContainText('不限时')
  await expect(recent).toContainText(new RegExp(`3\\s*/\\s*${older.maxTurns}`, 'u'))
  await checkSavedScores(recent, older, relaxedScores)
  await checkSavedBoard(recent, relaxedBoard)
  await button(recent, '打开这局').click()
  await expect(turn).toHaveText(`回合 3/${older.maxTurns}`)
  await expect(button(page, '播放回放')).toBeVisible()
})

test('the empty recent-match card offers the full list on a bilingual narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('/')
  const recent = recentMatch(page)
  await expect(recent).toContainText('还没有未完成的对局。')
  await expect(recent.getByTestId('recent-arena-board')).toHaveCount(0)
  await expect(button(recent, '打开这局')).toHaveCount(0)
  await expect(button(recent, '查看全部未完成的对局')).toBeVisible()

  await button(page, 'EN').click()
  const english = page.getByRole('region', { name: 'Most recent saved match', exact: true })
  await expect(english).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await button(english, 'View all unfinished matches').click()
  await expect(page).toHaveURL(/#unfinished-matches$/u)
  await expect(page.getByRole('region', { name: 'Unfinished matches', exact: true })).toBeVisible()
})
