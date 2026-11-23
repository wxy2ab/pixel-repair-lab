import { expect, test, type Page } from '@playwright/test'
import { breadboardFaultBuild, type BreadboardLevel } from '../src/shared/breadboard'
import type { Catalog } from '../src/shared/types'

type TicketReadings = {
  bridged: boolean; red: string; black: string
}

async function putProbe(page: Page, color: 'red' | 'black', hole: string) {
  await page.getByTestId('bread-probe-' + color).dragTo(page.getByTestId('bread-pin-' + hole))
  await expect(page.getByTestId('bread-probe-tip-' + color)).toHaveAttribute('data-pin', hole)
}

async function compareReading(page: Page, ticket: TicketReadings, index: number) {
  const voltage = index === 1
  const before = voltage ? (ticket.bridged ? '0.0 V' : '−5.0 V') : (ticket.bridged ? '相通' : '未直通')
  // A flipped LED puts the old anode's hole on the repaired cathode. The saved red probe must stay there.
  const after = voltage ? (ticket.bridged ? '2.0 V' : '−2.0 V') : '未直通'
  await page.getByTestId('bread-retest-' + index).click()
  for (const color of ['red', 'black'] as const) {
    await expect(page.getByTestId('bread-probe-tip-' + color)).toHaveAttribute('data-pin', ticket[color])
  }
  await expect(page.getByTestId('bread-meter-' + (voltage ? 'voltage' : 'continuity'))).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bread-power')).toHaveAttribute('aria-pressed', String(voltage))
  await expect(page.getByTestId('bread-physical-switch')).toHaveAttribute('aria-pressed', String(voltage))
  await expect(page.getByTestId('bread-meter-reading').locator('strong')).toHaveText(after)
  if (voltage) await expect(page.getByTestId('bread-d13')).toContainText('HIGH')
  const comparison = page.getByTestId('bread-comparison-' + index)
  const values = comparison.locator('.repair-reading-pair dd:first-of-type')
  await expect(values).toHaveText([before, after])
  if (voltage) await expect(comparison.locator('.repair-difference')).toContainText(ticket.bridged ? '+2.0 V' : '+3.0 V')
}

async function inspectSavedReport(page: Page, ticket: TicketReadings) {
  const report = page.getByTestId('bread-saved-report')
  const diagnosis = report.getByTestId('bread-report-diagnosis')
  const wrong = ticket.bridged ? 'LED 接反' : '跳线插错孔'
  const right = ticket.bridged ? '跳线插错孔' : 'LED 接反'
  await expect(diagnosis.locator('dd')).toHaveText([wrong, right])
  const changes = report.getByTestId('bread-report-changes')
  for (const pin of ticket.bridged ? ['B6', 'C5', 'C2'] : ['A5', 'A6']) await expect(changes).toContainText(pin)
  const checks = report.getByTestId('bread-report-validation')
  const pressed = checks.locator('div').filter({ hasText: '按下按钮' })
  await expect(pressed).toContainText('灯亮')
  await expect(pressed).toContainText('D2 LOW · D13 HIGH')
  const released = checks.locator('div').filter({ hasText: '松开按钮' })
  await expect(released).toContainText('灯灭')
  await expect(released).toContainText('D2 HIGH · D13 LOW')
  const voltage = report.getByTestId('bread-report-comparison-1')
  await expect(voltage).toContainText(ticket.bridged ? '0.0 V' : '−5.0 V')
  await expect(voltage).toContainText(ticket.bridged ? '2.0 V' : '−2.0 V')
  for (const pin of [ticket.red, ticket.black]) await expect(voltage).toContainText(pin)
  const continuity = report.getByTestId('bread-report-comparison-0')
  await expect(continuity.locator('.repair-reading-pair dd:first-of-type')).toHaveText([ticket.bridged ? '相通' : '未直通', '未直通'])
}

