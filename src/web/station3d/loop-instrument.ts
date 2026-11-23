import type { ForLessonStep } from '../../engine/programFor'
import type { NestedLoopsStep } from '../../engine/programNestedLoops'
import type { WhileLessonStep } from '../../engine/programWhile'
import type { Locale } from '../../shared/types'
import type { Kit } from './workshop'
import type { TeachingModelTools } from './teaching-model-types'

type RowState = {
  mode: 'for'; batteries: number[]; step?: ForLessonStep; next?: ForLessonStep; increment: number
}
type RackState = {
  mode: 'nested'; rows: number[][]; saved: number[][]; step?: NestedLoopsStep; next?: NestedLoopsStep; increment: number
}
type MeterState = {
  mode: 'while'; current: number; limit: number; target: number; step?: WhileLessonStep; canCharge: boolean
}
export type LoopInstrumentState = (RowState | RackState | MeterState) & { locale: Locale }

const graphite = '#28434c', brass = '#d29b50', mint = '#8cebb8', amber = '#ffd77e'
const enamel = '#bbd2c2', screen = '#233f48'

/** A socket, a removable cell with a metallic positive contact, and its charge window. */
function battery(kit: Kit, tools: TeachingModelTools, x: number, base: number, z: number, value: number,
  capacity: number, focused: boolean, charged: boolean) {
  kit.cylinder([x, base + .05, z], .41, .46, .10, graphite)
  kit.ring([x, base + .105, z], .346, .027, focused ? amber : '#79928a')
  const y = base + .12 + (focused ? .16 : 0)
  kit.casing([x, y + .39, z], [.57, .76, .43], charged ? '#80b99c' : enamel, .073)
  kit.casing([x, y + .75, z], [.55, .10, .43], graphite, .033)
  kit.box([x, y + .832, z], [.22, .092, .21], brass)
  kit.box([x, y + .37, z + .22], [.41, .48, .024], screen)
  const fill = .40 * Math.min(1, Math.max(0, value / capacity))
  if (fill > 0) kit.box([x - .132, y + .17 + fill / 2, z + .24], [.057, fill, .023], charged ? mint : '#e8ba78', undefined, 'glow')
  tools.label(String(value), [x + .027, y + .41, z + .285], .25)
}

function tray(kit: Kit, width: number, z: number, lift: number, active: boolean, saved: boolean) {
  kit.casing([0, lift + .08, z], [width, .16, 1.16], graphite, .055)
  kit.casing([0, lift + .18, z], [width - .09, .10, 1.1], '#658b83', .035)
  kit.box([0, lift + .108, z + .592], [width - .19, .045, .025], active ? amber : saved ? mint : '#557779', undefined, 'glow')
}

const pitch = 1.16
const cellX = (idx: number, slots: number) => (idx - (slots - 1) / 2) * pitch

function rowReader(state: RowState & { locale: Locale }, kit: Kit, tools: TeachingModelTools) {
  const { batteries, step, next } = state
  const count = Math.max(1, batteries.length), width = count * pitch + .55
  const capacity = Math.max(1, ...batteries.map(v => v + state.increment), ...(step?.results ?? []))
  tray(kit, width, -.25, .12, false, false)
  const hasTray = !!step && step.kind !== 'load'
  kit.casing([0, .105, .86], [width, .21, .87], hasTray ? '#77968a' : '#4e5f62', .06)
  const results = step?.results ?? []
  for (const [i, value] of batteries.entries()) {
    const x = cellX(i, count), focused = step?.index === i
    battery(kit, tools, x, .35, -.25, value, capacity, focused, false)
    if (next?.kind === 'take' && i === next.index) {
      kit.box([x, .36, .24], [.45, .035, .065], amber, undefined, 'glow')
      tools.pick('read', [x, .98, -.25], [.88, 1.48, .82])
    }
    kit.casing([x, .23, .88], [.78, .10, .63], graphite, .04)
    if (results[i] !== undefined) {
      kit.casing([x, .325, .88], [.69, .17, .53], '#8eb89d', .035)
      tools.label(String(results[i]), [x, .55, .96], .25)
    } else if (next?.kind === 'record' && i === next.index) {
      kit.box([x, .292, 1.135], [.49, .026, .043], amber, undefined, 'glow')
      tools.pick('record', [x, .38, .88], [.87, .40, .76])
    }
  }
  // The carriage tracks the loop variable; computed values appear here before being recorded in the tray.
  const rail = -.83
  for (const x of [-width / 2 + .17, width / 2 - .17]) kit.box([x, .93, rail], [.13, 1.36, .17], graphite)
  kit.rod([-width / 2 + .10, 1.58, rail], [width / 2 - .10, 1.58, rail], .046, '#9baca0')
  if (step?.index !== undefined) {
    const x = cellX(step.index, count)
    kit.casing([x, 1.60, rail], [.64, .25, .30], brass, .05)
    kit.box([x, 1.57, rail + .19], [.18, .10, .13], amber, undefined, 'glow')
    if (step.kind === 'add') tools.label(String(step.calculated), [x, 1.96, rail], .27)
  }
  tools.label(state.locale === 'zh' ? '记录' : 'Results', [0, .13, 1.34], .20)
}

