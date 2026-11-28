import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Catalog } from '../src/shared/types'
import { challengeScoreSeries, challengeScoresKey, readChallengeScores } from '../src/web/challengeScore'

const arenaId = 'challenge-freight-carousel'
const timedKey = `pixel-repair-lab:arena-match:${arenaId}:timed`
const replayKey = `pixel-repair-lab:arena-match:${arenaId}:relaxed`

async function openArena(page: Page) {
  await page.goto('/#challenge-zone')
  await page.locator(`[data-challenge-level="${arenaId}"]`).click()
}

// A restored board is stationary. Compare every tile, piece and trail without
// including the transient gesture that was playing when the match was saved.
async function boardLayout(tilemap: Locator) {
  return tilemap.evaluate(board => {
    const copy = board.cloneNode(true) as HTMLElement
    const active = copy.querySelector('.action-robot')
    if (active) {
      const player = document.createElement('span')
      player.className = 'pixel-bot'
      player.setAttribute('aria-hidden', 'true')
      active.replaceWith(player)
    }
    return copy.innerHTML
  })
}

test('a timed match restores the exact checkpoint and waits for an explicit resume', async ({ page }) => {
  await openArena(page)
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await page.getByRole('button', { name: '应用策略', exact: true }).click()
  await expect(page.getByText('策略已启用', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '开始', exact: true }).click()
  const turn = page.getByTestId('arena-turn')
  const actions = page.getByRole('group', { name: '下一回合动作', exact: true })
  const timer = page.getByRole('progressbar', { name: '距离下一回合', exact: true })
  const board = page.getByTestId('arena-dynamic-board')
  const tilemap = board.getByRole('img', { name: /^机器人位于/u })
  await actions.getByRole('button', { name: '向右', exact: true }).click()
  await expect(turn).toHaveText('回合 1/20')
  await expect(tilemap.locator('[data-trail="recent"]')).toHaveCount(2)
  await actions.getByRole('button', { name: '拾取', exact: true }).click()
  await expect.poll(() => page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) ?? 'null')?.progress.queued, timedKey)).toBe('pick')
  await expect(tilemap.locator('[data-robot-action="move"]')).toHaveAttribute('data-direction', 'right')
  const savedBoard = await boardLayout(tilemap)
  const savedScores = await board.locator('.scoreboard').textContent()
  await expect.poll(async () => Number(await timer.getAttribute('value'))).toBeLessThan(1_300)

  await page.reload()
  const resume = page.getByRole('button', { name: '继续对局', exact: true })
  await expect(resume).toBeEnabled()
  await expect(turn).toHaveText('回合 1/20')
  expect(await boardLayout(tilemap)).toBe(savedBoard)
  await expect(tilemap.locator('[data-robot-action]')).toHaveCount(0)
  await expect(tilemap.locator('[data-trail="recent"]')).toHaveCount(2)
  expect(await board.locator('.scoreboard').textContent()).toBe(savedScores)
  await expect(page.getByText('策略已启用', { exact: true })).toBeVisible()
  const frozen = await timer.getAttribute('value')
  expect(Number(frozen)).toBeGreaterThan(0)
  expect(Number(frozen)).toBeLessThan(1_300)
  expect(Number(frozen)).toBe(await page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) ?? 'null')?.progress.remainingMs, timedKey))

  // Wait longer than a full turn to prove that no timer runs while restored.
  await page.waitForTimeout(1_950)
  await expect(turn).toHaveText('回合 1/20')
  await expect(timer).toHaveAttribute('value', frozen!)
  await page.getByRole('button', { name: '保存步骤到代码' }).click()
  // The next pickup is queued in this checkpoint. Only the first move has played.
  await expect(page.locator('#realtime-python')).toHaveValue(/actions = \[\s*"right",\s*\]/)
  await page.getByRole('button', { name: '学习模块', exact: true }).click()
  const home = page.getByRole('region', { name: '继续闯关', exact: true })
  await expect(home.getByTestId('saved-arena-match')).toBeVisible()
  await home.locator(`[data-continue-challenge="${arenaId}"]`).click()
  await expect(timer).toHaveAttribute('value', frozen!)
  await expect(page.locator('#realtime-python')).toHaveValue(/actions = \[\s*"right",\s*\]/)
  await resume.click()
  await expect(turn).toHaveText('回合 2/20')
  expect(await page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) ?? 'null')?.progress.actions[1], timedKey)).toBe('pick')
  await page.getByTestId('play-toolbar').getByRole('button', { name: '暂停对局', exact: true }).click()
  await expect(resume).toBeEnabled()
  await expect(page.locator('.arena-clock')).toHaveAttribute('data-paused', 'true')

  await page.getByRole('button', { name: '重新开始', exact: true }).click()
  await expect(turn).toHaveText('回合 0/20')
  await expect(page.getByRole('button', { name: '开始', exact: true })).toBeEnabled()
  expect(await page.evaluate(key => localStorage.getItem(key), timedKey)).toBeNull()
})