function replayFrame(page: Page) {
  return page.getByTestId('bread-replay-frame').evaluate(el => {
    const board = el.querySelector<SVGElement | HTMLElement>('[data-testid="bread-replay-board"]')!
    const pin = (color: string) => board.querySelector('[data-testid="bread-replay-probe-' + color + '"]')?.getAttribute('data-pin')
    return {
      kind: el.getAttribute('data-kind'), red: pin('red'), black: pin('black'),
      pressed: board.getAttribute('data-pressed'), powered: board.getAttribute('data-powered'), lit: board.getAttribute('data-led-on'),
      reading: el.querySelector('[data-testid="bread-replay-reading"]')?.textContent ?? '',
      caption: el.querySelector('[data-testid="bread-replay-caption"]')?.textContent ?? '',
      changes: [...board.querySelectorAll('[data-replay-change-pin]')].map(pin => pin.getAttribute('data-replay-change-pin')),
      anode: board.querySelector('[data-replay-part="led"]')?.getAttribute('data-pin-1'),
    }
  })
}

async function inspectPairedRetests(page: Page, ticket: TicketReadings, frames: Awaited<ReturnType<typeof replayFrame>>[]) {
  const viewer = page.getByTestId('bread-replay')
  const compare = viewer.getByTestId('bread-replay-compare')
  const panel = viewer.getByTestId('bread-replay-comparison')
  const measurements = viewer.getByTestId('bread-replay-filter-measure')
  const row = (index: number) => viewer.getByTestId('bread-replay-step-' + (index + 1))
  await measurements.click()
  const originalFrames = frames.slice(0, frames.findIndex(frame => frame.kind === 'diagnosis'))
  const sameHoles = (frame: (typeof frames)[number]) => frame.red === ticket.red && frame.black === ticket.black
  // This button operation has a good continuity reading, but the saved continuity retest was taken with the button released.
  const unmatched = originalFrames.findIndex(frame => frame.kind === 'button' && sameHoles(frame)
    && frame.powered === 'false' && frame.pressed === 'true')
  expect(unmatched).toBeGreaterThanOrEqual(0)
  await row(unmatched).click()
  await expect(viewer.getByTestId('bread-replay-compare-missing')).toBeVisible()
  for (const voltage of [false, true]) {
    const beforeValue = voltage ? (ticket.bridged ? '0.0 V' : '−5.0 V') : (ticket.bridged ? '相通' : '未直通')
    const afterValue = voltage ? (ticket.bridged ? '2.0 V' : '−2.0 V') : '未直通'
    const index = originalFrames.map(frame => frame.kind === 'measure' && sameHoles(frame)
      && frame.pressed === String(voltage) && frame.powered === String(voltage) && frame.reading === beforeValue).lastIndexOf(true)
    expect(index).toBeGreaterThanOrEqual(0)
    await row(index).click()
    await compare.click()
    const changes = panel.getByTestId('bread-replay-comparison-changes')
    for (const pin of ticket.bridged ? ['B6', 'C5', 'C2'] : ['A5', 'A6']) await expect(changes).toContainText(pin)
    const difference = panel.getByTestId('bread-replay-comparison-difference')
    if (voltage) await expect(difference).toContainText(ticket.bridged ? '+2.0 V' : '+3.0 V')
    else await expect(difference).toContainText(ticket.bridged ? /断开|不再直通|未直通/ : /没变|不变|相同|未直通/)
    const [left, right] = await Promise.all(['before', 'after'].map(side =>
      panel.getByTestId('bread-replay-comparison-' + side).boundingBox()))
    expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width - 1)
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2)
    for (const side of ['before', 'after'] as const) {
      const snapshot = panel.getByTestId('bread-replay-comparison-' + side)
      const board = snapshot.getByTestId('bread-replay-board')
      const sourceIndex = Number(await snapshot.getAttribute('data-frame-index'))
      if (side === 'before') expect(sourceIndex).toBe(index)
      else {
        expect(sourceIndex).toBeGreaterThan(index)
        expect(frames[sourceIndex]).toMatchObject({ kind: 'retest', red: ticket.red, black: ticket.black, reading: afterValue })
      }
      await expect(snapshot.getByTestId('bread-replay-reading')).toHaveText(side === 'before' ? beforeValue : afterValue)
      await expect(board).toHaveAttribute('data-pressed', String(voltage))
      await expect(board).toHaveAttribute('data-powered', String(voltage))
      await expect(board.getByTestId('bread-replay-probe-red')).toHaveAttribute('data-pin', ticket.red)
      await expect(board.getByTestId('bread-replay-probe-black')).toHaveAttribute('data-pin', ticket.black)
      if (ticket.bridged) {
        const wire = side === 'before' ? 'B6:C5' : 'B6:C2'
        await expect(board.locator('[data-replay-wire="' + wire + '"]')).toHaveAttribute('data-replay-highlighted', 'true')
      } else {
        const led = board.locator('[data-replay-part="led"]')
        await expect(led).toHaveAttribute('data-replay-highlighted', 'true')
        await expect(led).toHaveAttribute('data-pin-1', side === 'before' ? 'A6' : 'A5')
      }
    }
    await panel.getByTestId('bread-replay-comparison-back').click()
    await expect(panel).toHaveCount(0)
    await expect(measurements).toHaveAttribute('aria-pressed', 'true')
    await expect(row(index)).toHaveAttribute('aria-current', 'step')
    expect(await replayFrame(page)).toEqual(frames[index])
    await expect(viewer.getByTestId('bread-replay-play')).toHaveAttribute('aria-pressed', 'false')
  }
  await viewer.getByTestId('bread-replay-filter-all').click()
  await row(frames.length - 1).click()
}

