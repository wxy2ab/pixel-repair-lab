import type { CollectionBattery, ProgramVisual } from '../../shared/programWalkthrough'
import type { Locale } from '../../shared/types'
import type { Kit } from './workshop'
import type { TeachingModelTools } from './teaching-model-types'

const steel = '#45646a', ink = '#263d46', brass = '#dcac69', mint = '#9edec0', red = '#ed947e'

export type SequenceBenchState = {
  cards: { id: string; label: string; icon: ProgramVisual['main'][number]['icon']; reading?: string; annotation?: string }[]
  input: number
  active?: string
  blocked?: string
  move: boolean
  next?: string
  output?: string
}

export function buildSequenceBench(state: SequenceBenchState, kit: Kit, tools: TeachingModelTools) {
  const pitch = 1.95, width = pitch * state.cards.length
  kit.casing([0, .10, 0], [width, .20, 1.94], steel, .07)
  kit.rod([-width / 2 + .10, .32, -.53], [width / 2 - .10, .32, -.53], .055, brass)
  state.cards.forEach((card, i) => {
    const x = (i - (state.cards.length - 1) / 2) * pitch
    const active = card.id === state.active, stopped = active && state.blocked !== undefined
    kit.casing([x, .285, 0], [1.69, .23, 1.36], active ? stopped ? red : brass : '#76938d', .06)
    if (card.icon === 'battery') {
      kit.cylinder([x, .45, -.10], .36, .41, .12, ink)
      kit.cylinder([x, .73, -.10], .26, .27, .47, '#b7d7bb')
      kit.cylinder([x, .995, -.10], .13, .14, .07, brass)
      tools.label(String(state.input), [x, .77, .17], .22)
    } else if (card.icon === 'compute') {
      kit.rod([x - .48, .65, -.08], [x + .48, .65, -.08], .12, ink)
      for (let ring = -2; ring <= 2; ring++) {
        kit.cylinder([x + ring * .15, .65, -.08], .21, .21, .065, brass, [0, 0, Math.PI / 2])
      }
      if (card.reading !== undefined) tools.label(card.reading, [x, 1, -.08], .22)
    } else {
      kit.casing([x, .72, -.16], [1.07, .62, .21], ink, .05)
      kit.box([x, .72, -.04], [.93, .46, .035], stopped ? '#844841' : '#23565a')
      tools.label(stopped ? '? ' + state.blocked : state.output ?? '—', [x, .73, .002], .22)
    }
    tools.label(card.label, [x, .44, .56], .17)
    if (card.annotation) tools.label(card.annotation, [x, 1.36, -.08], .18)
    if (state.move) {
      for (const direction of [-1, 1]) {
        if (i + direction < 0 || i + direction >= state.cards.length) continue
        const keyX = x + direction * .46
        kit.casing([keyX, .244, .83], [.41, .12, .25], ink, .035)
        tools.label(direction === -1 ? '◀' : '▶', [keyX, .37, .85], .18)
        tools.pick(direction + ':' + card.id, [keyX, .30, .83], [.55, .26, .33])
      }
    } else if (state.next === card.id) {
      tools.pick('step', [x, .67, 0], [1.68, .91, 1.32])
    }
  })
}

export type CollectionBenchState = {
  batteries: readonly CollectionBattery[]
  records?: Record<string, number>
  named: boolean
  index?: number
  key?: string
  pickIndex?: number
  pickKey?: string
  locale: Locale
}

function dock(kit: Kit, x: number, z: number, charge: number, focus: boolean, upper: boolean, tools: TeachingModelTools) {
  const lift = upper ? .27 : 0
  kit.casing([x, .25 + lift, z], [.91, .19, .76], focus ? brass : steel, .05)
  kit.casing([x, .54 + lift, z - .045], [.59, .39, .42], upper ? '#d2b487' : '#87bca7', .06)
  kit.box([x, .77 + lift, z - .045], [.23, .065, .18], brass)
  tools.label(String(charge), [x, .57 + lift, z + .16], .23)
}

