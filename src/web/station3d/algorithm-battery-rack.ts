import type { ModelBuilder, ModelPoint } from './teaching-model-types'

type Pack = { name?: string; charge?: number }
export type AlgorithmRackState = {
  batteries: readonly Pack[]
  range?: readonly [number, number]
  fixed?: number
  marked?: readonly number[]
  badges?: Readonly<Record<number, string | undefined>>
  swap?: readonly [number, number]
  held?: Pack
  prefix?: readonly number[]
  operands?: readonly number[]
  readout?: string
  advance?: boolean
}

const frame = '#304b54', deck = '#839d98', copper = '#c89355', gold = '#ffcc75', mint = '#91e6bb'
const paint = ['#5e999a', '#7394bc', '#bd8e73', '#93a46e', '#a386b0']

export const buildAlgorithmRack: ModelBuilder<AlgorithmRackState> = (state, kit, tools) => {
  const { batteries, range, prefix, swap } = state
  const pitch = 1.18
  const xAt = (i: number) => (i - (batteries.length - 1) / 2) * pitch
  const width = Math.max(2.1, batteries.length * pitch + .35)
  const controls = state.advance ? 1.08 : 0
  const front = prefix ? 1.58 : .91
  const maxCharge = Math.max(1, ...batteries.map(cell => cell.charge ?? 0))
  kit.casing([controls / 2, .16, (front - 1.13) / 2], [width + controls, .32, front + 1.23], frame, .07)
  kit.box([0, .33, -.02], [width - .11, .06, 1.69], deck)
  kit.rod([xAt(0) - .4, .42, -.48], [xAt(batteries.length - 1) + .4, .42, -.48], .055, copper)
  batteries.forEach(({ name, charge }, i) => {
    const x = xAt(i)
    const outside = range && (i < range[0] || i > range[1])
    const marked = state.marked?.includes(i)
    const fixed = i < (state.fixed ?? 0)
    const active = !outside || marked
    const height = charge === undefined ? .75 : .59 + Math.min(.72, Math.max(0, charge / maxCharge) * .72)
    const colour = charge === undefined ? '#54646b' : outside && !marked ? '#596b6d'
      : paint[Array.from(name ?? String(charge)).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % paint.length]
    kit.casing([x, .41, .02], [1.03, .11, 1.0], fixed ? '#68a889' : frame, .05)
    kit.cylinder([x, .51, 0], .42, .44, .14, '#48626a')
    kit.cylinder([x, .56 + height / 2, 0], .32, .33, height, colour)
    kit.cylinder([x, .58 + height, 0], .325, .325, .065, active ? '#bfd1c2' : '#80928e')
    kit.cylinder([x, .65 + height, 0], .12, .14, .085, copper)
    if (marked || fixed) kit.ring([x, .59, 0], .38, .041, marked ? gold : mint, 'glow')
    const value = charge === undefined ? '?' : String(charge)
    tools.label(name ? name + (batteries.length > 6 ? '\n· ' : ' · ') + value : value, [x, .66 + height / 2, .36], .25)
    tools.label('[' + i + ']', [x, .405, .75], .18)
    const badge = state.badges?.[i]
    if (badge) tools.label(badge, [x, .96 + height, -.02], .21)
    tools.pick('cell-' + i, [x, .66 + height / 2, .1], [1.01, Math.max(1.12, height + .42), 1.0])
  })
  if (range && range[0] <= range[1] && range[0] >= 0 && range[1] < batteries.length) {
    const left = xAt(range[0]) - .43, right = xAt(range[1]) + .43
    kit.rod([left, .46, .53], [right, .46, .53], .045, mint, 'glow')
    for (const x of [left, right]) kit.rod([x, .46, .53], [x, .67, .53], .052, mint)
  }
  if (swap && swap[0] !== swap[1]) {
    for (const direction of [0, 1]) {
      const start = xAt(swap[direction]), end = xAt(swap[1 - direction])
      const z = direction === 0 ? -.72 : -.96
      const tint = direction === 0 ? gold : mint
      const high = 1.27 + direction * .30
      const tip: ModelPoint = [end, high, z]
      kit.rod([start, .57, z], [start, high, z], .043, tint)
      kit.rod([start, high, z], tip, .047, tint, 'glow')
      for (const dy of [-.13, .13]) kit.rod([end - Math.sign(end - start) * .21, high + dy, z], tip, .045, tint)
    }
  }
  if (state.held) {
    const z = -1.31
    kit.casing([0, .37, z], [1.32, .40, .69], copper, .06)
    kit.casing([0, .70, z], [1.09, .28, .54], '#809a98', .05)
    tools.label('held · ' + state.held.name + ' · ' + state.held.charge, [0, 1.06, z], .24)
  }
  if (prefix) {
    const step = width / (batteries.length + 1)
    prefix.forEach((value, i) => {
      const x = (i - batteries.length / 2) * step
      const tint = state.operands?.includes(i) ? gold : '#aecbb7'
      kit.casing([x, .39, 1.26], [step * .90, .15, .52], tint, .04)
      tools.label(String(value), [x, .54, 1.26], .24)
      tools.pick('prefix-' + i, [x, .48, 1.26], [step * .97, .32, .61])
    })
  }
  if (state.readout) tools.label(state.readout, [0, 2.32, -1.13], .25)
  if (state.advance) {
    const x = width / 2 + .44
    kit.casing([x, .43, .05], [.82, .26, .86], '#72958e', .06)
    kit.cylinder([x, .66, .05], .27, .29, .21, gold)
    tools.label('▶', [x, .84, .08], .25)
    tools.pick('advance', [x, .64, .05], [.86, .84, 1.14])
  }
}
