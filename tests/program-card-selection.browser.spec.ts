import { expect, test, type Locator, type Page } from '@playwright/test'

const levelId = 'challenge-brass-key-store'
const button = (parent: Page | Locator, name: string) => parent.getByRole('button', { name, exact: true })
const program = (page: Page) => page.locator('.program-section')

function row(page: Page, ...path: number[]) {
  let list = program(page).locator(':scope > .instruction-list')
  let card = list.locator(':scope > li').nth(path[0])
  for (const index of path.slice(1)) {
    list = card.locator(':scope > .instruction-body > .instruction-list')
    card = list.locator(':scope > li').nth(index)
  }
  return card
}

function checkbox(card: Locator) {
  return card.locator(':scope > .instruction-main').getByRole('checkbox')
}

async function add(page: Page, ...ids: string[]) {
  for (const id of ids) await page.locator(`[data-add-card="${id}"]`).click()
}

async function checkCode(page: Page, ...lines: string[]) {
  await expect.poll(() => page.getByTestId('generated-code').textContent()).toBe(lines.join('\n'))
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-repair-lab:board-view', '2d'))
  await page.goto('/')
  await button(page.getByRole('region', { name: '继续闯关', exact: true }), '自由选关').click()
  await page.locator(`[data-challenge-level="${levelId}"]`).click()
})

test('on mobile, disjoint commands keep their selection at boundaries and the edited draft runs after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await add(page, 'up', 'right', 'down', 'left', 'pick')
  await row(page, 1).locator('.instruction-label').click()
  await checkbox(row(page, 3)).check()
  const group = page.getByRole('group', { name: '批量操作', exact: true })
  const up = button(group, '上移'), down = button(group, '下移')
  await up.click()
  await checkCode(page, 'move("right")', 'move("up")', 'move("left")', 'move("down")', 'pick()')
  await expect(checkbox(row(page, 0))).toBeChecked()
  await expect(checkbox(row(page, 2))).toBeChecked()
  await up.click()
  await checkCode(page, 'move("right")', 'move("left")', 'move("up")', 'move("down")', 'pick()')
  await expect(up).toBeDisabled()
  await down.click()
  await checkCode(page, 'move("up")', 'move("right")', 'move("left")', 'move("down")', 'pick()')
  await button(group, '删除').click()
  await checkCode(page, 'move("up")', 'move("down")', 'pick()')
  await expect(button(group, '撤销删除')).toBeFocused()
  await button(program(page), '全选').click()
  await expect(program(page).getByRole('checkbox', { checked: true })).toHaveCount(3)
  await expect(up).toBeDisabled()
  await expect(down).toBeDisabled()
  await button(group, '取消选择').click()
  await expect(program(page).getByRole('checkbox', { checked: true })).toHaveCount(0)
  await button(program(page), '全选').click()
  await button(group, '删除').click()
  await expect(program(page).getByRole('checkbox')).toHaveCount(0)
  await button(program(page), '撤销删除').click()
  await checkCode(page, 'move("up")', 'move("down")', 'pick()')
  await expect(group).toBeFocused()
  await expect(program(page).getByRole('checkbox', { checked: true })).toHaveCount(3)
  await page.reload()
  await page.getByRole('region', { name: '继续闯关', exact: true }).locator(`[data-continue-challenge="${levelId}"]`).click()
  await checkCode(page, 'move("up")', 'move("down")', 'pick()')
  const step = button(page.getByRole('toolbar', { name: '运行工具条' }), '单步执行')
  await step.click()
  await expect(page.locator('.tilemap')).toHaveAccessibleName('机器人位于 1，1')
  await step.click()
  await expect(page.locator('.tilemap')).toHaveAccessibleName('机器人位于 1，2')
})