test('the relaxed toolbar steps one turn from the draft and draws only the visible part of the route', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await openArena(page)
  const editor = page.getByRole('textbox', { name: '编写 Python', exact: true })
  await editor.fill('move("right")\nmove("up")\nwait()')
  const bar = page.getByTestId('play-toolbar')
  const step = bar.getByRole('button', { name: '单步执行', exact: true })
  const route = page.locator('.tilemap')
  const turn = page.getByTestId('arena-turn')
  const cursor = page.getByRole('slider', { name: '回放进度', exact: true })
  await step.click()
  await expect(turn).toHaveText('回合 1/20')
  await expect(bar).toContainText('第 1 行')
  await expect(route.locator('[data-trail="recent"]')).toHaveCount(2)
  await expect(route.locator('[data-trail="history"]')).toHaveCount(0)
  await step.click()
  await expect(turn).toHaveText('回合 2/20')
  await expect(bar).toContainText('第 2 行')
  await expect(route.locator('[data-trail="history"]')).toHaveCount(2)
  await expect(route.locator('[data-trail="recent"]')).toHaveCount(2)
  await step.click()
  await expect(bar).toContainText('等待')
  await expect(route.locator('[data-trail="history"]')).toHaveCount(2)
  await page.getByTestId('trail-toggle').click()
  await expect(route.locator('[data-trail]')).toHaveCount(0)
  await page.getByTestId('trail-toggle').click()
  await cursor.fill('1')
  await expect(route.locator('[data-trail="history"]')).toHaveCount(0)
  await expect(turn).toHaveText('回合 1/20')
  await editor.fill('move("left")')
  await step.click()
  await expect(turn).toHaveText('回合 1/20')
  await expect(bar).toContainText('向左移动')
  await expect(route).toHaveAccessibleName('机器人位于 5，7')
  await bar.getByRole('button', { name: '运行', exact: true }).click()
  await bar.getByRole('button', { name: '暂停运行', exact: true }).click()
  const paused = await turn.textContent()
  await expect(bar.getByRole('button', { name: '运行', exact: true })).toBeVisible()
  await expect(turn).toHaveText(paused!)
  await editor.fill('move("right")\nunknown_action()')
  await step.click()
  const source = page.getByTestId('execution-source')
  await expect(source.locator('[data-current]')).toHaveAttribute('data-line', '1')
  await expect(source.locator('[data-next]')).toHaveAttribute('data-line', '2')
  await expect(turn).toHaveText('回合 1/20')
  await expect(bar).toContainText('第 1 行')
  await expect(bar).not.toContainText('unknown_action')
  await expect(page.getByRole('region', { name: '失败复盘' })).toHaveCount(0)
  await step.click()
  await expect(turn).toHaveText('回合 1/20')
  await expect(bar).toContainText('第 2 行')
  await expect(bar).toContainText('unknown_action()')
  await expect(step).toBeDisabled()
  await expect(source.locator('[data-current]')).toHaveAttribute('data-line', '2')
  await expect(source.locator('[data-next]')).toHaveCount(0)
  await editor.fill('if False:\n    wait()\nfor i in range(2):\n    move("right")')
  await expect(source).toHaveCount(0)
  await step.click()
  await expect(source.locator('[data-current]')).toHaveAttribute('data-line', '1')
  await expect(source.locator('[data-next]')).toHaveAttribute('data-line', '3')
  await step.click()
  await expect(source.locator('[data-current]')).toHaveAttribute('data-line', '3')
  await expect(source.locator('[data-next]')).toHaveAttribute('data-line', '4')
  await step.click()
  await expect(source.locator('[data-current]')).toHaveAttribute('data-line', '4')
  await expect(turn).toHaveText('回合 1/20')
  await cursor.fill('0')
  await expect(source.locator('[data-current]')).toHaveCount(0)
  await expect(source.locator('[data-next]')).toHaveAttribute('data-line', '1')
})