async function inspectStepList(page: Page, frames: Awaited<ReturnType<typeof replayFrame>>[]) {
  const viewer = page.getByTestId('bread-replay')
  const filter = (category: string) => viewer.getByTestId('bread-replay-filter-' + category)
  const row = (index: number) => viewer.getByTestId('bread-replay-step-' + (index + 1))
  const rows = viewer.getByTestId('bread-replay-step-list').locator('button[data-frame-index]')
  const frame = viewer.getByTestId('bread-replay-frame')
  const play = viewer.getByTestId('bread-replay-play')
  const next = viewer.getByTestId('bread-replay-next')
  const previous = viewer.getByTestId('bread-replay-previous')
  async function expectStep(index: number) {
    await expect(frame).toHaveAttribute('data-frame-index', String(index))
    await expect(row(index)).toHaveAttribute('aria-current', 'step')
    expect(await replayFrame(page)).toEqual(frames[index])
  }
  function categoryOf(entry: (typeof frames)[number]) {
    if (entry.kind === 'check') return 'test'
    if (entry.kind === 'button' || entry.kind === 'power') {
      return entry.red && entry.black && entry.reading !== '—' ? 'measure' : undefined
    }
    return entry.kind
  }
  const matching = (category: string) => frames.flatMap((entry, i) => categoryOf(entry) === category ? [i] : [])
  await expect(rows).toHaveCount(frames.length)
  // A click in any filtered list must render the exact same board as that step in the full recording.
  for (const category of ['measure', 'diagnosis', 'edit', 'retest', 'test']) {
    const indices = matching(category)
    expect(indices.length).toBeGreaterThan(0)
    const anchor = Number(await frame.getAttribute('data-frame-index'))
    await filter(category).click()
    await expect(filter(category)).toHaveAttribute('aria-pressed', 'true')
    expect(await rows.evaluateAll(entries => entries.map(entry => Number(entry.getAttribute('data-frame-index'))))).toEqual(indices)
    const selected = indices.find(index => index >= anchor) ?? indices[0]
    await expectStep(selected)
    await expect(viewer.getByTestId('bread-replay-position')).toContainText((indices.indexOf(selected) + 1) + ' / ' + indices.length)
    await row(indices.at(-1)!).click()
    await expectStep(indices.at(-1)!)
    await expect(next).toBeDisabled()
    await row(indices[0]).click()
    await expectStep(indices[0])
    await expect(previous).toBeDisabled()
    if (indices.length > 1) {
      await next.click()
      await expectStep(indices[1])
      await previous.click()
      await expectStep(indices[0])
    }
    await filter('all').click()
    await expectStep(indices[0])
  }
  // The two diagnoses are separated by real measurements, edits, a retest and a failed lamp check.
  const diagnoses = matching('diagnosis')
  const [first, second] = diagnoses
  expect(second).toBeGreaterThan(first + 1)
  await row(first).click()
  await filter('diagnosis').click()
  await page.clock.install()
  await play.click()
  await page.clock.fastForward(2000)
  await expectStep(second)
  await expect(play).toHaveAttribute('aria-pressed', 'false')
  await play.click()
  await expectStep(first)
  await filter('test').click()
  const lampSteps = matching('test')
  const firstLamp = lampSteps.findIndex(index => index >= first)
  await expectStep(lampSteps[firstLamp])
  await expect(play).toHaveAttribute('aria-pressed', 'true')
  await page.clock.fastForward(2000)
  await expectStep(lampSteps[firstLamp + 1])
  await row(lampSteps[0]).click()
  await expect(play).toHaveAttribute('aria-pressed', 'false')
  await page.clock.fastForward(4000)
  await expectStep(lampSteps[0])
  await filter('all').click()
  await expectStep(lampSteps[0])
}