test('nested commands move within their own lists, preserving parameters, loop bodies and the active insertion block', async ({ page }) => {
  await button(page, 'EN').click()
  const group = page.getByRole('group', { name: 'Edit selected commands', exact: true })
  const up = 'move("up")', left = '    move("left")', right = '    move("right")', outer = 'for step in range(3):'
  const inner = '    for step in range(2):', innerUp = '        move("up")', innerDown = '        move("down")', innerPick = '        pick()'
  await add(page, 'up', 'repeat', 'pick')
  await row(page, 1).locator('[data-parameter="count"]').selectOption('n3')
  await button(row(page, 1), 'Add inside this block').click()
  await add(page, 'left', 'repeat', 'right')
  await button(row(page, 1, 1), 'Add inside this block').click()
  await add(page, 'up', 'down')
  await checkCode(page, up, outer, left, inner, innerUp, innerDown, right, 'pick()')

  await checkbox(row(page, 1, 1, 1)).check()
  await checkbox(row(page, 1)).check()
  await button(group, 'Move down').click()
  await checkCode(page, up, 'pick()', outer, left, inner, innerUp, innerDown, right)
  await button(group, 'Clear selection').click()
  await add(page, 'pick')
  await checkCode(page, up, 'pick()', outer, left, inner, innerUp, innerDown, innerPick, right)

  await checkbox(row(page, 2, 0)).check()
  await checkbox(row(page, 2, 1, 0)).check()
  await button(group, 'Move down').click()
  await checkCode(page, up, 'pick()', outer, inner, innerDown, innerUp, innerPick, left, right)
  await button(group, 'Delete').click()
  await checkCode(page, up, 'pick()', outer, inner, innerDown, innerPick, right)

  await checkbox(row(page, 2, 0, 0)).check()
  await checkbox(row(page, 2, 0)).check()
  await button(group, 'Delete').click()
  await add(page, 'left')
  await checkCode(page, up, 'pick()', outer, right, left)
})

test('inserting on either side of the chosen duplicate preserves click order and the original selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  const up = 'move("up")', right = 'move("right")', down = 'move("down")', left = 'move("left")'
  const position = page.getByRole('group', { name: '插入位置' })
  await add(page, 'up', 'right', 'up', 'pick')
  await expect(position).toHaveCount(0)
  await row(page, 2).locator('.instruction-label').click()
  await expect(button(position, '在后面添加')).toHaveAttribute('aria-pressed', 'true')
  await add(page, 'down', 'left')
  await checkCode(page, up, right, up, down, left, 'pick()')
  await expect(checkbox(row(page, 2))).toBeChecked()

  await button(position, '在前面添加').click()
  await expect(button(position, '在前面添加')).toHaveAttribute('aria-pressed', 'true')
  await add(page, 'left', 'right')
  await checkCode(page, up, right, left, right, up, down, left, 'pick()')
  await expect(checkbox(row(page, 4))).toBeChecked()

  await button(position, '在后面添加').click()
  await add(page, 'pick')
  await checkCode(page, up, right, left, right, up, 'pick()', down, left, 'pick()')
  await checkbox(row(page, 0)).check()
  await expect(position).toHaveCount(0)
  await add(page, 'down')
  await checkCode(page, up, right, left, right, up, 'pick()', down, left, 'pick()', down)
})

test('a selected loop and its child each insert at their own depth, and explicit block insertion still works', async ({ page }) => {
  await button(page, 'EN').click()
  const up = 'move("up")', left = 'move("left")', loop = 'for step in range(3):'
  const downInside = '    move("down")', leftInside = '    move("left")', rightInside = '    move("right")'
  const position = page.getByRole('group', { name: 'Insert position' })
  await add(page, 'up', 'repeat', 'pick')
  await row(page, 1).locator('[data-parameter="count"]').selectOption('n3')
  await button(row(page, 1), 'Add inside this block').click()
  await add(page, 'down', 'right')
  await button(program(page), 'Back to main program').click()

  await checkbox(row(page, 1, 0)).check()
  await add(page, 'left')
  await checkCode(page, up, loop, downInside, leftInside, rightInside, 'pick()')
  await checkbox(row(page, 1)).check()
  await add(page, 'up')
  await checkCode(page, up, loop, downInside, leftInside, rightInside, up, 'pick()')
  await button(position, 'Insert before').click()
  await add(page, 'left')
  await checkCode(page, up, left, loop, downInside, leftInside, rightInside, up, 'pick()')

  await button(row(page, 2), 'Add inside this block').click()
  await expect(position).toHaveCount(0)
  await add(page, 'pick')
  await checkCode(page, up, left, loop, downInside, leftInside, rightInside, '    pick()', up, 'pick()')
  await checkbox(row(page, 0)).check()
  await button(position, 'Insert after').click()
  await add(page, 'down')
  await button(program(page), 'Clear selection').click()
  await add(page, 'left')
  const nestedResult = [up, 'move("down")', left, loop, downInside, leftInside, rightInside, '    pick()', leftInside, up, 'pick()']
  await checkCode(page, ...nestedResult)
  await button(program(page), 'Back to main program').click()
  await add(page, 'left')
  await checkCode(page, ...nestedResult, left)
})
