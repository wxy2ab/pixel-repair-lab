import type { Locator, Page } from '@playwright/test'

const action = (guide: Locator, name: string) => guide.getByRole('button', { name, exact: true })

export async function finishProgramBasics(page: Page) {
  const program = page.getByTestId('program-basics')
  await action(program, '按规则处理').click()
  await action(program, '查看输出').click()
}