async function inspectRepairReplay(page: Page, ticket: TicketReadings) {
  const next = page.getByTestId('bread-replay-next')
  await expect(page.getByTestId('bread-replay-previous')).toBeDisabled()
  const frames = [await replayFrame(page)]
  while (await next.isEnabled()) {
    await next.click()
    frames.push(await replayFrame(page))
    expect(frames.length).toBeLessThan(65)
  }
  // An exploratory probe pair that never made it into the six-note worksheet is still visible.
  expect(frames.some(f => f.kind === 'measure' && f.red === 'E1' && f.black === 'D1' && f.reading.includes('相通'))).toBeTruthy()
  const held = frames.filter(f => f.kind === 'button' && f.red === 'uno-D2' && f.black === 'GND' && f.powered === 'false')
  expect(held.map(f => [f.pressed, f.reading])).toEqual([['true', '相通'], ['false', '未直通']])
  const original = frames.findIndex(f => f.kind === 'measure' && f.red === ticket.red && f.black === ticket.black
    && f.powered === 'true' && f.pressed === 'true' && f.reading.includes(ticket.bridged ? '0.0 V' : '5.0 V'))
  const guess = frames.findIndex(f => f.kind === 'diagnosis')
  const firstEdit = frames.findIndex(f => f.kind === 'edit')
  expect(original).toBeGreaterThanOrEqual(0)
  expect(guess).toBeGreaterThan(original)
  expect(firstEdit).toBeGreaterThan(guess)
  const edits = frames.filter(f => f.kind === 'edit')
  if (ticket.bridged) {
    expect(edits.some(f => f.changes.includes('B6') && f.changes.includes('C5'))).toBeTruthy()
    expect(edits.some(f => f.changes.includes('B6') && f.changes.includes('C2'))).toBeTruthy()
  } else {
    expect(edits.map(f => f.anode)).toEqual(['A5', 'A6', 'A5'])
  }
  const tests = frames.slice(firstEdit).filter(f => f.kind === 'test')
  expect(tests.some(f => f.pressed === 'false' && f.lit === 'false')).toBeTruthy()
  expect(tests.some(f => f.pressed === 'true' && f.lit === 'true')).toBeTruthy()
  const checks = frames.filter(f => f.kind === 'check')
  expect(checks).toHaveLength(2)
  expect(frames.filter(f => f.kind === 'diagnosis')).toHaveLength(2)
  const lastCheck = frames.map(f => f.kind).lastIndexOf('check')
  const retests = frames.slice(lastCheck + 1).filter(f => f.kind === 'retest')
  expect(retests).toHaveLength(3)
  expect(retests.every(f => f.red === ticket.red && f.black === ticket.black)).toBeTruthy()
  expect(retests.some(f => f.powered === 'true' && f.reading.includes(ticket.bridged ? '2.0 V' : '−2.0 V'))).toBeTruthy()
  await inspectPairedRetests(page, ticket, frames)
  if (ticket.bridged) await inspectStepList(page, frames)
}