export function buildCollectionBench(state: CollectionBenchState, kit: Kit, tools: TeachingModelTools) {
  const { batteries, records } = state
  const count = Math.max(1, batteries.length), width = 1.16 * count
  kit.casing([0, .08, 0], [width + .20, .16, 2.49], ink, .07)
  kit.casing([0, .265, -.66], [width, .34, 1.10], steel, .05)
  batteries.forEach(({ name, charge }, i) => {
    const x = (i - (count - 1) / 2) * 1.16
    dock(kit, x, .57, charge, state.index === i, false, tools)
    tools.label('[' + i + ']', [x, .27, 1.05], .16)
    if (state.pickIndex === i) tools.pick('index', [x, .54, .68], [1.01, .78, 1.10])
    if (records && Object.hasOwn(records, name)) {
      dock(kit, x, -.65, records[name], state.key === name, true, tools)
      tools.label(name, [x, 1.28, -.64], .19)
      if (state.pickKey === name) tools.pick('key', [x, .86, -.65], [1.01, 1.32, .86])
    } else if (state.named) {
      tools.label(name, [x, .92, .51], .17)
    }
  })
  if (!records) tools.label(state.locale === 'zh' ? '登记册' : 'Registry', [0, .51, -.72], .18)
}

export type TraceRackState = {
  rows: readonly number[][]
  saved: readonly number[][]
  rowIndex?: number
  batteryIndex?: number
  current?: readonly number[]
  cellNotes?: readonly (readonly (string | undefined)[])[]
  returned?: string
  helper?: string
  locale: Locale
}

export function buildTraceRack(state: TraceRackState, kit: Kit, tools: TeachingModelTools) {
  const { rows, saved, current, rowIndex, batteryIndex, returned, helper, locale } = state
  const pitch = 1.03, slots = Math.max(1, ...rows.map(row => row.length))
  const rowWidth = slots * pitch + .63, width = rowWidth + 1.64, rowCount = Math.max(1, rows.length)
  const zAt = (r: number) => (rowCount - 1) * .68 - r * 1.36
  const xAt = (c: number) => (c - (slots - 1) / 2) * pitch - .77
  kit.casing([0, .09, 0], [width, .18, rowCount * 1.36 + .30], ink, .07)
  rows.forEach((row, r) => {
    const z = zAt(r), lift = r * .17, selected = rowIndex === r
    kit.casing([-.77, .26 + lift, z], [rowWidth - .05, .20, 1.21], selected ? '#788e76' : steel, .05)
    if (rows.length > 1) tools.label((locale === 'zh' ? '排 ' : 'Row ') + (r + 1), [xAt(0) - .46, .52 + lift, z + .45], .16)
    if (!row.length) tools.label(locale === 'zh' ? '空排' : 'Empty', [0, .45 + lift, z], .20)
    const recorded = saved[r] ?? (selected ? current : undefined)
    row.forEach((start, i) => {
      const x = xAt(i), value = recorded?.[i]
      kit.cylinder([x, .435 + lift, z], .32, .39, .13, selected && i === batteryIndex ? brass : ink)
      kit.cylinder([x, .71 + lift, z], .242, .26, .44, value === undefined ? '#a2b9b5' : mint)
      kit.cylinder([x, .96 + lift, z], .125, .125, .07, brass)
      tools.label(String(value ?? start), [x, .74 + lift, z + .242], .22)
      const note = state.cellNotes?.[r]?.[i]
      if (note) tools.label(note, [x, 1.30 + lift, z], .17)
    })
  })
  const gateX = width / 2 - .73
  const face = zAt(0)
  kit.casing([gateX, .42, face], [1.29, .33, 1.02], steel, .06)
  // A raised exit arm shows a return actually taken in this invocation.
  const open = returned !== undefined
  kit.box([gateX - .43, .71, face - .09], [.14, .58, .17], ink)
  kit.rod([gateX - .43, .95, face - .09], [gateX + (open ? -.16 : .45), open ? 1.60 : .95, face - .09], .066, open ? mint : brass)
  tools.label('return', [gateX, .66, face + .42], .18)
  if (returned !== undefined) tools.label(returned, [gateX, 1.76, face - .07], .21)
  else if (helper) tools.label(helper, [gateX, 1.25, face - .07], .18)
}
