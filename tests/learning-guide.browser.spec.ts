import { expect, test } from '@playwright/test'
import type { Catalog, Level } from '../src/shared/types'

function level(catalog: Catalog, id: string): Level {
  const found = catalog.levels.find(candidate => candidate.id === id)
  if (!found) throw new Error('Missing lesson ' + id)
  return found
}

test('a grid exercise ticks its goals during the run and then points to the next step of the topic', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const first = level(catalog, 'first-steps')
  if (first.kind !== 'grid' || !first.topic) throw new Error('Expected the first grid exercise')
  const topic = catalog.levels.filter(candidate => candidate.unit?.id === first.unit?.id && candidate.topic?.id === first.topic?.id)

  await page.goto('/')
  await page.locator('[data-unit="foundations"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(first.title.zh, { exact: true }) }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.title.zh)

  // The topic path lists every lesson of this idea and marks where the learner is.
  const steps = page.getByTestId('topic-steps')
  await expect(steps.getByRole('listitem')).toHaveCount(topic.length)
  await expect(steps.locator('[aria-current="true"]')).toHaveCount(1)
  await expect(steps.locator('[aria-current="true"]')).toBeDisabled()
  await expect(steps.locator('li[data-done]')).toHaveCount(0)

  const goals = page.getByTestId('grid-goals')
  await expect(goals.getByRole('listitem')).toHaveCount(first.objectives.length)
  await expect(goals.locator('li[data-done]')).toHaveCount(0)
  await expect(page.getByTestId('lesson-next')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Python', exact: true }).click()
  await page.getByRole('textbox', { name: '编写 Python' }).fill('move("right")')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  // One step is short of the exit, so the goal stays open and no next step is offered.
  await expect(page.locator('.output-body .error-message')).toBeVisible()
  await expect(goals.locator('li[data-done]')).toHaveCount(0)
  await expect(page.getByTestId('lesson-next')).toHaveCount(0)

  const exit = first.objectives.find(objective => objective.type === 'exit')
  if (exit?.type !== 'exit') throw new Error('Expected an exit goal')
  await page.getByRole('textbox', { name: '编写 Python' }).fill(`for step in range(${exit.x - first.start.x}):\n    move("right")`)
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.locator('.output-body .win-message')).toBeVisible({ timeout: 20000 })
  await expect(goals.locator('li[data-done]')).toHaveCount(first.objectives.length)
  await expect(goals).toHaveAttribute('data-complete', 'true')
  await expect(steps.locator('li[data-done]')).toHaveCount(1)

  // The banner names the lesson that follows in the mission list and opens it.
  const titles = await page.locator('.mission-list .mission-name').allTextContents()
  const following = titles[titles.indexOf(first.title.zh) + 1]
  expect(topic.map(candidate => candidate.title.zh)).toContain(following)
  const next = page.getByTestId('lesson-next')
  await expect(next).toContainText('本课已完成')
  await expect(next).toContainText(following)
  await next.getByRole('button', { name: '继续前进' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(following)
  await expect(page.getByTestId('lesson-next')).toHaveCount(0)

  // Any step of the topic opens from the path. The first one is its lecture.
  const opening = topic.find(candidate => candidate.kind === 'lecture')
  if (!opening) throw new Error('Expected the topic to start with a lecture')
  await page.getByTestId('topic-steps').getByRole('button', { name: /^步骤 1 / }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(opening.title.zh)
})

test('a lecture marks the chosen answer, reveals hints one at a time elsewhere, and reads the same in English', async ({ page, request }) => {
  const catalog = await (await request.get('/api/levels')).json() as Catalog
  const lecture = level(catalog, 'computer-notes')
  if (lecture.kind !== 'lecture') throw new Error('Expected a lecture')
  const wrong = lecture.question.options.findIndex((_, index) => index !== lecture.question.correct)

  await page.goto('/')
  await page.locator('[data-unit="computer"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(lecture.title.zh, { exact: true }) }).click()
  await expect(page.locator('.lecture-nudge')).toBeVisible()
  const choice = (index: number) => page.locator('.lesson-prediction')
    .getByRole('button', { name: lecture.question.options[index].zh, exact: true })
  await choice(wrong).click()
  await expect(choice(wrong)).toHaveAttribute('data-result', 'wrong')
  await expect(page.getByTestId('lesson-next')).toHaveCount(0)
  await choice(lecture.question.correct).click()
  await expect(choice(lecture.question.correct)).toHaveAttribute('data-result', 'right')
  await expect(choice(wrong)).not.toHaveAttribute('data-result', /.+/)
  await expect(page.locator('.lecture-nudge')).toBeHidden()
  await expect(page.getByTestId('lesson-next')).toBeVisible()

  const practice = catalog.levels.find(candidate => candidate.kind === 'algorithm' && candidate.unit?.id === 'foundations'
    && candidate.stage !== 'challenge' && candidate.hints.length > 1)
  if (!practice) throw new Error('Expected an exercise with several hints')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Learning modules', exact: true }).click()
  await page.locator('[data-unit="foundations"]').click()
  await page.locator('.mission-list button').filter({ has: page.getByText(practice.title.en, { exact: true }) }).click()
  await expect(page.getByTestId('topic-steps')).toContainText('Step')
  await page.getByText('Mission hints', { exact: true }).click()
  const hints = page.locator('.hint-steps')
  await expect(hints.getByRole('listitem')).toHaveText([practice.hints[0].en])
  await hints.getByRole('button', { name: /Show another hint/ }).click()
  await expect(hints.getByRole('listitem')).toHaveText(practice.hints.slice(0, 2).map(hint => hint.en))
  for (let shown = 2; shown < practice.hints.length; shown++) await hints.getByRole('button', { name: /Show another hint/ }).click()
  await expect(hints.getByRole('listitem')).toHaveCount(practice.hints.length)
  await expect(hints.getByRole('button')).toHaveCount(0)
})
