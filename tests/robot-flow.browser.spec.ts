import { expect, test } from '@playwright/test'

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

test('WebGL and the flat robot follow function calls and branch decisions, including a loop that never starts', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.locator('[data-unit="computer"]').click()
  await page.locator('.mission-list button').filter({ hasText: '把灯读成数字' }).click()
  await page.getByRole('tab', { name: 'Python' }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill([
    'def charge(value):',
    '    for cell in [0, 1]:',
    '        if cell == 0:',
    '            continue',
    '        break',
    '    while value > 5:',
    '        value = value - 1',
    '    return value',
    'submit(charge(5))',
  ].join('\n'))
  const step = page.getByTestId('grid-single-step')
  const canvas = page.getByTestId('station-3d-canvas')
  const cue = page.locator('.station-action-cue')
  await canvas.scrollIntoViewIfNeeded()
  await expect(page.locator('.station-viewport')).toHaveAttribute('data-ready', 'true')
  await step.click()
  await expect(canvas).toHaveAttribute('data-robot-action', 'call')
  await expect(cue).toContainText('charge(value=5)')
  await expect(canvas).toHaveAttribute('data-robot-motion', 'done')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await step.click()
  await expect(canvas).toHaveAttribute('data-robot-motion', 'still')
  await expect(canvas).toHaveAttribute('data-robot-action', 'for')
  await expect(cue).toContainText('cell = 0')
  await step.click()
  await expect(cue).toHaveAttribute('data-condition', 'true')
  await page.getByRole('button', { name: '2D', exact: true }).click()
  const robot = page.locator('.station-flat-board .action-robot')
  await expect(robot).toHaveAttribute('data-robot-action', 'if')
  for (const [action, text] of [
    ['continue', '跳过本轮'], ['for', 'cell = 1'], ['if', 'False'], ['break', '跳出循环'],
    ['while', '共 0 轮'], ['return', '返回 5'], ['submit', '5'],
  ]) {
    await step.click()
    await expect(robot).toHaveAttribute('data-robot-action', action)
    await expect(cue).toContainText(text)
  }
  await page.getByRole('button', { name: '回看上一步' }).click()
  await expect(robot).toHaveAttribute('data-robot-action', 'return')
  await expect(robot.locator('.action-robot__badge')).toBeVisible()
  await expect(robot.locator('.action-robot__badge')).toHaveCSS('animation-name', 'none')
})

test('the key warehouse shows the collected key and opens the gear chest on its own pick step', async ({ page }) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#challenge-zone')
  await page.locator('[data-challenge-level="challenge-brass-key-store"]').click()
  await page.getByRole('tab', { name: 'Python' }).click()
  const route = ['up', 'right', 'right', 'left', 'left', 'down', 'down', 'right', 'right', 'right', 'right']
  const code = [...route.map(direction => `move("${direction}")`), 'pick()', 'move("down")'].join('\n')
  await page.getByRole('textbox', { name: '编写 Python' }).fill(code)
  const step = page.getByTestId('grid-single-step')
  const canvas = page.getByTestId('station-3d-canvas')
  await canvas.scrollIntoViewIfNeeded()
  await expect(page.locator('.station-viewport')).toHaveAttribute('data-ready', 'true')
  for (let i = 0; i < 3; i++) await step.click()
  await expect(canvas).toHaveAttribute('data-robot-action', 'move')
  await expect(canvas).toHaveAttribute('data-robot-pickup', 'key')
  await expect(page.locator('.station-action-cue')).toContainText('拿到钥匙')
  for (let i = 3; i < route.length; i++) await step.click()
  await expect(canvas).not.toHaveAttribute('data-robot-pickup', 'key')
  await step.click()
  await expect(canvas).toHaveAttribute('data-robot-action', 'pick')
  await expect(canvas).toHaveAttribute('data-robot-pickup', 'chest')
  await expect(page.locator('.station-action-cue')).toContainText('打开宝箱')
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.locator('.tile[data-device="chest"] .action-robot')).toHaveAttribute('data-pickup', 'chest')
  await step.click()
  await expect(page.locator('.action-robot')).not.toHaveAttribute('data-pickup', 'chest')
})