test('diagnose both dark call lights, remeasure the original sockets, and look up both repair records', async ({ page }) => {
  test.setTimeout(100_000)
  await page.goto('/#track-digital-circuits')
  await page.getByRole('button', { name: '开始数字电路课程', exact: true }).click()
  const repair = page.locator('.mission-list').getByRole('button', { name: /不亮的呼叫灯/ })
  await repair.click()
  const readout = page.getByTestId('bread-meter-reading')
  const record = page.getByTestId('bread-repair-record')
  const notes = page.getByTestId('bread-repair-notes')
  const physical = page.getByTestId('bread-physical-switch')
  const power = page.getByTestId('bread-power')
  const run = page.getByTestId('bread-run')
  const led = page.getByTestId('bread-external-led')
  const check = page.getByTestId('bread-check')
  const seen = new Set<string>()
  const tickets: TicketReadings[] = []
  for (let ticket = 0; ticket < 2; ticket++) {
    await expect(page.getByTestId('bread-diagnose-wrong-jumper')).toBeDisabled()
    await expect(page.getByTestId('bread-tray-led')).toBeDisabled()
    await expect(notes).toHaveCount(0)
    await page.getByTestId('bread-meter-continuity').click()
    // A single probe can't provide the reading needed for a diagnosis.
    await putProbe(page, 'red', 'E1')
    await expect(record).toBeDisabled()
    await putProbe(page, 'black', 'D1')
    await expect(readout.locator('strong')).toHaveText('相通')
    await putProbe(page, 'red', 'uno-D2')
    await putProbe(page, 'black', 'GND')
    await physical.click()
    await expect(readout.locator('strong')).toHaveText('相通')
    await physical.click()
    await expect(readout.locator('strong')).toHaveText('未直通')
    // Keep the red probe on the anode's strip and black on the cathode's strip.
    const anode = await page.getByTestId('bread-mounted-led').getAttribute('data-pin-1')
    const red = anode === 'A5' ? 'E5' : 'E6'
    const black = red === 'E5' ? 'E6' : 'E5'
    await putProbe(page, 'red', red)
    await putProbe(page, 'black', black)
    const bridged = anode === 'A5'
    const cause = bridged ? 'wrong-jumper' : 'reversed-led'
    await expect(readout.locator('strong')).toHaveText(bridged ? '相通' : '未直通')
    await record.click()
    await expect(notes).toContainText(red)
    await physical.click()
    await power.click()
    await expect(readout).toHaveAttribute('data-kind', 'power-off-first')
    await page.getByTestId('bread-meter-voltage').click()
    await run.click()
    await expect(page.getByTestId('bread-d13')).toContainText('HIGH')
    await expect(led).toHaveAttribute('data-on', 'false')
    await expect(readout.locator('strong')).toHaveText(bridged ? '0.0 V' : '−5.0 V')
    await record.click()
    await expect(notes.locator('li')).toHaveCount(2)
    const wrong = page.getByTestId('bread-diagnose-' + (bridged ? 'reversed-led' : 'wrong-jumper'))
    await wrong.click()
    await power.click()
    if (ticket === 0) {
      await page.reload()
      await page.locator('[data-unit="digital-circuits"]').click()
      await repair.click()
      await expect(notes.locator('li')).toHaveCount(2)
      await expect(notes).toContainText(red)
      await expect(wrong).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('bread-mounted-led')).toHaveAttribute('data-pin-1', anode!)
    }
    if (bridged) {
      const wiring = page.getByTestId('bread-meter-wiring')
      if (await wiring.isVisible()) await wiring.click()
      const jumpers = page.getByTestId('bread-wire-list')
      await jumpers.locator('summary').click()
      await jumpers.locator('li').filter({ hasText: 'B6' }).filter({ hasText: 'C5' }).getByRole('button').click()
      await page.getByTestId('bread-pin-B6').click()
      await page.getByTestId('bread-pin-C2').click()
      await expect(page.locator('[data-wire="B6:C2"]')).toHaveCount(1)
    } else {
      // Include a detour that cannot be reconstructed from the two final board snapshots.
      for (let flip = 0; flip < 3; flip++) await page.getByTestId('bread-flip-led').click()
      await expect(page.getByTestId('bread-mounted-led')).toHaveAttribute('data-pin-1', 'A5')
    }
    await compareReading(page, { bridged, red, black }, 0)
    if (ticket === 1) {
      await page.reload()
      await page.locator('[data-unit="digital-circuits"]').click()
      await repair.click()
      await expect(page.getByTestId('bread-comparison-0').locator('.repair-reading-pair dd:first-of-type'))
        .toHaveText([bridged ? '相通' : '未直通', '未直通'])
    }
    await expect(check).toBeDisabled()
    if ((await physical.getAttribute('aria-pressed')) === 'true') await physical.click()
    await power.click()
    await run.click()
    await expect(page.getByTestId('bread-observed-open')).toContainText('灯灭')
    await expect(check).toBeDisabled()
    await physical.click()
    await expect(page.getByTestId('bread-observed-closed')).toContainText('灯亮')
    await expect(led).toHaveAttribute('data-on', 'true')
    await check.click()
    await expect(page.getByTestId('bread-feedback')).toContainText('再核对工单上的判断')
    await expect(page.getByTestId('bread-next-repair')).toHaveCount(0)
    await page.getByTestId('bread-diagnose-' + cause).click()
    await check.click()
    await expect(page.getByTestId('bread-feedback')).toContainText('呼叫灯已修好')
    tickets.push({ bridged, red, black })
    // Leave the meter elsewhere. Each recall should restore the original contacts even when a lead occupies them.
    await putProbe(page, 'red', 'uno-D2')
    await putProbe(page, 'black', 'GND')
    for (const index of ticket === 0 ? [1, 0, 1] : [0, 1, 0]) {
      await compareReading(page, tickets[ticket], index)
    }
    seen.add(cause)
    if (ticket === 0) {
      await page.getByTestId('bread-next-repair').click()
      const history = page.getByTestId('bread-repair-history')
      await history.locator('summary').click()
      await inspectSavedReport(page, tickets[0])
      await history.locator('summary').click()
    }
  }
  expect([...seen].sort()).toEqual(['reversed-led', 'wrong-jumper'])
  await expect(repair.locator('.mission-check')).toBeVisible()
  await page.reload()
  await page.locator('[data-unit="digital-circuits"]').click()
  await repair.click()
  const history = page.getByTestId('bread-repair-history')
  await history.locator('summary').click()
  const picker = history.getByTestId('bread-report-select')
  await expect(picker.locator('option')).toHaveCount(2)
  await picker.selectOption({ index: 0 })
  await inspectSavedReport(page, tickets[1])
  await inspectRepairReplay(page, tickets[1])
  await page.getByTestId('bread-replay-play').click()
  await expect(page.getByTestId('bread-replay-play')).toHaveAttribute('aria-pressed', 'true')
  await picker.selectOption({ index: 1 })
  await expect(page.getByTestId('bread-replay-play')).toHaveAttribute('aria-pressed', 'false')
  await inspectSavedReport(page, tickets[0])
  await inspectRepairReplay(page, tickets[0])
  await history.locator('summary').click()
  await page.getByTestId('bread-open-report').click()
  await expect(history.locator('summary')).toBeFocused()
  await inspectSavedReport(page, tickets[1])
})