test('a free arena scan animates on the board it read before the move and reveals the actual readings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/')
  await page.locator('[data-unit="routing"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText('巡逻网突围', { exact: true }) }).click()
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  const step = page.getByTestId('play-toolbar').getByRole('button', { name: '单步执行' })
  const sensor = page.getByTestId('arena-sensor')
  await editor.fill('scan()\nscan()\nmove("right")\nscan()')
  // Record React commits to see both short poses even on a busy machine.
  const observed = await page.evaluateHandle(() => {
    const history: { action?: string; position: string | null; line?: string }[] = []
    const observer = new MutationObserver(() => {
      history.push({
        action: document.querySelector<HTMLElement>('[data-robot-action]')?.dataset.robotAction,
        position: document.querySelector('.tilemap')?.getAttribute('aria-label') ?? null,
        line: document.querySelector<HTMLElement>('[data-testid="execution-source"] [data-current]')?.dataset.line,
      })
    })
    observer.observe(document.body, { attributes: true, childList: true, subtree: true })
    return history
  })
  await step.click()
  await expect(sensor).toContainText('回合 1 · 芽芽 (2, 1)')
  const history = await observed.jsonValue()
  expect(history).toEqual(expect.arrayContaining([
    { action: 'scan', position: '机器人位于 1，1', line: '2' },
    { action: 'move', position: '机器人位于 2，1', line: '3' },
    { action: 'scan', position: '机器人位于 2，1', line: '4' },
  ]))
  await expect(page.getByTestId('arena-turn')).toContainText('回合 1/')
  await editor.fill('scan()')
  await step.click()
  await expect(sensor).toContainText('回合 0 · 芽芽 (1, 1)')
  await expect(page.locator('.tilemap [data-robot-action="scan"]')).toBeVisible()
  await expect(page.getByTestId('arena-turn')).toContainText('回合 0/')
  await editor.fill('scan()\nunknown_action()')
  await step.click()
  await expect(page.getByTestId('execution-source').locator('[data-current]')).toHaveAttribute('data-line', '2')
  await expect(page.locator('.tilemap [data-robot-action]')).toHaveCount(0)
  await expect(page.getByTestId('arena-turn')).toContainText('回合 0/')
})

test('a timed policy marks its executed branch and clears the mark for a manual turn', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await openArena(page)
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await page.locator('#realtime-python').fill('def decide(state):\n    if state["turn"] == 0:\n        return "right"\n    return "wait"')
  await page.getByRole('button', { name: '应用策略', exact: true }).click()
  await expect(page.getByText('策略已启用', { exact: true })).toBeVisible()
  const source = page.getByTestId('execution-source')
  await expect(source).toHaveCount(0)
  await page.getByRole('button', { name: '开始', exact: true }).click()
  await expect(source.locator('[data-current]')).toHaveAttribute('data-line', '3')
  await expect(source.locator('[data-next]')).toHaveCount(0)
  await page.getByRole('group', { name: '下一回合动作' }).getByRole('button', { name: '向左', exact: true }).click()
  await expect(page.getByTestId('arena-turn')).toHaveText('回合 2/20')
  await expect(source).toHaveCount(0)
  await expect(source.locator('[data-current]')).toHaveAttribute('data-line', '4')
})

test('relaxed steps show call, loops, branch, scan and return on their original turn', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/')
  await page.locator('[data-unit="routing"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText('巡逻网突围', { exact: true }) }).click()
  const editor = page.getByRole('textbox', { name: '编写 Python' })
  const step = page.getByTestId('play-toolbar').getByRole('button', { name: '单步执行' })
  const turn = page.getByTestId('arena-turn')
  await editor.fill('def plan(n):\n    for x in [n]:\n        if x == 1:\n            scan()\n            move("right")\n    while False:\n        wait()\n    return n\nanswer = plan(1)')
  for (const [action, line, physical] of [
    ['call', 9, 0], ['for', 2, 0], ['if', 3, 0], ['scan', 4, 0],
    ['move', 5, 1], ['for', 2, 1], ['while', 6, 1], ['return', 8, 1],
  ] as const) {
    await step.click()
    await expect(turn).toContainText(`回合 ${physical}/`)
    await expect(page.locator('.tilemap .action-robot')).toHaveAttribute('data-robot-action', action)
    await expect(page.getByTestId('execution-source').locator('[data-current]')).toHaveAttribute('data-line', String(line))
  }
  await expect(step).toBeDisabled()
  await editor.fill('def choose():\n    while False:\n        wait()\n    return "left"\nd = choose()')
  for (const action of ['call', 'while', 'return']) {
    await step.click()
    await expect(turn).toContainText('回合 0/')
    await expect(page.locator('.tilemap .action-robot')).toHaveAttribute('data-robot-action', action)
  }
  await expect(step).toBeDisabled()
})