function nestedRack(state: RackState & { locale: Locale }, kit: Kit, tools: TeachingModelTools) {
  const { rows, step, saved, next } = state
  const slots = Math.max(1, ...rows.map(row => row.length))
  const width = slots * pitch + .98
  const capacity = Math.max(1, ...rows.flat().map(v => v + state.increment), ...saved.flat(), ...(step?.currentRow ?? []))
  if (!rows.length) tray(kit, width, 0, 0, false, false)
  rows.forEach((row, r) => {
    const lift = r * .29, z = (rows.length - 1) * .71 - r * 1.42
    const active = r === step?.rowIndex
    const current = saved[r] ?? (active ? step?.currentRow : undefined)
    tray(kit, width, z, lift, active, saved[r] !== undefined)
    const base = lift + .23
    tools.label(state.locale === 'zh' ? '第' + (r + 1) + '排' : 'Row ' + (r + 1), [-width / 2 + .13, base + .20, z + .35], .19)
    if (saved[r] !== undefined) {
      kit.box([width / 2 - .13, base + .015, z + .30], [.12, .035, .27], mint, undefined, 'glow')
    }
    if (next?.kind === 'select-row' && next.rowIndex === r) {
      kit.box([-width / 2 + .18, base + .018, z + .45], [.20, .034, .13], amber, undefined, 'glow')
      tools.pick('select-row', [0, lift + .30, z], [width, 1.42, 1.13])
    }
    row.forEach((input, i) => {
      const x = cellX(i, slots) + .12
      battery(kit, tools, x, base, z, current?.[i] ?? input, capacity, active && i === step?.batteryIndex, current?.[i] !== undefined)
      if (next?.kind === 'take' && next.rowIndex === r && next.batteryIndex === i) tools.pick('take', [x, base + .63, z], [.89, 1.43, .81])
    })
  })
}

function thresholdGauge(state: MeterState & { locale: Locale }, kit: Kit, tools: TeachingModelTools) {
  const { current, limit, target, step } = state
  const fraction = (v: number) => Math.max(0, Math.min(1, v / Math.max(1, limit)))
  kit.casing([0, .13, 0], [4.28, .26, 1.37], graphite, .09)
  kit.casing([0, .29, 0], [4.16, .12, 1.29], '#73978d', .055)
  battery(kit, tools, -1.49, .35, .12, current, limit, step?.kind === 'charge', (step?.rounds ?? 0) > 0)
  if (state.canCharge) tools.pick('charge', [-1.49, 1, .1], [.98, 1.54, 1.03])

  kit.casing([.53, .98, -.13], [2.79, 1.28, .38], enamel, .08)
  kit.casing([.53, 1, .066], [2.58, 1.05, .045], graphite, .04)
  const left = -.55, width = 2.16, targetX = left + fraction(target) * width
  kit.box([left + width / 2, .96, .103], [width, .24, .028], '#365d61')
  const fill = fraction(current) * width
  if (fill > 0) kit.box([left + fill / 2, .96, .13], [fill, .21, .024], mint, undefined, 'glow')
  kit.box([targetX, .98, .152], [.031, .43, .022], amber, undefined, 'glow')
  tools.label((state.locale === 'zh' ? '目标 ' : 'Target ') + target, [targetX, 1.35, .15], .20)
  tools.label(state.locale === 'zh' ? (step?.rounds ?? 0) + ' 轮' : 'Rounds ' + (step?.rounds ?? 0), [.49, .65, .148], .21)
  const decided = step?.kind === 'check' || step?.kind === 'stop' || step?.kind === 'output'
  const condition = step?.kind === 'check'
  for (const [i, live] of [condition, !condition].entries()) {
    const x = -.18 + i * 1.26
    kit.cylinder([x, .369, .46], .12, .15, .09, graphite)
    const indicator = i === 0 ? amber : mint
    kit.cylinder([x, .445, .46], .083, .106, .068, decided && live ? indicator : '#52716f', undefined, 'glow')
  }
  if (decided) tools.label(condition ? 'True' : 'False', [condition ? -.18 : 1.08, .60, .58], .17)
}

export function buildLoopInstrument(state: LoopInstrumentState, kit: Kit, tools: TeachingModelTools) {
  switch (state.mode) {
    case 'for': return rowReader(state, kit, tools)
    case 'nested': return nestedRack(state, kit, tools)
    case 'while': return thresholdGauge(state, kit, tools)
  }
}