test('an older repair plays its saved snapshots on a narrow screen, pauses and stops at the last step', async ({ page, request }) => {
  const catalog: Catalog = await (await request.get('/api/levels')).json()
  const level = catalog.levels.find((entry): entry is BreadboardLevel => entry.kind === 'breadboard' && entry.id === 'dc-breadboard-meter-repair')!
  const before = { red: 'E6', black: 'E5', pressed: true, output: 1, kind: 'voltage', volts: -5 }
  const legacy = { version: 1, id: 'previous-work-order', completedAt: 1000, firstDiagnosis: 'wrong-jumper', diagnosis: 'reversed-led',
    original: breadboardFaultBuild(level, { kind: 'reversed-led' }), repaired: { parts: level.board.initialParts, wires: level.board.solutionWires },
    validation: { closed: { ledOn: true, d2: 0, d13: 1 }, open: { ledOn: false, d2: 1, d13: 0 } },
    readings: [{ before, after: { ...before, volts: -2 } }] }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(({ prefix, data }) => {
    localStorage.setItem(prefix + data.id, JSON.stringify(data))
    const early = { ...data, id: 'without-retest', completedAt: 999, readings: [{ before: data.readings[0].before }] }
    localStorage.setItem(prefix + early.id, JSON.stringify(early))
    localStorage.setItem('pixel-repair-lab:locale', 'en')
  }, { prefix: 'pixel-repair-lab:repair-history:' + level.id + ':', data: legacy })
  await page.goto('/#track-digital-circuits')
  await page.locator('[data-unit="digital-circuits"]').click()
  await page.getByRole('button', { name: 'Mission list', exact: true }).click()
  await page.locator('.mission-list').getByRole('button', { name: /The Dark Call Light/ }).click()
  const history = page.getByTestId('bread-repair-history')
  await history.locator('summary').click()
  const viewer = page.getByTestId('bread-replay')
  await expect(viewer).toBeVisible()
  await expect(viewer.getByTestId('bread-replay-frame')).toHaveAttribute('data-snapshot', 'true')
  await expect(viewer).toContainText(/snapshot/i)
  await expect(viewer.getByTestId('bread-replay-reading')).toHaveText('−5.0 V')
  await expect(viewer.getByTestId('bread-replay-probe-red')).toHaveAttribute('data-pin', 'E6')
  await expect(viewer.getByTestId('bread-replay-probe-black')).toHaveAttribute('data-pin', 'E5')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const play = viewer.getByTestId('bread-replay-play')
  const next = viewer.getByTestId('bread-replay-next')
  const previous = viewer.getByTestId('bread-replay-previous')
  const position = viewer.getByTestId('bread-replay-position')
  const ticketKey = 'pixel-repair-lab:repair-ticket:' + level.id
  const initialBoard = await page.evaluate(key => localStorage.getItem(key), ticketKey)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'))
  await play.click()
  await expect(play).toHaveAttribute('aria-pressed', 'true')
  const comparison = viewer.getByTestId('bread-replay-comparison')
  await viewer.getByTestId('bread-replay-compare').click()
  await expect(comparison.getByTestId('bread-replay-comparison-before').getByTestId('bread-replay-reading')).toHaveText('−5.0 V')
  await expect(comparison.getByTestId('bread-replay-comparison-after').getByTestId('bread-replay-reading')).toHaveText('−2.0 V')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.clock.fastForward(5000)
  await comparison.getByTestId('bread-replay-comparison-back').click()
  await expect(position).toContainText('Step 1 /')
  await expect(play).toHaveAttribute('aria-pressed', 'true')
  await page.clock.fastForward(2000)
  await expect(position).toContainText('Step 2 /')
  await play.click()
  await page.clock.fastForward(4000)
  await expect(position).toContainText('Step 2 /')
  await previous.click()
  await expect(previous).toBeDisabled()
  await play.click()
  await next.click()
  await expect(play).toHaveAttribute('aria-pressed', 'false')
  while (await next.isEnabled()) await next.click()
  await previous.click()
  await play.click()
  await page.clock.fastForward(2000)
  await expect(next).toBeDisabled()
  await expect(play).toHaveAttribute('aria-pressed', 'false')
  const filter = (category: string) => viewer.getByTestId('bread-replay-filter-' + category)
  const frame = viewer.getByTestId('bread-replay-frame')
  await filter('measure').click()
  await expect(filter('measure')).toHaveAccessibleName(/measur/i)
  await expect(frame).toHaveAttribute('data-snapshot', 'true')
  await expect(frame).toHaveAttribute('data-frame-index', '0')
  await expect(play).toBeDisabled()
  await expect(previous).toBeDisabled()
  await expect(next).toBeDisabled()
  await filter('retest').click()
  await expect(viewer.getByTestId('bread-replay-reading')).toHaveText('−2.0 V')
  await expect(viewer.getByTestId('bread-replay-probe-red')).toHaveAttribute('data-pin', 'E6')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await filter('measure').click()
  await viewer.getByTestId('bread-replay-compare').click()
  await history.getByTestId('bread-report-select').selectOption('without-retest')
  await expect(comparison).toHaveCount(0)
  await expect(viewer.getByTestId('bread-replay-compare-missing')).toBeVisible()
  await expect(filter('all')).toHaveAttribute('aria-pressed', 'true')
  await expect(frame).toHaveAttribute('data-frame-index', '0')
  await next.click()
  const anchor = await frame.getAttribute('data-frame-index')
  await play.click()
  await filter('retest').click()
  await expect(viewer.getByTestId('bread-replay-steps-empty')).toBeVisible()
  await expect(play).toBeDisabled()
  await expect(previous).toBeDisabled()
  await expect(next).toBeDisabled()
  await expect(play).toHaveAttribute('aria-pressed', 'false')
  await filter('all').click()
  await expect(frame).toHaveAttribute('data-frame-index', anchor!)
  expect(await page.evaluate(key => localStorage.getItem(key), ticketKey)).toBe(initialBoard)
})