test('the live policy strip can inspect a decision after pausing the timed board', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await openArena(page)
  await page.getByRole('button', { name: '紧张', exact: true }).click()
  await page.locator('#realtime-python').fill('def choose(n):\n    while n < 1:\n        n = n + 1\n    return "right"\ndef decide(state):\n    if state["turn"] == 0:\n        return choose(0)\n    return "wait"')
  await page.getByRole('button', { name: '应用策略', exact: true }).click()
  await expect(page.getByText('策略已启用', { exact: true })).toBeVisible()
  const playback = page.getByTestId('policy-playback')
  await expect(playback).toHaveCount(0)
  await page.getByRole('button', { name: '开始', exact: true }).click()
  const turn = page.getByTestId('arena-turn')
  await expect(turn).toHaveText('回合 1/20')
  await page.getByRole('button', { name: '暂停对局', exact: true }).click()
  await expect(page.getByRole('button', { name: '继续对局', exact: true })).toBeVisible()
  const slider = playback.getByRole('slider')
  const cue = playback.locator('.station-action-cue')
  const highlight = page.getByTestId('execution-source').locator('[data-current]')
  for (const [index, kind, line] of [[1, 'if', 6], [2, 'call', 7], [3, 'while', 2], [4, 'while', 2], [5, 'return', 4]] as const) {
    await slider.fill(String(index))
    await expect(cue).toHaveAttribute('data-action', kind)
    await expect(highlight).toHaveAttribute('data-line', String(line))
    await expect(turn).toHaveText('回合 1/20')
    if (kind === 'while') await expect(cue).toHaveAttribute('data-condition', String(index === 3))
  }
})

test('a long calculation can open its full single-step replay without spending arena turns', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/')
  await page.locator('[data-unit="routing"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText('巡逻网突围', { exact: true }) }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill('def total():\n    n = 0\n    for value in range(16):\n        n = n + value\n    return n\nresult = total()')
  const toolbar = page.getByTestId('play-toolbar')
  await toolbar.getByRole('button', { name: '运行', exact: true }).click()
  await page.getByRole('button', { name: '展开本回合的程序步骤' }).click()
  const action = page.locator('.station-action-cue')
  await expect(action).toHaveAttribute('data-action', 'call')
  for (let round = 1; round <= 7; round++) {
    await toolbar.getByRole('button', { name: '单步执行' }).click()
    await expect(action).toHaveAttribute('data-action', 'for')
    await expect(action).toContainText(String(round - 1))
  }
  await expect(page.getByTestId('arena-turn')).toContainText('回合 0/')
})

test('a relaxed replay resumes at its saved frame and credits the completed match once', async ({ page, request }) => {
  const { levels } = await (await request.get('/api/levels')).json() as Catalog
  const arena = levels.find(level => level.id === arenaId)
  if (arena?.kind !== 'arena') throw new Error('Missing arena replay fixture')
  await openArena(page)
  await page.getByRole('textbox', { name: '编写 Python', exact: true }).fill(arena.solutionCode)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  const cursor = page.getByRole('slider', { name: '回放进度', exact: true })
  await cursor.fill('8')
  await expect(page.getByTestId('arena-turn')).toHaveText('回合 8/20')
  const tilemap = page.getByTestId('arena-dynamic-board').getByRole('img', { name: /^机器人位于/u })
  const savedBoard = await boardLayout(tilemap)
  await page.reload()
  await expect(cursor).toHaveValue('8')
  await expect(page.getByRole('button', { name: '播放回放', exact: true })).toBeVisible()
  expect(await boardLayout(tilemap)).toBe(savedBoard)
  await expect(tilemap.locator('[data-robot-action]')).toHaveCount(0)
  await page.getByRole('button', { name: '下一步', exact: true }).click()
  await expect(page.getByTestId('arena-turn')).toHaveText('回合 9/20')
  await page.getByRole('button', { name: '跳到结尾', exact: true }).click()
  await expect(page.getByRole('region', { name: '通关总结', exact: true })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), replayKey)).toBeNull()
  const rawScores = await page.evaluate(key => localStorage.getItem(key), challengeScoresKey)
  const attempts = challengeScoreSeries(readChallengeScores(rawScores), arenaId)[0]?.attempts
  expect(attempts).toHaveLength(1)
})
