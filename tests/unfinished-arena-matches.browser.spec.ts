import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ArenaLevel } from '../src/shared/advanced'
import type { Catalog } from '../src/shared/types'
import { challengeDraftKey } from '../src/web/challengeDraft'
import { challengeScoreSeries, challengeScoresKey, readChallengeScores } from '../src/web/challengeScore'

const freightId = 'challenge-freight-carousel'
const junctionId = 'challenge-junction-race'

function button(container: Locator | Page, name: string) {
  return container.getByRole('button', { name, exact: true })
}

function matches(page: Page) {
  return page.getByRole('region', { name: '未完成的对局', exact: true })
}

async function openMatches(page: Page) {
  const arena = page.getByRole('region', { name: '挑战场', exact: true })
  await button(arena, '未完成的对局').click()
  await expect(page).toHaveURL(/#unfinished-matches$/u)
  await expect(matches(page)).toBeVisible()
}

async function selectChallenge(page: Page, levelId: string) {
  await button(page, '挑战场').click()
  await page.locator(`[data-challenge-level="${levelId}"]`).click()
}

async function stopRelaxedOnTurn(page: Page, level: ArenaLevel, turn: number) {
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(level.solutionCode)
  await button(page, '运行').click()
  await page.getByRole('slider', { name: '回放进度', exact: true }).fill(String(turn))
  await expect(page.getByTestId('arena-turn')).toHaveText(`回合 ${turn}/${level.maxTurns}`)
}

async function checkScores(row: Locator, level: ArenaLevel, expected: string[]) {
  const scores = row.getByRole('list', { name: '比分', exact: true })
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

async function checkSavedBoard(row: Locator, expected: Awaited<ReturnType<typeof readLiveBoard>>) {
  const board = row.getByTestId('unfinished-arena-board')
  await expect(board).toBeVisible()
  const cells = await board.locator('[data-x][data-y]').evaluateAll(elements => elements.map(cell => ({
    x: cell.getAttribute('data-x'), y: cell.getAttribute('data-y'),
    tile: cell.getAttribute('data-tile'), gate: cell.getAttribute('data-gate'), item: cell.getAttribute('data-item-id'),
    actors: Array.from(cell.querySelectorAll('[data-actor-id]'), actor => actor.getAttribute('data-actor-id')).sort(),
  })))
  expect(cells).toEqual(expected)
}

test('unfinished matches keep each level and pace available to continue or restart', async ({ page, request }) => {
  test.slow()
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const freight = levels.find(level => level.id === freightId)
  const junction = levels.find(level => level.id === junctionId)
  if (freight?.kind !== 'arena' || junction?.kind !== 'arena') throw new Error('Missing saved-match arena fixtures')

  await page.goto('/#challenge-zone')
  await selectChallenge(page, freightId)
  await button(page, '紧张').click()
  await button(page, '开始').click()
  const turn = page.getByTestId('arena-turn')
  const actions = page.getByRole('group', { name: '下一回合动作', exact: true })
  await button(actions, '向左').click()
  await expect(turn).toHaveText('回合 1/20')
  await button(actions, '拾取').click()
  await expect(turn).toHaveText('回合 2/20')
  await expect(turn).toHaveText('回合 4/20')
  const timedScores = await page.locator('.scoreboard li strong').allTextContents()
  expect(timedScores[0]).toBe('1')
  const timedBoard = await readLiveBoard(page, freight)
  expect(timedBoard.find(cell => cell.x === '4' && cell.y === '4')?.gate).toBe('open')
  expect(timedBoard.find(cell => cell.x === '2' && cell.y === '4')?.gate).toBe('closed')
  expect(timedBoard.some(cell => cell.item === 'battery-5')).toBe(false)
  expect(timedBoard.find(cell => cell.item === 'shipment-1')).toMatchObject({ x: '4', y: '3' })

  await button(page, '从容').click()
  await stopRelaxedOnTurn(page, freight, 6)
  const relaxedScores = await page.locator('.scoreboard li strong').allTextContents()
  const relaxedBoard = await readLiveBoard(page, freight)
  await selectChallenge(page, junctionId)
  await stopRelaxedOnTurn(page, junction, 3)
  const secondScores = await page.locator('.scoreboard li strong').allTextContents()
  const secondBoard = await readLiveBoard(page, junction)
  await button(page, '挑战场').click()
  await openMatches(page)
  await page.reload()

  const list = matches(page)
  const timed = list.locator(`[data-unfinished-match="${freightId}"][data-mode="timed"]`)
  const relaxed = list.locator(`[data-unfinished-match="${freightId}"][data-mode="relaxed"]`)
  const second = list.locator(`[data-unfinished-match="${junctionId}"][data-mode="relaxed"]`)
  await expect(list.locator('[data-unfinished-match]')).toHaveCount(3)
  await expect(timed.getByRole('heading', { name: freight.title.zh, exact: true })).toBeVisible()
  await expect(relaxed.getByRole('heading', { name: freight.title.zh, exact: true })).toBeVisible()
  await expect(second.getByRole('heading', { name: junction.title.zh, exact: true })).toBeVisible()
  await expect(timed).toHaveAttribute('data-match-turn', '4')
  await expect(relaxed).toHaveAttribute('data-match-turn', '6')
  await expect(second).toHaveAttribute('data-match-turn', '3')
  await checkScores(timed, freight, timedScores)
  await checkScores(relaxed, freight, relaxedScores)
  await checkScores(second, junction, secondScores)
  await checkSavedBoard(timed, timedBoard)
  await checkSavedBoard(relaxed, relaxedBoard)
  await checkSavedBoard(second, secondBoard)
  await expect(relaxed).toContainText('不限时')
  await expect(second).toContainText('不限时')
  const remaining = await timed.getAttribute('data-remaining-ms')
  expect(Number(remaining)).toBeGreaterThan(0)
  expect(Number(remaining)).toBeLessThanOrEqual(1_800)
  await expect(timed).toContainText((Number(remaining) / 1_000).toFixed(1))

  await page.setViewportSize({ width: 320, height: 760 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await expect(list.getByTestId('unfinished-arena-board')).toHaveCount(3)
  await page.setViewportSize({ width: 1366, height: 900 })

  await button(timed, '继续').click()
  await expect(button(page, '紧张')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, '继续对局')).toBeEnabled()
  await expect(turn).toHaveText('回合 4/20')
  expect(await readLiveBoard(page, freight)).toEqual(timedBoard)
  const countdown = page.getByRole('progressbar', { name: '距离下一回合', exact: true })
  await expect(countdown).toHaveAttribute('value', remaining!)
  // Wait longer than a live turn to verify that opening the match leaves the timer paused.
  await page.waitForTimeout(1_950)
  await expect(turn).toHaveText('回合 4/20')
  await expect(countdown).toHaveAttribute('value', remaining!)
  await button(page, '继续对局').click()
  await expect(turn).toHaveText('回合 5/20')

  await button(page, '挑战场').click()
  await openMatches(page)
  await button(timed, '重新开始').click()
  await expect(button(page, '紧张')).toHaveAttribute('aria-pressed', 'true')
  await expect(turn).toHaveText('回合 0/20')
  await expect(button(page, '开始')).toBeEnabled()
  await expect(button(page, '继续对局')).toHaveCount(0)
  await button(page, '挑战场').click()
  await openMatches(page)
  await expect(list.locator('[data-unfinished-match]')).toHaveCount(2)
  await expect(timed).toHaveCount(0)
  await expect(second).toHaveAttribute('data-match-turn', '3')

  await button(relaxed, '继续').click()
  await expect(button(page, '从容')).toHaveAttribute('aria-pressed', 'true')
  await expect(turn).toHaveText('回合 6/20')
  await expect(button(page, '播放回放')).toBeVisible()
})

test('saved matches sort by save time and abandoning one preserves drafts and records', async ({ page, request }) => {
  test.slow()
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const freight = levels.find(level => level.id === freightId)
  const junction = levels.find(level => level.id === junctionId)
  if (freight?.kind !== 'arena' || junction?.kind !== 'arena') throw new Error('Missing saved-match arena fixtures')

  await page.goto('/#challenge-zone')
  await selectChallenge(page, freightId)
  await stopRelaxedOnTurn(page, freight, 5)
  await button(page, '跳到结尾').click()
  const summary = page.getByRole('region', { name: '通关总结', exact: true })
  await expect(summary).toBeVisible()
  await button(summary, '再玩一次').click()
  await stopRelaxedOnTurn(page, freight, 6)
  await selectChallenge(page, junctionId)
  await stopRelaxedOnTurn(page, junction, 3)
  await selectChallenge(page, freightId)
  await button(page, '紧张').click()
  const policy = 'def decide(state):\n    return "wait"\n# Keep this draft'
  await page.locator('#realtime-python').fill(policy)
  await button(page, '开始').click()
  await expect(page.getByTestId('arena-turn')).toHaveText('回合 1/20')
  await button(page, '挑战场').click()
  await openMatches(page)

  const rows = matches(page).locator('[data-unfinished-match]')
  const rowOrder = () => rows.evaluateAll(elements => elements.map(element =>
    `${element.getAttribute('data-unfinished-match')}:${element.getAttribute('data-mode')}`))
  await expect.poll(rowOrder).toEqual([`${freightId}:timed`, `${junctionId}:relaxed`, `${freightId}:relaxed`])

  const timedKey = `pixel-repair-lab:arena-match:${freightId}:timed`
  const relaxedKey = `pixel-repair-lab:arena-match:${freightId}:relaxed`
  const otherKey = `pixel-repair-lab:arena-match:${junctionId}:relaxed`
  const draftKey = challengeDraftKey(freightId)
  await page.evaluate(key => {
    const raw = localStorage.getItem(key)
    if (!raw) throw new Error('Missing checkpoint for legacy test')
    const checkpoint = JSON.parse(raw)
    delete checkpoint.savedAt
    localStorage.setItem(key, JSON.stringify(checkpoint))
  }, otherKey)
  await page.reload()
  await expect.poll(rowOrder).toEqual([`${freightId}:timed`, `${freightId}:relaxed`, `${junctionId}:relaxed`])

  const readSaves = () => page.evaluate(keys => keys.map(key => localStorage.getItem(key)),
    [timedKey, relaxedKey, otherKey, draftKey, challengeScoresKey])
  const before = await readSaves()
  expect(before.every(value => value !== null)).toBe(true)
  expect(JSON.parse(before[3] ?? '{}')).toMatchObject({ source: freight.solutionCode.replace(/\r\n?/gu, '\n'), policy })
  expect(challengeScoreSeries(readChallengeScores(before[4]), freightId)[0]?.attempts).toHaveLength(1)

  const timed = matches(page).locator(`[data-unfinished-match="${freightId}"][data-mode="timed"]`)
  const confirm = page.getByRole('dialog', { name: '放弃这局？', exact: true })
  await button(timed, '放弃对局').click()
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText(freight.title.zh)
  await expect(confirm).toContainText('紧张')
  expect(await readSaves()).toEqual(before)
  await button(confirm, '取消').click()
  await expect(confirm).toBeHidden()
  await expect(rows).toHaveCount(3)
  expect(await readSaves()).toEqual(before)

  await button(timed, '放弃对局').click()
  await button(confirm, '确认放弃').click()
  await expect(confirm).toBeHidden()
  await expect.poll(rowOrder).toEqual([`${freightId}:relaxed`, `${junctionId}:relaxed`])
  await page.reload()
  await expect.poll(rowOrder).toEqual([`${freightId}:relaxed`, `${junctionId}:relaxed`])
  expect(await readSaves()).toEqual([null, ...before.slice(1)])
})

test('an empty saved-match list is bilingual, fits a phone, and links back to challenge selection', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('/#challenge-zone')
  await openMatches(page)
  await expect(matches(page)).toContainText('还没有未完成的对局。')
  await button(page, 'EN').click()
  const english = page.getByRole('region', { name: 'Unfinished matches', exact: true })
  await expect(english).toContainText('No unfinished matches yet.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await button(english, 'Browse challenges').click()
  await expect(page.getByRole('region', { name: 'Browse challenges', exact: true })).toBeFocused()
})
